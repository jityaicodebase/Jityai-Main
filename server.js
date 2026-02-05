/**
 * ============================================================================
 * AI STORE MANAGER - COMPLETE SYSTEM INTEGRATION
 * ============================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs').promises;

// Import onboarding modules
const ConfigLoader = require('./modules/config');
const Normalizer = require('./modules/normalizer');
const BrandExtractor = require('./modules/brand-extractor');
const CatalogMapper = require('./modules/catalog-mapper');
const LLMCategorizer = require('./modules/llm-categorizer');
const FuzzyMatcher = require('./modules/fuzzy-matcher');
const DatabasePersistence = require('./modules/database-persistence');
const OnboardingOrchestrator = require('./modules/onboarding-orchestrator');
const IncrementalSyncAgent = require('./modules/incremental-sync-agent');
const ExcelParser = require('./modules/excel-parser');
const QualityScorer = require('./modules/quality-scorer');
const InventoryAIAgent = require('./modules/inventory-ai-agent');
const SalesTransactionExtractor = require('./modules/sales-transaction-extractor');
const MasterOrchestrator = require('./modules/master-orchestrator');
const ReportEngine = require('./modules/report-engine'); // Added ReportEngine
const StoreSimulator = require('./modules/store-simulator');

// Authentication modules (Cloud-Ready)
const AuthService = require('./modules/auth-service');
const {
    authenticateJWT,
    authenticateAPIKey,
    requireStoreScope,
    requireRole
} = require('./modules/auth-middleware');

// ============================================================================
// CONFIGURATION & DATABASE
// ============================================================================

const PORT = process.env.PORT || 3000;
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ai_store_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
};

const pool = new Pool(DB_CONFIG);

// Initialize Authentication Service
const authService = new AuthService(pool);

// Initialize Report Engine
const reportEngine = new ReportEngine(pool);

// ============================================================================
// INITIALIZE AGENTS
// ============================================================================

const configLoader = new ConfigLoader();
const fuzzyMatcher = new FuzzyMatcher(configLoader);
const normalizer = new Normalizer(configLoader);
const brandExtractor = new BrandExtractor(configLoader);
const llmCategorizer = new LLMCategorizer(configLoader);
const catalogMapper = new CatalogMapper(configLoader, fuzzyMatcher, llmCategorizer);
const dbPersistence = new DatabasePersistence(pool);
const qualityScorer = new QualityScorer(configLoader);

const orchestrator = new OnboardingOrchestrator(
    configLoader,
    normalizer,
    brandExtractor,
    catalogMapper,
    llmCategorizer,
    dbPersistence
);

const inventoryAIAgent = new InventoryAIAgent(pool, { mode: process.env.AI_MODE || 'SHADOW' });
const salesExtractor = new SalesTransactionExtractor(pool);
const incrementalSync = new IncrementalSyncAgent(dbPersistence);

const masterOrchestrator = new MasterOrchestrator(
    orchestrator,
    incrementalSync,
    dbPersistence,
    inventoryAIAgent,
    salesExtractor
);

const storeSimulator = new StoreSimulator(pool);

incrementalSync.eventCallback = masterOrchestrator.onIncrementalSyncCompleted.bind(masterOrchestrator);

async function init() {
    try {
        await configLoader.loadAll();
        // await qualityScorer.initialize();
        await normalizer.initialize();
        await llmCategorizer.initialize();
        await catalogMapper.initialize(configLoader.getMasterCatalog());
        console.log('✅ All system modules initialized');
    } catch (err) {
        console.error('❌ Initialization failed:', err.message);
    }
}
init();

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 }
});

// ============================================================================
// API ROUTES
// ============================================================================

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected' });
    } catch (e) {
        res.status(500).json({ status: 'unhealthy', error: e.message });
    }
});

// ============================================================================
// AUTHENTICATION ROUTES (Cloud-Ready)
// ============================================================================

/**
 * Login endpoint
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await authService.login(
            email,
            password,
            req.ip,
            req.headers['user-agent']
        );

        res.json(result);

    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ error: error.message });
    }
});

/**
 * Register endpoint
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, fullName, storeName, storeLocation } = req.body;

        if (!email || !password || !fullName || !storeName) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const result = await authService.register({
            email,
            password,
            fullName,
            storeName,
            storeLocation: storeLocation || ''
        });

        res.json(result);

    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * Logout endpoint
 */
app.post('/api/auth/logout', authenticateJWT(authService), async (req, res) => {
    try {
        // Log logout event
        await pool.query(
            `INSERT INTO operational_audit_log (store_id, user_id, action_type, status)
             VALUES ($1, $2, 'auth.logout', 'success')`,
            [req.user.store_id, req.user.user_id]
        );

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

/**
 * Admin password reset
 */
app.post('/api/auth/admin/reset-password',
    authenticateJWT(authService),
    requireRole('admin'),
    async (req, res) => {
        try {
            const { userId, newPassword } = req.body;

            if (!userId || !newPassword) {
                return res.status(400).json({ error: 'User ID and new password required' });
            }

            await authService.resetPassword(userId, newPassword, req.user.user_id);

            res.json({ message: 'Password reset successfully' });

        } catch (error) {
            console.error('Password reset error:', error);
            res.status(500).json({ error: 'Password reset failed' });
        }
    }
);

/**
 * Connector file upload (API Key auth)
 */
app.post('/api/sync/upload',
    authenticateAPIKey(authService),
    upload.single('file'),
    async (req, res) => {
        try {
            const file = req.file;
            const storeId = req.apiKey.store_id; // From API key

            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            console.log(`📥 Connector upload from ${storeId}: ${file.originalname}`);

            // Log upload
            await pool.query(
                `INSERT INTO operational_audit_log
                 (store_id, api_key_id, action_type, entity_type, entity_id, metadata, status)
                 VALUES ($1, $2, 'sync.started', 'file', $3, $4, 'success')`,
                [
                    storeId,
                    req.apiKey.api_key_id,
                    file.originalname,
                    JSON.stringify({ size: file.size, mimetype: file.mimetype })
                ]
            );

            // Parse and route through master orchestrator
            const fileBuffer = await fs.readFile(file.path);
            const excelParser = new ExcelParser();
            const parsedData = await excelParser.parseBuffer(fileBuffer, file.originalname);

            const result = await masterOrchestrator.route(storeId, parsedData, {
                source: 'connector',
                fileName: file.originalname
            });

            // Clean up uploaded file
            await fs.unlink(file.path);

            res.json({
                success: true,
                message: 'File processed successfully',
                result
            });

        } catch (error) {
            console.error('Connector upload error:', error);

            // Log failure
            if (req.apiKey) {
                await pool.query(
                    `INSERT INTO operational_audit_log
                     (store_id, api_key_id, action_type, status, error_message)
                     VALUES ($1, $2, 'sync.failed', 'failure', $3)`,
                    [req.apiKey.store_id, req.apiKey.api_key_id, error.message]
                );
            }

            res.status(500).json({ error: error.message });
        }
    }
);

app.get('/api/stats',
    authenticateJWT(authService), // Protect: Any valid user can see global stats
    async (req, res) => {
        try {
            const stats = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM store_sku_registry WHERE status = 'active') as total_skus,
                (SELECT COUNT(DISTINCT store_id) FROM store_sku_registry) as total_stores,
                (SELECT COUNT(*) FROM onboarding_batch_status) as total_batches
        `);
            res.json({ success: true, stats: stats.rows[0] });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

/**
 * Operations Hub Summary (Protected)
 */
app.get('/api/ops/summary/:storeId',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            // req.store_id is set by requireStoreScope (from JWT)
            const storeId = req.store_id;

            const catalogStats = await pool.query(`
            SELECT
                COUNT(*) as total_skus,
                COUNT(CASE 
                    WHEN master_category_name IS NOT NULL 
                    AND master_category_name != 'Unknown' 
                    AND master_category_id != 'L1_UNCATEGORIZED' 
                    THEN 1 END) as categorized_skus,
                (SELECT SUM(quantity_on_hand * cost_price) FROM v_latest_inventory WHERE store_id = $1) as total_inventory_value
            FROM store_sku_registry
            WHERE store_id = $1
        `, [storeId]);

            // VELOCITY-AWARE STOCK ALERTS (not static threshold!)
            // Count SKUs where Days of Cover < Protection Window (real risk)
            const stockStats = await pool.query(`
            WITH daily_sales AS (
                SELECT 
                    store_id,
                    store_item_id,
                    AVG(CASE WHEN transaction_date > CURRENT_DATE - INTERVAL '7 days' THEN quantity_sold END) as ads7,
                    AVG(CASE WHEN transaction_date > CURRENT_DATE - INTERVAL '14 days' THEN quantity_sold END) as ads14,
                    AVG(CASE WHEN transaction_date > CURRENT_DATE - INTERVAL '30 days' THEN quantity_sold END) as ads30
                FROM sales_transactions
                WHERE store_id = $1
                GROUP BY store_id, store_item_id
            ),
            sku_metrics AS (
                SELECT 
                    r.store_item_id,
                    h.quantity_on_hand,
                    COALESCE((0.5 * ds.ads7) + (0.3 * ds.ads14) + (0.2 * ds.ads30), 0) as wads,
                    -- Protection Window based on demand volatility
                    CASE 
                        WHEN h.quantity_on_hand > 0 AND COALESCE((0.5 * ds.ads7) + (0.3 * ds.ads14) + (0.2 * ds.ads30), 0) > 0
                        THEN h.quantity_on_hand / ((0.5 * ds.ads7) + (0.3 * ds.ads14) + (0.2 * ds.ads30))
                        ELSE 999 
                    END as days_of_cover
                FROM store_sku_registry r
                JOIN v_latest_inventory h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
                LEFT JOIN daily_sales ds ON r.store_id = ds.store_id AND r.store_item_id = ds.store_item_id
                WHERE r.store_id = $1
            )
            SELECT COUNT(*) as low_stock_count
            FROM sku_metrics
            WHERE days_of_cover < 3  -- CRITICAL: Less than 3 days = immediate action needed
            AND wads > 0  -- Only count items that actually sell
        `, [storeId]);

            const syncStats = await pool.query(`
            SELECT status, completed_at, total_items 
            FROM onboarding_batch_status 
            WHERE store_id = $1 
            ORDER BY completed_at DESC NULLS LAST, onboarding_date DESC
            LIMIT 1
        `, [storeId]);

            const cat = catalogStats.rows[0] || { total_skus: 0, categorized_skus: 0 };
            const stk = stockStats.rows[0] || { low_stock_count: 0 };
            const syn = syncStats.rows[0];

            res.json({
                success: true,
                stats: {
                    totalSKUs: parseInt(cat.total_skus),
                    categorized: parseInt(cat.categorized_skus),
                    lowStock: parseInt(stk.low_stock_count),
                    inventoryValue: Math.round(parseFloat(cat.total_inventory_value || 0)).toLocaleString('en-IN'),
                    latestSync: syn ? {
                        status: syn.status,
                        completed_at: syn.completed_at,
                        total_items: syn.total_items
                    } : null
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

/**
 * Manual Update SKU  
 * PROTECTED: Requires JWT + Store Scope
 */
app.post('/api/inventory/update',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id; // From JWT, not request body
            const { storeItemId, quantity, sellingPrice, costPrice, categoryName, reason } = req.body;

            if (!storeItemId) {
                return res.status(400).json({ success: false, error: 'Missing storeItemId' });
            }

            const result = await masterOrchestrator.handleManualAdjustment(storeId, storeItemId, {
                quantity: parseFloat(quantity),
                sellingPrice: parseFloat(sellingPrice),
                costPrice: parseFloat(costPrice),
                categoryName,
                reason
            });
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

/**
 * DEPRECATED: Users are bound to ONE store only
 * This endpoint is no longer needed in cloud-ready version
 */
// app.get('/api/stores') - REMOVED

/**
 * Get products for the current store (used for first-time user check)
 */
app.get('/api/products',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id;
            const result = await pool.query(`
                SELECT store_item_id
                FROM store_sku_registry
                WHERE store_id = $1
                LIMIT 1
            `, [storeId]);

            res.json({
                success: true,
                products: result.rows
            });
        } catch (error) {
            console.error('Error fetching products check:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

app.get('/api/inventory/full/:storeId',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id;
            const result = await pool.query(`
            SELECT 
                r.store_item_id,
                r.original_product_name as product_name,
                r.master_category_name as category,
                COALESCE(h.quantity_on_hand, 0) as quantity_on_hand,
                COALESCE(h.unit, r.normalized_unit) as stock_unit,
                COALESCE(h.selling_price, 0) as selling_price,
                COALESCE(h.cost_price, 0) as cost_price,
                h.as_of_date
            FROM store_sku_registry r
            LEFT JOIN v_latest_inventory h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            WHERE r.store_id = $1
            ORDER BY r.normalized_product_name
        `, [storeId]);
            res.json({ success: true, items: result.rows });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

/**
 * Barcode Lookup
 */
app.get('/api/inventory/barcode/:barcode',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const { barcode } = req.params;
            const result = await pool.query(`
            SELECT 
                r.store_item_id,
                r.original_product_name as product_name,
                r.master_category_name as category,
                COALESCE(h.quantity_on_hand, 0) as quantity_on_hand,
                COALESCE(h.unit, r.normalized_unit) as stock_unit,
                COALESCE(h.selling_price, 0) as selling_price,
                COALESCE(h.cost_price, 0) as cost_price
            FROM store_sku_registry r
            LEFT JOIN v_latest_inventory h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            WHERE r.barcode = $1
            LIMIT 1
        `, [barcode]);

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Product not found' });
            }
            res.json({ success: true, item: result.rows[0] });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

/**
 * Onboarding (Protected)
 */
app.post('/api/onboarding/upload',
    authenticateJWT(authService),
    requireStoreScope,
    upload.single('file'),
    async (req, res) => {
        try {
            const storeId = req.store_id; // From JWT
            const { storeName, location, storeType } = req.body;

            if (!req.file) return res.status(400).json({ success: false, error: 'No file' });

            console.log(`📤 Manual upload from ${storeId}: ${req.file.originalname}`);

            // Log upload
            await pool.query(
                `INSERT INTO operational_audit_log 
                 (store_id, user_id, action_type, entity_type, entity_id, metadata, status)
                 VALUES ($1, $2, 'file.upload', 'onboarding', $3, $4, 'success')`,
                [
                    storeId,
                    req.user.user_id,
                    req.file.originalname,
                    JSON.stringify({ size: req.file.size, type: 'manual' })
                ]
            );

            const parser = new ExcelParser();
            const items = await parser.parseFile(req.file.path);

            // Update store name and location if provided
            if (storeName || location) {
                await pool.query(
                    `UPDATE store_settings 
                     SET store_name = COALESCE($1, store_name), 
                         store_location = COALESCE($2, store_location) 
                     WHERE store_id = $3`,
                    [storeName || null, location || null, storeId]
                );
            }

            const result = await orchestrator.onboard(storeId, items, { storeName, location, storeType });
            await fs.unlink(req.file.path);

            res.json({ success: true, batchId: result.run_id, summary: result.run_summary });
        } catch (e) {
            console.error('Onboarding upload error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

/**
 * Incremental Sync
 */
app.post('/api/sync/inventory/upload', upload.single('file'), async (req, res) => {
    try {
        const { storeId } = req.body;
        if (!req.file) return res.status(400).json({ success: false, error: 'No file' });

        const parser = new ExcelParser();
        const items = await parser.parseFile(req.file.path);
        const result = await incrementalSync.sync(storeId, items, { syncType: 'file_upload' });
        await fs.unlink(req.file.path);

        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * Purchase Order Upload (NEW)
 */
app.post('/api/pos/upload', upload.single('file'), async (req, res) => {
    try {
        const { storeId } = req.body;
        if (!req.file) return res.status(400).json({ success: false, error: 'No file' });

        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

        await fs.unlink(req.file.path);

        if (rawData.length === 0) return res.status(400).json({ success: false, error: 'Empty file' });

        // Group by PO ID
        const poMap = new Map();

        // Flexible Column Mapping
        const getVal = (row, keys) => {
            for (const key of keys) {
                const found = Object.keys(row).find(k => k.toLowerCase().includes(key));
                if (found) return row[found];
            }
            return null;
        };

        for (const row of rawData) {
            const poId = getVal(row, ['po_id', 'po number', 'order_id', 'reference']) || `PO-${Date.now()}`;
            const skuId = getVal(row, ['sku', 'item_id', 'product_id', 'store_item_id']);
            const qty = getVal(row, ['qty', 'quantity', 'ordered']);
            const date = getVal(row, ['date', 'created', 'order_date']) || new Date();
            const status = getVal(row, ['status']) || 'RECEIVED'; // Default to received for history
            const supplier = getVal(row, ['supplier', 'vendor']) || 'General Supplier';

            if (!skuId || !qty) continue;

            if (!poMap.has(poId)) {
                poMap.set(poId, {
                    storeId,
                    poId,
                    supplier,
                    status: status.toUpperCase(),
                    items: [],
                    date: new Date(date)
                });
            }
            poMap.get(poId).items.push({ skuId, qty: parseInt(qty) });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let importedCount = 0;

            for (const po of poMap.values()) {
                // Insert PO Header
                const poRes = await client.query(`
                    INSERT INTO purchase_orders (store_id, supplier_name, status, total_items, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $5)
                    RETURNING po_id
                `, [po.storeId, po.supplier, po.status, po.items.length, po.date]);

                const newPoId = poRes.rows[0].po_id;

                // Insert Items
                for (const item of po.items) {
                    await client.query(`
                        INSERT INTO purchase_order_items (po_id, store_id, store_item_id, quantity_ordered, received_quantity, received_date)
                        VALUES ($1, $2, $3, $4, $4, $5)
                    `, [newPoId, po.storeId, item.skuId, item.qty, po.date]);
                }
                importedCount++;
            }
            await client.query('COMMIT');
            res.json({ success: true, message: `Successfully imported ${importedCount} Purchase Orders.` });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * AI Endpoints
 */
app.get('/api/inventory-ai/summary/:storeId',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id;
            const impact = await pool.query(`
            WITH latest_insights AS (
                SELECT DISTINCT ON (ir.store_item_id)
                    ir.*,
                    inv.cost_price
                FROM inventory_recommendations ir
                JOIN v_latest_inventory inv ON ir.store_id = inv.store_id AND ir.store_item_id = inv.store_item_id
                WHERE ir.store_id = $1 AND ir.feedback_status IN ('PENDING', 'ACCEPTED', 'UPDATED')
                ORDER BY ir.store_item_id, ir.generated_at DESC
            )
            SELECT 
                SUM(CASE WHEN insight_category = 'BUY_MORE' THEN (recommended_order_quantity * cost_price) ELSE 0 END) as sales_at_risk,
                SUM(CASE 
                    WHEN insight_category = 'BUY_LESS' THEN 
                        GREATEST(0, (current_stock - (weighted_ads * protection_window * 2))) * cost_price 
                    ELSE 0 
                END) as cash_blocked
            FROM latest_insights
        `, [storeId]);

            const stats = impact.rows[0] || {};
            res.json({
                success: true,
                summary: {
                    salesProtected: Math.round(parseFloat(stats.sales_at_risk || 0)).toLocaleString('en-IN'),
                    cashBlocked: Math.round(parseFloat(stats.cash_blocked || 0)).toLocaleString('en-IN')
                }
            });
        } catch (e) {
            console.error('❌ Summary API Error:', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    });

app.get('/api/inventory-ai/recommendations/:storeId',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id;
            const status = req.query.status || 'PENDING';
            const result = await pool.query(`
            SELECT DISTINCT ON (ir.store_item_id)
                ir.*,
                sr.normalized_product_name,
                COALESCE(inv.cost_price, 0) as cost_price,
                COALESCE(inv.selling_price, 0) as selling_price
            FROM inventory_recommendations ir
            JOIN store_sku_registry sr ON ir.store_id = sr.store_id AND ir.store_item_id = sr.store_item_id
            LEFT JOIN v_latest_inventory inv ON ir.store_id = inv.store_id AND ir.store_item_id = inv.store_item_id
            WHERE ir.store_id = $1 AND ir.feedback_status = $2
            ORDER BY ir.store_item_id, ir.generated_at DESC
        `, [storeId, status]);

            // Re-sort by priority in-memory after deduplication
            const sorted = result.rows.sort((a, b) => {
                const pMap = { HIGH: 3, MEDIUM: 2, LOW: 1 };
                return (pMap[b.action_priority] || 0) - (pMap[a.action_priority] || 0);
            });

            res.json({ success: true, recommendations: sorted });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

/**
 * AI Insight Tracking - Historical Recommendations
 */
app.get('/api/inventory-ai/history/:storeId',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id;
            const result = await pool.query(`
            SELECT 
                ir.*, 
                sr.normalized_product_name,
                inv.quantity_on_hand as current_stock_actual,
                inv.as_of_date as current_as_of
            FROM inventory_recommendations ir
            JOIN store_sku_registry sr ON ir.store_id = sr.store_id AND ir.store_item_id = sr.store_item_id
            LEFT JOIN v_latest_inventory inv ON ir.store_id = inv.store_id AND ir.store_item_id = inv.store_item_id
            WHERE ir.store_id = $1 AND ir.feedback_status IN ('ACCEPTED', 'REJECTED', 'IGNORED')
            ORDER BY ir.processed_at DESC
            LIMIT 50
        `, [storeId]);
            res.json({ success: true, history: result.rows });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

/**
 * AI Feedback Endpoint
 * PROTECTED: Requires JWT + Store Scope
 */
app.post('/api/inventory-ai/feedback',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const { recommendationId, status, reason } = req.body;
            console.log(`📝 Feedback received: ${recommendationId} -> ${status}`);
            await inventoryAIAgent.updateRecommendationStatus(recommendationId, status, { reason });
            res.json({ success: true });
        } catch (e) {
            console.error('❌ Feedback endpoint error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });



/**
 * Simulation Endpoint
 * PROTECTED: Requires JWT (uses user's store_id)
 */
app.post('/api/simulation/run',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const targetStoreId = req.store_id; // Use authenticated user's store
            const simResult = await storeSimulator.resetAndRunSimulation(targetStoreId);
            const analysisResult = await masterOrchestrator.runDailyClosingAnalysis(targetStoreId);

            res.json({
                success: true,
                ...simResult,
                ...analysisResult
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

// ============================================================================
// DATABASE EXPLORER ENDPOINTS
// ============================================================================

app.get('/api/db/tables',
    authenticateJWT(authService),
    requireRole('admin'), // STRICT: Admin only
    async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            `);
            res.json({ success: true, tables: result.rows.map(r => r.table_name) });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

app.get('/api/db/schema/:tableName',
    authenticateJWT(authService),
    requireRole('admin'), // STRICT: Admin only
    async (req, res) => {
        try {
            const { tableName } = req.params;
            const result = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
        `, [tableName]);
            res.json({ success: true, columns: result.rows });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

app.get('/api/db/data/:tableName',
    authenticateJWT(authService),
    requireRole('admin'), // STRICT: Admin only
    async (req, res) => {
        try {
            const { tableName } = req.params;
            const limit = parseInt(req.query.limit) || 100;
            const offset = parseInt(req.query.offset) || 0;

            // Safety: Validate table name against allowed list to prevent SQL injection
            const tablesResult = await pool.query(`
            SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
        `);
            const allowedTables = tablesResult.rows.map(r => r.table_name);

            if (!allowedTables.includes(tableName)) {
                return res.status(400).json({ success: false, error: 'Invalid table name' });
            }

            const result = await pool.query(`SELECT * FROM ${tableName} LIMIT $1 OFFSET $2`, [limit, offset]);
            const countResult = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);

            res.json({
                success: true,
                data: result.rows,
                total: parseInt(countResult.rows[0].count),
                limit,
                offset
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

// ============================================================================
// AI CHAT ENDPOINTS
// ============================================================================

app.get('/api/inventory-ai/metrics/:storeId/:storeItemId',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id; // From JWT
            const { storeItemId } = req.params;
            const skuState = await inventoryAIAgent.loadSKUState(storeId, storeItemId);
            if (!skuState) return res.status(404).json({ success: false, error: 'Product not found' });

            const metrics = inventoryAIAgent.calculateDeterministicMetrics(skuState);
            const classification = inventoryAIAgent.classifySKU(skuState, metrics);
            const riskState = inventoryAIAgent.determineRiskState(metrics, skuState);

            const trace = {
                queries: [
                    {
                        description: "Load SKU Identity & Current Stock",
                        file: "modules/inventory-ai-agent.js",
                        query: `SELECT r.store_item_id, r.normalized_product_name, i.quantity_on_hand as current_stock, i.selling_price, i.cost_price 
                            FROM store_sku_registry r 
                            LEFT JOIN v_latest_inventory i ON r.store_id = i.store_id AND r.store_item_id = i.store_item_id
                            WHERE r.store_id = '${storeId}' AND r.store_item_id = '${storeItemId}'`
                    },
                    {
                        description: "Extract 30-Day Sales History",
                        file: "modules/inventory-ai-agent.js",
                        query: `SELECT transaction_date, quantity_sold FROM sales_transactions 
                            WHERE store_id = '${storeId}' AND store_item_id = '${storeItemId}' 
                            AND transaction_date > CURRENT_DATE - INTERVAL '30 days'`
                    }
                ],
                math: {
                    ads: {
                        formula: "Weighted ADS = (0.5 * ADS7) + (0.3 * ADS14) + (0.2 * ADS30)",
                        inputs: {
                            ads7: (metrics.ads.ads7 || 0).toFixed(2),
                            ads30: (metrics.ads.ads30 || 0).toFixed(2),
                            ads14: (metrics.ads.ads14 || 0).toFixed(2)
                        },
                        result: (metrics.ads.weighted || 0).toFixed(2)
                    },
                    safetyStock: {
                        formula: "Safety Stock = Max(z*sigma, ads*pw, 0.5*ads)",
                        inputs: {
                            sigma: (metrics.sigma || 0).toFixed(2),
                            pw: metrics.pw || 3,
                            z: (metrics.z || 1.65).toFixed(2)
                        },
                        result: (metrics.safetyStock || 0).toFixed(2)
                    },
                    rop: {
                        formula: "ROP = (ADS * PW) + SafetyStock",
                        inputs: {
                            ads: (metrics.ads.weighted || 0).toFixed(2),
                            pw: metrics.pw || 3,
                            safetyStock: (metrics.safetyStock || 0).toFixed(2)
                        },
                        result: (metrics.rop || 0).toFixed(1)
                    },
                    targetStock: {
                        formula: "Target Stock = (ADS * PW)",
                        inputs: {
                            ads: (metrics.ads.weighted || 0).toFixed(2),
                            pw: metrics.pw || 3
                        },
                        result: (metrics.targetStock || 0).toFixed(1)
                    },
                    recommendedQty: {
                        formula: "Rec Qty = Max(0, TargetStock - CurrentStock - Pending)",
                        inputs: {
                            target: (metrics.targetStock || 0).toFixed(1),
                            current: skuState.currentStock || 0,
                            pending: skuState.pendingQty || 0
                        },
                        result: metrics.recommendedQty || 0
                    }
                },
                classification,
                riskState,
                currentStock: skuState.currentStock,
                productName: skuState.productName
            };

            res.json({ success: true, metrics: trace });
        } catch (e) {
            console.error('❌ Metrics Endpoint Error:', e);
            console.error('Stack:', e.stack);
            res.status(500).json({ success: false, error: e.message });
        }
    });

app.post('/api/inventory-ai/chat',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id; // From JWT
            const { storeItemId, message, history } = req.body;
            if (!storeItemId || !message) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            // 1. Load SKU State & Existing Recommendation
            const skuState = await inventoryAIAgent.loadSKUState(storeId, storeItemId);
            if (!skuState) {
                return res.status(404).json({ success: false, error: 'Product not found' });
            }

            // Fetch the specific recommendation record to ensure consistency
            const recResult = await pool.query(
                `SELECT * FROM inventory_recommendations 
             WHERE store_id = $1 AND store_item_id = $2 
             ORDER BY generated_at DESC LIMIT 1`,
                [storeId, storeItemId]
            );
            const existingRec = recResult.rows[0];

            // Use existing metrics if available to prevent "data decay" drift
            const metrics = inventoryAIAgent.calculateDeterministicMetrics(skuState);

            // OVERRIDE: If we have a valid recent recommendation, use its numbers for the chat context AND trace
            // This ensures the AI explains "Why 67?" instead of "Why 33?"
            let effectiveRecQty = metrics.recommendedQty;
            let effectiveRisk = inventoryAIAgent.determineRiskState(metrics, skuState);
            let traceMath = {
                ads: {
                    formula: "Weighted ADS = (0.5 * ADS_7) + (0.3 * ADS_14) + (0.2 * ADS_30)",
                    inputs: {
                        ads7: (metrics.ads.ads7 || 0).toFixed(2),
                        ads14: (metrics.ads.ads14 || 0).toFixed(2),
                        ads30: (metrics.ads.ads30 || 0).toFixed(2)
                    },
                    result: (metrics.ads.weighted || 0).toFixed(2)
                },
                safetyStock: {
                    formula: "Safety Stock = Max(z*sigma, ads*pw, 0.5*ads)",
                    inputs: {
                        sigma: (metrics.sigma || 0).toFixed(2),
                        pw: metrics.pw || 3,
                        z: (metrics.z || 1.65).toFixed(2)
                    },
                    result: (metrics.safetyStock || 0).toFixed(2)
                },
                reorderPoint: {
                    formula: "ROP = Target Stock = (ADS * PW)",
                    inputs: {
                        ads: (metrics.ads.weighted || 0).toFixed(2),
                        pw: metrics.pw || 3
                    },
                    result: (metrics.targetStock || 0).toFixed(1)
                },
                targetStock: {
                    formula: "Target Stock = (ADS * PW)",
                    inputs: {
                        ads: (metrics.ads.weighted || 0).toFixed(2),
                        pw: metrics.pw || 3
                    },
                    result: (metrics.targetStock || 0).toFixed(1)
                },
                recommendedQty: {
                    formula: "Rec Qty = Max(0, TargetStock - CurrentStock - Pending)",
                    inputs: {
                        target: (metrics.targetStock || 0).toFixed(1),
                        current: skuState.currentStock || 0,
                        pending: skuState.pendingQty || 0
                    },
                    result: metrics.recommendedQty || 0,
                    note: "Calculated Deployment Requirement"
                },
                daysOfCover: {
                    formula: "Days of Cover = CurrentStock / ADS",
                    inputs: {
                        stock: skuState.currentStock || 0,
                        ads: (metrics.ads.weighted || 0.01).toFixed(2)
                    },
                    result: (metrics.daysOfCover || 0).toFixed(1)
                }
            };

            if (existingRec) {
                // VALIDATION: Prioritize LIVE MATH if the snapshot is contradictory
                // (e.g., if Snapshot says "Order 2" but Math says "Order 0")
                const snapshotMathQty = Math.max(0, (parseFloat(existingRec.weighted_ads) * (parseFloat(existingRec.protection_window) || 3)) - parseFloat(existingRec.current_stock));

                // If there's a significant drift, we reject the snapshot's quantity
                if (snapshotMathQty === 0 && parseFloat(existingRec.recommended_order_quantity) > 0) {
                    effectiveRecQty = 0; // Force correction
                    console.log(`⚠️ Fixed Stale Rec for ${storeItemId}: DB said ${existingRec.recommended_order_quantity}, Math says 0. Enforcing 0.`);
                } else {
                    effectiveRecQty = parseFloat(existingRec.recommended_order_quantity);
                }

                effectiveRisk = existingRec.risk_state;

                // RECONSTRUCT Math from the Database Snapshot
                const snapAds = parseFloat(existingRec.weighted_ads);
                const snapAds7 = parseFloat(existingRec.ads_7);
                const snapAds14 = parseFloat(existingRec.ads_14);
                const snapAds30 = parseFloat(existingRec.ads_30);
                const snapSS = parseFloat(existingRec.safety_stock);
                const snapROP = parseFloat(existingRec.reorder_point);
                const snapStock = parseFloat(existingRec.current_stock); // Stock AT TIME of generation
                const snapSigma = parseFloat(existingRec.demand_variability);
                const snapPW = parseFloat(existingRec.protection_window) || 3;

                // Re-calculate TargetStock based on the SNAPSHOT metrics (ADS * PW)
                const snapTargetStock = snapAds * snapPW;

                traceMath = {
                    ads: {
                        formula: "Weighted ADS = (0.5 * ADS_7) + (0.3 * ADS_14) + (0.2 * ADS_30)",
                        inputs: {
                            ads7: (snapAds7 || 0).toFixed(2),
                            ads14: (parseFloat(existingRec.ads_14) || 0).toFixed(2),
                            ads30: (snapAds30 || 0).toFixed(2)
                        },
                        result: (snapAds || 0).toFixed(2)
                    },
                    safetyStock: {
                        formula: "Safety Stock = Max(z*sigma, ads*pw, 0.5*ads)",
                        inputs: {
                            sigma: (snapSigma || 0).toFixed(2),
                            ads: (snapAds || 0).toFixed(2),
                            pw: (parseFloat(existingRec.protection_window) || 3)
                        },
                        result: (snapSS || 0).toFixed(2)
                    },
                    reorderPoint: {
                        formula: "ROP = Target Stock = (ADS * PW)",
                        inputs: {
                            ads: (snapAds || 0).toFixed(2),
                            pw: (parseFloat(existingRec.protection_window) || 3)
                        },
                        result: (snapAds * (parseFloat(existingRec.protection_window) || 3)).toFixed(1)
                    },
                    targetStock: {
                        formula: "Target Stock = (ADS * PW)",
                        inputs: {
                            ads: (snapAds || 0).toFixed(2),
                            pw: (parseFloat(existingRec.protection_window) || 3)
                        },
                        result: (snapAds * (parseFloat(existingRec.protection_window) || 3)).toFixed(1)
                    },
                    recommendedQty: {
                        formula: "Rec Qty = Max(0, TargetStock - SnapshotStock)",
                        inputs: {
                            target: (snapTargetStock || 0).toFixed(1),
                            current: snapStock || 0
                        },
                        result: effectiveRecQty || 0,
                        note: "Snapshot Recommendation (Adjusted for Math Consistency)"
                    },
                    daysOfCover: {
                        formula: "Days of Cover = SnapshotStock / ADS",
                        inputs: {
                            stock: snapStock || 0,
                            ads: (snapAds || 0.01).toFixed(2)
                        },
                        result: parseFloat(existingRec.days_of_cover || 0).toFixed(1)
                    }
                };
            }

            const classification = inventoryAIAgent.classifySKU(skuState, metrics);

            // 2. Prepare Context for Gemini
            const context = {
                productName: skuState.productName,
                category: skuState.category,
                currentStock: skuState.currentStock,
                ads: parseFloat(traceMath.ads.result),
                daysOfCover: parseFloat(traceMath.daysOfCover.result),
                recommendedQty: effectiveRecQty,
                riskState: effectiveRisk,
                classification: classification,
                safetyStock: parseFloat(traceMath.safetyStock.result),
                reorderPoint: parseFloat(traceMath.reorderPoint.result),
                targetStock: parseFloat(traceMath.targetStock.result),
                costPrice: skuState.costPrice,
                sellingPrice: skuState.sellingPrice,
                salesHistoryLength: skuState.salesHistory.length,
                recentSalesSum: skuState.salesHistory.reduce((sum, s) => sum + parseFloat(s.quantity_sold), 0)
            };

            // 3. Prepare Detailed Reasoning Breakdown (Tracing the Logic)
            const trace = {
                queries: [
                    {
                        description: "Load SKU Identity & Current Stock",
                        file: "modules/inventory-ai-agent.js",
                        query: `SELECT r.store_item_id, r.normalized_product_name, i.quantity_on_hand as current_stock, i.selling_price, i.cost_price 
                            FROM store_sku_registry r 
                            LEFT JOIN v_latest_inventory i ON r.store_id = i.store_id AND r.store_item_id = i.store_item_id
                            WHERE r.store_id = '${storeId}' AND r.store_item_id = '${storeItemId}'`
                    },
                    {
                        description: "Extract 30-Day Sales History",
                        file: "modules/inventory-ai-agent.js",
                        query: `SELECT transaction_date, quantity_sold FROM sales_transactions 
                            WHERE store_id = '${storeId}' AND store_item_id = '${storeItemId}' 
                            AND transaction_date > CURRENT_DATE - INTERVAL '30 days'`
                    },
                    {
                        description: "Load Strategic Experience (Feedback Loop)",
                        file: "modules/inventory-ai-agent.js",
                        query: `SELECT feedback_status, reasoning_text, generated_at 
                            FROM inventory_recommendations 
                            WHERE store_id = '${storeId}' AND store_item_id = '${storeItemId}'
                            ORDER BY generated_at DESC LIMIT 3`
                    }
                ],
                math: traceMath, // Inject the selected math packet (Stored Snapshot OR Live)
                rawSales: skuState.salesHistory.slice(0, 7) // Show proof of last 7 sales
            };

            // [INTELLIGENCE ISOLATION]: Ensure old/legacy reasoning from the DB 
            // is NEVER fed to the LLM. It must derive everything from the TRACE.
            const systemPrompt = `
You are the "Principal Inventory Strategist" for JityAi.
Your goal is to explain inventory decisions to a store owner clearly and confidently.

STRICT OPERATIONAL RULES:
1. FORMULA TRUTH: Use 7/14/30 day Weighted ADS. ADS values shown are daily averages computed from full transaction history.
2. SIMPLIFIED THRESHOLD: Use "Target Stock" (ADS * PW) as the single authoritative goal. Do not explain ROP separately.
3. BUFFER POLICY: Safety Stock is the "Operational Policy Floor" (equal to Target Stock for low-variance items). Do not present it as a separate calculation.
4. PRECISION: Use consistent rounding (1 decimal place) for all Target/Safety values to prevent micro-drift (e.g., 4.9 vs 4.87).
5. AUDIT DISCLOSURE: Historical records are for audit traceability only and did not influence this calculation.
6. NO IMPLIED TIMING: Do not mention "replenishment cycles" or "supplier delays" unless explicitly provided. Stick to "coverage" language.
7. RISK LABELS:
   - 'Capital Risk': High if Days of Cover >> Protection Window.
   - 'Stockout Risk': High if Days of Cover < Protection Window.
8. NO SYSTEM LEAKS: Do not use terms like "Trace", "JSON", "Snapshot", or "Discrepancy".

REASONING STRUCTURE (MANDATORY):
### 🧠 The Strategy
1. Days of Cover: Compare current coverage (DOC) vs the Target (Protection Window).
2. Risk Assessment: 
   - Stockout Risk: [High/Low/None] based on DOC.
   - Capital Risk: [High/Low/None] based on excess over Target.
3. Final Action: Justify the recommended order of ${context.recommendedQty} units to restore target coverage.

### 📊 The Math
- Summarize Weighted ADS.
- Explain Target Stock (ADS * PW) as the goal.
- Confirm Rec Qty calculation (Target - Current).
`;


            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;

            const geminiPayload = [];
            // Start with system prompt
            geminiPayload.push({ role: 'user', parts: [{ text: systemPrompt }] });
            geminiPayload.push({ role: 'model', parts: [{ text: "Acknowledged. I will strictly follow the Principal Inventory Strategist persona and the two-section output format using the BACKGROUND METRICS provided." }] });

            // Add history (proper Gemini roles are 'user' and 'model')
            if (history && Array.isArray(history)) {
                history.forEach(h => {
                    geminiPayload.push({
                        role: h.role === 'ai' ? 'model' : 'user',
                        parts: [{ text: h.content }]
                    });
                });
            }

            // Prepend context and trace to the prompt
            const userText = `
BACKGROUND METRICS:
${JSON.stringify(trace, null, 2)}

USER QUESTION: ${message}`;

            geminiPayload.push({ role: 'user', parts: [{ text: userText }] });

            console.log(`🤖 AI Chat: Sending request with trace to Gemini for ${context.productName}...`);

            // RETRY LOGIC for Protocol Errors
            let retries = 0;
            let response;
            let json;

            while (retries < 3) {
                try {
                    response = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: geminiPayload }),
                        signal: AbortSignal.timeout(10000) // 10s timeout per attempt
                    });

                    if (response.status === 429 || response.status === 503) {
                        throw new Error("Model Overloaded");
                    }

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error?.message || `API Error ${response.status}`);
                    }

                    json = await response.json();
                    break; // Success
                } catch (err) {
                    retries++;
                    console.warn(`⚠️ API Attempt ${retries} failed: ${err.message}. Retrying...`);
                    if (retries >= 3) {
                        return res.json({
                            success: true,
                            response: "I'm currently overloaded with traffic, but the math stands. Please check the trace below for the exact numbers.",
                            trace: trace
                        });
                    }
                    await new Promise(r => setTimeout(r, 1000 * retries)); // 1s, 2s backoff
                }
            }

            if (!json.candidates || !json.candidates[0] || !json.candidates[0].content) {
                console.error('❌ Unexpected Gemini Response:', JSON.stringify(json, null, 2));
                throw new Error('AI failed to generate a response');
            }

            const aiResponse = json.candidates[0].content.parts[0].text;
            res.json({ success: true, response: aiResponse, trace: trace });

        } catch (e) {
            console.error('❌ AI Chat Exception:', e);
            console.error('Stack Trace:', e.stack);
            res.status(500).json({ success: false, error: e.message, stack: e.stack });
        }
    });

/**
 * Daily Close Endpoint (Protected)
 */
app.post('/api/ops/daily-close',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id; // From JWT

            console.log(`🤖 Daily close triggered for ${storeId} by ${req.user.email}`);

            // Log AI analysis trigger
            await pool.query(
                `INSERT INTO operational_audit_log 
                 (store_id, user_id, action_type, status)
                 VALUES ($1, $2, 'ai.analysis_triggered', 'success')`,
                [storeId, req.user.user_id]
            );

            const result = await masterOrchestrator.runDailyClosingAnalysis(storeId);
            res.json(result);
        } catch (e) {
            console.error('Daily close error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

/**
 * Reports Endpoint (Protected)
 */
app.get('/api/reports/:type',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id; // From JWT
            const reportType = req.params.type;
            const days = req.query.days;

            const report = await reportEngine.generateReport(storeId, reportType, { days });
            res.json({ success: true, report });
        } catch (e) {
            console.error(`Report generation failed (${req.params.type}):`, e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

// ============================================================================
// REPORTS API
// ============================================================================

/**
 * Reports Endpoint (Protected)
 */
app.get('/api/reports/:type',
    authenticateJWT(authService),
    requireStoreScope,
    async (req, res) => {
        try {
            const storeId = req.store_id; // From JWT
            const reportType = req.params.type;
            const days = parseInt(req.query.days) || 30;

            console.log(`📊 Report requested: ${reportType} for store ${storeId} (${days} days)`);

            const report = await reportEngine.generateReport(storeId, reportType, { days });
            res.json({ success: true, report });
        } catch (e) {
            console.error(`Report generation failed (${req.params.type}):`, e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

// ============================================================================
// FRONTEND ROUTES (Authentication-Aware)
// ============================================================================

// Root route - redirect to login
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Dashboard route (requires auth check on client-side)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all for undefined routes (404)
app.get('*', (req, res) => {
    res.status(404).send('Page not found. Please visit /login.html');
});

// START SERVER
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

process.on('SIGTERM', async () => {
    await pool.end();
    process.exit(0);

});

module.exports = app;
