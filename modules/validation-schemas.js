/**
 * VALIDATION SCHEMAS
 * Strict schema validation for all API inputs and outputs
 */

// Valid enums
const VALID_STOCK_UNITS = ['pcs', 'kg', 'g', 'L', 'ml'];
const VALID_PACK_UNITS = ['kg', 'g', 'L', 'ml', 'pcs'];
const VALID_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'UNCATEGORIZED'];
const VALID_MAPPING_METHODS = ['hard_rule', 'fuzzy_match', 'llm_batch_fallback', 'manual_override'];
const VALID_ONBOARDING_MODES = ['full', 'incremental'];
const VALID_SKU_STATUSES = ['active', 'deprecated', 'needs_review', 'merged'];

class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

class ValidationSchemas {
    /**
     * Validate onboarding request
     */
    static validateOnboardingRequest(request) {
        const errors = [];

        // Required fields
        if (!request.run_id) {
            errors.push({ field: 'run_id', message: 'run_id is required' });
        } else if (!this.isValidUUID(request.run_id)) {
            errors.push({ field: 'run_id', message: 'run_id must be a valid UUID' });
        }

        if (!request.store_id) {
            errors.push({ field: 'store_id', message: 'store_id is required' });
        } else if (typeof request.store_id !== 'string' || request.store_id.trim().length === 0) {
            errors.push({ field: 'store_id', message: 'store_id must be a non-empty string' });
        }

        if (!request.items || !Array.isArray(request.items)) {
            errors.push({ field: 'items', message: 'items must be an array' });
        } else if (request.items.length === 0) {
            errors.push({ field: 'items', message: 'items array cannot be empty' });
        } else if (request.items.length > 10000) {
            errors.push({ field: 'items', message: 'items array cannot exceed 10,000 items' });
        }

        // Optional fields with validation
        if (request.onboarding_mode && !VALID_ONBOARDING_MODES.includes(request.onboarding_mode)) {
            errors.push({
                field: 'onboarding_mode',
                message: `onboarding_mode must be one of: ${VALID_ONBOARDING_MODES.join(', ')}`
            });
        }

        // Validate each item
        if (request.items && Array.isArray(request.items)) {
            request.items.forEach((item, index) => {
                const itemErrors = this.validateInventoryItem(item, index);
                errors.push(...itemErrors);
            });
        }

        if (errors.length > 0) {
            const error = new ValidationError('Validation failed');
            error.errors = errors;
            throw error;
        }

        return true;
    }

    /**
     * Validate inventory item
     */
    static validateInventoryItem(item, index) {
        const errors = [];
        const prefix = `items[${index}]`;

        // Required fields
        if (!item.store_item_id) {
            errors.push({ field: `${prefix}.store_item_id`, message: 'store_item_id is required' });
        }

        if (!item.product_name) {
            errors.push({ field: `${prefix}.product_name`, message: 'product_name is required' });
        } else if (typeof item.product_name !== 'string' || item.product_name.trim().length === 0) {
            errors.push({ field: `${prefix}.product_name`, message: 'product_name must be a non-empty string' });
        }

        // Quantity validation
        if (item.quantity !== undefined && item.quantity !== null) {
            const qty = parseFloat(item.quantity);
            if (isNaN(qty)) {
                errors.push({ field: `${prefix}.quantity`, message: 'quantity must be a number' });
            } else if (qty < 0) {
                errors.push({ field: `${prefix}.quantity`, message: 'quantity cannot be negative' });
            } else if (qty > 1000000) {
                errors.push({ field: `${prefix}.quantity`, message: 'quantity exceeds maximum (1,000,000)' });
            }
        }

        // Price validation
        if (item.selling_price !== undefined && item.selling_price !== null) {
            const price = parseFloat(item.selling_price);
            if (isNaN(price)) {
                errors.push({ field: `${prefix}.selling_price`, message: 'selling_price must be a number' });
            } else if (price < 0) {
                errors.push({ field: `${prefix}.selling_price`, message: 'selling_price cannot be negative' });
            } else if (price > 10000000) {
                errors.push({ field: `${prefix}.selling_price`, message: 'selling_price exceeds maximum (10,000,000)' });
            }
        }

        return errors;
    }

    /**
     * Validate SKU identity record (before DB write)
     */
    static validateSKUIdentity(record) {
        const errors = [];

        // Required fields
        const requiredFields = [
            'store_item_id',
            'raw_product_name',
            'normalized_product_name',
            'stock_unit',
            'master_category_id',
            'category_path',
            'mapping_confidence',
            'mapping_confidence_score',
            'mapping_method',
            'catalog_version',
            'status'
        ];

        requiredFields.forEach(field => {
            if (record[field] === undefined || record[field] === null) {
                errors.push({ field, message: `${field} is required` });
            }
        });

        // Enum validations
        if (record.stock_unit && !VALID_STOCK_UNITS.includes(record.stock_unit)) {
            errors.push({
                field: 'stock_unit',
                message: `stock_unit must be one of: ${VALID_STOCK_UNITS.join(', ')}`
            });
        }

        if (record.pack_unit && !VALID_PACK_UNITS.includes(record.pack_unit)) {
            errors.push({
                field: 'pack_unit',
                message: `pack_unit must be one of: ${VALID_PACK_UNITS.join(', ')}`
            });
        }

        if (record.mapping_confidence && !VALID_CONFIDENCE_LEVELS.includes(record.mapping_confidence)) {
            errors.push({
                field: 'mapping_confidence',
                message: `mapping_confidence must be one of: ${VALID_CONFIDENCE_LEVELS.join(', ')}`
            });
        }

        if (record.mapping_method && !VALID_MAPPING_METHODS.includes(record.mapping_method)) {
            errors.push({
                field: 'mapping_method',
                message: `mapping_method must be one of: ${VALID_MAPPING_METHODS.join(', ')}`
            });
        }

        if (record.status && !VALID_SKU_STATUSES.includes(record.status)) {
            errors.push({
                field: 'status',
                message: `status must be one of: ${VALID_SKU_STATUSES.join(', ')}`
            });
        }

        // Range validations
        if (record.mapping_confidence_score !== undefined) {
            const score = parseFloat(record.mapping_confidence_score);
            if (isNaN(score) || score < 0 || score > 1) {
                errors.push({
                    field: 'mapping_confidence_score',
                    message: 'mapping_confidence_score must be between 0 and 1'
                });
            }
        }

        // Business rule: stock_unit compatibility
        if (record.stock_unit && record.pack_size === null) {
            const productName = (record.raw_product_name || '').toLowerCase();
            const isLoose = /\b(loose|bulk|unbranded)\b/.test(productName);

            if (isLoose && record.stock_unit === 'pcs') {
                errors.push({
                    field: 'stock_unit',
                    message: 'Loose items must have stock_unit of kg or L, not pcs'
                });
            }
        }

        if (errors.length > 0) {
            const error = new ValidationError('SKU Identity validation failed');
            error.errors = errors;
            throw error;
        }

        return true;
    }

    /**
     * Validate inventory state record
     */
    static validateInventoryState(record) {
        const errors = [];

        // Required fields
        if (!record.store_item_id) {
            errors.push({ field: 'store_item_id', message: 'store_item_id is required' });
        }

        if (record.quantity_on_hand === undefined || record.quantity_on_hand === null) {
            errors.push({ field: 'quantity_on_hand', message: 'quantity_on_hand is required' });
        } else {
            const qty = parseFloat(record.quantity_on_hand);
            if (isNaN(qty) || qty < 0) {
                errors.push({ field: 'quantity_on_hand', message: 'quantity_on_hand must be >= 0' });
            }
        }

        if (!record.as_of_timestamp) {
            errors.push({ field: 'as_of_timestamp', message: 'as_of_timestamp is required' });
        } else if (!this.isValidISO8601(record.as_of_timestamp)) {
            errors.push({ field: 'as_of_timestamp', message: 'as_of_timestamp must be valid ISO 8601 timestamp' });
        }

        if (!record.data_source) {
            errors.push({ field: 'data_source', message: 'data_source is required' });
        }

        if (errors.length > 0) {
            const error = new ValidationError('Inventory State validation failed');
            error.errors = errors;
            throw error;
        }

        return true;
    }

    /**
     * Validate UUID format
     */
    static isValidUUID(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    /**
     * Validate ISO 8601 timestamp
     */
    static isValidISO8601(timestamp) {
        const date = new Date(timestamp);
        return date instanceof Date && !isNaN(date.getTime());
    }

    /**
     * Sanitize text input
     */
    static sanitizeText(text) {
        if (typeof text !== 'string') return text;

        // Remove potentially dangerous characters
        return text
            .replace(/[<>]/g, '') // Remove HTML tags
            .replace(/[;'"]/g, '') // Remove SQL injection characters
            .trim();
    }
}

module.exports = {
    ValidationSchemas,
    ValidationError,
    VALID_STOCK_UNITS,
    VALID_PACK_UNITS,
    VALID_CONFIDENCE_LEVELS,
    VALID_MAPPING_METHODS,
    VALID_ONBOARDING_MODES,
    VALID_SKU_STATUSES
};
