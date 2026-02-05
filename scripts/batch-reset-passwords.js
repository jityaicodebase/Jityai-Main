/**
 * ============================================================================
 * BATCH PASSWORD RESET FOR ALL STORES
 * ============================================================================
 * Sets password123 for all store accounts
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '101914'
});

async function resetAllPasswords() {
    try {
        const password = 'password123';
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        console.log('🔐 Resetting passwords for all store accounts...\n');

        // Get all users except admin
        const users = await pool.query(
            `SELECT user_id, email, store_id FROM users WHERE role != 'admin' ORDER BY email`
        );

        for (const user of users.rows) {
            await pool.query(
                `UPDATE users 
                 SET password_hash = $1, 
                     login_attempts = 0, 
                     locked_until = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $2`,
                [passwordHash, user.user_id]
            );

            console.log(`✅ ${user.email} (${user.store_id})`);
        }

        console.log(`\n✅ Successfully reset passwords for ${users.rows.length} users`);
        console.log(`\n📝 All passwords set to: password123`);
        console.log(`\n🔐 Login credentials:`);

        users.rows.forEach(user => {
            console.log(`   Email: ${user.email}`);
            console.log(`   Password: password123\n`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

resetAllPasswords();
