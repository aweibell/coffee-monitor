#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const CoffeeMonitor = require('./monitor');
const Config = require('./utils/config');
const path = require('path');
const fs = require('fs');

const argv = yargs(hideBin(process.argv))
    .option('config', {
        alias: 'c',
        description: 'Path to config file',
        type: 'string'
    })
    .command('check', 'Run a one-time product check', {}, async (argv) => {
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
        await monitor.checkProducts();
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
        console.log(`Total favorites configured: ${report.totalFavorites}`);
        console.log(`Available favorites: ${report.availableFavorites}`);
        
        if (report.favorites.length > 0) {
            console.log('\n☕ Available Favorite Products:');
            report.favorites.forEach(product => {
                console.log(`   • ${product.name} (${product.current_price || 'N/A'} kr)`);
                console.log(`     Pattern: "${product.favoritePattern}"`);
                if (product.url) {
                    console.log(`     URL: ${product.url}`);
                }
                console.log('');
            });
        } else {
            console.log('\n😔 No favorite products are currently available.');
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
            console.log('   • Set your roastery URL and selectors');
            console.log('   • Configure email settings if you want notifications');
            console.log('   • Add your favorite product patterns');
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