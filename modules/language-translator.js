/**
 * LANGUAGE TRANSLATOR MODULE
 * Handles transliteration and translation of regional languages
 * Supports Hindi, Tamil, and other Indian languages
 */

class LanguageTranslator {
    constructor(configLoader) {
        this.configLoader = configLoader;
        this.transliterationMap = this.buildTransliterationMap();
    }

    /**
     * Build transliteration map for common Indian language words
     */
    buildTransliterationMap() {
        return {
            // Hindi to English (common retail terms)
            'दूध': 'doodh',
            'दही': 'dahi',
            'आलू': 'aloo',
            'प्याज': 'pyaz',
            'टमाटर': 'tamatar',
            'चावल': 'chawal',
            'गेहूं': 'gehun',
            'आटा': 'atta',
            'तेल': 'tel',
            'नमक': 'namak',
            'चीनी': 'chini',
            'अंडा': 'anda',
            'सेब': 'seb',
            'केला': 'kela',
            'संतरा': 'santra',
            'आम': 'aam',
            'अंगूर': 'angoor',
            'तरबूज': 'tarbooz',
            'अमरूद': 'amrud',
            'अनार': 'anar',
            'गाजर': 'gajar',
            'मटर': 'matar',
            'पालक': 'palak',
            'गोभी': 'gobi',

            // Common transliterations (PRESERVE product nouns, only translate for understanding)
            // CRITICAL: Do NOT translate product-specific terms like 'atta', 'dal', 'poha'
            // These are retail categories, not generic words
            'doodh': 'milk',
            'dahi': 'curd',
            'aloo': 'potato',
            'pyaz': 'onion',
            'tamatar': 'tomato',
            'chawal': 'rice',
            'gehun': 'wheat',
            // 'atta': 'flour',  // REMOVED - 'atta' is a specific product category
            'tel': 'oil',
            'namak': 'salt',
            'chini': 'sugar',
            'anda': 'egg',
            'seb': 'apple',
            'kela': 'banana',
            'santra': 'orange',
            'aam': 'mango',
            'angoor': 'grape'
        };
    }

    /**
     * Detect if text contains non-Latin characters
     */
    hasNonLatinScript(text) {
        // Check for Devanagari (Hindi)
        const devanagariPattern = /[\u0900-\u097F]/;
        // Check for Tamil
        const tamilPattern = /[\u0B80-\u0BFF]/;
        // Check for other Indian scripts
        const indianScriptPattern = /[\u0900-\u0DFF]/;

        return devanagariPattern.test(text) ||
            tamilPattern.test(text) ||
            indianScriptPattern.test(text);
    }

    /**
     * Transliterate text to English
     */
    transliterate(text) {
        if (!text) return text;

        let result = text;

        // Replace known words
        for (const [original, transliterated] of Object.entries(this.transliterationMap)) {
            const regex = new RegExp(original, 'gi');
            result = result.replace(regex, transliterated);
        }

        return result;
    }

    /**
     * Translate common retail terms
     */
    translate(text) {
        if (!text) return text;

        let result = text.toLowerCase();

        // First transliterate
        result = this.transliterate(result);

        // Then translate to English
        for (const [hindiTerm, englishTerm] of Object.entries(this.transliterationMap)) {
            if (result.includes(hindiTerm)) {
                result = result.replace(new RegExp(hindiTerm, 'gi'), englishTerm);
            }
        }

        return result;
    }

    /**
     * Process product name with regional language support
     */
    processProductName(productName) {
        if (!productName) return { original: '', transliterated: '', translated: '' };

        const hasNonLatin = this.hasNonLatinScript(productName);

        return {
            original: productName,
            transliterated: hasNonLatin ? this.transliterate(productName) : productName,
            translated: this.translate(productName),
            hasNonLatin: hasNonLatin
        };
    }

    /**
     * Add custom transliteration
     */
    addTransliteration(original, transliterated) {
        this.transliterationMap[original] = transliterated;
    }

    /**
     * Get all supported terms
     */
    getSupportedTerms() {
        return Object.keys(this.transliterationMap);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LanguageTranslator;
}
