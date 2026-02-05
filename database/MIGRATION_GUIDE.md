# Database Migration Execution Guide

## Prerequisites
- PostgreSQL server must be running
- Database `ai_store_manager` must exist
- User must have appropriate permissions

## Execute Migrations

### Option 1: Using psql command line
```bash
psql -U postgres -d ai_store_manager -f database/migrations_implementation_fixes.sql
```

### Option 2: Using pgAdmin
1. Open pgAdmin
2. Connect to your PostgreSQL server
3. Select database `ai_store_manager`
4. Open Query Tool
5. Load file: `database/migrations_implementation_fixes.sql`
6. Execute (F5)

### Option 3: Using Node.js script
```bash
node database/run-migrations.js
```

## Verification

After running migrations, verify with:
```sql
-- Check new columns exist
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'onboarding_handoff'
AND column_name IN ('transaction_type', 'transaction_id');

-- Check new tables exist
SELECT table_name 
FROM information_schema.tables
WHERE table_name IN ('store_sync_config', 'unknown_sku_escalation_queue', 'sync_run_log');
```

## Rollback (if needed)

If you need to rollback these changes:
```sql
-- Remove new columns
ALTER TABLE onboarding_handoff DROP COLUMN IF EXISTS transaction_type;
ALTER TABLE onboarding_handoff DROP COLUMN IF EXISTS transaction_id;
ALTER TABLE raw_upload_archive DROP COLUMN IF EXISTS file_content_hash;

-- Drop new tables
DROP TABLE IF EXISTS store_sync_config;
DROP TABLE IF EXISTS unknown_sku_escalation_queue;
DROP TABLE IF EXISTS sync_run_log;
```

## Status
⚠️ **Migrations not yet executed** - PostgreSQL server not running
- Run migrations manually when database is available
- All code changes are already applied
