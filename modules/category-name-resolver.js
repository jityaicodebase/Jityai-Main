/**
 * CATEGORY NAME RESOLVER
 * Maps category IDs to human-readable names
 */

class CategoryNameResolver {
    constructor() {
        this.categoryMap = {
            // Level 1 Categories
            'L1_FRESH': 'Fresh Food & Daily Essentials',
            'L1_DAIRY': 'Dairy, Bread & Eggs',
            'L1_STAPLES': 'Staples & Cooking Essentials',
            'L1_PACKAGED': 'Packaged Food & Snacks',
            'L1_BEVERAGES': 'Beverages',
            'L1_PERSONAL_CARE': 'Personal Care & Beauty',
            'L1_HOME_CARE': 'Home Care & Cleaning',
            'L1_HOUSEHOLD': 'Home Care & Cleaning',
            'L1_PHARMA': 'Pharma & Wellness',
            'L1_DURABLES': 'Home, Kitchen & Durables',
            'L1_RESTRICTED': 'Restricted & Regulated Goods',

            // Level 2 Categories - Fresh
            'L2_FRESH_VEGETABLES': 'Fresh Vegetables',
            'L2_FRESH_FRUITS': 'Fresh Fruits',

            // Level 2 Categories - Dairy
            'L2_MILK': 'Milk',
            'L2_CURD_YOGURT': 'Curd & Yogurt',
            'L2_BREAD': 'Bread & Bakery',
            'L2_EGGS': 'Eggs',

            // Level 2 Categories - Staples
            'L2_ATTA_RICE_PULSES': 'Atta, Rice & Pulses',
            'L2_OILS_GHEE': 'Edible Oils & Ghee',
            'L2_SPICES_MASALAS': 'Spices & Masalas',
            'L2_SPICES': 'Spices & Masalas',

            // Level 2 Categories - Packaged
            'L2_SNACKS': 'Snacks & Namkeen',
            'L2_BISCUITS': 'Biscuits & Cookies',
            'L2_CHOCOLATES': 'Chocolates & Confectionery',

            // Level 2 Categories - Beverages
            'L2_SOFT_DRINKS': 'Soft Drinks & Juices',
            'L2_TEA_COFFEE': 'Tea & Coffee',

            // Level 3 Categories
            'L3_FRESH_VEGETABLES_DAILY': 'Daily Vegetables',
            'L3_FRESH_VEGETABLES_EXOTIC': 'Exotic Vegetables',
            'L3_FRESH_FRUITS_REGULAR': 'Regular Fruits',
            'L3_FRESH_FRUITS_SEASONAL': 'Seasonal Fruits'
        };
    }

    /**
     * Get human-readable name for a category ID
     */
    getCategoryName(categoryId) {
        if (!categoryId) {
            return 'Uncategorized';
        }

        return this.categoryMap[categoryId] || categoryId;
    }

    /**
     * Enrich items with category names
     */
    enrichItems(items) {
        return items.map(item => ({
            ...item,
            category_name: this.getCategoryName(item.master_category_id),
            category: this.getCategoryName(item.master_category_id) // Alias for compatibility
        }));
    }

    /**
     * Get all categories with names
     */
    getAllCategories() {
        return Object.entries(this.categoryMap).map(([id, name]) => ({
            category_id: id,
            category_name: name
        }));
    }
}

module.exports = CategoryNameResolver;
