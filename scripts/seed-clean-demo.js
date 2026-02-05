const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

const realProductsPath = path.join(__dirname, '..', 'data', 'real_products.json');

async function seedCleanDemo() {
    const storeId = 'demo-store';
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        console.log(`🧹 Cleaning existing data for ${storeId}...`);

        const tablesToRemove = [
            'inventory_recommendations',
            'sales_transactions',
            'inventory_ai_runs',
            'inventory_alerts',
            'purchase_orders',
            'purchase_order_items',
            'onboarding_handoff',
            'store_sku_registry',
            'onboarding_batch_status'
        ];

        for (const table of tablesToRemove) {
            await client.query(`DELETE FROM ${table} WHERE store_id = $1`, [storeId]);
        }

        console.log(`📦 Loading real product catalog...`);
        let realProducts = [];
        if (fs.existsSync(realProductsPath)) {
            realProducts = JSON.parse(fs.readFileSync(realProductsPath, 'utf8'));
        } else {
            throw new Error("Real products dataset not found.");
        }

        const totalTargetSKUs = 1000;
        const shuffled = realProducts.sort(() => 0.5 - Math.random());
        const selectedProducts = shuffled.slice(0, totalTargetSKUs).map((p, idx) => ({
            ...p,
            skuId: `SKU-${10000 + idx}`
        }));

        const batchId = crypto.randomUUID();
        await client.query(`
            INSERT INTO onboarding_batch_status (
                batch_id, store_id, store_name, batch_type, status, onboarding_date, total_items
            ) VALUES ($1, $2, $3, 'full_onboarding', 'completed', CURRENT_TIMESTAMP, $4)
        `, [batchId, storeId, 'Authentic Gourmet Store', totalTargetSKUs]);

        console.log(`📝 Inserting SKU registry...`);
        const registryChunkSize = 250;
        for (let i = 0; i < selectedProducts.length; i += registryChunkSize) {
            const chunk = selectedProducts.slice(i, i + registryChunkSize);
            let query = `INSERT INTO store_sku_registry (
                store_id, store_item_id, original_product_name, normalized_product_name,
                master_category_id, master_category_name, status, normalized_unit, 
                mapping_confidence, mapping_method, onboarding_batch_id, cost_price, selling_price
            ) VALUES `;
            const params = [];
            let pIdx = 1;

            chunk.forEach((p, idx) => {
                query += `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, 'active', 'pcs', 1.0, 'scraped_catalog', $${pIdx++}, $${pIdx++}, $${pIdx++})${idx === chunk.length - 1 ? '' : ','}`;
                params.push(storeId, p.skuId, p.name, p.name, 'CAT_REAL', p.category || 'Gourmet', batchId, p.cost, p.price);
            });
            await client.query(query, params);
        }

        console.log(`📈 Generating sales history & realistic inventory (Target: ₹2 Crore)...`);
        const salesHistory = [];
        const inventoryHistory = [];
        let totalValue = 0;

        for (const p of selectedProducts) {
            // Velocity Profile
            const rand = Math.random();
            const velocityType = rand > 0.85 ? 'FAST' : rand > 0.40 ? 'MEDIUM' : 'SLOW';
            const avgDailySales = velocityType === 'FAST' ? 8 + Math.random() * 12 :
                velocityType === 'MEDIUM' ? 2 + Math.random() * 4 :
                    0.1 + Math.random() * 1;

            // Generate 30 days of sales
            const days = 30;
            const today = new Date();
            for (let d = 1; d <= days; d++) {
                const date = new Date(today);
                date.setDate(date.getDate() - d);
                const dateStr = date.toISOString().split('T')[0];

                let qty = 0;
                const surge = (date.getDay() === 0 || date.getDay() === 6) ? 1.5 : 1.0;

                if (Math.random() > (velocityType === 'SLOW' ? 0.8 : 0.05)) {
                    const variation = (Math.random() * 0.4) + 0.8; // 0.8 to 1.2
                    qty = Math.round(avgDailySales * variation * surge);
                    if (qty < 1 && velocityType !== 'SLOW') qty = 1;
                }

                if (qty > 0) {
                    salesHistory.push({
                        skuId: p.skuId,
                        date: dateStr,
                        qty,
                        price: p.price
                    });
                }
            }

            // Current Stock Logic (Realistic Store Levels)
            let currentStock = 0;
            const stockScenario = Math.random();

            if (stockScenario < 0.10) {
                // Stock Out / Critical
                currentStock = Math.floor(avgDailySales * (1 + Math.random() * 2));
            } else if (stockScenario < 0.25) {
                // High Overstock (Cash blocked scenario)
                currentStock = Math.floor(avgDailySales * (45 + Math.random() * 20));
            } else {
                // Healthy (10-20 days cover)
                currentStock = Math.floor(avgDailySales * (12 + Math.random() * 8));
            }

            // Cap extremely expensive items to keep value around ₹2Cr
            if (totalValue > 19000000 && p.cost > 500) {
                currentStock = Math.floor(currentStock * 0.5);
            }

            totalValue += (currentStock * p.cost);
            inventoryHistory.push({ skuId: p.skuId, qty: currentStock, price: p.price, cost: p.cost });
        }

        console.log(`💸 Total Simulated Inventory Value: ₹${Math.round(totalValue).toLocaleString('en-IN')}`);

        // Batch Insert Sales
        const salesChunkSize = 1000;
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

        // Batch Insert Inventory
        const invChunkSize = 500;
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
        console.log(`✅ Demo Store simulation refreshed successfully.`);
        console.log(`📈 Transactions Generated: ${salesHistory.length}`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Failed to refresh simulation:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

seedCleanDemo();
