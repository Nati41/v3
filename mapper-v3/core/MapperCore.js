/**
 * MapperCore - Main coordinator for Mapper V3
 * Orchestrates all modules, manages lifecycle
 */
import { state, Tools, Modes } from './StateManager.js';
import { eventBus, Events } from './EventBus.js';
import { autoBoxer } from '../engines/AutoBoxerService.js';

export class MapperCore {
    constructor() {
        this.initialized = false;
        this.engines = new Map();
        this.ui = new Map();

        // DOM references
        this.container = null;
        this.pdfContainer = null;
        this.overlayLayer = null;
        this.sidebarContainer = null;
    }

    /**
     * Initialize the mapper
     * @param {Object} options - Configuration options
     */
    async init(options = {}) {
        if (this.initialized) {
            console.warn('[MapperCore] Already initialized');
            return;
        }

        console.log('[MapperCore] Initializing...');

        // Store options
        this.options = {
            containerId: 'mapper-container',
            dpi: 300,
            ...options
        };

        // Get DOM containers
        this._initDOM();

        // Register AutoBoxer engine
        this.registerEngine('autoboxer', autoBoxer);

        // Setup keyboard shortcuts
        this._initKeyboard();

        // Setup event listeners
        this._initEventListeners();

        // Mark initialized
        this.initialized = true;
        console.log('[MapperCore] Initialized successfully');

        eventBus.emit(Events.STATE_CHANGED, { action: 'init' });
    }

    /**
     * Initialize DOM references
     */
    _initDOM() {
        this.container = document.getElementById(this.options.containerId);
        if (!this.container) {
            throw new Error(`Container #${this.options.containerId} not found`);
        }

        this.pdfContainer = document.getElementById('pdf-container');
        this.overlayLayer = document.getElementById('overlay-layer');
        this.sidebarContainer = document.getElementById('sidebar-container');
    }

    /**
     * Initialize keyboard shortcuts
     */
    _initKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't handle if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Ctrl/Cmd + Z = Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }

            // Ctrl/Cmd + Shift + Z = Redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
                e.preventDefault();
                this.redo();
            }

            // Ctrl/Cmd + Y = Redo (alternative)
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                this.redo();
            }

            // Delete = Delete selected field
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selected = state.getSelectedField();
                if (selected) {
                    e.preventDefault();
                    this.deleteField(selected.id);
                }
            }

            // Escape = Deselect / Cancel
            if (e.key === 'Escape') {
                state.deselectAll();
                state.setMode(Modes.IDLE);
            }

            // Tool shortcuts
            if (e.key === 'v' || e.key === 'V') {
                state.setTool(Tools.SELECT);
            }
            if (e.key === 'n' || e.key === 'N') {
                state.setTool(Tools.CAPTURE_NAME);
            }
            if (e.key === 't' || e.key === 'T') {
                state.setTool(Tools.DRAW_TEXT);
            }
            if (e.key === 'c' || e.key === 'C') {
                state.setTool(Tools.DRAW_CHECKBOX);
            }
            if (e.key === 'r' || e.key === 'R') {
                state.setTool(Tools.DRAW_RADIO);
            }
        });
    }

    /**
     * Initialize event listeners
     */
    _initEventListeners() {
        // Listen for state changes to trigger auto-save
        eventBus.on(Events.STATE_CHANGED, (data) => {
            if (state.get('settings.autoSave') && data.action !== 'init') {
                this._scheduleAutoSave();
            }
        });

        // Listen for field events
        eventBus.on(Events.FIELD_CREATED, (field) => {
            console.log('[MapperCore] Field created:', field.id);
        });

        eventBus.on(Events.FIELD_DELETED, (field) => {
            console.log('[MapperCore] Field deleted:', field.id);
        });
    }

    // ============ PUBLIC API ============

    /**
     * Load a PDF file
     * @param {File|string} source - File object or URL
     */
    async loadPDF(source) {
        const pdfEngine = this.engines.get('pdf');
        if (!pdfEngine) {
            throw new Error('PDF engine not registered');
        }

        await pdfEngine.load(source);
    }

    /**
     * Import project JSON
     * @param {Object} data - Project data
     */
    importProject(data) {
        if (!data) {
            throw new Error('No data provided');
        }

        state.importState(data);
        console.log('[MapperCore] Project imported');
    }

    /**
     * Export project JSON (full - includes unmapped fields)
     * @returns {Object} Project data
     */
    exportProject() {
        return state.exportState();
    }

    /**
     * Export only mapped fields (for production use)
     * @returns {Object} Mapped fields data
     */
    exportMappedFields() {
        return state.exportMappedFields();
    }

    /**
     * Create a new field
     * @param {Object} fieldData - Field properties
     * @returns {Object} Created field
     */
    createField(fieldData) {
        return state.addField(fieldData);
    }

    /**
     * Update a field
     * @param {string} fieldId - Field ID
     * @param {Object} updates - Properties to update
     * @returns {Object|null} Updated field
     */
    updateField(fieldId, updates) {
        return state.updateField(fieldId, updates);
    }

    /**
     * Delete a field
     * @param {string} fieldId - Field ID
     * @returns {boolean} Success
     */
    deleteField(fieldId) {
        return state.deleteField(fieldId);
    }

    /**
     * Select a field
     * @param {string} fieldId - Field ID
     */
    selectField(fieldId) {
        state.selectField(fieldId);
    }

    // ============ RADIO GROUP API ============

    /**
     * Create a new radio group
     * @param {Object} groupData - Radio group data
     * @returns {Object} Created group
     */
    createRadioGroup(groupData) {
        return state.addRadioGroup(groupData);
    }

    /**
     * Update a radio group
     * @param {string} groupId - Group ID
     * @param {Object} updates - Updates
     * @returns {Object|null} Updated group
     */
    updateRadioGroup(groupId, updates) {
        return state.updateRadioGroup(groupId, updates);
    }

    /**
     * Delete a radio group
     * @param {string} groupId - Group ID
     * @returns {boolean} Success
     */
    deleteRadioGroup(groupId) {
        return state.deleteRadioGroup(groupId);
    }

    /**
     * Get all radio groups
     * @returns {Array} Radio groups
     */
    getRadioGroups() {
        return state.get('radioGroups') || [];
    }

    // ============ TABLE API ============

    /**
     * Create a new table
     * @param {Object} tableData - Table data
     * @returns {Object} Created table
     */
    createTable(tableData) {
        return state.addTable(tableData);
    }

    /**
     * Update a table
     * @param {string} tableId - Table ID
     * @param {Object} updates - Updates
     * @returns {Object|null} Updated table
     */
    updateTable(tableId, updates) {
        return state.updateTable(tableId, updates);
    }

    /**
     * Delete a table
     * @param {string} tableId - Table ID
     * @returns {boolean} Success
     */
    deleteTable(tableId) {
        return state.deleteTable(tableId);
    }

    /**
     * Get all tables
     * @returns {Array} Tables
     */
    getTables() {
        return state.get('tables') || [];
    }

    /**
     * Undo last action
     */
    undo() {
        if (state.undo()) {
            console.log('[MapperCore] Undo');
        }
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (state.redo()) {
            console.log('[MapperCore] Redo');
        }
    }

    /**
     * Set current tool
     * @param {string} tool - Tool from Tools enum
     */
    setTool(tool) {
        state.setTool(tool);
    }

    /**
     * Go to page
     * Cancels any ongoing operations (drawing, radio group building) for safety
     * @param {number} pageNum - Page number (1-based)
     */
    goToPage(pageNum) {
        const totalPages = state.get('document.totalPages');
        if (pageNum < 1 || pageNum > totalPages) {
            console.warn(`[MapperCore] Invalid page: ${pageNum}`);
            return;
        }

        // ============ SAFETY: Cancel ongoing operations before page change ============
        const currentMode = state.get('mode');

        // Cancel drawing mode
        if (currentMode === Modes.DRAWING) {
            console.log('[MapperCore] Cancelling drawing due to page change');
            state.setMode(Modes.IDLE);
            eventBus.emit(Events.DRAW_CANCEL);
        }

        // Cancel radio group building
        if (currentMode === Modes.RADIO_GROUP_BUILDING) {
            console.log('[MapperCore] Cancelling radio group building due to page change');
            state.cancelRadioGroupBuilder();
        }

        // Clear selection (fields are page-specific)
        state.deselectAll();

        // Reset tool to SELECT for safety
        state.setTool(Tools.SELECT);
        state.setMode(Modes.IDLE);

        // ============ Now change the page ============
        state.set('document.currentPage', pageNum);
        eventBus.emit(Events.PDF_PAGE_CHANGED, { page: pageNum });
    }

    /**
     * Reset to initial state
     */
    reset() {
        state.reset();
        console.log('[MapperCore] Reset');
    }

    // ============ ENGINE MANAGEMENT ============

    /**
     * Register an engine
     * @param {string} name - Engine name
     * @param {Object} engine - Engine instance
     */
    registerEngine(name, engine) {
        this.engines.set(name, engine);
        console.log(`[MapperCore] Engine registered: ${name}`);
    }

    /**
     * Get an engine
     * @param {string} name - Engine name
     * @returns {Object|undefined} Engine instance
     */
    getEngine(name) {
        return this.engines.get(name);
    }

    // ============ UI MANAGEMENT ============

    /**
     * Register a UI controller
     * @param {string} name - Controller name
     * @param {Object} controller - Controller instance
     */
    registerUI(name, controller) {
        this.ui.set(name, controller);
        console.log(`[MapperCore] UI registered: ${name}`);
    }

    /**
     * Get a UI controller
     * @param {string} name - Controller name
     * @returns {Object|undefined} Controller instance
     */
    getUI(name) {
        return this.ui.get(name);
    }

    // ============ INTERNAL ============

    /**
     * Schedule auto-save (debounced)
     */
    _scheduleAutoSave() {
        if (this._autoSaveTimer) {
            clearTimeout(this._autoSaveTimer);
        }

        this._autoSaveTimer = setTimeout(() => {
            this._performAutoSave();
        }, 2000); // 2 second debounce
    }

    /**
     * Perform auto-save
     */
    _performAutoSave() {
        const data = this.exportProject();
        const key = `mapper_autosave_${state.get('document.fileName') || 'untitled'}`;

        try {
            localStorage.setItem(key, JSON.stringify(data));
            console.log('[MapperCore] Auto-saved');
            eventBus.emit(Events.AUTOSAVE_TRIGGER, { key });
        } catch (e) {
            console.error('[MapperCore] Auto-save failed:', e);
        }
    }
}

// Singleton instance
export const mapper = new MapperCore();
