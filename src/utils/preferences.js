const { extractSize } = require('./product-grouping');
const { normalizeCountry, getContinentForCountry } = require('./country-continent');

/**
 * Normalize a product row (from DB) into a generic attribute object
 * used by the preference scoring engine.
 *
 * This intentionally works on a single product row (one concrete offer),
 * not on grouped variants. Grouping is handled at a higher level.
 *
 * @param {Object} product - Row from products table (optionally joined with availability_history).
 * @returns {Object} attrs - Normalized attributes for scoring.
 */
function normalizeProductAttributes(product) {
    if (!product) return {};

    const countryRaw = product.ai_country_of_origin || null;
    const country = normalizeCountry(countryRaw);
    const continent = getContinentForCountry(countryRaw);

    const processRaw = product.ai_process_method || null;
    const process = processRaw ? String(processRaw).trim().toLowerCase() : null;

    const roastRaw = product.ai_roast_level || null;
    const roast = roastRaw ? String(roastRaw).trim().toLowerCase() : null;

    const roasteryRaw = product.roastery_name || null;
    const roastery = roasteryRaw ? String(roasteryRaw).trim().toLowerCase() : null;

    // Organic: trust explicit flags on product OR AI tags
    const organic = !!(product.organic || product.ai_is_organic);
    const decaf = !!product.ai_is_decaf;
    const fairtrade = !!product.ai_is_fair_trade;

    // Size and price normalization
    const name = product.name || '';
    const sizeExtracted = product.size_extracted || extractSize(name) || null;
    const sizeGrams = inferSizeGrams(sizeExtracted);

    // Prefer current_price if present (from joined availability_history)
    const priceRaw = product.current_price != null ? product.current_price : product.price;
    const price = typeof priceRaw === 'number' ? priceRaw : (priceRaw ? parseFloat(priceRaw) : null);

    const pricePerKg = sizeGrams && price
        ? (price * 1000) / sizeGrams
        : null;

    return {
        // identity-ish attributes
        product_id: product.id,
        group_id: product.product_group_id || null,
        roastery,

        // origin
        country,
        continent,

        // processing
        process,
        roast,

        // flags
        organic,
        decaf,
        fairtrade,

        // size & price
        size_grams: sizeGrams,
        price_per_kg: pricePerKg
    };
}

/**
 * Try to infer size in grams from a normalized size string (e.g. "250g", "1kg").
 * Returns null if size cannot be determined.
 */
function inferSizeGrams(size) {
    if (!size) return null;

    const value = String(size).trim().toLowerCase();

    // Simple patterns like "250g", "1000g"
    const gramMatch = value.match(/(\d+)\s*g/);
    if (gramMatch) {
        const grams = parseInt(gramMatch[1], 10);
        return Number.isFinite(grams) ? grams : null;
    }

    // Patterns like "1kg", "2 kg"
    const kgMatch = value.match(/(\d+)\s*kg/);
    if (kgMatch) {
        const kg = parseInt(kgMatch[1], 10);
        return Number.isFinite(kg) ? kg * 1000 : null;
    }

    return null;
}

/**
 * Generic scoring function based on a preferences object.
 *
 * @param {Object} attrs - Normalized attributes from normalizeProductAttributes().
 * @param {Object} prefs - Preferences config (from config.preferences).
 * @returns {{ score: number, accepted: boolean, reasons: string[] }}
 */
function scoreProduct(attrs, prefs) {
    if (!attrs || !prefs || prefs.enabled === false) {
        return { score: 0, accepted: false, reasons: ['preferences_disabled'] };
    }

    const reasons = [];
    let score = 0;

    const dimensions = prefs.dimensions || {};
    const constraints = prefs.constraints || [];
    const minScore = typeof prefs.min_score === 'number' ? prefs.min_score : 0;

    // 1) Constraints: if any fails, product is rejected
    for (const constraint of constraints) {
        if (!constraint) continue;
        const when = constraint.when || {};
        const require = constraint.require || {};

        if (matchesAll(attrs, when) && !matchesAll(attrs, require)) {
            return { score: 0, accepted: false, reasons: ['constraint_failed'] };
        }
    }

    // 2) Sum dimension scores (can be positive or negative, generic)
    for (const [dimName, valueMap] of Object.entries(dimensions)) {
        const rawValue = attrs[dimName];
        if (rawValue === undefined || rawValue === null) continue;

        const key = String(rawValue).toLowerCase();
        const weight = valueMap.hasOwnProperty(key) ? valueMap[key] : 0;

        if (typeof weight === 'number' && weight !== 0) {
            score += weight;
            reasons.push(`${dimName}:${key}${weight >= 0 ? '+' : ''}${weight}`);
        }
    }

    const accepted = score >= minScore;
    return { score, accepted, reasons };
}

/**
 * Helper: check whether all fields in pattern match corresponding attrs values.
 */
function matchesAll(attrs, pattern) {
    if (!pattern) return true;
    const entries = Object.entries(pattern);
    if (entries.length === 0) return true;

    return entries.every(([key, expected]) => {
        const value = attrs[key];
        if (expected === undefined || expected === null) {
            return value === expected;
        }

        // Boolean comparison
        if (typeof expected === 'boolean') {
            return !!value === expected;
        }

        // Simple string/number equality (case-insensitive for strings)
        const vStr = value != null ? String(value).toLowerCase() : '';
        const eStr = String(expected).toLowerCase();
        return vStr === eStr;
    });
}

module.exports = {
    normalizeProductAttributes,
    scoreProduct
};

