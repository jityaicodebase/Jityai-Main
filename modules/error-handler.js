/**
 * ERROR HANDLER MODULE
 * Centralized error handling with recovery strategies
 */

class ErrorHandler {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Handle file parsing errors
     */
    handleParseError(error, file) {
        const errorInfo = {
            type: 'PARSE_ERROR',
            severity: 'HIGH',
            message: error.message,
            file: file?.name,
            timestamp: new Date().toISOString(),
            recovery: this.getParseRecovery(error)
        };

        this.errors.push(errorInfo);
        return errorInfo;
    }

    /**
     * Get recovery strategy for parse errors
     */
    getParseRecovery(error) {
        if (error.message.includes('product name column')) {
            return {
                action: 'MANUAL_COLUMN_MAPPING',
                message: 'Please manually select the product name column',
                userAction: true
            };
        }

        if (error.message.includes('Empty')) {
            return {
                action: 'FILE_VALIDATION',
                message: 'File appears to be empty. Please check the file and try again',
                userAction: true
            };
        }

        if (error.message.includes('Excel')) {
            return {
                action: 'CONVERT_TO_CSV',
                message: 'Please convert Excel file to CSV format or include SheetJS library',
                userAction: true
            };
        }

        return {
            action: 'RETRY',
            message: 'Please try uploading the file again',
            userAction: true
        };
    }

    /**
     * Handle normalization warnings
     */
    handleNormalizationWarning(item, issue) {
        const warning = {
            type: 'NORMALIZATION_WARNING',
            severity: 'MEDIUM',
            item: item.product_name_original,
            issue: issue,
            timestamp: new Date().toISOString()
        };

        this.warnings.push(warning);
        return warning;
    }

    /**
     * Handle mapping failures
     */
    handleMappingFailure(item, reason) {
        const error = {
            type: 'MAPPING_FAILURE',
            severity: 'MEDIUM',
            item: item.product_name_normalized,
            reason: reason,
            timestamp: new Date().toISOString(),
            recovery: {
                action: 'CATEGORY_FALLBACK',
                message: 'Item will be mapped to category level only'
            }
        };

        this.errors.push(error);
        return error;
    }

    /**
     * Handle mass failures (>50% items failed)
     */
    handleMassFailure(stats) {
        const failureRate = (stats.failed / stats.totalItems) * 100;

        if (failureRate > 50) {
            const error = {
                type: 'MASS_FAILURE',
                severity: 'CRITICAL',
                message: `${failureRate.toFixed(1)}% of items failed to map`,
                stats: stats,
                timestamp: new Date().toISOString(),
                recovery: {
                    action: 'CATALOG_EXPANSION',
                    message: 'Master catalog may need expansion for this store type',
                    adminAction: true
                }
            };

            this.errors.push(error);
            return error;
        }

        return null;
    }

    /**
     * Handle duplicate detection
     */
    handleDuplicates(duplicates) {
        duplicates.forEach(group => {
            const warning = {
                type: 'DUPLICATE_ITEMS',
                severity: 'MEDIUM',
                items: group.map(item => item.canonical_store_code),
                timestamp: new Date().toISOString(),
                recovery: {
                    action: 'AUTO_MERGE',
                    message: 'Duplicates will be automatically merged'
                }
            };

            this.warnings.push(warning);
        });
    }

    /**
     * Handle price anomalies
     */
    handlePriceAnomaly(item, anomalyType) {
        const warning = {
            type: 'PRICE_ANOMALY',
            severity: 'HIGH',
            item: item.product_name_original,
            anomalyType: anomalyType,
            sellingPrice: item.selling_price,
            costPrice: item.cost_price,
            timestamp: new Date().toISOString(),
            recovery: {
                action: 'FLAG_FOR_REVIEW',
                message: 'Item flagged for manual review'
            }
        };

        this.warnings.push(warning);
        return warning;
    }

    /**
     * Get all errors
     */
    getErrors() {
        return this.errors;
    }

    /**
     * Get all warnings
     */
    getWarnings() {
        return this.warnings;
    }

    /**
     * Get critical errors only
     */
    getCriticalErrors() {
        return this.errors.filter(e => e.severity === 'CRITICAL');
    }

    /**
     * Check if there are blocking errors
     */
    hasBlockingErrors() {
        return this.errors.some(e => e.severity === 'CRITICAL' && !e.recovery);
    }

    /**
     * Generate error report
     */
    generateReport() {
        return {
            summary: {
                totalErrors: this.errors.length,
                totalWarnings: this.warnings.length,
                criticalErrors: this.getCriticalErrors().length,
                hasBlockingErrors: this.hasBlockingErrors()
            },
            errors: this.errors,
            warnings: this.warnings,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Clear all errors and warnings
     */
    clear() {
        this.errors = [];
        this.warnings = [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}
