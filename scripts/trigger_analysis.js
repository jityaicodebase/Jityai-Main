const fetch = require('node-fetch');

async function triggerAnalysis() {
    console.log("Triggering Daily Closing Analysis for demo-store...");
    try {
        const response = await fetch('http://localhost:3000/api/ops/daily-close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeId: 'demo-store' })
        });
        const data = await response.json();
        console.log("Response:", data);
    } catch (err) {
        console.error("Error triggering analysis:", err.message);
    }
}

triggerAnalysis();
