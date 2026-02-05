-- ============================================================================
-- ADD CATEGORY NAMES TO EXISTING RECORDS
-- Fixes "unknown" display issue in UI
-- ============================================================================

-- Step 1: Ensure master_category_name column exists (it should from original schema)
-- If not, add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'store_sku_registry' 
        AND column_name = 'master_category_name'
    ) THEN
        ALTER TABLE store_sku_registry 
        ADD COLUMN master_category_name VARCHAR(200);
    END IF;
END $$;

-- Step 2: Update all existing records with category names
UPDATE store_sku_registry
SET master_category_name = CASE master_category_id
    -- Level 1 Categories
    WHEN 'L1_FRESH' THEN 'Fresh Food & Daily Essentials'
    WHEN 'L1_DAIRY' THEN 'Dairy, Bread & Eggs'
    WHEN 'L1_STAPLES' THEN 'Staples & Cooking Essentials'
    WHEN 'L1_PACKAGED' THEN 'Packaged Food & Snacks'
    WHEN 'L1_BEVERAGES' THEN 'Beverages'
    WHEN 'L1_PERSONAL_CARE' THEN 'Personal Care & Beauty'
    WHEN 'L1_HOME_CARE' THEN 'Home Care & Cleaning'
    WHEN 'L1_HOUSEHOLD' THEN 'Home Care & Cleaning'
    WHEN 'L1_PHARMA' THEN 'Pharma & Wellness'
    WHEN 'L1_DURABLES' THEN 'Home, Kitchen & Durables'
    WHEN 'L1_RESTRICTED' THEN 'Restricted & Regulated Goods'
    
    -- Level 2 Categories - Fresh
    WHEN 'L2_FRESH_VEGETABLES' THEN 'Fresh Vegetables'
    WHEN 'L2_FRESH_FRUITS' THEN 'Fresh Fruits'
    
    -- Level 2 Categories - Dairy
    WHEN 'L2_MILK' THEN 'Milk'
    WHEN 'L2_CURD_YOGURT' THEN 'Curd & Yogurt'
    WHEN 'L2_BREAD' THEN 'Bread & Bakery'
    WHEN 'L2_EGGS' THEN 'Eggs'
    
    -- Level 2 Categories - Staples
    WHEN 'L2_ATTA_RICE_PULSES' THEN 'Atta, Rice & Pulses'
    WHEN 'L2_OILS_GHEE' THEN 'Edible Oils & Ghee'
    WHEN 'L2_SPICES_MASALAS' THEN 'Spices & Masalas'
    WHEN 'L2_SPICES' THEN 'Spices & Masalas'
    
    -- Level 2 Categories - Packaged
    WHEN 'L2_SNACKS' THEN 'Snacks & Namkeen'
    WHEN 'L2_BISCUITS' THEN 'Biscuits & Cookies'
    WHEN 'L2_CHOCOLATES' THEN 'Chocolates & Confectionery'
    
    -- Level 2 Categories - Beverages
    WHEN 'L2_SOFT_DRINKS' THEN 'Soft Drinks & Juices'
    WHEN 'L2_TEA_COFFEE' THEN 'Tea & Coffee'
    
    -- Level 3 Categories
    WHEN 'L3_FRESH_VEGETABLES_DAILY' THEN 'Daily Vegetables'
    WHEN 'L3_FRESH_VEGETABLES_EXOTIC' THEN 'Exotic Vegetables'
    WHEN 'L3_FRESH_FRUITS_REGULAR' THEN 'Regular Fruits'
    WHEN 'L3_FRESH_FRUITS_SEASONAL' THEN 'Seasonal Fruits'
    
    ELSE master_category_id
END
WHERE master_category_name IS NULL OR master_category_name = '';

-- Step 3: Verify the update
SELECT 
    master_category_id,
    master_category_name,
    COUNT(*) as count
FROM store_sku_registry
GROUP BY master_category_id, master_category_name
ORDER BY count DESC;

-- Step 4: Check for any remaining NULL or empty category names
SELECT COUNT(*) as items_without_name
FROM store_sku_registry
WHERE master_category_name IS NULL OR master_category_name = '';
