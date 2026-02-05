/**
 * FILE PARSER MODULE (Updated with Excel support and enhanced error handling)
 */

class FileParser {
    constructor(configLoader) {
        this.configLoader = configLoader;
        this.excelParser = null;
        this.errorHandler = null;
    }

    /**
     * Set dependencies
     */
    setDependencies(excelParser, errorHandler) {
        this.excelParser = excelParser;
        this.errorHandler = errorHandler;
    }

    /**
     * Parse file based on extension
     */
    async parse(file) {
        const extension = file.name.split('.').pop().toLowerCase();

        try {
            if (extension === 'csv') {
                return await this.parseCSV(file);
            } else if (extension === 'xlsx' || extension === 'xls') {
                if (!this.excelParser) {
                    throw new Error('Excel parser not initialized');
                }
                return await this.excelParser.parse(file);
            } else {
                throw new Error('Unsupported file format. Use CSV or Excel (.xlsx, .xls)');
            }
        } catch (error) {
            if (this.errorHandler) {
                this.errorHandler.handleParseError(error, file);
            }
            throw error;
        }
    }

    /**
     * Parse CSV file
     */
    async parseCSV(file) {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length === 0) {
            throw new Error('Empty file');
        }

        const headers = this.parseCSVLine(lines[0]);
        const columnMap = this.detectColumns(headers);

        const items = [];
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            try {
                const values = this.parseCSVLine(lines[i]);
                const item = this.extractItem(values, headers, columnMap);
                if (item.product_name) {
                    items.push(item);
                }
            } catch (error) {
                errors.push({
                    row: i + 1,
                    error: error.message,
                    data: lines[i]
                });
            }
        }

        return { items, errors, columnMap };
    }

    /**
     * Parse CSV line handling quoted values
     */
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    /**
     * Auto-detect column mapping
     */
    detectColumns(headers) {
        const map = {};
        const columnKeywords = this.configLoader.getColumnKeywords();

        headers.forEach((header, index) => {
            const lower = header.toLowerCase();

            for (const [field, keywords] of Object.entries(columnKeywords)) {
                if (keywords.some(keyword => lower.includes(keyword))) {
                    if (field === 'selling_price' && keywords.some(k => ['cost', 'purchase'].includes(k) && lower.includes(k))) {
                        map.cost_price = index;
                    } else if (!map[field]) {
                        map[field] = index;
                    }
                }
            }
        });

        if (map.product_name === undefined) {
            throw new Error('Cannot find product name column. Please ensure your file has a column with product names.');
        }

        return map;
    }

    /**
     * Extract item from row
     */
    extractItem(values, headers, columnMap) {
        const item = {
            raw_row: values.join(',')
        };

        Object.keys(columnMap).forEach(field => {
            const index = columnMap[field];
            item[field] = values[index] || null;
        });

        return item;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileParser;
}
