import csv
import json
import requests
import re

def clean_name(name):
    # Remove excessive quotes and clean up whitespace
    name = name.strip()
    if name.startswith('"') and name.endswith('"'):
        name = name[1:-1]
    return name

def fetch_and_save_data():
    url = "https://raw.githubusercontent.com/FuadAnalyst/EDA-Exploratory-Data-Analysis/main/BigBasket%20Products.csv"
    response = requests.get(url)
    
    if response.status_code != 200:
        print(f"Failed to fetch data: {response.status_code}")
        return

    content = response.text.splitlines()
    reader = csv.DictReader(content)
    
    products = []
    seen_names = set()
    
    for row in reader:
        if len(products) >= 1500: # Get a bit more than 1000 just in case
            break
            
        name = clean_name(row.get('product', ''))
        brand = clean_name(row.get('brand', ''))
        category = clean_name(row.get('category', ''))
        
        # Create a full product string
        full_name = f"{brand} {name}"
        if full_name in seen_names:
            continue
        seen_names.add(full_name)
        
        # Estimate cost and price if not realistic
        try:
            market_price = float(row.get('market_price', 0))
            sale_price = float(row.get('sale_price', 0))
        except:
            market_price = 100
            sale_price = 90
            
        if market_price <= 0:
            market_price = 100
        if sale_price <= 0 or sale_price > market_price:
            sale_price = market_price * 0.95
            
        cost_price = sale_price * 0.8 # Assume 20% margin
        
        # Custom Remapping: Move Health items out of Beauty & Hygiene
        if row.get('sub_category', '') == 'Health & Medicine' or category == 'Baby Care':
            if row.get('sub_category', '') == 'Health & Medicine':
                category = 'Health & Wellness'
        
        products.append({
            "name": full_name,
            "category": category,
            "sub_category": row.get('sub_category', ''),
            "brand": brand,
            "price": round(sale_price, 2),
            "cost": round(cost_price, 2)
        })
        
    with open('d:/AI Store Manger/data/real_products.json', 'w', encoding='utf-8') as f:
        json.dump(products, f, indent=4)
        
    print(f"Successfully saved {len(products)} real products to data/real_products.json")

if __name__ == "__main__":
    import os
    if not os.path.exists('d:/AI Store Manger/data'):
        os.makedirs('d:/AI Store Manger/data')
    fetch_and_save_data()
