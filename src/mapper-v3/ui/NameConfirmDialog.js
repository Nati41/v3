/**
 * NameConfirmDialog - Confirmation dialog for field name capture
 *
 * Shows extracted Hebrew name and generated English ID
 * Allows editing both before confirmation
 * V3: Adds canonical field selection, context, and format hints
 */
import { eventBus, Events } from '../core/EventBus.js';
import { enhanceDialog, addDialogStyles } from './DialogUtils.js';
import { canonicalSelector, CONTEXT_OPTIONS, CANONICAL_GROUPS, FORMAT_HINTS } from '../helpers/CanonicalSelector.js';

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

                <!-- Semantic Fields (V3) -->
                <div class="semantic-section">
                    <div class="semantic-header">הגדרות סמנטיות</div>

                    <div class="form-group">
                        <label for="dialog-canonical">שדה קנוני <span class="required-asterisk">*</span></label>
                        <div class="canonical-wrapper">
                            <select id="dialog-canonical" class="dialog-select">
                                <option value="">-- בחר שדה --</option>
                            </select>
                            <div class="canonical-suggestions" id="canonical-suggestions" style="display:none;"></div>
                        </div>
                        <span class="field-hint canonical-hint" id="canonical-hint"></span>
                    </div>

                    <div class="form-row">
                        <div class="form-group half">
                            <label for="dialog-context">הקשר</label>
                            <select id="dialog-context" class="dialog-select">
                                <option value="">-- אוטומטי --</option>
                                <option value="employee">עובד</option>
                                <option value="employer">מעסיק</option>
                                <option value="spouse">בן/בת זוג</option>
                                <option value="company">חברה</option>
                                <option value="bank">בנק</option>
                            </select>
                        </div>
                        <div class="form-group half">
                            <label for="dialog-format">פורמט</label>
                            <input type="text" id="dialog-format" class="dialog-input" dir="ltr" placeholder="אוטומטי" readonly>
                        </div>
                    </div>
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

        // Add semantic styles
        this._addSemanticStyles();

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

            // Auto-suggest canonical based on Hebrew text
            this._suggestCanonical(hebrewInput.value);
        });

        // Setup semantic field listeners
        this._setupSemanticListeners();
    }

    /**
     * Setup listeners for semantic fields
     */
    _setupSemanticListeners() {
        const canonicalSelect = this.dialog.querySelector('#dialog-canonical');
        const contextSelect = this.dialog.querySelector('#dialog-context');
        const formatInput = this.dialog.querySelector('#dialog-format');
        const typeSelect = this.dialog.querySelector('#dialog-field-type');
        const canonicalHint = this.dialog.querySelector('#canonical-hint');

        // When canonical changes, auto-fill context and format
        canonicalSelect.addEventListener('change', () => {
            const canonical = canonicalSelect.value;

            if (canonical) {
                // Auto-suggest context
                const suggestedContext = canonicalSelector.suggestContext(canonical);
                if (suggestedContext && !contextSelect.value) {
                    contextSelect.value = suggestedContext;
                }

                // Auto-fill format
                const formatHint = canonicalSelector.getFormatHint(canonical);
                if (formatHint) {
                    formatInput.value = formatHint.format || '';
                    formatInput.placeholder = formatHint.placeholder || 'אוטומטי';
                } else {
                    formatInput.value = '';
                    formatInput.placeholder = 'אוטומטי';
                }

                // Auto-detect field type
                const detectedType = canonicalSelector.detectFieldType(canonical);
                if (detectedType && detectedType !== 'text') {
                    typeSelect.value = detectedType;
                }

                // Show hint
                const label = canonicalSelector.getCanonicalLabel(canonical);
                canonicalHint.textContent = `${label} → ${canonical}`;
                canonicalHint.style.display = 'block';
            } else {
                formatInput.value = '';
                formatInput.placeholder = 'אוטומטי';
                canonicalHint.style.display = 'none';
            }
        });
    }

    /**
     * Suggest canonical fields based on Hebrew text
     * Uses threshold of 50 for auto-selection (lowered from 60 in V3.1)
     */
    _suggestCanonical(hebrewText) {
        const canonicalSelect = this.dialog.querySelector('#dialog-canonical');
        const suggestions = canonicalSelector.suggestCanonical(hebrewText, 3);

        if (suggestions.length > 0 && suggestions[0].score >= 50) {
            // Auto-select if medium-high confidence match (threshold: 50)
            canonicalSelect.value = suggestions[0].canonical;
            canonicalSelect.dispatchEvent(new Event('change'));
            console.log(`[NameConfirmDialog] Auto-suggested canonical: "${hebrewText}" → ${suggestions[0].canonical} (score: ${suggestions[0].score})`);
        } else if (suggestions.length > 0) {
            console.log(`[NameConfirmDialog] Low confidence suggestions for "${hebrewText}":`, suggestions);
        }
    }

    /**
     * Populate canonical dropdown with grouped options
     */
    _populateCanonicalDropdown() {
        const canonicalSelect = this.dialog.querySelector('#dialog-canonical');
        canonicalSelect.innerHTML = '<option value="">-- בחר שדה --</option>';

        const groups = canonicalSelector.getGroupedOptions();

        for (const group of groups) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = group.label_he;

            for (const option of group.options) {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                optgroup.appendChild(opt);
            }

            canonicalSelect.appendChild(optgroup);
        }
    }

    /**
     * Add semantic section styles
     */
    _addSemanticStyles() {
        if (document.getElementById('semantic-dialog-styles')) return;

        const style = document.createElement('style');
        style.id = 'semantic-dialog-styles';
        style.textContent = `
            .semantic-section {
                margin-top: 16px;
                padding-top: 16px;
                border-top: 1px solid #e5e7eb;
            }
            .semantic-header {
                font-size: 12px;
                font-weight: 600;
                color: #6b7280;
                margin-bottom: 12px;
                text-transform: uppercase;
            }
            .form-row {
                display: flex;
                gap: 12px;
            }
            .form-group.half {
                flex: 1;
            }
            .canonical-wrapper {
                position: relative;
            }
            .canonical-suggestions {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: white;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                z-index: 1000;
                max-height: 200px;
                overflow-y: auto;
            }
            .canonical-suggestion {
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .canonical-suggestion:hover {
                background: #f3f4f6;
            }
            .canonical-suggestion .canonical-name {
                font-weight: 500;
            }
            .canonical-suggestion .canonical-match {
                font-size: 11px;
                color: #6b7280;
            }
            .canonical-hint {
                display: none;
                color: #059669;
                font-size: 11px;
                margin-top: 4px;
            }
            #dialog-format {
                background: #f9fafb;
                color: #6b7280;
            }
            .required-asterisk {
                color: #dc2626;
                font-weight: bold;
            }
            #dialog-canonical.invalid {
                border-color: #dc2626;
                background-color: #fef2f2;
            }
            .validation-error {
                color: #dc2626;
                font-size: 12px;
                margin-top: 4px;
                display: none;
            }
            .validation-error.show {
                display: block;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show the dialog with initial values
     * @param {Object} options - Dialog options
     * @param {string} options.hebrewName - Initial Hebrew name
     * @param {string} options.englishName - Initial English name
     * @param {string} options.source - Extraction source ('pdf' or 'ocr')
     * @param {string} options.fieldType - Field type (default: 'text')
     * @param {string} options.canonical - Pre-selected canonical (optional)
     * @param {string} options.context - Pre-selected context (optional)
     * @returns {Promise<Object|null>} Resolved with field data or null if cancelled
     */
    show({ hebrewName = '', englishName = '', source = '', fieldType = 'text', canonical = '', context = '' } = {}) {
        return new Promise((resolve) => {
            // Set initial values
            const hebrewInput = this.dialog.querySelector('#dialog-hebrew-name');
            const englishInput = this.dialog.querySelector('#dialog-english-name');
            const sourceSpan = this.dialog.querySelector('#dialog-source');
            const typeSelect = this.dialog.querySelector('#dialog-field-type');

            // Semantic fields
            const canonicalSelect = this.dialog.querySelector('#dialog-canonical');
            const contextSelect = this.dialog.querySelector('#dialog-context');
            const formatInput = this.dialog.querySelector('#dialog-format');
            const canonicalHint = this.dialog.querySelector('#canonical-hint');

            hebrewInput.value = hebrewName;
            englishInput.value = englishName;
            typeSelect.value = fieldType;

            // Populate canonical dropdown
            this._populateCanonicalDropdown();

            // Reset semantic fields
            canonicalSelect.value = canonical || '';
            contextSelect.value = context || '';
            formatInput.value = '';
            formatInput.placeholder = 'אוטומטי';
            canonicalHint.style.display = 'none';

            // Auto-suggest canonical if Hebrew name provided
            if (hebrewName && !canonical) {
                this._suggestCanonical(hebrewName);
            } else if (canonical) {
                // Trigger change to update format/context
                canonicalSelect.dispatchEvent(new Event('change'));
            }

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

        // Semantic fields
        const canonicalSelect = this.dialog.querySelector('#dialog-canonical');
        const contextSelect = this.dialog.querySelector('#dialog-context');
        const formatInput = this.dialog.querySelector('#dialog-format');

        const hebrewName = hebrewInput.value.trim();
        const englishName = englishInput.value.trim();
        const fieldType = typeSelect.value;

        // Semantic values
        const canonical = canonicalSelect.value || null;
        const context = contextSelect.value || null;
        const format = formatInput.value || null;

        // Detect category from canonical if applicable
        const category = canonical ? canonicalSelector.getCategoryForCanonical(canonical) : null;

        // Validate - require name
        if (!hebrewName && !englishName) {
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'יש להזין לפחות שם אחד',
                type: 'warning'
            });
            return;
        }

        // Validate - REQUIRE canonical (V3.1)
        if (!canonical) {
            canonicalSelect.classList.add('invalid');
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'חובה לבחור שדה קנוני',
                type: 'error'
            });
            console.warn(`[NameConfirmDialog] ⚠️ Blocked: canonical is required for "${hebrewName}"`);
            return;
        }
        canonicalSelect.classList.remove('invalid');

        // Ensure context is always set - use suggestContext or detectFromLabel, fallback to 'employee'
        let finalContext = context;
        if (!finalContext && canonical) {
            finalContext = canonicalSelector.suggestContext(canonical);
        }
        if (!finalContext) {
            finalContext = canonicalSelector.detectContextFromLabel(hebrewName);
        }
        if (!finalContext) {
            finalContext = 'employee';  // Ultimate fallback
        }

        // Save callback before hiding (hide clears callbacks)
        const callback = this.onConfirmCallback;
        const data = {
            label_he: hebrewName,
            label_en: englishName || hebrewName,
            type: fieldType,
            // Semantic fields (V3.1 - canonical REQUIRED, context ALWAYS set)
            canonical: canonical,
            context: finalContext,
            category: category,
            format: format
        };

        console.log(`[NameConfirmDialog] ✅ Confirmed field: "${hebrewName}" → canonical=${canonical}, context=${finalContext}`);

        // Close dialog
        this._hide();

        // Call callback with data
        if (callback) {
            console.log('[NameConfirmDialog] Calling callback with:', data);
            callback(data);
        }

        console.log('[NameConfirmDialog] Confirmed:', { hebrewName, englishName, fieldType, canonical, context });
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
