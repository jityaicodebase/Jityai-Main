/**
 * CLOUD LOGIN DEBUGGER
 * 
 * Purpose: 
 * Diagnose why 'admin123' is rejected even after reset.
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

async function debugLogin() {
    console.log("🔍 STARTING LOGIN DIAGNOSTIC...");
    const pool = new Pool(DB_CONFIG);

    try {
        const email = 'demo-store@store.login';
        const passwordInput = 'admin123';

        // 1. Fetch User
        const res = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (res.rows.length === 0) {
            console.error("❌ CRITICAL: User NOT FOUND in DB.");
            return;
        }

        const user = res.rows[0];
        console.log(`👤 User Found: ID=${user.user_id}, Role=${user.role}`);
        console.log(`🔑 Stored Hash: ${user.password_hash.substring(0, 15)}...`);

        // 2. Test Compare
        console.log(`Testing bcrypt.compare('${passwordInput}', hash)...`);
        const match = await bcrypt.compare(passwordInput, user.password_hash);

        if (match) {
            console.log("✅ SUCCESS: bcrypt.compare() returned TRUE.");
            console.log("   The issue might be in AuthService.js logic (e.g. store_id check, is_active check, or locked_until).");
            console.log(`   is_active: ${user.is_active}`);
            console.log(`   locked_until: ${user.locked_until}`);
            console.log(`   store_id: ${user.store_id}`);
        } else {
            console.error("❌ FAILURE: bcrypt.compare() returned FALSE.");
            console.log("   This means the hash in the DB does NOT match 'admin123'.");

            // 3. Test Generate New
            const newHash = await bcrypt.hash(passwordInput, 10);
            console.log(`   diagnostic: New hash for 'admin123' would be: ${newHash.substring(0, 15)}...`);
            const verifyNew = await bcrypt.compare(passwordInput, newHash);
            console.log(`   diagnostic: Verify new hash immediately: ${verifyNew}`);
        }

    } catch (err) {
        console.error("❌ ERROR:", err);
    } finally {
        await pool.end();
    }
}

debugLogin();
