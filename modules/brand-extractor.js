/**
 * BRAND EXTRACTOR MODULE (Updated for dynamic configuration)
 * Handles brand identification from product names
 */

class BrandExtractor {
    constructor(configLoader) {
        this.configLoader = configLoader;
        this.brandCache = new Map();
    }

    /**
     * Extract brand from product name
     */
    extract(productName) {
        if (!productName) return null;

        const cacheKey = productName.toLowerCase();
        if (this.brandCache.has(cacheKey)) {
            return this.brandCache.get(cacheKey);
        }

        let brand = this.dictionaryMatch(productName);
        if (!brand) {
            brand = this.patternMatch(productName);
        }

        if (brand) {
            this.brandCache.set(cacheKey, brand);
        }

        return brand;
    }

    /**
     * Dictionary-based brand matching using config
     * Uses word boundary matching to prevent 'hit' matching 'white'
     */
    dictionaryMatch(productName) {
        const knownBrands = this.configLoader.getBrands();
        const lower = productName.toLowerCase();

        // Sort by length (descending) to match longer brands first
        const sortedBrands = [...knownBrands].sort((a, b) => b.length - a.length);

        for (const brand of sortedBrands) {
            const brandLower = brand.toLowerCase();

            // Use word boundary matching for single-word brands
            // This prevents 'hit' from matching in 'white'
            if (!brandLower.includes(' ')) {
                const regex = new RegExp(`\\b${brandLower}\\b`, 'i');
                if (regex.test(lower)) {
                    return brand;
                }
            } else {
                // For multi-word brands, simple include is fine
                if (lower.includes(brandLower)) {
                    return brand;
                }
            }
        }

        return null;
    }

    /**
     * Pattern-based brand extraction
     * STRICT: Never infer adjectives or generic descriptors as brands
     */
    patternMatch(productName) {
        const tokens = productName.split(' ');
        if (tokens.length < 2) return null;

        const firstWord = tokens[0];
        const lowerFirst = firstWord.toLowerCase();

        // STRICT FILTER: List of adjectives/descriptors that are NOT brands
        const forbiddenAsBrand = [
            'brown', 'white', 'red', 'green', 'black', 'loose', 'fresh',
            'large', 'small', 'medium', 'pack', 'combo', 'free', 'sachet',
            'salted', 'plain', 'original', 'sweet', 'hot', 'cold'
        ];

        if (forbiddenAsBrand.includes(lowerFirst)) {
            return null;
        }

        // Only infer brand if it looks like an established proper noun
        // (starts with capital, not in dictionary, and not a descriptive word)
        if (this.isCapitalized(firstWord) && !this.isGenericWord(firstWord)) {
            // Further verification: length and alphanumeric pattern
            if (firstWord.length >= 3 && /^[A-Z][a-z]+$/.test(firstWord)) {
                return firstWord;
            }
        }

        return null;
    }

    /**
     * Check if word is capitalized
     */
    isCapitalized(word) {
        return word[0] === word[0].toUpperCase();
    }

    /**
     * Check if word is generic using config
     */
    isGenericWord(word) {
        const genericWords = this.configLoader.getGenericWords();
        return genericWords.includes(word.toLowerCase());
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.brandCache.clear();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BrandExtractor;
}
