/**
 * FIXED NORMALIZER - Enforces Master Catalog Default Units
 * 
 * Key Fixes:
 * 1. Uses default_unit from master catalog (after mapping)
 * 2. ASSUMED_UNIT only for truly ambiguous cases
 * 3. Sanity checks for unrealistic quantities
 * 4. Separate identity issues from data quality issues
 */

class Normalizer {
    constructor(config, languageTranslator, errorHandler) {
        this.config = config;
        this.languageTranslator = languageTranslator;
        this.errorHandler = errorHandler;

        // Unit normalization map
        this.unitMap = null;

        // Known default units for common categories (fallback)
        this.categoryDefaultUnits = {
            // L2 Level categories
            'L2_FRESH_VEGETABLES': 'kg',
            'L2_FRESH_FRUITS': 'kg',
            'L2_MILK': 'L',
            'L2_CURD_YOGURT': 'kg',
            'L2_PACKAGED_SNACKS': 'pcs',
            'L2_BEVERAGES_SOFT': 'L',
            'L2_EGGS': 'pcs',
            // L1 Level categories
            'L1_FRESH': 'kg',
            'L1_STAPLES': 'kg',
            'L1_PACKAGED': 'pcs',
            'L1_BEVERAGES': 'L',
            'L1_PHARMA': 'pcs',
            'L1_FROZEN': 'pcs',
            'L1_DURABLES': 'pcs',
            'L1_UNCATEGORIZED': 'pcs'
        };

        // Sanity check ranges (min/max realistic quantities)
        this.quantityRanges = {
            'kg': { min: 0.001, max: 1000, typical: 50 },
            'L': { min: 0.001, max: 500, typical: 20 },
            'pcs': { min: 1, max: 10000, typical: 100 },
            'g': { min: 1, max: 100000, typical: 500 },
            'ml': { min: 1, max: 50000, typical: 1000 }
        };
    }

    async initialize() {
        this.unitMap = this.config.get('unit_normalization_map') || {
            'kg': 'kg', 'kgs': 'kg', 'kilogram': 'kg',
            'g': 'g', 'gm': 'g', 'gram': 'g',
            'l': 'L', 'ltr': 'L', 'litre': 'L', 'liter': 'L',
            'ml': 'ml', 'milliliter': 'ml',
            'pcs': 'pcs', 'pc': 'pcs', 'piece': 'pcs', 'pieces': 'pcs'
        };
    }

    /**
     * Normalize multiple items
     */
    normalizeItems(items) {
        return items.map(item => this.normalize(item));
    }

    /**
     * Normalize a single item
     * NOW ACCEPTS categoryId to enforce default units
     */
    normalize(item, categoryId = null) {
        const result = {
            product_name_original: item.product_name || item.product_name_original,
            product_name_normalized: '',
            quantity: null,
            unit: null,
            selling_price: null,
            cost_price: null,
            embedded_quantity: null,
            embedded_unit: null,
            mrp_hint: null,
            unit_assumed: false,
            flags: [],
            validation_issues: []  // Separate from identity flags
        };

        // 1. Clean and normalize product name
        result.product_name_normalized = this.cleanProductName(item.product_name || item.product_name_original);

        // 2. Extract embedded quantity and unit from name
        const extracted = this.extractQuantityAndUnit(result.product_name_normalized);
        if (extracted) {
            result.embedded_quantity = extracted.quantity;
            result.embedded_unit = extracted.unit;
            result.product_name_normalized = extracted.cleanName;
        }

        // 3. Normalize quantity
        const quantityResult = this.normalizeQuantity(
            item.quantity || item.quantity_on_hand,
            item.unit,
            result.embedded_unit,
            categoryId  // Pass category to get default unit
        );

        result.quantity = quantityResult.quantity;
        result.unit = quantityResult.unit;
        result.pack_size = result.embedded_quantity || quantityResult.pack_size;  // Size from product name
        result.pack_unit = result.embedded_unit || quantityResult.pack_unit;       // Unit from product name
        result.unit_assumed = quantityResult.assumed;

        // Only flag if truly ambiguous (not if we used catalog default)
        if (quantityResult.assumed && !categoryId) {
            result.flags.push('ASSUMED_UNIT');
        }

        // 4. Sanity check quantity
        const sanityCheck = this.checkQuantitySanity(result.quantity, result.unit);
        if (!sanityCheck.valid) {
            result.validation_issues.push({
                type: 'UNREALISTIC_QUANTITY',
                message: sanityCheck.message,
                severity: 'warning'
            });
        }

        // 5. Normalize prices (validation issues, not identity issues)
        result.selling_price = this.normalizePrice(item.selling_price || item.price);
        result.cost_price = this.normalizePrice(item.cost_price);

        // Price validation (separate from identity)
        if (!result.selling_price) {
            result.validation_issues.push({
                type: 'MISSING_SELLING_PRICE',
                message: 'Selling price not provided',
                severity: 'info'
            });
        }

        if (!result.cost_price) {
            result.validation_issues.push({
                type: 'MISSING_COST_PRICE',
                message: 'Cost price not provided - profit margin cannot be calculated',
                severity: 'info'
            });
        }

        // Extract MRP hint from name
        result.mrp_hint = this.extractMRPHint(result.product_name_normalized);

        // Merge with original item data (preserve all original fields)
        return {
            ...item,  // Original item data
            ...result  // Normalized fields (will override if same key)
        };
    }

    /**
     * Clean product name
     * Enforces strict normalization: lowercase, punctuation-free, trimmed
     */
    cleanProductName(name) {
        if (!name) return '';

        // Ensure name is a string
        let cleaned = String(name).trim();

        // Regional language support
        if (this.languageTranslator) {
            const translated = this.languageTranslator.processProductName(cleaned);
            cleaned = translated && translated.translated ? String(translated.translated) : cleaned;
        }

        // 1. Force lowercase
        cleaned = cleaned.toLowerCase();

        // 2. Remove punctuation (keep only alphanumeric and spaces)
        cleaned = cleaned.replace(/[^\w\s]/g, '');

        // 3. Remove extra spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        // 4. Remove common noise words
        const genericWords = this.config.get('generic_words') || [];
        genericWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            cleaned = cleaned.replace(regex, '');
        });

        // Final trim
        return cleaned.trim().replace(/\s+/g, ' ');
    }

    /**
     * Extract quantity and unit from product name
     */
    extractQuantityAndUnit(name) {
        if (!name) return null;

        const nameStr = String(name);

        // Get pattern from config or use fallback
        const pattern = this.config.getPattern('unit_extraction') || /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|gm|ltr|pcs?|pkt|pack)/i;
        const patterns = [pattern];

        for (const regex of patterns) {
            const match = nameStr.match(regex);

            if (match) {
                const quantity = parseFloat(match[1]);
                const unit = this.normalizeUnitString(match[2]);

                // Remove the matched part from name
                const cleanName = nameStr.replace(match[0], '').trim().replace(/\s+/g, ' ');

                return { quantity, unit, cleanName };
            }
        }

        return null;
    }

    /**
     * FIXED: Normalize quantity with correct pack size vs stock count handling
     * 
     * IMPORTANT DISTINCTION:
     * - "Quantity" field from input = STOCK COUNT (number of items in inventory)
     * - "Unit" embedded in name (e.g., "1kg", "500ml") = PACK SIZE (size per item)
     * 
     * Example: "Aashirvaad Atta 5kg" with quantity=12
     *   - Stock Count: 12 pcs (12 packets)
     *   - Pack Size: 5kg (each packet is 5kg)
     *   - Total Inventory Weight: 60kg (but we track by count!)
     */
    normalizeQuantity(rawQuantity, rawUnit, embeddedUnit, categoryId) {
        let stockCount = null;   // Number of items in inventory
        let stockUnit = 'pcs';   // Unit for stock count (always pcs for packaged goods)
        let packSize = null;     // Size per item (extracted from name)
        let packUnit = null;     // Unit of pack size
        let assumed = false;

        // Parse stock count (this is ALWAYS a count of items)
        if (rawQuantity !== null && rawQuantity !== undefined) {
            stockCount = parseFloat(rawQuantity);
            if (isNaN(stockCount) || stockCount <= 0) {
                stockCount = 1;
                assumed = true;
            }
        } else {
            stockCount = 1;
            assumed = true;
        }

        // If unit is embedded in product name, it's the PACK SIZE, not stock unit
        if (embeddedUnit) {
            // Store pack size information
            packUnit = embeddedUnit;
            // For packaged items with embedded units, stock is counted in pcs
            stockUnit = 'pcs';
            assumed = false;
        } else if (rawUnit) {
            // Explicit unit provided - check if it's a weight/volume (pack size) or count
            const normalizedUnit = this.normalizeUnitString(rawUnit);
            if (['kg', 'g', 'L', 'ml'].includes(normalizedUnit)) {
                // This is likely pack size, not stock count
                packUnit = normalizedUnit;
                stockUnit = 'pcs';
            } else {
                stockUnit = normalizedUnit;
            }
            assumed = false;
        } else if (categoryId) {
            // Use category default for items without embedded units
            // Fresh vegetables, fruits are sold by weight (the quantity IS the weight)
            const freshCategories = ['L2_FRESH_VEGETABLES', 'L2_FRESH_FRUITS', 'L1_FRESH'];
            if (freshCategories.includes(categoryId)) {
                stockUnit = this.categoryDefaultUnits[categoryId] || 'kg';
                // For fresh items, quantity is the actual weight/count
            } else {
                stockUnit = 'pcs';
            }
            assumed = false;
        } else {
            // CRITICAL FIX: Detect loose/bulk commodities
            // Check product name for indicators of weight-based selling
            const productNameForCheck = (rawQuantity?.toString() || '').toLowerCase();
            const isLooseCommodity = /\b(loose|bulk|unbranded)\b/i.test(productNameForCheck);

            // Fallback: pcs for packaged, kg for loose
            stockUnit = isLooseCommodity ? 'kg' : 'pcs';
            assumed = true;
        }

        // For fresh produce without embedded units, don't convert (25 pcs of potato is fine)
        // For packaged items with embedded units, keep as pcs (12 pcs of 5kg atta is correct)

        return {
            quantity: stockCount,
            unit: stockUnit,
            pack_size: packSize,
            pack_unit: packUnit,
            assumed: assumed
        };
    }

    /**
     * Normalize unit string
     */
    normalizeUnitString(unitStr) {
        if (!unitStr) return 'pcs';

        const normalized = unitStr.toLowerCase().trim();
        if (!this.unitMap) return normalized;
        return this.unitMap[normalized] || normalized;
    }

    /**
     * Convert to standard units
     */
    convertToStandardUnit(quantity, unit) {
        const conversions = {
            'g': { target: 'kg', factor: 0.001 },
            'gm': { target: 'kg', factor: 0.001 },
            'gram': { target: 'kg', factor: 0.001 },
            'ml': { target: 'L', factor: 0.001 },
            'ltr': { target: 'L', factor: 1 },
            'litre': { target: 'L', factor: 1 },
            'liter': { target: 'L', factor: 1 }
        };

        const conversion = conversions[unit];
        if (conversion) {
            return {
                quantity: quantity * conversion.factor,
                unit: conversion.target
            };
        }

        return { quantity, unit };
    }

    /**
     * FIXED: Sanity check for unrealistic quantities
     */
    checkQuantitySanity(quantity, unit) {
        const range = this.quantityRanges[unit];
        if (!range) {
            return { valid: true };  // Unknown unit, can't validate
        }

        if (quantity < range.min) {
            return {
                valid: false,
                message: `Quantity ${quantity} ${unit} is too small (min: ${range.min})`
            };
        }

        if (quantity > range.max) {
            return {
                valid: false,
                message: `Quantity ${quantity} ${unit} is too large (max: ${range.max})`
            };
        }

        // Warn if unusual but not invalid
        if (quantity > range.typical * 2) {
            return {
                valid: true,
                message: `Quantity ${quantity} ${unit} is unusually high`,
                warning: true
            };
        }

        return { valid: true };
    }

    /**
     * Normalize price
     */
    normalizePrice(rawPrice) {
        if (rawPrice === null || rawPrice === undefined || rawPrice === '') {
            return null;
        }

        // Remove currency symbols and parse
        const cleaned = String(rawPrice).replace(/[₹Rs,\s]/g, '');
        const price = parseFloat(cleaned);

        return (isNaN(price) || price < 0) ? null : price;
    }

    /**
     * Extract MRP hint from product name
     */
    extractMRPHint(name) {
        if (!name) return null;
        const mrpPattern = /mrp[:\s]*₹?(\d+)/i;
        const match = String(name).match(mrpPattern);
        return match ? parseFloat(match[1]) : null;
    }
}

// Export for use in orchestrator
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Normalizer;
}
