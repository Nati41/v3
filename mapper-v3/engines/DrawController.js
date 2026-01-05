/**
 * DrawController - Field drawing for Mapper V3
 * Ported from old mapper with correct coordinate conversion
 * Extended with CAPTURE_NAME mode for field name extraction
 */
import { state, Tools, Modes, RadioGroupSteps } from '../core/StateManager.js';
import { radioGroupDialog } from '../ui/RadioGroupDialog.js';
import { eventBus, Events } from '../core/EventBus.js';
import { overlayRenderer } from './OverlayRenderer.js';
import { pdfEngine, CHECKBOX_SIZE, RADIO_SIZE } from './PDFEngine.js';
import { textExtractor } from './TextExtractor.js';
import { fieldNamer } from './FieldNamer.js';
import { nameConfirmDialog } from '../ui/NameConfirmDialog.js';
import { autoBoxer } from './AutoBoxerService.js';

export class DrawController {
    constructor() {
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.previewElement = null;
        this.zoomLevel = 1.0; // Will be updated from state

        // Two-phase mapping: stores field ID waiting for position mapping
        this.pendingFieldId = null;
    }

    /**
     * Initialize the controller
     * @param {Object} options - Configuration
     */
    init(options = {}) {
        this.options = {
            drawingLayerId: 'drawing-layer',
            overlayLayerId: 'overlay-layer',
            minFieldSize: 10,
            ...options
        };

        this.drawingLayer = document.getElementById(this.options.drawingLayerId);
        this.overlayLayer = document.getElementById(this.options.overlayLayerId);

        if (!this.drawingLayer || !this.overlayLayer) {
            console.warn('[DrawController] Drawing or overlay layer not found');
            return;
        }

        this._setupListeners();
        console.log('[DrawController] Initialized');
    }

    /**
     * Setup event listeners
     */
    _setupListeners() {
        // Use overlay layer for drawing (it's on top)
        this.overlayLayer.addEventListener('mousedown', (e) => this._onMouseDown(e));
        document.addEventListener('mousemove', (e) => this._onMouseMove(e));
        document.addEventListener('mouseup', (e) => this._onMouseUp(e));

        // Touch support
        this.overlayLayer.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
        document.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this._onTouchEnd(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Don't handle if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Radio group building shortcuts
            const builder = state.getRadioGroupBuilder();
            if (builder && builder.active) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // In CLICK_CIRCLES step, Enter triggers label detection
                    if (builder.step === RadioGroupSteps.CLICK_CIRCLES) {
                        this._triggerLabelDetection();
                    }
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cancelRadioGroup();
                    return;
                }
                // Backspace/Delete to remove last circle
                if ((e.key === 'Backspace' || e.key === 'Delete') && builder.step === RadioGroupSteps.CLICK_CIRCLES) {
                    e.preventDefault();
                    if (state.removeLastRadioCircle()) {
                        this._showToast('עיגול אחרון הוסר', 'info');
                        overlayRenderer.render(); // Re-render to remove visual indicator
                    }
                    return;
                }
            }

            // Cancel drawing
            if (e.key === 'Escape' && this.isDrawing) {
                this._cancelDraw();
            }
        });

        // Track zoom level changes
        eventBus.on(Events.STATE_CHANGED, ({ path, value }) => {
            if (path === 'view.zoom') {
                this.zoomLevel = value;
            }
        });

        // Clear pending field if user switches to SELECT tool (cancels mapping)
        eventBus.on(Events.TOOL_CHANGED, ({ tool }) => {
            if (this.pendingFieldId && tool === Tools.SELECT) {
                console.log('[DrawController] User switched to SELECT, cancelling pending mapping');
                this._showToast('מיפוי השדה בוטל', 'warning');
                this.pendingFieldId = null;
            }
        });

        // ============ RADIO LABEL SELECTION ============
        // Handle manual label selection from radio dialog
        eventBus.on('radio:startLabelSelection', ({ index }) => {
            console.log('[DrawController] Starting label selection for radio', index);
            this._labelSelectionMode = true;
            this._labelSelectionIndex = index;
            // Change cursor
            this.overlayLayer.style.cursor = 'crosshair';
        });

        eventBus.on('radio:cancelLabelSelection', () => {
            console.log('[DrawController] Label selection cancelled');
            this._labelSelectionMode = false;
            this._labelSelectionIndex = null;
            this.overlayLayer.style.cursor = '';
        });
    }

    /**
     * Check if current tool is a drawing tool
     * @returns {boolean}
     */
    _isDrawingTool() {
        // Allow drawing in label selection mode (from radio dialog)
        if (this._labelSelectionMode) {
            return true;
        }

        // Always allow drawing when table flow is active
        if (window.tableFlowUI && window.tableFlowUI.isActive()) {
            return true;
        }

        const tool = state.get('tool');
        return [Tools.DRAW_TEXT, Tools.DRAW_CHECKBOX, Tools.DRAW_RADIO, Tools.DRAW_TABLE, Tools.CAPTURE_NAME].includes(tool);
    }

    /**
     * Check if current tool is the name capture tool
     * @returns {boolean}
     */
    _isNameCaptureTool() {
        return state.get('tool') === Tools.CAPTURE_NAME;
    }

    /**
     * Get mouse coordinates relative to overlay layer, accounting for zoom
     * @param {number} clientX - Client X coordinate
     * @param {number} clientY - Client Y coordinate
     * @returns {Object} { x, y }
     */
    _getLayerCoordinates(clientX, clientY) {
        const layerRect = this.overlayLayer.getBoundingClientRect();
        const zoom = state.get('view.zoom') || 1.0;

        // Account for zoom in coordinate calculation
        const x = (clientX - layerRect.left) / zoom;
        const y = (clientY - layerRect.top) / zoom;

        return { x, y };
    }

    /**
     * Handle mouse down
     * @param {MouseEvent} e
     */
    _onMouseDown(e) {
        // Handle PLACEMENT mode (AutoBoxer) - Single click only
        if (state.get('mode') === Modes.PLACEMENT) {
            // Check if user is clicking on an existing field to select it instead
            if (e.target.classList.contains('field-overlay')) {
                return;
            }
            this.isPlacementClick = true;
            return; // STRICT RETURN - DO NOT CONTINUE TO DRAW LOGIC
        }

        if (!this._isDrawingTool()) return;

        // Don't start drawing if clicking on existing field
        if (e.target.classList.contains('field-overlay') ||
            e.target.classList.contains('resize-handle')) {
            return;
        }

        const coords = this._getLayerCoordinates(e.clientX, e.clientY);
        this._startDraw(coords.x, coords.y);
    }

    /**
     * Handle mouse move
     * @param {MouseEvent} e
     */
    _onMouseMove(e) {
        if (this.isDrawing) {
            const coords = this._getLayerCoordinates(e.clientX, e.clientY);
            this._updateDraw(coords.x, coords.y);
        }
    }

    /**
     * Handle mouse up
     * @param {MouseEvent} e
     */
    _onMouseUp(e) {
        // Handle PLACEMENT mode (AutoBoxer)
        if (state.get('mode') === Modes.PLACEMENT) {
            if (this.isPlacementClick) {
                this.isPlacementClick = false;
                const coords = this._getLayerCoordinates(e.clientX, e.clientY);
                this._handleAutoPlacement(coords.x, coords.y);
            }
            return; // STRICT RETURN - DO NOT PROCESS DRAWING END
        }

        if (this.isDrawing) {
            const coords = this._getLayerCoordinates(e.clientX, e.clientY);
            this._finishDraw(coords.x, coords.y);
        }
    }

    /**
     * Handle touch start
     * @param {TouchEvent} e
     */
    _onTouchStart(e) {
        if (!this._isDrawingTool()) return;
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        if (target && (target.classList.contains('field-overlay') ||
            target.classList.contains('resize-handle'))) {
            return;
        }

        e.preventDefault();
        const coords = this._getLayerCoordinates(touch.clientX, touch.clientY);
        this._startDraw(coords.x, coords.y);
    }

    /**
     * Handle touch move
     * @param {TouchEvent} e
     */
    _onTouchMove(e) {
        if (!this.isDrawing || e.touches.length !== 1) return;

        e.preventDefault();
        const touch = e.touches[0];
        const coords = this._getLayerCoordinates(touch.clientX, touch.clientY);
        this._updateDraw(coords.x, coords.y);
    }

    /**
     * Handle touch end
     * @param {TouchEvent} e
     */
    _onTouchEnd(e) {
        if (this.isDrawing) {
            const touch = e.changedTouches[0];
            const coords = this._getLayerCoordinates(touch.clientX, touch.clientY);
            this._finishDraw(coords.x, coords.y);
        }
    }

    // ============ DRAWING LOGIC ============

    /**
     * Start drawing
     * @param {number} x - Layer X coordinate
     * @param {number} y - Layer Y coordinate
     */
    _startDraw(x, y) {
        // Don't change mode if we're in RADIO_GROUP_BUILDING (preserve the flow)
        const currentMode = state.get('mode');
        if (currentMode !== Modes.RADIO_GROUP_BUILDING) {
            state.setMode(Modes.DRAWING);
        }

        this.isDrawing = true;

        // Use raw coordinates directly
        this.startX = x;
        this.startY = y;

        // Create preview element
        this.previewElement = document.createElement('div');
        this.previewElement.className = 'drawing-preview';
        this.previewElement.style.left = `${this.startX}px`;
        this.previewElement.style.top = `${this.startY}px`;
        this.previewElement.style.width = '0px';
        this.previewElement.style.height = '0px';

        // Add dimension info
        const info = document.createElement('div');
        info.className = 'drawing-info';
        info.textContent = '0 × 0';
        this.previewElement.appendChild(info);

        this.drawingLayer.appendChild(this.previewElement);

        eventBus.emit(Events.DRAW_START, {
            x: this.startX,
            y: this.startY,
            tool: state.get('tool')
        });

        console.log('[DrawController] Started drawing at', this.startX, this.startY);
    }

    /**
     * Update drawing preview
     * @param {number} currentX - Current X coordinate
     * @param {number} currentY - Current Y coordinate
     */
    _updateDraw(currentX, currentY) {
        if (!this.previewElement) return;

        // Use raw coordinates directly
        const endX = currentX;
        const endY = currentY;

        // Calculate rectangle (handle negative dimensions)
        const rectX = Math.min(this.startX, endX);
        const rectY = Math.min(this.startY, endY);
        const rectW = Math.abs(endX - this.startX);
        const rectH = Math.abs(endY - this.startY);

        // Update preview element
        this.previewElement.style.left = `${rectX}px`;
        this.previewElement.style.top = `${rectY}px`;
        this.previewElement.style.width = `${rectW}px`;
        this.previewElement.style.height = `${rectH}px`;

        // Update dimension info
        const info = this.previewElement.querySelector('.drawing-info');
        if (info) {
            info.textContent = `${Math.round(rectW)} × ${Math.round(rectH)}`;
        }

        eventBus.emit(Events.DRAW_UPDATE, { x: rectX, y: rectY, width: rectW, height: rectH });
    }

    /**
     * Finish drawing and create field
     * Uses correct coordinate conversion from overlay renderer
     * @param {number} currentX - Final X coordinate
     * @param {number} currentY - Final Y coordinate
     */
    _finishDraw(currentX, currentY) {
        if (!this.previewElement) {
            this.isDrawing = false;
            return;
        }

        // Use raw coordinates directly
        const endX = currentX;
        const endY = currentY;

        // Calculate final rectangle in screen pixels
        const x = Math.min(this.startX, endX);
        const y = Math.min(this.startY, endY);
        const width = Math.abs(endX - this.startX);
        const height = Math.abs(endY - this.startY);

        // Remove preview
        this.previewElement.remove();
        this.previewElement = null;

        // ============ LABEL SELECTION MODE - For radio dialog ============
        if (this._labelSelectionMode) {
            this._handleLabelSelection(x, y, width, height);
            return;
        }

        // DEBUG: Log current mode
        const currentMode = state.get('mode');
        console.log('[DrawController] _finishDraw - currentMode:', currentMode, 'RADIO_GROUP_BUILDING:', Modes.RADIO_GROUP_BUILDING);

        // ============ TABLE FLOW MODE - Check for active table flow ============
        // When table flow is active, forward drawing to it
        if (window.tableFlowUI && window.tableFlowUI.isActive()) {
            console.log('[DrawController] Forwarding to TableFlowUI');
            const bbox = { x, y, width, height };
            window.tableFlowUI.onRectangleDrawn(bbox);
            this.isDrawing = false;
            return;
        }

        // ============ RADIO GROUP BUILDING MODE - Check FIRST ============
        // When in radio group building, always handle through that flow
        if (currentMode === Modes.RADIO_GROUP_BUILDING) {
            console.log('[DrawController] Going to _handleRadioGroupBuilding');
            this._handleRadioGroupBuilding(x, y, width, height);
            return;
        }

        // ============ CAPTURE_NAME MODE - Regular field capture ============
        if (this._isNameCaptureTool()) {
            this._handleNameCapture(x, y, width, height);
            return;
        }

        // Determine field type from current tool
        const tool = state.get('tool');
        const isCheckboxOrRadio = tool === Tools.DRAW_CHECKBOX || tool === Tools.DRAW_RADIO;

        // ============ ONE-CLICK CREATION ============
        // If drawing is too small, handle based on tool type
        const ONE_CLICK_SIZE = 24;  // Fixed size for one-click checkbox/radio
        const isSmallDraw = width < this.options.minFieldSize || height < this.options.minFieldSize;

        let finalX = x;
        let finalY = y;
        let finalWidth = width;
        let finalHeight = height;

        if (isSmallDraw) {
            if (isCheckboxOrRadio) {
                // One-click creation: use click position as center, create 24×24 field
                finalX = this.startX - ONE_CLICK_SIZE / 2;
                finalY = this.startY - ONE_CLICK_SIZE / 2;
                finalWidth = ONE_CLICK_SIZE;
                finalHeight = ONE_CLICK_SIZE;
                console.log('[DrawController] One-click checkbox/radio at', this.startX, this.startY);
            } else {
                // For text fields, cancel if too small
                console.log('[DrawController] Drawing too small, cancelled');
                this._cancelDraw();
                return;
            }
        }

        // Determine field type from current tool (tool already declared above)
        let fieldType = 'text';
        let fieldData = {};

        switch (tool) {
            case Tools.DRAW_TEXT:
                fieldType = 'text';
                break;
            case Tools.DRAW_CHECKBOX:
                fieldType = 'checkbox';
                break;
            case Tools.DRAW_RADIO:
                fieldType = 'radio';
                break;
            case Tools.DRAW_TABLE:
                fieldType = 'table';
                break;
        }

        // ============ COORDINATE CONVERSION ============
        // Use the overlayRenderer's screenToBbox for correct Y-axis flip
        // Use finalX/Y/Width/Height (may be adjusted for one-click creation)
        const bbox = overlayRenderer.screenToBbox({ x: finalX, y: finalY, width: finalWidth, height: finalHeight });

        // For checkbox/radio, also store anchor point (center of the field)
        if (fieldType === 'checkbox' || fieldType === 'radio') {
            const centerX = finalX + finalWidth / 2;
            const centerY = finalY + finalHeight / 2;
            const anchor = overlayRenderer.screenToAnchor(centerX, centerY);

            fieldData.anchor = anchor;
            fieldData.overlayWidth = finalWidth;
            fieldData.overlayHeight = finalHeight;
        }

        let field;

        console.log('[DrawController] _finishDraw - pendingFieldId:', this.pendingFieldId);

        // ============ TWO-PHASE MAPPING: Check for pending field ============
        if (this.pendingFieldId) {
            // Phase 2: Update existing unmapped field with position
            // IMPORTANT: Pass false for history - the field was already added to history in Phase 1
            // This makes the entire two-phase operation a single undo
            const pendingField = state.getField(this.pendingFieldId);

            if (pendingField) {
                field = state.updateField(this.pendingFieldId, {
                    bbox: bbox,
                    isMapped: true,
                    ...fieldData
                }, false);  // Skip history - keeps two-phase as single undo

                this._showToast(`שדה "${pendingField.label_he}" מופה בהצלחה!`, 'success');
                console.log('[DrawController] Mapped pending field:', this.pendingFieldId, 'bbox:', bbox);
            } else {
                console.warn('[DrawController] Pending field not found:', this.pendingFieldId);
            }

            // Clear pending field
            this.pendingFieldId = null;

        } else {
            // Normal flow: Create new field
            field = state.addField({
                type: fieldType,
                bbox: bbox,
                isMapped: true,
                ...fieldData
            });

            console.log('[DrawController] Created field:', field.id, 'bbox:', bbox);
        }

        // Reset state
        this.isDrawing = false;
        state.setMode(Modes.IDLE);

        // Select the field
        if (field) {
            state.selectField(field.id);
        }

        // Switch back to select tool
        state.setTool(Tools.SELECT);

        eventBus.emit(Events.DRAW_END, { field });
    }

    /**
     * Cancel current drawing
     */
    _cancelDraw() {
        if (this.previewElement) {
            this.previewElement.remove();
            this.previewElement = null;
        }

        this.isDrawing = false;
        state.setMode(Modes.IDLE);

        // Clear pending field if any
        if (this.pendingFieldId) {
            console.log('[DrawController] Cancelling pending field mapping:', this.pendingFieldId);
            this.pendingFieldId = null;
        }

        eventBus.emit(Events.DRAW_CANCEL);
        console.log('[DrawController] Drawing cancelled');
    }

    /**
     * Clear pending field mapping (called when user changes tools)
     */
    clearPendingField() {
        if (this.pendingFieldId) {
            console.log('[DrawController] Clearing pending field:', this.pendingFieldId);
            this.pendingFieldId = null;
        }
    }

    // ============ NAME CAPTURE FLOW ============

    /**
     * Handle name capture drawing completion
     * @param {number} x - X position (screen pixels)
     * @param {number} y - Y position (screen pixels)
     * @param {number} width - Width (screen pixels)
     * @param {number} height - Height (screen pixels)
     */
    async _handleNameCapture(x, y, width, height) {
        console.log('[DrawController] Name capture at:', x, y, width, height);

        // Reset drawing state
        this.isDrawing = false;
        state.setMode(Modes.IDLE);

        // Validate minimum size
        const MIN_SIZE = 10;
        if (width < MIN_SIZE || height < MIN_SIZE) {
            console.log('[DrawController] Name capture area too small');
            this._showToast('האזור קטן מדי - צייר מלבן גדול יותר', 'warning');
            return;
        }

        try {
            // Show loading indicator
            this._showToast('מחלץ טקסט...', 'info');

            // Extract text from the drawn area
            const { text, source } = await textExtractor.getTextAtPosition(x, y, width, height);

            if (!text) {
                this._showToast('לא נמצא טקסט באזור הנבחר', 'warning');
                return;
            }

            // ============ GENERATE ENGLISH ID ============
            // Priority: 1. Known Fields Table → 2. Pure Transliteration
            const englishId = fieldNamer.hebrewToEnglish(text);

            console.log(`[ID_GENERATOR] "${text}" → "${englishId}"`);
            console.log('[DrawController] Extracted:', { text, englishId, source });

            // Show confirmation dialog
            console.log('[DrawController] Showing dialog...');
            let result;
            try {
                result = await nameConfirmDialog.show({
                    hebrewName: text,
                    englishName: englishId,
                    source: source,
                    fieldType: 'text'
                });
                console.log('[DrawController] Dialog returned:', result);
            } catch (dialogError) {
                console.error('[DrawController] Dialog error:', dialogError);
                return;
            }

            console.log('[DrawController] Dialog result:', result);

            if (result) {
                console.log('[DrawController] Creating unmapped field with:', result);
                // User confirmed - create the unmapped field
                const field = state.addUnmappedField({
                    label_he: result.label_he,
                    label_en: result.label_en,
                    type: result.type,
                    source: source
                });

                console.log('[DrawController] Field created:', field);

                // ============ PHASE 2: Map field position ============
                // Store field ID for position mapping
                // Use state.set for global pendingFieldId (new architecture)
                state.set('pendingFieldId', field.id);
                this.pendingFieldId = field.id; // Keep local sync just in case
                console.log('[DrawController] SET pendingFieldId:', field.id);

                // Switch to appropriate mode based on field type
                if (result.type === 'text' || result.type === 'number' || result.type === 'date') {
                    // AUTO-PLACEMENT MODE for text fields
                    state.setMode(Modes.PLACEMENT);
                    this.overlayLayer.style.cursor = 'crosshair';
                    this._showToast(`לחץ על המיקום של "${result.label_he}" (זיהוי אוטומטי)`, 'info');
                } else {
                    // MANUAL DRAWING for others (checkbox, radio, signature)
                    const toolMap = {
                        'checkbox': Tools.DRAW_CHECKBOX,
                        'signature': Tools.DRAW_TEXT // Signature usually manual draw
                    };
                    const drawTool = toolMap[result.type] || Tools.DRAW_TEXT;
                    state.setTool(drawTool);
                    this._showToast(`סמן את מיקום השדה "${result.label_he}"`, 'info');
                }

                console.log('[DrawController] Field created, waiting for position:', field.id);

            } else {
                // User cancelled
                console.log('[DrawController] Name capture cancelled by user');
            }

        } catch (error) {
            console.error('[DrawController] Name capture error:', error);
            this._showToast('שגיאה בחילוץ טקסט', 'error');
        }
    }

    // ============ AUTO PLACEMENT (AutoBoxer) ============

    /**
     * Handle Auto-Placement (AutoBoxer)
     * @param {number} x - Scan X
     * @param {number} y - Scan Y
     */
    async _handleAutoPlacement(x, y) {
        console.log('[DrawController] Auto-Placement triggered at:', x, y);
        this._showToast('מחשב מיקום...', 'info');

        try {
            // Reset cursor
            this.overlayLayer.style.cursor = 'wait';

            // Run AutoBoxer
            const bbox = await autoBoxer.calculateBBox({ x, y });

            this.overlayLayer.style.cursor = 'crosshair'; // Restore cursor

            if (!bbox) {
                this._showToast('לא זוהה שדה - נסה שוב', 'warning');
                return;
            }

            // Get pending field
            const pendingFieldId = state.get('pendingFieldId');
            if (!pendingFieldId) {
                console.warn('[DrawController] No pending field for placement');
                state.setMode(Modes.IDLE);
                return;
            }

            const pendingField = state.getField(pendingFieldId);

            // Convert Screen BBox to PDF BBox (for storage)
            const pdfBbox = overlayRenderer.screenToBbox(bbox);

            // Update field
            state.updateField(pendingFieldId, {
                bbox: pdfBbox,
                isMapped: true
            }, false); // Combine with previous history entry if possible

            this._showToast(`שדה "${pendingField.label_he}" מופה בהצלחה!`, 'success');
            console.log('[DrawController] Auto-placed field:', pendingFieldId, bbox);

            // Reset state
            state.set('pendingFieldId', null);
            state.setMode(Modes.IDLE);
            state.setTool(Tools.SELECT);

        } catch (error) {
            console.error('[DrawController] Auto-Placement error:', error);
            this.overlayLayer.style.cursor = 'crosshair'; // Restore cursor
            this._showToast('שגיאה בחישוב המיקום', 'error');
        }
    }

    // ============ RADIO GROUP BUILDING (NEW FLOW) ============

    /**
     * Start the new radio group building flow
     * Called when user clicks the Radio tool button
     */
    startRadioGroupFlow() {
        console.log('[DrawController] Starting radio group flow');
        state.startRadioGroupBuilder();
        state.setTool(Tools.CAPTURE_NAME); // First step: mark title
        this._showToast('סמן את כותרת קבוצת הרדיו', 'info');
    }

    /**
     * Handle drawing during radio group building (NEW FLOW)
     * @param {number} x - X position (screen pixels)
     * @param {number} y - Y position (screen pixels)
     * @param {number} width - Width (screen pixels)
     * @param {number} height - Height (screen pixels)
     */
    async _handleRadioGroupBuilding(x, y, width, height) {
        const builder = state.getRadioGroupBuilder();
        if (!builder.active) return;

        this.isDrawing = false;

        const ONE_CLICK_SIZE = 24;
        const isOneClick = width < this.options.minFieldSize || height < this.options.minFieldSize;

        console.log('[DrawController] Radio group step:', builder.step, 'isOneClick:', isOneClick);

        // ============ STEP 1: MARK_TITLE ============
        if (builder.step === RadioGroupSteps.MARK_TITLE) {
            // User draws rectangle on group title to extract text
            if (width < 10 || height < 10) {
                this._showToast('האזור קטן מדי - צייר מלבן על הכותרת', 'warning');
                return;
            }

            try {
                this._showToast('מחלץ כותרת...', 'info');

                const { text, source } = await textExtractor.getTextAtPosition(x, y, width, height);

                if (!text) {
                    this._showToast('לא נמצא טקסט בכותרת - נסה שוב', 'warning');
                    return;
                }

                const englishId = fieldNamer.hebrewToEnglish(text);

                // Set the group title and move to next step
                state.setRadioGroupTitle(text, englishId);
                state.setTool(Tools.DRAW_RADIO);

                this._showToast(`כותרת "${text}" - עכשיו לחץ על עיגולי הרדיו (①②③)`, 'success');

            } catch (error) {
                console.error('[DrawController] Title extraction error:', error);
                this._showToast('שגיאה בחילוץ כותרת', 'error');
            }
            return;
        }

        // ============ STEP 2: CLICK_CIRCLES ============
        if (builder.step === RadioGroupSteps.CLICK_CIRCLES) {
            // User clicks on radio circles (one-click creates 24x24 fixed size)
            let circleX, circleY, circleW, circleH;

            if (isOneClick) {
                // One-click: center at click position
                circleX = this.startX - ONE_CLICK_SIZE / 2;
                circleY = this.startY - ONE_CLICK_SIZE / 2;
                circleW = ONE_CLICK_SIZE;
                circleH = ONE_CLICK_SIZE;
            } else {
                circleX = x;
                circleY = y;
                circleW = width;
                circleH = height;
            }

            // Convert to bbox
            const bbox = overlayRenderer.screenToBbox({
                x: circleX,
                y: circleY,
                width: circleW,
                height: circleH
            });

            const circleNumber = state.addRadioCircle(bbox);

            // Re-render to show the numbered indicator
            overlayRenderer.render();

            const count = state.getRadioGroupBuilder().circles.length;
            if (count >= 2) {
                this._showToast(`עיגול ${this._getCircleIndicator(circleNumber)} נוסף. לחץ על עוד או Enter לסיום`, 'success');
            } else {
                this._showToast(`עיגול ${this._getCircleIndicator(circleNumber)} נוסף. לחץ על עיגול נוסף`, 'success');
            }
            return;
        }

        // Other steps don't handle drawing
        console.log('[DrawController] Unhandled step:', builder.step);
    }

    /**
     * Get circle indicator character (①②③④⑤...)
     * @param {number} number - Circle number (1-based)
     * @returns {string}
     */
    _getCircleIndicator(number) {
        const indicators = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
        return indicators[number - 1] || `(${number})`;
    }

    /**
     * Trigger label detection (called on Enter)
     * Scans area near each circle to find labels
     */
    async _triggerLabelDetection() {
        const builder = state.getRadioGroupBuilder();
        if (!builder.active || builder.step !== RadioGroupSteps.CLICK_CIRCLES) return;

        if (builder.circles.length < 2) {
            this._showToast('צריך לפחות 2 עיגולים. המשך ללחוץ על עיגולים', 'warning');
            return;
        }

        console.log('[DrawController] Triggering label detection for', builder.circles.length, 'circles');
        this._showToast('מזהה תוויות...', 'info');

        // Start detection phase
        if (!state.startLabelDetection()) {
            return;
        }

        // Auto-detect labels near each circle
        const detectedLabels = await this._autoDetectLabels(builder.circles);

        // Set the detected labels
        state.setDetectedLabels(detectedLabels);

        // Show the dialog for review/edit
        this._showRadioGroupDialog(builder.groupName, detectedLabels);
    }

    /**
     * Auto-detect labels near radio circles
     * Scans area on BOTH sides of each circle (Hebrew labels are typically LEFT of circle)
     * @param {Array} circles - Array of { bbox, number }
     * @returns {Promise<Array>} Array of { circleIndex, label_he, label_en, labelBbox }
     */
    async _autoDetectLabels(circles) {
        const labels = [];
        const SCAN_WIDTH = 80;   // Reduced - radio labels are short (זכר, נקבה, כן, לא)
        const SCAN_HEIGHT = 24;  // Height of scan area

        for (let i = 0; i < circles.length; i++) {
            const circle = circles[i];

            // Convert bbox back to screen coordinates
            const screen = overlayRenderer.bboxToScreen(circle.bbox);

            let foundText = null;
            let foundSource = 'none';
            let foundBbox = null;

            // First try LEFT of circle (Hebrew style - most common)
            const scanLeftX = Math.max(0, screen.x - SCAN_WIDTH - 5);
            const scanY = screen.y - 5;  // Slightly above center

            try {
                const leftResult = await textExtractor.getTextAtPosition(
                    scanLeftX, scanY, SCAN_WIDTH, SCAN_HEIGHT
                );

                if (leftResult.text) {
                    foundText = leftResult.text;
                    foundSource = leftResult.source;
                    foundBbox = [scanLeftX, scanY, SCAN_WIDTH, SCAN_HEIGHT];
                    console.log(`[DrawController] Circle ${i + 1} (left): "${foundText}"`);
                }
            } catch (error) {
                console.warn(`[DrawController] Left scan error for circle ${i + 1}:`, error);
            }

            // If no text on left, try RIGHT of circle
            if (!foundText) {
                const scanRightX = screen.x + screen.width + 5;

                try {
                    const rightResult = await textExtractor.getTextAtPosition(
                        scanRightX, scanY, SCAN_WIDTH, SCAN_HEIGHT
                    );

                    if (rightResult.text) {
                        foundText = rightResult.text;
                        foundSource = rightResult.source;
                        foundBbox = [scanRightX, scanY, SCAN_WIDTH, SCAN_HEIGHT];
                        console.log(`[DrawController] Circle ${i + 1} (right): "${foundText}"`);
                    }
                } catch (error) {
                    console.warn(`[DrawController] Right scan error for circle ${i + 1}:`, error);
                }
            }

            // Build label entry
            if (foundText) {
                const englishId = fieldNamer.hebrewToEnglish(foundText);
                labels.push({
                    circleIndex: i,
                    label_he: foundText,
                    label_en: englishId,
                    labelBbox: foundBbox,
                    source: foundSource
                });
            } else {
                // No text found - add placeholder
                labels.push({
                    circleIndex: i,
                    label_he: '',
                    label_en: `option_${i + 1}`,
                    labelBbox: null,
                    source: 'none'
                });
                console.log(`[DrawController] Circle ${i + 1}: No text found on either side`);
            }
        }

        return labels;
    }

    /**
     * Show the radio group dialog for review/edit
     * @param {string} groupName - Group name
     * @param {Array} detectedLabels - Detected labels
     */
    async _showRadioGroupDialog(groupName, detectedLabels) {
        console.log('[DrawController] Showing radio group dialog');

        try {
            const result = await radioGroupDialog.show({
                groupName: groupName,
                labels: detectedLabels
            });

            if (result) {
                // User confirmed - update labels and create group
                console.log('[DrawController] Dialog confirmed:', result);

                // Update labels from dialog
                result.labels.forEach((label, index) => {
                    state.updateDetectedLabel(index, label.label_he, label.label_en);
                });

                // Update group name if changed
                if (result.groupName !== groupName) {
                    const builder = state.getRadioGroupBuilder();
                    state.set('radioGroupBuilder.groupName', result.groupName);
                    state.set('radioGroupBuilder.groupNameEn', fieldNamer.hebrewToEnglish(result.groupName));
                }

                // Finish and create the group
                const group = state.finishRadioGroupBuilder();
                if (group) {
                    this._showToast(`קבוצת רדיו "${group.groupName}" נוצרה עם ${group.options.length} אפשרויות!`, 'success');
                }
                state.setTool(Tools.SELECT);
            } else {
                // User cancelled
                console.log('[DrawController] Dialog cancelled');
                this.cancelRadioGroup();
            }
        } catch (error) {
            console.error('[DrawController] Dialog error:', error);
            this._showToast('שגיאה בדיאלוג', 'error');
            this.cancelRadioGroup();
        }
    }

    /**
     * Cancel radio group building
     */
    cancelRadioGroup() {
        state.cancelRadioGroupBuilder();
        this._showToast('בניית קבוצת רדיו בוטלה', 'warning');
        state.setTool(Tools.SELECT);
        overlayRenderer.render(); // Clear any visual indicators
    }

    /**
     * Handle label selection from radio dialog
     * Extracts text from the selected area and emits result
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     */
    async _handleLabelSelection(x, y, width, height) {
        console.log('[DrawController] Label selection area:', { x, y, width, height });

        // Reset drawing state
        this.isDrawing = false;

        // Exit label selection mode
        this._labelSelectionMode = false;
        this.overlayLayer.style.cursor = '';

        // Check minimum size
        if (width < 5 || height < 5) {
            console.log('[DrawController] Label selection too small, cancelled');
            eventBus.emit('radio:labelSelected', { text: '', source: 'none' });
            return;
        }

        try {
            // Extract text from the selected area
            const result = await textExtractor.getTextAtPosition(x, y, width, height);

            console.log('[DrawController] Label extraction result:', result);

            // Emit the result
            eventBus.emit('radio:labelSelected', {
                text: result.text || '',
                source: result.source || 'none',
                bbox: [x, y, width, height]
            });

            if (result.text) {
                this._showToast(`תווית זוהתה: "${result.text}"`, 'success');
            } else {
                this._showToast('לא נמצא טקסט באזור שסומן', 'warning');
            }
        } catch (error) {
            console.error('[DrawController] Label extraction error:', error);
            eventBus.emit('radio:labelSelected', { text: '', source: 'error' });
            this._showToast('שגיאה בזיהוי טקסט', 'error');
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - Message to show
     * @param {string} type - Toast type (info, success, warning, error)
     */
    _showToast(message, type) {
        // Try to use global showToast if available
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            // Fallback to eventBus
            eventBus.emit(Events.TOAST_SHOW, { message, type });
        }
    }
}

// Singleton instance
export const drawController = new DrawController();
