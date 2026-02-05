/**
 * ============================================================================
 * API KEY GENERATOR
 * ============================================================================
 * Generates secure API keys for store-side connectors
 */

require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

async function generateApiKey(storeId, keyType = 'connector', expiryDays = null) {
    const client = await pool.connect();

    try {
        // Generate random API key
        const apiKey = 'jity_' + crypto.randomBytes(32).toString('hex');
        const keyPrefix = apiKey.substring(0, 13); // "jity_" + first 8 chars

        // Hash the key for storage
        const keyHash = await bcrypt.hash(apiKey, 10);

        // Calculate expiry
        const expiresAt = expiryDays ?
            new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) : null;

        // Insert into database
        const result = await client.query(
            `INSERT INTO api_keys 
             (store_id, key_hash, key_prefix, key_type, is_active, expires_at, permissions)
             VALUES ($1, $2, $3, $4, TRUE, $5, $6)
             RETURNING api_key_id, key_prefix`,
            [
                storeId,
                keyHash,
                keyPrefix,
                keyType,
                expiresAt,
                ['upload:csv', 'read:inventory']
            ]
        );

        console.log('\n✓ API Key Generated Successfully');
        console.log('================================');
        console.log(`Store ID:    ${storeId}`);
        console.log(`Key Type:    ${keyType}`);
        console.log(`Key ID:      ${result.rows[0].api_key_id}`);
        console.log(`Key Prefix:  ${keyPrefix}`);
        console.log(`Expires:     ${expiresAt ? expiresAt.toISOString() : 'Never'}`);
        console.log('\n⚠️  IMPORTANT: Save this key securely. It will not be shown again.');
        console.log(`API Key:     ${apiKey}`);
        console.log('================================\n');

        return apiKey;

    } finally {
        client.release();
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node generate-api-key.js <store_id> [expiry_days]');
        console.log('Example: node generate-api-key.js STORE_001 365');
        process.exit(1);
    }

    const storeId = args[0];
    const expiryDays = args[1] ? parseInt(args[1]) : null;

    await generateApiKey(storeId, 'connector', expiryDays);
    await pool.end();
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
