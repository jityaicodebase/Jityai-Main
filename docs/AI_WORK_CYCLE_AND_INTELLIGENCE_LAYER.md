# AI Work Cycle & Intelligence Layer Documentation

**VERSION:** 1.0.0  
**DATE:** 2026-01-31  
**PREPARED BY:** Principal AI Architect Office  
**CLASSIFICATION:** Enterprise / Technical Confidential

---

## TABLE OF CONTENTS

1.  [System Overview](#1-system-overview)
2.  [User Onboarding & Assisted Setup AI](#2-user-onboarding--assisted-setup-ai)
3.  [Data Ingestion & Preparation Layer](#3-data-ingestion--preparation-layer)
4.  [Core AI Intelligence Layer](#4-core-ai-intelligence-layer)
5.  [Mathematical Models & Calculations](#5-mathematical-models--calculations)
6.  [Prompt Engineering & Agent Prompts](#6-prompt-engineering--agent-prompts)
7.  [Main Execution Agent](#7-main-execution-agent)
8.  [Memory, Learning & Feedback Loop](#8-memory-learning--feedback-loop)
9.  [Explainability & Trust Layer](#9-explainability--trust-layer)
10. [Security, Governance & Fail-Safes](#10-security-governance--fail-safes)
11. [End-to-End Flow Summary](#11-end-to-end-flow-summary)

---

## 1. SYSTEM OVERVIEW

### 1.1 High-Level Functionality
The AI Store Manager Intelligence Platform acts as an autonomous central nervous system for retail operations. Unlike traditional ERPs that essentially function as "passive ledgers" requiring manual analysis, this system is an **Active Intelligence Engine**. It continuously monitors, analyzes, predicts, and executes operational decisions across inventory, sales, and procurement.

### 1.2 Core Problems Solved
1.  **Reactive vs. Proactive**: Shifting from fixing stockouts after they happen to predicting them before they occur.
2.  **Data Fragmentation**: Unifying isolated data silos (sales, inventory log, supplier constraints) into a single decision manifold.
3.  **Human Cognitive Load**: Offloading complex multi-variable optimization problems (e.g., "what to buy considering lead time, current sales velocity, and shelf life") from store owners to AI agents.

### 1.3 Why AI Agents vs. Rules?
Rule-based systems (e.g., `IF stock < 5 THEN reorder`) fail in dynamic environments. They cannot account for seasonality, changing consumer trends, or probabilistic supplier delays. 

Our **Agentic Architecture** uses probabilistic reasoning:
*   **Rules**: "Reorder at 5."
*   **Agents**: "Sales velocity is continuously increasing by 15% WoW, and a holiday is approaching; despite stock being 10, reorder now to avoid future stockout."

### 1.4 Intelligence Flow
The system operates on a continuous loop:

`Human Goals → Data Ingestion → Intelligence (Reasoning/Planning) → Action (Execution) → Feedback → Learning`

---

## 2. USER ONBOARDING & ASSISTED SETUP AI

The onboarding layer is the "first impression" intelligence that converts abstract business intent into structured system configurations.

### 2.1 User Input Collection
The system uses a conversational interface to ingest:
*   **Business Topology**: Store type, square footage, customer demographics.
*   **Risk Profile**: Aggressive (prevent stockouts at cost of overstock) vs. Conservative (minimize capital tied up).
*   **Operational Constraints**: Delivery windows, budget caps, supplier lead times.

### 2.2 Assisted Setup Agent
The **Setup Agent** is a specialized LLM instance designed to validate and normalize unstructured inputs.

#### Adaptive Questioning
If a user inputs ambiguous data (e.g., "We sell quickly"), the agent is triggered to quantify: "Can you estimate the daily unit velocity for your top SKUs? Is it closer to 10 or 100?"

#### Confidence Scoring & Validation
Every user input is assigned a confidence score before being committed to the database.

**Formula: Input Confidence Score**
$$
\text{Input\_Confidence} = \sum_{i=1}^{n} (w_i \times C_i)
$$
Where:
*   $w_i$: Weight of the field (e.g., Supplier Lead Time has higher weight than Store Description).
*   $C_i$: Confidence of the specific input (derived from regex validation and anomaly detection).

**Normalization Workflow:**
1.  **Raw Input**: "About 3 weeks"
2.  **NLP Parser**: Extracts entity `duration: 7 days`
3.  **Normalization**: Converts to integer `protection_window = 7`
4.  **Confirmation**: Agent reflects back "Set protection window to 7 days?"

---

## 3. DATA INGESTION & PREPARATION LAYER

Data is the fuel for the Intelligence Layer. This layer ensures data is clean, structured, and feature-rich.

### 3.1 Pipeline Architecture
The pipeline supports both **Batch** (daily inventory dumps) and **Real-Time** (POS sales transactions) ingestion.

### 3.2 Schema Detection & Normalization
Incoming CSV/JSON files are scanned for column headers. Fuzzy matching maps `Qty`, `Quantity`, `Stock_Count` to the unified internal schema `inventory_level`.

### 3.3 Feature Engineering Logic
Raw data is transformed into distinct features for the model.

*   **Missing Data Handling**:
    If $X_t$ is missing, we use:
    $$
    X_t = \alpha X_{t-1} + (1-\alpha)\bar{X}_{local}
    $$
    *(Exponential smoothing or local category average)*

*   **Outlier Detection**:
    Data points falling outside $ \mu \pm 3\sigma $ are flagged for review or capped effectively.

*   **Data Freshness Score**:
    Used to discount older data in decision making.
    $$
    S_{freshness} = e^{-\lambda \times \Delta t}
    $$
    Where $\lambda$ is the decay constant and $\Delta t$ is time since last update.

---

## 4. CORE AI INTELLIGENCE LAYER

This is the cognitive engine of the platform.

### 4.1 Intelligence Architecture
The architecture follows a hierarchical **Planner-Executor-Reviewer** model.

1.  **Planner Agent**: Decomposes high-level goals (e.g., "Optimize for Profit") into sub-tasks (e.g., "Analyze Deadstock," "Forecast Weekend Sales").
2.  **Reasoning Agent**: Performs deep analysis using Chain-of-Thought (CoT) prompting to understand *why* a metric is changing.
3.  **Domain-Specific Sub-Agents**:
    *   *Inventory Agent*: Focuses on stock levels and replenishment.
    *   *Sales Agent*: Focuses on trends and revenue maximization.
    *   *Supplier Agent*: Evaluates vendor performance.
4.  **Memory Layer (Planned)**: *Future capability*. A vector database conceptualized to store semantic embeddings of past events (e.g., "Supplier X delivered late last Christmas").
    *   *Current State*: Historical reasoning is fully active but implemented via structured SQL queries (Postgres) on past sales, previous recommendations (`inventory_recommendations` table), and audit logs (`mapping_audit_trail`).
    *   *Future State*: Vector embeddings will allow for fuzzy semantic search across unstructured notes and qualitative feedback.

### 4.2 Decision Frameworks

#### Probabilistic Reasoning
Decisions are rarely binary. The system calculates the Expected Value (EV) of an action.

**Formula: Expected Impact**
$$
E(\text{Impact}) = P(\text{Outcome}) \times M(\text{Magnitude}) \times C(\text{Confidence})
$$

#### Forecasting-Based Decision Making
The system does not just look at *current* stock. It projects *future* stock.

`If (Current_Stock / Weighted_ADS) < Protection_Window THEN Trigger_Reorder`

---

## 5. MATHEMATICAL MODELS & CALCULATIONS

### 5.1 Forecasting Models
We utilize a hybrid approach combining ARIMA-like statistical methods for stable products and Transformer-based prediction for volatile trends.

### 5.2 Priority Ranking
When multiple SKUs need attention, the system ranks them to optimize capital allocation.

**Formula: Action Priority Score**
$$
\text{Priority} = (W_d \times \Delta \text{Demand}) + (W_r \times \text{StockOut\_Risk}) + (W_p \times \text{Profit\_Margin})
$$
Where:
*   $\Delta \text{Demand}$: Velocity of sales change.
*   $\text{StockOut\_Risk}$: Probability of hitting zero stock within lead time.
*   $W$: Configurable weights based on user strategy.

### 5.3 Optimization Functions
The "Economic Order Quantity" (EOQ) is dynamically adjusted by AI considerations (e.g., bulk discounts vs. storage cost).

$$
Q_{opt} = \sqrt{\frac{2DS}{H}} \times \text{AI\_Adjustment\_Factor}
$$
Where $D$=Demand, $S$=Ordering Cost, $H$=Holding Cost.

---

## 6. PROMPT ENGINEERING & AGENT PROMPTS

Our prompts are treated as versioned code artifacts.

### 6.1 Prompt Architecture
*   **System Prompt**: Defines the persona ("You are an expert Retail Analyst...").
*   **Context Injection**: Dynamic insertion of relevant data (RAG - Retrieval Augmented Generation).
*   **Task Instruction**: Specific goal for the current execution steps.
*   **Output Schema**: Enforcing JSON output for deterministic system parsing.

### 6.2 Example: Analysis Agent Prompt
```text
ROLE: Inventory Analysis Specialist
OBJECTIVE: Identify products requiring immediate restocking.

CONTEXT:
- You have access to sales velocity (weighted 7/14/30 days).
- Current stock levels are provided.
- System Protection Window (PW) is set to 7 days.

TASK:
1. Calculate the 'Days of Inventory Remaining' for each SKU.
2. Flag any SKU where Days Remaining < Lead Time + 2 days safety buffer.
3. RANK the flags by potential revenue loss.

OUTPUT FORMAT:
JSON List [{ "sku": "ID", "reason": "Text", "priority": "High/Med/Low" }]
```

### 6.3 Prompt Chaining
The output of the Analysis Agent (valid JSON) is fed directly as the *Context* for the **Recommendation Agent**, which then formulates the buy order.

---

## 7. MAIN EXECUTION AGENT

The **Main Agent** acts as the conductor of the orchestra. It does not perform low-level analysis; it synthesizes.

### 7.1 Conflict Resolution
*   *Inventory Agent* says: "Buy 1000 units (Bulk discount)."
*   *Finance Agent* says: "Budget limited to 500 units."
*   **Main Agent Decision**: "Buy 500 units now to maintain cash flow, schedule remaining 500 for next month."

### 7.2 Arbitration Logic
If agents disagree, the Main Agent uses a **Weighted Vote Logic**:
$$
\text{Decision} = \text{argmax} \sum (\text{Agent\_Vote}_i \times \text{Agent\_Authority}_i)
$$

### 7.3 Explainable Outputs
The Main Agent is responsible for translating the mathematical decision back into natural language for the user dashboard.

---

## 8. MEMORY, LEARNING & FEEDBACK LOOP

The system gets smarter over time.

### 8.1 Memory Types
*   **Short-Term**: Context of the current session/task.
*   **Long-Term**: Historical trends, yearly seasonality.
*   **Episodic**: Specific events (e.g., "Supplier X delivered late last Christmas").

### 8.2 Feedback Ingestion
When a user accepts or rejects a recommendation, this signal updates the weights of the decision model.

**Formula: Weight Update (Gradient Descent-like)**
$$
W_{new} = W_{old} + \eta \times (S_{feedback} \times (T_{target} - P_{prediction}))
$$
Where $\eta$ is the learning rate.

---

## 9. EXPLAINABILITY & TRUST LAYER

### 9.1 Confidence Communication
The system never says "Do X". It says: "We recommend X (85% Confidence) because..."

### 9.2 Reasoning Chains
Users can drill down:
1.  **Recommendation**: Reorder Milk.
2.  **Why?**: Projected stockout in 2 days.
3.  **Why?**: Sales spiked 20% yesterday.
4.  **Why?**: Local holiday identified in calendar logic.

---

## 10. SECURITY, GOVERNANCE & FAIL-SAFES

### 10.1 Data Isolation
Tenant data is logically isolated. Vector stores use namespacing to ensure User A's inventory data never influences User B's recommendations.

### 10.2 Hallucination Detection
Outputs are cross-checked against "Physical Reality Constraints":
*   If AI recommends ordering -5 units -> **REJECT** (Hard Rule).
*   If AI predicts 1,000,000% growth -> **FLAG** (Anomaly Detection).

### 10.3 Fallback Logic
If the AI service is unreachable or returns malformed data, the system falls back to standard **Max/Min Inventory Logic** to ensuring business continuity.

---

## 11. END-TO-END FLOW SUMMARY

1.  **Onboarding**: User creates account; AI helps map data features.
2.  **Ingestion**: System pulls latest Sales & Inventory CSVs.
3.  **Preparation**: Data is cleaned, outliers removed, matrices formed.
4.  **Intelligence**:
    *   Planner identifies "Weekly Restock" goal.
    *   Sub-agents calculate forecasts and risks.
    *   Main Agent arbitrates conflicts (Budget vs. Need).
5.  **Action**: System generates specific Purchase Orders.
6.  **Human Review**: User approves POs.
7.  **Learning**: System records the approval as a positive reinforcement signal.

---
*End of Documentation*
