const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

async function check() {
    try {
        const res = await pool.query(`
            SELECT transaction_date, quantity_sold, store_item_id 
            FROM sales_transactions 
            WHERE store_id = 'demo-store' 
            ORDER BY transaction_date DESC 
            LIMIT 5
        `);
        console.log('Recent Sales:', res.rows);

        const count = await pool.query(`SELECT COUNT(*) FROM sales_transactions WHERE store_id = 'demo-store'`);
        console.log('Total Sales Records:', count.rows[0].count);

        // Check specifically for Cadbury 5 Star if possible (guess ID or name)
        // store_item_id usually matches SKU in demo
        const cadbury = await pool.query(`
            SELECT * FROM sales_transactions 
            WHERE store_id = 'demo-store' 
            AND store_item_id = 'SKU-10033'
            ORDER BY transaction_date DESC
            LIMIT 5
        `);
        console.log('SKU-10033 Latest Sales:', cadbury.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
