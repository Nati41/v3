/**
 * SmartTableDetector.js
 *
 * Detects repeating patterns in imported flat fields that look like tables.
 * Example: child1_name, child1_id, child2_name, child2_id → table "child" with columns [name, id]
 *
 * IMPORTANT: Always extracts Hebrew names from label_he for display.
 * English patterns are used for grouping, but Hebrew labels are used for UI.
 */

export class SmartTableDetector {

    // Minimum requirements for table detection
    static MIN_ROWS = 2;
    static MIN_COLUMNS = 2;

    // Hebrew patterns for extracting column/base names
    static HEBREW_PATTERNS = [
        // Pattern: column + base + index (e.g., "שם ילד 1", "תאריך לידה ילד 2")
        { regex: /^(.+?)\s+(ילד|ילדים|הכנסה|הכנסות|שינוי|שינויים|עובד|עובדים)\s+(\d+)$/, groups: ['column', 'base', 'index'] },
        // Pattern: base + index + column (e.g., "ילד 1 בחזקתי")
        { regex: /^(ילד|ילדים|הכנסה|הכנסות|שינוי|שינויים|עובד|עובדים)\s+(\d+)\s+(.+)$/, groups: ['base', 'index', 'column'] },
        // Pattern: column + index + separator + details (e.g., "הכנסה אחרת 1 - סוג הכנסה")
        { regex: /^(.+?)\s+(\d+)\s*[-–]\s*(.+)$/, groups: ['prefix', 'index', 'column'] }
    ];

    // English patterns for grouping
    static ENGLISH_PATTERNS = [
        // Pattern 1: base + index + _ + column (e.g., child1_name, row2_amount)
        { regex: /^([a-zA-Z]+)(\d+)_([a-zA-Z_]+)$/, groups: ['base', 'index', 'column'] },
        // Pattern 2: base + _ + column + index (e.g., child_name_1, employee_id_2)
        { regex: /^([a-zA-Z]+)_([a-zA-Z_]+)_?(\d+)$/, groups: ['base', 'column', 'index'] },
        // Pattern 3: base + _ + index + _ + column (e.g., child_1_name)
        { regex: /^([a-zA-Z]+)_(\d+)_([a-zA-Z_]+)$/, groups: ['base', 'index', 'column'] }
    ];

    /**
     * Detect table patterns from fields
     * @param {Array} fields - Array of field objects
     * @returns {Array} Array of table candidates
     */
    static detect(fields) {
        console.log('[SmartTableDetector] Scanning', fields.length, 'fields for table patterns...');

        const groups = new Map(); // base → { columns: Map, indices: Set, fields: [], baseHe: string }

        // Scan each field
        for (const field of fields) {
            // Try to extract Hebrew info from label_he FIRST (for display names)
            const hebrewExtracted = this._extractFromHebrew(field.label_he);

            // Try English patterns on label_en/id (for grouping)
            const englishIdentifier = field.label_en || field.id || '';
            const englishExtracted = this._extractFromEnglish(englishIdentifier);

            // Determine which extraction to use for grouping
            let matched = false;

            if (hebrewExtracted) {
                // Hebrew matched - use Hebrew for everything
                this._addToGroup(groups, {
                    base: hebrewExtracted.base,
                    baseHe: hebrewExtracted.base,
                    column: hebrewExtracted.column,
                    columnHe: hebrewExtracted.column,
                    index: hebrewExtracted.index,
                    field
                });
                matched = true;
            } else if (englishExtracted) {
                // English matched - use English for grouping, but try to get Hebrew column name
                const columnHe = this._extractHebrewColumnFromLabel(field.label_he, englishExtracted.base);
                const baseHe = this._englishBaseToHebrew(englishExtracted.base);

                this._addToGroup(groups, {
                    base: englishExtracted.base.toLowerCase(),
                    baseHe: baseHe,
                    column: englishExtracted.column.toLowerCase(),
                    columnHe: columnHe || this._englishColumnToHebrew(englishExtracted.column),
                    index: englishExtracted.index,
                    field
                });
                matched = true;
            }

            if (!matched) {
                // No pattern matched
                console.log(`[SmartTableDetector] No pattern match for field: ${field.id}`);
            }
        }

        // Build table candidates from groups
        const tableCandidates = [];
        for (const [base, group] of groups) {
            const rowCount = group.indices.size;
            const columnCount = group.columns.size;

            if (rowCount >= this.MIN_ROWS && columnCount >= this.MIN_COLUMNS) {
                const rows = Array.from(group.indices).sort((a, b) => a - b);

                // Build columns array with Hebrew names, maintaining order
                const columnsArray = [];
                for (const [colKey, colData] of group.columns) {
                    columnsArray.push({
                        key: colKey,
                        hebrewName: colData.hebrewName,
                        englishId: colData.englishId || colKey,
                        // Sort by first occurrence index for consistent ordering
                        firstIndex: colData.firstIndex
                    });
                }
                // Sort columns by first occurrence
                columnsArray.sort((a, b) => a.firstIndex - b.firstIndex);

                tableCandidates.push({
                    base: base,
                    baseHe: group.baseHe || base,  // Hebrew base name for display
                    rows,
                    columns: columnsArray.map(c => c.key),
                    columnsHe: columnsArray.map(c => c.hebrewName),  // Hebrew column names
                    columnsData: columnsArray,  // Full column data
                    rowCount,
                    columnCount,
                    fieldIds: group.fields.map(f => f.fieldId),
                    fields: group.fields
                });

                console.log(`[SmartTableDetector] ✅ Detected table: "${group.baseHe || base}" (${columnCount} columns × ${rowCount} rows)`);
                console.log(`[SmartTableDetector]    Columns (Hebrew): ${columnsArray.map(c => c.hebrewName).join(', ')}`);
            }
        }

        console.log(`[SmartTableDetector] Found ${tableCandidates.length} table candidates`);
        return tableCandidates;
    }

    /**
     * Extract base, column, index from Hebrew label
     */
    static _extractFromHebrew(labelHe) {
        if (!labelHe) return null;

        for (const pattern of this.HEBREW_PATTERNS) {
            const match = labelHe.match(pattern.regex);
            if (match) {
                const result = {};
                pattern.groups.forEach((groupName, idx) => {
                    result[groupName] = match[idx + 1]?.trim();
                });

                // Handle special case for prefix pattern
                if (result.prefix && !result.base) {
                    result.base = result.prefix.split(/\s+/)[0];
                }

                result.index = parseInt(result.index, 10);
                return result;
            }
        }
        return null;
    }

    /**
     * Extract base, column, index from English identifier
     */
    static _extractFromEnglish(identifier) {
        if (!identifier) return null;

        for (const pattern of this.ENGLISH_PATTERNS) {
            const match = identifier.match(pattern.regex);
            if (match) {
                const result = {};
                pattern.groups.forEach((groupName, idx) => {
                    result[groupName] = match[idx + 1];
                });
                result.index = parseInt(result.index, 10);
                return result;
            }
        }
        return null;
    }

    /**
     * Try to extract Hebrew column name from full Hebrew label
     * when we only have English pattern match
     */
    static _extractHebrewColumnFromLabel(labelHe, englishBase) {
        if (!labelHe) return null;

        // Try Hebrew patterns to extract column part
        const extracted = this._extractFromHebrew(labelHe);
        if (extracted && extracted.column) {
            return extracted.column;
        }

        // If label doesn't match Hebrew patterns, use it directly
        // (might be a simple Hebrew label without pattern)
        // Remove any numbers and common base words
        let cleaned = labelHe
            .replace(/\d+/g, '')  // Remove numbers
            .replace(/\s*(ילד|ילדים|הכנסה|הכנסות|עובד|עובדים|שינוי|שינויים)\s*/g, ' ')  // Remove base words
            .trim();

        return cleaned || labelHe;
    }

    /**
     * Convert English base name to Hebrew
     */
    static _englishBaseToHebrew(base) {
        const map = {
            'child': 'ילד',
            'children': 'ילדים',
            'kid': 'ילד',
            'kids': 'ילדים',
            'income': 'הכנסה',
            'incomes': 'הכנסות',
            'employee': 'עובד',
            'employees': 'עובדים',
            'change': 'שינוי',
            'changes': 'שינויים',
            'row': 'שורה',
            'item': 'פריט',
            'entry': 'רשומה'
        };
        return map[base.toLowerCase()] || base;
    }

    /**
     * Convert English column name to Hebrew
     */
    static _englishColumnToHebrew(column) {
        const map = {
            'name': 'שם',
            'first_name': 'שם פרטי',
            'firstname': 'שם פרטי',
            'last_name': 'שם משפחה',
            'lastname': 'שם משפחה',
            'id': 'ת.ז.',
            'id_number': 'מספר זהות',
            'idnumber': 'מספר זהות',
            'birthdate': 'תאריך לידה',
            'birth_date': 'תאריך לידה',
            'date_of_birth': 'תאריך לידה',
            'custody': 'משמורת',
            'gender': 'מין',
            'sex': 'מין',
            'phone': 'טלפון',
            'telephone': 'טלפון',
            'email': 'אימייל',
            'address': 'כתובת',
            'amount': 'סכום',
            'sum': 'סכום',
            'total': 'סה"כ',
            'date': 'תאריך',
            'description': 'תיאור',
            'notes': 'הערות',
            'comment': 'הערה',
            'type': 'סוג',
            'status': 'סטטוס'
        };
        return map[column.toLowerCase()] || column;
    }

    /**
     * Add field to a group
     */
    static _addToGroup(groups, { base, baseHe, column, columnHe, index, field }) {
        if (!groups.has(base)) {
            groups.set(base, {
                base,
                baseHe: baseHe,
                columns: new Map(),  // column key → { hebrewName, englishId, firstIndex }
                indices: new Set(),
                fields: []
            });
        }

        const group = groups.get(base);

        // Update baseHe if we have a better Hebrew version
        if (baseHe && !group.baseHe) {
            group.baseHe = baseHe;
        }

        // Add column with Hebrew name
        if (!group.columns.has(column)) {
            group.columns.set(column, {
                hebrewName: columnHe || column,
                englishId: column,
                firstIndex: index  // Track first occurrence for ordering
            });
        }

        group.indices.add(index);
        group.fields.push({
            fieldId: field.id,
            index,
            column,
            columnHe: columnHe || column,
            label_he: field.label_he,
            label_en: field.label_en
        });
    }

    /**
     * Build column definitions from detected table
     * Uses Hebrew names for display
     * @param {Object} tableCandidate - Table candidate
     * @returns {Array} Column definitions for TableBuilder
     */
    static buildColumnDefinitions(tableCandidate) {
        // Use columnsData which has full info including Hebrew names
        if (tableCandidate.columnsData && tableCandidate.columnsData.length > 0) {
            return tableCandidate.columnsData.map((colData, idx) => ({
                columnId: `col_${idx + 1}`,
                hebrewName: colData.hebrewName,  // Use Hebrew name from detection
                englishId: colData.englishId || colData.key,
                type: this._inferColumnType(colData.hebrewName, colData.englishId),
                linked: true,
                _originalKey: colData.key
            }));
        }

        // Fallback: use columnsHe array
        return tableCandidate.columns.map((col, idx) => {
            const hebrewName = tableCandidate.columnsHe?.[idx] || col;

            return {
                columnId: `col_${idx + 1}`,
                hebrewName: hebrewName,
                englishId: col,
                type: this._inferColumnType(hebrewName, col),
                linked: true
            };
        });
    }

    /**
     * Get Hebrew table title from candidate
     */
    static getHebrewTitle(tableCandidate) {
        return tableCandidate.baseHe || tableCandidate.base;
    }

    /**
     * Infer column type from Hebrew and English names
     */
    static _inferColumnType(hebrewName, englishName) {
        const he = (hebrewName || '').toLowerCase();
        const en = (englishName || '').toLowerCase();

        // Date patterns
        if (he.includes('תאריך') || he.includes('לידה') ||
            en.includes('date') || en.includes('birth')) {
            return 'date';
        }

        // Number patterns
        if (he.includes('סכום') || he.includes('מספר') && !he.includes('זהות') ||
            en.includes('amount') || en.includes('sum') || en.includes('total')) {
            return 'number';
        }

        // Checkbox patterns
        if (he.includes('בחזקתי') || he.includes('קצבת') || he.includes('האם') ||
            en.includes('check') || en.includes('custody') || en.includes('is_')) {
            return 'checkbox';
        }

        return 'text';
    }

    /**
     * Get field IDs that belong to a detected table
     */
    static getTableFieldIds(tableCandidate) {
        return tableCandidate.fieldIds || [];
    }

    /**
     * Check if any table candidates were detected
     */
    static hasTablePatterns(fields) {
        return this.detect(fields).length > 0;
    }
}

export default SmartTableDetector;
