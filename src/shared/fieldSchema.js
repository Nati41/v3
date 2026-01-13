/**
 * fieldSchema.js
 *
 * Schema validation for Field Mapper V2 and V3 formats
 * V2: pdfX, pdfY, pdfWidth, pdfHeight (absolute PDF coordinates)
 * V3: bbox [x, y, w, h] normalized (0-1 range)
 *
 * V3.4: Added V3 format support and strict invariant validation
 */

const FIELD_TYPES = ['text', 'checkbox', 'radio', 'date', 'signature', 'number', 'id_number', 'phone', 'email'];

const SCHEMA_VERSION = '3.4.0';
const LEGACY_SCHEMA_VERSION = '2.0.0';

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

// ═══════════════════════════════════════════════════════════════
// V3.4: NEW V3 FORMAT VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validate V3 bbox format [x, y, w, h] - normalized 0-1 range
 * @param {Array} bbox - Bounding box array
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBbox(bbox) {
    const errors = [];

    if (!Array.isArray(bbox)) {
        errors.push('bbox must be an array');
        return { valid: false, errors };
    }

    if (bbox.length !== 4) {
        errors.push(`bbox must have 4 elements, got ${bbox.length}`);
        return { valid: false, errors };
    }

    const [x, y, w, h] = bbox;

    // All must be numbers
    if (!bbox.every(n => typeof n === 'number' && isFinite(n))) {
        errors.push('bbox values must be finite numbers');
        return { valid: false, errors };
    }

    // Position must be in [0,1]
    if (x < 0 || x > 1) {
        errors.push(`bbox x (${x}) must be in range [0,1]`);
    }
    if (y < 0 || y > 1) {
        errors.push(`bbox y (${y}) must be in range [0,1]`);
    }

    // Size must be positive
    if (w <= 0) {
        errors.push(`bbox width (${w}) must be positive`);
    }
    if (h <= 0) {
        errors.push(`bbox height (${h}) must be positive`);
    }

    // Size shouldn't exceed page bounds (with tolerance)
    if (w > 1.1) {
        errors.push(`bbox width (${w}) exceeds page bounds`);
    }
    if (h > 1.1) {
        errors.push(`bbox height (${h}) exceeds page bounds`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate V3 anchor format [x, y] - normalized 0-1 range
 * @param {Array} anchor - Anchor point array
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateAnchor(anchor) {
    const errors = [];

    if (!Array.isArray(anchor) || anchor.length !== 2) {
        errors.push('anchor must be [x, y] array');
        return { valid: false, errors };
    }

    const [x, y] = anchor;

    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
        errors.push('anchor values must be finite numbers');
        return { valid: false, errors };
    }

    if (x < 0 || x > 1) {
        errors.push(`anchor x (${x}) must be in range [0,1]`);
    }
    if (y < 0 || y > 1) {
        errors.push(`anchor y (${y}) must be in range [0,1]`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validates a field object against V3 schema (bbox format)
 * @param {Object} field - Field object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateFieldV3(field) {
    const errors = [];

    // Required: id
    if (!field.id || typeof field.id !== 'string') {
        errors.push('Field must have a valid "id" (string)');
    }

    // Type validation
    if (field.type && !FIELD_TYPES.includes(field.type)) {
        errors.push(`Field type must be one of: ${FIELD_TYPES.join(', ')}`);
    }

    // INVARIANT 1: If field is mapped, it must have page
    if (field.isMapped === true) {
        if (typeof field.page !== 'number' || field.page < 1 || !Number.isInteger(field.page)) {
            errors.push('Mapped field must have valid "page" (positive integer)');
        }
    }

    // INVARIANT 2: If field has bbox, it must have page
    if (field.bbox != null && field.page == null) {
        errors.push('Field with bbox must have page');
    }

    // INVARIANT 3: isMapped must match geometry
    const hasBbox = Array.isArray(field.bbox) && field.bbox.length === 4;
    const hasAnchor = Array.isArray(field.anchor) && field.anchor.length === 2;
    const hasGeometry = hasBbox || hasAnchor;

    if (field.isMapped === true && !hasGeometry) {
        errors.push('Field with isMapped=true must have bbox or anchor');
    }

    // INVARIANT 4: status must match isMapped
    if (field.status === 'mapped' && field.isMapped !== true) {
        errors.push('Field with status="mapped" must have isMapped=true');
    }
    if (field.status === 'unmapped' && field.isMapped === true) {
        errors.push('Field with isMapped=true cannot have status="unmapped"');
    }

    // Validate bbox format if present
    if (field.bbox != null) {
        const bboxResult = validateBbox(field.bbox);
        if (!bboxResult.valid) {
            errors.push(...bboxResult.errors.map(e => `bbox: ${e}`));
        }
    }

    // Validate anchor format if present
    if (field.anchor != null) {
        const anchorResult = validateAnchor(field.anchor);
        if (!anchorResult.valid) {
            errors.push(...anchorResult.errors.map(e => `anchor: ${e}`));
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validates a mapping object (V3 format)
 * @param {Object} mapping - Mapping object with fields array
 * @returns {{ valid: boolean, errors: Object[] }}
 */
function validateMappingV3(mapping) {
    const fieldErrors = [];

    if (!Array.isArray(mapping.fields)) {
        fieldErrors.push({
            field: '__mapping__',
            errors: ['Mapping must have a "fields" array']
        });
        return { valid: false, errors: fieldErrors };
    }

    // Validate each field
    mapping.fields.forEach((field, index) => {
        // Only validate mapped fields
        if (field.isMapped) {
            const result = validateFieldV3(field);
            if (!result.valid) {
                fieldErrors.push({
                    field: field.id || `field_${index}`,
                    errors: result.errors
                });
            }
        }
    });

    return {
        valid: fieldErrors.length === 0,
        errors: fieldErrors
    };
}

/**
 * Check if field is export-ready (has all required data)
 * @param {Object} field - Field to check
 * @returns {boolean}
 */
function isFieldExportReady(field) {
    if (!field) return false;
    if (!field.isMapped) return false;
    if (field.page == null) return false;
    if (!field.bbox && !field.anchor) return false;
    return true;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    // Node.js / CommonJS
    module.exports = {
        // V2 (legacy)
        validateField,
        validateMapping,
        createField,
        logValidationErrors,
        // V3.4 (new)
        validateBbox,
        validateAnchor,
        validateFieldV3,
        validateMappingV3,
        isFieldExportReady,
        // Constants
        FIELD_TYPES,
        SCHEMA_VERSION,
        LEGACY_SCHEMA_VERSION
    };
} else {
    // Browser / Global
    window.FieldSchema = {
        // V2 (legacy)
        validateField,
        validateMapping,
        createField,
        logValidationErrors,
        // V3.4 (new)
        validateBbox,
        validateAnchor,
        validateFieldV3,
        validateMappingV3,
        isFieldExportReady,
        // Constants
        FIELD_TYPES,
        SCHEMA_VERSION,
        LEGACY_SCHEMA_VERSION
    };
}
