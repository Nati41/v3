/**
 * ExcelDataResolver - Excel/CSV to Table Data Transformer
 *
 * Parses Excel/CSV files and matches columns to table mapping
 * using multi-tier matching strategy.
 *
 * This module is 100% additive - does not modify any existing code.
 */
(function() {
    'use strict';

    // ============ CONFIGURATION ============

    const RESOLVER_CONFIG = {
        // Supported file types
        SUPPORTED_EXTENSIONS: ['.xlsx', '.xls', '.csv'],

        // Matching thresholds
        MIN_CONFIDENCE_SCORE: 0.5,

        // Hebrew normalization
        HEBREW_PUNCTUATION: /[\u0591-\u05C7]/g,  // Hebrew cantillation marks
        PARENTHESES_CONTENT: /\s*[\(\[][^\)\]]*[\)\]]\s*/g,  // (content) or [content]
        EXTRA_SPACES: /\s+/g,

        // Context enforcement: if true, reject matches where contexts don't align
        STRICT_CONTEXT_MATCHING: true
    };

    // ============ CHECKBOX NORMALIZATION (SINGLE SOURCE OF TRUTH) ============

    /**
     * Normalize Excel checkbox value to boolean
     * This is the ONLY function that should be used for checkbox normalization
     *
     * @param {any} raw - Raw value from Excel
     * @returns {boolean} - true if checked, false otherwise
     */
    function normalizeExcelCheckboxValue(raw) {
        // Boolean values
        if (raw === true) return true;
        if (raw === false) return false;

        // Null/undefined
        if (raw == null) return false;

        // Convert to string and normalize
        const v = String(raw).trim().toLowerCase();

        // Empty string
        if (v === '') return false;

        // Truthy values (Hebrew + English + symbols)
        const truthyValues = [
            'true', '1', 'yes', 'y', 'v', 'x',
            'כן', '✓', '✔', '√',
            'נכון', 'מסומן', 'checked'
        ];

        if (truthyValues.includes(v)) {
            return true;
        }

        // Special case: any non-empty string that's not a falsy value = true
        // This handles cases like "משכורת חודש" which should be true
        const falsyValues = [
            'false', '0', 'no', 'n',
            'לא', 'ריק', 'empty', 'unchecked'
        ];

        if (falsyValues.includes(v)) {
            return false;
        }

        // If it's a non-empty string that's not explicitly falsy, treat as true
        // This handles category values like "משכורת חודש"
        return v.length > 0;
    }

    // ============ SEMANTIC ALIASES ============
    // Maps common Hebrew synonyms/variations to canonical terms
    const SEMANTIC_ALIASES = {
        // ID/Identity
        'תעודת זהות': ['מספר זהות', 'ת.ז', 'ת"ז', 'מס זהות', 'תז', 'id', 'id_number', 'identity'],
        'מספר זהות': ['תעודת זהות', 'ת.ז', 'ת"ז', 'מס זהות', 'תז', 'id', 'id_number'],

        // Email
        'אימייל': ['דואר אלקטרוני', 'כתובת דואר אלקטרוני', 'מייל', 'email', 'דוא"ל', 'כתובת מייל'],
        'דואר אלקטרוני': ['אימייל', 'מייל', 'email', 'דוא"ל', 'כתובת דואר אלקטרוני'],
        'כתובת דואר אלקטרוני': ['אימייל', 'מייל', 'email', 'דוא"ל', 'דואר אלקטרוני'],

        // Phone
        'טלפון': ['מספר טלפון', 'טל', 'phone', 'פלאפון'],
        'נייד': ['טלפון נייד', 'מספר טלפון נייד', 'סלולרי', 'פלאפון', 'mobile', 'cell'],
        'מספר טלפון נייד': ['נייד', 'סלולרי', 'פלאפון', 'טלפון נייד'],

        // Address
        'רחוב': ['כתובת', 'רחוב/שכונה', 'כתובת מגורים', 'street', 'address'],
        'עיר': ['עיר/ישוב', 'ישוב', 'יישוב', 'city', 'מקום מגורים'],

        // Dates
        'תאריך תחילת עבודה': ['תאריך תחילה העבודה', 'תחילת עבודה', 'מועד תחילת עבודה', 'start_date'],
        'תאריך תחילה העבודה': ['תאריך תחילת עבודה', 'תחילת עבודה', 'מועד תחילת עבודה'],

        // Names
        'שם': ['שם מלא', 'שם פרטי', 'name', 'first_name'],
        'שם משפחה': ['משפחה', 'שם משפחה', 'last_name', 'family_name'],

        // Income types (for checkbox matching)
        'סוג הכנסה': ['הכנסה', 'סוג משכורת', 'משכורת'],
        'משכורת חודש': ['משכורת חודשית', 'משכורת רגילה', 'הכנסה חודשית'],
        'משכורת חלקית': ['חלקית', 'משרה חלקית'],
        'משכורת בעד משרה נוספת': ['משרה נוספת', 'משכורת נוספת', 'עבודה נוספת']
    };

    /**
     * Find semantic match using aliases
     * @param {string} term1 - First term to compare
     * @param {string} term2 - Second term to compare
     * @returns {boolean} True if terms are semantically equivalent
     */
    function areSemanticallySimilar(term1, term2) {
        if (!term1 || !term2) return false;

        const t1 = term1.toLowerCase().trim();
        const t2 = term2.toLowerCase().trim();

        // Direct match
        if (t1 === t2) return true;

        // Check if t1 has aliases that include t2
        for (const [key, aliases] of Object.entries(SEMANTIC_ALIASES)) {
            const keyLower = key.toLowerCase();
            if (keyLower === t1 || keyLower.includes(t1) || t1.includes(keyLower)) {
                if (aliases.some(a => a.toLowerCase() === t2 || a.toLowerCase().includes(t2) || t2.includes(a.toLowerCase()))) {
                    return true;
                }
            }
            if (keyLower === t2 || keyLower.includes(t2) || t2.includes(keyLower)) {
                if (aliases.some(a => a.toLowerCase() === t1 || a.toLowerCase().includes(t1) || t1.includes(a.toLowerCase()))) {
                    return true;
                }
            }
        }

        return false;
    }

    // ============ EXCEL PARSING ============

    /**
     * Parse Excel/CSV file to raw data
     * @param {ArrayBuffer|Uint8Array} fileBytes - File content
     * @param {string} fileName - File name (for type detection)
     * @returns {Object} { headers: string[], rows: any[][], sheetName: string }
     */
    function parseFile(fileBytes, fileName) {
        if (!window.XLSX) {
            throw new Error('SheetJS (XLSX) library not loaded');
        }

        const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
        if (!RESOLVER_CONFIG.SUPPORTED_EXTENSIONS.includes(ext)) {
            throw new Error(`Unsupported file type: ${ext}`);
        }

        const workbook = XLSX.read(fileBytes, {
            type: 'array',
            cellDates: true,
            cellNF: true
        });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert to array of arrays (header: 1 means first row is headers)
        const rawData = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
            blankrows: false
        });

        if (rawData.length === 0) {
            throw new Error('Excel file is empty');
        }

        const headers = rawData[0].map(h => String(h || '').trim());
        const rows = rawData.slice(1);

        console.log(`[ExcelDataResolver] Parsed ${rows.length} rows, ${headers.length} columns from "${sheetName}"`);

        return {
            headers,
            rows,
            sheetName
        };
    }

    // ============ TEXT NORMALIZATION ============

    /**
     * Normalize text for soft matching
     * - Trim whitespace
     * - Remove parentheses and their content
     * - Remove Hebrew punctuation marks
     * - Normalize slashes (/ and \) to space
     * - Normalize multiple spaces
     * @param {string} text - Input text
     * @returns {string} Normalized text
     */
    function normalizeText(text) {
        if (!text) return '';

        let normalized = String(text);

        // Remove parentheses content: "מידות (ר×ג×ע)" → "מידות"
        normalized = normalized.replace(RESOLVER_CONFIG.PARENTHESES_CONTENT, '');

        // Remove Hebrew cantillation/punctuation marks
        normalized = normalized.replace(RESOLVER_CONFIG.HEBREW_PUNCTUATION, '');

        // Normalize slashes to space: "פריט/תיאור" and "פריט\תיאור" → "פריט תיאור"
        normalized = normalized.replace(/[\/\\]/g, ' ');

        // Trim and normalize spaces
        normalized = normalized.trim().replace(RESOLVER_CONFIG.EXTRA_SPACES, ' ');

        // Lowercase for case-insensitive comparison
        normalized = normalized.toLowerCase();

        return normalized;
    }

    /**
     * Detect value type from sample values
     * @param {Array} values - Sample values from column
     * @returns {string} Detected type: 'number', 'date', 'text'
     */
    function detectColumnType(values) {
        const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
        if (nonEmpty.length === 0) return 'text';

        let numericCount = 0;
        let dateCount = 0;

        for (const val of nonEmpty.slice(0, 10)) { // Sample first 10
            const strVal = String(val);

            // Check numeric (including Hebrew thousands separator)
            if (/^[\d,.\-\s]+$/.test(strVal.replace(/,/g, ''))) {
                numericCount++;
            }
            // Check date patterns
            else if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(strVal)) {
                dateCount++;
            }
        }

        const total = nonEmpty.slice(0, 10).length;
        if (numericCount / total > 0.7) return 'number';
        if (dateCount / total > 0.7) return 'date';
        return 'text';
    }

    // ============ MULTI-TIER COLUMN MATCHING ============

    /**
     * Match Excel headers to table columns using 3-tier strategy
     * WITH CONTEXT ENFORCEMENT: employee ↔ employer matches are blocked
     *
     * @param {string[]} excelHeaders - Headers from Excel
     * @param {Object[]} tableColumns - Columns from table mapping
     * @param {any[][]} sampleRows - First few rows for type detection
     * @returns {Object} { matches: { excelIndex: { columnId, confidence, tier } }, unmatched: [] }
     */
    function matchColumns(excelHeaders, tableColumns, sampleRows = []) {
        const matches = {};
        const usedColumnIds = new Set();
        const unmatchedHeaders = [];
        const contextRejections = []; // Track context-based rejections

        // Pre-compute normalized versions AND detect contexts
        const normalizedHeaders = excelHeaders.map(h => normalizeText(h));
        const headerContexts = excelHeaders.map(h => detectContextFromHeader(h));

        const normalizedColumns = tableColumns.map(col => ({
            ...col,
            normalizedHebrew: normalizeText(col.hebrewName),
            normalizedEnglish: normalizeText(col.englishId),
            normalizedId: normalizeText(col.columnId),
            detectedContext: detectContextFromField(col)
        }));

        // Detect Excel column types from sample data
        const excelColumnTypes = excelHeaders.map((_, idx) => {
            const colValues = sampleRows.map(row => row[idx]);
            return detectColumnType(colValues);
        });

        // ============ TIER 1: Exact Match ============
        excelHeaders.forEach((header, excelIdx) => {
            if (matches[excelIdx]) return; // Already matched

            const excelContext = headerContexts[excelIdx];

            for (const col of normalizedColumns) {
                if (usedColumnIds.has(col.columnId)) continue;

                const headerLower = header.toLowerCase().trim();

                if (headerLower === col.hebrewName?.toLowerCase() ||
                    headerLower === col.englishId?.toLowerCase() ||
                    headerLower === col.columnId?.toLowerCase()) {

                    // CONTEXT CHECK: Block incompatible contexts
                    if (RESOLVER_CONFIG.STRICT_CONTEXT_MATCHING &&
                        !areContextsCompatible(excelContext, col.detectedContext)) {
                        contextRejections.push({
                            header,
                            columnId: col.columnId,
                            excelContext,
                            fieldContext: col.detectedContext,
                            tier: 1
                        });
                        console.warn(`[Tier1] CONTEXT BLOCKED: "${header}" (${excelContext}) → ${col.columnId} (${col.detectedContext})`);
                        continue; // Try next column
                    }

                    matches[excelIdx] = {
                        columnId: col.columnId,
                        hebrewName: col.hebrewName,
                        englishId: col.englishId,
                        confidence: 1.0,
                        tier: 1,
                        matchType: 'exact',
                        context: col.detectedContext
                    };
                    usedColumnIds.add(col.columnId);
                    console.log(`[Tier1] Exact: "${header}" → ${col.columnId} (context: ${col.detectedContext})`);
                    break;
                }
            }
        });

        // ============ TIER 1.5: Semantic/Alias Match ============
        excelHeaders.forEach((header, excelIdx) => {
            if (matches[excelIdx]) return;

            const excelContext = headerContexts[excelIdx];

            for (const col of normalizedColumns) {
                if (usedColumnIds.has(col.columnId)) continue;

                // Check semantic similarity using aliases
                if (areSemanticallySimilar(header, col.hebrewName) ||
                    areSemanticallySimilar(header, col.englishId)) {

                    // CONTEXT CHECK: Block incompatible contexts
                    if (RESOLVER_CONFIG.STRICT_CONTEXT_MATCHING &&
                        !areContextsCompatible(excelContext, col.detectedContext)) {
                        contextRejections.push({
                            header,
                            columnId: col.columnId,
                            excelContext,
                            fieldContext: col.detectedContext,
                            tier: 1.5
                        });
                        console.warn(`[Tier1.5] CONTEXT BLOCKED: "${header}" (${excelContext}) → ${col.columnId} (${col.detectedContext})`);
                        continue;
                    }

                    matches[excelIdx] = {
                        columnId: col.columnId,
                        hebrewName: col.hebrewName,
                        englishId: col.englishId,
                        confidence: 0.9,
                        tier: 1.5,
                        matchType: 'semantic',
                        context: col.detectedContext
                    };
                    usedColumnIds.add(col.columnId);
                    console.log(`[Tier1.5] Semantic: "${header}" → ${col.columnId} (${col.hebrewName})`);
                    break;
                }
            }
        });

        // ============ TIER 2: Normalized/Soft Match ============
        excelHeaders.forEach((header, excelIdx) => {
            if (matches[excelIdx]) return;

            const normalizedHeader = normalizedHeaders[excelIdx];
            const excelContext = headerContexts[excelIdx];
            if (!normalizedHeader) return;

            for (const col of normalizedColumns) {
                if (usedColumnIds.has(col.columnId)) continue;

                // Check normalized matches
                if (normalizedHeader === col.normalizedHebrew ||
                    normalizedHeader === col.normalizedEnglish ||
                    normalizedHeader === col.normalizedId) {

                    // CONTEXT CHECK: Block incompatible contexts
                    if (RESOLVER_CONFIG.STRICT_CONTEXT_MATCHING &&
                        !areContextsCompatible(excelContext, col.detectedContext)) {
                        contextRejections.push({
                            header,
                            columnId: col.columnId,
                            excelContext,
                            fieldContext: col.detectedContext,
                            tier: 2
                        });
                        console.warn(`[Tier2] CONTEXT BLOCKED: "${header}" (${excelContext}) → ${col.columnId} (${col.detectedContext})`);
                        continue;
                    }

                    matches[excelIdx] = {
                        columnId: col.columnId,
                        hebrewName: col.hebrewName,
                        englishId: col.englishId,
                        confidence: 0.85,
                        tier: 2,
                        matchType: 'normalized',
                        context: col.detectedContext
                    };
                    usedColumnIds.add(col.columnId);
                    console.log(`[Tier2] Normalized: "${header}" → ${col.columnId}`);
                    break;
                }

                // Partial match: header contains column name or vice versa
                if (normalizedHeader.includes(col.normalizedHebrew) ||
                    col.normalizedHebrew?.includes(normalizedHeader)) {

                    // CONTEXT CHECK: Block incompatible contexts
                    if (RESOLVER_CONFIG.STRICT_CONTEXT_MATCHING &&
                        !areContextsCompatible(excelContext, col.detectedContext)) {
                        contextRejections.push({
                            header,
                            columnId: col.columnId,
                            excelContext,
                            fieldContext: col.detectedContext,
                            tier: 2
                        });
                        console.warn(`[Tier2] CONTEXT BLOCKED (partial): "${header}" (${excelContext}) → ${col.columnId} (${col.detectedContext})`);
                        continue;
                    }

                    matches[excelIdx] = {
                        columnId: col.columnId,
                        hebrewName: col.hebrewName,
                        englishId: col.englishId,
                        confidence: 0.7,
                        tier: 2,
                        matchType: 'partial',
                        context: col.detectedContext
                    };
                    usedColumnIds.add(col.columnId);
                    console.log(`[Tier2] Partial: "${header}" → ${col.columnId}`);
                    break;
                }
            }
        });

        // ============ TIER 3: Type-Based Fallback ============
        excelHeaders.forEach((header, excelIdx) => {
            if (matches[excelIdx]) return;

            const excelType = excelColumnTypes[excelIdx];
            const excelContext = headerContexts[excelIdx];

            // Find unmatched columns with matching type AND compatible context
            const candidateColumns = normalizedColumns.filter(col => {
                if (usedColumnIds.has(col.columnId)) return false;

                // Type check
                const typeOk = col.type === excelType ||
                    (excelType === 'number' && col.type === 'text');
                if (!typeOk) return false;

                // Context check (strict mode)
                if (RESOLVER_CONFIG.STRICT_CONTEXT_MATCHING &&
                    !areContextsCompatible(excelContext, col.detectedContext)) {
                    contextRejections.push({
                        header,
                        columnId: col.columnId,
                        excelContext,
                        fieldContext: col.detectedContext,
                        tier: 3
                    });
                    return false;
                }

                return true;
            });

            if (candidateColumns.length === 1) {
                // Single candidate - use it
                const col = candidateColumns[0];
                matches[excelIdx] = {
                    columnId: col.columnId,
                    hebrewName: col.hebrewName,
                    englishId: col.englishId,
                    confidence: 0.5,
                    tier: 3,
                    matchType: 'type-based',
                    context: col.detectedContext
                };
                usedColumnIds.add(col.columnId);
                console.log(`[Tier3] Type-based: "${header}" (${excelType}) → ${col.columnId}`);
            } else {
                // Multiple or no candidates - mark as unmatched
                unmatchedHeaders.push({
                    index: excelIdx,
                    header: header,
                    detectedType: excelType,
                    candidates: candidateColumns.map(c => c.columnId)
                });
            }
        });

        // Log summary
        const matchCount = Object.keys(matches).length;
        console.log(`[ExcelDataResolver] Matched ${matchCount}/${excelHeaders.length} columns, ${unmatchedHeaders.length} unmatched, ${contextRejections.length} context rejections`);

        return {
            matches,
            unmatched: unmatchedHeaders,
            contextRejections,
            usedColumnIds: Array.from(usedColumnIds)
        };
    }

    // ============ ROW TRANSFORMATION ============

    /**
     * Transform Excel rows to fill engine format
     * @param {any[][]} rows - Raw Excel rows
     * @param {Object} columnMatches - Result from matchColumns()
     * @param {Object[]} tableColumns - Original table columns (for type info)
     * @returns {Object[]} Array of { columnId: value } objects
     */
    function transformRows(rows, columnMatches, tableColumns) {
        const { matches } = columnMatches;

        // Create lookup for column types and englishId mapping
        const columnTypeMap = {};
        const columnKeyMap = {};  // columnId -> preferred key (englishId or columnId)
        tableColumns.forEach(col => {
            columnTypeMap[col.columnId] = col.type || 'text';
            // Use englishId as key if available (matches LiveFill table renderer)
            columnKeyMap[col.columnId] = col.englishId || col.columnId;
        });

        return rows.map((row, rowIdx) => {
            const transformedRow = {};

            Object.entries(matches).forEach(([excelIdx, match]) => {
                const rawValue = row[parseInt(excelIdx)];
                const columnType = columnTypeMap[match.columnId];

                // Transform value based on target column type
                const transformedValue = transformValue(rawValue, columnType);

                // Use englishId as key to match LiveFill table renderer expectations
                const dataKey = columnKeyMap[match.columnId] || match.columnId;
                transformedRow[dataKey] = transformedValue;
            });

            return transformedRow;
        });
    }

    /**
     * Round number to max 2 decimal places, removing floating point artifacts
     * @param {number} num - Number to round
     * @returns {string} Rounded number as string
     */
    function roundNumber(num) {
        if (typeof num !== 'number' || isNaN(num)) return String(num);

        // Check if it's effectively a whole number
        if (Math.abs(num - Math.round(num)) < 0.0001) {
            return String(Math.round(num));
        }

        // Round to 2 decimal places max
        const rounded = Math.round(num * 100) / 100;
        return String(rounded);
    }

    /**
     * Transform a single value based on target type
     * @param {any} value - Raw value
     * @param {string} targetType - Target column type
     * @returns {any} Transformed value
     */
    function transformValue(value, targetType) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        // Handle floating point numbers regardless of type
        if (typeof value === 'number') {
            value = roundNumber(value);
        }

        switch (targetType) {
            case 'number':
                // Keep as string but clean formatting
                const numStr = String(value).replace(/[^\d.\-,]/g, '');
                return numStr;

            case 'date':
                // Use ValueHelpers if available, otherwise fallback
                if (window.ValueHelpers?.normalizeDate) {
                    const normalized = window.ValueHelpers.normalizeDate(value);
                    console.log('[Excel→Date]', 'raw=', value, '→ normalized=', normalized);
                    return normalized;
                }
                // Fallback: Handle Date objects from Excel
                if (value instanceof Date) {
                    const d = value.getDate().toString().padStart(2, '0');
                    const m = (value.getMonth() + 1).toString().padStart(2, '0');
                    const y = value.getFullYear();
                    return `${d}/${m}/${y}`;
                }
                // Fallback: Handle string dates with different separators (. - /)
                const strDate = String(value).trim();
                const dateMatch = strDate.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
                if (dateMatch) {
                    const day = dateMatch[1].padStart(2, '0');
                    const month = dateMatch[2].padStart(2, '0');
                    let year = dateMatch[3];
                    if (year.length === 2) {
                        year = parseInt(year) > 50 ? '19' + year : '20' + year;
                    }
                    return `${day}/${month}/${year}`;
                }
                return strDate;

            case 'checkbox':
                // Use centralized checkbox normalization (SSOT)
                const checked = normalizeExcelCheckboxValue(value);
                console.log('[Excel→Checkbox]', 'raw=', value, '→ checked=', checked);
                return checked;

            default:
                const strValue = String(value);
                // Add LTR mark to values with × to prevent RTL reversal
                if (strValue.includes('×')) {
                    return '\u200E' + strValue;
                }
                return strValue;
        }
    }

    // ============ MAIN RESOLVER FUNCTION ============

    /**
     * Resolve Excel file to table-ready data
     * @param {ArrayBuffer|Uint8Array} fileBytes - Excel file content
     * @param {string} fileName - File name
     * @param {Object} tableMapping - Table mapping from mapper { columns: [...], rowCount, ... }
     * @returns {Object} { data: [{ columnId: value }...], matches: {...}, unmatched: [...] }
     */
    function resolve(fileBytes, fileName, tableMapping) {
        // Step 1: Parse file
        const parsed = parseFile(fileBytes, fileName);

        // Step 2: Match columns
        const columnMatches = matchColumns(
            parsed.headers,
            tableMapping.columns,
            parsed.rows.slice(0, 5) // Sample first 5 rows for type detection
        );

        // Step 3: Transform rows
        const data = transformRows(
            parsed.rows,
            columnMatches,
            tableMapping.columns
        );

        // Step 4: Apply row limit from table mapping
        const maxRows = tableMapping.rowCount || data.length;
        const limitedData = data.slice(0, maxRows);

        if (data.length > maxRows) {
            console.warn(`[ExcelDataResolver] Data has ${data.length} rows but table only supports ${maxRows}. Truncating.`);
        }

        return {
            data: limitedData,
            totalRows: data.length,
            truncated: data.length > maxRows,
            matches: columnMatches.matches,
            unmatched: columnMatches.unmatched,
            headers: parsed.headers,
            sheetName: parsed.sheetName,
            // Raw sample rows for UI preview (first 5 rows, untransformed)
            rawSampleRows: parsed.rows.slice(0, 5),
            // All raw rows (limited to maxRows) for merge operations
            rawRows: parsed.rows.slice(0, maxRows)
        };
    }

    // ============ MANUAL OVERRIDE SUPPORT ============

    /**
     * Apply manual column mapping overrides
     * @param {Object} autoMatches - Auto-generated matches from matchColumns()
     * @param {Object} manualOverrides - User overrides { excelIndex: columnId }
     * @returns {Object} Merged matches
     */
    function applyOverrides(autoMatches, manualOverrides) {
        const merged = { ...autoMatches.matches };

        Object.entries(manualOverrides).forEach(([excelIdx, columnId]) => {
            if (columnId === null || columnId === '') {
                // User explicitly unmapped this column
                delete merged[excelIdx];
            } else {
                merged[excelIdx] = {
                    ...merged[excelIdx],
                    columnId: columnId,
                    confidence: 1.0,
                    tier: 0,
                    matchType: 'manual'
                };
            }
        });

        return { ...autoMatches, matches: merged };
    }

    // ============ V3 CANONICAL-BASED RESOLUTION ============
    // New simplified approach: mapping defines canonical + context, resolver matches both

    // ============ CONTEXT DETECTION DICTIONARY ============
    // Used to detect context from Excel column headers AND field names

    /**
     * Context patterns for detection
     * Each context has patterns that indicate it BELONGS to that context
     * Priority order: employer > spouse > company > bank > employee (default)
     */
    const CONTEXT_PATTERNS = {
        employer: [
            'מעסיק', 'מעביד', 'מקום_עבודה', 'מקום עבודה', 'המעסיק',
            'employer', 'company_name', 'employer_name', 'employer_',
            'חברה המעסיקה', 'שם המעסיק', 'כתובת המעסיק', 'טלפון המעסיק'
        ],
        spouse: [
            'בן זוג', 'בת זוג', 'בן/בת זוג', 'spouse', 'partner',
            'spouse_', '_spouse', 'נלווה', 'שם בן הזוג', 'שם בת הזוג'
        ],
        company: [
            'חברה', 'עסק', 'ח.פ', 'ע.מ', 'company', 'business',
            'company_', '_company'
        ],
        bank: [
            'בנק', 'bank', 'bank_', '_bank', 'חשבון בנק', 'סניף בנק',
            'מספר חשבון', 'מספר סניף', 'iban', 'swift'
        ],
        employee: [
            'עובד', 'עובדת', 'שלי', 'האישי', 'שלך', 'employee', 'personal',
            'employee_', '_employee', 'פרטי', 'פרטיים'
        ]
    };

    /**
     * Field name patterns that indicate a specific context
     * Maps canonical field names to their typical context
     * This is used when field.context is not explicitly set
     */
    const FIELD_CONTEXT_MAP = {
        // Employer fields (MUST NOT match to employee)
        'employer_name': 'employer',
        'employer_address': 'employer',
        'employer_phone': 'employer',
        'employer_id': 'employer',
        'employer_email': 'employer',
        'company_name': 'employer',
        'מעסיק': 'employer',
        'שם_המעסיק': 'employer',
        'שם המעסיק': 'employer',
        'כתובת המעסיק': 'employer',
        'טלפון המעסיק': 'employer',

        // Spouse fields
        'spouse_name': 'spouse',
        'spouse_id': 'spouse',
        'spouse_phone': 'spouse',
        'spouse_email': 'spouse',
        'בן_זוג': 'spouse',
        'בת_זוג': 'spouse',
        'שם בן הזוג': 'spouse',
        'שם בת הזוג': 'spouse',
        'ת.ז בן/בת זוג': 'spouse',

        // Employee fields (default context)
        'first_name': 'employee',
        'last_name': 'employee',
        'id_number': 'employee',
        'email': 'employee',
        'phone': 'employee',
        'address': 'employee',
        'city': 'employee',
        'birth_date': 'employee',
        'שם_פרטי': 'employee',
        'שם_משפחה': 'employee',
        'מספר_זהות': 'employee',
        'תאריך_לידה': 'employee'
    };

    /**
     * Detect context from Excel column header
     * @param {string} header - Excel column header
     * @returns {string|null} Detected context or null
     */
    function detectContextFromHeader(header) {
        if (!header) return null;

        const headerLower = header.toLowerCase().trim();

        // Check in priority order: employer > spouse > company > bank > employee
        const contextPriority = ['employer', 'spouse', 'company', 'bank', 'employee'];

        for (const context of contextPriority) {
            const patterns = CONTEXT_PATTERNS[context];
            for (const pattern of patterns) {
                if (headerLower.includes(pattern.toLowerCase())) {
                    console.log(`[Context] Header "${header}" → context: ${context} (pattern: ${pattern})`);
                    return context;
                }
            }
        }

        return null;
    }

    /**
     * Detect context from field/column metadata
     * Uses field name patterns and explicit context property
     *
     * @param {Object} field - Field object with id, englishId, hebrewName, context
     * @returns {string} Context ('employee' | 'employer' | 'spouse' | 'bank' | 'company')
     */
    function detectContextFromField(field) {
        // 1. Explicit context takes priority
        if (field.context) {
            return field.context;
        }

        // 2. Check field ID against known patterns
        const fieldId = (field.id || field.englishId || field.columnId || '').toLowerCase();
        if (FIELD_CONTEXT_MAP[fieldId]) {
            return FIELD_CONTEXT_MAP[fieldId];
        }

        // 3. Check hebrewName against known patterns
        const hebrewName = (field.hebrewName || field.label_he || '').toLowerCase();
        if (FIELD_CONTEXT_MAP[hebrewName]) {
            return FIELD_CONTEXT_MAP[hebrewName];
        }

        // 4. Check if field name contains context indicators
        const combinedName = `${fieldId} ${hebrewName}`;

        // Check in priority order: employer > spouse > company > bank
        const contextPriority = ['employer', 'spouse', 'company', 'bank'];

        for (const context of contextPriority) {
            const patterns = CONTEXT_PATTERNS[context];
            for (const pattern of patterns) {
                if (combinedName.includes(pattern.toLowerCase())) {
                    console.log(`[Context] Field "${field.id || field.hebrewName}" → context: ${context}`);
                    return context;
                }
            }
        }

        // 5. Default to employee
        return 'employee';
    }

    /**
     * Check if two contexts are compatible for matching
     * STRICT: Different contexts are NOT compatible
     *
     * @param {string} excelContext - Context detected from Excel header
     * @param {string} fieldContext - Context of target field
     * @returns {boolean} True if compatible, false if incompatible
     */
    function areContextsCompatible(excelContext, fieldContext) {
        // If either is null/undefined, allow match (lenient mode)
        if (!excelContext || !fieldContext) {
            return true;
        }

        // Normalize contexts
        const ec = excelContext.toLowerCase();
        const fc = fieldContext.toLowerCase();

        // Exact match
        if (ec === fc) return true;

        // Incompatible: employee ↔ employer
        if ((ec === 'employee' && fc === 'employer') ||
            (ec === 'employer' && fc === 'employee')) {
            console.warn(`[Context] BLOCKED: ${ec} ↔ ${fc} are incompatible`);
            return false;
        }

        // Incompatible: employee ↔ spouse
        if ((ec === 'employee' && fc === 'spouse') ||
            (ec === 'spouse' && fc === 'employee')) {
            console.warn(`[Context] BLOCKED: ${ec} ↔ ${fc} are incompatible`);
            return false;
        }

        // company and employer are compatible
        if ((ec === 'company' && fc === 'employer') ||
            (ec === 'employer' && fc === 'company')) {
            return true;
        }

        // All other combinations: reject if strict mode
        if (RESOLVER_CONFIG.STRICT_CONTEXT_MATCHING) {
            console.warn(`[Context] BLOCKED (strict): ${ec} ↔ ${fc}`);
            return false;
        }

        return true;
    }

    /**
     * Match Excel column header to a canonical name
     * Uses the synonyms dictionary for matching
     * @param {string} header - Excel column header
     * @returns {string|null} Matched canonical or null
     */
    function matchHeaderToCanonical(header) {
        if (!header) return null;

        const headerLower = header.toLowerCase().trim();
        const dictionary = window.SEMANTIC_DICTIONARY;

        if (!dictionary) {
            console.warn('[ExcelDataResolver] SEMANTIC_DICTIONARY not loaded');
            return null;
        }

        // Check each canonical and its synonyms
        for (const [canonical, synonyms] of Object.entries(dictionary)) {
            for (const synonym of synonyms) {
                const synLower = synonym.toLowerCase();

                // Exact match
                if (headerLower === synLower) {
                    return canonical;
                }

                // Header contains synonym (for longer headers)
                if (headerLower.includes(synLower) && synLower.length > 3) {
                    return canonical;
                }

                // Synonym contains header (for abbreviated headers)
                if (synLower.includes(headerLower) && headerLower.length > 3) {
                    return canonical;
                }
            }
        }

        return null;
    }

    /**
     * Build canonical+context → Excel column index map
     * @param {string[]} headers - Excel column headers
     * @returns {Object} { columns: [{ index, header, canonical, context }], ... }
     */
    function buildCanonicalMap(headers) {
        const columns = [];

        headers.forEach((header, index) => {
            const canonical = matchHeaderToCanonical(header);
            if (canonical) {
                const context = detectContextFromHeader(header);
                columns.push({
                    index,
                    header,
                    canonical,
                    context // may be null if not detected
                });
                console.log(`[CanonicalMap] "${header}" → canonical=${canonical}, context=${context || 'NOT_DETECTED'} (col ${index})`);
            }
        });

        return { columns };
    }

    /**
     * V3 Canonical+Context based resolution
     * Uses the rich mapping with canonical + context fields to match Excel data deterministically
     *
     * CRITICAL: Always matches by canonical + context together, never canonical alone
     *
     * @param {ArrayBuffer|Uint8Array} fileBytes - Excel file content
     * @param {string} fileName - File name
     * @param {Object} fieldsMapping - Rich mapping { fields: [...], radioGroups: [...] }
     * @returns {Object} { fieldValues: { fieldId: value }, rowsData: [...], stats: {...} }
     */
    function resolveWithCanonical(fileBytes, fileName, fieldsMapping) {
        console.log('[ExcelDataResolver] V3 Canonical+Context Resolution starting...');

        // Step 1: Parse Excel file
        const parsed = parseFile(fileBytes, fileName);
        const { headers, rows } = parsed;

        // Step 2: Build canonical+context → Excel column map
        const canonicalMap = buildCanonicalMap(headers);
        console.log('[ExcelDataResolver] Canonical map:', canonicalMap);

        // Step 3: Build field lookup by canonical+context (composite key)
        const fieldsByKey = {};      // key = "canonical:context" → [fields]
        const fieldsByCanonical = {}; // canonical → [fields] (for ambiguity detection)
        const fieldsById = {};

        // Process regular fields
        if (fieldsMapping.fields) {
            for (const field of fieldsMapping.fields) {
                fieldsById[field.id] = field;
                if (field.canonical) {
                    // Track by canonical for ambiguity detection
                    if (!fieldsByCanonical[field.canonical]) {
                        fieldsByCanonical[field.canonical] = [];
                    }
                    fieldsByCanonical[field.canonical].push(field);

                    // Build composite key: canonical:context
                    const context = field.context || 'employee'; // Default to employee
                    const compositeKey = `${field.canonical}:${context}`;
                    if (!fieldsByKey[compositeKey]) {
                        fieldsByKey[compositeKey] = [];
                    }
                    fieldsByKey[compositeKey].push(field);
                }
            }
        }

        // Process radio group options
        if (fieldsMapping.radioGroups) {
            for (const group of fieldsMapping.radioGroups) {
                if (group.options) {
                    for (const option of group.options) {
                        if (option.fieldId) {
                            const fieldDef = {
                                ...option,
                                id: option.fieldId,
                                type: group.type || 'radio',
                                category: group.category,
                                context: option.context || group.context || 'employee',
                                groupId: group.groupId
                            };
                            fieldsById[option.fieldId] = fieldDef;

                            if (option.canonical) {
                                if (!fieldsByCanonical[option.canonical]) {
                                    fieldsByCanonical[option.canonical] = [];
                                }
                                fieldsByCanonical[option.canonical].push(fieldDef);

                                const compositeKey = `${option.canonical}:${fieldDef.context}`;
                                if (!fieldsByKey[compositeKey]) {
                                    fieldsByKey[compositeKey] = [];
                                }
                                fieldsByKey[compositeKey].push(fieldDef);
                            }
                        }
                    }
                }
            }
        }

        // Step 4: Process first row (single employee mode) or all rows
        const results = [];
        const rowsToProcess = rows.length > 0 ? rows : [];

        for (let rowIndex = 0; rowIndex < Math.min(rowsToProcess.length, 1); rowIndex++) {
            const row = rowsToProcess[rowIndex];
            const fieldValues = {};
            const matchedFields = [];
            const skippedColumns = [];
            const ambiguousColumns = [];

            // For each Excel column with canonical, find matching fields by canonical+context
            for (const col of canonicalMap.columns) {
                const { index: excelIndex, header, canonical, context: excelContext } = col;
                const rawValue = row[excelIndex];

                // Check if this canonical has multiple contexts in the mapping
                const fieldsWithCanonical = fieldsByCanonical[canonical] || [];
                const uniqueContexts = [...new Set(fieldsWithCanonical.map(f => f.context || 'employee'))];

                // CASE 1: No fields have this canonical - skip
                if (fieldsWithCanonical.length === 0) {
                    skippedColumns.push({
                        header,
                        canonical,
                        context: excelContext,
                        reason: 'no_field_with_canonical'
                    });
                    console.log(`[Skip] canonical=${canonical}, context=${excelContext || 'none'} - No field found`);
                    continue;
                }

                // CASE 2: Multiple contexts exist but Excel didn't specify context - AMBIGUOUS
                if (uniqueContexts.length > 1 && !excelContext) {
                    ambiguousColumns.push({
                        header,
                        canonical,
                        availableContexts: uniqueContexts,
                        reason: 'ambiguous_context'
                    });
                    console.warn(`⚠️ [Ambiguous] canonical=${canonical}. Multiple contexts found: ${uniqueContexts.join(', ')}. Skipping column "${header}"`);
                    continue;
                }

                // CASE 3: Determine which context to use
                // If Excel specified context, use it. Otherwise, default to 'employee' (only if single context or all same)
                const targetContext = excelContext || (uniqueContexts.length === 1 ? uniqueContexts[0] : 'employee');
                const compositeKey = `${canonical}:${targetContext}`;
                const matchingFields = fieldsByKey[compositeKey] || [];

                if (matchingFields.length === 0) {
                    skippedColumns.push({
                        header,
                        canonical,
                        context: targetContext,
                        reason: 'no_field_with_context'
                    });
                    console.log(`[Skip] canonical=${canonical}, context=${targetContext} - No field with this context`);
                    continue;
                }

                // CASE 4: Match found - fill the field(s)
                for (const field of matchingFields) {
                    const transformedValue = transformValue(rawValue, field.type || 'text');
                    fieldValues[field.id] = transformedValue;
                    matchedFields.push({
                        fieldId: field.id,
                        canonical: canonical,
                        context: targetContext,
                        excelHeader: header,
                        rawValue: rawValue,
                        transformedValue: transformedValue
                    });
                    console.log(`[Match] canonical=${canonical}, context=${targetContext} → ${field.id}`);
                }
            }

            // Handle category-based matching (for radio/checkbox groups)
            if (fieldsMapping.radioGroups) {
                for (const group of fieldsMapping.radioGroups) {
                    if (group.category) {
                        // Find Excel column for this category
                        const categoryCol = canonicalMap.columns.find(c => c.canonical === group.category);
                        if (categoryCol) {
                            const cellValue = row[categoryCol.index];
                            const matchedOptions = matchCategoryValue(cellValue, group);

                            for (const optionFieldId of matchedOptions) {
                                fieldValues[optionFieldId] = true;
                                matchedFields.push({
                                    fieldId: optionFieldId,
                                    category: group.category,
                                    excelHeader: categoryCol.header,
                                    rawValue: cellValue,
                                    transformedValue: true
                                });
                            }
                        }
                    }
                }
            }

            results.push({
                rowIndex,
                fieldValues,
                matchedFields,
                skippedColumns,
                ambiguousColumns
            });
        }

        // Return first row result (single mode) or all
        const primaryResult = results[0] || {
            fieldValues: {},
            matchedFields: [],
            skippedColumns: [],
            ambiguousColumns: []
        };

        console.log(`[ExcelDataResolver] V3 Resolution complete:`,
            `${Object.keys(primaryResult.fieldValues).length} fields matched,`,
            `${primaryResult.skippedColumns.length} columns skipped,`,
            `${primaryResult.ambiguousColumns.length} ambiguous`);

        return {
            fieldValues: primaryResult.fieldValues,
            matchedFields: primaryResult.matchedFields,
            skippedColumns: primaryResult.skippedColumns,
            ambiguousColumns: primaryResult.ambiguousColumns,
            rowsData: results,
            headers: headers,
            totalRows: rows.length,
            canonicalMap: canonicalMap,
            stats: {
                totalFields: Object.keys(fieldsById).length,
                matchedFields: primaryResult.matchedFields.length,
                skippedColumns: primaryResult.skippedColumns.length,
                ambiguousColumns: primaryResult.ambiguousColumns.length
            }
        };
    }

    /**
     * Match a category cell value to checkbox/radio options
     * Handles multi-value cells (e.g., "משכורת חודש, משרה נוספת")
     *
     * @param {string} cellValue - Value from Excel cell
     * @param {Object} group - Radio group definition with category and options
     * @returns {Array} Array of fieldIds that should be checked
     */
    function matchCategoryValue(cellValue, group) {
        if (!cellValue || !group.options) return [];

        const matchedFieldIds = [];
        const cellLower = String(cellValue).toLowerCase().trim();

        // Use MultiValueParser if available
        let valueParts = [cellLower];
        if (window.ValueHelpers?.parseMultiValue) {
            valueParts = window.ValueHelpers.parseMultiValue(cellValue);
        } else {
            // Simple split by comma/semicolon
            valueParts = cellValue.split(/[,;]+/).map(p => p.trim().toLowerCase());
        }

        // Check each option in the group
        for (const option of group.options) {
            const optionLabel = (option.label_he || option.label || '').toLowerCase();
            const optionCanonical = option.canonical || '';

            for (const part of valueParts) {
                // Match by label
                if (optionLabel && (optionLabel.includes(part) || part.includes(optionLabel))) {
                    if (!matchedFieldIds.includes(option.fieldId)) {
                        matchedFieldIds.push(option.fieldId);
                        console.log(`[Category] "${part}" matches "${optionLabel}" → ${option.fieldId}`);
                    }
                    break;
                }

                // Match by canonical (using dictionary if available)
                if (optionCanonical && window.SEMANTIC_DICTIONARY) {
                    const synonyms = window.SEMANTIC_DICTIONARY[optionCanonical] || [];
                    for (const syn of synonyms) {
                        if (syn.toLowerCase().includes(part) || part.includes(syn.toLowerCase())) {
                            if (!matchedFieldIds.includes(option.fieldId)) {
                                matchedFieldIds.push(option.fieldId);
                                console.log(`[Category] "${part}" matches synonym "${syn}" → ${option.fieldId}`);
                            }
                            break;
                        }
                    }
                }
            }
        }

        return matchedFieldIds;
    }

    // ============ EXPORT ============

    window.ExcelDataResolver = {
        // Configuration
        config: RESOLVER_CONFIG,

        // Main API
        resolve,
        parseFile,
        matchColumns,
        transformRows,

        // V3 Canonical API (new simplified approach)
        resolveWithCanonical,
        buildCanonicalMap,
        matchHeaderToCanonical,
        matchCategoryValue,

        // Context Detection & Enforcement
        detectContextFromHeader,
        detectContextFromField,
        areContextsCompatible,
        CONTEXT_PATTERNS,
        FIELD_CONTEXT_MAP,

        // Checkbox Normalization (SSOT)
        normalizeExcelCheckboxValue,

        // Utilities
        normalizeText,
        detectColumnType,
        transformValue,
        applyOverrides
    };

    console.log('%c📊 ExcelDataResolver Module Loaded (V3 Canonical Support)', 'background: #4CAF50; color: white; font-size: 12px; padding: 3px;');
})();
