/**
 * fieldSchema.js
 *
 * Schema validation for Field Mapper V2 format
 * Validates field objects against the canonical PDF coordinate schema
 */

const FIELD_TYPES = ['text', 'checkbox', 'radio', 'date', 'signature', 'number', 'id_number', 'phone', 'email'];

const SCHEMA_VERSION = '2.0.0';

/**
 * Validates a field object against the V2 schema
 * @param {Object} field - Field object to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validateField(field) {
    const errors = [];

    // Required fields
    if (!field.id || typeof field.id !== 'string') {
        errors.push('Field must have a valid "id" (string)');
    }

    if (typeof field.page !== 'number' || field.page < 1 || !Number.isInteger(field.page)) {
        errors.push('Field must have a valid "page" (positive integer)');
    }

    if (!field.type || !FIELD_TYPES.includes(field.type)) {
        errors.push(`Field type must be one of: ${FIELD_TYPES.join(', ')}`);
    }

    // Coordinate validation
    const hasCoordinates = validateCoordinates(field, errors);

    if (!hasCoordinates) {
        errors.push('Field must have valid PDF coordinates (pdfX, pdfY, pdfWidth, pdfHeight)');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates field coordinates
 * @param {Object} field - Field object
 * @param {Array} errors - Errors array to append to
 * @returns {boolean} True if coordinates are valid
 */
function validateCoordinates(field, errors) {
    const { pdfX, pdfY, pdfWidth, pdfHeight } = field;

    if (typeof pdfX !== 'number' || !isFinite(pdfX)) {
        errors.push(`pdfX must be a finite number, got: ${pdfX}`);
        return false;
    }

    if (typeof pdfY !== 'number' || !isFinite(pdfY)) {
        errors.push(`pdfY must be a finite number, got: ${pdfY}`);
        return false;
    }

    if (typeof pdfWidth !== 'number' || !isFinite(pdfWidth) || pdfWidth <= 0) {
        errors.push(`pdfWidth must be a positive number, got: ${pdfWidth}`);
        return false;
    }

    if (typeof pdfHeight !== 'number' || !isFinite(pdfHeight) || pdfHeight <= 0) {
        errors.push(`pdfHeight must be a positive number, got: ${pdfHeight}`);
        return false;
    }

    return true;
}

/**
 * Validates an entire mapping object
 * @param {Object} mapping - Mapping object to validate
 * @returns {{valid: boolean, errors: Object[]}} Validation result with field-level errors
 */
function validateMapping(mapping) {
    const fieldErrors = [];

    if (!mapping.version || mapping.version < 2) {
        fieldErrors.push({
            field: '__mapping__',
            errors: ['Mapping version must be 2 or higher']
        });
    }

    if (!mapping.schemaVersion || mapping.schemaVersion !== SCHEMA_VERSION) {
        fieldErrors.push({
            field: '__mapping__',
            errors: [`Schema version must be ${SCHEMA_VERSION}`]
        });
    }

    if (!Array.isArray(mapping.fields)) {
        fieldErrors.push({
            field: '__mapping__',
            errors: ['Mapping must have a "fields" array']
        });
        return { valid: false, errors: fieldErrors };
    }

    // Validate each field
    mapping.fields.forEach((field, index) => {
        const result = validateField(field);
        if (!result.valid) {
            fieldErrors.push({
                field: field.id || `field_${index}`,
                errors: result.errors
            });
        }
    });

    return {
        valid: fieldErrors.length === 0,
        errors: fieldErrors
    };
}

/**
 * Creates a valid V2 field object
 * @param {Object} params - Field parameters
 * @returns {Object} Valid V2 field object
 */
function createField(params) {
    const {
        id,
        type = 'text',
        page = 1,
        pdfX,
        pdfY,
        pdfWidth,
        pdfHeight,
        label,
        ...rest
    } = params;

    const field = {
        id,
        type,
        page,
        pdfX,
        pdfY,
        pdfWidth,
        pdfHeight,
        ...rest
    };

    if (label) field.label = label;

    const validation = validateField(field);
    if (!validation.valid) {
        throw new Error(`Invalid field: ${validation.errors.join(', ')}`);
    }

    return field;
}

/**
 * Logs validation errors to console and UI log panel
 * @param {Array} errors - Array of error objects
 * @param {HTMLElement} logPanel - Optional log panel element
 */
function logValidationErrors(errors, logPanel) {
    errors.forEach(({ field, errors: fieldErrors }) => {
        const message = `❌ Field "${field}": ${fieldErrors.join('; ')}`;
        console.error(message);

        if (logPanel) {
            const logEntry = document.createElement('div');
            logEntry.style.color = '#ff0000';
            logEntry.textContent = message;
            logPanel.appendChild(logEntry);
        }
    });
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    // Node.js / CommonJS
    module.exports = {
        validateField,
        validateMapping,
        createField,
        logValidationErrors,
        FIELD_TYPES,
        SCHEMA_VERSION
    };
} else {
    // Browser / Global
    window.FieldSchema = {
        validateField,
        validateMapping,
        createField,
        logValidationErrors,
        FIELD_TYPES,
        SCHEMA_VERSION
    };
}
