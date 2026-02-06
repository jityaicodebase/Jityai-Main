/**
 * CLOUD DATA VERIFICATION SUITE
 * 
 * Purpose: 
 * Verify that the 'demo_data_seed.sql' actually populated the cloud database.
 * Diagonose why the UI might think the store is empty.
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

async function verifyData() {
    console.log("🔍 CONNECTING TO CLOUD DB...");
    const pool = new Pool(DB_CONFIG);

    try {
        const storeId = 'demo-store';

        // 1. Check Store Settings (The Missing Piece?)
        const settings = await pool.query("SELECT * FROM store_settings WHERE store_id = $1", [storeId]);
        console.log(`\n🏪 Store Settings Found: ${settings.rows.length}`);
        if (settings.rows.length === 0) {
            console.warn("⚠️  WARNING: No 'store_settings' row found! The UI might default to 'New User' mode.");
        } else {
            console.log("   ✅ Settings exist:", settings.rows[0]);
        }

        // 2. Check Inventory (SKUs)
        const skus = await pool.query("SELECT COUNT(*) FROM store_sku_registry WHERE store_id = $1", [storeId]);
        console.log(`\n📦 Total SKUs: ${skus.rows[0].count}`);

        // 3. Check Sales History
        const sales = await pool.query("SELECT COUNT(*) FROM sales_transactions WHERE store_id = $1", [storeId]);
        console.log(`💰 Total Sales Transactions: ${sales.rows[0].count}`);

        // 4. Check Inventory Snapshots
        const snaps = await pool.query("SELECT COUNT(*) FROM inventory_snapshots WHERE store_id = $1", [storeId]);
        console.log(`📸 Inventory Snapshots: ${snaps.rows[0].count}`);

        // 5. Check Recommendations
        const recs = await pool.query("SELECT COUNT(*) FROM inventory_recommendations WHERE store_id = $1", [storeId]);
        console.log(`🤖 AI Recommendations: ${recs.rows[0].count}`);

        // DIAGNOSIS
        console.log("\n---------------------------------------------------");
        if (parseInt(skus.rows[0].count) > 0) {
            console.log("✅ DATA IS PRESENT. The database is populated.");
            if (settings.rows.length === 0) {
                console.log("🛠️  FIX NEEDED: Run 'INSERT INTO store_settings' to exit onboarding mode.");
            }
        } else {
            console.error("❌ DATABASE IS EMPTY. Seed failed.");
            console.log("   Action: You need to run: psql -f database/demo_data_seed.sql manually.");
        }
        console.log("---------------------------------------------------");

    } catch (err) {
        console.error("❌ QUERY FAILED:", err);
    } finally {
        await pool.end();
    }
}

verifyData();
