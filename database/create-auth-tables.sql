-- ============================================================================
-- CREATE AUTH TABLES ONLY (For Existing Database)
-- ============================================================================
-- Run this if you already have a database with the old schema
-- This adds ONLY the new auth tables without recreating existing tables
-- ============================================================================

-- Users table (Store owners and staff)
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Store Binding (CRITICAL: One user = One store)
    store_id VARCHAR(50) NOT NULL,
    
    -- Role-based access
    role VARCHAR(20) NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff', 'admin')),
    
    -- Account Status
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    
    -- Security
    last_login_at TIMESTAMP,
    login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    full_name VARCHAR(200),
    phone VARCHAR(20)
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = TRUE;

-- API Keys for Store-Side Connector (Hourly Sync)
CREATE TABLE IF NOT EXISTS api_keys (
    api_key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    
    -- Key Details
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL, -- First 8 chars for identification
    
    -- Scoping
    key_type VARCHAR(20) NOT NULL DEFAULT 'connector' CHECK (key_type IN ('connector', 'webhook', 'integration')),
    permissions TEXT[], -- e.g., ['upload:csv', 'read:inventory']
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    
    -- Usage Tracking
    last_used_at TIMESTAMP,
    usage_count INT DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(user_id),
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(user_id),
    revoke_reason TEXT
);

-- Indexes for api_keys
CREATE INDEX IF NOT EXISTS idx_apikeys_store ON api_keys(store_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_active ON api_keys(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_apikeys_prefix ON api_keys(key_prefix);

-- Operational Audit Log (Auth, Uploads, Syncs, AI Runs)
CREATE TABLE IF NOT EXISTS operational_audit_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    store_id VARCHAR(50),
    user_id UUID REFERENCES users(user_id),
    api_key_id UUID REFERENCES api_keys(api_key_id),
    
    -- Event Details
    action_type VARCHAR(50) NOT NULL,
    -- Values: 'auth.login', 'auth.logout', 'auth.failed', 'file.upload', 
    --         'sync.started', 'sync.completed', 'sync.failed', 
    --         'ai.analysis_triggered', 'ai.recommendation_generated',
    --         'recommendation.accepted', 'recommendation.ignored'
    
    entity_type VARCHAR(50), -- 'file', 'recommendation', 'sync_batch', etc.
    entity_id VARCHAR(255),  -- UUID or identifier
    
    -- Metadata (JSON)
    metadata JSONB,
    
    -- Result
    status VARCHAR(20) CHECK (status IN ('success', 'failure', 'pending')),
    error_message TEXT,
    
    -- Request Context
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamp
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for operational_audit_log
CREATE INDEX IF NOT EXISTS idx_opaudit_store ON operational_audit_log(store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_opaudit_user ON operational_audit_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_opaudit_action ON operational_audit_log(action_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_opaudit_status ON operational_audit_log(status) WHERE status = 'failure';
CREATE INDEX IF NOT EXISTS idx_opaudit_metadata ON operational_audit_log USING gin(metadata);

-- Store Settings (Cloud Configuration)
CREATE TABLE IF NOT EXISTS store_settings (
    store_id VARCHAR(50) PRIMARY KEY,
    
    -- Store Profile
    store_name VARCHAR(200) NOT NULL,
    store_type VARCHAR(50), -- 'grocery', 'pharmacy', 'general'
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    
    -- Sync Configuration
    sync_enabled BOOLEAN DEFAULT TRUE,
    sync_frequency_hours INT DEFAULT 1,
    last_sync_at TIMESTAMP,
    
    -- AI Configuration
    ai_mode VARCHAR(20) DEFAULT 'ACTIVE' CHECK (ai_mode IN ('SHADOW', 'ACTIVE', 'DISABLED')),
    llm_enabled BOOLEAN DEFAULT TRUE,
    
    -- Operational Limits
    max_daily_uploads INT DEFAULT 10,
    max_sku_count INT DEFAULT 10000,
    
    -- Notifications
    notification_email VARCHAR(255),
    alert_on_stockout BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Show creation success
SELECT 'Auth tables created successfully! ✓' AS status;
