#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const CoffeeMonitor = require('./monitor');
const Config = require('./utils/config');
const RoasteryDiscovery = require('./discovery/roastery-discovery');
const { tagProducts, showAITaggedProducts } = require('./commands/ai-tag');
const { backfillProductGroups } = require('./commands/backfill-product-groups');
const path = require('path');
const fs = require('fs');

const argv = yargs(hideBin(process.argv))
    .option('config', {
        alias: 'c',
        description: 'Path to config file',
        type: 'string'
    })
    .example('node src/index.js discover -u "https://example-roastery.no"', 'Analyze roastery and ask to add to config')
    .example('node src/index.js check', 'Run a one-time product check across configured roasteries')
    .example('node src/index.js check --deep-scan', 'Check products and deep scan new ones for detailed info')
    .example('node src/index.js check --deep-scan --force-all', 'Deep scan all products (slower, more detailed)')
    .example('node src/index.js favorites --list', 'List all configured favorites')
    .command('check', 'Run a one-time product check', {
        'deep-scan': {
            description: 'Fetch detailed information from individual product pages',
            type: 'boolean',
            default: false
        },
        'force-all': {
            description: 'Force deep scan all products (when used with --deep-scan)',
            type: 'boolean', 
            default: false
        }
    }, async (argv) => {
        await runCheck(argv);
    })
    .command('start', 'Start scheduled monitoring', {}, async (argv) => {
        await startMonitoring(argv);
    })
    .command('report', 'Show current product availability report', {}, async (argv) => {
        await showReport(argv);
    })
    .command('status', 'Show monitoring status', {}, async (argv) => {
        await showStatus(argv);
    })
    .command('favorites', 'Manage favorite coffee categories with multiple search terms', {
        'list': {
            alias: 'l',
            description: 'List current favorites',
            type: 'boolean'
        },
        'add': {
            alias: 'a',
            description: 'Add favorite by name',
            type: 'string'
        },
        'terms': {
            alias: 't',
            description: 'Additional comma-separated search terms (optional)',
            type: 'string'
        },
        'remove': {
            alias: 'r',
            description: 'Remove a favorite by name',
            type: 'string'
        },
        'description': {
            alias: 'd',
            description: 'Description for the favorite',
            type: 'string'
        },
        'size-preference': {
            alias: 's',
            description: 'Size preference: 250g, 1kg, or both',
            type: 'string',
            choices: ['250g', '1kg', 'both']
        },
        'organic-only': {
            alias: 'o',
            description: 'Only notify for organic products',
            type: 'boolean'
        },
        'update': {
            alias: 'u',
            description: 'Update existing favorite if it exists (default behavior)',
            type: 'boolean',
            default: true
        },
    }, async (argv) => {
        await manageFavorites(argv);
    })
    .command('setup', 'Setup configuration file', {}, async (argv) => {
        await setupConfig(argv);
    })
    .command('discover', 'Auto-discover roastery configuration from URL', {
        'url': {
            alias: 'u',
            description: 'Base URL of the roastery website',
            type: 'string',
            demandOption: true
        },
        'test': {
            alias: 't',
            description: 'Test the discovered configuration',
            type: 'boolean',
            default: true
        }
    }, async (argv) => {
        await discoverRoastery(argv);
    })
    .command('ai-tag', 'Tag products with AI-extracted attributes', {
        'dry-run': {
            description: 'Show sample tagging without saving',
            type: 'boolean',
            default: false
        },
        'force': {
            description: 'Re-tag already tagged products',
            type: 'boolean',
            default: false
        },
        'limit': {
            description: 'Maximum number of products to tag',
            type: 'number'
        }
    }, async (argv) => {
        await tagProducts({
            configPath: argv.config,
            limit: argv.limit,
            force: argv.force,
            dryRun: argv['dry-run']
        });
    })
    .command('ai-list', 'Show AI-tagged products', {
        'limit': {
            description: 'Number of products to show',
            type: 'number',
            default: 20
        }
    }, async (argv) => {
        await showAITaggedProducts({
            configPath: argv.config,
            limit: argv.limit
        });
    })
    .command('backfill-groups', 'Backfill product_group_id for existing AI-tagged products', {}, async (argv) => {
        await backfillProductGroups({
            configPath: argv.config
        });
    })
    .help()
    .alias('help', 'h')
    .demandCommand(1, 'You need to specify a command')
    .strict()
    .parse();

async function runCheck(argv) {
    let monitor;
    try {
        console.log('🔍 Starting one-time product check...');
        monitor = new CoffeeMonitor(argv.config);
        await monitor.initialize();
        
        const options = {
            deepScan: argv['deep-scan'],
            forceAll: argv['force-all']
        };
        
        await monitor.checkProducts(options);
        console.log('✅ Check completed successfully');
    } catch (error) {
        console.error('❌ Check failed:', error.message);
        process.exit(1);
    } finally {
        if (monitor) {
            await monitor.close();
        }
    }
}

async function startMonitoring(argv) {
    let monitor;
    try {
        console.log('🚀 Starting scheduled coffee monitoring...');
        monitor = new CoffeeMonitor(argv.config);
        await monitor.initialize();
        
        // Show current status
        const status = await monitor.getStatus();
        console.log('📊 Current status:');
        console.log(`   Favorites configured: ${status.totalFavorites}`);
        console.log(`   Schedule: ${status.scheduledPattern}`);
        console.log(`   Available products: ${status.availableProducts}`);
        
        monitor.startScheduled();
        
        console.log('✅ Monitoring started. Press Ctrl+C to stop.');
        
        // Handle graceful shutdown
        const gracefulShutdown = async () => {
            console.log('\n🛑 Shutting down...');
            if (monitor) {
                await monitor.close();
            }
            process.exit(0);
        };
        
        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
        
        // Keep the process running
        process.stdin.resume();
        
    } catch (error) {
        console.error('❌ Failed to start monitoring:', error.message);
        if (monitor) {
            await monitor.close();
        }
        process.exit(1);
    }
}

async function showReport(argv) {
    let monitor;
    try {
        monitor = new CoffeeMonitor(argv.config);
        await monitor.initialize();
        
        console.log('📊 Coffee Availability Report');
        console.log('=' .repeat(40));
        
        const report = await monitor.getReport();
        
        console.log(`Last check: ${report.lastCheck ? report.lastCheck.toLocaleString() : 'Never'}`);
        console.log(`Total available products: ${report.totalAvailableProducts}`);
        
        if (report.preferencesEnabled) {
            console.log('Preference scoring: enabled');
            console.log(`Preferred products (score ≥ min): ${report.preferredProducts.length}`);
            if (report.preferredProducts.length > 0) {
                console.log('\n☕ Preferred Products (by score):');
                report.preferredProducts.forEach(({ product, score, attrs, reasons }) => {
                    const priceKg = attrs.price_per_kg != null ? ` (${Math.round(attrs.price_per_kg)} kr/kg)` : '';
                    console.log(`   • ${product.name} (${product.current_price || 'N/A'} kr${priceKg})`);
                    // Format reasons: "organic:true+3" -> "organic +3", "country:ethiopia+3" -> "ethiopia +3"
                    const formatReason = (r) => {
                        const match = r.match(/^([^:]+):(.+?)([+-]\d+)$/);
                        if (!match) return r;
                        const [, dim, val, pts] = match;
                        // For boolean dimensions, just show the dimension name
                        if (val === 'true') return `${dim} ${pts}`;
                        // For other dimensions, show the value
                        return `${val} ${pts}`;
                    };
                    const reasonsStr = reasons && reasons.length > 0 
                        ? reasons.map(formatReason).join(', ') 
                        : 'no matching dimensions';
                    console.log(`     Score: ${score}  |  ${reasonsStr}`);
                    if (product.url) console.log(`     URL: ${product.url}`);
                    console.log('');
                });
            } else {
                console.log('\n😔 No products match your preferences (min_score not met).');
            }
        } else {
            console.log(`Total favorites configured: ${report.totalFavorites}`);
            console.log(`Available favorites: ${report.availableFavorites}`);
            if (report.favorites.length > 0) {
                console.log('\n☕ Available Favorite Products:');
                report.favorites.forEach(product => {
                    console.log(`   • ${product.name} (${product.current_price || 'N/A'} kr)`);
                    console.log(`     Pattern: "${product.favoritePattern}"`);
                    if (product.url) console.log(`     URL: ${product.url}`);
                    console.log('');
                });
            } else {
                console.log('\n😔 No favorite products are currently available.');
            }
        }
        
        if (report.products.length > 0) {
            console.log('\n🛍️  Recently Available Products (max 20):');
            report.products.slice(0, 10).forEach(product => {
                console.log(`   • ${product.name} (${product.current_price || 'N/A'} kr)`);
            });
            
            if (report.products.length > 10) {
                console.log(`   ... and ${report.products.length - 10} more`);
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to generate report:', error.message);
        process.exit(1);
    } finally {
        if (monitor) {
            await monitor.close();
        }
    }
}

async function showStatus(argv) {
    let monitor;
    try {
        monitor = new CoffeeMonitor(argv.config);
        await monitor.initialize();
        
        const status = await monitor.getStatus();
        
        console.log('📊 Coffee Monitor Status');
        console.log('=' .repeat(30));
        console.log(`Running: ${status.isRunning ? '🟢 Yes' : '🔴 No'}`);
        console.log(`Scheduled: ${status.isScheduled ? '🟢 Yes' : '🔴 No'}`);
        console.log(`Schedule: ${status.scheduledPattern}`);
        console.log(`Last check: ${status.lastCheck ? status.lastCheck.toLocaleString() : 'Never'}`);
        console.log(`Available products: ${status.availableProducts}`);
        console.log(`Total favorites: ${status.totalFavorites}`);
        
    } catch (error) {
        console.error('❌ Failed to get status:', error.message);
        process.exit(1);
    } finally {
        if (monitor) {
            await monitor.close();
        }
    }
}

async function manageFavorites(argv) {
    let monitor;
    try {
        monitor = new CoffeeMonitor(argv.config);
        await monitor.initialize();
        
        if (argv.list) {
            const favorites = await monitor.database.getFavorites();
            console.log('⭐ Current Favorites:');
            if (favorites.length === 0) {
                console.log('  No favorites configured.');
            } else {
                favorites.forEach((fav, index) => {
                    const termsStr = fav.terms.join(', ');
                    console.log(`  ${index + 1}. "${fav.name}" - ${fav.description || 'No description'}`);
                    console.log(`     Search terms: ${termsStr}`);
                    if (fav.size_preference && fav.size_preference !== 'both') {
                        console.log(`     Size preference: ${fav.size_preference}`);
                    }
                    if (fav.organic_only) {
                        console.log(`     Organic only: Yes`);
                    }
                });
            }
        } else if (argv.add) {
            // Simple format: --add "name" with optional --terms and --description
            const name = argv.add.trim();
            let terms;
            
            if (argv.terms) {
                // Additional terms provided, combine with name (avoid duplicates)
                const additionalTerms = argv.terms.split(',').map(t => t.trim()).filter(t => t.length > 0);
                
                // Check if name is already in the additional terms (case-insensitive)
                const nameInTerms = additionalTerms.some(term => term.toLowerCase() === name.toLowerCase());
                
                if (nameInTerms) {
                    terms = additionalTerms;
                } else {
                    terms = [name, ...additionalTerms];
                }
            } else {
                // No additional terms, just use the name as the only search term
                terms = [name];
            }
            
            const description = argv.description || '';
            const sizePreference = argv['size-preference'] || 'both';
            const organicOnly = argv['organic-only'] || false;
            
            // Check if favorite already exists
            const existing = await monitor.database.getFavoriteByName(name);
            if (existing) {
                if (argv.update !== false) {
                    // Update existing favorite (default behavior) - use existing values for unspecified fields
                    const updatedDescription = argv.description !== undefined ? description : existing.description;
                    const updatedSizePreference = argv['size-preference'] !== undefined ? sizePreference : existing.size_preference;
                    const updatedOrganicOnly = argv['organic-only'] !== undefined ? organicOnly : existing.organic_only;
                    const updatedTerms = argv.terms !== undefined ? terms : existing.terms;
                    
                    await monitor.database.updateFavorite(existing.id, name, updatedDescription, updatedTerms, updatedSizePreference, updatedOrganicOnly);
                    console.log(`✅ Updated favorite: "${name}"`);
                    console.log(`   Search terms: ${updatedTerms.join(', ')}`);
                    if (updatedDescription) console.log(`   Description: ${updatedDescription}`);
                    if (updatedSizePreference !== 'both') console.log(`   Size preference: ${updatedSizePreference}`);
                    if (updatedOrganicOnly) console.log(`   Organic only: Yes`);
                } else {
                    console.log(`⚠️  Favorite "${name}" already exists (use --update to modify)`);
                }
            } else {
                await monitor.database.addFavorite(name, description, terms, sizePreference, organicOnly);
                console.log(`✅ Added favorite: "${name}"`);
                console.log(`   Search terms: ${terms.join(', ')}`);
                if (description) console.log(`   Description: ${description}`);
                if (sizePreference !== 'both') console.log(`   Size preference: ${sizePreference}`);
                if (organicOnly) console.log(`   Organic only: Yes`);
            }
        } else if (argv.remove) {
            const existing = await monitor.database.getFavoriteByName(argv.remove);
            if (existing) {
                await monitor.database.removeFavorite(existing.id);
                console.log(`✅ Removed favorite: "${argv.remove}"`);
            } else {
                console.log(`⚠️  Favorite "${argv.remove}" not found`);
            }
        } else {
            console.log('Usage examples:');
            console.log('  --list                                              # List all favorites');
            console.log('  --add "Colombia"                                    # Simple: name becomes search term');
            console.log('  --add "Ethiopian" --terms "ethiopia,etiopia"        # With additional search terms');
            console.log('  -a "Decaf" -t "koffeinfri" -d "Decaf coffee"        # With description');
            console.log('  -a "Colombian" -s "1kg" -o                          # 1kg only, organic only');
            console.log('  -a "Colombia" -s "both" -d "Updated description"     # Updates existing favorite');
            console.log('  --remove "Colombian"                                # Remove by name');
        }
        
    } catch (error) {
        console.error('❌ Failed to manage favorites:', error.message);
        process.exit(1);
    } finally {
        if (monitor) {
            await monitor.close();
        }
    }
}

async function setupConfig(argv) {
    try {
        const configPath = argv.config || path.join(__dirname, '../config/config.json');
        const examplePath = path.join(__dirname, '../config/config.example.json');
        
        if (fs.existsSync(configPath)) {
            console.log(`⚠️  Config file already exists at ${configPath}`);
            console.log('Edit it manually or delete it first to recreate from example.');
            return;
        }
        
        if (Config.createFromExample(configPath, examplePath)) {
            console.log('✅ Configuration file created successfully!');
            console.log(`📝 Edit ${configPath} with your settings:`);
            console.log('   • Add roasteries (URLs + selectors) or use auto-discovery');
            console.log('   • Configure email settings if you want notifications');
            console.log('   • Add your favorite product patterns');
            console.log('');
            console.log('You can auto-discover and add a roastery with:');
            console.log('   node src/index.js discover -u "https://example-roastery.no"');
            console.log('');
            console.log('After editing the config, run:');
            console.log('   npm run check    # Test the configuration');
            console.log('   npm run start    # Start monitoring');
        } else {
            console.error('❌ Failed to create configuration file');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

async function discoverRoastery(argv) {
    const discovery = new RoasteryDiscovery();
    
    try {
        console.log('🤖 Auto-discovering roastery configuration...');
        console.log(`🌐 Analyzing: ${argv.url}`);
        console.log('');
        
        const results = await discovery.discoverRoastery(argv.url);
        
        // Display results
        console.log('📋 Discovery Results:');
        console.log('=' .repeat(50));
        console.log(`🏪 Name: ${results.name}`);
        console.log(`🌍 Base URL: ${results.baseUrl}`);
        console.log(`🛠️  Platform(s): ${results.platforms.join(', ')}`);
        console.log(`🎯 Confidence: ${results.confidence.toUpperCase()}`);
        console.log('');
        
        if (results.shopUrls.length > 0) {
            console.log('🛒 Discovered Shop URLs:');
            results.shopUrls.forEach((shop, index) => {
                console.log(`   ${index + 1}. ${shop.url}`);
            });
            console.log('');
        }
        
        console.log('🔍 Generated Selectors:');
        Object.entries(results.selectors).forEach(([key, value]) => {
            if (value) {
                console.log(`   ${key}: ${value}`);
            }
        });
        console.log('');
        
        if (results.testResults && results.testResults.length > 0) {
            console.log('✨ Sample Products Found:');
            results.testResults.forEach((product, index) => {
                console.log(`   ${index + 1}. ${product.name} ${product.price ? `(${product.price} kr)` : ''}`);
            });
            console.log('');
        }
        
        // Generate config JSON
        const roasteryConfig = {
            name: results.name,
            baseUrl: results.baseUrl,
            shopUrls: results.shopUrls,
            selectors: results.selectors
        };
        
        console.log('📄 Generated Configuration:');
        console.log(JSON.stringify(roasteryConfig, null, 2));
        console.log('');
        
        // Always ask for confirmation to add/update roastery
        const existingRoastery = await checkForExistingRoastery(roasteryConfig, argv.config);
        
        let promptMessage;
        if (existingRoastery) {
            promptMessage = `Update existing "${existingRoastery.name}" with new discovery results (${results.shopUrls.length} shop URL(s))?`;
        } else {
            promptMessage = `Add "${results.name}" to your config with ${results.shopUrls.length} shop URL(s)?`;
        }
        
        const shouldAdd = await promptConfirmation(promptMessage, results.confidence, existingRoastery);
        
        if (shouldAdd) {
            await addRoasteryToConfig(roasteryConfig, argv.config);
        } else {
            console.log('🚫 Roastery not added.');
            console.log('💡 You can still copy the JSON above and add it manually to config.json');
        }
        
    } catch (error) {
        console.error('❌ Discovery failed:', error.message);
        process.exit(1);
    } finally {
        await discovery.close();
    }
}

async function checkForExistingRoastery(roasteryConfig, configPath) {
    try {
        const actualConfigPath = configPath || path.join(__dirname, '../config/config.json');
        
        if (!fs.existsSync(actualConfigPath)) {
            return null;
        }
        
        const configData = fs.readFileSync(actualConfigPath, 'utf8');
        const config = JSON.parse(configData);
        
        if (!config.roasteries) {
            return null;
        }
        
        // Check if roastery already exists
        return config.roasteries.find(r => 
            r.name === roasteryConfig.name || r.baseUrl === roasteryConfig.baseUrl
        ) || null;
        
    } catch (error) {
        console.error('⚠️  Error checking for existing roastery:', error.message);
        return null;
    }
}

async function promptConfirmation(message, confidence, existingRoastery = null) {
    const readline = require('readline');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        // Add context based on confidence level
        let contextMessage = '';
        switch(confidence) {
            case 'high':
                contextMessage = '🚀 High confidence - selectors tested successfully!';
                break;
            case 'medium':
                contextMessage = '🟡 Medium confidence - some products found, may need tweaking.';
                break;
            case 'low':
                contextMessage = '🔴 Low confidence - no products found, selectors may need manual adjustment.';
                break;
        }
        
        console.log('');
        console.log(contextMessage);
        
        // Show additional context if updating existing roastery
        if (existingRoastery) {
            console.log('🔄 This will replace the existing configuration:');
            console.log(`   Current URLs: ${existingRoastery.shopUrls?.length || 0}`);
            console.log(`   Current selectors: ${Object.keys(existingRoastery.selectors || {}).length}`);
        }
        
        console.log('');
        
        rl.question(`${message} [y/N]: `, (answer) => {
            rl.close();
            const normalized = answer.toLowerCase().trim();
            resolve(normalized === 'y' || normalized === 'yes');
        });
    });
}

async function addRoasteryToConfig(roasteryConfig, configPath) {
    try {
        const actualConfigPath = configPath || path.join(__dirname, '../config/config.json');
        
        if (!fs.existsSync(actualConfigPath)) {
            console.error('❌ Config file not found. Run setup first.');
            return;
        }
        
        const configData = fs.readFileSync(actualConfigPath, 'utf8');
        const config = JSON.parse(configData);
        
        if (!config.roasteries) {
            config.roasteries = [];
        }
        
        // Check if roastery already exists
        const existingIndex = config.roasteries.findIndex(r => 
            r.name === roasteryConfig.name || r.baseUrl === roasteryConfig.baseUrl
        );
        
        if (existingIndex >= 0) {
            console.log('⚠️  Roastery already exists in config. Updating...');
            config.roasteries[existingIndex] = roasteryConfig;
        } else {
            console.log('➕ Adding roastery to config...');
            config.roasteries.push(roasteryConfig);
        }
        
        fs.writeFileSync(actualConfigPath, JSON.stringify(config, null, 2));
        console.log('✅ Roastery added to configuration!');
        console.log('🧪 Run a test check:');
        console.log('   node src/index.js check');
        
    } catch (error) {
        console.error('❌ Failed to add roastery to config:', error.message);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

module.exports = { CoffeeMonitor };