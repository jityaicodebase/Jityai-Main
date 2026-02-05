-- ============================================================================
-- PHASE 4: NETWORK RADAR (REGIONAL ADVISORIES)
-- Centralized signal aggregation for cross-store category trends
-- ============================================================================

-- 1. Regional Category Signals Table
-- This stores the aggregated "Network Pulse"
CREATE TABLE IF NOT EXISTS regional_category_signals (
    signal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id VARCHAR(100) NOT NULL, -- e.g., 'Bangalore-South'
    category_name VARCHAR(100) NOT NULL,
    signal_type VARCHAR(50) NOT NULL, -- e.g., 'VELOCITY_SPIKE', 'DEMAND_GROWTH'
    magnitude NUMERIC(5,2), -- e.g., 1.15 for 15% increase
    evidence_count INTEGER, -- Number of stores contributing (for N > Threshold check)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup by region and category
CREATE INDEX idx_radar_region_cat ON regional_category_signals(region_id, category_name);

-- 2. System Intelligence Config
-- This is where the "Master Toggle" for Layer 4 lives
CREATE TABLE IF NOT EXISTS system_intelligence_config (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initialize Radar Toggle as DISABLED
INSERT INTO system_intelligence_config (key, value)
VALUES ('radar_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Audit Log for Phase 4
INSERT INTO operational_audit_log (action_type, metadata, status)
VALUES ('system.migration', '{"phase": 4, "module": "network_radar_foundation"}', 'success');
