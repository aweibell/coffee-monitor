const AITagger = require('../processors/ai-tagger');
const Database = require('../database/database');
const Config = require('../utils/config');
const path = require('path');

async function tagProducts(options = {}) {
    const {
        configPath = null,
        limit = null,
        force = false,
        dryRun = false
    } = options;

    const config = new Config(configPath);
    const database = new Database(path.resolve(config.getDatabaseConfig().path));
    
    try {
        await database.initialize();
        
        console.log('🤖 AI Coffee Product Tagging\n');
        
        // Initialize AI tagger
        const tagger = new AITagger();
        
        if (!tagger.isEnabled()) {
            console.log('❌ Gemini API key not found!');
            console.log('   Set GEMINI_API_KEY in your .env file');
            console.log('   Get your key from: https://aistudio.google.com/apikey');
            process.exit(1);
        }
        
        console.log('✓ Gemini API key found');
        
        // Get products to tag
        let query = 'SELECT * FROM products';
        const params = [];
        
        if (!force) {
            // Only tag products that haven't been tagged yet
            query += ' WHERE ai_tagged_at IS NULL';
        }
        
        if (limit) {
            query += ' LIMIT ?';
            params.push(limit);
        }
        
        const products = await database.all(query, params);
        
        if (products.length === 0) {
            console.log('✓ All products are already tagged!');
            console.log('  Use --force to re-tag existing products');
            return;
        }
        
        console.log(`\nFound ${products.length} product(s) to tag`);
        
        // Estimate cost (free for Gemini!)
        const estimatedCost = tagger.estimateCost(products.length, true);
        console.log(`Estimated cost: $${estimatedCost.toFixed(4)} (Gemini Flash is free!)`);
        
        if (dryRun) {
            console.log('\n🔍 Dry run - showing sample tagging for first product:');
            const sample = products[0];
            console.log(`\n📦 ${sample.name}`);
            console.log(`   ${sample.description || '(no description)'}`);
            
            const tags = await tagger.tagProduct(sample.name, sample.description);
            
            console.log('\n🏷️  AI-extracted tags:');
            console.log(`   Origin: ${tags.country_of_origin || 'Unknown'} ${tags.region ? `(${tags.region})` : ''}`);
            console.log(`   Process: ${tags.process_method || 'Unknown'}`);
            console.log(`   Roast: ${tags.roast_level || 'Unknown'}`);
            console.log(`   Variety: ${tags.variety || 'Unknown'}`);
            console.log(`   Organic: ${tags.is_organic ? 'Yes' : 'No'}`);
            console.log(`   Fair Trade: ${tags.is_fair_trade ? 'Yes' : 'No'}`);
            console.log(`   Decaf: ${tags.is_decaf ? 'Yes' : 'No'}`);
            if (tags.flavor_notes.length > 0) {
                console.log(`   Flavor notes: ${tags.flavor_notes.join(', ')}`);
            }
            if (tags.certifications.length > 0) {
                console.log(`   Certifications: ${tags.certifications.join(', ')}`);
            }
            console.log(`   Confidence: ${tags.confidence}%`);
            
            console.log('\nℹ️  This was a dry run. Run without --dry-run to save tags.');
            return;
        }
        
        console.log('\n🏷️  Tagging products...\n');
        
        // Tag products in batches
        const tags = await tagger.tagProducts(products);
        
        // Save tags to database
        let tagged = 0;
        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            const productTags = tags[i];
            
            await database.saveAITags(product.id, productTags);
            tagged++;
            
            // Show progress
            const origin = productTags.country_of_origin || '?';
            const process = productTags.process_method || '?';
            const confidence = productTags.confidence;
            
            console.log(`✓ [${tagged}/${products.length}] ${product.name}`);
            console.log(`  → ${origin} | ${process} | ${confidence}% confidence`);
        }
        
        console.log(`\n✅ Successfully tagged ${tagged} product(s)!`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await database.close();
    }
}

async function showAITaggedProducts(options = {}) {
    const { configPath = null, limit = 20 } = options;
    
    const config = new Config(configPath);
    const database = new Database(path.resolve(config.getDatabaseConfig().path));
    
    try {
        await database.initialize();
        
        const products = await database.all(`
            SELECT * FROM products 
            WHERE ai_tagged_at IS NOT NULL 
            ORDER BY ai_confidence DESC, ai_tagged_at DESC 
            LIMIT ?
        `, [limit]);
        
        if (products.length === 0) {
            console.log('No AI-tagged products found.');
            console.log('Run: node src/index.js ai-tag');
            return;
        }
        
        console.log(`\n🏷️  AI-Tagged Products (showing ${products.length})\n`);
        
        for (const product of products) {
            console.log(`📦 ${product.name}`);
            
            if (product.ai_country_of_origin || product.ai_region) {
                const location = [product.ai_country_of_origin, product.ai_region].filter(Boolean).join(', ');
                console.log(`   📍 Origin: ${location}`);
            }
            
            if (product.ai_process_method) {
                console.log(`   ⚙️  Process: ${product.ai_process_method}`);
            }
            
            if (product.ai_roast_level) {
                console.log(`   🔥 Roast: ${product.ai_roast_level}`);
            }
            
            if (product.ai_variety) {
                console.log(`   🌱 Variety: ${product.ai_variety}`);
            }
            
            const attributes = [];
            if (product.ai_is_organic) attributes.push('Organic');
            if (product.ai_is_fair_trade) attributes.push('Fair Trade');
            if (product.ai_is_decaf) attributes.push('Decaf');
            
            if (attributes.length > 0) {
                console.log(`   ✨ Attributes: ${attributes.join(', ')}`);
            }
            
            if (product.ai_flavor_notes) {
                try {
                    const notes = JSON.parse(product.ai_flavor_notes);
                    if (notes.length > 0) {
                        console.log(`   👃 Flavors: ${notes.join(', ')}`);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
            
            if (product.ai_confidence) {
                console.log(`   🎯 Confidence: ${product.ai_confidence}%`);
            }
            
            console.log('');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await database.close();
    }
}

module.exports = { tagProducts, showAITaggedProducts };
