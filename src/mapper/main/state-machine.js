/**
 * Mapper State Machine - Unified State Management System
 *
 * This module replaces ALL existing mode flags with a single, centralized state machine.
 *
 * CRITICAL: This is the ONLY source of truth for mapper state.
 * No other code should directly modify state - all changes go through stateMachine.setState()
 *
 * @version 2.0.0
 * @author Claude Code
 */

// ============ STATE CLUSTERS ============
// Logical groupings of related states
export const StateClusters = Object.freeze({
    FLOW: ['FLOW_CAPTURE_NAME', 'FLOW_CAPTURE_FIELD'],
    TABLE: ['TABLE_REGION', 'TABLE_SAMPLE_ROW', 'TABLE_COLUMN_MAPPING', 'TABLE_COLUMN_NAMING'],
    GROUPING: ['GROUPING_SELECT', 'GROUP_NAMING', 'OPTION_LABELING'],
    CREATION: ['FIELD_CREATION', 'CHECKBOX_CREATION', 'RADIO_CREATION'],
    INTERACTION: ['DRAWING', 'DRAGGING', 'RESIZING'],
    BASE: ['IDLE', 'TEXT_SELECTION', 'PREVIEW']
});

// ============ STATE ENUM ============
// All possible states - NO OTHER STATES EXIST
export const MapperState = Object.freeze({
    // Base state - no active operation
    IDLE: 'IDLE',

    // ============ UNIFIED MAPPING FLOW ============
    // Two-step flow: capture name → draw field → repeat
    FLOW_CAPTURE_NAME: 'FLOW_CAPTURE_NAME',      // Step 1: Drawing rectangle to capture text
    FLOW_CAPTURE_FIELD: 'FLOW_CAPTURE_FIELD',    // Step 2: Drawing rectangle for field placement

    // ============ DIRECT CREATION MODES ============
    // One-step creation without name capture
    FIELD_CREATION: 'FIELD_CREATION',            // Drawing rectangles to create text fields
    CHECKBOX_CREATION: 'CHECKBOX_CREATION',      // Click to place checkboxes
    RADIO_CREATION: 'RADIO_CREATION',            // Click to place radio buttons

    // ============ GROUPING MODES ============
    GROUPING_SELECT: 'GROUPING_SELECT',          // Selecting fields for grouping
    GROUP_NAMING: 'GROUP_NAMING',                // Naming a group
    OPTION_LABELING: 'OPTION_LABELING',          // Labeling individual options

    // ============ TEXT SELECTION ============
    TEXT_SELECTION: 'TEXT_SELECTION',            // Selecting text to name existing field

    // ============ TABLE MAPPING FLOW ============
    TABLE_REGION: 'TABLE_REGION',                // Step 1: Select table region
    TABLE_SAMPLE_ROW: 'TABLE_SAMPLE_ROW',        // Step 2: Select sample row
    TABLE_COLUMN_MAPPING: 'TABLE_COLUMN_MAPPING', // Step 3: Map columns
    TABLE_COLUMN_NAMING: 'TABLE_COLUMN_NAMING',  // Step 4: Name columns

    // ============ INTERACTION STATES ============
    // These are sub-states during active operations
    DRAWING: 'DRAWING',                          // Currently drawing a rectangle
    DRAGGING: 'DRAGGING',                        // Currently dragging a field
    RESIZING: 'RESIZING',                        // Currently resizing a field

    // ============ PREVIEW MODE ============
    PREVIEW: 'PREVIEW'                           // Preview/livefill mode
});

// ============ STATE METADATA ============
// Configuration for each state
const StateConfig = {
    [MapperState.IDLE]: {
        cursor: 'default',
        layerClass: '',
        statusText: 'מוכן',
        statusType: 'success',
        badge: null,
        allowsFieldSelection: true,
        allowsFieldDrag: true,
        allowsFieldResize: true
    },
    [MapperState.FLOW_CAPTURE_NAME]: {
        cursor: 'text',
        layerClass: 'flow-capture-name-mode',
        statusText: '📝 בחר טקסט - צייר מלבן על טקסט לבחירת שם',
        statusType: 'info',
        badge: '📝 בחר טקסט לשם שדה - Esc לביטול',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false,
        flowType: null  // Will be set dynamically: 'text', 'checkbox', 'radio', 'table'
    },
    [MapperState.FLOW_CAPTURE_FIELD]: {
        cursor: 'crosshair',
        layerClass: 'flow-capture-field-mode',
        statusText: '📐 צייר שדה - גרור מלבן למיקום השדה',
        statusType: 'info',
        badge: '📐 צייר שדה - Esc לביטול',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.FIELD_CREATION]: {
        cursor: 'crosshair',
        layerClass: 'field-creation-mode',
        statusText: '📐 מצב יצירת שדות - צייר מלבנים',
        statusType: 'info',
        badge: '📐 יצירת שדות - Esc לביטול',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.CHECKBOX_CREATION]: {
        cursor: 'cell',
        layerClass: 'checkbox-creation-mode',
        statusText: '☑️ מצב Checkbox - לחץ ליצירה',
        statusType: 'info',
        badge: '☑️ יצירת Checkbox - Esc לביטול',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.RADIO_CREATION]: {
        cursor: 'cell',
        layerClass: 'radio-creation-mode',
        statusText: '🔘 מצב Radio - לחץ ליצירה',
        statusType: 'info',
        badge: '🔘 יצירת Radio - Esc לביטול',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.GROUPING_SELECT]: {
        cursor: 'pointer',
        layerClass: 'grouping-mode',
        statusText: '🔗 מצב קיבוץ - בחר שדות',
        statusType: 'info',
        badge: '🔗 בחר שדות לקיבוץ - Esc לביטול',
        allowsFieldSelection: true,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.GROUP_NAMING]: {
        cursor: 'text',
        layerClass: 'group-naming-mode',
        statusText: '✏️ מצב מתן שם לקבוצה',
        statusType: 'info',
        badge: '✏️ בחר טקסט לשם הקבוצה',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.OPTION_LABELING]: {
        cursor: 'text',
        layerClass: 'option-labeling-mode',
        statusText: '🏷️ מצב תיוג אפשרות',
        statusType: 'info',
        badge: '🏷️ בחר טקסט לתיוג',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.TEXT_SELECTION]: {
        cursor: 'text',
        layerClass: 'text-selection-mode',
        statusText: '📝 בחר טקסט לשדה',
        statusType: 'info',
        badge: '📝 בחר טקסט - Esc לביטול',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.TABLE_REGION]: {
        cursor: 'crosshair',
        layerClass: 'table-region-mode',
        statusText: '📊 שלב 1: סמן את אזור הטבלה',
        statusType: 'info',
        badge: '📊 בחר אזור טבלה',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.TABLE_SAMPLE_ROW]: {
        cursor: 'crosshair',
        layerClass: 'table-sample-row-mode',
        statusText: '📊 שלב 2: סמן שורה לדוגמה',
        statusType: 'info',
        badge: '📊 בחר שורה לדוגמה',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.TABLE_COLUMN_MAPPING]: {
        cursor: 'col-resize',
        layerClass: 'table-column-mode',
        statusText: '📊 שלב 3: הגדר עמודות',
        statusType: 'info',
        badge: '📊 מפה עמודות',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.TABLE_COLUMN_NAMING]: {
        cursor: 'text',
        layerClass: 'table-column-naming-mode',
        statusText: '📊 שלב 4: שמות עמודות',
        statusType: 'info',
        badge: '📊 שם עמודות',
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.DRAWING]: {
        cursor: 'crosshair',
        layerClass: 'drawing-active',
        statusText: null,  // Keep previous status
        statusType: null,
        badge: null,
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    },
    [MapperState.DRAGGING]: {
        cursor: 'move',
        layerClass: 'dragging-active',
        statusText: null,
        statusType: null,
        badge: null,
        allowsFieldSelection: false,
        allowsFieldDrag: true,
        allowsFieldResize: false
    },
    [MapperState.RESIZING]: {
        cursor: 'nwse-resize',
        layerClass: 'resizing-active',
        statusText: null,
        statusType: null,
        badge: null,
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: true
    },
    [MapperState.PREVIEW]: {
        cursor: 'default',
        layerClass: 'preview-mode',
        statusText: '👁️ מצב תצוגה מקדימה',
        statusType: 'info',
        badge: null,
        allowsFieldSelection: false,
        allowsFieldDrag: false,
        allowsFieldResize: false
    }
};

// ============ TRANSITION RULES ============
// Defines which state transitions are allowed
// Format: { [fromState]: [allowedTargetStates] }
const TransitionRules = {
    [MapperState.IDLE]: [
        MapperState.FLOW_CAPTURE_NAME,
        MapperState.FIELD_CREATION,
        MapperState.CHECKBOX_CREATION,
        MapperState.RADIO_CREATION,
        MapperState.GROUPING_SELECT,
        MapperState.TEXT_SELECTION,
        MapperState.TABLE_REGION,
        MapperState.DRAWING,
        MapperState.DRAGGING,
        MapperState.RESIZING,
        MapperState.PREVIEW
    ],

    // Flow states
    [MapperState.FLOW_CAPTURE_NAME]: [
        MapperState.FLOW_CAPTURE_FIELD,
        MapperState.DRAWING,
        MapperState.IDLE  // ESC to cancel
    ],
    [MapperState.FLOW_CAPTURE_FIELD]: [
        MapperState.FLOW_CAPTURE_NAME,  // Loop back after field creation
        MapperState.DRAWING,
        MapperState.IDLE  // ESC to cancel
    ],

    // Direct creation modes
    [MapperState.FIELD_CREATION]: [
        MapperState.DRAWING,
        MapperState.IDLE
    ],
    [MapperState.CHECKBOX_CREATION]: [
        MapperState.IDLE
    ],
    [MapperState.RADIO_CREATION]: [
        MapperState.IDLE
    ],

    // Grouping flow
    [MapperState.GROUPING_SELECT]: [
        MapperState.GROUP_NAMING,
        MapperState.IDLE
    ],
    [MapperState.GROUP_NAMING]: [
        MapperState.OPTION_LABELING,
        MapperState.GROUPING_SELECT,
        MapperState.DRAWING,
        MapperState.IDLE
    ],
    [MapperState.OPTION_LABELING]: [
        MapperState.GROUP_NAMING,
        MapperState.DRAWING,
        MapperState.IDLE
    ],

    // Text selection
    [MapperState.TEXT_SELECTION]: [
        MapperState.DRAWING,
        MapperState.IDLE
    ],

    // Table mapping flow
    [MapperState.TABLE_REGION]: [
        MapperState.TABLE_SAMPLE_ROW,
        MapperState.DRAWING,
        MapperState.IDLE
    ],
    [MapperState.TABLE_SAMPLE_ROW]: [
        MapperState.TABLE_COLUMN_MAPPING,
        MapperState.DRAWING,
        MapperState.IDLE
    ],
    [MapperState.TABLE_COLUMN_MAPPING]: [
        MapperState.TABLE_COLUMN_NAMING,
        MapperState.DRAWING,
        MapperState.IDLE
    ],
    [MapperState.TABLE_COLUMN_NAMING]: [
        MapperState.DRAWING,
        MapperState.IDLE
    ],

    // Interaction states - can return to any "parent" state
    [MapperState.DRAWING]: [
        MapperState.IDLE,
        MapperState.FLOW_CAPTURE_NAME,
        MapperState.FLOW_CAPTURE_FIELD,
        MapperState.FIELD_CREATION,
        MapperState.TEXT_SELECTION,
        MapperState.TABLE_REGION,
        MapperState.TABLE_SAMPLE_ROW,
        MapperState.TABLE_COLUMN_MAPPING,
        MapperState.GROUP_NAMING,
        MapperState.OPTION_LABELING
    ],
    [MapperState.DRAGGING]: [
        MapperState.IDLE
    ],
    [MapperState.RESIZING]: [
        MapperState.IDLE
    ],

    // Preview mode
    [MapperState.PREVIEW]: [
        MapperState.IDLE
    ]
};

// ============ STATE ACTIONS MAP ============
// Defines which actions are allowed in each state
// This is the SINGLE SOURCE OF TRUTH for action validation
const StateActions = {
    [MapperState.IDLE]: [
        'startMappingFlow',
        'toggleFieldCreation',
        'toggleCheckboxCreation',
        'toggleRadioCreation',
        'toggleGrouping',
        'toggleTextSelection',
        'startTableMapping',
        'togglePreview',
        'selectField',
        'startDrag',
        'startResize'
    ],

    [MapperState.FLOW_CAPTURE_NAME]: [
        'startDrawing',
        'updateDrawing',
        'finishDrawing',      // → captures text, transitions to FLOW_CAPTURE_FIELD
        'cancelFlow',         // → IDLE
        'escapePressed'
    ],

    [MapperState.FLOW_CAPTURE_FIELD]: [
        'startDrawing',
        'updateDrawing',
        'finishDrawing',      // → creates field, transitions back to FLOW_CAPTURE_NAME
        'cancelFlow',         // → IDLE
        'escapePressed'
    ],

    [MapperState.FIELD_CREATION]: [
        'startDrawing',
        'updateDrawing',
        'finishDrawing',      // → creates field, stays in FIELD_CREATION
        'toggleFieldCreation', // → IDLE
        'escapePressed'
    ],

    [MapperState.CHECKBOX_CREATION]: [
        'clickToPlace',       // → creates checkbox at click position
        'toggleCheckboxCreation', // → IDLE
        'escapePressed'
    ],

    [MapperState.RADIO_CREATION]: [
        'clickToPlace',       // → creates radio at click position
        'toggleRadioCreation', // → IDLE
        'escapePressed'
    ],

    [MapperState.GROUPING_SELECT]: [
        'toggleFieldSelection', // Ctrl+click to select/deselect fields
        'confirmGrouping',      // → GROUP_NAMING
        'cancelGrouping',       // → IDLE
        'escapePressed'
    ],

    [MapperState.GROUP_NAMING]: [
        'startDrawing',
        'updateDrawing',
        'finishDrawing',       // → captures text for group name
        'confirmGroupName',    // → OPTION_LABELING or IDLE
        'cancelGrouping',      // → IDLE
        'escapePressed'
    ],

    [MapperState.OPTION_LABELING]: [
        'startDrawing',
        'updateDrawing',
        'finishDrawing',       // → captures text for option label
        'nextOption',          // → next option or IDLE
        'cancelLabeling',      // → IDLE
        'escapePressed'
    ],

    [MapperState.TEXT_SELECTION]: [
        'startTextSelection',
        'updateTextSelection',
        'finishTextSelection', // → applies name to field
        'cancelSelection',     // → IDLE
        'escapePressed'
    ],

    [MapperState.TABLE_REGION]: [
        'startDrawing',
        'updateDrawing',
        'finishDrawing',       // → creates region, transitions to TABLE_SAMPLE_ROW
        'cancelTableMapping',  // → IDLE
        'escapePressed'
    ],

    [MapperState.TABLE_SAMPLE_ROW]: [
        'startDrawing',
        'updateDrawing',
        'finishDrawing',       // → sets sample row, transitions to TABLE_COLUMN_MAPPING
        'cancelTableMapping',  // → IDLE
        'escapePressed'
    ],

    [MapperState.TABLE_COLUMN_MAPPING]: [
        'startDrawing',
        'updateDrawing',
        'finishDrawing',       // → adds column
        'finishColumnMapping', // → TABLE_COLUMN_NAMING or IDLE
        'cancelTableMapping',  // → IDLE
        'escapePressed'
    ],

    [MapperState.TABLE_COLUMN_NAMING]: [
        'startDrawing',
        'updateDrawing',
        'finishDrawing',       // → captures column name
        'nextColumn',          // → next column or IDLE
        'cancelTableMapping',  // → IDLE
        'escapePressed'
    ],

    [MapperState.DRAWING]: [
        'updateDrawing',
        'finishDrawing',
        'cancelDrawing'
    ],

    [MapperState.DRAGGING]: [
        'updateDrag',
        'finishDrag',
        'cancelDrag'
    ],

    [MapperState.RESIZING]: [
        'updateResize',
        'finishResize',
        'cancelResize'
    ],

    [MapperState.PREVIEW]: [
        'togglePreview',       // → IDLE
        'escapePressed'
    ]
};

// ============ STATE MACHINE CLASS ============
export class StateMachine {
    constructor(mapper) {
        this.mapper = mapper;
        this.currentState = MapperState.IDLE;
        this.previousState = null;
        this.parentState = null;  // For sub-states like DRAWING
        this.transitionLog = [];
        this.maxLogSize = 100;

        // Flow-specific data
        this.flowData = {
            type: null,           // 'text', 'checkbox', 'radio', 'table'
            pendingName: null,    // Captured text for field naming
            pendingBbox: null,    // Captured bbox
            targetField: null,    // Field being modified
            tableData: null,      // Table mapping data
            groupData: null       // Grouping data
        };

        // Guards
        this._transitionInProgress = false;
        this._lastTransitionTime = 0;
        this._minTransitionInterval = 10;  // Minimum ms between transitions

        // Event listeners
        this._listeners = {
            onStateChange: [],
            onTransitionBlocked: [],
            onError: []
        };

        console.log('🎛️ StateMachine initialized in state:', this.currentState);
    }

    // ============ CORE STATE MANAGEMENT ============

    /**
     * Get current state
     * @returns {string} Current MapperState
     */
    getState() {
        return this.currentState;
    }

    /**
     * Get state configuration
     * @param {string} state - Optional state, defaults to current
     * @returns {Object} State configuration
     */
    getStateConfig(state = this.currentState) {
        return StateConfig[state] || StateConfig[MapperState.IDLE];
    }

    /**
     * Check if in a specific state
     * @param {string} state - State to check
     * @returns {boolean}
     */
    isInState(state) {
        return this.currentState === state;
    }

    /**
     * Shorthand alias for isInState - cleaner syntax for checks
     * @param {string} state - State to check
     * @returns {boolean}
     */
    is(state) {
        return this.currentState === state;
    }

    /**
     * Check if in any of the given states
     * @param {string[]} states - States to check
     * @returns {boolean}
     */
    isInAnyState(states) {
        return states.includes(this.currentState);
    }

    // ============ NEW HELPER APIS (Phase 5) ============

    /**
     * Check if transition to target state is allowed from current state
     * Alias for easier use: sm.can('IDLE')
     * @param {string} targetState - State name or MapperState value
     * @returns {boolean}
     */
    can(targetState) {
        // Resolve string to enum value if needed
        const target = MapperState[targetState] || targetState;
        return this.canTransition(this.currentState, target);
    }

    /**
     * Check if current state is NOT in any of the disallowed states
     * Used to guard actions: if (sm.disallow(['DRAWING', 'DRAGGING'])) { proceed }
     * @param {string[]} disallowedStates - States that should block the action
     * @returns {boolean} true if NOT in any of the disallowed states
     */
    disallow(disallowedStates) {
        const resolved = disallowedStates.map(s => MapperState[s] || s);
        return !resolved.includes(this.currentState);
    }

    /**
     * Check if current state IS in one of the required states
     * Used to guard actions: if (sm.require(['IDLE', 'FLOW_CAPTURE_NAME'])) { proceed }
     * @param {string[]} requiredStates - States that allow the action
     * @returns {boolean} true if in any of the required states
     */
    require(requiredStates) {
        const resolved = requiredStates.map(s => MapperState[s] || s);
        return resolved.includes(this.currentState);
    }

    /**
     * Check if current state is in a specific cluster
     * @param {string} clusterName - Cluster name: 'FLOW', 'TABLE', 'GROUPING', 'CREATION', 'INTERACTION', 'BASE'
     * @returns {boolean}
     */
    inCluster(clusterName) {
        const cluster = StateClusters[clusterName];
        if (!cluster) return false;
        return cluster.includes(this.currentState);
    }

    /**
     * Print detailed debug info to console
     * @returns {Object} Debug info object
     */
    debug() {
        const info = this.getDebugInfo();
        const validation = this.validate();
        const allowedActions = this.getAllowedActions();
        const cluster = this._getCurrentCluster();

        console.log('═══════════════════════════════════════════');
        console.log('🎛️ STATE MACHINE DEBUG');
        console.log('═══════════════════════════════════════════');
        console.log('📊 Current State:', this.currentState);
        console.log('📁 Cluster:', cluster);
        console.log('⬅️ Previous:', this.previousState || 'none');
        console.log('⬆️ Parent:', this.parentState || 'none');
        console.log('');
        console.log('🔄 Flow Data:');
        console.table(this.flowData);
        console.log('');
        console.log('✅ Allowed Actions:', allowedActions.join(', ') || 'none');
        console.log('');
        console.log('🔍 Validation:', validation.valid ? '✅ VALID' : '❌ INVALID');
        if (validation.errors.length) console.log('  Errors:', validation.errors);
        if (validation.warnings.length) console.log('  Warnings:', validation.warnings);
        console.log('');
        console.log('📜 Last 5 Transitions:');
        this.transitionLog.slice(-5).forEach((entry, i) => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            console.log(`  ${i + 1}. [${time}] ${entry.from} → ${entry.to}`);
        });
        console.log('═══════════════════════════════════════════');

        return {
            ...info,
            validation,
            allowedActions,
            cluster
        };
    }

    /**
     * Check if transition is a valid rapid flow transition
     * These transitions happen quickly during mapping flow and should be allowed
     * @private
     */
    _isRapidFlowTransition(from, to) {
        const MS = MapperState;
        return (
            // Flow start
            (from === MS.IDLE && to === MS.FLOW_CAPTURE_NAME) ||
            // Text captured → ready for field drawing
            (from === MS.FLOW_CAPTURE_NAME && to === MS.FLOW_CAPTURE_FIELD) ||
            // Start drawing field
            (from === MS.FLOW_CAPTURE_FIELD && to === MS.DRAWING) ||
            // Drawing finished → restore to parent flow state
            (from === MS.DRAWING && to === MS.FLOW_CAPTURE_NAME) ||
            (from === MS.DRAWING && to === MS.FLOW_CAPTURE_FIELD) ||
            // Field created → loop back for next field
            (from === MS.FLOW_CAPTURE_FIELD && to === MS.FLOW_CAPTURE_NAME)
        );
    }

    /**
     * Get current cluster name
     * @private
     */
    _getCurrentCluster() {
        for (const [name, states] of Object.entries(StateClusters)) {
            if (states.includes(this.currentState)) {
                return name;
            }
        }
        return 'UNKNOWN';
    }

    /**
     * Check if currently in a flow state
     * @returns {boolean}
     */
    isInFlow() {
        return this.currentState === MapperState.FLOW_CAPTURE_NAME ||
               this.currentState === MapperState.FLOW_CAPTURE_FIELD;
    }

    /**
     * Check if currently in table mapping flow
     * @returns {boolean}
     */
    isInTableFlow() {
        return [
            MapperState.TABLE_REGION,
            MapperState.TABLE_SAMPLE_ROW,
            MapperState.TABLE_COLUMN_MAPPING,
            MapperState.TABLE_COLUMN_NAMING
        ].includes(this.currentState);
    }

    /**
     * Check if currently in a creation mode
     * @returns {boolean}
     */
    isInCreationMode() {
        return [
            MapperState.FIELD_CREATION,
            MapperState.CHECKBOX_CREATION,
            MapperState.RADIO_CREATION,
            MapperState.FLOW_CAPTURE_FIELD
        ].includes(this.currentState);
    }

    /**
     * Check if currently in an interaction state
     * @returns {boolean}
     */
    isInteracting() {
        return [
            MapperState.DRAWING,
            MapperState.DRAGGING,
            MapperState.RESIZING
        ].includes(this.currentState);
    }

    // ============ STATE TRANSITIONS ============

    /**
     * Check if a transition is allowed
     * @param {string} fromState - Source state
     * @param {string} toState - Target state
     * @returns {boolean}
     */
    canTransition(fromState, toState) {
        // Same state - always allowed (no-op)
        if (fromState === toState) return true;

        // Check transition rules
        const allowedTargets = TransitionRules[fromState];
        if (!allowedTargets) {
            console.warn(`[StateMachine] No transition rules for state: ${fromState}`);
            return false;
        }

        return allowedTargets.includes(toState);
    }

    /**
     * Set new state with validation and hooks
     * @param {string} newState - Target state
     * @param {Object} options - Transition options
     * @returns {boolean} Success
     */
    setState(newState, options = {}) {
        const {
            force = false,           // Bypass transition rules
            silent = false,          // Skip logging
            data = null,             // Additional data for the state
            parentState = null       // For sub-states, remember parent
        } = options;

        // ============ GUARD: Validate state exists ============
        if (!Object.values(MapperState).includes(newState)) {
            this._emitError(`Invalid state: ${newState}`);
            return false;
        }

        // ============ GUARD: Same state - no-op ============
        if (this.currentState === newState && !force) {
            return true;
        }

        // ============ GUARD: Transition in progress ============
        if (this._transitionInProgress) {
            console.warn(`[StateMachine] Transition blocked - already in progress`);
            this._emitTransitionBlocked(this.currentState, newState, 'in_progress');
            return false;
        }

        // ============ GUARD: Rapid transition ============
        const now = Date.now();
        const timeSinceLast = now - this._lastTransitionTime;

        // Allow rapid transitions during mapping flow
        if (this._isRapidFlowTransition(this.currentState, newState)) {
            // Flow transitions are allowed to be rapid - skip the time check
        } else if (timeSinceLast < this._minTransitionInterval && !force) {
            console.warn(`[StateMachine] Transition blocked - too rapid (<${this._minTransitionInterval}ms)`);
            this._emitTransitionBlocked(this.currentState, newState, 'too_rapid');
            return false;
        }

        // ============ GUARD: Check transition rules ============
        if (!force && !this.canTransition(this.currentState, newState)) {
            console.warn(`[StateMachine] Transition blocked: ${this.currentState} → ${newState} (not allowed)`);
            this._emitTransitionBlocked(this.currentState, newState, 'not_allowed');
            return false;
        }

        // ============ BEGIN TRANSITION ============
        this._transitionInProgress = true;
        const previousState = this.currentState;

        try {
            // Store parent state for sub-states
            if ([MapperState.DRAWING, MapperState.DRAGGING, MapperState.RESIZING].includes(newState)) {
                this.parentState = parentState || this.currentState;
            } else {
                this.parentState = null;
            }

            // Call onExit hook for previous state
            this._onExit(previousState, newState);

            // Update state
            this.previousState = previousState;
            this.currentState = newState;
            this._lastTransitionTime = now;

            // Store additional data
            if (data) {
                Object.assign(this.flowData, data);
            }

            // Call onEnter hook for new state
            this._onEnter(newState, previousState);

            // Log transition
            if (!silent) {
                this._logTransition(previousState, newState);
            }

            // Emit state change event
            this._emitStateChange(previousState, newState);

            // Apply UI changes
            this._applyStateUI(newState);

            return true;

        } catch (error) {
            console.error('[StateMachine] Transition error:', error);
            this._emitError(error.message);
            return false;

        } finally {
            this._transitionInProgress = false;
        }
    }

    /**
     * Return to previous state (for sub-states like DRAWING)
     * @returns {boolean} Success
     */
    returnToParent() {
        if (this.parentState) {
            return this.setState(this.parentState, { force: true });
        } else if (this.previousState) {
            return this.setState(this.previousState, { force: true });
        } else {
            return this.setState(MapperState.IDLE);
        }
    }

    /**
     * Reset to IDLE state, clearing all flow data
     * @param {boolean} silent - Skip logging
     * @returns {boolean} Success
     */
    reset(silent = false) {
        // Clear flow data
        this.flowData = {
            type: null,
            pendingName: null,
            pendingBbox: null,
            targetField: null,
            tableData: null,
            groupData: null
        };

        this.parentState = null;

        return this.setState(MapperState.IDLE, { force: true, silent });
    }

    // ============ STATE HOOKS ============

    /**
     * Called when exiting a state
     * @private
     */
    _onExit(fromState, toState) {
        const config = StateConfig[fromState];
        if (!config) return;

        // Remove layer class
        const layer = document.getElementById('mapping-layer');
        if (layer && config.layerClass) {
            layer.classList.remove(config.layerClass);
        }

        // State-specific exit logic
        switch (fromState) {
            case MapperState.FLOW_CAPTURE_NAME:
            case MapperState.FLOW_CAPTURE_FIELD:
                // Don't clear flow data if transitioning within flow
                if (toState !== MapperState.FLOW_CAPTURE_NAME &&
                    toState !== MapperState.FLOW_CAPTURE_FIELD &&
                    toState !== MapperState.DRAWING) {
                    this.flowData.type = null;
                    this.flowData.pendingName = null;
                }
                break;

            case MapperState.GROUPING_SELECT:
                if (toState === MapperState.IDLE) {
                    this.flowData.groupData = null;
                }
                break;

            case MapperState.TABLE_REGION:
            case MapperState.TABLE_SAMPLE_ROW:
            case MapperState.TABLE_COLUMN_MAPPING:
            case MapperState.TABLE_COLUMN_NAMING:
                if (toState === MapperState.IDLE) {
                    this.flowData.tableData = null;
                }
                break;
        }

        console.log(`[StateMachine] EXIT: ${fromState}`);
    }

    /**
     * Called when entering a state
     * @private
     */
    _onEnter(toState, fromState) {
        const config = StateConfig[toState];
        if (!config) return;

        // Add layer class
        const layer = document.getElementById('mapping-layer');
        if (layer) {
            if (config.layerClass) {
                layer.classList.add(config.layerClass);
            }
            if (config.cursor) {
                layer.style.cursor = config.cursor;
            }
        }

        // State-specific enter logic
        switch (toState) {
            case MapperState.FLOW_CAPTURE_NAME:
                // Activate button
                const captureBtn = document.getElementById('btn-select-field-name');
                if (captureBtn) captureBtn.classList.add('active');
                break;

            case MapperState.FLOW_CAPTURE_FIELD:
                // Deactivate capture button, show draw indicator
                const captureBtnOff = document.getElementById('btn-select-field-name');
                if (captureBtnOff) captureBtnOff.classList.remove('active');
                break;

            case MapperState.FIELD_CREATION:
                const fieldBtn = document.getElementById('btn-draw-rect');
                if (fieldBtn) fieldBtn.classList.add('active');
                break;

            case MapperState.CHECKBOX_CREATION:
                const checkBtn = document.getElementById('btn-checkbox-mode');
                if (checkBtn) checkBtn.classList.add('active');
                break;

            case MapperState.RADIO_CREATION:
                const radioBtn = document.getElementById('btn-radio-mode');
                if (radioBtn) radioBtn.classList.add('active');
                break;

            case MapperState.GROUPING_SELECT:
                const groupBtn = document.getElementById('btn-grouping-mode');
                if (groupBtn) groupBtn.classList.add('active');
                break;

            case MapperState.IDLE:
                // Deactivate all buttons
                document.querySelectorAll('.active').forEach(el => {
                    if (el.classList.contains('btn-draw-rect') ||
                        el.classList.contains('btn-checkbox-mode') ||
                        el.classList.contains('btn-radio-mode') ||
                        el.classList.contains('btn-grouping-mode') ||
                        el.classList.contains('btn-select-field-name')) {
                        el.classList.remove('active');
                    }
                });
                // Reset cursor
                if (layer) {
                    layer.style.cursor = '';
                }
                break;
        }

        console.log(`[StateMachine] ENTER: ${toState}`);
    }

    /**
     * Apply UI changes for current state
     * @private
     */
    _applyStateUI(state) {
        const config = StateConfig[state];
        if (!config) return;

        // Update status bar
        if (config.statusText && this.mapper && this.mapper.setStatus) {
            this.mapper.setStatus(config.statusText, config.statusType || 'info');
        }

        // Update mapping badge
        if (this.mapper && this.mapper.updateMappingBadge) {
            this.mapper.updateMappingBadge(config.badge);
        }

        // Show/hide flow step indicator
        if (this.mapper && this.mapper._showFlowStepIndicator) {
            if (state === MapperState.FLOW_CAPTURE_NAME) {
                this.mapper._showFlowStepIndicator('capture_name');
            } else if (state === MapperState.FLOW_CAPTURE_FIELD) {
                this.mapper._showFlowStepIndicator('capture_field');
            } else if (!this.isInFlow()) {
                if (this.mapper._hideFlowStepIndicator) {
                    this.mapper._hideFlowStepIndicator();
                }
            }
        }
    }

    // ============ LOGGING ============

    /**
     * Log a state transition with detailed debug info
     * @private
     */
    _logTransition(from, to) {
        const now = Date.now();
        const timestamp = new Date(now).toISOString();
        const timeSinceLastTransition = now - this._lastTransitionTime;

        // Get caller info from stack trace
        let triggeredBy = 'unknown';
        try {
            const stack = new Error().stack;
            const lines = stack.split('\n');
            // Find first line that's not from state-machine.js
            for (let i = 2; i < lines.length; i++) {
                if (!lines[i].includes('state-machine.js') && !lines[i].includes('setState')) {
                    const match = lines[i].match(/at\s+(\S+)/);
                    if (match) {
                        triggeredBy = match[1].replace(/^Object\./, '');
                        break;
                    }
                }
            }
        } catch (e) {
            // Ignore stack trace errors
        }

        const entry = {
            timestamp: now,
            timestampISO: timestamp,
            from,
            to,
            triggeredBy,
            timeSinceLastTransition,
            flowData: { ...this.flowData }
        };

        this.transitionLog.push(entry);

        // Trim log if too large
        if (this.transitionLog.length > this.maxLogSize) {
            this.transitionLog = this.transitionLog.slice(-this.maxLogSize);
        }

        // Detailed console log with timestamp
        const timeStr = timestamp.split('T')[1].replace('Z', '');
        console.log(`[STATE] ${from} → ${to}`);
        console.log(`  triggered by: ${triggeredBy}`);
        console.log(`  at: ${timeStr}`);
        if (this.flowData.type) {
            console.log(`  flow type: ${this.flowData.type}`);
        }
        if (timeSinceLastTransition < 50) {
            console.warn(`  ⚠️ rapid transition (${timeSinceLastTransition}ms since last)`);
        }

        // Track in FreezeDetector if available
        if (window.FreezeDetector && window.FreezeDetector.trackModeChange) {
            window.FreezeDetector.trackModeChange('mapperState', to);
        }
    }

    /**
     * Get transition history
     * @param {number} count - Number of entries to return
     * @returns {Array} Transition log entries
     */
    getHistory(count = 10) {
        return this.transitionLog.slice(-count);
    }

    /**
     * Print transition history to console
     */
    printHistory() {
        console.log('📜 State Transition History:');
        this.transitionLog.slice(-20).forEach((entry, i) => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            console.log(`  ${i + 1}. [${time}] ${entry.from} → ${entry.to}`);
        });
    }

    // ============ EVENT SYSTEM ============

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (this._listeners[event]) {
            this._listeners[event].push(callback);
        }
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback to remove
     */
    off(event, callback) {
        if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
        }
    }

    _emitStateChange(from, to) {
        this._listeners.onStateChange.forEach(cb => {
            try {
                cb(from, to, this.flowData);
            } catch (e) {
                console.error('[StateMachine] Listener error:', e);
            }
        });
    }

    _emitTransitionBlocked(from, to, reason) {
        this._listeners.onTransitionBlocked.forEach(cb => {
            try {
                cb(from, to, reason);
            } catch (e) {
                console.error('[StateMachine] Listener error:', e);
            }
        });
    }

    _emitError(message) {
        console.error(`[StateMachine] Error: ${message}`);
        this._listeners.onError.forEach(cb => {
            try {
                cb(message);
            } catch (e) {
                console.error('[StateMachine] Listener error:', e);
            }
        });
    }

    // ============ FLOW DATA MANAGEMENT ============

    /**
     * Set flow type (text, checkbox, radio, table)
     * @param {string} type - Flow type
     */
    setFlowType(type) {
        this.flowData.type = type;
    }

    /**
     * Get flow type
     * @returns {string|null}
     */
    getFlowType() {
        return this.flowData.type;
    }

    /**
     * Set pending name for field creation
     * @param {Object} nameData - { text, key, source }
     */
    setPendingName(nameData) {
        this.flowData.pendingName = nameData;
    }

    /**
     * Get pending name
     * @returns {Object|null}
     */
    getPendingName() {
        return this.flowData.pendingName;
    }

    /**
     * Clear pending name
     */
    clearPendingName() {
        this.flowData.pendingName = null;
    }

    /**
     * Set target field for text selection
     * @param {Object} field - Field being named
     */
    setTargetField(field) {
        this.flowData.targetField = field;
    }

    /**
     * Get target field
     * @returns {Object|null}
     */
    getTargetField() {
        return this.flowData.targetField;
    }

    // ============ VALIDATION ============

    /**
     * Validate current state integrity
     * @returns {Object} { valid, errors, warnings }
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Check state is valid
        if (!Object.values(MapperState).includes(this.currentState)) {
            errors.push(`Invalid current state: ${this.currentState}`);
        }

        // Check flow state consistency
        if (this.isInFlow() && !this.flowData.type) {
            warnings.push('In flow state but flowData.type is null');
        }

        if (this.currentState === MapperState.FLOW_CAPTURE_FIELD && !this.flowData.pendingName) {
            warnings.push('In FLOW_CAPTURE_FIELD but no pending name');
        }

        // Check for stuck transition
        if (this._transitionInProgress) {
            errors.push('Transition stuck in progress');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            state: this.currentState,
            flowData: { ...this.flowData }
        };
    }

    /**
     * Get debug info
     * @returns {Object}
     */
    getDebugInfo() {
        return {
            currentState: this.currentState,
            previousState: this.previousState,
            parentState: this.parentState,
            flowData: { ...this.flowData },
            transitionInProgress: this._transitionInProgress,
            lastTransitionTime: this._lastTransitionTime,
            historyLength: this.transitionLog.length
        };
    }

    // ============ ACTION VALIDATION ============

    /**
     * Check if an action is allowed in the current state
     * @param {string} action - Action name
     * @returns {boolean}
     */
    isActionAllowed(action) {
        const allowedActions = StateActions[this.currentState] || [];
        return allowedActions.includes(action);
    }

    /**
     * Get all allowed actions for current state
     * @returns {string[]}
     */
    getAllowedActions() {
        return StateActions[this.currentState] || [];
    }

    // ============ CENTRAL EVENT HANDLER ============

    /**
     * Handle all events - THE MAIN ENTRY POINT
     * All mouse/keyboard/UI events should call this method
     * @param {string} eventType - Event type: 'mousedown', 'mouseup', 'mousemove', 'keydown', 'click', etc.
     * @param {Object} data - Event data: { x, y, target, event, ... }
     * @returns {Object} { handled: boolean, action: string, result: any }
     */
    handleEvent(eventType, data = {}) {
        const state = this.currentState;
        const mapper = this.mapper;

        // Log event for debugging
        console.log(`[EVENT] ${eventType} in state ${state}`);

        // ============ MOUSE DOWN ============
        if (eventType === 'mousedown') {
            return this._handleMouseDown(data);
        }

        // ============ MOUSE MOVE ============
        if (eventType === 'mousemove') {
            return this._handleMouseMove(data);
        }

        // ============ MOUSE UP ============
        if (eventType === 'mouseup') {
            return this._handleMouseUp(data);
        }

        // ============ KEY DOWN ============
        if (eventType === 'keydown') {
            return this._handleKeyDown(data);
        }

        // ============ CLICK ============
        if (eventType === 'click') {
            return this._handleClick(data);
        }

        return { handled: false, action: null, result: null };
    }

    /**
     * Handle mousedown event
     * @private
     */
    _handleMouseDown(data) {
        const { x, y, target, event } = data;
        const state = this.currentState;
        const mapper = this.mapper;

        // Check for resize handle
        if (target?.classList?.contains('resize-handle')) {
            if (this.isActionAllowed('startResize')) {
                this.setParentState(state);
                this.setState(MapperState.RESIZING, { force: true });
                mapper.startResize(target, x, y);
                return { handled: true, action: 'startResize' };
            }
        }

        // Check for field overlay (drag)
        if (target?.closest?.('.field-overlay')) {
            const overlay = target.closest('.field-overlay');
            const fieldId = overlay.dataset.fieldId;

            // Grouping mode: Ctrl+Click to toggle selection
            if (state === MapperState.GROUPING_SELECT && event?.ctrlKey && fieldId) {
                mapper.toggleOptionSelection(fieldId);
                return { handled: true, action: 'toggleFieldSelection' };
            }

            // Normal drag
            if (this.isActionAllowed('startDrag')) {
                this.setParentState(state);
                this.setState(MapperState.DRAGGING, { force: true });
                mapper.startDrag(overlay, x, y);
                return { handled: true, action: 'startDrag' };
            }
        }

        // State-specific handling
        switch (state) {
            case MapperState.CHECKBOX_CREATION:
                if (this.isActionAllowed('clickToPlace')) {
                    mapper.createOneClickField(x, y, 'checkbox');
                    return { handled: true, action: 'clickToPlace', result: 'checkbox' };
                }
                break;

            case MapperState.RADIO_CREATION:
                if (this.isActionAllowed('clickToPlace')) {
                    mapper.createOneClickField(x, y, 'radio');
                    return { handled: true, action: 'clickToPlace', result: 'radio' };
                }
                break;

            case MapperState.FLOW_CAPTURE_NAME:
            case MapperState.FLOW_CAPTURE_FIELD:
            case MapperState.FIELD_CREATION:
            case MapperState.TABLE_REGION:
            case MapperState.TABLE_SAMPLE_ROW:
            case MapperState.TABLE_COLUMN_MAPPING:
            case MapperState.GROUP_NAMING:
            case MapperState.OPTION_LABELING:
                if (this.isActionAllowed('startDrawing')) {
                    this.setParentState(state);
                    this.setState(MapperState.DRAWING, { force: true });
                    mapper.startDrawing(x, y, event);
                    return { handled: true, action: 'startDrawing' };
                }
                break;

            case MapperState.TEXT_SELECTION:
                if (this.isActionAllowed('startTextSelection')) {
                    mapper.startTextSelection(x, y);
                    return { handled: true, action: 'startTextSelection' };
                }
                break;

            case MapperState.IDLE:
                // Check if a field is selected for mapping
                if (mapper.selectedField || mapper.mappingTargetField) {
                    const field = mapper.mappingTargetField || mapper.selectedField;
                    if (field.type === 'checkbox' || field.type === 'radio') {
                        mapper.placeCheckboxRadio(x, y, field);
                    } else {
                        this.setParentState(state);
                        this.setState(MapperState.DRAWING, { force: true });
                        mapper.startDrawing(x, y, event);
                    }
                    return { handled: true, action: 'startDrawing' };
                }
                break;
        }

        return { handled: false, action: null };
    }

    /**
     * Handle mousemove event
     * @private
     */
    _handleMouseMove(data) {
        const { x, y } = data;
        const state = this.currentState;
        const mapper = this.mapper;

        switch (state) {
            case MapperState.DRAWING:
                mapper.updateDrawing(x, y);
                return { handled: true, action: 'updateDrawing' };

            case MapperState.DRAGGING:
                mapper.updateDrag(x, y);
                return { handled: true, action: 'updateDrag' };

            case MapperState.RESIZING:
                mapper.updateResize(x, y);
                return { handled: true, action: 'updateResize' };

            case MapperState.TEXT_SELECTION:
                if (mapper.textSelectionStart) {
                    mapper.updateTextSelection(x, y);
                    return { handled: true, action: 'updateTextSelection' };
                }
                break;
        }

        return { handled: false, action: null };
    }

    /**
     * Handle mouseup event
     * @private
     */
    _handleMouseUp(data) {
        const { x, y } = data;
        const state = this.currentState;
        const mapper = this.mapper;

        switch (state) {
            case MapperState.DRAWING:
                // Finish drawing and return to parent state
                const parentState = this.parentState || MapperState.IDLE;
                this._finishDrawingForState(parentState, { x, y });
                return { handled: true, action: 'finishDrawing' };

            case MapperState.DRAGGING:
                mapper.finishDrag();
                this.setState(this.parentState || MapperState.IDLE, { force: true });
                this.parentState = null;
                return { handled: true, action: 'finishDrag' };

            case MapperState.RESIZING:
                mapper.finishResize();
                this.setState(this.parentState || MapperState.IDLE, { force: true });
                this.parentState = null;
                return { handled: true, action: 'finishResize' };

            case MapperState.TEXT_SELECTION:
                if (mapper.textSelectionStart) {
                    mapper.finishTextSelection();
                    return { handled: true, action: 'finishTextSelection' };
                }
                break;
        }

        return { handled: false, action: null };
    }

    /**
     * Finish drawing based on parent state
     * @private
     */
    async _finishDrawingForState(parentState, data) {
        const mapper = this.mapper;

        // Get drawing rect info
        const rect = mapper.currentDrawing;
        if (!rect) {
            this.setState(parentState, { force: true });
            this.parentState = null;
            return;
        }

        let width = parseFloat(rect.style.width) || 0;
        let height = parseFloat(rect.style.height) || 0;
        let x = parseFloat(rect.style.left) || data.x || 0;
        let y = parseFloat(rect.style.top) || data.y || 0;

        // Normalize small rectangles
        const MIN_SIZE = 24;
        if (width < MIN_SIZE) {
            x = x + width/2 - MIN_SIZE/2;
            width = MIN_SIZE;
        }
        if (height < MIN_SIZE) {
            y = y + height/2 - MIN_SIZE/2;
            height = MIN_SIZE;
        }

        const bbox = { x, y, width, height };

        // Remove drawing element
        rect.remove();
        mapper.currentDrawing = null;
        mapper.isDrawing = false;

        // Handle based on parent state
        switch (parentState) {
            case MapperState.FLOW_CAPTURE_NAME:
                // Restore state to FLOW_CAPTURE_NAME first (from DRAWING)
                // This is needed before handleSelectFieldNameRect checks the state
                this.setState(parentState, { force: true });
                this.parentState = null;
                // Capture text and transition to FLOW_CAPTURE_FIELD
                await mapper.handleSelectFieldNameRect(bbox);
                // Note: handleSelectFieldNameRect should call _continueMappingFlow
                // which will transition to FLOW_CAPTURE_FIELD
                return; // Already handled state transition

            case MapperState.FLOW_CAPTURE_FIELD:
                // Create field and loop back to FLOW_CAPTURE_NAME
                const fieldType = this.getFlowType() || 'text';
                const pendingName = this.getPendingName();

                const newField = await mapper.createUnnamedFieldFromRect(
                    bbox.x, bbox.y, bbox.width, bbox.height,
                    {
                        type: fieldType,
                        labelHe: pendingName?.text || '',
                        labelEn: pendingName?.key || '',
                        autoLabel: true,
                        autoLabelSource: pendingName?.source || 'manual',
                        isUnnamed: false,
                        skipSuggestion: true
                    }
                );

                if (newField) {
                    await mapper.renderField(newField);
                    mapper.updateFieldList();
                    mapper.selectField(newField.id, { scroll: true });
                    mapper.saveState('create_field_with_name');
                    mapper.showToast(`שדה נוצר: "${pendingName?.text || 'שדה חדש'}"`, 'success');
                }

                // Clear and loop back
                this.clearPendingName();
                this.setState(MapperState.FLOW_CAPTURE_NAME);
                break;

            case MapperState.FIELD_CREATION:
                // Check if we're in Regular Mode with a selected field
                if (mapper.mappingMode === 'regular' && window.RegularMapperEngine?.hasSelection?.()) {
                    // Regular Mode: Map the selected JSON field to this rectangle
                    const result = window.RegularMapperEngine.mapSelectedField(bbox, mapper);
                    if (result.success) {
                        // Stay in IDLE after mapping (user can select another field from sidebar)
                        this.setState(MapperState.IDLE, { force: true });
                    } else {
                        // Failed - stay in FIELD_CREATION
                        this.setState(MapperState.FIELD_CREATION, { force: true });
                    }
                } else {
                    // Quick Mode or no selection: Create unnamed field and stay in FIELD_CREATION
                    const createdField = await mapper.createUnnamedFieldFromRect(
                        bbox.x, bbox.y, bbox.width, bbox.height
                    );
                    if (createdField) {
                        // Mark as pending review for Quick Mode
                        if (mapper.mappingMode === 'quick') {
                            createdField.pendingReview = true;
                        }
                        await mapper.renderField(createdField);
                        mapper.updateFieldList();
                        mapper.selectField(createdField.id, { scroll: true });
                        mapper.saveState('create_unnamed_field');
                        mapper.showToast(`שדה נוצר: ${createdField.label_he}`, 'success');
                    }
                    this.setState(MapperState.FIELD_CREATION, { force: true });
                }
                break;

            case MapperState.TABLE_REGION:
                mapper.createTableFromRegion(bbox.x, bbox.y, bbox.width, bbox.height);
                // createTableFromRegion should transition to next state
                break;

            case MapperState.TABLE_SAMPLE_ROW:
                mapper.setSampleRow(bbox.x, bbox.y, bbox.width, bbox.height);
                // setSampleRow should transition to next state
                break;

            case MapperState.TABLE_COLUMN_MAPPING:
                mapper.addTableColumn(bbox.x, bbox.y, bbox.width, bbox.height);
                // Stay in column mapping
                this.setState(MapperState.TABLE_COLUMN_MAPPING, { force: true });
                break;

            case MapperState.GROUP_NAMING:
                mapper.handleGroupNamingRect?.(bbox);
                break;

            case MapperState.OPTION_LABELING:
                mapper.handleOptionLabelingRect?.(bbox);
                break;

            default:
                // For IDLE or unknown, try to map to existing field
                if (mapper.selectedField) {
                    mapper.mapFieldRect(mapper.selectedField, bbox);
                }
                this.setState(MapperState.IDLE, { force: true });
                break;
        }

        this.parentState = null;
    }

    /**
     * Handle keydown event
     * @private
     */
    _handleKeyDown(data) {
        const { key, event } = data;
        const state = this.currentState;
        const mapper = this.mapper;

        // ESC key - universal cancel
        if (key === 'Escape') {
            if (this.isActionAllowed('escapePressed')) {
                return this._handleEscape();
            }
        }

        // Enter key - confirm actions
        if (key === 'Enter') {
            switch (state) {
                case MapperState.GROUPING_SELECT:
                    if (this.isActionAllowed('confirmGrouping')) {
                        mapper.confirmGrouping?.();
                        return { handled: true, action: 'confirmGrouping' };
                    }
                    break;
            }
        }

        return { handled: false, action: null };
    }

    /**
     * Handle escape key
     * @private
     */
    _handleEscape() {
        const state = this.currentState;
        const mapper = this.mapper;

        // Cancel current operation and return to IDLE
        switch (state) {
            case MapperState.DRAWING:
                if (mapper.currentDrawing) {
                    mapper.currentDrawing.remove();
                    mapper.currentDrawing = null;
                }
                mapper.isDrawing = false;
                // Return to parent state or IDLE
                this.setState(this.parentState || MapperState.IDLE, { force: true });
                this.parentState = null;
                break;

            case MapperState.FLOW_CAPTURE_NAME:
            case MapperState.FLOW_CAPTURE_FIELD:
                this.clearFlowData();
                this.setState(MapperState.IDLE);
                mapper.showToast('יציאה מתהליך מיפוי', 'info');
                break;

            case MapperState.FIELD_CREATION:
            case MapperState.CHECKBOX_CREATION:
            case MapperState.RADIO_CREATION:
            case MapperState.GROUPING_SELECT:
            case MapperState.GROUP_NAMING:
            case MapperState.OPTION_LABELING:
            case MapperState.TEXT_SELECTION:
            case MapperState.TABLE_REGION:
            case MapperState.TABLE_SAMPLE_ROW:
            case MapperState.TABLE_COLUMN_MAPPING:
            case MapperState.TABLE_COLUMN_NAMING:
            case MapperState.PREVIEW:
                this.reset();
                break;

            default:
                this.reset();
                break;
        }

        return { handled: true, action: 'escapePressed' };
    }

    /**
     * Handle click event
     * @private
     */
    _handleClick(data) {
        const { x, y, target } = data;
        const state = this.currentState;

        // Most click handling is done in mousedown/mouseup
        // This is for special cases

        return { handled: false, action: null };
    }

    /**
     * Clear all flow data
     */
    clearFlowData() {
        this.flowData = {
            type: null,
            pendingName: null,
            pendingBbox: null,
            targetField: null,
            tableData: null,
            groupData: null
        };
    }

    /**
     * Set parent state for sub-states
     * @param {string} state - Parent state to return to
     */
    setParentState(state) {
        this.parentState = state;
    }
}

// ============ LEGACY COMPATIBILITY LAYER ============
// Maps old flag names to state machine states
// Use this during migration, then remove
export const LegacyFlagMapping = {
    // Old flag → new state when true
    'selectFieldNameMode': MapperState.FLOW_CAPTURE_NAME,
    'drawFieldAfterName': MapperState.FLOW_CAPTURE_FIELD,
    'fieldCreationMode': MapperState.FIELD_CREATION,
    'checkboxCreationMode': MapperState.CHECKBOX_CREATION,
    'radioCreationMode': MapperState.RADIO_CREATION,
    'groupingMode': MapperState.GROUPING_SELECT,
    'textSelectionMode': MapperState.TEXT_SELECTION,
    'tableMappingMode': MapperState.TABLE_REGION,
    'tableSelectionMode': MapperState.TABLE_REGION,
    'sampleRowSelectionMode': MapperState.TABLE_SAMPLE_ROW,
    'columnMappingMode': MapperState.TABLE_COLUMN_MAPPING,
    'optionGroupingMode': MapperState.GROUPING_SELECT,
    'optionLabelingMode': MapperState.OPTION_LABELING,
    'groupNamingMode': MapperState.GROUP_NAMING
};

// Reverse mapping: state → equivalent old flags that would be "true"
export const StateToLegacyFlags = {
    [MapperState.FLOW_CAPTURE_NAME]: ['selectFieldNameMode', 'mappingFlowActive'],
    [MapperState.FLOW_CAPTURE_FIELD]: ['drawFieldAfterName', 'mappingFlowActive'],
    [MapperState.FIELD_CREATION]: ['fieldCreationMode'],
    [MapperState.CHECKBOX_CREATION]: ['checkboxCreationMode'],
    [MapperState.RADIO_CREATION]: ['radioCreationMode'],
    [MapperState.GROUPING_SELECT]: ['groupingMode'],
    [MapperState.GROUP_NAMING]: ['groupNamingMode'],
    [MapperState.OPTION_LABELING]: ['optionLabelingMode'],
    [MapperState.TEXT_SELECTION]: ['textSelectionMode'],
    [MapperState.TABLE_REGION]: ['tableMappingMode', 'tableSelectionMode'],
    [MapperState.TABLE_SAMPLE_ROW]: ['tableMappingMode', 'sampleRowSelectionMode'],
    [MapperState.TABLE_COLUMN_MAPPING]: ['tableMappingMode', 'columnMappingMode'],
    [MapperState.TABLE_COLUMN_NAMING]: ['tableMappingMode', 'columnMappingMode']
};

// ============ EXPORTS ============
// Export for global access
if (typeof window !== 'undefined') {
    window.MapperState = MapperState;
    window.StateMachine = StateMachine;
    window.StateConfig = StateConfig;
    window.StateClusters = StateClusters;
    window.TransitionRules = TransitionRules;
    window.LegacyFlagMapping = LegacyFlagMapping;
    window.StateToLegacyFlags = StateToLegacyFlags;
}

console.log('🎛️ State Machine module loaded');
