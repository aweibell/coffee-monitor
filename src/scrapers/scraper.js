const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

class CoffeeScraper {
    constructor(config) {
        this.config = config;
        this.browser = null;
        this.page = null;
    }

    async init() {
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
        
        // Set user agent to avoid being blocked
        await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Set viewport
        await this.page.setViewport({ width: 1280, height: 800 });
    }

    async scrapeProducts(url) {
        if (!this.page) {
            throw new Error('Scraper not initialized. Call init() first.');
        }

        try {
            console.log(`Navigating to ${url}...`);
            await this.page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Wait for products to load - this might need customization per site
            await new Promise(resolve => setTimeout(resolve, 2000));

            const content = await this.page.content();
            const $ = cheerio.load(content);

            const products = [];

            // Generic product parsing - this will need to be customized per roastery
            const productElements = this.getProductElements($);

            productElements.each((index, element) => {
                const product = this.parseProductElement($, element);
                if (product && product.name) {
                    products.push(product);
                }
            });

            console.log(`Found ${products.length} products`);
            return products;

        } catch (error) {
            console.error('Error scraping products:', error);
            throw error;
        }
    }

    getProductElements($) {
        // Default selectors - override in config or subclass
        const selectors = this.config.selectors || {
            productContainer: '.product-item, .product-card, .product, article[class*="product"]',
        };

        return $(selectors.productContainer);
    }

    parseProductElement($, element) {
        const $el = $(element);
        const selectors = this.config.selectors || {};

        try {
            // Extract product information using configurable selectors
            const name = this.extractText($, $el, [
                selectors.name,
                '.product-title, .product-name, h2, h3, .title',
                '[class*="title"], [class*="name"]'
            ].filter(Boolean));

            const price = this.extractPrice($, $el, [
                selectors.price,
                '.price, .product-price, .cost',
                '[class*="price"], [class*="cost"]'
            ].filter(Boolean));

            const description = this.extractText($, $el, [
                selectors.description,
                '.description, .product-description, .excerpt',
                '[class*="description"], [class*="excerpt"]'
            ].filter(Boolean));

            const url = this.extractUrl($, $el, [
                selectors.link,
                'a',
                '[href]'
            ].filter(Boolean));

            const available = this.extractAvailability($, $el, selectors.availability);

            if (!name) {
                return null;
            }

            return {
                name: name.trim(),
                url: url,
                price: price,
                description: description ? description.trim() : null,
                available: available,
                scrapedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error parsing product element:', error);
            return null;
        }
    }

    extractText($, $el, selectors) {
        for (const selector of selectors) {
            const element = $el.find(selector).first();
            if (element.length > 0) {
                return element.text().trim();
            }
        }
        return null;
    }

    extractPrice($, $el, selectors) {
        for (const selector of selectors) {
            const element = $el.find(selector).first();
            if (element.length > 0) {
                const text = element.text().trim();
                // Extract numeric price from text
                const priceMatch = text.match(/[\d,]+\.?\d*/);
                if (priceMatch) {
                    return parseFloat(priceMatch[0].replace(',', ''));
                }
            }
        }
        return null;
    }

    extractUrl($, $el, selectors) {
        for (const selector of selectors) {
            const element = $el.find(selector).first();
            if (element.length > 0) {
                const href = element.attr('href');
                if (href) {
                    // Convert relative URLs to absolute
                    if (href.startsWith('/')) {
                        const baseUrl = new URL(this.config.baseUrl || this.page.url());
                        return new URL(href, baseUrl).href;
                    }
                    return href;
                }
            }
        }
        return null;
    }

    extractAvailability($, $el, availabilitySelector) {
        if (!availabilitySelector) {
            // Default availability detection
            const text = $el.text().toLowerCase();
            const unavailableKeywords = ['out of stock', 'sold out', 'unavailable', 'not available'];
            return !unavailableKeywords.some(keyword => text.includes(keyword));
        }

        const element = $el.find(availabilitySelector).first();
        if (element.length > 0) {
            const text = element.text().toLowerCase();
            const availableKeywords = ['in stock', 'available', 'add to cart'];
            const unavailableKeywords = ['out of stock', 'sold out', 'unavailable'];
            
            if (availableKeywords.some(keyword => text.includes(keyword))) {
                return true;
            }
            if (unavailableKeywords.some(keyword => text.includes(keyword))) {
                return false;
            }
        }

        // Default to available if we can't determine
        return true;
    }

    async takeScreenshot(filename) {
        if (this.page) {
            await this.page.screenshot({ 
                path: filename,
                fullPage: true 
            });
            console.log(`Screenshot saved: ${filename}`);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

module.exports = CoffeeScraper;