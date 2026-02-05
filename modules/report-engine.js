const { Pool } = require('pg');

/**
 * REPORT ENGINE v2.1
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHORITATIVE METRIC DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ADS (Average Daily Sales):
 *   = SUM(quantity_sold over N days) / N
 *   ≠ AVG(quantity_sold) ← INCORRECT, do not use
 * 
 * ADS = 0 HANDLING (CANONICAL RULE):
 *   IF ADS = 0 AND OH > 0 → Classify as DEAD_STOCK candidate
 *   IF ADS = 0 AND OH = 0 → Ignore SKU (inactive)
 *   This prevents dead SKUs leaking into Reorder/Buffer logic
 * 
 * DOI (Days of Inventory):
 *   = OH / ADS
 *   = 999 if ADS = 0 (capped, not NULL to prevent comparison bugs)
 * 
 * WOS (Weeks of Supply):
 *   = OH / Weekly_Sales
 *   = Capped at 52 weeks for display
 * 
 * SAFETY STOCK (Dynamic with Guardrails):
 *   = CASE
 *       WHEN ADS_7 < 0.5 THEN 1              -- Low velocity: minimal buffer
 *       ELSE MAX(3, CEIL(ADS_7 × 3))         -- Normal: 3-day coverage or 3 units
 *     END
 * 
 * ISR (Inventory-to-Sales Ratio):
 *   = Σ(OH × cost) / Σ(qty_sold × cost)      -- Both at cost for consistency
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * LIMITATIONS (EXPLICIT):
 * - No lead time data → Reorder triggers use coverage days only
 * - No reserved quantity → Available = On-Hand
 * - No receipt date → True FIFO aging not possible
 * - All quantity formulas are DIAGNOSTIC ONLY, not executed by system
 * ═══════════════════════════════════════════════════════════════════════════
 */

class ReportEngine {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Main Entry Point
     */
    async generateReport(storeId, reportType, options = {}) {
        console.log(`📊 Generating Report: ${reportType} for ${storeId} (days: ${options.days || 'default'})`);
        const days = parseInt(options.days) || 30;

        switch (reportType) {
            case 'reorder-now': return this.getReorderNow(storeId, days);
            case 'frequent-stockouts': return this.getFrequentStockouts(storeId);
            case 'weeks-of-supply': return this.getWeeksOfSupply(storeId, days);
            case 'overstocked-slow-moving': return this.getOverstockedSlowMoving(storeId, days);
            case 'emergency-refill': return this.getEmergencyRefill(storeId);
            case 'no-sales': return this.getNoSales(storeId, days);
            case 'buffer-breach': return this.getBufferBreach(storeId, days);
            case 'inventory-position': return this.getInventoryPosition(storeId);
            case 'isr': return this.getISR(storeId, days);
            case 'aging-bucket': return this.getAgingBuckets(storeId);
            default: throw new Error(`Unknown report type: ${reportType}`);
        }
    }

    /**
     * Common CTE for latest inventory state
     */
    getLatestHandoffCTE() {
        return `
            LatestHandoff AS (
                SELECT DISTINCT ON (store_id, store_item_id)
                    store_id, store_item_id, quantity_on_hand, selling_price, cost_price, as_of_date
                FROM onboarding_handoff
                ORDER BY store_id, store_item_id, as_of_date DESC
            )
        `;
    }

    /**
     * 1. Reorder Now – Stock Will Run Out Soon
     * 
     * Trigger: DOI < 7 AND ADS > 0 AND OH > 0
     * Action: Schedule reorder immediately or in next buying cycle
     * 
     * EXCLUDES: Dead stock (ADS=0) to prevent false positives
     */
    async getReorderNow(storeId, days) {
        const sql = `
            WITH ${this.getLatestHandoffCTE()},
            SalesMetrics AS (
                SELECT 
                    store_item_id, 
                    -- CORRECT: SUM/N, not AVG (which divides by event count)
                    COALESCE(SUM(quantity_sold), 0) / NULLIF(${days}, 0) as ads
                FROM sales_transactions 
                WHERE store_id = $1 AND transaction_date >= CURRENT_DATE - INTERVAL '${days} days'
                GROUP BY store_item_id
            )
            SELECT 
                r.store_item_id as sku_id,
                r.normalized_product_name as product_name,
                COALESCE(h.quantity_on_hand, 0) as stock,
                ROUND(COALESCE(sm.ads, 0)::numeric, 2) as avg_daily_sales,
                CASE 
                    WHEN COALESCE(sm.ads, 0) > 0 
                    THEN ROUND((COALESCE(h.quantity_on_hand, 0) / sm.ads)::numeric, 1)
                    ELSE 999  -- Capped, not NULL, to prevent comparison bugs
                END as days_of_cover
            FROM store_sku_registry r
            LEFT JOIN LatestHandoff h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            LEFT JOIN SalesMetrics sm ON r.store_item_id = sm.store_item_id
            WHERE r.store_id = $1 
              AND r.status = 'active'
              -- CANONICAL RULE: Only include items WITH sales velocity (ADS > 0)
              AND COALESCE(sm.ads, 0) > 0
              AND COALESCE(h.quantity_on_hand, 0) > 0
              AND (COALESCE(h.quantity_on_hand, 0) / sm.ads) < 7
            ORDER BY days_of_cover ASC
            LIMIT 50
        `;
        const res = await this.pool.query(sql, [storeId]);
        return { title: `Reorder Now (< 7 Days Cover)`, data: res.rows };
    }

    /**
     * 2. Frequent Stockouts (Items at 0 with high historical demand)
     * 
     * NOTE: This is a PROXY report. True stockout frequency requires 
     * stockout_events table (not available). Shows OOS items with demand history.
     */
    async getFrequentStockouts(storeId) {
        const sql = `
            WITH ${this.getLatestHandoffCTE()}
            SELECT 
                r.store_item_id as sku_id,
                r.normalized_product_name as product_name,
                COUNT(s.transaction_id) as total_sales_events,
                COALESCE(SUM(s.quantity_sold), 0) as total_units_sold
            FROM store_sku_registry r
            LEFT JOIN LatestHandoff h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            LEFT JOIN sales_transactions s ON r.store_id = s.store_id AND r.store_item_id = s.store_item_id
            WHERE r.store_id = $1 
              AND COALESCE(h.quantity_on_hand, 0) <= 0
            GROUP BY r.store_item_id, r.normalized_product_name
            HAVING COUNT(s.transaction_id) > 5
            ORDER BY total_sales_events DESC
            LIMIT 50
        `;
        const res = await this.pool.query(sql, [storeId]);
        return { title: "High-Demand OOS Items (Proxy for Stockouts)", data: res.rows };
    }

    /**
     * 3. Weeks of Supply (WOS)
     * 
     * Formula: OH / Weekly_Sales
     * Capped at 52 weeks for display
     */
    async getWeeksOfSupply(storeId, days) {
        const sql = `
            WITH ${this.getLatestHandoffCTE()},
            WeeklySales AS (
                SELECT 
                    store_item_id, 
                    COALESCE(SUM(quantity_sold), 0) as weekly_units
                FROM sales_transactions 
                WHERE store_id = $1 AND transaction_date >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY store_item_id
            )
            SELECT 
                r.store_item_id as sku_id,
                r.normalized_product_name as product_name,
                COALESCE(h.quantity_on_hand, 0) as stock,
                COALESCE(ws.weekly_units, 0) as weekly_sales,
                CASE 
                    WHEN COALESCE(ws.weekly_units, 0) > 0 
                    THEN LEAST(52, ROUND((COALESCE(h.quantity_on_hand, 0) / ws.weekly_units)::numeric, 1))
                    ELSE 52  -- Capped at 52 weeks, not 99
                END as weeks_of_supply
            FROM store_sku_registry r
            LEFT JOIN LatestHandoff h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            LEFT JOIN WeeklySales ws ON r.store_item_id = ws.store_item_id
            WHERE r.store_id = $1 AND r.status = 'active'
            ORDER BY weeks_of_supply ASC
            LIMIT 100
        `;
        const res = await this.pool.query(sql, [storeId]);
        return { title: "Weeks of Supply Report", data: res.rows };
    }

    /**
     * 4. Overstocked Slow-Moving Products
     * 
     * Trigger: WOS > 12 weeks AND low velocity
     */
    async getOverstockedSlowMoving(storeId, days) {
        const sql = `
            WITH ${this.getLatestHandoffCTE()},
            SalesMetrics AS (
                SELECT 
                    store_item_id, 
                    COALESCE(SUM(quantity_sold), 0) as period_sales,
                    COALESCE(SUM(quantity_sold), 0) / NULLIF(${days}, 0) as ads
                FROM sales_transactions 
                WHERE store_id = $1 AND transaction_date >= CURRENT_DATE - INTERVAL '${days} days'
                GROUP BY store_item_id
            )
            SELECT 
                r.store_item_id as sku_id,
                r.normalized_product_name as product_name,
                COALESCE(h.quantity_on_hand, 0) as stock,
                COALESCE(sm.period_sales, 0) as sales_in_period,
                ROUND(COALESCE(sm.ads, 0)::numeric, 2) as avg_daily_sales,
                -- WOS calculation
                CASE 
                    WHEN COALESCE(sm.ads, 0) > 0 
                    THEN ROUND((COALESCE(h.quantity_on_hand, 0) / (sm.ads * 7))::numeric, 1)
                    ELSE 52
                END as weeks_of_supply,
                ROUND((COALESCE(h.quantity_on_hand, 0) * COALESCE(h.cost_price, 0))::numeric, 2) as blocked_capital
            FROM store_sku_registry r
            LEFT JOIN LatestHandoff h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            LEFT JOIN SalesMetrics sm ON r.store_item_id = sm.store_item_id
            WHERE r.store_id = $1 
              AND r.status = 'active'
              AND COALESCE(h.quantity_on_hand, 0) > 0
              -- Overstocked: WOS > 12 weeks
              AND (
                  (COALESCE(sm.ads, 0) > 0 AND (COALESCE(h.quantity_on_hand, 0) / (sm.ads * 7)) > 12)
                  OR (COALESCE(sm.ads, 0) = 0 AND COALESCE(h.quantity_on_hand, 0) > 10)  -- Dead stock with inventory
              )
            ORDER BY blocked_capital DESC
            LIMIT 50
        `;
        const res = await this.pool.query(sql, [storeId]);
        return { title: `Overstocked & Slow Moving (${days}d analysis)`, data: res.rows };
    }

    /**
     * 5. Emergency Refill Required (0 Stock + Recent Demand)
     * 
     * Trigger: OH = 0 AND sales in last 3 days
     * Priority: CRITICAL
     */
    async getEmergencyRefill(storeId) {
        const sql = `
            WITH ${this.getLatestHandoffCTE()}
            SELECT DISTINCT
                r.store_item_id as sku_id,
                r.normalized_product_name as product_name,
                COALESCE(h.quantity_on_hand, 0) as stock,
                COUNT(s.transaction_id) as recent_demand_events,
                COALESCE(SUM(s.quantity_sold), 0) as recent_units_demanded
            FROM store_sku_registry r
            LEFT JOIN LatestHandoff h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            LEFT JOIN sales_transactions s ON r.store_id = s.store_id 
                AND r.store_item_id = s.store_item_id
                AND s.transaction_date >= CURRENT_DATE - INTERVAL '3 days'
            WHERE r.store_id = $1 
              AND COALESCE(h.quantity_on_hand, 0) <= 0
            GROUP BY r.store_item_id, r.normalized_product_name, h.quantity_on_hand
            HAVING COUNT(s.transaction_id) > 0
            ORDER BY recent_units_demanded DESC
            LIMIT 30
        `;
        const res = await this.pool.query(sql, [storeId]);
        return { title: "Emergency Refill Required (OOS with Demand)", data: res.rows };
    }

    /**
     * 6. No Sales in Last X Days (Dead Stock)
     * 
     * CANONICAL RULE: ADS = 0 AND OH > 0 → Dead Stock Candidate
     */
    async getNoSales(storeId, days) {
        const sql = `
            WITH ${this.getLatestHandoffCTE()},
            LastSale AS (
                SELECT store_item_id, MAX(transaction_date) as last_sale_date
                FROM sales_transactions
                WHERE store_id = $1
                GROUP BY store_item_id
            )
            SELECT 
                r.store_item_id as sku_id,
                r.normalized_product_name as product_name,
                COALESCE(h.quantity_on_hand, 0) as stock,
                ls.last_sale_date,
                CASE 
                    WHEN ls.last_sale_date IS NULL THEN 'Never sold'
                    ELSE (CURRENT_DATE - ls.last_sale_date)::text || ' days ago'
                END as last_sale_info,
                ROUND((COALESCE(h.quantity_on_hand, 0) * COALESCE(h.cost_price, 0))::numeric, 2) as value_at_risk
            FROM store_sku_registry r
            LEFT JOIN LatestHandoff h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            LEFT JOIN LastSale ls ON r.store_item_id = ls.store_item_id
            WHERE r.store_id = $1 
              AND r.status = 'active'
              -- CANONICAL: ADS = 0 AND OH > 0 → Dead stock
              AND COALESCE(h.quantity_on_hand, 0) > 0
              AND (ls.last_sale_date < CURRENT_DATE - INTERVAL '${days} days' OR ls.last_sale_date IS NULL)
            ORDER BY value_at_risk DESC NULLS LAST
            LIMIT 50
        `;
        const res = await this.pool.query(sql, [storeId]);
        return { title: `Dead Stock (No Sales in ${days} Days)`, data: res.rows };
    }

    /**
     * 7. Buffer Breach Report (Below Dynamic Safety Stock)
     * 
     * DYNAMIC SAFETY STOCK WITH GUARDRAILS:
     *   IF ADS < 0.5 THEN safety = 1 (low velocity: minimal buffer)
     *   ELSE safety = MAX(3, CEIL(ADS × 3))
     */
    async getBufferBreach(storeId, days) {
        const sql = `
            WITH ${this.getLatestHandoffCTE()},
            SalesMetrics AS (
                SELECT 
                    store_item_id, 
                    COALESCE(SUM(quantity_sold), 0) / NULLIF(7, 0) as ads_7
                FROM sales_transactions 
                WHERE store_id = $1 AND transaction_date >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY store_item_id
            ),
            SafetyStock AS (
                SELECT 
                    r.store_item_id,
                    COALESCE(h.quantity_on_hand, 0) as stock,
                    COALESCE(sm.ads_7, 0) as ads_7,
                    -- DYNAMIC SAFETY WITH GUARDRAILS
                    CASE 
                        WHEN COALESCE(sm.ads_7, 0) < 0.5 THEN 1  -- Low velocity: 1 unit
                        ELSE GREATEST(3, CEIL(COALESCE(sm.ads_7, 0) * 3))  -- Normal: 3-day or 3 units
                    END as safety_threshold
                FROM store_sku_registry r
                LEFT JOIN LatestHandoff h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
                LEFT JOIN SalesMetrics sm ON r.store_item_id = sm.store_item_id
                WHERE r.store_id = $1 AND r.status = 'active'
            )
            SELECT 
                ss.store_item_id as sku_id,
                r.normalized_product_name as product_name,
                ss.stock,
                ROUND(ss.ads_7::numeric, 2) as avg_daily_sales,
                ss.safety_threshold,
                (ss.safety_threshold - ss.stock) as units_below_threshold
            FROM SafetyStock ss
            JOIN store_sku_registry r ON ss.store_item_id = r.store_item_id AND r.store_id = $1
            WHERE ss.stock < ss.safety_threshold 
              AND ss.stock > 0  -- Exclude OOS (handled by Emergency Refill)
              AND ss.ads_7 > 0  -- CANONICAL: Only items with velocity
            ORDER BY units_below_threshold DESC
            LIMIT 50
        `;
        const res = await this.pool.query(sql, [storeId]);
        return { title: "Buffer Breach (Below Dynamic Safety Stock)", data: res.rows };
    }

    /**
     * 8. Inventory Position Report
     * 
     * Diagnostic view of all active inventory with valuation
     */
    async getInventoryPosition(storeId) {
        const sql = `
            WITH ${this.getLatestHandoffCTE()}
            SELECT 
                r.store_item_id as sku_id,
                r.normalized_product_name as product_name,
                r.master_category_name as category,
                COALESCE(h.quantity_on_hand, 0) as stock,
                COALESCE(h.cost_price, 0) as cost_price,
                COALESCE(h.selling_price, 0) as selling_price,
                ROUND((COALESCE(h.quantity_on_hand, 0) * COALESCE(h.selling_price, 0))::numeric, 2) as retail_value,
                ROUND((COALESCE(h.quantity_on_hand, 0) * COALESCE(h.cost_price, 0))::numeric, 2) as cost_value
            FROM store_sku_registry r
            LEFT JOIN LatestHandoff h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            WHERE r.store_id = $1 AND r.status = 'active'
            ORDER BY retail_value DESC
            LIMIT 100
        `;
        const res = await this.pool.query(sql, [storeId]);
        return { title: "Inventory Position Overview", data: res.rows };
    }

    /**
     * 9. Inventory to Sales Ratio (ISR)
     * 
     * CORRECTED: Both numerator and denominator at COST for consistency
     * 
     * ISR = Σ(OH × cost) / Σ(qty_sold × cost)
     * 
     * NOTE: This is a DIAGNOSTIC metric only
     */
    async getISR(storeId, days) {
        // 1. Get Total Inventory Value at COST
        const invRes = await this.pool.query(`
            WITH LatestHandoff AS (
                SELECT DISTINCT ON (store_id, store_item_id)
                    store_id, store_item_id, quantity_on_hand, cost_price
                FROM onboarding_handoff
                WHERE store_id = $1
                ORDER BY store_id, store_item_id, as_of_date DESC
            )
            SELECT COALESCE(SUM(quantity_on_hand * cost_price), 0) as total_inv_cost 
            FROM LatestHandoff
        `, [storeId]);

        // 2. Get COGS (Cost of Goods Sold) - CORRECTED: use cost, not sale price
        const salesRes = await this.pool.query(`
            SELECT 
                COALESCE(SUM(s.quantity_sold * h.cost_price), 0) as total_cogs,
                COALESCE(SUM(s.quantity_sold * s.sale_price), 0) as total_revenue
            FROM sales_transactions s
            LEFT JOIN (
                SELECT DISTINCT ON (store_id, store_item_id) 
                    store_id, store_item_id, cost_price
                FROM onboarding_handoff
                ORDER BY store_id, store_item_id, as_of_date DESC
            ) h ON s.store_id = h.store_id AND s.store_item_id = h.store_item_id
            WHERE s.store_id = $1 AND s.transaction_date >= CURRENT_DATE - INTERVAL '${days} days'
        `, [storeId]);

        const invCost = parseFloat(invRes.rows[0].total_inv_cost || 0);
        const cogs = parseFloat(salesRes.rows[0].total_cogs || 0);
        const revenue = parseFloat(salesRes.rows[0].total_revenue || 0);

        // ISR at cost (correct)
        const isr = cogs > 0 ? (invCost / cogs).toFixed(2) : "N/A";

        // Interpretation
        let interpretation = "No sales data";
        if (isr !== "N/A") {
            const isrNum = parseFloat(isr);
            if (isrNum > 3) interpretation = "⚠️ High inventory vs sales (overstock risk)";
            else if (isrNum > 1.5) interpretation = "Moderate inventory levels";
            else if (isrNum > 0.5) interpretation = "✅ Healthy ratio";
            else interpretation = "⚠️ Low inventory (stockout risk)";
        }

        return {
            title: `Inventory-to-Sales Ratio (${days}d) — Diagnostic Only`,
            data: [
                { metric: "Total Inventory Value (at Cost)", value: `₹${invCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
                { metric: `Cost of Goods Sold (${days}d)`, value: `₹${cogs.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
                { metric: `Sales Revenue (${days}d)`, value: `₹${revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
                { metric: "ISR Score (Inv/COGS)", value: isr },
                { metric: "Interpretation", value: interpretation }
            ]
        };
    }

    /**
     * 10. Aging Bucket Distribution Report
     * 
     * LIMITATION: Uses handoff_date as proxy for inventory age
     * True FIFO aging requires receipt tracking (not available)
     */
    async getAgingBuckets(storeId) {
        const sql = `
            WITH ${this.getLatestHandoffCTE()}
            SELECT 
                CASE 
                    WHEN h.as_of_date >= CURRENT_DATE - INTERVAL '30 days' THEN '0-30 Days (Fresh)'
                    WHEN h.as_of_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31-60 Days'
                    WHEN h.as_of_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61-90 Days'
                    ELSE '90+ Days (Stale)'
                END as age_bucket,
                COUNT(*) as sku_count,
                SUM(COALESCE(h.quantity_on_hand, 0)) as total_units,
                ROUND(SUM(COALESCE(h.quantity_on_hand, 0) * COALESCE(h.cost_price, 0))::numeric, 2) as value_at_risk
            FROM store_sku_registry r
            LEFT JOIN LatestHandoff h ON r.store_id = h.store_id AND r.store_item_id = h.store_item_id
            WHERE r.store_id = $1 
              AND r.status = 'active'
              AND COALESCE(h.quantity_on_hand, 0) > 0
            GROUP BY age_bucket
            ORDER BY 
                CASE age_bucket
                    WHEN '0-30 Days (Fresh)' THEN 1
                    WHEN '31-60 Days' THEN 2
                    WHEN '61-90 Days' THEN 3
                    ELSE 4
                END
        `;
        const res = await this.pool.query(sql, [storeId]);
        return {
            title: "Inventory Freshness by Handoff Date (Proxy for Aging)",
            data: res.rows
        };
    }
}

module.exports = ReportEngine;
