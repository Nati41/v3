/**
 * NameConfirmDialog - Confirmation dialog for field name capture
 *
 * Shows extracted Hebrew name and generated English ID
 * Allows editing both before confirmation
 */
import { eventBus, Events } from '../core/EventBus.js';
import { enhanceDialog, addDialogStyles } from './DialogUtils.js';

export class NameConfirmDialog {
    constructor() {
        this.dialog = null;
        this.overlay = null;
        this.onConfirmCallback = null;
        this.onCancelCallback = null;
        this.isOpen = false;
    }

    /**
     * Initialize the dialog (create DOM elements)
     */
    init() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'name-dialog-overlay';
        this.overlay.style.display = 'none';

        // Create dialog container
        this.dialog = document.createElement('div');
        this.dialog.className = 'name-confirm-dialog';
        this.dialog.innerHTML = `
            <div class="dialog-header">
                <h3>אישור שם שדה</h3>
                <button class="dialog-close" title="סגור">&times;</button>
            </div>
            <div class="dialog-body">
                <div class="form-group">
                    <label for="dialog-hebrew-name">שם עברי</label>
                    <input type="text" id="dialog-hebrew-name" class="dialog-input" dir="rtl" placeholder="שם השדה בעברית">
                </div>
                <div class="form-group">
                    <label for="dialog-english-name">מזהה אנגלי (Field ID)</label>
                    <input type="text" id="dialog-english-name" class="dialog-input" dir="ltr" placeholder="field_id">
                    <span class="field-hint">משמש לזיהוי השדה ב-LiveFill</span>
                </div>
                <div class="form-group">
                    <label for="dialog-field-type">סוג שדה</label>
                    <select id="dialog-field-type" class="dialog-select">
                        <option value="text">טקסט</option>
                        <option value="number">מספר</option>
                        <option value="date">תאריך</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="radio">Radio</option>
                        <option value="signature">חתימה</option>
                    </select>
                </div>
                <div class="extraction-info">
                    <span class="info-label">מקור:</span>
                    <span class="info-value" id="dialog-source">-</span>
                </div>
            </div>
            <div class="dialog-footer">
                <button class="btn-cancel">ביטול</button>
                <button class="btn-confirm">אישור</button>
            </div>
        `;

        // Add to DOM
        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);

        // Setup event listeners
        this._setupListeners();

        // Add drag and minimize functionality
        addDialogStyles();
        this._dialogEnhancer = enhanceDialog(this.dialog);

        console.log('[NameConfirmDialog] Initialized');
    }

    /**
     * Setup dialog event listeners
     */
    _setupListeners() {
        // Close button
        const closeBtn = this.dialog.querySelector('.dialog-close');
        closeBtn.addEventListener('click', () => this.cancel());

        // Cancel button
        const cancelBtn = this.dialog.querySelector('.btn-cancel');
        cancelBtn.addEventListener('click', () => this.cancel());

        // Confirm button
        const confirmBtn = this.dialog.querySelector('.btn-confirm');
        confirmBtn.addEventListener('click', () => this.confirm());

        // Overlay click to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.cancel();
            }
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.cancel();
            }
        });

        // Enter key to confirm
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.isOpen) {
                // Don't confirm if in a textarea
                if (e.target.tagName !== 'TEXTAREA') {
                    this.confirm();
                }
            }
        });

        // Auto-generate English ID when Hebrew changes (if not manually edited)
        const hebrewInput = this.dialog.querySelector('#dialog-hebrew-name');
        const englishInput = this.dialog.querySelector('#dialog-english-name');
        let englishManuallyEdited = false;

        englishInput.addEventListener('input', () => {
            englishManuallyEdited = true;
        });

        hebrewInput.addEventListener('input', () => {
            if (!englishManuallyEdited) {
                // Import dynamically to avoid circular dependency
                import('../engines/FieldNamer.js').then(({ fieldNamer }) => {
                    englishInput.value = fieldNamer.hebrewToEnglish(hebrewInput.value);
                });
            }
        });
    }

    /**
     * Show the dialog with initial values
     * @param {Object} options - Dialog options
     * @param {string} options.hebrewName - Initial Hebrew name
     * @param {string} options.englishName - Initial English name
     * @param {string} options.source - Extraction source ('pdf' or 'ocr')
     * @param {string} options.fieldType - Field type (default: 'text')
     * @returns {Promise<Object|null>} Resolved with field data or null if cancelled
     */
    show({ hebrewName = '', englishName = '', source = '', fieldType = 'text' } = {}) {
        return new Promise((resolve) => {
            // Set initial values
            const hebrewInput = this.dialog.querySelector('#dialog-hebrew-name');
            const englishInput = this.dialog.querySelector('#dialog-english-name');
            const sourceSpan = this.dialog.querySelector('#dialog-source');
            const typeSelect = this.dialog.querySelector('#dialog-field-type');

            hebrewInput.value = hebrewName;
            englishInput.value = englishName;
            typeSelect.value = fieldType;

            // Show source info
            const sourceLabels = {
                'pdf': 'PDF (טקסט מובנה)',
                'ocr': 'OCR (זיהוי תווים)',
                'none': 'לא זוהה'
            };
            sourceSpan.textContent = sourceLabels[source] || source || '-';

            // Setup callbacks
            this.onConfirmCallback = (data) => {
                resolve(data);
            };
            this.onCancelCallback = () => {
                resolve(null);
            };

            // Show dialog
            this.overlay.style.display = 'flex';
            this.isOpen = true;

            // Focus Hebrew input
            setTimeout(() => {
                hebrewInput.focus();
                hebrewInput.select();
            }, 100);

            eventBus.emit(Events.TOAST_SHOW, {
                message: 'ערוך את פרטי השדה ולחץ אישור',
                type: 'info'
            });
        });
    }

    /**
     * Confirm and close dialog
     */
    confirm() {
        if (!this.isOpen) return;

        const hebrewInput = this.dialog.querySelector('#dialog-hebrew-name');
        const englishInput = this.dialog.querySelector('#dialog-english-name');
        const typeSelect = this.dialog.querySelector('#dialog-field-type');

        const hebrewName = hebrewInput.value.trim();
        const englishName = englishInput.value.trim();
        const fieldType = typeSelect.value;

        // Validate
        if (!hebrewName && !englishName) {
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'יש להזין לפחות שם אחד',
                type: 'warning'
            });
            return;
        }

        // Save callback before hiding (hide clears callbacks)
        const callback = this.onConfirmCallback;
        const data = {
            label_he: hebrewName,
            label_en: englishName || hebrewName,
            type: fieldType
        };

        // Close dialog
        this._hide();

        // Call callback with data
        if (callback) {
            console.log('[NameConfirmDialog] Calling callback with:', data);
            callback(data);
        }

        console.log('[NameConfirmDialog] Confirmed:', { hebrewName, englishName, fieldType });
    }

    /**
     * Cancel and close dialog
     */
    cancel() {
        if (!this.isOpen) return;

        this._hide();

        if (this.onCancelCallback) {
            this.onCancelCallback();
        }

        console.log('[NameConfirmDialog] Cancelled');
    }

    /**
     * Hide the dialog
     */
    _hide() {
        this.overlay.style.display = 'none';
        this.isOpen = false;
        this.onConfirmCallback = null;
        this.onCancelCallback = null;
    }

    /**
     * Check if dialog is currently open
     * @returns {boolean}
     */
    isDialogOpen() {
        return this.isOpen;
    }
}

// Singleton instance
export const nameConfirmDialog = new NameConfirmDialog();
