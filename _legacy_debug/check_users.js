const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: '101914', database: 'ai_store_manager' });

async function check() {
    try {
        const res = await pool.query("SELECT email, store_id FROM users");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
