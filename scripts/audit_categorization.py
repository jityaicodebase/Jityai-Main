import csv
import os

def audit_categorization(csv_path):
    if not os.path.exists(csv_path):
        print(f"File not found: {csv_path}")
        return

    print("--- Logical Audit of Product Categorization ---")
    
    products = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            products.append(row)

    categories = {}
    for p in products:
        cat = p['Category']
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(p['Product Name'])

    # Heuristic rules - expanded for accuracy
    rules = {
        "Beverages": ["Tea", "Coffee", "Juice", "Drink", "Water", "Mojito", "Cosmopolitan", "Milkshake", "Aamras", "Cola", "Soda", "Bev"],
        "Foodgrains, Oil & Masala": ["Rice", "Atta", "Flour", "Dal", "Masala", "Powder", "Oil", "Salt", "Garam Masala", "Sugar", "Saffron", "Turmeric", "Pepper", "Dalia", "Tamarind", "Asafoetida", "Basmati", "Cumin"],
        "Beauty & Hygiene": ["Soap", "Wash", "Shampoo", "Face", "Cream", "Oil", "Perfume", "Deoforant", "Toothpaste", "Scrub", "Lotion", "Gel", "Mask", "Sanitizer", "Conditioner", "Lip", "Serum", "Razor", "Blade", "Brush"],
        "Cleaning & Household": ["Cleaner", "Detergent", "Bucket", "Fragrance", "Freshener", "Mop", "Broom", "Wipes", "Dishwash", "Umbrella", "Notebook", "Pencil", "Bag", "Hook", "Stationery", "Battery", "Folder"],
        "Snacks & Branded Foods": ["Chips", "Biscuit", "Noodles", "Jam", "Mix", "Papad", "Chocolate", "Honey", "Pickle", "Popcorn", "Candy", "Muesli", "Dosa", "Idly", "Wafer", "Makhana"],
        "Kitchen, Garden & Pets": ["Bottle", "Steel", "Bowl", "Container", "Glass", "Pan", "Knife", "Cooker", "Plate", "Mug", "Cat", "Dog", "Pet", "Lead", "Brush", "Tiffin", "Flask", "Vati", "Dabba", "Tumbler"],
        "Bakery, Cakes & Dairy": ["Cheese", "Batter", "Yogurt", "Milk", "Bread", "Cake", "Butter", "Paneer", "Muffin", "Milkshake"],
        "Fruits & Vegetables": ["Fresho", "Onion", "Garlic", "Lemon", "Cabbage", "Brinjal", "Avocado", "Ginger", "Chilli", "Tomato", "Potato", "Pumpkin"],
        "Eggs, Meat & Fish": ["Prawns", "Salmon", "Chicken", "Pork", "Crab", "Sausage", "Salami", "Fish"],
        "Baby Care": ["Diaper", "Baby", "Kids", "Mothercare", "Huggies", "Pampers", "New Born"],
        "Gourmet & World Food": ["Olive", "Pasta", "Sauce", "Granola", "Blue Tea", "Coffee Roasters", "Muesli", "Sushi", "Wasabi", "Vinegar", "Tahini", "Jars"]
    }

    mismatches = []
    category_health = {}

    for cat, items in categories.items():
        correct_count = 0
        cat_rules = rules.get(cat, [])
        
        for name in items:
            name_lower = name.lower()
            # Primary validation: Does it match its own category rules?
            if any(rule.lower() in name_lower for rule in cat_rules):
                correct_count += 1
            else:
                # Secondary validation: Does it look like it belongs elsewhere?
                possible_match = None
                for other_cat, other_rules in rules.items():
                    if other_cat == cat: continue
                    if any(rule.lower() in name_lower for rule in other_rules):
                        possible_match = other_cat
                        break
                
                if possible_match:
                    mismatches.append({
                        "item": name,
                        "current": cat,
                        "suggested": possible_match
                    })

        category_health[cat] = (correct_count / len(items)) * 100 if items else 0

    print("\n--- CATEGORY INTEGRITY SCORE ---")
    for cat, score in category_health.items():
        print(f" {cat}: {score:.1f}% alignment")

    print("\n--- SAMPLE VALIDATION (TOP POTENTIAL MISMATCHES) ---")
    # Only show top 15 interesting ones
    unique_mismatches = []
    seen = set()
    for m in mismatches:
        if m['item'] not in seen:
            unique_mismatches.append(m)
            seen.add(m['item'])

    if not unique_mismatches:
        print("No obvious mismatches found.")
    else:
        for m in unique_mismatches[:15]:
            print(f"Item: {m['item']}")
            print(f"  - Currently in: {m['current']}")
            print(f"  - Looks more like: {m['suggested']}")
            print("-" * 20)

    print(f"\nTotal potential mismatches identified: {len(unique_mismatches)}")
    print("Note: In Indian retail (e.g. BigBasket), some items like 'Honey' or 'Pickles' are intentionally placed in 'Snacks & Branded Foods' or 'Foodgrains' depending on store strategy.")

if __name__ == "__main__":
    audit_categorization('d:/AI Store Manger/inventory_demo-store_2026-01-28.csv')
