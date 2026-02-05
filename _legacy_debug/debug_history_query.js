const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: '101914', database: 'ai_store_manager' });

async function check() {
    try {
        const storeId = 'demo-store';
        const result = await pool.query(`
            SELECT 
                ir.*, 
                sr.normalized_product_name,
                inv.quantity_on_hand as current_stock_actual,
                inv.as_of_date as current_as_of
            FROM inventory_recommendations ir
            JOIN store_sku_registry sr ON ir.store_id = sr.store_id AND ir.store_item_id = sr.store_item_id
            LEFT JOIN v_latest_inventory inv ON ir.store_id = inv.store_id AND ir.store_item_id = inv.store_item_id
            WHERE ir.store_id = $1 AND ir.feedback_status IN ('ACCEPTED', 'REJECTED', 'IGNORED')
            ORDER BY ir.processed_at DESC
            LIMIT 50
        `, [storeId]);
        console.log('Results count:', result.rows.length);
        if (result.rows.length > 0) {
            console.log(JSON.stringify(result.rows[0], null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
