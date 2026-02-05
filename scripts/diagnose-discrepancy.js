const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

async function diagnose() {
    const storeId = 'demo-store';
    try {
        const invVal = await pool.query(`SELECT SUM(quantity_on_hand * cost_price) FROM v_latest_inventory WHERE store_id = $1`, [storeId]);
        const blockedCapTotal = await pool.query(`
            WITH latest_insights AS (
                SELECT DISTINCT ON (store_item_id)
                    ir.*,
                    inv.cost_price
                FROM inventory_recommendations ir
                JOIN v_latest_inventory inv ON ir.store_id = inv.store_id AND ir.store_item_id = inv.store_item_id
                WHERE ir.store_id = $1 AND ir.feedback_status IN ('PENDING', 'ACCEPTED', 'UPDATED')
                ORDER BY store_item_id, ir.generated_at DESC
            )
            SELECT 
                SUM(CASE WHEN insight_category = 'BUY_LESS' AND days_of_cover > 30 THEN current_stock * cost_price ELSE 0 END) as cash_blocked,
                COUNT(*) as total_active_recs,
                COUNT(CASE WHEN insight_category = 'BUY_LESS' THEN 1 END) as buy_less_count
            FROM latest_insights
        `, [storeId]);

        console.log('--- DIAGNOSIS ---');
        console.log('Total Inventory Value (Hub Query):', invVal.rows[0].sum);
        console.log('Blocked Capital (AI Query):', blockedCapTotal.rows[0].cash_blocked);
        console.log('Total Active Recommendations:', blockedCapTotal.rows[0].total_active_recs);
        console.log('BUY_LESS count:', blockedCapTotal.rows[0].buy_less_count);

        const duplicates = await pool.query(`
            SELECT store_item_id, COUNT(*) 
            FROM v_latest_inventory 
            WHERE store_id = $1 
            GROUP BY store_item_id 
            HAVING COUNT(*) > 1
        `, [storeId]);
        console.log('Duplicates in v_latest_inventory:', duplicates.rows.length);

        const irSample = await pool.query(`
            SELECT store_item_id, current_stock, days_of_cover 
            FROM inventory_recommendations 
            WHERE store_id = $1 AND insight_category = 'BUY_LESS' 
            LIMIT 5
        `, [storeId]);
        console.log('BUY_LESS Sample:', irSample.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

diagnose();
