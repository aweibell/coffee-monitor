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
    }

    async createTables() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT,
                price REAL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name)
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
        const { name, url, price, description } = productData;
        
        // Check if product exists
        const existing = await this.get('SELECT id FROM products WHERE name = ?', [name]);
        
        if (existing) {
            // Update existing product
            await this.run(
                'UPDATE products SET url = ?, price = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?',
                [url, price, description, name]
            );
            return existing.id;
        } else {
            // Insert new product
            const result = await this.run(
                'INSERT INTO products (name, url, price, description) VALUES (?, ?, ?, ?)',
                [name, url, price, description]
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

    async addFavorite(name, description = '', terms = []) {
        // Insert favorite
        const result = await this.run(
            'INSERT INTO user_favorites (name, description) VALUES (?, ?)',
            [name, description]
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