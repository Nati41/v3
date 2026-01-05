/**
 * TableDataAdapter - Thin Adapter Layer for Fill Engine
 *
 * Converts resolved data from any source (Excel, API, DB)
 * to the exact format expected by FillEngine.fillPDF().
 *
 * This is intentionally minimal - no business logic,
 * just shape enforcement and validation.
 *
 * Expected output format for tables:
 * { [tableId]: [{ columnId: value }, ...] }
 */
(function() {
    'use strict';

    // ============ FORMAT CONVERSION ============

    /**
     * Convert resolved Excel data to fill engine format
     * @param {string} tableId - Table ID from mapping
     * @param {Object[]} resolvedData - Array of { columnId: value } from ExcelDataResolver
     * @returns {Object} { [tableId]: data } ready for fillPDF
     */
    function toFillFormat(tableId, resolvedData) {
        if (!tableId) {
            throw new Error('TableDataAdapter: tableId is required');
        }

        if (!Array.isArray(resolvedData)) {
            throw new Error('TableDataAdapter: resolvedData must be an array');
        }

        return {
            [tableId]: resolvedData
        };
    }

    /**
     * Merge table data with existing form data
     * Preserves existing fields, groups, and other data
     * @param {Object} existingFormData - Current form data object
     * @param {string} tableId - Table ID
     * @param {Object[]} tableData - Table rows array
     * @returns {Object} Merged form data
     */
    function mergeWithFormData(existingFormData, tableId, tableData) {
        return {
            ...existingFormData,
            [tableId]: tableData,
            // Also support the nested tables format
            tables: {
                ...(existingFormData.tables || {}),
                [tableId]: tableData
            }
        };
    }

    /**
     * Merge multiple tables into form data
     * @param {Object} existingFormData - Current form data object
     * @param {Object} tablesData - { tableId: rowsArray, ... }
     * @returns {Object} Merged form data
     */
    function mergeMultipleTables(existingFormData, tablesData) {
        const merged = { ...existingFormData };
        const tables = { ...(existingFormData.tables || {}) };

        Object.entries(tablesData).forEach(([tableId, data]) => {
            merged[tableId] = data;
            tables[tableId] = data;
        });

        merged.tables = tables;
        return merged;
    }

    // ============ VALIDATION ============

    /**
     * Validate that data matches expected table structure
     * @param {Object[]} data - Table data array
     * @param {Object} tableMapping - Table mapping with columns
     * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
     */
    function validate(data, tableMapping) {
        const errors = [];
        const warnings = [];

        if (!Array.isArray(data)) {
            errors.push('Data must be an array of row objects');
            return { valid: false, errors, warnings };
        }

        if (data.length === 0) {
            warnings.push('Data array is empty');
            return { valid: true, errors, warnings };
        }

        // Check row count
        if (tableMapping.rowCount && data.length > tableMapping.rowCount) {
            warnings.push(`Data has ${data.length} rows but table only supports ${tableMapping.rowCount}`);
        }

        // Check column presence
        const expectedColumns = tableMapping.columns.map(c => c.columnId);
        const firstRow = data[0];
        const providedColumns = Object.keys(firstRow);

        const missingColumns = expectedColumns.filter(c => !providedColumns.includes(c));
        const extraColumns = providedColumns.filter(c => !expectedColumns.includes(c));

        if (missingColumns.length > 0) {
            warnings.push(`Missing columns: ${missingColumns.join(', ')}`);
        }

        if (extraColumns.length > 0) {
            warnings.push(`Extra columns will be ignored: ${extraColumns.join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            stats: {
                rowCount: data.length,
                columnCount: providedColumns.length,
                expectedColumns: expectedColumns.length,
                missingColumns: missingColumns.length,
                extraColumns: extraColumns.length
            }
        };
    }

    // ============ PREVIEW GENERATION ============

    /**
     * Generate preview data for UI display
     * @param {Object[]} data - Table data array
     * @param {Object} matches - Column matches from ExcelDataResolver
     * @param {number} maxRows - Maximum rows to preview
     * @returns {Object} Preview data for UI
     */
    function generatePreview(data, matches, maxRows = 5) {
        return {
            rowCount: data.length,
            previewRows: data.slice(0, maxRows),
            columnMappings: Object.entries(matches).map(([excelIdx, match]) => ({
                excelIndex: parseInt(excelIdx),
                columnId: match.columnId,
                hebrewName: match.hebrewName,
                confidence: match.confidence,
                tier: match.tier,
                matchType: match.matchType
            })),
            truncated: data.length > maxRows
        };
    }

    // ============ EXPORT ============

    window.TableDataAdapter = {
        // Main API
        toFillFormat,
        mergeWithFormData,
        mergeMultipleTables,

        // Validation
        validate,

        // Preview
        generatePreview
    };

    console.log('%c🔌 TableDataAdapter Module Loaded', 'background: #2196F3; color: white; font-size: 12px; padding: 3px;');
})();
