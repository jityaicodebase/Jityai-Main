/**
 * CLOUD PASSWORD RESET UTILITY
 * 
 * Purpose: 
 * Force-update the admin password to 'admin123' without touching any other data.
 * Safe for Production use.
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const DB_CONFIG = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_HOST === 'localhost' ? false : { rejectUnauthorized: false }
};

if (!process.env.DB_HOST) {
    console.error("❌ Error: DB_HOST environment variable missing.");
    process.exit(1);
}

async function forceReset() {
    console.log(`🔐 Connecting to Database at ${DB_CONFIG.host}...`);
    const pool = new Pool(DB_CONFIG);

    try {
        const email = 'demo-store@store.login';
        const password = 'admin123';
        const hash = await bcrypt.hash(password, 10);

        console.log(`🔑 Generated new hash for '${password}'`);

        // 1. Check if user exists
        const check = await pool.query("SELECT user_id, email, password_hash FROM users WHERE email = $1", [email]);

        if (check.rows.length === 0) {
            console.log("⚠️ User not found. Creating fresh user...");
            await pool.query(`
                INSERT INTO users (email, password_hash, role, store_id, full_name, is_active)
                VALUES ($1, $2, 'admin', 'demo-store', 'Demo Admin', true)
            `, [email, hash]);
            console.log("✅ User created successfully.");
        } else {
            console.log(`🔄 User found (ID: ${check.rows[0].user_id}). Updating password...`);
            await pool.query(`
                UPDATE users 
                SET password_hash = $1, 
                    login_attempts = 0, 
                    locked_until = NULL,
                    is_active = true
                WHERE email = $2
            `, [hash, email]);
            console.log("✅ Password updated & Account unlocked.");
        }

        // 2. Verify
        const verify = await pool.query("SELECT email, role, is_active FROM users WHERE email = $1", [email]);
        console.table(verify.rows);

    } catch (err) {
        console.error("❌ Reset Failed:", err);
    } finally {
        await pool.end();
        console.log("👋 Done.");
    }
}

forceReset();
