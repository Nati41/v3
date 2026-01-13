/**
 * IntentManager.js - Unified Intent Management for Drawing Operations
 * Version 1.0
 *
 * This module provides a single source of truth for "what should happen
 * when the user finishes drawing a rectangle".
 *
 * REPLACES:
 * - pendingFieldId (DrawController)
 * - selectedForMapping (SidebarController)
 * - activeTemplateTarget (SidebarController)
 * - templateStore.isLoaded() checks
 * - fieldIntelligenceStore.getCurrent() checks
 * - radioGroupBuilder.active checks
 * - TableState internal state machine
 * - ui.checkboxMode, ui.labelDrawMode flags
 *
 * USAGE:
 * 1. Source (sidebar, AI, import) calls: intentManager.setIntent(...)
 * 2. DrawController checks: intentManager.getIntent()
 * 3. After handling: intentManager.clearIntent()
 */

import { eventBus, Events } from './EventBus.js';

// ============================================================
// INTENT TYPES - All possible drawing intentions
// ============================================================

export const IntentType = {
    // === Field Operations ===
    CREATE_FIELD: 'create_field',      // Create new field (needs name dialog)
    PLACE_FIELD: 'place_field',        // Position existing field (has ID)

    // === Group Operations (Radio/Checkbox) ===
    CAPTURE_GROUP_TITLE: 'capture_group_title',  // Draw rect on group title
    ADD_GROUP_OPTION: 'add_group_option',        // Click/draw on option circle

    // === Table Operations ===
    DEFINE_TABLE_ROW: 'define_table_row',        // Draw the first row
    DEFINE_TABLE_COLUMN: 'define_table_column',  // Draw column divider

    // === Special Operations ===
    CAPTURE_LABEL: 'capture_label',    // OCR capture for label text

    // === No Intent ===
    NONE: 'none'  // Select mode - no drawing intent
};

// ============================================================
// INTENT SOURCE - Where the intent came from
// ============================================================

export const IntentSource = {
    MANUAL: 'manual',           // User clicked draw tool
    SIDEBAR: 'sidebar',         // User clicked field in sidebar
    IMPORT: 'import',           // From JSON import
    AI_GUIDED: 'ai_guided',     // From AI guided mapping
    TEMPLATE: 'template',       // From template mode
    TABLE_BUILDER: 'table_builder',     // From table creation flow
    GROUP_BUILDER: 'group_builder'      // From radio/checkbox builder
};

// ============================================================
// INTENT MANAGER CLASS
// ============================================================

class IntentManager {
    constructor() {
        /**
         * Current active intent
         * @type {DrawIntent}
         */
        this._currentIntent = this._createEmptyIntent();

        /**
         * Intent history for debugging
         * @type {Array<DrawIntent>}
         */
        this._history = [];
        this._maxHistorySize = 20;

        /**
         * Listeners for intent changes
         * @type {Set<Function>}
         */
        this._listeners = new Set();

        console.log('[IntentManager] Initialized');
    }

    // ============================================================
    // CORE METHODS
    // ============================================================

    /**
     * Set a new drawing intent
     * @param {Partial<DrawIntent>} intent - Intent configuration
     */
    setIntent(intent) {
        // Validate type
        if (!intent.type || !Object.values(IntentType).includes(intent.type)) {
            console.error('[IntentManager] Invalid intent type:', intent.type);
            return;
        }

        // Build full intent object
        const fullIntent = {
            type: intent.type,
            targetId: intent.targetId || null,
            fieldType: intent.fieldType || 'text',
            source: intent.source || IntentSource.MANUAL,
            context: intent.context || {},
            timestamp: Date.now()
        };

        // Store previous for history
        if (this._currentIntent.type !== IntentType.NONE) {
            this._addToHistory(this._currentIntent);
        }

        // Set new intent
        this._currentIntent = fullIntent;

        // Notify listeners
        this._notifyListeners();

        // Emit event
        eventBus.emit(Events.INTENT_CHANGED, fullIntent);

        console.log('[IntentManager] Intent set:', fullIntent.type,
            fullIntent.targetId ? `(target: ${fullIntent.targetId})` : '',
            `[${fullIntent.source}]`);
    }

    /**
     * Get current intent
     * @returns {DrawIntent}
     */
    getIntent() {
        return this._currentIntent;
    }

    /**
     * Get intent type (shorthand)
     * @returns {string}
     */
    getType() {
        return this._currentIntent.type;
    }

    /**
     * Clear current intent (back to NONE)
     */
    clearIntent() {
        if (this._currentIntent.type !== IntentType.NONE) {
            this._addToHistory(this._currentIntent);
            this._currentIntent = this._createEmptyIntent();
            this._notifyListeners();
            eventBus.emit(Events.INTENT_CHANGED, this._currentIntent);
            console.log('[IntentManager] Intent cleared');
        }
    }

    /**
     * Check if there's an active intent
     * @returns {boolean}
     */
    hasActiveIntent() {
        return this._currentIntent.type !== IntentType.NONE;
    }

    /**
     * Check if current intent is of specific type
     * @param {string} type - IntentType value
     * @returns {boolean}
     */
    isType(type) {
        return this._currentIntent.type === type;
    }

    /**
     * Check if current intent is for placing a field
     * @returns {boolean}
     */
    isPlacingField() {
        return this._currentIntent.type === IntentType.PLACE_FIELD;
    }

    /**
     * Check if current intent is for creating a field
     * @returns {boolean}
     */
    isCreatingField() {
        return this._currentIntent.type === IntentType.CREATE_FIELD;
    }

    /**
     * Check if current intent is table-related
     * @returns {boolean}
     */
    isTableOperation() {
        return this._currentIntent.type === IntentType.DEFINE_TABLE_ROW ||
               this._currentIntent.type === IntentType.DEFINE_TABLE_COLUMN;
    }

    /**
     * Check if current intent is group-related
     * @returns {boolean}
     */
    isGroupOperation() {
        return this._currentIntent.type === IntentType.ADD_GROUP_OPTION ||
               this._currentIntent.type === IntentType.CAPTURE_GROUP_TITLE;
    }

    // ============================================================
    // FACTORY METHODS - Easy intent creation
    // ============================================================

    /**
     * Create intent to place an existing field
     * @param {string} fieldId - Field ID to place
     * @param {string} source - IntentSource value
     * @param {Object} context - Additional context
     * @returns {DrawIntent}
     */
    static placeField(fieldId, source = IntentSource.SIDEBAR, context = {}) {
        return {
            type: IntentType.PLACE_FIELD,
            targetId: fieldId,
            source,
            context
        };
    }

    /**
     * Create intent to create a new field
     * @param {string} fieldType - 'text' | 'checkbox' | 'radio'
     * @param {Object} context - Pre-filled field data (label_he, etc.)
     * @returns {DrawIntent}
     */
    static createField(fieldType = 'text', context = {}) {
        return {
            type: IntentType.CREATE_FIELD,
            fieldType,
            source: IntentSource.MANUAL,
            context
        };
    }

    /**
     * Create intent to capture group title
     * @param {string} groupType - 'radio' | 'checkbox'
     * @param {string} builderId - Group builder ID
     * @returns {DrawIntent}
     */
    static captureGroupTitle(groupType, builderId) {
        return {
            type: IntentType.CAPTURE_GROUP_TITLE,
            targetId: builderId,
            fieldType: groupType,
            source: IntentSource.GROUP_BUILDER,
            context: { groupType }
        };
    }

    /**
     * Create intent to add option to group
     * @param {string} builderId - Group builder ID
     * @param {number} optionNumber - Option number (1, 2, 3...)
     * @param {string} groupType - 'radio' | 'checkbox'
     * @returns {DrawIntent}
     */
    static addGroupOption(builderId, optionNumber, groupType = 'radio') {
        return {
            type: IntentType.ADD_GROUP_OPTION,
            targetId: builderId,
            fieldType: groupType,
            source: IntentSource.GROUP_BUILDER,
            context: { optionNumber, groupType }
        };
    }

    /**
     * Create intent to define table row
     * @param {string} tableId - Table ID
     * @param {Object} tableConfig - Table configuration
     * @returns {DrawIntent}
     */
    static defineTableRow(tableId, tableConfig = {}) {
        return {
            type: IntentType.DEFINE_TABLE_ROW,
            targetId: tableId,
            source: IntentSource.TABLE_BUILDER,
            context: tableConfig
        };
    }

    /**
     * Create intent to define table column
     * @param {string} tableId - Table ID
     * @param {number} columnIndex - Column index
     * @param {Object} columnConfig - Column configuration
     * @returns {DrawIntent}
     */
    static defineTableColumn(tableId, columnIndex, columnConfig = {}) {
        return {
            type: IntentType.DEFINE_TABLE_COLUMN,
            targetId: tableId,
            source: IntentSource.TABLE_BUILDER,
            context: { columnIndex, ...columnConfig }
        };
    }

    /**
     * Create intent to capture label text
     * @param {string} targetId - Field or group to attach label to
     * @returns {DrawIntent}
     */
    static captureLabel(targetId) {
        return {
            type: IntentType.CAPTURE_LABEL,
            targetId,
            source: IntentSource.MANUAL
        };
    }

    // ============================================================
    // LISTENER MANAGEMENT
    // ============================================================

    /**
     * Add listener for intent changes
     * @param {Function} callback - Called with new intent
     * @returns {Function} Unsubscribe function
     */
    onIntentChange(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    /**
     * Notify all listeners
     */
    _notifyListeners() {
        for (const listener of this._listeners) {
            try {
                listener(this._currentIntent);
            } catch (e) {
                console.error('[IntentManager] Listener error:', e);
            }
        }
    }

    // ============================================================
    // HISTORY & DEBUGGING
    // ============================================================

    /**
     * Add intent to history
     */
    _addToHistory(intent) {
        this._history.push({ ...intent, endTime: Date.now() });
        if (this._history.length > this._maxHistorySize) {
            this._history.shift();
        }
    }

    /**
     * Get intent history (for debugging)
     * @returns {Array<DrawIntent>}
     */
    getHistory() {
        return [...this._history];
    }

    /**
     * Get debug info as string
     * @returns {string}
     */
    getDebugInfo() {
        const intent = this._currentIntent;
        return `Intent: ${intent.type}` +
               (intent.targetId ? ` | Target: ${intent.targetId}` : '') +
               (intent.fieldType !== 'text' ? ` | FieldType: ${intent.fieldType}` : '') +
               ` | Source: ${intent.source}`;
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    /**
     * Create empty intent object
     * @returns {DrawIntent}
     */
    _createEmptyIntent() {
        return {
            type: IntentType.NONE,
            targetId: null,
            fieldType: 'text',
            source: IntentSource.MANUAL,
            context: {},
            timestamp: Date.now()
        };
    }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const intentManager = new IntentManager();

// ============================================================
// TYPE DEFINITIONS (for documentation)
// ============================================================

/**
 * @typedef {Object} DrawIntent
 * @property {string} type - IntentType value
 * @property {string|null} targetId - ID of target field/group/table
 * @property {string} fieldType - 'text' | 'checkbox' | 'radio'
 * @property {string} source - IntentSource value
 * @property {Object} context - Additional context data
 * @property {number} timestamp - When intent was set
 */

// Make available globally for debugging
if (typeof window !== 'undefined') {
    window.intentManager = intentManager;
    window.IntentType = IntentType;
    window.IntentSource = IntentSource;
}
