/**
 * CanonicalCategories - Enum-like groupings for related checkbox/radio fields
 *
 * Maps categories to their possible values (canonical field names).
 * Used to:
 * 1. Group related checkboxes (e.g., income_type → monthly, partial, additional)
 * 2. Enable "smart" matching of multi-value cells
 * 3. Provide validation for enum-like fields
 */
(function() {
    'use strict';

    const CANONICAL_CATEGORIES = {

        // === Income Type (Form 101) ===
        income_type: {
            label: 'סוג הכנסה',
            label_en: 'Income Type',
            type: 'checkbox', // Can select multiple
            values: [
                'income_type_monthly',
                'income_type_partial',
                'income_type_additional'
            ],
            // Map Hebrew values to canonical
            valueMap: {
                'משכורת חודש': 'income_type_monthly',
                'משכורת חודשית': 'income_type_monthly',
                'חודשי': 'income_type_monthly',
                'חודש': 'income_type_monthly',
                'monthly': 'income_type_monthly',
                'משכורת חלקית': 'income_type_partial',
                'חלקית': 'income_type_partial',
                'משרה חלקית': 'income_type_partial',
                'partial': 'income_type_partial',
                'משרה נוספת': 'income_type_additional',
                'משכורת בעד משרה נוספת': 'income_type_additional',
                'עבודה נוספת': 'income_type_additional',
                'נוספת': 'income_type_additional',
                'additional': 'income_type_additional'
            }
        },

        // === Marital Status ===
        marital_status: {
            label: 'מצב משפחתי',
            label_en: 'Marital Status',
            type: 'radio', // Single selection
            values: [
                'marital_single',
                'marital_married',
                'marital_divorced',
                'marital_widowed',
                'marital_separated'
            ],
            valueMap: {
                'רווק': 'marital_single',
                'רווקה': 'marital_single',
                'single': 'marital_single',
                'נשוי': 'marital_married',
                'נשואה': 'marital_married',
                'married': 'marital_married',
                'גרוש': 'marital_divorced',
                'גרושה': 'marital_divorced',
                'divorced': 'marital_divorced',
                'אלמן': 'marital_widowed',
                'אלמנה': 'marital_widowed',
                'widowed': 'marital_widowed',
                'פרוד': 'marital_separated',
                'פרודה': 'marital_separated',
                'separated': 'marital_separated'
            }
        },

        // === Gender ===
        gender: {
            label: 'מין',
            label_en: 'Gender',
            type: 'radio',
            values: [
                'gender_male',
                'gender_female'
            ],
            valueMap: {
                'זכר': 'gender_male',
                'גבר': 'gender_male',
                'ז': 'gender_male',
                'm': 'gender_male',
                'male': 'gender_male',
                'נקבה': 'gender_female',
                'אישה': 'gender_female',
                'נ': 'gender_female',
                'f': 'gender_female',
                'female': 'gender_female'
            }
        },

        // === Health Fund ===
        health_fund: {
            label: 'קופת חולים',
            label_en: 'Health Fund',
            type: 'radio',
            values: [
                'health_fund_clalit',
                'health_fund_maccabi',
                'health_fund_meuhedet',
                'health_fund_leumit'
            ],
            valueMap: {
                'כללית': 'health_fund_clalit',
                'clalit': 'health_fund_clalit',
                'מכבי': 'health_fund_maccabi',
                'maccabi': 'health_fund_maccabi',
                'מאוחדת': 'health_fund_meuhedet',
                'meuhedet': 'health_fund_meuhedet',
                'לאומית': 'health_fund_leumit',
                'leumit': 'health_fund_leumit'
            }
        },

        // === Resident Status ===
        resident_status: {
            label: 'תושבות',
            label_en: 'Resident Status',
            type: 'radio',
            values: [
                'resident_israel',
                'resident_foreign'
            ],
            valueMap: {
                'תושב ישראל': 'resident_israel',
                'ישראלי': 'resident_israel',
                'תושב': 'resident_israel',
                'israel': 'resident_israel',
                'resident': 'resident_israel',
                'תושב חוץ': 'resident_foreign',
                'זר': 'resident_foreign',
                'foreign': 'resident_foreign'
            }
        }
    };

    /**
     * Find category for a canonical field
     * @param {string} canonical - Canonical field name
     * @returns {Object|null} Category info
     */
    function findCategoryForCanonical(canonical) {
        for (const [categoryName, category] of Object.entries(CANONICAL_CATEGORIES)) {
            if (category.values.includes(canonical)) {
                return {
                    category: categoryName,
                    ...category
                };
            }
        }
        return null;
    }

    /**
     * Resolve a value to canonical using category valueMap
     * @param {string} value - Raw value from Excel
     * @param {string} categoryName - Optional category hint
     * @returns {Object|null} { canonical, category }
     */
    function resolveValueToCanonical(value, categoryName = null) {
        const valueLower = String(value).toLowerCase().trim();

        // If category specified, search only that
        if (categoryName && CANONICAL_CATEGORIES[categoryName]) {
            const category = CANONICAL_CATEGORIES[categoryName];
            for (const [key, canonical] of Object.entries(category.valueMap)) {
                if (valueLower === key.toLowerCase() ||
                    valueLower.includes(key.toLowerCase()) ||
                    key.toLowerCase().includes(valueLower)) {
                    return {
                        canonical: canonical,
                        category: categoryName,
                        matchedValue: key
                    };
                }
            }
        }

        // Search all categories
        for (const [catName, category] of Object.entries(CANONICAL_CATEGORIES)) {
            for (const [key, canonical] of Object.entries(category.valueMap)) {
                if (valueLower === key.toLowerCase()) {
                    return {
                        canonical: canonical,
                        category: catName,
                        matchedValue: key
                    };
                }
            }
        }

        // Partial match (less strict)
        for (const [catName, category] of Object.entries(CANONICAL_CATEGORIES)) {
            for (const [key, canonical] of Object.entries(category.valueMap)) {
                if (key.length > 3 &&
                    (valueLower.includes(key.toLowerCase()) ||
                     key.toLowerCase().includes(valueLower))) {
                    return {
                        canonical: canonical,
                        category: catName,
                        matchedValue: key,
                        partial: true
                    };
                }
            }
        }

        return null;
    }

    /**
     * Get all values for a category
     * @param {string} categoryName - Category name
     * @returns {Array} Array of canonical field names
     */
    function getCategoryValues(categoryName) {
        const category = CANONICAL_CATEGORIES[categoryName];
        return category ? category.values : [];
    }

    /**
     * Detect category from column header
     * @param {string} header - Excel column header
     * @returns {Object|null} Detected category info
     */
    function detectCategoryFromHeader(header) {
        const headerLower = String(header).toLowerCase().trim();

        for (const [categoryName, category] of Object.entries(CANONICAL_CATEGORIES)) {
            // Check label match
            if (headerLower.includes(category.label.toLowerCase()) ||
                headerLower.includes(category.label_en.toLowerCase())) {
                return {
                    category: categoryName,
                    ...category
                };
            }

            // Check synonyms from dictionary
            const dictionary = window.SEMANTIC_DICTIONARY;
            if (dictionary && dictionary[categoryName]) {
                for (const syn of dictionary[categoryName]) {
                    if (headerLower.includes(syn.toLowerCase())) {
                        return {
                            category: categoryName,
                            ...category
                        };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Process multi-value cell using category
     * @param {string} value - Cell value (may contain multiple values)
     * @param {string} categoryName - Category name
     * @returns {Array} Array of matched canonical field names
     */
    function processMultiValueForCategory(value, categoryName) {
        const results = [];

        // Use MultiValueParser if available
        const parser = window.MultiValueParser;
        if (parser) {
            const parsed = parser.parse(value);
            for (const p of parsed) {
                const resolved = resolveValueToCanonical(p.raw, categoryName);
                if (resolved) {
                    results.push(resolved);
                }
            }
        } else {
            // Fallback: simple comma split
            const parts = String(value).split(/[,;\/]+/);
            for (const part of parts) {
                const resolved = resolveValueToCanonical(part.trim(), categoryName);
                if (resolved) {
                    results.push(resolved);
                }
            }
        }

        if (results.length > 0) {
            console.log(`[Category] "${value}" → [${results.map(r => r.canonical).join(', ')}] (category: ${categoryName})`);
        }

        return results;
    }

    // Export
    if (typeof window !== 'undefined') {
        window.CANONICAL_CATEGORIES = CANONICAL_CATEGORIES;
        window.findCategoryForCanonical = findCategoryForCanonical;
        window.resolveValueToCanonical = resolveValueToCanonical;
        window.getCategoryValues = getCategoryValues;
        window.detectCategoryFromHeader = detectCategoryFromHeader;
        window.processMultiValueForCategory = processMultiValueForCategory;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            CANONICAL_CATEGORIES,
            findCategoryForCanonical,
            resolveValueToCanonical,
            getCategoryValues,
            detectCategoryFromHeader,
            processMultiValueForCategory
        };
    }

    console.log('%c📋 CanonicalCategories Loaded', 'background: #7c3aed; color: white; font-size: 11px; padding: 2px 5px;');

})();
