# 🔒 JityAI Math Contract (Frozen v1.0)
**Status:** FROZEN
**Freeze Date:** 2026-02-06
**Authority:** Principal Systems Auditor

This document defines the **immutable core logic** for the JityAI Inventory Engine. These formulas are the "Constitution" of the system. They must NOT be changed without a formal version increment (v2.0) and full regression audit.

---

## 1. Average Daily Sales (ADS) - "The Compass"
The system uses a **weighted moving average** to determine daily velocity.

### Formula
$$ ADS_{weighted} = (0.5 \times ADS_{7}) + (0.3 \times ADS_{14}) + (0.2 \times ADS_{30}) $$

### Constraints
*   **Renormalization:** If historical data is < 15 days (missing ADS30), weights re-distribute to ADS7/ADS14.
*   **Cold Start:** If history < 7 days, fallback to `ADS7` strictly.
*   **Rounding:** All intermediate calculations keep full float precision. Final outputs round to 3 decimal places.

---

## 2. Protection Window (PW) - "The Shield"
The variable time window the AI tries to "protect" against stockouts, based on demand volatility.

### Formula
Derived from Coefficient of Variation ($CV = \sigma / ADS$):

| Volatility (CV) | Risk Profile | Protection Window (PW) |
| :--- | :--- | :--- |
| **0.00 - 0.30** | Stable | **3 Days** |
| **0.31 - 0.70** | Moderate | **5 Days** |
| **> 0.70** | Volatile | **7 Days** |

*Note: This creates a "Step Function" behavior to prevent jitter.*

---

## 3. Safety Stock (SS) - "The Floor"
The absolute minimum inventory allowed effectively before triggering `BUY_MORE`.

### Formula
$$ SS = \max( Z \times \sigma, \quad ADS \times PW, \quad 0.5 \times ADS ) $$

### Parameters
*   **Z (Service Level):**
    *   High Impact Items ($ADS > 10$): **1.65** (95%)
    *   Low Impact Items ($ADS < 1$): **0.84** (80%)
    *   Normal: **1.28** (90%)
*   **Floor Rule:** Safety Stock never drops below **0.5 days** of sales.

---

## 4. Action Buckets - "The Decision"
Deterministic strict boundaries for AI recommendation types.

| Condition | Action Bucket |
| :--- | :--- |
| $Stock \le SS$ OR $DaysOfCover < PW$ | **BUY_MORE** |
| $DaysOfCover > (3 \times PW)$ | **BUY_LESS** |
| All else | **MONITOR** |

*Note: BUY_LESS requires HIGH confidence. If confidence is LOW, it defaults to MONITOR.*

---

## 5. Order Quantity
*   **BUY_MORE:** `Target_Stock - Current_Stock`, rounded up to nearest `Case_Size`.
*   **BUY_LESS:** Always `0` (Liquidation mode).

---

**⛔ DO NOT MODIFY THIS LOGIC SILENTLY. MATH IS LAW.**
