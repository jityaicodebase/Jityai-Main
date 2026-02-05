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

async function rebuildDemoStoreIntelligence() {
    const storeId = 'demo-store';
    console.log(`🚀 Starting AI Re-Analysis for ${storeId} (v3.0)...`);
    const agent = new InventoryAIAgent(pool, { mode: 'ACTIVE' });

    try {
        console.log(`📦 ANALYZING STORE: demo-store`);

        // 1. Fetch all SKUs for this store
        const registry = await pool.query('SELECT store_item_id FROM store_sku_registry WHERE store_id = $1', [storeId]);
        const skuIds = registry.rows.map(r => r.store_item_id);

        if (skuIds.length === 0) {
            console.log(`⚠️ No SKUs found for ${storeId}.`);
            return;
        }

        console.log(`📊 Processing ${skuIds.length} SKUs...`);

        // 2. Trigger Batch Analysis
        // forceUpdate: true ensures it generates new recommendations even if the logic thinks nothing changed
        await agent.processBatch(storeId, skuIds, { forceUpdate: true });

        console.log(`\n✨ DEMO STORE ANALYSIS COMPLETE.`);
        console.log('All legacy decision data has been replaced with v3.0 Math.');

    } catch (e) {
        console.error('❌ Re-Analysis Failed:', e);
    } finally {
        await pool.end();
    }
}

rebuildDemoStoreIntelligence();
