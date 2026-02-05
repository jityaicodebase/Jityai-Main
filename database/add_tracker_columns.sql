-- ============================================================================
-- AI TRACKER ENHANCEMENTS
-- Tracking financial impact of accepted/ignored recommendations
-- ============================================================================

-- Add tracking columns to inventory_recommendations
ALTER TABLE inventory_recommendations 
ADD COLUMN IF NOT EXISTS feedback_status VARCHAR(20) DEFAULT 'PENDING' 
    CHECK (feedback_status IN ('PENDING', 'ACCEPTED', 'IGNORED', 'EXPIRED', 'MODIFIED')),
ADD COLUMN IF NOT EXISTS feedback_reason TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS realized_outcome VARCHAR(50),
ADD COLUMN IF NOT EXISTS financial_impact_cash DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS replenishment_detected_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS initial_stock_at_feedback DECIMAL(12,3);

-- Add barcode index if missing
CREATE INDEX IF NOT EXISTS idx_sku_barcode ON store_sku_registry(barcode);

-- Add columns for deeper insights
ALTER TABLE inventory_recommendations
ADD COLUMN IF NOT EXISTS deadstock_risk_level VARCHAR(20),
ADD COLUMN IF NOT EXISTS missed_sales_opportunity DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS stockout_days_count INT;
