const fs = require('fs');
const path = require('path');

class Config {
    constructor(configPath = null) {
        this.configPath = configPath || path.join(__dirname, '../../config/config.json');
        this.config = null;
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                this.config = JSON.parse(configData);
                this.validate();
            } else {
                throw new Error(`Config file not found at ${this.configPath}`);
            }
        } catch (error) {
            console.error('Error loading config:', error.message);
            throw error;
        }
    }

    validate() {
        if (!this.config) {
            throw new Error('Config is empty');
        }

        // Required fields validation
        const required = {
            'roastery.baseUrl': this.config.roastery?.baseUrl,
        };

        // Support both old shopUrl and new shopUrls format
        if (!this.config.roastery?.shopUrl && !this.config.roastery?.shopUrls) {
            throw new Error('Required config field missing: roastery.shopUrl or roastery.shopUrls');
        }

        for (const [field, value] of Object.entries(required)) {
            if (!value) {
                throw new Error(`Required config field missing: ${field}`);
            }
        }

        // Validate email config if enabled
        if (this.config.notifications?.email?.enabled) {
            const emailConfig = this.config.notifications.email;
            if (!emailConfig.smtp?.host || !emailConfig.smtp?.auth?.user) {
                console.warn('Email notifications enabled but SMTP configuration is incomplete');
            }
        }

        console.log('Configuration loaded and validated successfully');
    }

    get(path, defaultValue = null) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }
        
        return current;
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.config;
        
        for (const key of keys) {
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
    }

    save() {
        try {
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('Configuration saved successfully');
        } catch (error) {
            console.error('Error saving config:', error);
            throw error;
        }
    }

    getRoasteryConfig() {
        return this.config.roastery;
    }

    getShopUrls() {
        // Support new shopUrls format
        if (this.config.roastery?.shopUrls) {
            return this.config.roastery.shopUrls;
        }
        
        // Backward compatibility with old shopUrl format
        if (this.config.roastery?.shopUrl) {
            return [{
                url: this.config.roastery.shopUrl,
                metadata: {
                    organic: true, // Assume organic for backward compatibility
                    category: "all_sizes",
                    description: "Legacy single URL"
                }
            }];
        }
        
        return [];
    }

    getNotificationConfig() {
        return this.config.notifications;
    }

    getFavorites() {
        return this.config.favorites || [];
    }

    addFavorite(pattern, description = '') {
        if (!this.config.favorites) {
            this.config.favorites = [];
        }
        
        // Check if pattern already exists
        const exists = this.config.favorites.some(fav => fav.pattern === pattern);
        if (!exists) {
            this.config.favorites.push({ pattern, description });
            return true;
        }
        return false;
    }

    removeFavorite(pattern) {
        if (this.config.favorites) {
            const initialLength = this.config.favorites.length;
            this.config.favorites = this.config.favorites.filter(fav => fav.pattern !== pattern);
            return this.config.favorites.length < initialLength;
        }
        return false;
    }

    getMonitoringConfig() {
        return {
            checkInterval: this.get('monitoring.checkInterval', '0 9 * * *'),
            maxRetries: this.get('monitoring.maxRetries', 3),
            requestTimeout: this.get('monitoring.requestTimeout', 30000),
            screenshotOnError: this.get('monitoring.screenshotOnError', true)
        };
    }

    getDatabaseConfig() {
        return {
            path: this.get('database.path', './data/coffee.db')
        };
    }

    getLoggingConfig() {
        return {
            level: this.get('logging.level', 'info'),
            file: this.get('logging.file', './logs/coffee-monitor.log'),
            maxSize: this.get('logging.maxSize', '10MB'),
            maxFiles: this.get('logging.maxFiles', 5)
        };
    }

    static createFromExample(configPath, examplePath) {
        try {
            if (fs.existsSync(examplePath)) {
                fs.copyFileSync(examplePath, configPath);
                console.log(`Created config file at ${configPath} from example`);
                console.log('Please edit the config file with your specific settings');
                return true;
            } else {
                console.error(`Example config file not found at ${examplePath}`);
                return false;
            }
        } catch (error) {
            console.error('Error creating config from example:', error);
            return false;
        }
    }
}

module.exports = Config;