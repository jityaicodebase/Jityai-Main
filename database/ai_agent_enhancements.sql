-- AI Agent Schema Enhancements
-- Adds support for decision-grade inventory metrics

-- 1. Extend SKU Registry for AI Decisioning
ALTER TABLE store_sku_registry 
ADD COLUMN IF NOT EXISTS shelf_life_days INT,
ADD COLUMN IF NOT EXISTS supplier_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS moq DECIMAL(12,3) DEFAULT 1,
ADD COLUMN IF NOT EXISTS case_pack_size DECIMAL(12,3) DEFAULT 1,
ADD COLUMN IF NOT EXISTS velocity_class VARCHAR(20),      -- Fast, Medium, Slow
ADD COLUMN IF NOT EXISTS predictability_class VARCHAR(20),-- Stable, Volatile
ADD COLUMN IF NOT EXISTS business_role VARCHAR(20),       -- Traffic, Margin, Basket, Long-tail
ADD COLUMN IF NOT EXISTS risk_class VARCHAR(20);         -- Critical, Normal, Low

-- 2. Create Latest Inventory View (Efficiency Layer)
CREATE OR REPLACE VIEW v_latest_inventory AS
SELECT DISTINCT ON (store_id, store_item_id)
    store_id,
    store_item_id,
    quantity_on_hand,
    selling_price,
    cost_price,
    as_of_date as as_of_timestamp
FROM onboarding_handoff
ORDER BY store_id, store_item_id, as_of_date DESC;

-- 3. Extend Recommendations for LLM Reasoning
ALTER TABLE inventory_recommendations
ADD COLUMN IF NOT EXISTS recommended_action VARCHAR(50),
ADD COLUMN IF NOT EXISTS reasoning_text TEXT,
ADD COLUMN IF NOT EXISTS action_priority VARCHAR(20);
