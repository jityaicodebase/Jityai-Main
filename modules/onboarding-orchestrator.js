/**
 * PRODUCTION-READY ONBOARDING ORCHESTRATOR
 * 
 * Implements strict separation of concerns:
 * 1. SKU Identity (stable, long-lived)
 * 2. Inventory State (volatile, time-series)
 * 3. Run Diagnostics (ephemeral, audit only)
 */

const crypto = require('crypto');

// Simple UUID v4 generator
function uuidv4() {
    return crypto.randomUUID();
}

class OnboardingOrchestrator {
    constructor(configLoader, normalizer, brandExtractor, catalogMapper, llmCategorizer, dbPersistence = null) {
        this.configLoader = configLoader;
        this.normalizer = normalizer;
        this.brandExtractor = brandExtractor;
        this.catalogMapper = catalogMapper;
        this.llmCategorizer = llmCategorizer;
        this.dbPersistence = dbPersistence;  // Optional database persistence

        this.CURRENT_CATALOG_VERSION = 'v2.1.0';
        this.AGENT_VERSION = 'v1.5.3';
    }

    /**
     * Main onboarding entry point
     * Returns: { sku_identity_records, inventory_state_records, run_summary }
     */
    async onboard(storeId, items, options = {}) {
        const runId = options.runId || uuidv4();
        const startedAt = new Date().toISOString();
        const onboardingMode = options.mode || 'full';
        const catalogVersion = options.catalogVersion || this.CURRENT_CATALOG_VERSION;

        console.log(`\n🚀 Starting Onboarding Run: ${runId}`);
        console.log(`   Store: ${storeId}`);
        console.log(`   Items: ${items.length}`);
        console.log(`   Catalog Version: ${catalogVersion}\n`);

        try {
            // STEP 1: Normalize all items
            const normalizedItems = this.normalizeItems(items);

            // STEP 2: Extract brands
            this.extractBrands(normalizedItems);

            // STEP 3: Map to catalog (AI categorization)
            const mappedItems = await this.catalogMapper.mapItems(normalizedItems);

            // STEP 4: Detect new vs existing SKUs & Category Drift
            // Pass options for smart drift protection
            const { newItems, existingItems, driftWarnings, existingMap } = await this.detectNewSKUs(
                storeId,
                mappedItems,
                {
                    forceRecategorize: options.forceRecategorize || false,
                    catalogVersion: catalogVersion
                }
            );

            // STEP 5: Build SKU Identity Records
            const skuIdentityRecords = this.buildSKUIdentityRecords(
                storeId,
                mappedItems,
                newItems,
                existingItems,
                catalogVersion,
                existingMap
            );

            // STEP 6: Build Inventory State Records
            const inventoryStateRecords = this.buildInventoryStateRecords(
                storeId,
                mappedItems,
                startedAt
            );

            // STEP 7: Build Run Summary & Diagnostics
            const runSummary = this.buildRunSummary(
                skuIdentityRecords,
                mappedItems,
                newItems,
                existingItems,
                driftWarnings
            );

            const completedAt = new Date().toISOString();

            // STEP 8: Build final payload (Observability-First Structure)
            const result = {
                run_id: runId,
                store_id: storeId,
                catalog_version: catalogVersion, // Single source of truth
                agent_version: this.AGENT_VERSION,
                started_at: startedAt,
                completed_at: completedAt,
                onboarding_mode: onboardingMode,

                // CLEANED Identity Records (Hiding internal diagnostics from agents)
                // GOVERNANCE: Enforce single catalog version per run
                sku_identity_records: skuIdentityRecords.map(r => {
                    const { mapping_confidence_score, mapping_method, ...rest } = r;
                    return {
                        ...rest,
                        catalog_version: catalogVersion // Force inheritance from run level
                    };
                }),

                inventory_state_records: inventoryStateRecords,
                run_summary: runSummary
            };

            // STEP 9: Save to database (if configured)
            if (this.dbPersistence) {
                try {
                    console.log('💾 Saving to database...');
                    // Save full internal record to database (including diagnostics)
                    await this.dbPersistence.saveOnboardingResults({
                        ...result,
                        sku_identity_records: skuIdentityRecords // Keep full metadata for DB
                    });
                    console.log('✅ Database save complete');
                } catch (dbError) {
                    console.error('⚠️  Database save failed:', dbError.message);
                    result.run_summary.warnings.push({
                        severity: 'error',
                        issue_type: 'DATABASE_SAVE_FAILED',
                        message: `Database save failed: ${dbError.message}`
                    });
                }
            }

            return result;

        } catch (error) {
            console.error('❌ Onboarding failed:', error);
            throw error;
        }
    }

    /**
     * STEP 1: Normalize items
     */
    normalizeItems(items) {
        console.log('📝 Normalizing items...');
        return items.map(item => this.normalizer.normalize(item));
    }

    /**
     * STEP 2: Extract brands
     */
    extractBrands(items) {
        console.log('🏷️  Extracting brands...');
        items.forEach(item => {
            item.brand = this.brandExtractor.extract(item.product_name_normalized);
        });
    }

    /**
     * STEP 4: Detect new vs existing SKUs & CATEGORY DRIFT
     * 
     * Smart drift protection rules:
     * - ALWAYS protect manually corrected items (unless force mode)
     * - Allow changes if new confidence is significantly higher
     * - Allow changes if catalog version has changed (new categorization logic)
     * - Allow L1 → L2 upgrades (more specific categorization)
     * - Allow changes if force_recategorize option is set
     */
    async detectNewSKUs(storeId, items, options = {}) {
        if (!this.dbPersistence) {
            return { newItems: items, existingItems: [], driftWarnings: [], existingMap: new Map() };
        }

        const forceRecategorize = options.forceRecategorize || false;
        const currentCatalogVersion = options.catalogVersion || this.CURRENT_CATALOG_VERSION;

        try {
            const existingMap = await this.dbPersistence.getExistingSKUs(storeId);
            const newItems = [];
            const existingItems = [];
            const driftWarnings = [];

            for (const item of items) {
                const existing = existingMap.get(item.store_item_id);
                if (existing) {
                    existingItems.push(item);

                    // GOVERNANCE: Detect Category Drift
                    if (existing.category_id !== item.category_id) {
                        // Determine if this change should be allowed
                        const shouldAllowChange = this.shouldAllowCategoryChange(
                            existing,
                            item,
                            currentCatalogVersion,
                            forceRecategorize
                        );

                        if (shouldAllowChange.allow) {
                            // Log the allowed change
                            console.log(`   ✓ Category update: ${item.store_item_id} ${existing.category_id} → ${item.category_id} (${shouldAllowChange.reason})`);
                        } else {
                            driftWarnings.push({
                                store_item_id: item.store_item_id,
                                issue_type: 'CATEGORY_DRIFT_BLOCKED',
                                severity: 'info',
                                message: `Category change from ${existing.category_id} to ${item.category_id} blocked: ${shouldAllowChange.reason}`,
                                suggested_action: shouldAllowChange.action || 'MANUAL_REVIEW',
                                old_category: existing.category_id,
                                new_category: item.category_id
                            });
                            // Revert to original category
                            item.category_id = existing.category_id;
                            item.category_name = existing.category_name;
                        }
                    }
                } else {
                    newItems.push(item);
                }
            }

            console.log(`   New SKUs: ${newItems.length}, Existing SKUs: ${existingItems.length}`);
            if (driftWarnings.length > 0) {
                console.log(`   ⚠️  Drift warnings: ${driftWarnings.length}`);
            }

            return { newItems, existingItems, driftWarnings, existingMap };
        } catch (error) {
            console.warn('⚠️  Database query failed:', error.message);
            return { newItems: items, existingItems: [], driftWarnings: [], existingMap: new Map() };
        }
    }

    /**
     * Determine if a category change should be allowed
     */
    shouldAllowCategoryChange(existing, newItem, currentCatalogVersion, forceRecategorize) {
        // Rule 1: Force mode overrides everything (for testing/migrations)
        if (forceRecategorize) {
            return { allow: true, reason: 'force_recategorize' };
        }

        // Rule 2: NEVER change manually corrected items (unless force mode)
        if (existing.manually_corrected) {
            return {
                allow: false,
                reason: 'manually_corrected_item',
                action: 'SKIP - User has manually set this category'
            };
        }

        // Rule 3: Allow if catalog version has changed (new categorization logic)
        if (existing.catalog_version !== currentCatalogVersion) {
            return { allow: true, reason: 'catalog_version_upgrade' };
        }

        // Rule 4: Allow L1 → L2 → L3 upgrades (more specific categorization)
        const getLevel = (cid) => parseInt(cid.charAt(1)) || 0;
        const oldLevel = getLevel(existing.category_id);
        const newLevel = getLevel(newItem.category_id);

        if (newLevel > oldLevel) {
            return { allow: true, reason: `specificity_upgrade_l${oldLevel}_to_l${newLevel}` };
        }

        // Rule 5: Allow if new confidence is significantly higher (>0.1 improvement)
        const oldConfidence = existing.mapping_confidence || 0.5;
        const newConfidence = newItem.mapping_confidence || 0.5;
        if (newConfidence > oldConfidence + 0.1) {
            return { allow: true, reason: 'higher_confidence' };
        }

        // Rule 6: Block if confidence is same or lower (preserve stability)
        return {
            allow: false,
            reason: 'stability_protection',
            action: 'MANUAL_REVIEW'
        };
    }

    /**
     * STEP 5: Build SKU Identity Records
     */
    buildSKUIdentityRecords(storeId, mappedItems, newItems, existingItems, catalogVersion, existingMap) {
        console.log('🆔 Building SKU identity records...');

        return mappedItems.map(item => {
            const isNew = newItems.some(n => n.store_item_id === item.store_item_id);

            // Unit tracking logic moved to diagnostics block later
            const stockUnit = item.unit || 'pcs';

            return {
                store_item_id: item.store_item_id,
                action: isNew ? 'created' : 'updated',

                // PRODUCT IDENTITY (Lowercase & Punctuation-free via Normalizer)
                raw_product_name: item.product_name_original || item.product_name,
                normalized_product_name: item.product_name_normalized,
                brand: item.brand || null,

                // PACKAGING
                pack_size: item.pack_size || null,
                pack_unit: item.pack_unit || null,
                stock_unit: stockUnit,

                // CATEGORIZATION
                master_category_id: item.category_id,
                category_path: item.category_name,
                mapping_confidence: this.categorizeConfidence(item.mapping_confidence),

                // INTERNAL (Hidden from final agent response but kept in object for summary)
                mapping_confidence_score: item.mapping_confidence || 0.30,
                mapping_method: item.mapping_method || 'unknown',

                // VERSIONING (inherited from run-level)
                catalog_version: catalogVersion,
                status: 'active'
            };
        });
    }

    /**
     * STEP 6: Build Inventory State Records
     */
    buildInventoryStateRecords(storeId, mappedItems, timestamp) {
        console.log('📦 Building inventory state records...');

        return mappedItems.map(item => ({
            store_item_id: item.store_item_id,
            quantity_on_hand: item.quantity || 0,
            selling_price: item.selling_price || null,
            cost_price: item.cost_price || null,
            as_of_timestamp: timestamp,
            data_source: 'full_onboarding' // Changed from onboarding_agent to match DB constraint
        }));
    }

    /**
     * STEP 7: Build Run Summary & Diagnostics
     */
    buildRunSummary(skuRecords, mappedItems, newItems, existingItems, driftWarnings) {
        console.log('📊 Building run summary...');

        // Confidence breakdown
        const confidenceBreakdown = { HIGH: 0, MEDIUM: 0, LOW: 0, UNCATEGORIZED: 0 };
        skuRecords.forEach(record => { confidenceBreakdown[record.mapping_confidence]++; });

        // DIAGNOSTICS: Tracking assumed units (as requested)
        const assumedUnits = mappedItems
            .filter(item => item.unit_assumed)
            .map(item => ({
                store_item_id: item.store_item_id,
                assumed_stock_unit: item.unit || 'pcs'
            }));

        const warnings = [...driftWarnings];

        skuRecords.forEach(record => {
            if (record.mapping_confidence === 'UNCATEGORIZED') {
                warnings.push({
                    store_item_id: record.store_item_id,
                    severity: 'warning',
                    issue_type: 'UNCATEGORIZED',
                    message: `Product '${record.raw_product_name}' could not be categorized`,
                    suggested_action: 'MANUAL_REVIEW'
                });
            }
        });

        return {
            total_items: mappedItems.length,
            new_skus_created: newItems.length,
            existing_skus_updated: existingItems.length,
            inventory_snapshots_created: mappedItems.length,

            confidence_breakdown: confidenceBreakdown,

            // AUDIT & GOVERNANCE
            diagnostics: {
                items_with_assumed_units: assumedUnits.length,
                assumed_units: assumedUnits
            },

            warnings: warnings
        };
    }

    /**
     * Categorize confidence score into HIGH/MEDIUM/LOW/UNCATEGORIZED
     */
    categorizeConfidence(score) {
        if (!score || score < 0.30) return 'UNCATEGORIZED';
        if (score >= 0.85) return 'HIGH';
        if (score >= 0.60) return 'MEDIUM';
        return 'LOW';
    }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnboardingOrchestrator;
}
