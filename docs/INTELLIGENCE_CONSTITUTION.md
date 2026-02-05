# JityAI Intelligence Constitution
**Status: Mandatory Reading for All Engineers**
**Revision: 1.0 (The Reality Correction Model)**

---

## I. The Prime Directive
JityAI is not a "smart" chatbot; it is a **Deterministic Decision Engine** with an **Advisory Reasoning Layer**. 

We do not trust "AI intuition." We trust **Mathematical Truth** and **Verified Reality**. Our goal is to augment the retail owner’s decision-making by surfacing evidence, not by automating oversight.

---

## II. The Four Layers of Intelligence
Every piece of logic you write must reside in one of these strictly separated layers:

### Layer 1: Deterministic Truth (The Floor)
*   **Source**: Raw Inventory & Sales Database.
*   **Logic**: ADS (Average Daily Sales), ROP (Reorder Point), Safety Stock.
*   **Integrity**: This layer is **UNTOUCHABLE**. No AI, no regional signal, and no historical bias can ever change a Layer 1 quantity.
*   **Rule**: If the math says "Order 50," the system suggests 50. Period.

### Layer 2: The Outcome Ledger (The Memory)
*   **Source**: Factual Records of Past Decisions.
*   **Logic**: Reality vs. Expectation. Did a reorder result in a refill? Did a skip result in a stockout?
*   **Integrity**: Outcomes are only recorded after high-confidence verification (The 7-Day Rule). We do not guess. We observe.
*   **Rule**: Learning is externalized to the database, never internal to the LLM model.

### Layer 3: Reasoning Tier (The Voice)
*   **Source**: Stateless Synthesis of Layer 1 & Layer 2.
*   **Logic**: History-Aware Explanation.
*   **Integrity**: The AI is an **Advisory Consultant**. It uses the Outcome Ledger to explain *why* a Layer 1 calculation is urgent (e.g., "Skipping this previously cost you ₹5,000").
*   **Rule**: The AI can adjust **Priority** and **Tone**, but it cannot adjust **Quantity**.

### Layer 4: Network Radar (The Pulse)
*   **Source**: Anonymized Regional Aggregates.
*   **Logic**: Advisory Overlays.
*   **Integrity**: Regional trends (e.g., "Soft drink demand up 12% in Bangalore") are advisory only.
*   **Rule**: Radar signals can only **increase urgency**, never decrease it. Local store truth always overrides the network.

---

## III. Core Doctrine (Non-Negotiable)

1.  **Zero AI Memory**: The system is stateless. The LLM must "forget" everything after every call. The Database is the only allowed source of continuity.
2.  **No Anthropomorphism**: Never use "I," "feel," or "believe" in system communications. Use factual phrasing: "Historical records indicate," "Math-based calculation shows."
3.  **The Evidence Requirement**: Intelligence that is not visible in the UI as a factual citation is incomplete. Users must be able to audit every suggestion.
4.  **Conservative Wisdom**: It is better for the system to say "Unresolved" or "Math-Only" than to provide a speculative or forced outcome.

---

## IV. Engineering Guardrails (The "Never List")

*   **NEVER** allow an LLM output to feed back into Layer 1 math.
*   **NEVER** use AI to "optimize" reorder quantities based on owner preferences.
*   **NEVER** remove the "Determined by System Math" label from reorder quantities.
*   **NEVER** exceed the 7-day hard stop for outcome evaluation. If reality isn't clear by Day 7, it's Unresolved.
*   **NEVER** activate Phase 4 (Radar) implicitly. It must reside behind a manual, key-locked database switch.

---

---
## VI. Frozen Immutable Architecture (The Anchors)
As of Revision 2.0, the following system pillars are PERMANENTLY FROZEN. No engineer or agent may modify these logic gates.

1.  **Action Bucket Thresholds (Category A, B, C)**: The specific math boundaries (PW vs DOI) that classify SKUs into BUY_MORE, BUY_LESS, or MONITOR are locked at architectural level.
2.  **Significant Change Triggers**: The 5-point objective gateway (Bucket change, DOI boundary, Buffer breach, PW shift, Qty drift) for triggering Layer 3 reasoning is locked.
3.  **Visibility & Persistence Rules**: 
    - `OBSOLETE` items = Archive-Only. 
    - `MONITOR` items = Compute-Only (Never saved).
    - `PENDING/ACCEPTED/UPDATED` = Insight-Only.
4.  **Daily Close Execution Model**: Intelligence is temporally locked to the `DAILY_CLOSE` event. Sub-daily triggers are prohibited.
5.  **Reasoning Eligibility Rules**: The strictly stateless, non-authoritative consultant role of the LLM in explaining Layer 1/2 data is final.

**Modification Rule:** Future improvements must be restricted to **changing math parameters** (e.g., Z-Score values) or **UI presentation layers**. The logic gates themselves are immutable.

---
*Signed,*
**The JityAI Architecture Board**
**Revision: 2.0 (The Immutable Anchor)**
