# AI Store Manager - Actual Math System Documentation

**Last Updated:** 2026-02-05  
**Source:** `modules/inventory-ai-agent.js` - `calculateDeterministicMetrics()`

---

## 📊 **Core Calculation Flow**

### **Step 1: Average Daily Sales (ADS)**

```javascript
ads7 = calculateADS(salesHistory, 7)   // Last 7 days average
ads14 = calculateADS(salesHistory, 14) // Last 14 days average
ads30 = calculateADS(salesHistory, 30) // Last 30 days average

// Weighted ADS (WADS)
WADS = (0.5 * ads7) + (0.3 * ads14) + (0.2 * ads30)
```

**Why weighted?** Recent sales (7-day) get 50% weight, mid-term (14-day) gets 30%, longer-term (30-day) gets 20%.

---

### **Step 2: Demand Volatility Analysis**

```javascript
sigma = StandardDeviation(last 30 days of daily sales)
CV = sigma / WADS  // Coefficient of Variation
```

**Coefficient of Variation (CV)** measures demand stability:
- **CV < 0.30** → Stable demand
- **0.30 < CV ≤ 0.70** → Moderate volatility  
- **CV > 0.70** → High volatility

---

### **Step 3: Protection Window (PW)**

**This is your "lead time" - but it's dynamic, not fixed!**

```javascript
if (CV > 0.70):
    PW = 7 days  // High volatility → need more buffer
else if (CV > 0.30):
    PW = 5 days  // Moderate volatility
else:
    PW = 3 days  // Stable demand
```

**Protection Window** = The target replenishment cycle you want to maintain.

---

### **Step 4: Service Level (Z-Score)**

```javascript
importance = if (WADS > 10): 'High Impact'
             else if (WADS < 1): 'Low'
             else: 'Normal'

z = if (importance == 'High Impact'): 1.65  // 95% service level
    else if (importance == 'Low'): 0.84     // 80% service level
    else: 1.28                              // 90% service level
```

**Z-Score** determines how much safety buffer you need for desired service level.

---

### **Step 5: Safety Stock**

```javascript
SS = Max(
    z * sigma,      // Statistical buffer (from demand variability)
    WADS * PW,      // Time-based buffer (Protection Window worth of stock)
    0.5 * WADS      // Minimum 0.5 days of sales as baseline buffer
)
```

**Safety Stock** = Emergency buffer to prevent stockouts during demand spikes.

---

### **Step 6: Target Stock Level**

```javascript
Target Stock = WADS * PW
```

**NOT Target Stock = WADS * PW + SS** (Safety Stock is separate, evaluated independently)

**Target Stock** = The ideal stock level to maintain your Protection Window.

---

### **Step 7: Days of Inventory (DOI)**

```javascript
DOI = Current Stock / WADS
```

**Days of Inventory** = How many days your current stock will last at the weighted average sales rate.

---

## 🎯 **Decision Logic (Action Buckets)**

### **MONITOR (No Action)**
```javascript
if (Current Stock <= 0 AND WADS <= 0):
    → MONITOR (dead stock, no sales)
```

---

### **BUY_MORE (Restock Needed)**
```javascript
if (DOI < PW OR Current Stock < Safety Stock):
    → BUY_MORE
    Recommended Qty = Target Stock - Current Stock
    
    if (DOI < 1):
        → URGENT flag = true
```

**Translation:**
- If you have less than your Protection Window's worth of stock, OR
- If you're below your Safety Stock threshold
- **Then:** Order enough to reach Target Stock Level

---

### **BUY_LESS (Overstock)**
```javascript
if (DOI > 30 days):
    → BUY_LESS
    Excess Qty = Current Stock - (WADS * 15)  // Keep 15 days as healthy buffer
```

**Translation:**
- If you have more than **30 days** of stock
- **Then:** Flag as overstock
- **Excess** = Everything above a 15-day healthy level

---

## 📐 **Derived Metrics (For Display Only)**

These are **NOT used in decision logic**, but are calculated for UI display:

```javascript
// "ROP" - Reorder Point (traditional inventory theory concept)
ROP = (WADS * PW) + Safety Stock
// NOTE: Not actually used for decisions! PW comparison happens directly.

// "Lead Time" display
Lead Time = PW  // Just showing Protection Window as "lead time"
```

---

## 🧮 **Example Calculation**

**Product:** Nature Protect Germ Wipes  
**Current Stock:** 2 units  

### Step-by-Step:

1. **ADS:**
   - ads7 = 2.00
   - ads14 = 2.14
   - ads30 = (calculated from last 30 days)
   - **WADS = (0.5 × 2.00) + (0.3 × 2.14) + (0.2 × ads30) = 2.10**

2. **Volatility:**
   - sigma = 0.5 (example)
   - **CV = 0.5 / 2.10 = 0.238** → Stable demand

3. **Protection Window:**
   - CV < 0.30 → **PW = 3 days**

4. **Service Level:**
   - WADS = 2.10 > 1 but < 10 → Normal importance
   - **z = 1.28**

5. **Safety Stock:**
   - SS = Max(1.28 × 0.5, 2.10 × 3, 0.5 × 2.10)
   - SS = Max(0.64, 6.3, 1.05)
   - **SS = 6.3 ≈ 10 units** (after rounding in business logic)

6. **Target Stock:**
   - **Target = 2.10 × 3 = 6.3 units**

7. **Days of Inventory:**
   - **DOI = 2 / 2.10 = 0.95 days** (less than 1 day!)

8. **Decision:**
   - DOI (0.95) < PW (3) → **BUY_MORE**
   - DOI < 1 → **URGENT = true**
   - **Recommended Qty = 6.3 - 2 = 4.3 → Round up by case size → 9 units**

9. **Risk State:**
   - actionBucket = BUY_MORE
   - DOI < 1 → **CRITICAL**

---

## ✅ **Key Insights**

1. **Protection Window (PW) is the master metric** - Not "Lead Time"
   - It adjusts dynamically based on demand volatility
   - It determines both Target Stock and triggers BUY_MORE decisions

2. **ROP is a derived display metric** - Not used in actual decision logic
   - Traditional inventory theory uses ROP
   - This system uses direct PW comparison instead

3. **Safety Stock is independent** - Not added to Target Stock
   - It's evaluated separately as a trigger condition
   - Target Stock = WADS × PW (clean, simple)

4. **BUY_LESS threshold = 30 days** (not 3× PW)
   - Hard threshold for flagging overstock
   - Keeps 15 days as "healthy" baseline

---

## 🔧 **What Needs to Be Fixed in UI**

### Current Display (WRONG):
- ❌ Lead Time: "5.0 days" (implies fixed lead time from supplier)
- ❌ Reorder Point: "21" (implies ROP-based decision logic)

### Should Display Instead (CORRECT):
- ✅ **Protection Window:** 3/5/7 days (dynamic based on CV)
- ✅ **Target Stock Level:** X units (WADS × PW)
- ✅ **Current Stock vs Target:** Shows gap/excess

---

**End of Documentation**
