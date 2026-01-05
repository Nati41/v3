/**
 * Table Validator Wrapper
 * Provides validation functions for each step of table mapping
 *
 * Validation types:
 * - Header: size, position
 * - Sample row: size, position relative to header
 * - Column: position within sample row, no overlap
 * - Row count: valid number range
 */

import { TableSteps } from './tableStepController.js';

/**
 * Validate header selection
 * @param {Object} bbox - Header bounding box
 * @returns {{ valid: boolean, error?: string }}
 */
function validateHeader(bbox) {
    if (!bbox) {
        return { valid: false, error: 'לא נבחרה כותרת' };
    }

    // Check minimum size
    if (bbox.width < 50) {
        return { valid: false, error: 'הכותרת צרה מדי (מינימום 50 פיקסלים)' };
    }

    if (bbox.height < 10) {
        return { valid: false, error: 'הכותרת נמוכה מדי (מינימום 10 פיקסלים)' };
    }

    // Check valid coordinates
    if (bbox.x < 0 || bbox.y < 0) {
        return { valid: false, error: 'מיקום הכותרת לא תקין' };
    }

    return { valid: true };
}

/**
 * Validate sample row selection
 * @param {Object} rowBBox - Sample row bounding box
 * @param {Object} headerBBox - Header bounding box (for comparison)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSampleRow(rowBBox, headerBBox) {
    if (!rowBBox) {
        return { valid: false, error: 'לא נבחרה שורה לדוגמא' };
    }

    // Check minimum size
    if (rowBBox.width < 50) {
        return { valid: false, error: 'השורה צרה מדי (מינימום 50 פיקסלים)' };
    }

    if (rowBBox.height < 10) {
        return { valid: false, error: 'השורה נמוכה מדי (מינימום 10 פיקסלים)' };
    }

    if (rowBBox.height > 150) {
        return { valid: false, error: 'השורה גבוהה מדי (מקסימום 150 פיקסלים)' };
    }

    // Check row is below header (if header exists)
    if (headerBBox && rowBBox.y < headerBBox.y + headerBBox.height) {
        return { valid: false, error: 'השורה חייבת להיות מתחת לכותרת' };
    }

    return { valid: true };
}

/**
 * Validate column selection
 * @param {Object} columnBBox - Column bounding box
 * @param {Object} sampleRowBBox - Sample row bounding box
 * @param {Array} existingColumns - Already defined columns
 * @returns {{ valid: boolean, error?: string }}
 */
function validateColumn(columnBBox, sampleRowBBox, existingColumns = []) {
    if (!columnBBox) {
        return { valid: false, error: 'לא נבחרה עמודה' };
    }

    // Check minimum size
    if (columnBBox.width < 20) {
        return { valid: false, error: 'העמודה צרה מדי (מינימום 20 פיקסלים)' };
    }

    if (columnBBox.height < 10) {
        return { valid: false, error: 'העמודה נמוכה מדי' };
    }

    // Check column is within sample row bounds (with tolerance)
    if (sampleRowBBox) {
        const tolerance = 10;
        const rowLeft = sampleRowBBox.x - tolerance;
        const rowRight = sampleRowBBox.x + sampleRowBBox.width + tolerance;
        const rowTop = sampleRowBBox.y - tolerance;
        const rowBottom = sampleRowBBox.y + sampleRowBBox.height + tolerance;

        if (columnBBox.x < rowLeft || columnBBox.x + columnBBox.width > rowRight) {
            return { valid: false, error: 'העמודה חייבת להיות בתוך גבולות השורה' };
        }

        if (columnBBox.y < rowTop || columnBBox.y + columnBBox.height > rowBottom) {
            return { valid: false, error: 'העמודה חייבת להיות בתוך גבולות השורה' };
        }
    }

    // Check no significant overlap with existing columns
    for (const existingCol of existingColumns) {
        const overlap = calculateOverlap(columnBBox, existingCol.bbox);
        if (overlap > 0.5) { // More than 50% overlap
            return { valid: false, error: 'העמודה חופפת לעמודה קיימת' };
        }
    }

    return { valid: true };
}

/**
 * Calculate overlap ratio between two bounding boxes
 * @param {Object} bbox1 - First bounding box
 * @param {Object} bbox2 - Second bounding box
 * @returns {number} Overlap ratio (0-1)
 */
function calculateOverlap(bbox1, bbox2) {
    const x1 = Math.max(bbox1.x, bbox2.x);
    const y1 = Math.max(bbox1.y, bbox2.y);
    const x2 = Math.min(bbox1.x + bbox1.width, bbox2.x + bbox2.width);
    const y2 = Math.min(bbox1.y + bbox1.height, bbox2.y + bbox2.height);

    if (x2 < x1 || y2 < y1) {
        return 0; // No overlap
    }

    const overlapArea = (x2 - x1) * (y2 - y1);
    const bbox1Area = bbox1.width * bbox1.height;

    return overlapArea / bbox1Area;
}

/**
 * Validate row count input
 * @param {number} count - Entered row count
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRowCount(count) {
    if (count === undefined || count === null || count === '') {
        return { valid: false, error: 'יש להזין מספר שורות' };
    }

    const num = parseInt(count, 10);

    if (isNaN(num)) {
        return { valid: false, error: 'יש להזין מספר תקין' };
    }

    if (num < 1) {
        return { valid: false, error: 'חייבת להיות לפחות שורה אחת' };
    }

    if (num > 100) {
        return { valid: false, error: 'מספר השורות גדול מדי (מקסימום 100)' };
    }

    return { valid: true };
}

/**
 * Validate complete table before finishing
 * @param {Object} tableModel - Complete table model
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateComplete(tableModel) {
    const errors = [];

    // Check has header
    if (!tableModel.headerBBox) {
        errors.push('חסרה כותרת');
    }

    // Check has sample row
    if (!tableModel.sampleRowBBox) {
        errors.push('חסרה שורה לדוגמא');
    }

    // Check has at least one column
    if (!tableModel.columns || tableModel.columns.length === 0) {
        errors.push('יש להגדיר לפחות עמודה אחת');
    }

    // Check has valid row count
    if (!tableModel.rowCount || tableModel.rowCount < 1) {
        errors.push('יש להגדיר מספר שורות');
    }

    // Check all columns have names (optional - can have empty names)
    // This is a soft validation - columns can work without names

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate a specific step based on the model state
 * @param {number} step - Step number from TableSteps
 * @param {Object} model - Table model
 * @returns {{ valid: boolean, error?: string }}
 */
function validateStep(step, model) {
    switch (step) {
        case TableSteps.HEADER:
            return validateHeader(model.headerBBox);

        case TableSteps.SAMPLE_ROW:
            return validateSampleRow(model.sampleRowBBox, model.headerBBox);

        case TableSteps.COLUMNS:
            if (!model.columns || model.columns.length === 0) {
                return { valid: false, error: 'יש להגדיר לפחות עמודה אחת' };
            }
            return { valid: true };

        case TableSteps.ROW_COUNT:
            return validateRowCount(model.rowCount);

        case TableSteps.GENERATE:
            // Generation step - always valid if we got here
            return { valid: true };

        case TableSteps.REVIEW:
            // Review step - always valid if we got here
            return { valid: true };

        default:
            return { valid: false, error: 'שלב לא מוכר' };
    }
}

/**
 * Export validator object with all validation functions
 */
export const tableValidator = {
    header: validateHeader,
    row: validateSampleRow,
    column: validateColumn,
    rowCount: validateRowCount,
    complete: validateComplete,
    validateStep: validateStep
};

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.tableValidator = tableValidator;
}
