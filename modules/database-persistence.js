const { Pool } = require('pg');
const { ValidationSchemas, ValidationError } = require('./validation-schemas');

class DatabasePersistence {
    constructor(configOrPool) {
        if (configOrPool && configOrPool.query) {
            this.pool = configOrPool;
        } else {
            this.pool = new Pool({
                host: configOrPool.host || process.env.DB_HOST || 'localhost',
                port: configOrPool.port || process.env.DB_PORT || 5432,
                database: configOrPool.database || process.env.DB_NAME || 'ai_store_manager',
                user: configOrPool.user || process.env.DB_USER || 'postgres',
                password: configOrPool.password || process.env.DB_PASSWORD,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
        }
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        try {
            const client = await this.pool.connect();
            console.log('✅ Database connected successfully');
            client.release();
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Check if run_id already exists (idempotency)
     */
    async checkRunIdempotency(runId) {
        const result = await this.pool.query(`
            SELECT batch_id, status, completed_at
            FROM onboarding_batch_status
            WHERE batch_id = $1
        `, [runId]);

        if (result.rows.length > 0) {
            const run = result.rows[0];

            if (run.status === 'completed') {
                return {
                    exists: true,
                    status: 'completed',
                    message: 'Run already completed successfully',
                    canRetry: false
                };
            } else if (run.status === 'running') {
                return {
                    exists: true,
                    status: 'running',
                    message: 'Run is currently in progress',
                    canRetry: false
                };
            } else if (run.status === 'failed') {
                return {
                    exists: true,
                    status: 'failed',
                    message: 'Previous run failed, retry allowed',
                    canRetry: true
                };
            }
        }

        return { exists: false, canRetry: true };
    }

    /**
     * Save onboarding results to database (3-table model)
     */
    async saveOnboardingResults(onboardingResult) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const {
                run_id,
                store_id,
                started_at,
                completed_at,
                catalog_version,
                agent_version,
                onboarding_mode,
                sku_identity_records,
                inventory_state_records,
                run_summary
            } = onboardingResult;

            // 1. Create onboarding batch record
            const batchType = onboarding_mode === 'full' ? 'full_onboarding' :
                onboarding_mode === 'incremental' ? 'incremental_update' :
                    onboarding_mode;

            await client.query(`
                INSERT INTO onboarding_batch_status (
                    batch_id, store_id, batch_type, target_catalog_version,
                    started_at, completed_at, status,
                    total_items, items_mapped, quality_score
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (batch_id) DO NOTHING
            `, [
                run_id,
                store_id,
                batchType,
                catalog_version,
                started_at,
                completed_at,
                'completed',
                run_summary.total_items,
                run_summary.new_skus_created + run_summary.existing_skus_updated,
                this.calculateQualityScore(run_summary)
            ]);

            // 2. Insert/Update SKU identity records
            for (const record of sku_identity_records) {
                if (record.action === 'created') {
                    await this.insertSKUIdentity(client, store_id, record, run_id, catalog_version);
                } else if (record.action === 'updated') {
                    await this.updateSKUIdentity(client, store_id, record);
                }
            }

            // 3. Insert inventory state records (handoff table)
            for (const record of inventory_state_records) {
                await this.insertInventoryState(client, store_id, record, run_id);
            }

            // 4. Save audit trail
            await this.saveAuditTrail(client, run_id, store_id, run_summary);

            await client.query('COMMIT');
            console.log(`✅ Saved onboarding results for run ${run_id}`);

            return { success: true, run_id };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Failed to save onboarding results:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Insert SKU identity record
     */
    async insertSKUIdentity(client, storeId, record, batchId, catalogVersion) {
        await client.query(`
            INSERT INTO store_sku_registry (
                store_id, store_item_id,
                original_product_name, normalized_product_name,
                brand, master_category_id, master_category_name,
                normalized_unit, pack_size, pack_unit,
                mapping_confidence, mapping_method,
                catalog_version, onboarding_batch_id,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (store_id, store_item_id) DO UPDATE SET
                master_category_id = EXCLUDED.master_category_id,
                master_category_name = EXCLUDED.master_category_name,
                mapping_confidence = EXCLUDED.mapping_confidence,
                mapping_method = EXCLUDED.mapping_method,
                last_verified_at = CURRENT_TIMESTAMP
        `, [
            storeId,
            record.store_item_id,
            record.raw_product_name,
            record.normalized_product_name,
            record.brand,
            record.master_category_id,
            record.category_name || record.category_path || 'Unknown',  // Use category_name if available
            record.stock_unit,
            record.pack_size,
            record.pack_unit,
            record.mapping_confidence_score,
            record.mapping_method,
            catalogVersion,
            batchId,
            record.status
        ]);
    }

    /**
     * Update SKU identity record
     */
    async updateSKUIdentity(client, storeId, record) {
        await client.query(`
            UPDATE store_sku_registry SET
                master_category_id = $3,
                master_category_name = $4,
                mapping_confidence = $5,
                last_verified_at = CURRENT_TIMESTAMP,
                manually_corrected = TRUE
            WHERE store_id = $1 AND store_item_id = $2
        `, [
            storeId,
            record.store_item_id,
            record.master_category_id,
            record.category_name || record.category_path || 'Unknown',
            record.mapping_confidence_score
        ]);
    }

    /**
     * Insert inventory state record (handoff table)
     */
    async insertInventoryState(client, storeId, record, batchId) {
        await client.query(`
            INSERT INTO onboarding_handoff (
                store_id, store_item_id,
                quantity_on_hand, unit,
                selling_price, cost_price,
                as_of_date, source,
                onboarding_batch_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            storeId,
            record.store_item_id,
            record.quantity_on_hand,
            'pcs', // Default unit for handoff
            record.selling_price,
            record.cost_price,
            record.as_of_timestamp,
            record.data_source,
            batchId
        ]);
    }

    /**
     * Save audit trail
     */
    async saveAuditTrail(client, batchId, storeId, runSummary) {
        // Save warnings to validation queue
        if (runSummary.warnings && runSummary.warnings.length > 0) {
            for (const warning of runSummary.warnings) {
                if (warning.severity === 'warning' || warning.issue_type === 'UNCATEGORIZED') {
                    await client.query(`
                        INSERT INTO validation_queue (
                            store_id, store_item_id, batch_id,
                            product_name, flags, review_status
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                    `, [
                        storeId,
                        warning.store_item_id,
                        batchId,
                        warning.message,
                        JSON.stringify([warning.issue_type]),
                        'pending'
                    ]);
                }
            }
        }
    }

    /**
     * Calculate quality score from run summary
     */
    calculateQualityScore(runSummary) {
        if (!runSummary || !runSummary.total_items) return 0;

        const { confidence_breakdown, total_items } = runSummary;
        const cb = confidence_breakdown || {};

        const high = (cb.HIGH || 0);
        const medium = (cb.MEDIUM || 0);
        const low = (cb.LOW || 0);

        const score = ((high * 100) + (medium * 50) + (low * 25)) / total_items;
        return Math.round(score);
    }

    /**
     * Get existing SKU IDs for incremental onboarding
     */
    async getExistingSKUs(storeId) {
        const result = await this.pool.query(`
            SELECT store_item_id, master_category_id, mapping_confidence
            FROM store_sku_registry
            WHERE store_id = $1 AND status = 'active'
        `, [storeId]);

        return new Map(result.rows.map(row => [
            row.store_item_id,
            {
                category_id: row.master_category_id,
                confidence: row.mapping_confidence
            }
        ]));
    }

    /**
     * Get onboarding history for a store
     */
    async getOnboardingHistory(storeId, limit = 10) {
        const result = await this.pool.query(`
            SELECT * FROM v_recent_batches
            WHERE store_id = $1
            ORDER BY onboarding_date DESC
            LIMIT $2
        `, [storeId, limit]);

        return result.rows;
    }

    /**
     * Get items needing review
     */
    async getItemsNeedingReview(storeId) {
        const result = await this.pool.query(`
            SELECT * FROM validation_queue
            WHERE store_id = $1 AND review_status = 'pending'
            ORDER BY created_at DESC
        `, [storeId]);

        return result.rows;
    }

    /**
     * Close database connection
     */
    async close() {
        await this.pool.end();
        console.log('✅ Database connection closed');
    }
}

module.exports = DatabasePersistence;
