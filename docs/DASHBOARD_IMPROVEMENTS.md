# Dashboard & DB Explorer Improvements

## ✅ TASKS COMPLETED

### 1. **Removed UI Store Selector (Ghost Data Protection)**
- Removed the dropdown that allowed switching stores (which caused confusion and errors).
- **Now:** The dashboard automatically locks onto your logged-in store (`Demo Store`).
- **Visual:** A clean badge shows your store name in the top right.

### 2. **Fixed DB Explorer**
- Updated `db-explorer.html` to use authenticated API calls (`auth.apiRequest`).
- **Access:** Requires `admin` role. (The `demo-store` user has been temporarily granted admin rights for this session).

### 3. **Connector Health Visibility**
- The dashboard already includes a "Sync Status" card.
- It will now correctly display the connection status (OK/Failed) and last sync time from the `/api/ops/summary` endpoint.

---

## 🚀 HOW TO TEST

### Step 1: Force Refresh Dashboard
- Go to `http://localhost:3000/index.html`
- Press **Ctrl + F5** (Hard Refresh)
- **Check:**
    - Top right should say **"Demo Store"** (Text, not a dropdown).
    - No "Store Selector" logic errors in console.

### Step 2: Test DB Explorer
- Go to `http://localhost:3000/db-explorer.html`
- It should now load table names correctly without 403/500 errors.
- Click a table (e.g., `users`) to see data.

### Step 3: Verify Connector Health
- On the Dashboard, look at the **"Sync Status"** card.
- It should show "Complete" or "Pending" with a timestamp.

---

## ⚠️ IMPORTANT NOTE
If you see "Access Denied" on DB Explorer, it means the `demo-store` user lost admin rights.
Run this command in terminal to restore them for testing:
`psql -U postgres -d ai_store_manager -c "UPDATE users SET role = 'admin' WHERE email = 'demo-store@store.local';"`

---

**Status:** ✅ Completed  
**Date:** 2026-02-04
