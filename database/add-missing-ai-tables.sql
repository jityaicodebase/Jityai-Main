-- AI Agent Tables - Final Fix for Missing Tables
CREATE TABLE IF NOT EXISTS inventory_recommendations (
    recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    store_item_id VARCHAR(100) NOT NULL,
    
    recommendation_type VARCHAR(50) NOT NULL, -- REORDER, MARKDOWN, MONITOR
    
    -- Snapshot Metrics
    current_stock DECIMAL(12,3),
    recommended_order_quantity INT,
    reorder_point INT,
    safety_stock INT,
    
    ads_7 DECIMAL(10,2),
    ads_14 DECIMAL(10,2),
    ads_30 DECIMAL(10,2),
    weighted_ads DECIMAL(10,2),
    demand_variability DECIMAL(10,2),
    
    days_of_cover DECIMAL(10,2),
    protection_window INT,
    risk_state VARCHAR(20), -- CRITICAL, RISK, WATCH, SAFE
    
    -- AI Reasoning
    recommended_action VARCHAR(50),
    reasoning_text TEXT,
    action_priority VARCHAR(20), -- HIGH, MEDIUM, LOW
    reasoning_factors JSONB, -- Breakdown of why
    edge_case_flags JSONB, -- Expiry risk, Festivals
    
    -- Meta
    ai_agent_version VARCHAR(20),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recommendation_confidence DECIMAL(3,2),
    
    -- User Feedback Loop
    feedback_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED, MODIFIED
    feedback_notes TEXT,
    user_modified_qty INT,
    feedback_timestamp TIMESTAMP,

    -- Foreign Key
    FOREIGN KEY (store_id, store_item_id) REFERENCES store_sku_registry(store_id, store_item_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_store ON inventory_recommendations(store_id);
CREATE INDEX IF NOT EXISTS idx_rec_risk ON inventory_recommendations(risk_state);
CREATE INDEX IF NOT EXISTS idx_rec_feedback ON inventory_recommendations(feedback_status);

-- Sales transactions table (if missing)
CREATE TABLE IF NOT EXISTS sales_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    store_item_id VARCHAR(100) NOT NULL,
    transaction_date DATE NOT NULL,
    quantity_sold DECIMAL(10,2) NOT NULL,
    sale_price DECIMAL(10,2),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_lookup ON sales_transactions(store_id, store_item_id, transaction_date);

-- Purchase Orders Table (if missing)
CREATE TABLE IF NOT EXISTS purchase_orders (
    po_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    po_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID REFERENCES purchase_orders(po_id),
    store_id VARCHAR(50) NOT NULL,
    store_item_id VARCHAR(100) NOT NULL,
    quantity_ordered INT,
    received_date DATE,
    order_date DATE
);
