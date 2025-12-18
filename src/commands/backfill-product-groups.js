const Database = require('../database/database');
const Config = require('../utils/config');
const { generateProductGroupId, extractSize } = require('../utils/product-grouping');
const path = require('path');

async function backfillProductGroups(options = {}) {
    const { configPath = null } = options;
    
    const config = new Config(configPath);
    const database = new Database(path.resolve(config.getDatabaseConfig().path));
    
    try {
        await database.initialize();
        
        console.log('🔄 Backfilling product_group_id for AI-tagged products...\n');
        
        // Get all products that have AI tags but no product_group_id
        const products = await database.all(`
            SELECT id, name, roastery_name,
                   ai_country_of_origin, ai_region, ai_process_method, 
                   ai_roast_level, ai_variety, ai_is_decaf
            FROM products 
            WHERE ai_tagged_at IS NOT NULL
        `);
        
        console.log(`Found ${products.length} AI-tagged products\n`);
        
        let updated = 0;
        let skipped = 0;
        
        for (const product of products) {
            // Reconstruct AI tags object
            const aiTags = {
                country_of_origin: product.ai_country_of_origin,
                region: product.ai_region,
                process_method: product.ai_process_method,
                roast_level: product.ai_roast_level,
                variety: product.ai_variety,
                is_decaf: product.ai_is_decaf === 1
            };
            
            // Generate product group ID
            const productGroupId = generateProductGroupId(aiTags, product.roastery_name);
            
            // Extract size
            const sizeExtracted = extractSize(product.name);
            
            if (productGroupId) {
                await database.run(`
                    UPDATE products 
                    SET product_group_id = ?, size_extracted = ?
                    WHERE id = ?
                `, [productGroupId, sizeExtracted, product.id]);
                
                updated++;
                console.log(`✓ Updated: ${product.name} (${product.roastery_name})`);
                if (sizeExtracted) {
                    console.log(`  Size: ${sizeExtracted}, Group ID: ${productGroupId.substring(0, 8)}...`);
                }
            } else {
                skipped++;
                console.log(`⊘ Skipped: ${product.name} - insufficient AI data`);
            }
        }
        
        console.log(`\n✅ Backfill complete!`);
        console.log(`   Updated: ${updated}`);
        console.log(`   Skipped: ${skipped}`);
        
        // Show some statistics
        const groupStats = await database.all(`
            SELECT product_group_id, COUNT(*) as count
            FROM products
            WHERE product_group_id IS NOT NULL
            GROUP BY product_group_id
            HAVING count > 1
            ORDER BY count DESC
            LIMIT 10
        `);
        
        if (groupStats.length > 0) {
            console.log(`\n📊 Top product groups with multiple variants:`);
            for (const stat of groupStats) {
                const examples = await database.all(`
                    SELECT name, size_extracted
                    FROM products
                    WHERE product_group_id = ?
                    LIMIT 3
                `, [stat.product_group_id]);
                
                console.log(`\n   ${stat.count} variants:`);
                for (const ex of examples) {
                    console.log(`   - ${ex.name} (${ex.size_extracted || 'unknown size'})`);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await database.close();
    }
}

module.exports = { backfillProductGroups };
