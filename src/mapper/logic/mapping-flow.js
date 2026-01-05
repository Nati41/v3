/**
 * Mapping Flow Logic - Pure Logic for the Unified Mapping Flow
 *
 * Phase 5 Architecture: Logic Layer
 *
 * This module contains ONLY logic for the mapping flow.
 * It does NOT touch DOM, UI classes, or overlays.
 * All communication is through StateMachine + EventBus.
 *
 * Flow: IDLE → FLOW_CAPTURE_NAME → FLOW_CAPTURE_FIELD → loop
 *
 * @version 1.0.0
 * @author Claude Code - Phase 5
 */

(function() {
    'use strict';

    const MappingFlowLogic = {
        // ============ FLOW STATE ============

        /**
         * Check if it's safe to start a new flow
         * @param {StateMachine} sm - StateMachine instance
         * @returns {{ safe: boolean, reason: string }}
         */
        canStartFlow(sm) {
            if (!sm) {
                return { safe: false, reason: 'StateMachine not available' };
            }

            // Cannot start if in creation mode
            if (sm.isInCreationMode()) {
                return { safe: false, reason: 'Already in creation mode' };
            }

            // Cannot start if in table flow
            if (sm.isInTableFlow()) {
                return { safe: false, reason: 'Table mapping in progress' };
            }

            // Cannot start if interacting
            if (sm.isInteracting()) {
                return { safe: false, reason: 'Interaction in progress' };
            }

            // Cannot start if already in flow
            if (sm.isInFlow()) {
                return { safe: false, reason: 'Already in mapping flow' };
            }

            return { safe: true, reason: null };
        },

        /**
         * Start a new mapping flow
         * @param {string} type - Flow type: 'text', 'checkbox', 'radio', 'table'
         * @returns {{ success: boolean, error?: string }}
         */
        startFlow(type) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            // Validate
            const canStart = this.canStartFlow(sm);
            if (!canStart.safe) {
                console.warn('[MappingFlow] Cannot start:', canStart.reason);
                return { success: false, error: canStart.reason };
            }

            // Validate type
            const validTypes = ['text', 'checkbox', 'radio', 'table'];
            if (!validTypes.includes(type)) {
                return { success: false, error: `Invalid flow type: ${type}` };
            }

            // Reset and start flow
            sm.reset(true);

            const success = sm.setState(MS.FLOW_CAPTURE_NAME, {
                data: { type }
            });

            if (!success) {
                return { success: false, error: 'State transition failed' };
            }

            // Emit flow start event
            EventBus.emit(window.EventTypes.FLOW_START, {
                type,
                step: 'capture_name'
            });

            console.log(`[MappingFlow] Started flow: ${type}`);
            return { success: true };
        },

        /**
         * Continue flow after name capture
         * @param {Object} nameData - { text: string, key: string, source: string }
         * @returns {{ success: boolean, error?: string }}
         */
        continueFlow(nameData) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            // Validate current state
            if (!sm.is(MS.FLOW_CAPTURE_NAME)) {
                return { success: false, error: 'Not in FLOW_CAPTURE_NAME state' };
            }

            // Validate name data
            if (!nameData || !nameData.text) {
                return { success: false, error: 'No text captured' };
            }

            // Normalize the name
            const normalizedName = this._normalizeNameData(nameData);

            // Store pending name
            sm.setPendingName(normalizedName);

            // Transition to field capture
            const success = sm.setState(MS.FLOW_CAPTURE_FIELD);

            if (!success) {
                return { success: false, error: 'State transition failed' };
            }

            // Emit step change event
            EventBus.emit(window.EventTypes.FLOW_STEP_CHANGE, {
                from: 'capture_name',
                to: 'capture_field',
                pendingName: normalizedName
            });

            console.log(`[MappingFlow] Name captured: "${normalizedName.text}"`);
            return { success: true, pendingName: normalizedName };
        },

        /**
         * Complete flow after field creation
         * @param {Object} field - Created field object
         * @returns {{ success: boolean, error?: string, shouldLoop: boolean }}
         */
        completeFlow(field) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            // Validate current state
            if (!sm.is(MS.FLOW_CAPTURE_FIELD)) {
                return { success: false, error: 'Not in FLOW_CAPTURE_FIELD state', shouldLoop: false };
            }

            // Get flow type for the event
            const flowType = sm.getFlowType();
            const pendingName = sm.getPendingName();

            // Clear pending name
            sm.clearPendingName();

            // Loop back to name capture
            const success = sm.setState(MS.FLOW_CAPTURE_NAME);

            if (!success) {
                return { success: false, error: 'State transition failed', shouldLoop: false };
            }

            // Emit events
            EventBus.emit(window.EventTypes.FIELD_CREATED, {
                field,
                flowType,
                pendingName,
                inFlow: true
            });

            EventBus.emit(window.EventTypes.FLOW_STEP_CHANGE, {
                from: 'capture_field',
                to: 'capture_name',
                completed: true,
                field
            });

            console.log(`[MappingFlow] Field created: "${pendingName?.text || 'unnamed'}"`);
            return { success: true, shouldLoop: true };
        },

        /**
         * Exit the mapping flow
         * @returns {{ success: boolean }}
         */
        exitFlow() {
            const sm = window.mapper?.stateMachine;
            const EventBus = window.EventBus;

            if (!sm.isInFlow()) {
                return { success: false, error: 'Not in flow' };
            }

            const flowType = sm.getFlowType();

            // Reset state machine
            sm.reset(true);

            // Emit cancel event
            EventBus.emit(window.EventTypes.FLOW_CANCEL, {
                type: flowType
            });

            console.log('[MappingFlow] Flow exited');
            return { success: true };
        },

        // ============ VALIDATION ============

        /**
         * Validate the current flow state
         * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
         */
        validateFlow() {
            const sm = window.mapper?.stateMachine;
            const errors = [];
            const warnings = [];

            if (!sm) {
                errors.push('StateMachine not available');
                return { valid: false, errors, warnings };
            }

            if (!sm.isInFlow()) {
                return { valid: true, errors, warnings };
            }

            // Check flow type
            if (!sm.getFlowType()) {
                errors.push('In flow but no flow type set');
            }

            // Check pending name in FLOW_CAPTURE_FIELD
            const MS = window.MapperState;
            if (sm.is(MS.FLOW_CAPTURE_FIELD) && !sm.getPendingName()) {
                warnings.push('In FLOW_CAPTURE_FIELD but no pending name');
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };
        },

        // ============ HELPERS ============

        /**
         * Get current flow status
         * @returns {Object}
         */
        getFlowStatus() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm) {
                return { inFlow: false, error: 'StateMachine not available' };
            }

            return {
                inFlow: sm.isInFlow(),
                type: sm.getFlowType(),
                step: sm.is(MS.FLOW_CAPTURE_NAME) ? 'capture_name' :
                      sm.is(MS.FLOW_CAPTURE_FIELD) ? 'capture_field' : null,
                pendingName: sm.getPendingName(),
                currentState: sm.getState()
            };
        },

        /**
         * Normalize name data from various sources
         * @private
         */
        _normalizeNameData(nameData) {
            let text = nameData.text || '';
            let key = nameData.key || '';
            let source = nameData.source || 'manual';

            // Normalize Hebrew text
            text = this._normalizeHebrewLabel(text);

            // Generate key if not provided
            if (!key) {
                key = this._generateFieldKey(text);
            }

            return { text, key, source };
        },

        /**
         * Normalize Hebrew label text
         * @private
         */
        _normalizeHebrewLabel(text) {
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

            // Transliterate Hebrew to English (simplified)
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

            // Clean up
            key = key.replace(/_+/g, '_').replace(/^_|_$/g, '');

            // Ensure unique
            if (!key) {
                key = `field_${Date.now()}`;
            }

            return key;
        }
    };

    // ============ EXPORTS ============
    window.MappingFlowLogic = MappingFlowLogic;

    console.log('📐 MappingFlowLogic loaded');

})();
