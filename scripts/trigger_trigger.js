const http = require('http');

const data = JSON.stringify({ storeId: 'demo-store' });

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/ops/daily-close',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log("Triggering Daily Closing Analysis for demo-store...");

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
        console.log("Response Status:", res.statusCode);
        console.log("Response Body:", body);
    });
});

req.on('error', (error) => {
    console.error("Error:", error.message);
});

req.write(data);
req.end();
