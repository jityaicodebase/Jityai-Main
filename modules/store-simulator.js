const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class StoreSimulator {
    constructor(pool) {
        this.pool = pool;
        this.realProductsPath = path.join(__dirname, '..', 'data', 'real_products.json');
    }

    /**
     * RESET & SIMULATE LARGE SCALE DEMO STORE WITH REAL DATA
     */
    async resetAndRunSimulation(storeId = 'demo-store') {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            console.log(`🎰 Resetting and starting REAL-WORLD simulation for: ${storeId}`);

            // Load real products
            let realProducts = [];
            if (fs.existsSync(this.realProductsPath)) {
                realProducts = JSON.parse(fs.readFileSync(this.realProductsPath, 'utf8'));
            } else {
                throw new Error("Real products dataset not found. Please run fetch_real_data.py first.");
            }

            const tables = [
                'inventory_recommendations', 'sales_transactions', 'onboarding_handoff',
                'store_sku_registry', 'onboarding_batch_status', 'validation_queue', 'mapping_change_requests'
            ];

            for (const table of tables) {
                await client.query(`DELETE FROM ${table} WHERE store_id = $1`, [storeId]);
            }

            const totalTargetSKUs = Math.min(1000, realProducts.length);
            const batchId = crypto.randomUUID();

            await client.query(`
                INSERT INTO onboarding_batch_status (
                    batch_id, store_id, store_name, batch_type, status, onboarding_date, total_items
                ) VALUES ($1, $2, $3, 'full_onboarding', 'completed', CURRENT_TIMESTAMP, $4)
            `, [batchId, storeId, 'JityAi Demo Supermarket', totalTargetSKUs]);

            // Shuffle and pick target count
            const shuffled = realProducts.sort(() => 0.5 - Math.random());
            const targetProducts = shuffled.slice(0, totalTargetSKUs).map((p, idx) => ({
                ...p,
                skuId: `SKU-${10000 + idx}`
            }));

            // 1. Registry Insertion
            const registryChunkSize = 500;
            for (let i = 0; i < targetProducts.length; i += registryChunkSize) {
                const chunk = targetProducts.slice(i, i + registryChunkSize);
                let query = `INSERT INTO store_sku_registry (
                    store_id, store_item_id, original_product_name, normalized_product_name,
                    master_category_id, master_category_name, status, normalized_unit, 
                    mapping_confidence, mapping_method, onboarding_batch_id
                ) VALUES `;
                const params = [];
                let pIdx = 1;

                chunk.forEach((p, idx) => {
                    query += `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, 'active', 'pcs', 1.0, 'scraped_catalog', $${pIdx++})${idx === chunk.length - 1 ? '' : ','}`;
                    params.push(storeId, p.skuId, p.name, p.name, 'CAT_REAL', p.category, batchId);
                });
                await client.query(query, params);
            }

            // 2. Data Generation
            const salesHistory = [];
            const inventoryHistory = [];

            for (const p of targetProducts) {
                // Assign a velocity profile
                const velocityType = Math.random() > 0.85 ? 'FAST' : Math.random() > 0.4 ? 'MEDIUM' : 'SLOW';
                const avgDailySales = velocityType === 'FAST' ? 10 + Math.random() * 20 :
                    velocityType === 'MEDIUM' ? 3 + Math.random() * 7 :
                        0.5 + Math.random() * 2;

                const profile = { type: velocityType, avgDailySales };
                const sales = this.generateSalesHistory(p.skuId, p.price, profile, 30);
                salesHistory.push(...sales);

                // Current inventory logic
                let currentStock = 0;
                const scenario = Math.random();
                if (scenario < 0.15) {
                    currentStock = Math.floor(avgDailySales * 0.5); // Critical
                } else if (scenario < 0.30) {
                    currentStock = Math.floor(avgDailySales * 2); // Low
                } else if (velocityType === 'SLOW' && Math.random() > 0.5) {
                    currentStock = Math.floor(avgDailySales * 60); // Overstock
                } else {
                    currentStock = Math.floor(avgDailySales * (10 + Math.random() * 15));
                }

                inventoryHistory.push({ skuId: p.skuId, qty: currentStock, price: p.price, cost: p.cost });
            }

            // 3. Batch Insert Sales
            const salesChunkSize = 2000;
            for (let i = 0; i < salesHistory.length; i += salesChunkSize) {
                const chunk = salesHistory.slice(i, i + salesChunkSize);
                let query = 'INSERT INTO sales_transactions (store_id, store_item_id, transaction_date, transaction_timestamp, quantity_sold, selling_price, revenue, source_transaction_id) VALUES ';
                const params = [];
                let pIdx = 1;

                chunk.forEach((h, idx) => {
                    const revenue = h.qty * h.price;
                    const txId = `POS-${h.skuId}-${h.date}-${Math.random().toString(36).slice(2, 6)}`;
                    query += `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})${idx === chunk.length - 1 ? '' : ','}`;
                    params.push(storeId, h.skuId, h.date, h.date, h.qty, h.price, revenue, txId);
                });
                await client.query(query, params);
            }

            // 4. Batch Insert Inventory
            const invChunkSize = 1000;
            for (let i = 0; i < inventoryHistory.length; i += invChunkSize) {
                const chunk = inventoryHistory.slice(i, i + invChunkSize);
                let query = `INSERT INTO onboarding_handoff (
                    store_id, store_item_id, quantity_on_hand, unit, selling_price, cost_price,
                    as_of_date, source, onboarding_batch_id
                ) VALUES `;
                const params = [];
                let pIdx = 1;

                chunk.forEach((item, idx) => {
                    query += `($${pIdx++}, $${pIdx++}, $${pIdx++}, 'pcs', $${pIdx++}, $${pIdx++}, CURRENT_TIMESTAMP, 'full_onboarding', $${pIdx++})${idx === chunk.length - 1 ? '' : ','}`;
                    params.push(storeId, item.skuId, item.qty, item.price, item.cost, batchId);
                });
                await client.query(query, params);
            }

            await client.query('COMMIT');
            console.log(`✅ Real-world simulation complete. Seeded ${totalTargetSKUs} authentic SKUs.`);

            return { success: true, storeId, totalSKUs: totalTargetSKUs, transactionsGenerated: salesHistory.length };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    generateSalesHistory(skuId, price, profile, days) {
        const history = [];
        const today = new Date();
        for (let i = 1; i <= days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            let qty = 0;
            const surge = (date.getDay() === 0 || date.getDay() === 6) ? 1.7 : 1.0;

            // Randomly skip days for slow items
            if (Math.random() > (profile.type === 'SLOW' ? 0.9 : 0.05)) {
                const variation = (Math.random() * 0.6) + 0.7; // 0.7 to 1.3
                qty = Math.round(profile.avgDailySales * variation * surge);
                if (qty < 1 && profile.type !== 'SLOW') qty = 1;
            }
            if (qty > 0) history.push({ skuId, date: dateStr, qty, price });
        }
        return history;
    }
}

module.exports = StoreSimulator;
