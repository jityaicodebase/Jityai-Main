const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function adjustConstraint() {
    const client = await pool.connect();
    try {
        console.log("Dropping transaction type constraint...");
        await client.query('ALTER TABLE onboarding_handoff DROP CONSTRAINT IF EXISTS onboarding_handoff_transaction_type_check;');

        console.log("Adding new extended transaction types...");
        // Expanded to include 'BULK_SALE_IMPORT' which is used by our new aggregation logic
        await client.query(`
            ALTER TABLE onboarding_handoff 
            ADD CONSTRAINT onboarding_handoff_transaction_type_check 
            CHECK (transaction_type IN ('STOCK_TAKE', 'ADJUSTMENT', 'RESTOCK', 'SALE', 'RETURN', 'DAMAGE', 'EXPIRY', 'BULK_SALE_IMPORT', 'BULK_RETURN_IMPORT'));
        `);

        console.log("✅ Constraint updated successfully!");
    } catch (e) {
        console.error("Error updating constraint:", e);
    } finally {
        client.release();
        pool.end();
    }
}

adjustConstraint();
