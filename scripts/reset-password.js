/**
 * ============================================================================
 * ADMIN PASSWORD RESET UTILITY
 * ============================================================================
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const readline = require('readline');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function resetPassword(email, newPassword) {
    const client = await pool.connect();

    try {
        // Check if user exists
        const userResult = await client.query(
            'SELECT user_id, email, store_id FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            throw new Error(`User not found: ${email}`);
        }

        const user = userResult.rows[0];

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await client.query(
            `UPDATE users 
             SET password_hash = $1, login_attempts = 0, locked_until = NULL 
             WHERE user_id = $2`,
            [passwordHash, user.user_id]
        );

        // Log audit
        await client.query(
            `INSERT INTO operational_audit_log 
             (store_id, user_id, action_type, metadata, status)
             VALUES ($1, $2, 'auth.password_reset', $3, 'success')`,
            [
                user.store_id,
                user.user_id,
                JSON.stringify({ reset_by: 'admin_script', email })
            ]
        );

        console.log('\n✓ Password Reset Successful');
        console.log('===========================');
        console.log(`Email:    ${user.email}`);
        console.log(`Store ID: ${user.store_id}`);
        console.log('===========================\n');

    } finally {
        client.release();
    }
}

async function main() {
    console.log('\n╔═══════════════════════════════════╗');
    console.log('║  JITYAI ADMIN PASSWORD RESET     ║');
    console.log('╚═══════════════════════════════════╝\n');

    const email = await question('User email: ');
    const newPassword = await question('New password: ');
    const confirm = await question('Confirm password: ');

    if (newPassword !== confirm) {
        console.error('\n✗ Error: Passwords do not match\n');
        rl.close();
        process.exit(1);
    }

    if (newPassword.length < 8) {
        console.error('\n✗ Error: Password must be at least 8 characters\n');
        rl.close();
        process.exit(1);
    }

    await resetPassword(email, newPassword);

    rl.close();
    await pool.end();
}

main().catch(error => {
    console.error('\n✗ Error:', error.message, '\n');
    rl.close();
    process.exit(1);
});
