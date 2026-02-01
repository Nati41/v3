/**
 * ReverseMappingMode.js
 * Main controller for Reverse Mapping experimental mode
 *
 * In this mode:
 * - User draws physical elements only (no semantic logic)
 * - Each element gets a [number | type] overlay
 * - AI identifies labels and canonicals from the visual layout
 *
 * COMPLETELY ISOLATED from existing Guided Mapping flows
 */
import { eventBus, Events } from '../core/EventBus.js';
import { state, Tools, Modes, FlowModes } from '../core/StateManager.js';
import { overlayRenderer } from '../engines/OverlayRenderer.js';
import { ReverseMappingOverlay } from './ReverseMappingOverlay.js';
import { ReverseMappingPanel } from './ReverseMappingPanel.js';
import { ReverseMappingAI } from './ReverseMappingAI.js';

// Element types for reverse mapping
export const ReverseTypes = {
    FIELD: 'F',      // Text field
    CHECKBOX: 'C',   // Checkbox
    RADIO: 'R',      // Radio button
    TABLE: 'T',      // Table cell
    SIGNATURE: 'S'   // Signature area
};

// Tool to type mapping
const TOOL_TO_TYPE = {
    [Tools.DRAW_TEXT]: ReverseTypes.FIELD,
    [Tools.DRAW_CHECKBOX]: ReverseTypes.CHECKBOX,
    [Tools.DRAW_RADIO]: ReverseTypes.RADIO,
    [Tools.DRAW_CIRCLE]: ReverseTypes.RADIO,  // Circles are also radio
    [Tools.DRAW_TABLE]: ReverseTypes.TABLE,
    [Tools.DRAW_CELL]: ReverseTypes.TABLE,
    [Tools.DRAW_SIGNATURE]: ReverseTypes.SIGNATURE
};

class ReverseMappingModeController {
    constructor() {
        this.active = false;
        this.elements = [];  // {id, number, type, bbox, page}
        this.nextNumber = 1;
        this.overlay = null;
        this.panel = null;
        this.ai = null;
        this.aiResults = null;  // Results from AI identification

        // Store original UI state to restore later
        this.originalUIState = null;

        // PDF render readiness tracking
        this._pdfReady = false;
    }

    /**
     * Initialize the controller
     */
    init() {
        this.overlay = new ReverseMappingOverlay();
        this.panel = new ReverseMappingPanel();
        this.ai = new ReverseMappingAI();

        // Listen for draw completions
        this._bindEvents();

        console.log('[ReverseMappingMode] Initialized');
    }

    /**
     * Activate reverse mapping mode
     * Blocked in QuickFill and mobile contexts
     */
    activate() {
        if (this.active) return;

        // Guard: block in QuickFill / mobile modes
        if (this._isBlockedContext()) {
            console.warn('[ReverseMappingMode] Blocked – not available in QuickFill/mobile mode');
            return;
        }

        console.log('[ReverseMappingMode] Activating...');
        this.active = true;

        // Save current UI state
        this._saveUIState();

        // Hide all existing panels and workflows
        this._hideExistingUI();

        // Show reverse mapping tools in sidebar
        this._showReverseToolbar();

        // Initialize overlay
        this.overlay.init();

        // Reset elements
        this.elements = [];
        this.nextNumber = 1;
        this.aiResults = null;
        this._processedFieldIds = new Set();

        // Emit activation event
        eventBus.emit('REVERSE_MAPPING_ACTIVATED');

        console.log('[ReverseMappingMode] Active');
    }

    /**
     * Deactivate reverse mapping mode
     */
    deactivate() {
        if (!this.active) return;

        console.log('[ReverseMappingMode] Deactivating...');
        this.active = false;

        // Hide reverse mapping UI
        this._hideReverseToolbar();

        // Destroy badge overlay
        this.overlay.destroy();

        // Remove all field overlays
        for (const element of this.elements) {
            if (element.overlayElement) {
                element.overlayElement.remove();
            }
        }

        // Close panel if open
        this.panel.close();

        // Restore original UI
        this._restoreUIState();

        // Clear elements
        this.elements = [];
        this.aiResults = null;

        // Emit deactivation event
        eventBus.emit('REVERSE_MAPPING_DEACTIVATED');

        console.log('[ReverseMappingMode] Deactivated');
    }

    /**
     * Toggle reverse mapping mode
     */
    toggle() {
        if (this.active) {
            this.deactivate();
        } else {
            this.activate();
        }
        return this.active;
    }

    /**
     * Add an element from drawing
     * @param {Object} bbox - Bounding box {x, y, width, height} in screen coordinates
     * @param {string} tool - The tool used (from Tools enum)
     * @param {number} page - Page number
     */
    addElement(bbox, tool, page = 1) {
        if (!this.active) return null;

        const type = TOOL_TO_TYPE[tool];
        if (!type) {
            console.warn('[ReverseMappingMode] Unknown tool type:', tool);
            return null;
        }

        const element = {
            id: `rev_${Date.now()}_${this.nextNumber}`,
            number: this.nextNumber,
            type: type,
            bbox: { ...bbox },  // Raw screen coordinates
            page: page,
            overlayElement: null,  // Will be set by _drawFieldOverlay
            // These will be filled by AI
            label: null,
            canonical: null,
            radioGroup: null,  // For R type
            table: null,       // For T type
            column: null       // For T type
        };

        this.elements.push(element);
        this.nextNumber++;

        // Update overlay
        this.overlay.addBadge(element);

        console.log(`[ReverseMappingMode] Added element #${element.number} [${element.type}]`);

        return element;
    }

    /**
     * Remove an element
     * @param {string} elementId - Element ID
     */
    removeElement(elementId) {
        const index = this.elements.findIndex(e => e.id === elementId);
        if (index === -1) return false;

        const element = this.elements[index];
        this.elements.splice(index, 1);

        // Remove the badge
        this.overlay.removeBadge(element.id);

        // Remove the field overlay
        if (element.overlayElement) {
            element.overlayElement.remove();
        }

        // Update element count
        this.updateElementCount();

        console.log(`[ReverseMappingMode] Removed element #${element.number}`);

        return true;
    }

    /**
     * Get all elements
     */
    getElements() {
        return [...this.elements];
    }

    /**
     * Get element by number
     */
    getElementByNumber(number) {
        return this.elements.find(e => e.number === number);
    }

    /**
     * Trigger AI identification
     * Includes ready-gate: checks PDF loaded, overlay ready, elements exist
     */
    async identifyFields() {
        if (this.elements.length === 0) {
            console.warn('[ReverseMappingMode] No elements to identify');
            this._showToast('אין אלמנטים לזיהוי – סמן שדות על הטופס תחילה');
            return null;
        }

        // Ready-gate: verify PDF surface is available
        if (!this._isPdfReady()) {
            console.warn('[ReverseMappingMode] PDF not ready for capture');
            this._showToast('ה-PDF עדיין לא נטען – נסה שוב בעוד רגע');
            return null;
        }

        console.log('[ReverseMappingMode] Starting AI identification...');

        try {
            // Capture page with badges (returns {ok, data?, reason?})
            const captureResult = await this.overlay.captureWithBadges();

            if (!captureResult.ok) {
                console.warn('[ReverseMappingMode] Capture failed:', captureResult.reason);
                this._showToast('לא ניתן לצלם את העמוד – ודא שה-PDF נטען');
                return null;
            }

            // Send to AI
            this.aiResults = await this.ai.identifyFields(captureResult.data, this.elements);

            // Merge AI results with elements
            this._mergeAIResults();

            // Open validation panel
            this.panel.open(this.elements, this.aiResults);

            console.log('[ReverseMappingMode] AI identification complete');

            return this.aiResults;
        } catch (error) {
            console.error('[ReverseMappingMode] AI identification failed:', error);
            this._showToast('זיהוי AI נכשל – נסה שוב');
            return null;  // Never throw uncaught
        }
    }

    /**
     * Check if the PDF surface is ready for capture
     */
    _isPdfReady() {
        const pdfContainer = document.getElementById('pdf-container');
        if (!pdfContainer) return false;

        const img = pdfContainer.querySelector('img');
        if (!img) return false;

        // Image must be loaded (naturalWidth > 0)
        if (!img.naturalWidth || !img.naturalHeight) return false;

        // Overlay layer must have non-zero dimensions
        const overlayLayer = document.getElementById('overlay-layer');
        if (overlayLayer && (overlayLayer.offsetWidth === 0 || overlayLayer.offsetHeight === 0)) {
            return false;
        }

        return true;
    }

    /**
     * Show a toast notification to the user
     */
    _showToast(message) {
        // Use existing toast system if available
        if (typeof window.showToast === 'function') {
            window.showToast(message);
            return;
        }

        // Fallback: create a simple toast element
        const existing = document.getElementById('reverse-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'reverse-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #1e293b; color: #f1f5f9; padding: 12px 24px;
            border-radius: 8px; font-size: 14px; z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); direction: rtl;
            animation: fadeIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    /**
     * Merge AI results with elements
     */
    _mergeAIResults() {
        if (!this.aiResults) return;

        for (const element of this.elements) {
            const result = this.aiResults[String(element.number)];
            if (result) {
                element.label = result.label || null;
                element.canonical = result.canonical || null;
                element.radioGroup = result.radio_group || null;
                element.table = result.table || null;
                element.column = result.column || null;
            }
        }
    }

    /**
     * Apply confirmed results and generate mapping
     * @param {Object} confirmedData - Data from panel after user confirmation
     */
    applyAndGenerateMapping(confirmedData) {
        console.log('[ReverseMappingMode] Generating final mapping...');

        const mapping = this._generateMapping(confirmedData);

        // Emit event with final mapping
        eventBus.emit('REVERSE_MAPPING_COMPLETE', { mapping });

        return mapping;
    }

    /**
     * Generate final mapping from confirmed data
     */
    _generateMapping(confirmedData) {
        const fields = [];
        const radioGroups = {};
        const tables = {};

        for (const element of this.elements) {
            const confirmed = confirmedData.elements[element.number] || element;

            // Create field based on type
            // Convert bbox from screen pixels to normalized [0,1] array using overlayRenderer
            const normalizedBbox = element.bbox ?
                overlayRenderer.screenToBbox(element.bbox) : null;

            const field = {
                id: `field_${element.number}_${Date.now()}`,
                type: this._typeToFieldType(element.type),
                bbox: normalizedBbox,
                page: element.page,
                label_he: confirmed.label || `שדה ${element.number}`,
                canonical: confirmed.canonical || `field_${element.number}`,
                isMapped: normalizedBbox !== null
            };

            // Handle radio groups
            if (element.type === ReverseTypes.RADIO && confirmed.radioGroup) {
                if (!radioGroups[confirmed.radioGroup]) {
                    radioGroups[confirmed.radioGroup] = {
                        name: confirmed.radioGroup,
                        options: []
                    };
                }
                radioGroups[confirmed.radioGroup].options.push(field.id);
                field.radioGroup = confirmed.radioGroup;
            }

            // Handle tables
            if (element.type === ReverseTypes.TABLE && confirmed.table) {
                if (!tables[confirmed.table]) {
                    tables[confirmed.table] = {
                        name: confirmed.table,
                        columns: [],
                        rowCount: confirmedData.tableRowCounts?.[confirmed.table] || 1
                    };
                }

                // Add column definition
                const columnDef = {
                    fieldId: field.id,
                    column: confirmed.column || tables[confirmed.table].columns.length + 1,
                    canonical: confirmed.canonical
                };
                tables[confirmed.table].columns.push(columnDef);

                field.table = confirmed.table;
                field.column = columnDef.column;
            }

            fields.push(field);
        }

        // Duplicate table rows if needed
        const expandedFields = this._expandTableRows(fields, tables);

        return {
            version: '3.0',
            mode: 'reverse_mapping',
            generatedAt: new Date().toISOString(),
            fields: expandedFields,
            radioGroups: Object.values(radioGroups),
            tables: Object.values(tables)
        };
    }

    /**
     * Convert reverse type to field type
     */
    _typeToFieldType(reverseType) {
        const typeMap = {
            [ReverseTypes.FIELD]: 'text',
            [ReverseTypes.CHECKBOX]: 'checkbox',
            [ReverseTypes.RADIO]: 'radio',
            [ReverseTypes.TABLE]: 'text',  // Table cells are text fields
            [ReverseTypes.SIGNATURE]: 'signature'
        };
        return typeMap[reverseType] || 'text';
    }

    /**
     * Convert field type back to tool type
     */
    _fieldTypeToTool(fieldType) {
        const typeMap = {
            'text': Tools.DRAW_TEXT,
            'checkbox': Tools.DRAW_CHECKBOX,
            'radio': Tools.DRAW_RADIO,
            'table': Tools.DRAW_TABLE,
            'cell': Tools.DRAW_CELL,
            'signature': Tools.DRAW_SIGNATURE
        };
        return typeMap[fieldType] || Tools.DRAW_TEXT;
    }

    /**
     * Draw a field overlay rectangle (since we don't create real fields)
     */
    _drawFieldOverlay(bbox, element) {
        const overlayLayer = document.querySelector('#overlay-layer');
        if (!overlayLayer) return;

        // Create overlay element
        const overlay = document.createElement('div');
        overlay.className = 'reverse-field-overlay';
        overlay.dataset.elementId = element.id;
        overlay.dataset.elementNumber = element.number;

        // Position and size
        overlay.style.cssText = `
            position: absolute;
            left: ${bbox.x}px;
            top: ${bbox.y}px;
            width: ${bbox.width}px;
            height: ${bbox.height}px;
            border: 2px solid #7c3aed;
            background: rgba(124, 58, 237, 0.1);
            pointer-events: auto;
            cursor: pointer;
            z-index: 5;
        `;

        // Right-click to delete
        overlay.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.removeElement(element.id);
            overlay.remove();
        });

        overlayLayer.appendChild(overlay);

        // Store reference to overlay for later removal
        element.overlayElement = overlay;
    }

    /**
     * Convert field to screen bbox - handles both bbox and anchor formats
     */
    _convertFieldToScreenBbox(field) {
        const overlayLayer = document.querySelector('#overlay-layer');
        if (!overlayLayer) {
            return { x: 0, y: 0, width: 100, height: 30 };
        }

        const layerWidth = overlayLayer.offsetWidth;
        const layerHeight = overlayLayer.offsetHeight;

        // Handle anchor format (checkbox/radio/circle)
        if (field.anchor && Array.isArray(field.anchor)) {
            const [anchorX, anchorY] = field.anchor;
            const CHECKBOX_SIZE = 18;
            const RADIO_SIZE = 18;
            const size = field.type === 'checkbox' ? CHECKBOX_SIZE :
                        (field.type === 'radio' ? RADIO_SIZE :
                        (field.overlayWidth || 20));

            // anchor Y is stored as "from bottom" (already Y-flipped)
            const centerX = anchorX * layerWidth;
            const centerY = (1 - anchorY) * layerHeight;

            return {
                x: Math.round(centerX - size / 2),
                y: Math.round(centerY - size / 2),
                width: Math.round(field.overlayWidth || size),
                height: Math.round(field.overlayHeight || size)
            };
        }

        // Handle bbox format
        if (field.bbox) {
            return this._convertBbox(field.bbox);
        }

        return { x: 0, y: 0, width: 100, height: 30 };
    }

    /**
     * Convert bbox from normalized format to pixel coordinates
     * Field bbox format: [x_norm, y_norm, width_norm, height_norm] (0-1 range)
     * NOTE: PDF Y coordinate is from BOTTOM, screen Y is from TOP - must flip!
     */
    _convertBbox(fieldBbox) {
        // Get dimensions from overlay layer (same as where fields are rendered)
        const overlayLayer = document.querySelector('#overlay-layer') ||
                            document.querySelector('.overlay-layer') ||
                            document.querySelector('#pdf-container');

        if (!overlayLayer) {
            console.warn('[ReverseMappingMode] Overlay layer not found for bbox conversion');
            return { x: 0, y: 0, width: 100, height: 30 };
        }

        const layerWidth = overlayLayer.offsetWidth;
        const layerHeight = overlayLayer.offsetHeight;

        // Handle both array-like [0,1,2,3] and named {x,y,width,height} formats
        let x_norm, y_norm, w_norm, h_norm;

        if (Array.isArray(fieldBbox) || typeof fieldBbox[0] === 'number') {
            // Array-like format (normalized 0-1)
            x_norm = fieldBbox[0];
            y_norm = fieldBbox[1];
            w_norm = fieldBbox[2];
            h_norm = fieldBbox[3];
        } else if (typeof fieldBbox.x === 'number') {
            // Check if values are > 1 (pixels) or <= 1 (normalized)
            if (fieldBbox.x > 1 || fieldBbox.y > 1) {
                // Already in pixels
                return fieldBbox;
            }
            x_norm = fieldBbox.x;
            y_norm = fieldBbox.y;
            w_norm = fieldBbox.width;
            h_norm = fieldBbox.height;
        } else {
            console.warn('[ReverseMappingMode] Unknown bbox format:', fieldBbox);
            return { x: 0, y: 0, width: 100, height: 30 };
        }

        // Convert from normalized (0-1) to pixels
        // IMPORTANT: Y-axis flip! PDF Y is from bottom, screen Y is from top
        // Formula: y_screen = (1 - y_norm - h_norm) * layerHeight
        const x = Math.round(x_norm * layerWidth);
        const y = Math.round((1 - y_norm - h_norm) * layerHeight);
        const width = Math.round(w_norm * layerWidth);
        const height = Math.round(h_norm * layerHeight);

        return { x, y, width, height };
    }

    /**
     * Expand table rows based on row count
     */
    _expandTableRows(fields, tables) {
        const expanded = [];

        for (const field of fields) {
            if (field.table && tables[field.table]) {
                const tableInfo = tables[field.table];
                const rowCount = tableInfo.rowCount || 1;

                // Find other cells in the same table to calculate offsetY
                const tableCells = fields.filter(f => f.table === field.table);
                const offsetY = this._calculateRowOffset(tableCells);

                // Generate rows
                for (let row = 0; row < rowCount; row++) {
                    // field.bbox is already an array [x, y, w, h] from _generateMapping
                    const newBbox = field.bbox ? [
                        field.bbox[0],                    // x
                        field.bbox[1] + (offsetY * row),  // y with row offset
                        field.bbox[2],                    // width
                        field.bbox[3]                     // height
                    ] : null;

                    const rowField = {
                        ...field,
                        id: `${field.id}_row${row}`,
                        canonical: `${field.table}.${field.canonical}[${row}]`,
                        bbox: newBbox,
                        tableRow: row
                    };
                    expanded.push(rowField);
                }
            } else {
                expanded.push(field);
            }
        }

        return expanded;
    }

    /**
     * Calculate row offset for table expansion
     * @param {Array} tableCells - Fields with bbox as [x, y, w, h] normalized array
     */
    _calculateRowOffset(tableCells) {
        if (tableCells.length < 2) {
            return 0.03; // Default row height in normalized coords (approx 25px on typical page)
        }

        // Sort by Y position (bbox[1] is y in array format)
        const sorted = [...tableCells].sort((a, b) => (a.bbox?.[1] || 0) - (b.bbox?.[1] || 0));

        // Find minimum gap between rows (if user marked multiple rows)
        let minGap = 0.03;
        for (let i = 1; i < sorted.length; i++) {
            const gap = (sorted[i].bbox?.[1] || 0) - (sorted[i - 1].bbox?.[1] || 0);
            if (gap > 0.005) {  // Ignore very small gaps (normalized)
                minGap = Math.min(minGap, gap);
            }
        }

        return minGap;
    }

    /**
     * Bind event listeners
     */
    _bindEvents() {
        // Listen for raw draw completions from DrawController (bypasses field creation)
        eventBus.on('REVERSE_DRAW_COMPLETE', (data) => {
            if (!this.active) return;

            const { bbox, tool, page } = data;
            console.log('[ReverseMappingMode] REVERSE_DRAW_COMPLETE - raw bbox:', bbox, 'tool:', tool);

            if (bbox && tool) {
                // Add element with raw screen coordinates - no conversion needed!
                const element = this.addElement(bbox, tool, page);
                this.updateElementCount();

                // Draw the rectangle overlay ourselves (since no field was created)
                this._drawFieldOverlay(bbox, element);

                console.log('[ReverseMappingMode] Created element #' + element?.number, 'at', bbox);
            }
        });

        // Listen for element deletion (right-click or delete key)
        eventBus.on('REVERSE_ELEMENT_DELETE', (data) => {
            if (!this.active) return;
            this.removeElement(data.elementId);
        });

        // Listen for panel confirmation
        eventBus.on('REVERSE_MAPPING_CONFIRMED', (data) => {
            this.applyAndGenerateMapping(data);
        });

        // Track PDF render completion → enable/disable identify button
        eventBus.on(Events.PDF_PAGE_CHANGED, () => {
            this._pdfReady = true;
            this._setIdentifyButtonEnabled(true);
            console.log('[ReverseMappingMode] PDF page rendered → ready for capture');
        });

        // On new PDF load, reset readiness until render completes
        eventBus.on(Events.PDF_LOADED, () => {
            this._pdfReady = false;
            this._setIdentifyButtonEnabled(false);
            console.log('[ReverseMappingMode] New PDF loading → capture disabled');
        });
    }

    /**
     * Enable or disable the "identify fields" button
     */
    _setIdentifyButtonEnabled(enabled) {
        const btn = document.getElementById('reverse-identify-btn');
        if (!btn) return;
        btn.disabled = !enabled;
        btn.style.opacity = enabled ? '1' : '0.5';
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    /**
     * Check if current context blocks reverse mapping
     * (QuickFill public mode, mobile fill, or non-mapper contexts)
     */
    _isBlockedContext() {
        // QuickFill public page
        if (document.body.classList.contains('quickfill-public-mode')) return true;

        // StateManager QuickFill mode
        if (state.isQuickFillMode && state.isQuickFillMode()) return true;

        // Mobile fill page
        if (document.body.classList.contains('mobile-fill-mode')) return true;

        return false;
    }

    /**
     * Save current UI state
     */
    _saveUIState() {
        this.originalUIState = {
            sidebarVisible: document.querySelector('#sidebar-container')?.classList.contains('is-hidden'),
            toolbarState: document.querySelector('.mapper-toolbar')?.innerHTML
        };
    }

    /**
     * Restore original UI state
     */
    _restoreUIState() {
        // Remove reverse toolbar if exists
        const reverseToolbar = document.getElementById('reverse-mapping-toolbar');
        if (reverseToolbar) {
            reverseToolbar.remove();
        }

        // Restore hidden panels
        document.querySelectorAll('.reverse-mode-hidden').forEach(el => {
            el.classList.remove('reverse-mode-hidden');
        });
    }

    /**
     * Hide existing UI elements
     * NOTE: We do NOT hide the sidebar to prevent layout changes that break coordinates
     */
    _hideExistingUI() {
        // DON'T hide sidebar - it would change the layout and break coordinate calculations
        // const sidebar = document.querySelector('#sidebar-container');
        // if (sidebar) {
        //     sidebar.classList.add('reverse-mode-hidden');
        // }

        // Hide guided mapping panel (this is a floating panel, won't affect layout)
        const guidedPanel = document.querySelector('.guided-mapping-panel');
        if (guidedPanel) {
            guidedPanel.classList.add('reverse-mode-hidden');
        }

        // Hide field intelligence panel (floating panel)
        const fiPanel = document.querySelector('.field-intelligence-panel');
        if (fiPanel) {
            fiPanel.classList.add('reverse-mode-hidden');
        }
    }

    /**
     * Show reverse mapping sidebar panel
     * Replaces the sidebar content with reverse mapping tools
     */
    _showReverseToolbar() {
        // Check if already exists
        if (document.getElementById('reverse-sidebar-panel')) return;

        const sidebar = document.querySelector('#sidebar-container');
        if (!sidebar) {
            console.warn('[ReverseMappingMode] Sidebar not found');
            return;
        }

        // Hide existing sidebar content
        const sidebarHeader = sidebar.querySelector('.sidebar-header');
        const fieldList = sidebar.querySelector('#field-list');
        if (sidebarHeader) sidebarHeader.classList.add('reverse-mode-hidden');
        if (fieldList) fieldList.classList.add('reverse-mode-hidden');

        // Create reverse mapping panel
        const panel = document.createElement('div');
        panel.id = 'reverse-sidebar-panel';
        panel.className = 'reverse-sidebar-panel';
        panel.innerHTML = `
            <div class="reverse-sidebar-header">
                <span class="reverse-badge-icon">🧪</span>
                <span class="reverse-title">מצב ניסיוני</span>
            </div>

            <div class="reverse-sidebar-section">
                <div class="section-title">כלי ציור</div>
                <div class="reverse-tools-grid">
                    <button class="reverse-tool-btn" data-tool="draw_text" title="שדה טקסט">
                        <span class="tool-icon">📝</span>
                        <span class="tool-label">שדה</span>
                        <span class="tool-badge">F</span>
                    </button>
                    <button class="reverse-tool-btn" data-tool="draw_checkbox" title="Checkbox">
                        <span class="tool-icon">☑️</span>
                        <span class="tool-label">צ'קבוקס</span>
                        <span class="tool-badge">C</span>
                    </button>
                    <button class="reverse-tool-btn" data-tool="draw_radio" title="Radio">
                        <span class="tool-icon">🔘</span>
                        <span class="tool-label">רדיו</span>
                        <span class="tool-badge">R</span>
                    </button>
                    <button class="reverse-tool-btn" data-tool="draw_cell" title="Table Cell">
                        <span class="tool-icon">▦</span>
                        <span class="tool-label">טבלה</span>
                        <span class="tool-badge">T</span>
                    </button>
                    <button class="reverse-tool-btn" data-tool="draw_signature" title="Signature">
                        <span class="tool-icon">✍️</span>
                        <span class="tool-label">חתימה</span>
                        <span class="tool-badge">S</span>
                    </button>
                </div>
            </div>

            <div class="reverse-sidebar-section">
                <div class="section-title">סטטוס</div>
                <div class="reverse-status-box">
                    <span class="element-count">0</span>
                    <span class="status-label">אלמנטים סומנו</span>
                </div>
            </div>

            <div class="reverse-sidebar-section">
                <div class="section-title">פעולות</div>
                <div class="reverse-actions">
                    <button class="reverse-action-btn identify" id="reverse-identify-btn">
                        <span class="btn-icon">🧠</span>
                        <span>זהה שדות</span>
                    </button>
                    <button class="reverse-action-btn exit" id="reverse-exit-btn">
                        <span class="btn-icon">✕</span>
                        <span>יציאה</span>
                    </button>
                </div>
            </div>

            <div class="reverse-sidebar-section reverse-help">
                <div class="section-title">עזרה</div>
                <ul class="help-list">
                    <li>בחר כלי וסמן על ה-PDF</li>
                    <li>קליק ימני למחיקה</li>
                    <li>לחץ "זהה שדות" לסיום</li>
                </ul>
            </div>
        `;

        sidebar.appendChild(panel);

        // Bind toolbar events
        this._bindToolbarEvents(panel);

        // Set initial identify button state based on PDF readiness
        this._setIdentifyButtonEnabled(this._isPdfReady());

        console.log('[ReverseMappingMode] Sidebar panel created');
    }

    /**
     * Hide reverse mapping sidebar panel and restore original sidebar
     */
    _hideReverseToolbar() {
        // Remove reverse sidebar panel
        const panel = document.getElementById('reverse-sidebar-panel');
        if (panel) {
            panel.remove();
        }

        // Also remove old-style toolbar if exists
        const toolbar = document.getElementById('reverse-mapping-toolbar');
        if (toolbar) {
            toolbar.remove();
        }

        // Restore hidden elements (sidebar header, field list, etc.)
        document.querySelectorAll('.reverse-mode-hidden').forEach(el => {
            el.classList.remove('reverse-mode-hidden');
        });
    }

    /**
     * Bind toolbar button events
     */
    _bindToolbarEvents(toolbar) {
        // Tool buttons
        toolbar.querySelectorAll('.reverse-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                state.setTool(tool);
                state.setMode(Modes.DRAW);  // Enter draw mode

                // Update active state
                toolbar.querySelectorAll('.reverse-tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                console.log('[ReverseMappingMode] Tool selected:', tool);
            });
        });

        // Identify button
        const identifyBtn = toolbar.querySelector('#reverse-identify-btn');
        if (identifyBtn) {
            identifyBtn.addEventListener('click', () => {
                this.identifyFields();
            });
        }

        // Exit button
        const exitBtn = toolbar.querySelector('#reverse-exit-btn');
        if (exitBtn) {
            exitBtn.addEventListener('click', () => {
                this.deactivate();
            });
        }
    }

    /**
     * Update element count in sidebar panel
     */
    updateElementCount() {
        // Try new sidebar panel first, then old toolbar
        const countEl = document.querySelector('.reverse-status-box .element-count') ||
                       document.querySelector('.reverse-toolbar-status .element-count');
        if (countEl) {
            countEl.textContent = this.elements.length;
        }
    }

    /**
     * Check if mode is active
     */
    isActive() {
        return this.active;
    }
}

// Singleton instance
export const reverseMappingMode = new ReverseMappingModeController();

// Auto-init when module loads
if (typeof window !== 'undefined') {
    window.ReverseMappingMode = reverseMappingMode;
}
