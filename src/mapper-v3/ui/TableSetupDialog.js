/**
 * TableSetupDialog.js
 * V3.14: Dialog for setting up a new table (name + row count)
 *
 * Shows after user draws a table rectangle.
 * Replaces the inline row count input with a proper dialog.
 */

import { eventBus, Events } from '../core/EventBus.js';

class TableSetupDialog {
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
        console.log('[TableSetupDialog] Initialized');
    }

    /**
     * Create dialog HTML
     */
    _createDialog() {
        this.dialogEl = document.createElement('div');
        this.dialogEl.id = 'table-setup-dialog';
        this.dialogEl.className = 'dialog-overlay hidden';
        this.dialogEl.innerHTML = `
            <div class="dialog-box table-setup-dialog" dir="rtl">
                <div class="dialog-header">
                    <span class="dialog-icon">📊</span>
                    <h3>הגדרת טבלה חדשה</h3>
                </div>

                <div class="dialog-body">
                    <div class="form-group">
                        <label for="table-name-input">שם הטבלה:</label>
                        <input type="text"
                               id="table-name-input"
                               class="table-name-input"
                               placeholder="לדוגמא: ילדים, הכנסות נוספות..."
                               autocomplete="off">
                        <span class="input-hint">השם יופיע בסיידבר ובייצוא</span>
                    </div>

                    <div class="form-group">
                        <label for="table-row-count">מספר שורות (לא כולל כותרת):</label>
                        <div class="count-control">
                            <button type="button" class="count-btn minus" data-delta="-1">−</button>
                            <input type="number"
                                   id="table-row-count"
                                   value="5"
                                   min="1"
                                   max="50">
                            <button type="button" class="count-btn plus" data-delta="1">+</button>
                        </div>
                    </div>

                    <div class="detected-columns" id="detected-columns-section" style="display: none;">
                        <label>עמודות שזוהו:</label>
                        <div class="columns-preview" id="columns-preview"></div>
                    </div>
                </div>

                <div class="dialog-footer">
                    <button id="table-setup-cancel" class="btn-secondary">ביטול</button>
                    <button id="table-setup-confirm" class="btn-primary">צור טבלה</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.dialogEl);
    }

    /**
     * Attach event listeners
     */
    _attachEventListeners() {
        // Count buttons
        this.dialogEl.querySelectorAll('.count-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = this.dialogEl.querySelector('#table-row-count');
                const delta = parseInt(btn.dataset.delta);
                const newValue = Math.max(1, Math.min(50, parseInt(input.value) + delta));
                input.value = newValue;
            });
        });

        // Cancel button
        this.dialogEl.querySelector('#table-setup-cancel').addEventListener('click', () => {
            this._cancel();
        });

        // Confirm button
        this.dialogEl.querySelector('#table-setup-confirm').addEventListener('click', () => {
            this._confirm();
        });

        // Close on overlay click
        this.dialogEl.addEventListener('click', (e) => {
            if (e.target === this.dialogEl) {
                this._cancel();
            }
        });

        // Enter key to confirm
        this.dialogEl.querySelector('#table-name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._confirm();
            } else if (e.key === 'Escape') {
                this._cancel();
            }
        });

        this.dialogEl.querySelector('#table-row-count').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._confirm();
            } else if (e.key === 'Escape') {
                this._cancel();
            }
        });
    }

    /**
     * Show the dialog
     * @param {Object} options - Configuration options
     * @param {Array} options.detectedColumns - Columns detected in the region
     * @param {string} options.suggestedName - Suggested table name (optional)
     * @param {number} options.defaultRowCount - Default row count (optional)
     * @returns {Promise<Object|null>} Resolves with { name_he, rowCount } or null if cancelled
     */
    show(options = {}) {
        if (!this._initialized) {
            this.init();
        }

        const {
            detectedColumns = [],
            suggestedName = '',
            defaultRowCount = 5
        } = options;

        // Reset form
        const nameInput = this.dialogEl.querySelector('#table-name-input');
        const rowCountInput = this.dialogEl.querySelector('#table-row-count');
        const columnsSection = this.dialogEl.querySelector('#detected-columns-section');
        const columnsPreview = this.dialogEl.querySelector('#columns-preview');

        nameInput.value = suggestedName;
        rowCountInput.value = defaultRowCount;

        // Show detected columns if any
        if (detectedColumns.length > 0) {
            columnsSection.style.display = 'block';
            columnsPreview.innerHTML = detectedColumns.map(col => `
                <span class="column-tag">
                    <span class="column-tag-icon">${this._getTypeIcon(col.type)}</span>
                    <span class="column-tag-name">${col.name_he || col.name_en || 'עמודה'}</span>
                </span>
            `).join('');
        } else {
            columnsSection.style.display = 'none';
        }

        // Show dialog
        this.dialogEl.classList.remove('hidden');

        // Focus on name input
        setTimeout(() => nameInput.focus(), 100);

        // Return promise
        return new Promise((resolve, reject) => {
            this._resolvePromise = resolve;
            this._rejectPromise = reject;
        });
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
        const nameInput = this.dialogEl.querySelector('#table-name-input');
        const rowCountInput = this.dialogEl.querySelector('#table-row-count');

        const name_he = nameInput.value.trim();
        const rowCount = parseInt(rowCountInput.value) || 5;

        // Validate
        if (!name_he) {
            nameInput.classList.add('invalid');
            nameInput.focus();
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'נא להזין שם לטבלה',
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
                rowCount
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
            'ילדים': 'children',
            'ילד': 'child',
            'הכנסות': 'income',
            'הכנסות נוספות': 'other_income',
            'הוצאות': 'expenses',
            'עובדים': 'employees',
            'שינויים': 'changes',
            'פריטים': 'items',
            'שורות': 'rows',
            'נכסים': 'assets',
            'חובות': 'debts',
            'תשלומים': 'payments'
        };

        const lower = hebrew.toLowerCase();
        if (translations[lower]) {
            return translations[lower];
        }

        // Simple transliteration
        return hebrew
            .replace(/[\u0590-\u05FF]/g, '') // Remove Hebrew
            .replace(/\s+/g, '_')
            .toLowerCase() || `table_${Date.now()}`;
    }

    /**
     * Get icon for field type
     * @param {string} type
     * @returns {string}
     */
    _getTypeIcon(type) {
        const icons = {
            'text': '📝',
            'number': '🔢',
            'date': '📅',
            'checkbox': '☑️',
            'radio': '🔘',
            'signature': '✍️'
        };
        return icons[type] || '📝';
    }
}

// Singleton export
export const tableSetupDialog = new TableSetupDialog();

// Expose to window for debugging
if (typeof window !== 'undefined') {
    window.tableSetupDialog = tableSetupDialog;
}
