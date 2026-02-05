const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

async function checkRec() {
    const skuId = 'SKU-10003';
    console.log(`Checking SKU: ${skuId}`);

    const res = await pool.query(`
        SELECT 
            store_item_id, 
            recommendation_type, 
            current_stock, 
            weighted_ads,
            generated_at,
            feedback_status
        FROM inventory_recommendations 
        WHERE store_id = 'demo-store' 
        AND store_item_id = $1
    `, [skuId]);

    console.log('Recommendation in DB:', res.rows[0]);
    await pool.end();
}

checkRec();
