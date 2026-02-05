# 500 Error Fix + Store Name Update

## ✅ ISSUES RESOLVED

### Issue 1: 500 Error on `/api/ops/summary`
**Root Cause:** SQL syntax error - missing `COUNT(CASE` in the query  
**Fix:** Added `COUNT(CASE` to line 307 in server.js

### Issue 2: Store Name Shows "Store Owner demo-store"
**Root Cause:** Full name in database was too verbose  
**Fix:** Updated both `users` and `store_settings` tables to use "Demo Store"

---

## 🔧 CHANGES MADE

### 1. **Fixed SQL Query** (server.js line 304-314)
```sql
-- BEFORE (Broken):
COUNT(*) as total_skus,
    WHEN master_category_name IS NOT NULL 
    
-- AFTER (Fixed):
COUNT(*) as total_skus,
COUNT(CASE 
    WHEN master_category_name IS NOT NULL 
```

### 2. **Updated Store Names in Database**
```sql
UPDATE users SET full_name = 'Demo Store' WHERE store_id = 'demo-store';
UPDATE store_settings SET store_name = 'Demo Store' WHERE store_id = 'demo-store';
```

---

## 🔄 NEXT STEPS

### Step 1: Restart Server
The server.js file was updated, so you need to restart:
```bash
# In terminal, press Ctrl+C to stop
# Then start again:
node server.js
```

### Step 2: Clear Browser & Re-Login
```javascript
// In browser console (F12):
localStorage.clear();
location.href = '/login.html';
```

Then login with:
- Email: `demo-store@store.local`
- Password: `password123`

---

## ✅ EXPECTED RESULT

After restart + re-login:
- ✅ Store dropdown shows: **"Demo Store"** (not "Store Owner demo-store")
- ✅ Dashboard loads successfully
- ✅ No 500 errors on `/api/ops/summary/demo-store`
- ✅ Catalog stats appear (Total SKUs, Low Stock, etc.)

---

**Status:** ✅ Fixed  
**Date:** 2026-02-04  
**Action Required:** Restart server + re-login
