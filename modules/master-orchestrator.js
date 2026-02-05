/**
 * MASTER ORCHESTRATOR (v2.0)
 * 
 * Central hub for the AI Store Manager. Handles:
 * - Intelligent routing of onboarding vs. incremental sync
 * - EVENT DISPATCHING (SALE_OCCURRED, STOCK_UPDATED, etc.)
 * - Chaining agents (Sync -> Sales Extraction -> AI Reasoning)
 */

const crypto = require('crypto');

class MasterOrchestrator {
    constructor(onboardingAgent, incrementalSyncAgent, dbPersistence, inventoryAIAgent = null, salesExtractor = null) {
        this.onboardingAgent = onboardingAgent;
        this.incrementalSyncAgent = incrementalSyncAgent;
        this.dbPersistence = dbPersistence;
        this.inventoryAIAgent = inventoryAIAgent;
        this.salesExtractor = salesExtractor;

        // Run tracking
        this.lastRunTimes = new Map();
        this.MIN_RUN_INTERVAL_MS = 30000; // 30 seconds
    }

    /**
     * MAIN ROUTING LOGIC
     */
    async route(storeId, data, options = {}) {
        const routingId = crypto.randomUUID();
        const startTime = Date.now();

        try {
            const storeExists = await this.storeExists(storeId);

            if (!storeExists) {
                const result = await this.onboardingAgent.onboard(storeId, data, { ...options, routingId });

                // Get newly created SKU IDs for initial AI analysis
                const skuIds = data.map(item => item.store_item_id || item.sku_id || item.item_id).filter(Boolean);

                await this.emit('STORE_ONBOARDED', {
                    storeId,
                    routingId,
                    skuIds,
                    count: data.length
                });
                return result;
            }

            const unknownSKUs = await this.findUnknownSKUs(storeId, data);
            if (unknownSKUs.length > 0) {
                const result = await this.onboardingAgent.onboard(storeId, unknownSKUs, { ...options, mode: 'partial', routingId });

                const knownSKUs = data.filter(item => !unknownSKUs.some(u => u.store_item_id === item.store_item_id));
                if (knownSKUs.length > 0) {
                    await this.incrementalSyncAgent.sync(storeId, knownSKUs, { ...options, routingId });
                }
                return result;
            }

            // Standard Incremental Sync
            const result = await this.incrementalSyncAgent.sync(storeId, data, { ...options, routingId });
            return result;

        } catch (error) {
            console.error(`❌ Orchestration failed:`, error);
            throw error;
        }
    }

    /**
     * EVENT EMITTER: Dispatches events to downstream agents
     */
    async emit(eventType, payload) {
        console.log(`📡 Event Dispatched: ${eventType} for Store: ${payload.storeId}`);

        if (this.inventoryAIAgent) {
            // AI Agent is the primary consumer of all business events
            try {
                await this.inventoryAIAgent.handleEvent(eventType, payload);
            } catch (err) {
                console.error(`❌ AI Agent failed to handle ${eventType}:`, err.message);
            }
        }
    }

    /**
     * EVENT HANDLER: Triggered by IncrementalSyncAgent
     */
    async onIncrementalSyncCompleted(storeId, syncRunId, affectedSKUs) {
        console.log(`\n✅ Sync Completed: ${syncRunId}`);

        try {
            // 1. Extract Sales Transactions (Deterministic)
            if (this.salesExtractor) {
                const extractResult = await this.salesExtractor.extractFromSync(storeId, syncRunId);
                if (extractResult.extractedCount > 0) {
                    await this.emit('SALE_OCCURRED', {
                        storeId,
                        syncRunId,
                        skuIds: affectedSKUs,
                        count: extractResult.extractedCount
                    });
                }
            }

            // 2. Dispatch Stock Update Event
            await this.emit('STOCK_UPDATED', {
                storeId,
                syncRunId,
                skuIds: affectedSKUs
            });

        } catch (error) {
            console.error(`❌ Post-sync logic failed:`, error.message);
        }
    }

    /**
     * Manual Overrides & Data Corrections
     * Centralizes manual adjustments and informs the AI Agent
     */
    async handleManualAdjustment(storeId, skuId, updates) {
        console.log(`✏️  Master Orchestrator: Processing manual adjustment for ${skuId}`);

        try {
            // updates includes: quantity, sellingPrice, costPrice, categoryName, reason
            const { quantity, sellingPrice, costPrice, categoryName, reason } = updates;

            const client = await this.dbPersistence.pool.connect();
            try {
                await client.query('BEGIN');

                // 2. Create a new "Correction" Batch for this manual adjustment
                const newBatchId = crypto.randomUUID();
                const storeInfo = await client.query('SELECT store_name, store_location FROM onboarding_batch_status WHERE store_id = $1 AND batch_type != \'correction\' ORDER BY onboarding_date DESC LIMIT 1', [storeId]);
                const storeName = storeInfo.rows[0]?.store_name || storeId; // Fallback to ID, not 'Manual Adjustment'
                const location = storeInfo.rows[0]?.store_location || 'Unknown';

                await client.query(`
                    INSERT INTO onboarding_batch_status (
                        batch_id, store_id, store_name, store_location,
                        batch_type, status, onboarding_date, started_at, completed_at, total_items
                    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                `, [newBatchId, storeId, storeName, location, 'correction', 'completed']);

                // 3. Update Registry (Tagging/Category)
                await client.query(`
                    UPDATE store_sku_registry SET
                        master_category_name = COALESCE($3, master_category_name),
                        manually_corrected = TRUE,
                        corrected_at = CURRENT_TIMESTAMP,
                        correction_reason = $4,
                        last_verified_at = CURRENT_TIMESTAMP,
                        onboarding_batch_id = $5
                    WHERE store_id = $1 AND store_item_id = $2
                `, [storeId, skuId, categoryName, reason || 'Manual adjustment via UI', newBatchId]);

                // 4. Create Snapshot (Inventory Handoff)
                const skuInfo = await client.query('SELECT normalized_unit FROM store_sku_registry WHERE store_id = $1 AND store_item_id = $2', [storeId, skuId]);
                const unit = skuInfo.rows[0]?.normalized_unit || 'pcs';

                await client.query(`
                    INSERT INTO onboarding_handoff (
                        store_id, store_item_id, quantity_on_hand, unit,
                        selling_price, cost_price, source, as_of_date, onboarding_batch_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8)
                `, [storeId, skuId, quantity, unit, sellingPrice, costPrice, 'manual_entry', newBatchId]);

                await client.query('COMMIT');

                // 5. Emit Event (No immediate AI trigger, strictly Daily Close)
                // The AI will pick up this change during the next scheduled run.
                console.log(`✅ Manual adjustment committed for ${skuId}. Intelligence will run at Daily Close.`);

                return { success: true, batchId: newBatchId };

            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error(`❌ Manual adjustment failed:`, error.message);
            throw error;
        }
    }

    /**
     * ORCHESTRATION: Block high-risk automated actions
     */
    async blockAction(storeId, actionId, reason) {
        console.log(`🚫 Master Agent: BLOCKING Action ${actionId} | Reason: ${reason}`);
        // Logic to prevent the action from being pushed to POS/Ordering system
    }

    /**
     * ORCHESTRATION: Escalate to human
     */
    async escalateToHuman(storeId, skuId, issue) {
        console.log(`🚨 Master Agent: ESCALATING SKU ${skuId} to Human | Issue: ${issue}`);
        // Logic to notify owner via SMS/Email/Dashboard notification
    }

    /**
     * Helpers
     */
    async storeExists(storeId) {
        const result = await this.dbPersistence.pool.query(
            'SELECT 1 FROM onboarding_batch_status WHERE store_id = $1 AND status = $2 LIMIT 1',
            [storeId, 'completed']
        );
        return result.rows.length > 0;
    }

    async findUnknownSKUs(storeId, data) {
        const existingMap = await this.dbPersistence.getExistingSKUs(storeId);
        return data.filter(item => {
            const skuId = item.store_item_id || item.sku_id || item.item_id;
            return skuId && !existingMap.has(skuId);
        });
    }

    async triggerInventoryAI(storeId, options = {}) {
        return this.inventoryAIAgent.analyzeStore(storeId, options);
    }

    /**
     * EOD (End of Day) CLOSING ROUTINE
     * Runs full AI analysis for the store, incorporating all changes from the day.
     * This should be called after the store closes or via scheduled job.
     */
    async runDailyClosingAnalysis(storeId) {
        console.log(`🏦 Orchestrator: Executing Daily Closing Analysis for ${storeId}...`);

        try {
            // Get all active SKUs for the store
            const allSKUs = await this.dbPersistence.pool.query(
                `SELECT store_item_id FROM store_sku_registry WHERE store_id = $1 AND status = 'active'`,
                [storeId]
            );

            const skuIds = allSKUs.rows.map(r => r.store_item_id);
            console.log(`📊 Analyzing ${skuIds.length} SKUs for daily closing...`);

            if (skuIds.length > 0) {
                // Emit STOCK_UPDATED event which triggers AI analysis
                await this.emit('STOCK_UPDATED', {
                    storeId,
                    skuIds,
                    reason: 'DAILY_CLOSING_ROUTINE'
                });
            }

            return {
                success: true,
                skusAnalyzed: skuIds.length,
                message: `Daily analysis complete. ${skuIds.length} products refreshed.`
            };
        } catch (error) {
            console.error(`❌ Daily closing failed:`, error.message);
            throw error;
        }
    }
}

module.exports = MasterOrchestrator;
