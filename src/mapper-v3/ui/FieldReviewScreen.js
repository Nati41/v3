/**
 * FieldReviewScreen - Centralized review screen for draft fields
 *
 * V3.2: Shows all draft fields in a table for batch review
 * Replaces per-field popup with centralized approval flow
 */
import { state } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { fieldNamer } from '../engines/FieldNamer.js';
import { enhanceDialog, addDialogStyles } from './DialogUtils.js';

export class FieldReviewScreen {
    constructor() {
        this.overlay = null;
        this.dialog = null;
        this.isOpen = false;
        this.currentFields = [];
        this.onCompleteCallback = null;
    }

    /**
     * Initialize the review screen (create DOM elements)
     */
    init() {
        if (this.overlay) return; // Already initialized

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'field-review-overlay';
        this.overlay.style.display = 'none';

        // Create dialog container
        this.dialog = document.createElement('div');
        this.dialog.className = 'field-review-dialog';
        this.dialog.innerHTML = `
            <div class="dialog-header">
                <h3>אישור שדות</h3>
                <div class="header-info">
                    <span class="draft-count" id="draft-count">0 שדות לאישור</span>
                </div>
                <button class="dialog-close" title="סגור">&times;</button>
            </div>
            <div class="dialog-body">
                <div class="review-instructions">
                    <span class="info-icon">ℹ️</span>
                    <span>בדוק את הזיהוי האוטומטי ותקן לפי הצורך. הקלד שם לכל שדה.</span>
                </div>
                <div class="review-table-container">
                    <table class="review-table">
                        <thead>
                            <tr>
                                <th class="col-page">עמוד</th>
                                <th class="col-type">סוג</th>
                                <th class="col-structure">מבנה</th>
                                <th class="col-name">שם שדה (עברית)</th>
                                <th class="col-id">מזהה (אנגלית)</th>
                                <th class="col-confidence">בטחון</th>
                                <th class="col-actions">פעולות</th>
                            </tr>
                        </thead>
                        <tbody id="review-tbody">
                        </tbody>
                    </table>
                </div>
                <div class="review-empty" id="review-empty" style="display: none;">
                    <span class="empty-icon">✅</span>
                    <span>אין שדות לאישור</span>
                </div>
            </div>
            <div class="dialog-footer">
                <div class="footer-left">
                    <button class="btn-skip" title="דלג ועבור לשלב הבא">דלג</button>
                </div>
                <div class="footer-right">
                    <button class="btn-cancel">ביטול</button>
                    <button class="btn-approve-all" id="btn-approve-all">אשר הכל</button>
                </div>
            </div>
        `;

        // Add styles
        this._addStyles();

        // Add to DOM
        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);

        // Setup event listeners
        this._setupListeners();

        // Add drag functionality
        addDialogStyles();
        this._dialogEnhancer = enhanceDialog(this.dialog);

        console.log('[FieldReviewScreen] Initialized');
    }

    /**
     * Setup event listeners
     */
    _setupListeners() {
        // Close button
        this.dialog.querySelector('.dialog-close').addEventListener('click', () => this.cancel());

        // Cancel button
        this.dialog.querySelector('.btn-cancel').addEventListener('click', () => this.cancel());

        // Skip button
        this.dialog.querySelector('.btn-skip').addEventListener('click', () => this.skip());

        // Approve all button
        this.dialog.querySelector('.btn-approve-all').addEventListener('click', () => this.approveAll());

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
    }

    /**
     * Show the review screen with draft fields
     * @param {Object} options - Options
     * @param {number} options.page - Filter by page (null = all pages)
     * @returns {Promise<Object>} Result { approved: boolean, fields: [...] }
     */
    show({ page = null } = {}) {
        return new Promise((resolve) => {
            this.init(); // Ensure initialized

            // Get draft fields
            this.currentFields = page !== null
                ? state.getDraftFields(page)
                : state.getDraftFields();

            // Update UI
            this._updateDraftCount();
            this._renderTable();

            // Check if there are fields to review
            if (this.currentFields.length === 0) {
                document.getElementById('review-empty').style.display = 'flex';
                document.querySelector('.review-table-container').style.display = 'none';
                document.getElementById('btn-approve-all').disabled = true;
            } else {
                document.getElementById('review-empty').style.display = 'none';
                document.querySelector('.review-table-container').style.display = 'block';
                document.getElementById('btn-approve-all').disabled = false;
            }

            // Setup callback
            this.onCompleteCallback = resolve;

            // Show
            this.overlay.style.display = 'flex';
            this.isOpen = true;

            // Focus first name input
            setTimeout(() => {
                const firstInput = this.dialog.querySelector('.field-name-input');
                if (firstInput) firstInput.focus();
            }, 100);

            console.log(`[FieldReviewScreen] Showing ${this.currentFields.length} draft fields`);
        });
    }

    /**
     * Update draft count display
     */
    _updateDraftCount() {
        const count = this.currentFields.length;
        const label = count === 1 ? 'שדה אחד לאישור' : `${count} שדות לאישור`;
        document.getElementById('draft-count').textContent = label;
    }

    /**
     * Render the fields table
     */
    _renderTable() {
        const tbody = document.getElementById('review-tbody');
        tbody.innerHTML = '';

        for (const field of this.currentFields) {
            const row = this._createFieldRow(field);
            tbody.appendChild(row);
        }
    }

    /**
     * Create a table row for a field
     */
    _createFieldRow(field) {
        const row = document.createElement('tr');
        row.dataset.fieldId = field.id;

        const structure = field.detectedStructure || {};
        const confidence = structure.confidence || 0;
        const confidenceClass = confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';

        // Format structure display - prioritize boxCount from CanonicalSelector over detected structure
        let structureDisplay = 'רגיל';
        const boxCount = field.boxCount || structure.boxCount; // Prefer field.boxCount (from CanonicalSelector)
        const fieldStructure = field.structure || structure.intent || 'flowText';

        if (fieldStructure === 'boxes' || fieldStructure === 'perGlyphBoxes') {
            structureDisplay = boxCount ? `${boxCount} תיבות` : 'תיבות';
        } else if (fieldStructure === 'checkbox' || field.type === 'checkbox') {
            structureDisplay = 'Checkbox';
        } else if (fieldStructure === 'radio' || field.type === 'radio') {
            structureDisplay = 'Radio';
        }

        row.innerHTML = `
            <td class="col-page">${field.page}</td>
            <td class="col-type">
                <select class="field-type-select" data-field-id="${field.id}">
                    <option value="text" ${field.type === 'text' ? 'selected' : ''}>טקסט</option>
                    <option value="number" ${field.type === 'number' ? 'selected' : ''}>מספר</option>
                    <option value="date" ${field.type === 'date' ? 'selected' : ''}>תאריך</option>
                    <option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                    <option value="radio" ${field.type === 'radio' ? 'selected' : ''}>Radio</option>
                </select>
            </td>
            <td class="col-structure">
                <span class="structure-badge ${fieldStructure === 'boxes' ? 'perGlyphBoxes' : (fieldStructure || 'flowText')}">${structureDisplay}</span>
            </td>
            <td class="col-name">
                <input type="text" class="field-name-input"
                       data-field-id="${field.id}"
                       value="${field.label_he || ''}"
                       placeholder="הקלד שם שדה..."
                       dir="rtl">
            </td>
            <td class="col-id">
                <input type="text" class="field-id-input"
                       data-field-id="${field.id}"
                       value="${field.label_en || ''}"
                       placeholder="field_id"
                       dir="ltr">
            </td>
            <td class="col-confidence">
                <span class="confidence-badge ${confidenceClass}" title="${(confidence * 100).toFixed(0)}%">
                    ${confidence >= 0.8 ? '✓' : confidence >= 0.5 ? '~' : '?'}
                </span>
            </td>
            <td class="col-actions">
                <button class="btn-locate" data-field-id="${field.id}" title="מצא ב-PDF">📍</button>
                <button class="btn-delete" data-field-id="${field.id}" title="מחק">🗑️</button>
            </td>
        `;

        // Setup row event listeners
        this._setupRowListeners(row, field);

        return row;
    }

    /**
     * Setup event listeners for a row
     */
    _setupRowListeners(row, field) {
        // Type change
        row.querySelector('.field-type-select').addEventListener('change', (e) => {
            const fieldId = e.target.dataset.fieldId;
            const newType = e.target.value;
            this._updateFieldData(fieldId, { type: newType });
        });

        // Name input - auto-generate English ID
        const nameInput = row.querySelector('.field-name-input');
        const idInput = row.querySelector('.field-id-input');
        let idManuallyEdited = false;

        idInput.addEventListener('input', () => {
            idManuallyEdited = true;
        });

        nameInput.addEventListener('input', () => {
            if (!idManuallyEdited) {
                idInput.value = fieldNamer.hebrewToEnglish(nameInput.value);
            }
        });

        // Locate button - scroll to field in PDF
        row.querySelector('.btn-locate').addEventListener('click', (e) => {
            const fieldId = e.target.dataset.fieldId;
            this._locateField(fieldId);
        });

        // Delete button
        row.querySelector('.btn-delete').addEventListener('click', (e) => {
            const fieldId = e.target.dataset.fieldId;
            this._deleteField(fieldId, row);
        });
    }

    /**
     * Update field data in local array
     */
    _updateFieldData(fieldId, updates) {
        const field = this.currentFields.find(f => f.id === fieldId);
        if (field) {
            Object.assign(field, updates);
        }
    }

    /**
     * Locate and highlight field in PDF
     */
    _locateField(fieldId) {
        const field = state.getField(fieldId);
        if (!field) return;

        // Navigate to page if needed
        if (field.page !== state.get('document.currentPage')) {
            state.set('document.currentPage', field.page);
        }

        // Select the field
        state.selectField(fieldId);

        // Emit event for overlay to scroll to field
        eventBus.emit(Events.FIELD_LOCATE, { fieldId });

        console.log(`[FieldReviewScreen] Locating field: ${fieldId}`);
    }

    /**
     * Delete a field
     */
    _deleteField(fieldId, row) {
        // Remove from state
        state.deleteField(fieldId);

        // Remove from local array
        this.currentFields = this.currentFields.filter(f => f.id !== fieldId);

        // Remove row with animation
        row.style.opacity = '0';
        row.style.transform = 'translateX(-20px)';
        setTimeout(() => {
            row.remove();
            this._updateDraftCount();

            // Check if table is now empty
            if (this.currentFields.length === 0) {
                document.getElementById('review-empty').style.display = 'flex';
                document.querySelector('.review-table-container').style.display = 'none';
                document.getElementById('btn-approve-all').disabled = true;
            }
        }, 200);

        console.log(`[FieldReviewScreen] Deleted field: ${fieldId}`);
    }

    /**
     * Collect data from all rows
     */
    _collectFormData() {
        const updates = [];
        const rows = this.dialog.querySelectorAll('#review-tbody tr');

        for (const row of rows) {
            const fieldId = row.dataset.fieldId;
            const type = row.querySelector('.field-type-select').value;
            const label_he = row.querySelector('.field-name-input').value.trim();
            const label_en = row.querySelector('.field-id-input').value.trim();

            updates.push({
                fieldId,
                type,
                label_he,
                label_en: label_en || label_he // Fallback to Hebrew if no English
            });
        }

        return updates;
    }

    /**
     * Validate form data
     */
    _validateFormData(updates) {
        const errors = [];

        for (const update of updates) {
            if (!update.label_he && !update.label_en) {
                errors.push(`שדה ללא שם (${update.fieldId})`);
            }
        }

        return errors;
    }

    /**
     * Approve all fields
     */
    approveAll() {
        const updates = this._collectFormData();
        const errors = this._validateFormData(updates);

        if (errors.length > 0) {
            eventBus.emit(Events.TOAST_SHOW, {
                message: `יש להזין שמות לכל השדות`,
                type: 'warning'
            });

            // Highlight empty fields
            this._highlightEmptyFields();
            return;
        }

        // Batch update all fields as reviewed
        state.batchMarkFieldsReviewed(updates);

        // Close and resolve
        this._hide();

        if (this.onCompleteCallback) {
            this.onCompleteCallback({
                approved: true,
                skipped: false,
                fields: updates
            });
        }

        eventBus.emit(Events.TOAST_SHOW, {
            message: `${updates.length} שדות אושרו בהצלחה`,
            type: 'success'
        });

        console.log(`[FieldReviewScreen] Approved ${updates.length} fields`);
    }

    /**
     * Highlight empty name fields
     */
    _highlightEmptyFields() {
        const inputs = this.dialog.querySelectorAll('.field-name-input');
        for (const input of inputs) {
            if (!input.value.trim()) {
                input.classList.add('error');
                input.focus();
                setTimeout(() => input.classList.remove('error'), 2000);
                break; // Focus first empty
            }
        }
    }

    /**
     * Skip review (keep as draft)
     */
    skip() {
        this._hide();

        if (this.onCompleteCallback) {
            this.onCompleteCallback({
                approved: false,
                skipped: true,
                fields: []
            });
        }

        console.log('[FieldReviewScreen] Skipped review');
    }

    /**
     * Cancel and close
     */
    cancel() {
        this._hide();

        if (this.onCompleteCallback) {
            this.onCompleteCallback({
                approved: false,
                skipped: false,
                fields: []
            });
        }

        console.log('[FieldReviewScreen] Cancelled');
    }

    /**
     * Hide the dialog
     */
    _hide() {
        this.overlay.style.display = 'none';
        this.isOpen = false;
        this.currentFields = [];
        this.onCompleteCallback = null;
    }

    /**
     * Check if dialog is open
     */
    isDialogOpen() {
        return this.isOpen;
    }

    /**
     * Add component styles
     */
    _addStyles() {
        if (document.getElementById('field-review-styles')) return;

        const style = document.createElement('style');
        style.id = 'field-review-styles';
        style.textContent = `
            .field-review-overlay {
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

            .field-review-dialog {
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 900px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .field-review-dialog .dialog-header {
                display: flex;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid #e5e7eb;
                background: #f9fafb;
            }

            .field-review-dialog .dialog-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                color: #1f2937;
            }

            .field-review-dialog .header-info {
                margin-right: auto;
                margin-left: 16px;
            }

            .field-review-dialog .draft-count {
                background: #3b82f6;
                color: white;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 500;
            }

            .field-review-dialog .dialog-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #6b7280;
                padding: 0 8px;
                margin-right: -8px;
            }

            .field-review-dialog .dialog-close:hover {
                color: #1f2937;
            }

            .field-review-dialog .dialog-body {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
            }

            .field-review-dialog .review-instructions {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                background: #eff6ff;
                border-radius: 8px;
                margin-bottom: 16px;
                color: #1e40af;
                font-size: 14px;
            }

            .field-review-dialog .info-icon {
                font-size: 16px;
            }

            .field-review-dialog .review-table-container {
                overflow-x: auto;
            }

            .field-review-dialog .review-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
            }

            .field-review-dialog .review-table th {
                text-align: right;
                padding: 12px 8px;
                background: #f3f4f6;
                border-bottom: 2px solid #e5e7eb;
                font-weight: 600;
                color: #374151;
                white-space: nowrap;
            }

            .field-review-dialog .review-table td {
                padding: 10px 8px;
                border-bottom: 1px solid #e5e7eb;
                vertical-align: middle;
            }

            .field-review-dialog .review-table tr {
                transition: opacity 0.2s, transform 0.2s;
            }

            .field-review-dialog .review-table tr:hover {
                background: #f9fafb;
            }

            .field-review-dialog .col-page {
                width: 60px;
                text-align: center;
            }

            .field-review-dialog .col-type {
                width: 100px;
            }

            .field-review-dialog .col-structure {
                width: 90px;
            }

            .field-review-dialog .col-name {
                min-width: 150px;
            }

            .field-review-dialog .col-id {
                min-width: 120px;
            }

            .field-review-dialog .col-confidence {
                width: 60px;
                text-align: center;
            }

            .field-review-dialog .col-actions {
                width: 80px;
                text-align: center;
            }

            .field-review-dialog .field-type-select {
                width: 100%;
                padding: 6px 8px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 13px;
                background: white;
            }

            .field-review-dialog .structure-badge {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
            }

            .field-review-dialog .structure-badge.flowText {
                background: #e5e7eb;
                color: #4b5563;
            }

            .field-review-dialog .structure-badge.perGlyphBoxes {
                background: #dbeafe;
                color: #1e40af;
            }

            .field-review-dialog .structure-badge.checkbox,
            .field-review-dialog .structure-badge.radio {
                background: #fef3c7;
                color: #92400e;
            }

            .field-review-dialog .field-name-input,
            .field-review-dialog .field-id-input {
                width: 100%;
                padding: 6px 10px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 13px;
            }

            .field-review-dialog .field-name-input:focus,
            .field-review-dialog .field-id-input:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }

            .field-review-dialog .field-name-input.error {
                border-color: #ef4444;
                background: #fef2f2;
                animation: shake 0.3s ease-in-out;
            }

            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-4px); }
                75% { transform: translateX(4px); }
            }

            .field-review-dialog .confidence-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                font-size: 12px;
                font-weight: 600;
            }

            .field-review-dialog .confidence-badge.high {
                background: #d1fae5;
                color: #059669;
            }

            .field-review-dialog .confidence-badge.medium {
                background: #fef3c7;
                color: #d97706;
            }

            .field-review-dialog .confidence-badge.low {
                background: #fee2e2;
                color: #dc2626;
            }

            .field-review-dialog .btn-locate,
            .field-review-dialog .btn-delete {
                background: none;
                border: none;
                font-size: 16px;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: background 0.2s;
            }

            .field-review-dialog .btn-locate:hover {
                background: #dbeafe;
            }

            .field-review-dialog .btn-delete:hover {
                background: #fee2e2;
            }

            .field-review-dialog .review-empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px;
                color: #6b7280;
            }

            .field-review-dialog .empty-icon {
                font-size: 48px;
                margin-bottom: 16px;
            }

            .field-review-dialog .dialog-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-top: 1px solid #e5e7eb;
                background: #f9fafb;
            }

            .field-review-dialog .footer-left,
            .field-review-dialog .footer-right {
                display: flex;
                gap: 8px;
            }

            .field-review-dialog .btn-skip {
                padding: 8px 16px;
                background: none;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                cursor: pointer;
                color: #6b7280;
                font-size: 14px;
            }

            .field-review-dialog .btn-skip:hover {
                background: #f3f4f6;
            }

            .field-review-dialog .btn-cancel {
                padding: 8px 16px;
                background: white;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                cursor: pointer;
                color: #374151;
                font-size: 14px;
            }

            .field-review-dialog .btn-cancel:hover {
                background: #f3f4f6;
            }

            .field-review-dialog .btn-approve-all {
                padding: 8px 20px;
                background: #3b82f6;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                color: white;
                font-size: 14px;
                font-weight: 500;
            }

            .field-review-dialog .btn-approve-all:hover:not(:disabled) {
                background: #2563eb;
            }

            .field-review-dialog .btn-approve-all:disabled {
                background: #9ca3af;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }
}

// Singleton instance
export const fieldReviewScreen = new FieldReviewScreen();
