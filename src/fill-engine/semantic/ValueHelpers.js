/**
 * ValueHelpers - Utility functions for Excel value parsing
 *
 * Provides:
 * - isTruthyCheckbox: Robust checkbox value detection
 * - normalizeDate: Convert any date format to DD/MM/YYYY
 * - parseMultiValue: Split comma-separated values
 */
(function() {
    'use strict';

    const ValueHelpers = {

        /**
         * Check if a value should be considered "checked" for a checkbox
         * Handles various Excel formats and Hebrew values
         *
         * @param {*} val - Value from Excel
         * @returns {boolean} True if checkbox should be checked
         */
        isTruthyCheckbox: function(val) {
            // Direct boolean or number
            if (val === true || val === 1) return true;
            if (val === false || val === 0 || val === null || val === undefined || val === '') return false;

            // String parsing
            if (typeof val === 'string') {
                const v = val.trim().toLowerCase();

                // Truthy string values
                const truthyValues = [
                    'true', '1',
                    'כן',           // Hebrew "yes"
                    'v', 'x',       // Common checkbox marks
                    '✓', '✔',       // Unicode checkmarks
                    'yes', 'y',
                    'on', 'checked'
                ];

                return truthyValues.includes(v);
            }

            return false;
        },

        /**
         * Normalize any date format to DD/MM/YYYY
         * Handles:
         * - Date objects
         * - Excel serial numbers
         * - String formats: DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY, YYYY-MM-DD
         *
         * @param {*} val - Date value from Excel
         * @returns {string} Normalized date string DD/MM/YYYY or empty string
         */
        normalizeDate: function(val) {
            if (!val && val !== 0) return '';

            // Handle Date objects
            if (val instanceof Date) {
                return this.formatDate(val);
            }

            // Handle Excel serial number (number of days since 1900-01-01)
            if (typeof val === 'number') {
                // Excel serial: days since 1899-12-30 (with Excel's leap year bug)
                // JavaScript epoch: 1970-01-01
                // Difference: 25569 days
                try {
                    const excelEpoch = new Date((val - 25569) * 86400 * 1000);
                    if (!isNaN(excelEpoch.getTime())) {
                        return this.formatDate(excelEpoch);
                    }
                } catch (e) {
                    console.warn('[normalizeDate] Failed to parse Excel serial:', val);
                }
                return String(val);
            }

            // Handle string dates
            if (typeof val === 'string') {
                let s = val.trim();
                if (!s) return '';

                // Already in correct format
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
                    return s;
                }

                // Replace dots or dashes with slash: 07.09.1985 or 07-09-1985 → 07/09/1985
                s = s.replace(/[.\-]/g, '/');

                // Try DD/MM/YYYY or DD/MM/YY format
                const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
                if (dmyMatch) {
                    let [, d, m, y] = dmyMatch;
                    // Handle 2-digit year
                    if (y.length === 2) {
                        y = parseInt(y) > 50 ? '19' + y : '20' + y;
                    }
                    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                }

                // Try YYYY/MM/DD (ISO-like) format
                const ymdMatch = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
                if (ymdMatch) {
                    const [, y, m, d] = ymdMatch;
                    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                }

                // Try parsing as Date object
                try {
                    const parsed = new Date(val);
                    if (!isNaN(parsed.getTime())) {
                        return this.formatDate(parsed);
                    }
                } catch (e) {
                    // Parsing failed, return original
                }

                return val; // Return original if can't parse
            }

            return String(val);
        },

        /**
         * Format a Date object to DD/MM/YYYY
         * @param {Date} d - Date object
         * @returns {string} Formatted date string
         */
        formatDate: function(d) {
            if (!(d instanceof Date) || isNaN(d.getTime())) {
                return '';
            }
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
        },

        /**
         * Parse multi-value string into array
         * Handles: "value1, value2, value3" or "value1; value2"
         *
         * @param {string} val - Comma or semicolon separated values
         * @returns {Array} Array of trimmed values
         */
        parseMultiValue: function(val) {
            if (!val || typeof val !== 'string') return [];

            // Split by comma, semicolon, or slash
            return val
                .split(/[,;\/]+/)
                .map(v => v.trim())
                .filter(v => v.length > 0);
        },

        /**
         * Check if a value semantically matches a field label
         * Used for multi-value checkbox matching
         *
         * @param {string} value - Value to match
         * @param {string} label - Field label to match against
         * @returns {boolean} True if matches
         */
        semanticMatch: function(value, label) {
            if (!value || !label) return false;

            const valLower = value.toLowerCase().trim();
            const labelLower = label.toLowerCase().trim();

            // Exact match
            if (valLower === labelLower) return true;

            // Contains match (for partial labels)
            if (labelLower.includes(valLower) || valLower.includes(labelLower)) return true;

            // Check dictionary synonyms if available
            const dictionary = window.SEMANTIC_DICTIONARY;
            if (dictionary) {
                for (const [canonical, synonyms] of Object.entries(dictionary)) {
                    // Check if value matches any synonym
                    const valueMatchesSynonym = synonyms.some(syn =>
                        syn.toLowerCase() === valLower ||
                        syn.toLowerCase().includes(valLower) ||
                        valLower.includes(syn.toLowerCase())
                    );

                    // Check if label matches same canonical
                    const labelMatchesSynonym = synonyms.some(syn =>
                        syn.toLowerCase() === labelLower ||
                        syn.toLowerCase().includes(labelLower) ||
                        labelLower.includes(syn.toLowerCase())
                    );

                    if (valueMatchesSynonym && labelMatchesSynonym) {
                        return true;
                    }
                }
            }

            return false;
        },

        /**
         * Match multi-value string to multiple checkbox fields
         * Returns array of field IDs that should be checked
         *
         * @param {string} value - Multi-value string (e.g., "משכורת חודש, משרה נוספת")
         * @param {Array} checkboxFields - Array of checkbox field definitions
         * @returns {Array} Array of matching field IDs
         */
        matchMultiValueToCheckboxes: function(value, checkboxFields) {
            const matches = [];
            const parts = this.parseMultiValue(value);

            if (parts.length === 0) return matches;

            console.log(`[MultiValue] Parsing "${value}" → [${parts.join(', ')}]`);

            for (const part of parts) {
                for (const field of checkboxFields) {
                    const fieldLabel = field.label || field.hebrewName || field.label_he || '';
                    const fieldId = field.id || field.fieldId;

                    if (this.semanticMatch(part, fieldLabel)) {
                        if (!matches.includes(fieldId)) {
                            matches.push(fieldId);
                            console.log(`[MultiValue] "${part}" matches "${fieldLabel}" → ${fieldId}`);
                        }
                    }
                }
            }

            return matches;
        }
    };

    // Export
    if (typeof window !== 'undefined') {
        window.ValueHelpers = ValueHelpers;
        // Also expose individual functions for convenience
        window.isTruthyCheckbox = ValueHelpers.isTruthyCheckbox.bind(ValueHelpers);
        window.normalizeDate = ValueHelpers.normalizeDate.bind(ValueHelpers);
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ValueHelpers };
    }

    console.log('%c🔧 ValueHelpers Loaded', 'background: #059669; color: white; font-size: 11px; padding: 2px 5px;');

})();
