/**
 * REALISTIC DEMO SIMULATION - Gourmet Retail Store
 * 
 * Creates a realistic 30-day simulation for a premium gourmet store:
 * - Total Inventory Value: ₹1-2 Lakh (not crore-scale)
 * - 1000 SKUs with retail-appropriate quantities
 * - 30 days of progressive sales history
 * - Realistic demand patterns (fast/medium/slow movers)
 */

const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'ai_store_manager',
    user: 'postgres',
    password: '101914'
});

const STORE_ID = 'demo-store';
const TARGET_INVENTORY_VALUE = 450000; // ₹4.5 Lakh target (realistic for retail)
const SIMULATION_DAYS = 30;

// Realistic product categories with retail-appropriate pricing and stock levels
const CATEGORIES = {
    'Cooking Oils': { weight: 0.15, avgPrice: 55, velocity: 'medium' },
    'Spices & Seasonings': { weight: 0.20, avgPrice: 30, velocity: 'slow' },
    'Grains & Pulses': { weight: 0.10, avgPrice: 40, velocity: 'medium' },
    'Health & Wellness': { weight: 0.12, avgPrice: 85, velocity: 'slow' },
    'Snacks & Beverages': { weight: 0.18, avgPrice: 25, velocity: 'fast' },
    'Personal Care': { weight: 0.15, avgPrice: 50, velocity: 'medium' },
    'Home Care': { weight: 0.10, avgPrice: 40, velocity: 'medium' }
};

// VELOCITY-BASED STOCK LEVELS (small retail store - 5-6k total units)
const STOCK_LEVELS = {
    fast: { min: 8, max: 15 },       // Fast movers: Keep reasonable stock
    medium: { min: 4, max: 8 },      // Medium: Moderate stock
    slow: { min: 2, max: 4 }         // Slow movers: Minimal stock
};

// Generate realistic product name
function generateProduct(index, category) {
    const prefixes = ['Nature', 'Pure', 'Premium', 'Organic', 'Fresh', 'Artisan', 'Royal', 'Deluxe'];
    const suffixes = ['Choice', 'Delight', 'Essence', 'Select', 'Classic', 'Special', 'Gold', 'Ultra'];

    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

    return `${prefix} ${suffix} ${category.split(' ')[0]} #${index}`;
}

// Calculate realistic quantities based on VELOCITY (not arbitrary category averages)
function getRealisticQuantity(velocityType) {
    const range = STOCK_LEVELS[velocityType] || STOCK_LEVELS.medium;
    const qty = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
    return qty;
}

// Generate realistic daily sales for a product
function generateDailySales(baseADS, volatility, day) {
    // Add weekly seasonality (weekend boost)
    const dayOfWeek = day % 7;
    const weekendBoost = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.3 : 1.0;

    // Random daily variation
    const randomFactor = 1 + (Math.random() - 0.5) * volatility;

    // Gradual trend (slight growth over time)
    const trendFactor = 1 + (day * 0.005);

    const sales = baseADS * weekendBoost * randomFactor * trendFactor;

    return Math.max(0, Math.round(sales));
}

async function main() {
    const client = await pool.connect();

    try {
        console.log('🧹 PHASE 1: Cleaning Demo Store Data...\n');

        // Clear AI-generated data (outside transaction to avoid abort issues)
        await client.query('DELETE FROM inventory_recommendations WHERE store_id = $1', [STORE_ID]).catch(() => { });
        await client.query('DELETE FROM sales_transactions WHERE store_id = $1', [STORE_ID]).catch(() => { });
        await client.query('DELETE FROM inventory_snapshots WHERE store_id = $1', [STORE_ID]).catch(() => { });
        console.log('✅ Data cleaned\n');

        // Create inventory_snapshots table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS inventory_snapshots (
                store_id TEXT NOT NULL,
                store_item_id TEXT NOT NULL,
                snapshot_date DATE NOT NULL,
                quantity_on_hand NUMERIC,
                cost_price NUMERIC,
                selling_price NUMERIC,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (store_id, store_item_id, snapshot_date)
            )
        `);
        console.log('✅ Tables verified\n');

        // Start transaction for data generation
        await client.query('BEGIN');

        // ============================================================
        console.log('📦 PHASE 2: Generating Realistic Inventory...\n');
        // ============================================================

        // Load existing REAL products from registry
        const existingProducts = await client.query(`
            SELECT 
                store_item_id,
                normalized_product_name,
                master_category_name,
                moq,
                case_pack_size
            FROM store_sku_registry
            WHERE store_id = $1
            ORDER BY store_item_id
        `, [STORE_ID]);

        if (existingProducts.rows.length === 0) {
            throw new Error('No products found in store_sku_registry. Please seed products first.');
        }

        console.log(`📋 Found ${existingProducts.rows.length} real products in registry\n`);

        const skus = [];
        let totalValue = 0;

        for (const row of existingProducts.rows) {
            const category = row.master_category_name || 'General';

            // Use category config or defaults
            const config = CATEGORIES[category] || { avgPrice: 200, avgStock: 8, velocity: 'medium' };

            // Determine velocity type (realistic distribution: 25% fast, 50% medium, 25% slow)
            let velocityType = config.velocity;
            const rand = Math.random();
            if (rand < 0.25) velocityType = 'fast';
            else if (rand > 0.75) velocityType = 'slow';
            else velocityType = 'medium';

            // Realistic LOWER pricing (tighter variance for smaller inventory value)
            const priceFactor = 0.7 + Math.random() * 0.3; // 70-100% of avg (reduced variance)
            const costPrice = Math.round(config.avgPrice * priceFactor);
            const marginFactor = 1.3 + Math.random() * 0.3; // 30-60% margin
            const sellingPrice = Math.round(costPrice * marginFactor);

            // Velocity-based stock quantities
            const currentStock = getRealisticQuantity(velocityType);

            totalValue += currentStock * costPrice;

            // Average Daily Sales - More realistic based on velocity and stock
            let baseADS = 0;
            if (velocityType === 'fast') {
                // Fast movers: sell 2-4 units/day on average
                baseADS = 2 + Math.random() * 2;
            } else if (velocityType === 'medium') {
                // Medium: sell 0.5-1.5 units/day
                baseADS = 0.5 + Math.random() * 1;
            } else {
                // Slow: sell 0.2-0.5 units/day (premium/specialty items)
                baseADS = 0.2 + Math.random() * 0.3;
            }

            skus.push({
                skuId: row.store_item_id,
                productName: row.normalized_product_name,
                category,
                costPrice,
                sellingPrice,
                currentStock,
                velocityType,
                baseADS
            });
        }

        // NO SCALING - Let natural quantities determine value

        console.log(`📊 Using ${skus.length} real products`);
        console.log(`💰 Total Inventory Value: ₹${Math.round(totalValue).toLocaleString('en-IN')}\n`);

        // Update inventory with realistic quantities
        for (const sku of skus) {
            // Update current inventory snapshot
            await client.query(`
                INSERT INTO inventory_snapshots (store_id, store_item_id, snapshot_date, quantity_on_hand, cost_price, selling_price)
                VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
                ON CONFLICT (store_id, store_item_id, snapshot_date) 
                DO UPDATE SET quantity_on_hand = $3, cost_price = $4, selling_price = $5
            `, [STORE_ID, sku.skuId, sku.currentStock, sku.costPrice, sku.sellingPrice]);

            // IMPORTANT: Update onboarding_handoff (source of v_latest_inventory view)
            await client.query(`
                UPDATE onboarding_handoff 
                SET quantity_on_hand = $1, 
                    cost_price = $2, 
                    selling_price = $3,
                    as_of_date = CURRENT_TIMESTAMP
                WHERE store_id = $4 AND store_item_id = $5
            `, [sku.currentStock, sku.costPrice, sku.sellingPrice, STORE_ID, sku.skuId]);
        }

        console.log('✅ Inventory quantities updated\n');

        // ============================================================
        console.log('📈 PHASE 3: Generating 30 Days of Sales History...\n');
        // ============================================================

        const today = new Date();
        let totalSalesGenerated = 0;

        for (let dayOffset = SIMULATION_DAYS; dayOffset >= 0; dayOffset--) {
            const saleDate = new Date(today);
            saleDate.setDate(saleDate.getDate() - dayOffset);

            let dailyTotal = 0;

            for (const sku of skus) {
                // Determine volatility based on velocity
                let volatility = 0.3;
                if (sku.velocityType === 'fast') volatility = 0.5;
                else if (sku.velocityType === 'slow') volatility = 0.2;

                const qtySold = generateDailySales(sku.baseADS, volatility, SIMULATION_DAYS - dayOffset);

                if (qtySold > 0) {
                    const revenue = qtySold * sku.sellingPrice;
                    await client.query(`
                        INSERT INTO sales_transactions 
                        (store_id, store_item_id, transaction_date, transaction_timestamp, quantity_sold, selling_price, revenue)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [STORE_ID, sku.skuId, saleDate, saleDate, qtySold, sku.sellingPrice, revenue]);

                    dailyTotal += qtySold;
                    totalSalesGenerated++;
                }
            }

            if (dayOffset % 5 === 0) {
                console.log(`  Day ${SIMULATION_DAYS - dayOffset + 1}/30: ${dailyTotal} units sold`);
            }
        }

        console.log(`\n✅ Generated ${totalSalesGenerated} sales transactions\n`);

        await client.query('COMMIT');

        // ============================================================
        console.log('📊 FINAL SUMMARY');
        console.log('='.repeat(60));
        // ============================================================

        const stats = await client.query(`
            SELECT 
                COUNT(DISTINCT store_item_id) as total_skus,
                SUM(quantity_on_hand * cost_price) as inventory_value,
                SUM(quantity_on_hand) as total_units
            FROM inventory_snapshots
            WHERE store_id = $1 AND snapshot_date = CURRENT_DATE
        `, [STORE_ID]);

        const salesStats = await client.query(`
            SELECT 
                COUNT(*) as total_transactions,
                SUM(quantity_sold) as units_sold,
                SUM(revenue) as revenue
            FROM sales_transactions
            WHERE store_id = $1
        `, [STORE_ID]);

        const s = stats.rows[0];
        const ss = salesStats.rows[0];

        console.log(`
🏪 Store: ${STORE_ID}
📦 Total SKUs: ${s.total_skus}
📊 Total Units in Stock: ${s.total_units}
💰 Inventory Value: ₹${Math.round(parseFloat(s.inventory_value)).toLocaleString('en-IN')}

📈 Sales Simulation (30 days):
   Total Transactions: ${ss.total_transactions}
   Units Sold: ${ss.units_sold}
   Revenue Generated: ₹${Math.round(parseFloat(ss.revenue)).toLocaleString('en-IN')}

✅ Demo store is ready for realistic AI analysis!

Next Step: Run AI analysis with:
   node scripts/run-ai-analysis.js demo-store
        `);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
