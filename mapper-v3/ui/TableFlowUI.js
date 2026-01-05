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
            columnCancelBtn: document.getElementById('column-cancel-btn')
        };

        // Setup event listeners
        this._setupEventListeners();
        this._setupFlowEventListeners();

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
     * Setup TableFlowController event listeners
     */
    _setupFlowEventListeners() {
        // Flow started
        eventBus.on(TableEvents.TABLE_FLOW_STARTED, () => {
            this.show();
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
        eventBus.on(TableEvents.TABLE_UI_MESSAGE, ({ type, message }) => {
            this._showMessage(type, message);
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
     * Reset UI elements to initial state
     */
    _resetUI() {
        // Reset table title
        this._currentTableTitle = '';
        if (this.elements.title) {
            this.elements.title.textContent = 'מיפוי טבלה';
        }

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
     */
    _showMessage(type, message) {
        this.elements.message.textContent = message;
        this.elements.message.className = `flow-message ${type}`;

        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                this.elements.message.textContent = '';
                this.elements.message.className = 'flow-message';
            }, 3000);
        }
    }

    /**
     * Update columns list
     */
    _updateColumnsList(columns) {
        this.elements.columnsList.innerHTML = '';

        if (!columns || columns.length === 0) {
            this.elements.columnsList.innerHTML = '<li class="empty">טרם הוגדרו עמודות</li>';
            return;
        }

        columns.forEach((col, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="col-num">${index + 1}</span>
                <span class="col-name">${col.hebrewName || col.columnId}</span>
                <span class="col-type">(${col.type})</span>
            `;
            this.elements.columnsList.appendChild(li);
        });
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
     */
    _showColumnDialog(defaultName = '', defaultType = 'text') {
        if (!this.elements.columnDialog) return;

        this.elements.columnNameInput.value = defaultName;
        this.elements.columnTypeSelect.value = defaultType;
        this.elements.columnDialog.classList.remove('hidden');
        this.elements.columnNameInput.focus();
    }

    /**
     * Confirm column details
     */
    _confirmColumnDetails() {
        const name = this.elements.columnNameInput.value.trim();
        const type = this.elements.columnTypeSelect.value;

        eventBus.emit(TableEvents.TABLE_COLUMN_DETAILS_RESULT, { name, type });
        this.elements.columnDialog.classList.add('hidden');
    }

    /**
     * Cancel column details
     */
    _cancelColumnDetails() {
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
