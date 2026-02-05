const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

async function inject() {
    const storeId = 'demo-store';
    const skuId = 'SKU-10033'; // Cadbury 5 Star Oreo

    console.log(`Injecting sales for ${skuId}...`);

    // Inject 1 sale per day for last 5 days
    for (let i = 1; i <= 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        await pool.query(`
            INSERT INTO sales_transactions 
            (transaction_id, store_id, store_item_id, transaction_date, transaction_timestamp, quantity_sold, selling_price, revenue)
            VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 1, 20.00, 20.00)
        `, [storeId, skuId, date]);
    }

    console.log('✅ Injected 5 sales transactions.');
    await pool.end();
}

inject();
