const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor(dbPath = path.join(__dirname, '../../data/coffee.db')) {
        // Ensure data directory exists
        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        this.dbPath = dbPath;
        this.db = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async initialize() {
        await this.connect();
        await this.createTables();
        await this.runMigrations();
    }

    async createTables() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT,
                price REAL,
                description TEXT,
                organic BOOLEAN,
                size_category TEXT,
                source_url TEXT,
                source_description TEXT,
                roastery_name TEXT,
                deep_scanned BOOLEAN DEFAULT 0,
                full_description TEXT,
                processing_method TEXT,
                sustainability_info TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, roastery_name)
            )`,
            `CREATE TABLE IF NOT EXISTS availability_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                available BOOLEAN,
                price REAL,
                stock_info TEXT,
                checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(product_id) REFERENCES products(id)
            )`,
            `CREATE TABLE IF NOT EXISTS user_favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                size_preference TEXT DEFAULT 'both',
                organic_only BOOLEAN DEFAULT 0,
                notification_enabled BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS favorite_terms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                favorite_id INTEGER,
                term TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(favorite_id) REFERENCES user_favorites(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS notifications_sent (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                notification_type TEXT,
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(product_id) REFERENCES products(id)
            )`
        ];

        for (const query of queries) {
            await this.run(query);
        }
    }

    async runMigrations() {
        // Get current columns in products table
        const tableInfo = await this.all("PRAGMA table_info(products)");
        const existingColumns = new Set(tableInfo.map(col => col.name));
        
        // Check and add missing columns
        const requiredColumns = {
            'deep_scanned': 'BOOLEAN DEFAULT 0',
            'full_description': 'TEXT',
            'processing_method': 'TEXT',
            'sustainability_info': 'TEXT',
            'ai_country_of_origin': 'TEXT',
            'ai_region': 'TEXT',
            'ai_process_method': 'TEXT',
            'ai_roast_level': 'TEXT',
            'ai_variety': 'TEXT',
            'ai_is_organic': 'BOOLEAN DEFAULT 0',
            'ai_is_fair_trade': 'BOOLEAN DEFAULT 0',
            'ai_is_decaf': 'BOOLEAN DEFAULT 0',
            'ai_flavor_notes': 'TEXT',
            'ai_certifications': 'TEXT',
            'ai_confidence': 'INTEGER',
            'ai_tagged_at': 'DATETIME',
            'product_group_id': 'TEXT',
            'size_extracted': 'TEXT',
            'size_grams': 'INTEGER'
        };
        
        for (const [columnName, columnDef] of Object.entries(requiredColumns)) {
            if (!existingColumns.has(columnName)) {
                console.log(`Adding missing column: ${columnName}`);
                await this.run(`ALTER TABLE products ADD COLUMN ${columnName} ${columnDef}`);
            }
        }
        
        // Create index on product_group_id if it doesn't exist
        try {
            await this.run('CREATE INDEX IF NOT EXISTS idx_product_group_id ON products(product_group_id)');
        } catch (err) {
            // Index might already exist, ignore
        }
    }

    async run(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async get(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async all(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async saveProduct(productData) {
        const { name, url, price, description, organic, size_category, source_url, source_description, roastery_name } = productData;
        
        // Check if product exists (now includes roastery_name in uniqueness check)
        const existing = await this.get('SELECT id FROM products WHERE name = ? AND roastery_name = ?', [name, roastery_name]);
        
        if (existing) {
            // Update existing product
            await this.run(
                'UPDATE products SET url = ?, price = ?, description = ?, organic = ?, size_category = ?, source_url = ?, source_description = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ? AND roastery_name = ?',
                [url, price, description, organic, size_category, source_url, source_description, name, roastery_name]
            );
            return existing.id;
        } else {
            // Insert new product
            const result = await this.run(
                'INSERT INTO products (name, url, price, description, organic, size_category, source_url, source_description, roastery_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [name, url, price, description, organic, size_category, source_url, source_description, roastery_name]
            );
            return result.id;
        }
    }

    async recordAvailability(productId, available, price, stockInfo = null) {
        await this.run(
            'INSERT INTO availability_history (product_id, available, price, stock_info) VALUES (?, ?, ?, ?)',
            [productId, available, price, stockInfo]
        );
    }

    async getFavorites() {
        const favorites = await this.all('SELECT * FROM user_favorites WHERE notification_enabled = 1');
        
        // Get terms for each favorite
        for (const favorite of favorites) {
            const terms = await this.all(
                'SELECT term FROM favorite_terms WHERE favorite_id = ?',
                [favorite.id]
            );
            favorite.terms = terms.map(t => t.term);
        }
        
        return favorites;
    }

    async addFavorite(name, description = '', terms = [], sizePreference = 'both', organicOnly = false) {
        // Insert favorite
        const result = await this.run(
            'INSERT INTO user_favorites (name, description, size_preference, organic_only) VALUES (?, ?, ?, ?)',
            [name, description, sizePreference, organicOnly ? 1 : 0]
        );
        
        const favoriteId = result.id;
        
        // Insert terms
        if (terms.length > 0) {
            for (const term of terms) {
                await this.run(
                    'INSERT INTO favorite_terms (favorite_id, term) VALUES (?, ?)',
                    [favoriteId, term.trim()]
                );
            }
        } else {
            // If no terms provided, use the name as the term
            await this.run(
                'INSERT INTO favorite_terms (favorite_id, term) VALUES (?, ?)',
                [favoriteId, name]
            );
        }
        
        return favoriteId;
    }

    async updateFavorite(id, name, description = '', terms = [], sizePreference = 'both', organicOnly = false) {
        // Update the favorite
        await this.run(
            'UPDATE user_favorites SET name = ?, description = ?, size_preference = ?, organic_only = ? WHERE id = ?',
            [name, description, sizePreference, organicOnly ? 1 : 0, id]
        );
        
        // Delete existing terms
        await this.run('DELETE FROM favorite_terms WHERE favorite_id = ?', [id]);
        
        // Insert new terms
        if (terms.length > 0) {
            for (const term of terms) {
                await this.run(
                    'INSERT INTO favorite_terms (favorite_id, term) VALUES (?, ?)',
                    [id, term.trim()]
                );
            }
        } else {
            // If no terms provided, use the name as the term
            await this.run(
                'INSERT INTO favorite_terms (favorite_id, term) VALUES (?, ?)',
                [id, name]
            );
        }
        
        return id;
    }

    async removeFavorite(id) {
        // Terms will be deleted automatically due to CASCADE
        await this.run('DELETE FROM user_favorites WHERE id = ?', [id]);
    }

    async addTermToFavorite(favoriteId, term) {
        await this.run(
            'INSERT INTO favorite_terms (favorite_id, term) VALUES (?, ?)',
            [favoriteId, term.trim()]
        );
    }

    async removeTermFromFavorite(favoriteId, term) {
        await this.run(
            'DELETE FROM favorite_terms WHERE favorite_id = ? AND term = ?',
            [favoriteId, term]
        );
    }

    async getFavoriteByName(name) {
        const favorite = await this.get(
            'SELECT * FROM user_favorites WHERE name = ?',
            [name]
        );
        
        if (favorite) {
            const terms = await this.all(
                'SELECT term FROM favorite_terms WHERE favorite_id = ?',
                [favorite.id]
            );
            favorite.terms = terms.map(t => t.term);
        }
        
        return favorite;
    }

    async getAvailableProducts() {
        const query = `
            SELECT p.*, ah.available, ah.price as current_price, ah.checked_at
            FROM products p
            JOIN availability_history ah ON p.id = ah.product_id
            WHERE ah.id IN (
                SELECT MAX(id) FROM availability_history 
                GROUP BY product_id
            ) AND ah.available = 1
            ORDER BY ah.checked_at DESC
        `;
        return await this.all(query);
    }

    async getProductHistory(productId, days = 30) {
        const query = `
            SELECT * FROM availability_history 
            WHERE product_id = ? AND checked_at >= datetime('now', '-' || ? || ' days')
            ORDER BY checked_at DESC
        `;
        return await this.all(query, [productId, days]);
    }

    async getProductsByNamePattern(pattern) {
        const query = `
            SELECT p.*, ah.available, ah.price as current_price, ah.checked_at
            FROM products p
            LEFT JOIN availability_history ah ON p.id = ah.product_id
            WHERE p.name LIKE ? AND ah.id IN (
                SELECT MAX(id) FROM availability_history 
                WHERE product_id = p.id
            )
            ORDER BY ah.checked_at DESC
        `;
        return await this.all(query, [`%${pattern}%`]);
    }

    async recordNotificationSent(productId, notificationType) {
        await this.run(
            'INSERT INTO notifications_sent (product_id, notification_type) VALUES (?, ?)',
            [productId, notificationType]
        );
    }

    async wasNotificationSentRecently(productId, notificationType, hoursAgo = 24) {
        const result = await this.get(`
            SELECT COUNT(*) as count FROM notifications_sent 
            WHERE product_id = ? AND notification_type = ? 
            AND sent_at >= datetime('now', '-' || ? || ' hours')
        `, [productId, notificationType, hoursAgo]);
        
        return result.count > 0;
    }

    async getProductAvailabilityChange(productId) {
        // Get the last two availability records to detect state changes
        const recentHistory = await this.all(`
            SELECT available, checked_at FROM availability_history 
            WHERE product_id = ? 
            ORDER BY checked_at DESC 
            LIMIT 2
        `, [productId]);
        
        if (recentHistory.length < 2) {
            // If this is the first or second record, treat current state as "new"
            return {
                isNewlyAvailable: recentHistory.length > 0 && recentHistory[0].available === 1,
                isNewlyUnavailable: recentHistory.length > 0 && recentHistory[0].available === 0,
                isStateChange: recentHistory.length === 1 // First time seeing this product
            };
        }
        
        const [current, previous] = recentHistory;
        const isNewlyAvailable = current.available === 1 && previous.available === 0;
        const isNewlyUnavailable = current.available === 0 && previous.available === 1;
        const isStateChange = current.available !== previous.available;
        
        return {
            isNewlyAvailable,
            isNewlyUnavailable,
            isStateChange,
            currentState: current.available === 1,
            previousState: previous.available === 1
        };
    }

    async saveAITags(productId, tags, roasteryName = null, productName = null) {
        const { generateProductGroupId, extractSize } = require('../utils/product-grouping');
        
        // Get product info if not provided
        if (!roasteryName || !productName) {
            const product = await this.get('SELECT roastery_name, name FROM products WHERE id = ?', [productId]);
            roasteryName = roasteryName || product.roastery_name;
            productName = productName || product.name;
        }
        
        // Generate product group ID from AI tags
        const productGroupId = generateProductGroupId(tags, roasteryName);
        
        // Extract size from product name
        const sizeExtracted = extractSize(productName);
        const sizeGrams = this._inferSizeGrams(sizeExtracted);
        
        const flavorNotesJson = JSON.stringify(tags.flavor_notes || []);
        const certificationsJson = JSON.stringify(tags.certifications || []);
        
        await this.run(`
            UPDATE products SET 
                ai_country_of_origin = ?,
                ai_region = ?,
                ai_process_method = ?,
                ai_roast_level = ?,
                ai_variety = ?,
                ai_is_organic = ?,
                ai_is_fair_trade = ?,
                ai_is_decaf = ?,
                ai_flavor_notes = ?,
                ai_certifications = ?,
                ai_confidence = ?,
                ai_tagged_at = ?,
                product_group_id = ?,
                size_extracted = ?,
                size_grams = ?
            WHERE id = ?
        `, [
            tags.country_of_origin,
            tags.region,
            tags.process_method,
            tags.roast_level,
            tags.variety,
            tags.is_organic ? 1 : 0,
            tags.is_fair_trade ? 1 : 0,
            tags.is_decaf ? 1 : 0,
            flavorNotesJson,
            certificationsJson,
            tags.confidence,
            tags.tagged_at,
            productGroupId,
            sizeExtracted,
            sizeGrams,
            productId
        ]);
    }

    /**
     * Internal helper to infer size in grams from a normalized size string (e.g. "250g", "1kg").
     * Returns null if size cannot be determined.
     */
    _inferSizeGrams(size) {
        if (!size) return null;

        const value = String(size).trim().toLowerCase();

        // Simple patterns like "250g", "1000g"
        const gramMatch = value.match(/(\d+)\s*g/);
        if (gramMatch) {
            const grams = parseInt(gramMatch[1], 10);
            return Number.isFinite(grams) ? grams : null;
        }

        // Patterns like "1kg", "2 kg"
        const kgMatch = value.match(/(\d+)\s*kg/);
        if (kgMatch) {
            const kg = parseInt(kgMatch[1], 10);
            return Number.isFinite(kg) ? kg * 1000 : null;
        }

        return null;
    }

    async close() {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }
    }
}

module.exports = Database;