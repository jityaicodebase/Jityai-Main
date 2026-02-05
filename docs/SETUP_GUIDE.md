# AI STORE MANAGER - PRODUCTION SETUP GUIDE
## Complete Installation and Configuration

---

## OVERVIEW

This guide will help you set up the AI Store Manager with database persistence and production-ready onboarding.

---

## PREREQUISITES

1. **Node.js** (v14 or higher)
2. **PostgreSQL** (v12 or higher)
3. **Git** (for version control)

---

## STEP 1: DATABASE SETUP

### 1.1 Create Database

```sql
CREATE DATABASE ai_store_manager;
```

### 1.2 Run Schema

```bash
psql -U postgres -d ai_store_manager -f database/schema.sql
```

### 1.3 Verify Tables

```sql
\dt
```

You should see:
- `store_sku_registry`
- `onboarding_handoff`
- `onboarding_batch_status`
- `brand_registry`
- `catalog_version_log`
- And more...

---

## STEP 2: ENVIRONMENT CONFIGURATION

### 2.1 Create `.env` File

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_store_manager
DB_USER=postgres
DB_PASSWORD=your_password_here

# Gemini API (for LLM fallback)
GEMINI_API_KEY=your_gemini_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=production
```

### 2.2 Install Dependencies

```bash
# Install Node.js dependencies
npm install pg

# Or if using backend API
cd backend
npm install
```

---

## STEP 3: CLEANUP OBSOLETE FILES

```bash
# Run cleanup script to remove duplicate files
powershell -ExecutionPolicy Bypass -File cleanup.ps1
```

---

## STEP 4: TEST THE SYSTEM

### 4.1 Test Without Database

```bash
node test-production-onboarding.js
```

This will:
- Process 34 test items
- Show 3-table output
- Save to `onboarding-output.json`

### 4.2 Test With Database

Create a test script with database:

```javascript
const DatabasePersistence = require('./modules/database-persistence');
const OnboardingOrchestrator = require('./modules/onboarding-orchestrator');
// ... other imports

const dbPersistence = new DatabasePersistence({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

await dbPersistence.initialize();

const orchestrator = new OnboardingOrchestrator(
    configLoader,
    normalizer,
    brandExtractor,
    catalogMapper,
    llmCategorizer,
    dbPersistence  // Pass database
);

const result = await orchestrator.onboard('store-001', items);
```

---

## STEP 5: START THE BACKEND API

```bash
cd backend
npm start
```

The API will be available at `http://localhost:3000`

---

## API ENDPOINTS

### POST /api/onboard
Upload inventory for onboarding

**Request:**
```json
{
  "store_id": "store-mumbai-001",
  "items": [
    {
      "store_item_id": "SKU-001",
      "product_name": "Aashirvaad Atta 5kg",
      "quantity": 50,
      "selling_price": 320
    }
  ]
}
```

**Response:**
```json
{
  "run_id": "uuid",
  "sku_identity_records": [...],
  "inventory_state_records": [...],
  "run_summary": {...}
}
```

### GET /api/onboarding-history/:storeId
Get onboarding history for a store

### GET /api/items-needing-review/:storeId
Get items that need manual review

---

## ARCHITECTURE

### 3-Table Model

```
┌─────────────────────────────────────┐
│  SKU IDENTITY (store_sku_registry) │
│  - WHAT the product is              │
│  - Stable, long-lived               │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  INVENTORY STATE (onboarding_handoff)│
│  - HOW MUCH exists                  │
│  - Volatile, time-series            │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  RUN DIAGNOSTICS (batch_status)     │
│  - WHY decisions were made          │
│  - Ephemeral, audit only            │
└─────────────────────────────────────┘
```

---

## PROJECT STRUCTURE

```
AI Store Manager/
├── modules/
│   ├── onboarding-orchestrator.js  ← Main orchestrator
│   ├── database-persistence.js     ← Database layer
│   ├── catalog-mapper.js           ← AI categorization
│   ├── normalizer.js               ← Data normalization
│   ├── llm-categorizer.js          ← LLM fallback
│   └── ...
├── database/
│   └── schema.sql                  ← PostgreSQL schema
├── backend/
│   ├── api-server.js               ← REST API
│   └── package.json
├── config/
│   ├── cateloge.json               ← Master catalog
│   └── ...
├── test-data/
│   └── test.json                   ← Sample data
├── .env                            ← Environment config
└── README.md                       ← Main documentation
```

---

## PRODUCTION DEPLOYMENT

### 1. Database Migration

```bash
# Backup existing data
pg_dump ai_store_manager > backup.sql

# Run migrations
psql -U postgres -d ai_store_manager -f database/schema.sql
```

### 2. Environment Variables

Set in production:
```bash
DB_HOST=your-production-db.com
DB_PASSWORD=strong-password
GEMINI_API_KEY=production-key
NODE_ENV=production
```

### 3. Process Manager

Use PM2 for production:
```bash
npm install -g pm2
pm2 start backend/api-server.js --name ai-store-api
pm2 save
pm2 startup
```

---

## MONITORING

### Database Queries

```sql
-- Check recent onboarding runs
SELECT * FROM v_recent_batches LIMIT 10;

-- Check items needing review
SELECT * FROM v_items_needing_review;

-- Check SKU count by store
SELECT store_id, COUNT(*) as sku_count
FROM store_sku_registry
WHERE status = 'active'
GROUP BY store_id;
```

### Logs

```bash
# API logs
pm2 logs ai-store-api

# Database logs
tail -f /var/log/postgresql/postgresql-12-main.log
```

---

## TROUBLESHOOTING

### Database Connection Failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -U postgres -d ai_store_manager
```

### LLM API Errors

```bash
# Verify API key
echo $GEMINI_API_KEY

# Test API
node -e "console.log(process.env.GEMINI_API_KEY)"
```

### Missing Dependencies

```bash
# Reinstall
npm install
cd backend && npm install
```

---

## NEXT STEPS

1. ✅ Set up database
2. ✅ Configure environment
3. ✅ Test onboarding
4. ⏳ Deploy to production
5. ⏳ Set up monitoring
6. ⏳ Train store managers

---

## SUPPORT

For issues or questions:
1. Check logs: `pm2 logs`
2. Review database: `SELECT * FROM v_recent_batches`
3. Check documentation: `README.md`

---

**Version:** v1.5.3  
**Last Updated:** 2026-01-15  
**Status:** Production-Ready ✅
