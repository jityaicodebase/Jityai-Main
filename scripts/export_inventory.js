const { Pool } = require('pg');
const fs = require('fs');

async function exportCSV() {
    console.log("--- Exporting Fresh Inventory CSV ---");

    const pool = new Pool({
        user: 'postgres',
        host: 'localhost',
        database: 'ai_store_manager',
        password: '101914',
        port: 5432,
    });

    try {
        const client = await pool.connect();
        const res = await client.query(`
            SELECT 
                sr.normalized_product_name as "Product Name",
                sr.master_category_name as "Category",
                oh.quantity_on_hand as "Stock",
                oh.unit as "Unit",
                oh.cost_price as "Cost Price",
                oh.selling_price as "Selling Price"
            FROM store_sku_registry sr
            JOIN onboarding_handoff oh ON sr.store_id = oh.store_id AND sr.store_item_id = oh.store_item_id
            WHERE sr.store_id = 'demo-store'
            ORDER BY sr.normalized_product_name
        `);

        if (res.rows.length === 0) {
            console.log("No data found for demo-store.");
            return;
        }

        const headers = Object.keys(res.rows[0]);
        const csvRows = [headers.join(",")];

        for (const row of res.rows) {
            const values = headers.map(header => {
                let val = row[header];
                if (typeof val === 'string' && val.includes(',')) {
                    return `"${val}"`;
                }
                return val;
            });
            csvRows.push(values.join(","));
        }

        const fileName = `inventory_demo-store_fixed_${new Date().toISOString().split('T')[0]}.csv`;
        fs.writeFileSync(fileName, csvRows.join("\n"));
        console.log(`Successfully exported fixed inventory to: ${fileName}`);

        client.release();
    } catch (err) {
        console.error("Export Error:", err);
    } finally {
        await pool.end();
    }
}

exportCSV();
