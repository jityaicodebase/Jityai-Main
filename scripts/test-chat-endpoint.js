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

async function testChat() {
    const storeId = 'demo-store';
    const storeItemId = 'SKU-10005';
    const message = "Explain the logic for this product.";
    const history = [];

    console.log(`🧪 Testing Chat for ${storeItemId}...`);

    try {
        // 1. Load SKU State
        const skuState = await inventoryAIAgent.loadSKUState(storeId, storeItemId);
        if (!skuState) {
            console.error('❌ SKU not found');
            return;
        }

        const recResult = await pool.query(
            `SELECT * FROM inventory_recommendations 
             WHERE store_id = $1 AND store_item_id = $2 
             ORDER BY generated_at DESC LIMIT 1`,
            [storeId, storeItemId]
        );
        const existingRec = recResult.rows[0];

        const metrics = inventoryAIAgent.calculateDeterministicMetrics(skuState);
        let effectiveRecQty = metrics.recommendedQty;
        let effectiveRisk = inventoryAIAgent.determineRiskState(metrics, skuState);
        let traceMath;

        if (existingRec) {
            effectiveRecQty = parseFloat(existingRec.recommended_order_quantity);
            effectiveRisk = existingRec.risk_state;

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
            console.error('❌ Existing recommendation not found for test SKU');
            return;
        }

        const classification = inventoryAIAgent.classifySKU(skuState, metrics);

        const context = {
            productName: skuState.productName,
            category: skuState.category,
            currentStock: skuState.currentStock,
            ads: parseFloat(traceMath.ads.result),
            daysOfCover: parseFloat(traceMath.daysOfCover.result),
            recommendedQty: effectiveRecQty,
            riskState: effectiveRisk,
            classification: classification,
            safetyStock: parseFloat(traceMath.safetyStock.result),
            reorderPoint: parseFloat(traceMath.reorderPoint.result),
            targetStock: parseFloat(traceMath.targetStock.result),
            costPrice: skuState.costPrice,
            sellingPrice: skuState.sellingPrice
        };

        const trace = {
            queries: [],
            math: traceMath,
            rawSales: skuState.salesHistory.slice(0, 7)
        };

        const systemPrompt = `Analyze SKU: ${context.productName}`; // Simple for test

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const contents = [];
        contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
        contents.push({ role: 'model', parts: [{ text: "Acknowledged." }] });

        const userText = `BACKGROUND METRICS: ${JSON.stringify(trace, null, 2)} \n\n QUESTION: ${message}`;
        contents.push({ role: 'user', parts: [{ text: userText }] });

        console.log("📡 Sending to Gemini...");
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        if (!response.ok) {
            const errJson = await response.json();
            console.error("❌ Gemini API Error:", JSON.stringify(errJson, null, 2));
        } else {
            const resJson = await response.json();
            console.log("✅ Success! AI Response:", resJson.candidates[0].content.parts[0].text);
        }

    } catch (e) {
        console.error("❌ Script Crash:", e);
    } finally {
        await pool.end();
    }
}

testChat();
