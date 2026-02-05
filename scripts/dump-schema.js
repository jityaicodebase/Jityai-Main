const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

async function dumpSchema() {
    try {
        // List all tables
        console.log('=== TABLES ===');
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        tables.rows.forEach(r => console.log(`  - ${r.table_name}`));

        // List all views
        console.log('\n=== VIEWS ===');
        const views = await pool.query(`
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        views.rows.forEach(r => console.log(`  - ${r.table_name}`));

        // Key table structures
        const keyTables = ['store_sku_registry', 'onboarding_handoff', 'sales_transactions', 'inventory_recommendations'];

        for (const table of keyTables) {
            console.log(`\n=== ${table.toUpperCase()} ===`);
            const cols = await pool.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = $1
                ORDER BY ordinal_position
            `, [table]);
            cols.rows.forEach(c => {
                console.log(`  ${c.column_name}: ${c.data_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
            });
        }

        // Check v_latest_inventory view
        console.log('\n=== v_latest_inventory VIEW ===');
        const viewCols = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'v_latest_inventory'
            ORDER BY ordinal_position
        `);
        if (viewCols.rows.length === 0) {
            console.log('  VIEW DOES NOT EXIST!');
        } else {
            viewCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

dumpSchema();
