/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - TemplateValidator
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   מאמת שלמות ותקינות של שדות לפני ייצוא.
 *   חוסם ייצוא אם יש שגיאות קריטיות (v3.4).
 *
 * איך זה עובד:
 *   - בדיקת שלמות שדה (bbox, page, status)
 *   - ולידציית התייחסות לתבנית
 *   - בדיקת קואורדינטות מנורמלות
 *   - רמות: ERROR (חוסם) / WARNING (מתריע)
 *
 * מי משתמש בקובץ:
 *   - StateManager.js - בפעולות CRUD
 *   - MapperCore.js - לפני ייצוא
 *
 * באיזה מצבים:
 *   תמיד פעיל ברקע
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * TemplateValidator.js
 * Central validation layer for Mapper ↔ Template contract enforcement
 *
 * INVARIANTS ENFORCED:
 * 1. A field with bbox MUST have page
 * 2. isMapped=true ONLY if field has valid geometry
 * 3. status MUST match isMapped
 * 4. Template references MUST exist
 * 5. bbox values MUST be normalized [0,1]
 *
 * @version 3.4 - Stabilization
 */

import { eventBus, Events } from './EventBus.js';

// Validation result levels
export const ValidationLevel = {
    ERROR: 'error',      // Blocks operation
    WARNING: 'warning'   // Logged but allowed
};

// Field types enum (matches StateManager)
const VALID_FIELD_TYPES = ['text', 'checkbox', 'radio', 'circle', 'cell', 'date', 'signature', 'number', 'id_number', 'phone', 'email'];

// Status values that indicate a mapped field
const MAPPED_STATUSES = ['mapped', 'complete'];

/**
 * Central validator for field integrity
 */
class TemplateValidator {

    /**
     * Validate a single field against invariants
     * @param {Object} field - Field to validate
     * @param {Object} options - Validation options
     * @param {boolean} options.allowUnmapped - Allow unmapped fields (for template import)
     * @returns {{ valid: boolean, errors: Array, warnings: Array }}
     */
    static validateField(field, options = {}) {
        const { allowUnmapped = false } = options;
        const errors = [];
        const warnings = [];

        // Basic structure
        if (!field) {
            errors.push({ rule: 'NULL_FIELD', message: 'Field is null or undefined' });
            return { valid: false, errors, warnings };
        }

        if (!field.id || typeof field.id !== 'string') {
            errors.push({ rule: 'INVALID_ID', message: 'Field must have a valid string id' });
        }

        // Type validation
        if (field.type && !VALID_FIELD_TYPES.includes(field.type)) {
            errors.push({
                rule: 'INVALID_TYPE',
                message: `Field ${field.id} has invalid type: ${field.type}. Valid types: ${VALID_FIELD_TYPES.join(', ')}`
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // INVARIANT 1: bbox requires page (CRITICAL)
        // ═══════════════════════════════════════════════════════════════
        if (field.bbox != null && field.page == null) {
            errors.push({
                rule: 'BBOX_WITHOUT_PAGE',
                message: `Field ${field.id} has bbox but no page. This is INVALID.`,
                field: field.id
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // INVARIANT 2: isMapped consistency
        // ═══════════════════════════════════════════════════════════════
        const hasValidPosition = this._hasValidPosition(field);

        if (field.isMapped === true && !hasValidPosition) {
            errors.push({
                rule: 'ISMAPPED_NO_GEOMETRY',
                message: `Field ${field.id} has isMapped=true but no valid geometry (bbox or anchor)`,
                field: field.id
            });
        }

        if (!allowUnmapped && field.isMapped === false && hasValidPosition) {
            // Has position but not marked as mapped - this is inconsistent
            warnings.push({
                rule: 'GEOMETRY_NOT_MAPPED',
                message: `Field ${field.id} has geometry but isMapped=false`,
                field: field.id
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // INVARIANT 3: status/isMapped synchronization
        // ═══════════════════════════════════════════════════════════════
        if (field.status && field.isMapped !== undefined) {
            const statusSaysMapped = MAPPED_STATUSES.includes(field.status);

            if (statusSaysMapped && field.isMapped !== true) {
                errors.push({
                    rule: 'STATUS_ISMAPPED_CONFLICT',
                    message: `Field ${field.id} has status='${field.status}' but isMapped=${field.isMapped}`,
                    field: field.id
                });
            }

            if (field.status === 'unmapped' && field.isMapped === true) {
                errors.push({
                    rule: 'UNMAPPED_STATUS_MAPPED_FLAG',
                    message: `Field ${field.id} has status='unmapped' but isMapped=true`,
                    field: field.id
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // INVARIANT 4: Page must be positive integer (if set)
        // ═══════════════════════════════════════════════════════════════
        if (field.page != null) {
            if (!Number.isInteger(field.page) || field.page < 1) {
                errors.push({
                    rule: 'INVALID_PAGE',
                    message: `Field ${field.id} has invalid page: ${field.page}. Must be positive integer.`,
                    field: field.id
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // INVARIANT 5: bbox must be normalized [0,1]
        // ═══════════════════════════════════════════════════════════════
        if (field.bbox != null) {
            const bboxResult = this._validateBbox(field.bbox, field.id);
            if (!bboxResult.valid) {
                errors.push(...bboxResult.errors);
            }
        }

        // Anchor validation for checkbox/radio
        if (field.anchor != null) {
            const anchorResult = this._validateAnchor(field.anchor, field.id);
            if (!anchorResult.valid) {
                errors.push(...anchorResult.errors);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate field update - checks the resulting field state
     * @param {Object} existingField - Current field state
     * @param {Object} updates - Proposed updates
     * @returns {{ valid: boolean, errors: Array, warnings: Array, mergedField: Object }}
     */
    static validateUpdate(existingField, updates) {
        // Merge to get resulting field
        const mergedField = { ...existingField, ...updates };

        // Validate the merged result
        const result = this.validateField(mergedField, { allowUnmapped: false });
        result.mergedField = mergedField;

        return result;
    }

    /**
     * Validate entire mapping before export
     * @param {Object} state - Full state object { fields, radioGroups, tables }
     * @param {Object} templateStore - TemplateStore instance (optional)
     * @returns {{ valid: boolean, errors: Array, warnings: Array }}
     */
    static validateForExport(state, templateStore = null) {
        const allErrors = [];
        const allWarnings = [];

        if (!state || !Array.isArray(state.fields)) {
            allErrors.push({
                rule: 'INVALID_STATE',
                message: 'State object is invalid or missing fields array'
            });
            return { valid: false, errors: allErrors, warnings: allWarnings };
        }

        // Validate all mapped fields
        const mappedFields = state.fields.filter(f => f.isMapped);

        for (const field of mappedFields) {
            const result = this.validateField(field, { allowUnmapped: false });

            // Add field context to errors
            result.errors.forEach(e => {
                e.fieldId = field.id;
                e.fieldLabel = field.label_he || field.label_en || field.id;
            });
            result.warnings.forEach(w => {
                w.fieldId = field.id;
                w.fieldLabel = field.label_he || field.label_en || field.id;
            });

            allErrors.push(...result.errors);
            allWarnings.push(...result.warnings);
        }

        // Check for duplicate geometry within same page
        const geometryWarnings = this._checkDuplicateGeometry(mappedFields);
        allWarnings.push(...geometryWarnings);

        // Validate template references if template is loaded
        if (templateStore && templateStore.isLoaded && templateStore.isLoaded()) {
            const templateErrors = this._validateTemplateReferences(state.fields, templateStore);
            allErrors.push(...templateErrors);
        }

        // Validate radio groups
        if (Array.isArray(state.radioGroups)) {
            const radioErrors = this._validateRadioGroups(state.radioGroups, state.fields);
            allErrors.push(...radioErrors);
        }

        // Validate tables
        if (Array.isArray(state.tables)) {
            const tableErrors = this._validateTables(state.tables);
            allErrors.push(...tableErrors);
        }

        return {
            valid: allErrors.length === 0,
            errors: allErrors,
            warnings: allWarnings
        };
    }

    /**
     * Quick check if field can be exported (has all required data)
     * @param {Object} field - Field to check
     * @returns {boolean} True if field is export-ready
     */
    static isExportReady(field) {
        if (!field) return false;
        if (!field.isMapped) return false;
        if (field.page == null) return false;
        if (!this._hasValidPosition(field)) return false;
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Check if field has valid position (bbox or anchor)
     * @private
     */
    static _hasValidPosition(field) {
        // Check bbox (for text fields)
        if (Array.isArray(field.bbox) && field.bbox.length === 4) {
            const [x, y, w, h] = field.bbox;
            // Must have non-trivial size
            if (typeof w === 'number' && typeof h === 'number' && w > 0.001 && h > 0.001) {
                return true;
            }
        }

        // Check anchor (for checkbox/radio)
        if (Array.isArray(field.anchor) && field.anchor.length === 2) {
            const [x, y] = field.anchor;
            if (typeof x === 'number' && typeof y === 'number') {
                return true;
            }
        }

        return false;
    }

    /**
     * Validate bbox format and range
     * @private
     */
    static _validateBbox(bbox, fieldId) {
        const errors = [];

        if (!Array.isArray(bbox)) {
            errors.push({
                rule: 'BBOX_NOT_ARRAY',
                message: `Field ${fieldId} bbox must be array, got: ${typeof bbox}`
            });
            return { valid: false, errors };
        }

        if (bbox.length !== 4) {
            errors.push({
                rule: 'BBOX_WRONG_LENGTH',
                message: `Field ${fieldId} bbox must have 4 elements, got: ${bbox.length}`
            });
            return { valid: false, errors };
        }

        const [x, y, w, h] = bbox;

        // All must be numbers
        if (!bbox.every(n => typeof n === 'number' && isFinite(n))) {
            errors.push({
                rule: 'BBOX_NON_NUMERIC',
                message: `Field ${fieldId} bbox must contain finite numbers`
            });
            return { valid: false, errors };
        }

        // Position must be in [0,1]
        if (x < 0 || x > 1 || y < 0 || y > 1) {
            errors.push({
                rule: 'BBOX_POSITION_OUT_OF_RANGE',
                message: `Field ${fieldId} bbox position (${x}, ${y}) must be in [0,1]`
            });
        }

        // Size must be positive and reasonable
        if (w <= 0 || h <= 0) {
            errors.push({
                rule: 'BBOX_SIZE_INVALID',
                message: `Field ${fieldId} bbox size (${w}, ${h}) must be positive`
            });
        }

        // Size shouldn't exceed page bounds (with some tolerance)
        if (w > 1.1 || h > 1.1) {
            errors.push({
                rule: 'BBOX_SIZE_TOO_LARGE',
                message: `Field ${fieldId} bbox size (${w}, ${h}) exceeds page bounds`
            });
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate anchor format and range
     * @private
     */
    static _validateAnchor(anchor, fieldId) {
        const errors = [];

        if (!Array.isArray(anchor) || anchor.length !== 2) {
            errors.push({
                rule: 'ANCHOR_INVALID_FORMAT',
                message: `Field ${fieldId} anchor must be [x, y] array`
            });
            return { valid: false, errors };
        }

        const [x, y] = anchor;

        if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
            errors.push({
                rule: 'ANCHOR_NON_NUMERIC',
                message: `Field ${fieldId} anchor must contain finite numbers`
            });
            return { valid: false, errors };
        }

        if (x < 0 || x > 1 || y < 0 || y > 1) {
            errors.push({
                rule: 'ANCHOR_OUT_OF_RANGE',
                message: `Field ${fieldId} anchor (${x}, ${y}) must be in [0,1]`
            });
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Check for overlapping geometry on same page
     * @private
     */
    static _checkDuplicateGeometry(fields) {
        const warnings = [];
        const byPage = new Map();

        // Group by page
        for (const field of fields) {
            if (field.page && field.bbox) {
                if (!byPage.has(field.page)) byPage.set(field.page, []);
                byPage.get(field.page).push(field);
            }
        }

        // Check for high overlap within each page
        for (const [page, pageFields] of byPage) {
            for (let i = 0; i < pageFields.length; i++) {
                for (let j = i + 1; j < pageFields.length; j++) {
                    const f1 = pageFields[i];
                    const f2 = pageFields[j];

                    const overlap = this._bboxOverlap(f1.bbox, f2.bbox);

                    if (overlap > 0.9) {
                        warnings.push({
                            rule: 'HIGH_OVERLAP',
                            message: `Fields "${f1.label_he || f1.id}" and "${f2.label_he || f2.id}" on page ${page} have ${Math.round(overlap * 100)}% overlap`,
                            fieldIds: [f1.id, f2.id],
                            page: page
                        });
                    }
                }
            }
        }

        return warnings;
    }

    /**
     * Calculate bbox overlap ratio
     * @private
     */
    static _bboxOverlap(bbox1, bbox2) {
        const [x1, y1, w1, h1] = bbox1;
        const [x2, y2, w2, h2] = bbox2;

        const xOverlap = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
        const yOverlap = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
        const overlapArea = xOverlap * yOverlap;

        const area1 = w1 * h1;
        const area2 = w2 * h2;
        const minArea = Math.min(area1, area2);

        return minArea > 0 ? overlapArea / minArea : 0;
    }

    /**
     * Validate template field references
     * @private
     */
    static _validateTemplateReferences(fields, templateStore) {
        const errors = [];

        for (const field of fields) {
            if (field.templateFieldId) {
                const templateField = templateStore.getField(field.templateFieldId);
                if (!templateField) {
                    errors.push({
                        rule: 'ORPHAN_TEMPLATE_REF',
                        message: `Field ${field.id} references non-existent template field: ${field.templateFieldId}`,
                        fieldId: field.id,
                        templateFieldId: field.templateFieldId
                    });
                }
            }
        }

        return errors;
    }

    /**
     * Validate radio groups
     * Only validates groups that have options with positions
     * @private
     */
    static _validateRadioGroups(radioGroups, fields) {
        const errors = [];

        for (const group of radioGroups) {
            if (!group.groupId) {
                errors.push({
                    rule: 'RADIO_GROUP_NO_ID',
                    message: 'Radio group missing groupId'
                });
                continue;
            }

            // Check if group has any mapped options (with anchor or bbox)
            const hasMappedOptions = Array.isArray(group.options) &&
                group.options.some(opt => opt.anchor || opt.bbox);

            if (!hasMappedOptions) {
                // Skip unmapped groups - they don't need validation
                continue;
            }

            if (!group.page) {
                errors.push({
                    rule: 'RADIO_GROUP_NO_PAGE',
                    message: `Radio group ${group.groupId} missing page`
                });
            }

            if (!Array.isArray(group.options) || group.options.length === 0) {
                errors.push({
                    rule: 'RADIO_GROUP_NO_OPTIONS',
                    message: `Radio group ${group.groupId} has no options`
                });
            }
        }

        return errors;
    }

    /**
     * Validate tables
     * Only validates MAPPED tables (those with bbox or tableBBox)
     * @private
     */
    static _validateTables(tables) {
        const errors = [];

        for (const table of tables) {
            if (!table.tableId) {
                errors.push({
                    rule: 'TABLE_NO_ID',
                    message: 'Table missing tableId'
                });
                continue;
            }

            // Only validate tables that are mapped (have some bbox)
            const isMapped = !!(table.bbox || table.tableBBox || table.headerBBox);
            if (!isMapped) {
                // Skip unmapped tables - they don't need validation
                continue;
            }

            if (!table.page) {
                errors.push({
                    rule: 'TABLE_NO_PAGE',
                    message: `Table ${table.tableId} missing page`
                });
            }

            // Table must have at least one bbox type
            if (!table.bbox && !table.tableBBox) {
                errors.push({
                    rule: 'TABLE_NO_BBOX',
                    message: `Table ${table.tableId} missing bbox`
                });
            }
        }

        return errors;
    }

    /**
     * Emit validation error event
     * @param {Object} field - The field that failed validation
     * @param {Array} errors - Validation errors
     * @param {string} action - The action that was attempted
     */
    static emitValidationError(field, errors, action) {
        eventBus.emit(Events.VALIDATION_ERROR, {
            fieldId: field?.id,
            fieldLabel: field?.label_he || field?.label_en,
            errors,
            action,
            timestamp: Date.now()
        });

        // Also log to console
        console.error(`[TemplateValidator] ${action} blocked for field ${field?.id}:`, errors);
    }
}

export { TemplateValidator };
