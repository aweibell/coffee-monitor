const cheerio = require('cheerio');

class DeepScanner {
    constructor(scraper, database, logger) {
        this.scraper = scraper;
        this.database = database;
        this.log = logger;
    }

    async performDeepScan(products, forceAll = false) {
        this.log('info', `Starting deep scan of ${products.length} products${forceAll ? ' (forcing all)' : ' (new only)'}...`);
        
        let scannedCount = 0;
        let skippedCount = 0;
        
        for (const product of products) {
            if (!product.url) {
                skippedCount++;
                continue; // No product URL to scan
            }
            
            // Check if already deep scanned (unless forcing all)
            if (!forceAll) {
                const existingProduct = await this.database.get(
                    'SELECT deep_scanned FROM products WHERE name = ? AND roastery_name = ?',
                    [product.name, product.roastery_name]
                );
                
                if (existingProduct?.deep_scanned) {
                    skippedCount++;
                    continue; // Already scanned
                }
            }
            
            try {
                this.log('info', `Deep scanning: ${product.name}`);
                
                // Navigate to product page and extract details
                await this.scraper.page.goto(product.url, { 
                    waitUntil: 'networkidle2',
                    timeout: 30000 
                });
                
                await new Promise(resolve => setTimeout(resolve, 1000)); // Be respectful
                
                const content = await this.scraper.page.content();
                const $ = cheerio.load(content);
                
                // Extract detailed information
                const fullDescription = this.extractFullDescription($);
                const processingMethod = this.extractProcessingMethod($, fullDescription);
                const sustainabilityInfo = this.extractSustainabilityInfo($, fullDescription);
                
                // Update database with deep scan results
                await this.database.run(
                    'UPDATE products SET deep_scanned = 1, full_description = ?, processing_method = ?, sustainability_info = ? WHERE name = ? AND roastery_name = ?',
                    [fullDescription, processingMethod, sustainabilityInfo, product.name, product.roastery_name]
                );
                
                scannedCount++;
                
                // Rate limiting - be respectful to the websites
                if (scannedCount % 5 === 0) {
                    this.log('info', `Deep scanned ${scannedCount} products, pausing briefly...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                this.log('error', `Failed to deep scan ${product.name}`, { error: error.message });
            }
        }
        
        this.log('info', `Deep scan completed: ${scannedCount} scanned, ${skippedCount} skipped`);
    }
    
    extractFullDescription($) {
        // Try multiple selectors for full product description
        const selectors = [
            '.product-description',
            '.product-content', 
            '.product-details',
            '.entry-content',
            '.woocommerce-tabs',
            '.product-info',
            '[class*="description"]',
            '[class*="content"]'
        ];
        
        for (const selector of selectors) {
            const element = $(selector);
            if (element.length > 0) {
                return element.text().trim();
            }
        }
        
        // Fallback to body text if specific selectors not found
        return $('body').text().trim().substring(0, 2000); // Limit to reasonable length
    }
    
    extractProcessingMethod($, fullText) {
        const text = (fullText || '').toLowerCase();
        
        const processingMethods = [
            'bærtørket', 'natural', 'naturell',
            'vasket', 'washed', 'våtbehandlet',
            'tørrbehandlet', 'dry process',
            'honey', 'honning', 'honey process',
            'anaerob', 'anaerobic',
            'fermentert', 'fermented',
            'carbonic maceration'
        ];
        
        for (const method of processingMethods) {
            if (text.includes(method)) {
                return method;
            }
        }
        
        return null;
    }
    
    extractSustainabilityInfo($, fullText) {
        const text = (fullText || '').toLowerCase();
        const sustainabilityKeywords = [
            'bærekraft', 'sustainability', 'sustainable',
            'fairtrade', 'fair trade', 'rettferdig handel',
            'økologisk', 'organic', 'biologisk',
            'rainforest alliance', 'bird friendly',
            'direct trade', 'direkte handel',
            'småbonde', 'smallholder'
        ];
        
        const foundKeywords = sustainabilityKeywords.filter(keyword => text.includes(keyword));
        
        return foundKeywords.length > 0 ? foundKeywords.join(', ') : null;
    }
}

module.exports = DeepScanner;