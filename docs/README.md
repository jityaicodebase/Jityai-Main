# 🚀 AI Store Manager - Complete System

> **AI-powered inventory onboarding and management system with intelligent SKU normalization, categorization, and quality scoring**

[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📋 What is AI Store Manager?

AI Store Manager is a **production-ready system** that helps retail stores onboard their inventory data using AI. It automatically:

- ✅ **Normalizes** product names and quantities
- ✅ **Extracts** brand information
- ✅ **Categorizes** products using AI (Gemini)
- ✅ **Maps** to master catalog
- ✅ **Scores** data quality
- ✅ **Persists** to PostgreSQL database
- ✅ **Provides** REST API for integration

---

## 🎯 Key Features

### 🤖 AI-Powered Processing
- **Gemini AI Integration** - Intelligent product categorization
- **Fuzzy Matching** - Handles typos and variations
- **Brand Extraction** - Automatic brand detection
- **Multi-language Support** - Translates regional languages

### 💾 Robust Database Design
- **3-Table Model** - SKU Identity, Inventory State, Run Diagnostics
- **Incremental Onboarding** - Detects new vs existing SKUs
- **Audit Trail** - Complete mapping history
- **Quality Tracking** - Confidence scores and validation queue

### 📊 Quality Assurance
- **Quality Scoring** - 0-100 score with A-F grading
- **Validation Queue** - Low-confidence items flagged for review
- **Error Handling** - Comprehensive error tracking
- **Recommendations** - Actionable quality improvements

### 🔌 Complete API
- **File Upload** - Excel/CSV processing
- **JSON Processing** - Direct API integration
- **Batch Management** - Track onboarding runs
- **Data Retrieval** - Query SKUs, batches, brands

---

## ⚡ Quick Start (2 Minutes)

### Prerequisites
- Node.js 16+
- PostgreSQL 16+

### Installation

```powershell
# 1. Navigate to project
cd "d:\AI Store Manger"

# 2. Run quick start script
.\start.ps1
```

That's it! The script will:
- ✅ Check prerequisites
- ✅ Create database
- ✅ Load schema
- ✅ Install dependencies
- ✅ Test connection
- ✅ Start server

### Manual Setup

```powershell
# 1. Install dependencies
npm install

# 2. Configure environment
# Edit .env and set DB_PASSWORD

# 3. Create database
psql -U postgres -c "CREATE DATABASE ai_store_manager;"

# 4. Load schema
psql -U postgres -d ai_store_manager -f database\schema.sql

# 5. Test connection
npm run test:db

# 6. Start server
npm start
```

---

## 🌐 Access Points

Once running:

| Service | URL | Description |
|---------|-----|-------------|
| **Dashboard** | http://localhost:3000 | Web UI for monitoring |
| **API Health** | http://localhost:3000/api/health | System health check |
| **Statistics** | http://localhost:3000/api/stats | Database statistics |
| **API Docs** | See COMPLETE_SYSTEM_GUIDE.md | Full API documentation |

---

## 📤 Usage Examples

### Upload Inventory File

```powershell
curl -X POST http://localhost:3000/api/onboarding/upload `
  -F "file=@test-data/sample-inventory.xlsx" `
  -F "storeId=STORE_001" `
  -F "storeName=Test Store" `
  -F "location=Mumbai" `
  -F "storeType=retail"
```

### Process Items via JSON

```powershell
curl -X POST http://localhost:3000/api/onboarding/process `
  -H "Content-Type: application/json" `
  -d '{
    "storeId": "STORE_001",
    "storeName": "Test Store",
    "items": [
      {"product_name": "Amul Butter 100g", "quantity": "50", "price": "55.00"},
      {"product_name": "Maggi Noodles", "quantity": "100", "price": "14.00"}
    ]
  }'
```

### Get Store SKUs

```powershell
curl http://localhost:3000/api/stores/STORE_001/skus
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Dashboard  │  │  File Upload │  │   REST API   │     │
│  │   (Browser)  │  │   (Excel)    │  │   Clients    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Express.js API Server                   │  │
│  │  (server.js - Main Integration Point)                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   ONBOARDING AGENT                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Normalizer  │  │    Brand     │  │   Catalog    │     │
│  │              │  │  Extractor   │  │   Mapper     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │     LLM      │  │   Quality    │  │   Database   │     │
│  │ Categorizer  │  │   Scorer     │  │ Persistence  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              PostgreSQL Database                     │  │
│  │  • 12 Tables  • 40+ Indexes  • 3 Views               │  │
│  │  • 3 Functions  • 3 Triggers  • Audit Trail          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
d:\AI Store Manger\
├── server.js                       # 🚀 Main server (NEW - integrates everything)
├── package.json                    # Dependencies and scripts
├── .env                            # Environment configuration
├── start.ps1                       # Quick start script
│
├── 📚 Documentation
│   ├── README.md                   # This file
│   ├── COMPLETE_SYSTEM_GUIDE.md    # Comprehensive guide
│   ├── DATABASE_SETUP_GUIDE.md     # Database setup
│   └── PRODUCTION_READINESS_CHECKLIST.md
│
├── 🤖 Onboarding Agent (modules/)
│   ├── onboarding-orchestrator.js  # Main orchestrator
│   ├── normalizer.js               # Product normalization
│   ├── catalog-mapper.js           # Catalog mapping
│   ├── llm-categorizer.js          # AI categorization
│   ├── brand-extractor.js          # Brand detection
│   ├── database-persistence.js     # Database operations
│   ├── quality-scorer.js           # Quality assessment
│   └── ...
│
├── 💾 Database (database/)
│   ├── schema.sql                  # Complete schema (12 tables)
│   └── test_schema.sql             # Test script
│
├── ⚙️ Configuration (config/)
│   ├── onboarding-config.json      # Normalization rules
│   └── cateloge.json               # Master catalog
│
├── 🧪 Testing
│   ├── test-db-connection.js       # Database test
│   ├── test-production-onboarding.js
│   └── test-data/                  # Sample data
│
└── 🎨 UI
    ├── index.html                  # Dashboard
    └── ui/                         # Additional UI components
```

---

## 🗄️ Database Schema

### Core Tables

| Table | Purpose | Records |
|-------|---------|---------|
| `store_sku_registry` | SKU identity (long-lived) | Permanent |
| `onboarding_handoff` | Inventory state (volatile) | Time-series |
| `onboarding_batch_status` | Run diagnostics | Audit |

### Supporting Tables

- `brand_registry` - Discovered brands
- `catalog_version_log` - Catalog versioning
- `mapping_audit_trail` - Complete audit trail
- `validation_queue` - Items needing review
- `quality_recommendations` - Quality suggestions
- `raw_upload_archive` - File metadata
- `parsing_decisions` - Column mappings
- `incremental_delta_queue` - New items
- `mapping_change_requests` - Approval workflow

---

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_store_manager
DB_USER=postgres
DB_PASSWORD=your_password

# Server
PORT=3000
NODE_ENV=development
```

### Master Catalog (config/cateloge.json)

Define your product categories and subcategories.

### Normalization Rules (config/onboarding-config.json)

Configure unit conversions, brand patterns, and validation rules.

---

## 📊 Quality Scoring

Every onboarding run receives:
- **Score**: 0-100
- **Grade**: A, B, C, D, or F

### Scoring Breakdown

- **40%** - Mapping Confidence
- **20%** - Brand Detection Rate
- **20%** - Normalization Quality
- **20%** - Data Completeness

### Quality Grades

| Grade | Score | Meaning |
|-------|-------|---------|
| **A** | 90-100 | Excellent - Production ready |
| **B** | 80-89 | Good - Minor review needed |
| **C** | 70-79 | Acceptable - Some review needed |
| **D** | 60-69 | Poor - Significant review needed |
| **F** | <60 | Failed - Manual intervention required |

---

## 🧪 Testing

```powershell
# Test database connection
npm run test:db

# Test onboarding with sample data
npm run test

# Run all tests
npm test
```

---

## 🚀 Deployment

### Development

```powershell
npm run dev  # Auto-restart on changes
```

### Production

```powershell
npm start
```

### Using PM2 (Recommended)

```powershell
npm install -g pm2
pm2 start server.js --name ai-store-manager
pm2 save
pm2 startup
```

---

## 📡 API Reference

See **[COMPLETE_SYSTEM_GUIDE.md](COMPLETE_SYSTEM_GUIDE.md)** for full API documentation.

### Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/stats` | GET | Statistics |
| `/api/onboarding/upload` | POST | Upload file |
| `/api/onboarding/process` | POST | Process JSON |
| `/api/batches` | GET | List batches |
| `/api/stores/:id/skus` | GET | Get SKUs |
| `/api/validation-queue` | GET | Review queue |
| `/api/brands` | GET | List brands |

---

## 🛡️ Security

- ✅ Environment variable configuration
- ✅ SQL injection protection (parameterized queries)
- ✅ File upload validation
- ✅ CORS configuration
- ✅ Error handling without exposing internals
- ⚠️ **TODO**: Add authentication (JWT/API keys)
- ⚠️ **TODO**: Add HTTPS in production

---

## 🐛 Troubleshooting

### Server won't start
```powershell
# Reinstall dependencies
rm -r node_modules
npm install
```

### Database connection fails
```powershell
# Check PostgreSQL is running
Get-Service postgresql*

# Test connection
psql -U postgres

# Verify .env password
```

### Low quality scores
- Check Gemini API key
- Review catalog definitions
- Verify normalization rules

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **README.md** | This file - Overview and quick start |
| **COMPLETE_SYSTEM_GUIDE.md** | Comprehensive system guide |
| **DATABASE_SETUP_GUIDE.md** | Database setup instructions |
| **PRODUCTION_READINESS_CHECKLIST.md** | Production deployment |
| **ARCHITECTURE_DIAGRAM.txt** | System architecture |

---

## 🤝 Contributing

This is a production system. For modifications:

1. Test thoroughly with `npm test`
2. Update documentation
3. Follow existing code patterns
4. Maintain database schema compatibility

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🎉 System Status

✅ **COMPLETE AND PRODUCTION-READY**

- ✅ Onboarding Agent - Fully implemented
- ✅ Backend API - Integrated
- ✅ Database Schema - Tested and verified
- ✅ Quality Scoring - Operational
- ✅ Incremental Onboarding - Working
- ✅ File Upload - Functional
- ✅ REST API - Complete
- ✅ Documentation - Comprehensive

---

## 🚀 Get Started Now!

```powershell
.\start.ps1
```

Then open: **http://localhost:3000**

---

**Built with ❤️ using Node.js, PostgreSQL, and Gemini AI**
