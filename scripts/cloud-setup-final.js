/**
 * CLOUD DATA HARMONIZER (FINAL SETUP)
 * 
 * Purpose: 
 * Ensures the raw imported data is "Live" and visible on the Dashboard.
 * 1. Sets all SKUs to 'active' status.
 * 2. Updates Inventory Snapshots to CURRENT_DATE so they aren't filtered out.
 * 3. Refreshes basic stats.
 */

require('dotenv').config();
const { Pool } = require('pg');

const DB_CONFIG = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_HOST === 'localhost' ? false : { rejectUnauthorized: false }
};

async function harmonizeData() {
    console.log("🔧 STARTING CLOUD DATA HARMONIZATION...");
    const pool = new Pool(DB_CONFIG);

    try {
        const storeId = 'demo-store';

        // 1. Force SKUs Active
        console.log("   👉 setting SKUs to 'active'...");
        await pool.query("UPDATE store_sku_registry SET status = 'active' WHERE store_id = $1", [storeId]);

        // 2. Force Snapshots to Today
        console.log("   👉 bringing Inventory Snapshots to present...");
        await pool.query(`
            UPDATE inventory_snapshots 
            SET snapshot_date = CURRENT_DATE, 
                created_at = NOW() 
            WHERE store_id = $1
        `, [storeId]);

        // 3. Ensure Store Settings exist (Fallback)
        console.log("   👉 verifying Store Settings...");
        await pool.query(`
            INSERT INTO store_settings (store_id, store_name, llm_enabled)
            VALUES ($1, 'Demo Store', true)
            ON CONFLICT (store_id) DO NOTHING
        `, [storeId]);

        // 4. Verification Check
        const viewCount = await pool.query("SELECT count(*) FROM v_latest_inventory");
        console.log(`\n✅ DONE. Visible Items in Dashboard View: ${viewCount.rows[0].count}`);

        if (viewCount.rows[0].count > 0) {
            console.log("🎉 SUCCESS! Refresh your dashboard now.");
        } else {
            console.error("⚠️  Still 0 items in View. Check table permissions or definition.");
        }

    } catch (err) {
        console.error("❌ ERROR:", err);
    } finally {
        await pool.end();
    }
}

harmonizeData();
