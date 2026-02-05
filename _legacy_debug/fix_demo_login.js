require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function reset() {
    try {
        const email = 'demo-store@store.login';
        const newPassword = 'admin123';
        const saltRounds = 10;

        console.log(`Resetting password for ${email}...`);

        const hash = await bcrypt.hash(newPassword, saltRounds);
        console.log(`New Hash: ${hash}`);

        const result = await pool.query(
            "UPDATE users SET password_hash = $1, login_attempts = 0, locked_until = NULL, is_active = TRUE WHERE email = $2",
            [hash, email]
        );

        if (result.rowCount === 1) {
            console.log("✅ Success: Password reset to 'admin123' and account unlocked.");
        } else {
            console.log("❌ Error: User not found.");
        }
    } catch (e) {
        console.error("❌ Failed:", e);
    } finally {
        await pool.end();
    }
}

reset();
