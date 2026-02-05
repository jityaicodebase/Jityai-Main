-- ============================================================================
-- MIGRATION SCRIPT: Add Auth Tables to Existing JityAI Database
-- ============================================================================
-- Purpose: Migrate existing stores to cloud-ready multi-tenant architecture
-- Date: 2026-02-04
-- ============================================================================

-- Step 1: Create new auth tables
-- (Run the SECTION 0 from schema.sql if not already created)

-- Step 2: Create default admin user
INSERT INTO users (email, password_hash, store_id, role, full_name, is_active, email_verified)
VALUES (
    'admin@jityai.com',
    '$2b$10$PLACEHOLDER_ADMIN_HASH', -- Change this after running!
    'ADMIN_STORE',
    'admin',
    'System Administrator',
    TRUE,
    TRUE
);

-- Step 3: Create user accounts for existing stores
-- This query auto-generates users for stores that have data
INSERT INTO users (email, store_id, password_hash, role, full_name, is_active)
SELECT 
    LOWER(store_id) || '@store.local' AS email,
    store_id,
    '$2b$10$DEFAULT_HASH_CHANGE_ME' AS password_hash, -- Default: "password123"
    'owner' AS role,
    'Store Owner ' || store_id AS full_name,
    TRUE AS is_active
FROM (
    SELECT DISTINCT store_id 
    FROM store_sku_registry
    WHERE store_id IS NOT NULL
    UNION
    SELECT DISTINCT store_id
    FROM onboarding_handoff
    WHERE store_id IS NOT NULL
) AS existing_stores
ON CONFLICT (email) DO NOTHING;

-- Step 4: Create store settings for existing stores
INSERT INTO store_settings (store_id, store_name, sync_enabled, ai_mode)
SELECT 
    store_id,
    'Store ' || store_id AS store_name,
    TRUE AS sync_enabled,
    'ACTIVE' AS ai_mode
FROM (
    SELECT DISTINCT store_id 
    FROM store_sku_registry
    WHERE store_id IS NOT NULL
) AS existing_stores
ON CONFLICT (store_id) DO NOTHING;

-- Step 5: Generate API keys for existing stores (for connector script)
-- Note: These are placeholder keys. Run the generate-api-key.js script to create real ones.
INSERT INTO api_keys (store_id, key_hash, key_prefix, key_type, is_active, permissions)
SELECT 
    store_id,
    'PLACEHOLDER_' || store_id AS key_hash,
    'jity_' || LEFT(MD5(store_id)::text, 8) AS key_prefix,
    'connector' AS key_type,
    TRUE AS is_active,
    ARRAY['upload:csv', 'read:inventory']::TEXT[] AS permissions
FROM (
    SELECT DISTINCT store_id 
    FROM store_sku_registry
    WHERE store_id IS NOT NULL
) AS existing_stores;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Verify users created
SELECT 
    'Users Created:' AS check_type,
    COUNT(*) AS count
FROM users
WHERE role != 'admin';

-- Verify store settings
SELECT 
    'Store Settings Created:' AS check_type,
    COUNT(*) AS count
FROM store_settings;

-- Verify API keys
SELECT 
    'API Keys Created:' AS check_type,
    COUNT(*) AS count
FROM api_keys;

-- ============================================================================
-- MANUAL STEPS REQUIRED AFTER MIGRATION
-- ============================================================================

/*
1. Update admin password:
   - Use the /api/auth/admin/reset-password endpoint
   - Or run: UPDATE users SET password_hash = <bcrypt_hash> WHERE email = 'admin@jityai.com';

2. Generate real API keys:
   - Run: node scripts/generate-api-keys.js

3. Send credentials to store owners:
   - Email: <store_id>@store.local
   - Password: password123 (they should change on first login)

4. Test login for each store

5. Update connector scripts with new API keys
*/
