/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - ViewportController
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   שליטה בזום (הגדלה/הקטנה) ופאן (גלילה/הזזה) של תצוגת ה-PDF.
 *
 * איך זה עובד:
 *   - גלגלת עכבר → זום (MIN=0.1, MAX=5.0, צעד=20%)
 *   - גרירה עם לחצן אמצעי/שמאלי → פאן
 *   - טרנספורמציה CSS על container ה-PDF
 *
 * מי משתמש בקובץ:
 *   - MapperCore.js - אתחול
 *   - OverlayRenderer.js - סנכרון שכבת אוברליי עם הזום
 *
 * באיזה מצבים:
 *   כל המצבים - תמיד זמין
 *
 * למה הוא קיים:
 *   כדי שהמשתמש יוכל להתמקד באזור ספציפי בטופס.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * ViewportController - Zoom and Pan for Mapper V3
 * Ported from old mapper viewport-engine.js
 */
import { state, Modes } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { overlayRenderer } from './OverlayRenderer.js';

// Zoom constants
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 1.2; // 20% step

export class ViewportController {
    constructor() {
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.currentPanX = 0;
        this.currentPanY = 0;
        this.transformContainer = null;
        this.canvasViewport = null;
    }

    /**
     * Initialize the controller
     * @param {Object} options - Configuration
     */
    init(options = {}) {
        this.options = {
            transformContainerId: 'transform-container',
            canvasViewportId: 'canvas-viewport',
            ...options
        };

        this.transformContainer = document.getElementById(this.options.transformContainerId);
        this.canvasViewport = document.getElementById(this.options.canvasViewportId);

        if (!this.transformContainer || !this.canvasViewport) {
            console.warn('[ViewportController] Required elements not found');
            return;
        }

        this._setupListeners();
        console.log('[ViewportController] Initialized');
    }

    /**
     * Setup event listeners
     */
    _setupListeners() {
        // Wheel event for zoom
        this.canvasViewport.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

        // Mouse events for panning
        this.canvasViewport.addEventListener('mousedown', (e) => this._onMouseDown(e));
        document.addEventListener('mousemove', (e) => this._onMouseMove(e));
        document.addEventListener('mouseup', (e) => this._onMouseUp(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this._onKeyDown(e));
        document.addEventListener('keyup', (e) => this._onKeyUp(e));

        // Listen for state changes
        eventBus.on(Events.STATE_CHANGED, ({ path, value }) => {
            if (path === 'view.zoom' || path === 'view.panX' || path === 'view.panY') {
                this._updateViewTransform();
            }
        });
    }

    // ============ ZOOM FUNCTIONS ============

    /**
     * Set zoom level with clamping
     * @param {number} level - New zoom level
     */
    setZoom(level) {
        const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));

        if (clampedZoom !== state.get('view.zoom')) {
            state.set('view.zoom', clampedZoom);
            this._updateViewTransform();
            this._updateZoomDisplay();

            eventBus.emit(Events.ZOOM_CHANGED, { zoom: clampedZoom });
            console.log('[ViewportController] Zoom set to:', Math.round(clampedZoom * 100) + '%');
        }
    }

    /**
     * Zoom in by step
     */
    zoomIn() {
        const current = state.get('view.zoom');
        this.setZoom(current * ZOOM_STEP);
    }

    /**
     * Zoom out by step
     */
    zoomOut() {
        const current = state.get('view.zoom');
        this.setZoom(current / ZOOM_STEP);
    }

    /**
     * Reset zoom to 100%
     */
    resetZoom() {
        this.setZoom(1.0);
        this.resetPan();
    }

    /**
     * Zoom to fit the PDF in viewport
     */
    fitToViewport() {
        const pdfDims = state.get('pdfDimensions');
        if (!pdfDims) return;

        const viewportWidth = this.canvasViewport.clientWidth;
        const viewportHeight = this.canvasViewport.clientHeight;

        const scaleX = (viewportWidth - 80) / pdfDims.width;
        const scaleY = (viewportHeight - 80) / pdfDims.height;

        this.setZoom(Math.min(scaleX, scaleY));
        this.resetPan();
    }

    // ============ PAN FUNCTIONS ============

    /**
     * Set pan position
     * @param {number} x - Pan X
     * @param {number} y - Pan Y
     */
    setPan(x, y) {
        state.batch({
            'view.panX': x,
            'view.panY': y
        });
        this._updateViewTransform();
    }

    /**
     * Reset pan to center
     */
    resetPan() {
        this.setPan(0, 0);
        this.currentPanX = 0;
        this.currentPanY = 0;
    }

    // ============ EVENT HANDLERS ============

    /**
     * Handle wheel event for zoom
     * @param {WheelEvent} e
     */
    _onWheel(e) {
        // Ctrl+Wheel = Zoom
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();

            const delta = e.deltaY > 0 ? -1 : 1;
            const zoom = state.get('view.zoom');
            const factor = delta > 0 ? ZOOM_STEP : (1 / ZOOM_STEP);

            // Zoom towards mouse position
            const rect = this.transformContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Calculate new zoom
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));

            if (newZoom !== zoom) {
                // Adjust pan to keep mouse position stable
                const panX = state.get('view.panX');
                const panY = state.get('view.panY');

                const scale = newZoom / zoom;
                const newPanX = mouseX - (mouseX - panX) * scale;
                const newPanY = mouseY - (mouseY - panY) * scale;

                state.batch({
                    'view.zoom': newZoom,
                    'view.panX': newPanX,
                    'view.panY': newPanY
                });

                this._updateViewTransform();
                this._updateZoomDisplay();

                eventBus.emit(Events.ZOOM_CHANGED, { zoom: newZoom });
            }
        }
        // Regular scroll - let it scroll naturally (don't prevent default)
    }

    /**
     * Handle mouse down for pan start
     * @param {MouseEvent} e
     */
    _onMouseDown(e) {
        // Middle mouse button or Space+Click for panning
        if (e.button === 1 || (e.button === 0 && this._spacePressed)) {
            e.preventDefault();

            this.isPanning = true;
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
            this.currentPanX = state.get('view.panX');
            this.currentPanY = state.get('view.panY');

            this.canvasViewport.classList.add('panning');
            state.setMode(Modes.PANNING);
        }
    }

    /**
     * Handle mouse move for panning
     * @param {MouseEvent} e
     */
    _onMouseMove(e) {
        if (!this.isPanning) return;

        const deltaX = e.clientX - this.panStartX;
        const deltaY = e.clientY - this.panStartY;

        state.batch({
            'view.panX': this.currentPanX + deltaX,
            'view.panY': this.currentPanY + deltaY
        });

        this._updateViewTransform();
    }

    /**
     * Handle mouse up to end panning
     * @param {MouseEvent} e
     */
    _onMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvasViewport.classList.remove('panning');

            if (state.get('mode') === Modes.PANNING) {
                state.setMode(Modes.IDLE);
            }
        }
    }

    /**
     * Handle keydown
     * @param {KeyboardEvent} e
     */
    _onKeyDown(e) {
        // Space key for pan mode
        if (e.code === 'Space' && !this._spacePressed) {
            this._spacePressed = true;
            this.canvasViewport.style.cursor = 'grab';
        }

        // Zoom shortcuts
        if (e.ctrlKey || e.metaKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                this.zoomIn();
            } else if (e.key === '-') {
                e.preventDefault();
                this.zoomOut();
            } else if (e.key === '0') {
                e.preventDefault();
                this.resetZoom();
            }
        }
    }

    /**
     * Handle keyup
     * @param {KeyboardEvent} e
     */
    _onKeyUp(e) {
        if (e.code === 'Space') {
            this._spacePressed = false;
            this.canvasViewport.style.cursor = '';
        }
    }

    // ============ VIEW TRANSFORM ============

    /**
     * Update the CSS transform on the container
     */
    _updateViewTransform() {
        if (!this.transformContainer) return;

        const zoom = state.get('view.zoom');
        const panX = state.get('view.panX');
        const panY = state.get('view.panY');

        this.transformContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        this.transformContainer.style.transformOrigin = 'center center';
    }

    /**
     * Update zoom display in UI
     */
    _updateZoomDisplay() {
        const zoom = state.get('view.zoom');
        const zoomInfo = document.getElementById('zoom-info');
        if (zoomInfo) {
            zoomInfo.textContent = Math.round(zoom * 100) + '%';
        }
    }

    /**
     * Get current zoom level
     * @returns {number}
     */
    getZoom() {
        return state.get('view.zoom');
    }
}

// Singleton instance
export const viewportController = new ViewportController();
