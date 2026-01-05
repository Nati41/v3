/**
 * DragController - Field dragging and resizing for Mapper V3
 * STRICT PORT from V2 drag-engine.js with EXACT formulas
 *
 * MIGRATED FORMULAS:
 * - updateDragImmediate anchor (V2 lines 699-728)
 * - updateDragImmediate bbox (V2 lines 735-766)
 * - updateResizeImmediate 1:1 ratio (V2 lines 876-894)
 * - updateResizeImmediate bbox (V2 lines 920-943)
 */
import { state, Modes } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { overlayRenderer } from './OverlayRenderer.js';
import { pdfEngine, CHECKBOX_SIZE, RADIO_SIZE } from './PDFEngine.js';

export class DragController {
    constructor() {
        this.isDragging = false;
        this.isResizing = false;
        this.activeField = null;
        this.activeElement = null;
        this.resizeHandle = null;

        // Drag state - EXACT from V2
        this.startX = 0;
        this.startY = 0;
        this.dragStart = null;  // V2 format: { x, y, left, top, width, height }
        this.startBbox = null;
        this.startAnchor = null;
    }

    /**
     * Initialize the controller
     * @param {Object} options - Configuration
     */
    init(options = {}) {
        this.options = {
            overlayLayerId: 'overlay-layer',
            ...options
        };

        this.overlayLayer = document.getElementById(this.options.overlayLayerId);

        if (!this.overlayLayer) {
            console.warn('[DragController] Overlay layer not found');
            return;
        }

        this._setupListeners();
        console.log('[DragController] Initialized');
    }

    /**
     * Setup event listeners
     */
    _setupListeners() {
        // Mouse events on overlay layer
        this.overlayLayer.addEventListener('mousedown', (e) => this._onMouseDown(e));
        document.addEventListener('mousemove', (e) => this._onMouseMove(e));
        document.addEventListener('mouseup', (e) => this._onMouseUp(e));

        // Touch support
        this.overlayLayer.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
        document.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this._onTouchEnd(e));
    }

    /**
     * Get coordinates relative to overlay layer, accounting for zoom
     * EXACT from V2 events.js coordinate calculation
     */
    _getLayerCoordinates(clientX, clientY) {
        const layerRect = this.overlayLayer.getBoundingClientRect();
        const zoom = state.get('view.zoom') || 1.0;

        const x = (clientX - layerRect.left) / zoom;
        const y = (clientY - layerRect.top) / zoom;

        return { x, y };
    }

    /**
     * Handle mouse down
     * @param {MouseEvent} e
     */
    _onMouseDown(e) {
        const target = e.target;

        // Check if clicking on resize handle
        if (target.classList.contains('resize-handle')) {
            this._startResize(e, target);
            return;
        }

        // Check if clicking on field overlay
        if (target.classList.contains('field-overlay')) {
            this._startDrag(e, target);
            return;
        }
    }

    /**
     * Handle mouse move
     * @param {MouseEvent} e
     */
    _onMouseMove(e) {
        if (this.isDragging) {
            this._updateDrag(e.clientX, e.clientY);
        } else if (this.isResizing) {
            this._updateResize(e.clientX, e.clientY);
        }
    }

    /**
     * Handle mouse up
     * @param {MouseEvent} e
     */
    _onMouseUp(e) {
        if (this.isDragging) {
            this._finishDrag();
        } else if (this.isResizing) {
            this._finishResize();
        }
    }

    /**
     * Handle touch start
     * @param {TouchEvent} e
     */
    _onTouchStart(e) {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        if (target && target.classList.contains('resize-handle')) {
            e.preventDefault();
            this._startResize({ clientX: touch.clientX, clientY: touch.clientY }, target);
        } else if (target && target.classList.contains('field-overlay')) {
            e.preventDefault();
            this._startDrag({ clientX: touch.clientX, clientY: touch.clientY }, target);
        }
    }

    /**
     * Handle touch move
     * @param {TouchEvent} e
     */
    _onTouchMove(e) {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];

        if (this.isDragging || this.isResizing) {
            e.preventDefault();
        }

        if (this.isDragging) {
            this._updateDrag(touch.clientX, touch.clientY);
        } else if (this.isResizing) {
            this._updateResize(touch.clientX, touch.clientY);
        }
    }

    /**
     * Handle touch end
     * @param {TouchEvent} e
     */
    _onTouchEnd(e) {
        if (this.isDragging) {
            this._finishDrag();
        } else if (this.isResizing) {
            this._finishResize();
        }
    }

    // ============ DRAGGING ============
    // EXACT PORT from V2 drag-engine.js startDrag (lines 643-663)

    /**
     * Start dragging a field
     * EXACT from V2 startDrag()
     * @param {Object} e - Mouse/touch event
     * @param {HTMLElement} element - Field overlay element
     */
    _startDrag(e, element) {
        const fieldId = element.dataset.fieldId;
        this.activeField = state.getField(fieldId);

        if (!this.activeField) return;

        // Select the field - EXACT from V2
        state.selectField(fieldId);

        // Save start position - EXACT from V2 dragStart format
        const coords = this._getLayerCoordinates(e.clientX, e.clientY);
        this.dragStart = {
            x: coords.x - element.offsetLeft,
            y: coords.y - element.offsetTop
        };
        this.startBbox = this.activeField.bbox ? [...this.activeField.bbox] : null;
        this.startAnchor = this.activeField.anchor ? [...this.activeField.anchor] : null;
        this.activeElement = element;

        // Mark as dragging
        this.isDragging = true;
        state.setMode(Modes.DRAGGING);
        element.classList.add('dragging');

        console.log('[DragController] Started dragging:', fieldId);
    }

    /**
     * Update drag position
     * EXACT PORT from V2 updateDragImmediate (lines 671-789)
     * @param {number} clientX - Current mouse X
     * @param {number} clientY - Current mouse Y
     */
    _updateDrag(clientX, clientY) {
        if (!this.activeField || !this.dragStart || !this.activeElement) return;

        const container = this.overlayLayer;
        if (!container) return;

        // ============ EXACT from V2 line 677-678 ============
        const isCheckboxOrRadio = this.activeField.type === 'checkbox' || this.activeField.type === 'radio';

        const coords = this._getLayerCoordinates(clientX, clientY);
        let newX = coords.x - this.dragStart.x;
        let newY = coords.y - this.dragStart.y;

        // ============ EXACT from V2 lines 683-689: Apply snap to grid ============
        if (isCheckboxOrRadio) {
            newX = Math.round(newX / 5) * 5;
            newY = Math.round(newY / 5) * 5;
        } else {
            // snapToGrid from settings
            const snapToGrid = state.get('settings.snapToGrid');
            const gridSize = state.get('settings.gridSize') || 20;
            if (snapToGrid) {
                newX = Math.round(newX / gridSize) * gridSize;
                newY = Math.round(newY / gridSize) * gridSize;
            }
        }

        // ============ EXACT from V2 lines 691-693: Constrain to container ============
        newX = Math.max(0, Math.min(container.offsetWidth - this.activeElement.offsetWidth, newX));
        newY = Math.max(0, Math.min(container.offsetHeight - this.activeElement.offsetHeight, newY));

        // ============ EXACT from V2 lines 695-696: Update visual position ============
        this.activeElement.style.left = newX + 'px';
        this.activeElement.style.top = newY + 'px';

        // Store current position for finishDrag
        this._currentDragX = newX;
        this._currentDragY = newY;
    }

    /**
     * Finish dragging - save coordinates with Y-axis flip
     * EXACT PORT from V2 updateDragImmediate coordinate calculations
     */
    _finishDrag() {
        if (!this.activeField || !this.activeElement) {
            this.isDragging = false;
            return;
        }

        const fieldId = this.activeField.id;
        const element = this.activeElement;
        const container = this.overlayLayer;

        // Get current visual position
        const newX = parseFloat(element.style.left);
        const newY = parseFloat(element.style.top);

        // ============ EXACT from V2 line 677 ============
        const isCheckboxOrRadio = this.activeField.type === 'checkbox' || this.activeField.type === 'radio';

        if (isCheckboxOrRadio) {
            // ============ EXACT from V2 lines 699-728: Checkbox/Radio anchor calculation ============
            const layerWidth = Math.max(container.offsetWidth, 1);
            const layerHeight = Math.max(container.offsetHeight, 1);

            // Use PDF points (scale 1.0) to match finishDrawing coordinate system
            const dpiScale = pdfEngine.getDpiScale();
            const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
            const pageWidth = (pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
            const pageHeight = (pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;
            const widthScale = pageWidth / layerWidth;
            const heightScale = pageHeight / layerHeight;

            // Calculate center of overlay
            const centerX = newX + (element.offsetWidth / 2);
            const centerY = newY + (element.offsetHeight / 2);

            const xPdf = centerX * widthScale;
            const yPdfTop = centerY * heightScale;
            const yPdfBottom = pageHeight - yPdfTop;

            const xPercent = xPdf / pageWidth;
            const yPercent = yPdfBottom / pageHeight;

            const anchor = [xPercent, yPercent];

            state.updateField(fieldId, { anchor });

            console.log("Field moved:", {
                id: this.activeField.id,
                type: this.activeField.type,
                anchor: anchor
            });
        } else {
            // ============ EXACT from V2 lines 735-766: Regular field bbox update ============
            if (this.activeField.bbox) {
                const layerWidth = Math.max(container.offsetWidth, 1);
                const layerHeight = Math.max(container.offsetHeight, 1);

                // Use PDF points (scale 1.0) to match finishDrawing coordinate system
                const dpiScale = pdfEngine.getDpiScale();
                const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
                const pageWidth = (pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
                const pageHeight = (pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;
                const widthScale = pageWidth / layerWidth;
                const heightScale = pageHeight / layerHeight;

                const elementWidth = element.offsetWidth;
                const elementHeight = element.offsetHeight;
                const xPdf = newX * widthScale;
                const widthPdf = elementWidth * widthScale;
                const yPdfTop = newY * heightScale;
                const heightPdf = elementHeight * heightScale;
                const yPdfBottom = pageHeight - (yPdfTop + heightPdf);

                const xPercent = xPdf / pageWidth;
                const yPercent = yPdfBottom / pageHeight;
                const wPercent = widthPdf / pageWidth;
                const hPercent = heightPdf / pageHeight;
                const bbox = [xPercent, yPercent, wPercent, hPercent];

                state.updateField(fieldId, { bbox });

                // Debug log for field move/drag
                console.log("Field updated (moved):", {
                    id: this.activeField.id,
                    bbox: bbox
                });
            }
        }

        // Cleanup
        element.classList.remove('dragging');
        this.isDragging = false;
        this.activeField = null;
        this.activeElement = null;
        this.startBbox = null;
        this.startAnchor = null;
        this.dragStart = null;
        state.setMode(Modes.IDLE);

        eventBus.emit(Events.FIELD_MOVED, { fieldId });
    }

    // ============ RESIZING ============
    // EXACT PORT from V2 drag-engine.js startResize (lines 800-827)

    /**
     * Start resizing a field
     * EXACT from V2 startResize()
     * @param {Object} e - Mouse/touch event
     * @param {HTMLElement} handle - Resize handle element
     */
    _startResize(e, handle) {
        const overlay = handle.closest('.field-overlay');
        if (!overlay) return;

        const fieldId = overlay.dataset.fieldId;
        this.activeField = state.getField(fieldId);

        if (!this.activeField) return;

        // ============ EXACT from V2 lines 806-816 ============
        // SINGLE ACTIVE OVERLAY: Only allow resize if this overlay is already selected
        // or select it first (which will deactivate all others)
        const selectedField = state.getSelectedField();
        if (selectedField && selectedField.id !== fieldId) {
            state.selectField(fieldId);
        } else if (!selectedField) {
            state.selectField(fieldId);
        }

        // ============ EXACT from V2 lines 818-826 ============
        this.isResizing = true;
        this.resizeHandle = handle.className.split(' ').find(c => c !== 'resize-handle');

        const coords = this._getLayerCoordinates(e.clientX, e.clientY);
        this.dragStart = {
            x: coords.x,
            y: coords.y,
            left: overlay.offsetLeft,
            top: overlay.offsetTop,
            width: overlay.offsetWidth,
            height: overlay.offsetHeight
        };
        this.activeElement = overlay;

        state.setMode(Modes.RESIZING);
        overlay.classList.add('resizing');

        console.log('[DragController] Started resizing:', fieldId, this.resizeHandle);
    }

    /**
     * Update resize dimensions
     * EXACT PORT from V2 updateResizeImmediate (lines 835-977)
     * @param {number} clientX - Current mouse X
     * @param {number} clientY - Current mouse Y
     */
    _updateResize(clientX, clientY) {
        if (!this.activeField || !this.activeElement || !this.dragStart) return;

        const container = this.overlayLayer;
        if (!container) return;

        // ============ EXACT from V2 line 841 ============
        const isCheckboxOrRadio = this.activeField.type === 'checkbox' || this.activeField.type === 'radio';

        const coords = this._getLayerCoordinates(clientX, clientY);
        let x = coords.x;
        let y = coords.y;

        // ============ EXACT from V2 lines 843-850: Apply snap to grid ============
        if (isCheckboxOrRadio) {
            x = Math.round(x / 5) * 5;
            y = Math.round(y / 5) * 5;
        } else {
            const snapToGrid = state.get('settings.snapToGrid');
            const gridSize = state.get('settings.gridSize') || 20;
            if (snapToGrid) {
                x = Math.round(x / gridSize) * gridSize;
                y = Math.round(y / gridSize) * gridSize;
            }
        }

        // ============ EXACT from V2 lines 852-858 ============
        const dx = x - this.dragStart.x;
        const dy = y - this.dragStart.y;

        let newLeft = this.dragStart.left;
        let newTop = this.dragStart.top;
        let newWidth = this.dragStart.width;
        let newHeight = this.dragStart.height;

        // ============ EXACT from V2 lines 860-873: Handle direction ============
        if (this.resizeHandle.includes('w')) {
            newLeft = this.dragStart.left + dx;
            newWidth = this.dragStart.width - dx;
        }
        if (this.resizeHandle.includes('e')) {
            newWidth = this.dragStart.width + dx;
        }
        if (this.resizeHandle.includes('n')) {
            newTop = this.dragStart.top + dy;
            newHeight = this.dragStart.height - dy;
        }
        if (this.resizeHandle.includes('s')) {
            newHeight = this.dragStart.height + dy;
        }

        // ============ EXACT from V2 lines 876-889: CRITICAL 1:1 aspect ratio for checkbox/radio ============
        if (isCheckboxOrRadio) {
            // Use the larger dimension to maintain visual feedback
            const size = Math.max(Math.abs(newWidth), Math.abs(newHeight));
            newWidth = size;
            newHeight = size;

            // Adjust position to keep overlay centered during resize
            if (this.resizeHandle.includes('w')) {
                newLeft = this.dragStart.left + this.dragStart.width - size;
            }
            if (this.resizeHandle.includes('n')) {
                newTop = this.dragStart.top + this.dragStart.height - size;
            }
        }

        // ============ EXACT from V2 lines 891-894: Min sizes and constraints ============
        newWidth = Math.max(isCheckboxOrRadio ? 10 : 30, newWidth);
        newHeight = Math.max(isCheckboxOrRadio ? 10 : 20, newHeight);
        newLeft = Math.max(0, Math.min(container.offsetWidth - newWidth, newLeft));
        newTop = Math.max(0, Math.min(container.offsetHeight - newHeight, newTop));

        // ============ EXACT from V2 lines 896-900: Update visual ============
        const element = this.activeElement;
        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
        element.style.width = newWidth + 'px';
        element.style.height = newHeight + 'px';

        // Store for finishResize
        this._resizeState = {
            newLeft,
            newTop,
            newWidth,
            newHeight,
            isCheckboxOrRadio
        };
    }

    /**
     * Finish resizing - save with Y-axis flip
     * EXACT PORT from V2 updateResizeImmediate coordinate save (lines 902-977)
     */
    _finishResize() {
        if (!this.activeField || !this.activeElement || !this._resizeState) {
            this.isResizing = false;
            return;
        }

        const fieldId = this.activeField.id;
        const element = this.activeElement;
        const container = this.overlayLayer;

        const { newLeft, newTop, newWidth, newHeight, isCheckboxOrRadio } = this._resizeState;

        // ============ EXACT from V2 lines 902-911: Checkbox/Radio overlaySize update ============
        if (isCheckboxOrRadio) {
            state.updateField(fieldId, {
                overlayWidth: newWidth,
                overlayHeight: newHeight
            });

            console.log("Checkbox/Radio resized:", {
                id: this.activeField.id,
                type: this.activeField.type,
                overlaySize: `${newWidth}x${newHeight}`
            });
        } else {
            // ============ EXACT from V2 lines 920-943: Regular field bbox update ============
            if (this.activeField.bbox) {
                const layerWidth = Math.max(container.offsetWidth, 1);
                const layerHeight = Math.max(container.offsetHeight, 1);

                // Use PDF points (scale 1.0) to match finishDrawing coordinate system
                const dpiScale = pdfEngine.getDpiScale();
                const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
                const pageWidth = (pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
                const pageHeight = (pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;
                const widthScale = pageWidth / layerWidth;
                const heightScale = pageHeight / layerHeight;

                const xPdf = newLeft * widthScale;
                const widthPdf = newWidth * widthScale;
                const yPdfTop = newTop * heightScale;
                const heightPdf = newHeight * heightScale;
                const yPdfBottom = pageHeight - (yPdfTop + heightPdf);

                const xPercent = xPdf / pageWidth;
                const yPercent = yPdfBottom / pageHeight;
                const wPercent = widthPdf / pageWidth;
                const hPercent = heightPdf / pageHeight;
                const bbox = [xPercent, yPercent, wPercent, hPercent];

                state.updateField(fieldId, { bbox });

                // Debug log for field resize
                console.log("Field updated (resized):", {
                    id: this.activeField.id,
                    bbox: bbox
                });
            }
        }

        // Cleanup
        element.classList.remove('resizing');
        this.isResizing = false;
        this.activeField = null;
        this.activeElement = null;
        this.dragStart = null;
        this.resizeHandle = null;
        this._resizeState = null;
        state.setMode(Modes.IDLE);

        eventBus.emit(Events.FIELD_RESIZED, { fieldId });
        console.log('[DragController] Finished resizing');
    }
}

// Singleton instance
export const dragController = new DragController();
