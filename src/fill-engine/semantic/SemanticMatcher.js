/**
 * SemanticMatcher Module - Intelligent Field Matching
 *
 * Multi-tier matching strategy:
 * 1. Exact match (case-insensitive)
 * 2. Synonym match (using SEMANTIC_DICTIONARY)
 * 3. Fuzzy match (Levenshtein with threshold)
 * 4. Format-based inference (detect ID, phone, email from values)
 * 5. Entity-context disambiguation
 *
 * Returns matches with confidence scores for UI display.
 */
(function() {
    'use strict';

    const SemanticMatcher = {

        // Confidence thresholds
        THRESHOLDS: {
            EXACT: 1.0,
            SYNONYM: 0.95,
            FUZZY_HIGH: 0.85,
            FUZZY_MEDIUM: 0.70,
            FORMAT_INFER: 0.60,
            MINIMUM: 0.50
        },

        /**
         * Match an Excel header to a canonical field
         * @param {string} excelHeader - Column header from Excel
         * @param {Array} targetFields - Available fields to match against
         * @param {Object} options - Matching options
         * @returns {Object} Best match with confidence
         */
        findBestMatch: function(excelHeader, targetFields, options = {}) {
            if (!excelHeader || !targetFields || targetFields.length === 0) {
                return null;
            }

            const preprocessor = window.Preprocessor || (typeof Preprocessor !== 'undefined' ? Preprocessor : null);
            const headerInfo = preprocessor ? preprocessor.normalizeHeader(excelHeader) : { normalized: excelHeader, lowercase: excelHeader.toLowerCase() };

            const matches = [];

            // Try each matching strategy
            for (const field of targetFields) {
                const matchResult = this.matchField(headerInfo, field, options);
                if (matchResult && matchResult.confidence >= this.THRESHOLDS.MINIMUM) {
                    matches.push(matchResult);
                }
            }

            // Sort by confidence (desc)
            matches.sort((a, b) => b.confidence - a.confidence);

            // Return best match or null
            return matches.length > 0 ? matches[0] : null;
        },

        /**
         * Match a header against a single field
         * @param {Object} headerInfo - Normalized header info
         * @param {Object} field - Target field definition
         * @param {Object} options - Matching options
         * @returns {Object|null} Match result or null
         */
        matchField: function(headerInfo, field, options = {}) {
            const fieldName = field.englishId || field.label_en || field.id;
            const fieldLabel = field.label || field.label_he || '';

            // 1. Exact match (highest confidence)
            const exactMatch = this.tryExactMatch(headerInfo, fieldName, fieldLabel);
            if (exactMatch) {
                return {
                    field: field,
                    matchType: 'exact',
                    confidence: this.THRESHOLDS.EXACT,
                    matchedOn: exactMatch.matchedOn
                };
            }

            // 2. Synonym match
            const synonymMatch = this.trySynonymMatch(headerInfo, fieldName);
            if (synonymMatch) {
                return {
                    field: field,
                    matchType: 'synonym',
                    confidence: this.THRESHOLDS.SYNONYM,
                    matchedOn: synonymMatch.synonym,
                    canonical: synonymMatch.canonical
                };
            }

            // 3. Fuzzy match
            const fuzzyMatch = this.tryFuzzyMatch(headerInfo, fieldName, fieldLabel);
            if (fuzzyMatch && fuzzyMatch.similarity >= 0.70) {
                const confidence = fuzzyMatch.similarity >= 0.85 ?
                    this.THRESHOLDS.FUZZY_HIGH :
                    this.THRESHOLDS.FUZZY_MEDIUM;

                return {
                    field: field,
                    matchType: 'fuzzy',
                    confidence: confidence,
                    similarity: fuzzyMatch.similarity,
                    matchedOn: fuzzyMatch.matchedOn
                };
            }

            return null;
        },

        /**
         * Try exact match (case-insensitive)
         */
        tryExactMatch: function(headerInfo, fieldName, fieldLabel) {
            const header = headerInfo.lowercase;

            // Match against English field name
            if (header === fieldName.toLowerCase()) {
                return { matchedOn: fieldName };
            }

            // Match against Hebrew label
            if (fieldLabel && header === fieldLabel.toLowerCase()) {
                return { matchedOn: fieldLabel };
            }

            return null;
        },

        /**
         * Try synonym match using SEMANTIC_DICTIONARY
         */
        trySynonymMatch: function(headerInfo, fieldName) {
            const dictionary = window.SEMANTIC_DICTIONARY ||
                (typeof SEMANTIC_DICTIONARY !== 'undefined' ? SEMANTIC_DICTIONARY : null);

            if (!dictionary) {
                return null;
            }

            const header = headerInfo.lowercase;

            // Search all canonical fields
            for (const [canonical, synonyms] of Object.entries(dictionary)) {
                // Check if header matches any synonym
                for (const synonym of synonyms) {
                    if (header === synonym.toLowerCase()) {
                        // Found match - check if it maps to our target field
                        if (this.canonicalMatchesField(canonical, fieldName)) {
                            return {
                                canonical: canonical,
                                synonym: synonym
                            };
                        }
                    }
                }
            }

            // Also check if header contains a synonym (partial match)
            for (const [canonical, synonyms] of Object.entries(dictionary)) {
                for (const synonym of synonyms) {
                    const synLower = synonym.toLowerCase();
                    if (synLower.length > 3 && header.includes(synLower)) {
                        if (this.canonicalMatchesField(canonical, fieldName)) {
                            return {
                                canonical: canonical,
                                synonym: synonym,
                                partial: true
                            };
                        }
                    }
                }
            }

            return null;
        },

        /**
         * Check if a canonical name matches a field
         */
        canonicalMatchesField: function(canonical, fieldName) {
            const fieldLower = fieldName.toLowerCase();
            const canonicalLower = canonical.toLowerCase();

            // Direct match
            if (fieldLower === canonicalLower) return true;

            // Field contains canonical
            if (fieldLower.includes(canonicalLower)) return true;

            // Canonical contains field
            if (canonicalLower.includes(fieldLower)) return true;

            // Common variations
            const variations = {
                'id_number': ['id', 'idnumber', 'tz'],
                'first_name': ['firstname', 'first', 'givenname'],
                'last_name': ['lastname', 'last', 'surname', 'family'],
                'phone_mobile': ['mobile', 'cell', 'cellphone'],
                'phone_landline': ['landline', 'homephone'],
                'birth_date': ['birthdate', 'dob', 'birthday'],
                'start_date': ['startdate', 'hiredate'],
                'company_name': ['employer', 'company'],
                'company_id': ['companyid', 'hp', 'ein'],
                'bank_account': ['account', 'accountnumber'],
                'bank_branch': ['branch', 'branchnumber']
            };

            const fieldVariations = variations[canonical] || [];
            return fieldVariations.some(v => fieldLower.includes(v));
        },

        /**
         * Try fuzzy match using string similarity
         */
        tryFuzzyMatch: function(headerInfo, fieldName, fieldLabel) {
            const preprocessor = window.Preprocessor ||
                (typeof Preprocessor !== 'undefined' ? Preprocessor : null);

            if (!preprocessor) return null;

            const header = headerInfo.lowercase;

            // Compare with English field name
            const engSimilarity = preprocessor.calculateSimilarity(header, fieldName);

            // Compare with Hebrew label
            const hebSimilarity = fieldLabel ?
                preprocessor.calculateSimilarity(header, fieldLabel) : 0;

            const bestSimilarity = Math.max(engSimilarity, hebSimilarity);
            const matchedOn = hebSimilarity > engSimilarity ? fieldLabel : fieldName;

            if (bestSimilarity >= 0.70) {
                return {
                    similarity: bestSimilarity,
                    matchedOn: matchedOn
                };
            }

            return null;
        },

        /**
         * Infer field type from value format
         * @param {*} value - Cell value
         * @returns {Object|null} Inferred field info
         */
        inferFromValue: function(value) {
            const formatPatterns = window.FORMAT_PATTERNS ||
                (typeof FORMAT_PATTERNS !== 'undefined' ? FORMAT_PATTERNS : null);

            if (!formatPatterns) return null;

            const detectFormat = window.detectFormat ||
                (typeof detectFormat !== 'undefined' ? detectFormat : null);

            if (!detectFormat) return null;

            const detected = detectFormat(value);
            if (!detected || detected.format === 'text') {
                return null;
            }

            // Map format to canonical field
            const formatToField = {
                'israeli_id': 'id_number',
                'phone_mobile': 'phone_mobile',
                'phone_landline': 'phone_landline',
                'phone': 'phone',
                'email': 'email',
                'date_dmy': 'date',
                'date_ymd': 'date',
                'date_hebrew': 'date',
                'zip_code': 'zip_code',
                'bank_account': 'bank_account',
                'bank_branch': 'bank_branch',
                'bank_code': 'bank_code',
                'company_id': 'company_id',
                'currency_ils': 'salary',
                'boolean': 'checkbox'
            };

            const canonicalField = formatToField[detected.format];
            if (!canonicalField) return null;

            return {
                format: detected.format,
                canonicalField: canonicalField,
                normalized: detected.normalized,
                isValid: detected.isValid,
                confidence: detected.isValid ? this.THRESHOLDS.FORMAT_INFER : 0.4
            };
        },

        /**
         * Match all Excel columns to target fields
         * @param {Array} excelHeaders - Array of column headers
         * @param {Array} targetFields - Available fields to match
         * @param {Object} options - Matching options
         * @returns {Array} Array of match results
         */
        matchAllColumns: function(excelHeaders, targetFields, options = {}) {
            const results = [];
            const usedFields = new Set();

            // First pass: high confidence matches
            for (const header of excelHeaders) {
                const match = this.findBestMatch(header, targetFields, options);

                if (match && match.confidence >= this.THRESHOLDS.FUZZY_HIGH) {
                    if (!usedFields.has(match.field.id)) {
                        results.push({
                            excelHeader: header,
                            match: match,
                            status: 'matched'
                        });
                        usedFields.add(match.field.id);
                    }
                }
            }

            // Second pass: medium confidence for remaining
            for (const header of excelHeaders) {
                const alreadyMatched = results.some(r => r.excelHeader === header);
                if (alreadyMatched) continue;

                const remainingFields = targetFields.filter(f => !usedFields.has(f.id));
                const match = this.findBestMatch(header, remainingFields, options);

                if (match && match.confidence >= this.THRESHOLDS.MINIMUM) {
                    results.push({
                        excelHeader: header,
                        match: match,
                        status: 'needs_review'
                    });
                    usedFields.add(match.field.id);
                } else {
                    results.push({
                        excelHeader: header,
                        match: null,
                        status: 'unmatched'
                    });
                }
            }

            return results;
        },

        /**
         * Get confidence level label for UI
         * @param {number} confidence - Confidence score 0-1
         * @returns {Object} Label and color info
         */
        getConfidenceLevel: function(confidence) {
            if (confidence >= 0.95) {
                return { level: 'high', label: 'גבוה', labelEn: 'High', color: '#22c55e' };
            }
            if (confidence >= 0.80) {
                return { level: 'medium', label: 'בינוני', labelEn: 'Medium', color: '#f59e0b' };
            }
            if (confidence >= 0.60) {
                return { level: 'low', label: 'נמוך', labelEn: 'Low', color: '#ef4444' };
            }
            return { level: 'none', label: 'לא נמצא', labelEn: 'Not found', color: '#6b7280' };
        }
    };

    // Export for use in browser and Node.js
    if (typeof window !== 'undefined') {
        window.SemanticMatcher = SemanticMatcher;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SemanticMatcher };
    }

})();
