import json
import psycopg2
import os

# Database connection from environment
# Note: In production use env vars, here we use the values from .env directly for the script
db_config = {
    "host": "localhost",
    "port": 5432,
    "database": "ai_store_manager",
    "user": "postgres",
    "password": "101914"
}

def remediate_database():
    print("--- Remediating Database Categories ---")
    
    # Load the corrected real_products mapping
    real_products_path = 'd:/AI Store Manger/data/real_products.json'
    if not os.path.exists(real_products_path):
        print("real_products.json not found. Run fetch_real_data.py first.")
        return

    with open(real_products_path, 'r', encoding='utf-8') as f:
        real_products = json.load(f)

    # Create a mapping of product name -> category
    name_to_cat = {p['name']: p['category'] for p in real_products}

    try:
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor()

        # Get all demo-store items
        cur.execute("SELECT store_item_id, normalized_product_name, master_category_name FROM store_sku_registry WHERE store_id = 'demo-store'")
        rows = cur.fetchall()

        updates = 0
        for sku_id, name, current_cat in rows:
            if name in name_to_cat:
                new_cat = name_to_cat[name]
                if new_cat != current_cat:
                    cur.execute(
                        "UPDATE store_sku_registry SET master_category_name = %s WHERE store_id = 'demo-store' AND store_item_id = %s",
                        (new_cat, sku_id)
                    )
                    updates += 1

        conn.commit()
        print(f"Successfully updated {updates} items in store_sku_registry.")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Database error: {e}")

if __name__ == "__main__":
    remediate_database()
