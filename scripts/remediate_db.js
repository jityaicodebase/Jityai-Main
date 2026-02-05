const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function remediate() {
    console.log("--- Remediating Database Categories (Node.js) ---");

    // Config from .env or manual for this task
    const pool = new Pool({
        user: 'postgres',
        host: 'localhost',
        database: 'ai_store_manager',
        password: '101914',
        port: 5432,
    });

    const productsPath = path.join(__dirname, '..', 'data', 'real_products.json');
    if (!fs.existsSync(productsPath)) {
        console.log("real_products.json not found.");
        return;
    }

    const realProducts = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
    const nameToCat = {};
    realProducts.forEach(p => {
        nameToCat[p.name] = p.category;
    });

    try {
        const client = await pool.connect();
        const res = await client.query("SELECT store_item_id, normalized_product_name, master_category_name FROM store_sku_registry WHERE store_id = 'demo-store'");

        let updates = 0;
        for (const row of res.rows) {
            const newCat = nameToCat[row.normalized_product_name];
            if (newCat && newCat !== row.master_category_name) {
                await client.query(
                    "UPDATE store_sku_registry SET master_category_name = $1 WHERE store_id = 'demo-store' AND store_item_id = $2",
                    [newCat, row.store_item_id]
                );
                updates++;
            }
        }

        console.log(`Successfully updated ${updates} items.`);
        client.release();
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        await pool.end();
    }
}

remediate();
