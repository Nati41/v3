/**
 * Text Selection Logic - Pure Logic for Text Selection Mode
 *
 * Phase 5 Architecture: Logic Layer
 *
 * This module contains ONLY logic for text selection.
 * It does NOT touch DOM, UI classes, or overlays.
 * All communication is through StateMachine + EventBus.
 *
 * @version 1.0.0
 * @author Claude Code - Phase 5
 */

(function() {
    'use strict';

    const TextSelectionLogic = {
        // Current selection state
        _targetField: null,
        _selectionStart: null,

        // ============ FLOW CONTROL ============

        /**
         * Check if text selection can start
         * @param {StateMachine} sm - StateMachine instance
         * @returns {{ safe: boolean, reason: string }}
         */
        canStartTextSelection(sm) {
            if (!sm) {
                return { safe: false, reason: 'StateMachine not available' };
            }

            if (sm.isInFlow()) {
                return { safe: false, reason: 'Mapping flow in progress' };
            }

            if (sm.isInTableFlow()) {
                return { safe: false, reason: 'Table mapping in progress' };
            }

            if (sm.is(window.MapperState.TEXT_SELECTION)) {
                return { safe: false, reason: 'Already in text selection mode' };
            }

            return { safe: true, reason: null };
        },

        /**
         * Activate text selection mode for a field
         * @param {Object} field - Field to name
         * @returns {{ success: boolean, error?: string }}
         */
        activateTextSelection(field) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            const canStart = this.canStartTextSelection(sm);
            if (!canStart.safe) {
                console.warn('[TextSelection] Cannot start:', canStart.reason);
                return { success: false, error: canStart.reason };
            }

            if (!field || !field.id) {
                return { success: false, error: 'Invalid field' };
            }

            // Store target field
            this._targetField = field;
            this._selectionStart = null;

            // Enter text selection mode
            sm.reset(true);
            sm.setState(MS.TEXT_SELECTION);
            sm.setTargetField(field);

            EventBus.emit(window.EventTypes.FLOW_START, {
                type: 'text_selection',
                targetFieldId: field.id
            });

            console.log('[TextSelection] Activated for field:', field.id);
            return { success: true };
        },

        /**
         * Start selection at point
         * @param {number} x - X coordinate
         * @param {number} y - Y coordinate
         * @returns {{ success: boolean }}
         */
        startSelection(x, y) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm.is(MS.TEXT_SELECTION)) {
                return { success: false, error: 'Not in TEXT_SELECTION state' };
            }

            this._selectionStart = { x, y };

            console.log('[TextSelection] Selection started at:', x, y);
            return { success: true };
        },

        /**
         * Finish selection and apply text to field
         * @param {Object} bbox - Selection bounding box
         * @param {string} extractedText - Text extracted from the selection
         * @returns {{ success: boolean, error?: string }}
         */
        finishSelection(bbox, extractedText) {
            const sm = window.mapper?.stateMachine;
            const EventBus = window.EventBus;

            if (!this._targetField) {
                return { success: false, error: 'No target field' };
            }

            if (!extractedText || !extractedText.trim()) {
                return { success: false, error: 'No text selected' };
            }

            // Normalize text
            const normalizedText = this._normalizeText(extractedText);

            // Emit text selected event
            EventBus.emit(window.EventTypes.TEXT_SELECTED, {
                text: normalizedText,
                targetFieldId: this._targetField.id,
                bbox
            });

            // Emit field update event
            EventBus.emit(window.EventTypes.FIELD_UPDATED, {
                fieldId: this._targetField.id,
                updates: {
                    label_he: normalizedText,
                    label_en: this._generateFieldKey(normalizedText),
                    isUnnamed: false,
                    autoLabel: true,
                    autoLabelSource: 'text_selection'
                }
            });

            console.log(`[TextSelection] Text applied: "${normalizedText}"`);

            // Deactivate
            this.deactivateTextSelection();

            return { success: true, text: normalizedText };
        },

        /**
         * Deactivate text selection mode
         * @returns {{ success: boolean }}
         */
        deactivateTextSelection() {
            const sm = window.mapper?.stateMachine;
            const EventBus = window.EventBus;

            sm.reset(true);

            EventBus.emit(window.EventTypes.FLOW_COMPLETE, {
                type: 'text_selection'
            });

            // Clean up
            this._targetField = null;
            this._selectionStart = null;

            console.log('[TextSelection] Deactivated');
            return { success: true };
        },

        /**
         * Cancel text selection
         * @returns {{ success: boolean }}
         */
        cancelTextSelection() {
            const sm = window.mapper?.stateMachine;
            const EventBus = window.EventBus;

            sm.reset(true);

            EventBus.emit(window.EventTypes.FLOW_CANCEL, {
                type: 'text_selection'
            });

            // Clean up
            this._targetField = null;
            this._selectionStart = null;

            console.log('[TextSelection] Cancelled');
            return { success: true };
        },

        // ============ GETTERS ============

        /**
         * Get current status
         * @returns {Object}
         */
        getStatus() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            return {
                active: sm?.is(MS.TEXT_SELECTION) || false,
                targetField: this._targetField ? { ...this._targetField } : null,
                selectionStart: this._selectionStart ? { ...this._selectionStart } : null
            };
        },

        /**
         * Get target field
         * @returns {Object|null}
         */
        getTargetField() {
            return this._targetField ? { ...this._targetField } : null;
        },

        /**
         * Get selection start point
         * @returns {Object|null}
         */
        getSelectionStart() {
            return this._selectionStart ? { ...this._selectionStart } : null;
        },

        // ============ HELPERS ============

        /**
         * Normalize text
         * @private
         */
        _normalizeText(text) {
            if (!text) return '';

            // Trim whitespace
            text = text.trim();

            // Remove multiple spaces
            text = text.replace(/\s+/g, ' ');

            // Remove leading/trailing punctuation
            text = text.replace(/^[\s:.\-_*]+|[\s:.\-_*]+$/g, '');

            return text;
        },

        /**
         * Generate field key from text
         * @private
         */
        _generateFieldKey(text) {
            if (!text) return `field_${Date.now()}`;

            // Transliterate Hebrew
            const hebrewToEnglish = {
                'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v',
                'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k',
                'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's',
                'ע': 'a', 'פ': 'p', 'ף': 'p', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k',
                'ר': 'r', 'ש': 'sh', 'ת': 't'
            };

            let key = '';
            for (const char of text) {
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
        }
    };

    // ============ EXPORTS ============
    window.TextSelectionLogic = TextSelectionLogic;

    console.log('📝 TextSelectionLogic loaded');

})();
