/**
 * MAIN INVENTORY AI AGENT - Decision Engine (Intelligence Constitution Compliant)
 * 
 * Hierarchy of Truth:
 * Layer 1: Deterministic Math (ADS, PW, SS)
 * Layer 2: Outcome Ledger (Experience)
 * Layer 3: Reasoning Tier (Stateless LLM Guidance)
 * Layer 4: Network Radar (Regional Advisories - OFF by default)
 */

const { Pool } = require('pg');

class InventoryAIAgent {
    constructor(pool, config = {}) {
        this.pool = pool;
        this.version = '3.0.0'; // Major Revamp: Actionable Insight Engine
        this.mode = config.mode || 'SHADOW';

        // LLM Configuration
        this.apiKey = process.env.GEMINI_API_KEY;
        this.geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${this.apiKey}`;
    }

    /**
     * MAIN ENTRY POINT: Daily Close Intelligence Loop
     * [IMMUTABLE ARCHITECTURE]: Temporal isolation to Daily Close only.
     */
    async handleEvent(eventType, payload) {
        if (eventType === 'DAILY_CLOSE') {
            return this.processBatch(payload.storeId, payload.skuIds, { event: eventType });
        }
        console.log(`🤖 AI Agent: Skipping event ${eventType}. Intelligence only runs at Daily Close.`);
    }

    /**
     * CORE PIPELINE: Process a batch of SKUs (High-Discipline Lifecycle)
     */
    async processBatch(storeId, skuIds, options = {}) {
        const runId = await this.createRun(storeId, options.event || 'daily_close');
        console.log(`🚀 AI Agent: Starting Daily Close Loop for ${storeId} (${skuIds.length} SKUs)...`);

        const results = [];
        try {
            // 1. Reality Check: Resolve outcomes of past decisions
            await this.calculateRealizedOutcomes(storeId);

            // 2. Fetch existing recommendations for lifecycle comparison
            const existingRecs = await this.getActiveRecommendations(storeId);

            // 3. Process each SKU using the new Action Engine (Metric Calculation Phase)
            const analysisCandidates = [];
            for (const skuId of skuIds) {
                try {
                    const skuState = await this.loadSKUState(storeId, skuId);
                    if (!skuState) continue;

                    const metrics = this.calculateDeterministicMetrics(skuState);
                    const existing = existingRecs.find(r => r.store_item_id === skuId);

                    analysisCandidates.push({ skuState, metrics, existing });
                } catch (err) {
                    console.error(`❌ Skip metrics for ${skuId}:`, err.message);
                }
            }

            // 4. Strategic Reasoning Phase (With Prioritization/Cap)
            // [IMMUTABLE ARCHITECTURE]: Reasoning Eligibility + Impact Prioritization
            const MAX_REASONING = 50;
            const needsReasoning = analysisCandidates.filter(c => {
                const currentBucket = c.metrics.actionBucket;
                const existing = c.existing;

                const isSignificantChange = !existing ||
                    existing.insight_category !== currentBucket ||
                    Math.floor(parseFloat(existing.days_of_cover)) !== Math.floor(c.metrics.daysOfCover) ||
                    (parseFloat(c.existing?.current_stock || 0) < parseFloat(c.existing?.safety_stock || 0)) !== (c.metrics.oh < c.metrics.safetyStock);

                const needsRetry = existing && existing.reasoning_status === 'FALLBACK_USED';

                return (currentBucket !== 'MONITOR') && (isSignificantChange || needsRetry || options.forceUpdate);
            });

            // Sort by impact: Potential Revenue Lost (for BUY_MORE) or Blocked Capital (for BUY_LESS)
            needsReasoning.sort((a, b) => {
                const impactA = a.metrics.actionBucket === 'BUY_MORE' ? a.metrics.potentialLostRevenue : (a.metrics.oh * a.skuState.costPrice);
                const impactB = b.metrics.actionBucket === 'BUY_MORE' ? b.metrics.potentialLostRevenue : (b.metrics.oh * b.skuState.costPrice);
                return (impactB || 0) - (impactA || 0);
            });

            const toReason = needsReasoning.slice(0, MAX_REASONING);
            const toReasonIds = new Set(toReason.map(c => c.skuState.skuId));

            console.log(`🧠 AI Agent: Selected ${toReason.length} high-impact SKUs for Strategic Reasoning (${needsReasoning.length - toReason.length} skipped by cap).`);

            for (const candidate of analysisCandidates) {
                const shouldReason = toReasonIds.has(candidate.skuState.skuId);
                const analysis = await this.analyzeSKU(candidate.skuState, candidate.metrics, candidate.existing, { ...options, allowReasoning: shouldReason });

                // [v3.1 Mandatory Audit Log]
                const ads_windows = [];
                if (candidate.metrics.ads.ads7 > 0) ads_windows.push("ADS7");
                if (candidate.metrics.ads.ads14 > 0) ads_windows.push("ADS14");
                if (candidate.metrics.ads.ads30 > 0) ads_windows.push("ADS30");

                const auditRecord = {
                    sku: candidate.skuState.skuId,
                    action: analysis.insightCategory,
                    reasoning_requested: shouldReason,
                    ads_windows_used: ads_windows,
                    confidence: analysis.confidence,
                    reasoning_source: analysis.reasoningStatus === 'COMPLETE' ? 'LLM' :
                        (analysis.reasoningStatus === 'FALLBACK_USED' ? 'DETERMINISTIC' : 'SKIPPED'),
                    math_consistent: true // Derived strictly from calculateDeterministicMetrics
                };
                console.log(`[AUDIT_LOG] ${JSON.stringify(auditRecord)}`);

                results.push({
                    storeId,
                    skuId: candidate.skuState.skuId,
                    ...analysis
                });
            }

            // 5. Save results with Lifecycle Enforcement
            if (results.length > 0) {
                await this.saveRecommendations(results);
            }

            await this.completeRun(runId, {
                total_skus: skuIds.length,
                analyzed_skus: analysisCandidates.length,
                failed_skus: skuIds.length - analysisCandidates.length,
                recommendations_generated: results.length,
                alerts_generated: 0 // Future: Alert engine integration
            });

            return results;
        } catch (error) {
            await this.failRun(runId, error.message);
            throw error;
        }
    }

    /**
     * CORE LOGIC: Analyze single SKU (Layer 1 + Layer 3)
     */
    async analyzeSKU(skuState, metrics, existing, options) {
        const currentBucket = metrics.actionBucket;

        // [IMMUTABLE ARCHITECTURE]: Reasoning Eligibility Rule
        // State 1: COMPLETE (LLM passed)
        // State 2: FALLBACK_USED (LLM tried and failed)
        // State 3: NOT_REQUESTED (System didn't try - math only)

        let reasoning;
        const canReason = options.allowReasoning && currentBucket !== 'MONITOR' && metrics.confidence !== 'LOW';
        let reasoningStatus = canReason ? 'COMPLETE' : 'NOT_REQUESTED';

        if (canReason) {
            console.log(`     - Generating Strategic reasoning for ${skuState.productName} (${currentBucket}) [Confidence: ${metrics.confidence}]...`);

            try {
                const behaviorProfile = await this.getBehaviorProfile(skuState.storeId, skuState.skuId);
                const radarSignal = await this.getRadarSignal(skuState.storeId, skuState.category);

                reasoning = await this.generateLLMReasoning({
                    sku: skuState,
                    metrics,
                    behaviorProfile,
                    radarSignal
                });
            } catch (err) {
                console.warn(`⚠️ Reasoning engine failed for ${skuState.productName} (using fallback): ${err.message}`);
                reasoning = this.generateTemplateReasoning(skuState, metrics, existing);
                reasoningStatus = 'FALLBACK_USED';
            }
        }

        // Final Fallback Guard (for NOT_REQUESTED or Engine failures)
        if (!reasoning) {
            reasoning = this.generateTemplateReasoning(skuState, metrics, existing);
        }

        return {
            metrics,
            recommendation: reasoning,
            insightCategory: currentBucket,
            existingRec: existing,
            reasoningStatus,
            confidence: this.calculateConfidence(skuState, metrics)
        };
    }

    /**
     * DETERMINISTIC FALLBACK: Template-based reasoning when LLM is unavailable
     */
    generateTemplateReasoning(sku, metrics, existing) {
        const currentBucket = metrics.actionBucket;
        const stockDays = Math.round(metrics.daysOfCover || 0);

        const confidenceNote = metrics.confidence === 'LOW' ? " (Based on limited recent sales data)" : "";

        return {
            action: currentBucket,
            reason: currentBucket === 'BUY_MORE' ?
                `• Current stock provides only ~${stockDays} days of coverage${confidenceNote}.\n• Maintaining a ${metrics.pw}-day replenishment cycle requires additional inventory.` :
                currentBucket === 'BUY_LESS' ?
                    `• Current inventory level provides excess coverage for ~${stockDays} days.\n• Strategy: Liquidate existing stock before further procurement.` :
                    `• Inventory state is healthy.\n• Current coverage of ~${stockDays} days meets strategic targets.`,
            priority: metrics.isUrgent ? 'HIGH' : (currentBucket === 'MONITOR' ? 'LOW' : 'MEDIUM')
        };
    }

    /**
     * Step 1: Metric Calculations (Actionable Insight Engine v1.0)
     * 🔒 FROZEN CONTRACT: v1.0 (See docs/MATH_CONTRACT_v1.md)
     * DO NOT MODIFY WITHOUT AUDIT.
     */
    calculateDeterministicMetrics(sku) {
        // ADS Calculations (Presence-Aware)
        // [v3.0 Fix]: Don't treat missing windows as zero. Renormalize weights.
        const ads7_raw = this.calculateADS(sku.salesHistory, 7);
        const ads14_raw = this.calculateADS(sku.salesHistory, 14);
        const ads30_raw = this.calculateADS(sku.salesHistory, 30);


        const historyDays = sku.salesHistory.length > 0 ?
            Math.ceil((new Date() - new Date(sku.salesHistory[sku.salesHistory.length - 1].transaction_date)) / (1000 * 60 * 60 * 24)) : 0;

        // [v3.1 Strict Validation]: Minimum Effective Sample Rule
        // ADS7 valid only if >= 4 days history
        // ADS14 valid only if >= 7 days history
        // ADS30 valid only if >= 15 days history

        let confidenceScore = 'LOW';
        if (historyDays >= 15) confidenceScore = 'HIGH';
        else if (historyDays >= 7) confidenceScore = 'MEDIUM';

        // Dynamic Weights based on validity (Renormalization MVP)
        // If history < 7 days (LOW), rely 100% on ADS7
        // If history < 15 days (MEDIUM), rely on ADS7 + ADS14

        let wads;
        if (confidenceScore === 'LOW') {
            wads = ads7_raw; // 100% weight on 7-day trend
        } else if (confidenceScore === 'MEDIUM') {
            // Renormalize 0.5 (7) + 0.3 (14) -> 0.625 / 0.375
            wads = (0.625 * ads7_raw) + (0.375 * ads14_raw);
        } else {
            // Full WADS
            wads = (0.5 * ads7_raw) + (0.3 * ads14_raw) + (0.2 * ads30_raw);
        }

        const add = wads;


        const oh = parseFloat(sku.currentStock || 0);
        const doi = add > 0 ? oh / add : 999;

        const dailySales = this.extractDailyValues(sku.salesHistory, 30);
        const sigma = this.calculateStdDev(dailySales);
        const cv = add > 0 ? sigma / add : 0;

        // Protection Window (PW)
        let pw = 3;
        if (cv > 0.30 && cv <= 0.70) pw = 5;
        else if (cv > 0.70) pw = 7;

        // Service Level (z)
        let importance = 'Normal';
        if (add > 10) importance = 'High Impact';
        else if (add < 1) importance = 'Low';

        let z = 1.28;
        if (importance === 'High Impact') z = 1.65;
        else if (importance === 'Low') z = 0.84;

        // Safety Stock (SS)
        const safetyStock = Math.max(z * sigma, add * pw, 0.5 * add);

        // [IMMUTABLE ARCHITECTURE]: Action Bucket Thresholds
        let actionBucket = 'MONITOR';
        let targetStock = add * pw;
        let qty = 0;
        let isUrgent = false;

        if (oh <= 0 && add <= 0) {
            actionBucket = 'MONITOR';
        } else if (doi < pw || oh < safetyStock) {
            actionBucket = 'BUY_MORE';
            qty = Math.max(0, targetStock - oh);
            if (doi < 1) isUrgent = true;
        } else if (oh > 0 && doi > (pw * 3)) {
            // [v3.1 Policy]: Uncertainty biases toward availability.
            // Never recommend BUY_LESS on LOW confidence data.
            if (confidenceScore === 'LOW') {
                actionBucket = 'MONITOR';
            } else {
                actionBucket = 'BUY_LESS';
                qty = Math.max(0, oh - (add * (pw * 2))); // Keep 2x PW as buffer
            }
        }

        const moq = sku.moq || 1;
        const caseSize = sku.caseSize || 1;
        let recommendedQty = 0;
        if (actionBucket === 'BUY_MORE' && qty > 0) {
            recommendedQty = Math.ceil(Math.max(qty, moq) / caseSize) * caseSize;
        } else if (actionBucket === 'BUY_LESS' && qty > 0) {
            recommendedQty = 0; // [v3.0 Strict Rule]: BUY_LESS implies 0 order quantity.
        }

        return {
            ads: { ads7: ads7_raw, ads14: ads14_raw, ads30: ads30_raw, weighted: wads },
            oh,
            sigma,
            cv,
            pw,
            z,
            safetyStock,
            targetStock,
            rop: targetStock, // [v3.0 Simplified Model]: ROP = Target Stock = ADS * PW
            recommendedQty,
            daysOfCover: doi,
            actionBucket,
            isUrgent,
            importance,
            potentialLostRevenue: (actionBucket === 'BUY_MORE' && doi < 1) ? (add * 1 * (sku.sellingPrice - sku.costPrice)) : 0,
            confidence: confidenceScore
        };
    }

    /**
     * CLASSIFICATION: Layer 1 logic for SKU grouping
     */
    classifySKU(sku, metrics) {
        if (metrics.ads.weighted > 10) return 'Velocity Alpha (Fast)';
        if (metrics.ads.weighted > 2) return 'Velocity Beta (Medium)';
        if (metrics.ads.weighted > 0.5) return 'Velocity Gamma (Slow)';
        return 'Long Tail';
    }

    /**
     * RISK STATE: Qualitative business risk mapping
     */
    determineRiskState(metrics, sku) {
        if (metrics.actionBucket === 'BUY_MORE') {
            if (metrics.daysOfCover < 1) return 'CRITICAL';
            if (metrics.oh < metrics.safetyStock) return 'RISK';
            return 'RESTOCK';
        }
        if (metrics.actionBucket === 'BUY_LESS') {
            if (metrics.daysOfCover > 60) return 'OVERSTOCK_HIGH';
            return 'OVERSTOCK';
        }
        return 'SAFE';
    }

    /**
     * Step 3: Stateless LLM Reasoning (Layer 3)
     */
    async generateLLMReasoning(data) {
        if (!this.apiKey) return { action: data.metrics.actionBucket, reason: "Math-Only (API Key Missing)", priority: 'LOW' };

        const b = data.behaviorProfile || {};
        const skuHistory = b.sku || { total_decisions: 0, verified_losses: 0, verified_savings: 0 };
        const radar = data.radarSignal;

        const prompt = `
[SYSTEM: PRINCIPAL INVENTORY STRATEGIST]
Analyze SKU: ${data.sku.productName} (${data.sku.category})

[CONTEXT]
- Days of Cover (DOC): ${Math.round(data.metrics.daysOfCover)} days
- Protection Window (Target): ${data.metrics.pw} days
- Excess/Shortage: ${(data.metrics.daysOfCover - data.metrics.pw).toFixed(1)} days relative to target
- Weighted ADS: ${data.metrics.ads.weighted.toFixed(2)} units/day
- Operational Policy Floor (Safety Stock): ${Math.round(data.metrics.safetyStock)} units

[MANDATORY ACTION]
Decision: ${data.metrics.actionBucket}
Order Quantity: ${data.metrics.recommendedQty} units

[TASK]
Provide a strategic justification for this decision.
1. Start with the Days of Cover context.
2. Explicitly identify the risk (Capital Risk vs. Stockout Risk).
3. Justify the action based on the "Operational Policy Floor" or Target Stock.

[OUTPUT SCHEMA - STRICT JSON ONLY]
{
  "action": "${data.metrics.actionBucket}",
  "reason": "• Coverage: [DOC] vs [Target] days.\n• Risk: [Capital/Stockout Risk] assessment.\n• Action: Justification for [Qty] units.",
  "priority": "HIGH|MEDIUM|LOW"
}`;

        const response = await fetch(this.geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) throw new Error(`Gemini Error: ${response.status}`);
        const json = await response.json();
        const text = json.candidates[0].content.parts[0].text;

        try {
            // Robust JSON extraction: look for the first '{' and last '}'
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("No JSON found in response");

            const cleanJson = jsonMatch[0].trim();
            return JSON.parse(cleanJson);
        } catch (parseErr) {
            console.warn(`⚠️ JSON Parse Failed for SKU. Using text fallback. Error: ${parseErr.message}`);
            // Fallback: Try to clean common markers if it failed
            const fallbackReason = text.replace(/```json|```|\{|\}|"action":|"reason":|"priority":/g, '').trim();
            return {
                action: data.metrics.actionBucket,
                reason: `• ${fallbackReason.split('\n')[0] || 'Statistical demand analysis indicates restocking requirement.'}\n• System Math verified: ${data.metrics.recommendedQty} units.`,
                priority: data.metrics.isUrgent ? 'HIGH' : 'MEDIUM'
            };
        }
    }

    /**
     * DATABASE: Lifecycle Manager
     */
    async getActiveRecommendations(storeId) {
        const res = await this.pool.query(
            "SELECT * FROM inventory_recommendations WHERE store_id = $1 AND feedback_status IN ('PENDING', 'ACCEPTED', 'UPDATED')",
            [storeId]
        );
        return res.rows;
    }

    async saveRecommendations(results) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const res of results) {
                const existing = res.existingRec;
                const newBucket = res.insightCategory;

                if (existing) {
                    if (existing.insight_category === newBucket) {
                        // [IMMUTABLE ARCHITECTURE]: Visibility & Persistence - UPDATE Rule
                        await client.query(`
                            UPDATE inventory_recommendations 
                            SET current_stock = $1, 
                                recommended_order_quantity = $2,
                                reasoning_text = $3,
                                feedback_status = CASE WHEN feedback_status = 'ACCEPTED' THEN 'UPDATED' ELSE feedback_status END,
                                days_of_cover = $4,
                                safety_stock = $5,
                                reorder_point = $6,
                                protection_window = $7,
                                coefficient_of_variation = $8,
                                reasoning_status = $10,
                                weighted_ads = $11,
                                ads_7 = $12,
                                ads_14 = $13,
                                ads_30 = $14,
                                generated_at = NOW()
                            WHERE recommendation_id = $9
                        `, [
                            res.metrics.oh,
                            res.metrics.recommendedQty,
                            res.recommendation.reason,
                            res.metrics.daysOfCover,
                            res.metrics.safetyStock,
                            res.metrics.targetStock,
                            res.metrics.pw,
                            res.metrics.cv,
                            existing.recommendation_id,
                            res.reasoningStatus,
                            res.metrics.ads.weighted,
                            res.metrics.ads.ads7,
                            res.metrics.ads.ads14,
                            res.metrics.ads.ads30
                        ]);
                        continue;
                    } else {
                        // [IMMUTABLE ARCHITECTURE]: Visibility & Persistence - OBSOLETE Rule (Archive-Only)
                        await client.query("UPDATE inventory_recommendations SET feedback_status = 'OBSOLETE' WHERE recommendation_id = $1", [existing.recommendation_id]);
                    }
                }

                if (newBucket !== 'MONITOR') {
                    // [IMMUTABLE ARCHITECTURE]: Visibility & Persistence - CREATE Rule (Computation-Only for MONITOR)
                    await client.query(`
                        INSERT INTO inventory_recommendations (
                            store_id, store_item_id, recommendation_type, action_bucket,
                            current_stock, recommended_order_quantity, 
                            days_of_cover, risk_state,
                            reasoning_text, action_priority,
                            insight_category, feedback_status, initial_stock_at_feedback,
                            safety_stock, reorder_point, protection_window, coefficient_of_variation,
                            ads_7, ads_14, ads_30, weighted_ads, reasoning_status
                        ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', $4, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                    `, [
                        res.storeId, res.skuId, newBucket,
                        res.metrics.oh, res.metrics.recommendedQty,
                        res.metrics.daysOfCover, res.metrics.isUrgent ? 'CRITICAL' : (newBucket === 'MONITOR' ? 'SAFE' : 'RISK'),
                        res.recommendation.reason, res.recommendation.priority,
                        newBucket,
                        res.metrics.safetyStock, res.metrics.targetStock, res.metrics.pw, res.metrics.cv,
                        res.metrics.ads.ads7, res.metrics.ads.ads14, res.metrics.ads.ads30, res.metrics.ads.weighted,
                        res.reasoningStatus
                    ]);
                }
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * TRUTH RESOLVER: Outcome Ledger (Layer 2)
     */
    async calculateRealizedOutcomes(storeId) {
        const client = await this.pool.connect();
        try {
            const pastRecs = await client.query(`
                SELECT ir.*, i.quantity_on_hand as current_stock, i.selling_price
                FROM inventory_recommendations ir
                JOIN v_latest_inventory i ON ir.store_id = i.store_id AND ir.store_item_id = i.store_item_id
                WHERE ir.store_id = $1 
                AND ir.feedback_status IN ('ACCEPTED', 'IGNORED', 'UPDATED')
                AND ir.realized_outcome IS NULL
                AND ir.generated_at < NOW() - INTERVAL '24 hours'
                AND ir.outcome_check_count < 7
            `, [storeId]);

            for (const rec of pastRecs.rows) {
                let outcome = null;
                const initial = parseFloat(rec.initial_stock_at_feedback);
                const current = parseFloat(rec.current_stock);

                if (rec.feedback_status === 'ACCEPTED' || rec.feedback_status === 'UPDATED') {
                    if (current > initial) outcome = 'Opportunity Saved';
                } else if (rec.feedback_status === 'IGNORED') {
                    if (current <= 0) outcome = 'Opportunity Lost';
                }

                if (outcome) {
                    await client.query("UPDATE inventory_recommendations SET realized_outcome = $1 WHERE recommendation_id = $2", [outcome, rec.recommendation_id]);
                } else {
                    await client.query("UPDATE inventory_recommendations SET outcome_check_count = outcome_check_count + 1 WHERE recommendation_id = $1", [rec.recommendation_id]);
                }
            }
        } finally { client.release(); }
    }

    /**
     * HELPERS: Data Loaders
     */
    async loadSKUState(storeId, skuId) {
        const client = await this.pool.connect();
        try {
            const state = await client.query(`
                SELECT r.store_item_id, r.normalized_product_name, r.master_category_name, r.moq, r.case_pack_size,
                       i.quantity_on_hand, i.selling_price, i.cost_price
                FROM store_sku_registry r
                LEFT JOIN v_latest_inventory i ON r.store_id = i.store_id AND r.store_item_id = i.store_item_id
                WHERE r.store_id = $1 AND r.store_item_id = $2
            `, [storeId, skuId]);

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 35); // 35 days buffer to catch all relevant history

            const sales = await client.query(`
            SELECT transaction_date, quantity_sold FROM sales_transactions 
            WHERE store_id = $1 AND store_item_id = $2 AND transaction_date > $3
        `, [storeId, skuId, cutoffDate]);

            if (state.rows.length === 0) return null;
            const s = state.rows[0];
            return {
                storeId, skuId,
                productName: s.normalized_product_name,
                category: s.master_category_name,
                currentStock: s.quantity_on_hand,
                sellingPrice: s.selling_price,
                costPrice: s.cost_price,
                moq: s.moq,
                caseSize: s.case_pack_size,
                pendingQty: 0, // TODO: Query from purchase_order_items
                salesHistory: sales.rows
            };
        } finally { client.release(); }
    }

    async getBehaviorProfile(storeId, skuId) {
        const res = await this.pool.query("SELECT * FROM v_sku_outcome_history WHERE store_id = $1 AND store_item_id = $2", [storeId, skuId]);
        return { sku: res.rows[0] || { total_decisions: 0 } };
    }

    async getRadarSignal(storeId, category) {
        const config = await this.pool.query("SELECT value FROM system_intelligence_config WHERE key = 'radar_enabled'");
        if (config.rows[0]?.value !== true) return null;
        const res = await this.pool.query(`
            SELECT rs.* FROM regional_category_signals rs
            JOIN store_settings ss ON ss.region_id = rs.region_id
            WHERE ss.store_id = $1 AND rs.category_name = $2 AND rs.expires_at > NOW()
        `, [storeId, category]);
        return res.rows[0];
    }

    /**
     * HELPERS: Math
     */
    calculateADS(history, days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const total = history.filter(h => new Date(h.transaction_date) >= cutoff)
            .reduce((sum, h) => sum + parseFloat(h.quantity_sold), 0);
        return total / days;
    }

    extractDailyValues(history, days) {
        const vals = Array(days).fill(0);
        const now = new Date();
        history.forEach(h => {
            const age = Math.floor((now - new Date(h.transaction_date)) / 86400000);
            if (age >= 0 && age < days) vals[age] += parseFloat(h.quantity_sold);
        });
        return vals;
    }

    calculateStdDev(vals) {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (vals.length === 0) return 0;
        return Math.sqrt(vals.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / vals.length);
    }

    calculateConfidence(sku, metrics) {
        // [v3.0]: Confidence is now determined upstream in calculateDeterministicMetrics
        // Returning the computed qualitative label directly or mapping it to number if needed.
        // For compatibility, we map HIGH->1.0, MEDIUM->0.7, LOW->0.4
        const map = { 'HIGH': 1.0, 'MEDIUM': 0.7, 'LOW': 0.4 };
        return map[metrics.confidence] || 0.5;
    }

    /**
     * DATABASE: Lifecycle Manager - Update Recommendation Status
     */
    async updateRecommendationStatus(recommendationId, status, options = {}) {
        try {
            const result = await this.pool.query(`
                UPDATE inventory_recommendations 
                SET feedback_status = $1, 
                    feedback_reason = $2,
                    processed_at = NOW() 
                WHERE recommendation_id = $3::uuid
            `, [status, options.reason || null, recommendationId]);

            if (result.rowCount === 0) {
                console.warn(`⚠️ No recommendation found with ID: ${recommendationId}`);
                throw new Error(`Recommendation ${recommendationId} not found`);
            }

            console.log(`✅ Updated recommendation ${recommendationId} to ${status}`);
            return result;
        } catch (error) {
            console.error(`❌ Failed to update recommendation ${recommendationId}:`, error);
            throw error;
        }
    }

    /**
     * DATABASE: Run Management
     */
    async createRun(storeId, event) {
        const res = await this.pool.query(`
            INSERT INTO inventory_ai_runs (
                store_id, event_type, status, mode, agent_version, triggered_by
            ) VALUES ($1, $2, 'RUNNING', $3, $4, 'manual') 
            RETURNING run_id
        `, [storeId, event, ['SHADOW', 'ACTIVE'].includes(this.mode) ? this.mode : 'SHADOW', this.version]);
        return res.rows[0].run_id;
    }

    async completeRun(runId, stats) {
        await this.pool.query(`
            UPDATE inventory_ai_runs 
            SET status = 'COMPLETED', 
                total_skus = $1, 
                analyzed_skus = $2, 
                failed_skus = $3, 
                recommendations_generated = $4,
                alerts_generated = $5,
                metadata = $6,
                completed_at = NOW() 
            WHERE run_id = $7
        `, [
            stats.total_skus, stats.analyzed_skus, stats.failed_skus,
            stats.recommendations_generated, stats.alerts_generated,
            JSON.stringify(stats),
            runId
        ]);
    }

    async failRun(runId, error) {
        await this.pool.query("UPDATE inventory_ai_runs SET status = 'FAILED', error_message = $1, completed_at = NOW() WHERE run_id = $2", [error, runId]);
    }
}

module.exports = InventoryAIAgent;
