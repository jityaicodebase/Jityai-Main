-- DATABASE SCHEMA FOR STORING ONBOARDING DATA
-- This is where the data SHOULD be stored in production

-- 1. Main inventory table with mapped catalog data
CREATE TABLE store_inventory (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Store Information
    store_id VARCHAR(50) NOT NULL,
    store_name VARCHAR(200),
    store_location VARCHAR(100),
    store_type VARCHAR(50),
    
    -- Store's Original Item Code (PRESERVED)
    canonical_store_code VARCHAR(100) NOT NULL,
    
    -- Original Data (as received from store)
    product_name_original VARCHAR(500),
    raw_data JSONB,  -- Complete original row
    
    -- Normalized Data
    product_name_normalized VARCHAR(500),
    brand VARCHAR(100),
    quantity DECIMAL(12,3),
    unit VARCHAR(20),
    selling_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    barcode VARCHAR(50),
    
    -- MAPPED TO MASTER CATALOG ✅
    category_id VARCHAR(50) NOT NULL,  -- Links to cateloge.json
    category_name VARCHAR(200),
    mapping_confidence DECIMAL(3,2),
    mapping_method VARCHAR(50),
    analytics_mode VARCHAR(20) DEFAULT 'full',
    
    -- Quality Metadata
    flags JSONB,  -- Array of flags like ["ASSUMED_UNIT", "MISSING_COST_PRICE"]
    embedded_quantity DECIMAL(12,3),
    embedded_unit VARCHAR(20),
    mrp_hint DECIMAL(10,2),
    unit_assumed BOOLEAN DEFAULT false,
    
    -- Audit Trail
    onboarding_batch_id UUID NOT NULL,
    onboarding_date TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(store_id, canonical_store_code),
    
    -- Indexes for fast queries
    INDEX idx_store_id (store_id),
    INDEX idx_category_id (category_id),
    INDEX idx_brand (brand),
    INDEX idx_onboarding_batch (onboarding_batch_id)
);

-- 2. Onboarding batches (one per onboarding session)
CREATE TABLE onboarding_batches (
    batch_id UUID PRIMARY KEY,
    store_id VARCHAR(50) NOT NULL,
    store_name VARCHAR(200),
    store_location VARCHAR(100),
    store_type VARCHAR(50),
    
    -- Processing Info
    onboarding_date TIMESTAMP NOT NULL,
    processing_time_ms INT,
    
    -- Quality Metrics
    quality_score INT,  -- 0-100
    quality_grade VARCHAR(20),  -- EXCELLENT, GOOD, FAIR, POOR
    
    -- Statistics
    total_items INT,
    items_mapped INT,
    items_category_only INT,
    items_failed INT,
    
    -- Error Report
    error_report JSONB,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_store_id (store_id),
    INDEX idx_onboarding_date (onboarding_date)
);

-- 3. Brand registry (discovered brands)
CREATE TABLE brand_registry (
    brand_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_name VARCHAR(100) UNIQUE NOT NULL,
    first_discovered_date TIMESTAMP DEFAULT NOW(),
    total_stores_using INT DEFAULT 1,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Quality recommendations
CREATE TABLE quality_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES onboarding_batches(batch_id),
    priority VARCHAR(20),  -- HIGH, MEDIUM, LOW
    issue VARCHAR(500),
    impact VARCHAR(500),
    action VARCHAR(500),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_batch_id (batch_id)
);

-- EXAMPLE QUERIES

-- 1. Get all inventory for a store
SELECT 
    canonical_store_code,
    product_name_normalized,
    brand,
    category_name,
    quantity,
    unit,
    selling_price,
    cost_price,
    mapping_confidence
FROM store_inventory
WHERE store_id = 'STORE_TEST_001'
ORDER BY category_id, product_name_normalized;

-- 2. Get items by category
SELECT 
    product_name_normalized,
    brand,
    quantity,
    unit,
    selling_price
FROM store_inventory
WHERE store_id = 'STORE_TEST_001'
  AND category_id = 'L1_STAPLES';

-- 3. Get low-confidence mappings
SELECT 
    product_name_original,
    product_name_normalized,
    category_name,
    mapping_confidence,
    mapping_method
FROM store_inventory
WHERE store_id = 'STORE_TEST_001'
  AND mapping_confidence < 0.65
ORDER BY mapping_confidence ASC;

-- 4. Get onboarding history
SELECT 
    batch_id,
    onboarding_date,
    total_items,
    quality_score,
    quality_grade
FROM onboarding_batches
WHERE store_id = 'STORE_TEST_001'
ORDER BY onboarding_date DESC;

-- 5. Get all brands used by a store
SELECT DISTINCT brand
FROM store_inventory
WHERE store_id = 'STORE_TEST_001'
  AND brand IS NOT NULL
ORDER BY brand;
