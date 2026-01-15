/**
 * Grouping Logic - Pure Logic for Option Grouping Flow
 *
 * Phase 5 Architecture: Logic Layer
 *
 * This module contains ONLY logic for option grouping.
 * It does NOT touch DOM, UI classes, or overlays.
 * All communication is through StateMachine + EventBus.
 *
 * Flow: GROUPING_SELECT → GROUP_NAMING → OPTION_LABELING → IDLE
 *
 * @version 1.0.0
 * @author Claude Code - Phase 5
 */

(function() {
    'use strict';

    const GroupingLogic = {
        // Current grouping state
        _selectedFieldIds: [],
        _currentGroup: null,
        _currentOptionIndex: 0,

        // ============ FLOW CONTROL ============

        /**
         * Check if grouping can start
         * @param {StateMachine} sm - StateMachine instance
         * @returns {{ safe: boolean, reason: string }}
         */
        canStartGrouping(sm) {
            if (!sm) {
                return { safe: false, reason: 'StateMachine not available' };
            }

            if (sm.isInFlow()) {
                return { safe: false, reason: 'Mapping flow in progress' };
            }

            if (sm.isInTableFlow()) {
                return { safe: false, reason: 'Table mapping in progress' };
            }

            if (sm.inCluster('GROUPING')) {
                return { safe: false, reason: 'Already in grouping mode' };
            }

            return { safe: true, reason: null };
        },

        /**
         * Start grouping selection mode
         * @returns {{ success: boolean, error?: string }}
         */
        startGroupingSelection() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            const canStart = this.canStartGrouping(sm);
            if (!canStart.safe) {
                console.warn('[GroupingLogic] Cannot start:', canStart.reason);
                return { success: false, error: canStart.reason };
            }

            // Reset state
            this._selectedFieldIds = [];
            this._currentGroup = null;
            this._currentOptionIndex = 0;

            // Enter grouping mode
            sm.reset(true);
            const success = sm.setState(MS.GROUPING_SELECT);

            if (!success) {
                return { success: false, error: 'State transition failed' };
            }

            EventBus.emit(window.EventTypes.GROUP_SELECTION_START, {});

            console.log('[GroupingLogic] Grouping selection started');
            return { success: true };
        },

        /**
         * Toggle field selection
         * @param {string} fieldId - Field ID to toggle
         * @param {Object} fieldData - Field data (type, position, etc.)
         * @returns {{ success: boolean, selected: boolean, error?: string }}
         */
        toggleFieldSelection(fieldId, fieldData = {}) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm.is(MS.GROUPING_SELECT)) {
                return { success: false, error: 'Not in GROUPING_SELECT state' };
            }

            // Validate field type
            const validTypes = ['checkbox', 'radio'];
            if (fieldData.type && !validTypes.includes(fieldData.type)) {
                return { success: false, error: 'Only checkbox and radio fields can be grouped' };
            }

            // Toggle selection
            const index = this._selectedFieldIds.indexOf(fieldId);
            let selected;

            if (index === -1) {
                this._selectedFieldIds.push(fieldId);
                selected = true;
            } else {
                this._selectedFieldIds.splice(index, 1);
                selected = false;
            }

            EventBus.emit(window.EventTypes.GROUP_FIELD_TOGGLED, {
                fieldId,
                selected,
                selectedCount: this._selectedFieldIds.length
            });

            console.log(`[GroupingLogic] Field ${fieldId} ${selected ? 'selected' : 'deselected'}`);
            return { success: true, selected };
        },

        /**
         * Confirm grouping selection and start naming
         * @param {Array} fields - Field objects to group
         * @returns {{ success: boolean, error?: string }}
         */
        confirmGrouping(fields = []) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm.is(MS.GROUPING_SELECT)) {
                return { success: false, error: 'Not in GROUPING_SELECT state' };
            }

            if (this._selectedFieldIds.length < 2) {
                return { success: false, error: 'Select at least 2 fields to group' };
            }

            // Create group object
            this._currentGroup = {
                id: `group_${Date.now()}`,
                name: '',
                key: '',
                fieldIds: [...this._selectedFieldIds],
                fields: fields,
                options: [],
                createdAt: Date.now()
            };

            // Create options from selected fields
            this._currentGroup.options = this._selectedFieldIds.map((id, index) => ({
                fieldId: id,
                index,
                label: '',
                value: ''
            }));

            // Transition to group naming
            sm.setState(MS.GROUP_NAMING);

            EventBus.emit(window.EventTypes.GROUP_CREATED, {
                group: this._currentGroup,
                fieldCount: this._selectedFieldIds.length
            });

            console.log('[GroupingLogic] Group created with', this._selectedFieldIds.length, 'fields');
            return { success: true, group: this._currentGroup };
        },

        /**
         * Set group name
         * @param {string} name - Group name
         * @returns {{ success: boolean, error?: string }}
         */
        setGroupName(name) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm.is(MS.GROUP_NAMING)) {
                return { success: false, error: 'Not in GROUP_NAMING state' };
            }

            if (!this._currentGroup) {
                return { success: false, error: 'No group defined' };
            }

            this._currentGroup.name = name;
            this._currentGroup.key = this._generateGroupKey(name);

            EventBus.emit(window.EventTypes.GROUP_NAMED, {
                group: this._currentGroup,
                name
            });

            console.log(`[GroupingLogic] Group named: "${name}"`);
            return { success: true };
        },

        /**
         * Start option labeling
         * @returns {{ success: boolean, error?: string, optionCount: number }}
         */
        startOptionLabeling() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm.is(MS.GROUP_NAMING)) {
                return { success: false, error: 'Not in GROUP_NAMING state' };
            }

            if (!this._currentGroup) {
                return { success: false, error: 'No group defined' };
            }

            this._currentOptionIndex = 0;

            // Transition to option labeling
            sm.setState(MS.OPTION_LABELING);

            EventBus.emit(window.EventTypes.FLOW_STEP_CHANGE, {
                from: 'group_naming',
                to: 'option_labeling',
                optionCount: this._currentGroup.options.length
            });

            console.log('[GroupingLogic] Option labeling started');
            return { success: true, optionCount: this._currentGroup.options.length };
        },

        /**
         * Label current option
         * @param {string} label - Option label
         * @returns {{ success: boolean, error?: string, hasNext: boolean }}
         */
        labelOption(label) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm.is(MS.OPTION_LABELING)) {
                return { success: false, error: 'Not in OPTION_LABELING state' };
            }

            if (!this._currentGroup) {
                return { success: false, error: 'No group defined' };
            }

            if (this._currentOptionIndex >= this._currentGroup.options.length) {
                return { success: false, error: 'No more options to label' };
            }

            // Set label
            const option = this._currentGroup.options[this._currentOptionIndex];
            option.label = label;
            option.value = this._generateOptionValue(label, this._currentOptionIndex);

            EventBus.emit(window.EventTypes.OPTION_LABELED, {
                option,
                optionIndex: this._currentOptionIndex,
                label
            });

            console.log(`[GroupingLogic] Option ${this._currentOptionIndex} labeled: "${label}"`);

            // Move to next option
            this._currentOptionIndex++;
            const hasNext = this._currentOptionIndex < this._currentGroup.options.length;

            return { success: true, hasNext };
        },

        /**
         * Skip current option labeling
         * @returns {{ success: boolean, hasNext: boolean }}
         */
        skipOption() {
            if (!this._currentGroup) {
                return { success: false, error: 'No group defined' };
            }

            this._currentOptionIndex++;
            const hasNext = this._currentOptionIndex < this._currentGroup.options.length;

            console.log('[GroupingLogic] Option skipped');
            return { success: true, hasNext };
        },

        /**
         * Complete grouping
         * @returns {{ success: boolean, group?: Object, error?: string }}
         */
        completeGrouping() {
            const sm = window.mapper?.stateMachine;
            const EventBus = window.EventBus;

            if (!this._currentGroup) {
                return { success: false, error: 'No group defined' };
            }

            const group = { ...this._currentGroup };

            // Reset state
            sm.reset(true);

            EventBus.emit(window.EventTypes.FLOW_COMPLETE, {
                type: 'grouping',
                result: group
            });

            // Clean up
            this._selectedFieldIds = [];
            this._currentGroup = null;
            this._currentOptionIndex = 0;

            console.log('[GroupingLogic] Grouping completed');
            return { success: true, group };
        },

        /**
         * Cancel grouping
         * @returns {{ success: boolean }}
         */
        cancelGrouping() {
            const sm = window.mapper?.stateMachine;
            const EventBus = window.EventBus;

            sm.reset(true);

            EventBus.emit(window.EventTypes.FLOW_CANCEL, {
                type: 'grouping'
            });

            // Clean up
            this._selectedFieldIds = [];
            this._currentGroup = null;
            this._currentOptionIndex = 0;

            console.log('[GroupingLogic] Grouping cancelled');
            return { success: true };
        },

        // ============ GETTERS ============

        /**
         * Get current grouping status
         * @returns {Object}
         */
        getStatus() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            return {
                inGrouping: sm?.inCluster?.('GROUPING') || false,
                selectedFieldIds: [...this._selectedFieldIds],
                currentGroup: this._currentGroup ? { ...this._currentGroup } : null,
                currentOptionIndex: this._currentOptionIndex,
                currentState: sm?.getState() || null,
                step: sm?.is(MS.GROUPING_SELECT) ? 'select' :
                      sm?.is(MS.GROUP_NAMING) ? 'naming' :
                      sm?.is(MS.OPTION_LABELING) ? 'labeling' : null
            };
        },

        /**
         * Get selected field IDs
         * @returns {Array}
         */
        getSelectedFieldIds() {
            return [...this._selectedFieldIds];
        },

        /**
         * Get current group
         * @returns {Object|null}
         */
        getCurrentGroup() {
            return this._currentGroup ? { ...this._currentGroup } : null;
        },

        /**
         * Get current option being labeled
         * @returns {Object|null}
         */
        getCurrentOption() {
            if (!this._currentGroup || this._currentOptionIndex >= this._currentGroup.options.length) {
                return null;
            }
            return { ...this._currentGroup.options[this._currentOptionIndex] };
        },

        // ============ HELPERS ============

        /**
         * Generate group key
         * @private
         */
        _generateGroupKey(name) {
            if (!name) {
                return `group_${Date.now()}`;
            }

            let key = name.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');

            return key || `group_${Date.now()}`;
        },

        /**
         * Generate option value
         * @private
         */
        _generateOptionValue(label, index) {
            if (!label) {
                return `option_${index}`;
            }

            let value = label.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');

            return value || `option_${index}`;
        }
    };

    // ============ EXPORTS ============
    window.GroupingLogic = GroupingLogic;

    console.log('🔗 GroupingLogic loaded');

})();
