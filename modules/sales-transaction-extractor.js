/**
 * Sales Transaction Extractor
 * Derives sales transactions from inventory snapshot deltas
 */

const { Pool } = require('pg');

class SalesTransactionExtractor {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Extract sales transactions from inventory snapshots
     * Called after incremental sync completes
     */
    async extractFromSync(storeId, syncRunId) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get all SKUs affected in this sync
            const affectedSKUs = await this.getAffectedSKUs(client, storeId, syncRunId);

            let extractedCount = 0;

            for (const sku of affectedSKUs) {
                const transactions = await this.extractSKUTransactions(
                    client,
                    storeId,
                    sku.store_item_id,
                    syncRunId
                );

                extractedCount += transactions.length;
            }

            await client.query('COMMIT');

            return { extractedCount };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get SKUs affected in sync run
     */
    async getAffectedSKUs(client, storeId, syncRunId) {
        const query = `
            SELECT DISTINCT store_item_id
            FROM onboarding_handoff
            WHERE store_id = $1 
            AND onboarding_batch_id = $2
        `;
        const result = await client.query(query, [storeId, syncRunId]);
        return result.rows;
    }

    /**
     * Extract sales transactions for a single SKU
     */
    async extractSKUTransactions(client, storeId, storeItemId, syncRunId) {
        // Get last two snapshots for this SKU
        const snapshotQuery = `
            SELECT 
                quantity_on_hand,
                selling_price,
                as_of_date,
                transaction_id,
                transaction_type
            FROM onboarding_handoff
            WHERE store_id = $1 AND store_item_id = $2
            ORDER BY as_of_date DESC
            LIMIT 2
        `;
        const snapshots = await client.query(snapshotQuery, [storeId, storeItemId]);

        if (snapshots.rows.length < 2) {
            return []; // Need at least 2 snapshots to calculate delta
        }

        const [current, previous] = snapshots.rows;

        // If transaction_type is explicitly SALE, use it directly
        if (current.transaction_type === 'SALE') {
            const quantitySold = parseFloat(previous.quantity_on_hand) - parseFloat(current.quantity_on_hand);

            if (quantitySold > 0) {
                await this.insertSalesTransaction(client, {
                    storeId,
                    storeItemId,
                    transactionDate: current.as_of_date,
                    quantitySold,
                    sellingPrice: parseFloat(current.selling_price),
                    sourceTransactionId: current.transaction_id,
                    sourceSyncRunId: syncRunId
                });

                return [{ quantitySold, date: current.as_of_date }];
            }
        }

        // Otherwise, infer from quantity decrease
        const qtyDelta = parseFloat(previous.quantity_on_hand) - parseFloat(current.quantity_on_hand);

        if (qtyDelta > 0 && !current.transaction_type) {
            // Quantity decreased without explicit type = likely a sale
            await this.insertSalesTransaction(client, {
                storeId,
                storeItemId,
                transactionDate: current.as_of_date,
                quantitySold: qtyDelta,
                sellingPrice: parseFloat(current.selling_price),
                sourceTransactionId: current.transaction_id || `inferred-${current.as_of_date}`,
                sourceSyncRunId: syncRunId
            });

            return [{ quantitySold: qtyDelta, date: current.as_of_date }];
        }

        return [];
    }

    /**
     * Insert sales transaction (with deduplication)
     */
    async insertSalesTransaction(client, data) {
        const query = `
            INSERT INTO sales_transactions (
                store_id, store_item_id,
                transaction_date, transaction_timestamp,
                quantity_sold, selling_price, revenue,
                source_sync_run_id, source_transaction_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (store_id, store_item_id, source_transaction_id) DO NOTHING
        `;

        const revenue = data.quantitySold * data.sellingPrice;

        await client.query(query, [
            data.storeId,
            data.storeItemId,
            data.transactionDate,
            data.transactionDate, // Use date as timestamp for now
            data.quantitySold,
            data.sellingPrice,
            revenue,
            data.sourceSyncRunId,
            data.sourceTransactionId
        ]);
    }
}

module.exports = SalesTransactionExtractor;
