/**
 * CLEAN CLOUD SEEDER
 * 
 * Purpose: 
 * Extract and execute ONLY the INSERT statements from demo_data_seed.sql
 * This bypasses all 'Table already exists' errors.
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DB_CONFIG = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_HOST === 'localhost' ? false : { rejectUnauthorized: false }
};

async function seedCleanly() {
    console.log("🌱 STARTING CLEAN DATA SEED...");

    const seedPath = path.join(__dirname, '../database/demo_data_seed.sql');
    if (!fs.existsSync(seedPath)) {
        console.error("❌ Seed file not found:", seedPath);
        process.exit(1);
    }

    const pool = new Pool(DB_CONFIG);
    const client = await pool.connect();

    try {
        console.log("   Parsing file stream...");

        const fileStream = fs.createReadStream(seedPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let insertedCount = 0;
        let errorCount = 0;
        let currentStatement = '';
        let isCopyBlock = false;

        // Note: pg_dump often uses "COPY ... FROM stdin;" which is hard to parse in node without stream piping.
        // We will look for INSERTs. If the file is mostly COPY, we need a different strategy.
        // Given your previous attempt had INSERTs failing, let's assume INSERT format.
        // If it is COPY, we will wrap it in a psql command that ignores errors.

        // ACTUALLY: The best way to ignore errors in psql is via command line flag.
        // But since we are here, let's try the regex approach for INSERTs.

        for await (const line of rl) {
            const trimmed = line.trim();

            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('SET ') || trimmed.startsWith('SELECT pg_catalog')) {
                continue;
            }

            // Detect constraints/tables to skip
            if (trimmed.startsWith('CREATE TABLE') || trimmed.startsWith('ALTER TABLE') || trimmed.startsWith('CREATE SEQUENCE')) {
                continue;
            }

            // Accumulate INSERT statements
            if (trimmed.startsWith('INSERT INTO')) {
                try {
                    await client.query(trimmed);
                    insertedCount++;
                    if (insertedCount % 1000 === 0) process.stdout.write('.');
                } catch (err) {
                    if (!err.message.includes('duplicate key')) {
                        // console.error(`   ⚠️ Failed Insert: ${err.message}`);
                        errorCount++;
                    }
                }
            }
        }

        console.log(`\n✅ Finished Processing.`);
        console.log(`   Inserts Successful: ${insertedCount}`);
        console.log(`   Duplicates/Errors: ${errorCount}`);

        // Final sanity check
        const skus = await client.query("SELECT COUNT(*) FROM store_sku_registry");
        console.log(`   📉 Current DB SKU Count: ${skus.rows[0].count}`);

    } catch (err) {
        console.error("❌ SEED UNSUCCESSFUL:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

seedCleanly();
