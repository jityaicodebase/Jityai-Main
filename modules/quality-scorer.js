/**
 * FIXED QUALITY SCORER - Separates Identity Confidence from Data Quality
 * 
 * Key Fixes:
 * 1. Mapping confidence is ONLY about identity (category, brand, name)
 * 2. Missing price does NOT reduce mapping confidence
 * 3. Multi-factor confidence scoring with clear formula
 * 4. Separate data quality score from identity confidence
 * 5. Reduced noise in user-facing flags
 */

class QualityScorer {
    constructor(config) {
        this.config = config;
        this.weights = null;
        this.gradeThresholds = null;
    }

    async initialize() {
        const scoringConfig = this.config.get('quality_scoring') || {};

        // Set weights with fallback
        this.weights = scoringConfig.weights || {
            completeness: 0.25,
            mappability: 0.50,
            consistency: 0.25
        };

        // Set grade thresholds with fallback (note: config uses 'grades', not 'grade_thresholds')
        this.gradeThresholds = scoringConfig.grades || scoringConfig.grade_thresholds || {
            excellent: 85,
            good: 70,
            fair: 55,
            poor: 40
        };
    }

    /**
     * Score all items and generate quality report
     */
    scoreItems(items) {
        const itemScores = items.map(item => this.scoreItem(item));

        const metrics = this.calculateMetrics(itemScores);
        const overall = this.calculateOverallScore(metrics);
        const grade = this.assignGrade(overall);
        const recommendations = this.generateRecommendations(metrics, itemScores);

        return {
            overall_score: overall,
            grade,
            metrics,
            recommendations,
            itemScores
        };
    }

    /**
     * Score a full onboarding result object
     */
    scoreOnboarding(result) {
        const items = result.sku_identity_records || [];
        return this.scoreItems(items);
    }

    /**
     * FIXED: Score individual item - Separate identity from data quality
     */
    scoreItem(item) {
        const scores = {
            // IDENTITY CONFIDENCE (what the product IS)
            mapping_confidence: this.calculateMappingConfidence(item),

            // DATA QUALITY (commercial data completeness)
            data_completeness: this.calculateDataCompleteness(item),

            // VALIDATION (data sanity)
            validation_score: this.calculateValidationScore(item),

            // USER-FACING FLAGS (actionable issues only)
            user_flags: this.getUserFacingFlags(item),

            // INTERNAL FLAGS (for debugging, not shown to user)
            internal_flags: item.flags || []
        };

        return scores;
    }

    /**
     * FIXED: Calculate mapping confidence - ONLY identity factors
     * 
     * Formula:
     * Base confidence from mapping method (0.30 - 0.95)
     * + Brand match bonus (+0.10 if brand known)
     * + Keyword match bonus (+0.05 if strong keywords)
     * - Category mismatch penalty (-0.15 if user suggested different)
     * 
     * DOES NOT consider: price, quantity, cost
     */
    calculateMappingConfidence(item) {
        let confidence = item.mapping_confidence || 0.50;

        // Brand bonus (known brand = higher confidence)
        if (item.brand && item.brand !== 'Unknown') {
            const knownBrands = this.config.get('known_brands') || [];
            if (knownBrands.includes(item.brand)) {
                confidence = Math.min(confidence + 0.10, 0.98);
            }
        }

        // Mapping method bonus
        if (item.mapping_method === 'hard_rule') {
            confidence = Math.max(confidence, 0.95);
        } else if (item.mapping_method === 'brand_keyword_match') {
            confidence = Math.max(confidence, 0.90);
        } else if (item.mapping_method === 'user_suggested') {
            confidence = Math.max(confidence, 0.85);
        }

        // Category mismatch penalty (if user suggested different category)
        if (item.user_suggested_category &&
            item.category_name !== item.user_suggested_category) {
            confidence = Math.max(confidence - 0.15, 0.40);
        }

        return Math.min(Math.max(confidence, 0.30), 0.98);
    }

    /**
     * FIXED: Calculate data completeness - Commercial data only
     * Does NOT affect mapping confidence
     */
    calculateDataCompleteness(item) {
        let score = 0;
        let total = 0;

        // Product name (mandatory)
        total += 30;
        if (item.product_name_normalized) {
            score += 30;
        }

        // Quantity (mandatory)
        total += 20;
        if (item.quantity && item.quantity > 0) {
            score += 20;
        }

        // Selling price (important but not mandatory)
        total += 25;
        if (item.selling_price && item.selling_price > 0) {
            score += 25;
        }

        // Cost price (nice to have)
        total += 15;
        if (item.cost_price && item.cost_price > 0) {
            score += 15;
        }

        // Barcode (nice to have)
        total += 10;
        if (item.barcode) {
            score += 10;
        }

        return total > 0 ? (score / total) * 100 : 0;
    }

    /**
     * Calculate validation score - Data sanity
     */
    calculateValidationScore(item) {
        if (!item.validation_issues || item.validation_issues.length === 0) {
            return 100;
        }

        let penalties = 0;
        item.validation_issues.forEach(issue => {
            if (issue.severity === 'error') {
                penalties += 30;
            } else if (issue.severity === 'warning') {
                penalties += 10;
            } else {
                penalties += 5;
            }
        });

        return Math.max(100 - penalties, 0);
    }

    /**
     * FIXED: Get user-facing flags - Only actionable issues
     * 
     * HIDDEN from user:
     * - ASSUMED_UNIT (if we used catalog default)
     * - MISSING_COST_PRICE (info only, not critical)
     * - Internal normalization flags
     * 
     * SHOWN to user:
     * - LOW_CONFIDENCE_MAPPING (< 0.65)
     * - UNREALISTIC_QUANTITY
     * - PRICE_ANOMALY
     * - NEEDS_REVIEW
     */
    getUserFacingFlags(item) {
        const flags = [];

        // Low confidence mapping (user should review)
        if (item.mapping_confidence < 0.65) {
            flags.push({
                type: 'LOW_CONFIDENCE_MAPPING',
                message: `Category mapping has low confidence (${Math.round(item.mapping_confidence * 100)}%)`,
                action: 'Please verify the category is correct',
                severity: 'warning'
            });
        }

        // Unrealistic quantity (validation issue)
        if (item.validation_issues) {
            const quantityIssue = item.validation_issues.find(i => i.type === 'UNREALISTIC_QUANTITY');
            if (quantityIssue) {
                flags.push({
                    type: 'UNREALISTIC_QUANTITY',
                    message: quantityIssue.message,
                    action: 'Please verify the quantity',
                    severity: 'warning'
                });
            }
        }

        // Price anomaly (if selling price < cost price)
        if (item.selling_price && item.cost_price && item.selling_price < item.cost_price) {
            flags.push({
                type: 'PRICE_ANOMALY',
                message: `Selling price (₹${item.selling_price}) is less than cost price (₹${item.cost_price})`,
                action: 'Please verify prices',
                severity: 'warning'
            });
        }

        return flags;
    }

    /**
     * Calculate overall metrics
     */
    calculateMetrics(itemScores) {
        const totalItems = itemScores.length;
        if (totalItems === 0) {
            return this.getEmptyMetrics();
        }

        // Completeness metrics
        const avgDataCompleteness = itemScores.reduce((sum, s) => sum + s.data_completeness, 0) / totalItems;

        const withPrice = itemScores.filter(s => s.data_completeness >= 75).length;
        const withCost = itemScores.filter(s => s.data_completeness >= 90).length;

        // Mappability metrics (identity confidence)
        const avgMappingConfidence = itemScores.reduce((sum, s) => sum + (s.mapping_confidence * 100), 0) / totalItems;

        const highConfidence = itemScores.filter(s => s.mapping_confidence >= 0.85).length;
        const mediumConfidence = itemScores.filter(s => s.mapping_confidence >= 0.65 && s.mapping_confidence < 0.85).length;
        const lowConfidence = itemScores.filter(s => s.mapping_confidence < 0.65).length;

        // Validation metrics
        const avgValidationScore = itemScores.reduce((sum, s) => sum + s.validation_score, 0) / totalItems;

        const withIssues = itemScores.filter(s => s.user_flags.length > 0).length;

        return {
            completeness: {
                overall: avgDataCompleteness,
                with_price: withPrice,
                with_cost: withCost,
                price_coverage: (withPrice / totalItems) * 100,
                cost_coverage: (withCost / totalItems) * 100
            },
            mappability: {
                overall: avgMappingConfidence,
                high_confidence: highConfidence,
                medium_confidence: mediumConfidence,
                low_confidence: lowConfidence,
                high_confidence_pct: (highConfidence / totalItems) * 100,
                low_confidence_pct: (lowConfidence / totalItems) * 100
            },
            consistency: {
                overall: avgValidationScore,
                items_with_issues: withIssues,
                issue_rate: (withIssues / totalItems) * 100
            }
        };
    }

    /**
     * Calculate overall quality score
     */
    calculateOverallScore(metrics) {
        const completenessScore = metrics.completeness.overall;
        const mappabilityScore = metrics.mappability.overall;
        const consistencyScore = metrics.consistency.overall;

        // Weighted average
        const overall = (
            completenessScore * this.weights.completeness +
            mappabilityScore * this.weights.mappability +
            consistencyScore * this.weights.consistency
        );

        return Math.round(overall);
    }

    /**
     * Assign quality grade
     */
    assignGrade(score) {
        if (score >= this.gradeThresholds.excellent) return 'EXCELLENT';
        if (score >= this.gradeThresholds.good) return 'GOOD';
        if (score >= this.gradeThresholds.fair) return 'FAIR';
        return 'POOR';
    }

    /**
     * FIXED: Generate recommendations - Only actionable items
     */
    generateRecommendations(metrics, itemScores) {
        const recommendations = [];

        // Get thresholds from config with fallback
        const thresholds = {
            low_confidence_pct: 30,
            price_coverage: 50,
            validation_issue_rate: 20
        };

        // Try to get from config (recommendations is at root level, not under quality_scoring)
        const configThresholds = this.config.get('recommendations');
        if (configThresholds) {
            if (configThresholds.low_confidence_threshold !== undefined) {
                thresholds.low_confidence_pct = configThresholds.low_confidence_threshold;
            }
            if (configThresholds.missing_cost_price_threshold !== undefined) {
                thresholds.price_coverage = configThresholds.missing_cost_price_threshold;
            }
            if (configThresholds.price_violation_threshold !== undefined) {
                thresholds.validation_issue_rate = configThresholds.price_violation_threshold;
            }
        }

        // Low confidence mappings (actionable)
        if (metrics.mappability.low_confidence_pct > thresholds.low_confidence_pct) {
            recommendations.push({
                priority: 'HIGH',
                issue: `${metrics.mappability.low_confidence} items have low-confidence category mappings`,
                impact: 'Analytics may be inaccurate for these items',
                action: 'Review and correct category mappings for flagged items'
            });
        }

        // Missing prices (info only, not critical)
        if (metrics.completeness.price_coverage < thresholds.price_coverage) {
            recommendations.push({
                priority: 'MEDIUM',
                issue: `${Math.round(100 - metrics.completeness.price_coverage)}% of items missing selling price`,
                impact: 'Revenue analytics will be limited',
                action: 'Add selling prices when available'
            });
        }

        // Validation issues (actionable)
        if (metrics.consistency.issue_rate > thresholds.validation_issue_rate) {
            recommendations.push({
                priority: 'MEDIUM',
                issue: `${metrics.consistency.items_with_issues} items have validation warnings`,
                impact: 'Data quality issues detected',
                action: 'Review flagged items for data accuracy'
            });
        }

        return recommendations;
    }

    getEmptyMetrics() {
        return {
            completeness: { overall: 0, with_price: 0, with_cost: 0, price_coverage: 0, cost_coverage: 0 },
            mappability: { overall: 0, high_confidence: 0, medium_confidence: 0, low_confidence: 0, high_confidence_pct: 0, low_confidence_pct: 0 },
            consistency: { overall: 0, items_with_issues: 0, issue_rate: 0 }
        };
    }
}

// Export for use in orchestrator
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QualityScorer;
}
