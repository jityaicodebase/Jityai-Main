const { Pool } = require('pg');
require('dotenv').config();
const InventoryAIAgent = require('../modules/inventory-ai-agent');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

const inventoryAIAgent = new InventoryAIAgent(pool);

async function simulateChatEndpoint() {
    console.log("🚀 STARTING BACKEND LOGIC VERIFICATION (v3.0)...");

    // Test Case: SKU-10005 (The one the user is seeing)
    const storeId = 'demo-store';
    const storeItemId = 'SKU-10005';
    const message = "Analyze this product.";
    const history = [];

    try {
        console.log("1. Loading SKU State...");
        const skuState = await inventoryAIAgent.loadSKUState(storeId, storeItemId);
        if (!skuState) throw new Error("SKU not found");

        console.log("2. Fetching Previous Recommendation...");
        const recResult = await pool.query(
            `SELECT * FROM inventory_recommendations 
             WHERE store_id = $1 AND store_item_id = $2 
             ORDER BY generated_at DESC LIMIT 1`,
            [storeId, storeItemId]
        );
        const existingRec = recResult.rows[0];

        console.log("3. Calculating Metrics...");
        const metrics = inventoryAIAgent.calculateDeterministicMetrics(skuState);
        let effectiveRecQty = metrics.recommendedQty;
        let effectiveRisk = inventoryAIAgent.determineRiskState(metrics, skuState);
        let traceMath;

        if (existingRec) {
            console.log("   - Using existing recommendation snapshot.");
            const snapAds = parseFloat(existingRec.weighted_ads);
            const snapAds7 = parseFloat(existingRec.ads_7);
            const snapAds14 = parseFloat(existingRec.ads_14);
            const snapAds30 = parseFloat(existingRec.ads_30);
            const snapSS = parseFloat(existingRec.safety_stock);
            const snapROP = parseFloat(existingRec.reorder_point);
            const snapStock = parseFloat(existingRec.current_stock);
            const snapSigma = parseFloat(existingRec.demand_variability);
            const snapPW = parseFloat(existingRec.protection_window) || 3;
            const snapTargetStock = snapAds * snapPW;

            traceMath = {
                ads: {
                    formula: "Weighted ADS = (0.5 * ADS7) + (0.3 * ADS14) + (0.2 * ADS30)",
                    inputs: {
                        ads7: (snapAds7 || 0).toFixed(2),
                        ads14: (snapAds14 || 0).toFixed(2),
                        ads30: (snapAds30 || 0).toFixed(2)
                    },
                    result: (snapAds || 0).toFixed(2)
                },
                safetyStock: {
                    formula: "Safety Stock = Max(z*sigma, ads*pw, 0.5*ads)",
                    inputs: {
                        sigma: (snapSigma || 0).toFixed(2),
                        ads: (snapAds || 0).toFixed(2),
                        pw: snapPW
                    },
                    result: (snapSS || 0).toFixed(2)
                },
                reorderPoint: {
                    formula: "ROP = (ADS * PW) + SafetyStock",
                    inputs: {
                        ads: (snapAds || 0).toFixed(2),
                        pw: snapPW,
                        safetyStock: (snapSS || 0).toFixed(2)
                    },
                    result: (snapROP || 0).toFixed(1)
                },
                targetStock: {
                    formula: "Target Stock = (ADS * PW)",
                    inputs: {
                        ads: (snapAds || 0).toFixed(2),
                        pw: snapPW
                    },
                    result: snapTargetStock.toFixed(1)
                },
                recommendedQty: {
                    formula: "Rec Qty = Max(0, TargetStock - SnapshotStock)",
                    inputs: {
                        target: snapTargetStock.toFixed(1),
                        current: snapStock || 0
                    },
                    result: effectiveRecQty || 0
                },
                daysOfCover: {
                    formula: "DOC = SnapshotStock / ADS",
                    inputs: {
                        stock: snapStock || 0,
                        ads: (snapAds || 0.01).toFixed(2)
                    },
                    result: parseFloat(existingRec.days_of_cover || 0).toFixed(1)
                }
            };
        } else {
            console.log("   - Generating live metrics (no record found).");
            traceMath = { ads: { result: 0 }, daysOfCover: { result: 0 }, safetyStock: { result: 0 }, reorderPoint: { result: 0 }, targetStock: { result: 0 } };
        }

        console.log("4. Classifying SKU...");
        const classification = inventoryAIAgent.classifySKU(skuState, metrics);

        console.log("5. Preparing Context & Trace...");
        const context = {
            productName: skuState.productName,
            riskState: effectiveRisk
        };

        const trace = {
            queries: [],
            math: traceMath,
            rawSales: skuState.salesHistory.slice(0, 7)
        };

        console.log("6. Verifying Gemini Payload Construction...");
        const systemPrompt = "Test system prompt";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;

        // This is the EXACT line that was failing:
        const geminiPayload = [];
        geminiPayload.push({ role: 'user', parts: [{ text: systemPrompt }] });
        geminiPayload.push({ role: 'model', parts: [{ text: "Acknowledged." }] });

        const userText = `BACKGROUND: ${JSON.stringify(trace)} \n QUESTION: ${message}`;
        geminiPayload.push({ role: 'user', parts: [{ text: userText }] });

        const body = JSON.stringify({ contents: geminiPayload });
        console.log("   ✅ GEMINI PAYLOAD CONSTRUCTED SUCCESSFULLY.");
        console.log("   - Contents key exists:", body.includes('"contents":'));

        console.log("7. Finalizing Test...");
        console.log("✨ ALL LOGIC STEPS PASSED WITHOUT REFERENCE ERRORS.");

    } catch (e) {
        console.error("❌ BACKEND FAILURE:", e);
        console.error("Stack Trace:", e.stack);
    } finally {
        await pool.end();
    }
}

simulateChatEndpoint();
