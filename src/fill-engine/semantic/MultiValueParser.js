/**
 * MultiValueParser - Parse multi-value cells for checkbox/radio fields
 *
 * Handles Excel cells with multiple values like:
 * - "משכורת חודש, משרה נוספת"
 * - "כללית / מכבי"
 * - "נשוי; גרוש"
 *
 * Returns array of parsed values, each matched to canonical field names.
 */
(function() {
    'use strict';

    const MultiValueParser = {

        // Delimiters for splitting multi-value cells
        DELIMITERS: /[,;\/|]+/,

        // Hebrew delimiter words
        HEBREW_DELIMITERS: ['או', 'ו', 'גם'],

        /**
         * Parse a cell value that may contain multiple values
         * @param {string} value - Raw cell value
         * @returns {Array} Array of parsed value objects
         */
        parse: function(value) {
            if (value === null || value === undefined) {
                return [];
            }

            const strValue = String(value).trim();
            if (!strValue) {
                return [];
            }

            // Check if it's a simple boolean
            if (this.isSimpleBoolean(strValue)) {
                return [{ raw: strValue, type: 'boolean', value: this.parseBoolean(strValue) }];
            }

            // Split by common delimiters
            let parts = strValue.split(this.DELIMITERS);

            // Also try Hebrew word delimiters if we got only one part
            if (parts.length === 1) {
                for (const delim of this.HEBREW_DELIMITERS) {
                    const pattern = new RegExp(`\\s+${delim}\\s+`, 'g');
                    if (pattern.test(strValue)) {
                        parts = strValue.split(pattern);
                        break;
                    }
                }
            }

            // Clean and filter parts
            const results = parts
                .map(p => p.trim())
                .filter(p => p.length > 0)
                .map(p => this.parseValue(p));

            console.log(`[MultiValue] "${strValue}" → [${results.map(r => r.canonical || r.raw).join(', ')}]`);

            return results;
        },

        /**
         * Parse a single value and try to match to canonical
         * @param {string} value - Single value string
         * @returns {Object} Parsed value object
         */
        parseValue: function(value) {
            const result = {
                raw: value,
                normalized: value.toLowerCase().trim(),
                type: 'text',
                canonical: null,
                category: null
            };

            // Try to find canonical match
            const dictionary = window.SEMANTIC_DICTIONARY;
            const categories = window.CANONICAL_CATEGORIES;

            if (dictionary) {
                for (const [canonical, synonyms] of Object.entries(dictionary)) {
                    for (const synonym of synonyms) {
                        if (result.normalized === synonym.toLowerCase() ||
                            result.normalized.includes(synonym.toLowerCase()) ||
                            synonym.toLowerCase().includes(result.normalized)) {
                            result.canonical = canonical;
                            result.type = 'canonical';
                            break;
                        }
                    }
                    if (result.canonical) break;
                }
            }

            // Try to find category
            if (categories && result.canonical) {
                for (const [category, config] of Object.entries(categories)) {
                    if (config.values && config.values.includes(result.canonical)) {
                        result.category = category;
                        break;
                    }
                }
            }

            return result;
        },

        /**
         * Check if value is a simple boolean
         */
        isSimpleBoolean: function(value) {
            const boolValues = ['true', 'false', 'כן', 'לא', 'yes', 'no', '1', '0', 'v', 'x', '✓', '✔', '✕', '✗'];
            return boolValues.includes(value.toLowerCase().trim());
        },

        /**
         * Parse boolean value
         */
        parseBoolean: function(value) {
            const trueValues = ['true', 'כן', 'yes', '1', 'v', 'x', '✓', '✔'];
            return trueValues.includes(value.toLowerCase().trim());
        },

        /**
         * Match parsed values to checkbox fields
         * @param {Array} parsedValues - Array from parse()
         * @param {Array} checkboxFields - Available checkbox field definitions
         * @returns {Array} Array of { fieldId, checked, matchedValue }
         */
        matchToCheckboxes: function(parsedValues, checkboxFields) {
            const matches = [];

            for (const parsed of parsedValues) {
                // Skip if no canonical found
                if (!parsed.canonical && parsed.type !== 'boolean') {
                    // Try fuzzy match on raw value
                    const fuzzyMatch = this.fuzzyMatchToField(parsed.raw, checkboxFields);
                    if (fuzzyMatch) {
                        matches.push({
                            fieldId: fuzzyMatch.id || fuzzyMatch.fieldId,
                            checked: true,
                            matchedValue: parsed.raw,
                            matchType: 'fuzzy'
                        });
                    }
                    continue;
                }

                // Find checkbox field matching this canonical
                for (const field of checkboxFields) {
                    const fieldId = (field.englishId || field.id || '').toLowerCase();
                    const fieldLabel = (field.label || field.hebrewName || '').toLowerCase();

                    // Check if canonical matches field
                    if (parsed.canonical) {
                        const canonicalLower = parsed.canonical.toLowerCase();
                        if (fieldId.includes(canonicalLower) ||
                            canonicalLower.includes(fieldId) ||
                            this.synonymMatchesField(parsed.canonical, field)) {
                            matches.push({
                                fieldId: field.id || field.fieldId,
                                checked: true,
                                matchedValue: parsed.raw,
                                canonical: parsed.canonical,
                                matchType: 'canonical'
                            });
                            break;
                        }
                    }
                }
            }

            if (matches.length > 0) {
                console.log(`[MultiValue] Matched ${matches.length} checkboxes:`, matches.map(m => m.fieldId));
            }

            return matches;
        },

        /**
         * Check if a canonical field's synonyms match a field
         */
        synonymMatchesField: function(canonical, field) {
            const dictionary = window.SEMANTIC_DICTIONARY;
            if (!dictionary || !dictionary[canonical]) return false;

            const fieldLabel = (field.label || field.hebrewName || '').toLowerCase();
            const synonyms = dictionary[canonical];

            for (const syn of synonyms) {
                if (fieldLabel.includes(syn.toLowerCase()) ||
                    syn.toLowerCase().includes(fieldLabel)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Fuzzy match a value to a checkbox field
         */
        fuzzyMatchToField: function(value, checkboxFields) {
            const valueLower = value.toLowerCase().trim();
            const preprocessor = window.Preprocessor;

            for (const field of checkboxFields) {
                const fieldLabel = (field.label || field.hebrewName || '').toLowerCase();

                // Direct contains
                if (fieldLabel.includes(valueLower) || valueLower.includes(fieldLabel)) {
                    return field;
                }

                // Similarity check
                if (preprocessor) {
                    const similarity = preprocessor.calculateSimilarity(valueLower, fieldLabel);
                    if (similarity >= 0.75) {
                        return field;
                    }
                }
            }

            return null;
        },

        /**
         * Process a column that may have multi-value checkbox data
         * @param {string} columnHeader - The Excel column header
         * @param {Array} values - Array of cell values from that column
         * @param {Array} checkboxFields - Available checkbox field definitions
         * @returns {Object} Processing result with field mappings
         */
        processCheckboxColumn: function(columnHeader, values, checkboxFields) {
            const result = {
                header: columnHeader,
                isMultiValue: false,
                fieldMappings: [],
                unmatchedValues: []
            };

            // Analyze values to detect multi-value pattern
            for (const value of values) {
                if (!value) continue;

                const parsed = this.parse(value);

                if (parsed.length > 1) {
                    result.isMultiValue = true;
                }

                const matches = this.matchToCheckboxes(parsed, checkboxFields);
                for (const match of matches) {
                    if (!result.fieldMappings.some(m => m.fieldId === match.fieldId)) {
                        result.fieldMappings.push(match);
                    }
                }

                // Track unmatched
                for (const p of parsed) {
                    if (!matches.some(m => m.matchedValue === p.raw)) {
                        if (!result.unmatchedValues.includes(p.raw)) {
                            result.unmatchedValues.push(p.raw);
                        }
                    }
                }
            }

            return result;
        }
    };

    // Export
    if (typeof window !== 'undefined') {
        window.MultiValueParser = MultiValueParser;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { MultiValueParser };
    }

    console.log('%c📝 MultiValueParser Loaded', 'background: #0891b2; color: white; font-size: 11px; padding: 2px 5px;');

})();
