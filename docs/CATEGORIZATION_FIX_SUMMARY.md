# Categorization Fix Summary

## Issues Identified from Exported CSV

1. **Amul products showing as "Unknown"** - Butter, Cheese, Paneer, Milk, Curd
2. **MDH products showing as "Unknown"** - All spices/masalas  
3. **Eggs showing as "Unknown"** - Brown Eggs, Desi Eggs
4. **Vegetables/Fruits showing as "Unknown"** - Onion, Potato, Banana, etc.
5. **Missing metadata columns** - mapping_confidence, mapping_method were empty
6. **Missing API endpoint** - `/api/inventory/full/:storeId` didn't exist

## Root Causes

1. **BrandCategoryHints was incomplete** - Only had 15 brands, missing MDH, Everest, Catch, Frooti, Maaza, etc.
2. **Category ID to Name mapping** - `getCategoryName()` returned "Unknown" for subcategories like L2_EGGS, L2_SPICES
3. **ON CONFLICT clause** - When re-onboarding, category data wasn't being updated (only timestamp)
4. **Missing API** - Inventory page was calling an API that didn't exist

## Fixes Applied

### 1. `modules/catalog-mapper.js`

**Expanded brandCategoryHints** from 15 to 100+ brands:
- Added dairy brands: Amul, Mother Dairy, Nandini, Verka, Milma, Aavin
- Added spice brands: MDH, Everest, Catch, Eastern, Sakthi, Badshah, Aachi
- Added beverage brands: Frooti, Maaza, Real, Tropicana, Nescafe, Bru, Red Label
- Added household brands: Surf Excel, Ariel, Tide, Rin, Vim, Harpic, Lizol
- Many more...

**Fixed getCategoryName()** to use static fallback mapping:
- Ensures all category IDs (L1_*, L2_*) return proper human-readable names
- No more "Unknown" for valid categories

### 2. `modules/database-persistence.js`

**Updated ON CONFLICT clause** to also update category data:
```sql
ON CONFLICT (store_id, store_item_id) DO UPDATE SET
    master_category_id = EXCLUDED.master_category_id,
    master_category_name = EXCLUDED.master_category_name,
    mapping_confidence = EXCLUDED.mapping_confidence,
    mapping_method = EXCLUDED.mapping_method,
    last_verified_at = CURRENT_TIMESTAMP
```

### 3. `server.js`

**Added `/api/inventory/full/:storeId` endpoint** that:
- Joins store_sku_registry with onboarding_handoff
- Returns all SKU data with inventory state
- Uses correct column names from schema (unit, as_of_date)

## How to Test

1. **Reset and re-run onboarding:**
   ```bash
   node server.js
   # Then upload the test data again via the UI
   ```

2. **Or run the test script:**
   ```bash
   node test-comprehensive-dataset.js
   ```

3. **Export and verify:**
   - Navigate to `/inventory-management.html?store=<store-id>`
   - Click "Export to CSV"
   - Check that categories are now:
     - Amul Butter → "Milk & Dairy" or "L2_MILK"
     - MDH Garam Masala → "Spices" or "L2_SPICES"
     - Brown Eggs Tray → "Eggs" or "L2_EGGS"
     - Banana → "Fresh Fruits" or "L2_FRESH_FRUITS"

## Expected Results After Fix

| Product | Expected Category | Expected Confidence |
|---------|------------------|---------------------|
| Amul Butter | Milk & Dairy | 0.95 |
| Amul Cheese Slices | Milk & Dairy | 0.95 |
| MDH Garam Masala | Spices | 0.90+ |
| Brown Eggs Tray | Eggs | 0.95 |
| Banana | Fresh Fruits | 0.95 |
| Onion | Fresh Vegetables | 0.95 |
| Ariel Detergent | Household & Cleaning | 0.95 |
