-- ============================================================================
-- INVENTORY AI AGENT - DATABASE MIGRATIONS
-- Execute after existing schema
-- ============================================================================

-- Sales transactions (extracted from inventory snapshots)
CREATE TABLE IF NOT EXISTS sales_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    store_item_id VARCHAR(100) NOT NULL,
    
    -- Transaction details
    transaction_date DATE NOT NULL,
    transaction_timestamp TIMESTAMP NOT NULL,
    quantity_sold DECIMAL(12,3) NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    revenue DECIMAL(12,2) NOT NULL,
    
    -- Source tracking
    source_sync_run_id UUID,
    source_transaction_id VARCHAR(100),
    
    -- Deduplication
    UNIQUE (store_id, store_item_id, source_transaction_id),
    
    -- Foreign key
    FOREIGN KEY (store_id, store_item_id) 
        REFERENCES store_sku_registry(store_id, store_item_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sales_store_item ON sales_transactions(store_id, store_item_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sales_transactions(transaction_timestamp DESC);

-- Purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    po_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    
    -- PO details
    po_number VARCHAR(100),
    supplier_name VARCHAR(200),
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    received_date DATE,
    
    -- Status
    status VARCHAR(20) CHECK (status IN ('pending', 'received', 'cancelled')) DEFAULT 'pending',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Deduplication
    UNIQUE (store_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_po_store ON purchase_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date DESC);

-- Purchase order items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    po_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    store_id VARCHAR(50) NOT NULL,
    store_item_id VARCHAR(100) NOT NULL,
    
    -- Order details
    quantity_ordered DECIMAL(12,3) NOT NULL,
    quantity_received DECIMAL(12,3),
    unit_cost DECIMAL(10,2) NOT NULL,
    
    -- Foreign key
    FOREIGN KEY (store_id, store_item_id) 
        REFERENCES store_sku_registry(store_id, store_item_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_sku ON purchase_order_items(store_id, store_item_id);

-- Inventory recommendations (AI output)
CREATE TABLE IF NOT EXISTS inventory_recommendations (
    recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    store_item_id VARCHAR(100) NOT NULL,
    
    -- Recommendation
    recommendation_type VARCHAR(30) CHECK (recommendation_type IN (
        'BUY_MORE', 'BUY_LESS', 'MONITOR'
    )) NOT NULL,
    
    -- Quantities
    current_stock DECIMAL(12,3) NOT NULL,
    recommended_order_quantity DECIMAL(12,3),
    reorder_point DECIMAL(12,3),
    safety_stock DECIMAL(12,3),
    
    -- Metrics
    ads_7 DECIMAL(12,3),
    ads_14 DECIMAL(12,3),
    ads_30 DECIMAL(12,3),
    weighted_ads DECIMAL(12,3),
    demand_variability DECIMAL(12,3),
    protection_window INT,
    days_of_cover DECIMAL(8,2),
    
    -- Risk
    risk_state VARCHAR(20) CHECK (risk_state IN ('SAFE', 'WATCH', 'RISK', 'CRITICAL')),
    stockout_probability DECIMAL(3,2),
    potential_lost_revenue DECIMAL(12,2),
    
    -- Confidence
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    confidence_label VARCHAR(20) CHECK (confidence_label IN ('HIGH', 'MEDIUM', 'LOW')),
    
    -- Reasoning
    reasoning_factors JSONB,
    edge_case_flags JSONB,
    
    -- Metadata
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP,
    ai_agent_version VARCHAR(20),
    mode VARCHAR(20) CHECK (mode IN ('SHADOW', 'ACTIVE')) DEFAULT 'SHADOW',
    
    -- Foreign key
    FOREIGN KEY (store_id, store_item_id) 
        REFERENCES store_sku_registry(store_id, store_item_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rec_store_item ON inventory_recommendations(store_id, store_item_id);
CREATE INDEX IF NOT EXISTS idx_rec_type ON inventory_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_rec_risk ON inventory_recommendations(risk_state);
CREATE INDEX IF NOT EXISTS idx_rec_generated ON inventory_recommendations(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_mode ON inventory_recommendations(mode);

-- Inventory alerts (AI output)
CREATE TABLE IF NOT EXISTS inventory_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    store_item_id VARCHAR(100),
    
    -- Alert details
    alert_type VARCHAR(30) CHECK (alert_type IN (
        'STOCKOUT_IMMINENT', 'STOCKOUT_OCCURRED', 'OVERSTOCK', 
        'SLOW_MOVING', 'DEMAND_SPIKE', 'PRICE_ANOMALY', 'EXPIRY_APPROACHING'
    )) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')) NOT NULL,
    
    -- Message
    alert_title VARCHAR(200) NOT NULL,
    alert_message TEXT NOT NULL,
    action_required TEXT,
    
    -- Impact
    estimated_revenue_impact DECIMAL(12,2),
    days_until_stockout DECIMAL(8,2),
    
    -- Status
    status VARCHAR(20) CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')) DEFAULT 'ACTIVE',
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(100),
    resolved_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- Foreign key (nullable for store-level alerts)
    FOREIGN KEY (store_id, store_item_id) 
        REFERENCES store_sku_registry(store_id, store_item_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alert_store ON inventory_alerts(store_id);
CREATE INDEX IF NOT EXISTS idx_alert_sku ON inventory_alerts(store_id, store_item_id);
CREATE INDEX IF NOT EXISTS idx_alert_type ON inventory_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alert_severity ON inventory_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alert_status ON inventory_alerts(status);
CREATE INDEX IF NOT EXISTS idx_alert_created ON inventory_alerts(created_at DESC);

-- Agent run log
CREATE TABLE IF NOT EXISTS inventory_ai_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    
    -- Run details
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('running', 'completed', 'failed')) DEFAULT 'running',
    
    -- Scope
    total_skus INT,
    analyzed_skus INT DEFAULT 0,
    failed_skus INT DEFAULT 0,
    
    -- Mode
    mode VARCHAR(20) CHECK (mode IN ('SHADOW', 'ACTIVE')),
    agent_version VARCHAR(20),
    
    -- Results
    recommendations_generated INT DEFAULT 0,
    alerts_generated INT DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    
    -- Trigger
    triggered_by VARCHAR(50) DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_store ON inventory_ai_runs(store_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_started ON inventory_ai_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON inventory_ai_runs(status);
