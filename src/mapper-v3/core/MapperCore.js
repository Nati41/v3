/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - MapperCore
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   התזמורן הראשי של כלי המיפוי.
 *   מאתחל את כל המנועים, מנהל מחזור חיים, מקשי קיצור,
 *   טעינת PDF, וזרימות עבודה.
 *
 * מי משתמש בקובץ:
 *   - mapper-v3.html - יוצר את ה-singleton ומפעיל init()
 *   - כל המנועים וה-UI מתאתחלים מכאן
 *
 * באיזה מצבים:
 *   תמיד פעיל - זה ה"מוח" של הכלי
 *
 * למה הוא קיים:
 *   מקום אחד שמרכז את כל האתחול והתיאום.
 *   Singleton: export const mapper
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * MapperCore - Main coordinator for Mapper V3
 * Orchestrates all modules, manages lifecycle
 *
 * V3.4: Added TemplateValidator for export validation gate
 */
import { state, Tools, Modes, FlowModes } from './StateManager.js';
import { eventBus, Events } from './EventBus.js';
import { TemplateValidator } from './TemplateValidator.js';
import { fieldReviewScreen } from '../ui/FieldReviewScreen.js';
import { templateStore } from './TemplateStore.js';
import { quickFillOverlay } from '../ui/QuickFillOverlay.js';

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

        // V3.14: INSTRUMENTATION - Track component load
        if (typeof window !== 'undefined' && window.DebugInstrumentation) {
            window.DebugInstrumentation.logComponentLoad('MapperCore', 'init-start');
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

        // V3.14: INSTRUMENTATION - Track component ready
        if (typeof window !== 'undefined' && window.DebugInstrumentation) {
            window.DebugInstrumentation.logComponentLoad('MapperCore', 'ready');
        }

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
     * V3.5: Hidden during guided mapping mode
     */
    _updateDraftIndicator() {
        if (!this._draftIndicator || !this._draftCount) return;

        // V3.5: Always hide during guided mapping mode
        if (this._guidedMappingActive) {
            this._draftIndicator.classList.add('hidden');
            return;
        }

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
     * V3.5: Set guided mapping mode state
     * Used to hide draft indicator during guided mapping
     */
    setGuidedMappingActive(active) {
        this._guidedMappingActive = active;
        this._updateDraftIndicator();
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

            // V3.10: Quick Fill mode has its own undo/redo
            const inQuickFill = state.isQuickFillMode();

            // Ctrl/Cmd + Z = Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (inQuickFill) {
                    quickFillOverlay.undo();
                } else {
                    this.undo();
                }
            }

            // Ctrl/Cmd + Shift + Z = Redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
                e.preventDefault();
                if (inQuickFill) {
                    quickFillOverlay.redo();
                } else {
                    this.redo();
                }
            }

            // Ctrl/Cmd + Y = Redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                if (inQuickFill) {
                    quickFillOverlay.redo();
                } else {
                    this.redo();
                }
            }

            // Delete = Delete selected field (blocked in Quick Fill)
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (inQuickFill) return;
                const selected = state.getSelectedField();
                if (selected) {
                    e.preventDefault();
                    this.deleteField(selected.id);
                }
            }

            // Escape = Deselect / Cancel
            // In Quick Fill PUBLIC mode: do NOT exit (user should use Advanced Mode button)
            // In Quick Fill normal mode: exit to mapping
            if (e.key === 'Escape') {
                if (inQuickFill) {
                    // Check if in public mode - don't exit
                    if (window.quickFillUIProfile?.isPublicMode()) {
                        // Just deselect, don't exit
                        state.deselectAll();
                        return;
                    }
                    state.setFlowMode(FlowModes.MAPPING);
                    return;
                }
                state.deselectAll();
                state.setMode(Modes.IDLE);
            }

            // Tool shortcuts (blocked in Quick Fill mode)
            if (!inQuickFill) {
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
                // V3.10: M = Cell tool (mark areas without size constraints)
                if (e.key === 'm' || e.key === 'M') {
                    state.setTool(Tools.DRAW_CELL);
                }

                // V3.2: Shift+R = Open Review screen for draft fields
                if (e.key === 'R' && e.shiftKey) {
                    e.preventDefault();
                    this.openReviewScreen();
                }

                // V3.3: Space = Jump to next unmapped template field
                if (e.key === ' ' && templateStore.isLoaded()) {
                    e.preventDefault();
                    this.nextUnmapped();
                }

                // Ctrl/Cmd + S = Save (blocked in Quick Fill)
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this.saveProject();
                }
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

        // V3.3: After all exceptions are resolved, activate first unmapped field
        eventBus.on(Events.ALL_EXCEPTIONS_RESOLVED, () => {
            console.log('[MapperCore] All exceptions resolved, activating first unmapped');
            this.nextUnmapped();
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

        // V3.5: Check for auto-save after PDF loads
        setTimeout(() => this._checkAutoSaveRestore(), 500);
    }

    /**
     * V3.5: Check for and offer to restore auto-saved data
     * Called after PDF loads to recover work from browser crash/refresh
     */
    _checkAutoSaveRestore() {
        const fileName = state.get('document.fileName');
        if (!fileName) return;

        const key = `mapper_autosave_${fileName}`;

        try {
            const savedData = localStorage.getItem(key);
            if (!savedData) return;

            const data = JSON.parse(savedData);

            // Verify it has meaningful data
            if (!data.fields || data.fields.length === 0) return;

            // Check if current state already has fields (user already working)
            const currentFields = state.get('fields');
            if (currentFields && currentFields.length > 0) return;

            // Show restore prompt
            const fieldCount = data.fields.length;
            const savedAt = data.exportedAt ? new Date(data.exportedAt).toLocaleString('he-IL') : 'לא ידוע';

            const shouldRestore = confirm(
                `🔄 נמצאה שמירה אוטומטית!\n\n` +
                `קובץ: ${fileName}\n` +
                `שדות: ${fieldCount}\n` +
                `נשמר: ${savedAt}\n\n` +
                `האם לשחזר את העבודה?`
            );

            if (shouldRestore) {
                this.importProject(data);
                console.log(`[MapperCore] ✅ Auto-save restored: ${fieldCount} fields`);

                // Show success toast
                eventBus.emit(Events.TOAST_SHOW, {
                    message: `✅ שוחזרו ${fieldCount} שדות`,
                    type: 'success',
                    duration: 3000
                });
            } else {
                // User declined - optionally clear the auto-save
                // localStorage.removeItem(key);
                console.log('[MapperCore] User declined auto-save restore');
            }
        } catch (e) {
            console.error('[MapperCore] Auto-save restore failed:', e);
        }
    }

    /**
     * V3.5: Clear auto-save for current file
     * Call this when user explicitly saves or exports
     */
    clearAutoSave() {
        const fileName = state.get('document.fileName');
        if (!fileName) return;

        const key = `mapper_autosave_${fileName}`;
        localStorage.removeItem(key);
        console.log('[MapperCore] Auto-save cleared');
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
     * V3.4: Added validation gate - blocks export if any field is invalid
     *
     * @param {Object} options - Export options
     * @param {boolean} options.strict - If true, block on errors (default: true)
     * @param {boolean} options.silent - If true, don't emit events (default: false)
     * @returns {Object|null} Mapped fields data, or null if validation fails
     */
    exportMappedFields(options = {}) {
        const { strict = true, silent = false } = options;

        // V3.4: Validate all fields before export
        const stateData = {
            fields: state.get('fields'),
            radioGroups: state.get('radioGroups'),
            tables: state.get('tables')
        };

        const validation = TemplateValidator.validateForExport(stateData, templateStore);

        // Log validation results
        if (validation.warnings.length > 0) {
            console.warn('[MapperCore] Export warnings:', validation.warnings);
            if (!silent) {
                eventBus.emit(Events.VALIDATION_WARNING, {
                    warnings: validation.warnings,
                    action: 'export'
                });
            }
        }

        if (!validation.valid) {
            console.error('[MapperCore] Export blocked - validation failed:', validation.errors);

            if (!silent) {
                eventBus.emit(Events.EXPORT_BLOCKED, {
                    errors: validation.errors,
                    warnings: validation.warnings
                });

                // Show user-friendly error
                const errorCount = validation.errors.length;
                eventBus.emit(Events.TOAST_SHOW, {
                    message: `❌ ייצוא נחסם: ${errorCount} שגיאות. יש לתקן לפני ייצוא.`,
                    type: 'error',
                    duration: 5000
                });
            }

            if (strict) {
                return null;
            }
        }

        // All valid - proceed with export
        return state.exportMappedFields();
    }

    /**
     * Validate current mapping without exporting
     * V3.4: For UI to show validation status
     *
     * @returns {{ valid: boolean, errors: Array, warnings: Array }}
     */
    validateMapping() {
        const stateData = {
            fields: state.get('fields'),
            radioGroups: state.get('radioGroups'),
            tables: state.get('tables')
        };

        return TemplateValidator.validateForExport(stateData, templateStore);
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

    // ============ V3.3 TEMPLATE API ============

    /**
     * Load a template skeleton from JSON
     * @param {Object} json - Template skeleton JSON
     * @returns {{ success: boolean, error?: string }}
     */
    loadTemplate(json) {
        if (!state.get('document.loaded')) {
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'יש לטעון PDF קודם',
                type: 'error'
            });
            return { success: false, error: 'PDF not loaded' };
        }

        const result = templateStore.loadTemplate(json);

        if (result.success) {
            // Import template fields into StateManager
            state.importTemplateFields(templateStore);

            // Show exception panel if there are exceptions
            if (templateStore.hasExceptions()) {
                console.log('[MapperCore] Template has exceptions, waiting for resolution');
            } else {
                // Auto-activate first unmapped field
                this.nextUnmapped();
            }

            eventBus.emit(Events.TOAST_SHOW, {
                message: `תבנית נטענה: ${templateStore.getMappingProgress().total} שדות`,
                type: 'success'
            });
        } else {
            eventBus.emit(Events.TOAST_SHOW, {
                message: result.error || 'שגיאה בטעינת תבנית',
                type: 'error'
            });
        }

        return result;
    }

    /**
     * Check if a template is loaded
     * @returns {boolean}
     */
    hasTemplate() {
        return templateStore.isLoaded();
    }

    /**
     * Navigate to the next unmapped template field
     * Activates the field for mapping
     */
    nextUnmapped() {
        if (!templateStore.isLoaded()) {
            console.log('[MapperCore] No template loaded');
            return null;
        }

        const nextField = templateStore.getNextUnmapped();
        if (!nextField) {
            // All fields mapped!
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'כל השדות מופו!',
                type: 'success'
            });
            return null;
        }

        // Set as active target in template store
        templateStore.setActiveTarget(nextField.template_field_id);

        // Find the corresponding StateManager field
        const stateField = state.getFieldByTemplateId(nextField.template_field_id);
        if (stateField) {
            // Set pending field in DrawController for next draw operation
            const drawController = this.engines.get('draw');
            if (drawController) {
                drawController.pendingFieldId = stateField.id;
                console.log('[MapperCore] Set pending field for mapping:', stateField.id);
            }

            // Emit event for sidebar to highlight
            eventBus.emit(Events.NEXT_UNMAPPED_ACTIVATED, {
                fieldId: stateField.id,
                templateFieldId: nextField.template_field_id,
                canonical: nextField.canonical || nextField.label_en
            });
        }

        // Set tool to DRAW_TEXT for mapping
        state.setTool(Tools.DRAW_TEXT);

        // Show toast with guidance
        const fieldName = nextField.label_he || nextField.label_en || 'שדה';
        eventBus.emit(Events.TOAST_SHOW, {
            message: `📍 צייר מלבן עבור: ${fieldName}`,
            type: 'info',
            duration: 4000
        });

        console.log('[MapperCore] Activated unmapped field:', nextField.label_he);
        return nextField;
    }

    /**
     * Get the currently active template target field
     * @returns {Object|null} Template field being mapped
     */
    getActiveTemplateTarget() {
        return templateStore.getActiveTarget();
    }

    /**
     * Get mapping progress
     * @returns {{ mapped: number, total: number, percentage: number }}
     */
    getMappingProgress() {
        return templateStore.getMappingProgress();
    }

    /**
     * Lock the template (prevent further edits)
     */
    lockTemplate() {
        templateStore.lockTemplate();
    }

    /**
     * Clear the current template
     */
    clearTemplate() {
        templateStore.clear();
        // Clear template-linked fields from state
        const templateFields = state.get('fields').filter(f => f.templateFieldId);
        if (templateFields.length > 0) {
            const nonTemplateFields = state.get('fields').filter(f => !f.templateFieldId);
            state.set('fields', nonTemplateFields, true);
        }
        state.set('templateId', null);
    }

    /**
     * Get unresolved exceptions
     * @returns {Array} Exception objects
     */
    getExceptions() {
        return templateStore.getExceptions();
    }

    /**
     * Check if there are unresolved exceptions
     * @returns {boolean}
     */
    hasExceptions() {
        return templateStore.hasExceptions();
    }

    /**
     * Resolve an exception
     * @param {string} exceptionId - Exception ID
     * @param {Object} choice - Selected choice { entity_id, canonical }
     */
    resolveException(exceptionId, choice) {
        return templateStore.resolveException(exceptionId, choice);
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
