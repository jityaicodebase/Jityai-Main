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
    // Count total rows
    const total = await pool.query('SELECT count(*) FROM inventory_recommendations');

    // Count rows with ADS > 0
    const valid = await pool.query('SELECT count(*) FROM inventory_recommendations WHERE weighted_ads > 0');

    console.log(`Total Recommendations: ${total.rows[0].count}`);
    console.log(`Recommendations with ADS > 0: ${valid.rows[0].count}`);

    if (valid.rows[0].count > 0) {
        // Show one example
        const example = await pool.query('SELECT store_item_id, weighted_ads, ads_30 FROM inventory_recommendations WHERE weighted_ads > 0 LIMIT 1');
        console.log('Example Valid Row:', example.rows[0]);
    }

    await pool.end();
}

check();
