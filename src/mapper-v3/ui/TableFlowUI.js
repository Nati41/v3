/**
 * TableFlowUI - Minimal UI controller for Table Flow
 * Listens to TableFlowController events and updates UI accordingly
 */

import { eventBus, Events } from '../core/EventBus.js';
import { state } from '../core/StateManager.js';
import { TableFlowController, TableSteps, TableEvents } from '../tables/TableFlowController.js';
import { drawController } from '../engines/DrawController.js';
import { makeDraggable, makeMinimizable, addDialogStyles } from './DialogUtils.js';

// Step descriptions in Hebrew
// NEW FLOW: tableBBox FIRST (visual boundaries), then title (semantic), then sampleRow (height source)
const STEP_DESCRIPTIONS = {
    [TableSteps.SELECT_TABLE_BBOX]: 'סמן את גבולות הטבלה כולה (מסגרת חיצונית)',
    [TableSteps.SELECT_TITLE]: 'סמן את שם הטבלה (כותרת הטקסט)',
    [TableSteps.SAMPLE_ROW]: 'סמן שורה אחת לדוגמא (שורת נתונים)',
    [TableSteps.COLUMNS]: 'סמן את העמודות בתוך השורה',
    [TableSteps.ROW_COUNT]: 'הזן את מספר השורות בטבלה',
    [TableSteps.GENERATE]: 'מייצר טבלה...',
    [TableSteps.REVIEW]: 'בדוק את הטבלה ואשר'
};

class TableFlowUI {
    constructor() {
        this.flowController = null;
        this.panel = null;
        this.initialized = false;
    }

    /**
     * Initialize the UI
     */
    init() {
        if (this.initialized) return;

        // Get DOM elements
        this.panel = document.getElementById('table-flow-panel');
        if (!this.panel) {
            console.warn('[TableFlowUI] Panel not found');
            return;
        }

        this.elements = {
            title: document.getElementById('table-flow-title'),
            stepNum: document.getElementById('table-flow-step-num'),
            stepDesc: document.getElementById('table-flow-step-desc'),
            message: document.getElementById('table-flow-message'),
            rowCountSection: document.getElementById('table-flow-row-count'),
            rowCountInput: document.getElementById('table-row-count-input'),
            columnsSection: document.getElementById('table-flow-columns'),
            columnsList: document.getElementById('table-columns-list'),
            summary: document.getElementById('table-flow-summary'),
            backBtn: document.getElementById('table-flow-back'),
            nextBtn: document.getElementById('table-flow-next'),
            cancelBtn: document.getElementById('table-flow-cancel'),
            // Column dialog
            columnDialog: document.getElementById('column-details-dialog'),
            columnNameInput: document.getElementById('column-name-input'),
            columnTypeSelect: document.getElementById('column-type-select'),
            columnConfirmBtn: document.getElementById('column-confirm-btn'),
            columnCancelBtn: document.getElementById('column-cancel-btn'),
            // Layout toggle for columns (Phase 3)
            columnLayoutToggle: document.getElementById('column-layout-toggle'),
            columnSlotCountGroup: document.getElementById('column-slot-count-group'),
            columnSlotCount: document.getElementById('column-slot-count')
        };

        // Current column layout state
        this._columnLayoutMode = 'flow';
        this._columnSlotCount = 9;

        // Setup event listeners
        this._setupEventListeners();
        this._setupFlowEventListeners();
        this._setupColumnLayoutListeners();

        // Add drag and minimize functionality
        this._setupDragAndMinimize();

        this.initialized = true;
        console.log('[TableFlowUI] Initialized');
    }

    /**
     * Setup drag and minimize for the panel
     */
    _setupDragAndMinimize() {
        addDialogStyles();

        const header = this.panel.querySelector('.table-flow-header');
        const content = this.panel.querySelector('.table-flow-content');
        const footer = this.panel.querySelector('.table-flow-actions');

        if (header && content) {
            // Make panel draggable by header
            this._dragController = makeDraggable(this.panel, header);

            // Add minimize button
            this._minimizeController = makeMinimizable(this.panel, header, content, footer);
        }
    }

    /**
     * Setup UI button event listeners
     */
    _setupEventListeners() {
        // Back button
        this.elements.backBtn.addEventListener('click', () => {
            if (this.flowController) {
                this.flowController.back();
            }
        });

        // Next button
        this.elements.nextBtn.addEventListener('click', () => {
            if (this.flowController) {
                this.flowController.next();
            }
        });

        // Cancel button
        this.elements.cancelBtn.addEventListener('click', () => {
            this.cancel();
        });

        // Row count input - listen to multiple events to ensure value is captured
        const handleRowCountChange = (e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value)) {
                eventBus.emit('table:rowCountChanged', value);
            }
        };
        this.elements.rowCountInput.addEventListener('input', handleRowCountChange);
        this.elements.rowCountInput.addEventListener('change', handleRowCountChange);

        // Enter key on row count input advances to next step
        this.elements.rowCountInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 1 && value <= 100) {
                    eventBus.emit('table:rowCountChanged', value);
                    // Small delay then click next
                    setTimeout(() => {
                        if (this.flowController && !this.elements.nextBtn.disabled) {
                            this.flowController.next();
                        }
                    }, 100);
                }
            }
        });

        // Column dialog buttons
        this.elements.columnConfirmBtn?.addEventListener('click', () => {
            this._confirmColumnDetails();
        });

        this.elements.columnCancelBtn?.addEventListener('click', () => {
            this._cancelColumnDetails();
        });

        // Column dialog: Enter to confirm
        this.elements.columnNameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._confirmColumnDetails();
            }
        });
    }

    /**
     * Setup column layout toggle listeners (Phase 3)
     */
    _setupColumnLayoutListeners() {
        // Layout toggle buttons
        this.elements.columnLayoutToggle?.querySelectorAll('.layout-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = btn.dataset.mode;
                this._setColumnLayoutMode(mode);
            });
        });

        // Slot count input
        this.elements.columnSlotCount?.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value)) {
                this._columnSlotCount = Math.max(1, Math.min(30, value));
                e.target.value = this._columnSlotCount;
            }
        });

        // Slot adjust buttons
        this.elements.columnSlotCountGroup?.querySelectorAll('.slot-adjust').forEach(btn => {
            btn.addEventListener('click', () => {
                const delta = parseInt(btn.dataset.delta);
                if (!isNaN(delta)) {
                    this._columnSlotCount = Math.max(1, Math.min(30, this._columnSlotCount + delta));
                    if (this.elements.columnSlotCount) {
                        this.elements.columnSlotCount.value = this._columnSlotCount;
                    }
                }
            });
        });
    }

    /**
     * Set column layout mode
     */
    _setColumnLayoutMode(mode) {
        this._columnLayoutMode = mode;

        // Update toggle buttons
        this.elements.columnLayoutToggle?.querySelectorAll('.layout-toggle').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Show/hide slot count group
        if (mode === 'slots') {
            this.elements.columnSlotCountGroup?.classList.remove('hidden');
        } else {
            this.elements.columnSlotCountGroup?.classList.add('hidden');
        }
    }

    /**
     * Setup TableFlowController event listeners
     */
    _setupFlowEventListeners() {
        // Flow started
        eventBus.on(TableEvents.TABLE_FLOW_STARTED, (data) => {
            // Check if this is a "map existing table" flow
            if (data?.mode === 'map_existing' && data.tableId) {
                this.startWithExistingTable(data);
            } else {
                this.show();
            }
        });

        // Step changed
        eventBus.on(TableEvents.TABLE_FLOW_STEP_CHANGED, ({ step }) => {
            this._updateStep(step);
        });

        // Lock/unlock next button
        eventBus.on(TableEvents.TABLE_UI_LOCK_NEXT, () => {
            this.elements.nextBtn.disabled = true;
        });

        eventBus.on(TableEvents.TABLE_UI_UNLOCK_NEXT, () => {
            this.elements.nextBtn.disabled = false;
        });

        // Messages
        eventBus.on(TableEvents.TABLE_UI_MESSAGE, ({ type, message, persistent }) => {
            this._showMessage(type, message, persistent);
        });

        // Update columns list
        eventBus.on(TableEvents.TABLE_UI_UPDATE_COLUMNS, ({ columns }) => {
            this._updateColumnsList(columns);
        });

        // Show summary
        eventBus.on(TableEvents.TABLE_UI_SHOW_SUMMARY, ({ summary }) => {
            this._showSummary(summary);
        });

        // Flow finished
        eventBus.on(TableEvents.TABLE_FLOW_FINISHED, ({ tableData }) => {
            this.hide();
            if (window.showToast) {
                window.showToast(`טבלה נוצרה: ${tableData.columns.length} עמודות × ${tableData.rowCount} שורות`, 'success');
            }
        });

        // Flow cancelled
        eventBus.on(TableEvents.TABLE_FLOW_CANCELLED, () => {
            this.hide();
        });

        // Prompt for column details
        eventBus.on(TableEvents.TABLE_PROMPT_COLUMN_DETAILS, ({ defaultName, defaultType }) => {
            // If mapping existing table with pre-defined columns, use those instead
            if (this._existingColumns && this._existingColumns.length > 0) {
                // Count columns that already have positions (bbox set)
                // This gives us the index of the NEXT column to be positioned
                const positionedCount = this.flowController?.model?.columns?.filter(c => c.bbox)?.length || 0;
                const existingColumn = this._existingColumns[positionedCount];

                if (existingColumn) {
                    // Use EXACT Hebrew name from imported JSON - no fallbacks to englishId
                    const name = existingColumn.hebrewName || defaultName;
                    const type = existingColumn.type || defaultType;
                    console.log(`[TableFlowUI] Pre-filling column ${positionedCount + 1}/${this._existingColumns.length} with: "${name}" (${type})`);
                    this._showColumnDialog(name, type);
                    return;
                }
            }
            // Otherwise use defaults (for new tables, not imported)
            this._showColumnDialog(defaultName, defaultType);
        });

        // Update table title display (NEW - for semantic title)
        eventBus.on(TableEvents.TABLE_UI_UPDATE_TITLE, ({ title }) => {
            this._updateTableTitle(title);
        });
    }

    /**
     * Start the table flow
     */
    start() {
        // Reset UI before starting
        this._resetUI();

        const currentPage = state.get('document.currentPage') || 1;
        this.flowController = new TableFlowController(currentPage);

        // Set callback to save table to state
        this.flowController.onFinish = (tableData) => {
            state.addTable(tableData);
            console.log('[TableFlowUI] Table saved to state:', tableData.tableId);
        };

        this.flowController.start();
    }

    /**
     * Start flow for mapping an existing (unmapped) table
     * Skips column definition - uses existing table columns
     * @param {Object} data - { tableId, tableName, columns, rowCount }
     */
    startWithExistingTable(data) {
        console.log('[TableFlowUI] Starting with existing table:', data.tableId);

        // Reset UI before starting
        this._resetUI();

        // Set title
        this._currentTableTitle = data.tableName || 'טבלה';
        if (this.elements.title) {
            this.elements.title.textContent = `מיפוי טבלה: ${this._currentTableTitle}`;
        }

        const currentPage = state.get('document.currentPage') || 1;
        this.flowController = new TableFlowController(currentPage);

        // Pre-populate the model with existing columns
        if (data.columns && data.columns.length > 0) {
            this.flowController.model.columns = data.columns.map(col => ({
                columnId: col.columnId || `col_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                hebrewName: col.hebrewName || '',
                englishId: col.englishId || '',
                type: col.type || 'text',
                bbox: null  // Will be set during mapping
            }));
        }

        // Pre-populate row count
        if (data.rowCount) {
            this.flowController.model.rowCount = data.rowCount;
        }

        // Store the existing tableId to update instead of create
        this._existingTableId = data.tableId;

        // Store existing columns for pre-filling the column dialog
        this._existingColumns = data.columns || [];

        // Set callback to UPDATE existing table instead of adding new
        this.flowController.onFinish = (tableData) => {
            // Update existing table with position data INCLUDING ROWS
            state.updateTable(data.tableId, {
                bbox: tableData.bbox,
                headerBBox: tableData.headerBBox,
                sampleRowBBox: tableData.sampleRowBBox,
                tableBBox: tableData.tableBBox,
                rowHeight: tableData.rowHeight,
                isComplete: true,
                // Update columns with positions if available
                columns: tableData.columns || this.flowController.model.columns,
                // CRITICAL: Save user's row count (not the original from import)
                rowCount: tableData.rowCount,
                // CRITICAL: Include generated rows for livefill
                rows: tableData.rows || []
            });
            console.log('[TableFlowUI] Existing table updated with positions:', data.tableId);
            console.log('[TableFlowUI] Rows saved:', tableData.rowCount, '| Rows generated:', tableData.rows?.length || 0);
        };

        this.flowController.start();

        // Show panel
        this.show();

        // Update columns list in UI
        this._updateColumnsList(this.flowController.model.columns);
    }

    /**
     * Reset UI elements to initial state
     */
    _resetUI() {
        // Reset table title
        this._currentTableTitle = '';
        if (this.elements.title) {
            this.elements.title.textContent = 'מיפוי טבלה';
        }

        // Clear existing table data from previous flow
        this._existingTableId = null;
        this._existingColumns = null;

        // Reset row count input
        if (this.elements.rowCountInput) {
            this.elements.rowCountInput.value = '';
        }

        // Reset columns list
        if (this.elements.columnsList) {
            this.elements.columnsList.innerHTML = '<li class="empty">טרם הוגדרו עמודות</li>';
        }

        // Reset summary
        if (this.elements.summary) {
            this.elements.summary.innerHTML = '';
        }

        // Reset message
        if (this.elements.message) {
            this.elements.message.textContent = '';
            this.elements.message.className = 'flow-message';
        }

        // Hide optional sections
        this.elements.rowCountSection?.classList.add('hidden');
        this.elements.columnsSection?.classList.add('hidden');
        this.elements.summary?.classList.add('hidden');
    }

    /**
     * Cancel the flow
     */
    cancel() {
        if (this.flowController) {
            this.flowController.cancel();
            this.flowController = null;
        }
        this.hide();
    }

    /**
     * Show the panel
     */
    show() {
        this.panel.classList.remove('hidden');
    }

    /**
     * Hide the panel
     */
    hide() {
        this.panel.classList.add('hidden');
        // Reset UI
        this.elements.message.textContent = '';
        this.elements.message.className = 'flow-message';
        this.elements.rowCountSection.classList.add('hidden');
        this.elements.columnsSection.classList.add('hidden');
        this.elements.summary.classList.add('hidden');
    }

    /**
     * Update step display
     */
    _updateStep(step) {
        // Update step number (now 7 steps: tableBBox, title, sampleRow, columns, rowCount, generate, review)
        this.elements.stepNum.textContent = `שלב ${step}/7`;

        // Update step description
        this.elements.stepDesc.textContent = STEP_DESCRIPTIONS[step] || '';

        // Update back button - disable on first step (SELECT_TABLE_BBOX)
        this.elements.backBtn.disabled = step <= TableSteps.SELECT_TABLE_BBOX;

        // Update next button text
        if (step === TableSteps.REVIEW) {
            this.elements.nextBtn.textContent = 'סיום';
        } else {
            this.elements.nextBtn.textContent = 'הבא';
        }

        // Show/hide sections based on step
        this.elements.rowCountSection.classList.toggle('hidden', step !== TableSteps.ROW_COUNT);
        this.elements.columnsSection.classList.toggle('hidden', step !== TableSteps.COLUMNS && step !== TableSteps.ROW_COUNT);
        this.elements.summary.classList.toggle('hidden', step !== TableSteps.REVIEW);
    }

    /**
     * Update table title display (semantic name)
     * @param {string} title - Table title text
     */
    _updateTableTitle(title) {
        // Store current title for display
        this._currentTableTitle = title;

        // Update panel header to show table title if set
        if (this.elements.title && title) {
            this.elements.title.textContent = `טבלה: ${title}`;
        } else if (this.elements.title) {
            this.elements.title.textContent = 'מיפוי טבלה';
        }
    }

    /**
     * Show message
     * @param {string} type - Message type: 'success', 'error', 'warning', 'info'
     * @param {string} message - Message text
     * @param {boolean} persistent - If true, message stays until dismissed
     */
    _showMessage(type, message, persistent = false) {
        // Clear any existing dismiss timeout
        if (this._messageTimeout) {
            clearTimeout(this._messageTimeout);
            this._messageTimeout = null;
        }

        // Build message HTML
        let html = `<span class="message-text">${message}</span>`;

        // Add dismiss button for persistent messages
        if (persistent || type === 'error' || type === 'warning') {
            html += `<button class="message-dismiss" title="סגור">✕</button>`;
        }

        this.elements.message.innerHTML = html;
        this.elements.message.className = `flow-message ${type}`;

        // Setup dismiss button
        const dismissBtn = this.elements.message.querySelector('.message-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                this._clearMessage();
            });

            // Style the dismiss button
            dismissBtn.style.cssText = `
                background: none;
                border: none;
                color: inherit;
                cursor: pointer;
                margin-right: 8px;
                padding: 2px 6px;
                font-size: 14px;
                opacity: 0.7;
                transition: opacity 0.2s;
            `;
            dismissBtn.addEventListener('mouseenter', () => dismissBtn.style.opacity = '1');
            dismissBtn.addEventListener('mouseleave', () => dismissBtn.style.opacity = '0.7');
        }

        // Auto-hide only success messages (and only if not persistent)
        if (type === 'success' && !persistent) {
            this._messageTimeout = setTimeout(() => {
                this._clearMessage();
            }, 3000);
        }
    }

    /**
     * Clear the current message
     */
    _clearMessage() {
        if (this._messageTimeout) {
            clearTimeout(this._messageTimeout);
            this._messageTimeout = null;
        }
        this.elements.message.innerHTML = '';
        this.elements.message.className = 'flow-message';
    }

    /**
     * Update columns list
     * Adds hover handlers for sidebar/PDF column sync
     */
    _updateColumnsList(columns) {
        this.elements.columnsList.innerHTML = '';

        if (!columns || columns.length === 0) {
            this.elements.columnsList.innerHTML = '<li class="empty">טרם הוגדרו עמודות</li>';
            return;
        }

        columns.forEach((col, index) => {
            const li = document.createElement('li');
            li.dataset.columnId = col.columnId;
            li.dataset.columnIndex = index;
            li.innerHTML = `
                <span class="col-num">${index + 1}</span>
                <span class="col-name">${col.hebrewName || col.columnId}</span>
                <span class="col-type">(${col.type})</span>
            `;

            // Add hover effect styling
            li.style.cssText = `
                cursor: pointer;
                transition: background 0.2s;
                padding: 4px 8px;
                border-radius: 4px;
            `;

            // Hover to highlight corresponding PDF overlay
            li.addEventListener('mouseenter', () => {
                li.style.background = 'rgba(16, 185, 129, 0.15)';
                eventBus.emit('table:sidebar:columnHover', {
                    columnId: col.columnId,
                    index,
                    hover: true
                });
            });

            li.addEventListener('mouseleave', () => {
                li.style.background = '';
                eventBus.emit('table:sidebar:columnHover', {
                    columnId: col.columnId,
                    index,
                    hover: false
                });
            });

            this.elements.columnsList.appendChild(li);
        });

        // Listen for PDF column hover to highlight sidebar items
        // (Remove old listener first to avoid duplicates)
        if (this._columnHoverListener) {
            eventBus.off('table:column:hover', this._columnHoverListener);
        }
        this._columnHoverListener = ({ columnId, index, hover }) => {
            const listItems = this.elements.columnsList.querySelectorAll('li[data-column-id]');
            listItems.forEach(li => {
                if (li.dataset.columnId === columnId || parseInt(li.dataset.columnIndex) === index) {
                    li.style.background = hover ? 'rgba(16, 185, 129, 0.25)' : '';
                }
            });
        };
        eventBus.on('table:column:hover', this._columnHoverListener);
    }

    /**
     * Show summary
     */
    _showSummary(summary) {
        // Include table title if available
        const titleHtml = summary.tableTitle
            ? `<div class="summary-item"><strong>שם:</strong> ${summary.tableTitle}</div>`
            : '';

        this.elements.summary.innerHTML = `
            ${titleHtml}
            <div class="summary-item"><strong>עמודות:</strong> ${summary.columnsCount}</div>
            <div class="summary-item"><strong>שורות:</strong> ${summary.rowCount}</div>
            <div class="summary-item"><strong>סה"כ תאים:</strong> ${summary.totalCells}</div>
        `;
    }

    /**
     * Show column details dialog
     * Blocks ESC and click-outside dismissal - requires explicit confirm/cancel
     */
    _showColumnDialog(defaultName = '', defaultType = 'text') {
        if (!this.elements.columnDialog) return;

        this.elements.columnNameInput.value = defaultName;
        this.elements.columnTypeSelect.value = defaultType;

        // Reset layout state (Phase 3)
        this._columnLayoutMode = 'flow';
        this._columnSlotCount = 9;
        this._setColumnLayoutMode('flow');
        if (this.elements.columnSlotCount) {
            this.elements.columnSlotCount.value = 9;
        }

        this.elements.columnDialog.classList.remove('hidden');
        this.elements.columnNameInput.focus();

        // Remove old listeners if any
        if (this._dialogEscListener) {
            document.removeEventListener('keydown', this._dialogEscListener);
        }
        if (this._dialogClickListener) {
            document.removeEventListener('click', this._dialogClickListener);
        }

        // Block ESC key - show warning instead of closing
        this._dialogEscListener = (e) => {
            if (e.key === 'Escape' && !this.elements.columnDialog.classList.contains('hidden')) {
                e.preventDefault();
                e.stopPropagation();
                // Flash the dialog to indicate ESC is blocked
                this.elements.columnDialog.style.animation = 'shake 0.3s';
                setTimeout(() => {
                    this.elements.columnDialog.style.animation = '';
                }, 300);
                // Show tooltip
                this._showDialogTooltip('יש ללחוץ "אישור" או "ביטול"');
            }
        };
        document.addEventListener('keydown', this._dialogEscListener, true);

        // Block click-outside - show warning instead of closing
        this._dialogClickListener = (e) => {
            if (!this.elements.columnDialog.classList.contains('hidden')) {
                const dialogContent = this.elements.columnDialog.querySelector('.dialog-content') || this.elements.columnDialog;
                if (!dialogContent.contains(e.target) && !this.elements.columnDialog.contains(e.target)) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Flash the dialog
                    this.elements.columnDialog.style.animation = 'shake 0.3s';
                    setTimeout(() => {
                        this.elements.columnDialog.style.animation = '';
                    }, 300);
                    this._showDialogTooltip('יש ללחוץ "אישור" או "ביטול"');
                }
            }
        };
        // Use setTimeout to avoid catching the current click
        setTimeout(() => {
            document.addEventListener('click', this._dialogClickListener, true);
        }, 100);
    }

    /**
     * Show temporary tooltip on dialog
     */
    _showDialogTooltip(message) {
        let tooltip = this.elements.columnDialog.querySelector('.dialog-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'dialog-tooltip';
            tooltip.style.cssText = `
                position: absolute;
                top: -30px;
                left: 50%;
                transform: translateX(-50%);
                background: #f59e0b;
                color: white;
                padding: 4px 12px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 1000;
                animation: fadeInOut 2s forwards;
            `;
            this.elements.columnDialog.appendChild(tooltip);
        }
        tooltip.textContent = message;
        tooltip.style.display = 'block';
        setTimeout(() => {
            tooltip.style.display = 'none';
        }, 2000);
    }

    /**
     * Cleanup dialog listeners
     */
    _cleanupDialogListeners() {
        if (this._dialogEscListener) {
            document.removeEventListener('keydown', this._dialogEscListener, true);
            this._dialogEscListener = null;
        }
        if (this._dialogClickListener) {
            document.removeEventListener('click', this._dialogClickListener, true);
            this._dialogClickListener = null;
        }
    }

    /**
     * Confirm column details
     */
    _confirmColumnDetails() {
        const name = this.elements.columnNameInput.value.trim();
        const type = this.elements.columnTypeSelect.value;

        // Build layout object (Phase 3)
        const LH = window.LayoutHelper;
        let layout = null;
        if (LH) {
            if (this._columnLayoutMode === 'slots') {
                layout = LH.createSlotsLayout(this._columnSlotCount, LH.SOURCES.EXPLICIT);
            } else {
                layout = LH.createFlowLayout(LH.OVERFLOW.SHRINK, LH.SOURCES.EXPLICIT);
            }
        }

        // Cleanup dialog listeners
        this._cleanupDialogListeners();

        eventBus.emit(TableEvents.TABLE_COLUMN_DETAILS_RESULT, { name, type, layout });
        this.elements.columnDialog.classList.add('hidden');
    }

    /**
     * Cancel column details
     * Shows explicit cancel confirmation since column will NOT be added
     */
    _cancelColumnDetails() {
        // Cleanup dialog listeners
        this._cleanupDialogListeners();

        eventBus.emit(TableEvents.TABLE_COLUMN_DETAILS_RESULT, null);
        this.elements.columnDialog.classList.add('hidden');
    }

    /**
     * Handle rectangle drawn (forward to flow controller)
     * CRITICAL: Normalize coordinates to 0-1 values for resize resilience
     */
    onRectangleDrawn(bbox) {
        if (this.flowController && this.flowController.isActive()) {
            // Get overlay layer dimensions for normalization
            const overlayLayer = document.getElementById('overlay-layer');
            if (overlayLayer) {
                const layerWidth = overlayLayer.offsetWidth;
                const layerHeight = overlayLayer.offsetHeight;

                // Normalize bbox to 0-1 values
                // This ensures coordinates work correctly on window resize
                const normalizedBbox = {
                    x: bbox.x / layerWidth,
                    y: bbox.y / layerHeight,
                    width: bbox.width / layerWidth,
                    height: bbox.height / layerHeight
                };

                console.log('[TableFlowUI] Normalized bbox:', {
                    original: bbox,
                    normalized: normalizedBbox,
                    layerDimensions: { width: layerWidth, height: layerHeight }
                });

                this.flowController.onRectangleDrawn(normalizedBbox);
            } else {
                // Fallback: use original bbox if layer not found
                console.warn('[TableFlowUI] Overlay layer not found, using original bbox');
                this.flowController.onRectangleDrawn(bbox);
            }
        }
    }

    /**
     * Check if table flow is active
     */
    isActive() {
        return this.flowController && this.flowController.isActive();
    }

    /**
     * Get current flow controller
     */
    getFlowController() {
        return this.flowController;
    }
}

// Singleton
export const tableFlowUI = new TableFlowUI();
