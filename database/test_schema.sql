-- ============================================================================
-- DATABASE SCHEMA TEST SCRIPT
-- ============================================================================

-- Test 1: Verify all tables exist
\echo '=== Test 1: Checking if all tables exist ==='
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Test 2: Verify all indexes exist
\echo ''
\echo '=== Test 2: Checking indexes ==='
SELECT 
    tablename, 
    indexname 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Test 3: Verify all views exist
\echo ''
\echo '=== Test 3: Checking views ==='
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Test 4: Verify all functions exist
\echo ''
\echo '=== Test 4: Checking functions ==='
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- Test 5: Verify triggers exist
\echo ''
\echo '=== Test 5: Checking triggers ==='
SELECT 
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Test 6: Insert test data into brand_registry
\echo ''
\echo '=== Test 6: Testing INSERT into brand_registry ==='
INSERT INTO brand_registry (brand_name, is_verified) 
VALUES ('Test Brand', FALSE)
RETURNING brand_id, brand_name, first_discovered_date;

-- Test 7: Insert test onboarding batch
\echo ''
\echo '=== Test 7: Testing INSERT into onboarding_batch_status ==='
INSERT INTO onboarding_batch_status (
    store_id,
    store_name,
    store_location,
    batch_type,
    status,
    total_items
) VALUES (
    'TEST_STORE_001',
    'Test Store',
    'Test Location',
    'full_onboarding',
    'pending',
    10
)
RETURNING batch_id, store_id, store_name, status, created_at;

-- Test 8: Insert test SKU
\echo ''
\echo '=== Test 8: Testing INSERT into store_sku_registry ==='
WITH batch AS (
    SELECT batch_id FROM onboarding_batch_status WHERE store_id = 'TEST_STORE_001' LIMIT 1
)
INSERT INTO store_sku_registry (
    store_id,
    store_item_id,
    normalized_product_name,
    brand,
    master_category_id,
    master_category_name,
    normalized_unit,
    mapping_confidence,
    mapping_method,
    catalog_version,
    onboarding_batch_id
) 
SELECT 
    'TEST_STORE_001',
    'ITEM_001',
    'Test Product',
    'Test Brand',
    'CAT_001',
    'Test Category',
    'pcs',
    0.95,
    'exact_match',
    'v1.0',
    batch_id
FROM batch
RETURNING store_id, store_item_id, normalized_product_name, mapping_confidence;

-- Test 9: Test the view
\echo ''
\echo '=== Test 9: Testing v_active_skus view ==='
SELECT 
    store_id,
    store_item_id,
    normalized_product_name,
    brand,
    mapping_confidence,
    status
FROM v_active_skus
WHERE store_id = 'TEST_STORE_001';

-- Test 10: Test catalog version
\echo ''
\echo '=== Test 10: Checking catalog version ==='
SELECT 
    version,
    version_type,
    released_at,
    total_categories
FROM catalog_version_log;

-- Test 11: Test trigger (update timestamp)
\echo ''
\echo '=== Test 11: Testing auto-update trigger ==='
UPDATE brand_registry 
SET is_verified = TRUE 
WHERE brand_name = 'Test Brand';

SELECT 
    brand_name,
    is_verified,
    created_at,
    updated_at,
    (updated_at > created_at) as timestamp_updated
FROM brand_registry 
WHERE brand_name = 'Test Brand';

-- Test 12: Test foreign key constraints
\echo ''
\echo '=== Test 12: Testing foreign key relationships ==='
WITH batch AS (
    SELECT batch_id FROM onboarding_batch_status WHERE store_id = 'TEST_STORE_001' LIMIT 1
)
INSERT INTO onboarding_handoff (
    store_id,
    store_item_id,
    quantity_on_hand,
    unit,
    selling_price,
    cost_price,
    source,
    onboarding_batch_id
)
SELECT
    'TEST_STORE_001',
    'ITEM_001',
    100.0,
    'pcs',
    50.00,
    30.00,
    'full_onboarding',
    batch_id
FROM batch
RETURNING store_id, store_item_id, quantity_on_hand, selling_price;

-- Test 13: Verify data integrity
\echo ''
\echo '=== Test 13: Data integrity check ==='
SELECT 
    'SKU Registry' as table_name,
    COUNT(*) as record_count
FROM store_sku_registry
WHERE store_id = 'TEST_STORE_001'
UNION ALL
SELECT 
    'Onboarding Handoff',
    COUNT(*)
FROM onboarding_handoff
WHERE store_id = 'TEST_STORE_001'
UNION ALL
SELECT 
    'Batch Status',
    COUNT(*)
FROM onboarding_batch_status
WHERE store_id = 'TEST_STORE_001';

-- Cleanup test data
\echo ''
\echo '=== Cleaning up test data ==='
DELETE FROM onboarding_handoff WHERE store_id = 'TEST_STORE_001';
DELETE FROM store_sku_registry WHERE store_id = 'TEST_STORE_001';
DELETE FROM onboarding_batch_status WHERE store_id = 'TEST_STORE_001';
DELETE FROM brand_registry WHERE brand_name = 'Test Brand';

\echo ''
\echo '=== All tests completed successfully! ==='
