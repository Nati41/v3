/**
 * OverlayRenderer - Field overlay rendering for Mapper V3
 * Ported from old mapper with correct coordinate conversion
 * V3.3: Extended with ghost overlays for template mapping
 */
import { state, RadioGroupSteps } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { pdfEngine, PDF_DPI, CHECKBOX_SIZE, RADIO_SIZE } from './PDFEngine.js';
import { labelOverlay } from '../overlay/LabelOverlay.js';
import { TableEvents } from '../tables/TableFlowController.js';
import { templateStore, TemplateFieldStatus } from '../core/TemplateStore.js';

export class OverlayRenderer {
    constructor() {
        this.overlayLayer = null;
        this.drawingLayer = null;
        this.fieldElements = new Map(); // fieldId -> DOM element
        this.tableElements = new Map(); // tableId -> DOM element
        this.tempColumnElements = new Map(); // columnId/index -> DOM element (during table flow)
        this._pendingRenderFields = [];  // Queue for fields waiting for dimensions

        // V3.3: Ghost overlays for template mapping
        this.ghostElements = new Map(); // templateFieldId -> DOM element
        this._batchPreviewElements = []; // Elements showing batch mapping preview

        // V3.9: Table flow lock - prevents resize during column drawing
        this._tableStructureLocked = false;

        // V3.9: Store screen pixel coords directly to avoid normalization drift
        this._tableBBoxScreenPixels = null;
        this._sampleRowScreenPixels = null;
    }

    /**
     * Initialize the renderer
     * @param {Object} options - Configuration
     */
    init(options = {}) {
        this.options = {
            layerId: 'overlay-layer',
            drawingLayerId: 'drawing-layer',
            ...options
        };

        this.overlayLayer = document.getElementById(this.options.layerId);
        this.drawingLayer = document.getElementById(this.options.drawingLayerId);

        if (!this.overlayLayer) {
            console.warn('[OverlayRenderer] Overlay layer not found:', this.options.layerId);
        }

        // Listen for state changes
        this._setupListeners();

        console.log('[OverlayRenderer] Initialized');
    }

    /**
     * Setup event listeners
     */
    _setupListeners() {
        // Re-render on page change and update layer size
        eventBus.on(Events.PDF_PAGE_CHANGED, () => {
            this._updateLayerSize();
            this.renderAll();
        });

        // Also update on PDF load
        eventBus.on(Events.PDF_LOADED, () => {
            this._updateLayerSize();
            // Process any pending fields
            this._processPendingFields();
            // V3.10: Also re-render all fields to fix positioning after PDF load
            this.renderAll();
        });

        // CRITICAL: Re-render tables on window resize (debounced)
        let resizeTimeout = null;
        window.addEventListener('resize', () => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this._updateLayerSize();
                this.renderAll();
            }, 200);
        });

        // Re-render when fields change
        eventBus.on(Events.FIELD_CREATED, (field) => {
            if (field.isMapped) {
                this.renderField(field);
                // Also render label overlay if field has labelSelection
                if (field.labelSelection) {
                    labelOverlay.renderLabelForField(field);
                }
            }
        });

        eventBus.on(Events.FIELD_UPDATED, (field) => {
            if (field.isMapped) {
                this.renderField(field);
                // Also render label overlay if field has labelSelection
                if (field.labelSelection) {
                    labelOverlay.renderLabelForField(field);
                }
            }
        });

        eventBus.on(Events.FIELD_DELETED, (field) => {
            this.removeField(field.id);
        });

        // Update selection styling
        eventBus.on(Events.FIELD_SELECTED, ({ fieldId }) => {
            this._updateSelection(fieldId);
        });

        eventBus.on(Events.FIELD_DESELECTED, ({ fieldId }) => {
            this._updateSelection(null);
        });

        // ============ UNDO/REDO SUPPORT ============
        // Re-render all fields when history changes (undo/redo)
        eventBus.on(Events.HISTORY_UNDO, () => {
            this.renderAll();
        });

        eventBus.on(Events.HISTORY_REDO, () => {
            this.renderAll();
        });

        // ============ RESET SUPPORT ============
        // Clear all overlays when state is reset
        eventBus.on(Events.STATE_CHANGED, ({ action }) => {
            if (action === 'reset') {
                this.clear();
            }
        });

        // ============ TABLE EVENTS ============
        eventBus.on(Events.TABLE_CREATED, (table) => {
            this.renderTable(table);
        });

        eventBus.on(Events.TABLE_UPDATED, (table) => {
            this.renderTable(table);
        });

        eventBus.on(Events.TABLE_DELETED, (table) => {
            this.removeTable(table.tableId);
        });

        // V3.10: Table Region events (new system)
        eventBus.on(Events.TABLE_REGION_CREATED, () => {
            this.renderTableRegions();
        });

        eventBus.on(Events.TABLE_REGION_UPDATED, () => {
            this.renderTableRegions();
        });

        eventBus.on(Events.TABLE_REGION_DELETED, () => {
            this.renderTableRegions();
        });

        // Re-render tables on zoom change
        eventBus.on(Events.ZOOM_CHANGED, () => {
            this._updateLayerSize();
            this.renderAll();
        });

        // V3.10: Update layer size when UI profile changes (sidebar visibility)
        eventBus.on('UI_PROFILE_CHANGED', ({ mode }) => {
            console.log('[OverlayRenderer] UI profile changed to:', mode);
            // Delay to allow layout to settle after sidebar visibility change
            setTimeout(() => {
                this._updateLayerSize();
                this.renderAll();
            }, 200);
        });

        // ============ TABLE FLOW COLUMN EVENTS ============
        // Show column overlay during table flow (visual feedback for confirmed columns)
        eventBus.on(TableEvents.TABLE_OVERLAY_SHOW_COLUMN, (data) => {
            this.renderTempColumn(data);
        });

        // Clear temporary column overlays
        eventBus.on(TableEvents.TABLE_OVERLAY_CLEAR_COLUMNS, () => {
            this.clearTempColumns();
        });

        // Clear all temporary overlays (including columns)
        eventBus.on(TableEvents.TABLE_OVERLAY_CLEAR_ALL, () => {
            this.clearTempColumns();
            this.clearTableBBoxOverlay();
            this.clearSampleRowOverlay();
        });

        // V3.5: Clear temporary overlays (but keep bbox and sample row visible)
        eventBus.on(TableEvents.TABLE_OVERLAY_CLEAR_TEMP, () => {
            // Clear only temporary drawing elements, not the structural overlays
            // This is called when switching steps
            console.log('[OverlayRenderer] Clearing temp overlays');
        });

        // ============ V3.5: TABLE BBOX AND SAMPLE ROW OVERLAYS ============
        // Show table bbox overlay during table flow
        eventBus.on(TableEvents.TABLE_OVERLAY_SHOW_TABLE_BBOX, ({ bbox }) => {
            this.renderTableBBoxOverlay(bbox);
        });

        // Show sample row overlay during table flow
        eventBus.on(TableEvents.TABLE_OVERLAY_SHOW_SAMPLE_ROW, ({ bbox }) => {
            this.renderSampleRowOverlay(bbox);
        });

        // V3.9: Lock/unlock table structure during column drawing
        eventBus.on(TableEvents.TABLE_OVERLAY_LOCK_STRUCTURE, () => {
            this.lockTableStructure();
        });
        eventBus.on(TableEvents.TABLE_OVERLAY_UNLOCK_STRUCTURE, () => {
            this.unlockTableStructure();
        });

        // ============ SIDEBAR/PDF COLUMN SYNC ============
        // Highlight PDF column when hovering sidebar item
        eventBus.on('table:sidebar:columnHover', ({ columnId, index, hover }) => {
            this.highlightTempColumn(columnId, hover);
        });

        // ============ V3.3: TEMPLATE GHOST OVERLAY EVENTS ============
        eventBus.on(Events.TEMPLATE_LOADED, () => {
            // Clear any existing ghost overlays
            this.clearGhostOverlays();
        });

        eventBus.on(Events.TEMPLATE_CLEARED, () => {
            this.clearGhostOverlays();
            this.clearBatchPreview();
        });

        eventBus.on(Events.NEXT_UNMAPPED_ACTIVATED, ({ fieldId, templateFieldId }) => {
            // Highlight the active target field in sidebar (handled by SidebarController)
            // Here we could show a ghost hint if the template has position hints
        });

        eventBus.on(Events.BATCH_MAPPING_OFFERED, ({ sourceFieldId, duplicates, pattern }) => {
            // Show preview of where batch-mapped fields will go
            const sourceField = state.getField(sourceFieldId);
            if (sourceField && sourceField.bbox) {
                this.showBatchPreview(sourceField.bbox, duplicates.length);
            }
        });

        eventBus.on(Events.BATCH_MAPPING_APPLIED, () => {
            this.clearBatchPreview();
        });

        eventBus.on(Events.BATCH_MAPPING_CANCELLED, () => {
            this.clearBatchPreview();
        });
    }

    /**
     * Process any pending fields that were queued before dimensions were available
     */
    _processPendingFields() {
        if (this._pendingRenderFields.length === 0) return;

        const fields = [...this._pendingRenderFields];
        this._pendingRenderFields = [];

        fields.forEach(field => {
            this.renderField(field);
        });
    }

    /**
     * Render all fields for current page
     */
    renderAll() {
        if (!this.overlayLayer) return;

        // Clear existing overlays
        this.clear();

        // Check if PDF dimensions are available
        const pdfDims = pdfEngine.getPdfPageDimensions();
        if (!pdfDims) {
            console.warn('[OverlayRenderer] No PDF dimensions available, deferring render');
            return;
        }

        // Get fields for current page
        const currentPage = state.get('document.currentPage');
        const fields = state.get('fields').filter(f =>
            f.isMapped &&
            f.page === currentPage &&
            (f.bbox || f.anchor)
        );

        fields.forEach(field => {
            this.renderField(field);
        });

        // Also render tables for current page
        this.renderAllTables();

        // V3.10: Render table regions (new system)
        this.renderTableRegions();

        // Also render radio builder circles if active
        this.renderRadioBuilderCircles();

        // Render label overlays for fields with labelSelection
        this._renderLabelOverlays();
    }

    /**
     * Render label overlays for fields with labelSelection
     * Delegates to LabelOverlay module for display-only rendering
     */
    _renderLabelOverlays() {
        // Use labelOverlay.renderAll() which handles page filtering internally
        labelOverlay.renderAll();
    }

    /**
     * Render all tables for current page
     */
    renderAllTables() {
        const currentPage = state.get('document.currentPage');
        const tables = state.get('tables').filter(t => t.page === currentPage);

        tables.forEach(table => {
            this.renderTable(table);
        });
    }

    /**
     * V3.10: Render table regions (new simple table system)
     */
    renderTableRegions() {
        if (!window.tableRegionManager) return;

        const currentPage = state.get('document.currentPage');
        const allRegions = window.tableRegionManager.getAllRegions();
        // Filter regions by current page
        const regions = allRegions.filter(r => r.page === currentPage);
        if (regions.length === 0) return;

        const layerWidth = this.overlayLayer.offsetWidth;
        const layerHeight = this.overlayLayer.offsetHeight;

        regions.forEach(region => {
            // Remove existing element if any
            const existingEl = this.overlayLayer.querySelector(`[data-region-id="${region.id}"]`);
            if (existingEl) existingEl.remove();

            const [rx, ry, rw, rh] = region.bbox;

            // Create region overlay
            const regionEl = document.createElement('div');
            regionEl.className = `table-region-overlay ${region.isStructureLocked ? 'locked' : 'pending'}`;
            regionEl.dataset.regionId = region.id;

            // Convert normalized coords to pixels
            // bbox uses PDF coords (Y=0 at bottom), screen uses Y=0 at top
            // Apply Y-flip: screenY = (1 - pdfY - height) * layerHeight
            regionEl.style.cssText = `
                position: absolute;
                left: ${rx * layerWidth}px;
                top: ${(1 - ry - rh) * layerHeight}px;
                width: ${rw * layerWidth}px;
                height: ${rh * layerHeight}px;
                border: 2px dashed ${region.isStructureLocked ? '#16a34a' : '#ca8a04'};
                background: ${region.isStructureLocked ? 'rgba(22, 163, 74, 0.05)' : 'rgba(202, 138, 4, 0.05)'};
                pointer-events: none;
                z-index: 5;
            `;

            // Add label
            const label = document.createElement('div');
            label.className = 'table-region-label';
            label.style.cssText = `
                position: absolute;
                top: -20px;
                right: 0;
                font-size: 11px;
                background: ${region.isStructureLocked ? '#16a34a' : '#ca8a04'};
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                direction: rtl;
            `;
            label.textContent = region.isStructureLocked
                ? `טבלה: ${region.rowCount} שורות`
                : 'טבלה (ממתין למיפוי)';

            regionEl.appendChild(label);
            this.overlayLayer.appendChild(regionEl);
        });
    }

    /**
     * Render a single table overlay
     * Draws: table border, header line, column lines, row lines
     * @param {Object} table - Table object from state
     */
    renderTable(table) {
        if (!this.overlayLayer) return;

        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) {
            console.warn('[OverlayRenderer] Cannot render table - no PDF dimensions');
            return;
        }

        // Remove existing element if any
        this.removeTable(table.tableId);

        // Skip incomplete tables
        // CRITICAL: Only sampleRowBBox is REQUIRED (source of truth for geometry)
        // headerRowBBox/headerBBox is OPTIONAL (only affects table bbox top)
        if (!table.bbox || !table.sampleRowBBox) {
            console.log('[OverlayRenderer] Skipping incomplete table (missing bbox or sampleRowBBox):', table.tableId);
            return;
        }

        // Get headerRowBBox with backwards compatibility
        const headerRowBBox = table.headerRowBBox || table.headerBBox;

        // Create table container element
        const tableEl = document.createElement('div');
        tableEl.className = 'table-overlay';
        tableEl.dataset.tableId = table.tableId;

        // Get scale factors
        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfPageDimensions.width / dpiScale;
        const pdfH = pdfPageDimensions.height / dpiScale;
        const layerWidth = Math.max(this.overlayLayer.offsetWidth, 1);
        const layerHeight = Math.max(this.overlayLayer.offsetHeight, 1);
        const scaleX = layerWidth / pdfW;
        const scaleY = layerHeight / pdfH;

        // Convert table bbox to screen coordinates
        const tableScreen = this._tableCoordToScreen(table.bbox, pdfW, pdfH, scaleX, scaleY);

        // Position table container
        tableEl.style.cssText = `
            position: absolute;
            left: ${tableScreen.x}px;
            top: ${tableScreen.y}px;
            width: ${tableScreen.width}px;
            height: ${tableScreen.height}px;
            pointer-events: none;
            z-index: 5;
        `;

        // ============ DRAW TABLE BORDER ============
        const border = document.createElement('div');
        border.className = 'table-border';
        border.style.cssText = `
            position: absolute;
            inset: 0;
            border: 2px solid #10b981;
            background: rgba(16, 185, 129, 0.05);
            pointer-events: none;
        `;
        tableEl.appendChild(border);

        // ============ DRAW HEADER LINE (OPTIONAL) ============
        // Only draw if headerRowBBox is defined (it's optional now)
        if (headerRowBBox) {
            const headerScreen = this._tableCoordToScreen(headerRowBBox, pdfW, pdfH, scaleX, scaleY);

            // Header line is at the bottom of header bbox
            const headerLineY = (headerScreen.y + headerScreen.height) - tableScreen.y;

            // Header fill - subtle green tint
            const headerFill = document.createElement('div');
            headerFill.className = 'table-header-fill';
            headerFill.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                height: ${headerLineY}px;
                background: rgba(16, 185, 129, 0.15);
                pointer-events: none;
                z-index: 1;
            `;
            tableEl.appendChild(headerFill);

            // Header line - green separator
            const headerLine = document.createElement('div');
            headerLine.className = 'table-header-line';
            headerLine.style.cssText = `
                position: absolute;
                left: 0;
                top: ${headerLineY}px;
                width: 100%;
                height: 2px;
                background: #10b981;
                pointer-events: none;
                z-index: 2;
            `;
            tableEl.appendChild(headerLine);
        }

        // ============ DRAW COLUMN LINES ============
        if (table.columns && table.columns.length > 0) {
            table.columns.forEach((col, index) => {
                if (!col.bbox) return;

                const colScreen = this._tableCoordToScreen(col.bbox, pdfW, pdfH, scaleX, scaleY);
                const colLineX = colScreen.x - tableScreen.x;

                // Left border of column
                const colLine = document.createElement('div');
                colLine.className = 'table-column-line';
                colLine.style.cssText = `
                    position: absolute;
                    left: ${colLineX}px;
                    top: 0;
                    width: 1px;
                    height: 100%;
                    background: rgba(16, 185, 129, 0.5);
                    pointer-events: none;
                `;
                tableEl.appendChild(colLine);

                // Right border of last column
                if (index === table.columns.length - 1) {
                    const rightLineX = colLineX + colScreen.width;
                    const rightLine = document.createElement('div');
                    rightLine.className = 'table-column-line';
                    rightLine.style.cssText = `
                        position: absolute;
                        left: ${rightLineX}px;
                        top: 0;
                        width: 1px;
                        height: 100%;
                        background: rgba(16, 185, 129, 0.5);
                        pointer-events: none;
                    `;
                    tableEl.appendChild(rightLine);
                }
            });
        }

        // ============ DRAW ROW LINES ============
        // FIX: Use percentage-based positioning relative to table container
        // This prevents cumulative drift from floating-point multiplication
        if (table.rowCount > 0 && table.sampleRowBBox) {
            const sampleRowScreen = this._tableCoordToScreen(table.sampleRowBBox, pdfW, pdfH, scaleX, scaleY);

            // Calculate the data area within the table container
            // sampleRowScreen.y is the absolute Y of sample row on the overlay
            // We need to convert to relative position within the table container
            const dataAreaTop = sampleRowScreen.y - tableScreen.y;  // Relative to table container
            const totalDataHeight = tableScreen.height - dataAreaTop;  // From sample row to table bottom

            // Draw row lines using percentage positioning to avoid drift
            // Use DocumentFragment for batched DOM operations (PERFORMANCE FIX)
            const rowLinesFragment = document.createDocumentFragment();
            for (let i = 1; i < table.rowCount; i++) {
                const relativeY = dataAreaTop + (totalDataHeight * i / table.rowCount);

                const rowLine = document.createElement('div');
                rowLine.className = 'table-row-line';
                rowLine.style.cssText = `
                    position: absolute;
                    left: 0;
                    top: ${relativeY}px;
                    width: 100%;
                    height: 1px;
                    background: rgba(16, 185, 129, 0.4);
                    pointer-events: none;
                `;
                rowLinesFragment.appendChild(rowLine);
            }
            // Append all row lines at once (single reflow)
            tableEl.appendChild(rowLinesFragment);
        }

        // ============ DRAW SLOT VISUALIZATION FOR CELLS (Phase 3) ============
        // For columns with layout.mode === 'slots', draw slot dividers in each cell
        const LH = window.LayoutHelper;
        if (LH && table.columns && table.rowCount > 0 && table.sampleRowBBox) {
            const sampleRowScreen = this._tableCoordToScreen(table.sampleRowBBox, pdfW, pdfH, scaleX, scaleY);
            const dataAreaTop = sampleRowScreen.y - tableScreen.y;
            const totalDataHeight = tableScreen.height - dataAreaTop;

            const cellsFragment = document.createDocumentFragment();

            table.columns.forEach((col, colIndex) => {
                // Check if this column has slots layout
                if (!col.layout || col.layout.mode !== LH.MODES.SLOTS) return;
                if (!col.bbox) return;

                const colScreen = this._tableCoordToScreen(col.bbox, pdfW, pdfH, scaleX, scaleY);
                const colLeft = colScreen.x - tableScreen.x;
                const colWidth = colScreen.width;
                const slotCount = col.layout.slotCount || 9;

                // Draw slot overlay for each row
                for (let rowIndex = 0; rowIndex < table.rowCount; rowIndex++) {
                    const rowY = dataAreaTop + (totalDataHeight * rowIndex / table.rowCount);
                    const rowHeight = totalDataHeight / table.rowCount;

                    const cellSlots = document.createElement('div');
                    cellSlots.className = 'table-cell-slots';
                    cellSlots.style.cssText = `
                        position: absolute;
                        left: ${colLeft}px;
                        top: ${rowY}px;
                        width: ${colWidth}px;
                        height: ${rowHeight}px;
                        --slot-count: ${slotCount};
                        background-image: repeating-linear-gradient(
                            to left,
                            transparent 0,
                            transparent calc(100% / var(--slot-count) - 1px),
                            rgba(0, 100, 255, 0.4) calc(100% / var(--slot-count) - 1px),
                            rgba(0, 100, 255, 0.4) calc(100% / var(--slot-count))
                        );
                        pointer-events: none;
                        z-index: 3;
                    `;
                    cellsFragment.appendChild(cellSlots);
                }
            });

            tableEl.appendChild(cellsFragment);
        }

        // ============ ADD TABLE LABEL ============
        const label = document.createElement('div');
        label.className = 'table-label';
        label.textContent = `טבלה (${table.columns?.length || 0} עמודות × ${table.rowCount} שורות)`;
        label.style.cssText = `
            position: absolute;
            top: -24px;
            left: 0;
            background: #10b981;
            color: white;
            padding: 2px 8px;
            font-size: 12px;
            border-radius: 4px 4px 0 0;
            white-space: nowrap;
            pointer-events: none;
        `;
        tableEl.appendChild(label);

        // Add to layer
        this.overlayLayer.appendChild(tableEl);
        this.tableElements.set(table.tableId, tableEl);
        // Performance: removed console.log from hot path
    }

    /**
     * Convert table coordinates to screen pixels
     * FIXED: Properly handles normalized (0-1) coordinates
     * @param {Object} bbox - { x, y, width, height } in normalized 0-1 values
     * @param {number} pdfW - PDF width in points (unused, kept for compatibility)
     * @param {number} pdfH - PDF height in points (unused, kept for compatibility)
     * @param {number} scaleX - X scale factor (unused, kept for compatibility)
     * @param {number} scaleY - Y scale factor (unused, kept for compatibility)
     * @returns {Object} { x, y, width, height } in screen pixels
     */
    _tableCoordToScreen(bbox, pdfW, pdfH, scaleX, scaleY) {
        if (!bbox) return { x: 0, y: 0, width: 0, height: 0 };

        let { x, y, width, height } = bbox;

        // Get current overlay layer dimensions
        const layerWidth = this.overlayLayer?.offsetWidth || 1;
        const layerHeight = this.overlayLayer?.offsetHeight || 1;

        // Check if coordinates are normalized (0-1) or already screen pixels
        // Normalized coords have all values <= 1
        const isNormalized = x <= 1 && y <= 1 && width <= 1 && height <= 1;

        if (isNormalized) {
            // Convert normalized (0-1) to current screen pixels
            // This automatically handles window resize
            return {
                x: Math.round(x * layerWidth),
                y: Math.round(y * layerHeight),
                width: Math.round(width * layerWidth),
                height: Math.round(height * layerHeight)
            };
        } else {
            // Legacy: Already in screen pixels - use directly
            // NOTE: This may cause issues on resize for old tables
            console.warn('[OverlayRenderer] Table has screen pixel coords (legacy), may not resize correctly');
            return { x, y, width, height };
        }
    }

    /**
     * Remove a table overlay
     * @param {string} tableId - Table ID
     */
    removeTable(tableId) {
        const element = this.tableElements.get(tableId);
        if (element) {
            element.remove();
            this.tableElements.delete(tableId);
        }
    }

    // ============ TEMPORARY COLUMN OVERLAYS (Table Flow) ============

    /**
     * Render a temporary column overlay during table flow
     * Provides visual feedback for confirmed columns on the PDF
     * @param {Object} data - { index, bbox, name, columnId, layout }
     */
    renderTempColumn(data) {
        if (!this.overlayLayer) return;

        const { index, bbox, name, columnId, layout } = data;
        const key = columnId || `col-${index}`;

        // Remove existing if present
        this.removeTempColumn(key);

        // Get overlay layer dimensions
        const layerWidth = this.overlayLayer.offsetWidth;
        const layerHeight = this.overlayLayer.offsetHeight;

        // Convert normalized bbox to screen pixels
        let screenBbox;
        if (bbox.x <= 1 && bbox.y <= 1 && bbox.width <= 1 && bbox.height <= 1) {
            // Normalized coordinates
            screenBbox = {
                x: Math.round(bbox.x * layerWidth),
                y: Math.round(bbox.y * layerHeight),
                width: Math.round(bbox.width * layerWidth),
                height: Math.round(bbox.height * layerHeight)
            };
        } else {
            // Already screen pixels
            screenBbox = bbox;
        }

        // Create column overlay element
        const colEl = document.createElement('div');
        colEl.className = 'temp-column-overlay';
        colEl.dataset.columnId = key;
        colEl.dataset.columnIndex = index;

        colEl.style.cssText = `
            position: absolute;
            left: ${screenBbox.x}px;
            top: ${screenBbox.y}px;
            width: ${screenBbox.width}px;
            height: ${screenBbox.height}px;
            border: 2px solid #10b981;
            background: rgba(16, 185, 129, 0.15);
            pointer-events: auto;
            z-index: 50;
            box-sizing: border-box;
            cursor: pointer;
            transition: background 0.2s;
        `;

        // Add column number badge
        const badge = document.createElement('div');
        badge.className = 'column-number-badge';
        badge.textContent = (index + 1).toString();
        badge.style.cssText = `
            position: absolute;
            top: -12px;
            right: -12px;
            width: 24px;
            height: 24px;
            background: #10b981;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            pointer-events: none;
        `;
        colEl.appendChild(badge);

        // Add column name tooltip at bottom
        if (name) {
            const tooltip = document.createElement('div');
            tooltip.className = 'column-name-tooltip';
            tooltip.textContent = name;
            tooltip.style.cssText = `
                position: absolute;
                bottom: -20px;
                left: 50%;
                transform: translateX(-50%);
                background: #10b981;
                color: white;
                padding: 2px 6px;
                font-size: 10px;
                border-radius: 3px;
                white-space: nowrap;
                max-width: 100px;
                overflow: hidden;
                text-overflow: ellipsis;
                pointer-events: none;
            `;
            colEl.appendChild(tooltip);
        }

        // ============ SLOT VISUALIZATION (Phase 3) ============
        const LH = window.LayoutHelper;
        if (LH && layout && layout.mode === LH.MODES.SLOTS) {
            const slotCount = layout.slotCount || 9;
            const slotsOverlay = document.createElement('div');
            slotsOverlay.className = 'temp-column-slots';
            slotsOverlay.style.cssText = `
                position: absolute;
                inset: 2px;
                --slot-count: ${slotCount};
                background-image: repeating-linear-gradient(
                    to left,
                    transparent 0,
                    transparent calc(100% / var(--slot-count) - 1px),
                    rgba(0, 100, 255, 0.4) calc(100% / var(--slot-count) - 1px),
                    rgba(0, 100, 255, 0.4) calc(100% / var(--slot-count))
                );
                pointer-events: none;
                z-index: 1;
            `;
            colEl.appendChild(slotsOverlay);
        }

        // V3.5: Add resize handles to column overlays
        this._addResizeHandlesToTempOverlay(colEl, 'column', bbox);

        // Hover effect
        colEl.addEventListener('mouseenter', () => {
            colEl.style.background = 'rgba(16, 185, 129, 0.3)';
            // Emit event for sidebar sync
            eventBus.emit('table:column:hover', { columnId: key, index, hover: true });
        });

        colEl.addEventListener('mouseleave', () => {
            colEl.style.background = 'rgba(16, 185, 129, 0.15)';
            eventBus.emit('table:column:hover', { columnId: key, index, hover: false });
        });

        // Add to layer
        this.overlayLayer.appendChild(colEl);
        this.tempColumnElements.set(key, colEl);
        // Performance: removed console.log from hot path
    }

    /**
     * Remove a single temporary column overlay
     * @param {string} key - Column ID or key
     */
    removeTempColumn(key) {
        const element = this.tempColumnElements.get(key);
        if (element) {
            element.remove();
            this.tempColumnElements.delete(key);
        }
    }

    /**
     * Clear all temporary column overlays
     */
    clearTempColumns() {
        console.log(`[OverlayRenderer] Clearing ${this.tempColumnElements.size} temp columns`);
        this.tempColumnElements.forEach((element) => {
            element.remove();
        });
        this.tempColumnElements.clear();
    }

    /**
     * Highlight a specific column (called from sidebar hover)
     * @param {string} columnId - Column ID to highlight
     * @param {boolean} highlight - Whether to highlight or un-highlight
     */
    highlightTempColumn(columnId, highlight) {
        const element = this.tempColumnElements.get(columnId);
        if (element) {
            if (highlight) {
                element.style.background = 'rgba(16, 185, 129, 0.4)';
                element.style.border = '3px solid #059669';
            } else {
                element.style.background = 'rgba(16, 185, 129, 0.15)';
                element.style.border = '2px solid #10b981';
            }
        }
    }

    // ============ V3.5: TABLE BBOX AND SAMPLE ROW OVERLAYS ============

    /**
     * V3.9: Lock table structure - prevents resizing bbox/sample row during column drawing
     */
    lockTableStructure() {
        this._tableStructureLocked = true;
        // Hide resize handles on existing overlays
        if (this._tableBBoxOverlay) {
            this._tableBBoxOverlay.querySelectorAll('.temp-resize-handle').forEach(h => {
                h.style.display = 'none';
            });
        }
        if (this._sampleRowOverlay) {
            this._sampleRowOverlay.querySelectorAll('.temp-resize-handle').forEach(h => {
                h.style.display = 'none';
            });
        }
        console.log('[OverlayRenderer] Table structure LOCKED');
    }

    /**
     * V3.9: Unlock table structure - allows resizing again
     */
    unlockTableStructure() {
        this._tableStructureLocked = false;
        // Show resize handles on existing overlays
        if (this._tableBBoxOverlay) {
            this._tableBBoxOverlay.querySelectorAll('.temp-resize-handle').forEach(h => {
                h.style.display = '';
            });
        }
        if (this._sampleRowOverlay) {
            this._sampleRowOverlay.querySelectorAll('.temp-resize-handle').forEach(h => {
                h.style.display = '';
            });
        }
        console.log('[OverlayRenderer] Table structure UNLOCKED');
    }

    /**
     * Render the table bounding box overlay during table flow
     * V3.5: Added for visual feedback with resize capability
     * V3.9: Now stores screen pixels directly to avoid normalization drift
     * @param {Object} bbox - { x, y, width, height } in normalized 0-1 values OR screen pixels
     * @param {boolean} isScreenPixels - If true, bbox is already in screen pixels
     */
    renderTableBBoxOverlay(bbox, isScreenPixels = false) {
        if (!this.overlayLayer) return;

        // Clear existing
        this.clearTableBBoxOverlay();

        const layerWidth = this.overlayLayer.offsetWidth;
        const layerHeight = this.overlayLayer.offsetHeight;

        // V3.9: Handle both normalized and screen pixel input
        let screenBbox;
        if (isScreenPixels) {
            screenBbox = { ...bbox };
        } else {
            // Convert normalized bbox to screen pixels
            screenBbox = {
                x: Math.round(bbox.x * layerWidth),
                y: Math.round(bbox.y * layerHeight),
                width: Math.round(bbox.width * layerWidth),
                height: Math.round(bbox.height * layerHeight)
            };
        }

        // V3.9: Store screen pixels for stable re-rendering
        this._tableBBoxScreenPixels = { ...screenBbox };

        // Create overlay element
        // V3.5: pointer-events: none to allow drawing through it
        // Resize handles have their own pointer-events: auto
        const overlay = document.createElement('div');
        overlay.className = 'table-flow-bbox-overlay';
        overlay.id = 'table-flow-bbox';
        overlay.style.cssText = `
            position: absolute;
            left: ${screenBbox.x}px;
            top: ${screenBbox.y}px;
            width: ${screenBbox.width}px;
            height: ${screenBbox.height}px;
            border: 3px solid #10b981;
            background: rgba(16, 185, 129, 0.08);
            pointer-events: none;
            z-index: 40;
            box-sizing: border-box;
        `;

        // Add resize handles (they have pointer-events: auto) - unless locked
        if (!this._tableStructureLocked) {
            this._addResizeHandlesToTempOverlay(overlay, 'table-bbox', bbox);
        }

        // Add label
        const label = document.createElement('div');
        label.className = 'table-bbox-label';
        label.textContent = 'גבולות הטבלה';
        label.style.cssText = `
            position: absolute;
            top: -24px;
            left: 0;
            background: #10b981;
            color: white;
            padding: 2px 8px;
            font-size: 11px;
            border-radius: 4px 4px 0 0;
            white-space: nowrap;
            pointer-events: none;
        `;
        overlay.appendChild(label);

        this.overlayLayer.appendChild(overlay);
        this._tableBBoxOverlay = overlay;
        this._tableBBoxNormalized = bbox;
    }

    /**
     * Clear the table bbox overlay
     */
    clearTableBBoxOverlay() {
        if (this._tableBBoxOverlay) {
            this._tableBBoxOverlay.remove();
            this._tableBBoxOverlay = null;
            this._tableBBoxNormalized = null;
        }
    }

    /**
     * Render the sample row overlay during table flow
     * V3.5: Added for visual feedback with resize capability
     * V3.9: Now stores screen pixels directly to avoid normalization drift
     * @param {Object} bbox - { x, y, width, height } in normalized 0-1 values OR screen pixels
     * @param {boolean} isScreenPixels - If true, bbox is already in screen pixels
     */
    renderSampleRowOverlay(bbox, isScreenPixels = false) {
        if (!this.overlayLayer) return;

        // Clear existing
        this.clearSampleRowOverlay();

        const layerWidth = this.overlayLayer.offsetWidth;
        const layerHeight = this.overlayLayer.offsetHeight;

        // V3.9: Handle both normalized and screen pixel input
        let screenBbox;
        if (isScreenPixels) {
            screenBbox = { ...bbox };
        } else {
            // Convert normalized bbox to screen pixels
            screenBbox = {
                x: Math.round(bbox.x * layerWidth),
                y: Math.round(bbox.y * layerHeight),
                width: Math.round(bbox.width * layerWidth),
                height: Math.round(bbox.height * layerHeight)
            };
        }

        // V3.9: Store screen pixels for stable re-rendering
        this._sampleRowScreenPixels = { ...screenBbox };

        // Create overlay element
        // V3.5: pointer-events: none to allow drawing columns through it
        const overlay = document.createElement('div');
        overlay.className = 'table-flow-sample-row-overlay';
        overlay.id = 'table-flow-sample-row';
        overlay.style.cssText = `
            position: absolute;
            left: ${screenBbox.x}px;
            top: ${screenBbox.y}px;
            width: ${screenBbox.width}px;
            height: ${screenBbox.height}px;
            border: 2px dashed #3b82f6;
            background: rgba(59, 130, 246, 0.1);
            pointer-events: none;
            z-index: 45;
            box-sizing: border-box;
        `;

        // Add resize handles (they have pointer-events: auto) - unless locked
        if (!this._tableStructureLocked) {
            this._addResizeHandlesToTempOverlay(overlay, 'sample-row', bbox);
        }

        // Add label
        const label = document.createElement('div');
        label.className = 'sample-row-label';
        label.textContent = 'שורה לדוגמא';
        label.style.cssText = `
            position: absolute;
            top: -20px;
            right: 0;
            background: #3b82f6;
            color: white;
            padding: 2px 8px;
            font-size: 10px;
            border-radius: 4px;
            white-space: nowrap;
            pointer-events: none;
        `;
        overlay.appendChild(label);

        this.overlayLayer.appendChild(overlay);
        this._sampleRowOverlay = overlay;
        this._sampleRowNormalized = bbox;
    }

    /**
     * Clear the sample row overlay
     */
    clearSampleRowOverlay() {
        if (this._sampleRowOverlay) {
            this._sampleRowOverlay.remove();
            this._sampleRowOverlay = null;
            this._sampleRowNormalized = null;
        }
    }

    /**
     * Add resize handles to a temporary overlay
     * V3.5: Enables resizing of table bbox, sample row, and columns
     * @param {HTMLElement} overlay - The overlay element
     * @param {string} type - Type of overlay ('table-bbox', 'sample-row', 'column')
     * @param {Object} normalizedBbox - Original normalized bbox for reference
     */
    _addResizeHandlesToTempOverlay(overlay, type, normalizedBbox) {
        const positions = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
        const cursorMap = {
            'n': 'ns-resize',
            's': 'ns-resize',
            'e': 'ew-resize',
            'w': 'ew-resize',
            'nw': 'nw-resize',
            'ne': 'ne-resize',
            'sw': 'sw-resize',
            'se': 'se-resize'
        };

        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `temp-resize-handle ${pos}`;
            handle.dataset.handleType = type;
            handle.dataset.handlePos = pos;

            // Position based on corner/edge
            let style = `
                position: absolute;
                background: white;
                border: 2px solid ${type === 'table-bbox' ? '#10b981' : '#3b82f6'};
                z-index: 100;
                cursor: ${cursorMap[pos]};
            `;

            if (pos === 'n') {
                style += 'top: -5px; left: 50%; transform: translateX(-50%); width: 10px; height: 10px; border-radius: 50%;';
            } else if (pos === 's') {
                style += 'bottom: -5px; left: 50%; transform: translateX(-50%); width: 10px; height: 10px; border-radius: 50%;';
            } else if (pos === 'e') {
                style += 'right: -5px; top: 50%; transform: translateY(-50%); width: 10px; height: 10px; border-radius: 50%;';
            } else if (pos === 'w') {
                style += 'left: -5px; top: 50%; transform: translateY(-50%); width: 10px; height: 10px; border-radius: 50%;';
            } else if (pos === 'nw') {
                style += 'top: -5px; left: -5px; width: 10px; height: 10px; border-radius: 2px;';
            } else if (pos === 'ne') {
                style += 'top: -5px; right: -5px; width: 10px; height: 10px; border-radius: 2px;';
            } else if (pos === 'sw') {
                style += 'bottom: -5px; left: -5px; width: 10px; height: 10px; border-radius: 2px;';
            } else if (pos === 'se') {
                style += 'bottom: -5px; right: -5px; width: 10px; height: 10px; border-radius: 2px;';
            }

            handle.style.cssText = style;

            // Add drag handlers
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this._startTempResize(e, overlay, type, pos);
            });

            overlay.appendChild(handle);
        });
    }

    /**
     * Start resizing a temporary overlay
     * @param {MouseEvent} e - Mouse event
     * @param {HTMLElement} overlay - Overlay element
     * @param {string} type - Overlay type
     * @param {string} position - Resize handle position
     */
    _startTempResize(e, overlay, type, position) {
        e.preventDefault();

        this._tempResizeState = {
            overlay,
            type,
            position,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: overlay.offsetLeft,
            startTop: overlay.offsetTop,
            startWidth: overlay.offsetWidth,
            startHeight: overlay.offsetHeight
        };

        // Add temporary listeners
        this._boundTempResizeMove = this._onTempResizeMove.bind(this);
        this._boundTempResizeEnd = this._onTempResizeEnd.bind(this);
        document.addEventListener('mousemove', this._boundTempResizeMove);
        document.addEventListener('mouseup', this._boundTempResizeEnd);

        overlay.classList.add('resizing');
    }

    /**
     * Handle temp resize move
     * @param {MouseEvent} e - Mouse event
     */
    _onTempResizeMove(e) {
        if (!this._tempResizeState) return;

        const { overlay, position, startX, startY, startLeft, startTop, startWidth, startHeight } = this._tempResizeState;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newLeft = startLeft;
        let newTop = startTop;
        let newWidth = startWidth;
        let newHeight = startHeight;

        // Handle position-based resize
        if (position.includes('w')) {
            newLeft = startLeft + dx;
            newWidth = startWidth - dx;
        }
        if (position.includes('e')) {
            newWidth = startWidth + dx;
        }
        if (position.includes('n')) {
            newTop = startTop + dy;
            newHeight = startHeight - dy;
        }
        if (position.includes('s')) {
            newHeight = startHeight + dy;
        }

        // Minimum size constraints
        newWidth = Math.max(20, newWidth);
        newHeight = Math.max(10, newHeight);

        // Boundary constraints
        const layerWidth = this.overlayLayer.offsetWidth;
        const layerHeight = this.overlayLayer.offsetHeight;
        newLeft = Math.max(0, Math.min(layerWidth - newWidth, newLeft));
        newTop = Math.max(0, Math.min(layerHeight - newHeight, newTop));

        // Update visual position
        overlay.style.left = newLeft + 'px';
        overlay.style.top = newTop + 'px';
        overlay.style.width = newWidth + 'px';
        overlay.style.height = newHeight + 'px';
    }

    /**
     * Handle temp resize end
     * @param {MouseEvent} e - Mouse event
     */
    _onTempResizeEnd(e) {
        if (!this._tempResizeState) return;

        const { overlay, type } = this._tempResizeState;
        overlay.classList.remove('resizing');

        // Calculate new normalized bbox
        const layerWidth = this.overlayLayer.offsetWidth;
        const layerHeight = this.overlayLayer.offsetHeight;

        const newNormalizedBbox = {
            x: overlay.offsetLeft / layerWidth,
            y: overlay.offsetTop / layerHeight,
            width: overlay.offsetWidth / layerWidth,
            height: overlay.offsetHeight / layerHeight
        };

        // Emit event to update the model
        if (type === 'table-bbox') {
            this._tableBBoxNormalized = newNormalizedBbox;
            eventBus.emit('table:resize:tableBBox', { bbox: newNormalizedBbox });
        } else if (type === 'sample-row') {
            this._sampleRowNormalized = newNormalizedBbox;
            eventBus.emit('table:resize:sampleRow', { bbox: newNormalizedBbox });
        } else if (type === 'column') {
            eventBus.emit('table:resize:column', { bbox: newNormalizedBbox, columnId: overlay.dataset.columnId });
        }

        // Cleanup
        document.removeEventListener('mousemove', this._boundTempResizeMove);
        document.removeEventListener('mouseup', this._boundTempResizeEnd);
        this._tempResizeState = null;
    }

    /**
     * Render a single field overlay
     * Uses the EXACT coordinate conversion from old mapper
     * @param {Object} field - Field object
     */
    renderField(field) {
        if (!this.overlayLayer) return;

        // ============ CRITICAL: Check pdfPageDimensions ============
        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) {
            // Queue field for later rendering
            if (!this._pendingRenderFields.includes(field)) {
                this._pendingRenderFields.push(field);
                console.log('📝 Field queued (no dimensions yet):', field.id);
            }
            return;
        }

        // Remove existing element if any
        this.removeField(field.id);

        // Create overlay element
        const overlay = document.createElement('div');
        overlay.className = 'field-overlay';

        // Add type-specific class
        if (field.type === 'checkbox' || field.type === 'radio' || field.type === 'cell' || field.type === 'signature') {
            overlay.classList.add(`type-${field.type}`);
        }

        // Add table field class
        if (field.tableGroupId) {
            overlay.classList.add('table-field');
        }

        overlay.dataset.fieldId = field.id;

        // ========== COORDINATE CONVERSION (from old mapper overlay-engine.js) ==========
        let x, y, width, height;

        // Get PDF dimensions in unscaled points (remove DPI scaling)
        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfPageDimensions.width / dpiScale;
        const pdfH = pdfPageDimensions.height / dpiScale;

        // Get layer dimensions in pixels
        const layerWidth = Math.max(this.overlayLayer.offsetWidth, 1);
        const layerHeight = Math.max(this.overlayLayer.offsetHeight, 1);

        // Calculate scale factors: PDF points → display pixels
        const scaleX = layerWidth / pdfW;
        const scaleY = layerHeight / pdfH;

        if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            // ============ BBOX FORMAT: [x, y, width, height] ============
            let [bboxX, bboxY, bboxW, bboxH] = field.bbox;

            // Detect if values are normalized (0-1) or absolute PDF points
            const isNormalized = bboxX <= 1 && bboxY <= 1 && bboxW <= 1 && bboxH <= 1;

            if (isNormalized) {
                // Convert normalized to absolute PDF points
                bboxX *= pdfW;
                bboxY *= pdfH;
                bboxW *= pdfW;
                bboxH *= pdfH;
            }

            // Convert PDF points to canvas pixels
            // NOTE: PDF Y is from bottom, canvas Y is from top
            // The bbox Y is stored as bottom-left in PDF coordinates
            x = Math.round(bboxX * scaleX);
            y = Math.round((pdfH - bboxY - bboxH) * scaleY);  // ← Y-AXIS FLIP
            width = Math.round(bboxW * scaleX);
            height = Math.round(bboxH * scaleY);

        } else if ((field.type === 'checkbox' || field.type === 'radio' || field.type === 'cell') &&
                   field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
            // ============ ANCHOR FORMAT: [xPercent, yPercent] for checkbox/radio/cell ============
            // NOTE: yPercent is stored as "from bottom" (Y-flipped during save)
            const [anchorX, anchorY] = field.anchor;

            // Convert anchor (0-1) to canvas pixels
            // anchorY is already Y-flipped, so we flip it back for canvas
            const canvasCenterX = anchorX * layerWidth;
            const canvasCenterY = (1 - anchorY) * layerHeight;  // ← Y-AXIS FLIP BACK

            // V3.10: Cell uses its stored dimensions, checkbox/radio have defaults
            width = field.overlayWidth || (field.type === 'checkbox' ? CHECKBOX_SIZE : (field.type === 'radio' ? RADIO_SIZE : CHECKBOX_SIZE));
            height = field.overlayHeight || (field.type === 'checkbox' ? CHECKBOX_SIZE : (field.type === 'radio' ? RADIO_SIZE : CHECKBOX_SIZE));
            x = Math.round(canvasCenterX - width / 2);
            y = Math.round(canvasCenterY - height / 2);

            // Performance: removed console.log from hot path

        } else {
            console.warn('[OverlayRenderer] Invalid coordinates for field:', field.id);
            return;
        }

        // Apply position and size
        overlay.style.left = `${x}px`;
        overlay.style.top = `${y}px`;
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;
        overlay.style.zIndex = '1';

        // ============ SLOT VISUALIZATION (Phase 3) ============
        // Show visual divider lines when field is in "slots" mode
        const LH = window.LayoutHelper;
        if (LH && LH.hasExplicitLayout(field)) {
            const layout = LH.getFieldLayout(field);
            if (layout.mode === LH.MODES.SLOTS) {
                overlay.classList.add('layout-slots');
                overlay.style.setProperty('--slot-count', layout.slotCount || 9);
            }
        }

        // Add resize handles (hidden by default)
        this._addResizeHandles(overlay);

        // Check if selected
        if (state.get('selection.fieldId') === field.id) {
            overlay.classList.add('selected');
            this._showResizeHandles(overlay);
            overlay.style.zIndex = '10';
        }

        // Event handlers
        overlay.addEventListener('click', (e) => {
            if (!e.target.classList.contains('resize-handle')) {
                state.selectField(field.id);
            }
        });

        overlay.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._showContextMenu(field, e.clientX, e.clientY);
        });

        // Add to layer
        this.overlayLayer.appendChild(overlay);
        this.fieldElements.set(field.id, overlay);
        // Performance: removed console.log from hot path
    }

    /**
     * Convert screen coordinates to bbox (for saving field position)
     * Uses the EXACT formula from old mapper drag-engine.js
     * @param {Object} screen - { x, y, width, height } in screen pixels
     * @returns {Array} bbox [x, y, width, height] in normalized 0-1 values
     */
    screenToBbox(screen) {
        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) return [0, 0, 0, 0];

        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfPageDimensions.width / dpiScale;
        const pdfH = pdfPageDimensions.height / dpiScale;

        const layerWidth = Math.max(this.overlayLayer?.offsetWidth || 1, 1);
        const layerHeight = Math.max(this.overlayLayer?.offsetHeight || 1, 1);

        // Scale factors: display pixels → PDF points
        const scaleX = pdfW / layerWidth;
        const scaleY = pdfH / layerHeight;

        // Convert to PDF points
        const xPdf = screen.x * scaleX;
        const widthPdf = screen.width * scaleX;
        const yPdfTop = screen.y * scaleY;
        const heightPdf = screen.height * scaleY;

        // Y-AXIS FLIP: convert canvas top to PDF bottom
        const yPdfBottom = pdfH - (yPdfTop + heightPdf);

        // Normalize to 0-1
        const xPercent = xPdf / pdfW;
        const yPercent = yPdfBottom / pdfH;
        const wPercent = widthPdf / pdfW;
        const hPercent = heightPdf / pdfH;

        return [xPercent, yPercent, wPercent, hPercent];
    }

    /**
     * Convert screen coordinates to anchor (for checkbox/radio)
     * @param {number} centerX - Center X in screen pixels
     * @param {number} centerY - Center Y in screen pixels
     * @returns {Array} anchor [xPercent, yPercent]
     */
    screenToAnchor(centerX, centerY) {
        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) return [0, 0];

        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfPageDimensions.width / dpiScale;
        const pdfH = pdfPageDimensions.height / dpiScale;

        const layerWidth = Math.max(this.overlayLayer?.offsetWidth || 1, 1);
        const layerHeight = Math.max(this.overlayLayer?.offsetHeight || 1, 1);

        // Scale factors
        const scaleX = pdfW / layerWidth;
        const scaleY = pdfH / layerHeight;

        // Convert to PDF points
        const xPdf = centerX * scaleX;
        const yPdfTop = centerY * scaleY;
        const yPdfBottom = pdfH - yPdfTop;

        // Normalize to 0-1
        const xPercent = xPdf / pdfW;
        const yPercent = yPdfBottom / pdfH;

        return [xPercent, yPercent];
    }

    /**
     * Convert anchor (normalized 0-1) to screen coordinates
     * Inverse of screenToAnchor
     * @param {Array} anchor - [xPercent, yPercent] normalized 0-1
     * @returns {Object} { x, y } center point in screen pixels
     */
    anchorToScreen(anchor) {
        if (!anchor || !Array.isArray(anchor) || anchor.length !== 2) {
            return { x: 0, y: 0 };
        }

        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) return { x: 0, y: 0 };

        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfPageDimensions.width / dpiScale;
        const pdfH = pdfPageDimensions.height / dpiScale;

        const layerWidth = Math.max(this.overlayLayer?.offsetWidth || 1, 1);
        const layerHeight = Math.max(this.overlayLayer?.offsetHeight || 1, 1);

        // anchor is [xPercent, yPercent] where Y is from BOTTOM (PDF convention)
        const [xPercent, yPercent] = anchor;

        // Convert to PDF points
        const xPdf = xPercent * pdfW;
        const yPdfBottom = yPercent * pdfH;
        const yPdfTop = pdfH - yPdfBottom;

        // Scale to screen
        const scaleX = layerWidth / pdfW;
        const scaleY = layerHeight / pdfH;

        return {
            x: xPdf * scaleX,
            y: yPdfTop * scaleY
        };
    }

    /**
     * Convert bbox (normalized 0-1) back to screen coordinates
     * Inverse of screenToBbox - used for auto-detection scan areas
     * @param {Array|Object} bbox - [x, y, width, height] or {x, y, width, height} in normalized 0-1 values
     * @returns {Object} { x, y, width, height } in screen pixels
     */
    bboxToScreen(bbox) {
        // Handle both array format [x, y, w, h] and object format {x, y, width, height}
        let bboxX, bboxY, bboxW, bboxH;

        if (Array.isArray(bbox) && bbox.length === 4) {
            [bboxX, bboxY, bboxW, bboxH] = bbox;
        } else if (bbox && typeof bbox === 'object' && 'x' in bbox && 'y' in bbox) {
            bboxX = bbox.x;
            bboxY = bbox.y;
            bboxW = bbox.width || bbox.w || 0;
            bboxH = bbox.height || bbox.h || 0;
        } else {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) return { x: 0, y: 0, width: 0, height: 0 };

        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfPageDimensions.width / dpiScale;
        const pdfH = pdfPageDimensions.height / dpiScale;

        const layerWidth = Math.max(this.overlayLayer?.offsetWidth || 1, 1);
        const layerHeight = Math.max(this.overlayLayer?.offsetHeight || 1, 1);

        // Scale factors: PDF points → display pixels
        const scaleX = layerWidth / pdfW;
        const scaleY = layerHeight / pdfH;

        // Detect if values are normalized (0-1) or absolute
        const isNormalized = bboxX <= 1 && bboxY <= 1 && bboxW <= 1 && bboxH <= 1;

        let x, y, width, height;

        if (isNormalized) {
            // Normalized coordinates (0-1) are BOTTOM-BASED (PDF coordinate system)
            // screenToBbox stores yPercent = (pdfH - yPdfTop - heightPdf) / pdfH
            // So we need to reverse: y = (1 - bboxY - bboxH) * layerHeight
            x = Math.round(bboxX * layerWidth);
            y = Math.round((1 - bboxY - bboxH) * layerHeight);
            width = Math.round(bboxW * layerWidth);
            height = Math.round(bboxH * layerHeight);
        } else {
            // Absolute PDF coordinates are BOTTOM-BASED
            // Need Y flip for PDF coordinate system
            x = Math.round(bboxX * scaleX);
            y = Math.round((pdfH - bboxY - bboxH) * scaleY);
            width = Math.round(bboxW * scaleX);
            height = Math.round(bboxH * scaleY);
        }

        return { x, y, width, height };
    }

    /**
     * Remove a field overlay
     * @param {string} fieldId - Field ID
     */
    removeField(fieldId) {
        const element = this.fieldElements.get(fieldId);
        if (element) {
            element.remove();
            this.fieldElements.delete(fieldId);
        }
    }

    /**
     * Clear all overlays
     */
    clear() {
        if (this.overlayLayer) {
            this.overlayLayer.innerHTML = '';
        }
        this.fieldElements.clear();
        this.tableElements.clear();
        this.tempColumnElements.clear();
        // Also clear label overlay tracking
        labelOverlay.clearAll();
    }

    /**
     * Render radio group builder circles (numbered indicators)
     * Called during radio group building to show ①②③ on marked circles
     */
    renderRadioBuilderCircles() {
        const builder = state.getRadioGroupBuilder();
        if (!builder.active || builder.step === RadioGroupSteps.MARK_TITLE) {
            return;
        }

        const circleIndicators = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

        builder.circles.forEach((circle, index) => {
            const screen = this.bboxToScreen(circle.bbox);

            // Create indicator element
            const indicator = document.createElement('div');
            indicator.className = 'radio-builder-indicator';
            indicator.innerHTML = `
                <div class="circle-marker"></div>
                <div class="circle-number">${circleIndicators[index] || (index + 1)}</div>
            `;

            indicator.style.cssText = `
                position: absolute;
                left: ${screen.x}px;
                top: ${screen.y}px;
                width: ${screen.width}px;
                height: ${screen.height}px;
                pointer-events: none;
                z-index: 100;
            `;

            // Style the marker
            const marker = indicator.querySelector('.circle-marker');
            marker.style.cssText = `
                position: absolute;
                inset: 0;
                border: 3px solid #3b82f6;
                border-radius: 50%;
                background: rgba(59, 130, 246, 0.2);
            `;

            // Style the number
            const number = indicator.querySelector('.circle-number');
            number.style.cssText = `
                position: absolute;
                top: -10px;
                right: -10px;
                width: 24px;
                height: 24px;
                background: #3b82f6;
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: bold;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            `;

            this.overlayLayer.appendChild(indicator);
        });
    }

    /**
     * Public render method - renders all overlays including radio builder circles
     */
    render() {
        this.renderAll();
    }

    /**
     * Add resize handles to overlay
     * @param {HTMLElement} overlay - Overlay element
     */
    _addResizeHandles(overlay) {
        const positions = ['nw', 'ne', 'sw', 'se'];

        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${pos}`;
            handle.style.display = 'none';
            overlay.appendChild(handle);
        });
    }

    /**
     * Show resize handles on overlay
     * @param {HTMLElement} overlay - Overlay element
     */
    _showResizeHandles(overlay) {
        overlay.querySelectorAll('.resize-handle').forEach(h => {
            h.style.display = 'block';
        });
    }

    /**
     * Hide resize handles on overlay
     * @param {HTMLElement} overlay - Overlay element
     */
    _hideResizeHandles(overlay) {
        overlay.querySelectorAll('.resize-handle').forEach(h => {
            h.style.display = 'none';
        });
    }

    /**
     * Update selection styling
     * @param {string|null} selectedId - Selected field ID or null
     */
    _updateSelection(selectedId) {
        // Remove selection from all
        this.fieldElements.forEach((element, fieldId) => {
            element.classList.remove('selected');
            element.style.zIndex = '1';
            this._hideResizeHandles(element);
        });

        // Add selection to current
        if (selectedId) {
            const element = this.fieldElements.get(selectedId);
            if (element) {
                element.classList.add('selected');
                element.style.zIndex = '10';
                this._showResizeHandles(element);
            }
        }
    }

    /**
     * Show context menu for field
     * @param {Object} field - Field object
     * @param {number} x - Screen X
     * @param {number} y - Screen Y
     */
    _showContextMenu(field, x, y) {
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.remove('hidden');

        // Store current field for actions
        menu.dataset.fieldId = field.id;

        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.add('hidden');
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    /**
     * Get overlay layer dimensions
     * @returns {Object} { width, height }
     */
    getLayerDimensions() {
        return {
            width: this.overlayLayer?.offsetWidth || 0,
            height: this.overlayLayer?.offsetHeight || 0
        };
    }

    /**
     * Update the overlay layer size to match the PDF image
     * FIXED: Uses clientWidth/clientHeight (actual rendered size after resize)
     * PUBLIC method - can be called from outside (window resize, zoom change)
     */
    updateLayerSize() {
        // Look for the <img> in pdf-container (legacy PNG rendering)
        const pdfContainer = document.getElementById('pdf-container');
        const img = pdfContainer?.querySelector('img');

        if (img && this.overlayLayer) {
            // CRITICAL: Use clientWidth/clientHeight - actual rendered size
            const width = img.clientWidth;
            const height = img.clientHeight;

            this.overlayLayer.style.width = `${width}px`;
            this.overlayLayer.style.height = `${height}px`;

            if (this.drawingLayer) {
                this.drawingLayer.style.width = `${width}px`;
                this.drawingLayer.style.height = `${height}px`;
            }

            console.log(`[OverlayRenderer] Layer size updated: ${width}x${height}`);
        }
    }

    // Alias for internal use
    _updateLayerSize() {
        this.updateLayerSize();
    }

    /**
     * Get field element by ID
     * @param {string} fieldId - Field ID
     * @returns {HTMLElement|null}
     */
    getFieldElement(fieldId) {
        return this.fieldElements.get(fieldId) || null;
    }

    // ============ V3.3: GHOST OVERLAY METHODS ============

    /**
     * Clear all ghost overlays
     */
    clearGhostOverlays() {
        this.ghostElements.forEach(el => el.remove());
        this.ghostElements.clear();
    }

    /**
     * Show batch mapping preview
     * Displays ghost rectangles where batch-mapped fields will be placed
     * @param {Array} sourceBbox - Source field bbox [x, y, w, h]
     * @param {number} count - Number of duplicates to show
     */
    showBatchPreview(sourceBbox, count) {
        this.clearBatchPreview();

        if (!this.overlayLayer) return;

        const [x, y, w, h] = sourceBbox;
        const deltaY = h + (h * 0.1); // 10% gap between fields

        const dims = pdfEngine.getPdfPageDimensions();
        if (!dims) return;

        // Get layer dimensions for screen coordinate conversion
        const layerWidth = this.overlayLayer?.offsetWidth || dims.width;
        const layerHeight = this.overlayLayer?.offsetHeight || dims.height;

        for (let i = 0; i < count; i++) {
            // V3.4: SUBTRACT to move DOWN visually (PDF Y=0 is at bottom)
            const newY = y - (deltaY * (i + 1));

            // Convert normalized coords to screen coords using layer dimensions
            const screenX = x * layerWidth;
            const screenY = (1 - newY - h) * layerHeight; // Y-flip for screen coords
            const screenW = w * layerWidth;
            const screenH = h * layerHeight;

            const ghostEl = document.createElement('div');
            ghostEl.className = 'batch-preview-ghost';
            ghostEl.style.cssText = `
                position: absolute;
                left: ${screenX}px;
                top: ${screenY}px;
                width: ${screenW}px;
                height: ${screenH}px;
                background: rgba(139, 92, 246, 0.15);
                border: 2px dashed rgba(139, 92, 246, 0.6);
                border-radius: 4px;
                pointer-events: none;
                z-index: 50;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // Add index label
            const label = document.createElement('span');
            label.textContent = `+${i + 1}`;
            label.style.cssText = `
                background: rgba(139, 92, 246, 0.8);
                color: white;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 11px;
                font-weight: 600;
            `;
            ghostEl.appendChild(label);

            this.overlayLayer.appendChild(ghostEl);
            this._batchPreviewElements.push(ghostEl);
        }

        console.log('[OverlayRenderer] Showing batch preview for', count, 'fields');
    }

    /**
     * Clear batch mapping preview
     */
    clearBatchPreview() {
        this._batchPreviewElements.forEach(el => el.remove());
        this._batchPreviewElements = [];
    }

    /**
     * Render a ghost overlay for an unmapped template field
     * Used to show hints where fields should be placed
     * @param {Object} templateField - Template field with position hints
     * @param {Object} options - Styling options
     */
    renderGhostOverlay(templateField, options = {}) {
        if (!this.overlayLayer || !templateField.positionHint) return;

        // Remove existing ghost for this field
        if (this.ghostElements.has(templateField.id)) {
            this.ghostElements.get(templateField.id).remove();
        }

        const dims = pdfEngine.getPdfPageDimensions();
        if (!dims) return;

        const hint = templateField.positionHint;
        const [x, y, w, h] = hint.bbox || [0.1, 0.1, 0.2, 0.03];

        // Get layer dimensions for screen coordinate conversion
        const layerWidth = this.overlayLayer?.offsetWidth || dims.width;
        const layerHeight = this.overlayLayer?.offsetHeight || dims.height;

        // Convert to screen coords using layer dimensions
        const screenX = x * layerWidth;
        const screenY = (1 - y - h) * layerHeight; // Y-flip for screen coords
        const screenW = w * layerWidth;
        const screenH = h * layerHeight;

        const ghostEl = document.createElement('div');
        ghostEl.className = 'ghost-overlay';
        ghostEl.dataset.templateFieldId = templateField.id;
        ghostEl.style.cssText = `
            position: absolute;
            left: ${screenX}px;
            top: ${screenY}px;
            width: ${screenW}px;
            height: ${screenH}px;
            background: rgba(34, 197, 94, 0.1);
            border: 2px dashed rgba(34, 197, 94, 0.5);
            border-radius: 4px;
            pointer-events: none;
            z-index: 40;
        `;

        // Add field name label
        if (templateField.label_he || templateField.label_en) {
            const label = document.createElement('div');
            label.className = 'ghost-label';
            label.textContent = templateField.label_he || templateField.label_en;
            label.style.cssText = `
                position: absolute;
                top: -20px;
                right: 0;
                background: rgba(34, 197, 94, 0.9);
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                white-space: nowrap;
            `;
            ghostEl.appendChild(label);
        }

        this.overlayLayer.appendChild(ghostEl);
        this.ghostElements.set(templateField.id, ghostEl);
    }

    /**
     * Remove ghost overlay for a template field
     * @param {string} templateFieldId - Template field ID
     */
    removeGhostOverlay(templateFieldId) {
        const el = this.ghostElements.get(templateFieldId);
        if (el) {
            el.remove();
            this.ghostElements.delete(templateFieldId);
        }
    }
}

// Singleton instance
export const overlayRenderer = new OverlayRenderer();
