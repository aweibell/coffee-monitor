class ProductProcessor {
    constructor(database, logger) {
        this.database = database;
        this.log = logger;
    }

    async processProducts(products) {
        const results = {
            newProducts: [],
            availableFavorites: [],
            totalChecked: products.length
        };

        // Process each product
        for (const productData of products) {
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
                    await this.processFavoriteMatches(productData, productId, results);
                }
            } catch (error) {
                this.log('error', `Error processing product ${productData.name}`, { error: error.message });
            }
        }

        return results;
    }

    async processFavoriteMatches(productData, productId, results) {
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
                        await this.addToFavoriteResults(productData, productId, favorite, results);
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

    async addToFavoriteResults(productData, productId, favorite, results) {
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
}

module.exports = ProductProcessor;