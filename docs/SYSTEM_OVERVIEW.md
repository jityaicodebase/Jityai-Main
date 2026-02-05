# Store Manager - Professional System Documentation

## System Overview

A professional, enterprise-grade inventory management system designed for retail store operations.

---

## Design Philosophy

### Professional & Clean
- **No decorative elements** - Pure business focus
- **Corporate color scheme** - Dark navigation (#1a1d29), professional blue (#3b82f6)
- **Enterprise typography** - System fonts, proper hierarchy
- **Business terminology** - Professional language throughout

### Key Design Elements

**Color Palette:**
- Primary: `#3b82f6` (Professional Blue)
- Dark: `#1a1d29` (Navigation Bar)
- Success: `#10b981` (Positive Actions)
- Warning: `#f59e0b` (Attention Required)
- Danger: `#ef4444` (Critical Items)
- Background: `#f8f9fa` (Light Gray)
- Text: `#212529` (Dark Gray)

**Typography:**
- System Fonts: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto
- Headers: 600-700 weight
- Body: 400-500 weight
- Uppercase labels with letter-spacing for emphasis

---

## Pages

### 1. Dashboard (`index.html`)

**Purpose:** Central command center for store operations

**Features:**
- **Top Navigation Bar**
  - Brand logo (SM)
  - Store Manager branding
  - Location selector
  
- **Metrics Grid**
  - Total Items (Active SKUs)
  - Healthy Stock (Above threshold)
  - Low Stock (Requires attention)
  - Critical (Immediate action needed)

- **Action Bar**
  - Refresh Data
  - View All Items
  - Add New Location
  - Update Inventory

- **Stock Alerts Panel**
  - Critical and low stock items
  - Reorder action buttons
  - SKU and quantity details

**Onboarding Flow:**
- Welcome screen for new stores
- File upload interface
- Automatic categorization

---

### 2. Inventory Management (`inventory-management.html`)

**Purpose:** Detailed inventory editing and management

**Features:**
- **Stats Dashboard**
  - Total Items count
  - Total Value calculation
  - Low Stock Items count
  - Pending Changes tracker

- **Search & Filter Toolbar**
  - Product name/SKU search
  - Category filter
  - Stock level filter (Low/Medium/High)

- **Editable Data Table**
  - Click-to-edit quantities
  - Click-to-edit prices
  - Individual save per item
  - Bulk save all changes

- **Professional Table Design**
  - Monospace SKU codes
  - Color-coded stock badges
  - Hover effects
  - Clean borders and spacing

---

## Business Terminology

### Dashboard
- **Location** (not "Store")
- **Stock Alerts** (not "Low Stock Alerts")
- **Requires attention** (not "needs restocking")
- **Active SKUs** (not "products")
- **Immediate action needed** (not "critical")

### Inventory Management
- **Pending Changes** (not "unsaved edits")
- **Save All Changes** (not "bulk save")
- **Stock Status** (not "inventory level")

### Actions
- **Update Inventory** (not "sync")
- **Add New Location** (not "onboard store")
- **Reorder** (not "buy more")
- **Refresh Data** (not "reload")

---

## API Endpoints

### Dashboard APIs
```
GET  /api/dashboard/inventory/:storeId    - Get inventory summary
GET  /api/dashboard/metrics/:storeId      - Get KPI metrics
GET  /api/stores                          - Get all store locations
```

### Inventory Management APIs
```
GET  /api/inventory/full/:storeId         - Get complete inventory details
POST /api/sync/inventory                  - Update inventory (JSON)
POST /api/sync/inventory/upload           - Update inventory (File)
```

### Onboarding APIs
```
POST /api/onboarding/upload               - Onboard new store location
```

---

## User Workflows

### Daily Operations
1. **Check Dashboard** → View metrics and alerts
2. **Review Stock Alerts** → Identify items needing reorder
3. **Update Inventory** → Upload daily changes or manual entry
4. **View All Items** → Detailed inventory review

### Inventory Updates
1. **Click "Update Inventory"**
2. **Choose Method:**
   - File Upload: CSV/Excel with updates
   - Manual Entry: JSON format
3. **Submit Update**
4. **System validates and creates snapshot**

### Editing Individual Items
1. **Click "View All Items"**
2. **Click on quantity or price to edit**
3. **Press Enter or click outside to confirm**
4. **Click "Save" for individual item**
5. **Or click "Save All Changes" for bulk update**

### Adding New Location
1. **Click "Add New Location"**
2. **Enter Store ID and Name**
3. **Upload initial inventory file**
4. **System categorizes and onboards**

---

## Data Integrity

### Snapshot System
- **Every update creates a complete snapshot**
- **Timestamp** - When change occurred
- **Source** - Who/what made the change
- **All fields preserved** - Even if only one field updated
- **Audit trail** - Full history of all changes
- **Time travel** - Query state at any point in time

### Field Preservation
When updating:
- Only specified fields are changed
- Other fields retain current values
- No data loss on partial updates
- Complete snapshot still created

---

## File Formats

### Initial Onboarding CSV
```csv
Product Name,Quantity,Unit,Selling Price,Cost Price,Brand
Amul Butter 500g,50,g,250,200,Amul
Tata Salt 1kg,100,kg,22,18,Tata
```

### Incremental Update CSV
```csv
SKU ID,Quantity,Selling Price,Cost Price
SKU-001,75,260,
SKU-002,120,,
```
*Note: Leave fields blank to keep current values*

### Manual JSON Format
```json
[
  {"store_item_id": "SKU-001", "quantity": 75, "selling_price": 260},
  {"store_item_id": "SKU-002", "quantity": 120}
]
```

---

## Security & Access

### Current Implementation
- Store-based data isolation
- Server-side validation
- SQL injection protection (parameterized queries)
- File upload validation

### Future Enhancements
- User authentication
- Role-based access control
- Multi-tenant support
- Audit logging

---

## Performance

### Optimizations
- Indexed database queries
- DISTINCT ON for latest snapshots
- Efficient LATERAL joins
- Client-side filtering
- Minimal re-renders

### Scalability
- Supports multiple stores
- Handles thousands of SKUs
- Append-only architecture
- Efficient snapshot retrieval

---

## Browser Support

- Chrome/Edge (Recommended)
- Firefox
- Safari
- Modern browsers with ES6+ support

---

## System Status

**Production Ready Features:**
- ✅ Multi-store management
- ✅ Inventory onboarding
- ✅ Incremental updates
- ✅ Inline editing
- ✅ Search and filtering
- ✅ Snapshot history
- ✅ Professional UI

**Future Enhancements:**
- Analytics dashboard
- Sales forecasting
- Reorder automation
- Supplier integration
- Mobile app
- Export/reporting

---

## Support & Maintenance

### Regular Tasks
- Database backup
- Performance monitoring
- User feedback review
- Feature updates

### Troubleshooting
- Check browser console for errors
- Verify database connection
- Confirm file formats
- Review API responses

---

**Version:** 1.0.0  
**Last Updated:** January 2026  
**Status:** Production Ready
