# LLM Categorizer - AI Prompt Documentation

## Current Gemini Flash Prompt

### Location
`modules/llm-categorizer.js` - Lines 159-180

### Full Prompt Template

```
You are a retail product categorization expert for an Indian Supermarket.
Given a list of products, assign the most appropriate Category ID from the provided catalog.

CATALOG REFERENCE:
${categoryList}

STRICT RULES:
1. Return ONLY a valid JSON array of objects. No text before or after.
2. For each product, analyze its name, brand, and typical usage in an Indian context.
3. If a product is a loose commodity (sold by weight), map it to the correct staples or fresh category.
4. If a product is an Indian regional item (e.g., 'Atta', 'Poha', 'Maida'), match it to the correct English category equivalent (e.g., 'Flour', 'Beaten Rice').
5. Use "L1_UNCATEGORIZED" only if the product is completely unrecognizable.

PRODUCTS TO CATEGORIZE:
${products.map(p => `- ${p.name} (Brand: ${p.brand || 'Unknown'})`).join('\n')}

OUTPUT FORMAT:
[
  {"name": "Product Name", "category_id": "CAT_ID", "category_name": "Category Name", "confidence": 0.95}
]
```

### Example Category List Fed to AI

```
L1_STAPLES: Staples & Cooking Essentials (Type: N/A, Consumption: N/A, Best: N/A)
L1_DAIRY: Milk & Dairy (Type: N/A, Consumption: N/A, Best: N/A)
L1_PACKAGED: Packaged Food & Snacks (Type: N/A, Consumption: N/A, Best: N/A)
L1_BEVERAGES: Beverages (Type: N/A, Consumption: N/A, Best: N/A)
L1_FRESH: Fresh Produce (Type: N/A, Consumption: N/A, Best: N/A)
L1_HOUSEHOLD: Household & Cleaning (Type: N/A, Consumption: N/A, Best: N/A)
L1_PHARMA: Pharma & Wellness (Type: N/A, Consumption: N/A, Best: N/A)
L1_BABY: Baby Care (Type: N/A, Consumption: N/A, Best: N/A)
L1_PET: Pet Care (Type: N/A, Consumption: N/A, Best: N/A)
L1_FROZEN: Frozen & Ice Cream (Type: N/A, Consumption: N/A, Best: N/A)
L1_DURABLES: Durables & Electronics (Type: N/A, Consumption: N/A, Best: N/A)
L1_UNCATEGORIZED: Uncategorized (Type: N/A, Consumption: N/A, Best: N/A)
```

### Example Input to AI

```
PRODUCTS TO CATEGORIZE:
- Amul Taaza Milk 500ml (Brand: Amul)
- MDH Chana Masala 100g (Brand: MDH)
- Brown Eggs Tray 6pcs (Brand: Unknown)
- Britannia Good Day Biscuits (Brand: Britannia)
```

### Expected AI Response

```json
[
  {
    "name": "Amul Taaza Milk 500ml",
    "category_id": "L2_MILK",
    "category_name": "Milk",
    "confidence": 0.98
  },
  {
    "name": "MDH Chana Masala 100g",
    "category_id": "L2_SPICES",
    "category_name": "Spices",
    "confidence": 0.97
  },
  {
    "name": "Brown Eggs Tray 6pcs",
    "category_id": "L2_EGGS",
    "category_name": "Eggs",
    "confidence": 0.95
  },
  {
    "name": "Britannia Good Day Biscuits",
    "category_id": "L1_PACKAGED",
    "category_name": "Packaged Food & Snacks",
    "confidence": 0.96
  }
]
```

## Fallback Simulation (When No API Key)

When `GEMINI_API_KEY` is not set, the system uses `simulateGeminiUnderstanding()` which has a comprehensive knowledge base:

### Knowledge Base Clusters

```javascript
{
  category: 'L2_MILK',
  keywords: ['milk', 'curd', 'yogurt', 'paneer', 'cheese', 'butter', 'lassi', 'kool', 'dairy', 'amul', 'mother dairy', 'go milk', 'britannia cheese']
}

{
  category: 'L2_SPICES',
  keywords: ['masala', 'powder', 'spice', 'turmeric', 'chilli', 'coriander', 'jeera', 'cumin', 'mustard', 'mdh', 'everest', 'catch', 'haldi', 'mirch', 'dhaniya']
}

{
  category: 'L2_EGGS',
  keywords: ['egg', 'eggs'] // In catalog-mapper.js hard rules
}
```

## How It Works

### Categorization Flow

1. **Hard Rules First** (catalog-mapper.js)
   - Check if product name contains keywords like "egg", "milk", "masala"
   - If match found → Return category with 95% confidence
   - **Amul** → Mapped to L2_MILK (line 250 in catalog-mapper.js)
   - **MDH** → Not in hard rules, falls through
   - **Egg/Eggs** → Mapped to L2_EGGS (lines 226-227)

2. **Brand + Keyword Match**
   - If brand is known (e.g., "Amul") and product has dairy keywords
   - Return category with 90% confidence

3. **Rule-Based Classification**
   - Check catalog keywords from `cateloge.json`
   - Match product name against category keywords

4. **LLM Fallback** (Only if above fail)
   - Batch process unknown items
   - Call Gemini Flash API with full catalog context
   - Cache results to avoid repeated API calls

### Cost Optimization

- **Rule-based**: FREE (handles 90%+ of items)
- **LLM fallback**: Only for failures (~10% of items)
- **Caching**: Never call LLM twice for same product
- **Batch processing**: Process multiple unknowns in single API call

## Current Issues

### Issue 1: "Brown" Being Extracted as Brand
**Status**: ✅ FIXED
- Brand extractor has "brown" in forbidden list (line 64 of brand-extractor.js)
- Should not extract "brown" as a brand

### Issue 2: Products Categorized as "Unknown"
**Root Cause**: 
- Hard rules work for "egg" keyword
- But if product name is normalized incorrectly (e.g., "brown egg tray" → "brownegg tray"), it won't match
- LLM simulation has "amul" and "mdh" in knowledge base, should work

**Solution**: 
1. Verify normalization doesn't remove spaces incorrectly
2. Ensure LLM fallback is actually being called
3. Check if catalog mapper is using L2_EGGS vs L1_DAIRY for eggs

## Recommendations

### 1. Enhanced Prompt (Include Subcategories)
```
CATALOG REFERENCE (with subcategories):
L1_DAIRY: Milk & Dairy
  - L2_MILK: Milk (Keywords: milk, amul, mother dairy)
  - L2_EGGS: Eggs (Keywords: egg, eggs, brown eggs, white eggs)
  - L2_CURD_YOGURT: Curd & Yogurt

L1_STAPLES: Staples & Cooking Essentials
  - L2_SPICES: Spices (Keywords: masala, mdh, everest, turmeric, chilli)
```

### 2. Add Brand Hints to Prompt
```
KNOWN BRAND MAPPINGS:
- Amul → Dairy products (L2_MILK, L2_BUTTER_GHEE)
- MDH, Everest, Catch → Spices (L2_SPICES)
- Britannia, Parle → Packaged Food (L1_PACKAGED)
```

### 3. Improve Confidence Scoring
- Hard rule match: 0.95
- Brand + keyword: 0.90
- LLM with high certainty: 0.92
- LLM with medium certainty: 0.75
- Fallback/guess: 0.30

## Testing

To test the LLM categorizer:

```javascript
const llmCategorizer = new LLMCategorizer(configLoader);
await llmCategorizer.initialize();

const result = await llmCategorizer.categorize('Amul Taaza Milk 500ml', 'Amul');
// Expected: { category_id: 'L2_MILK', category_name: 'Milk', confidence: 0.92 }
```

## API Key Setup

Set in `.env`:
```
GEMINI_API_KEY=your_actual_api_key_here
```

Without API key, system uses simulation mode with comprehensive knowledge base.
