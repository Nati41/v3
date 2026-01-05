/**
 * TableValidator - Validation functions for table mapping in Mapper V3
 *
 * MIGRATED FROM: /src/shared/tables/tableValidatorWrapper.js
 * NO LOGIC CHANGES - Exact copy of validation functions
 *
 * Validation types:
 * - Header: size, position
 * - Sample row: size, position relative to header
 * - Column: position within sample row, no overlap
 * - Row count: valid number range
 */

// Define TableSteps locally to avoid circular dependency
// (TableFlowController also exports these)
// NEW FLOW: tableBBox FIRST (visual boundaries), then title (semantic), then sampleRow (height source)
const TableSteps = {
    IDLE: 0,
    SELECT_TABLE_BBOX: 1,  // Step 1: Mark entire table boundaries (REQUIRED)
    SELECT_TITLE: 2,       // Step 2: Select table title (semantic only)
    SAMPLE_ROW: 3,         // Step 3: Select sample row (REQUIRED - row height source)
    COLUMNS: 4,            // Step 4: Define columns
    ROW_COUNT: 5,          // Step 5: Enter row count
    GENERATE: 6,           // Step 6: Generate table
    REVIEW: 7,             // Step 7: Review
};

/**
 * Validate table bbox (entire table boundaries)
 * @param {Object} bbox - Table bounding box (can be normalized 0-1 or screen pixels)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateTableBBox(bbox) {
    if (!bbox) {
        return { valid: false, error: 'לא נבחרו גבולות הטבלה' };
    }

    // Detect if normalized (0-1) or screen pixels
    const isNormalized = bbox.x <= 1 && bbox.y <= 1 && bbox.width <= 1 && bbox.height <= 1;

    // Check minimum size (different thresholds for normalized vs screen)
    // Reduced minimums for smaller tables: 120px width, 60px height, 5% fallback
    const minWidth = isNormalized ? 0.05 : 120;   // 5% or 120px
    const minHeight = isNormalized ? 0.05 : 60;   // 5% or 60px

    if (bbox.width < minWidth) {
        return { valid: false, error: 'הטבלה צרה מדי (מינימום 120 פיקסלים)' };
    }

    if (bbox.height < minHeight) {
        return { valid: false, error: 'הטבלה נמוכה מדי (מינימום 60 פיקסלים)' };
    }

    // Check valid coordinates
    if (bbox.x < 0 || bbox.y < 0) {
        return { valid: false, error: 'מיקום הטבלה לא תקין' };
    }

    return { valid: true };
}

/**
 * Validate header selection
 * @param {Object} bbox - Header bounding box (can be normalized 0-1 or screen pixels)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateHeader(bbox) {
    if (!bbox) {
        return { valid: false, error: 'לא נבחרה כותרת' };
    }

    // Detect if normalized (0-1) or screen pixels
    const isNormalized = bbox.x <= 1 && bbox.y <= 1 && bbox.width <= 1 && bbox.height <= 1;

    // Check minimum size (different thresholds for normalized vs screen)
    const minWidth = isNormalized ? 0.05 : 50;  // 5% or 50px
    const minHeight = isNormalized ? 0.01 : 10; // 1% or 10px

    if (bbox.width < minWidth) {
        return { valid: false, error: 'הכותרת צרה מדי' };
    }

    if (bbox.height < minHeight) {
        return { valid: false, error: 'הכותרת נמוכה מדי' };
    }

    // Check valid coordinates
    if (bbox.x < 0 || bbox.y < 0) {
        return { valid: false, error: 'מיקום הכותרת לא תקין' };
    }

    return { valid: true };
}

/**
 * Validate sample row selection
 * @param {Object} rowBBox - Sample row bounding box (can be normalized 0-1 or screen pixels)
 * @param {Object} headerBBox - Header bounding box (for comparison)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSampleRow(rowBBox, headerBBox) {
    if (!rowBBox) {
        return { valid: false, error: 'לא נבחרה שורה לדוגמא' };
    }

    // Detect if normalized (0-1) or screen pixels
    const isNormalized = rowBBox.x <= 1 && rowBBox.y <= 1 && rowBBox.width <= 1 && rowBBox.height <= 1;

    // Check minimum/maximum size (different thresholds for normalized vs screen)
    const minWidth = isNormalized ? 0.05 : 50;    // 5% or 50px
    const minHeight = isNormalized ? 0.01 : 10;   // 1% or 10px
    const maxHeight = isNormalized ? 0.2 : 150;   // 20% or 150px

    if (rowBBox.width < minWidth) {
        return { valid: false, error: 'השורה צרה מדי' };
    }

    if (rowBBox.height < minHeight) {
        return { valid: false, error: 'השורה נמוכה מדי' };
    }

    if (rowBBox.height > maxHeight) {
        return { valid: false, error: 'השורה גבוהה מדי' };
    }

    // Check row is below header (if header exists)
    if (headerBBox && rowBBox.y < headerBBox.y + headerBBox.height) {
        return { valid: false, error: 'השורה חייבת להיות מתחת לכותרת' };
    }

    return { valid: true };
}

/**
 * Validate column selection
 * @param {Object} columnBBox - Column bounding box (can be normalized 0-1 or screen pixels)
 * @param {Object} sampleRowBBox - Sample row bounding box
 * @param {Array} existingColumns - Already defined columns
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateColumn(columnBBox, sampleRowBBox, existingColumns = []) {
    if (!columnBBox) {
        return { valid: false, error: 'לא נבחרה עמודה' };
    }

    // Detect if normalized (0-1) or screen pixels
    const isNormalized = columnBBox.x <= 1 && columnBBox.y <= 1 && columnBBox.width <= 1 && columnBBox.height <= 1;

    // Check minimum size (different thresholds for normalized vs screen)
    // REDUCED: Allow small columns for checkmarks (V), small numbers, etc.
    const minWidth = isNormalized ? 0.005 : 5;   // 0.5% or 5px (was 2%/20px)
    const minHeight = isNormalized ? 0.005 : 5;  // 0.5% or 5px (was 1%/10px)
    const tolerance = isNormalized ? 0.02 : 20;  // 2% or 20px tolerance (increased for flexibility)

    if (columnBBox.width < minWidth) {
        return { valid: false, error: 'העמודה צרה מדי (מינימום 5 פיקסלים)' };
    }

    if (columnBBox.height < minHeight) {
        return { valid: false, error: 'העמודה נמוכה מדי' };
    }

    // Check column is within sample row bounds (with tolerance)
    if (sampleRowBBox) {
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
export function calculateOverlap(bbox1, bbox2) {
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
export function validateRowCount(count) {
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
 *
 * CRITICAL REQUIREMENTS:
 * - tableBBox: REQUIRED (user-defined visual boundaries - all rows must fit within)
 * - tableTitle: OPTIONAL (semantic only - for UI/JSON/autofill)
 * - headerRowBBox: OPTIONAL (only affects table bbox top)
 * - sampleRowBBox: REQUIRED (row height source)
 * - columns: REQUIRED (at least one)
 * - rowCount: REQUIRED (>= 1)
 */
export function validateComplete(tableModel) {
    const errors = [];

    // tableBBox is REQUIRED - user-defined visual boundaries
    if (!tableModel.tableBBox) {
        errors.push('חסרים גבולות הטבלה');
    }

    // tableTitle is OPTIONAL - semantic only, not required for table to work
    // headerRowBBox is OPTIONAL - only affects table bbox top position

    // sampleRowBBox is REQUIRED - this is the source of truth for row height
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
export function validateStep(step, model) {
    switch (step) {
        case TableSteps.SELECT_TABLE_BBOX:
            // Table bbox is REQUIRED - user-defined visual boundaries
            return validateTableBBox(model.tableBBox);

        case TableSteps.SELECT_TITLE:
            // Table title is semantic - just needs to exist (even empty is allowed for progression)
            // We allow empty title to proceed since it's optional semantically
            if (model.tableTitle && model.tableTitle.text) {
                return { valid: true };
            }
            // Allow proceeding even without title (user might not need one)
            return { valid: true, warning: 'לא נבחרה כותרת לטבלה' };

        case TableSteps.SAMPLE_ROW:
            // Sample row is REQUIRED - this is the source of truth for row height
            // No longer validates against headerBBox (which is now optional)
            return validateSampleRow(model.sampleRowBBox, null);

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
 * (For backwards compatibility with old code that uses tableValidator.header() style)
 */
export const tableValidator = {
    tableBBox: validateTableBBox,
    header: validateHeader,
    row: validateSampleRow,
    column: validateColumn,
    rowCount: validateRowCount,
    complete: validateComplete,
    validateStep: validateStep
};
