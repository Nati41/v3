/**
 * UnifiedEventBus - Central event system for all desktop modules
 * Supports: Mapper-v3, LiveFill, Excel integration, Export
 *
 * Based on: /src/mapper-v3/core/EventBus.js
 * Created for: Phase 1 - Foundation
 *
 * Usage:
 *   import { eventBus, Events } from '../core/UnifiedEventBus.js';
 *   eventBus.on(Events.FIELD_UPDATED, (data) => { ... });
 *   eventBus.emit(Events.FIELD_UPDATED, { fieldId, value });
 */

'use strict';

export class UnifiedEventBus {
    constructor() {
        this.listeners = new Map();

        // Debug mode OFF by default - enable via console: eventBus.debugMode = true
        this.debugMode = false;

        // CRASH PROTECTION: Frame time monitoring
        this._frameCount = 0;
        this._lastFrameTime = performance.now();
        this._slowFrameCount = 0;
        this._emergencyMode = false;

        // Rate limiting
        this._emitDepth = 0;
        this._eventCounts = {};
        this._eventCountReset = Date.now();
        this._permanentStop = false;
    }

    /**
     * Check if we're in emergency mode (too many slow frames)
     * Reduces work to prevent browser crash
     * @private
     */
    _checkPerformance() {
        const now = performance.now();
        const frameTime = now - this._lastFrameTime;
        this._lastFrameTime = now;
        this._frameCount++;

        // Count slow frames (>100ms = less than 10fps)
        if (frameTime > 100) {
            this._slowFrameCount++;
            if (this._slowFrameCount > 5 && !this._emergencyMode) {
                console.warn('[UnifiedEventBus] EMERGENCY MODE: Too many slow frames detected');
                this._emergencyMode = true;
                // Reset after 2 seconds
                setTimeout(() => {
                    this._emergencyMode = false;
                    this._slowFrameCount = 0;
                    console.log('[UnifiedEventBus] Emergency mode cleared');
                }, 2000);
            }
        } else if (this._slowFrameCount > 0) {
            this._slowFrameCount--;
        }

        return this._emergencyMode;
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
     * Emit an event to all listeners
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data = null) {
        // Permanent stop check
        if (this._permanentStop) {
            return;
        }

        // CRASH PROTECTION: Event cascade detection
        this._emitDepth++;
        if (this._emitDepth > 50) {
            console.error(`[UnifiedEventBus] CRITICAL: Event cascade detected! Depth: ${this._emitDepth}, Event: ${event}`);
            this._emitDepth--;
            return;
        }

        // CRASH PROTECTION: Rate limiting per event type
        const now = Date.now();

        // Reset counts every second
        if (now - this._eventCountReset > 1000) {
            this._eventCounts = {};
            this._eventCountReset = now;
        }

        this._eventCounts[event] = (this._eventCounts[event] || 0) + 1;

        // Events allowed to exceed rate limit (bulk operations)
        const highVolumeAllowed = [
            'quickFill:boxCreated',
            'quickFill:boxUpdated',
            'field:created',
            'field:updated',
            'livefill:valueChanged'
        ];

        if (this._eventCounts[event] > 100 && !highVolumeAllowed.includes(event)) {
            console.error(`[UnifiedEventBus] CRITICAL: Event ${event} fired ${this._eventCounts[event]} times/sec!`);
            this._emitDepth--;
            return;
        }

        // CRASH PROTECTION: Check frame performance
        const inEmergency = this._checkPerformance();

        // In emergency mode, skip non-critical events
        if (inEmergency) {
            const criticalEvents = [
                // Core field events
                'field:created', 'field:deleted', 'field:updated',
                // PDF events
                'pdf:loaded', 'pdf:pageChanged', 'pdf:error',
                // State events
                'state:changed', 'history:undo', 'history:redo',
                // Export events
                'export:started', 'export:done', 'export:error',
                // LiveFill critical
                'livefill:exportStarted', 'livefill:exportDone',
                // UI
                'toast:show'
            ];
            if (!criticalEvents.includes(event)) {
                this._emitDepth--;
                return;
            }
        }

        if (this.debugMode) {
            console.log(`[UnifiedEventBus] ${event}`, data);
        }

        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[UnifiedEventBus] Error in handler for ${event}:`, error);
                }
            });
        }

        this._emitDepth--;
    }

    /**
     * Clear all listeners
     */
    clear() {
        this.listeners.clear();
    }

    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    listenerCount(event) {
        return this.listeners.has(event) ? this.listeners.get(event).size : 0;
    }

    /**
     * Check if event has any listeners
     * @param {string} event - Event name
     * @returns {boolean}
     */
    hasListeners(event) {
        return this.listenerCount(event) > 0;
    }
}

/**
 * Event name constants - prevents typos and enables autocomplete
 */
export const Events = {
    // ============ PDF DOCUMENT EVENTS ============
    PDF_LOADED: 'pdf:loaded',                    // { pdfName, pageCount, pdfJsDoc, pdfBytes }
    PDF_PAGE_CHANGED: 'pdf:pageChanged',         // { page, oldPage }
    PDF_ERROR: 'pdf:error',                      // { error }
    PDF_UNLOADED: 'pdf:unloaded',                // {}

    // ============ FIELD EVENTS ============
    FIELD_CREATED: 'field:created',              // { field }
    FIELD_UPDATED: 'field:updated',              // { field, changes }
    FIELD_DELETED: 'field:deleted',              // { field }
    FIELD_SELECTED: 'field:selected',            // { fieldId }
    FIELD_DESELECTED: 'field:deselected',        // { fieldId }
    FIELD_MOVED: 'field:moved',                  // { fieldId, oldBbox, newBbox }
    FIELD_RESIZED: 'field:resized',              // { fieldId, oldBbox, newBbox }
    FIELD_MAPPED: 'field:mapped',                // { fieldId, bbox, page }
    FIELD_LOCATE: 'field:locate',                // { fieldId }
    FIELD_REVIEW_REQUESTED: 'field:reviewRequested', // {}
    FIELDS_CHANGED: 'fields:changed',            // { fields }

    // ============ STATE EVENTS ============
    STATE_CHANGED: 'state:changed',              // { path, value, oldValue }
    HISTORY_PUSH: 'history:push',                // { index }
    HISTORY_UNDO: 'history:undo',                // { index }
    HISTORY_REDO: 'history:redo',                // { index }

    // ============ LIVEFILL EVENTS ============
    LIVEFILL_VALUE_CHANGED: 'livefill:valueChanged',     // { fieldId, value, checked }
    LIVEFILL_DATA_LOADED: 'livefill:dataLoaded',         // { liveFillData }
    LIVEFILL_DATA_CLEARED: 'livefill:dataCleared',       // {}
    LIVEFILL_EXPORT_STARTED: 'livefill:exportStarted',   // {}
    LIVEFILL_EXPORT_DONE: 'livefill:exportDone',         // { blob, fileName }
    LIVEFILL_EXPORT_ERROR: 'livefill:exportError',       // { error }

    // ============ EXCEL EVENTS ============
    EXCEL_LOADED: 'excel:loaded',                // { fileName, sheetName, rowCount, data }
    EXCEL_MATCHED: 'excel:matched',              // { matchedFields, unmatchedFields }
    EXCEL_APPLIED: 'excel:applied',              // { fieldCount }
    EXCEL_CLEARED: 'excel:cleared',              // {}
    EXCEL_ERROR: 'excel:error',                  // { error }

    // ============ EXPORT EVENTS ============
    EXPORT_STARTED: 'export:started',            // {}
    EXPORT_PROGRESS: 'export:progress',          // { current, total, stage }
    EXPORT_DONE: 'export:done',                  // { blob, fileName }
    EXPORT_ERROR: 'export:error',                // { error }
    EXPORT_BLOCKED: 'export:blocked',            // { errors, warnings }

    // ============ MAPPING EVENTS ============
    MAPPING_LOADED: 'mapping:loaded',            // { fieldsMapping }
    MAPPING_SAVED: 'mapping:saved',              // { fileName }
    MAPPING_CLEARED: 'mapping:cleared',          // {}
    MAPPING_PROGRESS_CHANGED: 'mapping:progressChanged', // { mapped, total, percentage }

    // ============ UI EVENTS ============
    TOAST_SHOW: 'toast:show',                    // { message, type, duration }
    OVERLAY_RENDER: 'overlay:render',            // { fields, page }
    SIDEBAR_UPDATE: 'sidebar:update',            // { section, data }
    MODAL_OPEN: 'modal:open',                    // { modalId, data }
    MODAL_CLOSE: 'modal:close',                  // { modalId }

    // ============ VIEW EVENTS ============
    ZOOM_CHANGED: 'zoom:changed',                // { zoom, oldZoom }
    PAN_CHANGED: 'pan:changed',                  // { panX, panY }
    VIEW_RESET: 'view:reset',                    // {}

    // ============ MODE EVENTS ============
    MODE_CHANGED: 'mode:changed',                // { mode, oldMode }
    TOOL_CHANGED: 'tool:changed',                // { tool }

    // ============ RADIO GROUP EVENTS ============
    RADIO_GROUP_CREATED: 'radioGroup:created',   // { group }
    RADIO_GROUP_UPDATED: 'radioGroup:updated',   // { group }
    RADIO_GROUP_DELETED: 'radioGroup:deleted',   // { group }
    RADIO_GROUP_BUILDING_STARTED: 'radioGroup:buildingStarted',
    RADIO_GROUP_BUILDING_STEP: 'radioGroup:buildingStep',
    RADIO_GROUP_OPTION_ADDED: 'radioGroup:optionAdded',
    RADIO_GROUP_BUILDING_FINISHED: 'radioGroup:buildingFinished',
    RADIO_GROUP_BUILDING_CANCELLED: 'radioGroup:buildingCancelled',

    // ============ TABLE EVENTS ============
    TABLE_CREATED: 'table:created',              // { table }
    TABLE_UPDATED: 'table:updated',              // { table }
    TABLE_DELETED: 'table:deleted',              // { table }
    TABLE_FLOW_STARTED: 'table:flowStarted',
    TABLE_FLOW_STEP_CHANGED: 'table:stepChanged',
    TABLE_FLOW_FINISHED: 'table:flowFinished',
    TABLE_FLOW_CANCELLED: 'table:flowCancelled',

    // ============ DRAWING EVENTS ============
    DRAW_START: 'draw:start',                    // { x, y, tool }
    DRAW_UPDATE: 'draw:update',                  // { x, y, width, height }
    DRAW_END: 'draw:end',                        // { bbox }
    DRAW_CANCEL: 'draw:cancel',                  // {}
    RECTANGLE_DRAWN: 'draw:rectangleDrawn',      // { bbox }

    // ============ TEMPLATE EVENTS ============
    TEMPLATE_LOADED: 'template:loaded',
    TEMPLATE_CLEARED: 'template:cleared',
    TEMPLATE_LOCKED: 'template:locked',
    TEMPLATE_FIELD_MAPPED: 'template:fieldMapped',
    NEXT_UNMAPPED_ACTIVATED: 'template:nextUnmappedActivated',

    // ============ QUICK FILL EVENTS ============
    QUICK_FILL_MODE_CHANGED: 'quickFill:modeChanged',
    QUICK_FILL_BOX_CREATED: 'quickFill:boxCreated',
    QUICK_FILL_BOX_UPDATED: 'quickFill:boxUpdated',
    QUICK_FILL_BOX_DELETED: 'quickFill:boxDeleted',
    QUICK_FILL_CLEAR_ALL: 'quickFill:clearAll',

    // ============ VALIDATION EVENTS ============
    VALIDATION_ERROR: 'validation:error',        // { fieldId, errors, action }
    VALIDATION_WARNING: 'validation:warning',    // { fieldId, warnings, action }

    // ============ SAVE/LOAD EVENTS ============
    PROJECT_SAVE: 'project:save',                // { data }
    PROJECT_LOAD: 'project:load',                // { data }
    AUTOSAVE_TRIGGER: 'autosave:trigger',        // {}

    // ============ INTENT EVENTS ============
    INTENT_CHANGED: 'intent:changed'             // { type, targetId, fieldType, source, context }
};

// Singleton instance
export const eventBus = new UnifiedEventBus();

// Debug utilities (browser only)
if (typeof window !== 'undefined') {
    /**
     * Get event statistics - call window.eventBusStats() in console
     */
    window.unifiedEventBusStats = () => {
        const stats = eventBus._eventCounts || {};
        console.table(Object.entries(stats).sort((a, b) => b[1] - a[1]));
        console.log('Emit depth:', eventBus._emitDepth || 0);
        console.log('Emergency mode:', eventBus._emergencyMode);
        console.log('Listener counts:');
        eventBus.listeners.forEach((listeners, event) => {
            if (listeners.size > 0) {
                console.log(`  ${event}: ${listeners.size}`);
            }
        });
        return stats;
    };

    /**
     * Emergency stop - call window.emergencyStopEventBus() to halt all events
     */
    window.emergencyStopEventBus = () => {
        eventBus._emergencyMode = true;
        eventBus._permanentStop = true;
        console.error('[UnifiedEventBus] EMERGENCY STOP ACTIVATED - all events blocked');
    };

    /**
     * Resume events after emergency stop
     */
    window.resumeEventBus = () => {
        eventBus._emergencyMode = false;
        eventBus._permanentStop = false;
        eventBus._slowFrameCount = 0;
        console.log('[UnifiedEventBus] Events resumed');
    };

    // Expose for debugging
    window.unifiedEventBus = eventBus;
}
