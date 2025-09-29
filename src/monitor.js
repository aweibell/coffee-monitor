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
            const roasteryConfig = this.config.getRoasteryConfig();
            
            // Initialize scraper
            await this.scraper.init();
            this.log('info', `Scraping products from ${roasteryConfig.shopUrl}`);
            
            // Scrape products
            const scrapedProducts = await this.scraper.scrapeProducts(roasteryConfig.shopUrl);
            this.log('info', `Found ${scrapedProducts.length} products`);

            if (scrapedProducts.length === 0) {
                this.log('warn', 'No products found - might be a scraping issue');
                return;
            }

            const results = {
                newProducts: [],
                availableFavorites: [],
                totalChecked: scrapedProducts.length
            };

            // Process each product
            for (const productData of scrapedProducts) {
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
                                // Check if we've already notified about this recently
                                const recentlyNotified = await this.database.wasNotificationSentRecently(
                                    productId, 'favorite_available', 24
                                );

                                if (!recentlyNotified) {
                                    results.availableFavorites.push({
                                        product: {
                                            ...productData,
                                            id: productId,
                                            current_price: productData.price
                                        },
                                        favoriteName: favorite.name,
                                        matchedTerms: favorite.terms.filter(term => 
                                            productData.name.toLowerCase().includes(term.toLowerCase())
                                        )
                                    });
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
            // Notify about available favorites
            for (const favoriteData of results.availableFavorites) {
                this.log('info', `Sending favorite notification for ${favoriteData.product.name}`);
                
                const notifications = await this.notifier.notify('favorite_available', favoriteData);
                
                // Record that we sent notifications
                await this.database.recordNotificationSent(favoriteData.product.id, 'favorite_available');
                
                this.log('info', 'Notifications sent', { notifications });
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