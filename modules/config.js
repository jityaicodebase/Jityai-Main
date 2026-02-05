/**
 * CONFIGURATION LOADER
 * Dynamically loads all configuration from external JSON files
 */

class ConfigLoader {
    constructor() {
        this.config = null;
        this.classificationRules = null;
        this.masterCatalog = null;
    }

    /**
     * Load all configuration files
     */
    async loadAll() {
        try {
            // Check if running in Node.js
            const isNode = typeof window === 'undefined';

            if (isNode) {
                // Node.js environment - use fs
                const fs = require('fs');
                const path = require('path');

                this.config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/onboarding-config.json'), 'utf8'));
                this.classificationRules = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/classification-rules.json'), 'utf8'));
                this.masterCatalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../cateloge.json'), 'utf8'));
            } else {
                // Browser environment - use fetch
                const configResponse = await fetch('config/onboarding-config.json');
                this.config = await configResponse.json();

                const rulesResponse = await fetch('config/classification-rules.json');
                this.classificationRules = await rulesResponse.json();

                const catalogResponse = await fetch('cateloge.json');
                this.masterCatalog = await catalogResponse.json();
            }

            console.log('✓ All configurations loaded');
            return true;
        } catch (error) {
            console.error('Failed to load configuration:', error);
            throw error;
        }
    }

    /**
     * Get configuration value by path
     */
    get(path) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }

        return value;
    }

    /**
     * Get all known brands
     */
    getBrands() {
        return this.get('brands.known_brands') || [];
    }

    /**
     * Get generic words
     */
    getGenericWords() {
        return this.get('brands.generic_words') || [];
    }

    /**
     * Get unit normalization map
     */
    getUnitMap() {
        return this.get('units.normalization_map') || {};
    }

    /**
     * Get default unit
     */
    getDefaultUnit() {
        return this.get('units.default_unit') || 'pcs';
    }

    /**
     * Get column detection keywords
     */
    getColumnKeywords() {
        return this.get('column_detection') || {};
    }

    /**
     * Get confidence thresholds
     */
    getConfidenceThresholds() {
        return this.get('confidence_thresholds') || { high: 0.85, medium: 0.65, low: 0.45 };
    }

    /**
     * Get quality scoring weights
     */
    getQualityWeights() {
        return this.get('quality_scoring.weights') || { completeness: 0.25, mappability: 0.50, consistency: 0.25 };
    }

    /**
     * Get quality grade thresholds
     */
    getGradeThresholds() {
        return this.get('quality_scoring.grades') || { excellent: 85, good: 70, fair: 55, poor: 40 };
    }

    /**
     * Get validation rules
     */
    getValidationRules() {
        return this.get('validation_rules') || {};
    }

    /**
     * Get recommendation thresholds
     */
    getRecommendationThresholds() {
        return this.get('recommendations') || {};
    }

    /**
     * Get classification rules sorted by priority
     */
    getClassificationRules() {
        if (!this.classificationRules) return [];

        return [...this.classificationRules.classification_rules].sort((a, b) => a.priority - b.priority);
    }

    /**
     * Get fallback category
     */
    getFallbackCategory() {
        return this.classificationRules?.fallback_category || {
            category_id: 'L1_STAPLES',
            confidence: 0.35,
            analytics_mode: 'category_aggregate'
        };
    }

    /**
     * Get master catalog
     */
    getMasterCatalog() {
        return this.masterCatalog;
    }

    /**
     * Get pattern by name
     */
    getPattern(name) {
        const patternStr = this.get(`patterns.${name}`);
        if (!patternStr) return null;

        // Parse pattern string to RegExp
        const match = patternStr.match(/^\/(.+)\/([gimuy]*)$/);
        if (match) {
            return new RegExp(match[1], match[2]);
        }
        return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConfigLoader;
}
