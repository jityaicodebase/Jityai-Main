const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '101914'
};

async function reset() {
    const pool = new Pool(DB_CONFIG);
    const hash = await bcrypt.hash('admin123', 10);
    const email = 'demo-store@store.login';

    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);
    console.log(`✅ Password for ${email} reset to admin123`);
    await pool.end();
}
reset();
