/**
 * Table Overlay Manager
 * Manages visual overlays on the PDF canvas for table mapping
 *
 * Overlay types:
 * - Header hint (purple)
 * - Sample row hint (blue)
 * - Column hints (green)
 * - Generated cells preview (orange)
 * - Help/educational overlays
 */

// Color scheme for different overlay types
// ENHANCED: Improved opacity and color scheme for production-quality visuals
const OVERLAY_COLORS = {
    header: {
        bg: 'rgba(156, 39, 176, 0.2)',    // Purple transparent
        border: '#9C27B0',                  // Purple solid
        label: 'כותרת'
    },
    sampleRow: {
        bg: 'rgba(33, 150, 243, 0.2)',     // Blue transparent
        border: '#2196F3',                  // Blue solid
        label: 'שורה לדוגמא'
    },
    column: {
        bg: 'rgba(76, 175, 80, 0.2)',      // Green transparent
        border: '#4CAF50',                  // Green solid
        label: 'עמודה'
    },
    // TASK 1: Softer cell fill for preview - now using blue theme
    preview: {
        bg: 'rgba(0, 128, 255, 0.25)',     // Blue transparent ~25% opacity
        border: 'rgba(0, 128, 255, 0.7)',  // Blue solid ~70% opacity
        label: ''
    },
    // Cell-specific colors (for individual cell rendering)
    cell: {
        bg: 'rgba(0, 128, 255, 0.25)',     // Soft blue fill
        border: 'rgba(0, 128, 255, 0.7)',  // Clear blue border
        hoverBg: 'rgba(0, 128, 255, 0.4)', // Hover state
        hoverBorder: 'rgba(0, 128, 255, 1)'
    },
    drawingArea: {
        bg: 'transparent',
        border: '#666',
        borderStyle: 'dashed'
    }
};

export class TableOverlay {
    /**
     * @param {HTMLElement} canvasContainer - The container element for overlays
     */
    constructor(canvasContainer) {
        // Prefer dedicated table-overlay container if available
        const dedicatedOverlay = document.getElementById('table-overlay');
        this.container = dedicatedOverlay || canvasContainer;
        this.overlayEl = null;
        this.helpOverlayEl = null;
        this.columnOverlays = [];
        this.previewOverlays = [];
        this.drawingAreaEl = null;
    }

    /**
     * Show header selection hint
     * @param {Object} bbox - Bounding box { x, y, width, height }
     */
    showHeaderHint(bbox) {
        this._clearMainOverlay();
        this.overlayEl = this._drawOverlay(
            bbox,
            OVERLAY_COLORS.header.bg,
            OVERLAY_COLORS.header.border,
            OVERLAY_COLORS.header.label,
            'table-header-hint'
        );
    }

    /**
     * Show sample row selection hint
     * @param {Object} bbox - Bounding box { x, y, width, height }
     */
    showSampleRowHint(bbox) {
        this._clearMainOverlay();
        this.overlayEl = this._drawOverlay(
            bbox,
            OVERLAY_COLORS.sampleRow.bg,
            OVERLAY_COLORS.sampleRow.border,
            OVERLAY_COLORS.sampleRow.label,
            'table-row-hint'
        );
    }

    /**
     * Show column hint
     * @param {number} columnIndex - Index of the column
     * @param {Object} bbox - Bounding box { x, y, width, height }
     * @param {string} name - Column name (optional)
     */
    showColumnHint(columnIndex, bbox, name) {
        const label = name || `עמודה ${columnIndex + 1}`;
        const el = this._drawOverlay(
            bbox,
            OVERLAY_COLORS.column.bg,
            OVERLAY_COLORS.column.border,
            label,
            `table-column-hint column-${columnIndex}`
        );
        this.columnOverlays.push(el);
    }

    /**
     * Clear all column overlays
     */
    clearColumns() {
        this.columnOverlays.forEach(el => {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        this.columnOverlays = [];
    }

    /**
     * Show row indicator during row count step
     * Uses PROPORTIONAL SEGMENTATION to avoid cumulative rounding errors
     * @param {number} rowCount - Number of rows to show
     * @param {Object} sampleRowBBox - Sample row bounding box
     * @param {number} rowHeight - Height of each row
     */
    showRowHint(rowCount, sampleRowBBox, rowHeight) {
        this._clearPreviewOverlays();

        if (!sampleRowBBox || rowCount <= 0) return;

        const startY = sampleRowBBox.y;
        const totalHeight = rowCount * rowHeight;

        for (let i = 0; i < rowCount; i++) {
            // CRITICAL: PROPORTIONAL SEGMENTATION — no cumulative rounding
            // Formula: row[i].y = startY + (i / rowCount) * totalHeight
            const rowY = startY + (i / rowCount) * totalHeight;
            const nextRowY = startY + ((i + 1) / rowCount) * totalHeight;
            const cellHeight = nextRowY - rowY;

            const rowBBox = {
                x: sampleRowBBox.x,
                y: rowY,
                width: sampleRowBBox.width,
                height: cellHeight
            };

            const el = this._drawOverlay(
                rowBBox,
                OVERLAY_COLORS.preview.bg,
                OVERLAY_COLORS.preview.border,
                `${i + 1}`,
                `table-row-preview row-${i}`
            );
            this.previewOverlays.push(el);
        }
    }

    /**
     * Show complete table preview (all generated cells)
     * @param {Object} tableModel - Complete table model with rows
     *
     * ENHANCED: Uses softer cell fill and clear 1px borders per cell
     */
    showDonePreview(tableModel) {
        this._clearPreviewOverlays();

        if (!tableModel || !tableModel.rows || tableModel.rows.length === 0) {
            console.warn('[TableOverlay] No rows to show preview for');
            return;
        }

        console.log('[TableOverlay] Showing done preview:', {
            rows: tableModel.rows.length,
            columns: tableModel.columns?.length || 0
        });

        // Get column info for labels
        const columns = tableModel.columns || [];
        const columnMap = {};
        columns.forEach(col => {
            columnMap[col.columnId] = col;
        });

        // TASK 1 & 2: Use cell-specific colors with softer opacity and 1px borders
        const cellBg = OVERLAY_COLORS.cell?.bg || OVERLAY_COLORS.preview.bg;
        const cellBorder = OVERLAY_COLORS.cell?.border || OVERLAY_COLORS.preview.border;

        // Draw each cell in the table individually
        tableModel.rows.forEach((row, rowIndex) => {
            Object.keys(row).forEach((colId, colIndex) => {
                const cell = row[colId];
                if (!cell) return;

                // Get column info
                const colInfo = columnMap[colId];

                // Create cell label: row number for first column, empty for others
                let label = '';
                if (colIndex === 0) {
                    label = `${rowIndex + 1}`;
                }

                // TASK 2: Draw with 1px border (isCell: true)
                const el = this._drawOverlay(
                    {
                        x: cell.x,
                        y: cell.y,
                        width: cell.width,
                        height: cell.height
                    },
                    cellBg,
                    cellBorder,
                    label,
                    `table-cell-preview cell-${rowIndex}-${colIndex}`,
                    { isCell: true, borderWidth: 1 }  // TASK 2: 1px border for cells
                );

                // Add column name as tooltip
                if (el && colInfo) {
                    el.title = `${colInfo.hebrewName || colId} - שורה ${rowIndex + 1}`;
                }

                // Store row/col data for potential debug labels
                if (el) {
                    el.dataset.rowIndex = rowIndex;
                    el.dataset.colIndex = colIndex;
                }

                this.previewOverlays.push(el);
            });
        });

        // Also show header if available
        if (tableModel.headerBBox) {
            const headerEl = this._drawOverlay(
                tableModel.headerBBox,
                'rgba(156, 39, 176, 0.1)',
                '#9C27B0',
                'כותרת',
                'table-header-preview'
            );
            this.previewOverlays.push(headerEl);
        }
    }

    /**
     * Show educational help overlay
     * @param {number} step - Current step for context
     * @param {string} type - Type: 'header', 'row', 'column'
     */
    showEducationalOverlay(step, type) {
        this.hideHelp();

        const helpEl = document.createElement('div');
        helpEl.className = 'table-educational-overlay';
        helpEl.id = 'table-educational-overlay';

        const messages = {
            header: {
                title: 'בחירת כותרת',
                text: 'גרור מלבן סביב שורת הכותרת של הטבלה. הכותרת מכילה את שמות העמודות.',
                image: 'header-example'
            },
            row: {
                title: 'בחירת שורה לדוגמא',
                text: 'גרור מלבן סביב שורה אחת של נתונים. השורה תשמש כבסיס לכל השורות.',
                image: 'row-example'
            },
            column: {
                title: 'הגדרת עמודות',
                text: 'גרור מלבן סביב כל עמודה בנפרד. ניתן להגדיר שם וסוג לכל עמודה.',
                image: 'column-example'
            }
        };

        const msg = messages[type] || messages.header;

        helpEl.innerHTML = `
            <div class="educational-content">
                <h3>${msg.title}</h3>
                <p>${msg.text}</p>
                <div class="educational-image ${msg.image}"></div>
                <button class="btn-primary educational-close">הבנתי</button>
            </div>
        `;

        document.body.appendChild(helpEl);
        this.helpOverlayEl = helpEl;

        // Add close handler
        const closeBtn = helpEl.querySelector('.educational-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideHelp());
        }

        // Click outside to close
        helpEl.addEventListener('click', (e) => {
            if (e.target === helpEl) {
                this.hideHelp();
            }
        });
    }

    /**
     * Hide all overlays
     * @param {boolean} keepPersistent - If true, keep header and sample row overlays
     */
    hide(keepPersistent = false) {
        if (!keepPersistent) {
            this._clearMainOverlay();
        }
        this.clearColumns();
        this._clearPreviewOverlays();
        this.hideHelp();
        this._clearDrawingArea();
    }

    /**
     * Clear all overlays including persistent ones
     */
    clearAll() {
        this._clearMainOverlay();
        this.clearColumns();
        this._clearPreviewOverlays();
        this.hideHelp();
        this._clearDrawingArea();

        // FIX: Also remove any orphaned table-hint elements to prevent ghost overlays
        if (this.container) {
            const orphanedOverlays = this.container.querySelectorAll('.table-hint');
            orphanedOverlays.forEach(el => el.remove());
        }
    }

    /**
     * Clear temporary overlays but keep columns
     * Used when transitioning between steps
     */
    clearTemporary() {
        this._clearMainOverlay();
        this._clearPreviewOverlays();
        this._clearDrawingArea();
    }

    /**
     * Hide only the help overlay
     */
    hideHelp() {
        if (this.helpOverlayEl && this.helpOverlayEl.parentNode) {
            this.helpOverlayEl.parentNode.removeChild(this.helpOverlayEl);
            this.helpOverlayEl = null;
        }

        // Also remove educational overlay by ID
        const eduOverlay = document.getElementById('table-educational-overlay');
        if (eduOverlay) {
            eduOverlay.parentNode.removeChild(eduOverlay);
        }
    }

    /**
     * Clear specific overlay type
     * @param {string} type - 'header', 'row', 'column', 'preview', 'help'
     */
    clear(type) {
        switch (type) {
            case 'header':
            case 'row':
                this._clearMainOverlay();
                break;
            case 'column':
                this.clearColumns();
                break;
            case 'preview':
                this._clearPreviewOverlays();
                break;
            case 'help':
                this.hideHelp();
                break;
            case 'drawingArea':
                this._clearDrawingArea();
                break;
        }
    }

    /**
     * Highlight active drawing area
     * @param {Object} bbox - Area to highlight
     */
    highlightDrawingArea(bbox) {
        this._clearDrawingArea();

        if (!bbox || !this.container) return;

        const el = document.createElement('div');
        el.className = 'table-drawing-area';
        el.style.position = 'absolute';
        el.style.left = bbox.x + 'px';
        el.style.top = bbox.y + 'px';
        el.style.width = bbox.width + 'px';
        el.style.height = bbox.height + 'px';
        el.style.border = `2px dashed ${OVERLAY_COLORS.drawingArea.border}`;
        el.style.background = OVERLAY_COLORS.drawingArea.bg;
        el.style.pointerEvents = 'none';
        el.style.zIndex = '50';

        this.container.appendChild(el);
        this.drawingAreaEl = el;
    }

    /**
     * Internal: Draw an overlay element
     * @param {Object} bbox - Bounding box
     * @param {string} bg - Background color
     * @param {string} border - Border color
     * @param {string} label - Optional label text
     * @param {string} className - CSS class name
     * @param {Object} options - Additional options { borderWidth, isCell }
     * @returns {HTMLElement} The created overlay element
     */
    _drawOverlay(bbox, bg, border, label, className, options = {}) {
        if (!this.container) {
            console.warn('[TableOverlay] No container set');
            return null;
        }

        // FIX: Remove any existing overlay with the same className to prevent duplicates
        if (className) {
            const existingOverlays = this.container.querySelectorAll(`.table-hint.${className.split(' ')[0]}`);
            existingOverlays.forEach(el => el.remove());
        }

        const el = document.createElement('div');
        el.className = `table-hint ${className || ''}`;
        el.style.position = 'absolute';
        el.style.left = bbox.x + 'px';
        el.style.top = bbox.y + 'px';
        el.style.width = bbox.width + 'px';
        el.style.height = bbox.height + 'px';
        el.style.background = bg;

        // TASK 2: Use 1px border for cells, 2px for region hints
        const borderWidth = options.borderWidth || (options.isCell ? 1 : 2);
        el.style.border = `${borderWidth}px solid ${border}`;

        el.style.pointerEvents = 'none';
        el.style.zIndex = '100';
        el.style.boxSizing = 'border-box';

        // TASK 5: Add transform-origin for zoom scaling
        el.style.transformOrigin = 'top left';

        if (label) {
            const labelEl = document.createElement('span');
            labelEl.className = 'table-hint-label';
            labelEl.textContent = label;
            labelEl.style.position = 'absolute';
            labelEl.style.top = '-20px';
            labelEl.style.right = '0';
            labelEl.style.background = border;
            labelEl.style.color = '#fff';
            labelEl.style.padding = '2px 6px';
            labelEl.style.fontSize = '12px';
            labelEl.style.borderRadius = '3px';
            labelEl.style.whiteSpace = 'nowrap';
            el.appendChild(labelEl);
        }

        this.container.appendChild(el);
        return el;
    }

    /**
     * Internal: Clear the main overlay element
     */
    _clearMainOverlay() {
        if (this.overlayEl && this.overlayEl.parentNode) {
            this.overlayEl.parentNode.removeChild(this.overlayEl);
            this.overlayEl = null;
        }
    }

    /**
     * Internal: Clear all preview overlays
     */
    _clearPreviewOverlays() {
        this.previewOverlays.forEach(el => {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        this.previewOverlays = [];
    }

    /**
     * Internal: Clear drawing area highlight
     */
    _clearDrawingArea() {
        if (this.drawingAreaEl && this.drawingAreaEl.parentNode) {
            this.drawingAreaEl.parentNode.removeChild(this.drawingAreaEl);
            this.drawingAreaEl = null;
        }
    }

    /**
     * Set the container element
     * @param {HTMLElement} container - The container element
     */
    setContainer(container) {
        this.container = container;
    }
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.TableOverlay = TableOverlay;
}
