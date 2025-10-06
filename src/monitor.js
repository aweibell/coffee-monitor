const cron = require('node-cron');
const Database = require('./database/database');
const CoffeeScraper = require('./scrapers/scraper');
const Notifier = require('./notifications/notifier');
const Config = require('./utils/config');
const path = require('path');
const fs = require('fs');

class CoffeeMonitor {
    constructor(configPath = null) {
        this.config = new Config(configPath);
        this.database = new Database(path.resolve(this.config.getDatabaseConfig().path));
        this.scraper = new CoffeeScraper(this.config.getRoasteryConfig());
        this.notifier = new Notifier(this.config.getNotificationConfig());
        this.scheduledJob = null;
        this.isRunning = false;
        this.lastCheck = null;
        
        this.setupLogging();
    }

    setupLogging() {
        const loggingConfig = this.config.getLoggingConfig();
        const logDir = path.dirname(loggingConfig.file);
        
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        // Simple logging function
        this.log = (level, message, data = null) => {
            const timestamp = new Date().toISOString();
            const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`;
            
            console.log(logEntry.trim());
            
            // Also write to file
            fs.appendFileSync(path.resolve(loggingConfig.file), logEntry);
        };
    }

    async initialize() {
        try {
            this.log('info', 'Initializing Coffee Monitor...');
            await this.database.initialize();
            this.log('info', 'Database initialized');
            
            // Sync favorites from config to database
            await this.syncFavorites();
            
            this.log('info', 'Coffee Monitor initialized successfully');
        } catch (error) {
            this.log('error', 'Failed to initialize Coffee Monitor', { error: error.message });
            throw error;
        }
    }

    async syncFavorites() {
        // Check if this is the first run by checking if we have any favorites at all
        const allDbFavorites = await this.database.all('SELECT * FROM user_favorites');
        
        // Only sync from config on first run (when database is empty)
        if (allDbFavorites.length === 0) {
            const configFavorites = this.config.getFavorites();
            
            this.log('info', 'First run detected - syncing favorites from config');
            
            for (const favorite of configFavorites) {
                // For backwards compatibility, treat the pattern as both name and single term
                await this.database.addFavorite(favorite.pattern, favorite.description || '', [favorite.pattern]);
                this.log('info', `Added favorite from config: ${favorite.pattern}`);
            }
        } else {
            this.log('info', 'Database has existing favorites - skipping config sync');
        }
    }

    async checkProducts() {
        if (this.isRunning) {
            this.log('warn', 'Check already in progress, skipping...');
            return;
        }

        this.isRunning = true;
        const startTime = new Date();
        this.log('info', 'Starting product check...');

        try {
            const shopUrls = this.config.getShopUrls();
            
            // Initialize scraper
            await this.scraper.init();
            
            let allScrapedProducts = [];
            
            // Scrape each URL
            for (const urlConfig of shopUrls) {
                this.log('info', `Scraping products from ${urlConfig.url} (${urlConfig.metadata.description})`);
                
                const scrapedProducts = await this.scraper.scrapeProducts(urlConfig.url);
                
                // Add metadata to each product
                const productsWithMetadata = scrapedProducts.map(product => {
                    // Detect organic products based on name content, even if URL isn't marked as organic
                    const nameBasedOrganic = this.isOrganicByName(product.name);
                    
                    return {
                        ...product,
                        organic: urlConfig.metadata.organic || nameBasedOrganic,
                        size_category: urlConfig.metadata.category,
                        source_url: urlConfig.url,
                        source_description: urlConfig.metadata.description
                    };
                });
                
                allScrapedProducts = allScrapedProducts.concat(productsWithMetadata);
                this.log('info', `Found ${scrapedProducts.length} products from ${urlConfig.metadata.description}`);
            }
            
            this.log('info', `Found ${allScrapedProducts.length} total products from ${shopUrls.length} sources`);

            if (allScrapedProducts.length === 0) {
                this.log('warn', 'No products found - might be a scraping issue');
                return;
            }

            const results = {
            newProducts: [],
            availableFavorites: [],
            totalChecked: allScrapedProducts.length
            };

            // Process each product
            for (const productData of allScrapedProducts) {
                try {
                    // Save or update product
                    const productId = await this.database.saveProduct(productData);
                    
                    // Record availability
                    await this.database.recordAvailability(
                        productId, 
                        productData.available, 
                        productData.price
                    );

                    // Check if this is a new product (first time seen)
                    const history = await this.database.getProductHistory(productId, 1);
                    if (history.length === 1) {
                        results.newProducts.push({
                            ...productData,
                            id: productId
                        });
                    }

                    // Check if this matches any favorites and is available
                    if (productData.available) {
                        const favorites = await this.database.getFavorites();
                        for (const favorite of favorites) {
                            let matches = false;
                            
                            // Check if any of the favorite's terms match the product name
                            for (const term of favorite.terms) {
                                if (productData.name.toLowerCase().includes(term.toLowerCase())) {
                                    matches = true;
                                    break;
                                }
                            }
                            
                            if (matches) {
                                // Apply preferences filtering
                                let shouldNotify = true;
                                
                                // Check organic preference
                                if (favorite.organic_only && !productData.organic) {
                                    shouldNotify = false;
                                }
                                
                                // Check size preference
                                if (favorite.size_preference && favorite.size_preference !== 'both') {
                                    const productSize = this.extractSizeFromName(productData.name);
                                    if (productSize && productSize !== favorite.size_preference) {
                                        shouldNotify = false;
                                    }
                                }
                                
                                if (shouldNotify) {
                                    // Check if we've already notified about this recently
                                    const recentlyNotified = await this.database.wasNotificationSentRecently(
                                        productId, 'favorite_available', 24
                                    );

                                    if (!recentlyNotified) {
                                        // Check for duplicates in the same check based on base product name
                                        const baseName = this.getBaseProductName(productData.name);
                                        const existingMatch = results.availableFavorites.find(item => 
                                            this.getBaseProductName(item.product.name) === baseName &&
                                            item.favoriteName === favorite.name
                                        );
                                        
                                        if (!existingMatch) {
                                            const currentSize = this.extractSizeFromName(productData.name);
                                            results.availableFavorites.push({
                                                product: {
                                                    ...productData,
                                                    id: productId,
                                                    current_price: productData.price
                                                },
                                                favoriteName: favorite.name,
                                                matchedTerms: favorite.terms.filter(term => 
                                                    productData.name.toLowerCase().includes(term.toLowerCase())
                                                ),
                                                baseName: baseName,
                                                availableSizes: [currentSize].filter(Boolean), // Only add if size is detected
                                                sizeData: currentSize ? { [currentSize]: { price: productData.price, product: productData } } : {}
                                            });
                                        } else {
                                            // Add the new size to the existing match
                                            const currentSize = this.extractSizeFromName(productData.name);
                                            const existingSize = this.extractSizeFromName(existingMatch.product.name);
                                            
                                            // Add current size to available sizes if not already there
                                            if (currentSize && !existingMatch.availableSizes.includes(currentSize)) {
                                                existingMatch.availableSizes.push(currentSize);
                                                existingMatch.availableSizes.sort((a, b) => {
                                                    // Sort 250g first, then 1kg
                                                    if (a === '250g' && b === '1kg') return -1;
                                                    if (a === '1kg' && b === '250g') return 1;
                                                    return 0;
                                                });
                                            }
                                            
                                            // Store price data for this size
                                            if (currentSize) {
                                                if (!existingMatch.sizeData) {
                                                    existingMatch.sizeData = {};
                                                }
                                                existingMatch.sizeData[currentSize] = {
                                                    price: productData.price,
                                                    product: productData
                                                };
                                            }
                                            
                                            // Update to better product version if applicable (for the main display product)
                                            if (this.shouldReplaceProduct(existingMatch.product, productData, existingSize, currentSize)) {
                                                existingMatch.product = {
                                                    ...productData,
                                                    id: productId,
                                                    current_price: productData.price
                                                };
                                                existingMatch.matchedTerms = favorite.terms.filter(term => 
                                                    productData.name.toLowerCase().includes(term.toLowerCase())
                                                );
                                            }
                                            
                                            this.log('debug', `Added size ${currentSize} to existing coffee ${baseName}`);
                                        }
                                    } else {
                                        this.log('debug', `Skipping notification for ${productData.name} - already notified recently`);
                                    }
                                } else {
                                    this.log('debug', `Product ${productData.name} matches favorite ${favorite.name} but doesn't meet preferences`);
                                }
                                break; // Don't match the same product multiple times
                            }
                        }
                    }
                } catch (error) {
                    this.log('error', `Error processing product ${productData.name}`, { error: error.message });
                }
            }

            // Send notifications
            await this.sendNotifications(results);

            const endTime = new Date();
            const duration = endTime - startTime;
            this.lastCheck = endTime;

            this.log('info', `Product check completed`, {
                duration: `${duration}ms`,
                totalProducts: results.totalChecked,
                newProducts: results.newProducts.length,
                availableFavorites: results.availableFavorites.length
            });

        } catch (error) {
            this.log('error', 'Product check failed', { error: error.message });
            
            // Send error notification
            try {
                await this.notifier.notify('error', {
                    error: error,
                    context: 'Product check failed'
                });
            } catch (notifError) {
                this.log('error', 'Failed to send error notification', { error: notifError.message });
            }
        } finally {
            if (this.scraper) {
                await this.scraper.close();
            }
            this.isRunning = false;
        }
    }

    async sendNotifications(results) {
        try {
            // Group all available favorites into a single notification
            if (results.availableFavorites.length > 0) {
                this.log('info', `Sending grouped favorites notification for ${results.availableFavorites.length} products`);
                
                const notifications = await this.notifier.notify('favorites_available_grouped', {
                    favorites: results.availableFavorites
                });
                
                // Record that we sent notifications for each product
                for (const favoriteData of results.availableFavorites) {
                    await this.database.recordNotificationSent(favoriteData.product.id, 'favorite_available');
                }
                
                this.log('info', 'Grouped favorites notification sent', { notifications });
            }

            // Optionally notify about new products (if there are many, might want to batch)
            if (results.newProducts.length > 0 && results.newProducts.length <= 5) {
                this.log('info', `Sending new products notification for ${results.newProducts.length} products`);
                
                const notifications = await this.notifier.notify('new_products', {
                    products: results.newProducts
                });
                
                this.log('info', 'New products notifications sent', { notifications });
            }

        } catch (error) {
            this.log('error', 'Failed to send notifications', { error: error.message });
        }
    }

    startScheduled() {
        const monitoringConfig = this.config.getMonitoringConfig();
        
        if (this.scheduledJob) {
            this.scheduledJob.stop();
        }

        this.log('info', `Setting up scheduled checks with pattern: ${monitoringConfig.checkInterval}`);
        
        this.scheduledJob = cron.schedule(monitoringConfig.checkInterval, () => {
            this.log('info', 'Scheduled check triggered');
            this.checkProducts().catch(error => {
                this.log('error', 'Scheduled check failed', { error: error.message });
            });
        }, {
            scheduled: false,
            timezone: 'Europe/Oslo'
        });

        this.scheduledJob.start();
        this.log('info', 'Scheduled monitoring started');
    }

    stopScheduled() {
        if (this.scheduledJob) {
            this.scheduledJob.stop();
            this.scheduledJob = null;
            this.log('info', 'Scheduled monitoring stopped');
        }
    }

    async getStatus() {
        const availableProducts = await this.database.getAvailableProducts();
        const favorites = await this.database.getFavorites();
        
        return {
            isRunning: this.isRunning,
            isScheduled: this.scheduledJob ? true : false,
            lastCheck: this.lastCheck,
            availableProducts: availableProducts.length,
            totalFavorites: favorites.length,
            scheduledPattern: this.config.getMonitoringConfig().checkInterval
        };
    }

    async getReport() {
        try {
            const availableProducts = await this.database.getAvailableProducts();
            const favorites = await this.database.getFavorites();
            
            // Get matching favorites that are currently available
            const availableFavorites = [];
            for (const product of availableProducts) {
                for (const favorite of favorites) {
                    let matches = false;
                    let matchedTerms = [];
                    
                    // Check if any of the favorite's terms match the product name
                    for (const term of favorite.terms) {
                        if (product.name.toLowerCase().includes(term.toLowerCase())) {
                            matches = true;
                            matchedTerms.push(term);
                        }
                    }
                    
                    if (matches) {
                        availableFavorites.push({
                            ...product,
                            favoritePattern: matchedTerms.join(', '),
                            favoriteName: favorite.name
                        });
                        break;
                    }
                }
            }

            return {
                totalAvailableProducts: availableProducts.length,
                totalFavorites: favorites.length,
                availableFavorites: availableFavorites.length,
                lastCheck: this.lastCheck,
                products: availableProducts.slice(0, 20), // Limit to first 20
                favorites: availableFavorites
            };
            
        } catch (error) {
            this.log('error', 'Failed to generate report', { error: error.message });
            throw error;
        }
    }

    extractSizeFromName(productName) {
        const name = productName.toLowerCase();
        if (name.includes('250g') || name.includes('250 g')) {
            return '250g';
        }
        if (name.includes('1kg') || name.includes('1 kg') || name.includes('1000g')) {
            return '1kg';
        }
        return null; // Unknown size
    }

    isOrganicByName(productName) {
        const name = productName.toLowerCase();
        const organicKeywords = [
            'økologisk',
            'organic', 
            'eco',
            'biologisk',
            'bio '
        ];
        
        return organicKeywords.some(keyword => name.includes(keyword));
    }

    getBaseProductName(productName) {
        // Remove size indicators and common suffixes to get the base product name
        let baseName = productName
            .replace(/\s*,\s*\d+kg.*$/i, '')  // Remove ", 1kg ..." and everything after
            .replace(/\s*,\s*\d+g.*$/i, '')   // Remove ", 250g ..." and everything after
            .replace(/\s+\d+kg\s+.*$/i, '')   // Remove " 1kg ..." and everything after
            .replace(/\s+\d+g\s+.*$/i, '')    // Remove " 250g ..." and everything after
            .replace(/\s*\d+kg$/i, '')        // Remove " 1kg" at end
            .replace(/\s*\d+g$/i, '')         // Remove " 250g" at end
            .trim();
        
        return baseName;
    }

    shouldReplaceProduct(existingProduct, newProduct, existingSize, newSize) {
        // Prefer organic products
        if (newProduct.organic && !existingProduct.organic) {
            return true;
        }
        if (!newProduct.organic && existingProduct.organic) {
            return false;
        }
        
        // Prefer larger sizes if both are equally organic
        if (newSize === '1kg' && existingSize === '250g') {
            return true;
        }
        
        return false;
    }

    async close() {
        this.log('info', 'Shutting down Coffee Monitor...');
        
        this.stopScheduled();
        
        if (this.scraper) {
            await this.scraper.close();
        }
        
        if (this.notifier) {
            await this.notifier.close();
        }
        
        if (this.database) {
            await this.database.close();
        }
        
        this.log('info', 'Coffee Monitor shut down complete');
    }
}

module.exports = CoffeeMonitor;