#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Migration script to convert single-roastery config to multi-roastery format
 */

const configPath = path.join(__dirname, 'config/config.json');
const backupPath = path.join(__dirname, 'config/config.json.backup');

function migrateConfig() {
    console.log('🔄 Migrating configuration to multi-roastery format...');

    // Check if config exists
    if (!fs.existsSync(configPath)) {
        console.error('❌ Config file not found at:', configPath);
        process.exit(1);
    }

    // Read existing config
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);

    // Check if already migrated
    if (config.roasteries) {
        console.log('✅ Configuration already uses multi-roastery format!');
        return;
    }

    // Check if old format exists
    if (!config.roastery) {
        console.error('❌ No roastery configuration found to migrate');
        process.exit(1);
    }

    // Create backup
    fs.writeFileSync(backupPath, configData);
    console.log('📦 Backup created at:', backupPath);

    // Convert to new format
    const newConfig = {
        // Keep existing non-roastery config
        notifications: config.notifications,
        monitoring: config.monitoring,
        favorites: config.favorites,
        database: config.database,
        logging: config.logging,

        // Convert single roastery to roasteries array
        roasteries: [
            {
                name: config.roastery.name,
                baseUrl: config.roastery.baseUrl,
                shopUrls: config.roastery.shopUrls || [
                    {
                        url: config.roastery.shopUrl,
                        metadata: {
                            organic: true,
                            category: "all_sizes",
                            description: "Migrated from single URL"
                        }
                    }
                ],
                selectors: config.roastery.selectors
            }
        ]
    };

    // Write new config
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    console.log('✅ Configuration migrated successfully!');
    console.log('📄 New format with roasteries array created');
    console.log('');
    console.log('🔧 To add more roasteries, edit config/config.json and add objects to the "roasteries" array.');
    console.log('');
    console.log('Example structure for adding a new roastery:');
    console.log('```json');
    console.log('{');
    console.log('  "name": "New Roastery Name",');
    console.log('  "baseUrl": "https://newroastery.com/",');
    console.log('  "shopUrls": [');
    console.log('    {');
    console.log('      "url": "https://newroastery.com/shop/coffee",');
    console.log('      "metadata": {');
    console.log('        "organic": false,');
    console.log('        "category": "all_sizes",');
    console.log('        "description": "All coffee products"');
    console.log('      }');
    console.log('    }');
    console.log('  ],');
    console.log('  "selectors": {');
    console.log('    "productContainer": ".product",');
    console.log('    "name": ".product-title",');
    console.log('    "price": ".price",');
    console.log('    "link": "a"');
    console.log('  }');
    console.log('}');
    console.log('```');
}

if (require.main === module) {
    try {
        migrateConfig();
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

module.exports = { migrateConfig };