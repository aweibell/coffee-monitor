class Analytics {
    constructor(database) {
        this.database = database;
    }

    async getProductAvailabilityTrends(productId, days = 30) {
        const history = await this.database.getProductHistory(productId, days);
        
        if (history.length === 0) {
            return {
                totalChecks: 0,
                availableChecks: 0,
                availabilityRate: 0,
                averageTimeInStock: 0,
                averageTimeOutOfStock: 0
            };
        }

        const totalChecks = history.length;
        const availableChecks = history.filter(h => h.available).length;
        const availabilityRate = (availableChecks / totalChecks) * 100;

        // Calculate streaks
        const streaks = this.calculateStreaks(history);
        
        return {
            productId,
            totalChecks,
            availableChecks,
            availabilityRate,
            streaks,
            averageTimeInStock: this.calculateAverageStreak(streaks.availableStreaks),
            averageTimeOutOfStock: this.calculateAverageStreak(streaks.unavailableStreaks),
            longestAvailableStreak: Math.max(...streaks.availableStreaks, 0),
            longestUnavailableStreak: Math.max(...streaks.unavailableStreaks, 0)
        };
    }

    calculateStreaks(history) {
        // Sort by checked_at ascending
        const sortedHistory = history.sort((a, b) => new Date(a.checked_at) - new Date(b.checked_at));
        
        const availableStreaks = [];
        const unavailableStreaks = [];
        
        let currentStreak = 1;
        let currentState = sortedHistory[0].available;
        
        for (let i = 1; i < sortedHistory.length; i++) {
            if (sortedHistory[i].available === currentState) {
                currentStreak++;
            } else {
                // Streak ended, record it
                if (currentState) {
                    availableStreaks.push(currentStreak);
                } else {
                    unavailableStreaks.push(currentStreak);
                }
                
                // Start new streak
                currentState = sortedHistory[i].available;
                currentStreak = 1;
            }
        }
        
        // Don't forget the last streak
        if (currentState) {
            availableStreaks.push(currentStreak);
        } else {
            unavailableStreaks.push(currentStreak);
        }
        
        return { availableStreaks, unavailableStreaks };
    }

    calculateAverageStreak(streaks) {
        if (streaks.length === 0) return 0;
        return streaks.reduce((sum, streak) => sum + streak, 0) / streaks.length;
    }

    async getOverallStats(days = 30) {
        const query = `
            SELECT 
                COUNT(DISTINCT p.id) as total_products,
                COUNT(DISTINCT CASE WHEN ah.available = 1 THEN p.id END) as available_products,
                COUNT(ah.id) as total_checks,
                COUNT(CASE WHEN ah.available = 1 THEN 1 END) as available_checks
            FROM products p
            LEFT JOIN availability_history ah ON p.id = ah.product_id
            WHERE ah.checked_at >= datetime('now', '-' || ? || ' days')
        `;
        
        const result = await this.database.get(query, [days]);
        
        return {
            totalProducts: result.total_products || 0,
            availableProducts: result.available_products || 0,
            totalChecks: result.total_checks || 0,
            availableChecks: result.available_checks || 0,
            overallAvailabilityRate: result.total_checks > 0 ? 
                (result.available_checks / result.total_checks) * 100 : 0
        };
    }

    async getMostPopularProducts(days = 30, limit = 10) {
        const query = `
            SELECT 
                p.name,
                p.id,
                COUNT(ah.id) as check_count,
                COUNT(CASE WHEN ah.available = 1 THEN 1 END) as available_count,
                ROUND(
                    (COUNT(CASE WHEN ah.available = 1 THEN 1 END) * 100.0) / COUNT(ah.id), 
                    2
                ) as availability_rate,
                MAX(ah.price) as max_price,
                MIN(ah.price) as min_price,
                AVG(ah.price) as avg_price
            FROM products p
            JOIN availability_history ah ON p.id = ah.product_id
            WHERE ah.checked_at >= datetime('now', '-' || ? || ' days')
            GROUP BY p.id, p.name
            ORDER BY check_count DESC, availability_rate DESC
            LIMIT ?
        `;
        
        return await this.database.all(query, [days, limit]);
    }

    async getFavoriteMatchesStats(days = 30) {
        const favorites = await this.database.getFavorites();
        const stats = [];
        
        for (const favorite of favorites) {
            let allMatchingProducts = [];
            
            // Search for products matching any of the favorite's terms
            for (const term of favorite.terms) {
                const products = await this.database.getProductsByNamePattern(term);
                
                // Add products that aren't already in our list
                for (const product of products) {
                    if (!allMatchingProducts.some(p => p.id === product.id)) {
                        allMatchingProducts.push(product);
                    }
                }
            }
            
            const totalMatches = allMatchingProducts.length;
            const currentlyAvailable = allMatchingProducts.filter(p => p.available).length;
            
            stats.push({
                name: favorite.name,
                terms: favorite.terms,
                totalMatches,
                currentlyAvailable,
                products: allMatchingProducts.slice(0, 5) // Limit to 5 examples
            });
        }
        
        return stats;
    }

    async getPriceAnalysis(productId, days = 30) {
        const query = `
            SELECT 
                price,
                checked_at,
                available
            FROM availability_history
            WHERE product_id = ? AND price IS NOT NULL
            AND checked_at >= datetime('now', '-' || ? || ' days')
            ORDER BY checked_at DESC
        `;
        
        const history = await this.database.all(query, [productId, days]);
        
        if (history.length === 0) {
            return null;
        }
        
        const prices = history.map(h => h.price).filter(p => p != null);
        
        return {
            productId,
            currentPrice: history[0].price,
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            avgPrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
            priceHistory: history.slice(0, 20) // Last 20 price points
        };
    }

    async generateInsights(days = 30) {
        const insights = [];
        
        // Overall stats
        const overallStats = await this.getOverallStats(days);
        
        if (overallStats.overallAvailabilityRate < 50) {
            insights.push({
                type: 'warning',
                message: `Overall product availability is low (${overallStats.overallAvailabilityRate.toFixed(1)}%) over the last ${days} days.`
            });
        }
        
        // Favorite matches
        const favoriteStats = await this.getFavoriteMatchesStats(days);
        const availableFavorites = favoriteStats.filter(f => f.currentlyAvailable > 0);
        
        if (availableFavorites.length > 0) {
            insights.push({
                type: 'success',
                message: `${availableFavorites.length} of your favorite patterns have products available right now!`
            });
        }
        
        // Popular products
        const popularProducts = await this.getMostPopularProducts(days, 5);
        const highlyAvailable = popularProducts.filter(p => p.availability_rate > 80);
        
        if (highlyAvailable.length > 0) {
            insights.push({
                type: 'info',
                message: `${highlyAvailable.length} products have been consistently available (>80% uptime) recently.`
            });
        }
        
        return insights;
    }

    formatDuration(checks) {
        // Assuming daily checks, convert to days
        if (checks < 1) return 'Less than 1 day';
        if (checks === 1) return '1 day';
        if (checks < 7) return `${checks} days`;
        if (checks < 30) return `${Math.round(checks / 7)} weeks`;
        return `${Math.round(checks / 30)} months`;
    }
}

module.exports = Analytics;