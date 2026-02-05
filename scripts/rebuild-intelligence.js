const { Pool } = require('pg');
require('dotenv').config();
const InventoryAIAgent = require('../modules/inventory-ai-agent');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

async function rebuildAllIntelligence() {
    console.log('🚀 Starting System-Wide AI Re-Analysis (Intelligence Rebuild v3.0)...');
    const agent = new InventoryAIAgent(pool, { mode: 'ACTIVE' });

    try {
        // 1. Fetch all active stores
        const storesRes = await pool.query('SELECT store_id, store_name FROM store_settings');
        console.log(`📍 Found ${storesRes.rows.length} stores to analyze.`);

        for (const store of storesRes.rows) {
            const { store_id, store_name } = store;
            console.log(`\n---------------------------------------------------------`);
            console.log(`📦 ANALYZING STORE: ${store_name} (${store_id})`);

            // 2. Fetch all SKUs for this store
            const registry = await pool.query('SELECT store_item_id FROM store_sku_registry WHERE store_id = $1', [store_id]);
            const skuIds = registry.rows.map(r => r.store_item_id);

            if (skuIds.length === 0) {
                console.log(`⚠️ No SKUs found for ${store_id}. Skipping.`);
                continue;
            }

            console.log(`📊 Processing ${skuIds.length} SKUs...`);

            // 3. Trigger Batch Analysis
            // forceUpdate: true ensures it generates new recommendations even if the logic thinks nothing changed
            await agent.processBatch(store_id, skuIds, { forceUpdate: true });

            console.log(`✅ Completed analysis for ${store_name}.`);
        }

        console.log(`\n=========================================================`);
        console.log('✨ SYSTEM-WIDE ANALYSIS COMPLETE.');
        console.log('All legacy decision data has been replaced with v3.0 Math.');
        console.log(`=========================================================`);

    } catch (e) {
        console.error('❌ Re-Analysis Failed:', e);
    } finally {
        await pool.end();
    }
}

rebuildAllIntelligence();
