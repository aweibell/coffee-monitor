/**
 * Example: Using the AI Tagger Programmatically
 * 
 * This shows how to integrate AI tagging into your own scripts
 */

const AITagger = require('../src/processors/ai-tagger');

async function exampleSingleProduct() {
    console.log('Example 1: Tag a Single Product\n');
    
    const tagger = new AITagger();
    
    if (!tagger.isEnabled()) {
        console.log('❌ Set OPENAI_API_KEY in .env first!');
        return;
    }
    
    // Sample product
    const productName = 'Ethiopia Yirgacheffe Natural Process - 250g';
    const productDescription = 'Light roast with notes of blueberry, jasmine, and dark chocolate. Organic certified.';
    
    console.log(`Product: ${productName}`);
    console.log(`Description: ${productDescription}\n`);
    
    const tags = await tagger.tagProduct(productName, productDescription);
    
    console.log('AI-Extracted Tags:');
    console.log(JSON.stringify(tags, null, 2));
}

async function exampleBatchProducts() {
    console.log('\nExample 2: Tag Multiple Products in Batch\n');
    
    const tagger = new AITagger();
    
    if (!tagger.isEnabled()) {
        console.log('❌ Set OPENAI_API_KEY in .env first!');
        return;
    }
    
    // Sample products
    const products = [
        {
            name: 'Kenya AA Kiambu Washed',
            description: 'Medium roast with bright acidity and notes of blackcurrant and citrus'
        },
        {
            name: 'Colombia Huila Decaf',
            description: 'Swiss water process decaffeinated. Medium-dark roast with chocolate and caramel notes'
        },
        {
            name: 'Brazil Santos Natural',
            description: 'Medium roast, nutty and chocolatey. Fair Trade certified'
        }
    ];
    
    console.log(`Tagging ${products.length} products...\n`);
    
    // Tag all at once (more efficient than individual calls)
    const allTags = await tagger.tagProducts(products);
    
    // Display results
    for (let i = 0; i < products.length; i++) {
        console.log(`\n📦 ${products[i].name}`);
        const tags = allTags[i];
        
        if (tags.country_of_origin) {
            console.log(`   Origin: ${tags.country_of_origin}`);
        }
        if (tags.process_method) {
            console.log(`   Process: ${tags.process_method}`);
        }
        if (tags.is_decaf) {
            console.log(`   ⚠️  Decaf detected!`);
        }
        if (tags.is_fair_trade) {
            console.log(`   ✓ Fair Trade`);
        }
        console.log(`   Confidence: ${tags.confidence}%`);
    }
}

async function exampleCostEstimation() {
    console.log('\nExample 3: Cost Estimation\n');
    
    const tagger = new AITagger();
    
    const productCounts = [10, 100, 1000];
    
    console.log('Estimated costs for tagging:');
    for (const count of productCounts) {
        const cost = tagger.estimateCost(count, true);
        console.log(`  ${count} products: $${cost.toFixed(4)}`);
    }
}

async function exampleCustomOptions() {
    console.log('\nExample 4: Custom Options\n');
    
    // Create tagger with custom options
    const tagger = new AITagger(process.env.OPENAI_API_KEY, {
        model: 'gpt-4o-mini',  // Default model
        batchSize: 10,         // Process 10 products at once (default is 5)
        maxRetries: 3          // Retry failed requests up to 3 times
    });
    
    if (!tagger.isEnabled()) {
        console.log('❌ Set OPENAI_API_KEY in .env first!');
        return;
    }
    
    console.log('Tagger configured with:');
    console.log(`  Model: gpt-4o-mini`);
    console.log(`  Batch size: 10`);
    console.log(`  Max retries: 3`);
    console.log(`  Enabled: ${tagger.isEnabled()}`);
}

async function exampleFilteringByTags() {
    console.log('\nExample 5: Filtering Products by AI Tags\n');
    
    // Example: How you might filter products after tagging
    const exampleProducts = [
        {
            name: 'Ethiopia Natural',
            ai_tags: {
                country_of_origin: 'Ethiopia',
                process_method: 'natural',
                is_organic: false,
                confidence: 88
            }
        },
        {
            name: 'Colombia Organic Washed',
            ai_tags: {
                country_of_origin: 'Colombia',
                process_method: 'washed',
                is_organic: true,
                confidence: 92
            }
        }
    ];
    
    // Filter organic products
    const organicProducts = exampleProducts.filter(p => p.ai_tags.is_organic);
    console.log('Organic products:', organicProducts.map(p => p.name));
    
    // Filter by origin
    const ethiopianProducts = exampleProducts.filter(p => 
        p.ai_tags.country_of_origin === 'Ethiopia'
    );
    console.log('Ethiopian products:', ethiopianProducts.map(p => p.name));
    
    // Filter by process and confidence
    const naturalHighConfidence = exampleProducts.filter(p => 
        p.ai_tags.process_method === 'natural' && p.ai_tags.confidence >= 85
    );
    console.log('Natural process (high confidence):', naturalHighConfidence.map(p => p.name));
}

// Run examples
async function main() {
    console.log('='.repeat(60));
    console.log('AI Tagger Examples');
    console.log('='.repeat(60));
    
    try {
        await exampleSingleProduct();
        await exampleBatchProducts();
        await exampleCostEstimation();
        await exampleCustomOptions();
        await exampleFilteringByTags();
        
        console.log('\n' + '='.repeat(60));
        console.log('Examples completed!');
        console.log('='.repeat(60));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    exampleSingleProduct,
    exampleBatchProducts,
    exampleCostEstimation,
    exampleCustomOptions,
    exampleFilteringByTags
};
