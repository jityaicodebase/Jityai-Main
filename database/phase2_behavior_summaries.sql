-- ============================================================================
-- PHASE 2: BEHAVIOR SUMMARY ASSEMBLY
-- Quantitative aggregation of the Outcome Ledger
-- ============================================================================

-- 1. SKU-Level Behavior View (History of specific item)
CREATE OR REPLACE VIEW v_sku_outcome_history AS
SELECT 
    store_id,
    store_item_id,
    COUNT(*) AS total_decisions,
    COUNT(CASE WHEN feedback_status = 'ACCEPTED' THEN 1 END) AS accepted_count,
    COUNT(CASE WHEN feedback_status = 'IGNORED' THEN 1 END) AS ignored_count,
    COUNT(CASE WHEN realized_outcome = 'Opportunity Lost' THEN 1 END) AS verified_losses,
    COUNT(CASE WHEN realized_outcome = 'Opportunity Saved' THEN 1 END) AS verified_savings
FROM inventory_recommendations
WHERE feedback_status IN ('ACCEPTED', 'IGNORED')
GROUP BY store_id, store_item_id;

-- 2. Store-Level Price Sensitivity (Aggregated Bias)
CREATE OR REPLACE VIEW v_store_price_sensitivity AS
WITH decision_prices AS (
    SELECT 
        ir.store_id,
        ir.feedback_status,
        inv.cost_price,
        CASE 
            WHEN inv.cost_price > 1000 THEN 'HIGH'
            WHEN inv.cost_price > 500 THEN 'MID'
            ELSE 'LOW'
        END as price_tier
    FROM inventory_recommendations ir
    JOIN v_latest_inventory inv ON ir.store_id = inv.store_id AND ir.store_item_id = inv.store_item_id
    WHERE ir.feedback_status IN ('ACCEPTED', 'IGNORED')
)
SELECT 
    store_id,
    price_tier,
    COUNT(*) as total_decisions,
    ROUND(COUNT(CASE WHEN feedback_status = 'IGNORED' THEN 1 END) * 100.0 / COUNT(*), 2) as ignore_rate_percent
FROM decision_prices
GROUP BY store_id, price_tier;

-- 3. Audit Log for Phase 2
INSERT INTO operational_audit_log (action_type, metadata, status)
VALUES ('system.migration', '{"phase": 2, "module": "behavior_summary_assembly"}', 'success');
