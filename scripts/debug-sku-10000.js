
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

async function run() {
    try {
        console.log("Fetching data for SKU-10000...");

        // 3. Audit Query: Find rows where RecQty deviates from (Target - Stock) logic
        const auditRes = await pool.query(`
            SELECT store_item_id, 
                   weighted_ads, 
                   protection_window, 
                   current_stock, 
                   recommended_order_quantity,
                   (weighted_ads * protection_window) as target_calc,
                   ((weighted_ads * protection_window) - current_stock) as theoretical_gap
            FROM inventory_recommendations
            WHERE action_bucket = 'BUY_MORE'
            AND ABS(recommended_order_quantity - CEIL(GREATEST(0, (weighted_ads * protection_window) - current_stock))) > 1.0
            LIMIT 10
        `);

        console.log("Found " + auditRes.rows.length + " violations.");
        if (auditRes.rows.length > 0) {
            console.log("VIOLATIONS:", JSON.stringify(auditRes.rows, null, 2));
        } else {
            console.log("✅ No math violations found in sample.");
        }

    } catch (err) {
        console.error("Query Error:", err);
    } finally {
        await pool.end();
    }
}

run();
