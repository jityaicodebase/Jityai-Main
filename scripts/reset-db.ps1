# AI Store Manager - Database Reset Script
# This script completely wipes the database and recreates it from scratch.

$dbName = "ai_store_manager"
$dbUser = "postgres"

Write-Host "Resetting $dbName database..."

# Set password from .env if possible
$envFile = Join-Path $PWD ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile
    foreach ($line in $envContent) {
        if ($line -match "^DB_PASSWORD=(.*)$") {
            $env:PGPASSWORD = $Matches[1].Trim()
            break
        }
    }
}

# 1. Wipe everything
Write-Host "Wiping existing schema..."
$wipeQuery = "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public; COMMENT ON SCHEMA public IS 'standard public schema';"
echo $wipeQuery | psql -U $dbUser -d $dbName

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to wipe database."
    exit 1
}

# 2. Run Base Schema
Write-Host "Applying Base Schema..."
psql -U $dbUser -d $dbName -f "database\schema.sql"

# 3. Apply Inventory AI Migrations
Write-Host "Applying AI Migrations..."
psql -U $dbUser -d $dbName -f "database\inventory_ai_migrations.sql"

# 4. Apply Implementation Fixes
Write-Host "Applying Implementation Fixes..."
psql -U $dbUser -d $dbName -f "database\migrations_implementation_fixes.sql"

# 5. Apply Category Name Fixes
if (Test-Path "database\fix_category_names.sql") {
    Write-Host "Applying Category Name Fixes..."
    psql -U $dbUser -d $dbName -f "database\fix_category_names.sql"
}

Write-Host "Database reset successfully!"

# Clear password
$env:PGPASSWORD = $null
