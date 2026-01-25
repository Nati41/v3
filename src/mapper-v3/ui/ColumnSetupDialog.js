/**
 * ColumnSetupDialog.js
 * V3.14: Dialog for setting up a table column before replication
 *
 * Shows when user maps a field inside a table region.
 * Allows naming the column and previewing replication.
 */

import { eventBus, Events } from '../core/EventBus.js';

class ColumnSetupDialog {
    constructor() {
        this.dialogEl = null;
        this._initialized = false;
        this._resolvePromise = null;
        this._rejectPromise = null;
    }

    /**
     * Initialize the dialog
     */
    init() {
        if (this._initialized) return;

        this._createDialog();
        this._attachEventListeners();
        this._initialized = true;
        console.log('[ColumnSetupDialog] Initialized');
    }

    /**
     * Create dialog HTML
     */
    _createDialog() {
        this.dialogEl = document.createElement('div');
        this.dialogEl.id = 'column-setup-dialog';
        this.dialogEl.className = 'dialog-overlay hidden';
        this.dialogEl.innerHTML = `
            <div class="dialog-box column-setup-dialog" dir="rtl">
                <div class="dialog-header">
                    <span class="dialog-icon">📝</span>
                    <h3>עמודה חדשה בטבלה</h3>
                    <span class="table-name-badge" id="column-table-name"></span>
                </div>

                <div class="dialog-body">
                    <div class="form-group">
                        <label for="column-name-input">שם העמודה:</label>
                        <input type="text"
                               id="column-name-input"
                               class="column-name-input"
                               placeholder="לדוגמא: שם פרטי, תעודת זהות..."
                               autocomplete="off">
                    </div>

                    <div class="form-group">
                        <label for="column-type-select">סוג שדה:</label>
                        <select id="column-type-select" class="column-type-select">
                            <option value="text">📝 טקסט</option>
                            <option value="number">🔢 מספר</option>
                            <option value="date">📅 תאריך</option>
                            <option value="checkbox">☑️ תיבת סימון</option>
                            <option value="signature">✍️ חתימה</option>
                        </select>
                    </div>

                    <div class="replication-preview">
                        <label>תצוגה מקדימה:</label>
                        <div class="preview-list" id="column-preview-list">
                            <!-- Generated rows will appear here -->
                        </div>
                    </div>
                </div>

                <div class="dialog-footer">
                    <button id="column-setup-cancel" class="btn-secondary">ביטול</button>
                    <button id="column-setup-confirm" class="btn-primary">צור עמודה</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.dialogEl);
    }

    /**
     * Attach event listeners
     */
    _attachEventListeners() {
        // Cancel button
        this.dialogEl.querySelector('#column-setup-cancel').addEventListener('click', () => {
            this._cancel();
        });

        // Confirm button
        this.dialogEl.querySelector('#column-setup-confirm').addEventListener('click', () => {
            this._confirm();
        });

        // Close on overlay click
        this.dialogEl.addEventListener('click', (e) => {
            if (e.target === this.dialogEl) {
                this._cancel();
            }
        });

        // Enter key to confirm
        this.dialogEl.querySelector('#column-name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._confirm();
            } else if (e.key === 'Escape') {
                this._cancel();
            }
        });

        // Update preview when name changes
        this.dialogEl.querySelector('#column-name-input').addEventListener('input', () => {
            this._updatePreview();
        });
    }

    /**
     * Show the dialog
     * @param {Object} options - Configuration options
     * @param {string} options.tableName - Name of the table
     * @param {number} options.rowCount - Number of rows in the table
     * @param {string} options.suggestedName - Suggested column name (optional)
     * @param {string} options.suggestedType - Suggested field type (optional)
     * @returns {Promise<Object|null>} Resolves with { name_he, name_en, type } or null if cancelled
     */
    show(options = {}) {
        if (!this._initialized) {
            this.init();
        }

        const {
            tableName = 'טבלה',
            rowCount = 5,
            suggestedName = '',
            suggestedType = 'text'
        } = options;

        // Store row count for preview
        this._rowCount = rowCount;

        // Set values
        const nameInput = this.dialogEl.querySelector('#column-name-input');
        const typeSelect = this.dialogEl.querySelector('#column-type-select');
        const tableNameBadge = this.dialogEl.querySelector('#column-table-name');

        nameInput.value = suggestedName;
        typeSelect.value = suggestedType;
        tableNameBadge.textContent = tableName;

        // Update preview
        this._updatePreview();

        // Show dialog
        this.dialogEl.classList.remove('hidden');

        // Focus on name input
        setTimeout(() => {
            nameInput.focus();
            if (suggestedName) {
                nameInput.select();
            }
        }, 100);

        // Return promise
        return new Promise((resolve, reject) => {
            this._resolvePromise = resolve;
            this._rejectPromise = reject;
        });
    }

    /**
     * Update the replication preview
     */
    _updatePreview() {
        const nameInput = this.dialogEl.querySelector('#column-name-input');
        const previewList = this.dialogEl.querySelector('#column-preview-list');
        const columnName = nameInput.value.trim() || 'עמודה';

        let html = '';
        const maxPreview = Math.min(this._rowCount, 5);

        for (let i = 0; i < maxPreview; i++) {
            const rowNum = i + 1;
            html += `
                <div class="preview-row">
                    <span class="preview-row-num">שורה ${rowNum}:</span>
                    <span class="preview-row-value">${columnName}</span>
                </div>
            `;
        }

        if (this._rowCount > 5) {
            html += `
                <div class="preview-row more">
                    <span class="preview-row-dots">...</span>
                    <span class="preview-row-total">(סה"כ ${this._rowCount} שורות)</span>
                </div>
            `;
        }

        previewList.innerHTML = html;
    }

    /**
     * Hide the dialog
     */
    hide() {
        this.dialogEl.classList.add('hidden');
    }

    /**
     * Confirm and return data
     */
    _confirm() {
        const nameInput = this.dialogEl.querySelector('#column-name-input');
        const typeSelect = this.dialogEl.querySelector('#column-type-select');

        const name_he = nameInput.value.trim();
        const type = typeSelect.value;

        // Validate
        if (!name_he) {
            nameInput.classList.add('invalid');
            nameInput.focus();
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'נא להזין שם לעמודה',
                type: 'warning'
            });
            return;
        }

        nameInput.classList.remove('invalid');

        this.hide();

        if (this._resolvePromise) {
            this._resolvePromise({
                name_he,
                name_en: this._hebrewToEnglish(name_he),
                type
            });
            this._resolvePromise = null;
        }
    }

    /**
     * Cancel and return null
     */
    _cancel() {
        this.hide();

        if (this._resolvePromise) {
            this._resolvePromise(null);
            this._resolvePromise = null;
        }
    }

    /**
     * Convert Hebrew name to English ID
     * @param {string} hebrew
     * @returns {string}
     */
    _hebrewToEnglish(hebrew) {
        const translations = {
            'שם פרטי': 'first_name',
            'שם משפחה': 'last_name',
            'שם': 'name',
            'תעודת זהות': 'id_number',
            'ת.ז.': 'id_number',
            'תאריך לידה': 'birth_date',
            'ת.לידה': 'birth_date',
            'כתובת': 'address',
            'טלפון': 'phone',
            'סכום': 'amount',
            'תאריך': 'date',
            'הערות': 'notes',
            'סטטוס': 'status',
            'מקצוע': 'occupation',
            'מעסיק': 'employer'
        };

        const lower = hebrew.toLowerCase();
        if (translations[lower] || translations[hebrew]) {
            return translations[lower] || translations[hebrew];
        }

        // Simple cleanup
        return hebrew
            .replace(/[\u0590-\u05FF]/g, '') // Remove Hebrew
            .replace(/\s+/g, '_')
            .toLowerCase() || `column_${Date.now()}`;
    }
}

// Singleton export
export const columnSetupDialog = new ColumnSetupDialog();

// Expose to window for debugging
if (typeof window !== 'undefined') {
    window.columnSetupDialog = columnSetupDialog;
}
