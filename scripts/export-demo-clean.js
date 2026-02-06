/**
 * EXPORT CLEAN DEMO DATA (RAW ONLY)
 * 
 * Purpose:
 * Generates a 'database/pure_demo_data.sql' file containing ONLY Insert statements
 * for raw inventory and sales data for the 'demo-store'.
 * 
 * EXCLUDES: AI Recommendations, Feedbacks, Logs, Snapshots.
 * INCLUDES: Users, Stores, StoreSettings (for login), SKU Registry, Sales Transactions.
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
};

const OUTPUT_FILE = path.join(__dirname, '../database/pure_demo_data.sql');

async function exportCleanData() {
    console.log("📦 STARTING RAW DATA EXPORT (Demo Store Only)...");
    const pool = new Pool(DB_CONFIG);

    try {
        const stream = fs.createWriteStream(OUTPUT_FILE, { flags: 'w' });

        // Order matters for Foreign Key constraints!
        const tables = [
            'stores',             // Root
            'users',              // Depends on stores
            'store_settings',     // Depends on stores
            'store_sku_registry', // Depends on stores
            'inventory_snapshots', // HOLDS STOCK LEVELS (Critical)
            'sales_transactions'  // Depends on store_sku_registry
        ];

        for (const table of tables) {
            try {
                console.log(`   Exporting ${table}...`);

                let query = `SELECT * FROM ${table}`;

                // Strict Filter for Demo Store
                if (table === 'users') {
                    // For users, we filter by store_id if column exists, or specific email
                    query += " WHERE store_id = 'demo-store'";
                } else {
                    query += " WHERE store_id = 'demo-store'";
                }

                const res = await pool.query(query);

                if (res.rows.length === 0) {
                    console.log(`     > 0 rows found. Skipping.`);
                    continue;
                }
                console.log(`     > ${res.rows.length} rows.`);

                for (const row of res.rows) {
                    const keys = Object.keys(row);
                    const values = keys.map(k => {
                        const val = row[k];
                        if (val === null) return 'NULL';
                        if (typeof val === 'number') return val;
                        if (typeof val === 'boolean') return val ? 'true' : 'false';
                        if (val instanceof Date) return `'${val.toISOString()}'`;
                        if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                        // Escape single quotes in strings
                        return `'${val.toString().replace(/'/g, "''")}'`;
                    });

                    // ON CONFLICT DO NOTHING ensures idempotency
                    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;\n`;
                    stream.write(sql);
                }
            } catch (err) {
                // If table doesn't exist locally (e.g. stores vs store_settings mismatch), warn but continue
                console.warn(`   ⚠️ Warning: Could not export table '${table}'. Reason: ${err.message}`);
            }
        }

        stream.end();
        console.log(`✅ EXPORT COMPLETE: ${OUTPUT_FILE}`);
        console.log(`   (Contains ONLY raw inventory/sales. No AI artifacts.)`);

    } catch (e) {
        console.error("❌ EXPORT FAILED:", e);
    } finally {
        await pool.end();
    }
}

exportCleanData();
