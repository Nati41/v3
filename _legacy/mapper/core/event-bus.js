/**
 * EventBus - Central Event Communication System
 *
 * Phase 5 Architecture: All inter-layer communication goes through EventBus
 *
 * This creates full decoupling between:
 * - State Layer (StateMachine)
 * - Logic Layer (mapping-flow, table-logic, etc.)
 * - UI Layer (overlays, sidebar, preview)
 * - Interaction Layer (drag-engine, events)
 *
 * @version 1.0.0
 * @author Claude Code - Phase 5
 */

(function() {
    'use strict';

    // ============ EVENT TYPES ============
    // Canonical list of all events in the system
    const EventTypes = Object.freeze({
        // State Events
        STATE_CHANGE: 'stateChange',
        STATE_TRANSITION_BLOCKED: 'stateTransitionBlocked',
        STATE_ERROR: 'stateError',

        // Flow Events
        FLOW_START: 'flowStart',
        FLOW_STEP_CHANGE: 'flowStepChange',
        FLOW_COMPLETE: 'flowComplete',
        FLOW_CANCEL: 'flowCancel',

        // Name/Text Capture Events
        NAME_CAPTURED: 'nameCaptured',
        TEXT_SELECTED: 'textSelected',

        // Field Events
        BBOX_DRAWN: 'bboxDrawn',
        FIELD_CREATED: 'fieldCreated',
        FIELD_UPDATED: 'fieldUpdated',
        FIELD_DELETED: 'fieldDeleted',
        FIELD_SELECTED: 'fieldSelected',
        FIELD_DESELECTED: 'fieldDeselected',

        // Interaction Events
        DRAWING_START: 'drawingStart',
        DRAWING_UPDATE: 'drawingUpdate',
        DRAWING_FINISH: 'drawingFinish',
        DRAWING_CANCEL: 'drawingCancel',

        DRAG_START: 'dragStart',
        DRAG_UPDATE: 'dragUpdate',
        DRAG_FINISH: 'dragFinish',

        RESIZE_START: 'resizeStart',
        RESIZE_UPDATE: 'resizeUpdate',
        RESIZE_FINISH: 'resizeFinish',

        // Table Events
        TABLE_REGION_DEFINED: 'tableRegionDefined',
        TABLE_SAMPLE_ROW_SET: 'tableSampleRowSet',
        TABLE_COLUMN_ADDED: 'tableColumnAdded',
        TABLE_COLUMN_NAMED: 'tableColumnNamed',
        TABLE_COMPLETE: 'tableComplete',

        // Grouping Events
        GROUP_SELECTION_START: 'groupSelectionStart',
        GROUP_FIELD_TOGGLED: 'groupFieldToggled',
        GROUP_CREATED: 'groupCreated',
        GROUP_NAMED: 'groupNamed',
        OPTION_LABELED: 'optionLabeled',

        // UI Events
        UI_BADGE_UPDATE: 'uiBadgeUpdate',
        UI_STATUS_UPDATE: 'uiStatusUpdate',
        UI_CURSOR_UPDATE: 'uiCursorUpdate',
        UI_OVERLAY_UPDATE: 'uiOverlayUpdate',
        UI_SIDEBAR_UPDATE: 'uiSidebarUpdate',

        // Document Events
        DOCUMENT_LOADED: 'documentLoaded',
        PAGE_CHANGED: 'pageChanged',
        PROJECT_SAVED: 'projectSaved',
        PROJECT_LOADED: 'projectLoaded',

        // Escape/Cancel
        ESCAPE_PRESSED: 'escapePressed',
        CANCEL_REQUESTED: 'cancelRequested'
    });

    // ============ EVENT BUS CLASS ============
    class EventBus {
        constructor() {
            this._listeners = new Map();
            this._onceListeners = new Map();
            this._eventLog = [];
            this._maxLogSize = 100;
            this._debugMode = false;
            this._paused = false;
            this._queuedEvents = [];

            console.log('📡 EventBus initialized');
        }

        // ============ CORE METHODS ============

        /**
         * Subscribe to an event
         * @param {string} eventName - Event name from EventTypes
         * @param {Function} handler - Callback function(payload)
         * @param {Object} options - { priority: number, context: any }
         * @returns {Function} Unsubscribe function
         */
        subscribe(eventName, handler, options = {}) {
            if (typeof handler !== 'function') {
                console.error('[EventBus] Handler must be a function');
                return () => {};
            }

            const { priority = 0, context = null } = options;

            if (!this._listeners.has(eventName)) {
                this._listeners.set(eventName, []);
            }

            const subscription = {
                handler,
                priority,
                context,
                id: this._generateId()
            };

            const listeners = this._listeners.get(eventName);
            listeners.push(subscription);

            // Sort by priority (higher first)
            listeners.sort((a, b) => b.priority - a.priority);

            if (this._debugMode) {
                console.log(`[EventBus] Subscribed to ${eventName} (priority: ${priority})`);
            }

            // Return unsubscribe function
            return () => this._removeListener(eventName, subscription.id);
        }

        /**
         * Subscribe to an event only once
         * @param {string} eventName - Event name
         * @param {Function} handler - Callback function
         * @returns {Function} Unsubscribe function
         */
        once(eventName, handler) {
            if (!this._onceListeners.has(eventName)) {
                this._onceListeners.set(eventName, []);
            }

            const subscription = {
                handler,
                id: this._generateId()
            };

            this._onceListeners.get(eventName).push(subscription);

            return () => this._removeOnceListener(eventName, subscription.id);
        }

        /**
         * Emit an event
         * @param {string} eventName - Event name
         * @param {any} payload - Event data
         * @returns {Object} { handled: boolean, results: any[] }
         */
        emit(eventName, payload = {}) {
            // If paused, queue the event
            if (this._paused) {
                this._queuedEvents.push({ eventName, payload, timestamp: Date.now() });
                return { handled: false, queued: true };
            }

            const results = [];
            let handled = false;

            // Add metadata to payload
            const eventPayload = {
                ...payload,
                _eventName: eventName,
                _timestamp: Date.now()
            };

            // Log event
            this._logEvent(eventName, payload);

            if (this._debugMode) {
                console.log(`[EventBus] EMIT: ${eventName}`, payload);
            }

            // Call regular listeners
            const listeners = this._listeners.get(eventName) || [];
            for (const { handler, context } of listeners) {
                try {
                    const result = context ? handler.call(context, eventPayload) : handler(eventPayload);
                    results.push(result);
                    handled = true;
                } catch (error) {
                    console.error(`[EventBus] Error in handler for ${eventName}:`, error);
                }
            }

            // Call once listeners (and remove them)
            const onceListeners = this._onceListeners.get(eventName) || [];
            for (const { handler } of onceListeners) {
                try {
                    const result = handler(eventPayload);
                    results.push(result);
                    handled = true;
                } catch (error) {
                    console.error(`[EventBus] Error in once handler for ${eventName}:`, error);
                }
            }
            this._onceListeners.delete(eventName);

            return { handled, results };
        }

        /**
         * Emit an event and wait for all async handlers
         * @param {string} eventName - Event name
         * @param {any} payload - Event data
         * @returns {Promise<Object>} { handled: boolean, results: any[] }
         */
        async emitAsync(eventName, payload = {}) {
            const results = [];
            let handled = false;

            const eventPayload = {
                ...payload,
                _eventName: eventName,
                _timestamp: Date.now()
            };

            this._logEvent(eventName, payload);

            if (this._debugMode) {
                console.log(`[EventBus] EMIT ASYNC: ${eventName}`, payload);
            }

            // Call regular listeners
            const listeners = this._listeners.get(eventName) || [];
            const promises = listeners.map(async ({ handler, context }) => {
                try {
                    const result = context ? await handler.call(context, eventPayload) : await handler(eventPayload);
                    results.push(result);
                    handled = true;
                } catch (error) {
                    console.error(`[EventBus] Async error in handler for ${eventName}:`, error);
                }
            });

            // Call once listeners
            const onceListeners = this._onceListeners.get(eventName) || [];
            const oncePromises = onceListeners.map(async ({ handler }) => {
                try {
                    const result = await handler(eventPayload);
                    results.push(result);
                    handled = true;
                } catch (error) {
                    console.error(`[EventBus] Async error in once handler for ${eventName}:`, error);
                }
            });
            this._onceListeners.delete(eventName);

            await Promise.all([...promises, ...oncePromises]);

            return { handled, results };
        }

        /**
         * Unsubscribe a handler from an event
         * @param {string} eventName - Event name
         * @param {Function} handler - Handler to remove
         */
        unsubscribe(eventName, handler) {
            const listeners = this._listeners.get(eventName);
            if (listeners) {
                const index = listeners.findIndex(l => l.handler === handler);
                if (index !== -1) {
                    listeners.splice(index, 1);
                    if (this._debugMode) {
                        console.log(`[EventBus] Unsubscribed from ${eventName}`);
                    }
                }
            }
        }

        /**
         * Remove all listeners for an event
         * @param {string} eventName - Event name (optional - removes all if not provided)
         */
        clear(eventName = null) {
            if (eventName) {
                this._listeners.delete(eventName);
                this._onceListeners.delete(eventName);
            } else {
                this._listeners.clear();
                this._onceListeners.clear();
            }
        }

        // ============ CONTROL METHODS ============

        /**
         * Pause event emission (events will be queued)
         */
        pause() {
            this._paused = true;
            if (this._debugMode) {
                console.log('[EventBus] Paused - events will be queued');
            }
        }

        /**
         * Resume event emission and emit queued events
         */
        resume() {
            this._paused = false;
            if (this._debugMode) {
                console.log(`[EventBus] Resumed - emitting ${this._queuedEvents.length} queued events`);
            }

            // Emit queued events
            const queued = [...this._queuedEvents];
            this._queuedEvents = [];
            for (const { eventName, payload } of queued) {
                this.emit(eventName, payload);
            }
        }

        /**
         * Enable debug mode
         */
        enableDebug() {
            this._debugMode = true;
            console.log('[EventBus] Debug mode enabled');
        }

        /**
         * Disable debug mode
         */
        disableDebug() {
            this._debugMode = false;
        }

        // ============ INSPECTION METHODS ============

        /**
         * Get all registered event names
         * @returns {string[]}
         */
        getEventNames() {
            return Array.from(this._listeners.keys());
        }

        /**
         * Get listener count for an event
         * @param {string} eventName - Event name
         * @returns {number}
         */
        getListenerCount(eventName) {
            const regular = (this._listeners.get(eventName) || []).length;
            const once = (this._onceListeners.get(eventName) || []).length;
            return regular + once;
        }

        /**
         * Get event log
         * @param {number} count - Number of entries
         * @returns {Array}
         */
        getLog(count = 20) {
            return this._eventLog.slice(-count);
        }

        /**
         * Print event log to console
         */
        printLog() {
            console.log('═══════════════════════════════════════════');
            console.log('📡 EVENT BUS LOG');
            console.log('═══════════════════════════════════════════');
            this._eventLog.slice(-20).forEach((entry, i) => {
                const time = new Date(entry.timestamp).toLocaleTimeString();
                console.log(`${i + 1}. [${time}] ${entry.eventName}`);
                if (Object.keys(entry.payload).length > 0) {
                    console.log('   ', entry.payload);
                }
            });
        }

        /**
         * Get statistics
         * @returns {Object}
         */
        getStats() {
            const stats = {
                totalListeners: 0,
                totalOnceListeners: 0,
                eventsWithListeners: this._listeners.size,
                logSize: this._eventLog.length,
                queuedEvents: this._queuedEvents.length,
                isPaused: this._paused,
                debugMode: this._debugMode
            };

            for (const listeners of this._listeners.values()) {
                stats.totalListeners += listeners.length;
            }
            for (const listeners of this._onceListeners.values()) {
                stats.totalOnceListeners += listeners.length;
            }

            return stats;
        }

        // ============ PRIVATE METHODS ============

        _generateId() {
            return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        _removeListener(eventName, id) {
            const listeners = this._listeners.get(eventName);
            if (listeners) {
                const index = listeners.findIndex(l => l.id === id);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            }
        }

        _removeOnceListener(eventName, id) {
            const listeners = this._onceListeners.get(eventName);
            if (listeners) {
                const index = listeners.findIndex(l => l.id === id);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            }
        }

        _logEvent(eventName, payload) {
            this._eventLog.push({
                eventName,
                payload: this._sanitizePayload(payload),
                timestamp: Date.now()
            });

            if (this._eventLog.length > this._maxLogSize) {
                this._eventLog = this._eventLog.slice(-this._maxLogSize);
            }
        }

        _sanitizePayload(payload) {
            // Remove DOM elements and circular references for logging
            const sanitized = {};
            for (const [key, value] of Object.entries(payload)) {
                if (value instanceof Element) {
                    sanitized[key] = `<${value.tagName.toLowerCase()}>`;
                } else if (typeof value === 'function') {
                    sanitized[key] = '[Function]';
                } else if (value && typeof value === 'object') {
                    try {
                        JSON.stringify(value);
                        sanitized[key] = value;
                    } catch (e) {
                        sanitized[key] = '[Complex Object]';
                    }
                } else {
                    sanitized[key] = value;
                }
            }
            return sanitized;
        }
    }

    // ============ SINGLETON INSTANCE ============
    const eventBus = new EventBus();

    // ============ EXPORTS ============
    window.EventBus = eventBus;
    window.EventTypes = EventTypes;

    // Convenience function for quick subscription
    window.on = (eventName, handler, options) => eventBus.subscribe(eventName, handler, options);
    window.emit = (eventName, payload) => eventBus.emit(eventName, payload);

    console.log('📡 EventBus module loaded');
    console.log('   Events:', Object.keys(EventTypes).length, 'types defined');

})();
