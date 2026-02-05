const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function fixConstraint() {
    const client = await pool.connect();
    try {
        console.log("Dropping old constraint...");
        await client.query('ALTER TABLE onboarding_handoff DROP CONSTRAINT IF EXISTS onboarding_handoff_source_check;');

        console.log("Adding new lenient constraint...");
        // Expanded to include 'manual_upload' and 'file_upload' which caused the error
        await client.query(`
            ALTER TABLE onboarding_handoff 
            ADD CONSTRAINT onboarding_handoff_source_check 
            CHECK (source IN ('full_onboarding', 'incremental_update', 'manual_entry', 'manual_upload', 'file_upload', 'csv_import', 'system_event'));
        `);

        console.log("✅ Constraint updated successfully!");
    } catch (e) {
        console.error("Error updating constraint:", e);
    } finally {
        client.release();
        pool.end();
    }
}

fixConstraint();
