const { GoogleGenAI } = require('@google/genai');

class AITagger {
    constructor(apiKey = null, options = {}) {
        this.apiKey = apiKey || process.env.GEMINI_API_KEY;
        this.enabled = !!this.apiKey;
        this.model = options.model || 'gemini-2.5-flash-lite'; // Fast, lightweight and free model
        this.maxRetries = options.maxRetries || 2;
        this.batchSize = options.batchSize || 20; // Process multiple products at once
        
        if (this.enabled) {
            this.client = new GoogleGenAI({ 
                apiKey: this.apiKey
            });
        }
    }

    /**
     * Tag a single product with AI-extracted attributes
     */
    async tagProduct(productName, productDescription = '') {
        if (!this.enabled) {
            return this._getEmptyTags();
        }

        try {
            const prompt = this._buildPrompt(productName, productDescription);
            
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: prompt,
                config: {
                    temperature: 0.1
                }
            });
            
            const text = response.text;
            // Remove markdown code blocks if present
            const jsonText = text.replace(/^```json\s*|\s*```$/g, '').trim();
            const tags = JSON.parse(jsonText);
            return this._normalizeTags(tags);
            
        } catch (error) {
            console.error('AI tagging error:', error.message);
            return this._getEmptyTags();
        }
    }

    /**
     * Tag multiple products in a single batch request (more efficient)
     */
    async tagProducts(products) {
        if (!this.enabled) {
            return products.map(() => this._getEmptyTags());
        }

        const results = [];
        
        // Process in batches to avoid rate limits
        for (let i = 0; i < products.length; i += this.batchSize) {
            const batch = products.slice(i, i + this.batchSize);
            const batchResults = await this._processBatch(batch);
            results.push(...batchResults);
        }

        return results;
    }

    async _processBatch(products) {
        try {
            const prompt = this._buildBatchPrompt(products);
            
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: prompt,
                config: {
                    temperature: 0.1
                }
            });
            
            const text = response.text;
            // Remove markdown code blocks if present
            const jsonText = text.replace(/^```json\s*|\s*```$/g, '').trim();
            const data = JSON.parse(jsonText);
            return data.products.map(tags => this._normalizeTags(tags));
            
        } catch (error) {
            console.error('Batch AI tagging error:', error.message);
            
            // Check if it's a quota/rate limit error and throw to stop processing
            if (error.message && (error.message.includes('quota') || error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED'))) {
                throw new Error('Gemini API quota/rate limit exceeded. Please check your usage at https://aistudio.google.com');
            }
            
            // For other errors, return empty tags for this batch
            return products.map(() => this._getEmptyTags());
        }
    }

    _buildPrompt(productName, productDescription) {
        return `Extract coffee attributes from this product:

Name: ${productName}
Description: ${productDescription || 'N/A'}

Return a JSON object with these fields:
{
  "country_of_origin": "Country name or null",
  "region": "Specific region/area or null",
  "process_method": "One of: washed, natural, honey, anaerobic, experimental, or null",
  "roast_level": "One of: light, medium, dark, or null",
  "variety": "Coffee variety (e.g., Bourbon, Typica, Geisha) or null",
  "is_organic": true/false (true only if explicitly mentioned),
  "is_fair_trade": true/false (true only if explicitly mentioned),
  "is_decaf": true/false (true if decaffeinated/koffeinfri),
  "flavor_notes": ["note1", "note2"] (array of flavor descriptors),
  "certifications": ["cert1"] (e.g., Organic, Fair Trade, Rainforest Alliance),
  "confidence": 0-100 (your confidence in the extraction)
}

Only extract information that is clearly stated. Use null for uncertain values.`;
    }

    _buildBatchPrompt(products) {
        const productList = products.map((p, i) => 
            `${i + 1}. Name: ${p.name}\n   Description: ${p.description || 'N/A'}`
        ).join('\n\n');

        return `Extract coffee attributes from these products:

${productList}

Return a JSON object with a "products" array where each item has these fields:
{
  "products": [
    {
      "country_of_origin": "Country name or null",
      "region": "Specific region/area or null",
      "process_method": "One of: washed, natural, honey, anaerobic, experimental, or null",
      "roast_level": "One of: light, medium, dark, or null",
      "variety": "Coffee variety (e.g., Bourbon, Typica, Geisha) or null",
      "is_organic": true/false (true only if explicitly mentioned),
      "is_fair_trade": true/false (true only if explicitly mentioned),
      "is_decaf": true/false (true if decaffeinated/koffeinfri),
      "flavor_notes": ["note1", "note2"] (array of flavor descriptors),
      "certifications": ["cert1"] (e.g., Organic, Fair Trade, Rainforest Alliance),
      "confidence": 0-100 (your confidence in the extraction)
    }
  ]
}

Return ${products.length} products in the same order. Only extract clearly stated information.`;
    }

    _normalizeTags(tags) {
        return {
            country_of_origin: tags.country_of_origin || null,
            region: tags.region || null,
            process_method: tags.process_method || null,
            roast_level: tags.roast_level || null,
            variety: tags.variety || null,
            is_organic: tags.is_organic === true,
            is_fair_trade: tags.is_fair_trade === true,
            is_decaf: tags.is_decaf === true,
            flavor_notes: Array.isArray(tags.flavor_notes) ? tags.flavor_notes : [],
            certifications: Array.isArray(tags.certifications) ? tags.certifications : [],
            confidence: Math.min(100, Math.max(0, tags.confidence || 0)),
            tagged_at: new Date().toISOString()
        };
    }

    _getEmptyTags() {
        return {
            country_of_origin: null,
            region: null,
            process_method: null,
            roast_level: null,
            variety: null,
            is_organic: false,
            is_fair_trade: false,
            is_decaf: false,
            flavor_notes: [],
            certifications: [],
            confidence: 0,
            tagged_at: null
        };
    }

    /**
     * Check if AI tagging is enabled
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Get estimated cost for tagging products
     * Gemini Flash is free with generous rate limits
     */
    estimateCost(numProducts, batchMode = true) {
        // Gemini Flash is free!
        return 0;
    }
}

module.exports = AITagger;
