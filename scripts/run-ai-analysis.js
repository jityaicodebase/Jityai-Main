const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

const InventoryAIAgent = require('../modules/inventory-ai-agent');

async function runFullAnalysis() {
    const storeId = 'demo-store';
    console.log(`🤖 Running Full AI Analysis for ${storeId}...`);

    const agent = new InventoryAIAgent(pool, { mode: 'ACTIVE' });

    try {
        // Run full batch processing
        // We fetch ALL SKUs for the store
        const registry = await pool.query('SELECT store_item_id FROM store_sku_registry WHERE store_id = $1', [storeId]);
        const skuIds = registry.rows.map(r => r.store_item_id);

        console.log(`📦 Found ${skuIds.length} SKUs to analyze.`);

        // Force update to prove LLM usage
        await agent.processBatch(storeId, skuIds, { forceUpdate: true });

        // Check results - Entity State (Latest Active Recommendation per SKU)
        const recs = await pool.query(`
            WITH latest_state AS (
                SELECT DISTINCT ON (store_item_id)
                    insight_category
                FROM inventory_recommendations 
                WHERE store_id = $1 
                AND feedback_status IN ('PENDING', 'ACCEPTED', 'UPDATED')
                ORDER BY store_item_id, generated_at DESC
            )
            SELECT COUNT(*) as count, insight_category 
            FROM latest_state
            GROUP BY insight_category
        `, [storeId]);

        console.log('\n✅ Analysis Complete. Current Snapshot (Latest Active Insights):');
        recs.rows.forEach(r => console.log(`   ${r.insight_category || 'UNKNOWN'}: ${r.count}`));

        const totalActive = recs.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
        console.log(`   -------------------`);
        console.log(`   Total Actionable: ${totalActive} SKUs`);

    } catch (e) {
        console.error('❌ AI Analysis Failed:', e.message);
    } finally {
        await pool.end();
    }
}

runFullAnalysis();
