/**
 * QuickFillOverlay.js
 * V3.10: Quick Fill Mode - Draw boxes and type directly
 *
 * This module handles the Quick Fill workflow:
 * 1. Listens for QUICK_FILL_BOX_CREATED events from DrawController
 * 2. Renders simple overlay rectangles with text inputs
 * 3. Manages box state (position, text values)
 * 4. Provides export for LiveFill engine
 *
 * DOES NOT touch the fields array or StateManager field logic
 */

import { eventBus, Events } from '../core/EventBus.js';
import { state, FlowModes, Tools } from '../core/StateManager.js';
import { pdfEngine } from '../engines/PDFEngine.js';
import { overlayRenderer } from '../engines/OverlayRenderer.js';

class QuickFillOverlay {
    constructor() {
        this._initialized = false;
        this._boxes = [];          // Array of { id, bbox, screenRect, page, text }
        this._boxCounter = 0;
        this._overlayContainer = null;
        this._statusBar = null;
        this._previousTool = null; // V3.10: Store tool before entering Quick Fill

        // V3.10: Undo/Redo stacks for Quick Fill
        this._undoStack = [];      // Stack of actions: { type, data }
        this._redoStack = [];
        this._maxUndoSteps = 50;

        // V3.11: Flag for pending import (when JSON loaded before PDF)
        this._pendingImportFromFields = false;
    }

    /**
     * Initialize the overlay system
     */
    init() {
        if (this._initialized) return;

        this._createOverlayContainer();
        this._attachEventListeners();
        this._initialized = true;

        console.log('[QuickFillOverlay] Initialized');
    }

    /**
     * Create the overlay container for Quick Fill boxes
     */
    _createOverlayContainer() {
        // Create container that sits on top of the overlay layer
        this._overlayContainer = document.createElement('div');
        this._overlayContainer.id = 'quick-fill-container';
        this._overlayContainer.className = 'quick-fill-container hidden';

        // V3.10: Append as SIBLING of overlay-layer (not child)
        // This ensures proper DOM tree attachment and z-index stacking
        const overlayLayer = document.getElementById('overlay-layer');
        if (overlayLayer && overlayLayer.parentElement) {
            // Insert after overlay-layer, before drawing-layer
            const drawingLayer = document.getElementById('drawing-layer');
            if (drawingLayer) {
                overlayLayer.parentElement.insertBefore(this._overlayContainer, drawingLayer);
            } else {
                overlayLayer.parentElement.appendChild(this._overlayContainer);
            }
            console.log('[QuickFillOverlay] Container created as sibling of overlay-layer');
        } else {
            document.body.appendChild(this._overlayContainer);
            console.warn('[QuickFillOverlay] overlay-layer not found, appended to body');
        }

        // V3.10: Inject QuickFill toolbar group into the main toolbar (instead of bottom status bar)
        this._injectToolbarButtons();
    }

    /**
     * Inject QuickFill buttons into the main toolbar
     * Creates a toolbar group that shows only in QuickFill mode
     * V3.11: Skip if static toolbar already exists in HTML
     */
    _injectToolbarButtons() {
        // V3.11: Check if static toolbar exists - if so, use it instead of injecting
        const staticToolbar = document.getElementById('qf-static-toolbar');
        if (staticToolbar) {
            console.log('[QuickFillOverlay] Using static toolbar from HTML, skipping injection');
            this._toolbarGroup = staticToolbar;
            this._actionsGroup = document.getElementById('qf-static-actions');
            this._statusBar = this._actionsGroup;

            // Still need to create instruction bar
            const toolbar = document.getElementById('toolbar');
            this._instructionBar = document.createElement('div');
            this._instructionBar.className = 'quick-fill-instructions quick-fill-tools hidden';
            this._instructionBar.innerHTML = `<span class="qf-instruction-text">בחר כלי למעלה → לחץ על המקום בטופס → מלא → הורד PDF</span>`;
            if (toolbar && toolbar.parentElement) {
                toolbar.parentElement.insertBefore(this._instructionBar, toolbar.nextSibling);
            }
            return;
        }

        const toolbar = document.getElementById('toolbar');
        if (!toolbar) {
            console.warn('[QuickFillOverlay] Toolbar not found, cannot inject buttons');
            return;
        }

        // Find the tools group (after which we'll insert QuickFill tools)
        const toolsGroup = toolbar.querySelector('.toolbar-group.tools');
        const toolsSeparator = toolsGroup?.nextElementSibling;

        // Create QuickFill toolbar group (hidden by default, shown in QuickFill mode)
        this._toolbarGroup = document.createElement('div');
        this._toolbarGroup.id = 'quick-fill-toolbar';
        this._toolbarGroup.className = 'toolbar-group quick-fill-tools hidden';
        this._toolbarGroup.innerHTML = `
            <button class="toolbar-btn tool-btn qf-tool-btn active" data-tool="draw_text" title="מילוי טקסט">
                <span class="qf-step">שלב 2</span>
                <span class="icon">📝</span>
                <span class="qf-text">
                    <span class="qf-title">מילוי טקסט</span>
                    <span class="qf-subtitle">שם, מספרים, ת"ז, תאריך, כתובת | בחר ואז לחץ על המקום בטופס</span>
                </span>
            </button>
            <button class="toolbar-btn tool-btn qf-tool-btn" data-tool="draw_checkbox" title="סימון ✓">
                <span class="qf-step">שלב 3</span>
                <span class="icon">☑️</span>
                <span class="qf-text">
                    <span class="qf-title">סימון ✓</span>
                    <span class="qf-subtitle">למשבצות שבהן צריך וי | בחר ואז לחץ על המשבצת</span>
                </span>
            </button>
            <button class="toolbar-btn tool-btn qf-tool-btn" data-tool="draw_radio" title="סימון ●">
                <span class="qf-step">שלב 4</span>
                <span class="icon">🔘</span>
                <span class="qf-text">
                    <span class="qf-title">סימון ●</span>
                    <span class="qf-subtitle">לבחירה מתוך אפשרויות | בחר ואז לחץ על העיגול המתאים</span>
                </span>
            </button>
            <button class="toolbar-btn tool-btn qf-tool-btn" data-tool="draw_signature" title="חתימה">
                <span class="qf-step">שלב 5</span>
                <span class="icon">✍️</span>
                <span class="qf-text">
                    <span class="qf-title">חתימה</span>
                    <span class="qf-subtitle">הוסף חתימה במקום המתאים בטופס</span>
                </span>
            </button>
        `;

        // Create QuickFill undo/redo group
        this._undoRedoGroup = document.createElement('div');
        this._undoRedoGroup.className = 'toolbar-group quick-fill-tools hidden';
        this._undoRedoGroup.innerHTML = `
            <button class="toolbar-btn qf-undo-btn" title="בטל (Ctrl+Z)" disabled>
                <span class="icon">↩️</span>
            </button>
            <button class="toolbar-btn qf-redo-btn" title="בצע שוב (Ctrl+Y)" disabled>
                <span class="icon">↪️</span>
            </button>
        `;

        // Create QuickFill actions group (load JSON, export, clear, count)
        this._actionsGroup = document.createElement('div');
        this._actionsGroup.className = 'toolbar-group quick-fill-tools hidden';
        this._actionsGroup.innerHTML = `
            <span class="box-count qf-box-count">0 שדות</span>
            <button class="toolbar-btn load-json-btn" title="טען מיפוי">
                <span class="icon">📋</span>
                <span class="qf-text">
                    <span class="qf-title">טען מיפוי</span>
                    <span class="qf-subtitle">טען קובץ JSON עם הגדרות שדות</span>
                </span>
            </button>
            <button class="toolbar-btn export-pdf-btn" title="הורד PDF">
                <span class="qf-step">שלב 6</span>
                <span class="icon">⬇️</span>
                <span class="qf-text">
                    <span class="qf-title">הורד PDF</span>
                    <span class="qf-subtitle">קבל את הטופס המלא כקובץ להורדה</span>
                </span>
            </button>
            <button class="toolbar-btn clear-all-btn" title="נקה הכל">
                <span class="icon">🗑️</span>
                <span class="qf-text">
                    <span class="qf-title">ניקוי</span>
                    <span class="qf-subtitle">מחק את הסימונים והטקסט שהזנת</span>
                </span>
            </button>
            <button class="toolbar-btn advanced-mode-btn" title="מצב מתקדם - כלי מיפוי">
                <span class="icon">🔧</span>
                <span class="qf-text">
                    <span class="qf-title">מתקדם</span>
                    <span class="qf-subtitle">עבור לכלי המיפוי המלא</span>
                </span>
            </button>
        `;

        this._instructionBar = document.createElement('div');
        this._instructionBar.className = 'quick-fill-instructions quick-fill-tools hidden';
        this._instructionBar.innerHTML = `
            <span class="qf-instruction-text">איך משתמשים? בחר פעולה למעלה → לחץ על המקום בטופס → מלא → בסיום הורד PDF</span>
        `;

        // Create separators for QuickFill groups
        const sep1 = document.createElement('div');
        sep1.className = 'toolbar-separator quick-fill-tools hidden';
        const sep2 = document.createElement('div');
        sep2.className = 'toolbar-separator quick-fill-tools hidden';
        const sep3 = document.createElement('div');
        sep3.className = 'toolbar-separator quick-fill-tools hidden';

        // Insert after the tools group and its separator
        if (toolsSeparator && toolsSeparator.nextSibling) {
            const insertPoint = toolsSeparator.nextSibling;
            toolbar.insertBefore(this._toolbarGroup, insertPoint);
            toolbar.insertBefore(sep1, insertPoint);
            toolbar.insertBefore(this._undoRedoGroup, insertPoint);
            toolbar.insertBefore(sep2, insertPoint);
            toolbar.insertBefore(this._actionsGroup, insertPoint);
            toolbar.insertBefore(sep3, insertPoint);
        } else {
            // Fallback: append to toolbar
            toolbar.appendChild(this._toolbarGroup);
            toolbar.appendChild(sep1);
            toolbar.appendChild(this._undoRedoGroup);
            toolbar.appendChild(sep2);
            toolbar.appendChild(this._actionsGroup);
            toolbar.appendChild(sep3);
        }

        if (toolbar && toolbar.parentElement) {
            toolbar.parentElement.insertBefore(this._instructionBar, toolbar.nextSibling);
        }

        // Attach event handlers to toolbar buttons
        this._attachToolbarHandlers();

        // Store reference for status bar compatibility
        this._statusBar = this._actionsGroup;

        console.log('[QuickFillOverlay] Toolbar buttons injected');
    }

    /**
     * Attach event handlers to QuickFill toolbar buttons
     */
    _attachToolbarHandlers() {
        // Tool buttons (including signature)
        this._toolbarGroup.querySelectorAll('.qf-tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                this._setActiveTool(tool);
            });
        });

        // Undo/Redo buttons
        this._undoRedoGroup.querySelector('.qf-undo-btn').addEventListener('click', () => {
            this.undo();
            this._updateUndoRedoButtons();
        });

        this._undoRedoGroup.querySelector('.qf-redo-btn').addEventListener('click', () => {
            this.redo();
            this._updateUndoRedoButtons();
        });

        // Action buttons - Load JSON triggers file picker
        this._actionsGroup.querySelector('.load-json-btn').addEventListener('click', () => {
            this._setInstructionText('טען מיפוי: בחר קובץ JSON עם הגדרות שדות');
            // Trigger JSON file input
            const jsonInput = document.getElementById('json-file-input');
            if (jsonInput) {
                jsonInput.click();
            }
        });

        this._actionsGroup.querySelector('.clear-all-btn').addEventListener('click', () => {
            this._setInstructionText('ניקוי טופס: מחק את הסימונים והטקסט שהזנת');
            this.clearAll();
        });

        this._actionsGroup.querySelector('.export-pdf-btn').addEventListener('click', () => {
            this._setInstructionText('סיום: הורד את הקובץ המלא ושמור אותו אצלך');
            this.exportPDF();
        });

        // Advanced mode button - switch to Mapper mode
        this._actionsGroup.querySelector('.advanced-mode-btn').addEventListener('click', (e) => {
            // V3.11: Only switch if this is a real user click
            if (e.isTrusted && state.isQuickFillMode()) {
                state.setFlowMode(FlowModes.MAPPING);
            }
        });
    }

    /**
     * Update undo/redo button states based on stack sizes
     */
    _updateUndoRedoButtons() {
        const undoBtn = this._undoRedoGroup?.querySelector('.qf-undo-btn');
        const redoBtn = this._undoRedoGroup?.querySelector('.qf-redo-btn');

        if (undoBtn) {
            undoBtn.disabled = this._undoStack.length === 0;
        }
        if (redoBtn) {
            redoBtn.disabled = this._redoStack.length === 0;
        }
    }

    /**
     * Attach event listeners
     */
    _attachEventListeners() {
        // Listen for Quick Fill mode changes
        eventBus.on(Events.QUICK_FILL_MODE_CHANGED, ({ active }) => {
            this._onModeChanged(active);
        });

        // Listen for new boxes from DrawController
        eventBus.on(Events.QUICK_FILL_BOX_CREATED, (data) => {
            this._onBoxCreated(data);
        });

        // Listen for page changes to show/hide boxes
        eventBus.on(Events.PDF_PAGE_CHANGED, ({ pageNum }) => {
            this._onPageChanged(pageNum);
        });

        // V3.10: Listen for tool changes to sync tool buttons
        eventBus.on(Events.TOOL_CHANGED, ({ tool }) => {
            this._syncToolButtons(tool);
        });

        // V3.10: Zoom is handled via CSS transform on transform-container
        // Our boxes scale automatically with the transform - no position update needed
        eventBus.on(Events.ZOOM_CHANGED, ({ zoom }) => {
            console.log('[QuickFillOverlay] Zoom changed to:', zoom, '(no position update needed - CSS transform handles it)');
        });

        // V3.10: Listen for window resize to update box positions
        // Use 200ms delay to ensure overlayRenderer has updated layer size (it uses 150ms)
        let resizeTimeout;
        this._resizeHandler = () => {
            console.log('[QuickFillOverlay] Window resize detected');
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                console.log('[QuickFillOverlay] Resize handler executing');
                this._updateAllBoxPositions();
            }, 200);
        };
        window.addEventListener('resize', this._resizeHandler);
        console.log('[QuickFillOverlay] Resize listener attached');

        // V3.11: Listen for PDF loaded to auto-import pending fields
        eventBus.on(Events.PDF_LOADED, () => {
            console.log('[QuickFillOverlay] PDF loaded event received');
            if (this._pendingImportFromFields) {
                console.log('[QuickFillOverlay] Processing pending import from fields...');
                this._pendingImportFromFields = false;
                // Small delay to ensure PDF dimensions are fully set
                setTimeout(() => {
                    const count = this.importFromFields();
                    if (count > 0) {
                        // Emit event for toast
                        eventBus.emit(Events.TOAST_SHOW, {
                            message: `נטענו ${count} שדות למילוי`,
                            type: 'success'
                        });
                    }
                }, 200);
            }
        });

        // V3.10: Listen for UI profile changes (public/advanced mode switch)
        // When sidebar shows/hides, overlay layer size changes - need to recalculate positions
        eventBus.on('UI_PROFILE_CHANGED', ({ mode }) => {
            console.log('[QuickFillOverlay] UI profile changed to:', mode);
            // Delay to allow layout to settle after sidebar visibility change
            setTimeout(() => {
                this._updateAllBoxPositions();
            }, 250);
        });

        // V3.10: Listen for PDF load - layer size may change after PDF finishes rendering
        // This catches the second size change that happens after UI profile change
        eventBus.on(Events.PDF_LOADED, () => {
            console.log('[QuickFillOverlay] PDF loaded - updating box positions');
            setTimeout(() => {
                this._updateAllBoxPositions();
            }, 200);
            this._updateToolbarAvailability();
            this._updateInstructionDefault();
        });

        // V3.10: Listen for mapping loaded from JSON - recalculate all positions
        // Boxes might have been created with incorrect layer dimensions
        eventBus.on('MAPPING_LOADED', ({ count }) => {
            console.log(`[QuickFillOverlay] Mapping loaded (${count} fields) - updating box positions`);
            setTimeout(() => {
                this._updateAllBoxPositions();
            }, 100);
        });
    }

    /**
     * Handle mode change
     * @param {boolean} active - Whether Quick Fill mode is active
     */
    _onModeChanged(active) {
        if (active) {
            this._overlayContainer.classList.remove('hidden');

            // Show QuickFill toolbar groups
            document.querySelectorAll('.quick-fill-tools').forEach(el => {
                el.classList.remove('hidden');
            });

            // Hide mapper-only toolbar elements
            document.querySelectorAll('[data-mapper-only]').forEach(el => {
                el.classList.add('hidden');
            });

            this._updateStatusBar();
            this._updateInstructionDefault();
            this._updateToolbarAvailability();

            // V3.10: Switch to DRAW_TEXT tool for drawing boxes
            // Save previous tool to restore when exiting
            this._previousTool = state.get('tool');
            state.setTool(Tools.DRAW_TEXT);

            // Add body class for visual indicator
            document.body.classList.add('quick-fill-mode');

            console.log('[QuickFillOverlay] Quick Fill mode ACTIVATED - tool set to DRAW_TEXT');
        } else {
            this._overlayContainer.classList.add('hidden');

            // Hide QuickFill toolbar groups
            document.querySelectorAll('.quick-fill-tools').forEach(el => {
                el.classList.add('hidden');
            });

            // Show mapper-only toolbar elements
            document.querySelectorAll('[data-mapper-only]').forEach(el => {
                el.classList.remove('hidden');
            });

            // V3.10: Restore previous tool or default to SELECT
            state.setTool(this._previousTool || Tools.SELECT);
            this._previousTool = null;

            // Remove body class
            document.body.classList.remove('quick-fill-mode');

            console.log('[QuickFillOverlay] Quick Fill mode DEACTIVATED - tool restored');
        }
    }

    /**
     * Set active drawing tool and update UI
     * @param {string} toolName - 'draw_text', 'draw_checkbox', or 'draw_radio'
     */
    _setActiveTool(toolName) {
        // Map tool name to Tools enum
        const toolMap = {
            'draw_text': Tools.DRAW_TEXT,
            'draw_checkbox': Tools.DRAW_CHECKBOX,
            'draw_radio': Tools.DRAW_RADIO,
            'draw_circle': Tools.DRAW_CIRCLE,
            'draw_signature': Tools.DRAW_SIGNATURE
        };

        const tool = toolMap[toolName];
        if (!tool) {
            console.warn('[QuickFillOverlay] Unknown tool:', toolName);
            return;
        }

        // Set tool in state
        state.setTool(tool);

        // Update button states in toolbar group
        if (this._toolbarGroup) {
            this._toolbarGroup.querySelectorAll('.qf-tool-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === toolName);
            });
        }

        this._updateInstructionForTool(toolName);

        console.log('[QuickFillOverlay] Tool changed to:', toolName);
    }

    /**
     * Sync tool buttons with current tool state
     * Called when tool changes from keyboard shortcuts
     * @param {string} tool - Tool enum value
     */
    _syncToolButtons(tool) {
        // Map tool enum to button data-tool
        const toolToName = {
            [Tools.DRAW_TEXT]: 'draw_text',
            [Tools.DRAW_CHECKBOX]: 'draw_checkbox',
            [Tools.DRAW_RADIO]: 'draw_radio',
            [Tools.DRAW_SIGNATURE]: 'draw_signature'
        };

        const toolName = toolToName[tool];
        if (!toolName) return; // Not a QuickFill tool

        // Update button states in toolbar group
        if (this._toolbarGroup) {
            this._toolbarGroup.querySelectorAll('.qf-tool-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === toolName);
            });
        }

        this._updateInstructionForTool(toolName);
    }

    _updateInstructionDefault() {
        if (!this._instructionBar) return;

        const hasPdf = Boolean(pdfEngine?.getPdfData?.());
        if (!hasPdf) {
            this._instructionBar.textContent = 'קודם פתח טופס כדי להתחיל למלא';
            return;
        }

        this._instructionBar.textContent = 'איך משתמשים? בחר פעולה למעלה → לחץ על המקום בטופס → מלא → בסיום הורד PDF';
    }

    _updateInstructionForTool(toolName) {
        if (!this._instructionBar) return;

        const hasPdf = Boolean(pdfEngine?.getPdfData?.());
        if (!hasPdf) {
            this._instructionBar.textContent = 'קודם פתח טופס כדי להתחיל למלא';
            return;
        }

        const textMap = {
            draw_text: 'מילוי טקסט: לחץ על המקום בטופס שבו צריך לכתוב → הקלד → אשר',
            draw_checkbox: 'סימון ✓: לחץ על משבצת כדי להוסיף/להסיר וי',
            draw_radio: 'סימון ●: לחץ על העיגול המתאים כדי לבחור אפשרות אחת',
            draw_signature: 'חתימה: לחץ במקום החתימה → צייר/הוסף חתימה → שמור'
        };

        this._instructionBar.textContent = textMap[toolName] || 'איך משתמשים? בחר פעולה למעלה → לחץ על המקום בטופס → מלא → בסיום הורד PDF';
    }

    _setInstructionText(text) {
        if (!this._instructionBar) return;
        if (!text) return;
        this._instructionBar.textContent = text;
    }

    /**
     * Set instruction state for different QuickFill phases
     * Called externally (e.g., from DrawController) to update instructions dynamically
     * @param {string} state - 'refiner' | 'typing' | 'default'
     * @param {string} toolName - Optional tool name for default state
     */
    setInstructionState(state, toolName = null) {
        if (!this._instructionBar) return;

        const states = {
            refiner: '📦 Enter לאישור המלבן | קליק בקצוות לכיוונון | Esc לביטול',
            typing: '✏️ הקלד את הטקסט | לחץ במקום אחר להמשיך'
        };

        if (states[state]) {
            this._instructionBar.textContent = states[state];
        } else if (toolName) {
            this._updateInstructionForTool(toolName);
        } else {
            this._updateInstructionDefault();
        }
    }

    _updateToolbarAvailability() {
        const hasPdf = Boolean(pdfEngine?.getPdfData?.());
        const toolButtons = this._toolbarGroup?.querySelectorAll('.qf-tool-btn') || [];
        toolButtons.forEach(btn => {
            btn.disabled = !hasPdf;
        });

        const exportBtn = this._actionsGroup?.querySelector('.export-pdf-btn');
        if (exportBtn) {
            exportBtn.disabled = !hasPdf;
        }
    }

    /**
     * Handle new box created from DrawController
     * @param {Object} data - { bbox, screenRect, page, tool }
     */
    _onBoxCreated(data) {
        console.log('[QuickFillOverlay] _onBoxCreated received:', data);

        const { bbox, screenRect, page, tool } = data;

        // Handle signature tool specially - open modal first
        if (tool === 'draw_signature') {
            // Store pending signature data
            this._pendingSignatureBox = { bbox, screenRect, page };
            this._openSignatureModal();
            return;
        }

        // Determine box type from tool
        const isCheckbox = tool === 'draw_checkbox';
        const isRadio = tool === 'draw_radio';
        const isCircle = tool === 'draw_circle';
        const isCell = tool === 'draw_cell';
        const boxType = isCell ? 'cell' : (isCheckbox ? 'checkbox' : (isRadio ? 'radio' : (isCircle ? 'circle' : 'text')));

        // Generate unique ID
        const boxId = `qf-box-${++this._boxCounter}`;

        // Create box data
        // Circle starts as checked=true (creating it IS the action)
        // Checkbox/Radio start as checked=false (user needs to click to check)
        const initialChecked = isCircle ? true : false;

        const box = {
            id: boxId,
            bbox: bbox,
            screenRect: screenRect,
            page: page,
            text: '',
            tool: tool,
            type: boxType,          // 'text', 'checkbox', 'radio', or 'circle'
            checked: initialChecked,
            createdAt: Date.now()
        };

        this._boxes.push(box);

        // V3.10: Push to undo stack (for undo of create = delete)
        this._pushUndo('create', { boxId: box.id, box: { ...box } });

        // Render based on type
        if (boxType === 'checkbox' || boxType === 'radio' || boxType === 'circle' || boxType === 'cell') {
            this._renderCheckboxRadio(box);
        } else {
            this._renderBox(box);
        }

        // Update status
        this._updateStatusBar();

        console.log('[QuickFillOverlay] Box created:', boxId, 'type:', boxType, 'checked:', initialChecked, 'Total:', this._boxes.length);

        // Emit event for external listeners
        eventBus.emit(Events.QUICK_FILL_BOX_UPDATED, { boxId, text: '', checked: initialChecked, type: boxType, bbox, page });
    }

    /**
     * Render a box overlay with PreviewTextRenderer (same as LiveFill)
     * @param {Object} box - Box data
     * @param {boolean} skipFocus - If true, don't auto-focus the input (for bulk import)
     */
    _renderBox(box, skipFocus = false) {
        const currentPage = state.get('document.currentPage');
        const pdfDims = state.get('pdfDimensions') || { width: 595, height: 842, scale: 1 };

        // Get BASE PDF dimensions in points (divide by scale factor)
        // pdfDimensions.width/height are in PIXELS, we need POINTS
        const pdfScale = pdfDims.scale || 1;
        const basePdfWidth = pdfDims.width / pdfScale;   // Convert to PDF points
        const basePdfHeight = pdfDims.height / pdfScale;

        // Calculate fieldPt from bbox using BASE PDF dimensions
        const fieldPt = this._getFieldPtFromBbox(box.bbox, basePdfWidth, basePdfHeight);

        // Calculate scale: pt → px (same as LiveFill)
        // screenRect is in CSS pixels, fieldPt is in PDF points
        const ptToPxScale = box.screenRect.width / fieldPt.width;

        console.log('[QuickFillOverlay] _renderBox:', {
            boxId: box.id,
            pdfDims: { width: pdfDims.width, height: pdfDims.height, scale: pdfScale },
            basePdf: { width: basePdfWidth, height: basePdfHeight },
            fieldPt,
            ptToPxScale,
            screenRect: box.screenRect
        });

        // Create box element
        const boxEl = document.createElement('div');
        boxEl.id = box.id;
        boxEl.className = 'quick-fill-box';
        boxEl.dataset.page = box.page;
        boxEl.dataset.fieldPt = JSON.stringify(fieldPt);
        boxEl.dataset.ptToPxScale = ptToPxScale;

        // Position using screen coordinates
        boxEl.style.left = `${box.screenRect.x}px`;
        boxEl.style.top = `${box.screenRect.y}px`;
        boxEl.style.width = `${box.screenRect.width}px`;
        boxEl.style.height = `${box.screenRect.height}px`;

        // Hide if not on current page
        if (box.page !== currentPage) {
            boxEl.classList.add('hidden');
        }

        // Create single-line input (one field = one line)
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'text';
        hiddenInput.className = 'quick-fill-hidden-input';
        hiddenInput.value = box.text || '';
        hiddenInput.dir = 'rtl';

        // Hidden input with preview rendering
        hiddenInput.style.cssText = `
            position: absolute;
            opacity: 0;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            cursor: text;
            font-size: 16px;
            z-index: 10;
        `;

        // V3.10: Track original value for undo
        let originalTextValue = box.text || '';

        // Store original value on focus
        hiddenInput.addEventListener('focus', () => {
            originalTextValue = box.text || '';
        });

        // Handle input changes
        hiddenInput.addEventListener('input', (e) => {
            const newValue = e.target.value;
            box.text = newValue;

            // V3.10: Add/remove has-text class for transparent mode
            if (newValue && newValue.length > 0) {
                boxEl.classList.add('has-text');
            } else {
                boxEl.classList.remove('has-text');
            }

            // Render with PreviewTextRenderer (same as LiveFill)
            try {
                this._renderPreviewText(boxEl, newValue, fieldPt, ptToPxScale, box.screenRect, box);
            } catch (err) {
                console.error('[QuickFillOverlay] ERROR in _renderPreviewText:', err);
            }

            // Re-add hidden input (renderPreviewText clears innerHTML)
            boxEl.appendChild(hiddenInput);
            hiddenInput.focus();

            // Emit event
            eventBus.emit(Events.QUICK_FILL_BOX_UPDATED, {
                boxId: box.id,
                text: newValue,
                bbox: box.bbox,
                page: box.page
            });
        });

        // Push to undo on blur if value changed
        hiddenInput.addEventListener('blur', () => {
            if (box.text !== originalTextValue) {
                this._pushUndo('edit', {
                    boxId: box.id,
                    field: 'text',
                    oldValue: originalTextValue
                });
                originalTextValue = box.text; // Update for next edit
            }
        });

        // Handle keyboard shortcuts
        hiddenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Enter moves to next box (one field = one line)
                e.preventDefault();
                this._focusNextBox(box.id);
            } else if (e.key === 'Escape') {
                hiddenInput.blur();
            } else if (e.key === 'Delete' && e.shiftKey) {
                this._deleteBox(box.id);
            }
        });

        // Click on box focuses input
        boxEl.addEventListener('click', () => {
            hiddenInput.focus();
        });

        // V3.10: Removed delete button - use undo or clear all instead

        boxEl.appendChild(hiddenInput);

        // V3.10: Make box draggable
        this._makeDraggable(boxEl, box);

        // Ensure container exists
        if (!this._overlayContainer) {
            console.error('[QuickFillOverlay] ERROR: Container is null!');
            this._createOverlayContainer();
        }

        this._overlayContainer.appendChild(boxEl);

        // Focus the input immediately (unless skipFocus is true)
        if (!skipFocus) {
            setTimeout(() => hiddenInput.focus(), 50);
        }
    }

    /**
     * Render a checkbox, radio, or circle box (same style as LiveFill)
     * @param {Object} box - Box data with type 'checkbox', 'radio', or 'circle'
     * @param {boolean} skipFocus - If true, don't auto-focus (for bulk import)
     */
    _renderCheckboxRadio(box, skipFocus = false) {
        const currentPage = state.get('document.currentPage');
        const isCheckbox = box.type === 'checkbox';
        const isCell = box.type === 'cell';
        const isCircle = box.type === 'circle';

        const boxEl = document.createElement('div');
        boxEl.id = box.id;
        // Cell type uses checkbox styling but with preserved size
        // Circle type uses its own styling
        const styleClass = isCell ? 'cell' : box.type;
        boxEl.className = `quick-fill-box quick-fill-${styleClass}`;
        boxEl.dataset.page = box.page;
        boxEl.dataset.type = box.type;
        boxEl.dataset.checked = box.checked ? 'true' : 'false';

        // Position using screen coordinates
        boxEl.style.left = `${box.screenRect.x}px`;
        boxEl.style.top = `${box.screenRect.y}px`;
        boxEl.style.width = `${box.screenRect.width}px`;
        boxEl.style.height = `${box.screenRect.height}px`;

        // Hide if not on current page
        if (box.page !== currentPage) {
            boxEl.classList.add('hidden');
        }

        // Create symbol element with dynamic font-size (70% of box like export-engine)
        const symbol = document.createElement('span');
        symbol.className = 'quick-fill-symbol';
        const symbolSize = Math.min(box.screenRect.width, box.screenRect.height) * 0.70;
        symbol.style.fontSize = `${symbolSize}px`;
        this._updateCheckboxSymbol(symbol, box.type, box.checked);

        // Click toggles checked state
        boxEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-fill-delete')) return;

            // V3.10: Push to undo before toggle
            const oldChecked = box.checked;
            this._pushUndo('edit', {
                boxId: box.id,
                field: 'checked',
                oldValue: oldChecked
            });

            box.checked = !box.checked;
            boxEl.dataset.checked = box.checked ? 'true' : 'false';
            this._updateCheckboxSymbol(symbol, box.type, box.checked);

            // Emit event
            eventBus.emit(Events.QUICK_FILL_BOX_UPDATED, {
                boxId: box.id,
                checked: box.checked,
                type: box.type,
                bbox: box.bbox,
                page: box.page
            });
        });

        // V3.10: Removed delete button - use undo or clear all instead

        boxEl.appendChild(symbol);

        // V3.10: Make box draggable
        this._makeDraggable(boxEl, box);

        // Ensure container exists
        if (!this._overlayContainer) {
            console.error('[QuickFillOverlay] ERROR: Container is null!');
            this._createOverlayContainer();
        }

        this._overlayContainer.appendChild(boxEl);
    }

    /**
     * Update checkbox/radio symbol based on state
     * @param {HTMLElement} symbolEl - Symbol element
     * @param {string} type - 'checkbox' or 'radio'
     * @param {boolean} checked - Whether checked
     */
    _updateCheckboxSymbol(symbolEl, type, checked) {
        if (type === 'checkbox' || type === 'cell') {
            // V פשוט ואנושי - יותר סימטרי מ-✓
            // Cell type uses same symbol as checkbox but preserves full rectangle size
            symbolEl.textContent = checked ? 'V' : '';
        } else if (type === 'circle') {
            // Circle: no symbol inside - the border itself is the circle
            // The border becomes solid black when checked (via CSS)
            symbolEl.textContent = '';
        } else {
            symbolEl.textContent = checked ? '●' : '';
        }
    }

    /**
     * Render text using PreviewTextRenderer (same as LiveFill)
     * @param {HTMLElement} container - Box element
     * @param {string} value - Text value
     * @param {Object} fieldPt - Field dimensions in PDF points
     * @param {number} scale - pt to px scale factor
     * @param {Object} screenRect - Optional screen coordinates for scaffold avoidance
     * @param {Object} box - Optional box object to store structured placement for export
     */
    _renderPreviewText(container, value, fieldPt, scale, screenRect = null, box = null) {
        if (!window.PreviewTextRenderer) {
            console.warn('[QuickFillOverlay] PreviewTextRenderer not loaded');
            container.textContent = value || '';
            return;
        }

        // Clear any previous structured placement data
        if (box) {
            box.structuredSegments = null;
        }

        // Remove structured placement class (will be re-added if needed)
        container.classList.remove('structured-placement');

        // ══════════════════════════════════════════════════════════════════
        // STRUCTURED PLACEMENT (V2.1) - Try segment-based rendering first
        // For date fields with printed separators: DD / MM / YYYY
        // ══════════════════════════════════════════════════════════════════
        if (window.FEATURES?.SCAFFOLD_AVOIDANCE && window.ScaffoldAvoidance?.computeStructuredPlacement && screenRect) {
            try {
                const fontSize = fieldPt.height * 0.65 * scale;

                console.log('[QuickFillOverlay] Checking structured placement:', {
                    text: value,
                    screenRect: screenRect,
                    fontSize: fontSize,
                    hasBox: !!box
                });

                const structured = window.ScaffoldAvoidance.computeStructuredPlacement({
                    screenRect: screenRect,
                    fontSize: fontSize,
                    text: value
                });

                console.log('[QuickFillOverlay] Structured result: mode=' + structured.mode + ', reason=' + structured.reason + ', debug=' + JSON.stringify(structured.debug));

                if (structured.mode === 'structured' && structured.segments) {
                    // Store segments on box for export (cache the detection result)
                    if (box) {
                        box.structuredSegments = structured.segments;
                        console.log('[QuickFillOverlay] Cached structured segments for export:', structured.segments);
                    }

                    // Add CSS class that enables overflow:visible
                    container.classList.add('structured-placement');

                    // Render structured segments in preview (same as export)
                    // Pass screenRect.width so we use same coordinate space as segment calculation
                    this._renderStructuredSegments(container, structured.segments, fontSize, fieldPt.height * scale, screenRect.width);
                    return;
                }
            } catch (err) {
                console.error('[QuickFillOverlay] ERROR in structured placement:', err);
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // FALLBACK: SCAFFOLD AVOIDANCE (V2.0) - Horizontal-only, no Y shift
        // Applies: X offset (marginLeft) and/or font scale
        // ══════════════════════════════════════════════════════════════════
        let xOffsetPx = 0;
        let fontScale = 1.0;

        if (window.FEATURES?.SCAFFOLD_AVOIDANCE && window.ScaffoldAvoidance && screenRect) {
            const adjustment = window.ScaffoldAvoidance.computeAdjustment({
                screenRect: screenRect,
                fontSize: fieldPt.height * 0.65 * scale,
                text: value
            });

            if (adjustment?.didAdjust) {
                xOffsetPx = adjustment.xOffset || 0;
                fontScale = adjustment.fontScale || 1.0;
            }
        }
        // ══════════════════════════════════════════════════════════════════

        // Use standard PreviewTextRenderer (single-line, bottom-anchored)
        // Apply font scale if needed
        const effectiveFieldPt = fontScale < 1.0 ? {
            width: fieldPt.width,
            height: fieldPt.height * fontScale
        } : fieldPt;

        window.PreviewTextRenderer.render(container, value, {
            fieldPt: effectiveFieldPt,
            scale,
            style: {}
        });

        // ══════════════════════════════════════════════════════════════════
        // Apply horizontal offset via CSS (no vertical movement)
        // ══════════════════════════════════════════════════════════════════
        if (xOffsetPx !== 0) {
            container.style.marginLeft = `${xOffsetPx}px`;
        } else {
            container.style.marginLeft = '';
        }
        container.style.transform = ''; // Ensure no Y shift from previous version
    }

    /**
     * ╔════════════════════════════════════════════════════════════════════════╗
     * ║              🔒 LOCKED FUNCTION - DO NOT MODIFY 🔒                      ║
     * ╠════════════════════════════════════════════════════════════════════════╣
     * ║  _renderStructuredSegments - Renders date segments (DD/MM/YYYY)        ║
     * ║                                                                        ║
     * ║  STATUS: WORKING & TESTED (2026-01-20)                                 ║
     * ║  MUST MATCH: LiveFill _renderStructuredSegmentsLiveFill                ║
     * ║  MUST MATCH: export-engine.js structured placement output              ║
     * ║                                                                        ║
     * ║  CRITICAL POSITIONING (same as PreviewTextRenderer):                   ║
     * ║  • bottom: 0 (anchor to container bottom)                              ║
     * ║  • transform: translateY(15%) (push down for baseline alignment)       ║
     * ║  • line-height: 0.8 (reduce text box height)                           ║
     * ╚════════════════════════════════════════════════════════════════════════╝
     *
     * @param {HTMLElement} container - Box element
     * @param {Array} segments - Array of { text, x, width }
     * @param {number} fontSize - Font size in pixels
     * @param {number} containerHeight - Container height in pixels
     * @param {number} bboxWidth - Original bbox width (for correct percentage calculation)
     */
    _renderStructuredSegments(container, segments, fontSize, containerHeight, bboxWidth) {
        console.log('[QuickFillOverlay] _renderStructuredSegments:', segments.map(s => s.text + '@' + s.x.toFixed(0)), 'bboxWidth:', bboxWidth);

        // Clear container but keep reference to hidden input
        const hiddenInput = container.querySelector('.quick-fill-hidden-input');
        container.innerHTML = '';

        // Use bboxWidth (screenRect.width) for percentage calculations
        // This matches the coordinate space used when computing segments
        const refWidth = bboxWidth || container.offsetWidth;

        // Create each segment span positioned relative to container
        // Use same positioning formula as PreviewTextRenderer for consistency
        for (const segment of segments) {
            // Use pixel positioning directly (segment.x is in screen pixels relative to bbox)
            // This matches how Export calculates: segmentX = xPDF + (segment.x * scale)
            const span = document.createElement('span');
            span.textContent = segment.text;
            // Use bottom: 0 + translateY(15%) like PreviewTextRenderer
            // This anchors text to bottom with small gap (same as export-engine)
            span.style.cssText = `
                position: absolute;
                left: ${segment.x}px;
                bottom: 0;
                transform: translateY(15%);
                font-size: ${fontSize}px;
                font-family: 'David Libre', 'David', 'Arial Hebrew', serif;
                line-height: 0.8;
                white-space: nowrap;
                pointer-events: none;
                color: black;
            `;
            container.appendChild(span);
        }

        // Re-add hidden input if it existed
        if (hiddenInput) {
            container.appendChild(hiddenInput);
        }
    }

    /**
     * V3.10: Make a box element draggable
     * @param {HTMLElement} boxEl - The box DOM element
     * @param {Object} box - The box data object
     */
    _makeDraggable(boxEl, box) {
        let isDragging = false;
        let startX, startY;
        let boxStartX, boxStartY;

        const onMouseDown = (e) => {
            // Don't start drag if clicking on input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Only left mouse button
            if (e.button !== 0) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            boxStartX = box.screenRect.x;
            boxStartY = box.screenRect.y;

            boxEl.style.cursor = 'grabbing';
            boxEl.style.zIndex = '1000';

            e.preventDefault();

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            const newX = boxStartX + deltaX;
            const newY = boxStartY + deltaY;

            // Update DOM position
            boxEl.style.left = `${newX}px`;
            boxEl.style.top = `${newY}px`;
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;

            isDragging = false;
            boxEl.style.cursor = '';
            boxEl.style.zIndex = '';

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // Only update if actually moved
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                const newX = boxStartX + deltaX;
                const newY = boxStartY + deltaY;

                // Update screenRect
                box.screenRect.x = newX;
                box.screenRect.y = newY;

                // Update bbox using overlayRenderer
                const newBbox = overlayRenderer.screenToBbox({
                    x: newX,
                    y: newY,
                    width: box.screenRect.width,
                    height: box.screenRect.height
                });
                box.bbox = newBbox;

                // Push to undo stack
                this._pushUndo('move', {
                    boxId: box.id,
                    oldScreenRect: { x: boxStartX, y: boxStartY, width: box.screenRect.width, height: box.screenRect.height },
                    oldBbox: [...box.bbox]
                });

                console.log('[QuickFillOverlay] Box moved:', box.id, 'to', newX, newY);

                // Emit update event
                eventBus.emit(Events.QUICK_FILL_BOX_UPDATED, {
                    boxId: box.id,
                    bbox: box.bbox,
                    page: box.page
                });
            }
        };

        boxEl.addEventListener('mousedown', onMouseDown);
        boxEl.style.cursor = 'grab';
    }

    /**
     * V3.10: Make element resizable (for signatures only)
     * @param {HTMLElement} boxEl - Box element
     * @param {Object} box - Box data object
     */
    _makeResizable(boxEl, box) {
        // Create resize handle (bottom-right corner)
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.style.cssText = `
            position: absolute;
            bottom: 0;
            right: 0;
            width: 14px;
            height: 14px;
            background: linear-gradient(135deg, transparent 50%, #2563eb 50%);
            cursor: se-resize;
            z-index: 10;
            border-radius: 0 0 4px 0;
        `;
        boxEl.appendChild(handle);

        let isResizing = false;
        let startX, startY;
        let startWidth, startHeight;

        const onMouseDown = (e) => {
            e.stopPropagation(); // Don't trigger drag
            e.preventDefault();

            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = box.screenRect.width;
            startHeight = box.screenRect.height;

            handle.style.background = 'linear-gradient(135deg, transparent 50%, #1d4ed8 50%)';

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // Calculate new size (minimum 40x20)
            const newWidth = Math.max(40, startWidth + deltaX);
            const newHeight = Math.max(20, startHeight + deltaY);

            // Update DOM
            boxEl.style.width = `${newWidth}px`;
            boxEl.style.height = `${newHeight}px`;
        };

        const onMouseUp = (e) => {
            if (!isResizing) return;

            isResizing = false;
            handle.style.background = 'linear-gradient(135deg, transparent 50%, #2563eb 50%)';

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // Only update if actually resized
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                const newWidth = Math.max(40, startWidth + deltaX);
                const newHeight = Math.max(20, startHeight + deltaY);

                // Save old values for undo
                const oldScreenRect = { ...box.screenRect };
                const oldBbox = [...box.bbox];

                // Update screenRect
                box.screenRect.width = newWidth;
                box.screenRect.height = newHeight;

                // Update bbox
                const newBbox = overlayRenderer.screenToBbox({
                    x: box.screenRect.x,
                    y: box.screenRect.y,
                    width: newWidth,
                    height: newHeight
                });
                box.bbox = newBbox;

                // Push to undo stack
                this._pushUndo('resize', {
                    boxId: box.id,
                    oldScreenRect,
                    oldBbox
                });

                console.log('[QuickFillOverlay] Signature resized:', box.id, 'to', newWidth, 'x', newHeight);

                // Emit update event
                eventBus.emit(Events.QUICK_FILL_BOX_UPDATED, {
                    boxId: box.id,
                    bbox: box.bbox,
                    page: box.page
                });
            }
        };

        handle.addEventListener('mousedown', onMouseDown);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // V3.10: SIGNATURE FUNCTIONALITY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Open signature modal with draw and type tabs
     */
    _openSignatureModal() {
        // Remove existing modal if any
        const existing = document.getElementById('signature-modal');
        if (existing) existing.remove();

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'signature-modal';
        modal.className = 'signature-modal';
        modal.innerHTML = `
            <div class="signature-modal-content">
                <div class="signature-modal-header">
                    <h3>הוספת חתימה</h3>
                    <button class="signature-modal-close">×</button>
                </div>
                <div class="signature-tabs">
                    <button class="signature-tab active" data-tab="draw">✍️ ציור</button>
                    <button class="signature-tab" data-tab="type">⌨️ הקלדה</button>
                </div>
                <div class="signature-tab-content">
                    <div class="signature-panel active" data-panel="draw">
                        <canvas id="signature-canvas" width="400" height="150"></canvas>
                        <div class="signature-draw-actions">
                            <button class="signature-clear-btn">🗑️ נקה</button>
                        </div>
                    </div>
                    <div class="signature-panel" data-panel="type">
                        <input type="text" id="signature-text-input" placeholder="הקלד את שמך..." dir="rtl">
                        <div class="signature-preview" id="signature-type-preview"></div>
                        <div class="signature-font-options">
                            <button class="signature-font-btn active" data-font="cursive1">כתב יד 1</button>
                            <button class="signature-font-btn" data-font="cursive2">כתב יד 2</button>
                            <button class="signature-font-btn" data-font="cursive3">כתב יד 3</button>
                        </div>
                    </div>
                </div>
                <div class="signature-modal-footer">
                    <button class="signature-cancel-btn">ביטול</button>
                    <button class="signature-confirm-btn">הוסף חתימה</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Initialize signature pad
        this._initSignaturePad();

        // Attach modal event handlers
        this._attachSignatureModalHandlers(modal);
    }

    /**
     * Initialize the signature drawing canvas
     */
    _initSignaturePad() {
        const canvas = document.getElementById('signature-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        // Set drawing style
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Clear canvas with white background
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const startDrawing = (e) => {
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            lastX = e.clientX - rect.left;
            lastY = e.clientY - rect.top;
        };

        const draw = (e) => {
            if (!isDrawing) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.stroke();

            lastX = x;
            lastY = y;
        };

        const stopDrawing = () => {
            isDrawing = false;
        };

        // Mouse events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch events
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            startDrawing({ clientX: touch.clientX, clientY: touch.clientY });
        });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            draw({ clientX: touch.clientX, clientY: touch.clientY });
        });
        canvas.addEventListener('touchend', stopDrawing);

        // Store reference to clear function
        this._clearSignatureCanvas = () => {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        };

        // Store reference to get image data
        this._getSignatureCanvasData = () => {
            return canvas.toDataURL('image/png');
        };
    }

    /**
     * Attach event handlers to signature modal
     */
    _attachSignatureModalHandlers(modal) {
        // Helper to clear pending and close
        const cancelAndClose = () => {
            this._pendingSignatureBox = null; // Clear pending box on cancel
            modal.remove();
        };

        // Close button
        modal.querySelector('.signature-modal-close').addEventListener('click', cancelAndClose);

        // Cancel button
        modal.querySelector('.signature-cancel-btn').addEventListener('click', cancelAndClose);

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cancelAndClose();
        });

        // Tab switching
        modal.querySelectorAll('.signature-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                modal.querySelectorAll('.signature-tab').forEach(t => t.classList.remove('active'));
                modal.querySelectorAll('.signature-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                modal.querySelector(`[data-panel="${tabName}"]`).classList.add('active');
            });
        });

        // Clear canvas button
        modal.querySelector('.signature-clear-btn').addEventListener('click', () => {
            if (this._clearSignatureCanvas) this._clearSignatureCanvas();
        });

        // Text input for typed signature
        const textInput = modal.querySelector('#signature-text-input');
        const preview = modal.querySelector('#signature-type-preview');
        let selectedFont = 'cursive1';

        const updatePreview = () => {
            const text = textInput.value || 'חתימה';
            preview.textContent = text;
            preview.className = `signature-preview signature-font-${selectedFont}`;
        };

        textInput.addEventListener('input', updatePreview);
        updatePreview();

        // Font selection
        modal.querySelectorAll('.signature-font-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.signature-font-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedFont = btn.dataset.font;
                updatePreview();
            });
        });

        // Confirm button
        modal.querySelector('.signature-confirm-btn').addEventListener('click', () => {
            const activeTab = modal.querySelector('.signature-tab.active').dataset.tab;

            if (activeTab === 'draw') {
                // Get canvas data
                const imageData = this._getSignatureCanvasData();
                this._addSignatureToDocument(imageData, 'draw');
            } else {
                // Get typed signature
                const text = textInput.value;
                if (!text) {
                    alert('יש להקליד חתימה');
                    return;
                }
                this._addSignatureToDocument(text, 'type', selectedFont);
            }

            modal.remove();
        });
    }

    /**
     * Add signature to document
     * @param {string} data - Image data URL or text
     * @param {string} mode - 'draw' or 'type'
     * @param {string} font - Font name for typed signatures
     */
    _addSignatureToDocument(data, mode, font = 'cursive1') {
        let screenRect, bbox, page;

        // V3.10: Standard max size for signatures (user can still resize)
        const MAX_SIG_WIDTH = 150;
        const MAX_SIG_HEIGHT = 40;

        // Use pending signature box from drawn rectangle if available
        if (this._pendingSignatureBox) {
            screenRect = { ...this._pendingSignatureBox.screenRect };
            page = this._pendingSignatureBox.page;

            // V3.10: Cap signature size to standard max, keep position
            if (screenRect.width > MAX_SIG_WIDTH) {
                screenRect.width = MAX_SIG_WIDTH;
            }
            if (screenRect.height > MAX_SIG_HEIGHT) {
                screenRect.height = MAX_SIG_HEIGHT;
            }

            // Recalculate bbox with new size
            bbox = overlayRenderer.screenToBbox(screenRect);
            this._pendingSignatureBox = null; // Clear pending data
        } else {
            // Fallback: place in center (shouldn't happen with new flow)
            const sigWidth = MAX_SIG_WIDTH;
            const sigHeight = MAX_SIG_HEIGHT;
            const overlayLayer = document.getElementById('overlay-layer');
            const centerX = (overlayLayer?.offsetWidth || 600) / 2 - sigWidth / 2;
            const centerY = (overlayLayer?.offsetHeight || 800) / 2 - sigHeight / 2;

            screenRect = { x: centerX, y: centerY, width: sigWidth, height: sigHeight };
            bbox = overlayRenderer.screenToBbox(screenRect);
            page = state.get('document.currentPage');
        }

        // Generate unique ID
        const boxId = `qf-sig-${++this._boxCounter}`;

        // Create signature box data
        const box = {
            id: boxId,
            bbox: bbox,
            screenRect: screenRect,
            page: page,
            type: 'signature',
            signatureMode: mode,
            signatureData: data,
            signatureFont: font,
            createdAt: Date.now()
        };

        this._boxes.push(box);

        // Push to undo stack
        this._pushUndo('create', { boxId: box.id, box: { ...box } });

        // Render signature
        this._renderSignature(box);

        // Update status
        this._updateStatusBar();

        console.log('[QuickFillOverlay] Signature added:', boxId, 'mode:', mode);
    }

    /**
     * Render a signature box
     * @param {Object} box - Signature box data
     */
    _renderSignature(box) {
        const currentPage = state.get('document.currentPage');

        const boxEl = document.createElement('div');
        boxEl.id = box.id;
        boxEl.className = `quick-fill-box quick-fill-signature ${box.page !== currentPage ? 'hidden' : ''}`;
        boxEl.style.cssText = `
            position: absolute;
            left: ${box.screenRect.x}px;
            top: ${box.screenRect.y}px;
            width: ${box.screenRect.width}px;
            height: ${box.screenRect.height}px;
        `;

        if (box.signatureMode === 'draw') {
            // Show image
            const img = document.createElement('img');
            img.src = box.signatureData;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
            boxEl.appendChild(img);
        } else {
            // Show typed signature with font
            const textEl = document.createElement('div');
            textEl.className = `signature-text signature-font-${box.signatureFont}`;
            textEl.textContent = box.signatureData;
            textEl.style.cssText = `
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                color: #000;
            `;
            boxEl.appendChild(textEl);
        }

        // Make draggable
        this._makeDraggable(boxEl, box);

        // V3.10: Make resizable (signatures only)
        this._makeResizable(boxEl, box);

        // Add to container
        this._overlayContainer.appendChild(boxEl);
    }

    /**
     * Calculate field dimensions in PDF points from bbox
     * (Same as LiveFill's getFieldPtFromBbox)
     * @param {Array} bbox - [x, y, width, height] normalized 0-1
     * @param {number} pdfWidth - PDF page width in points
     * @param {number} pdfHeight - PDF page height in points
     * @returns {Object} {width, height} in PDF points
     */
    _getFieldPtFromBbox(bbox, pdfWidth, pdfHeight) {
        if (!bbox || bbox.length < 4) return { width: 100, height: 20 };

        const [x, y, w, h] = bbox;

        // Detect normalized vs absolute
        const isNormalized = x <= 1 && y <= 1 && w <= 1 && h <= 1;

        if (isNormalized) {
            return {
                width: w * pdfWidth,
                height: h * pdfHeight
            };
        } else {
            return { width: w, height: h };
        }
    }

    /**
     * Focus the next box input
     * @param {string} currentBoxId - Current box ID
     */
    _focusNextBox(currentBoxId) {
        const currentIndex = this._boxes.findIndex(b => b.id === currentBoxId);
        const currentPage = state.get('document.currentPage');

        // Find next box on same page
        for (let i = currentIndex + 1; i < this._boxes.length; i++) {
            if (this._boxes[i].page === currentPage) {
                const nextEl = document.getElementById(this._boxes[i].id);
                if (nextEl) {
                    const input = nextEl.querySelector('.quick-fill-hidden-input');
                    if (input) input.focus();
                    return;
                }
            }
        }

        // No next box - just blur current
        const currentEl = document.getElementById(currentBoxId);
        if (currentEl) {
            const input = currentEl.querySelector('.quick-fill-hidden-input');
            if (input) input.blur();
        }
    }

    /**
     * Delete a box
     * @param {string} boxId - Box ID to delete
     */
    _deleteBox(boxId) {
        // Find box data before deleting (for undo)
        const box = this._boxes.find(b => b.id === boxId);
        if (box) {
            // Push to undo stack with full box data
            this._pushUndo('delete', { box: { ...box } });
        }

        // Remove from DOM
        const boxEl = document.getElementById(boxId);
        if (boxEl) {
            boxEl.remove();
        }

        // Remove from array
        this._boxes = this._boxes.filter(b => b.id !== boxId);

        // Update status
        this._updateStatusBar();

        // Emit event
        eventBus.emit(Events.QUICK_FILL_BOX_DELETED, { boxId });

        console.log('[QuickFillOverlay] Box deleted:', boxId, 'Remaining:', this._boxes.length);
    }

    /**
     * Handle page change - show/hide boxes
     * @param {number} pageNum - New page number
     */
    _onPageChanged(pageNum) {
        this._boxes.forEach(box => {
            const boxEl = document.getElementById(box.id);
            if (boxEl) {
                if (box.page === pageNum) {
                    boxEl.classList.remove('hidden');
                } else {
                    boxEl.classList.add('hidden');
                }
            }
        });
    }

    /**
     * Update all box positions when viewport changes (resize/zoom)
     * V3.10: Recalculate screenRect from bbox using overlayRenderer
     */
    _updateAllBoxPositions() {
        if (this._boxes.length === 0) return;

        // Get overlay layer dimensions for debugging
        const overlayLayer = document.getElementById('overlay-layer');
        const layerDims = overlayLayer ? {
            width: overlayLayer.offsetWidth,
            height: overlayLayer.offsetHeight
        } : null;

        console.log('[QuickFillOverlay] Updating', this._boxes.length, 'box positions. Layer:', layerDims);

        this._boxes.forEach(box => {
            // Store old position for debugging
            const oldRect = { ...box.screenRect };

            // Recalculate screenRect from bbox
            const newScreenRect = overlayRenderer.bboxToScreen(box.bbox);
            box.screenRect = newScreenRect;

            console.log('[QuickFillOverlay] Box', box.id, 'bbox:', box.bbox,
                'old:', oldRect, 'new:', newScreenRect);

            // Update DOM element position
            const boxEl = document.getElementById(box.id);
            if (boxEl) {
                boxEl.style.left = `${newScreenRect.x}px`;
                boxEl.style.top = `${newScreenRect.y}px`;
                boxEl.style.width = `${newScreenRect.width}px`;
                boxEl.style.height = `${newScreenRect.height}px`;

                // For text boxes, update PreviewTextRenderer with new scale
                if (box.type === 'text') {
                    this._updateBoxTextRendering(box, boxEl);
                }
            }
        });
    }

    /**
     * Update text rendering for a box after viewport change
     * @param {Object} box - Box data
     * @param {HTMLElement} boxEl - Box DOM element
     */
    _updateBoxTextRendering(box, boxEl) {
        // V3.10: Preserve hidden input before re-rendering (renderPreviewText clears innerHTML)
        const hiddenInput = boxEl.querySelector('.quick-fill-hidden-input');

        // Get current PDF dimensions
        const pdfDims = state.get('pdfDimensions') || { width: 595, height: 842, scale: 1 };
        const pdfScale = pdfDims.scale || 1;
        const basePdfWidth = pdfDims.width / pdfScale;
        const basePdfHeight = pdfDims.height / pdfScale;

        // Calculate fieldPt from bbox
        const fieldPt = this._getFieldPtFromBbox(box.bbox, basePdfWidth, basePdfHeight);

        // Calculate new scale
        const ptToPxScale = box.screenRect.width / fieldPt.width;

        // Re-render text with new scale
        this._renderPreviewText(boxEl, box.text || '', fieldPt, ptToPxScale, box.screenRect, box);

        // V3.10: Re-add hidden input after rendering
        if (hiddenInput) {
            boxEl.appendChild(hiddenInput);
        }
    }

    /**
     * Update the status bar (box count)
     */
    _updateStatusBar() {
        if (this._actionsGroup) {
            const countEl = this._actionsGroup.querySelector('.qf-box-count');
            if (countEl) {
                countEl.textContent = `${this._boxes.length} שדות`;
            }

            const exportBtn = this._actionsGroup.querySelector('.export-pdf-btn');
            if (exportBtn) {
                const hasPdf = Boolean(pdfEngine?.getPdfData?.());
                exportBtn.disabled = !hasPdf || this._boxes.length === 0;
            }
        }
    }

    /**
     * Clear all boxes
     */
    clearAll() {
        // Remove all box elements
        this._boxes.forEach(box => {
            const boxEl = document.getElementById(box.id);
            if (boxEl) {
                boxEl.remove();
            }
        });

        // Clear array
        this._boxes = [];

        // Update status
        this._updateStatusBar();

        // Emit event
        eventBus.emit(Events.QUICK_FILL_CLEAR_ALL);

        console.log('[QuickFillOverlay] All boxes cleared');
    }

    /**
     * V3.11: Import fields from StateManager as QuickFill boxes
     * Converts mapped fields to editable QuickFill boxes
     * @param {boolean} clearExisting - Whether to clear existing boxes first (default: true)
     * @returns {number} Number of boxes imported, or -1 if PDF not loaded
     */
    importFromFields(clearExisting = true) {
        console.log('[QuickFillOverlay] importFromFields called');

        // V3.11: Check if PDF is loaded - dimensions must be available
        const pdfDims = state.get('pdfDimensions');
        if (!pdfDims || !pdfDims.width || !pdfDims.height) {
            console.warn('[QuickFillOverlay] Cannot import - PDF not loaded yet');
            return -1; // Signal that PDF is not loaded
        }

        // Debug: Check container and overlay layer dimensions
        const overlayLayer = document.getElementById('overlay-layer');
        console.log('[QuickFillOverlay] Container:', this._overlayContainer?.id,
            'visible:', !this._overlayContainer?.classList.contains('hidden'),
            'size:', this._overlayContainer?.offsetWidth, 'x', this._overlayContainer?.offsetHeight);
        console.log('[QuickFillOverlay] Overlay layer size:', overlayLayer?.offsetWidth, 'x', overlayLayer?.offsetHeight);
        console.log('[QuickFillOverlay] PDF dims:', pdfDims);

        // Get all mapped fields from state
        const fields = state.get('fields') || [];
        console.log('[QuickFillOverlay] Total fields in state:', fields.length);
        const mappedFields = fields.filter(f => f.bbox && Array.isArray(f.bbox) && f.bbox.length === 4);

        if (mappedFields.length === 0) {
            console.log('[QuickFillOverlay] No mapped fields to import');
            return 0;
        }

        // Clear existing boxes if requested
        if (clearExisting) {
            this.clearAll();
        }

        let importedCount = 0;

        const currentPage = state.get('document.currentPage') || 1;
        console.log('[QuickFillOverlay] Current page:', currentPage, 'Fields to import:', mappedFields.length);

        mappedFields.forEach(field => {
            console.log('[QuickFillOverlay] Importing field:', field.id, 'bbox:', field.bbox, 'page:', field.page);

            // Determine box type from field type
            let boxType = 'text';
            let tool = 'draw_text';

            const fieldType = (field.type || 'text').toLowerCase();
            if (fieldType === 'checkbox' || fieldType === 'check') {
                boxType = 'checkbox';
                tool = 'draw_checkbox';
            } else if (fieldType === 'radio') {
                boxType = 'radio';
                tool = 'draw_radio';
            } else if (fieldType === 'circle') {
                boxType = 'circle';
                tool = 'draw_circle';
            } else if (fieldType === 'signature') {
                // Skip signatures for now - they need special handling
                console.log('[QuickFillOverlay] Skipping signature field:', field.id);
                return;
            }

            // Convert bbox to screenRect using overlayRenderer
            const screenRect = overlayRenderer.bboxToScreen(field.bbox);
            console.log('[QuickFillOverlay] Field', field.id, 'screenRect:', screenRect);

            if (!screenRect || screenRect.width <= 0 || screenRect.height <= 0) {
                console.warn('[QuickFillOverlay] Invalid screenRect for field:', field.id, screenRect);
                return;
            }

            // Generate unique ID
            const boxId = `qf-box-${++this._boxCounter}`;

            // Create box data
            const box = {
                id: boxId,
                bbox: field.bbox,
                screenRect: screenRect,
                page: field.page || 1,
                text: field.value || '',
                tool: tool,
                type: boxType,
                checked: field.checked || false,
                label: field.label_he || field.label || field.id,
                sourceFieldId: field.id,  // Track source field
                createdAt: Date.now()
            };

            this._boxes.push(box);

            // Render based on type (pass skipFocus=true to avoid focusing each box)
            if (boxType === 'checkbox' || boxType === 'radio' || boxType === 'circle') {
                this._renderCheckboxRadio(box, true);
            } else {
                this._renderBox(box, true);
            }

            importedCount++;
        });

        // Update status
        this._updateStatusBar();

        // Update positions after all boxes are created (ensure correct layout)
        setTimeout(() => {
            this._updateAllBoxPositions();
        }, 100);

        console.log(`[QuickFillOverlay] Imported ${importedCount} boxes from ${mappedFields.length} mapped fields`);

        return importedCount;
    }

    /**
     * Get all boxes for current page
     * @returns {Array} Boxes on current page
     */
    getCurrentPageBoxes() {
        const currentPage = state.get('document.currentPage');
        return this._boxes.filter(b => b.page === currentPage);
    }

    /**
     * Get all boxes
     * @returns {Array} All boxes
     */
    getAllBoxes() {
        return [...this._boxes];
    }

    /**
     * Export boxes for LiveFill/external processing
     * @returns {Object} Export data
     */
    export() {
        return {
            $schema: 'quick-fill-v1.0',
            $generated: new Date().toISOString(),
            boxCount: this._boxes.length,
            boxes: this._boxes.map(box => ({
                id: box.id,
                bbox: box.bbox,
                page: box.page,
                text: box.text
            }))
        };
    }

    /**
     * Check if Quick Fill has any boxes
     * @returns {boolean}
     */
    hasBoxes() {
        return this._boxes.length > 0;
    }

    /**
     * Get box by ID
     * @param {string} boxId - Box ID
     * @returns {Object|null} Box data
     */
    getBox(boxId) {
        return this._boxes.find(b => b.id === boxId) || null;
    }

    /**
     * Update box text programmatically
     * @param {string} boxId - Box ID
     * @param {string} text - New text
     */
    setBoxText(boxId, text) {
        const box = this.getBox(boxId);
        if (box) {
            box.text = text;

            // Update input element
            const boxEl = document.getElementById(boxId);
            if (boxEl) {
                const input = boxEl.querySelector('.quick-fill-input');
                if (input) input.value = text;
            }

            eventBus.emit(Events.QUICK_FILL_BOX_UPDATED, {
                boxId,
                text,
                bbox: box.bbox,
                page: box.page
            });
        }
    }

    /**
     * Export filled PDF directly using LiveFill's ExportEngine
     * V3.10: Quick Fill direct export - same engine as the fill tool
     *
     * NOTE: QuickFillOverlay is a UI layer only - it does NOT own the PDF.
     * PDF bytes are fetched from the existing engine (window.pdfEngine or module pdfEngine).
     */
    async exportPDF() {
        console.log('[QuickFillOverlay] Starting PDF export with ExportEngine...');

        // Check if there are boxes to export
        if (this._boxes.length === 0) {
            alert('אין תיבות לייצוא. צייר תיבות ומלא ערכים תחילה.');
            return;
        }

        // Check if ExportEngine is loaded
        if (!window.ExportEngine) {
            alert('מנוע הייצוא לא נטען. רענן את הדף ונסה שוב.');
            console.error('[QuickFillOverlay] ExportEngine not loaded');
            return;
        }

        // Get PDF bytes from the existing engine (multiple fallback sources)
        // QuickFillOverlay does NOT own or cache the PDF - it always comes from the engine
        const originalPdfBytes =
            window.pdfEngine?.getPdfData?.() ||
            pdfEngine?.getPdfData?.() ||
            window.mapperCore?.getCurrentPdfBytes?.();

        if (!originalPdfBytes) {
            console.warn('[QuickFillOverlay] No PDF data available from engine');
            console.warn('[QuickFillOverlay] window.pdfEngine:', !!window.pdfEngine);
            console.warn('[QuickFillOverlay] window.pdfEngine.getPdfData:', typeof window.pdfEngine?.getPdfData);
            console.warn('[QuickFillOverlay] pdfEngine (module):', !!pdfEngine);
            alert('לא נטען קובץ PDF. טען קובץ ונסה שוב.');
            return;
        }

        console.log('[QuickFillOverlay] PDF bytes obtained, size:', originalPdfBytes.byteLength);

        // Create a fresh copy of the ArrayBuffer
        const pdfBytes = new Uint8Array(originalPdfBytes.slice(0));

        try {
            // Show loading state
            const exportBtn = this._actionsGroup?.querySelector('.export-pdf-btn');
            const originalText = exportBtn?.innerHTML;
            if (exportBtn) {
                exportBtn.innerHTML = '<span class="icon">⏳</span>';
                exportBtn.disabled = true;
            }

            // Build data for ExportEngine (same format as LiveFill)
            const { fieldsMapping, liveFillData } = this._buildExportData();

            console.log('[QuickFillOverlay] fieldsMapping:', fieldsMapping);
            console.log('[QuickFillOverlay] liveFillData:', liveFillData);

            // Call ExportEngine - same as LiveFill tool
            await window.ExportEngine.export({
                pdfBytesSafe: pdfBytes,
                fieldsMapping: fieldsMapping,
                liveFillData: liveFillData
            });

            // ExportEngine handles download internally
            console.log('[QuickFillOverlay] PDF export completed');

            // Restore button
            if (exportBtn) {
                exportBtn.innerHTML = originalText;
                exportBtn.disabled = false;
            }

        } catch (error) {
            console.error('[QuickFillOverlay] Export failed:', error);
            alert('שגיאה בייצוא: ' + error.message);

            // Restore button
            const btn = this._actionsGroup?.querySelector('.export-pdf-btn');
            if (btn) {
                btn.innerHTML = '<span class="icon">📥</span>';
                btn.disabled = false;
            }
        }
    }

    /**
     * Build export data for ExportEngine (same format as LiveFill)
     *
     * ExportEngine has two coordinate systems:
     * - V1: bbox/anchor (normalized 0-1, needs coord._normalizeBbox)
     * - V2: pdfX/pdfY/pdfWidth/pdfHeight (absolute PDF points, preferred)
     *
     * We provide BOTH formats:
     * - bbox/anchor for validation
     * - V2 coordinates for export (avoids coord dependency)
     *
     * @returns {Object} { fieldsMapping, liveFillData }
     */
    _buildExportData() {
        const fields = [];
        const liveFillData = {};

        // Get PDF page dimensions for V2 coordinate calculation
        const pdfDims = pdfEngine.getPdfPageDimensions();
        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfDims ? pdfDims.width / dpiScale : 595;  // Default A4
        const pdfH = pdfDims ? pdfDims.height / dpiScale : 842;

        console.log('[QuickFillOverlay] Building export data from', this._boxes.length, 'boxes');
        console.log('[QuickFillOverlay] PDF dimensions (points):', { pdfW, pdfH });

        this._boxes.forEach(box => {
            // bbox from screenToBbox is [xPct, yPct, wPct, hPct]
            // where yPct is from BOTTOM (PDF coordinate system)
            // These are already normalized 0-1 percentages
            const [xPct, yPct, wPct, hPct] = box.bbox;

            // Convert to V2 PDF coordinates (absolute points)
            const pdfX = xPct * pdfW;
            const pdfY = yPct * pdfH;
            const pdfWidth = wPct * pdfW;
            const pdfHeight = hPct * pdfH;

            console.log('[QuickFillOverlay] Processing box:', {
                id: box.id,
                type: box.type,
                text: box.text,
                checked: box.checked,
                bbox: box.bbox,
                v2Coords: { pdfX, pdfY, pdfWidth, pdfHeight }
            });

            if (box.type === 'text') {
                // Text field - provide BOTH V1 (bbox) for validation and V2 for export
                const fieldData = {
                    id: box.id,
                    type: 'text',
                    page: box.page,
                    // V1: for validation
                    bbox: [xPct, yPct, wPct, hPct],
                    // V2: for export (preferred by export-engine)
                    pdfX: pdfX,
                    pdfY: pdfY,
                    pdfWidth: pdfWidth,
                    pdfHeight: pdfHeight,
                    // V3.11: QuickFill marker for scaffold avoidance
                    isQuickFill: true,
                    screenRect: box.screenRect  // For pixel-based scaffold detection
                };

                // V3.11: Include cached structured segments if available (from preview detection)
                if (box.structuredSegments) {
                    fieldData.structuredSegments = box.structuredSegments;
                    console.log('[QuickFillOverlay] Including cached structuredSegments for export');
                }

                fields.push(fieldData);

                // LiveFill format: { value: "...", checked: false }
                liveFillData[box.id] = {
                    value: box.text || '',
                    checked: false
                };
                console.log('[QuickFillOverlay] Added text field:', box.id,
                    'V2:', { pdfX: pdfX.toFixed(1), pdfY: pdfY.toFixed(1), w: pdfWidth.toFixed(1), h: pdfHeight.toFixed(1) },
                    'value:', box.text || '(empty)');

            } else if (box.type === 'checkbox' || box.type === 'radio' || box.type === 'circle') {
                // Checkbox/Radio/Circle - provide BOTH anchor for validation and V2 for export
                // Calculate center point from bbox (for anchor)
                const centerXPct = xPct + (wPct / 2);
                const centerYPct = yPct + (hPct / 2);

                fields.push({
                    id: box.id,
                    type: box.type,  // Keep original type: checkbox, radio, or circle
                    page: box.page,
                    // V1: anchor for validation
                    anchor: [centerXPct, centerYPct],
                    // V2: for export (preferred by export-engine)
                    pdfX: pdfX,
                    pdfY: pdfY,
                    pdfWidth: pdfWidth,
                    pdfHeight: pdfHeight
                });

                // LiveFill format: { checked: true/false }
                liveFillData[box.id] = {
                    checked: box.checked || false
                };
                console.log('[QuickFillOverlay] Added', box.type, ':', box.id,
                    'anchor:', [centerXPct.toFixed(3), centerYPct.toFixed(3)],
                    'V2:', { pdfX: pdfX.toFixed(1), pdfY: pdfY.toFixed(1) },
                    'checked:', box.checked);

            } else if (box.type === 'signature') {
                // Signature field
                fields.push({
                    id: box.id,
                    type: 'signature',
                    page: box.page,
                    // V1: bbox for validation
                    bbox: [xPct, yPct, wPct, hPct],
                    // V2: for export
                    pdfX: pdfX,
                    pdfY: pdfY,
                    pdfWidth: pdfWidth,
                    pdfHeight: pdfHeight,
                    // Signature specific
                    signatureMode: box.signatureMode,
                    signatureFont: box.signatureFont
                });

                // LiveFill format: { value: imageData or text }
                liveFillData[box.id] = {
                    value: box.signatureData,
                    mode: box.signatureMode,
                    font: box.signatureFont
                };
                console.log('[QuickFillOverlay] Added signature:', box.id,
                    'mode:', box.signatureMode,
                    'V2:', { pdfX: pdfX.toFixed(1), pdfY: pdfY.toFixed(1), w: pdfWidth.toFixed(1), h: pdfHeight.toFixed(1) });
            }
        });

        console.log('[QuickFillOverlay] Export summary:', {
            totalBoxes: this._boxes.length,
            fieldsToExport: fields.length,
            liveFillDataKeys: Object.keys(liveFillData)
        });

        return {
            fieldsMapping: { fields: fields },
            liveFillData: liveFillData
        };
    }

    /**
     * Download PDF file
     * @param {Uint8Array} pdfBytes - PDF bytes
     * @param {string} fileName - Download file name
     */
    _downloadPDF(pdfBytes, fileName) {
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ==========================================
    // V3.10: Undo/Redo System for Quick Fill
    // ==========================================

    /**
     * Push an action to the undo stack
     * @param {string} type - Action type: 'create', 'delete', 'edit'
     * @param {Object} data - Action data for reverting
     */
    _pushUndo(type, data) {
        this._undoStack.push({ type, data, timestamp: Date.now() });

        // Limit stack size
        if (this._undoStack.length > this._maxUndoSteps) {
            this._undoStack.shift();
        }

        // Clear redo stack on new action
        this._redoStack = [];

        // Update button states
        this._updateUndoRedoButtons();

        console.log('[QuickFillOverlay] Undo pushed:', type, 'Stack size:', this._undoStack.length);
    }

    /**
     * Undo last action
     */
    undo() {
        if (this._undoStack.length === 0) {
            console.log('[QuickFillOverlay] Nothing to undo');
            return false;
        }

        const action = this._undoStack.pop();
        console.log('[QuickFillOverlay] Undo:', action.type);

        switch (action.type) {
            case 'create':
                // Undo create = delete the box (without pushing to undo)
                this._deleteBoxSilent(action.data.boxId);
                // Push to redo - redo will restore the box (re-create)
                this._redoStack.push({ type: 'create', data: action.data });
                break;

            case 'delete':
                // Undo delete = restore the box
                this._restoreBox(action.data.box);
                // Push to redo - redo will delete again
                this._redoStack.push({ type: 'delete', data: { boxId: action.data.box.id, box: { ...action.data.box } } });
                break;

            case 'edit':
                // Undo edit = restore previous value
                const box = this._boxes.find(b => b.id === action.data.boxId);
                if (box) {
                    const currentValue = box.type === 'text' ? box.text : box.checked;
                    if (action.data.field === 'text') {
                        box.text = action.data.oldValue;
                        this._updateBoxDisplay(box);
                    } else if (action.data.field === 'checked') {
                        box.checked = action.data.oldValue;
                        this._updateBoxDisplay(box);
                    }
                    // Push to redo with current value
                    this._redoStack.push({
                        type: 'edit',
                        data: { ...action.data, oldValue: currentValue }
                    });
                }
                break;

            case 'move':
                // Undo move = restore previous position
                const moveBox = this._boxes.find(b => b.id === action.data.boxId);
                if (moveBox) {
                    // Save current position for redo
                    const currentScreenRect = { ...moveBox.screenRect };
                    const currentBbox = [...moveBox.bbox];

                    // Restore old position
                    moveBox.screenRect = { ...action.data.oldScreenRect };
                    moveBox.bbox = [...action.data.oldBbox];

                    // Update DOM
                    const boxEl = document.getElementById(moveBox.id);
                    if (boxEl) {
                        boxEl.style.left = `${moveBox.screenRect.x}px`;
                        boxEl.style.top = `${moveBox.screenRect.y}px`;
                    }

                    // Push to redo
                    this._redoStack.push({
                        type: 'move',
                        data: {
                            boxId: moveBox.id,
                            oldScreenRect: currentScreenRect,
                            oldBbox: currentBbox
                        }
                    });
                }
                break;
        }

        this._updateUndoRedoButtons();
        return true;
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this._redoStack.length === 0) {
            console.log('[QuickFillOverlay] Nothing to redo');
            return false;
        }

        const action = this._redoStack.pop();
        console.log('[QuickFillOverlay] Redo:', action.type);

        switch (action.type) {
            case 'create':
                // Redo create = restore the box (after undo-create deleted it)
                this._restoreBox(action.data.box);
                // Push to undo so user can undo this redo
                this._undoStack.push({ type: 'create', data: { boxId: action.data.box.id, box: { ...action.data.box } } });
                break;

            case 'delete':
                // Redo delete = delete again (after undo-delete restored it)
                // The box should exist in _boxes now (from the undo-delete restore)
                this._deleteBoxSilent(action.data.boxId);
                // Push to undo so user can undo this redo (restore again)
                this._undoStack.push({ type: 'delete', data: { box: { ...action.data.box } } });
                break;

            case 'edit':
                // Redo edit = apply the change again
                const editBox = this._boxes.find(b => b.id === action.data.boxId);
                if (editBox) {
                    const currentValue = action.data.field === 'text' ? editBox.text : editBox.checked;
                    if (action.data.field === 'text') {
                        editBox.text = action.data.oldValue;
                        this._updateBoxDisplay(editBox);
                    } else if (action.data.field === 'checked') {
                        editBox.checked = action.data.oldValue;
                        this._updateBoxDisplay(editBox);
                    }
                    this._undoStack.push({
                        type: 'edit',
                        data: { ...action.data, oldValue: currentValue }
                    });
                }
                break;

            case 'move':
                // Redo move = apply the move again
                const redoMoveBox = this._boxes.find(b => b.id === action.data.boxId);
                if (redoMoveBox) {
                    // Save current position for undo
                    const currentScreenRect = { ...redoMoveBox.screenRect };
                    const currentBbox = [...redoMoveBox.bbox];

                    // Apply new position (which is in oldScreenRect/oldBbox from redo perspective)
                    redoMoveBox.screenRect = { ...action.data.oldScreenRect };
                    redoMoveBox.bbox = [...action.data.oldBbox];

                    // Update DOM
                    const boxEl = document.getElementById(redoMoveBox.id);
                    if (boxEl) {
                        boxEl.style.left = `${redoMoveBox.screenRect.x}px`;
                        boxEl.style.top = `${redoMoveBox.screenRect.y}px`;
                    }

                    // Push to undo
                    this._undoStack.push({
                        type: 'move',
                        data: {
                            boxId: redoMoveBox.id,
                            oldScreenRect: currentScreenRect,
                            oldBbox: currentBbox
                        }
                    });
                }
                break;
        }

        this._updateUndoRedoButtons();
        return true;
    }

    /**
     * Delete box without pushing to undo stack (used by undo itself)
     */
    _deleteBoxSilent(boxId) {
        const boxEl = document.getElementById(boxId);
        if (boxEl) boxEl.remove();
        this._boxes = this._boxes.filter(b => b.id !== boxId);
        this._updateStatusBar();
    }

    /**
     * Restore a deleted box
     */
    _restoreBox(boxData) {
        // Re-add to boxes array
        this._boxes.push(boxData);

        // Re-render based on type
        if (boxData.type === 'checkbox' || boxData.type === 'radio' || boxData.type === 'circle') {
            this._renderCheckboxRadio(boxData);
        } else if (boxData.type === 'signature') {
            this._renderSignature(boxData);
        } else {
            this._renderBox(boxData);
            // Restore text if any
            if (boxData.text) {
                const boxEl = document.getElementById(boxData.id);
                if (boxEl) {
                    const input = boxEl.querySelector('.quick-fill-hidden-input');
                    if (input) input.value = boxData.text;
                    // Re-render preview
                    const pdfDims = state.get('pdfDimensions') || { width: 595, height: 842, scale: 1 };
                    const pdfScale = pdfDims.scale || 1;
                    const basePdfWidth = pdfDims.width / pdfScale;
                    const basePdfHeight = pdfDims.height / pdfScale;
                    const fieldPt = this._getFieldPtFromBbox(boxData.bbox, basePdfWidth, basePdfHeight);
                    const ptToPxScale = boxData.screenRect.width / fieldPt.width;
                    this._renderPreviewText(boxEl, boxData.text, fieldPt, ptToPxScale, boxData.screenRect, boxData);
                    // Re-add input
                    boxEl.appendChild(input);
                }
            }
        }

        this._updateStatusBar();
        console.log('[QuickFillOverlay] Box restored:', boxData.id);
    }

    /**
     * Update box display after edit undo/redo
     */
    _updateBoxDisplay(box) {
        const boxEl = document.getElementById(box.id);
        if (!boxEl) return;

        if (box.type === 'checkbox' || box.type === 'radio' || box.type === 'circle') {
            boxEl.dataset.checked = box.checked ? 'true' : 'false';
            const symbol = boxEl.querySelector('.quick-fill-symbol');
            if (symbol) this._updateCheckboxSymbol(symbol, box.type, box.checked);
        } else {
            const input = boxEl.querySelector('.quick-fill-hidden-input');
            if (input) input.value = box.text || '';
            // Re-render preview text
            const pdfDims = state.get('pdfDimensions') || { width: 595, height: 842, scale: 1 };
            const pdfScale = pdfDims.scale || 1;
            const basePdfWidth = pdfDims.width / pdfScale;
            const basePdfHeight = pdfDims.height / pdfScale;
            const fieldPt = this._getFieldPtFromBbox(box.bbox, basePdfWidth, basePdfHeight);
            const ptToPxScale = box.screenRect.width / fieldPt.width;
            this._renderPreviewText(boxEl, box.text || '', fieldPt, ptToPxScale, box.screenRect, box);
            if (input) boxEl.appendChild(input);
            const deleteBtn = boxEl.querySelector('.quick-fill-delete');
            if (deleteBtn) boxEl.appendChild(deleteBtn);
        }
    }

    /**
     * Clear undo/redo stacks
     */
    clearUndoHistory() {
        this._undoStack = [];
        this._redoStack = [];
        console.log('[QuickFillOverlay] Undo history cleared');
    }

    /**
     * Check if can undo
     */
    canUndo() {
        return this._undoStack.length > 0;
    }

    /**
     * Check if can redo
     */
    canRedo() {
        return this._redoStack.length > 0;
    }
}

// Singleton export
export const quickFillOverlay = new QuickFillOverlay();

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => quickFillOverlay.init());
    } else {
        // DOM already ready
        setTimeout(() => quickFillOverlay.init(), 0);
    }
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
    window.quickFillOverlay = quickFillOverlay;
}
