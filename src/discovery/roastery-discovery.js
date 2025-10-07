const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { URL } = require('url');

class RoasteryDiscovery {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init() {
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await this.page.setViewport({ width: 1280, height: 800 });
    }

    async discoverRoastery(baseUrl) {
        if (!this.page) {
            await this.init();
        }

        const results = {
            name: '',
            baseUrl: baseUrl,
            shopUrls: [],
            selectors: {},
            platforms: [],
            confidence: 'low'
        };

        try {
            console.log(`🔍 Analyzing ${baseUrl}...`);
            await this.page.goto(baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            await new Promise(resolve => setTimeout(resolve, 2000));
            const content = await this.page.content();
            const $ = cheerio.load(content);

            // 1. Extract site name
            results.name = this.extractSiteName($);

            // 2. Detect platform
            results.platforms = this.detectPlatforms($, content);

            // 3. Find potential shop URLs
            results.shopUrls = await this.findShopUrls($, baseUrl);

            // 4. Generate selectors based on detected platform
            results.selectors = this.generateSelectors(results.platforms);

            // 5. Test selectors on shop pages
            if (results.shopUrls.length > 0) {
                const testResults = await this.testSelectors(results.shopUrls[0].url, results.selectors);
                results.confidence = testResults.confidence;
                results.selectors = testResults.selectors;
                results.testResults = testResults.products;
            }

            return results;

        } catch (error) {
            console.error('❌ Discovery failed:', error.message);
            throw error;
        }
    }

    extractSiteName($) {
        // Try multiple strategies to get site name
        const strategies = [
            () => $('title').text().split('|')[0].split('-')[0].trim(),
            () => $('.site-title, .logo').text().trim(),
            () => $('h1').first().text().trim(),
            () => $('.header .brand, .navbar-brand').text().trim(),
            () => $('[class*="logo"] img').attr('alt')
        ];

        for (const strategy of strategies) {
            try {
                const name = strategy();
                if (name && name.length > 2 && name.length < 50) {
                    return name;
                }
            } catch (e) {
                // Continue to next strategy
            }
        }

        return 'Unknown Roastery';
    }

    detectPlatforms($, content) {
        const platforms = [];
        const bodyClass = $('body').attr('class') || '';
        
        // WooCommerce detection
        if (bodyClass.includes('woocommerce') || 
            content.includes('woocommerce') ||
            $('.woocommerce').length > 0) {
            platforms.push('woocommerce');
        }

        // Shopify detection
        if (bodyClass.includes('shopify') || 
            content.includes('Shopify') ||
            content.includes('/cdn/shop/') ||
            $('[href*="myshopify.com"]').length > 0) {
            platforms.push('shopify');
        }

        // WordPress detection
        if (content.includes('wp-content') || 
            content.includes('wordpress') ||
            $('link[href*="wp-content"]').length > 0) {
            platforms.push('wordpress');
        }

        // Custom/Other
        if (platforms.length === 0) {
            platforms.push('custom');
        }

        return platforms;
    }

    async findShopUrls($, baseUrl) {
        const potentialUrls = new Set();
        const baseUrlObj = new URL(baseUrl);
        
        // Norwegian and English shop/product page patterns
        const shopPatterns = [
            // Norwegian terms
            /kaffe/i,
            /sortiment/i,
            /utvalg/i,
            /produkter/i,
            /butikk/i,
            /nettbutikk/i,
            /handel/i,
            /bestill/i,
            /kjøp/i,
            // English terms
            /shop/i,
            /products/i,
            /coffee/i,
            /store/i,
            /catalog/i,
            /buy/i,
            /order/i
        ];
        
        // URLs to avoid (social media, external services, non-shop pages, equipment, single products)
        const excludePatterns = [
            /instagram/i,
            /facebook/i,
            /twitter/i,
            /linkedin/i,
            /youtube/i,
            /tiktok/i,
            /pinterest/i,
            /mailto:/i,
            /tel:/i,
            /javascript:/i,
            /#/,  // Fragment links
            /\?.*=/,  // Links with query parameters (often filters/searches)
            /vilkar/i,         // Terms & conditions
            /betingelser/i,    // Conditions
            /terms/i,
            /conditions/i,
            /privacy/i,
            /personvern/i,
            /about/i,
            /om-oss/i,
            /kontakt/i,
            /contact/i,
            /login/i,
            /logg-inn/i,
            /account/i,
            /konto/i,
            /search/i,
            /søk/i,
            /abonnement.*betingelser/i,  // Subscription terms specifically
            // Equipment/accessories (Norwegian terms)
            /kaffeutstyr/i,    // Coffee equipment
            /utstyr/i,         // Equipment 
            /tilbehør/i,       // Accessories
            /equipment/i,      // Equipment (English)
            /accessories/i,    // Accessories (English)
            /bryggeutstyr/i,   // Brewing equipment
            /maskin/i,         // Machines
            /kvern/i,          // Grinders
            // Single product pages (we want collections/categories, not individual products)
            /\/products\/[^/]+$/i,  // /products/product-name (single product)
            /\/product\/[^/]+$/i,   // /product/product-name (single product)
            /\/produkt\/[^/]+$/i,   // /produkt/product-name (single product, Norwegian)
            // Blog and content pages
            /\/blog/i,             // Blog pages
            /\/blogs/i,            // Blogs
            /\/news/i,             // News
            /\/nyheter/i           // News (Norwegian)
        ];

        // Find links that might be shop pages
        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            
            if (!href) return;

            let fullUrl;
            try {
                if (href.startsWith('/')) {
                    fullUrl = new URL(href, baseUrl).href;
                } else if (href.startsWith('http')) {
                    const linkUrl = new URL(href);
                    if (linkUrl.hostname !== baseUrlObj.hostname) return;
                    fullUrl = href;
                } else {
                    fullUrl = new URL(href, baseUrl).href;
                }
            } catch (e) {
                return;
            }

            // First check if URL should be excluded
            const urlToCheck = fullUrl.toLowerCase();
            const isExcluded = excludePatterns.some(pattern => pattern.test(fullUrl));
            
            if (isExcluded) {
                return; // Skip this URL
            }
            
            // Check if URL or link text matches shop patterns
            const isShopUrl = shopPatterns.some(pattern => 
                pattern.test(urlToCheck) || pattern.test(text)
            );

            if (isShopUrl) {
                potentialUrls.add(fullUrl);
            }
        });

        // Convert to format expected by the app
        return Array.from(potentialUrls).slice(0, 3).map(url => ({
            url: url,
            metadata: {
                category: 'all_sizes',
                description: 'Auto-discovered shop URL'
            }
        }));
    }

    generateSelectors(platforms) {
        const selectors = {
            productContainer: [],
            name: [],
            price: [],
            link: ['a'],
            availability: []
        };

        if (platforms.includes('woocommerce')) {
            selectors.productContainer.push('.product', '.woocommerce-product', '.wc-product');
            selectors.name.push('.woocommerce-loop-product__title', '.product-title', 'h2.woocommerce-loop-product__title');
            selectors.price.push('.price', '.woocommerce-Price-amount', '.amount');
            selectors.availability.push('.stock', '.in-stock', '.out-of-stock');
        }

        if (platforms.includes('shopify')) {
            selectors.productContainer.push('.product-item', '.product-card', '.grid__item', '.product');
            selectors.name.push('.product-item__title', '.product-card__title', '.product__title', 'h3');
            selectors.price.push('.price', '.product-item__price', '.money', '.product__price');
            selectors.availability.push('.product-form__buttons', '.product__availability');
        }

        // Generic fallbacks
        selectors.productContainer.push('.product', '.item', '[class*="product"]');
        selectors.name.push('h2', 'h3', '.title', '[class*="title"]', '[class*="name"]');
        selectors.price.push('[class*="price"]', '[class*="cost"]');
        selectors.availability.push('[class*="stock"]', '[class*="availability"]');

        // Convert arrays to comma-separated strings
        return {
            productContainer: selectors.productContainer.join(', '),
            name: selectors.name.join(', '),
            price: selectors.price.join(', '),
            link: selectors.link.join(', '),
            availability: selectors.availability.join(', ')
        };
    }

    async testSelectors(shopUrl, selectors) {
        try {
            console.log(`🧪 Testing selectors on ${shopUrl}...`);
            await this.page.goto(shopUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            await new Promise(resolve => setTimeout(resolve, 2000));
            const content = await this.page.content();
            const $ = cheerio.load(content);

            const products = [];
            const $products = $(selectors.productContainer);

            console.log(`   Found ${$products.length} potential product elements`);

            let successCount = 0;
            $products.slice(0, 5).each((i, el) => {
                const $el = $(el);
                
                const name = this.extractText($, $el, selectors.name.split(', '));
                const price = this.extractPrice($, $el, selectors.price.split(', '));
                const url = this.extractUrl($, $el, selectors.link.split(', '), shopUrl);

                if (name) {
                    products.push({ name, price, url });
                    successCount++;
                }
            });

            const confidence = successCount >= 3 ? 'high' : 
                            successCount >= 1 ? 'medium' : 'low';

            console.log(`   ✅ Successfully parsed ${successCount} products (confidence: ${confidence})`);

            return {
                confidence,
                selectors,
                products: products.slice(0, 3) // Return sample products
            };

        } catch (error) {
            console.log(`   ❌ Testing failed: ${error.message}`);
            return {
                confidence: 'low',
                selectors,
                products: []
            };
        }
    }

    extractText($, $el, selectors) {
        for (const selector of selectors) {
            if (!selector) continue;
            const element = $el.find(selector.trim()).first();
            if (element.length > 0) {
                const text = element.text().trim();
                if (text.length > 0) return text;
            }
        }
        return null;
    }

    extractPrice($, $el, selectors) {
        for (const selector of selectors) {
            if (!selector) continue;
            const element = $el.find(selector.trim()).first();
            if (element.length > 0) {
                const text = element.text().trim();
                const priceMatch = text.match(/[\d,]+\.?\d*/);
                if (priceMatch) {
                    return parseFloat(priceMatch[0].replace(',', ''));
                }
            }
        }
        return null;
    }

    extractUrl($, $el, selectors, baseUrl) {
        for (const selector of selectors) {
            if (!selector) continue;
            const element = $el.find(selector.trim()).first();
            if (element.length > 0) {
                const href = element.attr('href');
                if (href) {
                    try {
                        if (href.startsWith('/')) {
                            return new URL(href, baseUrl).href;
                        }
                        return href;
                    } catch (e) {
                        // Invalid URL
                    }
                }
            }
        }
        return null;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

module.exports = RoasteryDiscovery;