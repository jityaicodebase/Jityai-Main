/**
 * ROBUST CATALOG MAPPER - Context-Aware Category Mapping
 * 
 * CRITICAL DESIGN PRINCIPLES:
 * 1. BRAND OVERRIDE FIRST - Known brands ALWAYS map to their category
 * 2. PRODUCT TYPE CONTEXT - "drink", "chips", "biscuit" override ingredient keywords
 * 3. NEGATIVE CONTEXT - Exclude fresh produce if packaged product indicators present
 * 4. MULTI-WORD MATCHING - "ice cream" checked before "cream"
 */

class CatalogMapper {
    constructor(configLoader, fuzzyMatcher, llmCategorizer = null, errorHandler = null) {
        this.configLoader = configLoader;
        this.fuzzyMatcher = fuzzyMatcher;
        this.llmCategorizer = llmCategorizer;
        this.errorHandler = errorHandler;
        this.catalog = null;
        this.categoryIndex = new Map();

        // ============================================================================
        // BRAND OVERRIDES - HIGHEST PRIORITY
        // If a product contains these brand names, ALWAYS use this category
        // regardless of any keywords (e.g., "Cadbury Dairy Milk" = Packaged, not Dairy)
        // ============================================================================
        this.brandOverrides = {
            // Chocolates & Confectionery (NEVER Dairy)
            'cadbury': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },
            'nestle kitkat': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },
            'nestle milkybar': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },
            'milkybar': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },
            'kitkat': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },
            '5 star': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },
            'dairy milk': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },
            'perk': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },
            'munch': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },
            'gems': { category: 'L1_PACKAGED', reason: 'chocolate_brand' },

            // Beverages (NEVER Fresh Fruits)
            'frooti': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'maaza': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'slice mango': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'slice drink': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'real juice': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'real fruit': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'tropicana': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'paper boat': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'coca cola': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'pepsi': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'sprite': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'fanta': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'limca': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'thums up': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'mountain dew': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            '7up': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'mirinda': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'appy fizz': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'bisleri': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'kinley': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'aquafina': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'red bull': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'monster': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'sting': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'nescafe': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'bru': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'red label': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'taj mahal': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'tata tea': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'brooke bond': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },
            'sunfeast dark fantasy': { category: 'L1_BEVERAGES', reason: 'beverage_brand' },

            // Snacks (NEVER Fresh Vegetables)
            'lays': { category: 'L1_PACKAGED', reason: 'snack_brand' },
            'kurkure': { category: 'L1_PACKAGED', reason: 'snack_brand' },
            'bingo': { category: 'L1_PACKAGED', reason: 'snack_brand' },
            'haldiram': { category: 'L1_PACKAGED', reason: 'snack_brand' },
            'bikano': { category: 'L1_PACKAGED', reason: 'snack_brand' },
            'balaji': { category: 'L1_PACKAGED', reason: 'snack_brand' },
            'act ii': { category: 'L1_PACKAGED', reason: 'snack_brand' },
            'uncle chipps': { category: 'L1_PACKAGED', reason: 'snack_brand' },

            // Biscuits (NEVER Fresh/Dairy based on name)
            'parle': { category: 'L1_PACKAGED', reason: 'biscuit_brand' },
            'britannia': { category: 'L1_PACKAGED', reason: 'biscuit_brand' },
            'sunfeast': { category: 'L1_PACKAGED', reason: 'biscuit_brand' },
            'hide & seek': { category: 'L1_PACKAGED', reason: 'biscuit_brand' },
            'oreo': { category: 'L1_PACKAGED', reason: 'biscuit_brand' },
            'mcvities': { category: 'L1_PACKAGED', reason: 'biscuit_brand' },
            'unibic': { category: 'L1_PACKAGED', reason: 'biscuit_brand' },

            // Noodles & Instant Food
            'maggi': { category: 'L1_PACKAGED', reason: 'instant_food_brand' },
            'yippee': { category: 'L1_PACKAGED', reason: 'instant_food_brand' },
            'top ramen': { category: 'L1_PACKAGED', reason: 'instant_food_brand' },
            'knorr': { category: 'L1_PACKAGED', reason: 'instant_food_brand' },
            'ching\'s': { category: 'L1_PACKAGED', reason: 'instant_food_brand' },

            // Household (NEVER Staples)
            'surf excel': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'surf': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'ariel': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'tide': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'rin': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'wheel': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'vim': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'pril': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'harpic': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'lizol': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'domex': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'colin': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'mr muscle': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'scotch brite': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'good knight': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'all out': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'mortein': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'hit': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'odonil': { category: 'L1_HOME_CARE', reason: 'household_brand' },
            'ambi pur': { category: 'L1_HOME_CARE', reason: 'household_brand' },

            // Personal Care
            'colgate': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'pepsodent': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'sensodyne': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'closeup': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'oral b': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'dove': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'lux': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'lifebuoy': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'dettol': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'savlon': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'nivea': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'vaseline': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'ponds': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'lakme': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'fair & lovely': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'glow & lovely': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'pantene': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'sunsilk': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'head & shoulders': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'clinic plus': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'parachute': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'navratna': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'dabur': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'himalaya': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'patanjali': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'baidyanath': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'zandu': { category: 'L1_PHARMA', reason: 'wellness_brand' },
            '18 herbs': { category: 'L2_AYURVEDA', reason: 'wellness_brand' },
            'dr. vaidya': { category: 'L2_AYURVEDA', reason: 'wellness_brand' },
            'kapiva': { category: 'L2_AYURVEDA', reason: 'wellness_brand' },
            'vicks': { category: 'L1_PHARMA', reason: 'pharma_brand' },

            // Baby Care
            'johnson': { category: 'L1_BABY', reason: 'baby_brand' },
            'johnson\'s': { category: 'L1_BABY', reason: 'baby_brand' },
            'pampers': { category: 'L1_BABY', reason: 'baby_brand' },
            'huggies': { category: 'L1_BABY', reason: 'baby_brand' },
            'mamypoko': { category: 'L1_BABY', reason: 'baby_brand' },
            'cerelac': { category: 'L1_BABY', reason: 'baby_brand' },
            'lactogen': { category: 'L1_BABY', reason: 'baby_brand' },

            // Personal Care Brands
            'santoor': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'cinthol': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'lux': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'pears': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'lifebuoy': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'dettol': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'medimix': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'mysore sandal': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'colgate': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'pepsodent': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'sensodyne': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'closeup': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'dove': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'pantene': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'head & shoulders': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'sunshilk': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'loreal': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'garnier': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'nivea': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'ponds': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'vaseline': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'himalaya': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'patanjali': { category: 'L1_PHARMA', reason: 'wellness_brand' },
            'baidyanath': { category: 'L1_PHARMA', reason: 'wellness_brand' },
            'dabur': { category: 'L1_PHARMA', reason: 'wellness_brand' },
            'zandu': { category: 'L1_PHARMA', reason: 'wellness_brand' },
            'boroplus': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'fair & lovely': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'glow & lovely': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'parachute': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'vicks': { category: 'L1_PHARMA', reason: 'wellness_brand' },
            'ajmal': { category: 'L2_FRAGRANCE', reason: 'fragrance_brand' },
            'axe': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'fog': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'wildstone': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },
            'engage': { category: 'L1_PERSONAL_CARE', reason: 'personal_care_brand' },

            // Pet Care
            'pedigree': { category: 'L1_PET', reason: 'pet_brand' },
            'drools': { category: 'L1_PET', reason: 'pet_brand' },
            'whiskas': { category: 'L1_PET', reason: 'pet_brand' },
            'royal canin': { category: 'L1_PET', reason: 'pet_brand' },
            'steelo': { category: 'L1_DURABLES', reason: 'household_durables' },

            // Frozen & Ice Cream
            'ice cream': { category: 'L1_FROZEN', reason: 'frozen_product' },
            'amul ice cream': { category: 'L1_FROZEN', reason: 'frozen_brand' },
            'kwality walls': { category: 'L1_FROZEN', reason: 'frozen_brand' },
            'vadilal': { category: 'L1_FROZEN', reason: 'frozen_brand' },
            'mother dairy ice cream': { category: 'L1_FROZEN', reason: 'frozen_brand' },
            'havmor': { category: 'L1_FROZEN', reason: 'frozen_brand' },
            'baskin robbins': { category: 'L1_FROZEN', reason: 'frozen_brand' },
            'mccain': { category: 'L1_FROZEN', reason: 'frozen_brand' },

            // Spices & Masalas
            'mdh': { category: 'L2_SPICES_MASALAS', reason: 'spice_brand' },
            'everest': { category: 'L2_SPICES_MASALAS', reason: 'spice_brand' },
            'catch': { category: 'L2_SPICES_MASALAS', reason: 'spice_brand' },
            'eastern': { category: 'L2_SPICES_MASALAS', reason: 'spice_brand' },
            'sakthi': { category: 'L2_SPICES_MASALAS', reason: 'spice_brand' },
            'badshah': { category: 'L2_SPICES_MASALAS', reason: 'spice_brand' },
            'aachi': { category: 'L2_SPICES_MASALAS', reason: 'spice_brand' },
            'priya': { category: 'L2_SPICES_MASALAS', reason: 'spice_brand' },

            // Staples & Cooking
            'aashirvaad': { category: 'L3_WHEAT_ATTA', reason: 'staples_brand' },
            'pillsbury': { category: 'L3_WHEAT_ATTA', reason: 'staples_brand' },
            'fortune': { category: 'L3_COOKING_OILS', reason: 'staples_brand' },
            'saffola': { category: 'L3_COOKING_OILS', reason: 'staples_brand' },
            'sundrop': { category: 'L3_COOKING_OILS', reason: 'staples_brand' },
            'india gate': { category: 'L3_RICE', reason: 'staples_brand' },
            'daawat': { category: 'L3_RICE', reason: 'staples_brand' },
            'tata sampann': { category: 'L3_PULSES_DALS', reason: 'staples_brand' },
            'tata': { category: 'L2_RICE_PULSES', reason: 'staples_brand' },
            'mtr': { category: 'L2_INSTANT_FOOD', reason: 'breakfast_instant_brand' },

            // Dairy (ONLY these are actual dairy brands)
            'amul': { category: 'L1_DAIRY', reason: 'dairy_brand' },
            'mother dairy': { category: 'L1_DAIRY', reason: 'dairy_brand' },
            'nandini': { category: 'L1_DAIRY', reason: 'dairy_brand' },
            'verka': { category: 'L1_DAIRY', reason: 'dairy_brand' },
            'milma': { category: 'L1_DAIRY', reason: 'dairy_brand' },
            'aavin': { category: 'L1_DAIRY', reason: 'dairy_brand' },
            'gowardhan': { category: 'L1_DAIRY', reason: 'dairy_brand' },
            'nestle milkmaid': { category: 'L1_DAIRY', reason: 'dairy_brand' },

            // Durables
            'philips': { category: 'L1_DURABLES', reason: 'durables_brand' },
            'eveready': { category: 'L1_DURABLES', reason: 'durables_brand' },
            'duracell': { category: 'L1_DURABLES', reason: 'durables_brand' },
            'syska': { category: 'L1_DURABLES', reason: 'durables_brand' }
        };

        // ============================================================================
        // PRODUCT TYPE CONTEXT - If these phrases are present, override ingredient keywords
        // E.g., "Mango Drink" should be Beverages, not Fresh Fruits
        // ============================================================================
        this.productTypeOverrides = {
            // Beverages indicators (override fruit/vegetable keywords)
            'drink': 'L1_BEVERAGES',
            'juice': 'L1_BEVERAGES',
            'soda': 'L1_BEVERAGES',
            'cola': 'L1_BEVERAGES',
            'energy drink': 'L1_BEVERAGES',
            'water bottle': 'L1_BEVERAGES',
            'mineral water': 'L1_BEVERAGES',
            'tetra pack': 'L1_BEVERAGES',
            'soft drink': 'L1_BEVERAGES',

            // Snacks indicators (override vegetable/spice keywords)
            'chips': 'L1_PACKAGED',
            'namkeen': 'L1_PACKAGED',
            'bhujia': 'L1_PACKAGED',
            'mixture': 'L1_PACKAGED',
            'munch': 'L1_PACKAGED',
            'snack': 'L1_PACKAGED',
            'wafer': 'L1_PACKAGED',
            'papad': 'L1_PACKAGED',
            'fryums': 'L1_PACKAGED',

            // Biscuit/Cookie indicators
            'biscuit': 'L1_PACKAGED',
            'biscuits': 'L1_PACKAGED',
            'cookies': 'L1_PACKAGED',
            'cookie': 'L1_PACKAGED',
            'rusk': 'L1_PACKAGED',
            'bourbon': 'L1_PACKAGED',
            'marie': 'L1_PACKAGED',
            'cream biscuit': 'L1_PACKAGED',

            // Chocolate indicators (override dairy keywords)
            'chocolate': 'L1_PACKAGED',
            'choco': 'L1_PACKAGED',
            'candy': 'L1_PACKAGED',
            'toffee': 'L1_PACKAGED',

            // Instant food indicators
            'noodles': 'L1_PACKAGED',
            'instant': 'L1_PACKAGED',
            '2 minute': 'L1_PACKAGED',
            '2-minute': 'L1_PACKAGED',
            'ready to eat': 'L1_PACKAGED',
            'cup noodles': 'L1_PACKAGED',

            // Household indicators (override cooking keywords)
            'toilet cleaner': 'L1_HOME_CARE',
            'floor cleaner': 'L1_HOME_CARE',
            'glass cleaner': 'L1_HOME_CARE',
            'dish wash': 'L1_HOME_CARE',
            'dishwash': 'L1_HOME_CARE',
            'detergent': 'L1_HOME_CARE',
            'washing powder': 'L1_HOME_CARE',
            'fabric softener': 'L1_HOME_CARE',
            'mosquito': 'L1_HOME_CARE',
            'insect': 'L1_HOME_CARE',
            'coil': 'L1_HOME_CARE',
            'spray': 'L1_HOME_CARE',
            'refill': 'L1_HOME_CARE',
            'freshener': 'L1_HOME_CARE',
            'cleaner': 'L1_HOME_CARE',
            'insulated': 'L1_DURABLES',
            'standard toilette': 'L1_HOME_CARE',
            'gas soap': 'L1_HOME_CARE',
            'toilette': 'L1_HOME_CARE',
            'toilet': 'L1_HOME_CARE',
            'glass': 'L1_HOME_CARE', // Aggressive rule for "Glass" (likely cleaner)
            'led': 'L1_DURABLES', // Aggressive rule for AGARO LED items
            'bars': 'L1_PACKAGED', // Ambiguous "Bars" -> Snacks/Chocolates

            // Personal Care & Beauty
            'shampoo': 'L1_PERSONAL_CARE',
            'conditioner': 'L1_PERSONAL_CARE',
            'soap': 'L1_PERSONAL_CARE',
            'body wash': 'L1_PERSONAL_CARE',
            'face wash': 'L1_PERSONAL_CARE',
            'toothpaste': 'L1_PERSONAL_CARE',
            'toothbrush': 'L1_PERSONAL_CARE',
            'mouthwash': 'L1_PERSONAL_CARE',
            'lotion': 'L1_PERSONAL_CARE',
            'petroleum jelly': 'L1_PERSONAL_CARE',
            'hair oil': 'L1_PERSONAL_CARE',
            'cream': 'L1_PERSONAL_CARE',
            'moisturizer': 'L1_PERSONAL_CARE',
            'sunscreen': 'L1_PERSONAL_CARE',
            'deo': 'L2_FRAGRANCE',
            'deodorant': 'L2_FRAGRANCE',
            'perfume': 'L2_FRAGRANCE',
            'parfum': 'L2_FRAGRANCE',
            'cologne': 'L2_FRAGRANCE',
            'attar': 'L2_FRAGRANCE',
            'eau de': 'L2_FRAGRANCE',
            'scent': 'L2_FRAGRANCE',
            'body spray': 'L2_FRAGRANCE',
            'talc': 'L1_PERSONAL_CARE',
            'shaving': 'L1_PERSONAL_CARE',
            'razor': 'L1_PERSONAL_CARE',
            'trimmer': 'L1_PERSONAL_CARE',
            'sanitary': 'L1_PERSONAL_CARE',
            'pads': 'L1_PERSONAL_CARE',
            'hand milk': 'L1_PERSONAL_CARE', // synthetic data match
            'led soap': 'L1_PERSONAL_CARE',
            'moisturising': 'L1_PERSONAL_CARE',
            'sandal': 'L1_PERSONAL_CARE',

            // Frozen indicators
            'ice cream': 'L1_FROZEN',
            'frozen': 'L1_FROZEN',
            'french fries': 'L1_FROZEN',
            'nuggets': 'L1_FROZEN',
            'cornetto': 'L1_FROZEN',
            'kulfi': 'L1_FROZEN',

            // Staples Priority (High Confidence)
            'atta': 'L3_WHEAT_ATTA',
            'rice': 'L3_RICE',
            'oil': 'L3_COOKING_OILS',
            'ghee': 'L3_GHEE_VANASPATI'
        };

        // ============================================================================
        // FRESH PRODUCE RULES - Only match these if NO product type override matched
        // ============================================================================
        this.freshProduceRules = {
            // Fresh Vegetables (match only if standalone or with pack indicators)
            'onion': 'L2_FRESH_VEGETABLES',
            'potato': 'L2_FRESH_VEGETABLES',
            'tomato': 'L2_FRESH_VEGETABLES',
            'cabbage': 'L2_FRESH_VEGETABLES',
            'carrot': 'L2_FRESH_VEGETABLES',
            'green chilli': 'L2_FRESH_VEGETABLES',
            'ginger': 'L2_FRESH_VEGETABLES',
            'garlic': 'L2_FRESH_VEGETABLES',
            'coriander leaves': 'L2_FRESH_VEGETABLES',
            'curry leaves': 'L2_FRESH_VEGETABLES',
            'spinach': 'L2_FRESH_VEGETABLES',
            'palak': 'L2_FRESH_VEGETABLES',
            'methi': 'L2_FRESH_VEGETABLES',
            'bhindi': 'L2_FRESH_VEGETABLES',
            'lady finger': 'L2_FRESH_VEGETABLES',
            'cauliflower': 'L2_FRESH_VEGETABLES',
            'gobhi': 'L2_FRESH_VEGETABLES',
            'brinjal': 'L2_FRESH_VEGETABLES',
            'baingan': 'L2_FRESH_VEGETABLES',
            'capsicum': 'L2_FRESH_VEGETABLES',
            'beans': 'L2_FRESH_VEGETABLES',
            'cucumber': 'L2_FRESH_VEGETABLES',
            'bitter gourd': 'L2_FRESH_VEGETABLES',
            'karela': 'L2_FRESH_VEGETABLES',
            'peas': 'L2_FRESH_VEGETABLES',
            'matar': 'L2_FRESH_VEGETABLES',
            'drumstick': 'L2_FRESH_VEGETABLES',

            // Fresh Fruits (match only if standalone)
            'banana': 'L2_FRESH_FRUITS',
            'apple': 'L2_FRESH_FRUITS',
            'orange': 'L2_FRESH_FRUITS',
            'mango': 'L2_FRESH_FRUITS',
            'papaya': 'L2_FRESH_FRUITS',
            'grapes': 'L2_FRESH_FRUITS',
            'pomegranate': 'L2_FRESH_FRUITS',
            'watermelon': 'L2_FRESH_FRUITS',
            'muskmelon': 'L2_FRESH_FRUITS',
            'guava': 'L2_FRESH_FRUITS',
            'mosambi': 'L2_FRESH_FRUITS',
            'lemon': 'L2_FRESH_FRUITS',
            'chikoo': 'L2_FRESH_FRUITS',
            'pineapple': 'L2_FRESH_FRUITS',
            'kiwi': 'L2_FRESH_FRUITS',
            'litchi': 'L2_FRESH_FRUITS'
        };

        // ============================================================================
        // DAIRY PRODUCT RULES - Match only if product is actually dairy
        // ============================================================================
        this.dairyRules = {
            'milk': 'L2_MILK',
            'curd': 'L2_CURD_YOGURT',
            'dahi': 'L2_CURD_YOGURT',
            'yogurt': 'L2_CURD_YOGURT',
            'paneer': 'L2_MILK',
            'butter': 'L2_MILK',
            'cheese': 'L2_MILK',
            'ghee': 'L1_STAPLES',
            'cream': 'L2_MILK',
            'khoya': 'L2_MILK',
            'shrikhand': 'L2_CURD_YOGURT',
            'lassi': 'L2_CURD_YOGURT',
            'chaach': 'L2_CURD_YOGURT',
            'buttermilk': 'L2_CURD_YOGURT'
        };

        // ============================================================================
        // EGGS RULES
        // ============================================================================
        this.eggRules = {
            'egg': 'L2_EGGS',
            'eggs': 'L2_EGGS',
            'anda': 'L2_EGGS',
            'white eggs': 'L2_EGGS',
            'brown eggs': 'L2_EGGS',
            'desi eggs': 'L2_EGGS',
            'farm fresh': 'L2_EGGS',
            'egg tray': 'L2_EGGS'
        };

        // ============================================================================
        // STAPLES RULES
        // ============================================================================
        this.stapleRules = {
            'salt': 'L1_STAPLES',
            'atta': 'L1_STAPLES',
            'flour': 'L1_STAPLES',
            'rice': 'L1_STAPLES',
            'basmati': 'L1_STAPLES',
            'dal': 'L1_STAPLES',
            'chana dal': 'L1_STAPLES',
            'moong dal': 'L1_STAPLES',
            'toor dal': 'L1_STAPLES',
            'urad dal': 'L1_STAPLES',
            'masoor dal': 'L1_STAPLES',
            'sugar': 'L1_STAPLES',
            'jaggery': 'L1_STAPLES',
            'gur': 'L1_STAPLES',
            'oil': 'L1_STAPLES',
            'cooking oil': 'L1_STAPLES',
            'sunflower oil': 'L1_STAPLES',
            'mustard oil': 'L1_STAPLES',
            'groundnut oil': 'L1_STAPLES',
            'soyabean oil': 'L1_STAPLES',
            'ghee': 'L1_STAPLES',
            'honey': 'L1_STAPLES',
            'besan': 'L1_STAPLES',
            'maida': 'L1_STAPLES',
            'suji': 'L1_STAPLES',
            'rava': 'L1_STAPLES',
            'poha': 'L1_STAPLES',
            'rajma': 'L1_STAPLES',
            'chhole': 'L1_STAPLES',
            'chole': 'L1_STAPLES',
            'kabuli chana': 'L1_STAPLES',
            'chana': 'L1_STAPLES'
        };

        // ============================================================================
        // SPICE RULES
        // ============================================================================
        this.spiceRules = {
            'masala': 'L2_SPICES_MASALAS',
            'garam masala': 'L2_SPICES_MASALAS',
            'chana masala': 'L2_SPICES_MASALAS',
            'chicken masala': 'L2_SPICES_MASALAS',
            'pav bhaji masala': 'L2_SPICES_MASALAS',
            'biryani masala': 'L2_SPICES_MASALAS',
            'turmeric': 'L2_SPICES_MASALAS',
            'haldi': 'L2_SPICES_MASALAS',
            'chilli powder': 'L2_SPICES_MASALAS',
            'red chilli': 'L2_SPICES_MASALAS',
            'chilli': 'L2_SPICES_MASALAS',
            'mirchi': 'L2_SPICES_MASALAS',
            'coriander powder': 'L2_SPICES_MASALAS',
            'dhania powder': 'L2_SPICES_MASALAS',
            'cumin': 'L2_SPICES_MASALAS',
            'jeera': 'L2_SPICES_MASALAS',
            'pepper': 'L2_SPICES_MASALAS',
            'kali mirch': 'L2_SPICES_MASALAS',
            'mustard seeds': 'L2_SPICES_MASALAS',
            'rai': 'L2_SPICES',
            'methi seeds': 'L2_SPICES',
            'ajwain': 'L2_SPICES',
            'saunf': 'L2_SPICES',
            'fennel': 'L2_SPICES',
            'cardamom': 'L2_SPICES',
            'elaichi': 'L2_SPICES',
            'cloves': 'L2_SPICES',
            'laung': 'L2_SPICES',
            'cinnamon': 'L2_SPICES',
            'dalchini': 'L2_SPICES',
            'bay leaves': 'L2_SPICES',
            'tej patta': 'L2_SPICES',
            'sambhar powder': 'L2_SPICES',
            'rasam powder': 'L2_SPICES'
        };

        // ============================================================================
        // BABY CARE RULES
        // ============================================================================
        this.babyCareRules = {
            'diaper': 'L1_BABY',
            'diapers': 'L1_BABY',
            'baby food': 'L1_BABY',
            'baby powder': 'L1_BABY',
            'baby oil': 'L1_BABY',
            'baby soap': 'L1_BABY',
            'baby lotion': 'L1_BABY',
            'baby shampoo': 'L1_BABY',
            'baby cream': 'L1_BABY',
            'baby wipes': 'L1_BABY',
            'milk powder': 'L1_BABY'
        };

        // ============================================================================
        // PET CARE RULES
        // ============================================================================
        this.petCareRules = {
            'dog food': 'L1_PET',
            'cat food': 'L1_PET',
            'pet food': 'L1_PET',
            'puppy food': 'L1_PET',
            'kitten food': 'L1_PET',
            'pet treats': 'L1_PET'
        };

        // ============================================================================
        // DURABLES RULES
        // ============================================================================
        this.durableRules = {
            'battery': 'L1_DURABLES',
            'batteries': 'L1_DURABLES',
            'led bulb': 'L1_DURABLES',
            'cfl': 'L1_DURABLES',
            'tube light': 'L1_DURABLES',
            'extension cord': 'L1_DURABLES',
            'plug': 'L1_DURABLES',
            'switch': 'L1_DURABLES'
        };

        // ============================================================================
        // FORBIDDEN COMBINATIONS - NEVER match these
        // ============================================================================
        this.forbiddenCombinations = [
            // Cadbury + any dairy keyword = NEVER dairy
            { brand: 'cadbury', forbiddenCategory: 'L2_MILK' },
            { brand: 'cadbury', forbiddenCategory: 'L1_DAIRY' },
            // Frooti/Maaza + any fruit keyword = NEVER fresh fruits
            { brand: 'frooti', forbiddenCategory: 'L2_FRESH_FRUITS' },
            { brand: 'maaza', forbiddenCategory: 'L2_FRESH_FRUITS' },
            { brand: 'slice', forbiddenCategory: 'L2_FRESH_FRUITS' },
            // Snack brands + any vegetable/spice = NEVER fresh produce
            { brand: 'lays', forbiddenCategory: 'L2_FRESH_VEGETABLES' },
            { brand: 'kurkure', forbiddenCategory: 'L2_SPICES' },
            { brand: 'haldiram', forbiddenCategory: 'L2_SPICES' },
            // Household + Staples confusion
            { brand: 'harpic', forbiddenCategory: 'L1_STAPLES' },
            { brand: 'domex', forbiddenCategory: 'L1_STAPLES' },
            { brand: 'good knight', forbiddenCategory: 'L1_STAPLES' }
        ];
    }

    async initialize(catalog) {
        this.catalog = catalog;
        this.buildCategoryIndex();
        console.log('✅ CatalogMapper initialized with robust context-aware rules');
    }

    buildCategoryIndex() {
        this.categoryIndex = new Map();
        if (this.catalog && this.catalog.categories) {
            const addCategories = (cats) => {
                cats.forEach(cat => {
                    this.categoryIndex.set(cat.category_id, cat);
                    if (cat.children && cat.children.length > 0) {
                        addCategories(cat.children);
                    }
                });
            };
            addCategories(this.catalog.categories);
        }
    }

    /**
     * Map multiple items with robust context-aware logic
     */
    async mapItems(items) {
        const results = [];
        const unknownItems = [];

        console.log(`🔍 Mapping ${items.length} items with context-aware rules...`);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const result = await this.mapItemRobust(item);

            if (result.category_id === 'L1_UNCATEGORIZED') {
                unknownItems.push({ item, originalIndex: i });
            }

            results.push({ ...item, ...result });
        }

        // LLM fallback for uncategorized items
        if (unknownItems.length > 0 && this.llmCategorizer) {
            console.log(`🧠 Handing off ${unknownItems.length} unknown items to LLM...`);
            try {
                const batchResults = await this.llmCategorizer.categorizeBatch(
                    unknownItems.map(u => ({
                        name: u.item.product_name_original || u.item.product_name_normalized,
                        brand: u.item.brand
                    }))
                );

                batchResults.forEach((llmRes, idx) => {
                    if (llmRes && llmRes.category_id !== 'L1_UNCATEGORIZED') {
                        const originalIdx = unknownItems[idx].originalIndex;
                        results[originalIdx] = {
                            ...results[originalIdx],
                            category_id: llmRes.category_id,
                            category_name: llmRes.category_name,
                            mapping_confidence: llmRes.confidence || 0.85,
                            mapping_method: 'llm_fallback',
                            mapping_reason: 'gemini_flash',
                            fromCache: llmRes.fromCache
                        };
                    }
                });
            } catch (error) {
                console.error('❌ LLM Batch processing failed:', error.message);
            }
        }

        return results;
    }

    /**
     * ROBUST MAPPING - Context-aware categorization
     * Priority Order:
     * 1. Brand Override (HIGHEST) - Known brands always win
     * 2. Product Type Context - "drink", "chips", "biscuit" override ingredients
     * 3. Specific Keywords - eggs, baby care, pet care, durables
     * 4. Dairy Rules - Only for actual dairy products
     * 5. Fresh Produce - Only if no packaged product indicators
     * 6. Staples & Spices - General cooking items
     * 7. LLM Fallback - For truly unknown items
     */
    async mapItemRobust(item) {
        if (!item.product_name_normalized) {
            return this.createResult('L1_UNCATEGORIZED', 0.30, 'error', 'missing_product_name');
        }

        const productName = String(item.product_name_normalized).toLowerCase();
        const brand = item.brand ? String(item.brand).toLowerCase() : null;

        // =====================================================
        // STEP 1: PRODUCT TYPE CONTEXT (PRE-EMPTIVE)
        // Check for "High Confidence" indicators that override brands
        // E.g., "Soap", "Shampoo", "Diaper" should NOT be hijacked by food brands
        // =====================================================
        const productTypeMatch = this.checkProductTypeOverride(productName);
        const highConfidenceTypes = ['L1_PERSONAL_CARE', 'L1_BABY', 'L1_PET', 'L1_DURABLES', 'L2_FRAGRANCE'];

        if (productTypeMatch && highConfidenceTypes.includes(productTypeMatch.category)) {
            return this.createResult(
                productTypeMatch.category,
                0.96,
                'high_confidence_type',
                productTypeMatch.keyword
            );
        }

        // =====================================================
        // STEP 2: BRAND OVERRIDE
        // =====================================================
        const brandOverride = this.checkBrandOverride(productName, brand);
        if (brandOverride) {
            return this.createResult(
                brandOverride.category,
                0.95,
                'brand_override',
                brandOverride.reason
            );
        }

        // =====================================================
        // STEP 3: GENERAL PRODUCT TYPE CONTEXT
        // =====================================================
        if (productTypeMatch) {
            return this.createResult(
                productTypeMatch.category,
                0.92,
                'product_type_context',
                productTypeMatch.keyword
            );
        }

        // =====================================================
        // STEP 3: SPECIFIC CATEGORY RULES (no ambiguity)
        // Eggs, Baby Care, Pet Care, Durables
        // =====================================================

        // EGGS
        const eggMatch = this.checkRuleSet(productName, this.eggRules);
        if (eggMatch) {
            return this.createResult(eggMatch.category, 0.95, 'hard_rule', 'egg_product');
        }

        // BABY CARE
        const babyMatch = this.checkRuleSet(productName, this.babyCareRules);
        if (babyMatch) {
            return this.createResult(babyMatch.category, 0.95, 'hard_rule', 'baby_care_product');
        }

        // PET CARE
        const petMatch = this.checkRuleSet(productName, this.petCareRules);
        if (petMatch) {
            return this.createResult(petMatch.category, 0.95, 'hard_rule', 'pet_care_product');
        }

        // DURABLES
        const durableMatch = this.checkRuleSet(productName, this.durableRules);
        if (durableMatch) {
            return this.createResult(durableMatch.category, 0.95, 'hard_rule', 'durable_product');
        }

        // =====================================================
        // STEP 4: DAIRY RULES
        // Match only if product is actual dairy (not chocolate with "milk" in name)
        // =====================================================
        if (!this.hasPackagedProductIndicator(productName)) {
            const dairyMatch = this.checkRuleSet(productName, this.dairyRules);
            if (dairyMatch) {
                return this.createResult(dairyMatch.category, 0.95, 'hard_rule', 'dairy_product');
            }
        }

        // =====================================================
        // STEP 5: SPICE RULES  
        // Match masala/spice products (but not snacks with masala flavor)
        // =====================================================
        if (!this.hasSnackIndicator(productName)) {
            const spiceMatch = this.checkRuleSet(productName, this.spiceRules);
            if (spiceMatch) {
                return this.createResult(spiceMatch.category, 0.90, 'hard_rule', 'spice_product');
            }
        }

        // =====================================================
        // STEP 6: FRESH PRODUCE RULES
        // Match only if NO packaged product indicators present
        // =====================================================
        if (!this.hasPackagedProductIndicator(productName)) {
            const freshMatch = this.checkRuleSet(productName, this.freshProduceRules);
            if (freshMatch) {
                return this.createResult(freshMatch.category, 0.95, 'hard_rule', 'fresh_produce');
            }
        }

        // =====================================================
        // STEP 7: STAPLE RULES
        // General cooking staples
        // =====================================================
        const stapleMatch = this.checkRuleSet(productName, this.stapleRules);
        if (stapleMatch) {
            return this.createResult(stapleMatch.category, 0.90, 'hard_rule', 'staple_item');
        }

        // =====================================================
        // STEP 8: FALLBACK - Uncategorized
        // =====================================================
        return this.createResult('L1_UNCATEGORIZED', 0.30, 'fallback', 'no_confident_match');
    }

    /**
     * Check brand override rules - HIGHEST PRIORITY
     * Uses word boundary matching for single-word brands to prevent false matches
     * IMPORTANT: Scans product name FIRST (sorted by length) to ensure
     * longer brand phrases like 'ice cream' match before short brand names like 'amul'
     */
    checkBrandOverride(productName, brand) {
        // FIRST: Check for brand names within product name (sorted by length for multi-word brands)
        // This ensures "amul ice cream" matches "ice cream" => L1_FROZEN before "amul" => L1_DAIRY
        const sortedBrands = Object.keys(this.brandOverrides).sort((a, b) => b.length - a.length);
        for (const brandKey of sortedBrands) {
            // For multi-word brands, simple include check is fine
            if (brandKey.includes(' ')) {
                if (productName.includes(brandKey)) {
                    return this.brandOverrides[brandKey];
                }
            } else {
                // For single-word brands, use word boundary matching
                // This prevents 'slice' from matching 'slices' in 'cheese slices'
                const regex = new RegExp(`\\b${brandKey}\\b`, 'i');
                if (regex.test(productName)) {
                    return this.brandOverrides[brandKey];
                }
            }
        }

        // SECOND: Fall back to explicit brand if no product name match found
        if (brand) {
            const brandLower = brand.toLowerCase();
            if (this.brandOverrides[brandLower]) {
                return this.brandOverrides[brandLower];
            }
        }

        return null;
    }

    /**
     * Check product type overrides - Context-aware categorization
     */
    checkProductTypeOverride(productName) {
        // Sort by length to match longer phrases first (e.g., "ice cream" before "cream")
        const sortedTypes = Object.keys(this.productTypeOverrides).sort((a, b) => b.length - a.length);

        for (const keyword of sortedTypes) {
            if (productName.includes(keyword)) {
                return {
                    category: this.productTypeOverrides[keyword],
                    keyword: keyword
                };
            }
        }
        return null;
    }

    /**
     * Check a rule set for matches - Returns first match (sorted by length)
     */
    checkRuleSet(productName, ruleSet) {
        const sortedKeywords = Object.keys(ruleSet).sort((a, b) => b.length - a.length);

        for (const keyword of sortedKeywords) {
            // For multi-word keywords or long keywords, include check is usually fine and faster
            if (keyword.length > 4 || keyword.includes(' ')) {
                if (productName.includes(keyword)) {
                    return {
                        category: ruleSet[keyword],
                        keyword: keyword
                    };
                }
            } else {
                // For short keywords (like 'egg', 'oil', 'anda'), use word boundaries
                // to prevent matching 'sandal' or 'soil'
                const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                if (regex.test(productName)) {
                    return {
                        category: ruleSet[keyword],
                        keyword: keyword
                    };
                }
            }
        }
        return null;
    }

    /**
     * Check if product has packaged product indicators
     * (chips, drink, juice, biscuit, chocolate, etc.)
     */
    hasPackagedProductIndicator(productName) {
        const indicators = [
            'drink', 'juice', 'chips', 'biscuit', 'cookie', 'chocolate', 'choco',
            'candy', 'toffee', 'namkeen', 'bhujia', 'mixture', 'snack', 'wafer',
            'noodles', 'instant', 'packed', 'packet', 'tetra', 'bottle'
        ];
        return indicators.some(ind => productName.includes(ind));
    }

    /**
     * Check if product has snack indicators
     * (prevents masala flavored snacks from being categorized as spices)
     */
    hasSnackIndicator(productName) {
        const indicators = [
            'chips', 'namkeen', 'bhujia', 'mixture', 'munch', 'kurkure',
            'snack', 'wafer', 'fryums', 'bingo', 'lays'
        ];
        return indicators.some(ind => productName.includes(ind));
    }

    /**
     * Create result object
     */
    createResult(categoryId, confidence, method, reason) {
        return {
            category_id: categoryId,
            category_name: this.getCategoryName(categoryId),
            mapping_confidence: confidence,
            mapping_method: method,
            mapping_reason: reason
        };
    }

    /**
     * Get human-readable category name from ID
     */
    getCategoryName(categoryId) {
        // Static fallback map for all known categories
        const categoryNames = {
            'L1_STAPLES': 'Staples & Cooking Essentials',
            'L1_PACKAGED': 'Packaged Food & Snacks',
            'L1_BEVERAGES': 'Beverages',
            'L1_PERSONAL_CARE': 'Personal Care & Beauty',
            'L1_HOME_CARE': 'Home Care & Cleaning',
            'L1_DAIRY': 'Milk & Dairy',
            'L1_FRESH': 'Fresh Food & Daily Essentials',
            'L1_FROZEN': 'Frozen & Ice Cream',
            'L1_BABY': 'Baby Care',
            'L1_PET': 'Pet Care',
            'L1_DURABLES': 'Durables & Electronics',
            'L1_PHARMA': 'Health & Wellness',
            'L1_UNCATEGORIZED': 'Uncategorized',
            'L2_MILK': 'Milk',
            'L2_CURD_YOGURT': 'Curd & Yogurt',
            'L2_EGGS': 'Eggs',
            'L2_FRESH_VEGETABLES': 'Fresh Vegetables',
            'L2_FRESH_FRUITS': 'Fresh Fruits',
            'L2_SPICES': 'Spices'
        };


        // Try static map first
        if (categoryNames[categoryId]) {
            return categoryNames[categoryId];
        }

        // Fallback to catalog index
        const category = this.categoryIndex.get(categoryId);
        if (category) {
            return category.name || category.category_name || categoryId;
        }

        return categoryId;
    }

    /**
     * For backward compatibility - redirects to mapItemRobust
     */
    async mapItemDirect(item) {
        return this.mapItemRobust(item);
    }

    /**
     * Find category by name (helper)
     */
    findCategoryByName(name) {
        const normalized = name.toLowerCase().trim();
        for (const [id, category] of this.categoryIndex) {
            const catName = (category.name || category.category_name || '').toLowerCase();
            if (catName === normalized || catName.includes(normalized)) {
                return id;
            }
        }
        return null;
    }
}

module.exports = CatalogMapper;
