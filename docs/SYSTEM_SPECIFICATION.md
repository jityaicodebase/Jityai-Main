1.  **Ingestion (Batch)**: The user uploads a CSV/Excel file (Onboarding or Daily Sync) via the Express API.
2.  **Processing (Deterministic)**: The `MasterOrchestrator` routes the file to the `ExcelParser`. Data is then sent to the `OnboardingOrchestrator` or `IncrementalSyncAgent`.
3.  **Normalization**: The `Normalizer` and `BrandExtractor` sanitize product names/brands. The `CatalogMapper` assigns items to the Master Catalog using fuzzy matching.
4.  **Persistence**: Sanitized data is written to `store_sku_registry` and `onboarding_handoff`.
5.  **Event Dispatch**: Successful ingestion triggers a `STOCK_UPDATED` event.
6.  **AI Analysis (Hybrid)**:
    *   **Phase A (Deterministic)**: `InventoryAIAgent` calculates Average Daily Sales (ADS), Reorder Point (ROP), Safety Stock, and Financial Severity for 100% of SKUs.
    *   **Phase B (Probabilistic)**: High-impact SKUs (Top 50 by financial severity) are sent to the Gemini LLM for strategic reasoning.
7.  **Outputs**: Analysis results are persisted in `inventory_recommendations` and served via REST API to the Web UI.

### Operational Characteristics:
*   **Real-time components**: Inventory manual updates, barcode scanning lookups (`/api/inventory/barcode/:barcode`).
*   **Batch components**: File uploads (Sales/Inventory), Daily Closing Analysis.
*   **Event-driven**: AI analysis runs are triggered by data sync completions.
*   **Refill Detection**: The system detects refills by comparing `current_stock` against the `initial_stock_at_feedback` recorded when a recommendation was accepted. A stock increase triggers a "Protected" status.
*   **Deterministic logic**: Safety stock formulas, ADS weighting, stockout day counts.
*   **Probabilistic logic**: LLM-generated business advice and action classifications (e.g., GROWTH vs DEADSTOCK).

---

## 2. Tech Stack & Infra
*   **Backend**: Node.js v24+ with Express.js.
*   **Database**: PostgreSQL 15+ (Relational).
*   **Message Bus**: Node.js internal `EventEmitter` (Synchronous/Asynchronous hybrid).
*   **Ingestion**: `Multer` for file handling; `xlsx` / `csv-parse` for data extraction.
*   **LLM Interface**: Google Gemini API (via `@google/generative-ai` or REST).
*   **Barcode Integration**: API endpoint `/api/inventory/barcode/:barcode` returns SKU metadata for instant UI editing.
*   **Deployment**: Local development environment (Windows/Linux).

---

## 3. Database Schema (Core Tables)

### A. `store_sku_registry`
**Purpose**: Master list of all products unique to a store.
**Primary Key**: `store_item_id` (VARCHAR)
**Foreign Keys**: `store_id` (linked to store metadata)

| Column Name | Data Type | Description |
| :--- | :--- | :--- |
| `store_item_id` | VARCHAR | Unique identifier (SKU/Local ID) |
| `store_id` | VARCHAR | Unique store identifier |
| `barcode` | VARCHAR | EAN/UPC for scanning (Indexed) |
| `original_product_name` | TEXT | Raw name from POS |
| `normalized_product_name`| TEXT | Cleaned name (lowercase/standardized) |
| `master_category_name`| VARCHAR | Categorization from Master Catalog |
| `brand_name` | VARCHAR | Identified brand |
| `status` | VARCHAR | 'active' or 'discontinued' |
| `created_at` | TIMESTAMP | System entry time |

### B. `onboarding_handoff`
**Purpose**: Time-series log of every stock/price snapshot received.
**Primary Key**: `handoff_id` (UUID)
**Foreign Keys**: `store_item_id`, `store_id`

| Column Name | Data Type | Description |
| :--- | :--- | :--- |
| `store_item_id` | VARCHAR | Link to registry |
| `quantity_on_hand` | NUMERIC | Current physical stock units |
| `cost_price` | NUMERIC | Purchase price per unit |
| `selling_price` | NUMERIC | Retail price per unit |
| `as_of_date` | DATE | Date the data represents |
| `as_of_timestamp` | TIMESTAMP | Specific time of capture |

### C. `sales_transactions`
**Purpose**: Aggregated/Transaction-level sales record.
**Primary Key**: `transaction_id` (UUID)

| Column Name | Data Type | Description |
| :--- | :--- | :--- |
| `store_item_id` | VARCHAR | Product sold |
| `quantity_sold` | NUMERIC | Units sold |
| `unit_price` | NUMERIC | Price at time of sale |
| `transaction_date` | TIMESTAMP | Time of transaction |

### D. `inventory_recommendations`
**Purpose**: Stores AI-generated insights and tracking status.
**Primary Key**: `recommendation_id` (SERIAL)

| Column Name | Data Type | Description |
| :--- | :--- | :--- |
| `store_item_id` | VARCHAR | Subject product |
| `recommendation_type` | VARCHAR | Action: BUY_MORE, BUY_LESS, MONITOR |
| `risk_state` | VARCHAR | CRITICAL, RISK, WATCH, SAFE |
| `weighted_ads` | NUMERIC | 30-day weighted average daily sales (v3.0) |
| `days_of_cover` | NUMERIC | Current Stock / Weighted ADS |
| `reasoning_text` | TEXT | Bullet points for UI |
| `feedback_status` | VARCHAR | PENDING, ACCEPTED, IGNORED |
| `realized_outcome` | VARCHAR | Opportunity Saved, Opportunity Lost, Correct Disregard |
| `insight_category` | VARCHAR | DEADSTOCK, OVERSTOCK, STOCKOUT_RISK, GROWTH |
| `financial_impact_cash`| NUMERIC | Cash made or lost based on feedback |

---

## 4. Onboarding Data Contract
Onboarding occurs via a single multi-column historical snapshot file (Excel/CSV).

### Process:
1.  System checks if `store_id` exists; creates it if new.
2.  Rows are parsed and items added to `store_sku_registry`.
3.  Initial stock levels are recorded in `onboarding_handoff`.

### Sample Onboarding CSV:
```csv
Item Name,SKU,Category,Current Stock,Cost Price,Selling Price,Unit,Barcode
"Maggi Instant Noodles 70g",SKU001,"Noodles",50,12.50,15.00,PKT,8901058000123
"Amul Gold Milk 500ml",SKU002,"Dairy",20,30.00,32.00,PKT,8901262010014
```

### Constraint Rules:
*   **Mandatory**: `Item Name`, `SKU`, `Current Stock`, `Selling Price`.
*   **Optional**: `Category`, `Cost Price`, `Unit`, `Barcode`.
*   **Update Logic**: If a SKU already exists for a store, the system updates the Registry meta and creates a new Handoff record.

---

## 5. Sales Data Ingestion
Sales are ingested as transaction-level logs to support trend analysis.

### Characteristics:
*   **Granularity**: Individual line items per transaction.
*   **Timezone**: UTC stored; application converts to `Asia/Kolkata` for UI.
*   **ADS Calculation**: Uses a weighted formula (0.5 * 7-day + 0.3 * 14-day + 0.2 * 30-day).

### Sample Sales Sync CSV:
```csv
Date,Item Name,SKU,Quantity,Price
2026-01-28 14:20:01,"Maggi Instant Noodles 70g",SKU001,2,30.00
2026-01-28 15:10:00,"Amul Gold Milk 500ml",SKU002,1,32.00
```

---

## 6. Inventory Data Handling
Inventory is handled as a **Hybrid Snapshot/Event** system.

### Logic:
*   **Sync Method**: Snapshot-driven. Every daily sync replaces the "Latest Stock" view.
*   **Derived Stock**: System decrements stock internally if a sale is recorded *between* syncs, but the next File Upload acts as the Source of Truth (Overwrites derived stock).
*   **Adjustment Events**: Triggered via the `Manual Adjustment` API. Each adjustment creates a correction entry in `onboarding_handoff` with a specific `reason` (e.g., Damage, Theft).
*   **Reorder Ownership**:
    *   **Logic**: System determines ROP ($ADS \times PW + SafetyStock$).
    *   **Strategy**: Agent suggests `BUY_MORE` based on the Protection Window (PW).

---

## 7. Cashflow & Payments (Current State)
*   **Payments**: Not currently tracked at transaction level.
*   **Settlements**: Not implemented.
*   **Financial Impact Tracking**: System calculates `potential_lost_revenue` based on `Weighted ADS * Selling Price` during stockout periods. It tracks `cash_blocked` as `Current Stock * Cost Price` for items with >60 days of cover.

---

## 8. Agent Architecture

### A. `InventoryAIAgent`
*   **In**: Stock levels, sales history, classification (A/B/C), lead times.
*   **Out**: Action (BUY_MORE, etc.), Reason (Bullet points), Priority (HIGH/MED/LOW).
*   **Storage**: `inventory_recommendations` table.

### B. `MasterOrchestrator`
*   **In**: Raw file streams, manual adjustments.
*   **Out**: Event emissions, database writes.
*   **Storage**: Logs to `inventory_ai_runs`.

### C. `OnboardingOrchestrator`
*   **In**: Raw CSV item lists.
*   **Out**: Normalized registry entries.

---

## 9. Processing Logic
*   **EOD Analysis**: The `runDailyClosingAnalysis` function retrieves all `active` SKUs and emits a refresh event.
*   **Selective Reasoning**: To manage costs, the system sorts SKUs by Financial Severity. Only the top 50 items trigger the Gemini LLM. All others use a template-based reasoning engine.

---

## 10. Constraints & Known Limitations
*   **Manual Trigger**: AI analysis doesn't run on a CRON; it requires a user to upload a file or click "Daily Close".
*   **Lead Time Assumption**: Currently uses a default or estimated lead time (e.g., 7 days) if not provided.
*   **Data Integrity**: Relies on SKUs being consistent across file uploads. If a SKU changes, a new product is created in the Registry.
*   **Simulator Shortcut**: The current simulator uses BigBasket category data to seed names but generates random sales trends.

---

## 11. FINAL SUMMARY

### What data a simulator MUST generate:
1.  **Consistent SKU IDs**: Must persist across multiple "days" of data.
2.  **Daily Sales Volatility**: Items must have varying sales per day to test Safety Stock logic.
3.  **Stockout Events**: Stock should occasionally hit zero to trigger "CRITICAL" alerts and "Opportunity Lost" tracking.
4.  **Refill Events**: Stock must increase (representing a fulfilled PO) to test "Opportunity Saved" tracking.

### What data is optional but useful:
1.  **Cost Price Changes**: To test margin impact analysis.
2.  **Category Diversity**: A mix of High-Velocity (Milk/Bread) vs Low-Velocity (Kitchen tools).

### What data MUST NOT be generated:
1.  **Negative Stock**: System assumes 0 is minimum.
2.  **Duplicate SKUs in same upload**: Each sync file must have unique SKU rows.


