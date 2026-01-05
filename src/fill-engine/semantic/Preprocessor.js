/**
 * Preprocessor Module - Data Cleaning & Normalization
 *
 * Handles:
 * 1. Header normalization (remove noise, standardize format)
 * 2. Value cleaning (trim, remove invisible chars)
 * 3. Format detection and normalization
 * 4. Hebrew-specific processing
 *
 * This module is additive - it enhances matching without breaking existing flow.
 */
(function() {
    'use strict';

    const Preprocessor = {

        /**
         * Normalize a header string for matching
         * @param {string} header - Raw header from Excel
         * @returns {Object} Normalized header info
         */
        normalizeHeader: function(header) {
            if (!header) {
                return { original: '', normalized: '', tokens: [] };
            }

            let normalized = String(header);

            // 1. Remove invisible Unicode characters (RTL/LTR marks, zero-width chars)
            normalized = normalized.replace(/[\u200E\u200F\u202A-\u202E\u200B-\u200D\uFEFF]/g, '');

            // 2. Normalize quotes and special chars
            normalized = normalized
                .replace(/[""״]/g, '"')
                .replace(/[''׳]/g, "'")
                .replace(/[–—]/g, '-');

            // 3. Trim and collapse whitespace
            normalized = normalized.trim().replace(/\s+/g, ' ');

            // 4. Remove common noise patterns
            normalized = normalized
                .replace(/^\d+[.\)]\s*/, '')     // Remove leading numbers "1. " or "1) "
                .replace(/\*+$/, '')              // Remove trailing asterisks
                .replace(/[:：]\s*$/, '')         // Remove trailing colons
                .replace(/^\s*[-•●○]\s*/, '');   // Remove bullet points

            // 5. Create lowercase version for matching
            const lowercase = normalized.toLowerCase();

            // 6. Tokenize for partial matching
            const tokens = this.tokenize(normalized);

            return {
                original: header,
                normalized: normalized,
                lowercase: lowercase,
                tokens: tokens,
                isHebrew: this.containsHebrew(normalized),
                isEmpty: normalized.length === 0
            };
        },

        /**
         * Tokenize a string into meaningful parts
         * @param {string} text - Text to tokenize
         * @returns {Array} Array of tokens
         */
        tokenize: function(text) {
            if (!text) return [];

            // Split on common delimiters
            const tokens = String(text)
                .split(/[\s\-_\/\\|,;:()[\]{}]+/)
                .map(t => t.trim().toLowerCase())
                .filter(t => t.length > 0);

            return tokens;
        },

        /**
         * Check if string contains Hebrew characters
         * @param {string} text - Text to check
         * @returns {boolean}
         */
        containsHebrew: function(text) {
            return /[\u0590-\u05FF]/.test(text);
        },

        /**
         * Clean a cell value
         * @param {*} value - Raw value from Excel
         * @returns {Object} Cleaned value info
         */
        cleanValue: function(value) {
            // Handle null/undefined
            if (value === null || value === undefined) {
                return { original: value, cleaned: '', isEmpty: true, type: 'empty' };
            }

            // Handle boolean
            if (typeof value === 'boolean') {
                return {
                    original: value,
                    cleaned: value,
                    isEmpty: false,
                    type: 'boolean'
                };
            }

            // Handle number
            if (typeof value === 'number') {
                return {
                    original: value,
                    cleaned: value,
                    isEmpty: false,
                    type: 'number'
                };
            }

            // Handle Date objects
            if (value instanceof Date) {
                const day = String(value.getDate()).padStart(2, '0');
                const month = String(value.getMonth() + 1).padStart(2, '0');
                const year = value.getFullYear();
                return {
                    original: value,
                    cleaned: `${day}/${month}/${year}`,
                    isEmpty: false,
                    type: 'date'
                };
            }

            // Handle string
            let cleaned = String(value);

            // Remove invisible characters
            cleaned = cleaned.replace(/[\u200E\u200F\u202A-\u202E\u200B-\u200D\uFEFF]/g, '');

            // Trim whitespace
            cleaned = cleaned.trim();

            // Check if empty
            if (cleaned.length === 0) {
                return { original: value, cleaned: '', isEmpty: true, type: 'empty' };
            }

            // Detect format using FORMAT_PATTERNS if available
            let formatInfo = null;
            if (typeof window !== 'undefined' && window.detectFormat) {
                formatInfo = window.detectFormat(cleaned);
            } else if (typeof detectFormat === 'function') {
                formatInfo = detectFormat(cleaned);
            }

            return {
                original: value,
                cleaned: formatInfo ? formatInfo.normalized : cleaned,
                isEmpty: false,
                type: formatInfo ? formatInfo.format : 'text',
                formatInfo: formatInfo
            };
        },

        /**
         * Process an entire row of data
         * @param {Object} row - Row object from Excel
         * @returns {Object} Processed row
         */
        processRow: function(row) {
            if (!row || typeof row !== 'object') {
                return {};
            }

            const processed = {};

            for (const [key, value] of Object.entries(row)) {
                const headerInfo = this.normalizeHeader(key);
                const valueInfo = this.cleanValue(value);

                processed[key] = {
                    header: headerInfo,
                    value: valueInfo,
                    originalKey: key,
                    originalValue: value
                };
            }

            return processed;
        },

        /**
         * Extract and clean headers from Excel data
         * @param {Array} data - Array of row objects
         * @returns {Array} Array of normalized header info objects
         */
        extractHeaders: function(data) {
            if (!Array.isArray(data) || data.length === 0) {
                return [];
            }

            const firstRow = data[0];
            if (!firstRow || typeof firstRow !== 'object') {
                return [];
            }

            return Object.keys(firstRow).map(header => this.normalizeHeader(header));
        },

        /**
         * Calculate similarity between two strings
         * Uses Levenshtein distance normalized to 0-1 range
         * @param {string} str1 - First string
         * @param {string} str2 - Second string
         * @returns {number} Similarity score (0-1)
         */
        calculateSimilarity: function(str1, str2) {
            if (!str1 || !str2) return 0;

            const s1 = String(str1).toLowerCase().trim();
            const s2 = String(str2).toLowerCase().trim();

            if (s1 === s2) return 1;
            if (s1.length === 0 || s2.length === 0) return 0;

            // Exact substring match gets high score
            if (s1.includes(s2) || s2.includes(s1)) {
                const shorter = s1.length < s2.length ? s1 : s2;
                const longer = s1.length < s2.length ? s2 : s1;
                return shorter.length / longer.length * 0.9;
            }

            // Levenshtein distance
            const distance = this.levenshteinDistance(s1, s2);
            const maxLen = Math.max(s1.length, s2.length);

            return 1 - (distance / maxLen);
        },

        /**
         * Calculate Levenshtein distance between two strings
         * @param {string} str1 - First string
         * @param {string} str2 - Second string
         * @returns {number} Edit distance
         */
        levenshteinDistance: function(str1, str2) {
            const m = str1.length;
            const n = str2.length;

            // Create matrix
            const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

            // Initialize first row and column
            for (let i = 0; i <= m; i++) dp[i][0] = i;
            for (let j = 0; j <= n; j++) dp[0][j] = j;

            // Fill matrix
            for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                    const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,      // deletion
                        dp[i][j - 1] + 1,      // insertion
                        dp[i - 1][j - 1] + cost // substitution
                    );
                }
            }

            return dp[m][n];
        },

        /**
         * Check if two headers are likely the same field
         * @param {string} header1 - First header
         * @param {string} header2 - Second header
         * @returns {boolean}
         */
        areHeadersSimilar: function(header1, header2) {
            const similarity = this.calculateSimilarity(header1, header2);
            return similarity >= 0.8;
        },

        /**
         * Normalize Hebrew text for better matching
         * Handles final letters, common variations
         * @param {string} text - Hebrew text
         * @returns {string} Normalized Hebrew
         */
        normalizeHebrew: function(text) {
            if (!text) return '';

            let normalized = String(text);

            // Convert final letters to regular form for matching
            const finals = {
                'ך': 'כ',
                'ם': 'מ',
                'ן': 'נ',
                'ף': 'פ',
                'ץ': 'צ'
            };

            for (const [final, regular] of Object.entries(finals)) {
                normalized = normalized.replace(new RegExp(final, 'g'), regular);
            }

            // Remove nikud (vowel marks)
            normalized = normalized.replace(/[\u0591-\u05C7]/g, '');

            return normalized;
        }
    };

    // Export for use in browser and Node.js
    if (typeof window !== 'undefined') {
        window.Preprocessor = Preprocessor;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Preprocessor };
    }

})();
