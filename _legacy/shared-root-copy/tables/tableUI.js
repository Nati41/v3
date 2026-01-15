/**
 * Table UI Manager
 * Manages all UI elements for table mapping mode
 *
 * Responsibilities:
 * - Toolbar activation/deactivation
 * - Step panel display and updates
 * - Progress indicator
 * - Button states (lock/unlock)
 * - Toast messages
 */

import { TableSteps } from './tableStepController.js';

// Step configuration with Hebrew labels and instructions
const STEP_CONFIG = {
    [TableSteps.HEADER]: {
        title: 'בחירת כותרת',
        instruction: 'סמן את שורת הכותרת של הטבלה',
        helpText: 'גרור מלבן סביב שורת הכותרת שמכילה את שמות העמודות'
    },
    [TableSteps.SAMPLE_ROW]: {
        title: 'בחירת שורה לדוגמא',
        instruction: 'סמן שורת נתונים אחת לדוגמא',
        helpText: 'גרור מלבן סביב שורה אחת של נתונים מתחת לכותרת'
    },
    [TableSteps.COLUMNS]: {
        title: 'הגדרת עמודות',
        instruction: 'סמן את העמודות בתוך השורה',
        helpText: 'גרור מלבן סביב כל עמודה בנפרד והגדר את שמה וסוגה'
    },
    [TableSteps.ROW_COUNT]: {
        title: 'מספר שורות',
        instruction: 'הזן את מספר השורות בטבלה',
        helpText: 'ספור את כל שורות הנתונים (לא כולל הכותרת)'
    },
    [TableSteps.GENERATE]: {
        title: 'יצירת טבלה',
        instruction: 'מייצר את כל התאים...',
        helpText: 'המערכת יוצרת את כל תאי הטבלה אוטומטית'
    },
    [TableSteps.REVIEW]: {
        title: 'סיכום ואישור',
        instruction: 'בדוק את הטבלה ואשר',
        helpText: 'וודא שכל התאים במקומם הנכון לפני שמירה'
    }
};

export class TableUIManager {
    constructor() {
        this.isActive = false;
        this.currentStep = 0;
        this.toastTimeout = null;
        this.controller = null;
        this.visualGuide = null;

        // Callback references for step controller
        this.onNext = null;
        this.onBack = null;
        this.onCancel = null;
        this.onRowCountChange = null;
        this.onColumnDelete = null;
        this.onColumnEdit = null;
    }

    /**
     * Set reference to the controller
     * @param {TableStepController} controller - The step controller
     */
    setController(controller) {
        this.controller = controller;
    }

    /**
     * Set reference to visual guide
     * @param {VisualGuide} visualGuide - The visual guide instance
     */
    setVisualGuide(visualGuide) {
        this.visualGuide = visualGuide;
    }

    /**
     * Set callbacks for step actions
     * @param {Object} callbacks - Object with onNext, onBack, onCancel functions
     */
    setCallbacks(callbacks) {
        if (callbacks.onNext) this.onNext = callbacks.onNext;
        if (callbacks.onBack) this.onBack = callbacks.onBack;
        if (callbacks.onCancel) this.onCancel = callbacks.onCancel;
        if (callbacks.onRowCountChange) this.onRowCountChange = callbacks.onRowCountChange;
        if (callbacks.onColumnDelete) this.onColumnDelete = callbacks.onColumnDelete;
        if (callbacks.onColumnEdit) this.onColumnEdit = callbacks.onColumnEdit;
    }

    /**
     * Activate table mapping toolbar
     * - Highlight table button
     * - Dim other tool buttons
     */
    activateToolbar() {
        this.isActive = true;
        document.body.classList.add('table-mode');

        // Highlight table button if exists
        const tableBtn = document.getElementById('btn-table-mapping-mode');
        if (tableBtn) {
            tableBtn.classList.add('active');
        }

        // Update mapping layer cursor
        const layer = document.getElementById('mapping-layer');
        if (layer) {
            layer.classList.add('table-mapping-mode');
            layer.style.cursor = 'crosshair';
        }

        // Show table side panel
        const tablePanel = document.getElementById('table-side-panel');
        if (tablePanel) {
            tablePanel.classList.add('visible');
        }

        // Show table progress
        const tableProgress = document.getElementById('table-progress');
        if (tableProgress) {
            tableProgress.classList.add('visible');
        }

        // Dim the mapper panel while in table mode
        const mapperPanel = document.getElementById('mapper-panel');
        if (mapperPanel) {
            mapperPanel.classList.add('table-mode-dimmed');
        }
    }

    /**
     * Deactivate table mapping toolbar
     * - Reset all buttons to normal state
     */
    deactivateToolbar() {
        this.isActive = false;
        document.body.classList.remove('table-mode');

        // Remove highlight from table button
        const tableBtn = document.getElementById('btn-table-mapping-mode');
        if (tableBtn) {
            tableBtn.classList.remove('active');
        }

        // Reset mapping layer cursor and classes
        const layer = document.getElementById('mapping-layer');
        if (layer) {
            layer.classList.remove('table-mapping-mode');
            layer.style.cursor = '';
        }

        // Hide the step panel
        const panel = document.getElementById('table-side-panel');
        if (panel) {
            panel.classList.remove('visible');
            panel.innerHTML = '';
        }

        // Hide progress indicator
        const progress = document.getElementById('table-progress');
        if (progress) {
            progress.classList.remove('visible');
            progress.innerHTML = '';
        }

        // Restore mapper panel
        const mapperPanel = document.getElementById('mapper-panel');
        if (mapperPanel) {
            mapperPanel.classList.remove('table-mode-dimmed');
        }
    }

    /**
     * Show the step panel for a specific step
     * @param {number} step - Step number (1-6)
     */
    showStepPanel(step) {
        this.currentStep = step;

        // Step 6 (REVIEW) uses showSummary() instead - skip default panel creation
        if (step === TableSteps.REVIEW) {
            this._showVisualGuideForStep(step);
            return;
        }

        const panel = document.getElementById('table-side-panel');
        if (!panel) return;

        const config = STEP_CONFIG[step];
        if (!config) {
            panel.classList.remove('visible');
            return;
        }

        // Get "what to do now" instruction based on step
        const whatToDoNow = this._getWhatToDoNow(step);

        // Build panel content with enhanced instructions
        panel.innerHTML = `
            <div class="table-step-panel">
                <div class="step-header">
                    <span class="step-number">שלב ${step}</span>
                    <span class="step-title">${config.title}</span>
                </div>
                <div class="step-instruction">${config.instruction}</div>
                <div class="step-help">${config.helpText}</div>
                ${whatToDoNow ? `<div class="what-to-do-now"><span class="arrow-icon">👉</span> ${whatToDoNow}</div>` : ''}
                <div class="step-actions">
                    ${step > TableSteps.HEADER ? '<button id="table-back" class="btn-secondary">חזור</button>' : ''}
                    <button id="table-next" class="btn-primary" disabled>המשך</button>
                    <button id="table-cancel" class="btn-danger">ביטול</button>
                </div>
                ${step === TableSteps.ROW_COUNT ? this._renderRowCountInput() : ''}
                ${step === TableSteps.COLUMNS ? '<div id="column-list" class="column-list"></div>' : ''}
            </div>
        `;

        panel.classList.add('visible');

        // Bind event listeners
        this._bindPanelEvents();

        // Show visual guide help for this step
        this._showVisualGuideForStep(step);
    }

    /**
     * Get "what to do now" instruction for a step
     * @param {number} step - Step number
     * @returns {string} What to do instruction
     */
    _getWhatToDoNow(step) {
        const instructions = {
            [TableSteps.HEADER]: 'גרור מלבן על שורת הכותרת בתמונה משמאל',
            [TableSteps.SAMPLE_ROW]: 'גרור מלבן על שורת נתונים אחת מתחת לכותרת',
            [TableSteps.COLUMNS]: 'גרור מלבן על כל עמודה בנפרד והגדר שם',
            [TableSteps.ROW_COUNT]: 'הזן את מספר השורות בטבלה (ללא כותרת)',
            [TableSteps.GENERATE]: 'ממתין ליצירת הטבלה...',
            [TableSteps.REVIEW]: 'בדוק שכל התאים במקומם הנכון ולחץ שמור'
        };
        return instructions[step] || '';
    }

    /**
     * Show visual guide help for a specific step
     * @param {number} step - Step number
     */
    _showVisualGuideForStep(step) {
        if (!this.visualGuide) return;

        const stepHelpMap = {
            [TableSteps.HEADER]: 'table_header',
            [TableSteps.SAMPLE_ROW]: 'table_row',
            [TableSteps.COLUMNS]: 'table_column',
            [TableSteps.ROW_COUNT]: 'table_count',
            [TableSteps.GENERATE]: null,
            [TableSteps.REVIEW]: null
        };

        const helpStep = stepHelpMap[step];
        if (helpStep && this.visualGuide.isVisible()) {
            this.visualGuide.showHelp(helpStep);
        }
    }

    /**
     * Bind event listeners for panel buttons
     */
    _bindPanelEvents() {
        const nextBtn = document.getElementById('table-next');
        const backBtn = document.getElementById('table-back');
        const cancelBtn = document.getElementById('table-cancel');
        const rowCountInput = document.getElementById('row-count');

        console.log('[TableUI] _bindPanelEvents called:', {
            nextBtn: !!nextBtn,
            backBtn: !!backBtn,
            cancelBtn: !!cancelBtn,
            onNext: !!this.onNext,
            onBack: !!this.onBack,
            onCancel: !!this.onCancel
        });

        // Store reference to this for event handlers
        const self = this;

        if (nextBtn) {
            if (this.onNext) {
                // Remove any existing listeners and add new one
                const newNextBtn = nextBtn.cloneNode(true);
                nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
                newNextBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[TableUI] Next button clicked');
                    self.onNext();
                });
            } else {
                console.warn('[TableUI] onNext callback not set!');
            }
        }

        if (backBtn) {
            if (this.onBack) {
                const newBackBtn = backBtn.cloneNode(true);
                backBtn.parentNode.replaceChild(newBackBtn, backBtn);
                newBackBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[TableUI] Back button clicked');
                    self.onBack();
                });
            } else {
                console.warn('[TableUI] onBack callback not set!');
            }
        }

        if (cancelBtn) {
            if (this.onCancel) {
                const newCancelBtn = cancelBtn.cloneNode(true);
                cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
                newCancelBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[TableUI] Cancel button clicked');
                    self.onCancel();
                });
            } else {
                console.warn('[TableUI] onCancel callback not set!');
            }
        }

        if (rowCountInput && this.onRowCountChange) {
            rowCountInput.oninput = (e) => {
                const value = parseInt(e.target.value, 10);
                this.onRowCountChange(value);
            };
        }

        // Bind column buttons if column list exists
        this._bindColumnButtons();
    }

    /**
     * Render row count input field
     * @returns {string} HTML string for row count input
     */
    _renderRowCountInput() {
        return `
            <div class="row-count-input">
                <label for="row-count">מספר שורות:</label>
                <input type="number" id="row-count" min="1" max="100" value="" placeholder="הזן מספר">
            </div>
        `;
    }

    /**
     * Update the progress indicator
     * @param {number} step - Current step number
     */
    updateProgress(step) {
        const progressContainer = document.getElementById('table-progress');
        if (!progressContainer) return;

        const totalSteps = 6;
        let progressHTML = '<div class="progress-steps">';

        for (let i = 1; i <= totalSteps; i++) {
            let status = '';
            let icon = '';

            if (i < step) {
                status = 'completed';
                icon = '✓';
            } else if (i === step) {
                status = 'current';
                icon = i.toString();
            } else {
                status = 'pending';
                icon = i.toString();
            }

            progressHTML += `
                <div class="progress-step ${status}">
                    <span class="step-icon">${icon}</span>
                </div>
                ${i < totalSteps ? '<div class="progress-line"></div>' : ''}
            `;
        }

        progressHTML += '</div>';
        progressContainer.innerHTML = progressHTML;
    }

    /**
     * Lock the "Next" button (disable it)
     */
    lockNext() {
        const btn = document.getElementById('table-next');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('locked');
        }
    }

    /**
     * Unlock the "Next" button (enable it)
     */
    unlockNext() {
        const btn = document.getElementById('table-next');
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('locked');
        }
    }

    /**
     * Show a toast message
     * @param {string} type - Message type: 'info', 'success', 'error', 'warning'
     * @param {string} text - Message text
     */
    showMessage(type, text) {
        // Log to console for debugging
        console.log(`[Table ${type}] ${text}`);

        // Clear any existing toast timeout
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }

        // Get or create toast container
        let toast = document.getElementById('table-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'table-toast';
            toast.className = 'table-toast';
            document.body.appendChild(toast);
        }

        // Set toast content and type
        toast.textContent = text;
        toast.className = `table-toast ${type} visible`;

        // Auto-hide after 3 seconds
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('visible');
        }, 3000);
    }

    /**
     * Show the help overlay
     * @param {number} step - Step number for context-specific help
     */
    showHelp(step) {
        const config = STEP_CONFIG[step];
        if (!config) return;

        // Create help overlay
        let helpOverlay = document.getElementById('table-help-overlay');
        if (!helpOverlay) {
            helpOverlay = document.createElement('div');
            helpOverlay.id = 'table-help-overlay';
            helpOverlay.className = 'table-help-overlay';
            document.body.appendChild(helpOverlay);
        }

        helpOverlay.innerHTML = `
            <div class="help-content">
                <h3>${config.title}</h3>
                <p>${config.helpText}</p>
                <button id="help-close" class="btn-primary">הבנתי</button>
            </div>
        `;

        helpOverlay.classList.add('visible');

        // Close button handler
        const closeBtn = document.getElementById('help-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideHelp());
        }
    }

    /**
     * Hide the help overlay
     */
    hideHelp() {
        const helpOverlay = document.getElementById('table-help-overlay');
        if (helpOverlay) {
            helpOverlay.classList.remove('visible');
        }
    }

    /**
     * Update column list in sidebar
     * @param {Array} columns - Array of column objects
     */
    updateColumnList(columns) {
        const listContainer = document.getElementById('column-list');
        if (!listContainer) return;

        if (columns.length === 0) {
            listContainer.innerHTML = '<div class="no-columns">אין עמודות מוגדרות</div>';
            return;
        }

        let html = '';
        columns.forEach((col, index) => {
            html += `
                <div class="column-item" data-column-id="${col.columnId}">
                    <span class="column-index">${index + 1}</span>
                    <span class="column-name">${col.hebrewName || 'ללא שם'}</span>
                    <span class="column-type">${this._getTypeLabel(col.type)}</span>
                    <button class="column-edit" data-column-id="${col.columnId}" title="ערוך עמודה">✎</button>
                    <button class="column-remove" data-column-id="${col.columnId}" title="מחק עמודה">×</button>
                </div>
            `;
        });

        listContainer.innerHTML = html;

        // Bind column buttons after updating the list
        this._bindColumnButtons();
    }

    /**
     * Bind event handlers to column edit/delete buttons
     */
    _bindColumnButtons() {
        // Bind column delete buttons
        const deleteButtons = document.querySelectorAll('.column-remove');
        deleteButtons.forEach(btn => {
            btn.onclick = () => {
                const columnId = btn.dataset.columnId;
                if (columnId && this.onColumnDelete) {
                    this.onColumnDelete(columnId);
                }
            };
        });

        // Bind column edit buttons
        const editButtons = document.querySelectorAll('.column-edit');
        editButtons.forEach(btn => {
            btn.onclick = () => {
                const columnId = btn.dataset.columnId;
                if (columnId && this.onColumnEdit) {
                    this.onColumnEdit(columnId);
                }
            };
        });
    }

    /**
     * Get Hebrew label for column type
     * @param {string} type - Column type
     * @returns {string} Hebrew label
     */
    _getTypeLabel(type) {
        const labels = {
            'text': 'טקסט',
            'number': 'מספר',
            'date': 'תאריך',
            'checkbox': 'תיבת סימון'
        };
        return labels[type] || type;
    }

    /**
     * Prompt user for column details (name and type)
     * @param {string} defaultName - Default column name
     * @param {string} defaultType - Default column type
     * @returns {Promise<{name: string, type: string}>} Column details
     */
    promptColumnDetails(defaultName = '', defaultType = 'text') {
        return new Promise((resolve, reject) => {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'table-column-dialog-overlay';
            overlay.id = 'column-dialog-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'table-column-dialog';

            dialog.innerHTML = `
                <div class="dialog-header">
                    <h3>הגדרת עמודה</h3>
                </div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label for="column-name">שם העמודה:</label>
                        <input type="text" id="column-name" value="${defaultName}" placeholder="הזן שם עמודה" autofocus>
                    </div>
                    <div class="form-group">
                        <label for="column-type">סוג שדה:</label>
                        <select id="column-type">
                            <option value="text" ${defaultType === 'text' ? 'selected' : ''}>טקסט</option>
                            <option value="number" ${defaultType === 'number' ? 'selected' : ''}>מספר</option>
                            <option value="date" ${defaultType === 'date' ? 'selected' : ''}>תאריך</option>
                            <option value="checkbox" ${defaultType === 'checkbox' ? 'selected' : ''}>תיבת סימון</option>
                        </select>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button id="column-cancel" class="btn-secondary">ביטול</button>
                    <button id="column-confirm" class="btn-primary">אישור</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // Focus on the name input
            setTimeout(() => {
                const nameInput = document.getElementById('column-name');
                if (nameInput) {
                    nameInput.focus();
                    nameInput.select();
                }
            }, 50);

            // Handle confirm
            const confirmBtn = document.getElementById('column-confirm');
            const cancelBtn = document.getElementById('column-cancel');
            const nameInput = document.getElementById('column-name');
            const typeSelect = document.getElementById('column-type');

            const handleConfirm = () => {
                const name = nameInput.value.trim();
                const type = typeSelect.value;
                cleanup();
                resolve({ name, type });
            };

            const handleCancel = () => {
                cleanup();
                reject(new Error('cancelled'));
            };

            const cleanup = () => {
                overlay.remove();
                document.removeEventListener('keydown', handleKeydown);
            };

            const handleKeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                }
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            document.addEventListener('keydown', handleKeydown);

            // Click outside to cancel
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    handleCancel();
                }
            });
        });
    }

    /**
     * Show summary panel for review step with polished UI
     * @param {Object} tableData - Complete table data
     */
    showSummary(tableData) {
        console.log('[TableUI] showSummary called', { tableData });

        const panel = document.getElementById('table-side-panel');
        if (!panel) {
            console.error('[TableUI] table-side-panel not found!');
            return;
        }

        const summary = tableData.getSummary ? tableData.getSummary() : tableData;
        const columnsCount = summary.columnsCount || summary.columns?.length || 0;
        const rowCount = summary.rowCount || 0;
        const totalCells = columnsCount * rowCount;

        console.log('[TableUI] Summary:', summary);

        panel.innerHTML = `
            <div class="table-summary-panel table-wizard-complete">
                <div class="summary-header">
                    <div class="success-icon">✅</div>
                    <h3>הטבלה מוכנה!</h3>
                </div>
                <div class="summary-stats">
                    <div class="stat-item">
                        <div class="stat-value">${columnsCount}</div>
                        <div class="stat-label">עמודות</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${rowCount}</div>
                        <div class="stat-label">שורות</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${totalCells}</div>
                        <div class="stat-label">תאים</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">1</div>
                        <div class="stat-label">עמוד</div>
                    </div>
                </div>
                <div class="columns-preview">
                    <h4>רשימת עמודות:</h4>
                    <ul>
                        ${(summary.columns || []).map(col =>
                            `<li>${col.name || col.hebrewName} (${this._getTypeLabel(col.type)})</li>`
                        ).join('')}
                    </ul>
                </div>
                <div class="step-actions">
                    <button id="table-back" class="btn-secondary">← חזור</button>
                    <button id="table-next" class="btn-finish">✓ שמור טבלה</button>
                    <button id="table-cancel" class="btn-danger">ביטול</button>
                </div>
            </div>
        `;

        panel.classList.add('visible');

        // Bind event listeners for buttons
        this._bindPanelEvents();
    }
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.TableUIManager = TableUIManager;
}
