/**
 * INCREMENTAL SYNC AGENT
 * 
 * Responsibilities:
 * - Update inventory quantities and prices
 * - Validate SKUs against existing registry
 * - Append-only inventory snapshots
 * - Escalate unknown SKUs to onboarding
 * 
 * FORBIDDEN:
 * - Never modify SKU identity
 * - Never categorize products
 * - Never normalize names
 */

const crypto = require('crypto');

class IncrementalSyncAgent {
    constructor(dbPersistence, eventCallback = null) {
        this.dbPersistence = dbPersistence;
        this.eventCallback = eventCallback; // For triggering post-sync events
    }

    /**
     * Main sync entry point
     * Supports three modes: POS events, CSV deltas, Manual uploads
     */
    async sync(storeId, updates, options = {}) {
        const syncRunId = options.syncRunId || crypto.randomUUID();
        const syncType = options.syncType || 'incremental_inventory';
        const dataSource = options.dataSource || 'manual_upload';
        const timestamp = new Date().toISOString();

        console.log(`\n🔄 Starting Incremental Sync: ${syncRunId}`);
        console.log(`   Store: ${storeId}`);
        console.log(`   Updates: ${updates.length}`);
        console.log(`   Type: ${syncType}\n`);

        try {
            // STEP 1: Validate all SKUs exist in registry
            const validation = await this.validateSKUs(storeId, updates);

            if (validation.unknownSKUs.length > 0) {
                console.warn(`⚠️  Found ${validation.unknownSKUs.length} unknown SKUs`);

                // NEW: Escalate unknown SKUs - stop sync and trigger onboarding
                await this.escalateUnknownSKUs(storeId, validation.unknownSKUs, syncRunId);

                // Return error to trigger owner notification
                throw new Error(
                    `Cannot sync: ${validation.unknownSKUs.length} unknown SKU(s) detected. ` +
                    `These items need to be onboarded first: ${validation.unknownSKUs.map(s => s.store_item_id).join(', ')}`
                );
            }

            // STEP 2: Build inventory snapshots (append-only)
            const inventorySnapshots = await this.buildInventorySnapshots(
                storeId,
                validation.validUpdates,
                timestamp,
                dataSource
            );

            // STEP 3: Save to database
            if (this.dbPersistence && inventorySnapshots.length > 0) {
                await this.saveInventorySnapshots(storeId, inventorySnapshots, syncRunId);

                // NEW: Record batch status so dashboard updates
                await this.dbPersistence.pool.query(`
                    INSERT INTO onboarding_batch_status (
                        batch_id, store_id, batch_type, status, 
                        started_at, completed_at, total_items
                    ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
                    ON CONFLICT (batch_id) DO UPDATE SET
                        status = 'completed',
                        completed_at = CURRENT_TIMESTAMP,
                        total_items = $6
                `, [syncRunId, storeId, 'incremental_update', 'completed', timestamp, inventorySnapshots.length]);
            }

            // STEP 4: Build sync summary
            const summary = this.buildSyncSummary(
                syncRunId,
                storeId,
                validation,
                inventorySnapshots,
                syncType
            );

            console.log(`✅ Sync complete: ${inventorySnapshots.length} records written\n`);

            // STEP 5: Trigger post-sync events (sales extraction, AI analysis)
            if (this.eventCallback) {
                const affectedSKUs = validation.validUpdates.map(u => u.store_item_id);
                setImmediate(() => {
                    this.eventCallback(storeId, syncRunId, affectedSKUs).catch(err => {
                        console.error('Post-sync event callback failed:', err);
                    });
                });
            }

            return summary;

        } catch (error) {
            console.error('❌ Incremental sync failed:', error);
            throw error;
        }
    }

    /**
     * STEP 1: Validate SKUs against registry
     */
    async validateSKUs(storeId, updates) {
        if (!this.dbPersistence) {
            // No database - assume all are valid (testing mode)
            return {
                validUpdates: updates,
                unknownSKUs: []
            };
        }

        try {
            // Get existing SKUs from registry
            const existingSKUMap = await this.dbPersistence.getExistingSKUs(storeId);

            const validUpdates = [];
            const unknownSKUs = [];

            for (const update of updates) {
                const skuId = update.store_item_id || update.sku_id || update.item_id;

                if (!skuId) {
                    console.warn('⚠️  Update missing SKU ID:', update);
                    continue;
                }

                if (existingSKUMap.has(skuId)) {
                    validUpdates.push({
                        ...update,
                        store_item_id: skuId
                    });
                } else {
                    unknownSKUs.push({
                        store_item_id: skuId,
                        issue: 'UNKNOWN_SKU',
                        suggested_action: 'RUN_ONBOARDING',
                        raw_data: update
                    });
                }
            }

            return { validUpdates, unknownSKUs };

        } catch (error) {
            console.warn('⚠️  SKU validation failed, proceeding with all updates:', error.message);
            return {
                validUpdates: updates,
                unknownSKUs: []
            };
        }
    }

    /**
     * STEP 2: Build inventory snapshots (append-only)
     * IMPORTANT: Preserve existing values for fields not being updated
     */
    async buildInventorySnapshots(storeId, updates, timestamp, dataSource) {
        // Get current inventory state for all SKUs
        const currentState = await this.getCurrentInventoryState(storeId, updates);

        // 1. Aggregation Phase: Group updates by SKU to calculate Net Effect
        const skuAggregates = new Map();

        updates.forEach(update => {
            const skuId = update.store_item_id;
            if (!skuId) return;

            if (!skuAggregates.has(skuId)) {
                // Initialize aggregate tracking
                skuAggregates.set(skuId, {
                    delta: 0,
                    absoluteQty: null,
                    sellingPrice: null,
                    costPrice: null,
                    mainTransactionType: null
                });
            }

            const agg = skuAggregates.get(skuId);
            const qtyStr = String(update.quantity_on_hand || update.quantity || update.qty || 0);
            const qtyVal = parseFloat(qtyStr);
            const transType = (update.transaction_type || 'ADJUSTMENT').toUpperCase();

            // Update prices if provided (Last write wins logic)
            if (update.selling_price) agg.sellingPrice = update.selling_price;
            if (update.cost_price) agg.costPrice = update.cost_price;

            // --- SMART QUANTITY LOGIC ---

            // Normalize qty string for detection
            const trimmedQty = qtyStr.trim();
            const startsWithSign = trimmedQty.startsWith('+') || trimmedQty.startsWith('-');

            // Case A: Sales Data (DEDUCTION)
            if (transType === 'SALE' || transType === 'SOLD') {
                agg.delta -= Math.abs(qtyVal); // Ensure we subtract
                agg.mainTransactionType = 'BULK_SALE_IMPORT';
            }
            // Case B: Returns (ADDITION)
            else if (transType === 'RETURN') {
                agg.delta += Math.abs(qtyVal); // Ensure we add
                agg.mainTransactionType = 'BULK_RETURN_IMPORT';
            }
            // Case C: Explicit Deltas (Detected by leading + or specific intention)
            // We treat a leading '+' as an explicit delta. 
            // We only treat a leading '-' as a delta if it's NOT a standard numeric format or if transType is MOVE/ADJUST
            else if (trimmedQty.startsWith('+')) {
                agg.delta += qtyVal;
                agg.mainTransactionType = transType;
            }
            // Case D: Absolute Stock Take (DEFAULT)
            else {
                // For absolute stock, we clamp negatives to 0 to prevent broken AI math
                // Negative stock in a POS usually means "out of stock" or "error"
                agg.absoluteQty = Math.max(0, qtyVal);
                agg.mainTransactionType = transType;
            }
        });

        // 2. Snapshot Generation Phase
        return Array.from(skuAggregates.entries()).map(([skuId, agg]) => {
            const current = currentState.get(skuId) || { quantity_on_hand: 0, selling_price: 0, cost_price: 0 };

            // Determine Final Quantity
            let finalQuantity = current.quantity_on_hand;

            if (agg.absoluteQty !== null) {
                // Absolute overwrite (Stock Take) takes precedence
                finalQuantity = agg.absoluteQty;
            } else {
                // Apply deltas (Sales, Returns, Adjustments)
                finalQuantity += agg.delta;
            }

            // Fallback for prices
            const finalSellingPrice = agg.sellingPrice !== null ? agg.sellingPrice : current.selling_price;
            const finalCostPrice = agg.costPrice !== null ? agg.costPrice : current.cost_price;

            // Generate robust ID for this batch op
            const batchTransactionId = `${storeId}-${skuId}-${timestamp}-AGGREGATED`;

            return {
                store_item_id: skuId,
                quantity_on_hand: finalQuantity,
                selling_price: finalSellingPrice,
                cost_price: finalCostPrice,
                transaction_type: agg.mainTransactionType || 'ADJUSTMENT',
                transaction_id: batchTransactionId,
                as_of_timestamp: timestamp,
                data_source: dataSource
            };
        });
    }

    /**
     * Get current inventory state for SKUs
     */
    async getCurrentInventoryState(storeId, updates) {
        if (!this.dbPersistence) {
            return new Map();
        }

        const skuIds = updates.map(u => u.store_item_id).filter(Boolean);

        if (skuIds.length === 0) {
            return new Map();
        }

        try {
            const result = await this.dbPersistence.pool.query(`
                SELECT DISTINCT ON (store_item_id)
                    store_item_id,
                    quantity_on_hand,
                    selling_price,
                    cost_price
                FROM onboarding_handoff
                WHERE store_id = $1 AND store_item_id = ANY($2)
                ORDER BY store_item_id, as_of_date DESC
            `, [storeId, skuIds]);

            const stateMap = new Map();
            result.rows.forEach(row => {
                stateMap.set(row.store_item_id, {
                    quantity_on_hand: parseFloat(row.quantity_on_hand) || 0,
                    selling_price: parseFloat(row.selling_price) || null,
                    cost_price: parseFloat(row.cost_price) || null
                });
            });

            return stateMap;
        } catch (error) {
            console.warn('⚠️  Could not fetch current state:', error.message);
            return new Map();
        }
    }

    /**
     * STEP 3: Save inventory snapshots to database
     * NEW: Idempotency enforcement via transaction_id
     */
    async saveInventorySnapshots(storeId, snapshots, syncRunId) {
        const client = await this.dbPersistence.pool.connect();

        try {
            await client.query('BEGIN');

            let savedCount = 0;
            let skippedCount = 0;

            for (const snapshot of snapshots) {
                try {
                    // Create a savepoint to isolate this insert
                    // This creates a nested transaction scope so errors don't kill the main transaction
                    await client.query('SAVEPOINT sp_insert');

                    const result = await client.query(`
                        INSERT INTO onboarding_handoff (
                            store_id, store_item_id,
                            quantity_on_hand, unit,
                            selling_price, cost_price,
                            as_of_date, source,
                            onboarding_batch_id,
                            transaction_type, transaction_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (store_id, store_item_id, transaction_id) 
                        WHERE transaction_id IS NOT NULL
                        DO NOTHING
                    `, [
                        storeId,
                        snapshot.store_item_id,
                        snapshot.quantity_on_hand,
                        'pcs',
                        snapshot.selling_price,
                        snapshot.cost_price,
                        snapshot.as_of_timestamp,
                        snapshot.data_source,
                        syncRunId,
                        snapshot.transaction_type || 'ADJUSTMENT',
                        snapshot.transaction_id
                    ]);

                    if (result.rowCount > 0) {
                        savedCount++;
                    } else {
                        skippedCount++;
                        console.log(`⏭️  Skipped duplicate transaction: ${snapshot.transaction_id}`);
                    }

                    // Success - release the savepoint (cleanup)
                    await client.query('RELEASE SAVEPOINT sp_insert');

                } catch (error) {
                    // Failure - rollback to savepoint to restore transaction state
                    await client.query('ROLLBACK TO SAVEPOINT sp_insert');

                    // Handle unique constraint violation gracefully
                    if (error.code === '23505') { // Duplicate key
                        skippedCount++;
                        console.log(`⏭️  Idempotency: Transaction ${snapshot.transaction_id} already processed (Constraint: ${error.constraint})`);
                    } else {
                        console.error(`❌ Failed to save snapshot for ${snapshot.store_item_id}:`, error.message);
                        throw error; // Re-throw fatal errors
                    }
                }
            }

            await client.query('COMMIT');
            console.log(`💾 Saved ${savedCount} inventory snapshots (${skippedCount} duplicates skipped)`);

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Failed to save inventory snapshots:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * NEW: Escalate unknown SKUs to onboarding queue
     */
    async escalateUnknownSKUs(storeId, unknownSKUs, syncRunId) {
        if (!this.dbPersistence || unknownSKUs.length === 0) {
            return;
        }

        console.log(`🚨 Escalating ${unknownSKUs.length} unknown SKUs to onboarding queue...`);

        try {
            for (const sku of unknownSKUs) {
                await this.dbPersistence.pool.query(`
                    INSERT INTO unknown_sku_escalation_queue (
                        store_id, store_item_id, product_name, 
                        raw_data, escalation_status, notified_owner
                    ) VALUES ($1, $2, $3, $4, 'pending', false)
                    ON CONFLICT DO NOTHING
                `, [
                    storeId,
                    sku.store_item_id,
                    sku.raw_data?.product_name || 'Unknown Product',
                    JSON.stringify(sku.raw_data || {})
                ]);
            }

            console.log(`✅ Unknown SKUs escalated successfully`);
        } catch (error) {
            console.error('⚠️  Failed to escalate unknown SKUs:', error.message);
            // Don't throw - escalation failure shouldn't block the error reporting
        }
    }

    /**
     * STEP 4: Build sync summary
     */
    buildSyncSummary(syncRunId, storeId, validation, snapshots, syncType) {
        const actions = snapshots.map(snapshot => {
            const qty = snapshot.quantity_on_hand;
            let action = 'STOCK_UPDATED';

            if (qty > 0) action = 'STOCK_INCREASED';
            if (qty < 0) action = 'STOCK_DECREASED';

            return {
                store_item_id: snapshot.store_item_id,
                action: action,
                quantity_delta: qty
            };
        });

        return {
            sync_run_id: syncRunId,
            store_id: storeId,
            sync_type: syncType,
            records_written: snapshots.length,
            unknown_skus_detected: validation.unknownSKUs.length,
            actions: actions,
            warnings: validation.unknownSKUs
        };
    }
}

module.exports = IncrementalSyncAgent;
