const crypto = require('crypto');

/**
 * Generate a canonical product group ID from AI tags
 * This allows grouping size variants of the same coffee product
 */
function generateProductGroupId(aiTags, roasteryName) {
    if (!aiTags) {
        return null;
    }
    
    // Build identity from key attributes
    const parts = [
        roasteryName,
        aiTags.country_of_origin || 'unknown',
        aiTags.region || '',
        aiTags.variety || '',
        aiTags.process_method || '',
        aiTags.roast_level || '',
        aiTags.is_decaf ? 'decaf' : ''
    ].filter(Boolean);
    
    // Generate hash for consistent grouping
    return crypto.createHash('sha256')
        .update(parts.join(':').toLowerCase())
        .digest('hex')
        .substring(0, 16);
}

/**
 * Extract size from product name
 * Returns null if no size found
 */
function extractSize(productName) {
    // Match common Norwegian size patterns
    const sizePatterns = [
        /(\d+)\s*g\b/i,           // 250g, 1000g
        /(\d+)\s*kg\b/i,          // 1kg, 2kg
        /(\d+)\s*gram\b/i         // 250gram
    ];
    
    for (const pattern of sizePatterns) {
        const match = productName.match(pattern);
        if (match) {
            let amount = parseInt(match[1]);
            
            // Normalize to grams
            if (pattern.source.includes('kg')) {
                amount = amount * 1000;
            }
            
            // Return in standard format
            if (amount >= 1000) {
                return `${amount / 1000}kg`;
            } else {
                return `${amount}g`;
            }
        }
    }
    
    return null;
}

/**
 * Check if two products belong to the same group
 */
function isSameProductGroup(product1, product2) {
    // If both have product_group_id, compare those
    if (product1.product_group_id && product2.product_group_id) {
        return product1.product_group_id === product2.product_group_id;
    }
    
    // Fall back to name-based comparison (legacy)
    const base1 = getBaseProductName(product1.name);
    const base2 = getBaseProductName(product2.name);
    
    return base1 === base2;
}

/**
 * Get base product name by removing size indicators (legacy fallback)
 */
function getBaseProductName(productName) {
    return productName
        .replace(/\s*\d+\s*(g|kg|gram|kilo)\b/gi, '')
        .replace(/\s*\d+\s*x\s*\d+\s*(g|kg)\b/gi, '')
        .trim();
}

module.exports = {
    generateProductGroupId,
    extractSize,
    isSameProductGroup,
    getBaseProductName
};
