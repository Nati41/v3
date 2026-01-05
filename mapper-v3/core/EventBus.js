/**
 * EventBus - Central event system for Mapper V3
 * All module communication goes through here.
 * No direct dependencies between modules.
 */
export class EventBus {
    constructor() {
        this.listeners = new Map();
        this.debugMode = true;
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event (one-time)
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    once(event, callback) {
        const wrapper = (data) => {
            this.off(event, wrapper);
            callback(data);
        };
        this.on(event, wrapper);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data = null) {
        if (this.debugMode) {
            console.log(`[EventBus] ${event}`, data);
        }

        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[EventBus] Error in handler for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Clear all listeners
     */
    clear() {
        this.listeners.clear();
    }
}

// Event name constants - prevents typos
export const Events = {
    // Document events
    PDF_LOADED: 'pdf:loaded',
    PDF_PAGE_CHANGED: 'pdf:pageChanged',
    PDF_ERROR: 'pdf:error',

    // Field events
    FIELD_CREATED: 'field:created',
    FIELD_SELECTED: 'field:selected',
    FIELD_DESELECTED: 'field:deselected',
    FIELD_UPDATED: 'field:updated',
    FIELD_DELETED: 'field:deleted',
    FIELD_MOVED: 'field:moved',
    FIELD_RESIZED: 'field:resized',

    // Radio Group events (V2 compatibility)
    RADIO_GROUP_CREATED: 'radioGroup:created',
    RADIO_GROUP_UPDATED: 'radioGroup:updated',
    RADIO_GROUP_DELETED: 'radioGroup:deleted',

    // Radio group builder events
    RADIO_GROUP_BUILDING_STARTED: 'radioGroup:buildingStarted',
    RADIO_GROUP_BUILDING_STEP: 'radioGroup:buildingStep',
    RADIO_GROUP_OPTION_ADDED: 'radioGroup:optionAdded',
    RADIO_GROUP_BUILDING_FINISHED: 'radioGroup:buildingFinished',
    RADIO_GROUP_BUILDING_CANCELLED: 'radioGroup:buildingCancelled',

    // Table events (V2 compatibility)
    TABLE_CREATED: 'table:created',
    TABLE_UPDATED: 'table:updated',
    TABLE_DELETED: 'table:deleted',

    // Table flow events (for TableFlowController)
    TABLE_FLOW_STARTED: 'table:flowStarted',
    TABLE_FLOW_STEP_CHANGED: 'table:stepChanged',
    TABLE_FLOW_FINISHED: 'table:flowFinished',
    TABLE_FLOW_CANCELLED: 'table:flowCancelled',

    // Table UI control events (for UI components to listen to)
    TABLE_UI_LOCK_NEXT: 'table:ui:lockNext',
    TABLE_UI_UNLOCK_NEXT: 'table:ui:unlockNext',
    TABLE_UI_MESSAGE: 'table:ui:message',
    TABLE_UI_UPDATE_COLUMNS: 'table:ui:updateColumns',
    TABLE_UI_SHOW_SUMMARY: 'table:ui:showSummary',

    // Table overlay events (for overlay renderer to listen to)
    TABLE_OVERLAY_SHOW_HEADER: 'table:overlay:showHeader',
    TABLE_OVERLAY_SHOW_SAMPLE_ROW: 'table:overlay:showSampleRow',
    TABLE_OVERLAY_SHOW_COLUMN: 'table:overlay:showColumn',
    TABLE_OVERLAY_SHOW_ROW_HINT: 'table:overlay:showRowHint',
    TABLE_OVERLAY_SHOW_PREVIEW: 'table:overlay:showPreview',
    TABLE_OVERLAY_CLEAR_TEMP: 'table:overlay:clearTemp',
    TABLE_OVERLAY_CLEAR_COLUMNS: 'table:overlay:clearColumns',
    TABLE_OVERLAY_CLEAR_ALL: 'table:overlay:clearAll',
    TABLE_OVERLAY_HIGHLIGHT_AREA: 'table:overlay:highlightArea',

    // Table column management events
    TABLE_PROMPT_COLUMN_DETAILS: 'table:promptColumnDetails',
    TABLE_COLUMN_DETAILS_RESULT: 'table:columnDetailsResult',

    // Drawing events
    DRAW_START: 'draw:start',
    DRAW_UPDATE: 'draw:update',
    DRAW_END: 'draw:end',
    DRAW_CANCEL: 'draw:cancel',

    // Mode events
    MODE_CHANGED: 'mode:changed',
    TOOL_CHANGED: 'tool:changed',

    // UI events
    SIDEBAR_UPDATE: 'sidebar:update',
    OVERLAY_RENDER: 'overlay:render',
    TOAST_SHOW: 'toast:show',

    // State events
    STATE_CHANGED: 'state:changed',
    HISTORY_PUSH: 'history:push',
    HISTORY_UNDO: 'history:undo',
    HISTORY_REDO: 'history:redo',

    // Zoom/Pan events
    ZOOM_CHANGED: 'zoom:changed',
    PAN_CHANGED: 'pan:changed',
    VIEW_RESET: 'view:reset',

    // Save/Load events
    PROJECT_SAVE: 'project:save',
    PROJECT_LOAD: 'project:load',
    AUTOSAVE_TRIGGER: 'autosave:trigger'
};

// Singleton instance
export const eventBus = new EventBus();
