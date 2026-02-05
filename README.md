# JityAI - Intelligent Retail Management Platform

**Version:** 2.0 (Cloud-Ready)  
**Status:** ✅ Production-Ready with Authentication

An AI-powered inventory management system that turns retail chaos into intelligent, data-driven decisions.

---

## 🎯 What is JityAI?

JityAI is a **complete, autonomous retail intelligence platform** that:
- 📊 **Automatically processes** POS exports and inventory data
- 🤖 **AI-driven recommendations** for restocking and inventory optimization
- 🔒 **Multi-tenant secure** with store-level data isolation
- ☁️ **Cloud-ready** for production deployment
- 📈 **Real-time insights** on sales velocity, stockouts, and deadstock

---

## ⚡ Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm

### 3-Step Setup

```bash
# 1. Install dependencies
npm install

# 2. Create database tables
psql -U postgres -d ai_store_manager -f database/create-auth-tables.sql
psql -U postgres -d ai_store_manager -f database/migrate-add-auth.sql

# 3. Set admin password
node scripts/reset-password.js
# Email: admin@jityai.com
# Password: [choose secure password]

# 4. Start server
node server.js
```

**Access:** `http://localhost:3000/login.html`

📖 **Detailed Guide:** See [`QUICK_START.md`](./QUICK_START.md)

---

## 🏗️ Architecture

### Core Components

```
┌─────────────────────────────────────────┐
│         Frontend (Browser)              │
│  • Login Page                           │
│  • Dashboard                            │
│  • AI Recommendations UI                │
└──────────────┬──────────────────────────┘
               │ JWT Auth
┌──────────────▼──────────────────────────┐
│       Express.js API Server             │
│  • Authentication (JWT + API Keys)      │
│  • Store-Scoping Middleware             │
│  • Audit Logging                        │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┴───────────┬──────────────┐
    │                      │              │
┌───▼────────┐  ┌─────────▼──────┐  ┌────▼────────┐
│ Onboarding │  │ Inventory AI   │  │ Sales       │
│ Agent      │  │ Agent          │  │ Extractor   │
└────────────┘  └────────────────┘  └─────────────┘
               │
┌──────────────▼──────────────────────────┐
│        PostgreSQL Database              │
│  • Identity Layer (SKU Registry)        │
│  • State Layer (Inventory Handoff)      │
│  • Intelligence (AI Recommendations)    │
│  • Auth (Users, API Keys, Audit)        │
└─────────────────────────────────────────┘
```

### Key Features

#### 🔐 **Authentication & Security**
- JWT-based user authentication (24-hour sessions)
- API key authentication for store connectors
- Store-level data isolation (one user = one store)
- Account lockout (5 failed login attempts)
- Comprehensive audit logging

#### 🤖 **AI Intelligence**
- Deterministic metrics (ADS, ROP, Safety Stock)
- LLM-powered strategic reasoning (Gemini AI)
- Risk state classification (SAFE → WATCH → RISK → CRITICAL)
- Prioritized recommendations based on business impact

#### 📦 **Data Processing**
- CSV/Excel file parsing
- Automatic SKU normalization
- Fuzzy matching & brand extraction
- Catalog mapping with confidence scoring

#### ☁️ **Cloud-Ready**
- Single-VM deployment (PM2 + Nginx)
- Store-side connector for hourly sync
- Multi-tenant architecture
- Production-grade error handling

---

## 📂 Project Structure

```
AI Store Manger/
├── modules/                    # Core backend modules
│   ├── auth-service.js        # Authentication logic
│   ├── auth-middleware.js     # Request protection
│   ├── inventory-ai-agent.js  # AI recommendation engine
│   ├── master-orchestrator.js # Central routing
│   └── ...
├── database/                   # Database schemas & migrations
│   ├── schema.sql             # Complete DB schema
│   ├── create-auth-tables.sql # Auth table creation
│   └── migrate-add-auth.sql   # Data migration
├── public/                     # Frontend assets
│   ├── login.html             # Login page
│   ├── auth.js                # Client-side auth
│   └── index.html             # Dashboard
├── scripts/                    # Utility scripts
│   ├── store-connector.js     # Store-side sync agent
│   ├── generate-api-key.js    # API key generator
│   └── reset-password.js      # Password reset tool
├── docs/                       # Documentation
│   ├── CLOUD_DEPLOYMENT_GUIDE.md
│   ├── GO_LIVE_CHECKLIST.md
│   └── ...
├── server.js                   # Main API server
├── package.json
└── .env                        # Environment configuration
```

---

## 🔑 Environment Configuration

Create `.env` file:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_store_manager
DB_USER=postgres
DB_PASSWORD=your_password

# Authentication (CRITICAL: Change in production!)
JWT_SECRET=generate_random_256_bit_key_here

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key

# Server
PORT=3000
NODE_ENV=development
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🚀 Deployment

### Production Deployment (Cloud)

Follow the comprehensive deployment guide:

📖 **[Cloud Deployment Guide](./docs/CLOUD_DEPLOYMENT_GUIDE.md)**

Key steps:
1. Setup Ubuntu VM (4 CPU, 8GB RAM minimum)
2. Install Node.js, PostgreSQL, Nginx
3. Configure SSL (Let's Encrypt)
4. Setup PM2 for process management
5. Configure firewall
6. Setup daily database backups

### Store-Side Connector Setup

For automatic hourly sync from POS systems:

```bash
# On store computer:
cd /path/to/connector
npm install axios chokidar form-data
node store-connector.js
```

📖 **[Connector Setup](./scripts/connector.env.template)**

---

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/admin/reset-password` - Admin password reset

### Inventory Management
- `GET /api/inventory/full/:storeId` - Full inventory list
- `GET /api/inventory/barcode/:barcode` - Barcode lookup
- `POST /api/onboarding/upload` - Manual CSV upload

### AI Recommendations
- `GET /api/inventory-ai/summary/:storeId` - AI summary
- `GET /api/inventory-ai/recommendations/:storeId` - Get recommendations
- `POST /api/ops/daily-close` - Trigger AI analysis

### Store Connector
- `POST /api/sync/upload` - Automated file upload (API key auth)

**Authentication:** All endpoints (except `/api/health` and `/api/auth/login`) require JWT Bearer token.

---

## 🧪 Testing

### Run Local Tests

```bash
# Start server
node server.js

# Test health
curl http://localhost:3000/api/health

# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"store001@store.local","password":"password123"}'

# Use token in requests
curl http://localhost:3000/api/inventory/full/STORE_001 \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 🛠️ Admin Tools

### Generate API Key for Store
```bash
node scripts/generate-api-key.js STORE_001 365
```

### Reset User Password
```bash
node scripts/reset-password.js
```

### View Audit Logs
```sql
SELECT * FROM operational_audit_log 
WHERE store_id = 'STORE_001' 
ORDER BY occurred_at DESC 
LIMIT 10;
```

---

## 📚 Documentation

- 🚀 **[Quick Start](./QUICK_START.md)** - Get running in 3 steps
- ☁️ **[Cloud Deployment](./docs/CLOUD_DEPLOYMENT_GUIDE.md)** - Production setup
- ✅ **[Go-Live Checklist](./docs/GO_LIVE_CHECKLIST.md)** - Pre-launch verification
- 🔒 **[Auth Integration](./docs/SERVER_AUTH_INTEGRATION.md)** - How authentication works
- 📝 **[Implementation Summary](./docs/IMPLEMENTATION_SUMMARY.md)** - What was built
- 🏗️ **[Database Architecture](./docs/DATABASE_ARCHITECTURE.md)** - Schema details
- 🤖 **[AI Work Cycle](./docs/AI_WORK_CYCLE_AND_INTELLIGENCE_LAYER.md)** - How AI works

---

## 🔐 Security Features

- ✅ JWT authentication (24-hour sessions)
- ✅ API key authentication for connectors
- ✅ Store-level data isolation
- ✅ Account lockout on failed attempts
- ✅ Comprehensive audit logging
- ✅ SQL injection protection (parameterized queries)
- ✅ HTTPS support (production)
- ✅ CORS configuration

---

## 🆘 Support & Troubleshooting

### Common Issues

**"Cannot find module" errors:**
```bash
npm install
```

**Database connection failed:**
- Check `.env` DB credentials
- Verify PostgreSQL is running
- Test: `psql -U postgres -d ai_store_manager`

**Login not working:**
- Verify tables exist: `psql -c "SELECT * FROM users;"`
- Reset password: `node scripts/reset-password.js`

**More help:** See `CLOUD_READY_CHECKLIST.md`

---

## 🤝 Contributing

This is a production system. For changes:
1. Test locally first
2. Document changes
3. Update relevant docs
4. Test with real data

---

## 📄 License

Proprietary - All Rights Reserved

---

## 🎉 Version History

**v2.0** (2026-02-04) - Cloud-Ready Release
- ✅ Full authentication system
- ✅ Multi-tenant security
- ✅ Store-side connector
- ✅ Comprehensive audit logging
- ✅ Production deployment guides

**v1.0** - Initial Release
- Core inventory management
- AI recommendation engine
- Onboarding system

---

**Built with:** Node.js • Express • PostgreSQL • Gemini AI  
**Status:** ✅ Production-Ready  
**Version:** 2.0
