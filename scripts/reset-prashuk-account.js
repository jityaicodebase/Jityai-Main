const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

async function resetAndUnlock() {
    const email = 'prashuk101914@gmail.com';
    const newPassword = '101914';
    const client = await pool.connect();

    try {
        console.log(`Hashing password for ${email}...`);
        const hash = await bcrypt.hash(newPassword, 10);

        console.log(`Updating database...`);
        const res = await client.query(
            `UPDATE users 
             SET password_hash = $1, 
                 locked_until = NULL, 
                 login_attempts = 0,
                 is_active = TRUE
             WHERE email = $2 OR email = 'prashuk101914@gnail.com'
             RETURNING email`,
            [hash, email]
        );

        if (res.rowCount > 0) {
            console.log(`✅ Success! Password reset to ${newPassword} and account unlocked for: ${res.rows[0].email}`);
        } else {
            console.log(`❌ No user found with email: ${email}`);
        }
    } catch (err) {
        console.error('❌ Error during reset:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

resetAndUnlock();
