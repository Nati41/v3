/**
 * Field Mapper Pro - Enhanced Version 2.2 - JSON Loading Fix
 * כלי מיפוי שדות מתקדם עם תמיכה בריבוי עמודים, שמירה אוטומטית, ייצוא CSV וטבלאות
 * 
 * תיקונים ושיפורים בגרסה 2.2 (JSON Loading Fix):
 * - ✅ תיקון טעינת JSON מכלי המיפוי למצב מילוי חי
 * - ✅ תמיכה מלאה בפורמט bbox מכלי המיפוי
 * - ✅ מעבר אוטומטי למצב מילוי חי לאחר טעינת נתוני מיפוי
 * - ✅ רנדור נכון של שדות עם קואורדינטות מכלי המיפוי
 * 
 * תיקונים ושיפורים בגרסה 2.1 (Live Editing):
 * - עריכה ישירה במלבנים (contentEditable) במצב מילוי חי
 * - הפרדה בין תוכן (data) לעיצוב (style) במבנה liveFillData
 * - Sidebar פעיל ומשפיע על המלבן המסומן במצב מילוי
 * - עדכון עיצוב בזמן אמת כאשר הסיידבר משתנה
 * 
 * תיקונים ושיפורים בגרסה 2.0:
 * - רינדור PDF באיכות גבוהה (300 DPI)
 * - מערכת Undo/Redo מלאה
 * - זיהוי חפיפות בין שדות
 * - שמירת מצב זום לכל עמוד
 * - הצמדה לרשת (אופציונלי)
 * - ייצוג ויזואלי משופר לסוגי שדות
 * - יצירת טבלאות עם רשת אוטומטית
 * 
 * להפעלה:
 * 1. שמור את שלושת הקבצים באותה תיקייה:
 *    - field-mapper-enhanced.html
 *    - style-enhanced.css
 *    - field-mapper-enhanced.js
 * 2. פתח את field-mapper-enhanced.html בדפדפן
 * 3. הכלי יעבוד מיד ללא צורך בשרת
 */

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ✅ VERSION CHECK - If you see this, the new code is loaded!
alert('🔴 MAPPER.JS LOADED - VERSION 2025-12-09-FIX');
console.log('%c🎯 STATE MACHINE V2.0 - Version 20251209-SM', 'background: #4CAF50; color: white; font-size: 16px; padding: 10px; font-weight: bold;');
console.log('✅ Unified State Machine replacing legacy mode flags');

// ============ IMPORT STATE MACHINE ============
// Note: Will be loaded dynamically to maintain compatibility
let StateMachineModule = null;
let MapperStateEnum = null;

(async function loadStateMachine() {
    try {
        const module = await import('./state-machine.js');
        StateMachineModule = module.StateMachine;
        MapperStateEnum = module.MapperState;
        console.log('✅ StateMachine module loaded successfully');

        // If mapper already exists, initialize state machine
        if (window.mapper && !window.mapper.stateMachine) {
            window.mapper._initStateMachine();
        }
    } catch (error) {
        console.warn('⚠️ StateMachine module not loaded, using legacy mode:', error.message);
    }
})();

// ===============================
// Task 3.2 – Essential constants only
// ===============================
const PDF_DPI = 72;
const CANVAS_DPI = 96;
const RENDER_DPI = 300;

const CHECKBOX_SIZE = 20;
const RADIO_SIZE = 16;

// ===============================
// OCR Engine - Dynamic Import
// ===============================
let OCREngine = null;
(async function loadOCREngine() {
    try {
        const module = await import('./ocr-engine.js');
        OCREngine = module.OCREngine;
        console.log('🔍 OCR Engine loaded successfully');
    } catch (err) {
        console.warn('🔍 OCR Engine failed to load (OCR fallback unavailable):', err.message);
    }
})();

// ===============================
// Name Debug Overlay - Dynamic Import
// ===============================
(async function loadNameDebugOverlay() {
    try {
        const module = await import('./name-debug-overlay.js');
        // Module self-registers to window.NameDebugOverlay
        console.log('🔍 Name Debug Overlay loaded successfully');
    } catch (err) {
        console.warn('🔍 Name Debug Overlay failed to load (debug overlay unavailable):', err.message);
    }
})();

// ===============================
// Field Type Suggestion - Dynamic Import
// ===============================
let FieldTypeSuggestionClass = null;
(async function loadFieldTypeSuggestion() {
    try {
        const module = await import('./field-type-suggestion.js');
        FieldTypeSuggestionClass = module.FieldTypeSuggestion;
        console.log('🎯 Field Type Suggestion loaded successfully');
    } catch (err) {
        console.warn('🎯 Field Type Suggestion failed to load:', err.message);
    }
})();

// ===============================
// Field Auto-Grouping - Dynamic Import
// ===============================
let FieldAutoGroupingClass = null;
(async function loadFieldAutoGrouping() {
    try {
        const module = await import('./field-auto-grouping.js');
        FieldAutoGroupingClass = module.FieldAutoGrouping;
        console.log('🔗 Field Auto-Grouping loaded successfully');
    } catch (err) {
        console.warn('🔗 Field Auto-Grouping failed to load:', err.message);
    }
})();

// ===============================
// Smart Auto-Save - Dynamic Import
// ===============================
let SmartAutoSaveClass = null;
(async function loadSmartAutoSave() {
    try {
        const module = await import('./smart-auto-save.js');
        SmartAutoSaveClass = module.SmartAutoSave;
        console.log('💾 Smart Auto-Save loaded successfully');
    } catch (err) {
        console.warn('💾 Smart Auto-Save failed to load:', err.message);
    }
})();

const DEBOUNCE_DRAG = 100;
const DEBOUNCE_INPUT = 150;

// Helper function to add logs to the UI panel
function addLog(message, data = null) {
  const panel = document.getElementById("log-panel");
  if (!panel) return;

  const entry = document.createElement("div");
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

  if (data) {
    try {
      entry.textContent += " " + JSON.stringify(data);
    } catch (e) {
      entry.textContent += " [unserializable data]";
    }
  }

  panel.appendChild(entry);
  panel.scrollTop = panel.scrollHeight; // auto-scroll
}

// Use shared debounce from window.Debounce (loaded from shared/debounce.js)
const debounce = window.Debounce;

// Use shared normalizeField from window.normalizeField (loaded from shared/normalizeField.js)
const normalizeField = window.normalizeField;

// Use shared migrateV1toV2 from window.migrateV1toV2 (loaded from shared/migrateV1toV2.js)
const migrateV1toV2Global = window.migrateV1toV2;

// --- Auto-Label Engine ---
// Loaded via script tag before mapper.js - available as window.AutoLabelEngine

// --- Shared Modules ---
const {
    generateUniqueId: coreGenerateUniqueId,
    ensureUniqueId: coreEnsureUniqueId,
    generateEnglishId: coreGenerateEnglishId,
    detectTextDirection: coreDetectTextDirection,
    calculateAutoFitFontSize: coreCalculateAutoFitFontSize,
    checkFieldOverlap: coreCheckFieldOverlap,
    snapToGridValue: coreSnapToGridValue,
    getDefaultDirectionForType: coreGetDefaultDirectionForType,
    mapFieldType,
    getFontNameForField,
    getAnchorH,
    getAnchorV,
    getPlaceholderForType,
    buildExportFieldData,
    hasValidCoordinates,
    isFieldMapped,
    isDefaultUnmappedBbox,
    hexToRgb,
    getDefaultStyle,
    CHECKBOX_SIZE: CORE_CHECKBOX_SIZE,
    RADIO_SIZE: CORE_RADIO_SIZE
} = window.MapperCore || {};

// --- UI Module ---
const MapperUI = window.MapperUI || {};

class FieldMapper {
    constructor() {
        // Core state
        // ============ FIELDS ARRAY - Simple array (debug tracker disabled for performance) ============
        this.fields = [];

        this.tableGroups = [];
        this.selectedField = null;
        this.expandedFieldId = null;
        this.mode = 'mapping';
        this.currentPage = 1;

        // ============ TWO-MODE MAPPING SYSTEM ============
        // 'regular' = JSON-driven, select from sidebar then draw
        // 'quick' = No JSON, guided flows with auto-naming
        this.mappingMode = 'quick';  // Default to quick mode
        this.mappingModeManualOverride = false;  // User manually selected mode
        this.totalPages = 1;
        this.pdfDocument = null;
        this.mappingTargetField = null;
        
        // Drawing states
        this.isDrawing = false;
        this.isDragging = false;
        this.isResizing = false;
        this.isPanning = false;
        this.isSpacePressed = false;
        this.dragStart = null;
        this.currentDrawing = null;
        this.resizeHandle = null;

        // CRITICAL: Render loop prevention flags
        this._isRenderingOverlays = false;  // Guards against resize→render→resize loop
        this._isInResizeHandler = false;    // Guards against recursive resizeHandler calls
        this._renderGuardDeadZoneEnd = 0;   // Timestamp when dead-zone expires
        this._loopProtectionSkipCount = 0;  // Counter for debugging

        // CRITICAL: Dead-zone configuration
        // This is the time window after overlay rendering during which resize events are ignored
        // Optimal value: 2-3 animation frames (32-50ms) to absorb layout reflow events
        this._RENDER_DEAD_ZONE_MS = 50;

        // Document state
        this.documentLoaded = false;
        this.currentDocument = null;
        this.pageCache = {};

        // PDF Text Cache for Auto-Label feature
        this.pdfTextCache = {};  // Cache of text items per page: { pageNum: [textItems] }
        
        // View state per page - NEW
        this.pageViewStates = {};
        this.panX = 0;
        this.panY = 0;
        
        // Internal zoom level (independent from browser zoom)
        this.zoomLevel = 1.0;
        
        // Grid and snap - NEW
        this.snapToGrid = false;
        this.gridSize = 20;
        
        // DPI setting - NEW
        this.dpiSetting = 300;
        
        // Base dimensions for percentage calculations
        this.baseDimensions = { width: 0, height: 0 };
        
        // Canvas dimensions for scaling calculations
        this.canvasDimensions = { width: 0, height: 0 };
        
        // App mode system (Mapper vs Live Fill) - NEW ARCHITECTURE ENHANCED
        this.appMode = 'mapper'; // 'mapper' or 'livefill'
        this.activeTab = 'editing'; // For mapper mode tabs
        
        // Initialize mode UI on startup
        setTimeout(() => this.updateModeSpecificUI(), 100);
        
        // NEW ARCHITECTURE VARIABLES
        this.mappingScale = null; // Scale factor for high-res mapping image  
        this.mappingCanvas = null; // Reference to mapping canvas
        this.mappingImageData = null; // High-res image data for mapping
        
        // Auto-save state
        this.autoSaveEnabled = true;
        this.autoSaveKey = 'fieldMapperAutoSave';
        this.lastAutoSave = null;
        
        // Live Fill system - NEW STRUCTURE: Separate data from style
        this.liveFillData = {}; // Store live fill values and settings per field
        // Each field will have: { value: "text", style: { fontFamily, fontSize, color, etc. } }
        this.textPreviewSettings = {
            fontFamily: 'Arial', // Changed from David Libre due to loading issues
            fontSize: 14,
            alignmentH: 'center',
            alignmentV: 'middle',
            color: '#000000',
            opacity: 1.0,
            letterSpacing: 0,
            wordSpacing: 0
        };
        this.selectedTextPreview = null;
        this.liveTextEnabled = false;
        
        // Flag to track if we need to migrate legacy fields
        this.needsLegacyMigration = false;
        
        // Undo/Redo system - NEW
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        
        // Interaction state
        this.interaction = {
            mode: 'idle',
            targetFieldId: null
        };

        // ============ FIELD CREATION STATE (Managed by StateMachine) ============
        // Legacy flags REMOVED - State is now managed by StateMachine
        // Use: this.stateMachine.is(MapperState.FIELD_CREATION) instead of this.fieldCreationMode
        this.unnamedFieldCounter = 0;  // Running counter for unnamed fields

        // ============ RADIO GROUPING FEATURE ============
        // Runtime data - NOT mode flags (modes managed by StateMachine)
        this.radioGroups = [];               // Array of radio group objects
        this.radioGroupCounter = 0;          // Running counter for group IDs

        // ============ TEXT SELECTION RUNTIME DATA ============
        // Mode flags REMOVED - use StateMachine. Runtime data remains.
        this.currentFieldForNaming = null;  // Field being named
        this.textSelectionStart = null;     // Start point of text selection
        this.currentTextSelection = null;   // Current selection rectangle element

        // ============ UNIFIED MAPPING FLOW RUNTIME DATA ============
        // Mode flags REMOVED - use StateMachine. Runtime data remains.
        // Use: this.stateMachine.isInFlow() instead of this.mappingFlowActive
        // Use: this.stateMachine.getFlowType() instead of this.mappingFlowFieldType
        // Use: this.stateMachine.getPendingName() instead of this.mappingFlowPendingName
        this._lastFlowTriggerTime = 0;          // Timestamp of last flow trigger (for debouncing)
        this._flowCompletionInProgress = false; // Guard against double _completeMappingFlowField calls
        this._lastModeChangeTime = 0;           // Guard against rapid mode changes (<10ms)
        this._recursionGuard = new Set();       // Tracks active function calls to detect recursion
        this.fieldTypeSuggestion = null;        // FieldTypeSuggestion instance (lazy init)
        this.lastChosenFieldType = null;        // Memory: last selected field type
        this.lastFieldBbox = null;              // Memory: bbox of last created field
        this.fieldAutoGrouping = null;          // FieldAutoGrouping instance (lazy init)
        this.smartAutoSave = null;              // SmartAutoSave instance (lazy init)

        // ============ OPTION GROUPING RUNTIME DATA ============
        // Mode flags REMOVED - use StateMachine. Runtime data remains.
        this.selectedOptionsForGrouping = [];  // Array of field IDs selected for grouping
        this.optionGroups = [];                // Array of OptionGroup objects
        this.currentGroupForNaming = null;     // Group being named
        this.currentOptionForLabeling = null;  // Option being labeled

        // ============ TABLE MAPPING RUNTIME DATA ============
        // Mode flags REMOVED - use StateMachine. Runtime data remains.
        // Use: this.stateMachine.isInTableFlow() instead of this.tableMappingMode
        this.mappedTables = [];                // Array of mapped table objects
        this.currentTable = null;              // Table currently being mapped
        this.currentTableStep = null;          // Current step: 'region', 'rows', 'sample', 'columns', 'complete'
        this.tableCounter = 0;                 // Running counter for table IDs

        // ============ TABLE OVERLAY SETTINGS (UI Polish) ============
        // TASK 3: Dev labels for debugging (show row,col index in cells)
        this.debugTableLabels = false;         // Set to true to show debug labels in cells
        // TASK 1 & 2: Cell styling options
        this.tableCellStyle = {
            fillOpacity: 0.25,                 // 0-1, default 25% opacity
            borderWidth: 1,                    // pixels
            borderOpacity: 0.7                 // 0-1 for border
        };

        // ============ NEW TABLE STEP CONTROLLER (Step 4 Implementation) ============
        // References will be initialized after DOM is ready
        this.tableController = null;           // TableStepController instance
        this.tableUIManager = null;            // TableUIManager instance
        this.tableOverlayManager = null;       // TableOverlay instance

        // ============ VISUAL GUIDE ENGINE ============
        // Global visual guidance for all field types
        this.visualGuide = null;               // VisualGuide instance (lazy initialized)

        // ============ LIVE TABLE PREVIEW SETTINGS (Step 7) ============
        // Renders mock data in table cells for visual preview
        // Note: liveTablePreviewMode flag REMOVED - use StateMachine.is(PREVIEW)
        this.previewSettings = {
            fontSize: 12,
            opacity: 0.85,
            textLength: 'medium',
            language: 'hebrew',
            showErrors: true,
            showWarnings: true
        };

        // Data templates ONLY for Live Fill mode - NOT for mapper preview
        this.dummyDataTemplates = {
            text: 'ישראל ישראלי',
            number: '123456789',
            date: '01/01/2024',
            email: 'example@email.com',
            phone: '050-1234567',
            id_number: '123456789',
            address: 'רחוב הרצל 1, תל אביב',
            checkbox: '☑',
            radio: '⦿',
            signature: 'חתימה_________'
        };
        
        // Field dictionary for Hebrew to English conversion
        this.fieldDictionary = {
            'שם': 'name',
            'שם פרטי': 'first_name',
            'שם משפחה': 'last_name',
            'תעודת זהות': 'id_number',
            'ת.ז': 'id_number',
            'תאריך': 'date',
            'תאריך לידה': 'birth_date',
            'כתובת': 'address',
            'טלפון': 'phone',
            'דואר אלקטרוני': 'email',
            'מספר': 'number',
            'חתימה': 'signature',
            'סימון': 'checkbox',
            'בחירה': 'radio'
        };

        // Performance optimization - RAF tracking
        this._pendingFrame = null;
        this._pendingRenderFrame = null;

        // Performance optimization - Debounced versions
        this.debouncedUpdateDrag = debounce((...args) => this._updateDragImmediate(...args), DEBOUNCE_DRAG);
        this.debouncedUpdateResize = debounce((...args) => this._updateResizeImmediate(...args), DEBOUNCE_DRAG);
        this.debouncedUpdateFieldProperty = debounce((...args) => this._updateFieldPropertyImmediate(...args), DEBOUNCE_INPUT);
        this.debouncedRenderTextPreview = debounce((...args) => this._renderTextPreviewImmediate(...args), DEBOUNCE_INPUT);
        this.debouncedUpdateAllTextPreviews = debounce((...args) => this._updateAllTextPreviewsImmediate(...args), DEBOUNCE_INPUT);

        // --- Adapter Layer (Temporary) ---
        // All UI calls are routed through MapperUI
        this.UI = MapperUI;

        // Pure helpers from MapperCore
        this.Core = window.MapperCore;

        // Event system from MapperEvents
        this.Events = window.MapperEvents;

        // Drag/Resize/Drawing engine
        this.DragEngine = window.MapperDragEngine;

        // Sidebar rendering engine
        this.SidebarEngine = window.MapperSidebarEngine;

        // PDF rendering engine
        this.PdfEngine = window.MapperPdfEngine;

        // Overlay rendering engine
        this.OverlayEngine = window.MapperOverlayEngine;

        // Selection engine
        this.Selection = window.MapperSelectionEngine;

        // State management engine
        this.State = window.MapperStateEngine;

        // Editor engine
        this.Editor = window.MapperEditorEngine;

        // Field management engine
        this.FieldEngine = window.MapperFieldEngine;

        // Viewport management engine
        this.Viewport = window.MapperViewportEngine;

        // Initialize after construction
        this.initEventListeners();
        this.checkAutoSave();
        this.updateUndoRedoButtons();

        // ============ STATE MACHINE INITIALIZATION ============
        this.stateMachine = null;  // Will be initialized when module loads
        this._initStateMachine();

        // ============ TESTING FRAMEWORK (ADDITIVE - Does NOT modify behavior) ============
        // Initialize tester after all systems are loaded
        // Access via: window.tester.showPanel() or window.tester.run()
        setTimeout(() => {
            if (typeof TestRunner !== 'undefined' && typeof UserSimulator !== 'undefined' && typeof TestEngine !== 'undefined') {
                this.tester = new TestRunner(this, new UserSimulator(this), new TestEngine(this));
                window.tester = this.tester; // Developer access
                console.log('[FieldMapper] ✅ Test framework initialized. Use window.tester.showPanel() to open test panel.');
            }
        }, 500);
    }

    // ============ STATE MACHINE INITIALIZATION ============

    /**
     * Initialize the State Machine integration
     * Creates the StateMachine instance and sets up legacy compatibility layer
     */
    _initStateMachine() {
        // Check if module is already loaded
        if (StateMachineModule && MapperStateEnum) {
            this._createStateMachineInstance();
            return;
        }

        // If not yet loaded, wait for it
        const checkInterval = setInterval(() => {
            if (StateMachineModule && MapperStateEnum) {
                clearInterval(checkInterval);
                this._createStateMachineInstance();
            }
        }, 50);

        // Timeout after 2 seconds - continue without StateMachine
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!this.stateMachine) {
                console.warn('⚠️ StateMachine module not available - using legacy mode');
            }
        }, 2000);
    }

    /**
     * Create StateMachine instance and set up event handlers
     * @private
     */
    _createStateMachineInstance() {
        try {
            this.stateMachine = new StateMachineModule(this);

            // Set up state change listener
            this.stateMachine.on('onStateChange', (from, to, flowData) => {
                this._onStateMachineChange(from, to, flowData);
            });

            // Set up blocked transition listener
            this.stateMachine.on('onTransitionBlocked', (from, to, reason) => {
                console.warn(`[Mapper] Transition blocked: ${from} → ${to} (${reason})`);
            });

            // Set up error listener
            this.stateMachine.on('onError', (message) => {
                console.error(`[Mapper] StateMachine error: ${message}`);
            });

            // Initialize legacy compatibility getters
            this._setupLegacyCompatibility();

            // Initialize Phase 5 Controller for EventBus routing
            if (window.Controller && typeof window.Controller.init === 'function') {
                window.Controller.init(this);
            }

            // Initialize Two-Mode Mapping Engines
            this._initMappingEngines();

            console.log('✅ StateMachine integrated successfully');
        } catch (error) {
            console.error('❌ Failed to create StateMachine:', error);
            this.stateMachine = null;
        }
    }

    /**
     * Handle state machine state changes
     * Updates UI and triggers any necessary side effects
     * @private
     */
    _onStateMachineChange(fromState, toState, flowData) {
        // Log state transition for debugging
        console.log(`[StateMachine] ${fromState} → ${toState}`);

        // Update UI based on new state
        this._updateUIForState(toState);
    }

    /**
     * Update UI elements based on current state
     * @private
     */
    _updateUIForState(state) {
        const MS = MapperStateEnum;
        if (!MS) return;

        const layer = document.getElementById('mapping-layer');

        // Clear all mode-specific CSS classes
        if (layer) {
            layer.classList.remove(
                'field-creation-mode', 'checkbox-mode-active', 'radio-mode-active',
                'select-field-name-mode-active', 'text-selection-mode-active',
                'grouping-mode-active', 'table-mapping-mode-active'
            );
            layer.style.cursor = '';
        }

        // Apply state-specific UI
        switch (state) {
            case MS.FIELD_CREATION:
                if (layer) layer.classList.add('field-creation-mode');
                break;
            case MS.CHECKBOX_CREATION:
                if (layer) {
                    layer.classList.add('checkbox-mode-active');
                    layer.style.cursor = 'crosshair';
                }
                break;
            case MS.RADIO_CREATION:
                if (layer) {
                    layer.classList.add('radio-mode-active');
                    layer.style.cursor = 'crosshair';
                }
                break;
            case MS.FLOW_CAPTURE_NAME:
                if (layer) {
                    layer.classList.add('select-field-name-mode-active');
                    layer.style.cursor = 'text';
                }
                break;
            case MS.FLOW_CAPTURE_FIELD:
                if (layer) {
                    layer.classList.add('field-creation-mode');
                    layer.style.cursor = 'crosshair';
                }
                break;
            case MS.GROUPING_SELECT:
            case MS.GROUP_NAMING:
            case MS.OPTION_LABELING:
                if (layer) layer.classList.add('grouping-mode-active');
                break;
            case MS.TABLE_REGION:
            case MS.TABLE_SAMPLE_ROW:
            case MS.TABLE_COLUMN_MAPPING:
                if (layer) layer.classList.add('table-mapping-mode-active');
                break;
        }
    }

    /**
     * Set up state machine - No legacy compatibility needed
     * @private
     */
    _setupLegacyCompatibility() {
        // Legacy compatibility REMOVED - StateMachine is now the single source of truth
        console.log('✅ StateMachine is Single Source of Truth - No legacy compatibility needed');
    }

    /**
     * Check if any mode is currently active
     * Uses StateMachine only - no legacy fallback
     * @returns {boolean}
     */
    isAnyModeActive() {
        if (!this.stateMachine || !MapperStateEnum) {
            console.warn('[isAnyModeActive] StateMachine not available');
            return false;
        }
        return !this.stateMachine.is(MapperStateEnum.IDLE);
    }

    /**
     * Get current state from StateMachine
     * @returns {string|null} Current state or null if StateMachine not available
     */
    getCurrentState() {
        return this.stateMachine ? this.stateMachine.getState() : null;
    }

    /**
     * Transition to a new state via StateMachine
     * Falls back to legacy mode if StateMachine not available
     * @param {string} newState - Target state
     * @param {Object} options - Transition options
     * @returns {boolean} Success
     */
    transitionTo(newState, options = {}) {
        if (this.stateMachine && MapperStateEnum) {
            return this.stateMachine.setState(newState, options);
        }

        // Legacy fallback - log warning
        console.warn('[Mapper] transitionTo called without StateMachine:', newState);
        return false;
    }

    /**
     * Reset to IDLE state via StateMachine
     * Provides a clean way to cancel any active operation
     */
    resetToIdle() {
        if (this.stateMachine) {
            this.stateMachine.reset();
        } else {
            // Legacy fallback - disable all modes manually
            this.disableAllCreationModes();
        }
    }

    // ============ TWO-MODE MAPPING SYSTEM ============

    /**
     * Detect and set the appropriate mapping mode
     * Auto-detects based on JSON field presence, respects manual override
     * @returns {string} The current mapping mode ('regular' or 'quick')
     */
    _detectMappingMode() {
        // If user manually set mode, respect it
        if (this.mappingModeManualOverride) {
            return this.mappingMode;
        }

        // Auto-detect: Check if JSON fields are loaded (unmapped fields with labels)
        const hasJsonFields = this.fields.some(f =>
            !f.isMapped && f.label_he && !f.isUnnamed
        );

        this.mappingMode = hasJsonFields ? 'regular' : 'quick';
        this._updateMappingModeUI();
        this._activateCurrentMappingEngine();

        console.log(`[Mapper] Mode detected: ${this.mappingMode} (hasJsonFields=${hasJsonFields})`);
        return this.mappingMode;
    }

    /**
     * Toggle between regular and quick mapping modes
     * Sets manual override flag
     */
    toggleMappingMode() {
        this.mappingModeManualOverride = true;
        this.mappingMode = this.mappingMode === 'regular' ? 'quick' : 'regular';
        this._updateMappingModeUI();
        this._activateCurrentMappingEngine();

        // Reset any active state
        if (this.stateMachine) {
            this.stateMachine.reset(true);
        }

        this.showToast(
            this.mappingMode === 'regular'
                ? 'מצב רגיל: בחר שדה מהסיידבר וצייר מלבן'
                : 'מצב מהיר: בחר שם שדה וצייר מלבן',
            'info'
        );

        console.log(`[Mapper] Mode toggled to: ${this.mappingMode}`);
    }

    /**
     * Update UI to reflect current mapping mode
     * @private
     */
    _updateMappingModeUI() {
        const btn = document.getElementById('btn-mode-toggle');
        const indicator = document.getElementById('mode-indicator');
        const manualButtons = document.getElementById('manual-mode-buttons');

        if (this.mappingMode === 'regular') {
            // JSON Mode - fields come from imported JSON
            if (indicator) indicator.textContent = '🟢 JSON';
            if (btn) {
                btn.classList.remove('quick-mode');
                btn.classList.add('regular-mode');
            }
            // Hide manual mode buttons in JSON mode
            if (manualButtons) manualButtons.style.display = 'none';
        } else {
            // Manual Mode - create fields manually
            if (indicator) indicator.textContent = '🔵 ידני';
            if (btn) {
                btn.classList.remove('regular-mode');
                btn.classList.add('quick-mode');
            }
            // Show manual mode buttons
            if (manualButtons) manualButtons.style.display = 'flex';
        }

        // Update sidebar to show appropriate content
        this.updateFieldList();
    }

    /**
     * Activate the appropriate mapping engine based on current mode
     * @private
     */
    _activateCurrentMappingEngine() {
        // Deactivate both engines first
        if (window.RegularMapperEngine) {
            window.RegularMapperEngine.deactivate(this);
        }
        if (window.QuickMapperEngine) {
            window.QuickMapperEngine.deactivate(this);
        }

        // Activate the appropriate engine
        if (this.mappingMode === 'regular') {
            if (window.RegularMapperEngine) {
                window.RegularMapperEngine.activate(this);
            }
        } else {
            if (window.QuickMapperEngine) {
                window.QuickMapperEngine.activate(this);
            }
        }
    }

    /**
     * Initialize the two-mode mapping engines
     * Called after StateMachine is ready
     * @private
     */
    _initMappingEngines() {
        // Initialize both engines
        if (window.RegularMapperEngine) {
            window.RegularMapperEngine.init(this);
        }
        if (window.QuickMapperEngine) {
            window.QuickMapperEngine.init(this);
        }

        // Detect and set initial mode
        this._detectMappingMode();

        console.log('[Mapper] Mapping engines initialized');
    }

    /**
     * Check if we're in regular mapping mode
     * @returns {boolean}
     */
    isRegularMode() {
        return this.mappingMode === 'regular';
    }

    /**
     * Check if we're in quick mapping mode
     * @returns {boolean}
     */
    isQuickMode() {
        return this.mappingMode === 'quick';
    }

    // ============ V1 → V2 COORDINATE MIGRATION ============

    /**
     * Migrate V1 fields (bbox percentages) to V2 (PDF points)
     * This runs automatically when loading old mappings
     * @param {Array} fields - Array of field objects to migrate
     * @returns {Object} Migration result with migrated fields and count
     */
    migrateV1toV2(fields) {
        const pageWidth = this.pdfPageDimensions?.width || 595;
        const pageHeight = this.pdfPageDimensions?.height || 842;
        return migrateV1toV2Global(fields, pageWidth, pageHeight);
    }

    /**
     * Safe wrapper for backwards compatibility
     * Migrates all existing fields to V2 coordinate system if needed
     */
    async migrateFieldCoordinates() {
        try {
            // If no fields to migrate, return early
            if (!this.fields || this.fields.length === 0) {
                return;
            }

            // Use existing migration helper to migrate all fields
            const migrationResult = this.migrateV1toV2(this.fields);

            if (migrationResult.migrationCount > 0) {
                this.fields = migrationResult.fields;
                console.log(`✅ Migrated ${migrationResult.migrationCount} fields during PDF load`);
            }
        } catch (err) {
            console.error("Migration error:", err);
            // Fail-safe: continue without migration
        }
    }

    // ============ COORDINATE CONVERSION UTILITIES ============

    /**
     * Get the current PDF page viewport for coordinate conversion
     * @param {number} pageNum - Page number (1-based)
     * @returns {Object} PDF.js viewport object
     */
    async getCurrentPdfViewport(pageNum = null) {
        if (!this.pdfDocument) {
            // Fallback for non-PDF documents - use A4 dimensions in points
            return {
                width: 595,  // A4 width in points
                height: 842, // A4 height in points
                scale: 1
            };
        }
        
        try {
            const page = await this.pdfDocument.getPage(pageNum || this.currentPage);
            const scale = this.dpiSetting / 72; // Current rendering scale
            return page.getViewport({ scale });
        } catch (error) {
            console.error('Error getting PDF viewport:', error);
            // Fallback to A4
            return {
                width: 595,
                height: 842,
                scale: 1
            };
        }
    }

    /**
     * Get current canvas/container dimensions
     * @returns {Object} {width, height} in pixels
     */
    getCurrentCanvasDimensions() {
        const container = document.getElementById('mapping-layer');
        if (!container) return { width: 595, height: 842 };
        
        const rect = container.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height
        };
    }

    /**
     * Convert PDF points to canvas pixel coordinates
     * @param {Array} bbox - [x, y, width, height] in PDF points
     * @param {Object} pdfViewport - PDF viewport object (optional)
     * @returns {Object} {x, y, width, height} in canvas pixels
     */
    async pdfPointsToCanvas(bbox, pdfViewport = null) {
        if (!pdfViewport) {
            pdfViewport = await this.getCurrentPdfViewport();
        }
        
        const canvasDims = this.getCurrentCanvasDimensions();
        
        // Calculate scale factors
        const scaleX = canvasDims.width / pdfViewport.width;
        const scaleY = canvasDims.height / pdfViewport.height;
        
        return {
            x: Math.round(bbox[0] * scaleX),
            y: Math.round(bbox[1] * scaleY),
            width: Math.round(bbox[2] * scaleX),
            height: Math.round(bbox[3] * scaleY)
        };
    }

    /**
     * Convert canvas pixel coordinates to PDF points
     * @param {Object} canvasCoords - {x, y, width, height} in canvas pixels
     * @param {Object} pdfViewport - PDF viewport object (optional)
     * @returns {Array} [x, y, width, height] in PDF points
     */
    async canvasToPdfPoints(canvasCoords, pdfViewport = null) {
        if (!pdfViewport) {
            pdfViewport = await this.getCurrentPdfViewport();
        }
        
        const canvasDims = this.getCurrentCanvasDimensions();
        
        // NEW ARCHITECTURE: Handle high-resolution mapping scale
        let scaleX, scaleY;
        
        if (this.appMode === 'mapper' && this.mappingScale) {
            // In mapping mode with high-res image, account for mapping scale
            scaleX = pdfViewport.width / (canvasDims.width / this.mappingScale);
            scaleY = pdfViewport.height / (canvasDims.height / this.mappingScale);
        } else {
            // Normal PDF.js scale for live fill mode
            scaleX = pdfViewport.width / canvasDims.width;
            scaleY = pdfViewport.height / canvasDims.height;
        }
        
        return [
            Math.round(canvasCoords.x * scaleX * 100) / 100, // Round to 2 decimal places
            Math.round(canvasCoords.y * scaleY * 100) / 100,
            Math.round(canvasCoords.width * scaleX * 100) / 100,
            Math.round(canvasCoords.height * scaleY * 100) / 100
        ];
    }

    /**
     * Convert old percentage-based field to new PDF points format
     * @param {Object} field - Field with xPct, yPct, wPct, hPct properties
     * @returns {Array} [x, y, width, height] in PDF points
     */
    async convertPercentagesToPdfPoints(field) {
        const pdfViewport = await this.getCurrentPdfViewport(field.page);
        
        return [
            Math.round((field.xPct / 100) * pdfViewport.width * 100) / 100,
            Math.round((field.yPct / 100) * pdfViewport.height * 100) / 100,
            Math.round((field.wPct / 100) * pdfViewport.width * 100) / 100,
            Math.round((field.hPct / 100) * pdfViewport.height * 100) / 100
        ];
    }

    // ============ INITIALIZATION ============

    initEventListeners() {
        // Delegate all event listener registration to Events module
        this.Events.attachGlobalEvents(this);
    }
    
    setupResizeObserver() {
        // מעקב אחרי שינויים בגודל mapping-layer - NEW SYSTEM
        if (window.ResizeObserver) {
            const mappingLayer = document.getElementById('mapping-layer');
            if (mappingLayer) {
                let observerTimeout;
                this.resizeObserver = new ResizeObserver(entries => {
                    // CRITICAL: Use centralized protection check (includes dead-zone)
                    if (this._isInRenderProtectedZone()) {
                        this._logLoopProtectionSkip('ResizeObserver-mappingLayer');
                        return;
                    }
                    clearTimeout(observerTimeout);
                    observerTimeout = setTimeout(() => {
                        // Double-check before calling (protection state may have changed)
                        if (!this._isInRenderProtectedZone()) {
                            this.resizeHandler();
                        } else {
                            this._logLoopProtectionSkip('ResizeObserver-mappingLayer-delayed');
                        }
                    }, 100);
                });
                this.resizeObserver.observe(mappingLayer);
            }

            // מעקב גם אחרי pdf-container
            const pdfContainer = document.getElementById('pdf-container');
            if (pdfContainer) {
                let containerTimeout;
                this.containerResizeObserver = new ResizeObserver(entries => {
                    // CRITICAL: Use centralized protection check (includes dead-zone)
                    if (this._isInRenderProtectedZone()) {
                        this._logLoopProtectionSkip('ResizeObserver-pdfContainer');
                        return;
                    }
                    clearTimeout(containerTimeout);
                    containerTimeout = setTimeout(() => {
                        // Double-check before calling (protection state may have changed)
                        if (!this._isInRenderProtectedZone()) {
                            this.resizeHandler();
                        } else {
                            this._logLoopProtectionSkip('ResizeObserver-pdfContainer-delayed');
                        }
                    }, 50);
                });
                this.containerResizeObserver.observe(pdfContainer);
            }
        }
    }

    // ============ HISTORY MANAGEMENT (UNDO/REDO) - NEW ============

    saveState(action) {
        return this.State.saveState(action, this);
    }

    async undo() {
        return this.State.undo(this);
    }

    async redo() {
        return this.State.redo(this);
    }

    async restoreState(state) {
        // Clear current fields
        this.fields.forEach(field => {
            if (field.element) {
                field.element.remove();
            }
        });

        // Clear table overlays
        if (this.mappedTables && this.mappedTables.length > 0) {
            this.mappedTables.forEach(table => {
                if (typeof this.removeTableOverlay === 'function') {
                    this.removeTableOverlay(table.tableId);
                }
            });
        }

        // Restore fields
        this.fields = state.fields.map(f => ({...f}));
        this.tableGroups = state.tableGroups.map(g => ({...g}));
        this.mappedTables = (state.tables || []).map(t => ({...t}));

        // Re-render fields for current page
        const renderPromises = this.fields
            .filter(field => field.isMapped && field.page === this.currentPage)
            .map(field => this.renderField(field));

        await Promise.all(renderPromises);

        // Render table overlays for current page
        if (this.mappedTables.length > 0) {
            this.mappedTables
                .filter(table => table.page === this.currentPage)
                .forEach(table => {
                    if (typeof this.renderTableOverlay === 'function') {
                        this.renderTableOverlay(table);
                    }
                });
        }

        this.updateFieldList();
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        // Delegate to UI module
        this.UI.updateUndoRedoButtons(this.historyIndex, this.history.length);
    }

    // ============ GRID AND SNAP - NEW ============

    toggleSnapToGrid(enabled) {
        this.snapToGrid = enabled;
        this.updateGridOverlay();
        this.showToast(enabled ? 'הצמדה לרשת פעילה' : 'הצמדה לרשת כבויה', 'info');
    }

    updateGridOverlay() {
        // Delegate to UI module
        this.UI.updateGridOverlay(this.snapToGrid);
    }

    /**
     * Toggle Visual Help Guide
     * Shows/hides visual hints for beginners
     */
    toggleVisualHelp() {
        // Initialize visual guide if not already done
        if (!this.visualGuide && window.VisualGuide) {
            const mappingLayer = document.getElementById('mapping-layer');
            this.visualGuide = new window.VisualGuide(mappingLayer);
        }

        if (this.visualGuide) {
            const isVisible = this.visualGuide.toggle();
            this.showToast(isVisible ? 'עזרה חזותית פעילה' : 'עזרה חזותית כבויה', 'info');
        } else {
            console.warn('[Mapper] VisualGuide not loaded');
            this.showToast('מודול העזרה לא נטען', 'warning');
        }
    }

    /**
     * Start visual guide for a specific mode
     * @param {string} mode - Mode: 'text', 'checkbox', 'radio', 'table', 'field'
     */
    startVisualGuide(mode) {
        if (this.visualGuide) {
            this.visualGuide.start(mode);
        }
    }

    /**
     * Stop visual guide when exiting all modes
     * STABILITY: Called when user exits a mode (ESC or toggle off)
     * @param {string} caller - Caller identifier for debugging
     */
    stopVisualGuide(caller = 'exitMode') {
        if (this.visualGuide) {
            this.visualGuide.stop(caller);
        }
    }

    /**
     * Check if any mapping mode is active
     * Uses StateMachine as single source of truth
     * @returns {boolean}
     */
    isAnyMappingModeActive() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (!sm || !MS) {
            // Fallback to table controller check if SM not available
            return (this.tableController && this.tableController.isActive());
        }

        // StateMachine is NOT in IDLE = some mode is active
        return !sm.is(MS.IDLE) || (this.tableController && this.tableController.isActive());
    }

    /**
     * Show visual guide help for a specific step
     * @param {string} step - Step identifier
     */
    showVisualGuideHelp(step) {
        if (this.visualGuide && this.visualGuide.isVisible()) {
            this.visualGuide.showHelp(step);
        }
    }

    // ============ DPI MANAGEMENT - NEW ============

    setDPI(value) {
        this.dpiSetting = parseInt(value);
        this.showToast(`איכות רינדור: ${value} DPI`, 'info');
        
        // Clear cache to force re-render with new DPI
        if (this.pdfDocument) {
            this.pageCache = {};
            this.loadPage(this.currentPage);
        }
    }

    // ============ PAGE VIEW STATE - NEW ============

    savePageViewState() {
        this.pageViewStates[this.currentPage] = {
            zoom: this.zoomLevel,
            panX: this.panX,
            panY: this.panY
        };
    }

    restorePageViewState(pageNum) {
        const state = this.pageViewStates[pageNum];
        if (state) {
            this.zoomLevel = state.zoom;
            this.panX = state.panX;
            this.panY = state.panY;
            this.updateZoomDisplay();
        }
    }

    // ============ AUTO-SAVE FUNCTIONALITY ============

    async checkAutoSave() {
        return this.State.checkAutoSave(this);
    }

    autoSave() {
        return this.State.autoSave(this);
    }

    async loadAutoSave(data) {
        this.fields = data.fields || [];
        this.tableGroups = data.tableGroups || [];
        this.mappedTables = data.tables || [];
        this.currentPage = data.currentPage || 1;
        this.totalPages = data.totalPages || 1;
        this.pageViewStates = data.pageViewStates || {};

        // Restore view state for current page
        this.restorePageViewState(this.currentPage);

        // Re-render fields for current page
        const renderPromises = this.fields
            .filter(field => field.isMapped && field.page === this.currentPage)
            .map(field => this.renderField(field));
        await Promise.all(renderPromises);

        // Render table overlays for current page
        if (this.mappedTables.length > 0) {
            this.mappedTables
                .filter(table => table.page === this.currentPage)
                .forEach(table => {
                    if (typeof this.renderTableOverlay === 'function') {
                        this.renderTableOverlay(table);
                    }
                });
        }

        this.updateFieldList();
        this.updatePageInfo();
    }

    clearAutoSave() {
        if (confirm('האם למחוק את השמירה האוטומטית?')) {
            localStorage.removeItem(this.autoSaveKey);
            this.showToast('השמירה האוטומטית נמחקה', 'success');
        }
    }

    showAutoSaveIndicator() {
        // Delegate to UI module
        this.UI.showAutoSaveIndicator();
    }

    // ============ FILE HANDLING ============

    async handleFileUpload(file) {
        if (!file) return;

        this.setStatus('טוען קובץ...', 'loading');

        // ============ CLEAN UP MAPPING FLOW ON NEW FILE ============
        this.cleanupMappingFlowUI();

        // איפוס ממדים בסיסיים לקובץ חדש
        this.baseDimensions = { width: 0, height: 0 };

        // Clear used texts from NameFusionEngine for new document
        if (window.NameFusionEngine && window.NameFusionEngine.clearUsed) {
            window.NameFusionEngine.clearUsed();
        }

        // Store file reference for auto-save
        this.currentFile = file;

        try {
            const container = document.getElementById('canvas-container');
            if (container) container.style.display = 'block';

            if (file.type === 'application/pdf') {
                await this.loadPDF(file);
            } else if (file.type.startsWith('image/')) {
                await this.loadImage(file);
            } else {
                throw new Error('סוג קובץ לא נתמך');
            }

            this.documentLoaded = true;
            this.resetView();
            this.setStatus(`${file.name} נטען`, 'success');
            this.showToast('הקובץ נטען בהצלחה', 'success');

            // Setup wheel handler on canvas after document is loaded
            this.setupCanvasWheelHandler();

            // ============ CHECK FOR DRAFT RECOVERY ============
            this._checkForDraftRecovery(file);

        } catch (error) {
            this.setStatus('שגיאה בטעינה', 'error');
            this.showToast('שגיאה: ' + error.message, 'error');
            console.error('File loading error:', error);
        }
    }

    // ============ PDF RENDERING ============
    // Delegated to PdfEngine module

    async loadPDF(file) {
        return this.PdfEngine.loadPDF(file, this);
    }

    async loadPage(pageNum) {
        return this.PdfEngine.loadPage(pageNum, this);
    }

    async loadImage(file) {
        return this.PdfEngine.loadImage(file, this);
    }

    // ============ PREVIEW FUNCTIONALITY ============

    async loadPreviewPage(pageNum) {
        return this.PdfEngine.loadPreviewPage(pageNum, this);
    }

    /**
     * Migrate legacy percentage-based fields to PDF coordinates (bbox)
     */
    async migrateLegacyFields() {
        let migrationCount = 0;
        
        for (const field of this.fields) {
            // Only migrate fields that have percentage coordinates but no bbox
            if (field.isMapped && 
                field.xPct != null && field.yPct != null && field.wPct && field.hPct &&
                (!field.bbox || !Array.isArray(field.bbox) || field.bbox.length !== 4)) {
                
                // Convert percentage coordinates to PDF points
                const layer = document.getElementById('mapping-layer');
                if (layer) {
                    const canvasCoords = {
                        x: (field.xPct / 100) * layer.offsetWidth,
                        y: (field.yPct / 100) * layer.offsetHeight,
                        width: (field.wPct / 100) * layer.offsetWidth,
                        height: (field.hPct / 100) * layer.offsetHeight
                    };
                    
                    field.bbox = await this.canvasToPdfPoints(canvasCoords);
                    migrationCount++;
                }
            }
        }
        
        if (migrationCount > 0) {
            console.log(`Migrated ${migrationCount} legacy fields to PDF coordinates`);
            this.autoSave(); // Save the migrated coordinates
        }
    }

    /**
     * Refresh PDF preview with current field data (called automatically when Live Fill data changes)
     */
    async refreshPdfPreview() {
        return this.PdfEngine.refreshPdfPreview(this);
    }

    /**
     * FIX TASK 3: Ensure PDF viewport is ready before executing callback
     * This prevents table overlays from being rendered before the canvas exists
     * @param {number} pageNum - Page number to check
     * @param {Function} callback - Function to execute when viewport is ready
     */
    ensurePDFViewportReady(pageNum, callback) {
        // Check if PDF dimensions are already available
        if (this.pdfPageDimensions && this.documentLoaded) {
            callback();
            return;
        }

        // If not ready, wait and retry
        const maxRetries = 20;
        let retries = 0;
        const checkInterval = setInterval(() => {
            retries++;
            if (this.pdfPageDimensions && this.documentLoaded) {
                clearInterval(checkInterval);
                console.log('[Mapper] PDF viewport ready, executing callback');
                callback();
            } else if (retries >= maxRetries) {
                clearInterval(checkInterval);
                console.warn('[Mapper] PDF viewport not ready after max retries');
            }
        }, 100);
    }

    /**
     * Render field overlays on the PDF preview canvas
     * @param {CanvasRenderingContext2D} context - Canvas context
     * @param {Object} viewport - PDF viewport object
     * @param {number} pageNum - Current page number
     */
    async renderFieldsOnPreviewCanvas(context, viewport, pageNum) {
        // Filter fields for current page
        const pageFields = this.fields.filter(field => 
            field.isMapped && 
            field.page === pageNum && 
            field.bbox && 
            Array.isArray(field.bbox) && 
            field.bbox.length === 4
        );
        
        if (pageFields.length === 0) return;
        
        // Calculate scale factors for preview
        const originalViewport = await this.getCurrentPdfViewport(pageNum);
        const scaleX = viewport.width / originalViewport.width;
        const scaleY = viewport.height / originalViewport.height;
        
        // Render each field overlay
        pageFields.forEach(field => {
            const [xPercent, yPercent, wPercent, hPercent] = field.bbox;
            
            // Convert normalized bbox (bottom-left origin) to preview canvas coordinates
            const previewWidth = wPercent * viewport.width;
            const previewHeight = hPercent * viewport.height;
            const previewX = xPercent * viewport.width;
            const previewY = viewport.height - (yPercent * viewport.height) - previewHeight;
            
            // Draw field boundary
            context.save();
            context.strokeStyle = '#007bff';
            context.lineWidth = 2;
            context.setLineDash([5, 5]);
            context.strokeRect(previewX, previewY, previewWidth, previewHeight);
            
            // Get live fill data for this field
            const liveFill = this.liveFillData[field.id] || {};
            const hasText = liveFill.value && !liveFill.isDummy;
            
            if (hasText) {
                // Use JSON typography settings as single source of truth
                const textSettings = field.textSettings || {};
                
                // Apply typography from JSON with proper fallbacks
                context.fillStyle = textSettings.color || liveFill.style?.color || '#000000';
                context.globalAlpha = textSettings.opacity !== undefined ? textSettings.opacity : 
                    (liveFill.style?.opacity !== undefined ? liveFill.style.opacity : 1.0);
                
                // Font size with pt→px conversion and scaling
                const jsonFontSize = textSettings.fontSize || field.fontSize || 14;
                const scaledFontSize = jsonFontSize * scaleX;
                const fontFamily = textSettings.fontFamily || 'David Libre';
                context.font = `${scaledFontSize}px ${fontFamily}`;
                
                // Text alignment from JSON
                const alignment = textSettings.alignmentH || 'center';
                const verticalAlign = textSettings.alignmentV || 'middle';
                
                context.textAlign = alignment;
                context.textBaseline = verticalAlign;
                
                // Calculate text position for proper centering
                let textX = previewX;
                let textY = previewY;
                
                // Horizontal alignment
                if (alignment === 'center') textX += previewWidth / 2;
                else if (alignment === 'right') textX += previewWidth;
                
                // Vertical alignment - ensure proper centering
                if (verticalAlign === 'middle') textY += previewHeight / 2;
                else if (verticalAlign === 'bottom') textY += previewHeight;
                else if (verticalAlign === 'top') textY += scaledFontSize * 0.8; // Adjust for text baseline
                
                // Apply letter spacing if specified
                const letterSpacing = textSettings.letterSpacing || 0;
                if (letterSpacing !== 0) {
                    context.letterSpacing = `${letterSpacing}px`;
                }
                
                // Draw the text using JSON values
                context.fillText(liveFill.value, textX, textY);
                
                // Reset letter spacing
                context.letterSpacing = '0px';
                context.globalAlpha = 1.0;
            } else {
                // Draw field label when no text
                context.fillStyle = '#007bff';
                context.font = `${Math.max(10, previewHeight * 0.3)}px Arial`;
                context.textAlign = 'left';
                context.textBaseline = 'top';
                
                const label = field.label_he || field.id;
                const labelY = Math.max(previewY - 20, 10);
                
                // Draw label background
                const textMetrics = context.measureText(label);
                context.fillStyle = 'rgba(0, 123, 255, 0.8)';
                context.fillRect(previewX, labelY, textMetrics.width + 6, 16);
                
                // Draw label text
                context.fillStyle = 'white';
                context.fillText(label, previewX + 3, labelY + 2);
            }
            
            context.restore();
        });
    }
    
    syncPreviewToMapping() {
        if (this.pdfDocument && this.currentPage) {
            this.loadPreviewPage(this.currentPage);
            this.showToast('התצוגה המקדימה סונכרנה', 'success');
        }
    }

    /**
     * Update PDF preview in real-time when fields change
     * This is called automatically when fields are modified
     */
    async updatePreviewRealTime() {
        // Only update if preview is visible and we have a PDF
        const previewContainer = document.getElementById('preview-container');
        if (!this.pdfDocument || !previewContainer || previewContainer.style.display === 'none') {
            return;
        }
        
        // Debounce rapid updates
        if (this.previewUpdateTimeout) {
            clearTimeout(this.previewUpdateTimeout);
        }
        
        this.previewUpdateTimeout = setTimeout(async () => {
            try {
                await this.loadPreviewPage(this.currentPage);
            } catch (error) {
                console.error('Error updating preview:', error);
            }
        }, 100); // 100ms debounce
    }
    
    // ============ MOBILE VIEW SWITCHING ============

    switchMobileView(view) {
        // Delegate to UI module
        this.UI.switchMobileView(view);
    }

    // ============ PAGE NAVIGATION ============

    previousPage() {
        if (this.currentPage > 1) {
            this.loadPage(this.currentPage - 1);
            this.loadPreviewPage(this.currentPage - 1);
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.loadPage(this.currentPage + 1);
            this.loadPreviewPage(this.currentPage + 1);
        }
    }

    goToPage(pageNum) {
        // STABILITY: Stop visual guide before page change
        this.stopVisualGuide('pageChange');

        // Clean up mapping flow UI on page change
        this.cleanupMappingFlowUI();

        this.loadPage(pageNum);
        this.loadPreviewPage(pageNum);

        // Visual Test hook - notify runner of page change
        window.VisualTestRunner?.onPageChange(pageNum);
    }

    updatePageSelector() {
        // Delegate to UI module
        this.UI.updatePageSelector(this.totalPages, this.currentPage);
    }

    updatePageInfo() {
        // Delegate to UI module
        this.UI.updatePageInfo(this.currentPage, this.totalPages);
    }

    async updateFieldsForPage(pageNum) {
        // Remove all field overlays
        document.querySelectorAll('.field-overlay').forEach(el => el.remove());

        // Render fields for current page
        const renderPromises = this.fields
            .filter(field => field.page === pageNum && field.isMapped)
            .map(field => this.renderField(field));
        await Promise.all(renderPromises);

        // ========== CENTRALIZED CLEANUP — USE AUTHORITATIVE FUNCTION ==========
        // Remove ALL existing table overlays globally before rendering new page
        this.fullTableOverlayReset('updateFieldsForPage');

        // Render table overlays for current page after cleanup
        if (this.mappedTables && this.mappedTables.length > 0) {
            // Render table overlays and cells for current page only
            this.mappedTables
                .filter(table => (table.page || 1) === pageNum)
                .forEach(table => {
                    if (typeof this.renderTableOverlay === 'function') {
                        this.renderTableOverlay(table);
                    }
                    // Also render table cells for this page
                    if (typeof this.renderTableCells === 'function') {
                        this.renderTableCells(table);
                    }
                });

            console.log(`📐 Rendered table overlays for page ${pageNum}`);
        }

        // Check for overlaps
        this.checkFieldOverlaps();
    }

    // ============ FIELD OVERLAP DETECTION - NEW ============

    checkFieldOverlaps() {
        const mappedFields = this.fields.filter(f => f.isMapped && f.page === this.currentPage);
        
        mappedFields.forEach(field1 => {
            let hasOverlap = false;
            
            mappedFields.forEach(field2 => {
                if (field1.id !== field2.id && this.calculateOverlap(field1, field2) > 0.5) {
                    hasOverlap = true;
                }
            });
            
            if (field1.element) {
                if (hasOverlap) {
                    field1.element.classList.add('overlapping');
                } else {
                    field1.element.classList.remove('overlapping');
                }
            }
        });
    }

    calculateOverlap(field1, field2) {
        const x1 = field1.xPct;
        const y1 = field1.yPct;
        const w1 = field1.wPct;
        const h1 = field1.hPct;
        
        const x2 = field2.xPct;
        const y2 = field2.yPct;
        const w2 = field2.wPct;
        const h2 = field2.hPct;
        
        const xOverlap = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
        const yOverlap = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
        
        const overlapArea = xOverlap * yOverlap;
        const field1Area = w1 * h1;
        
        return field1Area > 0 ? overlapArea / field1Area : 0;
    }

    // ============ FIELD MANAGEMENT ============
    // Delegated to FieldEngine module

    generateUniqueId() {
        return this.FieldEngine.generateUniqueId(this);
    }

    ensureUniqueId(baseId) {
        return this.FieldEngine.ensureUniqueId(baseId, this);
    }

    addNewField() {
        return this.FieldEngine.addNewField(this);
    }

    setAutoNames(field) {
        return this.FieldEngine.setAutoNames(field, this);
    }

    generateEnglishId(hebrewText) {
        return this.FieldEngine.generateEnglishId(hebrewText, this);
    }

    detectTextDirection(text) {
        return this.FieldEngine.detectTextDirection(text, this);
    }

    removeField(fieldId) {
        const result = this.FieldEngine.removeField(fieldId, this);
        this._triggerAutoSave();  // Auto-save after field removal
        return result;
    }

    duplicateField(fieldId) {
        const result = this.FieldEngine.duplicateField(fieldId, this);
        this._triggerAutoSave();  // Auto-save after field duplication
        return result;
    }

    remapField(fieldId) {
        return this.FieldEngine.remapField(fieldId, this);
    }

    addResizeHandles(overlay) {
        const handles = ['nw', 'ne', 'sw', 'se'];
        
        handles.forEach(position => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-${position}`;
            handle.dataset.position = position;
            
            // Position handle based on corner
            const positions = {
                'nw': { top: '-4px', left: '-4px' },
                'ne': { top: '-4px', right: '-4px' },
                'sw': { bottom: '-4px', left: '-4px' },
                'se': { bottom: '-4px', right: '-4px' }
            };
            
            Object.assign(handle.style, positions[position]);
            handle.style.position = 'absolute';
            handle.style.width = '8px';
            handle.style.height = '8px';
            handle.style.background = '#667eea';
            handle.style.border = '1px solid white';
            handle.style.borderRadius = '50%';
            handle.style.cursor = position.includes('n') && position.includes('w') ? 'nw-resize' :
                                  position.includes('n') && position.includes('e') ? 'ne-resize' :
                                  position.includes('s') && position.includes('w') ? 'sw-resize' : 'se-resize';
            handle.style.zIndex = '15';
            handle.style.opacity = '0.8';
            
            overlay.appendChild(handle);
        });
    }

    clearAll() {
        if (this.fields.length === 0) return;
        
        if (!confirm('האם למחוק את כל השדות?')) return;
        
        // Remove all field elements from DOM
        this.fields.forEach(field => {
            if (field.element) {
                field.element.remove();
            }
        });
        
        // Clear data
        this.fields = [];
        this.tableGroups = [];
        this.selectedField = null;
        this.expandedFieldId = null;
        
        this.updateFieldList();
        this.saveState('clear_all');
        this.showToast('כל השדות נמחקו', 'info');
    }

    // ============ FIELD CREATION MODE (Step 1) ============
    // Direct rectangle drawing → field creation without pre-selecting a field

    /**
     * Toggle Field Creation Mode on/off
     * Uses StateMachine as single source of truth
     */
    toggleFieldCreationMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (!sm || !MS) {
            console.error('[toggleFieldCreationMode] StateMachine not available');
            return;
        }

        const btn = document.getElementById('btn-field-creation-mode');
        const isActive = sm.is(MS.FIELD_CREATION);

        if (isActive) {
            // Deactivate - return to IDLE
            sm.setState(MS.IDLE);
            if (btn) btn.classList.remove('active');
            this.setStatus('מוכן', 'success');
            this.updateMappingBadge(null);
            this.showToast('מצב יצירת שדות כבוי', 'info');

            // STABILITY: Stop visual guide if no modes are active
            if (!this.isAnyMappingModeActive()) {
                this.stopVisualGuide();
            }
        } else {
            // Activate - transition to FIELD_CREATION
            if (sm.setState(MS.FIELD_CREATION)) {
                if (btn) btn.classList.add('active');
                this.setStatus('🎯 מצב יצירת שדות - צייר מלבן ליצירת שדה חדש', 'info');
                this.showToast('מצב יצירת שדות פעיל - צייר מלבן על המסמך', 'info');
                this.updateMappingBadge('🎯 מצב יצירת שדות פעיל - Esc לביטול');
                this.startVisualGuide('field');
            }
        }
    }

    /**
     * Activate Field Creation Mode (called from button)
     */
    activateFieldCreationMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;
        if (sm && MS && !sm.is(MS.FIELD_CREATION)) {
            this.toggleFieldCreationMode();
        }
    }

    /**
     * Deactivate Field Creation Mode
     */
    deactivateFieldCreationMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;
        if (sm && MS && sm.is(MS.FIELD_CREATION)) {
            this.toggleFieldCreationMode();
        }
    }

    // ============ FIX PACKAGE 2: ONE-CLICK CHECKBOX/RADIO MODES ============

    /**
     * Toggle Checkbox Creation Mode
     * Uses StateMachine as single source of truth
     */
    toggleCheckboxMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (!sm || !MS) {
            console.error('[toggleCheckboxMode] StateMachine not available');
            return;
        }

        const btn = document.getElementById('btn-checkbox-mode');
        const isActive = sm.is(MS.CHECKBOX_CREATION);

        if (isActive) {
            // Deactivate - return to IDLE
            sm.setState(MS.IDLE);
            if (btn) btn.classList.remove('active');
            this.setStatus('מוכן', 'success');
            this.updateMappingBadge(null);

            // STABILITY: Stop visual guide if no modes are active
            if (!this.isAnyMappingModeActive()) {
                this.stopVisualGuide();
            }
        } else {
            // Activate - transition to CHECKBOX_CREATION
            // StateMachine handles mutual exclusion with other modes
            if (sm.setState(MS.CHECKBOX_CREATION)) {
                if (btn) btn.classList.add('active');
                this.setStatus('☑️ מצב Checkbox - לחץ ליצירת checkbox', 'info');
                this.showToast('מצב Checkbox פעיל - לחץ על המסמך ליצירת checkbox', 'info');
                this.updateMappingBadge('☑️ מצב Checkbox - לחץ ליצירה - Esc לביטול');
                this.startVisualGuide('checkbox');
            }
        }
    }

    /**
     * Deactivate Checkbox Mode
     * Uses StateMachine as single source of truth
     */
    deactivateCheckboxMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (sm && MS && sm.is(MS.CHECKBOX_CREATION)) {
            sm.setState(MS.IDLE);
            const btn = document.getElementById('btn-checkbox-mode');
            if (btn) btn.classList.remove('active');

            // STABILITY: Stop visual guide if no modes are active
            if (!this.isAnyMappingModeActive()) {
                this.stopVisualGuide();
            }
        }
    }

    /**
     * Toggle Radio Creation Mode
     * Uses StateMachine as single source of truth
     */
    toggleRadioMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (!sm || !MS) {
            console.error('[toggleRadioMode] StateMachine not available');
            return;
        }

        const btn = document.getElementById('btn-radio-mode');
        const isActive = sm.is(MS.RADIO_CREATION);

        if (isActive) {
            // Deactivate - return to IDLE
            sm.setState(MS.IDLE);
            if (btn) btn.classList.remove('active');
            this.setStatus('מוכן', 'success');
            this.updateMappingBadge(null);

            // STABILITY: Stop visual guide if no modes are active
            if (!this.isAnyMappingModeActive()) {
                this.stopVisualGuide();
            }
        } else {
            // Activate - transition to RADIO_CREATION
            // StateMachine handles mutual exclusion with other modes
            if (sm.setState(MS.RADIO_CREATION)) {
                if (btn) btn.classList.add('active');
                this.setStatus('🔘 מצב Radio - לחץ ליצירת radio', 'info');
                this.showToast('מצב Radio פעיל - לחץ על המסמך ליצירת radio', 'info');
                this.updateMappingBadge('🔘 מצב Radio - לחץ ליצירה - Esc לביטול');
                this.startVisualGuide('radio');
            }
        }
    }

    /**
     * Deactivate Radio Mode
     * Uses StateMachine as single source of truth
     */
    deactivateRadioMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (sm && MS && sm.is(MS.RADIO_CREATION)) {
            sm.setState(MS.IDLE);
            const btn = document.getElementById('btn-radio-mode');
            if (btn) btn.classList.remove('active');

            // STABILITY: Stop visual guide if no modes are active
            if (!this.isAnyMappingModeActive()) {
                this.stopVisualGuide();
            }
        }
    }

    // ============ SELECT FIELD NAME MODE (Manual Label Selection) ============
    // This mode allows drawing a rectangle to capture text without creating a field
    // The captured text can be used to manually name a field

    /**
     * Toggle Select Field Name Mode
     * Uses StateMachine - this mode is now FLOW_CAPTURE_NAME
     * @deprecated Use startMappingFlow() instead for new code
     */
    toggleSelectFieldNameMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (!sm || !MS) {
            console.error('[toggleSelectFieldNameMode] StateMachine not available');
            return;
        }

        // If already in capture name state, exit
        if (sm.is(MS.FLOW_CAPTURE_NAME)) {
            this.deactivateSelectFieldNameMode();
            return;
        }

        // Transition to FLOW_CAPTURE_NAME via StateMachine
        if (sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } })) {
            this.interaction.mode = 'select_field_name';
            const btn = document.getElementById('btn-select-field-name');
            if (btn) btn.classList.add('active');

            this.setStatus('📝 בחר טקסט - צייר מלבן על טקסט לבחירת שם', 'info');
            this.showToast('מצב בחירת שם שדה - צייר מלבן על הטקסט הרצוי', 'info');
            this.updateMappingBadge('📝 בחר טקסט לשם שדה - Esc לביטול');

            console.log('📝 SelectFieldName mode activated via StateMachine');
        }
    }

    /**
     * Deactivate Select Field Name Mode
     * Uses StateMachine
     */
    deactivateSelectFieldNameMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (sm && MS && sm.is(MS.FLOW_CAPTURE_NAME)) {
            sm.setState(MS.IDLE);
            this.interaction.mode = 'idle';

            const btn = document.getElementById('btn-select-field-name');
            if (btn) btn.classList.remove('active');

            this.setStatus('מוכן', 'success');
            this.updateMappingBadge(null);

            console.log('📝 SelectFieldName mode deactivated via StateMachine');
        }
    }

    /**
     * Activate Draw Field After Name Mode
     * Uses StateMachine - transitions to FLOW_CAPTURE_FIELD
     */
    activateDrawFieldAfterNameMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (!sm || !MS) {
            console.error('[activateDrawFieldAfterNameMode] StateMachine not available');
            return;
        }

        // This should be called when already in FLOW_CAPTURE_NAME, transition to FLOW_CAPTURE_FIELD
        if (sm.setState(MS.FLOW_CAPTURE_FIELD)) {
            this.interaction.mode = 'draw_field_after_name';

            this.setStatus('צייר שדה חדש', 'info');
            this.updateMappingBadge('ציור שדה');

            console.log('📝 Draw Field After Name mode activated via StateMachine');
        }
    }

    /**
     * Deactivate Draw Field After Name Mode
     * Uses StateMachine
     */
    deactivateDrawFieldAfterNameMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Clear pending name data
        if (sm) {
            sm.clearPendingName();
        }

        if (this.interaction.mode === 'draw_field_after_name') {
            this.interaction.mode = 'idle';
        }

        // Only update status/badge if NOT in flow
        // (flow will handle its own status in _completeMappingFlowField)
        const isInFlow = sm && sm.isInFlow();
        if (!isInFlow) {
            this.setStatus('מוכן', 'success');
            this.updateMappingBadge(null);
        }

        console.log('📝 Draw Field After Name mode deactivated', { isInFlow });
    }

    // ============ UNIFIED MAPPING FLOW (Step 5) ============

    /**
     * Check if it's safe to start the mapping flow
     * Uses StateMachine as single source of truth
     * @returns {boolean} true if safe to start, false otherwise
     * @private
     */
    _isSafeToStartFlow() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Check if StateMachine is available
        if (!sm || !MS) {
            console.warn('[_isSafeToStartFlow] StateMachine not available');
            return false;
        }

        // Check drawing/interaction states (runtime flags, not mode flags)
        if (this.isDrawing || this.isDragging || this.isResizing || this.isPanning) {
            return false;
        }

        // Check if table step system is active
        if (this.tableController && this.tableController.isActive()) {
            return false;
        }

        // StateMachine check: only safe if in IDLE state
        if (!sm.is(MS.IDLE)) {
            console.log('[_isSafeToStartFlow] Not safe - StateMachine not in IDLE:', sm.getState());
            return false;
        }

        return true;
    }

    /**
     * Reset all mapping flow state variables
     * Uses StateMachine.reset() as primary mechanism
     * @private
     */
    _resetFlowState() {
        const sm = this.stateMachine;

        // ============ STATEMACHINE RESET ============
        if (sm) {
            sm.reset(true); // This handles all state transitions
        }

        // ============ GUARD FLAGS RESET ============
        this._flowCompletionInProgress = false;
        // Note: Don't reset _lastModeChangeTime here - it's a rate limiter

        // Reset interaction state
        this.interaction.mode = 'idle';

        // Clean up layer classes (UI cleanup handled by StateMachine's _updateUIForState)
        const layer = document.getElementById('mapping-layer');
        if (layer) {
            layer.classList.remove('select-field-name-mode');
            layer.classList.remove('select-field-name-mode-active');
            layer.classList.remove('text-selection-mode');
            layer.classList.remove('draw-field-after-name-mode');
            layer.style.cursor = '';
        }

        // ============ UI CLEANUP ============
        this._hideFlowStepIndicator();
        this._updateMappingFlowUI();

        // ============ DEBUG OVERLAY CLEANUP ============
        if (window.NameDebugOverlay) {
            window.NameDebugOverlay.cleanup();
        }

        // ============ FIELD TYPE SUGGESTION CLEANUP ============
        if (this.fieldTypeSuggestion) {
            this.fieldTypeSuggestion.cleanup();
        }

        // ============ FIELD AUTO-GROUPING CLEANUP ============
        if (this.fieldAutoGrouping) {
            this.fieldAutoGrouping.cleanup();
        }

        // ============ MEMORY CLEANUP ============
        this.lastChosenFieldType = null;
        this.lastFieldBbox = null;

        console.log('🔄 Flow state reset complete via StateMachine');

        // ============ INTEGRITY CHECK: Validate after reset ============
        this.validateMappingIntegrity('_resetFlowState-after');
    }

    /**
     * Validate minimum rectangle size for flow operations
     * CENTRALIZED size validation
     * @param {number} width - Rectangle width in pixels
     * @param {number} height - Rectangle height in pixels
     * @param {string} operationType - 'capture' or 'field'
     * @returns {boolean} true if size is valid
     * @private
     */
    _isValidFlowRectSize(width, height, operationType = 'field') {
        const MIN_CAPTURE_SIZE = 5;   // Minimum for name capture
        const MIN_FIELD_SIZE = 10;    // Minimum for field creation

        const minSize = operationType === 'capture' ? MIN_CAPTURE_SIZE : MIN_FIELD_SIZE;
        return width >= minSize && height >= minSize;
    }

    /**
     * Check if flow trigger should be debounced
     * CENTRALIZED debounce validation
     * @returns {boolean} true if trigger is allowed (not debounced)
     * @private
     */
    _canTriggerFlow() {
        const DEBOUNCE_TIME = 300; // ms
        const now = Date.now();

        if (now - this._lastFlowTriggerTime < DEBOUNCE_TIME) {
            console.log('⚠️ Flow trigger debounced');
            return false;
        }

        this._lastFlowTriggerTime = now;
        return true;
    }

    /**
     * Check if flow is in a valid transition state
     * Uses StateMachine as single source of truth
     * @returns {boolean} true if transition is safe
     * @private
     */
    _isFlowTransitionSafe() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (!sm || !MS) return true;

        // If not in flow, any transition is safe
        if (!sm.isInFlow()) return true;

        // Verify we're in a valid flow state
        const validFlowStates = [MS.FLOW_CAPTURE_NAME, MS.FLOW_CAPTURE_FIELD];
        const currentState = sm.getState();

        if (!validFlowStates.includes(currentState)) {
            console.warn('⚠️ Invalid flow state detected:', currentState);
            return false;
        }

        return true;
    }

    /**
     * Guard against recursive function calls
     * Use at start of critical functions, returns false if recursion detected
     * @param {string} funcName - Name of the function being guarded
     * @returns {boolean} true if safe to proceed, false if recursive call detected
     * @private
     */
    _enterGuarded(funcName) {
        if (this._recursionGuard.has(funcName)) {
            console.error(`🔄 RECURSION BLOCKED: ${funcName} already in call stack!`);
            console.trace('Recursion trace:');
            return false;
        }
        this._recursionGuard.add(funcName);
        return true;
    }

    /**
     * Release guard after function completes
     * Must be called in finally block
     * @param {string} funcName - Name of the function being released
     * @private
     */
    _exitGuarded(funcName) {
        this._recursionGuard.delete(funcName);
    }

    // ============ MAPPING INTEGRITY VALIDATION ============

    /**
     * Validate mapping state integrity
     * Checks for conflicting modes, stuck flags, and state inconsistencies
     * Call at critical points: start of mapping, after field creation, after reset
     * @param {string} context - Where the check is being called from
     * @returns {Object} { valid, errors, warnings, activeModes, flowState }
     */
    validateMappingIntegrity(context = 'unknown') {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;
        const errors = [];
        const warnings = [];

        // ============ CHECK 1: StateMachine State Consistency ============
        if (!sm || !MS) {
            warnings.push('StateMachine not available for validation');
        } else {
            const currentState = sm.getState();
            const validation = sm.validate();

            if (!validation.valid) {
                errors.push(...validation.errors);
            }
            warnings.push(...validation.warnings);
        }

        // ============ CHECK 2: Stuck Guard Flags ============
        if (this._flowCompletionInProgress) {
            warnings.push('_flowCompletionInProgress stuck true');
        }

        if (this._recursionGuard && this._recursionGuard.size > 0) {
            const stuck = [...this._recursionGuard];
            warnings.push(`Stuck recursion guards: ${stuck.join(', ')}`);
        }

        // ============ CHECK 3: Flow State Consistency (via StateMachine) ============
        if (sm && sm.isInFlow()) {
            const currentState = sm.getState();
            const pendingName = sm.getPendingName();
            const flowType = sm.getFlowType();

            // FLOW_CAPTURE_NAME should not have pending name yet
            if (currentState === MS.FLOW_CAPTURE_NAME && pendingName) {
                warnings.push('In FLOW_CAPTURE_NAME but pending name already exists');
            }

            // FLOW_CAPTURE_FIELD should have pending name
            if (currentState === MS.FLOW_CAPTURE_FIELD && !pendingName) {
                warnings.push('In FLOW_CAPTURE_FIELD but no pending name');
            }

            // Flow should have a type
            if (!flowType) {
                warnings.push('Flow active but no flow type set');
            }
        }

        // ============ CHECK 4: Type Suggestion State ============
        if (this.fieldTypeSuggestion && sm) {
            if (this.fieldTypeSuggestion.isVisible && !sm.isInFlow()) {
                warnings.push('Type suggestion visible but flow not active');
            }
        }

        // ============ CHECK 5: Interaction Mode vs StateMachine Consistency ============
        if (sm && MS) {
            const currentState = sm.getState();
            const interactionMode = this.interaction?.mode;

            const expectedInteraction = {
                [MS.FLOW_CAPTURE_NAME]: 'select_field_name',
                [MS.FLOW_CAPTURE_FIELD]: 'draw_field_after_name',
                [MS.FIELD_CREATION]: 'field_creation',
                [MS.IDLE]: 'idle'
            };

            if (expectedInteraction[currentState] && interactionMode !== expectedInteraction[currentState]) {
                warnings.push(`State ${currentState} expects interaction.mode=${expectedInteraction[currentState]}, got ${interactionMode}`);
            }
        }

        // ============ CHECK 6: Background Systems During Manual Flow ============
        if (sm && sm.isInFlow()) {
            if (this.fieldAutoGrouping && this.fieldAutoGrouping.isActive()) {
                warnings.push('Auto-grouping suggestion active during manual mapping flow');
            }
        }

        // ============ RESULT ============
        const result = {
            valid: errors.length === 0,
            errors,
            warnings,
            stateMachine: sm ? {
                state: sm.getState(),
                isInFlow: sm.isInFlow(),
                flowType: sm.getFlowType(),
                hasPendingName: !!sm.getPendingName()
            } : null,
            context
        };

        // Log issues
        if (errors.length > 0) {
            console.error(`❌ [${context}] INTEGRITY ERRORS:`, errors);
        }
        if (warnings.length > 0) {
            console.warn(`⚠️ [${context}] Integrity warnings:`, warnings);
        }

        // Track in FreezeDetector
        if (window.FreezeDetector && errors.length > 0) {
            window.FreezeDetector.track('integrityError');
        }

        return result;
    }

    /**
     * Force reset all mapping state to clean baseline
     * Uses StateMachine.reset() as primary mechanism
     * Use as emergency recovery
     */
    forceResetMappingState() {
        console.warn('🚨 FORCE RESET: Clearing all mapping state via StateMachine');

        const sm = this.stateMachine;

        // ============ PRIMARY: Reset via StateMachine ============
        if (sm) {
            sm.reset(true); // Force reset clears all state
        }

        // ============ GUARD FLAGS ============
        this._flowCompletionInProgress = false;
        this._recursionGuard.clear();

        // ============ INTERACTION STATE ============
        this.interaction.mode = 'idle';
        this.isDrawing = false;
        this.isDragging = false;
        this.isResizing = false;

        // ============ UI CLEANUP ============
        const layer = document.getElementById('mapping-layer');
        if (layer) {
            layer.className = 'mapping-layer';
            layer.style.cursor = '';
        }

        // Clear all button active states
        const buttons = [
            'btn-field-creation-mode', 'btn-checkbox-mode', 'btn-radio-mode',
            'btn-grouping-mode', 'btn-select-field-name', 'btn-text-selection-mode',
            'btn-table-mapping-mode'
        ];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.remove('active');
        });

        // Clear suggestion popups
        if (this.fieldTypeSuggestion) {
            this.fieldTypeSuggestion.hide();
        }
        if (this.fieldAutoGrouping) {
            this.fieldAutoGrouping.hide();
        }

        this.setStatus('מוכן', 'success');
        this.updateMappingBadge(null);
        this._hideFlowStepIndicator();

        console.log('🔧 Force reset complete via StateMachine');
    }

    /**
     * Suggest field type based on rectangle dimensions
     * HEURISTICS ONLY - does not modify any existing logic
     * Includes memory-based preference for nearby fields
     * @param {Object} bbox - { x, y, width, height } in canvas coordinates
     * @returns {string} Suggested field type: 'text' | 'checkbox' | 'radio' | 'table'
     * @private
     */
    _suggestFieldTypeByRect(bbox) {
        const { width, height } = bbox;

        // ============ MEMORY: Prefer last chosen type for nearby fields ============
        if (this.lastChosenFieldType && this.lastFieldBbox) {
            const dist = this._distanceBetweenCenters(bbox, this.lastFieldBbox);

            // If fields are close, prefer continuation
            if (dist < 180) {
                console.log('🧠 Memory: using last chosen type', this.lastChosenFieldType, 'distance:', Math.round(dist));
                return this.lastChosenFieldType;
            }
        }

        // ============ HEURISTICS: Size-based detection ============

        // Checkbox detection: small square
        if (width < 30 && height < 30 && Math.abs(width - height) < 8) {
            return 'checkbox';
        }

        // Radio: same detection as checkbox for now (future expansion)
        if (width < 30 && height < 30) {
            return 'radio';
        }

        // Table suggestion: wide or tall area
        if (width > 250 || height > 80) {
            return 'table';
        }

        // Default
        return 'text';
    }

    /**
     * Calculate distance between centers of two bounding boxes
     * Used for memory-based field type suggestion
     * @param {Object} b1 - First bbox { x, y, width, height }
     * @param {Object} b2 - Second bbox { x, y, width, height }
     * @returns {number} Distance in pixels
     * @private
     */
    _distanceBetweenCenters(b1, b2) {
        const c1x = b1.x + b1.width / 2;
        const c1y = b1.y + b1.height / 2;
        const c2x = b2.x + b2.width / 2;
        const c2y = b2.y + b2.height / 2;
        return Math.sqrt(Math.pow(c1x - c2x, 2) + Math.pow(c1y - c2y, 2));
    }

    /**
     * Get or create the FieldTypeSuggestion instance (lazy initialization)
     * @returns {Object|null} FieldTypeSuggestion instance or null if not available
     * @private
     */
    _getFieldTypeSuggestion() {
        // Lazy initialization
        if (!this.fieldTypeSuggestion && FieldTypeSuggestionClass) {
            this.fieldTypeSuggestion = new FieldTypeSuggestionClass(this);
        }
        return this.fieldTypeSuggestion;
    }

    /**
     * Get or create the FieldAutoGrouping instance (lazy initialization)
     * @returns {Object|null} FieldAutoGrouping instance or null if not available
     * @private
     */
    _getFieldAutoGrouping() {
        // Lazy initialization
        if (!this.fieldAutoGrouping && FieldAutoGroupingClass) {
            this.fieldAutoGrouping = new FieldAutoGroupingClass(this);
        }
        return this.fieldAutoGrouping;
    }

    /**
     * Get or create the SmartAutoSave instance (lazy initialization)
     * @returns {Object|null} SmartAutoSave instance or null if not available
     * @private
     */
    _getSmartAutoSave() {
        // Lazy initialization
        if (!this.smartAutoSave && SmartAutoSaveClass) {
            this.smartAutoSave = new SmartAutoSaveClass(this);
            this.smartAutoSave.init();
        }
        return this.smartAutoSave;
    }

    /**
     * Trigger auto-save after field changes
     * Call this whenever fields are added, updated, or removed
     * @private
     */
    _triggerAutoSave() {
        const autoSave = this._getSmartAutoSave();
        if (autoSave) {
            autoSave.scheduleSave();
        }
    }

    /**
     * Unified entry point for field creation
     * Called after any field is created from any mechanism
     * Ensures field is properly registered, sidebar updated, and auto-saved
     * @param {Object} field - The created field object
     * @private
     */
    _onFieldCreated(field) {
        try {
            console.log('[DEBUG][_onFieldCreated] Called with field:', field?.id);
            console.log('[DEBUG][_onFieldCreated] Current fields count:', this.fields.length);

            // 1. Add to main fields array (if not already added)
            if (!this.fields.includes(field)) {
                this.fields.push(field);
                console.log('[DEBUG][_onFieldCreated] Field ADDED to array, total:', this.fields.length);
            } else {
                console.log('[DEBUG][_onFieldCreated] Field already in array, total:', this.fields.length);
            }

            // 2. Render the field overlay immediately
            if (field.isMapped && typeof this.renderField === "function") {
                this.renderField(field);
                console.log('[DEBUG][_onFieldCreated] Field overlay rendered');
            }

            // 3. Update sidebar
            if (typeof this.updateFieldList === "function") {
                this.updateFieldList();
            }

            // 4. Trigger Smart Auto-Save (if enabled)
            if (this.smartAutoSave && typeof this._triggerAutoSave === "function") {
                this._triggerAutoSave();
            }

            // 5. Monitoring log
            console.log("[DEBUG][_onFieldCreated] Field registered:", {
                id: field?.id,
                type: field?.type,
                page: field?.page,
                isMapped: field?.isMapped,
                bbox: field?.bbox,
                fieldsArrayLength: this.fields.length,
                inFieldsArray: this.fields.includes(field)
            });

        } catch (err) {
            console.error("❌ Error in _onFieldCreated:", err);
        }
    }

    /**
     * Check for draft recovery when a file is loaded
     * Shows recovery dialog if a draft exists
     * @param {File} file - The loaded file
     * @private
     */
    _checkForDraftRecovery(file) {
        const autoSave = this._getSmartAutoSave();
        if (!autoSave) return;

        const draft = autoSave.checkForDraft(file.name, file.size);
        if (!draft) return;

        const draftInfo = autoSave.getPendingDraftInfo();
        if (!draftInfo) return;

        // Show draft recovery dialog
        this._showDraftRecoveryDialog(draftInfo);
    }

    /**
     * Show the draft recovery dialog
     * @param {Object} draftInfo - Information about the draft
     * @private
     */
    _showDraftRecoveryDialog(draftInfo) {
        // Remove existing dialog if any
        const existing = document.getElementById('draft-recovery-dialog');
        if (existing) existing.remove();

        // Create dialog
        const dialog = document.createElement('div');
        dialog.id = 'draft-recovery-dialog';
        dialog.className = 'draft-recovery-dialog';
        dialog.innerHTML = `
            <div class="drd-content">
                <div class="drd-icon">💾</div>
                <div class="drd-text">
                    <div class="drd-title">נמצא טיוטה שמורה</div>
                    <div class="drd-info">
                        <span>${draftInfo.fieldsCount} שדות</span>
                        <span>•</span>
                        <span>${draftInfo.ageText}</span>
                    </div>
                </div>
            </div>
            <div class="drd-buttons">
                <button class="drd-btn drd-btn-restore" data-action="restore">שחזר</button>
                <button class="drd-btn drd-btn-discard" data-action="discard">התעלם</button>
            </div>
        `;

        document.body.appendChild(dialog);

        // Attach handlers
        const restoreBtn = dialog.querySelector('[data-action="restore"]');
        const discardBtn = dialog.querySelector('[data-action="discard"]');

        restoreBtn.addEventListener('click', () => {
            this._restoreDraft();
            dialog.remove();
        });

        discardBtn.addEventListener('click', () => {
            this._discardDraft();
            dialog.remove();
        });

        // Auto-dismiss after 15 seconds
        setTimeout(() => {
            if (dialog.parentNode) {
                dialog.remove();
            }
        }, 15000);
    }

    /**
     * Restore the pending draft
     * @private
     */
    _restoreDraft() {
        const autoSave = this._getSmartAutoSave();
        if (!autoSave || !autoSave.pendingDraft) return;

        const success = autoSave.loadDraft(autoSave.pendingDraft.draft);
        if (success) {
            // Re-render all fields
            this.renderAllFieldOverlays();
            this.updateFieldList();
            this.showToast(`✅ שוחזרו ${autoSave.pendingDraft.draft.fields.length} שדות`, 'success');
        } else {
            this.showToast('⚠️ שגיאה בשחזור הטיוטה', 'error');
        }

        autoSave.pendingDraft = null;
    }

    /**
     * Discard the pending draft
     * @private
     */
    _discardDraft() {
        const autoSave = this._getSmartAutoSave();
        if (autoSave) {
            autoSave.dismissPendingDraft();
        }
        this.showToast('הטיוטה נמחקה', 'info');
    }

    /**
     * Start the Unified Mapping Flow
     * Uses StateMachine as single source of truth
     * Linear workflow: Select type → Capture name → Draw field → Repeat
     * @param {string} type - Field type: 'text' | 'checkbox' | 'radio' | 'table'
     */
    startMappingFlow(type) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // ============ GUARD: StateMachine available ============
        if (!sm || !MS) {
            console.error('[startMappingFlow] StateMachine not available');
            this.showToast('שגיאה במערכת', 'error');
            return;
        }

        // ============ INTEGRITY CHECK ============
        this.validateMappingIntegrity('startMappingFlow-before');

        // ============ GUARD: Document loaded ============
        if (!this.documentLoaded) {
            this.showToast('יש לטעון מסמך קודם', 'warning');
            return;
        }

        // ============ GUARD: Valid type ============
        const validTypes = ['text', 'checkbox', 'radio', 'table'];
        if (!validTypes.includes(type)) {
            console.warn('Invalid mapping flow type:', type);
            return;
        }

        // ============ QUICK MODE: Route to QuickMapperEngine ============
        if (this.mappingMode === 'quick' && window.QuickMapperEngine) {
            console.log('[startMappingFlow] Routing to QuickMapperEngine:', type);

            // Reset any existing flow first
            if (!sm.is(MS.IDLE)) {
                sm.reset(true);
            }

            // Start appropriate quick flow
            if (type === 'text') {
                window.QuickMapperEngine.startTextFlow(this);
            } else if (type === 'radio') {
                window.QuickMapperEngine.startRadioFlow(this);
            } else if (type === 'checkbox') {
                window.QuickMapperEngine.startCheckboxFlow(this);
            } else if (type === 'table') {
                // Table uses the existing table wizard, not quick mode
                this._startLegacyMappingFlow(type);
            }

            // Update UI to reflect the active flow
            this._updateMappingFlowUI();
            return;
        }

        // ============ REGULAR MODE: Use existing flow ============
        this._startLegacyMappingFlow(type);
    }

    /**
     * Start the legacy mapping flow (for regular mode or table type)
     * @param {string} type - Field type
     * @private
     */
    _startLegacyMappingFlow(type) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // ============ GUARD: Already in same flow type ============
        if (sm.is(MS.FLOW_CAPTURE_NAME) && sm.getFlowType() === type) {
            console.log('⚠️ Flow already active with same type, ignoring');
            return;
        }

        // ============ GUARD: In field capture state ============
        if (sm.is(MS.FLOW_CAPTURE_FIELD)) {
            this.showToast('יש לסיים את ציור השדה הנוכחי', 'warning');
            console.warn('Cannot start mapping flow - in field capture state');
            return;
        }

        // ============ GUARD: Interacting ============
        if (sm.isInteracting()) {
            this.showToast('יש לסיים את הפעולה הנוכחית', 'warning');
            console.warn('Cannot start mapping flow - interacting');
            return;
        }

        // ============ GUARD: Table controller active ============
        if (this.tableController && this.tableController.isActive()) {
            this.showToast('יש לסיים את מיפוי הטבלה', 'warning');
            return;
        }

        // ============ RESET TO IDLE IF NEEDED ============
        if (!sm.is(MS.IDLE)) {
            sm.reset(true);
        }

        // ============ TRANSITION TO FLOW_CAPTURE_NAME ============
        const success = sm.setState(MS.FLOW_CAPTURE_NAME, {
            data: { type: type }
        });

        if (success) {
            this.interaction.mode = 'select_field_name';

            // Update UI
            this._updateMappingFlowUI();
            this._showFlowStepIndicator('capture_name');

            const btn = document.getElementById('btn-select-field-name');
            if (btn) btn.classList.add('active');

            this.setStatus('📝 בחר טקסט - צייר מלבן על טקסט לבחירת שם', 'info');
            this.updateMappingBadge('📝 בחר טקסט לשם שדה - Esc לביטול');

            // Show toast
            const typeLabels = {
                'text': 'טקסט',
                'checkbox': 'Checkbox',
                'radio': 'Radio',
                'table': 'טבלה'
            };
            this.showToast(`🚀 מיפוי ${typeLabels[type]} התחיל`, 'info');

            console.log('🚀 Mapping Flow started via StateMachine:', { type, state: MS.FLOW_CAPTURE_NAME });
        } else {
            console.error('Failed to start mapping flow via StateMachine');
            this.showToast('לא ניתן להתחיל מיפוי', 'error');
        }
    }

    /**
     * Exit the Unified Mapping Flow
     * Uses StateMachine as single source of truth
     * @param {boolean} silent - If true, don't show toast
     */
    exitMappingFlow(silent = false) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // ============ GUARD: StateMachine available ============
        if (!sm || !MS) {
            console.error('[exitMappingFlow] StateMachine not available');
            return;
        }

        // ============ GUARD: Must be in flow ============
        if (!sm.isInFlow()) {
            console.log('exitMappingFlow: Not in flow state, ignoring');
            return;
        }

        // ============ RESET VIA STATEMACHINE ============
        sm.reset(true);

        // ============ INTERACTION STATE ============
        this.interaction.mode = 'idle';

        // ============ UI CLEANUP ============
        this._hideFlowStepIndicator();
        this._updateMappingFlowUI();

        const btn = document.getElementById('btn-select-field-name');
        if (btn) btn.classList.remove('active');

        // ============ USER FEEDBACK ============
        if (!silent) {
            this.showToast('יציאה ממצב מיפוי מהיר', 'info');
        }

        this.setStatus('מוכן', 'success');
        console.log('🛑 Mapping Flow exited via StateMachine');
    }

    /**
     * Continue flow to next step (internal use)
     * Uses StateMachine - transitions FLOW_CAPTURE_NAME → FLOW_CAPTURE_FIELD
     * @param {string} capturedText - Text captured in capture_name step
     * @param {string} source - Source of captured text
     */
    _continueMappingFlow(capturedText, source) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // ============ GUARD: Recursion protection ============
        if (!this._enterGuarded('_continueMappingFlow')) return;

        try {
            // ============ GUARD: StateMachine available ============
            if (!sm || !MS) {
                console.error('[_continueMappingFlow] StateMachine not available');
                return;
            }

            // ============ GUARD: Text must be valid ============
            if (!capturedText || capturedText.trim().length === 0) {
                console.warn('⚠️ _continueMappingFlow called with empty text');
                return;
            }

            // ============ GUARD: Must be in FLOW_CAPTURE_NAME ============
            if (!sm.is(MS.FLOW_CAPTURE_NAME)) {
                console.warn('⚠️ _continueMappingFlow called in wrong state:', sm.getState());
                return;
            }

            // ============ STORE NAME DATA IN STATEMACHINE ============
            const nameData = {
                text: capturedText.trim(),
                key: this._generateFieldKey(capturedText),
                source: source
            };
            sm.setPendingName(nameData);

            // ============ TRANSITION TO FLOW_CAPTURE_FIELD ============
            const success = sm.setState(MS.FLOW_CAPTURE_FIELD, {
                data: { pendingName: nameData }
            });

            if (success) {
                this.interaction.mode = 'draw_field_after_name';

                // Update UI
                this._updateMappingFlowUI();
                this._showFlowStepIndicator('capture_field');

                // User feedback
                this.showToast(`✅ "${capturedText}" נלכד`, 'success');

                console.log('🔄 Mapping Flow via StateMachine: FLOW_CAPTURE_NAME → FLOW_CAPTURE_FIELD', {
                    name: capturedText,
                    type: sm.getFlowType()
                });
            } else {
                console.error('Failed to transition to FLOW_CAPTURE_FIELD');
            }
        } finally {
            this._exitGuarded('_continueMappingFlow');
        }
    }

    /**
     * Complete current field and restart flow for next field
     * Uses StateMachine - transitions FLOW_CAPTURE_FIELD → FLOW_CAPTURE_NAME (loop)
     * @param {Object} field - The created field
     */
    _completeMappingFlowField(field) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // ============ GUARD: Recursion protection ============
        if (!this._enterGuarded('_completeMappingFlowField')) return;

        // ============ GUARD: Prevent double execution ============
        if (this._flowCompletionInProgress) {
            console.warn('⚠️ _completeMappingFlowField already in progress, skipping');
            this._exitGuarded('_completeMappingFlowField');
            return;
        }

        this._flowCompletionInProgress = true;

        try {
            // ============ GUARD: StateMachine available ============
            if (!sm || !MS) {
                console.error('[_completeMappingFlowField] StateMachine not available');
                return;
            }

            // ============ GUARD: Must be in FLOW_CAPTURE_FIELD ============
            if (!sm.is(MS.FLOW_CAPTURE_FIELD)) {
                console.warn('⚠️ _completeMappingFlowField called in wrong state:', sm.getState());
                return;
            }

            // ============ FUSION ENGINE: Mark text as used ============
            const pendingName = sm.getPendingName();
            if (window.NameFusionEngine && pendingName && pendingName.text) {
                if (!window.NameFusionEngine.isUsed || !window.NameFusionEngine.isUsed(pendingName.text)) {
                    window.NameFusionEngine.markAsUsed(pendingName.text);
                }
            }

            // ============ CLEAR PENDING NAME IN STATEMACHINE ============
            sm.clearPendingName();

            // ============ TRANSITION BACK TO FLOW_CAPTURE_NAME (loop) ============
            const success = sm.setState(MS.FLOW_CAPTURE_NAME);

            if (success) {
                this.interaction.mode = 'select_field_name';

                // Update UI
                this._updateMappingFlowUI();
                this._showFlowStepIndicator('capture_name');

                const btn = document.getElementById('btn-select-field-name');
                if (btn) btn.classList.add('active');

                this.setStatus('📝 בחר טקסט - צייר מלבן על טקסט לבחירת שם', 'info');
                this.updateMappingBadge('📝 בחר טקסט לשם שדה - Esc לביטול');

                // User feedback
                this.showToast(`✅ שדה נוצר בהצלחה`, 'success');

                console.log('✅ Mapping Flow via StateMachine: FLOW_CAPTURE_FIELD → FLOW_CAPTURE_NAME', {
                    fieldId: field?.id,
                    type: sm.getFlowType()
                });

                // ============ INTEGRITY CHECK ============
                this.validateMappingIntegrity('_completeMappingFlowField-after');
            } else {
                console.error('Failed to transition back to FLOW_CAPTURE_NAME');
            }
        } finally {
            this._flowCompletionInProgress = false;
            this._exitGuarded('_completeMappingFlowField');
        }
    }

    /**
     * Update UI elements for mapping flow
     * Uses StateMachine as single source of truth
     * @private
     */
    _updateMappingFlowUI() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        const flowGroup = document.querySelector('.mapping-flow-group');
        const exitBtn = document.getElementById('btn-flow-exit');
        const textBtn = document.getElementById('btn-flow-text');
        const checkboxBtn = document.getElementById('btn-flow-checkbox');
        const radioBtn = document.getElementById('btn-flow-radio');
        const tableBtn = document.getElementById('btn-flow-table');

        // IDs of other creation buttons to disable during flow
        const otherCreationBtnIds = [
            'btn-field-creation-mode',
            'btn-text-selection-mode',
            'btn-select-field-name',
            'btn-checkbox-mode',
            'btn-radio-mode',
            'btn-grouping-mode',
            'btn-option-grouping-mode',
            'btn-table-mapping-mode',
            'btn-preview-mode'
        ];

        // Check if in flow via StateMachine
        const isInFlow = sm && sm.isInFlow();
        const flowType = sm ? sm.getFlowType() : null;

        if (isInFlow) {
            // Add active class to flow group
            if (flowGroup) flowGroup.classList.add('flow-active');

            // Show exit button
            if (exitBtn) exitBtn.style.display = 'flex';

            // Highlight active type button
            [textBtn, checkboxBtn, radioBtn, tableBtn].forEach(btn => {
                if (btn) btn.classList.remove('active');
            });

            const activeBtn = {
                'text': textBtn,
                'checkbox': checkboxBtn,
                'radio': radioBtn,
                'table': tableBtn
            }[flowType];

            if (activeBtn) activeBtn.classList.add('active');

            // Disable other creation buttons during flow
            otherCreationBtnIds.forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add('flow-disabled');
                }
            });
        } else {
            // Remove active state
            if (flowGroup) flowGroup.classList.remove('flow-active');
            if (exitBtn) exitBtn.style.display = 'none';

            [textBtn, checkboxBtn, radioBtn, tableBtn].forEach(btn => {
                if (btn) btn.classList.remove('active');
            });

            // Re-enable other creation buttons
            otherCreationBtnIds.forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove('flow-disabled');
                }
            });
        }
    }

    /**
     * Show flow step indicator with enhanced UI
     * @param {string} step - Current step: 'capture_name' | 'capture_field'
     * @private
     */
    _showFlowStepIndicator(step) {
        // Remove existing indicator
        this._hideFlowStepIndicator();

        const indicator = document.createElement('div');
        indicator.id = 'mapping-flow-step-indicator';
        indicator.className = `mapping-flow-step-indicator step-${step.replace('_', '-')}`;

        const typeConfig = {
            'text': { icon: '📝', label: 'Text' },
            'checkbox': { icon: '☑️', label: 'Checkbox' },
            'radio': { icon: '🔘', label: 'Radio' },
            'table': { icon: '📊', label: 'Table' }
        };

        const flowType = this.stateMachine?.getFlowType?.() || 'text';
        const config = typeConfig[flowType] || { icon: '📐', label: 'Field' };

        if (step === 'capture_name') {
            indicator.innerHTML = `
                <span class="esc-hint">ESC ליציאה</span>
                <span class="step-icon">${config.icon}</span>
                <span class="step-type">${config.label}</span>
                <span class="step-number">1/2</span>
                <span class="step-text">צייר מלבן על שם השדה</span>
            `;
        } else if (step === 'capture_field') {
            indicator.innerHTML = `
                <span class="esc-hint">ESC ליציאה</span>
                <span class="step-icon">${config.icon}</span>
                <span class="step-type">${config.label}</span>
                <span class="step-number">2/2</span>
                <span class="step-text">צייר את השדה עצמו</span>
            `;
        }

        document.body.appendChild(indicator);
    }

    /**
     * Hide flow step indicator
     * @private
     */
    _hideFlowStepIndicator() {
        const existing = document.getElementById('mapping-flow-step-indicator');
        if (existing) existing.remove();
    }

    /**
     * Clean up all mapping flow UI elements
     * Called on page change, zoom, resize, and document unload
     * Uses centralized _resetFlowState for complete cleanup
     */
    cleanupMappingFlowUI() {
        // Deactivate sub-modes first (before state reset)
        this.deactivateSelectFieldNameMode();
        this.deactivateDrawFieldAfterNameMode();

        // Use centralized reset (handles all state + UI)
        this._resetFlowState();

        console.log('🧹 Mapping Flow UI cleaned up');
    }

    /**
     * Set pending field name (captured text)
     * @param {string} text - The captured text
     * @param {string} source - Source of the text ('pdf' or 'ocr')
     */
    setPendingFieldName(text, source = 'pdf') {
        this.pendingFieldName = {
            text: text,
            source: source,
            manualLabel: true,
            timestamp: Date.now()
        };
        console.log('📝 Pending field name set:', this.pendingFieldName);
    }

    /**
     * Clear pending field name
     */
    clearPendingFieldName() {
        this.pendingFieldName = null;
    }

    /**
     * Apply pending field name to a field
     * @param {string} fieldId - ID of the field to apply the name to
     * @returns {boolean} - True if applied successfully
     */
    applyPendingFieldNameToField(fieldId) {
        if (!this.pendingFieldName || !this.pendingFieldName.text) {
            this.showToast('אין שם שדה לבחירה', 'warning');
            return false;
        }

        const field = this.fields.find(f => f.id === fieldId);
        if (!field) {
            this.showToast('שדה לא נמצא', 'error');
            return false;
        }

        const text = this.pendingFieldName.text;
        const key = this._generateFieldKey(text);

        // Apply the name
        field.labelHe = text;
        field.label_he = text;
        field.hebrewName = text;
        field.labelEn = key;
        field.label_en = key;
        field.englishId = key;
        field.manualLabel = true;
        field._userEditedName = true;  // Mark as manually edited
        field.isUnnamed = false;

        this.clearPendingFieldName();
        this.updateFieldList();
        this.saveState('apply_field_name');
        this.showToast(`שם השדה עודכן: ${text}`, 'success');

        console.log('📝 Applied pending field name to field:', fieldId, text);
        return true;
    }

    /**
     * Generate a field key from Hebrew text
     * @param {string} text - Hebrew text
     * @returns {string} - English field key
     */
    _generateFieldKey(text) {
        return text
            .normalize("NFKD")
            .replace(/[^\u0590-\u05FFa-zA-Z0-9 ]/g, "")
            .trim()
            .split(/\s+/)
            .map(w => w.toLowerCase())
            .join("_");
    }

    /**
     * Handle rectangle drawn in SelectFieldName mode
     * Extracts text from the selected region, with OCR fallback
     * After successful capture, enters draw_field_after_name mode
     * @param {Object} bbox - { x, y, width, height } in canvas coordinates
     */
    async handleSelectFieldNameRect(bbox) {
        console.log('📝 [handleSelectFieldNameRect] Called with bbox:', bbox);

        // ============ CENTRALIZED SIZE GUARD ============
        if (!this._isValidFlowRectSize(bbox.width, bbox.height, 'capture')) {
            console.log('⚠️ Selection too small, ignoring:', { width: bbox.width, height: bbox.height });
            return;
        }

        // ============ CENTRALIZED DEBOUNCE GUARD ============
        if (!this._canTriggerFlow()) {
            return;
        }

        let capturedText = null;
        let sourceType = null;

        try {
            // SAFE: Load page text cache
            const pageTextItems = await this.loadPageTextCache(this.currentPage);

            // SAFE: Extract text inside the bbox
            let extractedText = this._extractTextInsideBBox(bbox, pageTextItems);

            if (!extractedText || extractedText.trim().length === 0) {
                // No PDF text found - try OCR fallback
                console.log('📝 No PDF text found, attempting OCR fallback...');

                if (OCREngine) {
                    // Get the PDF canvas for cropping
                    const pdfCanvas = document.querySelector('#pdf-container canvas');

                    if (pdfCanvas) {
                        this.showToast('מנסה זיהוי OCR...', 'info');

                        const ocrText = await OCREngine.recognizeFromCanvas(pdfCanvas, bbox);

                        if (ocrText && ocrText.trim().length > 0) {
                            // OCR succeeded
                            capturedText = ocrText.trim();
                            sourceType = 'ocr';
                            console.log('📝 OCR text captured:', capturedText);
                        } else {
                            // OCR also failed
                            this.showToast('לא נמצא טקסט באזור הנבחר', 'warning');
                            console.log('📝 OCR returned no text for bbox:', bbox);
                        }
                    } else {
                        this.showToast('לא נמצא טקסט באזור הנבחר', 'warning');
                        console.log('📝 No canvas found for OCR fallback');
                    }
                } else {
                    // OCR engine not available
                    this.showToast('לא נמצא טקסט באזור הנבחר', 'warning');
                    console.log('📝 No text found and OCR not available, bbox:', bbox);
                }
            } else {
                // PDF text found
                capturedText = extractedText.trim();
                sourceType = 'pdf';
                console.log('📝 PDF text captured:', capturedText);
            }

            // If text was successfully captured, enter draw_field_after_name mode
            if (capturedText && sourceType) {
                // Show debug overlay for captured text
                if (window.NameDebugOverlay) {
                    window.NameDebugOverlay.showCandidateBox(bbox, sourceType, capturedText);
                    window.NameDebugOverlay.showDebugPanel(
                        [{ text: capturedText, source: sourceType, score: 100, distance: 0 }],
                        { text: capturedText, key: this._generateFieldKey(capturedText), source: sourceType, score: 100 }
                    );
                }

                // ============ UNIFIED MAPPING FLOW INTEGRATION ============
                // If mapping flow is active, use the flow's continuation method
                const sm = this.stateMachine;
                const MS = MapperStateEnum;
                if (sm && MS && sm.is(MS.FLOW_CAPTURE_NAME)) {
                    this._continueMappingFlow(capturedText, sourceType);
                    return; // Flow handles the rest
                }

                // ============ STANDARD (NON-FLOW) BEHAVIOR ============
                // Set pending field name with all required info
                this.pendingFieldName = {
                    text: capturedText,
                    key: this._generateFieldKey(capturedText),
                    source: sourceType
                };

                // Enable draw field after name mode
                this.drawFieldAfterName = true;

                // Disable all other creation modes
                this.disableAllCreationModes();

                // Activate draw field after name mode
                this.activateDrawFieldAfterNameMode();

                // Show instruction toast
                this.showToast(`📝 שם נלכד: "${capturedText}". כעת צייר את השדה.`, 'success');

                // Update button state
                const btn = document.getElementById('btn-select-field-name');
                if (btn) btn.classList.remove('active');

                return; // Don't deactivate - we're entering draw mode
            }

        } catch (error) {
            console.warn('📝 SelectFieldName error:', error);
            this.showToast('שגיאה בלכידת טקסט', 'error');
        }

        // Only deactivate if no text was captured
        this.deactivateSelectFieldNameMode();
    }

    /**
     * Extract text items that are inside a bounding box
     * @param {Object} bbox - { x, y, width, height } in canvas coordinates
     * @param {Array} textItems - Array of text items with { str, x, y }
     * @returns {string} - Concatenated text from items inside bbox
     */
    _extractTextInsideBBox(bbox, textItems) {
        if (!bbox || !textItems || textItems.length === 0) {
            return null;
        }

        const bboxLeft = bbox.x;
        const bboxRight = bbox.x + bbox.width;
        const bboxTop = bbox.y;
        const bboxBottom = bbox.y + bbox.height;

        // Find text items that are inside or overlap with the bbox
        const matchingItems = [];

        for (const item of textItems) {
            const itemX = item.x;
            const itemY = item.y;

            // Check if text item center is inside bbox
            // (using a simple point-in-box check for the text position)
            if (itemX >= bboxLeft && itemX <= bboxRight &&
                itemY >= bboxTop && itemY <= bboxBottom) {
                matchingItems.push(item);
            }
        }

        if (matchingItems.length === 0) {
            return null;
        }

        // Sort by Y position (top to bottom), then by X (right to left for RTL)
        matchingItems.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) < 5) {
                // Same line - sort by X (RTL: higher X first)
                return b.x - a.x;
            }
            return yDiff;
        });

        // Concatenate the text
        const text = matchingItems.map(item => item.str).join(' ').trim();
        return text;
    }

    /**
     * Disable all creation modes (helper for mode switching)
     * Uses StateMachine.reset() as primary mechanism
     */
    disableAllCreationModes() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (sm && MS) {
            // StateMachine handles all state cleanup
            sm.reset(true);

            // Update UI buttons to reflect reset state
            const buttons = [
                'btn-field-creation-mode', 'btn-checkbox-mode', 'btn-radio-mode',
                'btn-grouping-mode', 'btn-select-field-name', 'btn-text-selection-mode',
                'btn-table-mapping-mode'
            ];
            buttons.forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.classList.remove('active');
            });

            this.setStatus('מוכן', 'success');
            this.updateMappingBadge(null);
        }

        // Always check table controller separately (not managed by StateMachine)
        if (this.tableController && this.tableController.isActive()) {
            this.deactivateTableMappingMode();
        }
    }

    // ============ RADIO GROUPING FEATURE ============

    /**
     * Toggle Radio Grouping Mode
     * Uses StateMachine as single source of truth
     */
    toggleGroupingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (!sm || !MS) {
            console.error('[toggleGroupingMode] StateMachine not available');
            return;
        }

        const btn = document.getElementById('btn-grouping-mode');
        const isActive = sm.is(MS.GROUPING_SELECT);

        console.log('🔗 toggleGroupingMode called, current state:', sm.getState());

        if (isActive) {
            this.deactivateGroupingMode();
        } else {
            // Transition to GROUPING_SELECT
            if (sm.setState(MS.GROUPING_SELECT)) {
                if (btn) btn.classList.add('active');
                this.setStatus('🔗 מצב קיבוץ רדיו - בחר שדות רדיו', 'info');
                this.showToast('מצב קיבוץ רדיו פעיל - סמן שדות רדיו בסרגל הצד', 'info');
                this.updateMappingBadge('🔗 מצב קיבוץ - בחר שדות רדיו - Esc לביטול');

                // Count radio fields
                const radioFields = this.fields.filter(f => f.type === 'radio');
                console.log('🔗 Radio fields count:', radioFields.length, radioFields.map(f => f.id));

                // Show all group selection checkboxes
                this.updateFieldList();
                console.log('🔗 Grouping mode activated via StateMachine');
            }
        }
    }

    /**
     * Deactivate Radio Grouping Mode
     * Uses StateMachine as single source of truth
     */
    deactivateGroupingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (sm && MS) {
            // Only reset if in a grouping state
            if (sm.is(MS.GROUPING_SELECT) || sm.is(MS.GROUP_NAMING) || sm.is(MS.OPTION_LABELING)) {
                sm.setState(MS.IDLE);
            }
        }

        const btn = document.getElementById('btn-grouping-mode');
        if (btn) btn.classList.remove('active');

        // Clear all field selections for grouping
        this.fields.forEach(f => {
            f._selectedForGroup = false;
        });

        // Remove pending group indicator
        this.removePendingGroupIndicator();

        this.setStatus('מוכן', 'success');
        this.updateMappingBadge(null);
        this.updateFieldList();
    }

    /**
     * Update the pending group indicator UI
     * Shows count of selected fields and finalize/cancel buttons
     */
    updatePendingGroupIndicator() {
        const selectedFields = this.fields.filter(f => f._selectedForGroup === true);
        const count = selectedFields.length;

        // Remove existing indicator
        this.removePendingGroupIndicator();

        if (count >= 2) {
            // Create indicator
            const indicator = document.createElement('div');
            indicator.className = 'pending-group-indicator';
            indicator.id = 'pending-group-indicator';
            indicator.innerHTML = `
                <span>🔗 קבוצת רדיו חדשה:</span>
                <span class="group-count">${count} שדות נבחרו</span>
                <div class="group-actions">
                    <button class="btn-finalize" onclick="mapper.finalizeRadioGroup()">
                        ✓ צור קבוצה
                    </button>
                    <button class="btn-cancel" onclick="mapper.cancelGroupingMode()">
                        ✕ בטל
                    </button>
                </div>
            `;
            document.body.appendChild(indicator);
        }
    }

    /**
     * Remove the pending group indicator
     */
    removePendingGroupIndicator() {
        const existing = document.getElementById('pending-group-indicator');
        if (existing) {
            existing.remove();
        }
    }

    /**
     * Finalize the radio group from selected fields
     * Creates a new radioGroup object and assigns groupId to each field
     */
    finalizeRadioGroup() {
        const selectedFields = this.fields.filter(f => f._selectedForGroup === true);

        if (selectedFields.length < 2) {
            this.showToast('יש לבחור לפחות 2 שדות רדיו ליצירת קבוצה', 'warning');
            return;
        }

        // Generate unique group ID
        this.radioGroupCounter = (this.radioGroupCounter || 0) + 1;
        const groupId = `radio_group_${Date.now()}_${this.radioGroupCounter}`;

        // Initialize radioGroups array if needed
        if (!this.radioGroups) {
            this.radioGroups = [];
        }

        // Create the group object
        const newGroup = {
            groupId: groupId,
            groupName: `קבוצת רדיו ${this.radioGroupCounter}`,
            page: this.currentPage,
            options: selectedFields.map((field, index) => ({
                fieldId: field.id,
                label: field.labelHe || field.hebrewName || `אפשרות ${index + 1}`,
                value: field.labelEn || field.englishId || field.id
            }))
        };

        // Add group to array
        this.radioGroups.push(newGroup);

        // Update each field with groupId
        selectedFields.forEach(field => {
            field.groupId = groupId;
            field._selectedForGroup = false;
        });

        console.log('🔗 Radio group created:', newGroup);

        // Cleanup and refresh
        this.removePendingGroupIndicator();

        // Reset StateMachine to IDLE
        const sm = this.stateMachine;
        const MS = MapperStateEnum;
        if (sm && MS) {
            sm.reset(true);
        }

        const layer = document.getElementById('mapping-layer');
        const btn = document.getElementById('btn-grouping-mode');
        if (layer) layer.classList.remove('grouping-mode-active');
        if (btn) btn.classList.remove('active');

        this.updateFieldList();
        this.updateAllOverlays();
        this.saveState('create_radio_group');

        this.showToast(`קבוצת רדיו "${newGroup.groupName}" נוצרה בהצלחה`, 'success');
        this.setStatus('מוכן', 'success');
        this.updateMappingBadge(null);
    }

    /**
     * Cancel the current grouping operation
     */
    cancelGroupingMode() {
        // Clear selections
        this.fields.forEach(f => {
            f._selectedForGroup = false;
        });

        this.deactivateGroupingMode();
        this.showToast('קיבוץ בוטל', 'info');
    }

    /**
     * Update a radio group's name
     * @param {string} groupId - The group ID
     * @param {string} newName - The new name
     */
    updateRadioGroupName(groupId, newName) {
        if (!this.radioGroups) return;

        const group = this.radioGroups.find(g => g.groupId === groupId);
        if (group) {
            group.groupName = newName;
            this.updateFieldList();
            this.saveState('update_radio_group_name');
            console.log(`🔗 Radio group name updated: ${groupId} = "${newName}"`);
        }
    }

    /**
     * Remove a radio group
     * @param {string} groupId - The group ID to remove
     */
    removeRadioGroup(groupId) {
        if (!this.radioGroups) return;

        // Remove groupId from all fields in this group
        this.fields.forEach(field => {
            if (field.groupId === groupId) {
                delete field.groupId;
            }
        });

        // Remove the group
        this.radioGroups = this.radioGroups.filter(g => g.groupId !== groupId);

        this.updateFieldList();
        this.updateAllOverlays();
        this.saveState('remove_radio_group');
        this.showToast('קבוצת רדיו נמחקה', 'info');
        console.log(`🔗 Radio group removed: ${groupId}`);
    }

    /**
     * Highlight all fields in a radio group
     * @param {string} groupId - The group ID
     */
    highlightRadioGroup(groupId) {
        const groupFields = this.fields.filter(f => f.groupId === groupId);

        if (groupFields.length === 0) {
            this.showToast('לא נמצאו שדות בקבוצה', 'warning');
            return;
        }

        // Clear existing highlights
        document.querySelectorAll('.field-overlay.group-highlight').forEach(el => {
            el.classList.remove('group-highlight');
        });

        // Highlight all fields in the group
        groupFields.forEach(field => {
            const overlay = document.querySelector(`.field-overlay[data-field-id="${field.id}"]`);
            if (overlay) {
                overlay.classList.add('group-highlight');
            }
        });

        // Select first field and scroll to it
        if (groupFields[0]) {
            this.selectField(groupFields[0].id, { scroll: true });
        }

        // Remove highlight after 3 seconds
        setTimeout(() => {
            document.querySelectorAll('.field-overlay.group-highlight').forEach(el => {
                el.classList.remove('group-highlight');
            });
        }, 3000);
    }

    /**
     * Edit a radio option's label and value
     * @param {string} groupId - The group ID
     * @param {number} optionIndex - The option index
     */
    editRadioOption(groupId, optionIndex) {
        if (!this.radioGroups) return;

        const group = this.radioGroups.find(g => g.groupId === groupId);
        if (!group || !group.options[optionIndex]) return;

        const option = group.options[optionIndex];

        // Simple prompt for now - could be enhanced with modal
        const newLabel = prompt('תווית האפשרות:', option.label || '');
        if (newLabel !== null) {
            option.label = newLabel;

            const newValue = prompt('ערך האפשרות (לשימוש בקוד):', option.value || '');
            if (newValue !== null) {
                option.value = newValue;
            }

            this.updateFieldList();
            this.saveState('edit_radio_option');
            this.showToast('אפשרות עודכנה', 'success');
        }
    }

    /**
     * Remove a radio option from a group
     * @param {string} groupId - The group ID
     * @param {number} optionIndex - The option index to remove
     */
    removeRadioOption(groupId, optionIndex) {
        if (!this.radioGroups) return;

        const group = this.radioGroups.find(g => g.groupId === groupId);
        if (!group || !group.options[optionIndex]) return;

        const option = group.options[optionIndex];

        // Remove groupId from the field
        const field = this.fields.find(f => f.id === option.fieldId);
        if (field) {
            delete field.groupId;
        }

        // Remove option from group
        group.options.splice(optionIndex, 1);

        // If group has less than 2 options, remove the entire group
        if (group.options.length < 2) {
            this.removeRadioGroup(groupId);
            this.showToast('הקבוצה נמחקה (פחות מ-2 אפשרויות)', 'info');
        } else {
            this.updateFieldList();
            this.updateAllOverlays();
            this.saveState('remove_radio_option');
            this.showToast('אפשרות הוסרה מהקבוצה', 'info');
        }
    }

    /**
     * Add an existing field to a radio group
     * @param {string} groupId - The group ID
     */
    addFieldToRadioGroup(groupId) {
        if (!this.radioGroups) return;

        const group = this.radioGroups.find(g => g.groupId === groupId);
        if (!group) return;

        // Get radio fields on current page that are not in any group
        const availableFields = this.fields.filter(f =>
            f.type === 'radio' &&
            f.page === this.currentPage &&
            !f.groupId
        );

        if (availableFields.length === 0) {
            this.showToast('אין שדות רדיו זמינים להוספה', 'warning');
            return;
        }

        // Simple selection - in production, use a modal
        const fieldNames = availableFields.map(f => f.labelHe || f.hebrewName || f.id);
        const selectedIndex = parseInt(prompt(
            `בחר שדה להוספה (0-${availableFields.length - 1}):\n${fieldNames.map((n, i) => `${i}: ${n}`).join('\n')}`
        ));

        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= availableFields.length) {
            return;
        }

        const field = availableFields[selectedIndex];

        // Add to group
        field.groupId = groupId;
        group.options.push({
            fieldId: field.id,
            label: field.labelHe || field.hebrewName || `אפשרות ${group.options.length + 1}`,
            value: field.labelEn || field.englishId || field.id
        });

        this.updateFieldList();
        this.updateAllOverlays();
        this.saveState('add_field_to_radio_group');
        this.showToast('שדה נוסף לקבוצה', 'success');
    }

    /**
     * Update field overlay to reflect grouping state
     * @param {string} fieldId - Field ID to update
     */
    updateFieldOverlay(fieldId) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field) return;

        const overlay = document.querySelector(`.field-overlay[data-field-id="${fieldId}"]`);
        if (!overlay) return;

        // Update grouping-related classes
        overlay.classList.toggle('selected-for-grouping', field._selectedForGroup === true);
        overlay.classList.toggle('has-radio-group', !!field.groupId);
    }

    /**
     * Create checkbox/radio field on single click (FIX PACKAGE 2)
     * @param {number} clickX - Click X coordinate (canvas pixels)
     * @param {number} clickY - Click Y coordinate (canvas pixels)
     * @param {string} fieldType - 'checkbox' or 'radio'
     */
    async createOneClickField(clickX, clickY, fieldType) {
        const FIELD_SIZE = 24; // Standard size for checkbox/radio

        // Center the field on the click position
        const x = clickX - (FIELD_SIZE / 2);
        const y = clickY - (FIELD_SIZE / 2);

        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        // Ensure within bounds
        const boundedX = Math.max(0, Math.min(x, layer.offsetWidth - FIELD_SIZE));
        const boundedY = Math.max(0, Math.min(y, layer.offsetHeight - FIELD_SIZE));

        // Visual feedback - click indicator
        this.showClickIndicator(boundedX, boundedY, fieldType);

        // Generate unique ID
        this.unnamedFieldCounter = (this.unnamedFieldCounter || 0) + 1;
        const uniqueId = `${fieldType}_${Date.now()}_${this.unnamedFieldCounter}`;

        // Calculate coordinates
        const layerWidth = Math.max(layer.offsetWidth, 1);
        const layerHeight = Math.max(layer.offsetHeight, 1);

        // Get PDF dimensions
        const dpiScale = this.dpiSetting / 72;
        const pageWidth = (this.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
        const pageHeight = (this.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;

        // Calculate center point as anchor
        const centerX = boundedX + (FIELD_SIZE / 2);
        const centerY = boundedY + (FIELD_SIZE / 2);

        const widthScale = pageWidth / layerWidth;
        const heightScale = pageHeight / layerHeight;

        const xPdf = centerX * widthScale;
        const yPdfTop = centerY * heightScale;
        const yPdfBottom = pageHeight - yPdfTop;

        const xPercent = xPdf / pageWidth;
        const yPercent = yPdfBottom / pageHeight;

        // Create the field
        const newField = {
            id: uniqueId,
            type: fieldType,
            page: this.currentPage,
            anchor: [xPercent, yPercent],
            overlayWidth: FIELD_SIZE,
            overlayHeight: FIELD_SIZE,
            labelHe: '',
            labelEn: uniqueId,
            label_he: '',
            label_en: uniqueId,
            hebrewName: '',
            englishId: uniqueId,
            direction: 'ltr',
            isMapped: true,
            isComplete: true,
            linked: false,
            isUnnamed: true,
            element: null
        };

        // Normalize and add
        const normalizedField = typeof normalizeField === 'function' ? normalizeField(newField) : newField;
        if (normalizedField) {
            // Preserve our properties
            normalizedField.anchor = [xPercent, yPercent];
            normalizedField.overlayWidth = FIELD_SIZE;
            normalizedField.overlayHeight = FIELD_SIZE;
            normalizedField.type = fieldType;
        }

        this.fields.push(normalizedField || newField);

        console.log(`☑️ One-click ${fieldType} created:`, {
            id: (normalizedField || newField).id,
            anchor: [xPercent, yPercent],
            size: FIELD_SIZE
        });

        // ============ UNIFIED FIELD REGISTRATION ============
        this._onFieldCreated(normalizedField || newField);

        // Render and update
        await this.renderField(normalizedField || newField);
        this.updateFieldList();
        this.selectField((normalizedField || newField).id, { scroll: true });
        this.saveState(`create_${fieldType}`);
        this._triggerAutoSave();  // Auto-save after one-click field creation

        this.showToast(`${fieldType === 'checkbox' ? 'Checkbox' : 'Radio'} נוצר בהצלחה`, 'success');

        // Keep mode active for continuous creation
    }

    /**
     * Show visual click indicator
     */
    showClickIndicator(x, y, type) {
        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        const indicator = document.createElement('div');
        indicator.className = `click-indicator ${type === 'radio' ? 'radio' : ''}`;
        indicator.style.left = x + 'px';
        indicator.style.top = y + 'px';

        layer.appendChild(indicator);

        // Remove after animation
        setTimeout(() => indicator.remove(), 300);
    }

    /**
     * Create a new unnamed field from drawn rectangle coordinates
     * This is called when a rectangle is drawn in Field Creation Mode
     * @param {number} x - X coordinate (canvas pixels)
     * @param {number} y - Y coordinate (canvas pixels)
     * @param {number} width - Width (canvas pixels)
     * @param {number} height - Height (canvas pixels)
     * @param {Object} options - Optional field properties to apply (type, labelHe, labelEn, etc.)
     * @returns {Promise<Object>} The created field object
     */
    async createUnnamedFieldFromRect(x, y, width, height, options = null) {
        console.log('[DEBUG][createUnnamedFieldFromRect] ENTRY - fields count BEFORE:', this.fields.length);
        console.log('[DEBUG][createUnnamedFieldFromRect] options:', options);

        // ============ CENTRALIZED SIZE GUARD ============
        if (!this._isValidFlowRectSize(width, height, 'field')) {
            console.log('⚠️ Field too small, ignoring:', { width, height });
            return null;
        }

        // Increment counter for unique unnamed field ID
        this.unnamedFieldCounter++;

        // Generate unique ID using timestamp + counter
        const uniqueId = `fld_${Date.now()}_${this.unnamedFieldCounter}`;

        // Get layer dimensions for coordinate conversion
        const layer = document.getElementById('mapping-layer');
        if (!layer) {
            console.error('❌ Mapping layer not found');
            return null;
        }

        const layerWidth = Math.max(layer.offsetWidth, 1);
        const layerHeight = Math.max(layer.offsetHeight, 1);

        // Get PDF dimensions for coordinate conversion
        const dpiScale = this.dpiSetting / 72;
        const pageWidth = (this.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
        const pageHeight = (this.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;

        // Convert canvas coordinates to PDF points using CoordinateTranslator
        let pdfCoords;
        try {
            pdfCoords = window.CoordinateTranslator.canvasBoxToPdfBox(
                x, y, width, height,
                layerWidth, layerHeight,
                pageWidth, pageHeight
            );
        } catch (error) {
            console.error('❌ Coordinate conversion failed:', error);
            this.showToast('שגיאה בהמרת קואורדינטות', 'error');
            return null;
        }

        const { pdfX, pdfY, pdfWidth, pdfHeight } = pdfCoords;

        // Calculate bbox percentages for rendering compatibility
        const bboxXPercent = pdfX / pageWidth;
        const bboxYPercent = pdfY / pageHeight;
        const bboxWPercent = pdfWidth / pageWidth;
        const bboxHPercent = pdfHeight / pageHeight;

        // Create the field object with the required structure from Step 1
        const newField = {
            // Required fields from Step 1 specification
            id: uniqueId,
            page: this.currentPage,
            // bbox as normalized array [x%, y%, w%, h%] - consistent format for entire system
            bbox: [bboxXPercent, bboxYPercent, bboxWPercent, bboxHPercent],
            type: 'text',  // Always "text" in Step 1
            hebrewName: '',  // Empty until Step 2
            englishId: '',   // Empty until Step 2
            linked: false,   // Not connected to a label yet

            // Additional fields for system compatibility
            label_he: `שדה ללא שם #${this.unnamedFieldCounter}`,  // Display name for sidebar
            label_en: '',
            direction: 'rtl',
            fontSize: this.Core.calculateAutoFitFontSize(height),
            letterSpacing: 0,
            wordSpacing: 0,
            lineHeight: 1.0,
            anchorH: 'start',
            anchorV: 'middle',
            padStart: 4,
            padEnd: 4,
            padTop: 2,
            padBottom: 2,

            // V2 coordinate system compatibility (PDF points for export)
            pdfX,
            pdfY,
            pdfWidth,
            pdfHeight,

            // Status flags
            isMapped: true,
            isComplete: false,  // Not complete until named in Step 2
            isUnnamed: true,    // Flag for unnamed fields
            element: null
        };

        // Normalize field if normalizeField is available
        let fieldToAdd = newField;
        if (typeof normalizeField === 'function') {
            const normalized = normalizeField(newField);
            if (normalized) {
                // Preserve our custom properties after normalization
                normalized.hebrewName = '';
                normalized.englishId = '';
                normalized.linked = false;
                normalized.isUnnamed = true;
                normalized.pdfX = pdfX;
                normalized.pdfY = pdfY;
                normalized.pdfWidth = pdfWidth;
                normalized.pdfHeight = pdfHeight;
                fieldToAdd = normalized;
            }
        }

        // ============ STEP 4: Smart Type Classification (Geometry-based) ============
        // Apply automatic type detection based on field dimensions
        if (window.TypeClassifier) {
            const classification = window.TypeClassifier.classifyFieldByGeometry(fieldToAdd, {
                width: layerWidth,
                height: layerHeight
            });

            // Apply classification if confident enough
            if (classification.confidence >= 0.6) {
                fieldToAdd.type = classification.type;
                fieldToAdd.classificationConfidence = classification.confidence;
                fieldToAdd.classificationSource = classification.source;
                fieldToAdd.classificationReason = classification.reason;

                console.log('🧠 Smart Classification (Step 4):', {
                    type: classification.type,
                    confidence: classification.confidence,
                    reason: classification.reason,
                    dimensions: classification.dimensions
                });
            }
        }

        //------------------------------------------------------------
        // ✨ FUSION: if we have a pending field name (from select mode)
        //------------------------------------------------------------
        let finalLabelHe = null;
        let finalLabelEn = null;
        let fusionApplied = false;

        if (this.pendingFieldName) {
            const candidates = [
                {
                    text: this.pendingFieldName.text,
                    score: 100,
                    distance: 0,
                    source: this.pendingFieldName.source || 'user',
                    used: false
                }
            ];

            // Use NameFusionEngine if available
            let fused = candidates[0];
            if (window.NameFusionEngine && window.NameFusionEngine.fuse) {
                fused = window.NameFusionEngine.fuse(candidates);
                // ============ GUARD: Mark as used exactly once ============
                if (window.NameFusionEngine.markAsUsed && fused.text) {
                    // Only mark if not already marked (prevents duplicate marking)
                    if (!window.NameFusionEngine.isUsed || !window.NameFusionEngine.isUsed(fused.text)) {
                        window.NameFusionEngine.markAsUsed(fused.text);
                    }
                }
            }

            if (fused && fused.text) {
                finalLabelHe = fused.text;
                finalLabelEn = fused.key || this._generateFieldKey(fused.text);
                fusionApplied = true;

                // Show debug overlay for fusion result
                if (window.NameDebugOverlay) {
                    const canvasBBox = { x, y, width, height };
                    window.NameDebugOverlay.showFusionWinner(canvasBBox, fused.text);
                    window.NameDebugOverlay.showDebugPanel(candidates, fused);
                }

                console.log('🔀 Fusion applied from pendingFieldName:', {
                    text: finalLabelHe,
                    key: finalLabelEn,
                    source: fused.source || 'user'
                });
            }

            // Clear pending name so it won't apply twice
            this.pendingFieldName = null;
            this.drawFieldAfterName = false;
        }

        // ============ SAFE: Smart Auto-Label integration (non-breaking) ============
        // Only apply to text fields - skip radio, checkbox, and table types
        if (fieldToAdd.type === 'text') {
            try {
                // SAFE: Load page text cache if needed
                const pageTextItems = await this.loadPageTextCache(this.currentPage);

                if (window.AutoLabelEngine && pageTextItems && pageTextItems.length > 0) {
                    // SAFE: Create bbox object for AutoLabelEngine
                    const canvasBBox = { x, y, width, height };

                    // SAFE: Call AutoLabelEngine with SmartLabelScoring integration
                    const autoLabelResult = window.AutoLabelEngine.suggestName(canvasBBox, pageTextItems);

                    // SAFE: Apply only if result is valid and score > 30
                    if (autoLabelResult &&
                        autoLabelResult.label &&
                        autoLabelResult.score > 30 &&
                        (autoLabelResult.source === 'smart' || autoLabelResult.source === 'old')) {

                        // SAFE: Apply auto-suggested name to field
                        fieldToAdd.labelHe = autoLabelResult.label;
                        fieldToAdd.label_he = autoLabelResult.label;
                        fieldToAdd.hebrewName = autoLabelResult.label;
                        fieldToAdd.labelEn = autoLabelResult.key;
                        fieldToAdd.label_en = autoLabelResult.key;
                        fieldToAdd.englishId = autoLabelResult.key;
                        fieldToAdd.autoLabel = true;        // Mark as auto-labeled
                        fieldToAdd.autoLabelText = autoLabelResult.label;  // Store original text
                        fieldToAdd.autoLabelScore = autoLabelResult.score; // Store confidence score
                        fieldToAdd.autoLabelSource = autoLabelResult.source; // 'smart' or 'old'
                        fieldToAdd.isUnnamed = false;       // Mark as named

                        console.log('🏷️ Smart Auto-Label applied:', {
                            label: autoLabelResult.label,
                            key: autoLabelResult.key,
                            score: autoLabelResult.score,
                            source: autoLabelResult.source,
                            fieldId: fieldToAdd.id
                        });
                    }
                }
            } catch (error) {
                // SAFE: Continue without auto-label - don't block field creation
                console.warn('⚠️ Auto-Label suggestion failed:', error);
            }
        }

        //------------------------------------------------------------
        // ✨ Apply fused name (override auto-label if exists)
        //------------------------------------------------------------
        if (fusionApplied && finalLabelHe && finalLabelEn) {
            fieldToAdd.labelHe = finalLabelHe;
            fieldToAdd.label_he = finalLabelHe;
            fieldToAdd.hebrewName = finalLabelHe;
            fieldToAdd.labelEn = finalLabelEn;
            fieldToAdd.label_en = finalLabelEn;
            fieldToAdd.englishId = finalLabelEn;
            fieldToAdd.autoLabel = true;
            fieldToAdd.autoLabelSource = 'fusion';
            fieldToAdd.isUnnamed = false;

            console.log('🔀 Fusion name applied to field:', {
                fieldId: fieldToAdd.id,
                labelHe: finalLabelHe,
                labelEn: finalLabelEn
            });
        }

        // ============ APPLY OPTIONS OVERRIDE ============
        // If options provided (e.g., from drawFieldAfterName mode), override auto-label
        if (options) {
            if (options.type) fieldToAdd.type = options.type;
            if (options.labelHe) {
                fieldToAdd.labelHe = options.labelHe;
                fieldToAdd.label_he = options.labelHe;
                fieldToAdd.hebrewName = options.labelHe;
            }
            if (options.labelEn) {
                fieldToAdd.labelEn = options.labelEn;
                fieldToAdd.label_en = options.labelEn;
                fieldToAdd.englishId = options.labelEn;
            }
            if (options.autoLabel !== undefined) fieldToAdd.autoLabel = options.autoLabel;
            if (options.autoLabelSource) fieldToAdd.autoLabelSource = options.autoLabelSource;
            if (options.isUnnamed !== undefined) fieldToAdd.isUnnamed = options.isUnnamed;

            console.log('📋 Options applied to field:', {
                fieldId: fieldToAdd.id,
                labelHe: fieldToAdd.labelHe,
                labelEn: fieldToAdd.labelEn,
                autoLabelSource: fieldToAdd.autoLabelSource
            });
        }

        // ============ UNIFIED MAPPING FLOW TYPE OVERRIDE ============
        // If mapping flow is active, override field type with the flow's type
        {
            const sm = this.stateMachine;
            const MS = MapperStateEnum;
            const flowType = sm?.getFlowType?.();
            if (sm && MS && sm.isInFlow() && flowType) {
                fieldToAdd.type = flowType;
                console.log('🔄 Mapping Flow: type overridden to', flowType);
            }
        }

        // ============ FIELD TYPE SUGGESTION (Step 5 Part 4) ============
        // Show suggestion box if flow is active and capture_field step
        // This allows user to override the suggested type before field is finalized
        const suggestionBox = this._getFieldTypeSuggestion();
        const sm = this.stateMachine;
        const MS = MapperStateEnum;
        const shouldShowSuggestion = (
            sm && MS && sm.is(MS.FLOW_CAPTURE_FIELD) &&
            suggestionBox &&
            !options?.skipSuggestion  // Allow bypassing for programmatic creation
        );

        if (shouldShowSuggestion) {
            // Get suggested type from heuristics
            const suggestedType = this._suggestFieldTypeByRect({ x, y, width, height });

            // Show suggestion box and wait for user selection or timeout
            return new Promise((resolve) => {
                suggestionBox.show(
                    { x, y, width, height },
                    suggestedType,
                    (selectedType) => {
                        // Apply selected type
                        fieldToAdd.type = selectedType;
                        console.log('🎯 Field type selected:', selectedType, '(suggested:', suggestedType, ')');

                        // ============ MEMORY: Save chosen type and bbox ============
                        this.lastChosenFieldType = selectedType;
                        this.lastFieldBbox = { x, y, width, height };

                        // Add to fields array
                        this.fields.push(fieldToAdd);

                        console.log('🆕 Unnamed field created:', {
                            id: fieldToAdd.id,
                            page: fieldToAdd.page,
                            bbox: fieldToAdd.bbox,
                            type: fieldToAdd.type,
                            hebrewName: fieldToAdd.hebrewName,
                            englishId: fieldToAdd.englishId,
                            linked: fieldToAdd.linked
                        });

                        // ============ UNIFIED FIELD REGISTRATION ============
                        this._onFieldCreated(fieldToAdd);

                        // Complete mapping flow (after suggestion is confirmed)
                        {
                            const smInner = this.stateMachine;
                            const MSInner = MapperStateEnum;
                            if (smInner && MSInner && smInner.is(MSInner.FLOW_CAPTURE_FIELD)) {
                                setTimeout(() => {
                                    this._completeMappingFlowField(fieldToAdd);
                                }, 100);
                            }
                        }

                        // ============ AUTO-GROUPING HOOK (suggestion path) ============
                        const autoGrouping = this._getFieldAutoGrouping();
                        if (autoGrouping) {
                            autoGrouping.onFieldCreated(fieldToAdd, { x, y, width, height });
                        }

                        // ============ AUTO-SAVE HOOK (suggestion path) ============
                        this._triggerAutoSave();

                        resolve(fieldToAdd);
                    }
                );
            });
        }

        // ============ STANDARD PATH (no suggestion box) ============
        // Add to fields array
        this.fields.push(fieldToAdd);

        console.log('🆕 Unnamed field created:', {
            id: fieldToAdd.id,
            page: fieldToAdd.page,
            bbox: fieldToAdd.bbox,
            type: fieldToAdd.type,
            hebrewName: fieldToAdd.hebrewName,
            englishId: fieldToAdd.englishId,
            linked: fieldToAdd.linked
        });

        // ============ UNIFIED FIELD REGISTRATION ============
        this._onFieldCreated(fieldToAdd);

        // ============ UNIFIED MAPPING FLOW COMPLETION ============
        // If mapping flow is active, complete the current field and restart for next
        {
            const smStd = this.stateMachine;
            const MSStd = MapperStateEnum;
            if (smStd && MSStd && smStd.is(MSStd.FLOW_CAPTURE_FIELD)) {
                // Schedule flow continuation (allow field rendering to complete first)
                setTimeout(() => {
                    this._completeMappingFlowField(fieldToAdd);
                }, 100);
            }
        }

        // ============ AUTO-GROUPING HOOK (standard path) ============
        const autoGroupingStd = this._getFieldAutoGrouping();
        if (autoGroupingStd) {
            autoGroupingStd.onFieldCreated(fieldToAdd, { x, y, width, height });
        }

        // ============ AUTO-SAVE HOOK (standard path) ============
        this._triggerAutoSave();

        console.log('[DEBUG][createUnnamedFieldFromRect] EXIT - fields count AFTER:', this.fields.length);
        console.log('[DEBUG][createUnnamedFieldFromRect] Returning field:', fieldToAdd?.id);

        return fieldToAdd;
    }

    /**
     * Get all unnamed fields for the current page
     * @returns {Array} Array of unnamed field objects
     */
    getUnnamedFields() {
        return this.fields.filter(f =>
            f.isUnnamed === true &&
            f.page === this.currentPage
        );
    }

    /**
     * Get count of unnamed fields
     * @returns {number} Count of unnamed fields
     */
    getUnnamedFieldCount() {
        return this.fields.filter(f => f.isUnnamed === true).length;
    }

    // ============ TEXT SELECTION MODE (Step 2) ============
    // Allows selecting text on PDF to assign field names

    /**
     * Activate Text Selection Mode for naming a field
     * Uses StateMachine.TEXT_SELECTION state
     * @param {Object} field - The field to be named (optional, uses selectedField if not provided)
     */
    activateTextSelectionMode(field = null) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Reset any other active state
        if (sm && MS) {
            sm.reset(true);
        }

        // Determine which field to name
        const targetField = field || this.selectedField;

        if (!targetField) {
            this.showToast('יש לבחור שדה לפני בחירת טקסט', 'warning');
            return;
        }

        // Check if field is already named/linked (optional - skip if already has a name)
        if (targetField.isMapped && targetField.linked) {
            this.showToast('השדה כבר נקשר לשם', 'info');
            return;
        }

        // Transition to TEXT_SELECTION state
        if (sm && MS) {
            sm.setState(MS.TEXT_SELECTION);
        }

        this.currentFieldForNaming = targetField;

        // Update UI
        const layer = document.getElementById('mapping-layer');
        const btn = document.getElementById('btn-text-selection-mode');

        if (layer) {
            layer.classList.add('text-selection-mode');
            layer.style.cursor = 'text';
        }
        if (btn) btn.classList.add('active');

        // Highlight the target field
        if (targetField.element) {
            targetField.element.classList.add('awaiting-name');
        }

        this.setStatus(`📌 בחר טקסט לשדה: ${targetField.label_he || targetField.id}`, 'info');
        this.updateMappingBadge(`📌 מצב בחירת טקסט - גרור על טקסט ב-PDF - Esc לביטול`);
        this.showToast('גרור מלבן על הטקסט שתרצה להגדיר כשם השדה', 'info');
        // FIX TASK 3: Trigger visual guide for text mode
        this.startVisualGuide('text');
    }

    /**
     * Deactivate Text Selection Mode
     * Uses StateMachine.reset() to return to IDLE
     */
    deactivateTextSelectionMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Reset StateMachine to IDLE
        if (sm && MS) {
            sm.reset(true);
        }

        // Remove awaiting-name class from field
        if (this.currentFieldForNaming && this.currentFieldForNaming.element) {
            this.currentFieldForNaming.element.classList.remove('awaiting-name');
        }

        this.currentFieldForNaming = null;
        this.textSelectionStart = null;

        // Remove selection rectangle if exists
        if (this.currentTextSelection) {
            this.currentTextSelection.remove();
            this.currentTextSelection = null;
        }

        // Update UI
        const layer = document.getElementById('mapping-layer');
        const btn = document.getElementById('btn-text-selection-mode');

        if (layer) {
            layer.classList.remove('text-selection-mode');
            layer.style.cursor = '';
        }
        if (btn) btn.classList.remove('active');

        this.setStatus('מוכן', 'success');
        this.updateMappingBadge(null);

        // STABILITY: Stop visual guide if no modes are active
        if (!this.isAnyMappingModeActive()) {
            this.stopVisualGuide();
        }
    }

    /**
     * Toggle Text Selection Mode
     * Uses StateMachine.is(TEXT_SELECTION) for state check
     */
    toggleTextSelectionMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        const isTextSelectionActive = sm && MS && sm.is(MS.TEXT_SELECTION);

        if (isTextSelectionActive) {
            this.deactivateTextSelectionMode();
        } else {
            this.activateTextSelectionMode();
        }
    }

    /**
     * Start text selection drawing
     * Uses StateMachine.is(TEXT_SELECTION) for state check
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    startTextSelection(x, y) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        const isTextSelectionActive = sm && MS && sm.is(MS.TEXT_SELECTION);

        console.log('🔍 startTextSelection called:', {
            x, y,
            isTextSelectionActive,
            currentFieldForNaming: this.currentFieldForNaming?.id
        });

        if (!isTextSelectionActive || !this.currentFieldForNaming) {
            console.warn('🔍 startTextSelection: Guard failed - isTextSelectionActive:', isTextSelectionActive, 'field:', this.currentFieldForNaming?.id);
            return;
        }

        this.textSelectionStart = { x, y };
        console.log('🔍 startTextSelection: Started at', { x, y });

        // Create selection rectangle
        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        const rect = document.createElement('div');
        rect.className = 'text-selection-overlay';
        rect.style.left = x + 'px';
        rect.style.top = y + 'px';
        rect.style.width = '0px';
        rect.style.height = '0px';

        layer.appendChild(rect);
        this.currentTextSelection = rect;
    }

    /**
     * Update text selection rectangle
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    updateTextSelection(x, y) {
        if (!this.currentTextSelection || !this.textSelectionStart) return;

        const left = Math.min(x, this.textSelectionStart.x);
        const top = Math.min(y, this.textSelectionStart.y);
        const width = Math.abs(x - this.textSelectionStart.x);
        const height = Math.abs(y - this.textSelectionStart.y);

        this.currentTextSelection.style.left = left + 'px';
        this.currentTextSelection.style.top = top + 'px';
        this.currentTextSelection.style.width = width + 'px';
        this.currentTextSelection.style.height = height + 'px';
    }

    /**
     * Finish text selection and extract text
     */
    async finishTextSelection() {
        console.log('🔍 finishTextSelection called:', {
            hasCurrentTextSelection: !!this.currentTextSelection,
            hasTextSelectionStart: !!this.textSelectionStart,
            currentFieldForNaming: this.currentFieldForNaming?.id
        });

        if (!this.currentTextSelection || !this.textSelectionStart || !this.currentFieldForNaming) {
            console.warn('🔍 finishTextSelection: Guard failed, cleaning up');
            this.cleanupTextSelection();
            return;
        }

        // Get selection rectangle dimensions
        let x = parseFloat(this.currentTextSelection.style.left);
        let y = parseFloat(this.currentTextSelection.style.top);
        let width = parseFloat(this.currentTextSelection.style.width);
        let height = parseFloat(this.currentTextSelection.style.height);

        console.log('🔍 finishTextSelection: Selection dimensions:', { x, y, width, height });

        // FIX PACKAGE 2: Allow very small rectangles (even 5x5) for tiny labels
        // Minimum display size is 5px, but we'll expand internally for better hit accuracy
        const MIN_DISPLAY_SIZE = 5;
        if (width < MIN_DISPLAY_SIZE || height < MIN_DISPLAY_SIZE) {
            console.warn('🔍 finishTextSelection: Selection too small (< 5px)');
            this.showToast('אזור הבחירה קטן מדי - נסה שוב', 'warning');
            this.cleanupTextSelection();
            return;
        }

        // FIX PACKAGE 2: Expand selection by +3px on each side for better hit accuracy
        const EXPANSION_PADDING = 3;
        const expandedX = Math.max(0, x - EXPANSION_PADDING);
        const expandedY = Math.max(0, y - EXPANSION_PADDING);
        const expandedWidth = width + (EXPANSION_PADDING * 2);
        const expandedHeight = height + (EXPANSION_PADDING * 2);

        try {
            // Extract text from the expanded region
            console.log('🔍 finishTextSelection: Calling extractTextInRegion with expanded area...');
            let extractedText = await this.extractTextInRegion(expandedX, expandedY, expandedWidth, expandedHeight);

            console.log('🔍 finishTextSelection: Extracted text:', extractedText);

            // FIX PACKAGE 2: If empty, try expanding search area by +5px more and retry once
            if (!extractedText || extractedText.trim() === '') {
                console.log('🔍 finishTextSelection: No text found, expanding search area...');
                const RETRY_EXPANSION = 5;
                const retryX = Math.max(0, expandedX - RETRY_EXPANSION);
                const retryY = Math.max(0, expandedY - RETRY_EXPANSION);
                const retryWidth = expandedWidth + (RETRY_EXPANSION * 2);
                const retryHeight = expandedHeight + (RETRY_EXPANSION * 2);

                extractedText = await this.extractTextInRegion(retryX, retryY, retryWidth, retryHeight);
                console.log('🔍 finishTextSelection: Retry extracted text:', extractedText);
            }

            if (!extractedText || extractedText.trim() === '') {
                console.warn('🔍 finishTextSelection: No text found in region even after expansion');
                this.showToast('לא נמצא טקסט באזור שנבחר - נסה אזור גדול יותר', 'warning');
                this.cleanupTextSelection();
                return;
            }

            // Normalize the Hebrew text
            const normalizedHebrew = this.normalizeHebrewLabel(extractedText);

            // Generate English field ID
            const englishId = this.toEnglishFieldId(normalizedHebrew);

            // ============ FIX PACKAGE 1: Single-Step Mapping for Text Fields ============
            // Update the field - immediately becomes a mapped text field
            // IMPORTANT: Update the field.id to use the English camelCase name
            const oldId = this.currentFieldForNaming.id;
            console.log('🆔 FIELD ID UPDATE: oldId=', oldId, '→ newId=', englishId);
            this.currentFieldForNaming.id = englishId;
            this.currentFieldForNaming.name = englishId; // Standard field name
            console.log('🆔 AFTER UPDATE: field.id=', this.currentFieldForNaming.id);
            this.currentFieldForNaming.type = 'text';
            this.currentFieldForNaming.labelHe = normalizedHebrew;
            this.currentFieldForNaming.labelEn = englishId;
            this.currentFieldForNaming.hebrewName = normalizedHebrew;
            this.currentFieldForNaming.englishId = englishId;
            this.currentFieldForNaming.label_he = normalizedHebrew;
            this.currentFieldForNaming.label_en = englishId;

            // Update overlay element's data-field-id if it exists
            if (this.currentFieldForNaming.element) {
                this.currentFieldForNaming.element.setAttribute('data-field-id', englishId);
            }
            this.currentFieldForNaming.mapped = true;
            this.currentFieldForNaming.isMapped = true;
            this.currentFieldForNaming.linked = true;
            this.currentFieldForNaming.isUnnamed = false;
            this.currentFieldForNaming.isComplete = true;

            // Debug log for text extraction
            console.log("📝 Extracted text:", extractedText);
            console.log("📝 Normalized Hebrew:", normalizedHebrew);
            console.log("📝 English ID:", englishId);

            // ============ STEP 4: Smart Type Classification (Label-based) ============
            // Apply automatic type detection based on Hebrew label keywords
            if (window.TypeClassifier && !this.currentFieldForNaming.typeOverriddenByUser) {
                const labelClassification = window.TypeClassifier.classifyFieldByLabel(this.currentFieldForNaming);

                // Apply label classification if it found a match
                // Label classification takes priority over geometry for non-checkbox/radio types
                if (labelClassification.type && labelClassification.confidence > 0) {
                    const currentType = this.currentFieldForNaming.type;

                    // Don't override checkbox/radio with text (geometry was right)
                    const isSmallType = currentType === 'checkbox' || currentType === 'radio';
                    const isTextType = labelClassification.type === 'text';

                    if (!isSmallType || !isTextType) {
                        this.currentFieldForNaming.type = labelClassification.type;
                        this.currentFieldForNaming.classificationConfidence = labelClassification.confidence;
                        this.currentFieldForNaming.classificationSource = labelClassification.source;
                        this.currentFieldForNaming.classificationKeyword = labelClassification.matchedKeyword;

                        console.log('🧠 Smart Classification (Step 4 - Label):', {
                            type: labelClassification.type,
                            confidence: labelClassification.confidence,
                            matchedKeyword: labelClassification.matchedKeyword,
                            originalLabel: normalizedHebrew
                        });
                    }
                }
            }

            // Update the field's ID if it was auto-generated
            if (this.currentFieldForNaming.id && this.currentFieldForNaming.id.startsWith('fld_')) {
                const newId = this.ensureUniqueId(englishId);
                this.currentFieldForNaming.id = newId;
            }

            console.log('✅ Field named:', {
                id: this.currentFieldForNaming.id,
                hebrewName: normalizedHebrew,
                englishId: englishId,
                type: this.currentFieldForNaming.type,
                linked: true
            });

            // Re-render the field overlay to update its appearance
            if (this.currentFieldForNaming.element) {
                this.currentFieldForNaming.element.classList.remove('unnamed-field-overlay');
                this.currentFieldForNaming.element.classList.add('named-field-overlay');
            }

            // Update sidebar
            this.updateFieldList();

            // Save state
            this.saveState('name_field');

            this.showToast(`שדה נקשר בהצלחה: ${normalizedHebrew} → ${englishId}`, 'success');

        } catch (error) {
            console.error('Error extracting text:', error);
            this.showToast('שגיאה בחילוץ הטקסט', 'error');
        }

        // Cleanup and exit mode
        this.cleanupTextSelection();
        this.deactivateTextSelectionMode();
    }

    /**
     * Cleanup text selection elements
     */
    cleanupTextSelection() {
        if (this.currentTextSelection) {
            this.currentTextSelection.remove();
            this.currentTextSelection = null;
        }
        this.textSelectionStart = null;
    }

    // ============ AUTO-LABEL TEXT CACHE SYSTEM ============

    /**
     * Load and cache text items from the current PDF page for Auto-Label feature
     * Returns normalized text items with canvas coordinates
     * @param {number} pageNum - Page number to load (defaults to current page)
     * @returns {Promise<Array>} Array of text items with { str, x, y } in canvas coordinates
     */
    async loadPageTextCache(pageNum = this.currentPage) {
        // Return from cache if available
        if (this.pdfTextCache[pageNum]) {
            return this.pdfTextCache[pageNum];
        }

        if (!this.pdfDocument) {
            console.warn('⚠️ loadPageTextCache: No PDF document loaded');
            return [];
        }

        try {
            const page = await this.pdfDocument.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Get layer dimensions for coordinate conversion
            const layer = document.getElementById('mapping-layer');
            if (!layer) return [];

            const layerWidth = layer.offsetWidth;
            const layerHeight = layer.offsetHeight;

            // Get viewport for coordinate conversion
            const viewportUnscaled = page.getViewport({ scale: 1.0 });
            const pdfWidth = viewportUnscaled.width;
            const pdfHeight = viewportUnscaled.height;

            // Convert PDF text items to canvas coordinates
            const textItems = [];
            for (const item of textContent.items) {
                if (!item.str || item.str.trim() === '') continue;

                // Get position from transform matrix
                const tx = item.transform[4];  // X in PDF coordinates
                const ty = item.transform[5];  // Y in PDF coordinates (bottom-up)

                // Convert to canvas coordinates
                // PDF Y is bottom-up, canvas Y is top-down
                const canvasX = (tx / pdfWidth) * layerWidth;
                const canvasY = ((pdfHeight - ty) / pdfHeight) * layerHeight;

                textItems.push({
                    str: item.str,
                    x: canvasX,
                    y: canvasY
                });
            }

            // Cache the results
            this.pdfTextCache[pageNum] = textItems;
            console.log(`📝 Auto-Label: Cached ${textItems.length} text items for page ${pageNum}`);

            return textItems;
        } catch (error) {
            console.error('❌ loadPageTextCache error:', error);
            return [];
        }
    }

    /**
     * Extract text from a region on the current PDF page
     * @param {number} canvasX - X coordinate in canvas pixels
     * @param {number} canvasY - Y coordinate in canvas pixels
     * @param {number} canvasWidth - Width in canvas pixels
     * @param {number} canvasHeight - Height in canvas pixels
     * @returns {Promise<string>} Extracted text
     */
    async extractTextInRegion(canvasX, canvasY, canvasWidth, canvasHeight) {
        console.log('🔍 extractTextInRegion called:', { canvasX, canvasY, canvasWidth, canvasHeight });

        if (!this.pdfDocument) {
            throw new Error('No PDF document loaded');
        }

        const page = await this.pdfDocument.getPage(this.currentPage);
        const textContent = await page.getTextContent();

        // Get layer dimensions for coordinate conversion
        const layer = document.getElementById('mapping-layer');
        if (!layer) return '';

        const layerWidth = layer.offsetWidth;
        const layerHeight = layer.offsetHeight;

        // ============ FIX: Use UNSCALED viewport (scale=1.0) ============
        // PDF.js text content transform matrices are always in 72 DPI PDF user space units
        // We must convert our canvas selection to match this coordinate system
        const viewportUnscaled = page.getViewport({ scale: 1.0 });
        const pdfWidth = viewportUnscaled.width;   // Unscaled PDF width (72 DPI)
        const pdfHeight = viewportUnscaled.height; // Unscaled PDF height (72 DPI)

        // Convert canvas selection to unscaled PDF coordinates
        // Canvas is displayed at DPI scale, but PDF text coords are at 72 DPI
        const scaleX = pdfWidth / layerWidth;
        const scaleY = pdfHeight / layerHeight;

        const selectionPdfX = canvasX * scaleX;
        const selectionPdfY = canvasY * scaleY;
        const selectionPdfWidth = canvasWidth * scaleX;
        const selectionPdfHeight = canvasHeight * scaleY;

        // Selection bounds in unscaled PDF coordinates (top-left origin for matching)
        const selLeft = selectionPdfX;
        const selRight = selectionPdfX + selectionPdfWidth;
        const selTop = selectionPdfY;
        const selBottom = selectionPdfY + selectionPdfHeight;

        console.log('🔍 Coordinate conversion:', {
            layer: { w: layerWidth, h: layerHeight },
            pdfUnscaled: { w: pdfWidth, h: pdfHeight },
            scale: { x: scaleX, y: scaleY },
            selection: { left: selLeft, right: selRight, top: selTop, bottom: selBottom }
        });

        // Extract text items that intersect with selection
        const matchedItems = [];

        for (const item of textContent.items) {
            if (!item.str || item.str.trim() === '') continue;

            // Get item position from transform matrix
            // transform = [scaleX, skewY, skewX, scaleY, translateX, translateY]
            const tx = item.transform[4];  // X position in PDF coordinates
            const ty = item.transform[5];  // Y position in PDF coordinates (bottom-up)

            // Item dimensions - use actual width if available, otherwise estimate
            const itemWidth = item.width || (item.str.length * 6); // Approximate char width
            const itemHeight = item.height || Math.abs(item.transform[3]) || 12; // Use scaleY from transform or fallback

            // ============ FIX: Correct Y-axis flip ============
            // PDF Y-axis: 0 at bottom, increases upward
            // Canvas Y-axis: 0 at top, increases downward
            // Convert: canvasY = pdfHeight - pdfY
            const itemX = tx;
            const itemY = pdfHeight - ty; // Flip Y axis (item top in canvas coords)

            // Item bounds in canvas-style coordinates (top-left origin)
            const itemLeft = itemX;
            const itemRight = itemX + itemWidth;
            const itemTop = itemY - itemHeight; // Text baseline is at ty, so top is above
            const itemBottom = itemY;

            // ============ FIX: Require SIGNIFICANT overlap, not just touching ============
            // Calculate overlap area
            const overlapLeft = Math.max(itemLeft, selLeft);
            const overlapRight = Math.min(itemRight, selRight);
            const overlapTop = Math.max(itemTop, selTop);
            const overlapBottom = Math.min(itemBottom, selBottom);

            const overlapWidth = Math.max(0, overlapRight - overlapLeft);
            const overlapHeight = Math.max(0, overlapBottom - overlapTop);
            const overlapArea = overlapWidth * overlapHeight;

            // Calculate what percentage of the text item is inside the selection
            const itemArea = itemWidth * itemHeight;
            const overlapPercent = itemArea > 0 ? (overlapArea / itemArea) * 100 : 0;

            // ============ STRICT FILTERING ============
            // Only include text if:
            // 1. At least 30% of the text item is inside the selection, OR
            // 2. The text item's CENTER is inside the selection
            const itemCenterX = itemLeft + itemWidth / 2;
            const itemCenterY = itemTop + itemHeight / 2;
            const centerInside = itemCenterX >= selLeft && itemCenterX <= selRight &&
                                 itemCenterY >= selTop && itemCenterY <= selBottom;

            const significantOverlap = overlapPercent >= 30;

            if (significantOverlap || centerInside) {
                matchedItems.push({
                    str: item.str,
                    x: itemX,
                    y: itemTop,
                    width: itemWidth,
                    height: itemHeight,
                    overlapPercent: overlapPercent.toFixed(1)
                });
            }
        }

        // Sort items by position (top-to-bottom, right-to-left for RTL)
        matchedItems.sort((a, b) => {
            // Group by rows (items within 5 units of each other vertically)
            const rowDiff = Math.abs(a.y - b.y);
            if (rowDiff < 5) {
                // Same row - sort right to left for Hebrew (RTL)
                return b.x - a.x;
            }
            // Different rows - sort top to bottom
            return a.y - b.y;
        });

        // Concatenate text
        const extractedText = matchedItems.map(item => item.str).join(' ');

        console.log('📝 Text extraction result:', {
            selection: { x: canvasX, y: canvasY, w: canvasWidth, h: canvasHeight },
            pdfSelection: { left: selLeft, right: selRight, top: selTop, bottom: selBottom },
            totalTextItems: textContent.items.length,
            matchedItems: matchedItems.length,
            matchedTexts: matchedItems.map(item => `"${item.str}" (${item.overlapPercent}%)`),
            finalText: extractedText
        });

        return extractedText;
    }

    /**
     * Normalize Hebrew label text
     * @param {string} text - Raw text
     * @returns {string} Normalized text
     */
    normalizeHebrewLabel(text) {
        if (!text) return '';

        return text
            .replace(/[:：]+/g, '')           // Remove colons
            .replace(/[*]+/g, '')             // Remove asterisks
            .replace(/[\u200F\u200E]/g, '')   // Remove RTL/LTR marks
            .replace(/\s+/g, ' ')             // Collapse whitespace
            .trim();
    }

    /**
     * Convert Hebrew text to English field name (camelCase format)
     * Based on form_101_fields_flat_with_groups.json naming convention
     *
     * @param {string} hebrew - Hebrew text
     * @param {boolean} ensureUnique - If true, add suffix to prevent duplicates (default: true)
     * @returns {string} English field name in camelCase
     */
    toEnglishFieldId(hebrew, ensureUnique = true) {
        console.log('🔤 toEnglishFieldId called with:', hebrew);
        if (!hebrew) {
            const fallback = this._ensureUniqueFieldId('field', ensureUnique);
            console.log('🔤 toEnglishFieldId: no hebrew, returning fallback:', fallback);
            return fallback;
        }

        // Extended dictionary - camelCase format
        const dictionary = {
            // Personal info
            'שם פרטי': 'firstName',
            'שם משפחה': 'lastName',
            'שם מלא': 'fullName',
            'שם': 'name',
            'שם האב': 'fatherName',
            'שם האם': 'motherName',

            // ID & Numbers
            'תעודת זהות': 'idNumber',
            'ת.ז': 'idNumber',
            'ת"ז': 'idNumber',
            'מספר זהות': 'idNumber',
            'מספר דרכון': 'passportNumber',
            'דרכון': 'passport',
            'מספר רישיון': 'licenseNumber',
            'מספר תיק ניכויים': 'deductionFileNumber',

            // Dates
            'תאריך לידה': 'birthDate',
            'תאריך': 'date',
            'יום': 'day',
            'חודש': 'month',
            'שנה': 'year',
            'שנת המס': 'taxYear',
            'תאריך הנפקה': 'issueDate',
            'תאריך תוקף': 'expiryDate',
            'תאריך עליה': 'immigrationDate',
            'תאריך הצהרה': 'declarationDate',

            // Contact
            'טלפון': 'phone',
            'טלפון נייד': 'mobile',
            'נייד': 'mobile',
            'פקס': 'fax',
            'דואר אלקטרוני': 'email',
            'אימייל': 'email',
            'מייל': 'email',

            // Address
            'כתובת': 'address',
            'רחוב': 'street',
            'מספר בית': 'houseNumber',
            'עיר': 'city',
            'ישוב': 'city',
            'יישוב': 'city',
            'מיקוד': 'postalCode',
            'ארץ': 'country',
            'מדינה': 'country',

            // Gender
            'מין': 'gender',
            'זכר': 'genderMale',
            'נקבה': 'genderFemale',
            'מין - זכר': 'genderMale',
            'מין - נקבה': 'genderFemale',

            // Marital Status
            'מצב משפחתי': 'maritalStatus',
            'רווק': 'maritalStatusSingle',
            'נשוי': 'maritalStatusMarried',
            'גרוש': 'maritalStatusDivorced',
            'אלמן': 'maritalStatusWidowed',
            'פרוד': 'maritalStatusSeparated',

            // Work & Employer
            'מקום עבודה': 'workplace',
            'תפקיד': 'position',
            'משלח יד': 'occupation',
            'מעסיק': 'employer',
            'שם המעביד': 'employerName',
            'כתובת המעסיק': 'employerAddress',
            'מספר טלפון המעסיק': 'employerPhone',

            // Financial
            'בנק': 'bank',
            'סניף': 'branch',
            'מספר חשבון': 'accountNumber',
            'חשבון': 'account',

            // Spouse
            'בן זוג': 'spouse',
            'בת זוג': 'spouse',
            'שם בן/בת זוג': 'spouseName',

            // Misc
            'חתימה': 'signature',
            'חתימת המבקש': 'applicantSignature',
            'תאריך חתימה': 'signatureDate',
            'הערות': 'notes',
            'הסכמה': 'consent',

            // Boolean options
            'כן': 'Yes',
            'לא': 'No'
        };

        const normalized = hebrew.trim();
        console.log('🔤 toEnglishFieldId: normalized text:', normalized);

        // Check dictionary first (exact match)
        if (dictionary[normalized]) {
            const result = this._ensureUniqueFieldId(dictionary[normalized], ensureUnique);
            console.log('🔤 toEnglishFieldId: exact match →', dictionary[normalized], '→', result);
            return result;
        }

        // Check partial matches
        for (const [key, value] of Object.entries(dictionary)) {
            if (normalized.includes(key)) {
                const result = this._ensureUniqueFieldId(value, ensureUnique);
                console.log('🔤 toEnglishFieldId: partial match for', key, '→', result);
                return result;
            }
        }

        // Fallback: transliterate Hebrew to camelCase
        let transliterated = this._transliterateHebrew(normalized);
        const result = this._ensureUniqueFieldId(transliterated || 'field', ensureUnique);
        console.log('🔤 toEnglishFieldId: transliteration fallback →', result);
        return result;
    }

    /**
     * Transliterate Hebrew text to Latin characters (camelCase)
     * @param {string} text - Hebrew text
     * @returns {string} Transliterated text in camelCase
     */
    _transliterateHebrew(text) {
        const hebrewToLatin = {
            'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h',
            'ו': 'v', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y',
            'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm',
            'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
            'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r',
            'ש': 'sh', 'ת': 't'
        };

        // Split by spaces to get words
        const words = text.split(/[\s\-_]+/).filter(w => w.length > 0);
        const transliteratedWords = [];

        for (const word of words) {
            let transliterated = '';
            for (const char of word) {
                if (hebrewToLatin[char]) {
                    transliterated += hebrewToLatin[char];
                } else if (/[a-zA-Z]/.test(char)) {
                    transliterated += char.toLowerCase();
                } else if (/[0-9]/.test(char)) {
                    transliterated += char;
                }
                // Skip special characters
            }
            if (transliterated) {
                transliteratedWords.push(transliterated);
            }
        }

        // Convert to camelCase
        if (transliteratedWords.length === 0) return '';

        return transliteratedWords
            .map((word, index) => {
                if (index === 0) {
                    return word.toLowerCase();
                }
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join('');
    }

    /**
     * Ensure field ID is unique by adding suffix if needed
     * @param {string} baseId - Base field ID
     * @param {boolean} ensureUnique - If true, check for duplicates
     * @returns {string} Unique field ID
     */
    _ensureUniqueFieldId(baseId, ensureUnique = true) {
        if (!ensureUnique) return baseId;

        // Get all existing field names
        const existingNames = new Set(
            this.fields.map(f => f.name || f.labelEn || f.englishId || f.id)
        );

        // If base ID is not taken, use it
        if (!existingNames.has(baseId)) {
            return baseId;
        }

        // Find next available suffix (use number suffix like child1, child2)
        let suffix = 2;
        while (existingNames.has(`${baseId}${suffix}`)) {
            suffix++;
        }

        return `${baseId}${suffix}`;
    }

    // ============ OPTION GROUPING MODE (Step 3) ============
    // Allows grouping radio/checkbox options into a unified group

    /**
     * Check if a field is a small rectangle (checkbox/radio candidate)
     * @param {Object} field - Field object
     * @returns {boolean} True if field is small enough to be an option
     */
    isOptionCandidate(field) {
        if (!field || !field.isMapped) return false;

        // Get dimensions - check both bbox array and pdfWidth/pdfHeight
        let width, height;

        if (field.pdfWidth && field.pdfHeight) {
            width = field.pdfWidth;
            height = field.pdfHeight;
        } else if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            // bbox is in percentages, convert to approximate pixels
            const layer = document.getElementById('mapping-layer');
            if (layer) {
                width = field.bbox[2] * layer.offsetWidth;
                height = field.bbox[3] * layer.offsetHeight;
            }
        }

        // Small rectangles (< 30px in either dimension) are option candidates
        return width && height && (width < 30 || height < 30);
    }

    /**
     * Activate Option Grouping Mode
     * Uses StateMachine.GROUPING_SELECT state
     */
    activateOptionGroupingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Reset any other active state
        if (sm && MS) {
            sm.reset(true);
        }

        // Transition to GROUPING_SELECT state
        if (sm && MS) {
            sm.setState(MS.GROUPING_SELECT);
        }

        this.selectedOptionsForGrouping = [];

        // Update UI
        const btn = document.getElementById('btn-option-grouping-mode');
        if (btn) btn.classList.add('active');

        this.setStatus('🔘 מצב קיבוץ אפשרויות - בחר מספר שדות קטנים (Ctrl+Click)', 'info');
        this.updateMappingBadge('🔘 מצב קיבוץ - Ctrl+Click לבחירה מרובה - Enter ליצירת קבוצה - Esc לביטול');
        this.showToast('בחר מספר שדות קטנים (checkbox/radio) עם Ctrl+Click, ואז לחץ Enter ליצירת קבוצה', 'info');
    }

    /**
     * Deactivate Option Grouping Mode
     * Uses StateMachine.reset() to return to IDLE
     */
    deactivateOptionGroupingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Reset StateMachine to IDLE
        if (sm && MS) {
            sm.reset(true);
        }

        // Clear selection highlighting
        this.selectedOptionsForGrouping.forEach(fieldId => {
            const field = this.fields.find(f => f.id === fieldId);
            if (field && field.element) {
                field.element.classList.remove('selected-for-grouping');
            }
        });

        this.selectedOptionsForGrouping = [];

        // Update UI
        const btn = document.getElementById('btn-option-grouping-mode');
        if (btn) btn.classList.remove('active');

        this.setStatus('מוכן', 'success');
        this.updateMappingBadge(null);
    }

    /**
     * Toggle Option Grouping Mode
     * Uses StateMachine.is(GROUPING_SELECT) for state check
     */
    toggleOptionGroupingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        const isGroupingActive = sm && MS && sm.is(MS.GROUPING_SELECT);

        if (isGroupingActive) {
            this.deactivateOptionGroupingMode();
        } else {
            this.activateOptionGroupingMode();
        }
    }

    /**
     * Toggle field selection for grouping (Ctrl+Click)
     * Uses StateMachine.is(GROUPING_SELECT) for state check
     * @param {string} fieldId - Field ID to toggle
     */
    toggleOptionSelection(fieldId) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        const isGroupingActive = sm && MS && sm.is(MS.GROUPING_SELECT);
        if (!isGroupingActive) return;

        const field = this.fields.find(f => f.id === fieldId);
        if (!field) return;

        const index = this.selectedOptionsForGrouping.indexOf(fieldId);

        if (index === -1) {
            // Add to selection
            this.selectedOptionsForGrouping.push(fieldId);
            if (field.element) {
                field.element.classList.add('selected-for-grouping');
            }
            this.showToast(`נבחר: ${field.label_he || field.id} (${this.selectedOptionsForGrouping.length} שדות)`, 'info');
        } else {
            // Remove from selection
            this.selectedOptionsForGrouping.splice(index, 1);
            if (field.element) {
                field.element.classList.remove('selected-for-grouping');
            }
            this.showToast(`הוסר: ${field.label_he || field.id} (${this.selectedOptionsForGrouping.length} שדות)`, 'info');
        }

        // Update status
        this.setStatus(`🔘 נבחרו ${this.selectedOptionsForGrouping.length} שדות לקיבוץ`, 'info');
    }

    /**
     * Create an option group from selected fields
     * @param {string} groupType - 'radio' or 'checkbox'
     */
    createOptionGroup(groupType = 'radio') {
        if (this.selectedOptionsForGrouping.length < 2) {
            this.showToast('יש לבחור לפחות 2 שדות ליצירת קבוצה', 'warning');
            return;
        }

        // Get selected fields
        const selectedFields = this.selectedOptionsForGrouping
            .map(id => this.fields.find(f => f.id === id))
            .filter(f => f);

        // Determine the page (all options should be on same page)
        const page = selectedFields[0]?.page || this.currentPage;

        // Create group ID
        const groupId = `group_${Date.now()}`;

        // Create options array from selected fields
        const options = selectedFields.map((field, index) => {
            // Get bbox from field
            let bbox = null;
            if (field.pdfX !== undefined) {
                bbox = {
                    x: field.pdfX,
                    y: field.pdfY,
                    width: field.pdfWidth,
                    height: field.pdfHeight
                };
            } else if (field.bbox && Array.isArray(field.bbox)) {
                const [xPct, yPct, wPct, hPct] = field.bbox;
                const dpiScale = this.dpiSetting / 72;
                const pageWidth = (this.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
                const pageHeight = (this.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;
                bbox = {
                    x: xPct * pageWidth,
                    y: yPct * pageHeight,
                    width: wPct * pageWidth,
                    height: hPct * pageHeight
                };
            }

            return {
                fieldId: field.id,
                value: '',           // To be set via text selection
                hebrewLabel: '',     // To be set via text selection
                bbox: bbox,
                linked: false
            };
        });

        // Create the option group
        const optionGroup = {
            groupId: groupId,
            page: page,
            type: groupType,
            hebrewName: '',      // To be set via text selection
            englishId: '',       // To be set via text selection
            linked: false,
            options: options
        };

        // ============ STEP 4: Smart Type Classification (Group-based) ============
        // Apply automatic group type detection based on field geometries
        if (window.TypeClassifier) {
            const groupClassification = window.TypeClassifier.classifyGroup(optionGroup, this.fields);

            // Apply classification if confident enough
            if (groupClassification.confidence >= 0.6) {
                optionGroup.type = groupClassification.type;
                optionGroup.classificationConfidence = groupClassification.confidence;
                optionGroup.classificationSource = groupClassification.source;
                optionGroup.classificationReason = groupClassification.reason;

                // Update groupType for field marking below
                const classifiedType = groupClassification.type;

                console.log('🧠 Smart Classification (Step 4 - Group):', {
                    type: groupClassification.type,
                    confidence: groupClassification.confidence,
                    reason: groupClassification.reason,
                    stats: groupClassification.stats
                });
            }
        }

        // Add to option groups array
        this.optionGroups.push(optionGroup);

        // Mark the fields as belonging to this group (use optionGroup.type which may have been auto-classified)
        const finalGroupType = optionGroup.type;
        selectedFields.forEach(field => {
            field.optionGroupId = groupId;
            field.type = finalGroupType;
            if (field.element) {
                field.element.classList.add('grouped-option');
                field.element.classList.remove('selected-for-grouping');
                field.element.dataset.groupId = groupId;
            }
        });

        // Exit grouping mode
        this.deactivateOptionGroupingMode();

        // Update sidebar
        this.updateFieldList();

        // Save state
        this.saveState('create_option_group');

        console.log('✅ Option group created:', optionGroup);
        this.showToast(`נוצרה קבוצת ${finalGroupType === 'radio' ? 'רדיו' : 'צ\'קבוקס'} עם ${options.length} אפשרויות`, 'success');

        // Prompt user to name the group
        this.showToast('כעת בחר את הקבוצה ולחץ "📌 שם קבוצה" להגדרת שם', 'info');
    }

    /**
     * Activate Group Naming Mode (for naming the entire group)
     * Uses StateMachine.GROUP_NAMING state
     * @param {Object} group - The option group to name
     */
    activateGroupNamingMode(group = null) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Reset any other active state
        if (sm && MS) {
            sm.reset(true);
        }

        // Find the group to name
        const targetGroup = group || this.getSelectedOptionGroup();

        if (!targetGroup) {
            this.showToast('יש לבחור קבוצה לפני הגדרת שם', 'warning');
            return;
        }

        // Transition to GROUP_NAMING state
        if (sm && MS) {
            sm.setState(MS.GROUP_NAMING);
        }

        this.currentGroupForNaming = targetGroup;
        this.textSelectionStart = null;
        this.currentTextSelection = null;

        // Update UI
        const layer = document.getElementById('mapping-layer');
        const btn = document.getElementById('btn-group-naming-mode');

        if (layer) {
            layer.classList.add('group-naming-mode');
            layer.style.cursor = 'text';
        }
        if (btn) btn.classList.add('active');

        // Highlight group options
        this.highlightGroupOptions(targetGroup.groupId, true);

        this.setStatus(`📌 בחר טקסט לשם הקבוצה: ${targetGroup.groupId}`, 'info');
        this.updateMappingBadge('📌 מצב שם קבוצה - גרור על טקסט ב-PDF - Esc לביטול');
        this.showToast('גרור מלבן על הטקסט שתרצה להגדיר כשם הקבוצה', 'info');
    }

    /**
     * Deactivate Group Naming Mode
     * Uses StateMachine.reset() to return to IDLE
     */
    deactivateGroupNamingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (this.currentGroupForNaming) {
            this.highlightGroupOptions(this.currentGroupForNaming.groupId, false);
        }

        // Reset StateMachine to IDLE
        if (sm && MS) {
            sm.reset(true);
        }

        this.currentGroupForNaming = null;

        // Cleanup selection
        if (this.currentTextSelection) {
            this.currentTextSelection.remove();
            this.currentTextSelection = null;
        }
        this.textSelectionStart = null;

        // Update UI
        const layer = document.getElementById('mapping-layer');
        const btn = document.getElementById('btn-group-naming-mode');

        if (layer) {
            layer.classList.remove('group-naming-mode');
            layer.style.cursor = '';
        }
        if (btn) btn.classList.remove('active');

        this.setStatus('מוכן', 'success');
        this.updateMappingBadge(null);
    }

    /**
     * Activate Option Labeling Mode (for labeling individual options)
     * Uses StateMachine.OPTION_LABELING state
     * @param {Object} option - The option to label
     * @param {Object} group - The parent group
     */
    activateOptionLabelingMode(option = null, group = null) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Reset any other active state
        if (sm && MS) {
            sm.reset(true);
        }

        // Find the option to label
        if (!option || !group) {
            this.showToast('יש לבחור אפשרות לפני הגדרת תווית', 'warning');
            return;
        }

        // Transition to OPTION_LABELING state
        if (sm && MS) {
            sm.setState(MS.OPTION_LABELING);
        }

        this.currentOptionForLabeling = option;
        this.currentGroupForNaming = group;
        this.textSelectionStart = null;
        this.currentTextSelection = null;

        // Update UI
        const layer = document.getElementById('mapping-layer');

        if (layer) {
            layer.classList.add('option-labeling-mode');
            layer.style.cursor = 'text';
        }

        // Highlight the specific option field
        const field = this.fields.find(f => f.id === option.fieldId);
        if (field && field.element) {
            field.element.classList.add('awaiting-label');
        }

        this.setStatus(`📌 בחר טקסט לתווית האפשרות`, 'info');
        this.updateMappingBadge('📌 מצב תווית אפשרות - גרור על טקסט ב-PDF - Esc לביטול');
        this.showToast('גרור מלבן על הטקסט שתרצה להגדיר כתווית האפשרות', 'info');
    }

    /**
     * Deactivate Option Labeling Mode
     * Uses StateMachine.reset() to return to IDLE
     */
    deactivateOptionLabelingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Remove highlighting from option field
        if (this.currentOptionForLabeling) {
            const field = this.fields.find(f => f.id === this.currentOptionForLabeling.fieldId);
            if (field && field.element) {
                field.element.classList.remove('awaiting-label');
            }
        }

        // Reset StateMachine to IDLE
        if (sm && MS) {
            sm.reset(true);
        }

        this.currentOptionForLabeling = null;
        this.currentGroupForNaming = null;

        // Cleanup selection
        if (this.currentTextSelection) {
            this.currentTextSelection.remove();
            this.currentTextSelection = null;
        }
        this.textSelectionStart = null;

        // Update UI
        const layer = document.getElementById('mapping-layer');

        if (layer) {
            layer.classList.remove('option-labeling-mode');
            layer.style.cursor = '';
        }

        this.setStatus('מוכן', 'success');
        this.updateMappingBadge(null);
    }

    /**
     * Finish group naming text selection
     */
    async finishGroupNamingSelection() {
        if (!this.currentTextSelection || !this.textSelectionStart || !this.currentGroupForNaming) {
            this.cleanupTextSelection();
            return;
        }

        // Get selection rectangle dimensions
        const x = parseFloat(this.currentTextSelection.style.left);
        const y = parseFloat(this.currentTextSelection.style.top);
        const width = parseFloat(this.currentTextSelection.style.width);
        const height = parseFloat(this.currentTextSelection.style.height);

        // Validate minimum size
        if (width < 10 || height < 10) {
            this.showToast('אזור הבחירה קטן מדי', 'warning');
            this.cleanupTextSelection();
            return;
        }

        try {
            // Extract text from the selected region
            const extractedText = await this.extractTextInRegion(x, y, width, height);

            if (!extractedText || extractedText.trim() === '') {
                this.showToast('לא נמצא טקסט באזור שנבחר', 'warning');
                this.cleanupTextSelection();
                return;
            }

            // Normalize the Hebrew text
            const normalizedHebrew = this.normalizeHebrewLabel(extractedText);

            // Generate English ID
            const englishId = this.toEnglishFieldId(normalizedHebrew);

            // Update the group
            this.currentGroupForNaming.hebrewName = normalizedHebrew;
            this.currentGroupForNaming.englishId = englishId;
            this.currentGroupForNaming.groupId = this.ensureUniqueGroupId(englishId);
            this.currentGroupForNaming.linked = this.isGroupFullyLabeled(this.currentGroupForNaming);

            console.log('✅ Group named:', {
                groupId: this.currentGroupForNaming.groupId,
                hebrewName: normalizedHebrew,
                englishId: englishId
            });

            // Update sidebar
            this.updateFieldList();

            // Save state
            this.saveState('name_group');

            this.showToast(`קבוצה נקראה בהצלחה: ${normalizedHebrew} → ${englishId}`, 'success');

        } catch (error) {
            console.error('Error extracting text:', error);
            this.showToast('שגיאה בחילוץ הטקסט', 'error');
        }

        // Cleanup and exit mode
        this.cleanupTextSelection();
        this.deactivateGroupNamingMode();
    }

    /**
     * Finish option labeling text selection
     */
    async finishOptionLabelingSelection() {
        if (!this.currentTextSelection || !this.textSelectionStart ||
            !this.currentOptionForLabeling || !this.currentGroupForNaming) {
            this.cleanupTextSelection();
            return;
        }

        // Get selection rectangle dimensions
        const x = parseFloat(this.currentTextSelection.style.left);
        const y = parseFloat(this.currentTextSelection.style.top);
        const width = parseFloat(this.currentTextSelection.style.width);
        const height = parseFloat(this.currentTextSelection.style.height);

        // Validate minimum size
        if (width < 10 || height < 10) {
            this.showToast('אזור הבחירה קטן מדי', 'warning');
            this.cleanupTextSelection();
            return;
        }

        try {
            // Extract text from the selected region
            const extractedText = await this.extractTextInRegion(x, y, width, height);

            if (!extractedText || extractedText.trim() === '') {
                this.showToast('לא נמצא טקסט באזור שנבחר', 'warning');
                this.cleanupTextSelection();
                return;
            }

            // Normalize the Hebrew text
            const normalizedHebrew = this.normalizeHebrewLabel(extractedText);

            // Generate English value
            const englishValue = this.toEnglishFieldId(normalizedHebrew);

            // Update the option
            this.currentOptionForLabeling.hebrewLabel = normalizedHebrew;
            this.currentOptionForLabeling.value = englishValue;
            this.currentOptionForLabeling.linked = true;

            // Update the corresponding field
            const field = this.fields.find(f => f.id === this.currentOptionForLabeling.fieldId);
            if (field) {
                // Update field.id to use English camelCase name
                const oldFieldId = field.id;
                field.id = englishValue;
                field.name = englishValue;
                field.label_he = normalizedHebrew;
                field.hebrewName = normalizedHebrew;
                field.englishId = englishValue;

                // Update overlay element's data-field-id
                if (field.element) {
                    field.element.setAttribute('data-field-id', englishValue);
                }

                // Update the option's fieldId reference
                this.currentOptionForLabeling.fieldId = englishValue;
            }

            // Check if group is now fully labeled
            this.currentGroupForNaming.linked = this.isGroupFullyLabeled(this.currentGroupForNaming);

            console.log('✅ Option labeled:', {
                fieldId: this.currentOptionForLabeling.fieldId,
                hebrewLabel: normalizedHebrew,
                value: englishValue
            });

            // Update sidebar
            this.updateFieldList();

            // Save state
            this.saveState('label_option');

            this.showToast(`אפשרות תויגה בהצלחה: ${normalizedHebrew} → ${englishValue}`, 'success');

        } catch (error) {
            console.error('Error extracting text:', error);
            this.showToast('שגיאה בחילוץ הטקסט', 'error');
        }

        // Cleanup and exit mode
        this.cleanupTextSelection();
        this.deactivateOptionLabelingMode();
    }

    /**
     * Check if an option group is fully labeled
     * @param {Object} group - Option group
     * @returns {boolean} True if all options have labels and group has a name
     */
    isGroupFullyLabeled(group) {
        if (!group.hebrewName || !group.englishId) return false;
        return group.options.every(opt => opt.hebrewLabel && opt.value);
    }

    /**
     * Ensure unique group ID
     * @param {string} baseId - Base ID
     * @returns {string} Unique group ID
     */
    ensureUniqueGroupId(baseId) {
        let id = baseId;
        let counter = 2;

        while (this.optionGroups.some(g => g.groupId === id)) {
            id = baseId + '_' + counter;
            counter++;
        }

        return id;
    }

    /**
     * Highlight group options visually
     * @param {string} groupId - Group ID
     * @param {boolean} highlight - Whether to highlight or remove highlight
     */
    highlightGroupOptions(groupId, highlight) {
        const group = this.optionGroups.find(g => g.groupId === groupId);
        if (!group) return;

        group.options.forEach(option => {
            const field = this.fields.find(f => f.id === option.fieldId);
            if (field && field.element) {
                if (highlight) {
                    field.element.classList.add('group-highlight');
                } else {
                    field.element.classList.remove('group-highlight');
                }
            }
        });
    }

    /**
     * Get the currently selected option group (based on selected field)
     * @returns {Object|null} The option group or null
     */
    getSelectedOptionGroup() {
        if (!this.selectedField || !this.selectedField.optionGroupId) {
            return null;
        }
        return this.optionGroups.find(g => g.groupId === this.selectedField.optionGroupId);
    }

    /**
     * Get option group by ID
     * @param {string} groupId - Group ID
     * @returns {Object|null} The option group or null
     */
    getOptionGroupById(groupId) {
        return this.optionGroups.find(g => g.groupId === groupId);
    }

    /**
     * Remove an option group
     * @param {string} groupId - Group ID to remove
     */
    removeOptionGroup(groupId) {
        const groupIndex = this.optionGroups.findIndex(g => g.groupId === groupId);
        if (groupIndex === -1) return;

        const group = this.optionGroups[groupIndex];

        // Remove group reference from fields
        group.options.forEach(option => {
            const field = this.fields.find(f => f.id === option.fieldId);
            if (field) {
                delete field.optionGroupId;
                field.type = 'text'; // Reset type
                if (field.element) {
                    field.element.classList.remove('grouped-option', 'group-highlight');
                    delete field.element.dataset.groupId;
                }
            }
        });

        // Remove the group
        this.optionGroups.splice(groupIndex, 1);

        // Update sidebar
        this.updateFieldList();

        // Save state
        this.saveState('remove_group');

        this.showToast('הקבוצה נמחקה', 'success');
    }

    /**
     * Get Step 3 export JSON (includes groups)
     * @returns {Object} JSON with fields and groups
     */
    getStep3ExportJSON() {
        const fieldsJSON = this.getStep1FieldsJSON();

        const groupsOutput = this.optionGroups.map(group => ({
            groupId: group.groupId,
            page: group.page,
            type: group.type,
            hebrewName: group.hebrewName || '',
            englishId: group.englishId || '',
            linked: group.linked || false,
            options: group.options.map(opt => ({
                value: opt.value || '',
                hebrewLabel: opt.hebrewLabel || '',
                bbox: opt.bbox
            }))
        }));

        return {
            fields: fieldsJSON.fields,
            groups: groupsOutput
        };
    }

    /**
     * Export Step 3 JSON to file
     */
    exportStep3JSON() {
        const jsonOutput = this.getStep3ExportJSON();

        if (jsonOutput.fields.length === 0 && jsonOutput.groups.length === 0) {
            this.showToast('אין שדות או קבוצות לייצוא', 'warning');
            return;
        }

        const blob = new Blob([JSON.stringify(jsonOutput, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `step3-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast(`ייצוא Step 3 הושלם - ${jsonOutput.fields.length} שדות, ${jsonOutput.groups.length} קבוצות`, 'success');
    }

    // ============ TABLE MAPPING MODE (Step 5) ============
    // Complete table detection and field mapping system

    /**
     * Activate Table Mapping Mode - Step A: Table Region Selection
     * Uses StateMachine.TABLE_REGION as source of truth
     */
    activateTableMappingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        if (!sm || !MS) {
            console.error('[activateTableMappingMode] StateMachine not available');
            return;
        }

        // Reset any other active state
        sm.reset(true);

        // Transition to TABLE_REGION state
        if (!sm.setState(MS.TABLE_REGION)) {
            console.error('[activateTableMappingMode] Failed to set TABLE_REGION state');
            return;
        }

        this.currentTableStep = 'region';
        this.currentTable = null;

        // Update UI
        const layer = document.getElementById('mapping-layer');
        const btn = document.getElementById('btn-table-mapping-mode');

        if (layer) {
            layer.classList.add('table-mapping-mode');
            layer.style.cursor = 'crosshair';
        }
        if (btn) btn.classList.add('active');

        this.setStatus('📐 בחר את אזור הטבלה - גרור מלבן סביב הטבלה', 'info');
        this.updateMappingBadge('📐 שלב 1: בחירת אזור טבלה - גרור מלבן - Esc לביטול');
        this.showToast('גרור מלבן סביב הטבלה המלאה', 'info');
        // FIX TASK 3: Trigger visual guide for table mode (fallback)
        this.startVisualGuide('table');
    }

    /**
     * Deactivate Table Mapping Mode
     * Uses StateMachine.reset() to return to IDLE
     */
    deactivateTableMappingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Reset StateMachine to IDLE
        if (sm && MS) {
            sm.reset(true);
        }

        this.currentTableStep = null;

        // Clear current table overlay if incomplete
        if (this.currentTable && !this.currentTable.isComplete) {
            this.removeTableOverlay(this.currentTable.tableId);
            this.currentTable = null;
        }

        // Update UI
        const layer = document.getElementById('mapping-layer');
        const btn = document.getElementById('btn-table-mapping-mode');

        if (layer) {
            layer.classList.remove('table-mapping-mode', 'sample-row-mode', 'column-mapping-mode');
            layer.style.cursor = '';
        }
        if (btn) btn.classList.remove('active');

        this.setStatus('מוכן', 'success');
        this.updateMappingBadge(null);

        // STABILITY: Stop visual guide if no modes are active
        if (!this.isAnyMappingModeActive()) {
            this.stopVisualGuide();
        }
    }

    /**
     * Toggle Table Mapping Mode
     * Uses StateMachine.isInTableFlow() for state checking
     */
    toggleTableMappingMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Try to use the new TableStepController
        if (this.initializeTableController()) {
            // Use new step-based table mapping
            if (this.tableController.isActive()) {
                // Already in table mode - show message instead of cancelling
                this.tableUIManager.showMessage('info', 'מצב טבלה פעיל - השתמש בכפתורים בפאנל לסיום או ביטול');
            } else {
                // Start the table wizard
                this.tableController.start();
                // Set interaction mode to route drawing to table controller
                this.interaction.mode = 'table_step_drawing';
                // Block other modes
                this.disableOtherModes();
                // Start visual guide in table mode
                this.startVisualGuide('table');
            }
        } else {
            // Fall back to StateMachine-based table mapping mode
            if (sm && sm.isInTableFlow()) {
                this.deactivateTableMappingMode();
            } else {
                this.activateTableMappingMode();
            }
        }
    }

    /**
     * Disable other mapping modes while table wizard is active
     * Uses StateMachine as source of truth - only updates UI
     */
    disableOtherModes() {
        const sm = this.stateMachine;

        // StateMachine handles state - this just cleans up UI
        // Note: The table controller manages its own state

        // Remove active states from other mode buttons
        const modeButtons = [
            'btn-field-mode', 'btn-checkbox-mode', 'btn-radio-mode',
            'btn-grouping-mode', 'btn-option-grouping-mode'
        ];
        modeButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.remove('active');
        });
    }

    /**
     * Re-enable modes after table wizard exits
     */
    enableModes() {
        // Reset interaction mode
        this.interaction.mode = 'idle';
    }

    /**
     * Initialize the new TableStepController
     * Lazy initialization - creates controller on first use
     * @returns {boolean} True if controller is available
     */
    initializeTableController() {
        // Check if already initialized
        if (this.tableController) {
            return true;
        }

        // Check if modules are available
        if (!window.TableStepController || !window.TableUIManager ||
            !window.TableOverlay || !window.TableModel || !window.tableValidator) {
            console.log('[Mapper] New table modules not available, using legacy mode');
            return false;
        }

        try {
            // Get the mapping layer as container for overlays
            const mappingLayer = document.getElementById('mapping-layer');
            if (!mappingLayer) {
                console.warn('[Mapper] Mapping layer not found for table overlay');
                return false;
            }

            // Create instances
            this.tableUIManager = new window.TableUIManager();
            this.tableOverlayManager = new window.TableOverlay(mappingLayer);
            const tableModel = new window.TableModel(this.currentPage);

            // Create the controller
            this.tableController = new window.TableStepController(
                this.tableUIManager,
                this.tableOverlayManager,
                window.tableValidator,
                tableModel
            );

            // Connect UI manager to controller
            this.tableUIManager.setController(this.tableController);

            // Connect visual guide if available
            if (this.visualGuide) {
                this.tableUIManager.setVisualGuide(this.visualGuide);
            } else if (window.VisualGuide) {
                // Initialize visual guide if not yet done
                this.visualGuide = new window.VisualGuide(mappingLayer);
                this.tableUIManager.setVisualGuide(this.visualGuide);
            }

            // Set up the finish callback to integrate with mapper
            this.tableController.onFinish = (tableData, fieldOverlays) => {
                this.onTableStepFinished(tableData, fieldOverlays);
            };

            // Set up cancel callback to clean up
            this.tableController.onCancel = () => {
                this.onTableStepCancelled();
            };

            console.log('[Mapper] TableStepController initialized successfully');
            return true;
        } catch (error) {
            console.error('[Mapper] Failed to initialize TableStepController:', error);
            return false;
        }
    }

    /**
     * Callback when new table step system finishes a table
     * @param {Object} tableData - Table data from toMappingJSON()
     * @param {Array} fieldOverlays - Field overlays for all cells
     */
    onTableStepFinished(tableData, fieldOverlays) {
        console.log('[Mapper] Table finished from new system:', tableData.tableId);

        // ========== CENTRALIZED CLEANUP BEFORE NEW TABLE RENDER ==========
        // Clear all existing table overlays to prevent ghost cells
        this.fullTableOverlayReset('onTableStepFinished');

        // Add to mapped tables array
        this.mappedTables.push(tableData);

        // Add field overlays to the fields array
        if (fieldOverlays && fieldOverlays.length > 0) {
            // FIX: Calculate scale factor for canvas → PDF conversion
            // overlay.bbox is in canvas pixels, but overlay-engine expects PDF points
            const container = document.getElementById('mapping-layer');
            const layerWidth = container ? container.offsetWidth : 1;
            const layerHeight = container ? container.offsetHeight : 1;
            const pdfW = this.pdfPageDimensions?.width || 595;
            const pdfH = this.pdfPageDimensions?.height || 842;

            // Scale factors: canvas pixels → PDF points
            const scaleX = pdfW / layerWidth;
            const scaleY = pdfH / layerHeight;

            console.log('[Mapper] Table field coordinate conversion:', {
                layerWidth, layerHeight, pdfW, pdfH, scaleX, scaleY
            });

            fieldOverlays.forEach(overlay => {
                // FIX: Convert canvas coordinates to PDF points
                // overlay.bbox is in canvas pixels (origin top-left), we need PDF points (origin bottom-left)
                const canvasBBox = overlay.bbox;

                // Scale canvas coords to PDF size
                const pdfX = canvasBBox.x * scaleX;
                const pdfWidth = canvasBBox.width * scaleX;
                const pdfHeight = canvasBBox.height * scaleY;

                // CRITICAL: Convert Y from canvas (top-left origin) to PDF (bottom-left origin)
                // Canvas Y: 0 at top, increases downward
                // PDF Y: 0 at bottom, increases upward
                // Formula: pdfY = pdfH - canvasY - height (measured from bottom of the box)
                const canvasY = canvasBBox.y * scaleY;
                const pdfY = pdfH - canvasY - pdfHeight;

                // bbox array for overlay-engine: [x, y, width, height] in PDF points (Y from bottom)
                const bboxArray = [pdfX, pdfY, pdfWidth, pdfHeight];

                // Convert overlay to field format
                const field = {
                    id: overlay.id,
                    tableId: overlay.tableId,
                    columnId: overlay.columnId,
                    rowIndex: overlay.rowIndex,
                    page: overlay.page || this.currentPage,
                    type: overlay.type || 'text',
                    hebrewName: overlay.hebrewName || '',
                    englishId: overlay.englishId || overlay.id,
                    isMapped: true,
                    isTableField: true,
                    direction: overlay.direction || 'rtl',
                    // FIX: bbox in PDF points for overlay-engine
                    bbox: bboxArray,
                    // Canvas coordinates (for reference)
                    _canvasBBox: {
                        x: canvasBBox.x,
                        y: canvasBBox.y,
                        width: canvasBBox.width,
                        height: canvasBBox.height
                    },
                    // PDF coordinates
                    pdfX: pdfX,
                    pdfY: pdfY,
                    pdfWidth: pdfWidth,
                    pdfHeight: pdfHeight
                };

                this.fields.push(field);

                // ============ UNIFIED FIELD REGISTRATION ============
                this._onFieldCreated(field);
            });

            console.log(`[Mapper] Added ${fieldOverlays.length} table fields with PDF coordinates`);
            this._triggerAutoSave();  // Auto-save after table fields creation
        }

        // Render the table cells
        this.renderTableCells(tableData);

        // FIX: Trigger overlay-engine to render the new table fields
        // This ensures table field overlays appear on the PDF after creation
        if (typeof this.renderOverlayFromJson === 'function') {
            this.renderOverlayFromJson();
        }

        // Update sidebar
        this.updateFieldList();
        this.updateSidebarCounts();

        // Reset the table controller for next use
        if (this.tableController && this.tableController.model) {
            this.tableController.model.reset();
        }

        // Auto-save
        this.autoSave();

        this.showToast(`טבלה נוספה: ${tableData.columns.length} עמודות × ${tableData.rowCount} שורות`, 'success');

        // Reset interaction mode since table is done
        this.interaction.mode = 'idle';

        // Enable other modes again
        this.enableModes();

        // STABILITY: Stop visual guide when table wizard finishes
        if (this.visualGuide) {
            this.visualGuide.clearHints();
        }
        if (!this.isAnyMappingModeActive()) {
            this.stopVisualGuide();
        }
    }

    /**
     * Callback when table wizard is cancelled
     * Clean up all overlays and reset UI
     */
    onTableStepCancelled() {
        console.log('[Mapper] Table wizard cancelled');

        // Reset interaction mode
        this.interaction.mode = 'idle';

        // Enable other modes again
        this.enableModes();

        // STABILITY: Stop visual guide when table wizard is cancelled
        if (this.visualGuide) {
            this.visualGuide.clearHints();
        }
        if (!this.isAnyMappingModeActive()) {
            this.stopVisualGuide();
        }

        // Reset table controller model for next use
        if (this.tableController && this.tableController.model) {
            this.tableController.model.reset();
        }

        this.showToast('מיפוי הטבלה בוטל', 'info');
    }

    /**
     * Create table from selected region (Step A completion)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     */
    createTableFromRegion(x, y, width, height) {
        // Validate minimum size
        if (width < 100 || height < 50) {
            this.showToast('אזור הטבלה קטן מדי - נסה שוב', 'warning');
            return;
        }

        // Generate unique table ID
        this.tableCounter++;
        const tableId = `table_${Date.now()}_${this.tableCounter}`;

        // Get layer dimensions for coordinate conversion
        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        const layerWidth = Math.max(layer.offsetWidth, 1);
        const layerHeight = Math.max(layer.offsetHeight, 1);

        // Get PDF dimensions
        const dpiScale = this.dpiSetting / 72;
        const pageWidth = (this.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
        const pageHeight = (this.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;

        // Convert to PDF coordinates
        let pdfCoords;
        try {
            pdfCoords = window.CoordinateTranslator.canvasBoxToPdfBox(
                x, y, width, height,
                layerWidth, layerHeight,
                pageWidth, pageHeight
            );
        } catch (error) {
            console.error('❌ Coordinate conversion failed:', error);
            this.showToast('שגיאה בהמרת קואורדינטות', 'error');
            return;
        }

        // Create table object using TableEngine
        const table = window.TableEngine.createTableObject(tableId, this.currentPage, {
            x: pdfCoords.pdfX,
            y: pdfCoords.pdfY,
            width: pdfCoords.pdfWidth,
            height: pdfCoords.pdfHeight
        });

        // Store canvas coordinates for overlay rendering
        table._canvasBBox = { x, y, width, height };

        this.currentTable = table;

        // Render table overlay
        this.renderTableOverlay(table);

        console.log('📐 Table region selected:', table);

        // Move to Step B: Row Detection
        this.proceedToRowDetection();
    }

    /**
     * Step B: Row Detection and Estimation
     */
    async proceedToRowDetection() {
        if (!this.currentTable) return;

        this.currentTableStep = 'rows';
        this.setStatus('📐 מזהה שורות בטבלה...', 'info');

        try {
            // Get text content for row detection
            const page = await this.pdfDocument.getPage(this.currentPage);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: this.dpiSetting / 72 });

            // Detect rows using TableEngine
            const detection = window.TableEngine.detectRowsFromText(
                this.currentTable.bbox,
                textContent.items,
                viewport
            );

            console.log('🔍 Row detection result:', detection);

            if (detection.confidence >= 0.6 && detection.rowCount >= 2) {
                // Auto-detected with good confidence
                this.currentTable.rowCount = detection.rowCount;
                this.currentTable.rowHeight = detection.rowHeight;

                this.showToast(`זוהו ${detection.rowCount} שורות (גובה: ${detection.rowHeight}px)`, 'success');
                this.proceedToSampleRowSelection();
            } else {
                // Need user input - estimate from dimensions
                const estimation = window.TableEngine.estimateRowsFromDimensions(this.currentTable.bbox);
                this.currentTable.rowCount = estimation.rowCount;
                this.currentTable.rowHeight = estimation.rowHeight;

                // Ask user to confirm/adjust
                this.showRowCountDialog(estimation.rowCount, estimation.rowHeight);
            }
        } catch (error) {
            console.error('Error in row detection:', error);
            // Fallback to estimation
            const estimation = window.TableEngine.estimateRowsFromDimensions(this.currentTable.bbox);
            this.showRowCountDialog(estimation.rowCount, estimation.rowHeight);
        }
    }

    /**
     * Show dialog for user to confirm/adjust row count
     * @param {number} estimatedRows - Estimated row count
     * @param {number} estimatedHeight - Estimated row height
     */
    showRowCountDialog(estimatedRows, estimatedHeight) {
        // Create dialog
        const dialog = document.createElement('div');
        dialog.id = 'row-count-dialog';
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <div class="dialog-header">
                    <h3>📐 הגדרת שורות הטבלה</h3>
                    <button class="dialog-close" onclick="mapper.closeRowCountDialog()">✕</button>
                </div>
                <div class="dialog-body">
                    <div class="dialog-row">
                        <label>מספר שורות</label>
                        <input type="number" id="table-row-count" min="2" max="100" value="${estimatedRows}">
                    </div>
                    <div class="dialog-row">
                        <label>גובה שורה (px)</label>
                        <input type="number" id="table-row-height" min="15" max="100" value="${Math.round(estimatedHeight)}">
                    </div>
                    <div class="dialog-note">
                        <p>💡 ערכים אלה הוערכו אוטומטית. ניתן לשנות אותם לפי הצורך.</p>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="btn-cancel" onclick="mapper.closeRowCountDialog()">ביטול</button>
                    <button class="btn-primary" onclick="mapper.confirmRowCount()">אישור</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
    }

    /**
     * Close row count dialog
     */
    closeRowCountDialog() {
        const dialog = document.getElementById('row-count-dialog');
        if (dialog) dialog.remove();
    }

    /**
     * Confirm row count from dialog
     */
    confirmRowCount() {
        const rowCountInput = document.getElementById('table-row-count');
        const rowHeightInput = document.getElementById('table-row-height');

        if (!rowCountInput || !rowHeightInput || !this.currentTable) {
            this.closeRowCountDialog();
            return;
        }

        this.currentTable.rowCount = parseInt(rowCountInput.value) || 5;
        this.currentTable.rowHeight = parseInt(rowHeightInput.value) || 28;

        this.closeRowCountDialog();

        // Update table overlay with grid
        this.updateTableGridOverlay();

        // Proceed to sample row selection
        this.proceedToSampleRowSelection();
    }

    /**
     * Step C: Sample Row Selection - SIMPLIFIED: Skip sample row, go directly to column mapping
     */
    proceedToSampleRowSelection() {
        if (!this.currentTable) return;

        // SIMPLIFIED: Set sample row to first row of table automatically
        // No need for user to select sample row - columns are drawn directly on table
        this.currentTable.sampleRowBBox = {
            x: this.currentTable.bbox.x,
            y: this.currentTable.bbox.y,
            width: this.currentTable.bbox.width,
            height: this.currentTable.rowHeight
        };
        this.currentTable.sampleRowIndex = 0;

        console.log('📐 Sample row auto-set to first row');

        // Go directly to column mapping
        this.proceedToColumnMapping();
    }

    /**
     * Set sample row from selection
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     */
    setSampleRow(x, y, width, height) {
        if (!this.currentTable) return;

        // Get layer dimensions for coordinate conversion
        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        const layerWidth = Math.max(layer.offsetWidth, 1);
        const layerHeight = Math.max(layer.offsetHeight, 1);

        // Get PDF dimensions
        const dpiScale = this.dpiSetting / 72;
        const pageWidth = (this.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
        const pageHeight = (this.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;

        // Convert to PDF coordinates
        let pdfCoords;
        try {
            pdfCoords = window.CoordinateTranslator.canvasBoxToPdfBox(
                x, y, width, height,
                layerWidth, layerHeight,
                pageWidth, pageHeight
            );
        } catch (error) {
            console.error('❌ Coordinate conversion failed:', error);
            return;
        }

        this.currentTable.sampleRowBBox = {
            x: pdfCoords.pdfX,
            y: pdfCoords.pdfY,
            width: pdfCoords.pdfWidth,
            height: pdfCoords.pdfHeight
        };

        this.currentTable._sampleRowCanvas = { x, y, width, height };

        // Calculate sample row index
        this.currentTable.sampleRowIndex = window.TableEngine.calculateSampleRowIndex(
            this.currentTable.bbox,
            this.currentTable.sampleRowBBox,
            this.currentTable.rowHeight
        );

        // Render sample row overlay
        this.renderSampleRowOverlay();

        console.log('📐 Sample row set:', this.currentTable.sampleRowBBox);
        this.showToast(`שורה לדוגמה נבחרה (שורה ${this.currentTable.sampleRowIndex + 1})`, 'success');

        // Proceed to column mapping
        this.proceedToColumnMapping();
    }

    /**
     * Step D: Column Mapping Mode - Draw columns directly on table
     * Uses StateMachine.TABLE_COLUMN_MAPPING state
     */
    proceedToColumnMapping() {
        if (!this.currentTable) return;

        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        this.currentTableStep = 'columns';

        // Transition to TABLE_COLUMN_MAPPING state
        if (sm && MS) {
            sm.setState(MS.TABLE_COLUMN_MAPPING);
        }

        // Update UI
        const layer = document.getElementById('mapping-layer');
        if (layer) {
            layer.classList.remove('sample-row-mode');
            layer.classList.add('column-mapping-mode');
        }

        this.setStatus('📐 צייר עמודות על הטבלה', 'info');
        this.updateMappingBadge(`📐 שלב 2: צייר עמודות (${this.currentTable.columns?.length || 0} עמודות) - Enter לסיום`);
        this.showToast('צייר מלבן על כל עמודה בטבלה. לחץ Enter כשסיימת.', 'info');
    }

    /**
     * Add column field to current table (during column mapping mode)
     * Uses StateMachine.is(TABLE_COLUMN_MAPPING) for state check
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     */
    addTableColumn(x, y, width, height) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Use StateMachine for state check
        const isInColumnMapping = sm && MS && sm.is(MS.TABLE_COLUMN_MAPPING);
        if (!this.currentTable || !isInColumnMapping) return;

        // Get layer dimensions
        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        const layerWidth = Math.max(layer.offsetWidth, 1);
        const layerHeight = Math.max(layer.offsetHeight, 1);

        // Get PDF dimensions
        const dpiScale = this.dpiSetting / 72;
        const pageWidth = (this.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
        const pageHeight = (this.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;

        // Convert to PDF coordinates
        let pdfCoords;
        try {
            pdfCoords = window.CoordinateTranslator.canvasBoxToPdfBox(
                x, y, width, height,
                layerWidth, layerHeight,
                pageWidth, pageHeight
            );
        } catch (error) {
            console.error('❌ Coordinate conversion failed:', error);
            return;
        }

        // Generate column ID
        const columnIndex = this.currentTable.columns.length + 1;
        const columnId = `col_${columnIndex}`;

        // Create column object
        const column = window.TableEngine.createColumnObject(columnId, '', {
            x: pdfCoords.pdfX,
            y: pdfCoords.pdfY,
            width: pdfCoords.pdfWidth,
            height: pdfCoords.pdfHeight
        });

        column._canvasBBox = { x, y, width, height };

        this.currentTable.columns.push(column);

        // Render column overlay
        this.renderColumnOverlay(column);

        console.log('📐 Column added:', column);
        this.showToast(`עמודה ${columnIndex} נוספה. לחץ Enter לסיום או המשך לצייר עמודות.`, 'info');

        // Update badge with column count
        this.updateMappingBadge(`📐 שלב 2: צייר עמודות (${this.currentTable.columns.length} עמודות) - Enter לסיום`);

        // Update sidebar
        this.updateFieldList();
    }

    /**
     * Finish column mapping and generate rows (Step E)
     * Uses StateMachine to reset to IDLE
     */
    finishTableMapping() {
        if (!this.currentTable || this.currentTable.columns.length === 0) {
            this.showToast('יש להגדיר לפחות עמודה אחת', 'warning');
            return;
        }

        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        this.currentTableStep = 'complete';

        // Reset StateMachine to IDLE (table flow complete)
        if (sm && MS) {
            sm.reset(true);
        }

        // Generate all rows using TableEngine
        this.currentTable.rows = window.TableEngine.generateRows(
            this.currentTable,
            this.currentTable.sampleRowBBox
        );

        this.currentTable.isComplete = true;

        // Step 6: Validate table structure before finalizing
        if (window.TableValidator) {
            const validationReport = window.TableValidator.validateTableStructure(this.currentTable);
            this.currentTable.validationReport = validationReport;

            // Store invalid components for overlay highlighting
            this.currentTable.invalidComponents = window.TableValidator.getInvalidComponents(this.currentTable);

            // Show validation report in sidebar
            if (window.MapperSidebarEngine && window.MapperSidebarEngine.showTableValidationReport) {
                window.MapperSidebarEngine.showTableValidationReport(validationReport, this.currentTable.tableId);
            }

            // Log validation results
            console.log(`📋 Table Validation Report for ${this.currentTable.tableId}:`, validationReport);

            if (!validationReport.valid) {
                console.warn('⚠️ Table has validation errors:', validationReport.errors);
                this.showToast(`טבלה נוצרה עם ${validationReport.summary.criticalCount} שגיאות - בדוק בסרגל הצד`, 'warning');
            } else if (validationReport.warnings.length > 0) {
                console.log('⚠️ Table has warnings:', validationReport.warnings);
            }
        }

        // Add to mapped tables array
        this.mappedTables.push(this.currentTable);

        // Generate field overlays for all cells
        const tableFields = window.TableEngine.generateTableFieldOverlays(this.currentTable, this);

        // FIX: Calculate scale factor for canvas → PDF conversion
        const container = document.getElementById('mapping-layer');
        const layerWidth = container ? container.offsetWidth : 1;
        const layerHeight = container ? container.offsetHeight : 1;
        const pdfW = this.pdfPageDimensions?.width || 595;
        const pdfH = this.pdfPageDimensions?.height || 842;
        const scaleX = pdfW / layerWidth;
        const scaleY = pdfH / layerHeight;

        // Add table fields to main fields array
        // FIX: Convert canvas coordinates to PDF points with proper Y-axis flip
        tableFields.forEach(field => {
            // Convert bbox object to PDF points array
            if (field.bbox && !Array.isArray(field.bbox)) {
                const canvasBBox = field.bbox;

                // Scale to PDF size
                const pdfX = canvasBBox.x * scaleX;
                const pdfWidth = canvasBBox.width * scaleX;
                const pdfHeight = canvasBBox.height * scaleY;

                // Convert Y from canvas (top-left origin) to PDF (bottom-left origin)
                const canvasY = canvasBBox.y * scaleY;
                const pdfY = pdfH - canvasY - pdfHeight;

                field.bbox = [pdfX, pdfY, pdfWidth, pdfHeight];
                field.pdfX = pdfX;
                field.pdfY = pdfY;
                field.pdfWidth = pdfWidth;
                field.pdfHeight = pdfHeight;
            }
            field.isMapped = true;
            this.fields.push(field);

            // ============ UNIFIED FIELD REGISTRATION ============
            this._onFieldCreated(field);
        });

        // Auto-save after table mapping completion
        this._triggerAutoSave();

        // Render all table cells (with validation highlights if needed)
        this.renderTableCells(this.currentTable);

        // FIX: Trigger overlay-engine to render the new table fields
        if (typeof this.renderOverlayFromJson === 'function') {
            this.renderOverlayFromJson();
        }

        console.log('✅ Table mapping complete:', this.currentTable);

        // Show success/warning message based on validation
        if (this.currentTable.validationReport && this.currentTable.validationReport.valid) {
            this.showToast(`טבלה נוצרה בהצלחה: ${this.currentTable.columns.length} עמודות × ${this.currentTable.rowCount} שורות`, 'success');
        }

        // Exit table mapping mode
        this.deactivateTableMappingMode();

        // Update sidebar
        this.updateFieldList();

        // Save state
        this.saveState('create_table');
    }

    /**
     * Activate column naming mode (Step 2 style text selection for table columns)
     * Uses StateMachine.TABLE_COLUMN_NAMING state
     * @param {Object} column - Column to name
     */
    activateColumnNamingMode(column) {
        if (!column || !this.currentTable) return;

        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        // Transition to TABLE_COLUMN_NAMING state
        if (sm && MS) {
            sm.setState(MS.TABLE_COLUMN_NAMING);
        }

        this.currentFieldForNaming = {
            ...column,
            isTableColumn: true,
            tableId: this.currentTable.tableId
        };

        const layer = document.getElementById('mapping-layer');
        if (layer) {
            layer.classList.add('text-selection-mode');
            layer.style.cursor = 'text';
        }

        this.setStatus(`📌 בחר טקסט לשם העמודה: ${column.columnId}`, 'info');
        this.updateMappingBadge('📌 מצב בחירת טקסט לעמודה - גרור על הטקסט - Esc לביטול');
    }

    // ============ TABLE OVERLAY RENDERING ============

    /**
     * Render table region overlay
     * @param {Object} table - Table object
     */
    renderTableOverlay(table) {
        const container = document.getElementById('mapping-layer');
        if (!container) return;

        // FIX TASK 2: Remove ALL existing overlays for this table to prevent duplication
        // This is the SINGLE SOURCE for creating table overlays
        document.querySelectorAll(`.table-region-overlay[id="table-overlay-${table.tableId}"]`).forEach(el => {
            console.log('[TableOverlay] Removing duplicate overlay for:', table.tableId);
            el.remove();
        });
        // Also remove any elements with data-table-id attribute matching this table
        document.querySelectorAll(`[data-table-id="${table.tableId}"]`).forEach(el => {
            if (el.classList.contains('table-region-overlay')) {
                console.log('[TableOverlay] Removing data-attr overlay for:', table.tableId);
                el.remove();
            }
        });

        // If no canvas bbox, compute from PDF coordinates
        if (!table._canvasBBox && table.bbox) {
            const canvas = document.querySelector('#pdf-canvas');
            if (canvas) {
                const canvasRect = canvas.getBoundingClientRect();
                const pageWidth = this.pageWidth || canvasRect.width;
                const pageHeight = this.pageHeight || canvasRect.height;
                const scaleX = canvasRect.width / pageWidth;
                const scaleY = canvasRect.height / pageHeight;

                // table.bbox is in PDF points [x, y, width, height]
                table._canvasBBox = {
                    x: table.bbox[0] * scaleX,
                    y: table.bbox[1] * scaleY,
                    width: table.bbox[2] * scaleX,
                    height: table.bbox[3] * scaleY
                };
            }
        }

        if (!table._canvasBBox) return;

        // Remove existing overlay
        this.removeTableOverlay(table.tableId);

        const { x, y, width, height } = table._canvasBBox;

        const overlay = document.createElement('div');
        overlay.id = `table-overlay-${table.tableId}`;
        overlay.className = 'table-region-overlay';
        overlay.style.left = x + 'px';
        overlay.style.top = y + 'px';
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';

        // Add table label
        const label = document.createElement('div');
        label.className = 'table-label';
        label.textContent = `טבלה: ${table.tableId}`;
        overlay.appendChild(label);

        container.appendChild(overlay);
    }

    /**
     * Update table grid overlay
     */
    updateTableGridOverlay() {
        if (!this.currentTable || !this.currentTable._canvasBBox) return;

        const container = document.getElementById('mapping-layer');
        if (!container) return;

        const overlay = document.getElementById(`table-overlay-${this.currentTable.tableId}`);
        if (!overlay) return;

        // Remove existing grid lines
        overlay.querySelectorAll('.grid-line').forEach(el => el.remove());

        const { width, height } = this.currentTable._canvasBBox;
        const { rowCount, rowHeight } = this.currentTable;

        // Calculate display row height (convert from PDF to canvas)
        const displayRowHeight = height / rowCount;

        // Add horizontal grid lines
        for (let i = 1; i < rowCount; i++) {
            const line = document.createElement('div');
            line.className = 'grid-line horizontal';
            line.style.top = (i * displayRowHeight) + 'px';
            line.style.width = '100%';
            overlay.appendChild(line);
        }
    }

    /**
     * Render sample row overlay
     */
    renderSampleRowOverlay() {
        if (!this.currentTable || !this.currentTable._sampleRowCanvas) return;

        const container = document.getElementById('mapping-layer');
        if (!container) return;

        // Remove existing sample row overlay
        const existing = document.getElementById(`sample-row-${this.currentTable.tableId}`);
        if (existing) existing.remove();

        const { x, y, width, height } = this.currentTable._sampleRowCanvas;

        const overlay = document.createElement('div');
        overlay.id = `sample-row-${this.currentTable.tableId}`;
        overlay.className = 'sample-row-overlay';
        overlay.style.left = x + 'px';
        overlay.style.top = y + 'px';
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';

        const label = document.createElement('div');
        label.className = 'sample-row-label';
        label.textContent = 'שורה לדוגמה';
        overlay.appendChild(label);

        container.appendChild(overlay);
    }

    /**
     * Render column overlay
     * @param {Object} column - Column object
     */
    renderColumnOverlay(column) {
        if (!column._canvasBBox) return;

        const container = document.getElementById('mapping-layer');
        if (!container) return;

        const { x, y, width, height } = column._canvasBBox;

        const overlay = document.createElement('div');
        overlay.id = `column-overlay-${column.columnId}`;
        overlay.className = 'column-field-overlay';
        overlay.dataset.columnId = column.columnId;
        overlay.style.left = x + 'px';
        overlay.style.top = y + 'px';
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';

        const label = document.createElement('div');
        label.className = 'column-label';
        label.textContent = column.hebrewName || column.columnId;
        overlay.appendChild(label);

        // Add click handler for naming
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.activateColumnNamingMode(column);
        });

        container.appendChild(overlay);
    }

    /**
     * Render all table cells as field overlays
     * @param {Object} table - Complete table object
     *
     * ENHANCED: Implements 5 UI polish tasks:
     * - Task 1: Softer cell fill (25% opacity)
     * - Task 2: Clear 1px borders per cell
     * - Task 3: Optional dev labels (row,col)
     * - Task 4: Correct page association
     * - Task 5: Proper zoom scaling from PDF coordinates
     */
    renderTableCells(table) {
        // TASK 4: Get correct container - prefer page-specific layer
        let container = document.querySelector(`.page-layer[data-page-number="${table.page || this.currentPage}"]`);
        if (!container) {
            container = document.getElementById('mapping-layer');
        }
        if (!container) return;

        const { tableId, columns, rows, rowCount, invalidComponents } = table;

        // TASK 4: Skip rendering if table is not on current page
        const tablePage = table.page || 1;
        if (tablePage !== this.currentPage) {
            console.log(`📐 Skipping table ${tableId} - on page ${tablePage}, current page is ${this.currentPage}`);
            return;
        }

        // ========== CENTRALIZED CLEANUP — SINGLE SOURCE OF TRUTH ==========
        // Remove ALL existing overlays for this specific table only
        // Using targeted cleanup to avoid clearing other tables being rendered in sequence
        document.querySelectorAll(`.table-cell-overlay[data-table-id="${tableId}"]`).forEach(el => el.remove());
        document.querySelectorAll(`.table-region-overlay[data-table-id="${tableId}"]`).forEach(el => el.remove());

        // Get CURRENT canvas dimensions (may have changed due to resize)
        const layerWidth = container.offsetWidth;
        const layerHeight = container.offsetHeight;

        // ========== OUT-OF-BOUNDS GUARD — PREVENT INVALID OVERLAYS ==========
        // Skip rendering if canvas dimensions are invalid
        if (layerWidth <= 0 || layerHeight <= 0) {
            console.warn(`📐 [renderTableCells] Invalid canvas dimensions, skipping table ${tableId}`);
            return;
        }

        // TASK 5: Get PDF page dimensions (constant, in points) - used as base for scaling
        const dpiScale = this.dpiSetting / 72;
        const pdfPageWidth = (this.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
        const pdfPageHeight = (this.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;

        // ========== VALIDATE TABLE BBOX BEFORE RENDER ==========
        if (!table.bbox || table.bbox.width <= 0 || table.bbox.height <= 0) {
            console.warn(`📐 [renderTableCells] Invalid table bbox, skipping table ${tableId}`);
            return;
        }

        // TASK 5: Convert table PDF bbox to current canvas coordinates using proper translator
        // This ensures coordinates are always derived from PDF points, not canvas pixels
        const canvasTable = window.CoordinateTranslator.pdfBoxToCanvasBox(
            table.bbox.x, table.bbox.y, table.bbox.width, table.bbox.height,
            layerWidth, layerHeight, pdfPageWidth, pdfPageHeight
        );

        // ========== OUT-OF-BOUNDS GUARD — SKIP INVALID TABLE COORDS ==========
        if (canvasTable.canvasWidth <= 0 || canvasTable.canvasHeight <= 0) {
            console.warn(`📐 [renderTableCells] Invalid canvas table dimensions, skipping table ${tableId}`);
            return;
        }
        if (canvasTable.canvasX < -50 || canvasTable.canvasY < -50) {
            console.warn(`📐 [renderTableCells] Table position out of bounds (negative), skipping table ${tableId}`);
            return;
        }
        if (canvasTable.canvasX > layerWidth + 50 || canvasTable.canvasY > layerHeight + 50) {
            console.warn(`📐 [renderTableCells] Table position out of bounds (beyond canvas), skipping table ${tableId}`);
            return;
        }

        // Calculate actual row height in canvas coordinates
        const canvasRowHeight = canvasTable.canvasHeight / rowCount;

        console.log('📐 renderTableCells debug:', {
            layerWidth, layerHeight,
            pdfPageWidth, pdfPageHeight,
            tablePdfBBox: table.bbox,
            canvasTable,
            rowCount,
            canvasRowHeight,
            page: tablePage,
            debugLabels: this.debugTableLabels
        });

        // Get invalid components for highlighting
        const invalidCols = invalidComponents?.columns || [];
        const invalidRows = invalidComponents?.rows || [];

        // Get cell styling options
        const cellStyle = this.tableCellStyle || { fillOpacity: 0.25, borderWidth: 1, borderOpacity: 0.7 };

        // Render cells using dynamically calculated canvas coordinates
        rows.forEach((row, rowIndex) => {
            columns.forEach((col, colIndex) => {
                // TASK 5: Convert column PDF coordinates to current canvas coordinates
                const canvasCol = window.CoordinateTranslator.pdfBoxToCanvasBox(
                    col.bbox.x, col.bbox.y, col.bbox.width, col.bbox.height,
                    layerWidth, layerHeight, pdfPageWidth, pdfPageHeight
                );

                // Cell position: X from column, Y calculated from table top + row offset
                const cellX = canvasCol.canvasX;
                const cellY = canvasTable.canvasY + (rowIndex * canvasRowHeight);
                const cellWidth = canvasCol.canvasWidth;
                const cellHeight = canvasRowHeight;

                // ========== CELL-LEVEL OUT-OF-BOUNDS GUARD ==========
                // Skip cells with invalid dimensions
                if (cellWidth <= 0 || cellHeight <= 0) {
                    return; // Skip this cell
                }
                // Skip cells positioned outside the visible canvas (with tolerance)
                if (cellX < -100 || cellY < -100) {
                    return; // Skip this cell - too far left/top
                }
                if (cellX > layerWidth + 100 || cellY > layerHeight + 100) {
                    return; // Skip this cell - too far right/bottom
                }

                const overlay = document.createElement('div');
                overlay.className = 'field-overlay table-cell-overlay';
                overlay.dataset.tableId = tableId;
                overlay.dataset.columnId = col.columnId;
                overlay.dataset.rowIndex = rowIndex;
                overlay.dataset.colIndex = colIndex;  // TASK 3: Store col index for labels
                overlay.dataset.fieldId = `${tableId}_${col.columnId}_row${rowIndex}`;
                overlay.dataset.page = tablePage;  // TASK 4: Store page number

                // TASK 5: Position using canvas coordinates derived from PDF
                overlay.style.left = cellX + 'px';
                overlay.style.top = cellY + 'px';
                overlay.style.width = cellWidth + 'px';
                overlay.style.height = cellHeight + 'px';

                // TASK 1 & 2: Apply dynamic styling (can be overridden via CSS)
                // These inline styles allow per-instance customization
                if (cellStyle.fillOpacity !== 0.25) {
                    overlay.style.background = `rgba(0, 128, 255, ${cellStyle.fillOpacity})`;
                }
                if (cellStyle.borderWidth !== 1) {
                    overlay.style.borderWidth = `${cellStyle.borderWidth}px`;
                }

                // TASK 3: Add dev label if debug mode is enabled
                if (this.debugTableLabels) {
                    const debugLabel = document.createElement('div');
                    debugLabel.className = 'table-debug-label';
                    debugLabel.textContent = `${rowIndex},${colIndex}`;
                    overlay.appendChild(debugLabel);
                }

                // Step 6: Add validation error highlighting
                const isInvalidColumn = invalidCols.includes(col.columnId) || invalidCols.includes(colIndex);
                const isInvalidRow = invalidRows.includes(rowIndex);

                if (isInvalidColumn || isInvalidRow) {
                    overlay.classList.add('validation-error');

                    // Add tooltip with error info
                    const errorMessages = [];
                    if (isInvalidColumn) {
                        const colErrors = invalidComponents.errors?.filter(e =>
                            e.context?.columnId === col.columnId || e.context?.columnIndex === colIndex
                        ) || [];
                        colErrors.forEach(e => errorMessages.push(e.message));
                    }
                    if (isInvalidRow) {
                        const rowErrors = invalidComponents.errors?.filter(e =>
                            e.context?.rowIndex === rowIndex
                        ) || [];
                        rowErrors.forEach(e => errorMessages.push(e.message));
                    }

                    if (errorMessages.length > 0) {
                        overlay.title = errorMessages.join('\n');
                    }
                }

                // Add tooltip with cell info (always)
                if (!overlay.title) {
                    overlay.title = `${col.hebrewName || col.columnId} - שורה ${rowIndex + 1}`;
                }

                container.appendChild(overlay);
            });
        });

        console.log('📐 Table cells rendered:', {
            tableId,
            rowCount,
            colCount: columns.length,
            canvasRowHeight,
            page: tablePage
        });

        // Visual Test hook - notify runner of table cell render
        window.VisualTestRunner?.onRenderTableCells(tableId);
    }

    /**
     * ============ CENTRALIZED TABLE OVERLAY CLEANUP ============
     * SINGLE AUTHORITATIVE function to remove ALL table overlays globally.
     * This is the ONLY function that should be used for table overlay cleanup.
     *
     * Call this before:
     * - Any table cell render
     * - Zoom changes
     * - Page changes
     * - Window resize
     * - Table wizard completion
     *
     * @param {string} [source] - Optional source identifier for debugging
     */
    fullTableOverlayReset(triggerSource) {
        // Prevent wiping overlays unless we are actually mapping a table
        const sm = this.stateMachine;
        const MS = MapperStateEnum;
        const isInTableFlow = sm && MS && sm.isInTableFlow();
        if (!isInTableFlow) {
            console.log("[fullTableOverlayReset] Skipped reset (not in table flow):", triggerSource);
            return;
        }

        console.log("[fullTableOverlayReset] Performing table-only cleanup:", triggerSource);

        // Clean ONLY table overlays. Do NOT remove regular fields.
        this.tableOverlay = null;

        const page = this.currentPage;
        const overlayContainer = document.querySelector(`.fields-overlay[data-page-num="${page}"]`);
        if (overlayContainer) {
            // Remove ONLY overlays related to active table
            const tableElements = overlayContainer.querySelectorAll('.table-overlay, .table-cell-overlay');
            tableElements.forEach(el => el.remove());
        }
    }

    /**
     * Alias for backwards compatibility
     * @deprecated Use fullTableOverlayReset() instead
     */
    clearAllTableOverlays() {
        this.fullTableOverlayReset('clearAllTableOverlays-legacy');
    }

    /**
     * Remove table overlay for a specific table
     * @param {string} tableId - Table ID
     */
    removeTableOverlay(tableId) {
        const overlay = document.getElementById(`table-overlay-${tableId}`);
        if (overlay) overlay.remove();

        const sampleRow = document.getElementById(`sample-row-${tableId}`);
        if (sampleRow) sampleRow.remove();

        // Remove column overlays
        document.querySelectorAll(`[id^="column-overlay-"]`).forEach(el => el.remove());

        // Remove cell overlays
        document.querySelectorAll(`[data-table-id="${tableId}"]`).forEach(el => el.remove());
    }

    /**
     * Remove a mapped table
     * @param {string} tableId - Table ID to remove
     */
    removeTable(tableId) {
        const tableIndex = this.mappedTables.findIndex(t => t.tableId === tableId);
        if (tableIndex === -1) return;

        // Remove table fields from main fields array
        this.fields = this.fields.filter(f => f.tableId !== tableId);

        // Remove from mapped tables
        this.mappedTables.splice(tableIndex, 1);

        // Remove overlays
        this.removeTableOverlay(tableId);

        // Update sidebar
        this.updateFieldList();

        // Save state
        this.saveState('remove_table');

        this.showToast('הטבלה נמחקה', 'success');
    }

    /**
     * Get table by ID
     * @param {string} tableId - Table ID
     * @returns {Object|null} Table object or null
     */
    getTableById(tableId) {
        return this.mappedTables.find(t => t.tableId === tableId) || null;
    }

    /**
     * Export all tables to JSON
     * @returns {Array} Array of table JSON objects
     */
    exportTablesToJSON() {
        return this.mappedTables.map(table => window.TableEngine.exportTableToJSON(table));
    }

    /**
     * Get Step 5 export JSON (includes tables)
     * @returns {Object} JSON with fields, groups, and tables
     */
    getStep5ExportJSON() {
        const step3JSON = this.getStep3ExportJSON();

        return {
            ...step3JSON,
            tables: this.exportTablesToJSON()
        };
    }

    /**
     * Step 6: Validate all tables before export
     * @returns {Object} Validation result { valid: boolean, invalidTables: [], allErrors: [] }
     */
    validateTablesForExport() {
        if (!window.TableValidator) {
            return { valid: true, invalidTables: [], allErrors: [] };
        }

        const invalidTables = [];
        const allErrors = [];

        this.mappedTables.forEach(table => {
            const isExportReady = window.TableValidator.validateExportReady(table);

            if (!isExportReady) {
                invalidTables.push(table.tableId);

                // Get detailed errors
                const report = window.TableValidator.validateTableStructure(table);
                report.errors.forEach(error => {
                    allErrors.push({
                        tableId: table.tableId,
                        ...error
                    });
                });
            }
        });

        return {
            valid: invalidTables.length === 0,
            invalidTables,
            allErrors
        };
    }

    /**
     * Step 6: Show export validation modal
     * @param {Array} errors - Array of validation errors
     */
    showExportValidationModal(errors) {
        // Remove existing modal if any
        const existingModal = document.querySelector('.export-validation-modal');
        if (existingModal) existingModal.remove();

        const errorListHtml = errors.map(e =>
            `<li>[${e.tableId}] ${e.message}${e.details ? ` - ${e.details}` : ''}</li>`
        ).join('');

        const modal = document.createElement('div');
        modal.className = 'export-validation-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-icon">⚠️</div>
                <h3>לא ניתן לייצא טבלאות</h3>
                <p>נמצאו שגיאות קריטיות בטבלאות. יש לתקן אותן לפני הייצוא.</p>
                <ul class="error-list">${errorListHtml}</ul>
                <div class="modal-actions">
                    <button class="btn-close" onclick="this.closest('.export-validation-modal').remove()">סגור</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    /**
     * Revalidate a specific table
     * @param {string} tableId - Table ID to revalidate
     */
    revalidateTable(tableId) {
        const table = this.mappedTables.find(t => t.tableId === tableId);
        if (!table || !window.TableValidator) return;

        const report = window.TableValidator.validateTableStructure(table);
        table.validationReport = report;
        table.invalidComponents = window.TableValidator.getInvalidComponents(table);

        // Update sidebar display
        if (window.MapperSidebarEngine && window.MapperSidebarEngine.showTableValidationReport) {
            window.MapperSidebarEngine.showTableValidationReport(report, tableId);
        }

        // Re-render table cells with updated validation
        this.removeTableOverlay(tableId);
        this.renderTableCells(table);

        if (report.valid) {
            this.showToast(`טבלה ${tableId} תקינה`, 'success');
        } else {
            this.showToast(`טבלה ${tableId}: ${report.summary.criticalCount} שגיאות`, 'warning');
        }
    }

    /**
     * Highlight a specific table
     * @param {string} tableId - Table ID to highlight
     */
    highlightTable(tableId) {
        // Remove highlight from other tables
        document.querySelectorAll('.table-cell-overlay.highlighted').forEach(el => {
            el.classList.remove('highlighted');
        });

        // Add highlight to this table's cells
        document.querySelectorAll(`[data-table-id="${tableId}"]`).forEach(el => {
            el.classList.add('highlighted');
        });

        // Scroll to table region
        const firstCell = document.querySelector(`[data-table-id="${tableId}"]`);
        if (firstCell) {
            firstCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * Export Step 5 JSON to file
     */
    exportStep5JSON() {
        // Step 6: Validate tables before export
        const validation = this.validateTablesForExport();

        if (!validation.valid) {
            this.showExportValidationModal(validation.allErrors);
            return;
        }

        const jsonOutput = this.getStep5ExportJSON();

        if (jsonOutput.fields.length === 0 && jsonOutput.groups.length === 0 && jsonOutput.tables.length === 0) {
            this.showToast('אין נתונים לייצוא', 'warning');
            return;
        }

        const blob = new Blob([JSON.stringify(jsonOutput, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `step5-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast(`ייצוא Step 5 הושלם - ${jsonOutput.fields.length} שדות, ${jsonOutput.groups.length} קבוצות, ${jsonOutput.tables.length} טבלאות`, 'success');
    }

    // ============ LIVE TABLE PREVIEW (Step 7) ============

    /**
     * Toggle live table preview mode
     * Uses StateMachine.PREVIEW state
     */
    toggleLiveTablePreviewMode() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        const isPreviewActive = sm && MS && sm.is(MS.PREVIEW);

        const btn = document.getElementById('btn-preview-mode');
        const container = document.getElementById('canvas-container');

        if (!isPreviewActive) {
            // Enter preview mode
            if (sm && MS) {
                sm.setState(MS.PREVIEW);
            }
            this.activateLiveTablePreviewMode();
            if (btn) btn.classList.add('active');
            if (container) container.classList.add('preview-mode');
        } else {
            // Exit preview mode
            if (sm && MS) {
                sm.reset(true);
            }
            this.deactivateLiveTablePreviewMode();
            if (btn) btn.classList.remove('active');
            if (container) container.classList.remove('preview-mode');
        }
    }

    /**
     * TASK 3: Toggle debug labels for table cells
     * Developer-only feature to show row,col indexes in each cell
     * @param {boolean} enabled - Whether to enable debug labels (optional, toggles if not provided)
     */
    toggleTableDebugLabels(enabled) {
        this.debugTableLabels = enabled !== undefined ? enabled : !this.debugTableLabels;

        console.log(`📐 Table debug labels: ${this.debugTableLabels ? 'enabled' : 'disabled'}`);

        // Re-render table cells with/without labels
        if (this.mappedTables && this.mappedTables.length > 0) {
            this.mappedTables
                .filter(table => (table.page || 1) === this.currentPage)
                .forEach(table => this.renderTableCells(table));
        }

        this.showToast(
            this.debugTableLabels ? 'תוויות דיבאג מופעלות' : 'תוויות דיבאג כבויות',
            'info'
        );
    }

    /**
     * Set table cell styling options
     * @param {Object} options - { fillOpacity, borderWidth, borderOpacity }
     */
    setTableCellStyle(options = {}) {
        this.tableCellStyle = {
            ...this.tableCellStyle,
            ...options
        };

        console.log('📐 Table cell style updated:', this.tableCellStyle);

        // Re-render table cells with new style
        if (this.mappedTables && this.mappedTables.length > 0) {
            this.mappedTables
                .filter(table => (table.page || 1) === this.currentPage)
                .forEach(table => this.renderTableCells(table));
        }
    }

    /**
     * Activate live table preview mode
     * StateMachine.PREVIEW state is set by toggleLiveTablePreviewMode
     */
    activateLiveTablePreviewMode() {
        // Note: StateMachine state is set by toggleLiveTablePreviewMode()
        // This function handles the UI and rendering

        // Show mode indicator
        this.showPreviewModeIndicator();

        // Render previews for all tables that have preview enabled
        this.mappedTables.forEach(table => {
            if (table._previewEnabled !== false) {
                // Default to enabled for all tables
                table._previewEnabled = true;
                this.renderTablePreview(table);
            }
        });

        this.setStatus('👁️ מצב תצוגת מילוי פעיל', 'info');
        console.log('✅ Live Table Preview Mode activated');
    }

    /**
     * Deactivate live table preview mode
     * StateMachine.reset() is called by toggleLiveTablePreviewMode
     */
    deactivateLiveTablePreviewMode() {
        // Note: StateMachine is reset by toggleLiveTablePreviewMode()
        // This function handles the UI and cleanup

        // Remove mode indicator
        this.hidePreviewModeIndicator();

        // Clear all previews
        if (window.PreviewEngine) {
            window.PreviewEngine.clearAllPreviews();
        }

        this.setStatus('מוכן', 'ready');
        console.log('✅ Live Table Preview Mode deactivated');
    }

    /**
     * Show preview mode indicator
     */
    showPreviewModeIndicator() {
        // Remove existing indicator
        this.hidePreviewModeIndicator();

        const indicator = document.createElement('div');
        indicator.id = 'preview-mode-indicator';
        indicator.className = 'preview-mode-indicator';
        indicator.innerHTML = `
            <span class="indicator-icon">👁️</span>
            <div class="indicator-text">
                <span class="indicator-title">מצב תצוגת מילוי</span>
                <span class="indicator-hint">טקסט דוגמה מוצג בתאי הטבלה</span>
            </div>
            <button class="btn-close-indicator" onclick="mapper.toggleLiveTablePreviewMode()">✕ סגור</button>
        `;

        document.body.appendChild(indicator);
    }

    /**
     * Hide preview mode indicator
     */
    hidePreviewModeIndicator() {
        const indicator = document.getElementById('preview-mode-indicator');
        if (indicator) indicator.remove();
    }

    /**
     * Render preview for a specific table
     * Uses StateMachine.is(PREVIEW) for state check
     * @param {Object} table - Table object
     */
    renderTablePreview(table) {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        const isPreviewActive = sm && MS && sm.is(MS.PREVIEW);
        if (!window.PreviewEngine || !isPreviewActive) return;

        window.PreviewEngine.renderTablePreview(table, this.previewSettings);
    }

    /**
     * Toggle preview for a specific table
     * @param {string} tableId - Table ID
     */
    toggleTablePreview(tableId) {
        const table = this.mappedTables.find(t => t.tableId === tableId);
        if (!table || !window.PreviewEngine) return;

        const newState = window.PreviewEngine.toggleTablePreview(table, this.previewSettings);

        // Update sidebar if needed
        this.updateFieldList();

        if (newState) {
            this.showToast(`תצוגה מקדימה פעילה: ${tableId}`, 'success');
        } else {
            this.showToast(`תצוגה מקדימה כבויה: ${tableId}`, 'info');
        }

        return newState;
    }

    /**
     * Update preview settings
     * @param {Object} newSettings - New settings to apply
     */
    updatePreviewSettings(newSettings) {
        // Validate and merge settings
        if (window.PreviewEngine) {
            this.previewSettings = window.PreviewEngine.validateSettings({
                ...this.previewSettings,
                ...newSettings
            });
        } else {
            this.previewSettings = { ...this.previewSettings, ...newSettings };
        }

        // Refresh all previews with new settings
        this.refreshAllTablePreviews();
    }

    /**
     * Update a single preview setting
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     */
    updatePreviewSetting(key, value) {
        this.updatePreviewSettings({ [key]: value });
    }

    /**
     * Refresh all table previews
     * Uses StateMachine.is(PREVIEW) for state check
     */
    refreshAllTablePreviews() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        const isPreviewActive = sm && MS && sm.is(MS.PREVIEW);
        if (!window.PreviewEngine || !isPreviewActive) return;

        window.PreviewEngine.refreshAllPreviews(this.mappedTables, this.previewSettings);
    }

    /**
     * Handle zoom change - refresh previews to maintain correct positioning
     * Uses StateMachine.is(PREVIEW) for state check
     */
    onZoomChange() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        const isPreviewActive = sm && MS && sm.is(MS.PREVIEW);
        if (isPreviewActive) {
            // Delay refresh to allow zoom transform to complete
            setTimeout(() => {
                this.refreshAllTablePreviews();
            }, 50);
        }
    }

    /**
     * Get preview settings for display
     * @returns {Object} Current preview settings
     */
    getPreviewSettings() {
        return { ...this.previewSettings };
    }

    /**
     * Check if preview mode is active
     * Uses StateMachine.is(PREVIEW) as source of truth
     * @returns {boolean} Preview mode state
     */
    isPreviewModeActive() {
        const sm = this.stateMachine;
        const MS = MapperStateEnum;

        return sm && MS && sm.is(MS.PREVIEW);
    }

    /**
     * Check if a specific table has preview enabled
     * @param {string} tableId - Table ID
     * @returns {boolean} Preview enabled state
     */
    isTablePreviewEnabled(tableId) {
        const table = this.mappedTables.find(t => t.tableId === tableId);
        return table?._previewEnabled === true;
    }

    selectField(fieldId, opts = { scroll: false }) {
        return this.Selection.selectField(fieldId, opts, this);
    }

    deselectAll() {
        return this.Selection.deselectAll(this);
    }

    selectAll() {
        this.fields.forEach(field => {
            if (field.element) {
                field.element.classList.add('selected');
            }
        });
        this.showToast(`נבחרו ${this.fields.length} שדות`, 'info');
    }

    showFieldContextMenu(field, x, y) {
        // Remove any existing context menu
        const existingMenu = document.getElementById('field-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'field-context-menu';
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.zIndex = '10000';

        menu.innerHTML = `
            <div class="context-menu-item" data-action="edit">
                <span>✏️</span> ערוך שדה
            </div>
            <div class="context-menu-item" data-action="duplicate">
                <span>📋</span> שכפל
            </div>
            <div class="context-menu-item" data-action="delete">
                <span>🗑️</span> מחק
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" data-action="cancel">
                <span>✖️</span> ביטול
            </div>
        `;

        document.body.appendChild(menu);

        // Add click handlers for menu items
        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                menu.remove();

                switch(action) {
                    case 'edit':
                        this.selectFieldForMapping(field.id);
                        break;
                    case 'duplicate':
                        this.duplicateField(field.id);
                        break;
                    case 'delete':
                        this.removeField(field.id);
                        break;
                    case 'cancel':
                        // Just close the menu
                        break;
                }
            });
        });

        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        // Delay to prevent immediate closure from the same click
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    // ⚡ Debounced wrapper for field property updates
    updateFieldProperty(fieldId, property, value) {
        console.log("⚡ Debounced: updateFieldProperty");
        this.debouncedUpdateFieldProperty(fieldId, property, value);
    }

    // Internal immediate version
    _updateFieldPropertyImmediate(fieldId, property, value) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field) return;

        // Validation for ID changes
        if (property === 'id') {
            if (!value.trim()) {
                this.showToast('מזהה לא יכול להיות ריק', 'error');
                this.updateFieldList();
                return;
            }

            if (this.fields.some(f => f.id === value && f.id !== fieldId)) {
                this.showToast('מזהה כפול - בחר מזהה אחר', 'error');
                this.updateFieldList();
                return;
            }
        }

        field[property] = value;

        // Handle type changes - no dummy data in Mapper mode
        if (property === 'type') {
            // Set direction based on field type default, not dummy data
            field.direction = this.Core.getDefaultDirectionForType(value);

            // Mark as user-overridden so Smart Classifier doesn't change it back
            field.typeOverriddenByUser = true;
            console.log('🔧 User override: field type set to', value, 'for field', fieldId);
        }
        
        // Update element if exists
        if (field.element) {
            const textElement = field.element.querySelector('.field-text');
            if (textElement) {
                this.applyTextLayout(field, textElement);
                // עדכון דינמי של הטקסט אחרי שינויים
                setTimeout(() => this.refreshFieldText(), 50);
            }
            
            const infoElement = field.element.querySelector('.field-info');
            if (infoElement) {
                infoElement.textContent = `${field.id} | ${field.type} | ${field.direction.toUpperCase()}`;
            }
        }
        
        // Re-render if necessary
        if (property === 'type' || property === 'direction') {
            this.renderField(field).catch(console.error);
        }
        
        this.updateFieldList();
        this.saveState('update_field');
        
        if (this.selectedField?.id === fieldId) {
            this.selectedField = field;
        }
        
        // Update isComplete status
        this.updateFieldCompleteStatus(field);
    }

    updateFieldCompleteStatus(field) {
        // Field is complete if it has ID, type, and is mapped (with either bbox/percentages OR anchor)
        field.isComplete = !!(
            field.id &&
            field.id.trim() &&
            field.type &&
            field.isMapped &&
            (
                // Regular fields with bbox or legacy percentages
                (field.xPct !== null && field.yPct !== null) ||
                // Checkbox/radio with anchor
                (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) ||
                // Direct bbox check
                (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4)
            )
        );
    }

    async updateFieldId(oldId, newId) {
        const field = this.fields.find(f => f.id === oldId);
        if (!field) return;
        
        if (!newId.trim()) {
            this.showToast('מזהה לא יכול להיות ריק', 'error');
            this.updateFieldList();
            return;
        }
        
        if (this.fields.some(f => f.id === newId && f.id !== oldId)) {
            this.showToast('מזהה כפול - בחר מזהה אחר', 'error');
            this.updateFieldList();
            return;
        }
        
        field.id = newId;
        
        if (field.element) {
            field.element.dataset.fieldId = newId;
        }
        
        if (this.selectedField?.id === oldId) {
            this.selectedField = field;
        }
        
        if (this.expandedFieldId === oldId) {
            this.expandedFieldId = newId;
        }
        
        await this.renderField(field);
        this.updateFieldList();
        this.saveState('update_field_id');

        this.showToast('המזהה עודכן', 'success');
    }

    // ============ FIX PACKAGE 1: Field Name Editing ============

    /**
     * Update field Hebrew name and auto-regenerate English ID
     * @param {string} fieldId - Field ID
     * @param {string} newHebrewName - New Hebrew name
     */
    updateFieldHebrewName(fieldId, newHebrewName) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field) {
            console.warn('updateFieldHebrewName: Field not found:', fieldId);
            return;
        }

        // Mark that user manually edited the name (for Auto-Label feature)
        field._userEditedName = true;

        // Update all Hebrew name properties
        field.labelHe = newHebrewName;
        field.hebrewName = newHebrewName;
        field.label_he = newHebrewName;

        // Auto-regenerate English ID unless manually edited
        if (!field._englishManuallyEdited) {
            const newEnglishId = this.toEnglishFieldId(newHebrewName);
            field.labelEn = newEnglishId;
            field.englishId = newEnglishId;
            field.label_en = newEnglishId;
        }

        // Mark field as linked/complete if it has a name now
        if (newHebrewName && newHebrewName.trim()) {
            field.linked = true;
            field.isUnnamed = false;
            field.isMapped = true;
        }

        console.log('📝 Field Hebrew name updated:', {
            id: fieldId,
            labelHe: newHebrewName,
            labelEn: field.labelEn,
            autoGenerated: !field._englishManuallyEdited
        });

        this.updateFieldList();
        this.saveState('update_field_hebrew');
        this.showToast(`שם השדה עודכן: ${newHebrewName}`, 'success');
    }

    /**
     * Update field English ID (manual override)
     * @param {string} fieldId - Field ID
     * @param {string} newEnglishId - New English ID
     */
    updateFieldEnglishId(fieldId, newEnglishId) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field) {
            console.warn('updateFieldEnglishId: Field not found:', fieldId);
            return;
        }

        // Update English ID
        field.labelEn = newEnglishId;
        field.englishId = newEnglishId;
        field.label_en = newEnglishId;

        // Mark as manually edited so auto-regenerate won't override
        field._englishManuallyEdited = true;

        console.log('📝 Field English ID updated (manual):', {
            id: fieldId,
            labelEn: newEnglishId
        });

        this.updateFieldList();
        this.saveState('update_field_english');
        this.showToast(`מזהה אנגלי עודכן: ${newEnglishId}`, 'success');
    }

    toggleFieldExpansion(fieldId) {
        return this.Selection.toggleFieldExpansion(fieldId, this);
    }

    selectFieldForMapping(fieldId) {
        return this.Selection.selectFieldForMapping(fieldId, this);
    }

    // ============ RENDER LOOP PROTECTION ============
    // Centralized guard system to prevent resize→render→resize infinite loops

    /**
     * Check if we're currently in a render-protected zone
     * This includes both active rendering AND the dead-zone after rendering
     * @returns {boolean} true if resize events should be blocked
     */
    _isInRenderProtectedZone() {
        // Check active rendering flag
        if (this._isRenderingOverlays) {
            return true;
        }
        // Check dead-zone timeout
        if (Date.now() < this._renderGuardDeadZoneEnd) {
            return true;
        }
        return false;
    }

    /**
     * Log when a resize event is skipped due to loop protection
     * @param {string} source - Where the skip occurred
     */
    _logLoopProtectionSkip(source) {
        this._loopProtectionSkipCount++;
        console.log(`[LOOP-PROTECTION] resize skipped (${source}) - count: ${this._loopProtectionSkipCount}, rendering: ${this._isRenderingOverlays}, deadZoneRemaining: ${Math.max(0, this._renderGuardDeadZoneEnd - Date.now())}ms`);
    }

    /**
     * CENTRALIZED GUARD: Run a function with overlay rendering protection
     * - Activates guard flags before execution
     * - Handles both sync and async functions
     * - Sets dead-zone timeout after completion
     * - Prevents flag overlap with nested calls
     *
     * @param {Function} fn - The function to execute (can be async)
     * @param {string} [source='unknown'] - Source identifier for logging
     * @returns {Promise<any>} Result of the function
     */
    async runWithOverlayGuard(fn, source = 'unknown') {
        // Track nesting level to handle nested guard calls
        const wasAlreadyRendering = this._isRenderingOverlays;

        // Skip if already in protected zone (prevents recursive execution)
        if (wasAlreadyRendering) {
            console.log(`[runWithOverlayGuard] NESTED call from ${source} - executing without re-acquiring guard`);
            // Still execute the function, but don't manage flags
            return await fn();
        }

        // Acquire the guard
        this._isRenderingOverlays = true;
        console.log(`[runWithOverlayGuard] ACQUIRED guard for ${source}`);

        try {
            // Execute the protected function
            return await fn();
        } finally {
            // Release the guard and set dead-zone
            this._isRenderingOverlays = false;
            this._renderGuardDeadZoneEnd = Date.now() + this._RENDER_DEAD_ZONE_MS;
            console.log(`[runWithOverlayGuard] RELEASED guard for ${source}, dead-zone until ${this._renderGuardDeadZoneEnd}`);
        }
    }

    /**
     * STRESS TEST: Verify loop protection under extreme conditions
     * Call from console: mapper.stressTestLoopProtection()
     */
    async stressTestLoopProtection() {
        console.log('='.repeat(60));
        console.log('🔬 STRESS TEST: Loop Protection System');
        console.log('='.repeat(60));

        const results = {
            passed: 0,
            failed: 0,
            details: []
        };

        // Reset counters
        this._loopProtectionSkipCount = 0;
        const startSkipCount = this._loopProtectionSkipCount;

        // Test 1: Rapid consecutive renders
        console.log('\n📋 Test 1: Rapid consecutive renders (10x)');
        const test1Start = Date.now();
        const test1Promises = [];
        for (let i = 0; i < 10; i++) {
            test1Promises.push(this.renderOverlayFromJson());
        }
        await Promise.all(test1Promises);
        const test1Duration = Date.now() - test1Start;
        const test1Skips = this._loopProtectionSkipCount - startSkipCount;
        console.log(`   Duration: ${test1Duration}ms, Skipped: ${test1Skips}`);
        if (test1Skips >= 9) {
            results.passed++;
            results.details.push('✅ Test 1 PASSED: Nested renders correctly skipped');
        } else {
            results.failed++;
            results.details.push(`❌ Test 1 FAILED: Expected 9+ skips, got ${test1Skips}`);
        }

        // Test 2: Simulated resize spam during render
        console.log('\n📋 Test 2: Resize spam during active render');
        const skipsBefore = this._loopProtectionSkipCount;
        this._isRenderingOverlays = true;
        for (let i = 0; i < 5; i++) {
            // Simulate resize observer callback
            if (this._isInRenderProtectedZone()) {
                this._logLoopProtectionSkip('stressTest-resizeSpam');
            }
        }
        this._isRenderingOverlays = false;
        this._renderGuardDeadZoneEnd = Date.now() + this._RENDER_DEAD_ZONE_MS;
        const test2Skips = this._loopProtectionSkipCount - skipsBefore;
        if (test2Skips === 5) {
            results.passed++;
            results.details.push('✅ Test 2 PASSED: All resize events blocked during render');
        } else {
            results.failed++;
            results.details.push(`❌ Test 2 FAILED: Expected 5 skips, got ${test2Skips}`);
        }

        // Test 3: Dead-zone effectiveness
        console.log('\n📋 Test 3: Dead-zone blocks post-render events');
        const skipsBefore3 = this._loopProtectionSkipCount;
        this._renderGuardDeadZoneEnd = Date.now() + 100; // Set 100ms dead-zone
        for (let i = 0; i < 3; i++) {
            if (this._isInRenderProtectedZone()) {
                this._logLoopProtectionSkip('stressTest-deadZone');
            }
            await new Promise(r => setTimeout(r, 10));
        }
        const test3Skips = this._loopProtectionSkipCount - skipsBefore3;
        if (test3Skips >= 2) {
            results.passed++;
            results.details.push('✅ Test 3 PASSED: Dead-zone blocks immediate post-render events');
        } else {
            results.failed++;
            results.details.push(`❌ Test 3 FAILED: Expected 2+ skips, got ${test3Skips}`);
        }

        // Test 4: Guard flag never gets stuck
        console.log('\n📋 Test 4: Guard flags reset correctly');
        await this.renderOverlayFromJson();
        await new Promise(r => setTimeout(r, this._RENDER_DEAD_ZONE_MS + 10));
        const flagsClean = !this._isRenderingOverlays && !this._isInResizeHandler;
        if (flagsClean) {
            results.passed++;
            results.details.push('✅ Test 4 PASSED: Guard flags properly reset');
        } else {
            results.failed++;
            results.details.push(`❌ Test 4 FAILED: Flags stuck - rendering: ${this._isRenderingOverlays}, inResize: ${this._isInResizeHandler}`);
        }

        // Test 5: resizeHandler protection
        console.log('\n📋 Test 5: resizeHandler respects protection');
        const skipsBefore5 = this._loopProtectionSkipCount;
        this._isRenderingOverlays = true;
        await this.resizeHandler(); // Should be blocked
        await this.resizeHandler(); // Should be blocked
        this._isRenderingOverlays = false;
        this._renderGuardDeadZoneEnd = 0;
        const test5Skips = this._loopProtectionSkipCount - skipsBefore5;
        if (test5Skips === 2) {
            results.passed++;
            results.details.push('✅ Test 5 PASSED: resizeHandler blocked during render');
        } else {
            results.failed++;
            results.details.push(`❌ Test 5 FAILED: Expected 2 skips, got ${test5Skips}`);
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 STRESS TEST RESULTS');
        console.log('='.repeat(60));
        results.details.forEach(d => console.log(d));
        console.log(`\n🏆 TOTAL: ${results.passed} passed, ${results.failed} failed`);
        console.log(`📈 Total protection skips: ${this._loopProtectionSkipCount}`);

        if (results.failed === 0) {
            console.log('\n✅ ALL TESTS PASSED - Loop protection is robust!');
        } else {
            console.log('\n⚠️ SOME TESTS FAILED - Review the protection system');
        }

        return results;
    }

    /**
     * Get current loop protection status
     * Call from console: mapper.getLoopProtectionStatus()
     */
    getLoopProtectionStatus() {
        const now = Date.now();
        const deadZoneRemaining = Math.max(0, this._renderGuardDeadZoneEnd - now);
        return {
            isRenderingOverlays: this._isRenderingOverlays,
            isInResizeHandler: this._isInResizeHandler,
            isInProtectedZone: this._isInRenderProtectedZone(),
            deadZoneRemainingMs: deadZoneRemaining,
            totalSkipCount: this._loopProtectionSkipCount,
            deadZoneConfigMs: this._RENDER_DEAD_ZONE_MS
        };
    }

    // ============ FIELD RENDERING ============
    // Delegated to OverlayEngine module

    async renderField(field) {
        return this.runWithOverlayGuard(
            () => this.OverlayEngine.renderField(field, this),
            'renderField'
        );
    }

    applyTextLayout(field, textElement) {
        return this.Editor.applyTextLayout(field, textElement, this);
    }
    
    setupCanvasWheelHandler() {
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer && !canvasContainer.hasAttribute('data-wheel-handler')) {
            canvasContainer.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
            canvasContainer.setAttribute('data-wheel-handler', 'true');
        }
    }

    // ============ VIEWPORT DIMENSION HELPERS ============
    // Delegated to Viewport module

    getLogicalWidth(container) {
        return this.Viewport.getLogicalWidth(container, this.baseDimensions);
    }

    getLogicalHeight(container) {
        return this.Viewport.getLogicalHeight(container, this.baseDimensions);
    }

    // שמירת ממדים בסיסיים לחישובי אחוזים נכונים
    saveBaseDimensions() {
        this.PdfEngine.saveBaseDimensions(this);
    }

    handleWindowResize() {
        return this.Viewport.handleWindowResize(this);
    }

    handleFullscreenChange() {
        return this.Viewport.handleFullscreenChange(this);
    }
    
    // רענון טקסט בכל השדות - no dummy data in Mapper mode
    refreshFieldText() {
        this.fields.forEach(field => {
            if (field.element && field.isMapped) {
                const textElement = field.element.querySelector('.field-text');
                if (textElement) {
                    // חישוב מחדש של רוחב מקסימלי
                    const fieldWidth = Math.round((field.wPct * this.getLogicalWidth(document.getElementById('mapping-layer'))) / 100);
                    textElement.style.maxWidth = Math.max(25, fieldWidth - 10) + 'px';
                    textElement.style.fontSize = (field.fontSize || 12) + 'px';
                    textElement.style.wordWrap = 'break-word';
                    textElement.style.overflow = 'hidden';
                    textElement.style.textOverflow = 'ellipsis';
                    textElement.style.whiteSpace = 'nowrap'; // מניעת שבירת שורות אם לא רוצים
                    // Keep text content empty in Mapper mode
                    textElement.textContent = '';
                }
            }
        });
    }
    
    // =============== RESIZE & SCALING SYSTEM ===============

    getLogicalDimensions() {
        return this.Viewport.getLogicalDimensions(this);
    }
    
    // חישוב מיקום פיקסלים מאחוזים
    calculatePixelPosition(field) {
        const dimensions = this.getLogicalDimensions();
        
        return {
            x: Math.round((field.xPct / 100) * dimensions.width),
            y: Math.round((field.yPct / 100) * dimensions.height),
            width: Math.round((field.wPct / 100) * dimensions.width),
            height: Math.round((field.hPct / 100) * dimensions.height)
        };
    }
    
    // רינדור מחדש של כל השדות
    async renderFields() {
        return this.runWithOverlayGuard(async () => {
            const result = await this.OverlayEngine.renderFields(this);
            // Visual Test hook - notify runner of fields render
            window.VisualTestRunner?.onRenderFields();
            return result;
        }, 'renderFields');
    }

    // מאזין מרכזי לשינוי גודל - IMAGE VIEW ONLY
    async resizeHandler() {
        // CRITICAL FIX: Block resize during mapping flow to prevent overlay deletion
        const sm = this.stateMachine;
        const MS = MapperStateEnum;
        const isInFlow = sm && MS && sm.isInFlow();
        if (isInFlow) {
            this._logLoopProtectionSkip('resizeHandler-mappingFlowActive');
            return;
        }

        // CRITICAL FIX: Use centralized protection check (includes dead-zone)
        if (this._isInRenderProtectedZone()) {
            this._logLoopProtectionSkip('resizeHandler-protectedZone');
            return;
        }

        // CRITICAL FIX: Prevent recursive resize calls
        if (this._isInResizeHandler) {
            this._logLoopProtectionSkip('resizeHandler-recursive');
            return;
        }

        this._isInResizeHandler = true;
        // console.log('[resizeHandler] EXECUTING - will trigger renderOverlayFromJson'); // DISABLED for performance

        try {
            // Only re-render overlays for image view (PNG/Canvas)
            // PDF.js preview is handled separately and doesn't need resize fixes
            await this.renderOverlayFromJson();

            // Re-render all mapped tables with new dimensions
            this.reRenderAllTables();

            // Refresh table wizard overlays if active
            if (this.tableController && this.tableController.isActive()) {
                this.tableController.refreshOverlays();
            }
        } finally {
            this._isInResizeHandler = false;
        }
    }

    /**
     * Re-render all mapped tables (used after resize)
     */
    reRenderAllTables() {
        if (!this.mappedTables || this.mappedTables.length === 0) return;

        // ========== CENTRALIZED CLEANUP BEFORE RE-RENDER ==========
        // Use fullTableOverlayReset to ensure zero ghost overlays
        this.fullTableOverlayReset('reRenderAllTables');

        // Re-render all tables for current page
        this.mappedTables
            .filter(table => table.isComplete && (table.page || 1) === this.currentPage)
            .forEach(table => {
                this.renderTableCells(table);
            });

        console.log('📐 Tables re-rendered after resize:', this.mappedTables.length);
    }

    // Re-render image view overlays from JSON using dynamic pt→px conversion
    async renderOverlayFromJson() {
        return this.runWithOverlayGuard(
            () => this.OverlayEngine.renderOverlayFromJson(this),
            'renderOverlayFromJson'
        );
    }
    
    // ============ ZOOM FUNCTIONS ============
    // Delegated to Viewport module

    setInternalZoom(newZoomLevel) {
        return this.Viewport.setInternalZoom(newZoomLevel, this);
    }

    // ============ APP MODE MANAGEMENT ============

    setAppMode(mode) {
        if (this.appMode === mode) return; // Already in this mode
        
        // Save current viewport state
        this.saveViewportState();
        
        const previousMode = this.appMode;
        this.appMode = mode;
        
        // Update UI
        this.updateModeUI();
        
        // Handle mode-specific logic
        if (mode === 'mapper') {
            this.enterMapperMode(previousMode);
        } else if (mode === 'livefill') {
            this.enterLiveFillMode(previousMode);
        }
        
        // Restore viewport state
        this.restoreViewportState();
        
        this.showToast(`מעבר ל${mode === 'mapper' ? 'מצב מיפוי' : 'מילוי חי'}`, 'info');
    }

    updateModeUI() {
        // Update mode toggle buttons
        document.querySelectorAll('.mode-toggle button').forEach(btn => btn.classList.remove('active'));
        const activeButton = document.getElementById(`mode-${this.appMode}`);
        if (activeButton) activeButton.classList.add('active');
        
        // Update sidebar title
        const sidebarTitle = document.getElementById('sidebar-title');
        if (sidebarTitle) {
            sidebarTitle.textContent = this.appMode === 'mapper' ? '📐 מצב מיפוי' : '✍️ מילוי חי';
        }
        
        // Show/hide mode-specific UI elements
        this.updateModeSpecificUI();
    }

    updateModeSpecificUI() {
        // NEW ARCHITECTURE: Strict mode separation
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.setAttribute('data-mode', this.appMode);
        }
        
        const mappingView = document.querySelector('.mapping-view');
        const previewView = document.querySelector('.preview-view');
        
        // Sidebar actions
        const mapperActions = document.getElementById('mapper-actions');
        const livefillActions = document.getElementById('livefill-actions');
        
        // Mode panels
        const mapperPanel = document.getElementById('mapper-panel');
        const livefillPanel = document.getElementById('livefill-panel');
        
        // Export buttons
        const exportMapperBtn = document.getElementById('export-mapper-json');
        const exportLiveFillBtn = document.getElementById('export-livefill-json');
        const exportFilledPdfBtn = document.getElementById('export-filled-pdf');
        
        if (this.appMode === 'mapper') {
            // NEW ARCHITECTURE: Mapping mode - ONLY image view
            if (mappingView) {
                mappingView.style.display = 'block';
                mappingView.classList.add('active');
            }
            if (previewView) {
                previewView.style.display = 'none';
                previewView.classList.remove('active');
            }
            
            // Show mapper UI
            if (mapperActions) mapperActions.style.display = 'flex';
            if (livefillActions) livefillActions.style.display = 'none';
            if (mapperPanel) mapperPanel.style.display = 'block';
            if (livefillPanel) livefillPanel.style.display = 'none';
            if (exportMapperBtn) exportMapperBtn.style.display = 'block';
            if (exportLiveFillBtn) exportLiveFillBtn.style.display = 'none';
            if (exportFilledPdfBtn) exportFilledPdfBtn.style.display = 'none';
        } else {
            // NEW ARCHITECTURE: Live fill mode - ONLY PDF.js view
            if (mappingView) {
                mappingView.style.display = 'none';
                mappingView.classList.remove('active');
            }
            if (previewView) {
                previewView.style.display = 'block';
                previewView.classList.add('active');
            }
            
            // Show live fill UI
            if (mapperActions) mapperActions.style.display = 'none';
            if (livefillActions) livefillActions.style.display = 'flex';
            if (mapperPanel) mapperPanel.style.display = 'none';
            if (livefillPanel) livefillPanel.style.display = 'block';
            if (exportMapperBtn) exportMapperBtn.style.display = 'none';
            if (exportLiveFillBtn) exportLiveFillBtn.style.display = 'block';
            if (exportFilledPdfBtn) exportFilledPdfBtn.style.display = 'block';
            // PDF export removed
        }
    }

    saveViewportState() {
        return this.State.saveViewportState(this);
    }

    restoreViewportState() {
        return this.State.restoreViewportState(this);
    }

    enterMapperMode(previousMode) {
        // Clear any live fill overlays
        this.clearLiveFillOverlays();
        
        // Generate high-resolution PNG for mapping (300 DPI) - NEW ARCHITECTURE
        if (this.pdfDocument && previousMode === 'livefill') {
            this.generateMappingImage();
        }
        
        // Ensure mapping layer is interactive
        const mappingLayer = document.getElementById('mapping-layer');
        if (mappingLayer) {
            mappingLayer.style.pointerEvents = 'auto';
        }
        
        // Reset live text state
        this.liveTextEnabled = false;
        this.selectedTextPreview = null;
        
        // Make sure field overlays are visible for mapper mode
        this.fields.forEach(field => {
            if (field.isMapped && field.page === this.currentPage && field.element) {
                field.element.style.display = 'block';
            }
        });
        
        // Update field list for mapper
        this.updateFieldList();
    }

    // Generate high-resolution PNG from PDF for mapping - NEW ARCHITECTURE REQUIREMENT
    async generateMappingImage() {
        if (!this.pdfDocument) return;
        
        try {
            this.setStatus('יוצר תמונה ברזולוציה גבוהה למיפוי...', 'info');
            
            const page = await this.pdfDocument.getPage(this.currentPage);
            
            // Generate 300 DPI image (scale 2.5 ≈ 300 DPI)
            const scale = 2.5;
            const viewport = page.getViewport({ scale });

            // ✅ Set PDF dimensions once viewport is ready (full viewport object with transform matrix)
            this.pdfPageDimensions = page.getViewport({ scale: 1.0 });

            // Optional safety log
            console.log("📐 PDF dimensions ready:", this.pdfPageDimensions);

            // Re-render all fields that were skipped earlier
            if (typeof this.renderFields === "function") {
                await this.renderFields();
            }

            // Store mapping information for coordinate conversion
            this.mappingScale = scale;
            
            // Create temporary canvas for high-res rendering
            const tempCanvas = document.createElement('canvas');
            const tempContext = tempCanvas.getContext('2d');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            
            const renderContext = {
                canvasContext: tempContext,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // Replace current PDF view with high-res image for mapping
            const mainCanvas = document.querySelector('#pdf-container canvas');
            if (mainCanvas) {
                const context = mainCanvas.getContext('2d');
                
                // Resize main canvas to match high-res image
                mainCanvas.width = viewport.width;
                mainCanvas.height = viewport.height;
                
                // Draw the high-res image
                context.drawImage(tempCanvas, 0, 0);
                
                // Store reference for field mapping
                this.mappingCanvas = mainCanvas;
                this.mappingImageData = tempCanvas;
            }
            
            this.setStatus('תמונת מיפוי ברזולוציה גבוהה מוכנה (300 DPI)', 'success');
            this.showToast('🔹 מצב מיפוי: עובד עם תמונה ברזולוציה גבוהה לדיוק מקסימלי', 'info');
            
        } catch (error) {
            console.error('Error generating mapping image:', error);
            this.setStatus('שגיאה ביצירת תמונת מיפוי: ' + error.message, 'error');
        }
    }

    // Render original PDF for live fill mode - NEW ARCHITECTURE REQUIREMENT
    async renderPDFForLiveFill() {
        return this.PdfEngine.renderPDFForLiveFill(this);
    }

    enterLiveFillMode(previousMode) {
        // Switch to PDF.js rendering for live fill - NEW ARCHITECTURE
        if (this.pdfDocument && previousMode === 'mapper') {
            this.renderPDFForLiveFill();
        }
        
        // Disable mapping layer interactions
        const mappingLayer = document.getElementById('mapping-layer');
        if (mappingLayer) {
            mappingLayer.style.pointerEvents = 'none';
        }
        
        // Hide field overlays to prevent visual duplication
        this.fields.forEach(field => {
            if (field.element) {
                field.element.style.display = 'none';
            }
        });
        
        // Enable live text system
        this.liveTextEnabled = true;
        
        // Clear dummy data that may have leaked from mapper
        this.clearMapperPreviewData();
        
        // Initialize text previews after PDF is rendered
        setTimeout(() => {
            this.buildLiveFillOverlay();
            this.updateLiveTextPanel();
            this.updateAllTextPreviews();
        }, 500); // Wait for PDF rendering to complete
    }

    clearLiveFillOverlays() {
        return this.OverlayEngine.clearLiveFillOverlays(this);
    }

    clearMapperPreviewData() {
        // Remove any dummy preview text that might be visible from mapper mode
        document.querySelectorAll('.field-preview-text').forEach(el => el.remove());
        
        // Clear any dummy data from field objects to prevent duplication
        this.fields.forEach(field => {
            if (field.element && field.element.querySelector('.field-preview-content')) {
                field.element.querySelector('.field-preview-content').textContent = '';
            }
        });
    }

    buildLiveFillOverlay() {
        return this.OverlayEngine.buildLiveFillOverlay(this);
    }

    // ============ TAB MANAGEMENT (for Mapper mode) ============

    switchTab(tabName) {
        this.activeTab = tabName;

        // Delegate tab button UI update to UI module
        this.UI.switchTab(tabName);

        // Show/hide appropriate panels
        const fieldList = document.getElementById('field-list');
        const liveTextPanel = document.getElementById('live-text-panel');

        if (tabName === 'livetext') {
            if (fieldList) fieldList.style.display = 'none';
            if (liveTextPanel) liveTextPanel.style.display = 'block';
            this.liveTextEnabled = true;
            this.updateLiveTextPanel();
            this.updateAllTextPreviews();
        } else {
            if (fieldList) fieldList.style.display = 'block';
            if (liveTextPanel) liveTextPanel.style.display = 'none';
            this.liveTextEnabled = false;
        }

        this.updateFieldList();
    }

    // ============ SIDEBAR UI ============

    updateFieldList() {
        const list = document.getElementById('field-list');
        const totalCount = document.getElementById('field-count');
        const editingCount = document.getElementById('editing-count');
        const mappedCount = document.getElementById('mapped-count');
        const tablesCount = document.getElementById('tables-count');
        const groupsCount = document.getElementById('groups-count');

        // FIX: Preserve scroll position to prevent sidebar jumps
        const scrollTop = list ? list.scrollTop : 0;

        if (totalCount) totalCount.textContent = this.fields.length;

        // Filter fields by category
        // FIX: Use isMapped instead of isComplete for consistency
        const editingFields = this.fields.filter(f => !f.isMapped && !f.tableGroupId && !f.isTableField);
        const mappedFields = this.fields.filter(f => f.isMapped && !f.isTableField);
        const tableFields = this.fields.filter(f => f.tableGroupId || f.isTableField);

        if (editingCount) editingCount.textContent = editingFields.length;
        if (mappedCount) mappedCount.textContent = mappedFields.length;
        if (tablesCount) tablesCount.textContent = this.mappedTables.length;

        // FIX: Count both option groups AND radio groups for sidebar
        const optionGroupCount = this.optionGroups ? this.optionGroups.length : 0;
        const radioGroupCount = this.radioGroups ? this.radioGroups.length : 0;
        if (groupsCount) groupsCount.textContent = optionGroupCount + radioGroupCount;

        if (!list) return;

        let currentFields = [];
        let html = '';

        // ============ MODE-AWARE SIDEBAR RENDERING ============
        // For 'editing' tab, use mode-specific rendering (with defensive checks)
        if (this.activeTab === 'editing' && this.mappingMode && window.MapperSidebarEngine) {
            if (this.mappingMode === 'regular' && typeof window.MapperSidebarEngine.renderRegularModeSidebar === 'function') {
                // Regular Mode: Show unmapped JSON fields for selection
                const selectedForMapping = window.RegularMapperEngine?.getSelectedFieldId?.() || null;
                html = window.MapperSidebarEngine.renderRegularModeSidebar(
                    this.fields,
                    this.expandedFieldId,
                    this.selectedField?.id,
                    selectedForMapping
                );
                list.innerHTML = html;
                list.scrollTop = scrollTop; // Restore scroll position
                return;
            } else if (this.mappingMode === 'quick' && typeof window.MapperSidebarEngine.renderQuickModeSidebar === 'function') {
                // Quick Mode: Show created fields with pending review
                const radioGroups = window.QuickMapperEngine?.getFlowState?.()?.radioFlow?.options?.length > 0
                    ? [window.QuickMapperEngine.getFlowState().radioFlow]
                    : [];
                const checkboxGroups = window.QuickMapperEngine?.getFlowState?.()?.checkboxFlow?.options?.length > 0
                    ? [window.QuickMapperEngine.getFlowState().checkboxFlow]
                    : [];
                html = window.MapperSidebarEngine.renderQuickModeSidebar(
                    this.fields,
                    radioGroups,
                    checkboxGroups,
                    this.expandedFieldId,
                    this.selectedField?.id
                );
                list.innerHTML = html;
                list.scrollTop = scrollTop; // Restore scroll position
                return;
            }
            // If mode-specific function not available, fall through to standard rendering
        }

        // ============ STANDARD TAB-BASED RENDERING ============
        // Determine which fields to show based on active tab
        if (this.activeTab === 'editing') {
            currentFields = editingFields;
        } else if (this.activeTab === 'mapped') {
            currentFields = mappedFields;
        } else if (this.activeTab === 'tables') {
            // Render mapped tables
            if (!this.mappedTables || this.mappedTables.length === 0) {
                html = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-text">אין טבלאות</div>
                    <div class="empty-state-subtext">צור טבלאות לניהול שדות חוזרים</div>
                    <button class="empty-state-action" onclick="mapper.activateTableMappingMode()">צור טבלה חדשה</button>
                </div>`;
            } else {
                html = this.mappedTables.map(table => this.renderMappedTable(table)).join('');
            }
            list.innerHTML = html;
            list.scrollTop = scrollTop; // Restore scroll position
            return;
        } else if (this.activeTab === 'groups') {
            // Render option groups (Step 3) AND radio groups (Radio Grouping Feature)
            const hasOptionGroups = this.optionGroups && this.optionGroups.length > 0;
            const hasRadioGroups = this.radioGroups && this.radioGroups.length > 0;

            if (!hasOptionGroups && !hasRadioGroups) {
                html = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔘</div>
                    <div class="empty-state-text">אין קבוצות</div>
                    <div class="empty-state-subtext">
                        לחץ "🔗 קבץ רדיו" כדי לקבץ שדות רדיו<br>
                        או בחר שדות קטנים ולחץ "📦 קבץ"
                    </div>
                </div>`;
            } else {
                // Render radio groups first (new feature)
                if (hasRadioGroups) {
                    html += '<h4 style="padding: 8px 12px; color: #9C27B0; margin: 0;">🔗 קבוצות רדיו</h4>';
                    html += window.MapperSidebarEngine.renderRadioGroupsList(
                        this.radioGroups,
                        this.expandedFieldId,
                        this.currentPage
                    );
                }
                // Then render option groups (old feature)
                if (hasOptionGroups) {
                    html += '<h4 style="padding: 8px 12px; color: #FF9800; margin: 0;">📦 קבוצות אפשרויות</h4>';
                    html += window.MapperSidebarEngine.renderOptionGroups(
                        this.optionGroups,
                        this.expandedFieldId,
                        this.currentPage
                    );
                }
            }
            list.innerHTML = html;
            list.scrollTop = scrollTop; // Restore scroll position
            return;
        }

        // Show empty state if no fields
        if (currentFields.length === 0) {
            const emptyMessage = this.activeTab === 'editing'
                ? `<div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <div class="empty-state-text">אין שדות בעריכה</div>
                    <div class="empty-state-subtext">התחל ביצירת שדה חדש</div>
                    <button class="empty-state-action" onclick="mapper.addNewField()">הוסף שדה חדש</button>
                </div>`
                : `<div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-text">אין שדות ממופים</div>
                    <div class="empty-state-subtext">סיים עריכת שדות כדי לראות אותם כאן</div>
                </div>`;

            list.innerHTML = emptyMessage;
            list.scrollTop = scrollTop; // Restore scroll position
            return;
        }

        // Render field items
        list.innerHTML = currentFields.map(field => this.renderFieldItem(field)).join('');
        list.scrollTop = scrollTop; // Restore scroll position
    }

    /**
     * Legacy compatibility: Update sidebar counts
     * This method was removed during refactoring but is still called by onTableStepFinished()
     * and potentially other modes. Delegate to updateFieldList() which handles all counts.
     */
    updateSidebarCounts() {
        if (typeof this.updateFieldList === 'function') {
            this.updateFieldList();
        }
    }

    // ============ SIDEBAR RENDERING ============
    // Delegated to SidebarEngine module

    renderFieldItem(field) {
        const isExpanded = this.expandedFieldId === field.id;
        const isSelected = this.selectedField?.id === field.id;
        const isInMappingMode = this.interaction.mode === 'mapping';
        return this.SidebarEngine.renderFieldItem(field, isExpanded, isSelected, isInMappingMode);
    }

    renderTableGroup(group) {
        const groupFields = this.fields.filter(f => f.tableGroupId === group.id);
        const isExpanded = this.expandedFieldId === group.id;
        return this.SidebarEngine.renderTableGroup(group, isExpanded, groupFields);
    }

    /**
     * Render a mapped table for the sidebar
     * @param {Object} table - Mapped table object
     * @returns {string} HTML string
     */
    renderMappedTable(table) {
        const isExpanded = this.expandedFieldId === table.tableId;
        const columnsCount = table.columns?.length || 0;
        const rowsCount = table.rowCount || 0;
        const totalCells = columnsCount * rowsCount;

        // Check if all columns have names
        const namedColumns = table.columns?.filter(c => c.hebrewName && c.hebrewName.trim() !== '') || [];
        const allNamed = namedColumns.length === columnsCount;
        const statusClass = allNamed ? 'complete' : 'incomplete';
        const statusBadge = allNamed
            ? '<span class="status-badge complete">✓ הושלם</span>'
            : `<span class="status-badge incomplete">${namedColumns.length}/${columnsCount} עמודות</span>`;

        return `
        <div class="mapped-table-item ${isExpanded ? 'expanded' : ''} ${statusClass}" data-table-id="${table.tableId}">
            <div class="table-header" onclick="mapper.toggleTableExpansion('${table.tableId}')">
                <div class="table-info">
                    <span class="table-icon">📋</span>
                    <span class="table-name">${table.tableId}</span>
                    ${statusBadge}
                </div>
                <div class="table-meta">
                    <span class="table-size">${columnsCount} עמודות × ${rowsCount} שורות = ${totalCells} תאים</span>
                    <span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>
                </div>
            </div>
            <div class="table-content" style="display: ${isExpanded ? 'block' : 'none'}">
                <div class="table-columns-list">
                    <h5>עמודות:</h5>
                    ${table.columns?.map((col, idx) => `
                        <div class="table-column-item ${col.hebrewName ? 'named' : 'unnamed'}">
                            <span class="col-index">${idx + 1}.</span>
                            <span class="col-name">${col.hebrewName || '(ללא שם)'}</span>
                            <span class="col-type">${this.getTypeLabel(col.type)}</span>
                            <button class="btn-name-col" onclick="event.stopPropagation(); mapper.startColumnNaming('${table.tableId}', '${col.columnId}')" title="שנה שם">✏️</button>
                            <button class="btn-type-col" onclick="event.stopPropagation(); mapper.changeColumnType('${table.tableId}', '${col.columnId}')" title="שנה סוג">🔄</button>
                        </div>
                    `).join('') || '<div class="no-columns">אין עמודות</div>'}
                </div>
                <div class="table-actions">
                    <button class="btn-delete-table" onclick="event.stopPropagation(); mapper.removeTable('${table.tableId}')">🗑️ מחק טבלה</button>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Toggle table expansion in sidebar
     */
    toggleTableExpansion(tableId) {
        if (this.expandedFieldId === tableId) {
            this.expandedFieldId = null;
        } else {
            this.expandedFieldId = tableId;
        }
        this.updateFieldList();
    }

    /**
     * Get Hebrew label for field type
     */
    getTypeLabel(type) {
        const labels = {
            'text': 'טקסט',
            'number': 'מספר',
            'date': 'תאריך',
            'checkbox': 'סימון',
            'radio': 'בחירה',
            'signature': 'חתימה'
        };
        return labels[type] || type || 'טקסט';
    }

    /**
     * Start naming a column
     */
    startColumnNaming(tableId, columnId) {
        const table = this.mappedTables.find(t => t.tableId === tableId);
        if (!table) return;

        const column = table.columns.find(c => c.columnId === columnId);
        if (!column) return;

        const newName = prompt('הזן שם לעמודה (עברית):', column.hebrewName || '');
        if (newName !== null) {
            column.hebrewName = newName.trim();
            column.englishId = this.toEnglishFieldId(newName.trim());

            // Update all fields in this column
            this.fields.forEach(field => {
                if (field.tableId === tableId && field.columnId === columnId) {
                    field.hebrewName = column.hebrewName;
                    field.englishId = column.englishId;
                }
            });

            this.updateFieldList();
            this.showToast(`עמודה עודכנה: ${newName}`, 'success');
        }
    }

    /**
     * Change column type
     */
    changeColumnType(tableId, columnId) {
        const table = this.mappedTables.find(t => t.tableId === tableId);
        if (!table) return;

        const column = table.columns.find(c => c.columnId === columnId);
        if (!column) return;

        const types = ['text', 'number', 'date', 'checkbox', 'radio', 'signature'];
        const currentIndex = types.indexOf(column.type || 'text');
        const nextIndex = (currentIndex + 1) % types.length;
        const newType = types[nextIndex];

        column.type = newType;

        // Update all fields in this column
        this.fields.forEach(field => {
            if (field.tableId === tableId && field.columnId === columnId) {
                field.type = newType;
            }
        });

        this.updateFieldList();
        this.showToast(`סוג עמודה שונה ל: ${this.getTypeLabel(newType)}`, 'info');
    }

    // ============ TABLE FIELDS WITH GRID PREVIEW - ENHANCED ============

    createTableGridPreview(drawingRect) {
        if (!this.interaction.tableConfig) return;
        
        const { rows, cols } = this.interaction.tableConfig;
        
        // Create grid overlay
        const gridOverlay = document.createElement('div');
        gridOverlay.className = 'table-grid-preview';
        gridOverlay.style.position = 'absolute';
        gridOverlay.style.top = '0';
        gridOverlay.style.left = '0';
        gridOverlay.style.width = '100%';
        gridOverlay.style.height = '100%';
        gridOverlay.style.pointerEvents = 'none';
        gridOverlay.style.zIndex = '10';
        
        drawingRect.appendChild(gridOverlay);
        
        this.updateTableGridPreview(drawingRect, 0, 0);
    }
    
    updateTableGridPreview(drawingRect, width, height) {
        if (!this.interaction.tableConfig || width <= 0 || height <= 0) return;
        
        const gridOverlay = drawingRect.querySelector('.table-grid-preview');
        if (!gridOverlay) return;
        
        const { rows, cols } = this.interaction.tableConfig;
        
        // Clear existing grid
        gridOverlay.innerHTML = '';
        
        const cellWidth = width / cols;
        const cellHeight = height / rows;
        
        // Create grid cells
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cell = document.createElement('div');
                cell.style.position = 'absolute';
                cell.style.left = (col * cellWidth) + 'px';
                cell.style.top = (row * cellHeight) + 'px';
                cell.style.width = cellWidth + 'px';
                cell.style.height = cellHeight + 'px';
                cell.style.border = '1px dashed rgba(102, 126, 234, 0.6)';
                cell.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
                cell.style.boxSizing = 'border-box';
                
                // Add cell label
                const label = document.createElement('div');
                label.style.position = 'absolute';
                label.style.top = '2px';
                label.style.left = '2px';
                label.style.fontSize = '10px';
                label.style.color = '#667eea';
                label.style.fontWeight = 'bold';
                label.textContent = cols > 1 ? `R${row + 1}C${col + 1}` : `${row + 1}`;
                cell.appendChild(label);
                
                gridOverlay.appendChild(cell);
            }
        }
    }
    
    clearTableGridPreview() {
        const gridPreview = document.querySelector('.table-grid-preview');
        if (gridPreview) {
            gridPreview.remove();
        }
    }

    // ============ OVERLAP CHECK ============

    findOverlappingFields(newBbox, excludeFieldId = null) {
        const overlapping = [];
        
        this.fields.forEach(field => {
            if (field.id === excludeFieldId || !field.isMapped) return;
            
            const fieldBbox = [
                field.x, 
                field.y, 
                field.width, 
                field.height
            ];
            
            if (this.Core.checkFieldOverlap(newBbox, fieldBbox)) {
                overlapping.push(field);
            }
        });
        
        return overlapping;
    }
    
    showOverlapWarning(overlappingFields, newFieldId) {
        const fieldNames = overlappingFields.map(f => f.label_he || f.label_en || f.id).join(', ');
        const message = `⚠️ השדה החדש חופף עם השדות: ${fieldNames}. להמשיך בכל זאת?`;
        
        if (confirm(message)) {
            return true; // Continue with mapping
        } else {
            // Remove the new field if user cancels
            this.removeField(newFieldId);
            return false;
        }
    }

    addTableField() {
        return this.FieldEngine.addTableField(this);
    }

    closeTableDialog() {
        // Delegate to UI module
        this.UI.closeTableDialog();
        this.clearTablePreview();
    }

    createTableFields() {
        return this.FieldEngine.createTableFields(this);
    }

    showTableGridPreview(rows, cols) {
        // This will be shown after drawing the table area
        this.pendingTableGrid = { rows, cols };
    }

    clearTablePreview() {
        const preview = document.querySelector('.table-grid-preview');
        if (preview) preview.remove();
    }

    createTableFieldsInArea(x, y, width, height) {
        return this.FieldEngine.createTableFieldsInArea(x, y, width, height, this);
    }

    // ============ JSON Import Functions ============

    async importJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                let fieldsData;
                
                // Check if this is a field template list (like your uploaded file)
                if (Array.isArray(data) && data.length > 0 && data[0].name && data[0].label_he) {
                    // Convert field template format to internal format
                    fieldsData = data.map(fieldTemplate => ({
                        id: fieldTemplate.name,
                        label_he: fieldTemplate.label_he,
                        label_en: fieldTemplate.name,
                        type: this.Core.mapFieldType(fieldTemplate.type),
                        direction: 'rtl',
                        fontSize: 14,
                        letterSpacing: 0,
                        wordSpacing: 0,
                        lineHeight: 1.0,
                        anchorH: 'start',
                        anchorV: 'middle',
                        padStart: 4,
                        padEnd: 4,
                        padTop: 2,
                        padBottom: 2,
                        page: this.currentPage,
                        xPct: null,
                        yPct: null,
                        wPct: null,
                        hPct: null,
                        // No dummy data in Mapper mode - structure only
                        isMapped: false,
                        isComplete: false,
                        element: null
                    }));
                    
                    this.showToast(`נטענו ${fieldsData.length} תבניות שדות. כעת צייר מלבנים למיפוי השדות.`, 'success');
                    
                } else if (Array.isArray(data)) {
                    // Legacy format - direct field list
                    fieldsData = data;
                } else if (data.fields && Array.isArray(data.fields)) {
                    // Project format
                    fieldsData = data.fields;
                } else {
                    throw new Error('קובץ JSON לא תקין');
                }
                
                // Clear existing fields
                this.clearAll();
                
                // Import fields with support for both bbox and legacy percentage coordinates
                // ✅ Normalize each field before importing
                this.fields = fieldsData.map(field => {
                    const normalized = normalizeField(field);
                    if (!normalized) return null;

                    return {
                        ...normalized,
                        element: null,
                        isMapped: (normalized.bbox && Array.isArray(normalized.bbox) && normalized.bbox.length === 4) ||
                                 (normalized.anchor && Array.isArray(normalized.anchor) && normalized.anchor.length === 2) ||
                                 (normalized.xPct != null && normalized.yPct != null),
                        isComplete: false,
                        // ============ AUTO-LABEL: Disable for JSON-loaded fields ============
                        _userEditedName: true  // Prevent auto-label from overwriting imported names
                    };
                }).filter(f => f !== null);

                // ============ AUTO-LABEL: Clean up autoLabel from imported fields ============
                // Remove autoLabel property to prevent confusion with manually imported data
                this.fields.forEach(f => {
                    delete f.autoLabel;
                });

                // ============ V1 → V2 MIGRATION ============
                // Auto-migrate V1 fields (bbox percentages) to V2 (PDF points)
                const migrationResult = this.migrateV1toV2(this.fields);
                if (migrationResult.migrationCount > 0) {
                    this.fields = migrationResult.fields;
                    this.showToast(`המרת ${migrationResult.migrationCount} שדות לפורמט V2`, 'success');
                }

                // Check if we need to migrate legacy fields (old xPct/yPct format)
                const hasLegacyFields = this.fields.some(field =>
                    field.isMapped && field.xPct != null &&
                    (!field.bbox || !Array.isArray(field.bbox) || field.bbox.length !== 4)
                );
                if (hasLegacyFields) {
                    this.needsLegacyMigration = true;
                }
                
                // Handle Live Fill data import (new format support)
                this.fields.forEach(field => {
                    if (field.value && field.typography) {
                        // Import Live Fill data from new JSON format
                        this.liveFillData[field.id] = {
                            value: field.value,
                            style: {
                                fontFamily: field.typography.fontFamily || 'David Libre',
                                fontSize: field.typography.fontSize || 14,
                                alignmentH: field.typography.alignment || 'center',
                                alignmentV: field.typography.verticalAlign || 'middle',
                                color: field.typography.color || '#000000',
                                opacity: field.typography.opacity !== undefined ? field.typography.opacity : 1.0,
                                letterSpacing: field.typography.letterSpacing || 0,
                                wordSpacing: field.typography.wordSpacing || 0
                            }
                        };
                    }
                });

                // Render mapped fields
                const renderPromises = this.fields
                    .filter(field => field.isMapped && field.page === this.currentPage)
                    .map(field => this.renderField(field));
                await Promise.all(renderPromises);

                this.updateFieldList();
                this.autoSave();

                // Re-detect mapping mode after JSON import
                this._detectMappingMode();

                this.showToast(`יובאו ${this.fields.length} שדות`, 'success');
                
            } catch (error) {
                this.showToast('שגיאה בייבוא: ' + error.message, 'error');
            }
        };
        
        input.click();
    }

    // ============ EXPORT/IMPORT - ENHANCED ============

    // NEW ARCHITECTURE: Export mapping JSON (structure only)
    exportMappingJSON() {
        // Strict filtering: only mapped fields with valid bbox or anchor
        const completedFields = this.fields.filter(f => {
            // Always include checkbox/radio fields with anchor
            if (f.type === 'checkbox' || f.type === 'radio') {
                const hasValidAnchor =
                    f.anchor && Array.isArray(f.anchor) && f.anchor.length === 2 &&
                    f.anchor.every(n => typeof n === "number");
                return hasValidAnchor;
            }

            // For text fields, check if bbox is valid and NOT the default unmapped bbox
            if (f.bbox && Array.isArray(f.bbox) && f.bbox.length === 4) {
                const [x, y, w, h] = f.bbox;
                // Exclude default unmapped bbox [0, 0, 0.1, 0.05]
                const isDefaultUnmapped = (x === 0 && y === 0 && w === 0.1 && h === 0.05);
                return !isDefaultUnmapped;
            }

            return false;
        });

        if (completedFields.length === 0) {
            this.showToast('אין שדות ממופים לייצוא', 'warning');
            return;
        }

        // Simple format for new architecture (includes both V2 PDF points and V1 bbox for compatibility)
        const mappingData = completedFields.map(field => {
            const data = {
                fieldId: field.id,
                type: field.type || 'text',
                page: field.page || 1
            };

            // Checkbox/Radio: include anchor and overlay size
            if (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
                data.anchor = field.anchor; // [x%, y%] as relative percentages (0-1)
                if (field.overlayWidth) data.overlayWidth = field.overlayWidth;
                if (field.overlayHeight) data.overlayHeight = field.overlayHeight;
            }
            // Regular fields: include V2 PDF points (preferred) + V1 bbox (backwards compatibility)
            else {
                // V2 format: PDF points (preferred by export-engine and livefill)
                if (typeof field.pdfX === 'number' && typeof field.pdfY === 'number' &&
                    typeof field.pdfWidth === 'number' && typeof field.pdfHeight === 'number') {
                    data.pdfX = field.pdfX;
                    data.pdfY = field.pdfY;
                    data.pdfWidth = field.pdfWidth;
                    data.pdfHeight = field.pdfHeight;
                }

                // V1 format: bbox percentages (backwards compatibility)
                if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
                    data.bbox = field.bbox; // [x%, y%, w%, h%] as relative percentages (0-1)
                }
            }

            // Radio Grouping Feature: Include groupId reference
            if (field.groupId) {
                data.radioGroupId = field.groupId;
            }

            return data;
        }).filter(data => data.bbox || data.anchor || data.pdfX !== undefined); // Include V2 fields too

        // Radio Grouping Feature: Create export object with fields and radioGroups
        // Include field coordinates in each option for fill engine compatibility
        const exportData = {
            fields: mappingData,
            radioGroups: (this.radioGroups || []).map(group => ({
                groupId: group.groupId,
                groupName: group.groupName,
                page: group.page,
                type: 'radio', // Required by fill engine
                options: (group.options || []).map(opt => {
                    // Find the field to get its coordinates
                    const field = this.fields.find(f => f.id === opt.fieldId);
                    const optionData = {
                        fieldId: opt.fieldId,
                        label: opt.label,
                        value: opt.value,
                        // Also include legacy naming for fill engine compatibility
                        hebrewLabel: opt.label,
                        englishId: opt.value
                    };

                    // Include coordinates from the field
                    if (field) {
                        if (field.anchor && Array.isArray(field.anchor)) {
                            optionData.anchor = [...field.anchor];
                            optionData.overlayWidth = field.overlayWidth;
                            optionData.overlayHeight = field.overlayHeight;
                        }
                        if (field.bbox && Array.isArray(field.bbox)) {
                            optionData.bbox = [...field.bbox];
                        }
                        if (typeof field.pdfX === 'number') {
                            optionData.pdfX = field.pdfX;
                            optionData.pdfY = field.pdfY;
                            optionData.pdfWidth = field.pdfWidth;
                            optionData.pdfHeight = field.pdfHeight;
                        }
                    }

                    return optionData;
                })
            }))
        };

        // Include tables in the export
        exportData.tables = this.mappedTables.map(table => {
            // If it's already in the new format (from TableModel.toMappingJSON), use it directly
            // Otherwise, use the old TableEngine export
            if (table.headerBBox !== undefined) {
                // New format from TableModel
                return {
                    tableId: table.tableId,
                    page: table.page,
                    bbox: table.bbox,
                    headerBBox: table.headerBBox,
                    sampleRowBBox: table.sampleRowBBox,
                    rowCount: table.rowCount,
                    rowHeight: table.rowHeight,
                    repeatDirection: table.repeatDirection || 'vertical',
                    columns: (table.columns || []).map(col => ({
                        columnId: col.columnId,
                        hebrewName: col.hebrewName || '',
                        englishId: col.englishId || col.columnId,
                        bbox: col.bbox,
                        type: col.type || 'text'
                    })),
                    rows: table.rows || [],
                    isComplete: table.isComplete
                };
            } else if (window.TableEngine) {
                // Old format - use TableEngine export
                return window.TableEngine.exportTableToJSON(table);
            } else {
                // Fallback - return as-is
                return table;
            }
        });

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `mapping-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);

        const tableCount = exportData.tables?.length || 0;
        let message = `ייצוא מיפוי הושלם - ${mappingData.length} שדות, ${exportData.radioGroups.length} קבוצות רדיו`;
        if (tableCount > 0) {
            message += `, ${tableCount} טבלאות`;
        }
        this.showToast(message, 'success');
    }

    /**
     * Get Step 1 fields JSON output in the required format
     * Returns: { fields: [ { id, page, bbox: {x,y,width,height}, type, hebrewName, englishId, linked }, ... ] }
     * @returns {Object} JSON object with fields array
     */
    getStep1FieldsJSON() {
        const step1Fields = this.fields.filter(f =>
            f.isMapped &&
            f.bbox &&
            Array.isArray(f.bbox) &&
            f.bbox.length === 4
        );

        const fieldsOutput = step1Fields.map(field => {
            // Convert bbox from percentages to PDF points if we have pdfX/pdfY/pdfWidth/pdfHeight
            let bboxObj;
            if (typeof field.pdfX === 'number') {
                bboxObj = {
                    x: field.pdfX,
                    y: field.pdfY,
                    width: field.pdfWidth,
                    height: field.pdfHeight
                };
            } else {
                // Fallback: convert percentages to PDF points
                const dpiScale = this.dpiSetting / 72;
                const pageWidth = (this.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
                const pageHeight = (this.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;
                const [xPct, yPct, wPct, hPct] = field.bbox;
                bboxObj = {
                    x: xPct * pageWidth,
                    y: yPct * pageHeight,
                    width: wPct * pageWidth,
                    height: hPct * pageHeight
                };
            }

            return {
                id: field.id,
                page: field.page || 1,
                bbox: bboxObj,
                type: field.type || 'text',
                hebrewName: field.hebrewName || '',
                englishId: field.englishId || '',
                linked: field.linked || false
            };
        });

        return { fields: fieldsOutput };
    }

    /**
     * Export Step 1 fields JSON to file
     * Uses the required format with bbox as object {x, y, width, height}
     */
    exportStep1JSON() {
        const jsonOutput = this.getStep1FieldsJSON();

        if (jsonOutput.fields.length === 0) {
            this.showToast('אין שדות לייצוא', 'warning');
            return;
        }

        const blob = new Blob([JSON.stringify(jsonOutput, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `step1-fields-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast(`ייצוא Step 1 הושלם - ${jsonOutput.fields.length} שדות`, 'success');
    }

    // NEW ARCHITECTURE: Export live fill JSON (complete data)
    exportLiveFillJSON() {
        // Filter for fields that are mapped AND have valid coordinates
        const completedFields = this.fields.filter(f => {
            const hasValidBbox = f.bbox && Array.isArray(f.bbox) && f.bbox.length === 4;
            const hasValidAnchor = f.anchor && Array.isArray(f.anchor) && f.anchor.length === 2;
            const hasValidV2 = typeof f.pdfX === 'number' && typeof f.pdfY === 'number';
            return f.isMapped && (hasValidBbox || hasValidAnchor || hasValidV2);
        });

        if (completedFields.length === 0) {
            this.showToast('אין שדות ממופים לייצוא', 'warning');
            return;
        }

        // Complete format with styling and values (includes V2 PDF points + V1 bbox for compatibility)
        const liveFillData = completedFields.map(field => {
            const data = {
                fieldId: field.id,
                type: field.type || 'text',
                page: field.page || 1
            };

            // Checkbox/Radio: include anchor and overlay size
            if (field.anchor && Array.isArray(field.anchor)) {
                data.anchor = field.anchor; // [x%, y%] as relative percentages (0-1)
                data.overlayWidth = field.overlayWidth;
                data.overlayHeight = field.overlayHeight;
                data.checked = field.checked || false; // Checkbox/radio state
            }
            // Regular fields: include V2 PDF points + V1 bbox and text styling
            else {
                // V2 format: PDF points (preferred by export-engine and livefill)
                if (typeof field.pdfX === 'number' && typeof field.pdfY === 'number' &&
                    typeof field.pdfWidth === 'number' && typeof field.pdfHeight === 'number') {
                    data.pdfX = field.pdfX;
                    data.pdfY = field.pdfY;
                    data.pdfWidth = field.pdfWidth;
                    data.pdfHeight = field.pdfHeight;
                }

                // V1 format: bbox percentages (backwards compatibility)
                if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
                    data.bbox = field.bbox; // [x%, y%, w%, h%] as relative percentages (0-1)
                }

                // Text styling
                data.fontFamily = field.textSettings?.fontFamily || 'David Libre';
                data.fontSize = field.textSettings?.fontSize || 14;
                data.alignment = field.textSettings?.alignmentH || 'center';
                data.color = field.textSettings?.color || '#000000';
                data.opacity = field.textSettings?.opacity || 1.0;
                data.letterSpacing = field.textSettings?.letterSpacing || 0;
                data.value = field.liveText || ''; // Only real values, no dummy
            }

            return data;
        }).filter(field => {
            // Include checkbox/radio fields always, text fields only if they have values
            return field.type === 'checkbox' || field.type === 'radio' || field.value;
        });

        if (liveFillData.length === 0) {
            this.showToast('אין שדות עם טקסט לייצוא', 'warning');
            return;
        }

        const blob = new Blob([JSON.stringify(liveFillData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `live-fill-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast(`ייצוא מילוי חי הושלם - ${liveFillData.length} שדות`, 'success');
    }

    exportJSON() {
        // Export ALL fields (full template), not just mapped ones
        const allFields = this.fields;

        if (allFields.length === 0) {
            this.showToast('אין שדות לייצוא', 'warning');
            return;
        }
        
        // קבל גודל קנבס מ-PDF אם קיים
        let canvasWidth = 1200;  // ברירת מחדל
        let canvasHeight = 1700; // ברירת מחדל
        let pdfWidth = 595;     // A4 default
        let pdfHeight = 842;    // A4 default
        
        // נסה לקבל ממדים מ-PDF אם נטען
        if (this.pdfDocument) {
            try {
                const page = this.pdfDocument.getPage(1);
                if (page && page.view) {
                    canvasWidth = page.view[2] || canvasWidth;
                    canvasHeight = page.view[3] || canvasHeight;
                    pdfWidth = page.view[2] || pdfWidth;
                    pdfHeight = page.view[3] || pdfHeight;
                }
            } catch (e) {
                // אם יש בעיה, השתמש בברירת מחדל
                console.log('Using default canvas dimensions');
            }
        }
        
        // אם אין PDF, נסה לקבל ממדים מהקנבס
        const mappingLayer = document.getElementById('mapping-layer');
        if (!this.pdfDocument && mappingLayer) {
            const rect = mappingLayer.getBoundingClientRect();
            canvasWidth = rect.width || canvasWidth;
            canvasHeight = rect.height || canvasHeight;
        }
        
        // בנה את המערך של pages
        const pages = [];

        // ארגן את כל השדות לפי עמודים (לא רק ממופים)
        const pageFieldsMap = {};
        allFields.forEach(field => {
            const pageNum = field.page || 1;
            if (!pageFieldsMap[pageNum]) {
                pageFieldsMap[pageNum] = [];
            }
            pageFieldsMap[pageNum].push(field);
        });

        // צור page לכל עמוד עם שדות
        Object.keys(pageFieldsMap).sort((a, b) => a - b).forEach(pageNum => {
            pages.push({
                pageNumber: parseInt(pageNum),
                mediaBoxPt: { width: pdfWidth, height: pdfHeight },
                cropBoxPt: { x: 0, y: 0, w: pdfWidth, h: pdfHeight },
                transform: [1, 0, 0, 1, 0, 0],
                fields: pageFieldsMap[pageNum].map(field => {
                    const fieldData = {
                        fieldId: field.id,
                        type: field.type || 'text',
                        page: parseInt(pageNum),
                        defaultValue: '',
                        required: field.required || false,
                        groupId: field.tableGroupId || null,
                        label_he: field.label_he,
                        groupName: field.type === 'radio' ? field.groupName : undefined
                    };

                    // Checkbox/Radio: use anchor instead of bbox
                    if (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
                        fieldData.anchor = field.anchor; // [x%, y%] as relative percentages (0-1)
                        fieldData.overlayWidth = field.overlayWidth || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
                        fieldData.overlayHeight = field.overlayHeight || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
                    }
                    // Regular fields: use bbox
                    else {
                        let bbox;
                        if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
                            bbox = field.bbox;
                        } else {
                            // Convert legacy percentages to PDF points
                            bbox = [
                                (field.xPct / 100) * pdfWidth,
                                (field.yPct / 100) * pdfHeight,
                                (field.wPct / 100) * pdfWidth,
                                (field.hPct / 100) * pdfHeight
                            ];
                        }
                        fieldData.bbox = bbox; // [xPct, yPct, wPct, hPct] in percentages or PDF points
                        fieldData.fontSize = field.fontSize || 11;
                        fieldData.typography = {
                            fontName: field.fontName || this.getFontNameForField(field),
                            letterSpacing: field.letterSpacing || 0,
                            wordSpacing: field.wordSpacing || 0,
                            baselineOffset: field.baselineOffset || 0,
                            anchorH: field.anchorH || this.Core.getAnchorH(field),
                            anchorV: field.anchorV || this.Core.getAnchorV(field),
                            direction: field.direction || 'rtl',
                            fontColor: field.fontColor || [0, 0, 0]
                        };
                    }

                    return fieldData;
                })
            });
        });
        
        const exportData = {
            version: '2.1',
            canvasWidthPx: Math.round(canvasWidth),
            canvasHeightPx: Math.round(canvasHeight),
            pages: pages
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `field-mapping-export-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showToast(`✅ יוצאו ${allFields.length} שדות (JSON מלא)`, 'success');
    }
    
    // פונקציות עזר לקביעת ערכי ברירת מחדל
    getFontNameForField(field) {
        // החלט על פונט לפי סוג השדה
        if (field.type === 'checkbox') {
            return 'Helvetica'; // או ZapfDingbats אם יש
        }
        return field.direction === 'ltr' ? 'Helvetica' : 'DavidLibre';
    }
    
    exportCSV() {
        if (this.fields.length === 0) {
            this.showToast('אין שדות לייצוא', 'warning');
            return;
        }
        
        const headers = ['id', 'label_he', 'type', 'direction', 'fontSize', 'page', 'xPct', 'yPct', 'wPct', 'hPct', 'isComplete', 'tableGroupId'];
        
        let csvContent = headers.join(',') + '\n';
        
        this.fields.forEach(field => {
            const row = [
                field.id || '',
                `"${(field.label_he || '').replace(/"/g, '""')}"`,
                field.type || 'text',
                field.direction || 'rtl',
                field.fontSize || 14,
                field.page || 1,
                field.xPct || 0,
                field.yPct || 0,
                field.wPct || 0,
                field.hPct || 0,
                field.isComplete ? 'true' : 'false',
                field.tableGroupId || ''
            ];
            csvContent += row.join(',') + '\n';
        });
        
        // Add BOM for Hebrew support
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `field-mapping-${Date.now()}.csv`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showToast('הקובץ יוצא בהצלחה ל-CSV', 'success');
    }

    saveProject() {
        return this.State.saveProject(this);
    }

    loadProject() {
        return this.State.loadProject(this);
    }

    // ============ VIEW MANAGEMENT ============

    setMode(mode) {
        this.mode = mode;
        const mappingBtn = document.getElementById('mode-mapping');
        const previewBtn = document.getElementById('mode-preview');
        const container = document.getElementById('canvas-container');
        
        if (mode === 'mapping') {
            mappingBtn?.classList.add('active');
            previewBtn?.classList.remove('active');
            container?.classList.remove('preview-mode');
        } else {
            mappingBtn?.classList.remove('active');
            previewBtn?.classList.add('active');
            container?.classList.add('preview-mode');
        }
        
        this.showToast(`מצב ${mode === 'mapping' ? 'מיפוי' : 'תצוגה מקדימה'}`, 'info');
        
        // עדכון מיקומי שדות אחרי שינוי מצב
    }

    // ============ VIEWPORT ZOOM & PAN FUNCTIONS ============
    // Delegated to Viewport module

    resetView() {
        return this.Viewport.resetView(this);
    }

    zoomIn() {
        // Clean up debug overlays on zoom
        if (window.NameDebugOverlay) {
            window.NameDebugOverlay.hideCandidateBox();
        }
        return this.Viewport.zoomIn(this);
    }

    zoomOut() {
        // Clean up debug overlays on zoom
        if (window.NameDebugOverlay) {
            window.NameDebugOverlay.hideCandidateBox();
        }
        return this.Viewport.zoomOut(this);
    }

    resetZoom() {
        // Clean up debug overlays on zoom reset
        if (window.NameDebugOverlay) {
            window.NameDebugOverlay.cleanup();
        }
        return this.Viewport.resetZoom(this);
    }

    updateZoomInfo() {
        return this.Viewport.updateZoomInfo(this);
    }

    setZoom(newZoom) {
        return this.Viewport.setZoom(newZoom, this);
    }

    updateZoomDisplay() {
        // Delegate to UI module
        this.UI.updateZoomDisplay(this.zoomLevel);

        // Update transform with current pan and zoom
        this.updateViewTransform();
    }

    updateViewTransform() {
        return this.Viewport.updateViewTransform(this);
    }

    // ============ MOUSE EVENTS ============
    // Delegated to Events module

    onMouseDown(e) {
        this.Events.onMouseDown(e, this);
    }

    onMouseMove(e) {
        this.Events.onMouseMove(e, this);
    }

    onMouseUp(e) {
        this.Events.onMouseUp(e, this);
    }

    onViewportMouseDown(e) {
        this.Events.onViewportMouseDown(e, this);
    }

    updatePan(clientX, clientY) {
        return this.Viewport.updatePan(clientX, clientY, this);
    }

    onWheel(e) {
        this.Events.onWheel(e, this);
    }

    // ============ KEYBOARD EVENTS ============
    // Delegated to Events module

    onKeyDown(e) {
        this.Events.onKeyDown(e, this);
    }

    onKeyUp(e) {
        this.Events.onKeyUp(e, this);
    }

    // ============ DRAWING ============
    // Delegated to DragEngine module

    startDrawing(x, y, event) {
        this.DragEngine.startDrawing(x, y, event, this);
    }

    updateDrawing(x, y) {
        this.DragEngine.updateDrawing(x, y, this);
    }

    async finishDrawing() {
        await this.DragEngine.finishDrawing(this);
    }

    // ============ CHECKBOX/RADIO CLICK-TO-PLACE ============

    async placeCheckboxRadio(x, y, field) {
        // Snap to grid (5px steps)
        x = Math.round(x / 5) * 5;
        y = Math.round(y / 5) * 5;

        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        // Check if click is within page boundaries
        if (x < 0 || y < 0 || x > layer.offsetWidth || y > layer.offsetHeight) {
            this.showToast('נקודה מחוץ לגבולות הדף', 'warning');
            return;
        }

        // Calculate percentage coordinates for anchor
        const layerWidth = Math.max(layer.offsetWidth, 1);
        const layerHeight = Math.max(layer.offsetHeight, 1);
        const pdfCanvas = document.querySelector('#pdf-container canvas');
        const canvasWidth = Math.max(pdfCanvas?.width || layerWidth, 1);
        const canvasHeight = Math.max(pdfCanvas?.height || layerHeight, 1);
        const pageWidth = this.pdfPageDimensions?.width || canvasWidth;
        const pageHeight = this.pdfPageDimensions?.height || canvasHeight;
        const widthScale = pageWidth / layerWidth;
        const heightScale = pageHeight / layerHeight;

        const xPdf = x * widthScale;
        const yPdfTop = y * heightScale;
        const yPdfBottom = pageHeight - yPdfTop;

        const xPercent = xPdf / pageWidth;
        const yPercent = yPdfBottom / pageHeight;

        // Default overlay sizes
        const overlayWidth = field.type === 'checkbox' ? 20 : 16;
        const overlayHeight = overlayWidth; // Always 1:1 ratio

        // Save anchor and overlay size (NO bbox)
        Object.assign(field, {
            anchor: [xPercent, yPercent],
            overlayWidth: overlayWidth,
            overlayHeight: overlayHeight,
            isMapped: true,
            page: this.currentPage
        });

        // Remove bbox if it exists (checkbox/radio don't use bbox)
        delete field.bbox;
        delete field.xPct;
        delete field.yPct;
        delete field.wPct;
        delete field.hPct;

        console.log("✅ Checkbox/Radio placed:", {
            id: field.id,
            type: field.type,
            anchor: field.anchor,
            overlaySize: `${overlayWidth}x${overlayHeight}`,
            page: this.currentPage
        });

        // Update and render
        this.updateFieldCompleteStatus(field);
        await this.renderField(field);
        this.updateFieldList();
        this.selectField(field.id, { scroll: false });
        this.saveState('place_checkbox_radio');
        this.updatePreviewRealTime();

        this.showToast(`${field.type === 'checkbox' ? 'Checkbox' : 'Radio'} "${field.label_he || field.id}" placed successfully`, 'success');

        this.mappingTargetField = null;

        if (this.interaction.mode === 'mapping') {
            this.interaction.mode = 'idle';
            this.interaction.targetFieldId = null;
            this.setStatus('מוכן', 'success');
            this.updateMappingBadge(null);
        }
    }

    // ============ DRAGGING ============
    // Delegated to DragEngine module

    startDrag(overlay, x, y) {
        this.DragEngine.startDrag(overlay, x, y, this);
    }

    // ⚡ Debounced wrapper for drag updates
    updateDrag(x, y) {
        console.log("⚡ Debounced: updateDrag");
        this.debouncedUpdateDrag(x, y);
    }

    // Internal immediate version - delegates to DragEngine
    _updateDragImmediate(x, y) {
        this.DragEngine.updateDragImmediate(x, y, this);
    }

    // ============ RESIZING ============
    // Delegated to DragEngine module

    startResize(handle, x, y) {
        this.DragEngine.startResize(handle, x, y, this);
    }

    // ⚡ Debounced wrapper for resize updates
    updateResize(x, y) {
        console.log("⚡ Debounced: updateResize");
        this.debouncedUpdateResize(x, y);
    }

    // Internal immediate version - delegates to DragEngine
    _updateResizeImmediate(x, y) {
        this.DragEngine.updateResizeImmediate(x, y, this);
    }

    updateFieldEditor() {
        if (!this.selectedField || this.expandedFieldId !== this.selectedField.id) return;
        this.updateFieldList();
    }

    // ============ FIELD ACTIONS ============

    handleFieldAction(target) {
        const overlay = target.closest('.field-overlay');
        if (!overlay) return;
        
        const fieldId = overlay.dataset.fieldId;
        
        if (target.closest('.delete-btn')) {
            this.removeField(fieldId);
        } else if (target.closest('.copy-btn')) {
            this.duplicateField(fieldId);
        } else if (target.closest('.remap-btn')) {
            this.remapField(fieldId);
        }
    }

    moveSelectedField(direction, shiftKey) {
        return this.Selection.moveSelectedField(direction, shiftKey, this);
    }

    updateMappingBadge(text) {
        // Delegate to UI module
        if (text) {
            this.UI.updateMappingBadge(text);
        } else {
            this.UI.hideMappingBadge();
        }
    }

    cancelMappingMode() {
        return this.Selection.cancelMappingMode(this);
    }

    // ============ STATUS AND NOTIFICATIONS ============

    setStatus(message, type = 'default') {
        // Delegate to UI module
        this.UI.setStatus(message, type);
    }

    showToast(message, type = 'info') {
        // Delegate to UI module
        this.UI.showToast(message, type);
    }

    // ============ LIVE TEXT FUNCTIONALITY ============

    updateLiveTextPanel() {
        const fieldTextList = document.getElementById('field-text-list');
        if (!fieldTextList) return;

        const mappedFields = this.fields.filter(f => f.isMapped && f.page === this.currentPage);
        
        if (mappedFields.length === 0) {
            fieldTextList.innerHTML = '<div class="empty-state-text">אין שדות ממופים בעמוד זה</div>';
            return;
        }

        fieldTextList.innerHTML = mappedFields.map(field => {
            const liveFill = this.liveFillData[field.id] || {};
            return `
                <div class="field-text-item" data-field-id="${field.id}" onclick="mapper.selectTextPreview('${field.id}')">
                    <label>${field.label_he} (${field.id}) - ${field.type}</label>
                    <input type="text" 
                           value="${liveFill.value || ''}" 
                           oninput="mapper.updateFieldText('${field.id}', this.value)"
                           onclick="event.stopPropagation(); mapper.selectTextPreview('${field.id}')"
                           placeholder="${this.Core.getPlaceholderForType(field.type)}">
                </div>
            `;
        }).join('');
    }

    updateFieldText(fieldId, text, shouldRerender = true) {
        return this.Editor.updateFieldText(fieldId, text, shouldRerender, this);
    }

    // ⚡ Debounced wrapper for text preview rendering
    renderTextPreview(field) {
        console.log("⚡ Debounced: renderTextPreview");
        this.debouncedRenderTextPreview(field);
    }

    // Internal immediate version
    _renderTextPreviewImmediate(field) {
        console.log('renderTextPreview called for field:', field.id, { isMapped: field.isMapped, page: field.page, currentPage: this.currentPage, appMode: this.appMode, liveTextEnabled: this.liveTextEnabled });

        if (!field.isMapped || field.page !== this.currentPage) {
            console.log('Field skipped - not mapped or wrong page:', field.id, { isMapped: field.isMapped, page: field.page, currentPage: this.currentPage });
            return;
        }

        // Remove existing preview
        const existingPreview = document.querySelector(`.field-text-preview[data-field-id="${field.id}"]`);
        if (existingPreview) existingPreview.remove();

        // Only render in Live Fill mode
        if (!this.liveTextEnabled || this.appMode !== 'livefill') {
            console.log('Field skipped - mode/text not enabled:', field.id, { liveTextEnabled: this.liveTextEnabled, appMode: this.appMode });
            return;
        }

        // NEW ARCHITECTURE: Render text on preview container in live fill mode
        const previewContainer = document.getElementById('preview-container');
        if (!previewContainer) {
            console.error('Preview container not found!');
            return;
        }
        
        // Make sure container is positioned relatively
        if (previewContainer.style.position !== 'relative') {
            previewContainer.style.position = 'relative';
        }

        const preview = document.createElement('div');
        preview.className = 'field-text-preview';
        preview.dataset.fieldId = field.id;
        
        // NEW ARCHITECTURE: Position based on PDF coordinates and current viewport
        if (!field.bbox || !this.liveFillViewport) return;
        
        // Convert percentages (bottom-left origin) to canvas pixels using live fill viewport
        const [xPercent, yPercent, wPercent, hPercent] = field.bbox;
        const viewportWidth = Math.max(this.liveFillViewport.width, 1);
        const viewportHeight = Math.max(this.liveFillViewport.height, 1);
        const rectWidth = wPercent * viewportWidth;
        const rectHeight = hPercent * viewportHeight;
        const rectX = xPercent * viewportWidth;
        const rectY = viewportHeight - (yPercent * viewportHeight) - rectHeight;
        const scaleX = Math.max(previewContainer.clientWidth || viewportWidth, 1) / viewportWidth;
        const scaleY = Math.max(previewContainer.clientHeight || viewportHeight, 1) / viewportHeight;
        const x = rectX * scaleX;
        const y = rectY * scaleY;
        const width = rectWidth * scaleX;
        const height = rectHeight * scaleY;
        
        preview.style.position = 'absolute';
        preview.style.left = x + 'px';
        preview.style.top = y + 'px';
        preview.style.width = width + 'px';
        preview.style.height = height + 'px';
        preview.style.cursor = 'pointer';
        
        // Enable direct editing in live fill mode
        preview.contentEditable = true;
        preview.spellcheck = false;
        preview.style.outline = 'none';

        // Get live fill data for this field
        const liveFill = this.liveFillData[field.id] || {};
        const liveFillStyle = liveFill.style || {};
        
        // Apply text styling (use field-specific settings or global)
        const settings = {
            fontFamily: liveFillStyle.fontFamily || this.textPreviewSettings.fontFamily,
            fontSize: liveFillStyle.fontSize || this.textPreviewSettings.fontSize,
            alignmentH: liveFillStyle.alignmentH || this.textPreviewSettings.alignmentH,
            alignmentV: liveFillStyle.alignmentV || this.textPreviewSettings.alignmentV,
            color: liveFillStyle.color || this.textPreviewSettings.color,
            opacity: liveFillStyle.opacity !== undefined ? liveFillStyle.opacity : this.textPreviewSettings.opacity,
            letterSpacing: liveFillStyle.letterSpacing !== undefined ? liveFillStyle.letterSpacing : this.textPreviewSettings.letterSpacing,
            wordSpacing: liveFillStyle.wordSpacing !== undefined ? liveFillStyle.wordSpacing : this.textPreviewSettings.wordSpacing
        };
        
        console.log('Rendering field', field.id, 'with settings:', JSON.stringify(settings, null, 2));
        
        // Apply ALL dynamic styles with !important to override CSS
        preview.style.setProperty('font-family', settings.fontFamily, 'important');
        preview.style.setProperty('font-size', settings.fontSize + 'px', 'important');
        preview.style.setProperty('color', settings.color, 'important');
        preview.style.setProperty('opacity', settings.opacity.toString(), 'important');
        preview.style.setProperty('text-align', settings.alignmentH, 'important');
        preview.style.setProperty('letter-spacing', settings.letterSpacing + 'px', 'important');
        preview.style.setProperty('word-spacing', settings.wordSpacing + 'px', 'important');
        preview.style.setProperty('line-height', height + 'px', 'important');
        
        // RTL/LTR based on field type
        if (['id_number', 'phone', 'number'].includes(field.type)) {
            preview.style.setProperty('direction', 'ltr', 'important');
        } else {
            preview.style.setProperty('direction', 'rtl', 'important');
        }
        
        // Get the actual value (declared here before use)
        const textContent = liveFill.value || '';
        
        // Apply custom spacing if needed
        if (settings.letterSpacing > 0 || settings.wordSpacing > 0) {
            // Use custom rendering for spacing
            this.renderTextWithCustomSpacing(preview, textContent, settings);
        } else {
            // Standard CSS rendering
            preview.style.letterSpacing = '0px';
            preview.style.wordSpacing = '0px';
        }

        // Vertical alignment
        if (settings.alignmentV === 'top') {
            preview.style.alignItems = 'flex-start';
        } else if (settings.alignmentV === 'bottom') {
            preview.style.alignItems = 'flex-end';
        } else {
            preview.style.alignItems = 'center';
        }

        // Handle different field types
        if (['id_number', 'phone', 'number'].includes(field.type) && textContent) {
            // For numbers - always left-to-right direction with digit-by-digit rendering
            preview.style.direction = 'ltr';
            preview.dataset.fieldType = field.type;
            this.renderCellBasedText(preview, textContent, width);
        } else {
            // For Hebrew text - right-to-left direction
            preview.style.direction = 'rtl';
            
            // Apply custom spacing or standard rendering
            if (settings.letterSpacing > 0 || settings.wordSpacing > 0) {
                this.renderTextWithCustomSpacing(preview, textContent, settings);
            } else {
                preview.textContent = textContent;
                // Make sure font size is applied
                preview.style.fontSize = settings.fontSize + 'px';
                preview.style.fontFamily = settings.fontFamily;
            }
        }

        // Add event listeners for direct editing
        preview.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.selectTextPreview(field.id);
        });
        
        // Add real-time text editing support
        preview.addEventListener('input', (e) => {
            const newText = e.target.textContent || e.target.innerText || '';
            this.liveFillData[field.id].value = newText;
            
            // Update the sidebar input field if it exists
            const sidebarInput = document.querySelector(`[data-field-id="${field.id}"] input`);
            if (sidebarInput) {
                sidebarInput.value = newText;
            }
            
            this.autoSave();
        });
        
        // Handle focus events for better UX
        preview.addEventListener('focus', (e) => {
            this.selectTextPreview(field.id);
            preview.style.border = '2px solid #667eea';
            preview.style.background = 'rgba(102, 126, 234, 0.1)';
        });
        
        preview.addEventListener('blur', (e) => {
            preview.style.border = '';
            preview.style.background = '';
        });
        
        // Add to preview container (positioned over PDF)
        previewContainer.appendChild(preview);
        console.log('Field preview added to container:', field.id, 'at position', { x, y, width, height });
        console.log('Preview element style:', {
            fontSize: preview.style.fontSize,
            color: preview.style.color,
            opacity: preview.style.opacity,
            position: preview.style.position,
            textContent: preview.textContent || preview.innerText || '(empty)'
        });
    }

    // ============ DIRECT INLINE EDITING ============
    
    startInlineEditing(field, previewElement) {
        console.log('Starting inline editing for field:', field.id, field);
        
        // Select this field in the sidebar
        this.selectTextPreview(field.id);
        
        // Check if we're already editing
        if (previewElement.querySelector('input')) {
            console.log('Already editing this field');
            return;
        }
        
        // Get current value
        const liveFill = this.liveFillData[field.id] || {};
        const currentValue = liveFill.value || '';
        
        // Create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        input.className = 'inline-edit-input';
        
        // Copy styling from preview element
        const computedStyle = window.getComputedStyle(previewElement);
        input.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: 2px solid #667eea;
            background: rgba(255, 255, 255, 0.95);
            font-family: ${computedStyle.fontFamily};
            font-size: ${computedStyle.fontSize};
            color: ${computedStyle.color};
            text-align: ${computedStyle.textAlign};
            direction: ${computedStyle.direction};
            padding: 2px;
            margin: 0;
            outline: none;
            border-radius: 3px;
            z-index: 20;
        `;
        
        // Add event listeners
        input.addEventListener('input', (e) => {
            this.updateFieldText(field.id, e.target.value, false); // Don't re-render while typing
        });
        
        input.addEventListener('blur', (e) => {
            this.finishInlineEditing(field, previewElement, e.target.value);
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                e.target.blur(); // This will trigger the blur event
            }
        });
        
        // Hide preview text and add input
        previewElement.style.color = 'transparent';
        previewElement.appendChild(input);
        
        // Focus and select text
        input.focus();
        input.select();
    }
    
    finishInlineEditing(field, previewElement, newValue) {
        // Remove input element
        const input = previewElement.querySelector('input');
        if (input) {
            input.remove();
        }
        
        // Show preview text again
        previewElement.style.color = '';
        
        // Update field with final value and re-render
        this.updateFieldText(field.id, newValue, true);
    }

    // Helper function to render text with custom letter and word spacing
    renderTextWithCustomSpacing(container, text, settings) {
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.alignItems = 'center';
        container.style.fontSize = settings.fontSize + 'px';
        
        if (!text) return;
        
        // Detect text direction - Hebrew is RTL
        const isRTL = /[\u0590-\u05FF]/.test(text);
        const direction = isRTL ? 'rtl' : 'ltr';
        container.style.direction = direction;
        
        const words = text.split(' ');
        
        // For RTL, reverse the order of words in the container
        const wordOrder = isRTL ? words.reverse() : words;
        
        wordOrder.forEach((word, wordIndex) => {
            // Create word container
            const wordSpan = document.createElement('span');
            wordSpan.style.display = 'inline-flex';
            wordSpan.style.direction = direction;
            
            // For RTL words, render characters in reverse order but maintain visual appearance
            const chars = isRTL ? word.split('').reverse() : word.split('');
            
            // Add characters with letter spacing
            chars.forEach((char, charIndex) => {
                const charSpan = document.createElement('span');
                charSpan.textContent = char;
                charSpan.style.fontSize = settings.fontSize + 'px';
                charSpan.style.fontFamily = settings.fontFamily;
                charSpan.style.color = settings.color;
                
                // Apply letter spacing based on direction
                if (charIndex < chars.length - 1 && settings.letterSpacing > 0) {
                    if (isRTL) {
                        charSpan.style.marginLeft = settings.letterSpacing + 'px';
                    } else {
                        charSpan.style.marginRight = settings.letterSpacing + 'px';
                    }
                }
                
                wordSpan.appendChild(charSpan);
            });
            
            container.appendChild(wordSpan);
            
            // Add word spacing
            if (wordIndex < wordOrder.length - 1) {
                const spaceSpan = document.createElement('span');
                spaceSpan.innerHTML = '&nbsp;';
                if (settings.wordSpacing > 0) {
                    if (isRTL) {
                        spaceSpan.style.marginLeft = settings.wordSpacing + 'px';
                    } else {
                        spaceSpan.style.marginRight = settings.wordSpacing + 'px';
                    }
                }
                container.appendChild(spaceSpan);
            }
        });
    }

    renderCellBasedText(container, text, totalWidth) {
        container.classList.add('cell-based');
        container.innerHTML = '';
        
        // Remove all non-digit characters and split into individual digits
        const chars = text.replace(/\D/g, '').split('');
        if (chars.length === 0) return;
        
        const cellWidth = totalWidth / chars.length;
        
        chars.forEach((char, index) => {
            const cell = document.createElement('div');
            cell.className = 'text-cell';
            cell.textContent = char;
            
            // Set precise dimensions and perfect centering
            cell.style.width = cellWidth + 'px';
            cell.style.height = '100%';
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.textAlign = 'center';
            cell.style.boxSizing = 'border-box';
            cell.style.fontFamily = 'inherit';
            cell.style.fontSize = 'inherit';
            cell.style.color = 'inherit';
            
            // Add subtle cell borders for ID/phone fields
            if (container.dataset.fieldType === 'id_number' || container.dataset.fieldType === 'phone') {
                cell.style.border = '1px solid rgba(0,0,0,0.2)';
                cell.style.background = 'rgba(255,255,255,0.8)';
            }
            
            container.appendChild(cell);
        });
    }

    // ⚡ Debounced wrapper for updating all text previews
    updateAllTextPreviews() {
        console.log("⚡ Debounced: updateAllTextPreviews");
        this.debouncedUpdateAllTextPreviews();
    }

    // Internal immediate version
    _updateAllTextPreviewsImmediate() {
        console.log('updateAllTextPreviews called. liveTextEnabled:', this.liveTextEnabled, 'appMode:', this.appMode);
        if (!this.liveTextEnabled || this.appMode !== 'livefill') return;

        // Clear existing text previews from preview container
        const previewContainer = document.getElementById('preview-container');
        console.log('previewContainer found:', !!previewContainer);
        if (previewContainer) {
            const existingPreviews = previewContainer.querySelectorAll('.field-text-preview');
            console.log('Removing', existingPreviews.length, 'existing previews');
            existingPreviews.forEach(preview => preview.remove());
        }

        let firstFieldId = null;
        this.fields.forEach(field => {
            if (field.isMapped && field.page === this.currentPage) {
                this._renderTextPreviewImmediate(field);  // Use immediate version
                if (!firstFieldId) firstFieldId = field.id;
            }
        });

        // Auto-select the first text preview if none is selected
        if (firstFieldId && !this.selectedTextPreview) {
            setTimeout(() => this.selectTextPreview(firstFieldId), 100);
        }
    }

    selectTextPreview(fieldId) {
        console.log('selectTextPreview called for field:', fieldId);
        
        // Deselect all
        document.querySelectorAll('.field-text-preview.selected').forEach(el => {
            el.classList.remove('selected');
        });
        document.querySelectorAll('.field-text-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        const preview = document.querySelector(`.field-text-preview[data-field-id="${fieldId}"]`);
        const textItem = document.querySelector(`.field-text-item[data-field-id="${fieldId}"]`);
        
        if (preview) {
            preview.classList.add('selected');
            this.selectedTextPreview = fieldId;
            
            if (textItem) {
                textItem.classList.add('selected');
            }
            
            const field = this.fields.find(f => f.id === fieldId);
            this.showToast(`נבחר: ${field?.label_he || fieldId}`, 'success');
            
            // Update selected field info display
            const selectedFieldInfo = document.getElementById('selected-field-info');
            const selectedFieldName = document.getElementById('selected-field-name');
            
            if (selectedFieldInfo && selectedFieldName && field) {
                selectedFieldName.textContent = `${field.label_he} (${field.id})`;
                selectedFieldInfo.style.display = 'block';
            }
            
            // Update UI controls to reflect selected field's settings
            this.updateUIControlsFromSelectedField(fieldId);
        }
    }

    updateUIControlsFromSelectedField(fieldId) {
        const liveFill = this.liveFillData[fieldId];
        if (!liveFill) return;
        
        const style = liveFill.style || {};
        
        // Update font family
        const fontFamilySelect = document.getElementById('text-font-family');
        if (fontFamilySelect && style.fontFamily) {
            fontFamilySelect.value = style.fontFamily;
        }
        
        // Update font size
        const fontSizeInput = document.getElementById('text-font-size');
        const fontSizeSlider = document.getElementById('text-font-size-slider');
        if (fontSizeInput && style.fontSize) {
            fontSizeInput.value = style.fontSize;
        }
        if (fontSizeSlider && style.fontSize) {
            fontSizeSlider.value = style.fontSize;
        }
        
        // Update color
        const colorPicker = document.getElementById('text-color');
        const colorHex = document.getElementById('text-color-hex');
        if (colorPicker && style.color) {
            colorPicker.value = style.color;
        }
        if (colorHex && style.color) {
            colorHex.value = style.color;
        }
        
        // Update opacity
        const opacitySlider = document.getElementById('text-opacity');
        const opacityValue = document.getElementById('text-opacity-value');
        if (opacitySlider && style.opacity !== undefined) {
            const opacityPercent = Math.round(style.opacity * 100);
            opacitySlider.value = opacityPercent;
            if (opacityValue) opacityValue.textContent = opacityPercent + '%';
        }
        
        // Update letter spacing
        const letterSpacingInput = document.getElementById('text-letter-spacing');
        const letterSpacingSlider = document.getElementById('text-letter-spacing-slider');
        if (letterSpacingInput && style.letterSpacing !== undefined) {
            letterSpacingInput.value = style.letterSpacing;
        }
        if (letterSpacingSlider && style.letterSpacing !== undefined) {
            letterSpacingSlider.value = style.letterSpacing;
        }
        
        // Update word spacing
        const wordSpacingInput = document.getElementById('text-word-spacing');
        const wordSpacingSlider = document.getElementById('text-word-spacing-slider');
        if (wordSpacingInput && style.wordSpacing !== undefined) {
            wordSpacingInput.value = style.wordSpacing;
        }
        if (wordSpacingSlider && style.wordSpacing !== undefined) {
            wordSpacingSlider.value = style.wordSpacing;
        }
        
        // Update alignment buttons
        this.updateAlignmentButtons(style);
    }

    updateAlignmentButtons(style) {
        // Reset all alignment buttons
        document.querySelectorAll('.alignment-buttons button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Set horizontal alignment
        if (style.alignmentH) {
            const hButton = document.querySelector(`button[onclick*="setTextAlignment('${style.alignmentH}')"]`);
            if (hButton) hButton.classList.add('active');
        }
        
        // Set vertical alignment
        if (style.alignmentV) {
            const vButton = document.querySelector(`button[onclick*="setTextAlignmentV('${style.alignmentV}')"]`);
            if (vButton) vButton.classList.add('active');
        }
    }
    
    // Apply real-time styling to preview element
    applyRealTimeStyleToPreview(fieldId) {
        return this.Editor.applyRealTimeStyleToPreview(fieldId, this);
    }

    startTextDrag(e, fieldId) {
        e.preventDefault();
        this.selectedTextPreview = fieldId;
        // Text dragging logic would go here
    }

    // UI Control functions
    updateTextPreview() {
        return this.Editor.updateTextPreview(this);
    }

    updateFontSizeFromSlider(value) {
        return this.Editor.updateFontSizeFromSlider(value, this);
    }

    // New direct apply function - applies all styles directly
    applyFontSizeDirectly(fontSize) {
        return this.Editor.applyFontSizeDirectly(fontSize, this);
    }

    setTextAlignment(alignment) {
        return this.Editor.setTextAlignment(alignment, this);
    }

    setTextAlignmentV(alignment) {
        return this.Editor.setTextAlignmentV(alignment, this);
    }

    updateTextOpacity(value) {
        return this.Editor.updateTextOpacity(value, this);
    }

    updateColorFromHex(value) {
        return this.Editor.updateColorFromHex(value, this);
    }

    nudgeText(dx, dy) {
        return this.Editor.nudgeText(dx, dy, this);
    }

    loadDummyData() {
        // ONLY works in Live Fill mode - not in Mapper mode
        if (this.appMode !== 'livefill' || !this.liveTextEnabled) {
            this.showToast('נתוני דמה זמינים רק במצב מילוי חי', 'warning');
            return;
        }
        
        const mappedFields = this.fields.filter(f => f.isMapped);
        mappedFields.forEach(field => {
            if (!this.liveFillData[field.id]) {
                this.liveFillData[field.id] = {
                    value: '',
                    style: {
                        fontFamily: this.textPreviewSettings.fontFamily,
                        fontSize: this.textPreviewSettings.fontSize,
                        alignmentH: this.textPreviewSettings.alignmentH,
                        alignmentV: this.textPreviewSettings.alignmentV,
                        color: this.textPreviewSettings.color,
                        opacity: this.textPreviewSettings.opacity,
                        letterSpacing: this.textPreviewSettings.letterSpacing,
                        wordSpacing: this.textPreviewSettings.wordSpacing
                    }
                };
            }
            // Store dummy data for Live Fill preview only (will not be exported)
            this.liveFillData[field.id].value = this.dummyDataTemplates[field.type] || 'דמי טקסט';
            this.liveFillData[field.id].isDummy = true; // Mark as dummy data
        });
        
        this.updateLiveTextPanel();
        this.updateAllTextPreviews();
        this.showToast('נתוני דמה נטענו למילוי חי (לתצוגה בלבד)', 'info');
    }

    clearAllTexts() {
        // Clear all live fill data
        Object.keys(this.liveFillData).forEach(fieldId => {
            if (this.liveFillData[fieldId]) {
                this.liveFillData[fieldId].value = '';
                this.liveFillData[fieldId].isDummy = false;
            }
        });
        
        this.updateLiveTextPanel();
        this.updateAllTextPreviews();
        this.showToast('כל הטקסטים נמחקו', 'success');
    }

    // ============ JSON EXPORT FUNCTIONS ============

    exportMapperJSON() {
        const mappedFields = this.fields.filter(f => f.isMapped && (f.bbox || f.anchor));

        if (mappedFields.length === 0) {
            this.showToast('אין שדות ממופים לייצוא', 'warning');
            return;
        }

        // Structure-only export with all required fields (includes both bbox and anchor fields)
        const mapperData = mappedFields.map(field => {
            const data = {
                fieldId: field.id,
                type: field.type || 'text',
                page: field.page || 1,
                defaultValue: field.defaultValue || '',
                required: field.required || false,
                tableGroupId: field.tableGroupId || null,
                // Radio Grouping Feature: Include radio group reference
                radioGroupId: field.groupId || null
            };

            // Checkbox/Radio: include anchor and overlay size
            if (field.anchor && Array.isArray(field.anchor)) {
                data.anchor = [...field.anchor]; // [xPct, yPct] in percentages
                data.overlayWidth = field.overlayWidth;
                data.overlayHeight = field.overlayHeight;
            }
            // Regular fields: include bbox
            else if (field.bbox) {
                data.bbox = [...field.bbox]; // [xPct, yPct, wPct, hPct] in percentages
                data.fontSize = field.fontSize || 11;
            }

            return data;
        });

        // Radio Grouping Feature: Create export object with fields and radioGroups
        // Include field coordinates in each option for fill engine compatibility
        const exportData = {
            fields: mapperData,
            radioGroups: (this.radioGroups || []).map(group => ({
                groupId: group.groupId,
                groupName: group.groupName,
                page: group.page,
                type: 'radio', // Required by fill engine
                options: (group.options || []).map(opt => {
                    // Find the field to get its coordinates
                    const field = this.fields.find(f => f.id === opt.fieldId);
                    const optionData = {
                        fieldId: opt.fieldId,
                        label: opt.label,
                        value: opt.value,
                        // Also include legacy naming for fill engine compatibility
                        hebrewLabel: opt.label,
                        englishId: opt.value
                    };

                    // Include coordinates from the field
                    if (field) {
                        if (field.anchor && Array.isArray(field.anchor)) {
                            optionData.anchor = [...field.anchor];
                            optionData.overlayWidth = field.overlayWidth;
                            optionData.overlayHeight = field.overlayHeight;
                        }
                        if (field.bbox && Array.isArray(field.bbox)) {
                            optionData.bbox = [...field.bbox];
                        }
                        if (typeof field.pdfX === 'number') {
                            optionData.pdfX = field.pdfX;
                            optionData.pdfY = field.pdfY;
                            optionData.pdfWidth = field.pdfWidth;
                            optionData.pdfHeight = field.pdfHeight;
                        }
                    }

                    return optionData;
                })
            }))
        };

        this.downloadJSON(exportData, `mapper-structure-${Date.now()}.json`);
        this.showToast(`ייצוא מיפוי: ${mappedFields.length} שדות, ${exportData.radioGroups.length} קבוצות רדיו`, 'success');
    }

    downloadJSON(data, filename) {
        // Delegate to UI module
        this.UI.downloadJSON(data, filename);
    }

    async loadMapperData() {
        return this.State.loadMapperData(this);
    }

    // New function to load mapping fields with bbox support
    async loadMappingFields(fieldsData) {
        return this.State.loadMappingFields(fieldsData, this);
    }

    // Update field counters in the UI
    updateFieldCounters() {
        // Calculate counters using SidebarEngine
        const counters = this.SidebarEngine.calculateFieldCounters(this.fields);

        // Delegate to UI module for DOM updates
        this.UI.updateFieldCounters(counters.total, counters.mapped, counters.unmapped, counters.tables);
    }

    async loadMapperStructure(mapperData) {
        // Clear existing fields
        this.clearAll();
        
        // Convert mapper structure to internal fields
        const fieldPromises = mapperData.map(async (item, index) => {
            if (!item.fieldId || item.x == null || item.y == null) return;
            
            const field = {
                id: item.fieldId,
                label_he: item.fieldId,
                label_en: item.fieldId,
                type: item.type || 'text',
                direction: 'rtl',
                fontSize: 14,
                letterSpacing: 0,
                wordSpacing: 0,
                lineHeight: 1.0,
                anchorH: 'start',
                anchorV: 'middle',
                padStart: 4,
                padEnd: 4,
                padTop: 2,
                padBottom: 2,
                page: this.currentPage,
                xPct: (item.x / this.baseDimensions.width) * 100,
                yPct: (item.y / this.baseDimensions.height) * 100,
                wPct: (item.width / this.baseDimensions.width) * 100,
                hPct: (item.height / this.baseDimensions.height) * 100,
                liveText: '',
                textSettings: {
                    fontFamily: 'David Libre',
                    fontSize: 14,
                    alignmentH: 'center',
                    alignmentV: 'middle',
                    color: '#000000',
                    opacity: 1.0,
                    letterSpacing: 0,
                    wordSpacing: 0
                },
                // Template fields load as unmapped - user must explicitly map them
                isMapped: false,
                element: null
            };

            // ✅ Normalize field before adding
            const normalizedField = normalizeField(field);
            if (!normalizedField) return;

            this.fields.push(normalizedField);

            // ============ UNIFIED FIELD REGISTRATION ============
            this._onFieldCreated(normalizedField);

            await this.renderField(normalizedField);
        });

        await Promise.all(fieldPromises);

        // Update UI
        this.updateFieldList();
        this.buildLiveFillOverlay();
        this.updateAllTextPreviews();
        this.saveState('load_mapper_data');
    }

    changeFontSize(delta) {
        const currentSize = this.selectedTextPreview && this.liveFillData[this.selectedTextPreview] 
            ? this.liveFillData[this.selectedTextPreview].style?.fontSize 
            : this.textPreviewSettings.fontSize;
            
        const newSize = Math.max(8, Math.min(72, currentSize + delta));
        
        this.textPreviewSettings.fontSize = newSize;
        
        // Update selected field's font size
        if (this.selectedTextPreview && this.liveFillData[this.selectedTextPreview]) {
            if (!this.liveFillData[this.selectedTextPreview].style) {
                this.liveFillData[this.selectedTextPreview].style = {};
            }
            this.liveFillData[this.selectedTextPreview].style.fontSize = newSize;
        }
        
        const fontSizeInput = document.getElementById('text-font-size');
        const fontSizeSlider = document.getElementById('text-font-size-slider');
        if (fontSizeInput) fontSizeInput.value = newSize;
        if (fontSizeSlider) fontSizeSlider.value = newSize;
        
        this.updateAllTextPreviews();
        
        // Apply real-time styling
        if (this.selectedTextPreview) {
            this.applyRealTimeStyleToPreview(this.selectedTextPreview);
        }
        
        this.showToast(`גודל גופן: ${newSize}pt`, 'info');
    }

    // Letter and Word Spacing Functions
    updateLetterSpacing(value) {
        return this.Editor.updateLetterSpacing(value, this);
    }

    updateLetterSpacingFromSlider(value) {
        return this.Editor.updateLetterSpacingFromSlider(value, this);
    }

    updateWordSpacing(value) {
        return this.Editor.updateWordSpacing(value, this);
    }

    updateWordSpacingFromSlider(value) {
        return this.Editor.updateWordSpacingFromSlider(value, this);
    }

    // NEW FUNCTION: Export Filled PDF using pdf-lib
    async exportFilledPDF() {
        if (!this.pdfArrayBuffer) {
            this.showToast('אין PDF טעון לייצוא', 'error');
            return;
        }

        try {
            this.setStatus('יוצר PDF ממולא...', 'info');

            // Load the original PDF
            const { PDFDocument, rgb, StandardFonts } = PDFLib;
            const pdfDoc = await PDFDocument.load(this.pdfArrayBuffer);
            
            // Get Hebrew font (or fallback to standard)
            let font;
            try {
                font = await pdfDoc.embedFont(StandardFonts.Arial); // Will work for Hebrew in most cases
            } catch (e) {
                font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            }

            // Process all mapped fields
            const filledFields = this.fields.filter(f => 
                f.isMapped && 
                f.bbox && 
                this.liveFillData[f.id] && 
                this.liveFillData[f.id].value
            );

            for (const field of filledFields) {
                const page = pdfDoc.getPages()[field.page - 1];
                const liveFill = this.liveFillData[field.id];
                
                // Get page dimensions for coordinate conversion
                const { width: pageWidth, height: pageHeight } = page.getSize();
                
                // Convert percentage-based bbox to PDF points
                const [xPercent, yPercent, wPercent, hPercent] = field.bbox;
                const x = xPercent * pageWidth;
                const width = wPercent * pageWidth;
                const height = hPercent * pageHeight;
                const bottom = yPercent * pageHeight;
                
                if (field.type === 'checkbox') {
                    // Render checkbox
                    if (liveFill.value === 'true' || liveFill.value === true) {
                        page.drawText('☑', {
                            x: x,
                            y: bottom,
                            size: Math.min(width, height) * 0.8,
                            font: font,
                            color: rgb(0, 0, 0),
                        });
                    }
                } else if (field.type === 'radio') {
                    // Render radio button
                    if (liveFill.value === 'true' || liveFill.value === true) {
                        page.drawText('⦿', {
                            x: x,
                            y: bottom,
                            size: Math.min(width, height) * 0.8,
                            font: font,
                            color: rgb(0, 0, 0),
                        });
                    }
                } else if (field.type === 'signature') {
                    // Render signature placeholder
                    page.drawText('חתימה ______', {
                        x: x,
                        y: bottom + height/2,
                        size: liveFill.style?.fontSize || 12,
                        font: font,
                        color: rgb(0, 0, 0),
                    });
                } else {
                    // Regular text field with full styling support
                    const fontSize = liveFill.style?.fontSize || this.textPreviewSettings.fontSize || 12;
                    const text = liveFill.value || '';
                    const color = liveFill.style?.color || this.textPreviewSettings.color || '#000000';
                    const alignmentH = liveFill.style?.alignmentH || this.textPreviewSettings.alignmentH || 'center';
                    const alignmentV = liveFill.style?.alignmentV || this.textPreviewSettings.alignmentV || 'middle';
                    const opacity = liveFill.style?.opacity !== undefined ? liveFill.style.opacity : (this.textPreviewSettings.opacity || 1.0);
                    
                    if (text) {
                        // Parse color (hex to RGB)
                        const hexColor = color.replace('#', '');
                        const r = parseInt(hexColor.substr(0, 2), 16) / 255;
                        const g = parseInt(hexColor.substr(2, 2), 16) / 255;
                        const b = parseInt(hexColor.substr(4, 2), 16) / 255;
                        
                        // Calculate text position based on alignment
                        let textX = x;
                        let textY = bottom + height/2;
                        
                        // Horizontal alignment
                        if (alignmentH === 'center') {
                            textX = x + width/2;
                        } else if (alignmentH === 'right') {
                            textX = x + width - 5; // Small padding from edge
                        } else if (alignmentH === 'left') {
                            textX = x + 5; // Small padding from edge
                        }
                        
                        // Vertical alignment
                        if (alignmentV === 'top') {
                            textY = bottom + height - fontSize/2;
                        } else if (alignmentV === 'bottom') {
                            textY = bottom + fontSize/2;
                        } else {
                            textY = bottom + height/2 + fontSize/4; // Middle with font adjustment
                        }
                        
                        // Handle RTL for Hebrew text
                        const isRTL = /[\u0590-\u05FF]/.test(text);
                        
                        // For RTL text and letter/word spacing, we need to render character by character
                        if ((liveFill.style?.letterSpacing > 0 || liveFill.style?.wordSpacing > 0) && (liveFill.style?.letterSpacing || liveFill.style?.wordSpacing)) {
                            this.drawTextWithCustomSpacing(page, text, {
                                x: textX,
                                y: textY,
                                fontSize,
                                color: rgb(r, g, b),
                                font,
                                width,
                                alignmentH,
                                letterSpacing: liveFill.style?.letterSpacing || 0,
                                wordSpacing: liveFill.style?.wordSpacing || 0,
                                isRTL
                            });
                        } else {
                            // Standard text rendering
                            page.drawText(text, {
                                x: textX,
                                y: textY,
                                size: fontSize,
                                font: font,
                                color: rgb(r * opacity, g * opacity, b * opacity),
                                maxWidth: width - 10, // Some padding
                            });
                        }
                    }
                }
            }

            // Generate PDF
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            // Download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `filled-form-${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.setStatus(`PDF ממולא יוצא בהצלחה`, 'success');
            this.showToast(`🎉 PDF ממולא נוצר עם ${filledFields.length} שדות`, 'success');
            
        } catch (error) {
            console.error('Export filled PDF error:', error);
            this.setStatus('שגיאה בייצוא PDF ממולא', 'error');
            this.showToast('שגיאה בייצוא PDF: ' + error.message, 'error');
        }
    }

    // Helper function to draw text with custom letter and word spacing in PDF
    drawTextWithCustomSpacing(page, text, options) {
        const { x, y, fontSize, color, font, width, alignmentH, letterSpacing, wordSpacing, isRTL } = options;
        
        if (!text) return;
        
        const words = text.split(' ');
        let currentX = x;
        let totalTextWidth = 0;
        
        // Calculate total text width for centering
        if (alignmentH === 'center') {
            words.forEach((word, wordIndex) => {
                for (let i = 0; i < word.length; i++) {
                    totalTextWidth += font.widthOfTextAtSize(word[i], fontSize);
                    if (i < word.length - 1) totalTextWidth += letterSpacing;
                }
                if (wordIndex < words.length - 1) {
                    totalTextWidth += font.widthOfTextAtSize(' ', fontSize) + wordSpacing;
                }
            });
            currentX = x - totalTextWidth / 2;
        } else if (alignmentH === 'right') {
            // Calculate total width and start from right
            words.forEach((word, wordIndex) => {
                for (let i = 0; i < word.length; i++) {
                    totalTextWidth += font.widthOfTextAtSize(word[i], fontSize);
                    if (i < word.length - 1) totalTextWidth += letterSpacing;
                }
                if (wordIndex < words.length - 1) {
                    totalTextWidth += font.widthOfTextAtSize(' ', fontSize) + wordSpacing;
                }
            });
            currentX = x - totalTextWidth;
        }
        
        // Draw each word with custom spacing
        words.forEach((word, wordIndex) => {
            // For RTL, reverse the characters in each word
            const chars = isRTL ? word.split('').reverse() : word.split('');
            
            chars.forEach((char, charIndex) => {
                page.drawText(char, {
                    x: currentX,
                    y: y,
                    size: fontSize,
                    font: font,
                    color: color,
                });
                
                // Move to next character position
                currentX += font.widthOfTextAtSize(char, fontSize);
                if (charIndex < chars.length - 1) {
                    currentX += letterSpacing;
                }
            });
            
            // Add space between words
            if (wordIndex < words.length - 1) {
                currentX += font.widthOfTextAtSize(' ', fontSize) + wordSpacing;
            }
        });
    }
}

// ============ INITIALIZATION ============

// Create global instance on DOM ready
let mapper;

window.addEventListener('DOMContentLoaded', () => {
    // ✅ VISUAL VERSION CHECK - Show banner on page
    const versionBanner = document.createElement('div');
    versionBanner.id = 'version-check-banner';
    versionBanner.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        color: white;
        padding: 30px 50px;
        border-radius: 15px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: Arial, sans-serif;
        text-align: center;
        font-size: 18px;
        font-weight: bold;
        direction: rtl;
    `;
    versionBanner.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
        <div style="font-size: 24px; margin-bottom: 10px;">תיקון Queuing</div>
        <div style="font-size: 16px; opacity: 0.9;">שדות מחכים לממדים ואז מצוירים</div>
        <div style="font-size: 14px; margin-top: 15px; opacity: 0.8;">ללא alerts מעצבנים!</div>
        <div style="margin-top: 20px; font-size: 12px; opacity: 0.7;">הבאנר הזה ייעלם אחרי 5 שניות</div>
    `;
    document.body.appendChild(versionBanner);

    // Remove banner after 5 seconds
    setTimeout(() => {
        versionBanner.style.transition = 'opacity 0.5s';
        versionBanner.style.opacity = '0';
        setTimeout(() => versionBanner.remove(), 500);
    }, 5000);

    mapper = new FieldMapper();
    window.mapper = mapper; // Make accessible globally for HTML onclick handlers
    console.log('Field Mapper Pro v2.0 initialized successfully');
    console.log('🎯 OVERLAY FIX VERSION: 20251201-fix2');

    // ============ VISUAL TEST ENGINE INITIALIZATION ============
    // Initialize visual testing system in Soft Mode (non-blocking)
    // This provides runtime QA checks for overlay positioning and mode consistency
    setTimeout(() => {
        if (window.VisualTestRunner && window.VisualTestEngine && window.VisualTestReport) {
            // Initialize runner with mapper instance
            window.VisualTestRunner.init(mapper);

            // Initialize report UI
            window.VisualTestReport.init();

            // Start automatic testing (in soft mode)
            window.VisualTestRunner.start();

            console.log('🧪 Visual Test Engine initialized (Soft Mode)');
        } else {
            console.log('🧪 Visual Test Engine not loaded (optional)');
        }
    }, 500);
});