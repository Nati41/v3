/**
 * Table Validator - Table Validation & Error Handling (Step 6)
 *
 * This module provides comprehensive validation for table objects:
 * - Structure validation
 * - Row validation
 * - Column validation
 * - Sample row validation
 * - Row replication validation
 * - Export readiness check
 *
 * NOTE: All functions are modular and receive table objects as parameters.
 */
(function() {
    'use strict';

    // ============ CONFIGURATION ============

    const VALIDATION_CONFIG = {
        ROW_SPACING_TOLERANCE: 2,      // pixels - tolerance for row spacing
        MIN_COLUMN_WIDTH: 2,           // pixels - minimum column width
        MIN_ROW_HEIGHT: 5,             // pixels - minimum row height
        HEIGHT_OVERFLOW_TOLERANCE: 5,  // pixels - tolerance for height overflow
        BBOX_TOLERANCE: 2              // pixels - tolerance for bbox containment
    };

    // ============ ERROR TYPES ============

    const ERROR_TYPES = {
        CRITICAL: 'critical',
        WARNING: 'warning'
    };

    const ERROR_CODES = {
        // Critical errors
        MISSING_TABLE_ID: { code: 'E001', type: ERROR_TYPES.CRITICAL, message: 'מזהה טבלה חסר' },
        MISSING_BBOX: { code: 'E002', type: ERROR_TYPES.CRITICAL, message: 'גבולות טבלה חסרים' },
        MISSING_ROW_COUNT: { code: 'E003', type: ERROR_TYPES.CRITICAL, message: 'מספר שורות לא זוהה' },
        INVALID_ROW_HEIGHT: { code: 'E004', type: ERROR_TYPES.CRITICAL, message: 'גובה שורה לא תקין' },
        MISSING_COLUMNS: { code: 'E005', type: ERROR_TYPES.CRITICAL, message: 'לא הוגדרו עמודות' },
        MISSING_SAMPLE_ROW: { code: 'E006', type: ERROR_TYPES.CRITICAL, message: 'שורה לדוגמה חסרה' },
        COLUMN_MISSING_ID: { code: 'E007', type: ERROR_TYPES.CRITICAL, message: 'עמודה חסרת מזהה' },
        COLUMN_MISSING_NAME: { code: 'E008', type: ERROR_TYPES.CRITICAL, message: 'עמודה חסרת שם עברי' },
        COLUMN_MISSING_BBOX: { code: 'E009', type: ERROR_TYPES.CRITICAL, message: 'עמודה חסרת גבולות' },
        COLUMN_INVALID_WIDTH: { code: 'E010', type: ERROR_TYPES.CRITICAL, message: 'רוחב עמודה לא תקין' },
        ROWS_EXTEND_OUTSIDE: { code: 'E011', type: ERROR_TYPES.CRITICAL, message: 'שורות חורגות מגבולות הטבלה' },
        SAMPLE_ROW_OUTSIDE: { code: 'E012', type: ERROR_TYPES.CRITICAL, message: 'שורה לדוגמה חורגת מגבולות הטבלה' },
        COLUMN_OUTSIDE_SAMPLE: { code: 'E013', type: ERROR_TYPES.CRITICAL, message: 'עמודה חורגת מגבולות שורה לדוגמה' },
        ROW_MISSING_COLUMNS: { code: 'E014', type: ERROR_TYPES.CRITICAL, message: 'שורה חסרת עמודות' },
        ROW_OUTSIDE_TABLE: { code: 'E015', type: ERROR_TYPES.CRITICAL, message: 'שורה חורגת מגבולות הטבלה' },

        // Warnings
        ROW_SPACING_UNEVEN: { code: 'W001', type: ERROR_TYPES.WARNING, message: 'רווח בין שורות לא אחיד' },
        ROW_COUNT_ESTIMATED: { code: 'W002', type: ERROR_TYPES.WARNING, message: 'מספר שורות הוערך אך לא אושר' },
        EMPTY_TEXT_CLUSTER: { code: 'W003', type: ERROR_TYPES.WARNING, message: 'שורות ללא תוכן טקסט' },
        HEIGHT_OVERFLOW: { code: 'W004', type: ERROR_TYPES.WARNING, message: 'גובה כולל חורג מעט מגבולות' },
        COLUMN_NAME_GENERIC: { code: 'W005', type: ERROR_TYPES.WARNING, message: 'שם עמודה גנרי (col_X)' }
    };

    // ============ HELPER FUNCTIONS ============

    /**
     * Create an error object
     * @param {Object} errorDef - Error definition from ERROR_CODES
     * @param {string} details - Additional details
     * @param {Object} context - Context data (columnId, rowIndex, etc.)
     * @returns {Object} Error object
     */
    function createError(errorDef, details = '', context = {}) {
        return {
            code: errorDef.code,
            type: errorDef.type,
            message: errorDef.message,
            details: details,
            context: context,
            timestamp: Date.now()
        };
    }

    /**
     * Check if a bbox is contained within another bbox
     * @param {Object} inner - Inner bounding box
     * @param {Object} outer - Outer bounding box
     * @param {number} tolerance - Pixel tolerance
     * @returns {boolean} True if inner is within outer
     */
    function bboxContains(outer, inner, tolerance = VALIDATION_CONFIG.BBOX_TOLERANCE) {
        if (!outer || !inner) return false;

        return (
            inner.x >= outer.x - tolerance &&
            inner.y >= outer.y - tolerance &&
            inner.x + inner.width <= outer.x + outer.width + tolerance &&
            inner.y + inner.height <= outer.y + outer.height + tolerance
        );
    }

    /**
     * Check if a value is a valid positive number
     * @param {any} value - Value to check
     * @param {number} min - Minimum value (optional)
     * @returns {boolean} True if valid
     */
    function isValidPositiveNumber(value, min = 0) {
        return typeof value === 'number' && !isNaN(value) && value > min;
    }

    // ============ VALIDATION FUNCTIONS ============

    /**
     * Validate rows in a table
     * @param {Object} table - Table object
     * @returns {Object} Validation result { valid: boolean, errors: [], warnings: [] }
     */
    function validateRows(table) {
        const errors = [];
        const warnings = [];

        // Check rowCount exists and is valid
        if (!table.rowCount || table.rowCount <= 0) {
            errors.push(createError(ERROR_CODES.MISSING_ROW_COUNT));
            return { valid: false, errors, warnings };
        }

        // Check rows array exists
        if (!table.rows || !Array.isArray(table.rows)) {
            return { valid: errors.length === 0, errors, warnings };
        }

        const columnIds = (table.columns || []).map(col => col.columnId);

        // Validate each row
        table.rows.forEach((row, rowIndex) => {
            // Check row has all columns
            const rowColumnIds = Object.keys(row);
            const missingColumns = columnIds.filter(colId => !rowColumnIds.includes(colId));

            if (missingColumns.length > 0) {
                errors.push(createError(
                    ERROR_CODES.ROW_MISSING_COLUMNS,
                    `שורה ${rowIndex + 1} חסרת עמודות: ${missingColumns.join(', ')}`,
                    { rowIndex, missingColumns }
                ));
            }

            // Check row bbox fits inside table
            columnIds.forEach(colId => {
                const cell = row[colId];
                if (cell && table.bbox) {
                    const cellBBox = { x: cell.x, y: cell.y, width: cell.width, height: cell.height };
                    if (!bboxContains(table.bbox, cellBBox)) {
                        errors.push(createError(
                            ERROR_CODES.ROW_OUTSIDE_TABLE,
                            `תא בשורה ${rowIndex + 1}, עמודה ${colId} חורג מגבולות`,
                            { rowIndex, columnId: colId, cellBBox }
                        ));
                    }
                }
            });
        });

        // Check row spacing is even (if we have row positions)
        if (table.rows.length > 1 && table.columns && table.columns.length > 0) {
            const firstColId = table.columns[0].columnId;
            const yPositions = table.rows
                .map(row => row[firstColId]?.y)
                .filter(y => y !== undefined);

            if (yPositions.length > 1) {
                const gaps = [];
                for (let i = 1; i < yPositions.length; i++) {
                    gaps.push(yPositions[i] - yPositions[i - 1]);
                }

                const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                const unevenGaps = gaps.filter(g => Math.abs(g - avgGap) > VALIDATION_CONFIG.ROW_SPACING_TOLERANCE);

                if (unevenGaps.length > 0) {
                    warnings.push(createError(
                        ERROR_CODES.ROW_SPACING_UNEVEN,
                        `${unevenGaps.length} רווחים לא אחידים`,
                        { unevenCount: unevenGaps.length, avgGap }
                    ));
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate columns in a table
     * @param {Object} table - Table object
     * @returns {Object} Validation result { valid: boolean, errors: [], warnings: [] }
     */
    function validateColumns(table) {
        const errors = [];
        const warnings = [];

        // Check columns exist
        if (!table.columns || !Array.isArray(table.columns) || table.columns.length === 0) {
            errors.push(createError(ERROR_CODES.MISSING_COLUMNS));
            return { valid: false, errors, warnings };
        }

        // Validate each column
        table.columns.forEach((col, index) => {
            // Check columnId
            if (!col.columnId) {
                errors.push(createError(
                    ERROR_CODES.COLUMN_MISSING_ID,
                    `עמודה ${index + 1}`,
                    { columnIndex: index }
                ));
            }

            // Check hebrewName
            if (!col.hebrewName || col.hebrewName.trim() === '') {
                errors.push(createError(
                    ERROR_CODES.COLUMN_MISSING_NAME,
                    `עמודה ${col.columnId || index + 1}`,
                    { columnId: col.columnId, columnIndex: index }
                ));
            }

            // Check for generic names
            if (col.hebrewName && /^col_\d+$/i.test(col.hebrewName)) {
                warnings.push(createError(
                    ERROR_CODES.COLUMN_NAME_GENERIC,
                    `עמודה "${col.hebrewName}"`,
                    { columnId: col.columnId, hebrewName: col.hebrewName }
                ));
            }

            // Check bbox exists
            if (!col.bbox) {
                errors.push(createError(
                    ERROR_CODES.COLUMN_MISSING_BBOX,
                    `עמודה ${col.columnId || index + 1}`,
                    { columnId: col.columnId, columnIndex: index }
                ));
            } else {
                // Check valid width
                if (!isValidPositiveNumber(col.bbox.width, VALIDATION_CONFIG.MIN_COLUMN_WIDTH)) {
                    errors.push(createError(
                        ERROR_CODES.COLUMN_INVALID_WIDTH,
                        `עמודה ${col.columnId || index + 1}: רוחב ${col.bbox.width}px`,
                        { columnId: col.columnId, width: col.bbox.width }
                    ));
                }
            }
        });

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate sample row
     * @param {Object} table - Table object
     * @returns {Object} Validation result { valid: boolean, errors: [], warnings: [] }
     */
    function validateSampleRow(table) {
        const errors = [];
        const warnings = [];

        // Check sampleRowBBox exists
        if (!table.sampleRowBBox) {
            errors.push(createError(ERROR_CODES.MISSING_SAMPLE_ROW));
            return { valid: false, errors, warnings };
        }

        // Check sample row fits inside table
        if (table.bbox && !bboxContains(table.bbox, table.sampleRowBBox)) {
            errors.push(createError(
                ERROR_CODES.SAMPLE_ROW_OUTSIDE,
                'שורה לדוגמה חורגת מגבולות הטבלה',
                { sampleRowBBox: table.sampleRowBBox, tableBBox: table.bbox }
            ));
        }

        // Check columns fit inside sample row
        if (table.columns && Array.isArray(table.columns)) {
            table.columns.forEach((col, index) => {
                if (col.bbox && !bboxContains(table.sampleRowBBox, col.bbox)) {
                    errors.push(createError(
                        ERROR_CODES.COLUMN_OUTSIDE_SAMPLE,
                        `עמודה "${col.hebrewName || col.columnId}" חורגת משורה לדוגמה`,
                        { columnId: col.columnId, columnBBox: col.bbox, sampleRowBBox: table.sampleRowBBox }
                    ));
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate row replication parameters
     * @param {Object} table - Table object
     * @returns {Object} Validation result { valid: boolean, errors: [], warnings: [] }
     */
    function validateRowReplication(table) {
        const errors = [];
        const warnings = [];

        // Check rowHeight is positive
        if (!isValidPositiveNumber(table.rowHeight, VALIDATION_CONFIG.MIN_ROW_HEIGHT)) {
            errors.push(createError(
                ERROR_CODES.INVALID_ROW_HEIGHT,
                `גובה שורה: ${table.rowHeight}px`,
                { rowHeight: table.rowHeight }
            ));
            return { valid: false, errors, warnings };
        }

        // Check total height doesn't exceed table bbox
        if (table.bbox && table.rowCount) {
            const totalHeight = table.rowCount * table.rowHeight;
            const allowedHeight = table.bbox.height + VALIDATION_CONFIG.HEIGHT_OVERFLOW_TOLERANCE;

            if (totalHeight > allowedHeight) {
                const overflow = totalHeight - table.bbox.height;
                if (overflow > VALIDATION_CONFIG.HEIGHT_OVERFLOW_TOLERANCE) {
                    errors.push(createError(
                        ERROR_CODES.ROWS_EXTEND_OUTSIDE,
                        `גובה כולל ${totalHeight}px חורג מגבולות ${table.bbox.height}px`,
                        { totalHeight, tableHeight: table.bbox.height, overflow }
                    ));
                } else {
                    warnings.push(createError(
                        ERROR_CODES.HEIGHT_OVERFLOW,
                        `גובה כולל חורג ב-${overflow.toFixed(1)}px`,
                        { overflow }
                    ));
                }
            }
        }

        // Check if row count was estimated
        if (table.rowCountEstimated) {
            warnings.push(createError(
                ERROR_CODES.ROW_COUNT_ESTIMATED,
                'מספר השורות הוערך אוטומטית',
                { estimatedRowCount: table.rowCount }
            ));
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Check if table is ready for export
     * @param {Object} table - Table object
     * @returns {boolean} True if export-ready
     */
    function validateExportReady(table) {
        const report = validateTableStructure(table);

        // Check for any critical errors
        const hasCriticalErrors = report.errors.some(e => e.type === ERROR_TYPES.CRITICAL);

        return !hasCriticalErrors;
    }

    /**
     * Run all validations on a table
     * @param {Object} table - Table object
     * @returns {Object} Complete validation report
     */
    function validateTableStructure(table) {
        const errors = [];
        const warnings = [];

        // Basic structure checks
        if (!table) {
            errors.push(createError(ERROR_CODES.MISSING_TABLE_ID, 'אובייקט טבלה חסר'));
            return { valid: false, errors, warnings, summary: getSummary(errors, warnings) };
        }

        if (!table.tableId) {
            errors.push(createError(ERROR_CODES.MISSING_TABLE_ID));
        }

        if (!table.bbox) {
            errors.push(createError(ERROR_CODES.MISSING_BBOX));
        }

        // Run component validations
        const rowsResult = validateRows(table);
        const columnsResult = validateColumns(table);
        const sampleRowResult = validateSampleRow(table);
        const replicationResult = validateRowReplication(table);

        // Aggregate results
        errors.push(...rowsResult.errors);
        errors.push(...columnsResult.errors);
        errors.push(...sampleRowResult.errors);
        errors.push(...replicationResult.errors);

        warnings.push(...rowsResult.warnings);
        warnings.push(...columnsResult.warnings);
        warnings.push(...sampleRowResult.warnings);
        warnings.push(...replicationResult.warnings);

        // Determine overall validity
        const hasCriticalErrors = errors.some(e => e.type === ERROR_TYPES.CRITICAL);

        return {
            valid: !hasCriticalErrors,
            errors,
            warnings,
            summary: getSummary(errors, warnings),
            components: {
                rows: rowsResult.valid,
                columns: columnsResult.valid,
                sampleRow: sampleRowResult.valid,
                replication: replicationResult.valid
            }
        };
    }

    /**
     * Generate validation summary
     * @param {Array} errors - Array of errors
     * @param {Array} warnings - Array of warnings
     * @returns {Object} Summary object
     */
    function getSummary(errors, warnings) {
        const criticalCount = errors.filter(e => e.type === ERROR_TYPES.CRITICAL).length;
        const warningCount = warnings.length;

        let status = 'valid';
        let statusHebrew = 'תקין ✓';
        let statusClass = 'success';

        if (criticalCount > 0) {
            status = 'invalid';
            statusHebrew = `${criticalCount} שגיאות קריטיות`;
            statusClass = 'error';
        } else if (warningCount > 0) {
            status = 'warning';
            statusHebrew = `תקין עם ${warningCount} אזהרות`;
            statusClass = 'warning';
        }

        return {
            status,
            statusHebrew,
            statusClass,
            criticalCount,
            warningCount,
            totalIssues: criticalCount + warningCount
        };
    }

    /**
     * Get invalid components for overlay highlighting
     * @param {Object} table - Table object
     * @returns {Object} Invalid components { columns: [], rows: [] }
     */
    function getInvalidComponents(table) {
        const report = validateTableStructure(table);
        const invalidColumns = new Set();
        const invalidRows = new Set();

        report.errors.forEach(error => {
            if (error.context) {
                if (error.context.columnId) {
                    invalidColumns.add(error.context.columnId);
                }
                if (error.context.columnIndex !== undefined) {
                    invalidColumns.add(error.context.columnIndex);
                }
                if (error.context.rowIndex !== undefined) {
                    invalidRows.add(error.context.rowIndex);
                }
            }
        });

        return {
            columns: Array.from(invalidColumns),
            rows: Array.from(invalidRows),
            errors: report.errors,
            warnings: report.warnings
        };
    }

    /**
     * Format validation report for display
     * @param {Object} report - Validation report
     * @returns {string} Formatted HTML string
     */
    function formatReportHTML(report) {
        let html = '<div class="validation-report">';

        // Status header
        html += `<div class="validation-status ${report.summary.statusClass}">`;
        html += `<span class="status-text">${report.summary.statusHebrew}</span>`;
        html += '</div>';

        // Errors section
        if (report.errors.length > 0) {
            html += '<div class="validation-section errors">';
            html += '<h4>❌ שגיאות:</h4>';
            html += '<ul>';
            report.errors.forEach(error => {
                html += `<li class="error-item">`;
                html += `<span class="error-code">[${error.code}]</span> `;
                html += `<span class="error-message">${error.message}</span>`;
                if (error.details) {
                    html += `<span class="error-details"> - ${error.details}</span>`;
                }
                html += '</li>';
            });
            html += '</ul></div>';
        }

        // Warnings section
        if (report.warnings.length > 0) {
            html += '<div class="validation-section warnings">';
            html += '<h4>⚠️ אזהרות:</h4>';
            html += '<ul>';
            report.warnings.forEach(warning => {
                html += `<li class="warning-item">`;
                html += `<span class="warning-code">[${warning.code}]</span> `;
                html += `<span class="warning-message">${warning.message}</span>`;
                if (warning.details) {
                    html += `<span class="warning-details"> - ${warning.details}</span>`;
                }
                html += '</li>';
            });
            html += '</ul></div>';
        }

        // Components status
        if (report.components) {
            html += '<div class="validation-section components">';
            html += '<h4>📋 סטטוס רכיבים:</h4>';
            html += '<ul>';
            html += `<li class="${report.components.rows ? 'valid' : 'invalid'}">שורות: ${report.components.rows ? '✓' : '✗'}</li>`;
            html += `<li class="${report.components.columns ? 'valid' : 'invalid'}">עמודות: ${report.components.columns ? '✓' : '✗'}</li>`;
            html += `<li class="${report.components.sampleRow ? 'valid' : 'invalid'}">שורה לדוגמה: ${report.components.sampleRow ? '✓' : '✗'}</li>`;
            html += `<li class="${report.components.replication ? 'valid' : 'invalid'}">שכפול שורות: ${report.components.replication ? '✓' : '✗'}</li>`;
            html += '</ul></div>';
        }

        html += '</div>';
        return html;
    }

    // ============ EXPORT ============

    window.TableValidator = {
        // Configuration
        config: VALIDATION_CONFIG,
        errorTypes: ERROR_TYPES,
        errorCodes: ERROR_CODES,

        // Main validation functions
        validateTableStructure,
        validateRows,
        validateColumns,
        validateSampleRow,
        validateRowReplication,
        validateExportReady,

        // Helper functions
        getInvalidComponents,
        formatReportHTML,
        createError,
        bboxContains,

        // Summary
        getSummary
    };

    console.log('%c✅ Table Validator Module Loaded (Step 6)', 'background: #4CAF50; color: white; font-size: 14px; padding: 5px;');
})();
