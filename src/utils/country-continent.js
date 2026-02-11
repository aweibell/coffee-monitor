/**
 * Simple mapping from normalized country name (lowercase) to continent (lowercase).
 * This is intentionally minimal and can be expanded over time.
 *
 * The goal is to support preference dimensions like "continent" without
 * hard-coding any logic in the scoring engine.
 */
const COUNTRY_TO_CONTINENT = {
    // Africa
    ethiopia: 'africa',
    kenya: 'africa',
    rwanda: 'africa',
    burundi: 'africa',
    uganda: 'africa',
    tanzania: 'africa',
    malawi: 'africa',
    'democratic republic of the congo': 'africa',
    congo: 'africa',
    'ivory coast': 'africa',
    'côte d\'ivoire': 'africa',

    // Central / South America
    colombia: 'south_america',
    brazil: 'south_america',
    brasil: 'south_america',
    peru: 'south_america',
    guatemala: 'central_america',
    honduras: 'central_america',
    'el salvador': 'central_america',
    nicaragua: 'central_america',
    panama: 'central_america',
    costa_rica: 'central_america',
    'costa rica': 'central_america',
    ecuador: 'south_america',
    bolivia: 'south_america',

    // Asia
    india: 'asia',
    'papua new guinea': 'oceania',
    indonesia: 'asia',
    sumatra: 'asia',
    java: 'asia',
    yemen: 'asia',

    // Other / islands
    'jamaica': 'caribbean'
};

/**
 * Normalize a raw country string to a canonical key.
 */
function normalizeCountry(rawCountry) {
    if (!rawCountry) return null;
    return String(rawCountry).trim().toLowerCase();
}

/**
 * Look up continent for a given raw country string.
 * Returns null if unknown.
 */
function getContinentForCountry(rawCountry) {
    const key = normalizeCountry(rawCountry);
    if (!key) return null;

    // Handle common spacing variants
    const direct = COUNTRY_TO_CONTINENT[key];
    if (direct) return direct;

    // Fallback: replace spaces with underscores for keys like "costa_rica"
    const underscored = COUNTRY_TO_CONTINENT[key.replace(/\s+/g, '_')];
    return underscored || null;
}

module.exports = {
    COUNTRY_TO_CONTINENT,
    normalizeCountry,
    getContinentForCountry
};

