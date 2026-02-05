
const { Pool } = require('pg');
require('dotenv').config();
const InventoryAIAgent = require('../modules/inventory-ai-agent');

// Mock Pool - matches the interface expected by Agent but doesn't connect
const mockPool = {
    connect: () => ({ release: () => { }, query: () => ({ rows: [] }) }),
    query: () => ({ rows: [] })
};

// Subclass to expose internal logic
class TestAgent extends InventoryAIAgent {
    constructor() {
        super(mockPool);
        this.apiKey = null; // Force deterministic templates
    }
}

const agent = new TestAgent();

function createSKU(historyDays, dataQuality, stock = 5) {
    const salesHistory = [];
    const today = new Date();
    for (let i = 0; i < historyDays; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        let qty = (dataQuality === 'dense') ? 1 : ((i % 5 === 0) ? 1 : 0);
        if (qty > 0) salesHistory.push({ transaction_date: date.toISOString(), quantity_sold: qty });
    }
    return {
        skuId: `TEST-${historyDays}-${dataQuality}`,
        productName: `Test Product (${historyDays}d)`,
        currentStock: stock,
        sellingPrice: 10,
        costPrice: 5,
        moq: 1,
        caseSize: 1,
        salesHistory
    };
}

async function run() {
    console.log("🚀 FINAL PROOF-OF-SOUNDNESS SYSTEM TEST\n");

    const scenarios = [
        {
            name: "🧪 CASE 1: New SKU Availability Protection (3 Days History)",
            sku: createSKU(3, 'dense', 5), // Stock 5, Calc ADS 0.43 -> DOI 11.6 > 9. Should be MONITOR (LOW Conf).
        },
        {
            name: "🧪 CASE 2: BUY_MORE Confidence Disclosure (3 Days History, Low Stock)",
            sku: createSKU(3, 'dense', 0.5), // Stock 0.5, Target 2.14 -> BUY_MORE. Should mention "limited data".
        },
        {
            name: "🧪 CASE 3: Established SKU BUY_LESS (35 Days History, High Stock)",
            sku: createSKU(35, 'dense', 20), // Target 3, Stock 20 -> BUY_LESS.
        }
    ];

    for (const scn of scenarios) {
        console.log(`--- ${scn.name} ---`);
        const metrics = agent.calculateDeterministicMetrics(scn.sku);
        const analysis = await agent.analyzeSKU(scn.sku, metrics, null, { allowReasoning: true });

        console.log(`Confidence: ${metrics.confidence}`);
        console.log(`Action:     ${analysis.insightCategory}`);
        console.log(`Reasoning:  ${analysis.recommendation.reason.split('\n')[0]}`);
        console.log(`Status:     ${analysis.reasoningStatus}`);
        console.log("");
    }
}

run();
