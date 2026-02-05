# 🚀 JityAI Cloud-Ready - Quick Start

Your system is now **cloud-ready** with full authentication! 

## ⚡ 3-Step Local Setup

### 1️⃣ Create Database Tables (30 seconds)
```powershell
psql -U postgres -d ai_store_manager -f database/create-auth-tables.sql
psql -U postgres -d ai_store_manager -f database/migrate-add-auth.sql
```

### 2️⃣ Set Admin Password (15 seconds)
```powershell
node scripts/reset-password.js
# Email: admin@jityai.com
# Password: [your-choice]
```

### 3️⃣ Start Server (5 seconds)
```powershell
node server.js
```

**Done!** Open: `http://localhost:3000/login.html`

---

## 🔐 Test Login

**Default Store Accounts:**
- Email: `<your_store_id>@store.local` (e.g., `store001@store.local`)
- Password: `password123`

**Admin Account:**
- Email: `admin@jityai.com`
- Password: [what you set in step 2]

---

## 📚 Full Documentation

- **Deployment:** `docs/CLOUD_DEPLOYMENT_GUIDE.md`
- **Go-Live Checklist:** `docs/GO_LIVE_CHECKLIST.md`
- **What Changed:** `docs/IMPLEMENTATION_SUMMARY.md`
- **Complete Checklist:** `CLOUD_READY_CHECKLIST.md`

---

## 🆘 Troubleshooting

**Server won't start?**
```bash
npm install
```

**Can't login?**
```bash
# Check if tables exist
psql -U postgres -d ai_store_manager -c "SELECT * FROM users;"
```

**Need API key for connector?**
```bash
node scripts/generate-api-key.js STORE_001
```

---

**Status:** ✅ v2.0 Cloud-Ready
