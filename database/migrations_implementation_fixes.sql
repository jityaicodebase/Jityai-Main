-- ============================================================================
-- IMPLEMENTATION FIXES - DATABASE MIGRATIONS
-- Execute these in order
-- ============================================================================

-- Migration 1: Add transaction_type to onboarding_handoff
ALTER TABLE onboarding_handoff 
ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) 
CHECK (transaction_type IN ('SALE', 'RESTOCK', 'RETURN', 'ADJUSTMENT', 'DAMAGE'))
DEFAULT 'ADJUSTMENT';

-- Migration 2: Add transaction_id for idempotency
ALTER TABLE onboarding_handoff 
ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);

-- Migration 3: Add unique constraint for idempotency (allow NULL for backward compatibility)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_transaction 
ON onboarding_handoff (store_id, store_item_id, transaction_id) 
WHERE transaction_id IS NOT NULL;

-- Migration 4: Add file checksum to raw_upload_archive
ALTER TABLE raw_upload_archive 
ADD COLUMN IF NOT EXISTS file_content_hash VARCHAR(64);

-- Migration 5: Add unique constraint for file deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_file_hash 
ON raw_upload_archive (store_id, file_content_hash) 
WHERE file_content_hash IS NOT NULL;

-- Migration 6: Create store_sync_config table
CREATE TABLE IF NOT EXISTS store_sync_config (
    store_id VARCHAR(50) PRIMARY KEY,
    sync_mode VARCHAR(20) CHECK (sync_mode IN ('MANUAL', 'CSV_PULL', 'LOCAL_AGENT', 'WEBHOOK')) DEFAULT 'MANUAL',
    sync_frequency VARCHAR(20) CHECK (sync_frequency IN ('REALTIME', 'HOURLY', 'DAILY', 'WEEKLY')) DEFAULT 'MANUAL',
    csv_source_path VARCHAR(500),
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(100),
    last_sync_at TIMESTAMP,
    next_sync_at TIMESTAMP,
    sync_enabled BOOLEAN DEFAULT true,
    auto_onboard_unknown_skus BOOLEAN DEFAULT false,
    notification_email VARCHAR(200),
    notification_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration 7: Create unknown_sku_escalation_queue table
CREATE TABLE IF NOT EXISTS unknown_sku_escalation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    store_item_id VARCHAR(100) NOT NULL,
    product_name VARCHAR(500),
    raw_data JSONB,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    escalation_status VARCHAR(20) DEFAULT 'pending' CHECK (escalation_status IN ('pending', 'onboarding_triggered', 'onboarded', 'ignored')),
    onboarding_batch_id UUID,
    resolved_at TIMESTAMP,
    notified_owner BOOLEAN DEFAULT false,
    notification_sent_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escalation_store ON unknown_sku_escalation_queue(store_id);
CREATE INDEX IF NOT EXISTS idx_escalation_status ON unknown_sku_escalation_queue(escalation_status);

-- Migration 8: Create sync_run_log table for tracking
CREATE TABLE IF NOT EXISTS sync_run_log (
    sync_run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    sync_type VARCHAR(30) CHECK (sync_type IN ('manual_upload', 'scheduled_csv_pull', 'webhook', 'local_agent')),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('running', 'completed', 'failed', 'partial')),
    records_processed INT DEFAULT 0,
    records_success INT DEFAULT 0,
    records_failed INT DEFAULT 0,
    unknown_skus_detected INT DEFAULT 0,
    error_message TEXT,
    data_source VARCHAR(100),
    triggered_by VARCHAR(50) DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_sync_log_store ON sync_run_log(store_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_run_log(started_at DESC);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify migrations
SELECT 
    'onboarding_handoff' as table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'onboarding_handoff'
AND column_name IN ('transaction_type', 'transaction_id');

SELECT 
    'store_sync_config' as table_name,
    COUNT(*) as row_count
FROM store_sync_config;

SELECT 
    'unknown_sku_escalation_queue' as table_name,
    COUNT(*) as row_count
FROM unknown_sku_escalation_queue;

-- ============================================================================
-- END OF MIGRATIONS
-- ============================================================================
