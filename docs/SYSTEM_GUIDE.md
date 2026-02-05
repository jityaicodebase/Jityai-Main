# 🏪 AI Store Manager - Complete System Guide

## 📦 What You Have Now

### ✅ **Completed Features**

#### 1. **Onboarding Agent** (Full Production)
- ✅ Excel/CSV Parser with Content-Aware Column Detection
- ✅ Product Name Normalization (lowercase, punctuation-free)
- ✅ Brand Extraction with Adjective Filtering
- ✅ AI Categorization (LLM + Fuzzy Matching + Hard Rules)
- ✅ Database Persistence (3-Table Model)
- ✅ Category Drift Protection
- ✅ Unit Assumption Diagnostics
- ✅ Catalog Version Consistency (v2.1.0)

#### 2. **Incremental Sync Agent** (Full Production)
- ✅ SKU Validation (never modifies identity)
- ✅ Append-only inventory snapshots
- ✅ Unknown SKU escalation
- ✅ File Upload Support (CSV/Excel)
- ✅ Manual JSON Entry Support
- ✅ API Integration

#### 3. **Master Dashboard** (Full Production)
- ✅ Smart Routing (Onboarding vs Dashboard)
- ✅ Store Selector Dropdown
- ✅ KPI Summary (Total, Healthy, Low Stock, At Risk)
- ✅ Low Stock Alerts
- ✅ Update Inventory Modal (File + Manual)
- ✅ Drag-and-drop file upload
- ✅ Real-time progress tracking

---

## 📂 Sample Files Created

### 1. **sample-onboarding.csv**
Location: `test-data/sample-onboarding.csv`

**Purpose**: First-time store setup with complete product details

**Format**:
```csv
store_item_id,product_name,quantity,selling_price,cost_price
SKU-001,Amul Butter 500g,50,250,200
SKU-002,Britannia Brown Bread,30,45,35
...
```

**Use Case**: Upload this when setting up a new store for the first time.

---

### 2. **sample-incremental-update.csv**
Location: `test-data/sample-incremental-update.csv`

**Purpose**: Daily inventory updates (quantities and prices only)

**Format**:
```csv
store_item_id,quantity,selling_price
SKU-001,45,255
SKU-002,28,45
...
```

**Use Case**: Upload this daily to update stock levels without re-categorizing products.

---

## 🚀 How to Use the System

### **First Time Setup (New Store)**

1. **Start the server**:
   ```powershell
   node server.js
   ```

2. **Open dashboard**:
   ```
   http://localhost:3000
   ```

3. **Upload initial inventory**:
   - Dashboard will detect no data exists
   - Shows onboarding welcome screen
   - Drag & drop `sample-onboarding.csv`
   - System categorizes all products
   - Creates SKU registry

---

### **Daily Operations (Existing Store)**

1. **View Dashboard**:
   - See KPIs (Total Items, Healthy Stock, Low Stock, At Risk)
   - Check Low Stock Alerts
   - Monitor inventory health

2. **Update Inventory**:
   - Click **"📤 Update Inventory"** button
   - Choose method:
     - **File Upload**: Drag & drop `sample-incremental-update.csv`
     - **Manual Entry**: Paste JSON updates
   - Click **"Submit Update"**
   - System validates SKUs and appends new snapshots

---

## 🗂️ Database Structure

### **Table 1: `store_sku_registry`** (Identity)
**Purpose**: Stores the "DNA" of your products (stable, long-lived)

**Key Fields**:
- `store_item_id`: Unique SKU identifier
- `normalized_product_name`: Clean, lowercase name
- `brand`: Verified brand name
- `master_category_id`: Locked category
- `catalog_version`: Version used for categorization

**Why Important**: Prevents duplicate SKUs and maintains consistent product identity across uploads.

---

### **Table 2: `onboarding_handoff`** (Inventory State)
**Purpose**: Stores inventory snapshots (volatile, time-series)

**Key Fields**:
- `store_item_id`: Links to SKU registry
- `quantity_on_hand`: Current stock level
- `selling_price`: Current selling price
- `as_of_date`: Timestamp of this snapshot
- `source`: Data source (onboarding_agent, incremental_update)

**Why Important**: Tracks inventory history without modifying product identity.

---

### **Table 3: `onboarding_batch_status`** (Audit Trail)
**Purpose**: Stores onboarding run metadata (governance)

**Key Fields**:
- `batch_id`: Unique run identifier
- `quality_score`: AI confidence score (0-100)
- `items_mapped`: Total items processed
- `status`: completed, failed, running

**Why Important**: Provides audit trail and troubleshooting history.

---

## 🔧 API Endpoints

### **Onboarding**
- `POST /api/onboarding/upload` - Upload file for first-time onboarding
- `POST /api/onboarding/process` - Process JSON items

### **Incremental Sync**
- `POST /api/sync/inventory` - Manual JSON updates
- `POST /api/sync/inventory/upload` - File upload for incremental sync

### **Dashboard**
- `GET /api/dashboard/inventory/:storeId` - Get inventory data
- `GET /api/dashboard/metrics/:storeId` - Get KPIs
- `GET /api/stats` - Database statistics
- `GET /api/health` - System health check

---

## 📊 Current Implementation Status

| Component | Status | Completion |
|:---|:---|:---|
| **Onboarding Agent** | ✅ Production | 100% |
| **Incremental Sync Agent** | ✅ Production | 100% |
| **Master Dashboard** | ✅ Production | 100% |
| **Store Selector** | ✅ Production | 100% |
| **Database Schema** | ✅ Production | 100% |
| **Sample Files** | ✅ Created | 100% |
| **Analytics Agent** | ⏳ Pending | 0% |
| **Forecasting** | ⏳ Pending | 0% |

**Overall Progress: 70%** (Core system complete, analytics pending)

---

## 🎯 Next Steps (Future Enhancements)

### **Phase 2: Analytics Agent** (Not Started)
- Fast vs Slow Moving Analysis
- Reorder Recommendations
- Sales Forecasting
- Profit Margin Analysis
- Seasonal Trend Detection

### **Phase 3: Master Orchestrator** (Not Started)
- Cost-based routing (LLM vs Rules)
- Multi-agent scheduling
- Error recovery & retry logic

---

## 🛠️ Troubleshooting

### **Issue: Database Connection Failed**
**Solution**: 
```powershell
Start-Service -Name "postgresql-x64-18"
```

### **Issue: Port 3000 Already in Use**
**Solution**: Change `PORT` in `.env` file or kill existing process

### **Issue: File Upload Fails**
**Solution**: Check file format (CSV/Excel), ensure headers match expected format

### **Issue: SKU Not Found During Incremental Update**
**Solution**: Run full onboarding first to create SKU registry

---

## 📝 Important Notes

1. **Catalog Version**: All records locked to `v2.1.0` for consistency
2. **Category Drift**: System prevents silent category changes between runs
3. **Unit Assumptions**: Tracked in diagnostics, not in SKU identity
4. **Data Privacy**: Internal AI scores hidden from downstream agents
5. **Incremental Updates**: Only update quantities/prices, never modify identity

---

## 🏪 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   MASTER DASHBOARD                      │
│  (Smart Routing: Onboarding vs Dashboard)              │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
┌───────▼────────┐                 ┌────────▼────────┐
│   ONBOARDING   │                 │  INCREMENTAL    │
│     AGENT      │                 │  SYNC AGENT     │
│                │                 │                 │
│ • Parse File   │                 │ • Validate SKUs │
│ • Normalize    │                 │ • Append Snaps  │
│ • Categorize   │                 │ • Escalate New  │
│ • Create SKUs  │                 │                 │
└────────┬───────┘                 └────────┬────────┘
         │                                  │
         └──────────────┬───────────────────┘
                        │
              ┌─────────▼─────────┐
              │    DATABASE       │
              │                   │
              │ • SKU Registry    │
              │ • Inventory State │
              │ • Audit Trail     │
              └───────────────────┘
```

---

## ✅ System Ready for Production

Your AI Store Manager is now **fully operational** for:
- ✅ First-time store onboarding
- ✅ Daily inventory updates
- ✅ Real-time dashboard monitoring
- ✅ Multi-store management
- ✅ Complete audit trail

**The system is production-ready!** 🚀🏪
