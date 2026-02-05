const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: '101914', database: 'ai_store_manager' });

async function check() {
    try {
        const res = await pool.query("SELECT recommendation_id, store_id, store_item_id, feedback_status, processed_at FROM inventory_recommendations WHERE feedback_status = 'ACCEPTED' ORDER BY processed_at DESC");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
