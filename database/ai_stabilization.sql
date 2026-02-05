-- INVENTORY AI AGENT - STABILIZATION & TRACKING
-- Adds support for recommendation confidence and decision logging

-- 1. Extend Recommendations for Feedback Loop
ALTER TABLE inventory_recommendations 
ADD COLUMN IF NOT EXISTS feedback_status VARCHAR(20) DEFAULT 'PENDING' CHECK (feedback_status IN ('PENDING', 'ACCEPTED', 'IGNORED', 'EXPIRED')),
ADD COLUMN IF NOT EXISTS feedback_reason TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS recommendation_confidence DECIMAL(3,2);

-- 2. Indexing for Dashboard Performance
CREATE INDEX IF NOT EXISTS idx_rec_feedback_status ON inventory_recommendations(feedback_status);
CREATE INDEX IF NOT EXISTS idx_rec_risk_state ON inventory_recommendations(risk_state);
CREATE INDEX IF NOT EXISTS idx_rec_store_gen ON inventory_recommendations(store_id, generated_at DESC);
