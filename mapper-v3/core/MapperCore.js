/**
 * MapperCore - Main coordinator for Mapper V3
 * Orchestrates all modules, manages lifecycle
 */
import { state, Tools, Modes } from './StateManager.js';
import { eventBus, Events } from './EventBus.js';
import { fieldReviewScreen } from '../ui/FieldReviewScreen.js';

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

        // V3.2: Initialize draft indicator
        this._initDraftIndicator();
    }

    /**
     * V3.2: Initialize draft indicator UI and button
     */
    _initDraftIndicator() {
        this._draftIndicator = document.getElementById('draft-indicator');
        this._draftCount = document.getElementById('draft-count');
        this._reviewBtn = document.getElementById('btn-review');

        if (this._reviewBtn) {
            this._reviewBtn.addEventListener('click', () => {
                this.openReviewScreen();
            });
        }
    }

    /**
     * V3.2: Update draft indicator visibility and count
     */
    _updateDraftIndicator() {
        if (!this._draftIndicator || !this._draftCount) return;

        const draftFields = state.getDraftFields();
        const count = draftFields.length;

        if (count > 0) {
            this._draftCount.textContent = count;
            this._draftIndicator.classList.remove('hidden');
        } else {
            this._draftIndicator.classList.add('hidden');
        }
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
                // Use click-select for field name capture
                import('../engines/DrawController.js').then(({ drawController }) => {
                    drawController.startFieldNameCapture();
                });
            }
            if (e.key === 't' || e.key === 'T') {
                state.setTool(Tools.DRAW_TEXT);
            }
            // Checkbox and Radio use group building flow - emit events to trigger
            if (e.key === 'c' || e.key === 'C') {
                eventBus.emit('tool:startCheckboxGroup');
            }
            if (e.key === 'r' || e.key === 'R') {
                eventBus.emit('tool:startRadioGroup');
            }

            // V3.2: Shift+R = Open Review screen for draft fields
            if (e.key === 'R' && e.shiftKey) {
                e.preventDefault();
                this.openReviewScreen();
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

        // Listen for field events - update draft indicator
        eventBus.on(Events.FIELD_CREATED, (field) => {
            console.log('[MapperCore] Field created:', field.id);
            this._updateDraftIndicator();
        });

        eventBus.on(Events.FIELD_DELETED, (field) => {
            console.log('[MapperCore] Field deleted:', field.id);
            this._updateDraftIndicator();
        });

        eventBus.on(Events.FIELD_UPDATED, () => {
            this._updateDraftIndicator();
        });

        // V3.2: Listen for review screen request
        eventBus.on(Events.FIELD_REVIEW_REQUESTED, () => {
            this.openReviewScreen();
        });

        // V3.2: Listen for page change - prompt review if drafts exist on old page
        eventBus.on(Events.PDF_PAGE_CHANGED, (data) => {
            // Update draft indicator for current state
            this._updateDraftIndicator();

            const oldPage = data.oldPage;
            if (!oldPage) return; // First page load

            const draftsOnOldPage = state.getDraftFields(oldPage);
            if (draftsOnOldPage.length > 0) {
                // Show non-blocking toast with action button
                eventBus.emit(Events.TOAST_SHOW, {
                    message: `יש ${draftsOnOldPage.length} שדות לא מאושרים בעמוד ${oldPage}`,
                    type: 'info',
                    duration: 5000,
                    action: {
                        label: 'בדיקה עכשיו',
                        callback: () => this.openReviewScreen({ page: oldPage })
                    }
                });
            }
        });

        // V3.2: Update draft indicator when PDF is loaded
        eventBus.on(Events.PDF_LOADED, () => {
            this._updateDraftIndicator();
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

    // ============ V3.2 DRAFT FLOW API ============

    /**
     * Open the field review screen
     * @param {Object} options - Options
     * @param {number} options.page - Filter by page (null = all pages)
     * @returns {Promise<Object>} Result { approved, skipped, fields }
     */
    async openReviewScreen({ page = null } = {}) {
        const draftCount = page !== null
            ? state.getDraftFields(page).length
            : state.getDraftFields().length;

        if (draftCount === 0) {
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'אין שדות לאישור',
                type: 'info'
            });
            return { approved: false, skipped: false, fields: [] };
        }

        // Initialize and show review screen
        fieldReviewScreen.init();
        const result = await fieldReviewScreen.show({ page });

        console.log('[MapperCore] Review screen result:', result);
        return result;
    }

    /**
     * Check if there are draft fields pending review
     * @returns {boolean}
     */
    hasDraftFields() {
        return state.hasDraftFields();
    }

    /**
     * Get count of draft fields
     * @param {number} page - Optional page filter
     * @returns {number}
     */
    getDraftCount(page = null) {
        return state.getDraftFields(page).length;
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

        // V3.2: Track old page for draft reminder
        const oldPage = state.get('document.currentPage');

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

        // Cancel WordSelector if active
        if (window.wordSelector && window.wordSelector.isActive()) {
            console.log('[MapperCore] Cancelling word selection due to page change');
            window.wordSelector.cancelSelection();
        }

        // Clear selection (fields are page-specific)
        state.deselectAll();

        // Reset tool to SELECT for safety
        state.setTool(Tools.SELECT);
        state.setMode(Modes.IDLE);

        // ============ Now change the page ============
        state.set('document.currentPage', pageNum);
        // V3.2: Include oldPage for draft reminder toast
        eventBus.emit(Events.PDF_PAGE_CHANGED, { page: pageNum, oldPage });
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
