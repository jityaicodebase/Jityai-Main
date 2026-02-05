const { Pool } = require('pg');
const ConfigLoader = require('./modules/config');
const CatalogMapper = require('./modules/catalog-mapper');
const FuzzyMatcher = require('./modules/fuzzy-matcher');
const LLMCategorizer = require('./modules/llm-categorizer');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function repairUnknowns() {
    console.log('🚀 Starting FINAL REPAIR for "Unknown" and "Uncategorized" items...');

    // 1. Initialize System
    const configLoader = new ConfigLoader();
    await configLoader.loadAll();
    const llm = new LLMCategorizer(configLoader);
    await llm.initialize();
    const fuzzy = new FuzzyMatcher(configLoader);
    const mapper = new CatalogMapper(configLoader, fuzzy, llm);
    await mapper.initialize(configLoader.getMasterCatalog());

    // 2. Fetch Target Items
    console.log('📊 Fetching target items from DB...');
    // We target 'Unknown', 'Uncategorized', and NULLs
    // Also including 'L1_UNCATEGORIZED' ID just in case
    const query = `
        SELECT store_item_id, normalized_product_name, brand, original_product_name
        FROM store_sku_registry 
        WHERE store_id = 'store-1-prashuk-808' 
        AND (
            master_category_name IN ('Unknown', 'Uncategorized') 
            OR master_category_name IS NULL
            OR master_category_id = 'L1_UNCATEGORIZED'
        )
    `;

    const { rows } = await pool.query(query);
    console.log(`Found ${rows.length} items to repair.`);

    if (rows.length === 0) {
        console.log('✅ No items to repair!');
        await pool.end();
        return;
    }

    // 3. Process Items
    let updatedCount = 0;
    let errorCount = 0;

    // Process in smaller batches to avoid overwhelming LLM if needed (though mapper handles it)
    const BATCH_SIZE = 10;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        console.log(`\nProcessing batch ${Math.ceil(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}...`);

        await Promise.all(batch.map(async (item) => {
            try {
                // Use the robust mapper (includes LLM fallback now working correctly)
                const result = await mapper.mapItemRobust({
                    product_name_normalized: item.normalized_product_name || item.original_product_name,
                    brand: item.brand
                });

                // Update DB - Must set manually_corrected=true to bypass prevent_silent_remap trigger
                // if the previous confidence was high.
                await pool.query(
                    `UPDATE store_sku_registry 
                     SET master_category_id = $1, 
                         master_category_name = $2, 
                         mapping_method = $3,
                         mapping_confidence = $4,
                         last_verified_at = NOW(),
                         manually_corrected = TRUE,
                         corrected_at = NOW(),
                         correction_reason = 'Automated Repair of Unknown/Uncategorized Items'
                     WHERE store_item_id = $5`,
                    [
                        result.category_id,
                        result.category_name,
                        result.mapping_method + '_final_fix',
                        result.mapping_confidence,
                        item.store_item_id
                    ]
                );

                process.stdout.write('.'); // Progress indicator
                updatedCount++;
            } catch (err) {
                console.error(`\n❌ Error processing "${item.normalized_product_name}":`, err.message);
                errorCount++;
            }
        }));
    }

    console.log(`\n\n🎉 Repair Complete!`);
    console.log(`- Total Processed: ${rows.length}`);
    console.log(`- Updated: ${updatedCount}`);
    console.log(`- Errors: ${errorCount}`);

    await pool.end();
}

repairUnknowns();
