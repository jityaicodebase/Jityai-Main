/**
 * RECLASSIFICATION ENGINE (Background Task)
 * 
 * Purpose:
 * Upgrades store inventory to latest catalog version (v2.4.0) with L3 support.
 * Implements ADS freezing and Migration Audit logging.
 */

require('dotenv').config();
const { Pool } = require('pg');
const ConfigLoader = require('../modules/config');
const FuzzyMatcher = require('../modules/fuzzy-matcher');
const CatalogMapper = require('../modules/catalog-mapper');
const LLMCategorizer = require('../modules/llm-categorizer');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
};

async function runReclassification(storeId) {
    // 🔒 FREEZE #3: Demo Store Protection
    if (storeId === 'demo-store') {
        console.error("❌ ABORT: 'demo-store' is PROTECTED/READ-ONLY. Modification forbidden.");
        process.exit(1);
    }

    console.log(`🚀 Starting Reclassification for Store: ${storeId}`);
    const pool = new Pool(DB_CONFIG);
    const configLoader = new ConfigLoader();
    await configLoader.loadAll();

    const llmCategorizer = new LLMCategorizer(configLoader);
    await llmCategorizer.initialize();

    const fuzzyMatcher = new FuzzyMatcher(configLoader);
    const catalogMapper = new CatalogMapper(configLoader, fuzzyMatcher, llmCategorizer);
    await catalogMapper.initialize(configLoader.getMasterCatalog());

    const client = await pool.connect();

    try {
        // Bypass the security trigger for this systematic upgrade
        await client.query('ALTER TABLE store_sku_registry DISABLE TRIGGER prevent_silent_remap_trigger');

        // 1. Get all active SKUs
        const skusResult = await client.query(`
            SELECT store_item_id, normalized_product_name, brand, master_category_id, master_category_name, mapping_confidence
            FROM store_sku_registry 
            WHERE store_id = $1 AND manually_corrected = FALSE
        `, [storeId]);

        const skus = skusResult.rows;
        console.log(`📊 Found ${skus.length} SKUs for processing...`);

        const BATCH_SIZE = 50;
        let migratedCount = 0;
        let skippedCount = 0;
        const totalItems = skus.length;
        console.log(`🚀 Processing ${totalItems} items in batches of ${BATCH_SIZE}...`);

        for (let i = 0; i < totalItems; i += BATCH_SIZE) {
            console.time(`Batch ${Math.floor(i / BATCH_SIZE) + 1}`);
            const batch = skus.slice(i, i + BATCH_SIZE);
            const batchInputs = batch.map(s => ({
                product_name_normalized: s.normalized_product_name,
                brand: s.brand
            }));

            const mappedResults = await catalogMapper.mapItems(batchInputs);

            // Log stats for this batch
            const cacheHits = mappedResults.filter(r => r.mapping_method === 'llm_fallback' && r.fromCache).length;
            const apiCalls = mappedResults.filter(r => r.mapping_method === 'llm_fallback' && !r.fromCache).length;
            const ruleHits = mappedResults.filter(r => r.mapping_method !== 'llm_fallback').length;

            console.log(`   [Rules: ${ruleHits} | Cache: ${cacheHits} | API: ${apiCalls}]`);

            await client.query('BEGIN');
            try {
                for (let j = 0; j < batch.length; j++) {
                    const sku = batch[j];
                    const mapped = mappedResults[j];

                    // GUARD: Never downgrade to UNCATEGORIZED if we already have a category
                    if (mapped.category_id === 'L1_UNCATEGORIZED' && sku.master_category_id !== 'L1_UNCATEGORIZED') {
                        skippedCount++;
                        continue;
                    }

                    // Check if Level changed or Category ID changed
                    const oldLevel = parseInt(sku.master_category_id?.charAt(1)) || 0;
                    const newLevel = parseInt(mapped.category_id?.charAt(1)) || 0;

                    const isSpecificityUpgrade = newLevel > oldLevel;
                    const isCategoryCorrection = mapped.category_id !== sku.master_category_id;

                    if (isSpecificityUpgrade || isCategoryCorrection) {
                        await client.query(`
                            INSERT INTO catalog_migration_audit (
                                store_id, store_item_id, old_category_id, old_category_path, 
                                new_category_id, new_category_path, migration_reason
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                        `, [
                            storeId,
                            sku.store_item_id,
                            sku.master_category_id,
                            sku.master_category_name,
                            mapped.category_id,
                            mapped.category_name,
                            `${mapped.mapping_method} | ${mapped.mapping_reason} | Level ${oldLevel}->${newLevel}`
                        ]);

                        await client.query(`
                            UPDATE store_sku_registry SET
                                master_category_id = $3,
                                master_category_name = $4,
                                last_verified_at = CURRENT_TIMESTAMP
                            WHERE store_id = $1 AND store_item_id = $2
                        `, [storeId, sku.store_item_id, mapped.category_id, mapped.category_name]);

                        if (isSpecificityUpgrade) {
                            await client.query(`
                                UPDATE inventory_recommendations SET
                                    ads_pending_recalc = TRUE,
                                    ads_freeze_until = CURRENT_DATE + INTERVAL '14 days'
                                WHERE store_id = $1 AND store_item_id = $2
                            `, [storeId, sku.store_item_id]);
                        }

                        migratedCount++;
                    } else {
                        skippedCount++;
                    }
                }
                await client.query('COMMIT');
            } catch (batchErr) {
                await client.query('ROLLBACK');
                console.error(`❌ Batch failed:`, batchErr.message);
            }

            console.log(`...processed ${Math.min(i + BATCH_SIZE, skus.length)} / ${skus.length} (Migrated: ${migratedCount})`);
        }

        console.log(`\n✅ RECLASSIFICATION COMPLETE`);
        console.log(`   Migrated/Upgraded: ${migratedCount}`);
        console.log(`   Stable/Preserved:  ${skippedCount}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration failed:`, err.message);
    } finally {
        try {
            await client.query('ALTER TABLE store_sku_registry ENABLE TRIGGER prevent_silent_remap_trigger');
        } catch (e) { }
        client.release();
        await pool.end();
    }
}

// Get storeId from CLI
const targetStoreId = process.argv[2] || 'suvidha-949';
runReclassification(targetStoreId);
