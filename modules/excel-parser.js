/**
 * EXCEL PARSER MODULE
 * Handles Excel file parsing using SheetJS library
 * Compatible with Node.js and Browser environment
 */

let XLSX;
if (typeof require !== 'undefined') {
    XLSX = require('xlsx');
}

class ExcelParser {
    constructor(configLoader) {
        this.configLoader = configLoader;
    }

    /**
     * Parse Excel file from path (Node.js)
     */
    async parseFile(filePath) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not found');
        }

        const workbook = XLSX.readFile(filePath);
        const sheetName = this.findBestSheet(workbook);
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        const result = this.processExcelData(rawData);
        return result.items; // Return only items for the orchestrator
    }

    /**
     * Parse Excel file object (Browser)
     */
    async parse(file) {
        if (typeof XLSX === 'undefined') {
            throw new Error('Excel parsing requires SheetJS library.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        // Get first sheet or sheet with most data
        const sheetName = this.findBestSheet(workbook);
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        return this.processExcelData(rawData);
    }

    /**
     * Find sheet with most data
     */
    findBestSheet(workbook) {
        let maxRows = 0;
        let bestSheet = workbook.SheetNames[0];

        workbook.SheetNames.forEach(name => {
            const sheet = workbook.Sheets[name];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            if (data.length > maxRows) {
                maxRows = data.length;
                bestSheet = name;
            }
        });

        return bestSheet;
    }

    /**
     * Process Excel data into standard format with Robust Detection
     */
    processExcelData(rawData) {
        if (rawData.length === 0) {
            throw new Error('Empty Excel sheet');
        }

        // Find header row (first non-empty row)
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(5, rawData.length); i++) {
            if (rawData[i] && rawData[i].some(cell => cell !== null && cell !== '')) {
                headerRowIndex = i;
                break;
            }
        }

        const headers = rawData[headerRowIndex].map(h => String(h || '').trim());

        // SAMPLE DATA (Next 10 rows) for content-aware detection
        const samples = rawData.slice(headerRowIndex + 1, headerRowIndex + 11)
            .filter(row => row && row.some(cell => cell !== null && cell !== ''));

        const columnMap = this.detectColumns(headers, samples);

        const items = [];
        const errors = [];

        // Process data rows
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            try {
                const row = rawData[i];

                // Skip empty rows
                if (!row || row.every(cell => cell === null || cell === '')) {
                    continue;
                }

                const item = this.extractItem(row, headers, columnMap);
                if (item.product_name || item.store_item_id) {
                    items.push(item);
                }
            } catch (error) {
                errors.push({
                    row: i + 1,
                    error: error.message,
                    data: rawData[i]
                });
            }
        }

        return { items, errors, columnMap };
    }

    /**
     * Robust Content-Aware Column Detection
     * Header Keywords + Data Pattern Matching (Heuristic Score)
     */
    detectColumns(headers, samples) {
        const scores = headers.map(() => ({}));
        const fields = ['product_name', 'quantity', 'selling_price', 'cost_price', 'store_item_id', 'transaction_type'];

        const columnKeywords = {
            product_name: ['product_name', 'item_name', 'product', 'item', 'description', 'title', 'particulars'],
            quantity: ['qty', 'quantity', 'stock', 'count', 'units_on_hand', 'qoh'],
            selling_price: ['selling_price', 'price', 'mrp', 'rate', 'unit_price', 'sale_price', 'sp'],
            cost_price: ['cost_price', 'cost', 'purchase_price', 'buying_rate', 'cp'],
            store_item_id: ['store_item_id', 'item_id', 'id', 'sku', 'code', 'barcode', 'article_no', 'pos_id'],
            transaction_type: ['transaction_type', 'type', 'reason', 'trans_type', 'movement_type', 'adjust_reason']
        };

        headers.forEach((header, index) => {
            const lower = header.toLowerCase().replace(/[^a-z0-9]/g, '_');

            fields.forEach(field => {
                let score = 0;
                const keywords = columnKeywords[field];

                // 1. Header Match Scoring
                if (keywords.includes(lower)) {
                    score += 100; // Exact match
                } else if (keywords.some(k => lower.includes(k))) {
                    score += 50;  // Partial match
                }

                // 2. Content Pattern Scoring (The Robustness Layer)
                if (samples && samples.length > 0) {
                    const sampleValues = samples.map(s => s[index]).filter(v => v !== null && v !== undefined && v !== '');
                    if (sampleValues.length > 0) {
                        score += this.scoreContent(field, sampleValues);
                    }
                }

                scores[index][field] = score;
            });
        });

        // Resolve Column Mapping (SMART RESOLUTION: highest score wins across any field/col)
        const finalMap = {};
        const assignedIndices = new Set();
        const assignedFields = new Set();
        // fields already declared above

        // Create a flat list of potential candidates (field, colIndex, score)
        const candidates = [];
        fields.forEach(field => {
            scores.forEach((colScores, index) => {
                if (colScores[field] > 20) {
                    candidates.push({ field, index, score: colScores[field] });
                }
            });
        });

        // Sort candidates by score descending
        candidates.sort((a, b) => b.score - a.score);

        // Assign greedily starting from highest score
        for (const candidate of candidates) {
            if (!assignedIndices.has(candidate.index) && !assignedFields.has(candidate.field)) {
                finalMap[candidate.field] = candidate.index;
                assignedIndices.add(candidate.index);
                assignedFields.add(candidate.field);
            }
        }

        // Forced Fallback: Ensure we have a Name for logic consistency
        if (finalMap.product_name === undefined) {
            for (let i = 0; i < headers.length; i++) {
                if (!assignedIndices.has(i)) {
                    finalMap.product_name = i;
                    assignedIndices.add(i);
                    break;
                }
            }
        }

        return finalMap;
    }

    /**
     * Pattern matching to verify column content
     */
    scoreContent(field, values) {
        let score = 0;
        const stringValues = values.map(v => String(v));

        switch (field) {
            case 'store_item_id':
                // Alphanumeric IDs, usually short, often containing hyphens
                if (stringValues.every(v => /^[A-Z0-9\-_]{3,20}$/i.test(v))) score += 40;
                if (stringValues.every(v => v.length < 15)) score += 20;
                break;

            case 'product_name':
                // Product names are longer, descriptive, often have spaces
                const avgLength = stringValues.reduce((a, b) => a + b.length, 0) / stringValues.length;
                if (avgLength > 10) score += 30;
                if (stringValues.some(v => v.includes(' '))) score += 50;
                // Penalize if it looks purely like a serial ID
                if (stringValues.every(v => /^[A-Z0-9\-_]+$/i.test(v) && v.length < 12)) score -= 70;
                break;

            case 'quantity':
            case 'cost_price':
                // Numeric content
                if (stringValues.every(v => !isNaN(parseFloat(v.replace(/[₹$,]/g, ''))))) score += 60;
                break;

            case 'transaction_type':
                // Text content, looking for keywords like "RESTOCK", "SALE", "ADJUSTMENT"
                if (stringValues.some(v => /restock|stock|sale|adjustment|count|audit|return/i.test(v))) score += 70;
                break;
        }

        return score;
    }

    /**
     * Extract item from row using the resolved map
     */
    extractItem(values, headers, columnMap) {
        const item = {
            product_name: null,
            quantity: null,
            selling_price: null,
            cost_price: null,
            store_item_id: null,
            transaction_type: null
        };

        Object.keys(columnMap).forEach(field => {
            const index = columnMap[field];
            const value = values[index];
            item[field] = (value !== null && value !== undefined) ? String(value).trim() : null;
        });

        return item;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExcelParser;
}
