/**
 * Field Creation Logic - Pure Logic for Field Creation
 *
 * Phase 5 Architecture: Logic Layer
 *
 * This module contains ONLY logic for field creation.
 * It does NOT touch DOM, UI classes, or overlays.
 * All communication is through StateMachine + EventBus.
 *
 * @version 1.0.0
 * @author Claude Code - Phase 5
 */

(function() {
    'use strict';

    const FieldCreationLogic = {
        // Field counter for unique IDs
        _fieldCounter: 0,

        // ============ CREATION MODES ============

        /**
         * Toggle field creation mode
         * @returns {{ success: boolean, active: boolean }}
         */
        toggleFieldCreationMode() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm) {
                return { success: false, error: 'StateMachine not available' };
            }

            if (sm.is(MS.FIELD_CREATION)) {
                // Exit mode
                sm.reset(true);
                EventBus.emit(window.EventTypes.FLOW_CANCEL, { type: 'field_creation' });
                return { success: true, active: false };
            } else {
                // Enter mode
                if (!sm.can('FIELD_CREATION')) {
                    return { success: false, error: 'Cannot enter field creation mode' };
                }
                sm.reset(true);
                sm.setState(MS.FIELD_CREATION);
                EventBus.emit(window.EventTypes.FLOW_START, { type: 'field_creation' });
                return { success: true, active: true };
            }
        },

        /**
         * Toggle checkbox creation mode
         * @returns {{ success: boolean, active: boolean }}
         */
        toggleCheckboxCreationMode() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm) {
                return { success: false, error: 'StateMachine not available' };
            }

            if (sm.is(MS.CHECKBOX_CREATION)) {
                sm.reset(true);
                EventBus.emit(window.EventTypes.FLOW_CANCEL, { type: 'checkbox_creation' });
                return { success: true, active: false };
            } else {
                if (!sm.can('CHECKBOX_CREATION')) {
                    return { success: false, error: 'Cannot enter checkbox creation mode' };
                }
                sm.reset(true);
                sm.setState(MS.CHECKBOX_CREATION);
                EventBus.emit(window.EventTypes.FLOW_START, { type: 'checkbox_creation' });
                return { success: true, active: true };
            }
        },

        /**
         * Toggle radio creation mode
         * @returns {{ success: boolean, active: boolean }}
         */
        toggleRadioCreationMode() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm) {
                return { success: false, error: 'StateMachine not available' };
            }

            if (sm.is(MS.RADIO_CREATION)) {
                sm.reset(true);
                EventBus.emit(window.EventTypes.FLOW_CANCEL, { type: 'radio_creation' });
                return { success: true, active: false };
            } else {
                if (!sm.can('RADIO_CREATION')) {
                    return { success: false, error: 'Cannot enter radio creation mode' };
                }
                sm.reset(true);
                sm.setState(MS.RADIO_CREATION);
                EventBus.emit(window.EventTypes.FLOW_START, { type: 'radio_creation' });
                return { success: true, active: true };
            }
        },

        // ============ FIELD CREATION ============

        /**
         * Create a field from bounding box
         * @param {Object} bbox - { x, y, width, height }
         * @param {Object} options - Field options
         * @returns {{ success: boolean, field?: Object, error?: string }}
         */
        createFieldFromBbox(bbox, options = {}) {
            const EventBus = window.EventBus;

            // Validate bbox
            if (!this._validateBbox(bbox)) {
                return { success: false, error: 'Invalid bounding box' };
            }

            // Normalize bbox
            const normalizedBbox = this._normalizeBbox(bbox);

            // Create field object
            const field = this._createFieldObject(normalizedBbox, options);

            // Emit event
            EventBus.emit(window.EventTypes.FIELD_CREATED, {
                field,
                bbox: normalizedBbox,
                source: options.source || 'manual'
            });

            console.log(`[FieldCreation] Field created: ${field.type} - ${field.label_he}`);
            return { success: true, field };
        },

        /**
         * Create a one-click field (checkbox/radio)
         * @param {number} x - X position
         * @param {number} y - Y position
         * @param {string} type - 'checkbox' or 'radio'
         * @returns {{ success: boolean, field?: Object }}
         */
        createOneClickField(x, y, type) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            // Validate type
            if (!['checkbox', 'radio'].includes(type)) {
                return { success: false, error: 'Invalid field type' };
            }

            // Validate state
            const expectedState = type === 'checkbox' ? MS.CHECKBOX_CREATION : MS.RADIO_CREATION;
            if (!sm.is(expectedState)) {
                return { success: false, error: `Not in ${type} creation mode` };
            }

            // Create field with fixed size
            const size = 20;
            const bbox = {
                x: x - size / 2,
                y: y - size / 2,
                width: size,
                height: size
            };

            return this.createFieldFromBbox(bbox, { type, source: 'one_click' });
        },

        /**
         * Update field properties
         * @param {string} fieldId - Field ID
         * @param {Object} updates - Properties to update
         * @returns {{ success: boolean }}
         */
        updateField(fieldId, updates) {
            const EventBus = window.EventBus;

            // Emit update event (actual update happens in mapper)
            EventBus.emit(window.EventTypes.FIELD_UPDATED, {
                fieldId,
                updates
            });

            return { success: true };
        },

        /**
         * Delete a field
         * @param {string} fieldId - Field ID
         * @returns {{ success: boolean }}
         */
        deleteField(fieldId) {
            const EventBus = window.EventBus;

            EventBus.emit(window.EventTypes.FIELD_DELETED, {
                fieldId
            });

            return { success: true };
        },

        // ============ FIELD VALIDATION ============

        /**
         * Validate field data
         * @param {Object} field - Field object
         * @returns {{ valid: boolean, errors: string[] }}
         */
        validateField(field) {
            const errors = [];

            if (!field) {
                errors.push('Field is null');
                return { valid: false, errors };
            }

            if (!field.id) errors.push('Missing field ID');
            if (!field.type) errors.push('Missing field type');
            if (typeof field.x !== 'number') errors.push('Invalid x coordinate');
            if (typeof field.y !== 'number') errors.push('Invalid y coordinate');
            if (typeof field.width !== 'number' || field.width <= 0) errors.push('Invalid width');
            if (typeof field.height !== 'number' || field.height <= 0) errors.push('Invalid height');

            return {
                valid: errors.length === 0,
                errors
            };
        },

        // ============ HELPERS ============

        /**
         * Validate bounding box
         * @private
         */
        _validateBbox(bbox) {
            if (!bbox) return false;
            if (typeof bbox.x !== 'number' || typeof bbox.y !== 'number') return false;
            if (typeof bbox.width !== 'number' || typeof bbox.height !== 'number') return false;
            return true;
        },

        /**
         * Normalize bounding box (ensure minimum size)
         * @private
         */
        _normalizeBbox(bbox) {
            const MIN_SIZE = 24;
            let { x, y, width, height } = bbox;

            // Ensure minimum size
            if (width < MIN_SIZE) {
                x = x + width / 2 - MIN_SIZE / 2;
                width = MIN_SIZE;
            }
            if (height < MIN_SIZE) {
                y = y + height / 2 - MIN_SIZE / 2;
                height = MIN_SIZE;
            }

            // Round values
            return {
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(width),
                height: Math.round(height)
            };
        },

        /**
         * Create field object
         * @private
         */
        _createFieldObject(bbox, options = {}) {
            this._fieldCounter++;
            const timestamp = Date.now();

            const type = options.type || 'text';
            const labelHe = options.labelHe || options.label_he || this._generateDefaultLabel(type);
            const labelEn = options.labelEn || options.label_en || this._generateFieldKey(labelHe);

            return {
                id: options.id || `field_${timestamp}_${this._fieldCounter}`,
                type,
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height,
                page: options.page || 1,
                label_he: labelHe,
                label_en: labelEn,
                isUnnamed: !options.labelHe && !options.label_he,
                autoLabel: options.autoLabel || false,
                autoLabelSource: options.autoLabelSource || null,
                createdAt: timestamp,
                modifiedAt: timestamp
            };
        },

        /**
         * Generate default label
         * @private
         */
        _generateDefaultLabel(type) {
            const typeLabels = {
                text: 'שדה טקסט',
                checkbox: 'צ\'קבוקס',
                radio: 'כפתור בחירה'
            };
            return `${typeLabels[type] || 'שדה'} ${this._fieldCounter}`;
        },

        /**
         * Generate field key from label
         * @private
         */
        _generateFieldKey(label) {
            if (!label) return `field_${Date.now()}`;

            // Transliterate Hebrew
            const hebrewToEnglish = {
                'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v',
                'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k',
                'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's',
                'ע': 'a', 'פ': 'p', 'ף': 'p', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k',
                'ר': 'r', 'ש': 'sh', 'ת': 't'
            };

            let key = '';
            for (const char of label) {
                if (hebrewToEnglish[char]) {
                    key += hebrewToEnglish[char];
                } else if (/[a-zA-Z0-9]/.test(char)) {
                    key += char.toLowerCase();
                } else if (char === ' ' && key && !key.endsWith('_')) {
                    key += '_';
                }
            }

            key = key.replace(/_+/g, '_').replace(/^_|_$/g, '');
            return key || `field_${Date.now()}`;
        },

        /**
         * Get current creation mode status
         * @returns {Object}
         */
        getStatus() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            return {
                inCreationMode: sm?.isInCreationMode() || false,
                currentMode: sm?.is(MS.FIELD_CREATION) ? 'field' :
                            sm?.is(MS.CHECKBOX_CREATION) ? 'checkbox' :
                            sm?.is(MS.RADIO_CREATION) ? 'radio' : null,
                fieldCounter: this._fieldCounter
            };
        }
    };

    // ============ EXPORTS ============
    window.FieldCreationLogic = FieldCreationLogic;

    console.log('📝 FieldCreationLogic loaded');

})();
