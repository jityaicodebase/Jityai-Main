import pandas as pd
import json
import os

def analyze_inventory(csv_path):
    print(f"--- Analyzing Inventory File: {os.path.basename(csv_path)} ---")
    
    # Load the CSV
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        print(f"Error loading CSV: {e}")
        return

    total_skus = len(df)
    print(f"Total SKUs: {total_skus}")
    
    # Financial Analysis
    df['inventory_value'] = df['Stock'] * df['Cost Price']
    df['potential_revenue'] = df['Stock'] * df['Selling Price']
    df['profit_margin_val'] = df['Selling Price'] - df['Cost Price']
    df['margin_pct'] = (df['profit_margin_val'] / df['Selling Price']) * 100
    
    total_val = df['inventory_value'].sum()
    total_revenue = df['potential_revenue'].sum()
    total_profit = (df['potential_revenue'] - df['inventory_value']).sum()
    avg_margin = df['margin_pct'].mean()
    
    print(f"Total Inventory Value: ₹{total_val:,.2f}")
    print(f"Total Potential Revenue: ₹{total_revenue:,.2f}")
    print(f"Projected Profit: ₹{total_profit:,.2f}")
    print(f"Average Margin: {avg_margin:.2f}%")
    
    # Stock Level Analysis
    out_of_stock = df[df['Stock'] == 0]
    critical_stock = df[(df['Stock'] > 0) & (df['Stock'] <= 10)]
    healthy_stock = df[df['Stock'] > 10]
    
    print(f"\nStock Health Status:")
    print(f" - Out of Stock: {len(out_of_stock)} items")
    print(f" - Critical Stock (<= 10): {len(critical_stock)} items")
    print(f" - Healthy Stock (> 10): {len(healthy_stock)} items")
    
    # Top 5 Categories by Value
    cat_stats = df.groupby('Category').agg({
        'Product Name': 'count',
        'inventory_value': 'sum',
        'margin_pct': 'mean'
    }).rename(columns={'Product Name': 'Item Count'}).sort_values('inventory_value', ascending=False)
    
    print(f"\nTop 5 Categories by value:")
    print(cat_stats.head(5))
    
    # Top 5 High-Margin Categories
    print(f"\nTop 5 High-Margin Categories:")
    print(cat_stats.sort_values('margin_pct', ascending=False).head(5))

    # Critical Alerts (Top 10 items needing reorder)
    print(f"\nCRITICAL ALERTS - Top 10 items out of stock or low stock:")
    alerts = df[df['Stock'] <= 5].sort_values('Stock').head(10)
    for i, row in alerts.iterrows():
        print(f" - {row['Product Name']} ({row['Category']}): Stock {row['Stock']} {row['Unit']}")

    # Cross-check logic: Compare with real_products.json to see if any are procedurally generated (should be 0 now)
    real_products_path = 'd:/AI Store Manger/data/real_products.json'
    if os.path.exists(real_products_path):
        with open(real_products_path, 'r', encoding='utf-8') as f:
            real_data = json.load(f)
            real_names = {p['name'] for p in real_data}
            
        csv_names = set(df['Product Name'])
        confirmed_real = csv_names.intersection(real_names)
        anomalies = csv_names - real_names
        
        print(f"\nData Authenticity Check:")
        print(f" - Real-world items confirmed: {len(confirmed_real)}")
        print(f" - Mystery items (anomalies): {len(anomalies)}")
        if len(anomalies) > 0:
            print(f"   Example anomaly: {list(anomalies)[0]}")

if __name__ == "__main__":
    analyze_inventory('d:/AI Store Manger/inventory_demo-store_2026-01-28.csv')
