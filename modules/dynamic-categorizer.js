/**
 * DYNAMIC CATEGORIZER
 * Pattern-based product categorization that's self-learning and extensible
 * Uses keyword patterns, brand hints, and fuzzy matching
 */

class DynamicCategorizer {
    constructor(configLoader) {
        this.configLoader = configLoader;
        this.patterns = null;
        this.categoryIndex = new Map();
        this.brandIndex = new Map();
        this.keywordIndex = new Map();
        this.stats = {
            totalCategorized: 0,
            byMethod: {
                keyword_exact: 0,
                keyword_partial: 0,
                brand_hint: 0,
                pattern_match: 0,
                fuzzy_match: 0,
                fallback: 0
            }
        };
    }

    /**
     * Initialize with pattern configuration
     */
    async initialize() {
        // Try to load dynamic patterns
        try {
            const isNode = typeof window === 'undefined';
            let patternsData;

            if (isNode) {
                const fs = require('fs');
                const path = require('path');
                patternsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/dynamic-categorization.json'), 'utf8'));
            } else {
                const response = await fetch('config/dynamic-categorization.json');
                patternsData = await response.json();
            }

            this.patterns = patternsData.category_patterns || [];
            this.unitPatterns = patternsData.unit_patterns || [];

            // Build indexes for fast lookup
            this.buildIndexes();

            console.log(`✓ Dynamic categorizer loaded: ${this.patterns.length} category patterns, ${this.keywordIndex.size} keywords`);
        } catch (error) {
            console.warn('Failed to load dynamic categorization patterns:', error.message);
            this.patterns = [];
        }
    }

    /**
     * Build keyword and brand indexes for fast lookup
     */
    buildIndexes() {
        this.patterns.forEach(category => {
            // Index category
            this.categoryIndex.set(category.category_id, {
                name: category.category_name,
                defaultUnit: category.default_unit
            });

            // Index patterns
            (category.patterns || []).forEach(pattern => {
                (pattern.matches || []).forEach(match => {
                    const key = match.toLowerCase();

                    if (pattern.type === 'keyword') {
                        if (!this.keywordIndex.has(key)) {
                            this.keywordIndex.set(key, []);
                        }
                        this.keywordIndex.get(key).push({
                            categoryId: category.category_id,
                            categoryName: category.category_name,
                            confidence: pattern.confidence,
                            defaultUnit: category.default_unit
                        });
                    } else if (pattern.type === 'brand') {
                        if (!this.brandIndex.has(key)) {
                            this.brandIndex.set(key, []);
                        }
                        this.brandIndex.get(key).push({
                            categoryId: category.category_id,
                            categoryName: category.category_name,
                            confidence: pattern.confidence,
                            defaultUnit: category.default_unit
                        });
                    }
                });
            });
        });
    }

    /**
     * Categorize a product based on its name and other attributes
     */
    categorize(productName, brand = null) {
        const name = (productName || '').toLowerCase().trim();
        const brandLower = (brand || '').toLowerCase().trim();

        let result = null;

        // Method 1: Exact keyword match (highest confidence)
        result = this.findExactKeywordMatch(name);
        if (result && result.confidence >= 0.90) {
            this.stats.byMethod.keyword_exact++;
            return this.formatResult(result, 'keyword_exact');
        }

        // Method 2: Partial keyword match
        result = this.findPartialKeywordMatch(name);
        if (result && result.confidence >= 0.85) {
            this.stats.byMethod.keyword_partial++;
            return this.formatResult(result, 'keyword_partial');
        }

        // Method 3: Brand-based categorization
        if (brandLower) {
            result = this.findBrandMatch(brandLower);
            if (result) {
                this.stats.byMethod.brand_hint++;
                return this.formatResult(result, 'brand_hint');
            }
        }

        // Method 4: Extract brand from product name and match
        const extractedBrand = this.extractBrandFromName(name);
        if (extractedBrand) {
            result = this.findBrandMatch(extractedBrand);
            if (result) {
                this.stats.byMethod.brand_hint++;
                return this.formatResult(result, 'brand_hint_extracted');
            }
        }

        // Method 5: Partial keyword match with lower threshold
        if (result && result.confidence >= 0.70) {
            this.stats.byMethod.keyword_partial++;
            return this.formatResult(result, 'keyword_partial');
        }

        // Method 6: Fallback to uncategorized
        this.stats.byMethod.fallback++;
        return {
            category_id: 'L1_UNCATEGORIZED',
            category_name: 'Uncategorized',
            confidence: 0.30,
            method: 'fallback',
            default_unit: 'pcs'
        };
    }

    /**
     * Find exact keyword match in product name
     */
    findExactKeywordMatch(name) {
        let bestMatch = null;

        // Check each keyword in our index
        for (const [keyword, categories] of this.keywordIndex) {
            // Check if keyword is a complete word in the name
            const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
            if (regex.test(name)) {
                const category = categories[0]; // Take first (highest priority)
                if (!bestMatch || category.confidence > bestMatch.confidence) {
                    bestMatch = { ...category };
                }
            }
        }

        return bestMatch;
    }

    /**
     * Find partial keyword match (keyword appears anywhere)
     */
    findPartialKeywordMatch(name) {
        let bestMatch = null;

        for (const [keyword, categories] of this.keywordIndex) {
            if (name.includes(keyword)) {
                const category = categories[0];
                // Reduce confidence for partial matches
                const adjustedConfidence = category.confidence * 0.9;
                if (!bestMatch || adjustedConfidence > bestMatch.confidence) {
                    bestMatch = { ...category, confidence: adjustedConfidence };
                }
            }
        }

        return bestMatch;
    }

    /**
     * Find brand-based category match
     */
    findBrandMatch(brand) {
        // Direct brand match
        if (this.brandIndex.has(brand)) {
            const categories = this.brandIndex.get(brand);
            return { ...categories[0] };
        }

        // Partial brand match
        for (const [indexedBrand, categories] of this.brandIndex) {
            if (brand.includes(indexedBrand) || indexedBrand.includes(brand)) {
                return { ...categories[0], confidence: categories[0].confidence * 0.85 };
            }
        }

        return null;
    }

    /**
     * Extract brand from product name (first capitalized word or known pattern)
     */
    extractBrandFromName(name) {
        // Common brand patterns
        const knownBrands = [
            'tata', 'amul', 'britannia', 'nestle', 'parle', 'fortune', 'dabur',
            'hindustan', 'itc', 'colgate', 'himalaya', 'patanjali', 'mother dairy',
            'pepsico', 'coca cola', 'haldiram', 'mdh', 'everest', 'catch',
            'kissan', 'maggi', 'knorr', 'sunfeast', 'cadbury', 'ferrero',
            'dove', 'lux', 'dettol', 'lifebuoy', 'surf excel', 'ariel', 'tide',
            'head & shoulders', 'pantene', 'garnier', 'loreal', 'nivea',
            'johnson', 'pampers', 'huggies', 'pedigree', 'whiskas',
            'vadilal', 'kwality walls', 'havmor', 'mccain', 'safal'
        ];

        for (const brand of knownBrands) {
            if (name.includes(brand)) {
                return brand;
            }
        }

        return null;
    }

    /**
     * Format result consistently
     */
    formatResult(match, method) {
        this.stats.totalCategorized++;
        return {
            category_id: match.categoryId,
            category_name: match.categoryName,
            confidence: match.confidence,
            method: method,
            default_unit: match.defaultUnit || 'pcs'
        };
    }

    /**
     * Get default unit for a category
     */
    getDefaultUnit(categoryId) {
        const category = this.categoryIndex.get(categoryId);
        return category ? category.defaultUnit : 'pcs';
    }

    /**
     * Get category name
     */
    getCategoryName(categoryId) {
        const category = this.categoryIndex.get(categoryId);
        return category ? category.name : 'Unknown';
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get categorization statistics
     */
    getStats() {
        return {
            ...this.stats,
            accuracy: this.stats.totalCategorized > 0
                ? ((this.stats.totalCategorized - this.stats.byMethod.fallback) / this.stats.totalCategorized * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }

    /**
     * Add new pattern dynamically (for learning)
     */
    addPattern(categoryId, type, match, confidence = 0.85) {
        const key = match.toLowerCase();

        const category = this.categoryIndex.get(categoryId);
        if (!category) {
            console.warn(`Unknown category: ${categoryId}`);
            return false;
        }

        const entry = {
            categoryId: categoryId,
            categoryName: category.name,
            confidence: confidence,
            defaultUnit: category.defaultUnit
        };

        if (type === 'keyword') {
            if (!this.keywordIndex.has(key)) {
                this.keywordIndex.set(key, []);
            }
            this.keywordIndex.get(key).push(entry);
        } else if (type === 'brand') {
            if (!this.brandIndex.has(key)) {
                this.brandIndex.set(key, []);
            }
            this.brandIndex.get(key).push(entry);
        }

        return true;
    }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DynamicCategorizer;
}
