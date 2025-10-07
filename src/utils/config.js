const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
                this.applyEnvironmentOverrides();
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

        // Validate multi-roastery format
        if (!this.config.roasteries || !Array.isArray(this.config.roasteries) || this.config.roasteries.length === 0) {
            throw new Error('roasteries must be a non-empty array');
        }

        for (const [index, roastery] of this.config.roasteries.entries()) {
            if (!roastery.baseUrl) {
                throw new Error(`roasteries[${index}].baseUrl is required`);
            }
            if (!roastery.name) {
                throw new Error(`roasteries[${index}].name is required`);
            }
            if (!roastery.shopUrls || !Array.isArray(roastery.shopUrls) || roastery.shopUrls.length === 0) {
                throw new Error(`roasteries[${index}].shopUrls must be a non-empty array`);
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

    applyEnvironmentOverrides() {
        // Override email configuration with environment variables if they exist
        if (process.env.EMAIL_HOST) {
            if (!this.config.notifications) this.config.notifications = {};
            if (!this.config.notifications.email) this.config.notifications.email = {};
            if (!this.config.notifications.email.smtp) this.config.notifications.email.smtp = {};
            this.config.notifications.email.smtp.host = process.env.EMAIL_HOST;
        }
        
        if (process.env.EMAIL_PORT) {
            if (!this.config.notifications) this.config.notifications = {};
            if (!this.config.notifications.email) this.config.notifications.email = {};
            if (!this.config.notifications.email.smtp) this.config.notifications.email.smtp = {};
            this.config.notifications.email.smtp.port = parseInt(process.env.EMAIL_PORT);
        }
        
        if (process.env.EMAIL_USER) {
            if (!this.config.notifications) this.config.notifications = {};
            if (!this.config.notifications.email) this.config.notifications.email = {};
            if (!this.config.notifications.email.smtp) this.config.notifications.email.smtp = {};
            if (!this.config.notifications.email.smtp.auth) this.config.notifications.email.smtp.auth = {};
            this.config.notifications.email.smtp.auth.user = process.env.EMAIL_USER;
        }
        
        if (process.env.EMAIL_PASS) {
            if (!this.config.notifications) this.config.notifications = {};
            if (!this.config.notifications.email) this.config.notifications.email = {};
            if (!this.config.notifications.email.smtp) this.config.notifications.email.smtp = {};
            if (!this.config.notifications.email.smtp.auth) this.config.notifications.email.smtp.auth = {};
            this.config.notifications.email.smtp.auth.pass = process.env.EMAIL_PASS;
        }
        
        if (process.env.EMAIL_FROM) {
            if (!this.config.notifications) this.config.notifications = {};
            if (!this.config.notifications.email) this.config.notifications.email = {};
            this.config.notifications.email.from = process.env.EMAIL_FROM;
        }
        
        if (process.env.EMAIL_TO) {
            if (!this.config.notifications) this.config.notifications = {};
            if (!this.config.notifications.email) this.config.notifications.email = {};
            // Handle comma-separated email addresses
            this.config.notifications.email.to = process.env.EMAIL_TO.split(',').map(email => email.trim());
        }
        
        if (process.env.DATABASE_PATH) {
            if (!this.config.database) this.config.database = {};
            this.config.database.path = process.env.DATABASE_PATH;
        }
        
        // Telegram configuration overrides
        if (process.env.TELEGRAM_BOT_TOKEN) {
            if (!this.config.notifications) this.config.notifications = {};
            if (!this.config.notifications.telegram) this.config.notifications.telegram = {};
            this.config.notifications.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
        }
        
        if (process.env.TELEGRAM_CHAT_ID) {
            if (!this.config.notifications) this.config.notifications = {};
            if (!this.config.notifications.telegram) this.config.notifications.telegram = {};
            this.config.notifications.telegram.chatId = process.env.TELEGRAM_CHAT_ID;
        }
        
        if (process.env.TELEGRAM_ENABLED !== undefined) {
            if (!this.config.notifications) this.config.notifications = {};
            if (!this.config.notifications.telegram) this.config.notifications.telegram = {};
            this.config.notifications.telegram.enabled = process.env.TELEGRAM_ENABLED === 'true';
        }
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

    getRoasteries() {
        return this.config.roasteries || [];
    }

    getAllShopUrls() {
        // Get all URLs from all roasteries with roastery info
        const roasteries = this.getRoasteries();
        const allUrls = [];
        
        for (const roastery of roasteries) {
            // Add roastery info to each URL
            for (const urlConfig of roastery.shopUrls) {
                allUrls.push({
                    ...urlConfig,
                    roastery: {
                        name: roastery.name,
                        baseUrl: roastery.baseUrl,
                        selectors: roastery.selectors || {}
                    }
                });
            }
        }
        
        return allUrls;
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