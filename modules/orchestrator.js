/**
 * ONBOARDING ORCHESTRATOR (Enhanced with all new modules)
 * Browser-only version - all modules must be loaded via script tags before this file
 */

class OnboardingOrchestrator {
    constructor() {
        this.configLoader = null;
        this.modules = {};
        this.stats = {
            totalItems: 0,
            mapped: 0,
            categoryOnly: 0,
            failed: 0
        };
    }

    /**
     * Initialize orchestrator with all modules
     */
    async initialize() {
        try {
            // Load all configurations dynamically
            this.configLoader = new ConfigLoader();
            await this.configLoader.loadAll();

            // Initialize core modules
            const errorHandler = new ErrorHandler();
            const excelParser = new ExcelParser(this.configLoader);
            const fuzzyMatcher = new FuzzyMatcher(this.configLoader);
            const languageTranslator = new LanguageTranslator(this.configLoader);

            // Initialize main modules with dependencies
            const parser = new FileParser(this.configLoader);
            parser.setDependencies(excelParser, errorHandler);

            const normalizer = new Normalizer(this.configLoader, languageTranslator, errorHandler);
            await normalizer.initialize();

            const brandExtractor = new BrandExtractor(this.configLoader);

            const catalogMapper = new CatalogMapper(this.configLoader, fuzzyMatcher, languageTranslator, errorHandler);
            await catalogMapper.initialize(this.configLoader.getMasterCatalog());

            const qualityScorer = new QualityScorer(this.configLoader);
            await qualityScorer.initialize();

            // Store all modules
            this.modules = {
                parser,
                normalizer,
                brandExtractor,
                catalogMapper,
                qualityScorer,
                errorHandler,
                excelParser,
                fuzzyMatcher,
                languageTranslator
            };

            console.log('✓ Onboarding Orchestrator initialized with all enhanced modules');
            return true;
        } catch (error) {
            console.error('Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * FIXED: Main onboarding flow with proper unit enforcement
     * 
     * Flow: Parse → Normalize → Extract Brands → Map to Catalog → 
     *       Re-normalize with Category Defaults → Score Quality
     */
    async onboard(input, storeContext) {
        console.log('🚀 Starting enhanced onboarding for:', storeContext.storeName);

        const batchId = this.generateBatchId();
        const startTime = Date.now();

        // Clear previous errors
        this.modules.errorHandler.clear();

        try {
            // Phase 1: Parse input
            const rawItems = await this.parseInput(input);
            console.log(`✓ Parsed ${rawItems.length} items`);

            // Phase 2: Initial normalization (without category)
            const normalizedItems = this.modules.normalizer.normalizeItems(rawItems);
            console.log(`✓ Normalized ${normalizedItems.length} items`);

            // Phase 3: Extract brands
            normalizedItems.forEach(item => {
                item.brand = this.modules.brandExtractor.extract(item.product_name_normalized);
            });
            console.log(`✓ Extracted brands`);

            // Phase 4: Map to catalog (determines category)
            console.log('Starting catalog mapping...');
            let mappedItems;
            try {
                mappedItems = this.modules.catalogMapper.mapItems(normalizedItems);
                console.log(`✓ Mapped ${mappedItems.length} items to catalog`);

                // Verify all items have category_id
                const missingCategory = mappedItems.filter(item => !item.category_id);
                if (missingCategory.length > 0) {
                    console.warn(`⚠️ ${missingCategory.length} items missing category_id:`, missingCategory.map(i => i.product_name_original));
                }
            } catch (error) {
                console.error('❌ Catalog mapping failed:', error);
                throw new Error(`Catalog mapping failed: ${error.message}`);
            }

            // Phase 5: Re-normalize with category defaults (CRITICAL FIX)
            console.log('Starting re-normalization with category defaults...');
            try {
                mappedItems.forEach((item, index) => {
                    // Safety check: ensure item has category_id
                    if (!item.category_id) {
                        console.warn(`Item ${index} missing category_id:`, item.product_name_original || item.product_name);
                        item.category_id = 'L1_UNCATEGORIZED';
                        item.category_name = 'Uncategorized';
                        item.mapping_confidence = 0.30;
                    }

                    try {
                        const reNormalized = this.modules.normalizer.normalize(item, item.category_id);
                        // Update unit and quantity with catalog defaults
                        item.unit = reNormalized.unit;
                        item.quantity = reNormalized.quantity;
                        item.unit_assumed = reNormalized.unit_assumed;
                        item.validation_issues = reNormalized.validation_issues;

                        // Merge flags (only user-facing ones)
                        item.flags = item.flags || [];
                        if (reNormalized.unit_assumed && item.category_id === 'L1_UNCATEGORIZED') {
                            if (!item.flags.includes('ASSUMED_UNIT')) {
                                item.flags.push('ASSUMED_UNIT');
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Re-normalization failed for item ${index}:`, error);
                        throw error;
                    }
                });
                console.log(`✓ Re-normalized ${mappedItems.length} items with catalog defaults`);
            } catch (error) {
                console.error('❌ Re-normalization phase failed:', error);
                throw new Error(`Re-normalization failed: ${error.message}`);
            }

            // Update stats
            this.updateStats(mappedItems);
            console.log(`✓ Mapped ${this.stats.mapped} items`);

            // Check for mass failures
            const massFailure = this.modules.errorHandler.handleMassFailure(this.stats);
            if (massFailure) {
                console.warn('⚠️ Mass mapping failure detected');
            }

            // Phase 6: Calculate quality (with fixed scoring)
            const qualityReport = this.modules.qualityScorer.scoreItems(mappedItems);
            console.log(`✓ Data quality: ${qualityReport.overall}/100`);

            // Phase 7: Generate error report
            const errorReport = this.modules.errorHandler.generateReport();

            // Build result
            return {
                batchId,
                storeId: storeContext.storeId,
                storeName: storeContext.storeName,
                onboardingDate: new Date().toISOString(),
                processingTimeMs: Date.now() - startTime,
                items: mappedItems,
                qualityReport,
                stats: this.stats,
                errorReport: errorReport,
                hasErrors: errorReport.summary.totalErrors > 0,
                hasWarnings: errorReport.summary.totalWarnings > 0
            };

        } catch (error) {
            console.error('Onboarding failed:', error);
            this.modules.errorHandler.handleParseError(error, input);
            throw error;
        }
    }

    /**
     * Parse input from various sources
     */
    async parseInput(input) {
        if (input instanceof File) {
            const result = await this.modules.parser.parse(input);
            return result.items;
        } else if (Array.isArray(input)) {
            return input;
        } else {
            throw new Error('Invalid input format');
        }
    }

    /**
     * Update processing statistics
     */
    updateStats(mappedItems) {
        const thresholds = this.configLoader.getConfidenceThresholds();

        this.stats.totalItems = mappedItems.length;
        this.stats.mapped = mappedItems.filter(i => i.mapping_confidence >= thresholds.medium).length;
        this.stats.categoryOnly = mappedItems.filter(i =>
            i.mapping_confidence < thresholds.medium && i.category_id
        ).length;
        this.stats.failed = mappedItems.filter(i => !i.category_id).length;
    }

    /**
     * Generate unique batch ID
     */
    generateBatchId() {
        return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get module for external access
     */
    getModule(name) {
        return this.modules[name];
    }

    /**
     * Get configuration loader
     */
    getConfigLoader() {
        return this.configLoader;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnboardingOrchestrator;
}
