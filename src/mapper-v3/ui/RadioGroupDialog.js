/**
 * RadioGroupDialog - Summary/edit dialog for radio group creation
 *
 * Shows detected labels in an editable table
 * Allows user to edit/correct labels before creating the group
 * V3: Adds category selector for semantic matching
 */
import { eventBus, Events } from '../core/EventBus.js';
import { fieldNamer } from '../engines/FieldNamer.js';
import { enhanceDialog, addDialogStyles } from './DialogUtils.js';
import { CATEGORY_OPTIONS } from '../helpers/CanonicalSelector.js';

export class RadioGroupDialog {
    constructor() {
        this.dialog = null;
        this.overlay = null;
        this.onConfirmCallback = null;
        this.onCancelCallback = null;
        this.isOpen = false;
        this.currentLabels = [];
        this.currentGroupName = '';
    }

    /**
     * Initialize the dialog (create DOM elements)
     */
    init() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'radio-dialog-overlay';
        this.overlay.style.display = 'none';

        // Create dialog container
        this.dialog = document.createElement('div');
        this.dialog.className = 'radio-group-dialog';
        this.dialog.innerHTML = `
            <div class="dialog-header">
                <h3>אישור קבוצת רדיו</h3>
                <button class="dialog-close" title="סגור">&times;</button>
            </div>
            <div class="dialog-body">
                <div class="form-row">
                    <div class="form-group group-name-field">
                        <label for="radio-group-name">שם הקבוצה</label>
                        <input type="text" id="radio-group-name" class="dialog-input" dir="rtl" placeholder="שם קבוצת הרדיו">
                    </div>
                    <div class="form-group category-field">
                        <label for="radio-group-category">קטגוריה <span class="required-asterisk">*</span></label>
                        <select id="radio-group-category" class="dialog-select">
                            <option value="">-- בחר קטגוריה --</option>
                            <option value="gender">מין</option>
                            <option value="marital_status">מצב משפחתי</option>
                            <option value="income_type">סוג הכנסה</option>
                            <option value="health_fund">קופת חולים</option>
                            <option value="resident_status">תושבות</option>
                        </select>
                    </div>
                    <div class="form-group context-field">
                        <label for="radio-group-context">הקשר</label>
                        <select id="radio-group-context" class="dialog-select">
                            <option value="employee">עובד</option>
                            <option value="employer">מעסיק</option>
                            <option value="spouse">בן/בת זוג</option>
                        </select>
                    </div>
                </div>
                <div class="canonical-preview" id="canonical-preview" style="display:none;">
                    <span class="preview-label">Canonical:</span>
                    <code id="group-canonical-value"></code>
                </div>
                <div class="form-group">
                    <label>אפשרויות (ניתן לערוך)</label>
                    <table class="labels-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>תווית עברית</th>
                                <th>מזהה אנגלי</th>
                                <th>מקור</th>
                                <th>סמן</th>
                            </tr>
                        </thead>
                        <tbody id="labels-tbody">
                        </tbody>
                    </table>
                </div>
                <div class="detection-info">
                    <span class="info-icon">ℹ️</span>
                    <span>התוויות זוהו אוטומטית. ערוך לפי הצורך ולחץ אישור.</span>
                </div>
            </div>
            <div class="dialog-footer">
                <button class="btn-cancel">ביטול</button>
                <button class="btn-confirm">אישור</button>
            </div>
        `;

        // Add styles
        this._addStyles();

        // Add to DOM
        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);

        // Setup event listeners
        this._setupListeners();

        // Add drag and minimize functionality
        addDialogStyles();
        this._dialogEnhancer = enhanceDialog(this.dialog);

        console.log('[RadioGroupDialog] Initialized');
    }

    /**
     * Add dialog styles
     */
    _addStyles() {
        const styleId = 'radio-group-dialog-styles';
        if (document.getElementById(styleId)) return;

        const styles = document.createElement('style');
        styles.id = styleId;
        styles.textContent = `
            .radio-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }

            .radio-group-dialog {
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow: hidden;
                direction: rtl;
            }

            .radio-group-dialog .dialog-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                background: #4a5568;
                color: white;
            }

            .radio-group-dialog .dialog-header h3 {
                margin: 0;
                font-size: 18px;
            }

            .radio-group-dialog .dialog-close {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
            }

            .radio-group-dialog .dialog-close:hover {
                opacity: 0.8;
            }

            .radio-group-dialog .dialog-body {
                padding: 20px;
                overflow-y: auto;
                max-height: calc(80vh - 140px);
            }

            .radio-group-dialog .form-group {
                margin-bottom: 16px;
            }

            .radio-group-dialog .form-group label {
                display: block;
                margin-bottom: 6px;
                font-weight: 500;
                color: #374151;
            }

            .radio-group-dialog .form-row {
                display: flex;
                gap: 16px;
                margin-bottom: 16px;
            }

            .radio-group-dialog .group-name-field {
                flex: 2;
            }

            .radio-group-dialog .category-field {
                flex: 1;
            }

            .radio-group-dialog .context-field {
                flex: 0.8;
            }

            .required-asterisk {
                color: #dc2626;
                font-weight: bold;
            }

            #radio-group-category.invalid {
                border-color: #dc2626;
                background-color: #fef2f2;
            }

            .canonical-preview {
                background: #f0fdf4;
                border: 1px solid #86efac;
                border-radius: 6px;
                padding: 8px 12px;
                margin-bottom: 16px;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .canonical-preview .preview-label {
                color: #166534;
                font-weight: 500;
            }

            .canonical-preview code {
                background: #dcfce7;
                padding: 2px 8px;
                border-radius: 4px;
                font-family: monospace;
                color: #15803d;
            }

            .radio-group-dialog .field-hint {
                display: block;
                font-size: 11px;
                color: #6b7280;
                margin-top: 4px;
            }

            .radio-group-dialog .dialog-input,
            .radio-group-dialog .dialog-select {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                box-sizing: border-box;
            }

            .radio-group-dialog .dialog-input:focus,
            .radio-group-dialog .dialog-select:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
            }

            .labels-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
            }

            .labels-table th,
            .labels-table td {
                padding: 10px 8px;
                text-align: right;
                border-bottom: 1px solid #e5e7eb;
            }

            .labels-table th {
                background: #f9fafb;
                font-weight: 600;
                color: #374151;
            }

            .labels-table th:first-child,
            .labels-table td:first-child {
                width: 40px;
                text-align: center;
            }

            .labels-table th:last-child,
            .labels-table td:last-child {
                width: 60px;
                text-align: center;
            }

            .labels-table input {
                width: 100%;
                padding: 6px 8px;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 13px;
                box-sizing: border-box;
            }

            .labels-table input:focus {
                outline: none;
                border-color: #3b82f6;
            }

            .labels-table input[dir="ltr"] {
                text-align: left;
            }

            .labels-table .source-badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 10px;
                font-size: 11px;
                background: #e5e7eb;
                color: #6b7280;
            }

            .labels-table .source-badge.pdf {
                background: #d1fae5;
                color: #059669;
            }

            .labels-table .source-badge.ocr {
                background: #dbeafe;
                color: #2563eb;
            }

            .labels-table .source-badge.none {
                background: #fef3c7;
                color: #d97706;
            }

            .labels-table .circle-num {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                background: #3b82f6;
                color: white;
                border-radius: 50%;
                font-weight: bold;
                font-size: 12px;
            }

            .detection-info {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                background: #f0f9ff;
                border-radius: 6px;
                color: #0369a1;
                font-size: 13px;
            }

            .radio-group-dialog .dialog-footer {
                display: flex;
                justify-content: flex-start;
                gap: 10px;
                padding: 16px 20px;
                background: #f9fafb;
                border-top: 1px solid #e5e7eb;
            }

            .radio-group-dialog .btn-cancel,
            .radio-group-dialog .btn-confirm {
                padding: 10px 24px;
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                border: none;
            }

            .radio-group-dialog .btn-cancel {
                background: #e5e7eb;
                color: #374151;
            }

            .radio-group-dialog .btn-cancel:hover {
                background: #d1d5db;
            }

            .radio-group-dialog .btn-confirm {
                background: #3b82f6;
                color: white;
            }

            .radio-group-dialog .btn-confirm:hover {
                background: #2563eb;
            }

            /* Mark label button */
            .btn-mark-label {
                padding: 4px 8px;
                background: #f0f9ff;
                border: 1px solid #0ea5e9;
                border-radius: 4px;
                color: #0284c7;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }

            .btn-mark-label:hover {
                background: #0ea5e9;
                color: white;
            }

            /* Manual source badge */
            .labels-table .source-badge.manual {
                background: #e0e7ff;
                color: #4338ca;
            }

            /* Cancel selection button in instruction */
            .btn-cancel-selection {
                margin-right: 16px;
                padding: 4px 12px;
                background: rgba(255,255,255,0.2);
                border: 1px solid white;
                border-radius: 4px;
                color: white;
                cursor: pointer;
                font-size: 12px;
            }

            .btn-cancel-selection:hover {
                background: rgba(255,255,255,0.3);
            }
        `;
        document.head.appendChild(styles);
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

        // Update canonical preview when category or context changes
        const categorySelect = this.dialog.querySelector('#radio-group-category');
        const contextSelect = this.dialog.querySelector('#radio-group-context');

        categorySelect.addEventListener('change', () => this._updateCanonicalPreview());
        contextSelect.addEventListener('change', () => this._updateCanonicalPreview());
    }

    /**
     * Update the canonical preview based on context and category
     */
    _updateCanonicalPreview() {
        const categorySelect = this.dialog.querySelector('#radio-group-category');
        const contextSelect = this.dialog.querySelector('#radio-group-context');
        const previewDiv = this.dialog.querySelector('#canonical-preview');
        const canonicalCode = this.dialog.querySelector('#group-canonical-value');

        const category = categorySelect.value;
        const context = contextSelect.value || 'employee';

        if (category) {
            const groupCanonical = `${context}.${category}`;
            canonicalCode.textContent = groupCanonical;
            previewDiv.style.display = 'flex';
            categorySelect.classList.remove('invalid');
        } else {
            previewDiv.style.display = 'none';
        }
    }

    /**
     * Show the dialog with detected labels
     * @param {Object} options - Dialog options
     * @param {string} options.groupName - Group name (Hebrew)
     * @param {Array} options.labels - Detected labels array
     * @param {string} options.category - Pre-selected category (optional)
     * @returns {Promise<Object|null>} Resolved with edited data or null if cancelled
     */
    show({ groupName = '', labels = [], category = '' } = {}) {
        return new Promise((resolve) => {
            this.currentGroupName = groupName;
            this.currentLabels = labels.map(l => ({ ...l })); // Clone labels

            // Set group name
            const nameInput = this.dialog.querySelector('#radio-group-name');
            nameInput.value = groupName;

            // Set category
            const categorySelect = this.dialog.querySelector('#radio-group-category');
            categorySelect.value = category || '';

            // Auto-detect category from group name if not provided
            if (!category && groupName) {
                const detectedCategory = this._detectCategoryFromName(groupName);
                if (detectedCategory) {
                    categorySelect.value = detectedCategory;
                }
            }

            // Build labels table
            this._buildLabelsTable(labels);

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

            // Focus group name
            setTimeout(() => {
                nameInput.focus();
                nameInput.select();
            }, 100);
        });
    }

    /**
     * Auto-detect category from group name
     * @param {string} groupName - Hebrew group name
     * @returns {string|null} Detected category or null
     */
    _detectCategoryFromName(groupName) {
        const nameLower = groupName.toLowerCase();

        const categoryPatterns = {
            gender: ['מין', 'מגדר', 'gender'],
            marital_status: ['משפחתי', 'מצב', 'נשוי', 'רווק', 'marital'],
            income_type: ['הכנסה', 'משכורת', 'שכר', 'income', 'salary'],
            health_fund: ['קופ', 'חולים', 'בריאות', 'health', 'hmo'],
            resident_status: ['תושב', 'תושבות', 'אזרח', 'resident']
        };

        for (const [category, patterns] of Object.entries(categoryPatterns)) {
            for (const pattern of patterns) {
                if (nameLower.includes(pattern.toLowerCase())) {
                    return category;
                }
            }
        }

        return null;
    }

    /**
     * Build the labels table rows
     * @param {Array} labels - Labels array
     */
    _buildLabelsTable(labels) {
        const tbody = this.dialog.querySelector('#labels-tbody');
        tbody.innerHTML = '';

        const circleIndicators = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

        labels.forEach((label, index) => {
            const row = document.createElement('tr');

            const sourceLabels = {
                'pdf': 'PDF',
                'ocr': 'OCR',
                'none': 'ריק',
                'error': 'שגיאה',
                'manual': 'ידני'
            };
            const sourceClass = label.source || 'none';

            row.innerHTML = `
                <td><span class="circle-num">${circleIndicators[index] || (index + 1)}</span></td>
                <td>
                    <input type="text"
                           class="label-he-input"
                           data-index="${index}"
                           dir="rtl"
                           value="${label.label_he || ''}"
                           placeholder="תווית עברית">
                </td>
                <td>
                    <input type="text"
                           class="label-en-input"
                           data-index="${index}"
                           dir="ltr"
                           value="${label.label_en || ''}"
                           placeholder="english_id">
                </td>
                <td><span class="source-badge ${sourceClass}" data-index="${index}">${sourceLabels[label.source] || '-'}</span></td>
                <td>
                    <button class="btn-mark-label" data-index="${index}" title="סמן תווית על הטופס">
                        ✏️
                    </button>
                </td>
            `;

            tbody.appendChild(row);
        });

        // Add auto-generate English from Hebrew
        tbody.querySelectorAll('.label-he-input').forEach(input => {
            const index = parseInt(input.dataset.index);
            const enInput = tbody.querySelector(`.label-en-input[data-index="${index}"]`);
            let manuallyEdited = this.currentLabels[index]?.label_en ? true : false;

            enInput.addEventListener('input', () => {
                manuallyEdited = true;
            });

            input.addEventListener('input', () => {
                if (!manuallyEdited) {
                    enInput.value = fieldNamer.hebrewToEnglish(input.value);
                }
                // Update current labels
                this.currentLabels[index].label_he = input.value;
            });

            enInput.addEventListener('change', () => {
                this.currentLabels[index].label_en = enInput.value;
            });
        });

        // Add mark label button handlers
        tbody.querySelectorAll('.btn-mark-label').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this._startLabelSelection(index);
            });
        });
    }

    /**
     * Start label selection mode - hide dialog and let user draw rectangle
     * @param {number} index - Label index to update
     */
    _startLabelSelection(index) {
        // Hide dialog temporarily
        this.overlay.style.display = 'none';

        // Show instruction
        const instruction = document.createElement('div');
        instruction.id = 'label-selection-instruction';
        instruction.innerHTML = `
            <div class="instruction-content">
                <span>סמן את אזור התווית לרדיו ${index + 1}</span>
                <button class="btn-cancel-selection">ביטול (Esc)</button>
            </div>
        `;
        instruction.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #3b82f6;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(instruction);

        // Cancel button handler
        instruction.querySelector('.btn-cancel-selection').addEventListener('click', () => {
            this._cancelLabelSelection();
        });

        // Store the index we're selecting for
        this._pendingLabelIndex = index;

        // Emit event to start drawing mode
        eventBus.emit('radio:startLabelSelection', { index });

        // Listen for rectangle drawn
        this._labelSelectionHandler = (data) => {
            this._handleLabelSelected(data);
        };
        eventBus.once('radio:labelSelected', this._labelSelectionHandler);

        // Escape key to cancel
        this._escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this._cancelLabelSelection();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }

    /**
     * Cancel label selection mode
     */
    _cancelLabelSelection() {
        // Remove instruction
        const instruction = document.getElementById('label-selection-instruction');
        if (instruction) instruction.remove();

        // Remove event listeners
        document.removeEventListener('keydown', this._escapeHandler);
        eventBus.off('radio:labelSelected', this._labelSelectionHandler);

        // Emit cancel event
        eventBus.emit('radio:cancelLabelSelection');

        // Show dialog again
        this.overlay.style.display = 'flex';
        this._pendingLabelIndex = null;
    }

    /**
     * Handle label area selected
     * @param {Object} data - { index, text, source }
     */
    _handleLabelSelected(data) {
        // Remove instruction
        const instruction = document.getElementById('label-selection-instruction');
        if (instruction) instruction.remove();

        // Remove escape handler
        document.removeEventListener('keydown', this._escapeHandler);

        const index = this._pendingLabelIndex;
        if (index !== null && index !== undefined) {
            // Update the label
            const heInput = this.dialog.querySelector(`.label-he-input[data-index="${index}"]`);
            const enInput = this.dialog.querySelector(`.label-en-input[data-index="${index}"]`);
            const sourceBadge = this.dialog.querySelector(`.source-badge[data-index="${index}"]`);

            if (heInput && data.text) {
                heInput.value = data.text;
                this.currentLabels[index].label_he = data.text;

                // Auto-generate English
                if (enInput) {
                    enInput.value = fieldNamer.hebrewToEnglish(data.text);
                    this.currentLabels[index].label_en = enInput.value;
                }

                // Update source badge
                if (sourceBadge) {
                    sourceBadge.textContent = 'ידני';
                    sourceBadge.className = 'source-badge manual';
                }

                this.currentLabels[index].source = 'manual';
            }
        }

        // Show dialog again
        this.overlay.style.display = 'flex';
        this._pendingLabelIndex = null;
    }

    /**
     * Confirm and close dialog
     */
    confirm() {
        if (!this.isOpen) return;

        const nameInput = this.dialog.querySelector('#radio-group-name');
        const categorySelect = this.dialog.querySelector('#radio-group-category');
        const contextSelect = this.dialog.querySelector('#radio-group-context');
        const groupName = nameInput.value.trim();
        const category = categorySelect.value || null;
        const context = contextSelect.value || 'employee';

        // Validate - at least group name
        if (!groupName) {
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'יש להזין שם לקבוצה',
                type: 'warning'
            });
            nameInput.focus();
            return;
        }

        // V3.1: REQUIRE category
        if (!category) {
            categorySelect.classList.add('invalid');
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'חובה לבחור קטגוריה סמנטית',
                type: 'error'
            });
            console.warn(`[RadioGroupDialog] ⚠️ Blocked: category is required for group "${groupName}"`);
            return;
        }
        categorySelect.classList.remove('invalid');

        // Build group canonical as context.category
        const groupCanonical = `${context}.${category}`;

        // Gather labels from inputs
        const labels = [];
        const tbody = this.dialog.querySelector('#labels-tbody');
        const rows = tbody.querySelectorAll('tr');

        rows.forEach((row, index) => {
            const heInput = row.querySelector('.label-he-input');
            const enInput = row.querySelector('.label-en-input');
            const labelText = heInput.value.trim().toLowerCase();

            // Derive canonical for each option based on category
            const canonical = this._deriveCanonicalFromLabel(labelText, category);

            // Derive value for each option (V3.1)
            const value = this._deriveValueFromLabel(labelText, category);

            labels.push({
                circleIndex: index,
                label_he: heInput.value.trim(),
                label_en: enInput.value.trim() || `option_${index + 1}`,
                canonical: canonical,
                value: value  // NEW: Canonical value for fill-engine
            });
        });

        // Save callback before hiding
        const callback = this.onConfirmCallback;
        const data = {
            groupName,
            category,
            context,                    // NEW: Group context
            canonical: groupCanonical,  // NEW: Group canonical (context.category)
            labels
        };

        console.log(`[RadioGroupDialog] ✅ Group confirmed: "${groupName}" → canonical=${groupCanonical}`);

        // Close dialog
        this._hide();

        // Call callback
        if (callback) {
            console.log('[RadioGroupDialog] Calling callback with:', data);
            callback(data);
        }

        console.log('[RadioGroupDialog] Confirmed:', data);
    }

    /**
     * Derive canonical name for an option based on its label and category
     * @param {string} label - Hebrew label text (lowercase)
     * @param {string} category - Category name
     * @returns {string|null} Canonical name or null
     */
    _deriveCanonicalFromLabel(label, category) {
        const canonicalMappings = {
            gender: {
                'זכר': 'gender_male',
                'גבר': 'gender_male',
                'נקבה': 'gender_female',
                'אישה': 'gender_female'
            },
            marital_status: {
                'רווק': 'marital_single',
                'רווקה': 'marital_single',
                'נשוי': 'marital_married',
                'נשואה': 'marital_married',
                'גרוש': 'marital_divorced',
                'גרושה': 'marital_divorced',
                'אלמן': 'marital_widowed',
                'אלמנה': 'marital_widowed',
                'פרוד': 'marital_separated',
                'פרודה': 'marital_separated'
            },
            income_type: {
                'חודש': 'income_type_monthly',
                'חודשי': 'income_type_monthly',
                'חודשית': 'income_type_monthly',
                'חלקית': 'income_type_partial',
                'חלקי': 'income_type_partial',
                'נוספת': 'income_type_additional',
                'נוסף': 'income_type_additional',
                'משרה נוספת': 'income_type_additional'
            },
            health_fund: {
                'כללית': 'health_fund_clalit',
                'מכבי': 'health_fund_maccabi',
                'מאוחדת': 'health_fund_meuhedet',
                'לאומית': 'health_fund_leumit'
            }
        };

        const categoryMap = canonicalMappings[category];
        if (!categoryMap) return null;

        // Exact match
        if (categoryMap[label]) {
            return categoryMap[label];
        }

        // Partial match
        for (const [pattern, canonical] of Object.entries(categoryMap)) {
            if (label.includes(pattern)) {
                return canonical;
            }
        }

        return null;
    }

    /**
     * Derive canonical VALUE for an option based on its label and category
     * V3.1: Returns simple value like 'male', 'married', 'monthly' for fill-engine
     * @param {string} label - Hebrew label text (lowercase)
     * @param {string} category - Category name
     * @returns {string|null} Value or null
     */
    _deriveValueFromLabel(label, category) {
        const valueMappings = {
            gender: {
                'זכר': 'male',
                'גבר': 'male',
                'נקבה': 'female',
                'אישה': 'female'
            },
            marital_status: {
                'רווק': 'single',
                'רווקה': 'single',
                'נשוי': 'married',
                'נשואה': 'married',
                'גרוש': 'divorced',
                'גרושה': 'divorced',
                'אלמן': 'widowed',
                'אלמנה': 'widowed',
                'פרוד': 'separated',
                'פרודה': 'separated'
            },
            income_type: {
                'חודש': 'monthly',
                'חודשי': 'monthly',
                'חודשית': 'monthly',
                'חלקית': 'partial',
                'חלקי': 'partial',
                'נוספת': 'additional',
                'נוסף': 'additional',
                'משרה נוספת': 'additional'
            },
            health_fund: {
                'כללית': 'clalit',
                'מכבי': 'maccabi',
                'מאוחדת': 'meuhedet',
                'לאומית': 'leumit'
            },
            resident_status: {
                'תושב': 'resident',
                'לא תושב': 'non_resident',
                'תושב ישראל': 'resident',
                'תושב חוץ': 'non_resident'
            }
        };

        const categoryMap = valueMappings[category];
        if (!categoryMap) return null;

        // Exact match
        if (categoryMap[label]) {
            return categoryMap[label];
        }

        // Partial match
        for (const [pattern, value] of Object.entries(categoryMap)) {
            if (label.includes(pattern)) {
                return value;
            }
        }

        return null;
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

        console.log('[RadioGroupDialog] Cancelled');
    }

    /**
     * Hide the dialog
     */
    _hide() {
        this.overlay.style.display = 'none';
        this.isOpen = false;
        this.onConfirmCallback = null;
        this.onCancelCallback = null;
        this.currentLabels = [];
        this.currentGroupName = '';
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
export const radioGroupDialog = new RadioGroupDialog();
