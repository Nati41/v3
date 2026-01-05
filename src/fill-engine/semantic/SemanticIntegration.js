/**
 * SemanticIntegration - Connects Semantic Engine to ExcelDataResolver
 *
 * This module is 100% ADDITIVE - it enhances ExcelDataResolver without
 * modifying its core code. It hooks into the matching process to provide
 * better synonym matching and format-based inference.
 *
 * Integration approach:
 * 1. Wraps ExcelDataResolver.matchColumns with enhanced semantic matching
 * 2. Uses SEMANTIC_DICTIONARY for broader synonym coverage
 * 3. Uses FORMAT_PATTERNS for value-based type inference
 * 4. Falls back to original matching if semantic modules aren't loaded
 */
(function() {
    'use strict';

    const SemanticIntegration = {

        // Track if integration is enabled
        enabled: false,
        originalMatchColumns: null,

        /**
         * Initialize semantic integration
         * Checks if all required modules are loaded and wraps ExcelDataResolver
         */
        init: function() {
            // Check if ExcelDataResolver exists
            if (!window.ExcelDataResolver) {
                console.warn('[SemanticIntegration] ExcelDataResolver not found - waiting for load');
                return false;
            }

            // Check if semantic modules are loaded
            const modulesLoaded = !!(
                window.SEMANTIC_DICTIONARY &&
                window.Preprocessor &&
                window.SemanticMatcher
            );

            if (!modulesLoaded) {
                console.warn('[SemanticIntegration] Semantic modules not fully loaded');
                // List what's missing
                if (!window.SEMANTIC_DICTIONARY) console.warn('  - Missing: SEMANTIC_DICTIONARY');
                if (!window.Preprocessor) console.warn('  - Missing: Preprocessor');
                if (!window.SemanticMatcher) console.warn('  - Missing: SemanticMatcher');
                return false;
            }

            // Store original matchColumns function
            this.originalMatchColumns = window.ExcelDataResolver.matchColumns;

            // Replace with enhanced version
            window.ExcelDataResolver.matchColumns = this.enhancedMatchColumns.bind(this);

            // Mark as enabled
            this.enabled = true;

            console.log('%c🧠 SemanticIntegration Enabled', 'background: #9333ea; color: white; font-size: 12px; padding: 3px;');
            console.log('   Loaded dictionaries:', Object.keys(window.SEMANTIC_DICTIONARY).length, 'canonical fields');

            return true;
        },

        /**
         * Enhanced column matching using semantic modules
         * Falls back to original matching if something fails
         */
        enhancedMatchColumns: function(excelHeaders, tableColumns, sampleRows = []) {
            try {
                // First, run original matching
                const originalResult = this.originalMatchColumns.call(
                    window.ExcelDataResolver,
                    excelHeaders,
                    tableColumns,
                    sampleRows
                );

                // Get unmatched headers to try semantic matching on
                const unmatchedIndices = originalResult.unmatched.map(u => u.index);

                if (unmatchedIndices.length === 0) {
                    // All matched by original - nothing to enhance
                    return originalResult;
                }

                console.log(`[SemanticIntegration] Attempting semantic match for ${unmatchedIndices.length} unmatched columns`);

                // Build list of unused columns
                const usedColumnIds = new Set(originalResult.usedColumnIds);
                const availableColumns = tableColumns.filter(col => !usedColumnIds.has(col.columnId));

                // Try semantic matching for each unmatched header
                const semanticMatches = {};
                const stillUnmatched = [];

                for (const unmatched of originalResult.unmatched) {
                    const header = unmatched.header;
                    const excelIdx = unmatched.index;

                    // Try dictionary synonym match
                    const dictionaryMatch = this.findDictionaryMatch(header, availableColumns);

                    if (dictionaryMatch) {
                        semanticMatches[excelIdx] = {
                            columnId: dictionaryMatch.column.columnId,
                            hebrewName: dictionaryMatch.column.hebrewName,
                            englishId: dictionaryMatch.column.englishId,
                            confidence: dictionaryMatch.confidence,
                            tier: 1.6,
                            matchType: 'semantic-dictionary',
                            matchedVia: dictionaryMatch.matchedVia
                        };
                        usedColumnIds.add(dictionaryMatch.column.columnId);

                        // Remove from available
                        const idx = availableColumns.findIndex(c => c.columnId === dictionaryMatch.column.columnId);
                        if (idx >= 0) availableColumns.splice(idx, 1);

                        console.log(`[Tier1.6] Semantic: "${header}" → ${dictionaryMatch.column.columnId} (via "${dictionaryMatch.matchedVia}")`);
                    } else {
                        // Try format-based inference from values
                        const valueMatch = this.findValueBasedMatch(excelIdx, sampleRows, availableColumns);

                        if (valueMatch) {
                            semanticMatches[excelIdx] = {
                                columnId: valueMatch.column.columnId,
                                hebrewName: valueMatch.column.hebrewName,
                                englishId: valueMatch.column.englishId,
                                confidence: valueMatch.confidence,
                                tier: 2.5,
                                matchType: 'format-inference',
                                inferredType: valueMatch.inferredType
                            };
                            usedColumnIds.add(valueMatch.column.columnId);

                            const idx = availableColumns.findIndex(c => c.columnId === valueMatch.column.columnId);
                            if (idx >= 0) availableColumns.splice(idx, 1);

                            console.log(`[Tier2.5] Format-inferred: "${header}" → ${valueMatch.column.columnId} (type: ${valueMatch.inferredType})`);
                        } else {
                            stillUnmatched.push(unmatched);
                        }
                    }
                }

                // Merge results
                const mergedMatches = {
                    ...originalResult.matches,
                    ...semanticMatches
                };

                const enhancedCount = Object.keys(semanticMatches).length;
                if (enhancedCount > 0) {
                    console.log(`[SemanticIntegration] Enhanced ${enhancedCount} additional matches`);
                }

                return {
                    matches: mergedMatches,
                    unmatched: stillUnmatched,
                    usedColumnIds: Array.from(usedColumnIds)
                };

            } catch (error) {
                console.error('[SemanticIntegration] Error in enhanced matching, falling back to original:', error);
                return this.originalMatchColumns.call(
                    window.ExcelDataResolver,
                    excelHeaders,
                    tableColumns,
                    sampleRows
                );
            }
        },

        /**
         * Find match using SEMANTIC_DICTIONARY
         */
        findDictionaryMatch: function(header, availableColumns) {
            const dictionary = window.SEMANTIC_DICTIONARY;
            if (!dictionary) return null;

            const headerLower = header.toLowerCase().trim();
            const preprocessor = window.Preprocessor;
            const headerNormalized = preprocessor ?
                preprocessor.normalizeHebrew(headerLower) : headerLower;

            // Search for header in dictionary synonyms
            for (const [canonical, synonyms] of Object.entries(dictionary)) {
                for (const synonym of synonyms) {
                    const synLower = synonym.toLowerCase();
                    const synNormalized = preprocessor ?
                        preprocessor.normalizeHebrew(synLower) : synLower;

                    // Exact match with synonym
                    if (headerLower === synLower || headerNormalized === synNormalized) {
                        // Found canonical - now find column that matches
                        const column = this.findColumnForCanonical(canonical, availableColumns);
                        if (column) {
                            return {
                                column: column,
                                canonical: canonical,
                                matchedVia: synonym,
                                confidence: 0.92
                            };
                        }
                    }

                    // Header contains synonym (for compound headers)
                    if (synLower.length > 3 && headerLower.includes(synLower)) {
                        const column = this.findColumnForCanonical(canonical, availableColumns);
                        if (column) {
                            return {
                                column: column,
                                canonical: canonical,
                                matchedVia: synonym + ' (partial)',
                                confidence: 0.75
                            };
                        }
                    }
                }
            }

            return null;
        },

        /**
         * Find column that matches a canonical field name
         */
        findColumnForCanonical: function(canonical, availableColumns) {
            const canonicalLower = canonical.toLowerCase();

            // Direct match on englishId or columnId
            for (const col of availableColumns) {
                const englishId = (col.englishId || '').toLowerCase();
                const columnId = (col.columnId || '').toLowerCase();

                if (englishId === canonicalLower ||
                    columnId === canonicalLower ||
                    englishId.includes(canonicalLower) ||
                    canonicalLower.includes(englishId)) {
                    return col;
                }
            }

            // Check if column's Hebrew name has synonyms that match canonical
            const dictionary = window.SEMANTIC_DICTIONARY;
            if (dictionary && dictionary[canonical]) {
                const synonyms = dictionary[canonical];

                for (const col of availableColumns) {
                    const hebrewName = (col.hebrewName || '').toLowerCase();

                    for (const syn of synonyms) {
                        if (hebrewName === syn.toLowerCase() ||
                            hebrewName.includes(syn.toLowerCase())) {
                            return col;
                        }
                    }
                }
            }

            return null;
        },

        /**
         * Try to match column based on value format
         */
        findValueBasedMatch: function(excelIdx, sampleRows, availableColumns) {
            if (!sampleRows || sampleRows.length === 0) return null;

            const detectFormat = window.detectFormat;
            if (!detectFormat) return null;

            // Get sample values for this column
            const sampleValues = sampleRows.map(row => row[excelIdx]).filter(v => v !== '' && v != null);
            if (sampleValues.length === 0) return null;

            // Detect format from values
            const formatCounts = {};
            for (const val of sampleValues.slice(0, 5)) {
                const detected = detectFormat(val);
                if (detected && detected.format !== 'text') {
                    formatCounts[detected.format] = (formatCounts[detected.format] || 0) + 1;
                }
            }

            // Find dominant format
            let dominantFormat = null;
            let maxCount = 0;
            for (const [format, count] of Object.entries(formatCounts)) {
                if (count > maxCount) {
                    dominantFormat = format;
                    maxCount = count;
                }
            }

            if (!dominantFormat || maxCount < 2) return null;

            // Map format to field type
            const formatToFieldType = {
                'israeli_id': ['id', 'tz', 'id_number', 'identity'],
                'phone_mobile': ['mobile', 'phone', 'cell', 'נייד'],
                'phone_landline': ['landline', 'phone', 'טלפון'],
                'phone': ['phone', 'טלפון'],
                'email': ['email', 'mail', 'אימייל', 'דואר'],
                'date_dmy': ['date', 'תאריך'],
                'date_ymd': ['date', 'תאריך'],
                'zip_code': ['zip', 'מיקוד', 'postal'],
                'bank_account': ['account', 'חשבון'],
                'bank_branch': ['branch', 'סניף']
            };

            const fieldHints = formatToFieldType[dominantFormat];
            if (!fieldHints) return null;

            // Find column matching the inferred type
            for (const col of availableColumns) {
                const colId = (col.columnId || '').toLowerCase();
                const engId = (col.englishId || '').toLowerCase();
                const hebName = (col.hebrewName || '').toLowerCase();

                for (const hint of fieldHints) {
                    if (colId.includes(hint) || engId.includes(hint) || hebName.includes(hint)) {
                        return {
                            column: col,
                            inferredType: dominantFormat,
                            confidence: 0.65
                        };
                    }
                }
            }

            return null;
        },

        /**
         * Process multi-value cell for checkbox fields
         * @param {string} value - Cell value (may contain multiple values)
         * @param {Array} checkboxFields - Available checkbox field definitions
         * @returns {Array} Array of { fieldId, checked: true } objects
         */
        processMultiValueCell: function(value, checkboxFields) {
            const results = [];

            if (!value || !checkboxFields || checkboxFields.length === 0) {
                return results;
            }

            const parser = window.MultiValueParser;
            const categories = window.CANONICAL_CATEGORIES;

            if (!parser) {
                // Fallback: simple comma split
                const parts = String(value).split(/[,;\/]+/).map(p => p.trim()).filter(p => p);
                for (const part of parts) {
                    const match = this.matchValueToCheckbox(part, checkboxFields);
                    if (match) {
                        results.push(match);
                    }
                }
                return results;
            }

            // Use MultiValueParser
            const parsed = parser.parse(value);

            for (const p of parsed) {
                // Try category resolution first
                if (categories) {
                    const resolved = window.resolveValueToCanonical ?
                        window.resolveValueToCanonical(p.raw) : null;

                    if (resolved) {
                        // Find checkbox field matching canonical
                        const field = this.findCheckboxForCanonical(resolved.canonical, checkboxFields);
                        if (field) {
                            results.push({
                                fieldId: field.id || field.fieldId,
                                checked: true,
                                matchedValue: p.raw,
                                canonical: resolved.canonical,
                                category: resolved.category,
                                matchType: 'category'
                            });
                            continue;
                        }
                    }
                }

                // Fallback to dictionary/fuzzy match
                const match = this.matchValueToCheckbox(p.raw, checkboxFields);
                if (match) {
                    results.push(match);
                }
            }

            if (results.length > 0) {
                console.log(`[MultiValue] Processed "${value}" → ${results.length} checkbox matches`);
            }

            return results;
        },

        /**
         * Find checkbox field for a canonical value
         */
        findCheckboxForCanonical: function(canonical, checkboxFields) {
            const canonicalLower = canonical.toLowerCase();
            const dictionary = window.SEMANTIC_DICTIONARY;

            for (const field of checkboxFields) {
                const fieldId = (field.englishId || field.id || '').toLowerCase();
                const fieldLabel = (field.label || field.hebrewName || '').toLowerCase();

                // Direct match
                if (fieldId.includes(canonicalLower) || canonicalLower.includes(fieldId)) {
                    return field;
                }

                // Check synonyms
                if (dictionary && dictionary[canonical]) {
                    for (const syn of dictionary[canonical]) {
                        if (fieldLabel.includes(syn.toLowerCase()) ||
                            syn.toLowerCase().includes(fieldLabel)) {
                            return field;
                        }
                    }
                }
            }

            return null;
        },

        /**
         * Match a single value to a checkbox field
         */
        matchValueToCheckbox: function(value, checkboxFields) {
            const valueLower = String(value).toLowerCase().trim();
            const dictionary = window.SEMANTIC_DICTIONARY;
            const preprocessor = window.Preprocessor;

            // First try dictionary match
            if (dictionary) {
                for (const [canonical, synonyms] of Object.entries(dictionary)) {
                    for (const syn of synonyms) {
                        if (valueLower === syn.toLowerCase() ||
                            (syn.length > 3 && valueLower.includes(syn.toLowerCase()))) {
                            // Found canonical - find matching checkbox
                            const field = this.findCheckboxForCanonical(canonical, checkboxFields);
                            if (field) {
                                return {
                                    fieldId: field.id || field.fieldId,
                                    checked: true,
                                    matchedValue: value,
                                    canonical: canonical,
                                    matchType: 'dictionary'
                                };
                            }
                        }
                    }
                }
            }

            // Fuzzy match on field labels
            for (const field of checkboxFields) {
                const fieldLabel = (field.label || field.hebrewName || '').toLowerCase();

                if (fieldLabel.includes(valueLower) || valueLower.includes(fieldLabel)) {
                    return {
                        fieldId: field.id || field.fieldId,
                        checked: true,
                        matchedValue: value,
                        matchType: 'fuzzy'
                    };
                }

                if (preprocessor) {
                    const similarity = preprocessor.calculateSimilarity(valueLower, fieldLabel);
                    if (similarity >= 0.75) {
                        return {
                            fieldId: field.id || field.fieldId,
                            checked: true,
                            matchedValue: value,
                            matchType: 'similarity',
                            similarity: similarity
                        };
                    }
                }
            }

            return null;
        },

        /**
         * Detect if a column likely contains category/enum values
         * @param {string} header - Column header
         * @param {Array} sampleValues - Sample values from column
         * @returns {Object|null} Category info if detected
         */
        detectCategoryColumn: function(header, sampleValues) {
            const detectCategory = window.detectCategoryFromHeader;

            // Check header
            if (detectCategory) {
                const fromHeader = detectCategory(header);
                if (fromHeader) {
                    console.log(`[Category] Detected category "${fromHeader.category}" from header "${header}"`);
                    return fromHeader;
                }
            }

            // Check values
            const categories = window.CANONICAL_CATEGORIES;
            const resolveValue = window.resolveValueToCanonical;

            if (categories && resolveValue && sampleValues) {
                const categoryCounts = {};

                for (const value of sampleValues.slice(0, 5)) {
                    if (!value) continue;
                    const resolved = resolveValue(String(value));
                    if (resolved && resolved.category) {
                        categoryCounts[resolved.category] = (categoryCounts[resolved.category] || 0) + 1;
                    }
                }

                // Find dominant category
                let bestCategory = null;
                let maxCount = 0;
                for (const [cat, count] of Object.entries(categoryCounts)) {
                    if (count > maxCount) {
                        bestCategory = cat;
                        maxCount = count;
                    }
                }

                if (bestCategory && maxCount >= 2) {
                    console.log(`[Category] Detected category "${bestCategory}" from values`);
                    return {
                        category: bestCategory,
                        ...categories[bestCategory]
                    };
                }
            }

            return null;
        },

        /**
         * Get integration status
         */
        getStatus: function() {
            return {
                enabled: this.enabled,
                modulesLoaded: {
                    dictionary: !!window.SEMANTIC_DICTIONARY,
                    formats: !!window.FORMAT_PATTERNS,
                    entities: !!window.ENTITY_GROUPS,
                    preprocessor: !!window.Preprocessor,
                    matcher: !!window.SemanticMatcher,
                    multiValueParser: !!window.MultiValueParser,
                    categories: !!window.CANONICAL_CATEGORIES
                },
                dictionarySize: window.SEMANTIC_DICTIONARY ?
                    Object.keys(window.SEMANTIC_DICTIONARY).length : 0,
                categoriesCount: window.CANONICAL_CATEGORIES ?
                    Object.keys(window.CANONICAL_CATEGORIES).length : 0
            };
        },

        /**
         * Disable integration and restore original matching
         */
        disable: function() {
            if (this.enabled && this.originalMatchColumns) {
                window.ExcelDataResolver.matchColumns = this.originalMatchColumns;
                this.enabled = false;
                console.log('[SemanticIntegration] Disabled - restored original matching');
            }
        }
    };

    // Export
    window.SemanticIntegration = SemanticIntegration;

    // Auto-init when document is ready
    if (document.readyState === 'complete') {
        setTimeout(() => SemanticIntegration.init(), 100);
    } else {
        window.addEventListener('load', () => {
            setTimeout(() => SemanticIntegration.init(), 100);
        });
    }

})();
