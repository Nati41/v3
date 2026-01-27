/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - DrawController
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   מנהל את תהליך ציור שדות על ה-PDF.
 *   מתרגם אירועי עכבר (mousedown, mousemove, mouseup) לפעולות מיפוי:
 *   יצירת שדה חדש, לכידת שם, קבוצת רדיו, ועוד.
 *
 * איך זה עובד:
 *   - לחיצה על PDF → _startDraw()
 *   - AutoBoxer מזהה גבולות → BboxRefiner משפר
 *   - _finishDraw() → יוצר שדה ב-StateManager + OverlayRenderer
 *   - במצב ניסיוני: פולט REVERSE_DRAW_COMPLETE במקום יצירת שדה
 *
 * מי משתמש בקובץ:
 *   - MapperCore.js - מאתחל ומחבר אירועי עכבר
 *   - IntentManager.js - מגדיר מה קורה בלחיצה הבאה
 *   - ReverseMappingMode.js - מאזין ל-REVERSE_DRAW_COMPLETE
 *
 * באיזה מצבים:
 *   - מצב מיפוי רגיל ומונחה
 *   - מצב ניסיוני (חיתוך מוקדם ל-REVERSE_DRAW_COMPLETE)
 *   - מצב רדיו (זרימה רב-שלבית: כותרת → עיגולים → תוויות)
 *
 * למה הוא קיים:
 *   מרכז את כל לוגיקת הציור במקום אחד. משלב בין AutoBoxer,
 *   BboxRefiner, IntentManager, ו-StateManager.
 *
 * אזהרה: מכיל קוד PROTECTED (אינטגרציית BboxRefiner)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    DRAWCONTROLLER - FIELD DRAWING                          ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  CONTAINS PROTECTED CODE: BboxRefiner Integration (v1.0.0)                 ║
 * ║                                                                            ║
 * ║  The BboxRefiner integration (lines ~300-800) is PROTECTED.                ║
 * ║  DO NOT MODIFY the following methods without review:                       ║
 * ║  - _autoBoxAndFinish()                                                     ║
 * ║  - _createRefinerPreview()                                                 ║
 * ║  - _onDragStart/Move/End()                                                 ║
 * ║  - _onCornerDragStart()                                                    ║
 * ║  - _onCenterDragStart/Click()                                              ║
 * ║  - _finalizeRefiner()                                                      ║
 * ║  - _cancelRefiner()                                                        ║
 * ║                                                                            ║
 * ║  Last stable update: 2026-01-04                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * DrawController - Field drawing for Mapper V3
 * Ported from old mapper with correct coordinate conversion
 * Extended with CAPTURE_NAME mode for field name extraction
 * Extended with AutoBoxer for single-click field placement
 * Extended with BboxRefiner for progressive refinement + drag support
 */
import { state, Tools, Modes, RadioGroupSteps, FlowModes } from '../core/StateManager.js';
import { radioGroupDialog } from '../ui/RadioGroupDialog.js';
import { eventBus, Events } from '../core/EventBus.js';
import { overlayRenderer } from './OverlayRenderer.js';
import { pdfEngine, CHECKBOX_SIZE, RADIO_SIZE } from './PDFEngine.js';
import { textExtractor } from './TextExtractor.js';
import { fieldNamer } from './FieldNamer.js';
import { nameConfirmDialog } from '../ui/NameConfirmDialog.js';
import { labelDetectionV2 } from './LabelDetectionV2.js';
import { labelOverlay } from '../overlay/LabelOverlay.js';
import { autoBoxer } from './AutoBoxer.js';
import { bboxRefiner } from './BboxRefiner.js';
import { REFINER_CONFIG } from './RefinerConfig.js';
import { canonicalSelector } from '../helpers/CanonicalSelector.js';
import { templateStore, TemplateFieldStatus, EntityMappingMode } from '../core/TemplateStore.js';

// V3.5: Guided Mapping integration
import { guidedMappingUI, GuidedMappingEvents } from '../ui/GuidedMappingUI.js';
import { fieldIntelligenceStore } from '../core/FieldIntelligenceStore.js';

// V3.9: Intent-based drawing
import { intentManager, IntentType, IntentSource } from '../core/IntentManager.js';

// V3.10: QuickFill collision detection
import { quickFillOverlay } from '../ui/QuickFillOverlay.js';

export class DrawController {
    constructor() {
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.previewElement = null;
        this.zoomLevel = 1.0; // Will be updated from state

        // Two-phase mapping: stores field ID waiting for position mapping
        this.pendingFieldId = null;

        // V2 Label Detection engine (enabled via window.USE_LABEL_V2 = true)
        this._labelDetectionV2 = labelDetectionV2;

        // PERFORMANCE: Frame limiting for mousemove
        this._moveRafId = null;
        this._pendingMoveEvent = null;

        // ============ BBOX REFINEMENT STATE ============
        this._refinerActive = false;
        this._refinerPreview = null;
        this._refinerClickCount = 0;
        this._lastClickTime = 0;

        // ============ DRAG STATE ============
        this._dragState = null;  // { edge, startX, startY, startBbox }
        this._boundDragMove = this._onDragMove.bind(this);
        this._boundDragEnd = this._onDragEnd.bind(this);

        // V3.9: CRASH PROTECTION - Prevent concurrent quick placements
        this._quickPlacementInProgress = false;
        this._lastMappingTime = 0;
        this._mappingCount = 0;
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
        // PERFORMANCE: Frame-limited mousemove - prevents jank during drawing
        document.addEventListener('mousemove', (e) => {
            // Early exit if not drawing - minimal overhead
            if (!this.isDrawing) return;
            // Queue event for next frame
            this._pendingMoveEvent = e;
            if (!this._moveRafId) {
                this._moveRafId = requestAnimationFrame(() => {
                    this._moveRafId = null;
                    if (this._pendingMoveEvent) {
                        this._onMouseMove(this._pendingMoveEvent);
                        this._pendingMoveEvent = null;
                    }
                });
            }
        });
        document.addEventListener('mouseup', (e) => this._onMouseUp(e));

        // V3.2: Prevent context menu during refiner mode (we use right-click for cycling)
        this.overlayLayer.addEventListener('contextmenu', (e) => {
            if (this._refinerActive) {
                e.preventDefault();
                // V3.2: Handle right-click for cycling back (works on laptops too)
                const coords = this._getLayerCoordinates(e.clientX, e.clientY);
                this._handleRightClickCycle(coords.x, coords.y);
            }
        });

        // Touch support
        this.overlayLayer.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
        document.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this._onTouchEnd(e));

        // V3.4: Window resize handler - cancel active drawing to prevent coordinate mismatch
        // When window resizes, the overlay layer dimensions change but startX/startY are stale
        this._boundResizeHandler = this._onWindowResize.bind(this);
        window.addEventListener('resize', this._boundResizeHandler);

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
                    // In CLICK_CIRCLES step, Enter finishes the group
                    if (builder.step === RadioGroupSteps.CLICK_CIRCLES) {
                        // Only finish if not in word selection mode
                        if (!window.wordSelector || !window.wordSelector.isActive()) {
                            this.finishRadioGroup();
                        }
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

            // Cancel drawing or refiner
            if (e.key === 'Escape') {
                if (this._refinerActive) {
                    e.preventDefault();
                    this._cancelRefiner();
                    return;
                }
                if (this.isDrawing) {
                    this._cancelDraw();
                }
            }

            // Enter to confirm refiner
            if (e.key === 'Enter' && this._refinerActive) {
                e.preventDefault();
                const bbox = bboxRefiner.getCurrentBbox();
                if (bbox) {
                    this._finalizeRefiner(bbox);
                }
                return;
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

            // Cancel refiner if tool changes
            if (this._refinerActive && tool !== Tools.DRAW_TEXT) {
                this._cancelRefiner();
            }

            // V3.13: Cancel WordSelector when switching to drawing tools
            // This prevents WordSelector from blocking DrawController clicks
            if (window.wordSelector && window.wordSelector.isActive()) {
                const drawingTools = [Tools.DRAW_TEXT, Tools.DRAW_CHECKBOX, Tools.DRAW_RADIO, Tools.DRAW_CIRCLE, Tools.DRAW_TABLE, Tools.SELECT];
                if (drawingTools.includes(tool)) {
                    console.log('[DrawController] Cancelling WordSelector due to tool change to:', tool);
                    window.wordSelector.cancelSelection();
                }
            }
        });

        // Clear AutoBoxer geometry cache on page change
        // V3.10: Also cancel any active refiner/drawing state
        eventBus.on(Events.PDF_PAGE_CHANGED, () => {
            autoBoxer.clearCache();
            this._cleanupOnPageChange();
        });

        // V3.10: Clean up on flow mode change (Mapping ↔ QuickFill)
        eventBus.on(Events.QUICK_FILL_MODE_CHANGED, () => {
            this._cleanupOnModeChange();
        });

        // V3.4: Handle entity mapping mode choice
        eventBus.on(Events.ENTITY_MAPPING_MODE_CHANGED, ({ entityId, mode, detection }) => {
            console.log('[DrawController] Entity mapping mode changed:', entityId, mode);

            if (mode === EntityMappingMode.BATCH) {
                // User chose batch mode - offer batch mapping if applicable
                // Find the most recently mapped field in this entity to use as source
                const activeTarget = templateStore.getActiveTarget();
                if (activeTarget && activeTarget.entity_id === entityId) {
                    const duplicates = templateStore.getDuplicatesOf(activeTarget.template_field_id);
                    if (duplicates && duplicates.length > 0) {
                        const stateField = state.getFieldByTemplateId(activeTarget.template_field_id);
                        if (stateField && stateField.bbox) {
                            this._offerBatchMapping(stateField, stateField.bbox, duplicates);
                            return;
                        }
                    }
                }
                // No duplicates or no active target - just advance
                this._advanceToNextUnmapped();
            }
            // TABLE mode is handled by the dialog emitting ENTITY_TABLE_FLOW_START
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

        // ============ TOOL SHORTCUTS (from MapperCore keyboard) ============
        eventBus.on('tool:startRadioGroup', () => {
            this.startRadioGroupFlow();
        });

        eventBus.on('tool:startCheckboxGroup', () => {
            this.startCheckboxGroupFlow();
        });

        // ============ V3.5: GUIDED MAPPING INTEGRATION ============
        // When a guided mapping field is activated, set up pendingFieldData
        if (GuidedMappingEvents) {
            eventBus.on(GuidedMappingEvents.FIELD_ACTIVATED, (data) => {
                this._onGuidedFieldActivated(data);
            });

            // When guided mapping is deactivated, clear any pending data
            eventBus.on(GuidedMappingEvents.DEACTIVATED, () => {
                this._onGuidedMappingDeactivated();
            });
        }
    }

    /**
     * V3.5: Handle guided mapping field activation
     * Sets up pendingFieldData from Field Intelligence
     * @param {Object} data - { field, order, total }
     */
    _onGuidedFieldActivated(data) {
        const { field, order, total } = data;
        if (!field) return;

        console.log(`[DrawController] Guided field activated: #${order}/${total} - "${field.name_he}"`);

        // Get full field data from Field Intelligence
        const fullField = fieldIntelligenceStore.getFieldFull(field.id);

        // Determine the correct field type
        const fieldType = this._mapSemanticDataType(fullField?.semantics?.data_type);

        // Set pending field data for the next draw operation
        this.pendingFieldData = {
            label_he: field.name_he,
            label_en: field.id, // Use the field ID as English name
            type: fieldType,
            canonical: field.id,
            context: fullField?.semantics?.purpose_short || '',
            category: fullField?.section_id || null,
            source: 'guided_mapping',
            guidedOrder: order,
            guidedFieldId: field.id
        };

        // V3.5: Set the correct tool based on field type
        let tool = Tools.DRAW_TEXT;
        if (fieldType === 'checkbox') {
            tool = Tools.DRAW_CHECKBOX;
        } else if (fieldType === 'radio') {
            tool = Tools.DRAW_RADIO;
        } else if (fieldType === 'signature') {
            tool = Tools.DRAW_TEXT; // Signature uses text tool for now
        }
        state.setTool(tool);

        console.log('[DrawController] Pending data set for guided field:', this.pendingFieldData, 'tool:', tool);
    }

    /**
     * V3.5: Handle guided mapping deactivation
     */
    _onGuidedMappingDeactivated() {
        // Clear any pending guided data
        if (this.pendingFieldData?.source === 'guided_mapping') {
            console.log('[DrawController] Clearing guided mapping pending data');
            this.pendingFieldData = null;
        }
    }

    /**
     * V3.5: Map semantic data type from Field Intelligence to field type
     * @param {string} semanticType - Semantic data type from Field Intelligence
     * @returns {string} Field type for state
     */
    _mapSemanticDataType(semanticType) {
        const typeMap = {
            'israeli_id': 'text',
            'passport_number': 'text',
            'person_name': 'text',
            'organization_name': 'text',
            'phone': 'text',
            'email': 'text',
            'address': 'text',
            'city': 'text',
            'postal_code': 'text',
            'date': 'text',
            'currency': 'number',
            'percentage': 'number',
            'count': 'number',
            'number': 'number',
            'enum': 'text',
            'boolean': 'checkbox',
            'free_text': 'text',
            'signature': 'signature'
        };
        return typeMap[semanticType] || 'text';
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

        // V3.10: Check new TableSelectMode
        if (window.tableSelectMode && window.tableSelectMode.isActive()) {
            return true;
        }

        // Always allow drawing when table flow is active (V1)
        if (window.tableFlowUI && window.tableFlowUI.isActive()) {
            return true;
        }

        // Check TableToolbarMode (legacy toolbar-integrated mode)
        if (window.tableToolbarMode && window.tableToolbarMode.isActive()) {
            return true;
        }

        const tool = state.get('tool');
        return [Tools.DRAW_TEXT, Tools.DRAW_CHECKBOX, Tools.DRAW_RADIO, Tools.DRAW_CIRCLE, Tools.DRAW_TABLE, Tools.DRAW_SIGNATURE, Tools.DRAW_CELL, Tools.CAPTURE_NAME].includes(tool);
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
        // === TABLE TOOLBAR MODE – MUST BE FIRST ===
        // When table mode is active, it has exclusive control over drawing
        if (window.tableToolbarMode?.isActive?.()) {
            // Table mode handles its own drawing via DRAW_END event
            // Just let the normal drawing flow continue - _finishDraw will route to table mode
            // But prevent any radio/checkbox/guided mode interference
            const tool = state.get('tool');
            if (tool !== Tools.DRAW_TABLE && tool !== 'draw_table') {
                // Force table tool
                state.setTool(Tools.DRAW_TABLE);
            }
        }

        if (!this._isDrawingTool()) return;

        // Don't interfere with WordSelector - let it handle clicks
        if (window.wordSelector && window.wordSelector.isActive()) {
            return;
        }

        // Don't start drawing if clicking on existing field or word overlay
        if (e.target.classList.contains('field-overlay') ||
            e.target.classList.contains('resize-handle') ||
            e.target.classList.contains('word-selectable')) {
            return;
        }

        const coords = this._getLayerCoordinates(e.clientX, e.clientY);

        // V3.2: Right-click during refiner = cycle back
        if (e.button === 2 && this._refinerActive) {
            e.preventDefault();
            this._handleRightClickCycle(coords.x, coords.y);
            return;
        }

        // ============ TABLE AUTOBOXER: Single-click for COLUMNS step ============
        // When table flow is in COLUMNS step, use AutoBoxer for cell detection
        if (window.tableFlowUI && window.tableFlowUI.supportsAutoBoxClick()) {
            window.tableFlowUI.onClickForAutoBox(coords.x, coords.y);
            return;
        }

        // ============ AUTOBOXER: Single-click for DRAW_TEXT tool ============
        // AutoBoxer computes bbox from click, then existing _finishDraw handles field creation
        // Note: Checkbox/Radio have their own engine - do NOT use AutoBoxer for them
        const tool = state.get('tool');
        if (tool === Tools.DRAW_TEXT) {
            this._autoBoxAndFinish(coords.x, coords.y);
            return;
        }

        // All other tools use manual drawing
        this._startDraw(coords.x, coords.y);
    }

    /**
     * V3.2: Handle right-click to cycle back to previous wall
     */
    _handleRightClickCycle(clickX, clickY) {
        const bbox = bboxRefiner.getCurrentBbox();
        const edge = this._detectCycleEdge(clickX, clickY, bbox);

        if (!edge) {
            // Right-click in center - cancel
            this._cancelRefiner();
            return;
        }

        const result = bboxRefiner.cycleWallBack(edge);

        if (!result) {
            this._showToast('לא ניתן לחזור אחורה', 'warning');
            return;
        }

        // Update preview
        this._updateRefinerPreview(result.bbox, result.action, result.edge);

        if (result.action === 'cycle_back') {
            const info = bboxRefiner.getCandidateInfo(edge);
            const progress = info ? `(${info.currentIndex + 1}/${info.total})` : '';
            this._showToast(`חזרה: ${result.message} ${progress}`, 'info');
        } else if (result.action === 'none') {
            this._showToast(result.message || 'כבר בקיר הראשון', 'info');
        }
    }

    /**
     * AutoBoxer single-click flow for DRAW_TEXT (Placement step)
     * Supports progressive refinement via BboxRefiner
     *
     * FLOW:
     * - First click: Compute initial bbox, show preview
     * - Subsequent clicks: Refine bbox based on click position
     * - Click in center OR double-click: Confirm and create field
     *
     * @param {number} clickX - Click X coordinate
     * @param {number} clickY - Click Y coordinate
     */
    async _autoBoxAndFinish(clickX, clickY) {
        const now = Date.now();
        const timeSinceLastClick = now - this._lastClickTime;
        this._lastClickTime = now;

        // ============ V3.9: INTENT SHORTCUT - Skip refiner for PLACE_FIELD ============
        // When placing an existing field (e.g., from sidebar click), use quick single-click flow
        const intent = intentManager.getIntent();
        if (intent.type === IntentType.PLACE_FIELD && intent.targetId) {
            // CRASH PROTECTION: Prevent concurrent placements
            if (this._quickPlacementInProgress) {
                console.warn('[DrawController] Quick placement already in progress, ignoring');
                return;
            }

            // CRASH PROTECTION: Rate limit - max 3 mappings per second
            const now = Date.now();
            if (now - this._lastMappingTime < 300) {
                this._mappingCount++;
                if (this._mappingCount > 5) {
                    console.error('[DrawController] CRITICAL: Mapping too fast, blocking');
                    return;
                }
            } else {
                this._mappingCount = 0;
            }
            this._lastMappingTime = now;

            // Get the target field to check placementMode
            const targetField = state.getField(intent.targetId);

            // V3.9.1: Symbol placement for checkbox/radio
            // - Radio: ALWAYS small circle (no auto mode)
            // - Checkbox: small square by default, or AutoBoxer if placementMode === 'auto'
            const isRadio = targetField?.type === 'radio';
            const isCheckbox = targetField?.type === 'checkbox';
            const useSymbolPlacement = isRadio || (isCheckbox && targetField?.placementMode !== 'auto');

            if (useSymbolPlacement) {
                // Symbol placement: create fixed-size box at click position
                this._quickPlacementInProgress = true;
                console.log('[DrawController] PLACE_FIELD Symbol mode:', intent.targetId);

                const SYMBOL_SIZE = 24;
                const bbox = {
                    x: clickX - SYMBOL_SIZE / 2,
                    y: clickY - SYMBOL_SIZE / 2,
                    width: SYMBOL_SIZE,
                    height: SYMBOL_SIZE
                };

                this.startX = bbox.x;
                this.startY = bbox.y;
                this.isDrawing = true;

                if (this.previewElement) {
                    this.previewElement.remove();
                }
                this.previewElement = document.createElement('div');
                this.previewElement.className = 'drawing-preview';
                this.drawingLayer.appendChild(this.previewElement);

                state.setMode(Modes.DRAWING);
                this._finishDraw(bbox.x + bbox.width, bbox.y + bbox.height);

                this._quickPlacementInProgress = false;
                return;
            }

            // V3.9.1: For 'auto' placementMode or regular text fields:
            // Fall through to full AutoBoxer flow with refiner UI
            // Intent stays active - _finishDraw will use it to update the existing field
            console.log('[DrawController] PLACE_FIELD Auto mode - using full AutoBoxer flow:', intent.targetId);
        }

        // Double-click detection (within 400ms) - confirm immediately
        const isDoubleClick = timeSinceLastClick < 400 && this._refinerActive;

        // ============ ACTIVE REFINEMENT SESSION ============
        // V3.2: Clicks cycle through wall candidates instead of moving to exact point
        if (this._refinerActive) {
            console.log('[DrawController] Refiner active - processing cycle click');

            // Detect which edge to cycle based on click position
            const bbox = bboxRefiner.getCurrentBbox();
            const edge = this._detectCycleEdge(clickX, clickY, bbox);

            if (!edge) {
                // Click in center - do nothing (Enter to confirm)
                this._showToast('Enter לאישור | קליק בצד להרחבה', 'info');
                return;
            }

            // V3.2: Cycle to next wall candidate
            const result = bboxRefiner.cycleWall(edge);

            if (!result) {
                this._showToast('לא ניתן להרחיב', 'warning');
                return;
            }

            this._refinerClickCount++;

            // Update preview
            this._updateRefinerPreview(result.bbox, result.action, result.edge);

            // Show feedback based on result
            if (result.action === 'cycle') {
                const info = bboxRefiner.getCandidateInfo(edge);
                const progress = info ? `(${info.currentIndex + 1}/${info.total})` : '';
                this._showToast(`${result.message} ${progress} | Enter לאישור`, 'info');
            } else if (result.action === 'blocked') {
                this._showToast(`${result.message} - קיר קשיח`, 'warning');
            } else if (result.action === 'none') {
                this._showToast(result.message || 'Enter לאישור', 'info');
            }

            return;
        }

        // ============ FIRST CLICK - INITIALIZE ============
        console.log('[DrawController] AutoBoxer mode - initializing bbox from click at', clickX, clickY);

        // V3.9.1: Check if we have an active PLACE_FIELD intent (for excluding target from neighbors)
        const activeIntent = intentManager.getIntent();
        const targetFieldId = (activeIntent.type === IntentType.PLACE_FIELD) ? activeIntent.targetId : null;

        // Provide neighbor bboxes for collision detection
        const existingFields = state.get('fields') || [];
        const neighborBboxes = existingFields
            .filter(f => f.bbox && f.id !== targetFieldId)  // Exclude target field if placing
            .map(f => overlayRenderer.bboxToScreen(f.bbox));

        // V3.10: Also include QuickFill boxes for collision detection
        const isQuickFillMode = state.getFlowMode() === FlowModes.QUICK_FILL;
        if (isQuickFillMode && quickFillOverlay) {
            const currentPage = pdfEngine.currentPage;
            const quickFillBoxes = quickFillOverlay.getAllBoxes()
                .filter(box => box.page === currentPage && box.screenRect)
                .map(box => box.screenRect);  // screenRect is already { x, y, width, height }
            neighborBboxes.push(...quickFillBoxes);
            console.log('[DrawController] Added', quickFillBoxes.length, 'QuickFill boxes for collision');
        }

        console.log('[DrawController] Existing fields for collision:', neighborBboxes.length, 'excluding:', targetFieldId);
        bboxRefiner.setNeighbors(neighborBboxes);

        // Initialize refiner with first click
        const initResult = await bboxRefiner.initFromClick(clickX, clickY);

        if (!initResult || !initResult.bbox) {
            console.warn('[DrawController] BboxRefiner returned null, cancelling');
            this._showToast('לא ניתן לזהות שדה במיקום זה', 'warning');
            return;
        }

        const bbox = initResult.bbox;
        console.log('[DrawController] Initial bbox:', bbox, 'problemType:', initResult.problemType);

        // Activate refiner mode
        this._refinerActive = true;
        this._refinerClickCount = 1;

        // Create preview element
        this._createRefinerPreview(bbox);

        // V3.11: In QuickFill mode, update instruction bar instead of toast
        // Note: isQuickFillMode already declared above at line 689
        if (isQuickFillMode && quickFillOverlay) {
            quickFillOverlay.setInstructionState('refiner');
        } else {
            // Show guidance based on problem type (Mapper mode)
            const problemMessages = {
                'SLASHES': 'זוהו לוכסנים - לחץ מעבר להם להרחבה',
                'DASHED_FLOOR': 'ריצפה מקווקווית - לחץ להרחבה',
                'NO_WALLS': 'אין קירות ברורים - לחץ לקבוע גבולות',
                'NORMAL': 'לחץ באמצע לאישור, או בחוץ להרחבה'
            };
            const message = problemMessages[initResult.problemType] || problemMessages['NORMAL'];
            this._showToast(message, 'info');
        }
    }

    /**
     * Create refiner preview element with draggable edges
     */
    _createRefinerPreview(bbox) {
        // Remove existing preview
        if (this._refinerPreview) {
            this._refinerPreview.remove();
        }

        // V3.2: Round coordinates to match final field rendering (prevents pixel shift on confirm)
        const x = Math.round(bbox.x);
        const y = Math.round(bbox.y);
        const width = Math.round(bbox.width);
        const height = Math.round(bbox.height);

        this._refinerPreview = document.createElement('div');
        this._refinerPreview.className = 'refiner-preview';
        this._refinerPreview.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: ${width}px;
            height: ${height}px;
            border: 2px solid #2196F3;
            background: rgba(33, 150, 243, 0.08);
            pointer-events: none;
            z-index: 1000;
            box-sizing: border-box;
        `;

        // Drag zone size (invisible but draggable area on each edge)
        const DRAG_ZONE = 12;

        // Create drag zones for each edge
        const edges = ['left', 'right', 'top', 'bottom'];
        const cursors = { left: 'ew-resize', right: 'ew-resize', top: 'ns-resize', bottom: 'ns-resize' };

        edges.forEach(edge => {
            const zone = document.createElement('div');
            zone.className = `drag-zone drag-zone-${edge}`;
            zone.dataset.edge = edge;

            let zoneStyle = `
                position: absolute;
                pointer-events: auto;
                cursor: ${cursors[edge]};
                z-index: 1001;
            `;

            switch (edge) {
                case 'left':
                    zoneStyle += `left: -${DRAG_ZONE/2}px; top: 0; width: ${DRAG_ZONE}px; height: 100%;`;
                    break;
                case 'right':
                    zoneStyle += `right: -${DRAG_ZONE/2}px; top: 0; width: ${DRAG_ZONE}px; height: 100%;`;
                    break;
                case 'top':
                    zoneStyle += `top: -${DRAG_ZONE/2}px; left: 0; width: 100%; height: ${DRAG_ZONE}px;`;
                    break;
                case 'bottom':
                    zoneStyle += `bottom: -${DRAG_ZONE/2}px; left: 0; width: 100%; height: ${DRAG_ZONE}px;`;
                    break;
            }

            zone.style.cssText = zoneStyle;

            // Add mousedown handler for drag start
            zone.addEventListener('mousedown', (e) => this._onDragStart(e, edge));

            this._refinerPreview.appendChild(zone);
        });

        // Add corner handles for diagonal resize
        const corners = ['nw', 'ne', 'sw', 'se'];
        corners.forEach(corner => {
            const handle = document.createElement('div');
            handle.className = `drag-corner drag-corner-${corner}`;
            handle.dataset.corner = corner;

            let cornerStyle = `
                position: absolute;
                width: 10px;
                height: 10px;
                background: #2196F3;
                border: 1px solid white;
                border-radius: 2px;
                pointer-events: auto;
                z-index: 1002;
            `;

            switch (corner) {
                case 'nw':
                    cornerStyle += `left: -5px; top: -5px; cursor: nwse-resize;`;
                    break;
                case 'ne':
                    cornerStyle += `right: -5px; top: -5px; cursor: nesw-resize;`;
                    break;
                case 'sw':
                    cornerStyle += `left: -5px; bottom: -5px; cursor: nesw-resize;`;
                    break;
                case 'se':
                    cornerStyle += `right: -5px; bottom: -5px; cursor: nwse-resize;`;
                    break;
            }

            handle.style.cssText = cornerStyle;

            // Add mousedown handler for corner drag
            handle.addEventListener('mousedown', (e) => this._onCornerDragStart(e, corner));

            this._refinerPreview.appendChild(handle);
        });

        // Add center zone for moving the whole bbox
        const centerZone = document.createElement('div');
        centerZone.className = 'drag-zone-center';
        centerZone.style.cssText = `
            position: absolute;
            left: ${DRAG_ZONE}px;
            top: ${DRAG_ZONE}px;
            right: ${DRAG_ZONE}px;
            bottom: ${DRAG_ZONE}px;
            pointer-events: auto;
            cursor: move;
            z-index: 1000;
        `;
        centerZone.addEventListener('mousedown', (e) => this._onCenterDragStart(e));
        centerZone.addEventListener('click', (e) => this._onCenterClick(e));
        // V3.2: Right-click on center zone = cycle back (works on laptops)
        centerZone.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = this.drawingLayer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            this._handleRightClickCycle(clickX, clickY);
        });
        this._refinerPreview.appendChild(centerZone);

        // Add arrow indicators (visual hint)
        const arrowStyle = `
            position: absolute;
            width: 0;
            height: 0;
            opacity: 0.6;
            pointer-events: none;
        `;

        // Left arrow
        const leftArrow = document.createElement('div');
        leftArrow.style.cssText = arrowStyle + `
            left: -8px; top: 50%; transform: translateY(-50%);
            border-top: 5px solid transparent;
            border-bottom: 5px solid transparent;
            border-right: 6px solid #2196F3;
        `;
        this._refinerPreview.appendChild(leftArrow);

        // Right arrow
        const rightArrow = document.createElement('div');
        rightArrow.style.cssText = arrowStyle + `
            right: -8px; top: 50%; transform: translateY(-50%);
            border-top: 5px solid transparent;
            border-bottom: 5px solid transparent;
            border-left: 6px solid #2196F3;
        `;
        this._refinerPreview.appendChild(rightArrow);

        // Top arrow
        const topArrow = document.createElement('div');
        topArrow.style.cssText = arrowStyle + `
            top: -8px; left: 50%; transform: translateX(-50%);
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-bottom: 6px solid #2196F3;
        `;
        this._refinerPreview.appendChild(topArrow);

        // Bottom arrow
        const bottomArrow = document.createElement('div');
        bottomArrow.style.cssText = arrowStyle + `
            bottom: -8px; left: 50%; transform: translateX(-50%);
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid #2196F3;
        `;
        this._refinerPreview.appendChild(bottomArrow);

        this.drawingLayer.appendChild(this._refinerPreview);
    }

    /**
     * Handle drag start on edge
     */
    _onDragStart(e, edge) {
        e.preventDefault();
        e.stopPropagation();

        const currentBbox = bboxRefiner.getCurrentBbox();
        if (!currentBbox) return;

        this._dragState = {
            edge,
            startX: e.clientX,
            startY: e.clientY,
            startBbox: { ...currentBbox }
        };

        // Add document-level listeners for drag
        document.addEventListener('mousemove', this._boundDragMove);
        document.addEventListener('mouseup', this._boundDragEnd);

        // Visual feedback
        this._refinerPreview.style.transition = 'none';
    }

    /**
     * Handle corner drag start
     */
    _onCornerDragStart(e, corner) {
        e.preventDefault();
        e.stopPropagation();

        const currentBbox = bboxRefiner.getCurrentBbox();
        if (!currentBbox) return;

        // Corner maps to two edges
        const edgeMap = {
            'nw': ['left', 'top'],
            'ne': ['right', 'top'],
            'sw': ['left', 'bottom'],
            'se': ['right', 'bottom']
        };

        this._dragState = {
            corner,
            edges: edgeMap[corner],
            startX: e.clientX,
            startY: e.clientY,
            startBbox: { ...currentBbox }
        };

        document.addEventListener('mousemove', this._boundDragMove);
        document.addEventListener('mouseup', this._boundDragEnd);

        this._refinerPreview.style.transition = 'none';
    }

    /**
     * Handle drag move
     */
    _onDragMove(e) {
        if (!this._dragState) return;

        const deltaX = e.clientX - this._dragState.startX;
        const deltaY = e.clientY - this._dragState.startY;
        const startBbox = this._dragState.startBbox;
        const MIN_SIZE = 20;

        let newBbox = { ...startBbox };

        if (this._dragState.type === 'move') {
            // Move entire bbox
            newBbox.x = startBbox.x + deltaX;
            newBbox.y = startBbox.y + deltaY;
        } else if (this._dragState.corner) {
            // Corner drag - adjust two edges
            for (const edge of this._dragState.edges) {
                this._applyEdgeDelta(newBbox, edge, deltaX, deltaY, MIN_SIZE);
            }
        } else {
            // Single edge drag
            this._applyEdgeDelta(newBbox, this._dragState.edge, deltaX, deltaY, MIN_SIZE);
        }

        // Update preview immediately (no transition for smooth drag)
        this._refinerPreview.style.left = `${newBbox.x}px`;
        this._refinerPreview.style.top = `${newBbox.y}px`;
        this._refinerPreview.style.width = `${newBbox.width}px`;
        this._refinerPreview.style.height = `${newBbox.height}px`;

        // Store for drag end
        this._dragState.currentBbox = newBbox;
    }

    /**
     * Apply delta to a single edge
     */
    _applyEdgeDelta(bbox, edge, deltaX, deltaY, minSize) {
        switch (edge) {
            case 'left':
                const newLeft = this._dragState.startBbox.x + deltaX;
                const maxLeft = this._dragState.startBbox.x + this._dragState.startBbox.width - minSize;
                bbox.x = Math.min(newLeft, maxLeft);
                bbox.width = this._dragState.startBbox.x + this._dragState.startBbox.width - bbox.x;
                break;
            case 'right':
                const newWidth = this._dragState.startBbox.width + deltaX;
                bbox.width = Math.max(newWidth, minSize);
                break;
            case 'top':
                const newTop = this._dragState.startBbox.y + deltaY;
                const maxTop = this._dragState.startBbox.y + this._dragState.startBbox.height - minSize;
                bbox.y = Math.min(newTop, maxTop);
                bbox.height = this._dragState.startBbox.y + this._dragState.startBbox.height - bbox.y;
                break;
            case 'bottom':
                const newHeight = this._dragState.startBbox.height + deltaY;
                bbox.height = Math.max(newHeight, minSize);
                break;
        }
    }

    /**
     * Handle drag end
     */
    async _onDragEnd(e) {
        document.removeEventListener('mousemove', this._boundDragMove);
        document.removeEventListener('mouseup', this._boundDragEnd);

        if (!this._dragState || !this._dragState.currentBbox) {
            this._dragState = null;
            return;
        }

        const finalBbox = this._dragState.currentBbox;

        // Apply boundary checks via BboxRefiner (text/field collision)
        // We'll simulate clicks at the new edge positions to apply the same rules
        const startBbox = this._dragState.startBbox;

        // Update refiner's internal bbox directly
        bboxRefiner._currentBbox = finalBbox;

        // Re-enable transition
        this._refinerPreview.style.transition = 'all 0.15s ease-out';

        console.log('[DrawController] Drag complete:', {
            from: startBbox,
            to: finalBbox
        });

        this._dragState = null;
    }

    /**
     * Handle center zone drag start (move entire bbox)
     */
    _onCenterDragStart(e) {
        e.preventDefault();
        e.stopPropagation();

        const currentBbox = bboxRefiner.getCurrentBbox();
        if (!currentBbox) return;

        this._dragState = {
            type: 'move',
            startX: e.clientX,
            startY: e.clientY,
            startBbox: { ...currentBbox }
        };

        document.addEventListener('mousemove', this._boundDragMove);
        document.addEventListener('mouseup', this._boundDragEnd);

        this._refinerPreview.style.transition = 'none';
    }

    /**
     * Handle click inside center zone (shrink nearest edge)
     */
    async _onCenterClick(e) {
        // Only process if it wasn't a drag
        if (this._dragState && this._dragState.currentBbox) {
            return; // Was a drag, not a click
        }

        e.preventDefault();
        e.stopPropagation();

        // Get click position relative to overlay
        const rect = this.drawingLayer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // V3.2: Use wall cycling instead of old refine()
        const bbox = bboxRefiner.getCurrentBbox();
        if (!bbox) {
            console.warn('[DrawController] _onCenterClick: No current bbox');
            return;
        }

        // Detect which edge was clicked based on position
        const edge = this._detectCycleEdge(clickX, clickY, bbox);

        if (!edge) {
            console.log('[DrawController] Click in center - no edge to cycle');
            return;
        }

        console.log(`[DrawController] Cycling ${edge} wall`);
        const result = bboxRefiner.cycleWall(edge);

        if (result && result.bbox) {
            this._updateRefinerPreview(result.bbox, result.action, result.edge);

            if (result.action === 'cycle') {
                const info = bboxRefiner.getCandidateInfo(edge);
                this._showToast(`${this._edgeToHebrew(edge)}: ${info.currentIndex + 1}/${info.total} - ${result.candidate?.description || ''}`, 'info');
            } else if (result.message) {
                this._showToast(result.message, 'info');
            }
        }
    }

    /**
     * Update refiner preview
     */
    _updateRefinerPreview(bbox, action, edge) {
        if (!this._refinerPreview) {
            this._createRefinerPreview(bbox);
            return;
        }

        // V3.2: Round coordinates to match final field rendering (prevents pixel shift on confirm)
        const x = Math.round(bbox.x);
        const y = Math.round(bbox.y);
        const width = Math.round(bbox.width);
        const height = Math.round(bbox.height);

        // Animate the change
        this._refinerPreview.style.transition = 'all 0.15s ease-out';
        this._refinerPreview.style.left = `${x}px`;
        this._refinerPreview.style.top = `${y}px`;
        this._refinerPreview.style.width = `${width}px`;
        this._refinerPreview.style.height = `${height}px`;

        // Flash green when edge changes
        if (edge) {
            this._refinerPreview.style.borderColor = '#4CAF50';
            setTimeout(() => {
                if (this._refinerPreview) {
                    this._refinerPreview.style.borderColor = '#2196F3';
                }
            }, 200);
        }
    }

    /**
     * Finalize refiner and create field
     */
    _finalizeRefiner(bbox) {
        console.log('[DrawController] Finalizing refiner with bbox:', bbox);

        // Clean up drag state
        if (this._dragState) {
            document.removeEventListener('mousemove', this._boundDragMove);
            document.removeEventListener('mouseup', this._boundDragEnd);
            this._dragState = null;
        }

        // Clean up preview
        if (this._refinerPreview) {
            this._refinerPreview.remove();
            this._refinerPreview = null;
        }

        // Reset refiner state
        this._refinerActive = false;
        this._refinerClickCount = 0;
        bboxRefiner.reset();

        // V3.11: In QuickFill mode, update instruction bar to "typing" state
        const isQuickFillMode = state.get('flowMode') === FlowModes.QUICK_FILL;
        if (isQuickFillMode && quickFillOverlay) {
            quickFillOverlay.setInstructionState('typing');
        }

        // Create the field using existing flow
        this.startX = bbox.x;
        this.startY = bbox.y;

        const endX = bbox.x + bbox.width;
        const endY = bbox.y + bbox.height;

        this.isDrawing = true;

        this.previewElement = document.createElement('div');
        this.previewElement.className = 'drawing-preview';
        this.drawingLayer.appendChild(this.previewElement);

        const currentMode = state.get('mode');
        if (currentMode !== Modes.RADIO_GROUP_BUILDING) {
            state.setMode(Modes.DRAWING);
        }

        this._finishDraw(endX, endY);
    }

    /**
     * Cancel refiner session
     */
    _cancelRefiner() {
        // Clean up drag state
        if (this._dragState) {
            document.removeEventListener('mousemove', this._boundDragMove);
            document.removeEventListener('mouseup', this._boundDragEnd);
            this._dragState = null;
        }

        if (this._refinerPreview) {
            this._refinerPreview.remove();
            this._refinerPreview = null;
        }
        this._refinerActive = false;
        this._refinerClickCount = 0;
        bboxRefiner.reset();

        // V3.11: In QuickFill mode, reset instruction bar; otherwise show toast
        const isQuickFillMode = state.get('flowMode') === FlowModes.QUICK_FILL;
        if (isQuickFillMode && quickFillOverlay) {
            quickFillOverlay.setInstructionState('default', 'draw_text');
        } else {
            this._showToast('בוטל', 'warning');
        }
    }

    /**
     * V3.10: Clean up state when page changes
     * Silently cancels any active refiner/drawing (no toast)
     */
    _cleanupOnPageChange() {
        // Cancel refiner without toast
        if (this._refinerActive) {
            if (this._dragState) {
                document.removeEventListener('mousemove', this._boundDragMove);
                document.removeEventListener('mouseup', this._boundDragEnd);
                this._dragState = null;
            }
            if (this._refinerPreview) {
                this._refinerPreview.remove();
                this._refinerPreview = null;
            }
            this._refinerActive = false;
            this._refinerClickCount = 0;
            bboxRefiner.reset();
            console.log('[DrawController] Refiner cancelled on page change');
        }

        // Cancel drawing without toast
        if (this.isDrawing) {
            if (this.previewElement) {
                this.previewElement.remove();
                this.previewElement = null;
            }
            this.isDrawing = false;
            state.setMode(Modes.IDLE);
            console.log('[DrawController] Drawing cancelled on page change');
        }
    }

    /**
     * V3.10: Clean up state when flow mode changes (Mapping ↔ QuickFill)
     * Silently cancels any active refiner/drawing (no toast)
     */
    _cleanupOnModeChange() {
        // Same cleanup as page change
        this._cleanupOnPageChange();
        console.log('[DrawController] Cleanup on flow mode change');
    }

    /**
     * Helper: Edge name to Hebrew
     */
    _edgeToHebrew(edge) {
        const names = {
            'left': 'שמאל',
            'right': 'ימין',
            'top': 'למעלה',
            'bottom': 'למטה'
        };
        return names[edge] || edge;
    }

    /**
     * V3.2: Detect which edge to cycle based on click position
     * Click OUTSIDE bbox → return that edge direction
     * Click INSIDE center → return null (no cycle)
     * @param {number} clickX
     * @param {number} clickY
     * @param {Object} bbox - { x, y, width, height }
     * @returns {string|null} 'left', 'right', 'top', 'bottom', or null
     */
    _detectCycleEdge(clickX, clickY, bbox) {
        if (!bbox) return null;

        const bboxRight = bbox.x + bbox.width;
        const bboxBottom = bbox.y + bbox.height;
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;

        // Click outside bbox - determine which side
        if (clickX < bbox.x) return 'left';
        if (clickX > bboxRight) return 'right';
        if (clickY < bbox.y) return 'top';
        if (clickY > bboxBottom) return 'bottom';

        // Click inside bbox - check if near an edge (within 30% of that dimension)
        const edgeZone = 0.3;
        const leftZone = bbox.x + bbox.width * edgeZone;
        const rightZone = bboxRight - bbox.width * edgeZone;
        const topZone = bbox.y + bbox.height * edgeZone;
        const bottomZone = bboxBottom - bbox.height * edgeZone;

        // Inside but near left edge
        if (clickX < leftZone) return 'left';
        // Inside but near right edge
        if (clickX > rightZone) return 'right';
        // Inside but near top edge
        if (clickY < topZone) return 'top';
        // Inside but near bottom edge
        if (clickY > bottomZone) return 'bottom';

        // Click in center - no edge to cycle
        return null;
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
        // === TABLE TOOLBAR MODE – MUST BE FIRST ===
        if (window.tableToolbarMode?.isActive?.()) {
            const tool = state.get('tool');
            if (tool !== Tools.DRAW_TABLE && tool !== 'draw_table') {
                state.setTool(Tools.DRAW_TABLE);
            }
        }

        if (!this._isDrawingTool()) return;
        if (e.touches.length !== 1) return;

        // Don't interfere with WordSelector
        if (window.wordSelector && window.wordSelector.isActive()) {
            return;
        }

        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        if (target && (target.classList.contains('field-overlay') ||
            target.classList.contains('resize-handle') ||
            target.classList.contains('word-selectable'))) {
            return;
        }

        e.preventDefault();
        const coords = this._getLayerCoordinates(touch.clientX, touch.clientY);

        // ============ AUTOBOXER: Single-tap for DRAW_TEXT tool ============
        // Note: Checkbox/Radio have their own engine - do NOT use AutoBoxer for them
        const tool = state.get('tool');
        if (tool === Tools.DRAW_TEXT) {
            this._autoBoxAndFinish(coords.x, coords.y);
            return;
        }

        // All other tools use manual drawing
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

        // ============ MANUAL LABEL DRAW MODE - From sidebar ============
        if (state.get('ui.labelDrawMode')) {
            this._handleManualLabelDraw(x, y, width, height);
            return;
        }

        // DEBUG: Log current mode
        const currentMode = state.get('mode');
        console.log('[DrawController] _finishDraw - currentMode:', currentMode, 'RADIO_GROUP_BUILDING:', Modes.RADIO_GROUP_BUILDING);

        // ============ TABLE SELECT MODE (V3.10) - New simple table system ============
        if (window.tableSelectMode?.isActive?.()) {
            console.log('[DrawController] TABLE SELECT MODE ACTIVE - emitting DRAW_END for table');
            // Use overlayRenderer.screenToBbox() for correct Y-axis flip
            // PDF coordinates use Y=0 at bottom, screen uses Y=0 at top
            const bbox = overlayRenderer.screenToBbox({ x, y, width, height });
            eventBus.emit(Events.DRAW_END, { bbox, tool: Tools.DRAW_TABLE });
            this.isDrawing = false;
            return;
        }

        // ============ TABLE TOOLBAR MODE (LEGACY) - MUST BE FIRST ============
        // When table mode is active, it has exclusive control - emit DRAW_END and exit
        if (window.tableToolbarMode?.isActive?.()) {
            console.log('[DrawController] TABLE MODE ACTIVE - emitting DRAW_END for table');
            const bbox = [x, y, width, height];  // Array format for consistency
            eventBus.emit(Events.DRAW_END, { bbox, tool: Tools.DRAW_TABLE });
            this.isDrawing = false;
            return;
        }

        // ============ TABLE FLOW MODE (OLD) - Check for active table flow ============
        // Legacy support - forward drawing to old table flow UI
        if (window.tableFlowUI && window.tableFlowUI.isActive()) {
            console.log('[DrawController] Forwarding to TableFlowUI (legacy)');
            const bbox = { x, y, width, height };
            window.tableFlowUI.onRectangleDrawn(bbox);
            this.isDrawing = false;
            return;
        }

        // ============ REVERSE MAPPING MODE - Raw bbox only, no field creation ============
        if (window.ReverseMappingMode?.isActive?.()) {
            console.log('[DrawController] REVERSE MAPPING MODE - emitting raw bbox without field creation');
            const tool = state.get('tool');
            // Emit the raw screen bbox directly - ReverseMappingMode will handle visualization
            eventBus.emit('REVERSE_DRAW_COMPLETE', {
                bbox: { x, y, width, height },
                tool: tool,
                page: state.getState().document.currentPage
            });
            this.isDrawing = false;
            state.setMode(Modes.IDLE);
            state.setTool(Tools.SELECT);
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
        const isCheckboxOrRadio = tool === Tools.DRAW_CHECKBOX || tool === Tools.DRAW_RADIO || tool === Tools.DRAW_CIRCLE;
        const isCell = tool === Tools.DRAW_CELL;  // V3.10: Cell type - no size constraints
        const isSignature = tool === Tools.DRAW_SIGNATURE;

        // ============ ONE-CLICK CREATION ============
        // If drawing is too small, handle based on tool type
        const ONE_CLICK_SIZE = 24;  // Fixed size for one-click checkbox/radio
        const ONE_CLICK_SIGNATURE_SIZE = { width: 120, height: 40 }; // Default signature size
        const isSmallDraw = width < this.options.minFieldSize || height < this.options.minFieldSize;

        let finalX = x;
        let finalY = y;
        let finalWidth = width;
        let finalHeight = height;

        if (isSmallDraw) {
            if (isCheckboxOrRadio) {
                // One-click creation for manual checkbox/radio: use click position as center, create 24×24 field
                finalX = this.startX - ONE_CLICK_SIZE / 2;
                finalY = this.startY - ONE_CLICK_SIZE / 2;
                finalWidth = ONE_CLICK_SIZE;
                finalHeight = ONE_CLICK_SIZE;
                console.log('[DrawController] One-click checkbox/radio at', this.startX, this.startY);
            } else if (isSignature) {
                // One-click creation for signature: use click position as top-left, create default size
                finalX = this.startX;
                finalY = this.startY;
                finalWidth = ONE_CLICK_SIGNATURE_SIZE.width;
                finalHeight = ONE_CLICK_SIGNATURE_SIZE.height;
                console.log('[DrawController] One-click signature at', this.startX, this.startY);
            } else {
                // For text fields, cancel if too small (AutoBoxer handles text field sizing)
                console.log('[DrawController] Drawing too small, cancelled');
                this._cancelDraw();
                return;
            }
        }

        // V3.9: CHECKBOX SIZE CONSTRAINT - Maximum 30x30 pixels for manual toolbar drawing
        // Sidebar checkbox/radio fields use DRAW_TEXT tool (AutoBoxer), so this only affects toolbar
        // V3.10: Cell type is EXCLUDED from constraints - preserves full drawn rectangle size
        const MAX_CHECKBOX_SIZE = 30;
        if (isCheckboxOrRadio && !isCell && (finalWidth > MAX_CHECKBOX_SIZE || finalHeight > MAX_CHECKBOX_SIZE)) {
            // Constrain to max size, centered on the drawn rectangle center
            const centerX = finalX + finalWidth / 2;
            const centerY = finalY + finalHeight / 2;
            finalWidth = Math.min(finalWidth, MAX_CHECKBOX_SIZE);
            finalHeight = Math.min(finalHeight, MAX_CHECKBOX_SIZE);
            finalX = centerX - finalWidth / 2;
            finalY = centerY - finalHeight / 2;
            console.log('[DrawController] Constrained checkbox/radio to max size:', finalWidth, 'x', finalHeight);
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
            case Tools.DRAW_CIRCLE:
                fieldType = 'circle';
                break;
            case Tools.DRAW_CELL:
                fieldType = 'cell';
                break;
            case Tools.DRAW_TABLE:
                fieldType = 'table';
                break;
        }

        // ============ COORDINATE CONVERSION ============
        // Use the overlayRenderer's screenToBbox for correct Y-axis flip
        // Use finalX/Y/Width/Height (may be adjusted for one-click creation)
        const bbox = overlayRenderer.screenToBbox({ x: finalX, y: finalY, width: finalWidth, height: finalHeight });

        // For checkbox/radio/circle/cell, also store anchor point (center of the field)
        if (fieldType === 'checkbox' || fieldType === 'radio' || fieldType === 'circle' || fieldType === 'cell') {
            const centerX = finalX + finalWidth / 2;
            const centerY = finalY + finalHeight / 2;
            const anchor = overlayRenderer.screenToAnchor(centerX, centerY);

            fieldData.anchor = anchor;
            fieldData.overlayWidth = finalWidth;
            fieldData.overlayHeight = finalHeight;
        }

        // ============ V3.10: QUICK FILL MODE - MUST BE CHECKED FIRST ============
        // In Quick Fill mode, we emit an event instead of creating a field
        // This allows LiveFill engine to handle the box directly
        const isQuickFill = state.isQuickFillMode();
        console.log('[DrawController] Quick Fill check:', {
            isQuickFill: isQuickFill,
            flowMode: state.getFlowMode(),
            bbox: bbox,
            screenRect: { x: finalX, y: finalY, width: finalWidth, height: finalHeight }
        });

        if (isQuickFill) {
            console.log('[DrawController] QUICK FILL MODE - emitting QUICK_FILL_BOX_CREATED event');

            eventBus.emit(Events.QUICK_FILL_BOX_CREATED, {
                bbox: bbox,
                screenRect: { x: finalX, y: finalY, width: finalWidth, height: finalHeight },
                page: state.get('document.currentPage'),
                tool: tool
            });

            // Clean up and exit - NO field created
            this.isDrawing = false;
            state.setMode(Modes.IDLE);
            return;
        }

        let field;

        // ============ V3.9: INTENT-BASED HANDLING (NEW UNIFIED FLOW) ============
        // Check Intent FIRST - this is the new canonical way to handle drawing
        const intent = intentManager.getIntent();
        console.log('[DrawController] _finishDraw - Intent:', intent.type, 'targetId:', intent.targetId);

        if (intent.type === IntentType.PLACE_FIELD && intent.targetId) {
            // V3.9: Place existing field using Intent
            const fieldId = intent.targetId;
            const existingField = state.getField(fieldId);

            if (existingField) {
                const currentPage = state.get('document.currentPage');

                // V3.10: For checkbox/radio/circle/cell, ALWAYS store overlayWidth/Height
                // This ensures proper rendering and duplication for both symbol and auto modes
                const isMarkField = existingField.type === 'checkbox' ||
                                   existingField.type === 'radio' ||
                                   existingField.type === 'circle' ||
                                   existingField.type === 'cell';

                if (isMarkField) {
                    fieldData.overlayWidth = finalWidth;
                    fieldData.overlayHeight = finalHeight;
                    console.log('[DrawController] PLACE_FIELD storing overlay dims:', finalWidth, 'x', finalHeight, 'mode:', existingField.placementMode || 'symbol');
                }

                // Update field with position
                field = state.updateField(fieldId, {
                    bbox: bbox,
                    page: currentPage,
                    isMapped: true,
                    status: 'mapped',
                    ...fieldData
                }, true);  // Add to history

                // V3.9: Skip toast if auto-advance is enabled (it shows its own toast)
                if (!window.autoAdvanceController?.isEnabled()) {
                    this._showToast(`שדה "${existingField.label_he || fieldId}" מופה בהצלחה!`, 'success');
                }
                console.log('[DrawController] V3.9 Intent: Placed field:', fieldId, 'bbox:', bbox, 'page:', currentPage, 'source:', intent.source);

                // Emit FIELD_MAPPED event
                eventBus.emit(Events.FIELD_MAPPED, { fieldId, source: intent.source });

                // V3.9: Emit DRAW_END so SidebarController can update UI
                eventBus.emit(Events.DRAW_END, { field });

                // Clear intent
                intentManager.clearIntent();

                // LEGACY: Also clear pendingFieldId for backward compatibility
                this.pendingFieldId = null;

                // Handle template integration if applicable
                if (templateStore.isLoaded() && existingField.templateFieldId) {
                    this._handleTemplateFieldMapped(existingField, bbox);
                }
            } else {
                console.warn('[DrawController] V3.9 Intent: Field not found:', fieldId);
                intentManager.clearIntent();
                this.pendingFieldId = null;
            }

            // Done - exit early
            this.isDrawing = false;
            state.setMode(Modes.IDLE);
            return;
        }

        // LEGACY: Old pendingFieldId check (will be removed after migration)
        console.log('[DrawController] _finishDraw - pendingFieldId:', this.pendingFieldId);

        // ============ TWO-PHASE MAPPING: Check for pending field ============
        if (this.pendingFieldId) {
            // Phase 2: Update existing unmapped field with position
            // IMPORTANT: Pass false for history - the field was already added to history in Phase 1
            // This makes the entire two-phase operation a single undo
            const pendingField = state.getField(this.pendingFieldId);
            const mappedFieldId = this.pendingFieldId;  // Save before clearing

            if (pendingField) {
                // V3.4: CRITICAL - Always set page when mapping (fixes template field bug)
                const currentPage = state.get('document.currentPage');

                // V3.5: Always add to history so mapping can be undone
                // (Previously skipped history for "two-phase" but this made undo impossible)
                field = state.updateField(this.pendingFieldId, {
                    bbox: bbox,
                    page: currentPage,  // V3.4: Explicit page assignment (invariant enforcement)
                    isMapped: true,
                    status: 'mapped',   // V3.4: Sync status with isMapped
                    ...fieldData
                }, true);  // V3.5: Add to history for proper undo support

                // V3.9: Skip toast if auto-advance is enabled (it shows its own toast)
                if (!window.autoAdvanceController?.isEnabled()) {
                    this._showToast(`שדה "${pendingField.label_he}" מופה בהצלחה!`, 'success');
                }
                console.log('[DrawController] Mapped pending field:', this.pendingFieldId, 'bbox:', bbox, 'page:', currentPage);

                // AUTO-EXPAND: Emit event to expand the field in sidebar for quick configuration
                console.log('[DrawController] Emitting FIELD_MAPPED event for:', mappedFieldId);
                eventBus.emit(Events.FIELD_MAPPED, { fieldId: mappedFieldId });

                // ============ V3.3: TEMPLATE INTEGRATION ============
                if (templateStore.isLoaded() && pendingField.templateFieldId) {
                    // Clear pendingFieldId BEFORE handleTemplateFieldMapped
                    // because _advanceToNextUnmapped will set a NEW pendingFieldId
                    this.pendingFieldId = null;
                    this._handleTemplateFieldMapped(pendingField, bbox);
                    // Note: pendingFieldId is now set to next unmapped field (or null if complete)
                } else {
                    // Clear pending field only if NOT in template mode
                    this.pendingFieldId = null;
                }
            } else {
                console.warn('[DrawController] Pending field not found:', this.pendingFieldId);
                this.pendingFieldId = null;
            }

        } else {
            // ═══════════════════════════════════════════════════════════════
            // NEW FLOW (V3.2): Create DRAFT field with auto-detection
            // NO POPUP - semantic data will be collected in Review screen
            // ═══════════════════════════════════════════════════════════════

            // Get current page for field assignment
            const currentPage = state.get('document.currentPage');

            // Auto-detect structure using FieldIntentResolver
            const detectedStructure = this._autoDetectStructure(fieldType, bbox);

            // V3.2: Check if we have pending field data from label selection
            if (this.pendingFieldData) {
                // Create draft with label data from 🎯 selection
                field = state.addField({
                    type: this.pendingFieldData.type || fieldType,
                    bbox: bbox,
                    page: currentPage,
                    isMapped: true,
                    status: 'draft',
                    // Label data from selection
                    label_he: this.pendingFieldData.label_he,
                    label_en: this.pendingFieldData.label_en,
                    // Semantic data from auto-detection
                    canonical: this.pendingFieldData.canonical,
                    context: this.pendingFieldData.context,
                    category: this.pendingFieldData.category,
                    format: this.pendingFieldData.format,
                    // Box count and structure from CanonicalSelector
                    boxCount: this.pendingFieldData.boxCount,
                    structure: this.pendingFieldData.structure || detectedStructure,
                    // Structure detection
                    detectedType: this.pendingFieldData.type || fieldType,
                    detectedStructure: detectedStructure,
                    source: this.pendingFieldData.source,
                    ...fieldData
                });

                const typeLabel = this._getTypeLabel(this.pendingFieldData.type || fieldType);
                console.log('[DrawController] Created DRAFT field with label:', field.id, this.pendingFieldData.label_he, 'boxCount:', this.pendingFieldData.boxCount);

                // V3.14: Emit FIELD_MAPPED for table region detection
                eventBus.emit(Events.FIELD_MAPPED, { fieldId: field.id, source: 'manual' });

                // Show feedback with field name and box count if applicable
                let toastMsg = `✓ ${this.pendingFieldData.label_he} (${typeLabel})`;
                if (this.pendingFieldData.boxCount) {
                    toastMsg += ` - ${this.pendingFieldData.boxCount} תיבות`;
                }
                this._showToast(toastMsg, 'success');

                // Clear pending data
                this.pendingFieldData = null;

                // V3.5: In guided mode, don't return to label selection - guided UI handles flow
                const isGuidedActive = guidedMappingUI && typeof guidedMappingUI.isActive === 'function' && guidedMappingUI.isActive();
                if (!isGuidedActive) {
                    // V3.2: Return to label selection mode for next field
                    this._returnToLabelSelectionMode();
                }
                // Guided mode: GuidedMappingUI will auto-advance via FIELD_CREATED event

            } else {
                // No pending label - create draft with auto-detection only
                field = state.addField({
                    type: fieldType,
                    bbox: bbox,
                    page: currentPage,
                    isMapped: true,
                    status: 'draft',
                    detectedType: fieldType,
                    detectedStructure: detectedStructure,
                    ...fieldData
                });

                if (field) {
                    console.log('[DrawController] Created DRAFT field (no label):', field.id, 'detected:', detectedStructure);

                    // V3.14: Emit FIELD_MAPPED for table region detection
                    eventBus.emit(Events.FIELD_MAPPED, { fieldId: field.id, source: 'manual' });

                    // Show visual feedback
                    this._showDraftFeedback(field, detectedStructure);
                } else {
                    console.warn('[DrawController] Failed to create field - validation blocked');
                }
            }
        }

        // Reset state
        this.isDrawing = false;
        state.setMode(Modes.IDLE);

        // Select the field
        if (field) {
            state.selectField(field.id);
        }

        // V3.3: In template mode, keep DRAW_TEXT tool active for next field
        // Only switch to SELECT if NOT in template mode with pending field
        if (templateStore.isLoaded() && this.pendingFieldId) {
            // Stay in DRAW_TEXT mode - _advanceToNextUnmapped already set pendingFieldId
            console.log('[DrawController] Template mode: keeping DRAW_TEXT tool for next field');
        } else {
            // Switch back to select tool
            state.setTool(Tools.SELECT);
        }

        eventBus.emit(Events.DRAW_END, { field });
    }

    /**
     * Open NameConfirmDialog to collect semantic data for a newly drawn field
     * V3.1: Canonical is REQUIRED - cancel deletes the field
     * @param {Object} field - The newly created field
     * @param {string} fieldType - Field type
     */
    async _openCanonicalDialog(field, fieldType) {
        try {
            const result = await nameConfirmDialog.show({
                hebrewName: '',
                englishName: '',
                source: 'draw',
                fieldType: fieldType
            });

            if (result) {
                // User confirmed - update field with semantic data
                state.updateField(field.id, {
                    label_he: result.label_he,
                    label_en: result.label_en,
                    type: result.type,
                    canonical: result.canonical,
                    context: result.context,
                    category: result.category,
                    format: result.format
                });

                console.log(`[DrawController] ✅ Field updated with semantic data:`, {
                    id: field.id,
                    canonical: result.canonical,
                    context: result.context
                });

                this._showToast(`שדה "${result.label_he}" נוצר בהצלחה`, 'success');
            } else {
                // User cancelled - DELETE the field
                state.deleteField(field.id);
                console.log(`[DrawController] ⚠️ Field deleted (user cancelled dialog):`, field.id);
                this._showToast('יצירת השדה בוטלה', 'warning');
            }
        } catch (error) {
            console.error('[DrawController] Dialog error:', error);
            // On error, keep the field but warn
            this._showToast('שגיאה בדיאלוג - השדה נשמר ללא מידע סמנטי', 'error');
        }

        // Reset state
        this.isDrawing = false;
        state.setMode(Modes.IDLE);
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
     * V3.4: Handle window resize - cancel active drawing/refiner
     * Prevents coordinate mismatch when viewport changes during operation
     */
    _onWindowResize() {
        // Cancel active drawing
        if (this.isDrawing) {
            console.log('[DrawController] Window resized during drawing - cancelling to prevent coordinate mismatch');
            this._cancelDraw();
            this._showToast('הציור בוטל עקב שינוי גודל חלון', 'warning');
        }

        // Cancel active refiner (note: _cancelRefiner already shows its own toast)
        if (this._refinerActive) {
            console.log('[DrawController] Window resized during refiner - cancelling');
            this._cancelRefiner();
        }
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
    // V3.2: Integrated flow - Label selection → Draw → Review (NO POPUP)

    /**
     * Start field name capture using click-select (click first word, click last word)
     * V3.2: NO POPUP - stores pending field data for next draw
     */
    startFieldNameCapture() {
        console.log('[DrawController] Starting field name capture with click-select (V3.2 - no popup)');

        labelOverlay.startFieldNameSelection((result) => {
            if (!result || !result.text) {
                console.log('[DrawController] Field name capture cancelled');
                return;
            }

            const hebrewName = result.text;
            const englishName = fieldNamer.hebrewToEnglish(hebrewName);

            console.log('[DrawController] Field name selected:', hebrewName, '→', englishName);

            // V3.2: Auto-detect field type and format using CanonicalSelector
            const detectedInfo = this._detectFieldInfoFromLabel(hebrewName);

            // Store pending field data (NOT creating field yet - will create on draw)
            this.pendingFieldData = {
                label_he: hebrewName,
                label_en: englishName,
                type: detectedInfo.type,
                canonical: detectedInfo.canonical,
                context: detectedInfo.context,
                category: detectedInfo.category,
                format: detectedInfo.format,
                boxCount: detectedInfo.boxCount,
                structure: detectedInfo.structure,
                source: 'click-select'
            };

            console.log('[DrawController] Pending field data:', this.pendingFieldData);

            // Switch to appropriate draw tool based on detected type
            const toolMap = {
                'text': Tools.DRAW_TEXT,
                'number': Tools.DRAW_TEXT,
                'date': Tools.DRAW_TEXT,
                'checkbox': Tools.DRAW_CHECKBOX,
                'radio': Tools.DRAW_RADIO,
                'signature': Tools.DRAW_TEXT
            };
            state.setTool(toolMap[detectedInfo.type] || Tools.DRAW_TEXT);

            // Show toast with detected info
            const typeLabel = this._getTypeLabel(detectedInfo.type);
            this._showToast(`נבחר: ${hebrewName} (${typeLabel}) - עכשיו צייר את השדה`, 'info');
        });
    }

    /**
     * V3.2: Detect field info from Hebrew label using CanonicalSelector
     * @param {string} hebrewText - Hebrew field name
     * @returns {Object} Detected field info { type, canonical, context, category, format, boxCount, structure }
     */
    _detectFieldInfoFromLabel(hebrewText) {
        // Use imported canonicalSelector
        if (!canonicalSelector) {
            console.warn('[DrawController] CanonicalSelector not available, using defaults');
            return {
                type: 'text',
                canonical: null,
                context: 'employee',
                category: null,
                format: null,
                boxCount: null,
                structure: 'text'
            };
        }

        // Get canonical suggestion
        const suggestions = canonicalSelector.suggestCanonical(hebrewText, 1);
        const canonical = suggestions.length > 0 && suggestions[0].score >= 50
            ? suggestions[0].canonical
            : null;

        // Detect type from canonical
        let type = 'text';
        if (canonical) {
            type = canonicalSelector.detectFieldType(canonical) || 'text';
        }

        // Get format hint (includes boxCount and structure)
        const formatHint = canonical ? canonicalSelector.getFormatHint(canonical) : null;

        // Detect context
        let context = canonical ? canonicalSelector.suggestContext(canonical) : null;
        if (!context && canonicalSelector.detectContextFromLabel) {
            context = canonicalSelector.detectContextFromLabel(hebrewText);
        }
        if (!context) {
            context = 'employee'; // Default
        }

        // Detect category for enum fields
        const category = canonical && canonicalSelector.getCategoryForCanonical
            ? canonicalSelector.getCategoryForCanonical(canonical)
            : null;

        // Extract boxCount and structure from format hint
        const boxCount = formatHint?.boxCount || null;
        const structure = formatHint?.structure || 'text';

        console.log(`[DrawController] Detected from "${hebrewText}":`, {
            canonical, type, context, category,
            format: formatHint?.format,
            boxCount, structure
        });

        return {
            type,
            canonical,
            context,
            category,
            format: formatHint?.format || null,
            boxCount,
            structure
        };
    }

    /**
     * V3.2: Get Hebrew label for field type
     */
    _getTypeLabel(type) {
        const labels = {
            'text': 'טקסט',
            'number': 'מספר',
            'date': 'תאריך',
            'checkbox': 'Checkbox',
            'radio': 'Radio',
            'signature': 'חתימה'
        };
        return labels[type] || type;
    }

    /**
     * V3.2: Clear pending field data
     */
    clearPendingFieldData() {
        this.pendingFieldData = null;
        console.log('[DrawController] Cleared pending field data');
    }

    /**
     * V3.2: Return to label selection mode after drawing
     * Allows continuous label→draw→label→draw flow
     */
    _returnToLabelSelectionMode() {
        // Small delay to let the field creation complete
        setTimeout(() => {
            console.log('[DrawController] Returning to label selection mode');

            // Restart label selection for next field
            labelOverlay.startFieldNameSelection((result) => {
                if (!result || !result.text) {
                    console.log('[DrawController] Label selection ended');
                    state.setTool(Tools.SELECT);
                    return;
                }

                const hebrewName = result.text;
                const englishName = fieldNamer.hebrewToEnglish(hebrewName);

                console.log('[DrawController] Next field name selected:', hebrewName, '→', englishName);

                // Auto-detect field info
                const detectedInfo = this._detectFieldInfoFromLabel(hebrewName);

                // Store pending field data
                this.pendingFieldData = {
                    label_he: hebrewName,
                    label_en: englishName,
                    type: detectedInfo.type,
                    canonical: detectedInfo.canonical,
                    context: detectedInfo.context,
                    category: detectedInfo.category,
                    format: detectedInfo.format,
                    boxCount: detectedInfo.boxCount,
                    structure: detectedInfo.structure,
                    source: 'click-select'
                };

                // Switch to appropriate draw tool
                const toolMap = {
                    'text': Tools.DRAW_TEXT,
                    'number': Tools.DRAW_TEXT,
                    'date': Tools.DRAW_TEXT,
                    'checkbox': Tools.DRAW_CHECKBOX,
                    'radio': Tools.DRAW_RADIO,
                    'signature': Tools.DRAW_TEXT
                };
                state.setTool(toolMap[detectedInfo.type] || Tools.DRAW_TEXT);

                const typeLabel = this._getTypeLabel(detectedInfo.type);
                this._showToast(`נבחר: ${hebrewName} (${typeLabel}) - צייר את השדה`, 'info');
            });
        }, 100);
    }

    /**
     * Handle name capture drawing completion (LEGACY - rectangle method)
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
                this.pendingFieldId = field.id;
                console.log('[DrawController] SET pendingFieldId:', this.pendingFieldId);

                // Switch to appropriate draw tool based on field type
                const toolMap = {
                    'text': Tools.DRAW_TEXT,
                    'number': Tools.DRAW_TEXT,
                    'date': Tools.DRAW_TEXT,
                    'checkbox': Tools.DRAW_CHECKBOX,
                    'signature': Tools.DRAW_TEXT
                };
                const drawTool = toolMap[result.type] || Tools.DRAW_TEXT;
                state.setTool(drawTool);

                // Show guidance message
                this._showToast(`עכשיו סמן את מיקום השדה "${result.label_he}"`, 'info');

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

    // ============ MANUAL LABEL DRAW MODE ============

    /**
     * Handle manual label drawing from sidebar
     * Creates labelSelection for a field that doesn't have auto-detected label
     * @param {number} x - X position (screen pixels)
     * @param {number} y - Y position (screen pixels)
     * @param {number} width - Width (screen pixels)
     * @param {number} height - Height (screen pixels)
     */
    async _handleManualLabelDraw(x, y, width, height) {
        const fieldId = state.get('ui.labelDrawFieldId');

        // Reset state
        state.set('ui.labelDrawMode', false);
        state.set('ui.labelDrawFieldId', null);
        this.isDrawing = false;

        if (!fieldId) {
            console.warn('[DrawController] No field ID for manual label draw');
            return;
        }

        const field = state.getField(fieldId);
        if (!field) {
            console.warn('[DrawController] Field not found:', fieldId);
            return;
        }

        // Validate minimum size
        const MIN_SIZE = 10;
        if (width < MIN_SIZE || height < MIN_SIZE) {
            this._showToast('האזור קטן מדי - צייר מלבן גדול יותר', 'warning');
            return;
        }

        try {
            const currentPage = state.get('document.currentPage');

            // Create labelSelection from the drawn bbox
            const labelSelection = await labelOverlay.createLabelSelectionFromBbox(
                x, y, width, height, currentPage
            );

            if (labelSelection && labelSelection.wordIds.length > 0) {
                // Get words to build label text
                const words = await labelOverlay.getWordsByIds(labelSelection.wordIds, currentPage);
                const labelText = words.map(w => w.text).join(' ');

                // Update the field
                state.updateField(fieldId, {
                    labelSelection: labelSelection,
                    label_he: labelText,
                    label_en: fieldNamer.hebrewToEnglish(labelText)
                });

                this._showToast(`תווית נוספה: "${labelText}"`, 'success');
                console.log('[DrawController] Manual label added for field:', fieldId, labelSelection);

                // Render the new label overlay
                labelOverlay.renderLabelForField(state.getField(fieldId));
            } else {
                // No words found - try extracting text directly
                const textResult = await textExtractor.getTextAtPosition(x, y, width, height);

                if (textResult.text) {
                    state.updateField(fieldId, {
                        label_he: textResult.text,
                        label_en: fieldNamer.hebrewToEnglish(textResult.text)
                    });
                    this._showToast(`תווית נוספה: "${textResult.text}"`, 'success');
                } else {
                    this._showToast('לא נמצא טקסט באזור שסומן', 'warning');
                }
            }
        } catch (error) {
            console.error('[DrawController] Manual label draw error:', error);
            this._showToast('שגיאה בהוספת תווית', 'error');
        }
    }

    // ============ RADIO/CHECKBOX GROUP BUILDING (UNIFIED FLOW) ============

    /**
     * Start the new radio group building flow
     * Called when user clicks the Radio tool button
     */
    startRadioGroupFlow() {
        console.log('[DrawController] Starting radio group flow');
        state.startRadioGroupBuilder('radio');

        // Use click-select for title (click first word, click last word)
        labelOverlay.startTitleSelection((result) => {
            this._handleTitleSelected(result, 'radio');
        });
    }

    /**
     * Start the checkbox group building flow
     * Called when user clicks the Checkbox tool button
     */
    startCheckboxGroupFlow() {
        console.log('[DrawController] Starting checkbox group flow');
        state.startRadioGroupBuilder('checkbox');

        // Use click-select for title (click first word, click last word)
        labelOverlay.startTitleSelection((result) => {
            this._handleTitleSelected(result, 'checkbox');
        });
    }

    /**
     * Handle title selection result from click-select
     * @param {Object} result - {text, labelSelection, words}
     * @param {string} groupType - 'radio' or 'checkbox'
     */
    _handleTitleSelected(result, groupType) {
        if (!result || !result.text) {
            console.log('[DrawController] Title selection cancelled');
            state.cancelRadioGroupBuilder();
            return;
        }

        const hebrewTitle = result.text;
        const englishTitle = fieldNamer.hebrewToEnglish(hebrewTitle);

        console.log('[DrawController] Title selected:', hebrewTitle);

        // Set the group title
        state.setRadioGroupTitle(hebrewTitle, englishTitle);

        // Move to next step - clicking circles (setRadioGroupTitle already advances)
        // state.advanceToCircleClick(); // Not needed - setRadioGroupTitle does this

        const itemName = groupType === 'checkbox' ? 'צ\'קבוקסים' : 'עיגולי רדיו';
        this._showToast(`כותרת: "${hebrewTitle}" - עכשיו לחץ על ה${itemName}`, 'success');

        // Set tool for clicking circles
        state.setTool(Tools.DRAW_CHECKBOX);
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

                // Set the correct tool based on group type
                const groupType = builder.groupType || 'radio';
                state.setTool(groupType === 'checkbox' ? Tools.DRAW_CHECKBOX : Tools.DRAW_RADIO);

                // Show message with correct terminology
                const itemName = groupType === 'checkbox' ? 'הצ\'קבוקסים' : 'עיגולי הרדיו';
                this._showToast(`כותרת "${text}" - עכשיו לחץ על ${itemName} (①②③)`, 'success');

            } catch (error) {
                console.error('[DrawController] Title extraction error:', error);
                this._showToast('שגיאה בחילוץ כותרת', 'error');
            }
            return;
        }

        // ============ STEP 2: CLICK_CIRCLES - UNIFIED FLOW ============
        // After clicking circle, open WordSelector to select label
        if (builder.step === RadioGroupSteps.CLICK_CIRCLES) {
            // Calculate center point for anchor
            let centerX, centerY;

            if (isOneClick) {
                // One-click: use click position as center
                centerX = this.startX;
                centerY = this.startY;
            } else {
                // Drag: use center of drawn rectangle
                centerX = x + width / 2;
                centerY = y + height / 2;
            }

            // Convert screen center to normalized anchor [0-1]
            const anchor = overlayRenderer.screenToAnchor(centerX, centerY);

            // Create real Field with anchor
            const groupType = builder.groupType || 'radio';
            const field = state.addGroupOption(anchor, groupType);

            if (!field) {
                console.error('[DrawController] Failed to create group option');
                return;
            }

            console.log('[DrawController] Group option created:', field.id, 'anchor:', anchor, 'type:', groupType);

            // Store field ID for label selection
            this._pendingOptionFieldId = field.id;

            // Open WordSelector for label selection
            const optionNum = state.getRadioGroupBuilder().circles.length;
            this._showToast(`בחר תווית לאפשרות ${optionNum}`, 'info');

            // Start label selection for this option
            labelOverlay.startClickSelectMode(field.id);

            // Listen for when label selection is done
            const onLabelSelected = () => {
                eventBus.off('label:selected', onLabelSelected);
                this._onOptionLabelSelected(field.id, groupType);
            };
            eventBus.on('label:selected', onLabelSelected);

            return;
        }

        // Other steps don't handle drawing
        console.log('[DrawController] Unhandled step:', builder.step);
    }

    /**
     * Handle when option label is selected (unified flow)
     * @param {string} fieldId - Field ID of the option
     * @param {string} groupType - 'radio' or 'checkbox'
     */
    _onOptionLabelSelected(fieldId, groupType) {
        const field = state.getField(fieldId);
        const builder = state.getRadioGroupBuilder();

        if (!builder.active) return;

        const labelText = field?.label_he || `אפשרות ${builder.circles.length}`;
        const count = builder.circles.length;
        const itemName = groupType === 'checkbox' ? 'צ\'קבוקס' : 'רדיו';

        console.log(`[DrawController] Option ${count} label set: "${labelText}"`);

        if (count >= 2) {
            this._showToast(`${itemName} "${labelText}" נוסף (${count}). לחץ על עוד או Enter לסיום`, 'success');
        } else {
            this._showToast(`${itemName} "${labelText}" נוסף. לחץ על אפשרות נוספת`, 'success');
        }

        // Clear pending field
        this._pendingOptionFieldId = null;
    }

    /**
     * Finish radio/checkbox group (called on Enter)
     * Creates the group from all collected options
     */
    finishRadioGroup() {
        const builder = state.getRadioGroupBuilder();
        if (!builder.active || builder.step !== RadioGroupSteps.CLICK_CIRCLES) return;

        if (builder.circles.length < 2) {
            const itemName = builder.groupType === 'checkbox' ? 'צ\'קבוקסים' : 'עיגולים';
            this._showToast(`צריך לפחות 2 ${itemName}. המשך ללחוץ`, 'warning');
            return;
        }

        // Finish and create the group
        const group = state.finishRadioGroupBuilder();
        if (group) {
            const groupTypeName = builder.groupType === 'checkbox' ? 'צ\'קבוקסים' : 'רדיו';
            this._showToast(`קבוצת ${groupTypeName} "${group.groupName}" נוצרה עם ${group.options.length} אפשרויות!`, 'success');
        }

        state.setTool(Tools.SELECT);
        overlayRenderer.render();
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
            const itemName = builder.groupType === 'checkbox' ? 'צ\'קבוקסים' : 'עיגולים';
            this._showToast(`צריך לפחות 2 ${itemName}. המשך ללחוץ`, 'warning');
            return;
        }

        console.log('[DrawController] Triggering label detection for', builder.circles.length, 'circles');
        this._showToast('מזהה תוויות...', 'info');

        // Start detection phase
        if (!state.startLabelDetection()) {
            return;
        }

        // ============ LABEL DETECTION V2 FEATURE FLAG ============
        // Debug mode: enabled via console with: window.LABEL_DEBUG = true
        // V2 mode: enabled via console with: window.USE_LABEL_V2 = true
        // Validation mode: enabled via console with: window.LABEL_VALIDATE = true
        const useDebug = window.LABEL_DEBUG === true;
        const useV2 = window.USE_LABEL_V2 === true;
        const validateV2 = window.LABEL_VALIDATE === true;

        let detectedLabels;

        if (validateV2 && this._labelDetectionV2) {
            // Validation mode: run BOTH engines and compare
            console.log('[DrawController] Running V2 validation (both engines)');

            const legacyResults = await this._autoDetectLabels(builder.circles, useDebug);
            const v2Results = await this._labelDetectionV2.detectLabels(builder.circles, state.get('document.currentPage'), useDebug);

            const comparison = this._labelDetectionV2.compareWithLegacy(v2Results, legacyResults);

            if (comparison.identical) {
                console.log('[DrawController] ✅ V2 VALIDATION PASSED: Results identical');
            } else {
                console.warn('[DrawController] ⚠️ V2 VALIDATION FAILED: Differences found');
                comparison.differences.forEach(diff => console.warn('  -', diff));
            }

            // Use V2 results for the dialog
            detectedLabels = v2Results;

        } else if (useV2 && this._labelDetectionV2) {
            // V2 engine (Step 1+)
            console.log('[DrawController] Using LabelDetectionV2 engine');
            detectedLabels = await this._labelDetectionV2.detectLabels(builder.circles, state.get('document.currentPage'), useDebug);
        } else {
            // Legacy engine with optional debug
            detectedLabels = await this._autoDetectLabels(builder.circles, useDebug);
        }

        // ============ LABEL SELECTION INTEGRATION ============
        // Create labelSelection for each detected label from its bbox
        const currentPage = state.get('document.currentPage');
        for (const label of detectedLabels) {
            if (label.labelBbox && label.label_he) {
                try {
                    // labelBbox is [x, y, width, height] in screen pixels
                    const [x, y, width, height] = label.labelBbox;
                    const labelSelection = await labelOverlay.createLabelSelectionFromBbox(
                        x, y, width, height, currentPage
                    );

                    if (labelSelection) {
                        label.labelSelection = labelSelection;
                        console.log(`[DrawController] Created labelSelection for circle ${label.circleIndex}:`, labelSelection);
                    }
                } catch (error) {
                    console.warn(`[DrawController] Failed to create labelSelection for circle ${label.circleIndex}:`, error);
                }
            }
        }

        // Set the detected labels
        state.setDetectedLabels(detectedLabels);

        // Show the dialog for review/edit
        this._showRadioGroupDialog(builder.groupName, detectedLabels);
    }

    /**
     * Auto-detect labels near radio circles
     * Scans area on BOTH sides of each circle (Hebrew labels are typically LEFT of circle)
     * @param {Array} circles - Array of { bbox, number }
     * @param {boolean} includeDebug - Include debug info in results
     * @returns {Promise<Array>} Array of { circleIndex, label_he, label_en, labelBbox, debug? }
     */
    async _autoDetectLabels(circles, includeDebug = false) {
        const labels = [];
        const SCAN_WIDTH = 80;   // Reduced - radio labels are short (זכר, נקבה, כן, לא)
        const SCAN_HEIGHT = 24;  // Height of scan area

        // Debug: log detection start
        if (includeDebug) {
            console.log('[LabelDetection:DEBUG] ========== DETECTION START ==========');
            console.log('[LabelDetection:DEBUG] Circles count:', circles.length);
            console.log('[LabelDetection:DEBUG] SCAN_WIDTH:', SCAN_WIDTH, 'SCAN_HEIGHT:', SCAN_HEIGHT);
        }

        for (let i = 0; i < circles.length; i++) {
            const circle = circles[i];
            const debug = includeDebug ? {
                circleIndex: i,
                screenPosition: null,
                leftScan: null,
                rightScan: null,
                chosenDirection: null,
                filteredReasons: []
            } : null;

            // NEW FLOW: Get screen position from Field's anchor
            let screen;
            if (circle.fieldId) {
                const field = state.getField(circle.fieldId);
                if (field && field.anchor) {
                    // Convert anchor to screen position
                    const screenPos = overlayRenderer.anchorToScreen(field.anchor);
                    const size = field.overlayWidth || 24;
                    screen = {
                        x: screenPos.x - size / 2,
                        y: screenPos.y - size / 2,
                        width: size,
                        height: size
                    };
                    if (debug) {
                        debug.screenPosition = { ...screen, anchor: field.anchor };
                    }
                } else {
                    console.warn(`[DrawController] Field ${circle.fieldId} not found or no anchor`);
                    if (debug) debug.filteredReasons.push('Field not found or no anchor');
                    continue;
                }
            } else if (circle.bbox) {
                // Legacy: Convert bbox back to screen coordinates
                screen = overlayRenderer.bboxToScreen(circle.bbox);
                if (debug) {
                    debug.screenPosition = { ...screen, bbox: circle.bbox };
                }
            } else {
                console.warn(`[DrawController] Circle ${i} has no fieldId or bbox`);
                if (debug) debug.filteredReasons.push('No fieldId or bbox');
                continue;
            }

            let foundText = null;
            let foundSource = 'none';
            let foundBbox = null;

            // First try LEFT of circle (Hebrew style - most common)
            const scanLeftX = Math.max(0, screen.x - SCAN_WIDTH - 5);
            const scanY = screen.y - 5;  // Slightly above center
            const leftBbox = [scanLeftX, scanY, SCAN_WIDTH, SCAN_HEIGHT];

            if (debug) {
                debug.leftScan = { bbox: leftBbox, result: null, error: null };
            }

            try {
                const leftResult = await textExtractor.getTextAtPosition(
                    scanLeftX, scanY, SCAN_WIDTH, SCAN_HEIGHT
                );

                if (debug) {
                    debug.leftScan.result = { text: leftResult.text, source: leftResult.source };
                }

                if (leftResult.text) {
                    foundText = leftResult.text;
                    foundSource = leftResult.source;
                    foundBbox = leftBbox;
                    if (debug) debug.chosenDirection = 'left';
                    console.log(`[DrawController] Circle ${i + 1} (left): "${foundText}"`);
                }
            } catch (error) {
                console.warn(`[DrawController] Left scan error for circle ${i + 1}:`, error);
                if (debug) debug.leftScan.error = error.message;
            }

            // If no text on left, try RIGHT of circle
            if (!foundText) {
                const scanRightX = screen.x + screen.width + 5;
                const rightBbox = [scanRightX, scanY, SCAN_WIDTH, SCAN_HEIGHT];

                if (debug) {
                    debug.rightScan = { bbox: rightBbox, result: null, error: null };
                }

                try {
                    const rightResult = await textExtractor.getTextAtPosition(
                        scanRightX, scanY, SCAN_WIDTH, SCAN_HEIGHT
                    );

                    if (debug) {
                        debug.rightScan.result = { text: rightResult.text, source: rightResult.source };
                    }

                    if (rightResult.text) {
                        foundText = rightResult.text;
                        foundSource = rightResult.source;
                        foundBbox = rightBbox;
                        if (debug) debug.chosenDirection = 'right';
                        console.log(`[DrawController] Circle ${i + 1} (right): "${foundText}"`);
                    }
                } catch (error) {
                    console.warn(`[DrawController] Right scan error for circle ${i + 1}:`, error);
                    if (debug) debug.rightScan.error = error.message;
                }
            }

            // Build label entry
            const labelEntry = {
                circleIndex: i,
                label_he: foundText || '',
                label_en: foundText ? fieldNamer.hebrewToEnglish(foundText) : `option_${i + 1}`,
                labelBbox: foundBbox,
                source: foundText ? foundSource : 'none'
            };

            // Add debug info if requested
            if (debug) {
                labelEntry.debug = debug;
                if (!foundText) {
                    debug.filteredReasons.push('No text found on either side');
                }
            }

            labels.push(labelEntry);

            if (!foundText) {
                console.log(`[DrawController] Circle ${i + 1}: No text found on either side`);
            }
        }

        // Debug: log detection summary
        if (includeDebug) {
            console.log('[LabelDetection:DEBUG] ========== DETECTION COMPLETE ==========');
            console.log('[LabelDetection:DEBUG] Results:', labels.map(l => ({
                index: l.circleIndex,
                label: l.label_he,
                direction: l.debug?.chosenDirection,
                bbox: l.labelBbox
            })));
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

        // Get builder info BEFORE dialog (for groupType)
        const builder = state.getRadioGroupBuilder();
        const groupType = builder?.groupType || 'radio';

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
                    state.set('radioGroupBuilder.groupName', result.groupName);
                    state.set('radioGroupBuilder.groupNameEn', fieldNamer.hebrewToEnglish(result.groupName));
                }

                // Finish and create the group
                const group = state.finishRadioGroupBuilder();
                if (group) {
                    const groupTypeName = groupType === 'checkbox' ? 'צ\'קבוקסים' : 'רדיו';
                    this._showToast(`קבוצת ${groupTypeName} "${group.groupName}" נוצרה עם ${group.options.length} אפשרויות!`, 'success');
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
     * Cancel radio/checkbox group building
     */
    cancelRadioGroup() {
        const builder = state.getRadioGroupBuilder();
        const groupTypeName = builder?.groupType === 'checkbox' ? 'צ\'קבוקסים' : 'רדיו';
        state.cancelRadioGroupBuilder();
        this._showToast(`בניית קבוצת ${groupTypeName} בוטלה`, 'warning');
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

    // ═══════════════════════════════════════════════════════════════════════
    // V3.2 DRAFT FLOW - Auto-detection without popup
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Auto-detect field structure using FieldIntentResolver
     * @param {string} fieldType - Field type from tool
     * @param {Array} bbox - Normalized bbox [x, y, w, h]
     * @returns {Object} Detected structure { intent, boxCount, confidence }
     */
    _autoDetectStructure(fieldType, bbox) {
        // Use global FieldIntentResolver (loaded in shared/)
        if (typeof window.FieldIntentResolver === 'undefined') {
            console.warn('[DrawController] FieldIntentResolver not available, using defaults');
            return {
                intent: fieldType === 'checkbox' ? 'checkbox' :
                        fieldType === 'radio' ? 'radio' : 'flowText',
                boxCount: null,
                confidence: 0.5
            };
        }

        // Convert bbox array to object format expected by resolver
        const bboxObj = bbox ? {
            x: bbox[0],
            y: bbox[1],
            width: bbox[2],
            height: bbox[3]
        } : null;

        const result = window.FieldIntentResolver.resolveRenderIntent({
            value: null,  // No value yet - detection based on bbox shape
            fieldMeta: { type: fieldType },
            bbox: bboxObj,
            context: 'standalone'
        });

        return {
            intent: result.intent,
            boxCount: result.expectedLength,
            confidence: result.confidence,
            reason: result.reason
        };
    }

    /**
     * Show visual feedback for draft field (instead of popup)
     * @param {Object} field - Created draft field
     * @param {Object} structure - Detected structure
     */
    _showDraftFeedback(field, structure) {
        // Build feedback message based on detected structure
        let icon, message;

        switch (structure.intent) {
            case 'perGlyphBoxes':
                icon = '📊';
                message = structure.boxCount
                    ? `${structure.boxCount} תיבות`
                    : 'שדה תיבות';
                break;
            case 'checkbox':
                icon = '☑️';
                message = 'Checkbox';
                break;
            case 'radio':
                icon = '🔘';
                message = 'Radio';
                break;
            default:
                icon = '📝';
                message = 'טקסט';
        }

        // Show brief toast (1.5 seconds)
        this._showToast(`${icon} ${message}`, 'success');

        // Reset state and return to select mode
        this.isDrawing = false;
        state.setMode(Modes.IDLE);
        state.setTool(Tools.SELECT);

        // Select the created field
        if (field) {
            state.selectField(field.id);
        }

        eventBus.emit(Events.DRAW_END, { field, isDraft: true });

        console.log(`[DrawController] Draft feedback: ${icon} ${message} (confidence: ${structure.confidence?.toFixed(2) || 'N/A'})`);
    }

    // ============ V3.3: TEMPLATE MAPPING INTEGRATION ============

    /**
     * Handle template field being mapped
     * Updates template status, checks for duplicates, auto-advances
     * V3.4: Checks for repeatable entity and prompts for mapping mode choice
     * @param {Object} field - The mapped field with templateFieldId
     * @param {Array} bbox - The bbox that was drawn
     */
    async _handleTemplateFieldMapped(field, bbox) {
        const templateFieldId = field.templateFieldId;
        console.log('[DrawController] Template field mapped:', templateFieldId);

        // 1. Update template field status
        templateStore.setFieldStatus(templateFieldId, TemplateFieldStatus.MAPPED);
        templateStore.linkMappedField(templateFieldId, field.id);

        // Emit template field mapped event
        eventBus.emit(Events.TEMPLATE_FIELD_MAPPED, {
            fieldId: field.id,
            templateFieldId: templateFieldId,
            canonical: field.canonical || field.label_en,
            bbox: bbox
        });

        // V3.4: Check if this field belongs to a repeatable entity that needs mode decision
        console.log('[DrawController] V3.4: Checking for repeatable entity decision...');
        const decisionNeeded = templateStore.needsMappingModeDecision(templateFieldId);
        console.log('[DrawController] V3.4: decisionNeeded =', decisionNeeded);
        if (decisionNeeded) {
            const { entityId, detection } = decisionNeeded;
            const entity = templateStore.getEntity(entityId);

            console.log('[DrawController] Repeatable entity detected, prompting for mode:', entityId);

            // Show the mapping mode dialog
            // Pass the field info so it can be removed if TABLE mode is chosen
            eventBus.emit(Events.ENTITY_MAPPING_MODE_PROMPT, {
                entityId,
                detection,
                entity,
                // V3.4: Include mapped field info for cleanup if TABLE chosen
                mappedFieldId: field.id,
                mappedTemplateFieldId: templateFieldId
            });

            // The dialog will handle routing to table flow or batch mode
            // Don't auto-advance here - let the mode handler do it
            return;
        }

        // 2. Check for duplicate fields that could be batch-mapped
        const duplicates = templateStore.getDuplicatesOf(templateFieldId);
        if (duplicates && duplicates.length > 0) {
            // Check if entity already decided for batch mode
            const templateField = templateStore.getField(templateFieldId);
            if (templateField) {
                const mode = templateStore.getEntityMappingMode(templateField.entity_id);
                // Only offer batch if in batch mode or undecided (for non-repeatable entities)
                if (mode !== 'table') {
                    this._offerBatchMapping(field, bbox, duplicates);
                    return;
                }
            }
        }

        // 3. Auto-advance to next unmapped field
        this._advanceToNextUnmapped();

        // 4. Update progress
        const progress = templateStore.getMappingProgress();
        eventBus.emit(Events.MAPPING_PROGRESS_CHANGED, progress);

        // 5. Check if all fields are mapped
        if (templateStore.isComplete()) {
            this._showToast('🎉 כל השדות מופו! התבנית מוכנה', 'success');
            templateStore.lockTemplate();
        }
    }

    /**
     * Offer batch mapping for duplicate fields
     * Shows a toast with action button to apply batch mapping
     * @param {Object} sourceField - The field that was just mapped
     * @param {Array} sourceBbox - The bbox that was drawn
     * @param {Array} duplicates - Array of duplicate template fields
     */
    _offerBatchMapping(sourceField, sourceBbox, duplicates) {
        const count = duplicates.length;
        const pattern = this._detectDuplicatePattern(sourceField, duplicates);

        console.log('[DrawController] Offering batch mapping:', count, 'duplicates, pattern:', pattern);

        // Emit batch offered event for UI to show
        eventBus.emit(Events.BATCH_MAPPING_OFFERED, {
            sourceFieldId: sourceField.id,
            duplicates: duplicates,
            pattern: pattern
        });

        // Show toast with action
        eventBus.emit(Events.TOAST_SHOW, {
            message: `זוהו ${count} שדות דומים. להחיל מיפוי אוטומטי?`,
            type: 'info',
            duration: 8000,
            action: {
                label: 'החל',
                callback: () => this._applyBatchMapping(sourceField, sourceBbox, duplicates)
            }
        });
    }

    /**
     * Detect the pattern for duplicate fields (e.g., vertical stack, row shift)
     * @param {Object} sourceField - Source field
     * @param {Array} duplicates - Duplicate template fields
     * @returns {Object} Pattern description { type, deltaY, deltaX }
     */
    _detectDuplicatePattern(sourceField, duplicates) {
        // Get template fields to analyze naming pattern
        const sourceTemplateField = templateStore.getField(sourceField.templateFieldId);
        if (!sourceTemplateField || duplicates.length === 0) {
            return { type: 'unknown' };
        }

        // Analyze field names to detect pattern
        // e.g., child_1_name, child_2_name -> vertical stack
        const sourceMatch = sourceTemplateField.label_en?.match(/(\d+)/);
        const firstDupMatch = duplicates[0].label_en?.match(/(\d+)/);

        if (sourceMatch && firstDupMatch) {
            const sourceNum = parseInt(sourceMatch[1]);
            const dupNum = parseInt(firstDupMatch[1]);

            if (dupNum === sourceNum + 1) {
                // Sequential numbering suggests vertical stacking
                return { type: 'vertical_stack', deltaY: null }; // deltaY calculated from bbox height
            }
        }

        // Default: assume simple vertical repeat
        return { type: 'vertical_repeat' };
    }

    /**
     * Apply batch mapping to all duplicate fields
     * @param {Object} sourceField - Source field with bbox
     * @param {Array} sourceBbox - The source bbox [x, y, w, h]
     * @param {Array} duplicates - Duplicate template fields to map
     */
    _applyBatchMapping(sourceField, sourceBbox, duplicates) {
        console.log('[DrawController] Applying batch mapping to', duplicates.length, 'fields');

        const [x, y, w, h] = sourceBbox;
        const currentPage = state.get('document.currentPage');

        // Calculate delta based on field height (assume vertical stacking)
        // Add small gap between fields
        const deltaY = h + (h * 0.1); // 10% gap

        // V3.10: Get overlay dimensions from source field for checkbox/radio/circle
        // Use overlayWidth/overlayHeight if available, otherwise calculate from bbox
        const isCheckboxOrRadio = sourceField.type === 'checkbox' || sourceField.type === 'radio' || sourceField.type === 'circle';
        let sourceOverlayWidth = sourceField.overlayWidth;
        let sourceOverlayHeight = sourceField.overlayHeight;

        // Fallback: calculate overlay dimensions from bbox if not explicitly set
        if (isCheckboxOrRadio && (!sourceOverlayWidth || !sourceOverlayHeight)) {
            // Convert bbox to screen coords to get actual overlay size
            const screenRect = overlayRenderer.bboxToScreen(sourceBbox);
            if (screenRect) {
                sourceOverlayWidth = screenRect.width;
                sourceOverlayHeight = screenRect.height;
                console.log('[DrawController] Batch mapping: calculated overlay dimensions from bbox:', sourceOverlayWidth, sourceOverlayHeight);
            }
        }

        const updates = [];
        const fieldIds = [];

        duplicates.forEach((dupTemplateField, index) => {
            // V3.4: Use template_field_id (not id) for template fields
            const tfId = dupTemplateField.template_field_id;

            // Find the StateManager field for this template field
            const stateField = state.getFieldByTemplateId(tfId);
            if (!stateField) {
                console.warn('[DrawController] No state field for template:', tfId);
                return;
            }

            // Calculate new bbox position
            // V3.4: SUBTRACT to move DOWN visually (PDF Y=0 is at bottom)
            const newY = y - (deltaY * (index + 1));
            const newBbox = [x, newY, w, h];

            // V3.4: Fixed structure to match batchUpdateFields expected format
            const update = {
                fieldId: stateField.id,
                bbox: newBbox,
                isMapped: true,
                status: 'mapped',
                page: currentPage
            };

            // V3.10: For checkbox/radio, copy overlay dimensions and calculate new anchor
            if (isCheckboxOrRadio && sourceOverlayWidth && sourceOverlayHeight) {
                update.overlayWidth = sourceOverlayWidth;
                update.overlayHeight = sourceOverlayHeight;

                // Calculate new anchor from new bbox center
                // bbox is [x, y, w, h] in PDF coordinates (y from bottom)
                // We need to convert to anchor [xPercent, yPercent]
                const screenRect = overlayRenderer.bboxToScreen(newBbox);
                if (screenRect) {
                    const centerX = screenRect.x + screenRect.width / 2;
                    const centerY = screenRect.y + screenRect.height / 2;
                    update.anchor = overlayRenderer.screenToAnchor(centerX, centerY);
                }
            }

            updates.push(update);
            fieldIds.push(stateField.id);

            // Update template status
            templateStore.setFieldStatus(tfId, TemplateFieldStatus.MAPPED);
            templateStore.linkMappedField(tfId, stateField.id);
        });

        // Batch update all fields (single history entry)
        if (updates.length > 0) {
            state.batchUpdateFields(updates);
        }

        // Emit batch applied event
        eventBus.emit(Events.BATCH_MAPPING_APPLIED, {
            fieldIds: fieldIds,
            bboxes: updates.map(u => u.bbox)  // V3.4: Fixed to match flat structure
        });

        this._showToast(`מופו ${updates.length} שדות נוספים`, 'success');

        // Re-render overlay
        overlayRenderer.renderAll();

        // Update progress
        const progress = templateStore.getMappingProgress();
        eventBus.emit(Events.MAPPING_PROGRESS_CHANGED, progress);

        // Advance to next unmapped
        this._advanceToNextUnmapped();
    }

    /**
     * Advance to the next unmapped template field
     */
    _advanceToNextUnmapped() {
        if (!templateStore.isLoaded()) return;

        const nextUnmapped = templateStore.getNextUnmapped();
        if (nextUnmapped) {
            const tfId = nextUnmapped.template_field_id || nextUnmapped.id;

            // Set as active target
            templateStore.setActiveTarget(tfId);

            // Find corresponding StateManager field
            const stateField = state.getFieldByTemplateId(tfId);
            if (stateField) {
                // Set as pending for next draw
                this.pendingFieldId = stateField.id;

                // Select appropriate tool based on field type
                const fieldType = nextUnmapped.type || stateField.type || 'text';
                const toolMap = {
                    'text': Tools.DRAW_TEXT,
                    'number': Tools.DRAW_TEXT,
                    'date': Tools.DRAW_TEXT,
                    'checkbox': Tools.DRAW_CHECKBOX,
                    'radio': Tools.DRAW_RADIO,
                    'signature': Tools.DRAW_TEXT
                };
                const tool = toolMap[fieldType] || Tools.DRAW_TEXT;
                state.setTool(tool);

                // Emit event for sidebar to highlight and scroll
                eventBus.emit(Events.NEXT_UNMAPPED_ACTIVATED, {
                    fieldId: stateField.id,
                    templateFieldId: tfId,
                    canonical: nextUnmapped.canonical || nextUnmapped.label_en
                });

                // Show toast with guidance
                const fieldName = nextUnmapped.label_he || nextUnmapped.label_en || 'שדה';
                this._showToast(`📍 ${fieldName}`, 'info');
            }
        } else {
            // All fields mapped!
            this._showToast('🎉 כל השדות מופו!', 'success');
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
