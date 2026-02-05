-- ============================================================================
-- PHASE 1: OUTCOME LEDGER (Layer 2)
-- Implementation of Conservative Wisdom Sync
-- ============================================================================

-- 1. Ensure columns exist for tracking
ALTER TABLE inventory_recommendations 
ADD COLUMN IF NOT EXISTS initial_stock_at_feedback DECIMAL(12,3),
ADD COLUMN IF NOT EXISTS outcome_check_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_outcome_check TIMESTAMP;

-- 2. Performance indexes for the Sync engine
CREATE INDEX IF NOT EXISTS idx_rec_outcome_sync 
ON inventory_recommendations(feedback_status, realized_outcome, processed_at) 
WHERE realized_outcome IS NULL AND feedback_status != 'PENDING';

-- 3. Audit process tracking
INSERT INTO operational_audit_log (action_type, metadata, status)
VALUES ('system.migration', '{"phase": 1, "module": "outcome_ledger"}', 'success');
