/**
 * DuplicateFieldDialog.js
 * V3.9: Simple dialog for duplicating a field N times
 *
 * Instead of complex table flow, user can:
 * 1. Map one field
 * 2. Click "Duplicate × N"
 * 3. Enter count and direction
 * 4. Get N copies with automatic offset
 */

import { eventBus, Events } from '../core/EventBus.js';
import { state } from '../core/StateManager.js';

class DuplicateFieldDialog {
    constructor() {
        this.dialogEl = null;
        this.currentFieldId = null;
        this._initialized = false;
    }

    /**
     * Initialize the dialog
     */
    init() {
        if (this._initialized) return;

        this._createDialog();
        this._initialized = true;
        console.log('[DuplicateFieldDialog] Initialized');
    }

    /**
     * Create dialog HTML
     */
    _createDialog() {
        this.dialogEl = document.createElement('div');
        this.dialogEl.id = 'duplicate-field-dialog';
        this.dialogEl.className = 'dialog-overlay hidden';
        this.dialogEl.innerHTML = `
            <div class="dialog-box duplicate-dialog" dir="rtl">
                <h3>שכפול שדה</h3>
                <p id="duplicate-field-name" class="duplicate-field-name"></p>

                <div class="form-group">
                    <label>כמה עותקים?</label>
                    <div class="count-control">
                        <button type="button" class="count-btn minus" data-delta="-1">−</button>
                        <input type="number" id="duplicate-count" value="5" min="1" max="50">
                        <button type="button" class="count-btn plus" data-delta="1">+</button>
                    </div>
                </div>

                <div class="form-group">
                    <label>כיוון שכפול:</label>
                    <div class="direction-buttons">
                        <button type="button" class="direction-btn active" data-direction="down" title="למטה">
                            ↓ למטה
                        </button>
                        <button type="button" class="direction-btn" data-direction="right" title="ימינה">
                            ← ימינה
                        </button>
                    </div>
                </div>

                <div class="form-group">
                    <label>גובה שורה (פיקסלים):</label>
                    <input type="number" id="duplicate-row-height" value="0" min="0" max="200" class="spacing-input">
                    <span class="spacing-hint" id="row-height-hint">0 = אוטומטי (לפי גודל השדה)</span>
                    <button type="button" id="detect-row-height" class="btn-small" style="margin-top:4px;">🔍 זהה מ-2 שדות</button>
                </div>

                <div class="dialog-actions">
                    <button id="duplicate-cancel" class="btn-secondary">ביטול</button>
                    <button id="duplicate-confirm" class="btn-primary">שכפל</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.dialogEl);
        this._attachEventListeners();
    }

    /**
     * Attach event listeners
     */
    _attachEventListeners() {
        // Count buttons
        this.dialogEl.querySelectorAll('.count-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = this.dialogEl.querySelector('#duplicate-count');
                const delta = parseInt(btn.dataset.delta);
                const newValue = Math.max(1, Math.min(50, parseInt(input.value) + delta));
                input.value = newValue;
            });
        });

        // Direction buttons
        this.dialogEl.querySelectorAll('.direction-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.dialogEl.querySelectorAll('.direction-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Cancel button
        this.dialogEl.querySelector('#duplicate-cancel').addEventListener('click', () => {
            this.hide();
        });

        // Confirm button
        this.dialogEl.querySelector('#duplicate-confirm').addEventListener('click', () => {
            this._executeDuplicate();
        });

        // Close on overlay click
        this.dialogEl.addEventListener('click', (e) => {
            if (e.target === this.dialogEl) {
                this.hide();
            }
        });

        // Enter key to confirm
        this.dialogEl.querySelector('#duplicate-count').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._executeDuplicate();
            }
        });

        // V3.10: Detect row height from existing fields
        this.dialogEl.querySelector('#detect-row-height').addEventListener('click', () => {
            this._detectRowHeight();
        });
    }

    /**
     * V3.10: Detect row height from two existing fields of the same type
     */
    _detectRowHeight() {
        const currentField = state.getField(this.currentFieldId);
        if (!currentField || !currentField.bbox) return;

        // Find other mapped fields of the same type on the same page
        const fields = state.get('fields') || [];
        const sameTypeFields = fields.filter(f =>
            f.id !== this.currentFieldId &&
            f.type === currentField.type &&
            f.page === currentField.page &&
            f.bbox && f.isMapped
        );

        if (sameTypeFields.length === 0) {
            this._showHint('מפה עוד שדה אחד לזיהוי גובה שורה');
            return;
        }

        // Calculate vertical distance to the nearest field
        const pdfDims = state.state.pdfDimensions;
        const currentY = currentField.bbox[1]; // Y position (normalized)

        let minDistance = Infinity;
        for (const otherField of sameTypeFields) {
            const otherY = otherField.bbox[1];
            const distance = Math.abs(currentY - otherY);
            if (distance > 0.001 && distance < minDistance) { // Ignore same position
                minDistance = distance;
            }
        }

        if (minDistance === Infinity || minDistance < 0.001) {
            this._showHint('לא זוהה מרחק - מפה שדה בשורה אחרת');
            return;
        }

        // Convert to pixels
        const rowHeightPx = Math.round(minDistance * pdfDims.height);
        this.dialogEl.querySelector('#duplicate-row-height').value = rowHeightPx;
        this._showHint(`✓ זוהה גובה שורה: ${rowHeightPx}px`);
        console.log(`[DuplicateFieldDialog] Detected row height: ${rowHeightPx}px from ${sameTypeFields.length} other fields`);
    }

    /**
     * Show hint text
     */
    _showHint(text) {
        const hint = this.dialogEl.querySelector('#row-height-hint');
        if (hint) {
            hint.textContent = text;
        }
    }

    /**
     * Show dialog for a specific field
     * @param {string} fieldId - Field to duplicate
     */
    show(fieldId) {
        if (!this._initialized) this.init();

        const field = state.getField(fieldId);
        if (!field) {
            console.warn('[DuplicateFieldDialog] Field not found:', fieldId);
            return;
        }

        if (!field.bbox) {
            eventBus.emit(Events.TOAST_SHOW, {
                message: 'צריך למפות את השדה קודם',
                type: 'warning',
                duration: 2000
            });
            return;
        }

        this.currentFieldId = fieldId;

        // Update dialog with field name
        const fieldName = field.label_he || field.name || field.id;
        this.dialogEl.querySelector('#duplicate-field-name').textContent = `שדה: "${fieldName}"`;

        // V3.9: Use _repeatCount from collapsed fields, or default to 5
        // Subtract 1 because the original field already exists
        const defaultCount = field._repeatCount ? field._repeatCount - 1 : 5;

        // Reset to defaults (with smart count)
        this.dialogEl.querySelector('#duplicate-count').value = defaultCount;
        this.dialogEl.querySelector('#duplicate-row-height').value = 0;

        // V3.10: Show field height in pixels and try auto-detect
        const pdfDims = state.state.pdfDimensions;
        const fieldHeightPx = Math.round(field.bbox[3] * pdfDims.height);
        this._showHint(`גובה השדה: ${fieldHeightPx}px | 0 = אוטומטי`);

        // Try to auto-detect row height from existing fields
        setTimeout(() => this._detectRowHeight(), 100);

        // Show hint if this was a collapsed field
        const hintEl = this.dialogEl.querySelector('.repeat-hint');
        if (field._repeatCount) {
            if (!hintEl) {
                const hint = document.createElement('p');
                hint.className = 'repeat-hint';
                hint.textContent = `זוהו ${field._repeatCount} שדות מקוריים`;
                this.dialogEl.querySelector('#duplicate-field-name').after(hint);
            } else {
                hintEl.textContent = `זוהו ${field._repeatCount} שדות מקוריים`;
                hintEl.style.display = 'block';
            }
        } else if (hintEl) {
            hintEl.style.display = 'none';
        }
        this.dialogEl.querySelectorAll('.direction-btn').forEach(b => b.classList.remove('active'));
        this.dialogEl.querySelector('[data-direction="down"]').classList.add('active');

        // Show dialog
        this.dialogEl.classList.remove('hidden');

        // Focus count input
        setTimeout(() => {
            this.dialogEl.querySelector('#duplicate-count').select();
        }, 100);
    }

    /**
     * Hide dialog
     */
    hide() {
        this.dialogEl.classList.add('hidden');
        this.currentFieldId = null;
    }

    /**
     * Execute the duplication
     */
    _executeDuplicate() {
        const field = state.getField(this.currentFieldId);
        if (!field || !field.bbox) {
            this.hide();
            return;
        }

        const count = parseInt(this.dialogEl.querySelector('#duplicate-count').value) || 1;
        const rowHeight = parseInt(this.dialogEl.querySelector('#duplicate-row-height').value) || 0;
        const direction = this.dialogEl.querySelector('.direction-btn.active')?.dataset.direction || 'down';

        console.log(`[DuplicateFieldDialog] Duplicating ${count} times, direction: ${direction}, rowHeight: ${rowHeight}px, placementMode: ${field.placementMode || 'symbol'}`);

        // Get original bbox
        let [x, y, w, h] = field.bbox;

        // V3.10: Save original dimensions for offset calculation (before any constraints)
        // This ensures duplicates are spaced according to the table row height, not the constrained checkbox size
        const originalW = w;
        const originalH = h;

        // Calculate offset per copy (normalized coordinates)
        // We need to convert spacing from pixels to normalized coords
        const pdfDims = state.state.pdfDimensions;

        // V3.10: Fix source field overlayWidth/overlayHeight if missing (for proper rendering)
        if ((field.type === 'checkbox' || field.type === 'radio' || field.type === 'cell') &&
            (!field.overlayWidth || !field.overlayHeight)) {
            const calcOverlayW = w * pdfDims.width;
            const calcOverlayH = h * pdfDims.height;
            console.log(`[DuplicateFieldDialog] Fixing source field overlay dims: ${calcOverlayW.toFixed(1)}x${calcOverlayH.toFixed(1)}`);
            state.updateField(field.id, {
                overlayWidth: calcOverlayW,
                overlayHeight: calcOverlayH
            });
        }

        // V3.9: CHECKBOX SIZE CONSTRAINT - Maximum size for checkboxes/radios
        // Prevents duplicating oversized checkbox fields
        // V3.10: Skip constraint for cell type and placementMode='auto' - preserve full size
        const MAX_CHECKBOX_NORM = 30 / pdfDims.width; // ~30 pixels in normalized coords
        const isCheckboxOrRadio = field.type === 'checkbox' || field.type === 'radio';
        const isCell = field.type === 'cell';  // Cell type NEVER gets constrained
        const isOversized = w > MAX_CHECKBOX_NORM || h > MAX_CHECKBOX_NORM;

        if (isCell) {
            // Cell type always preserves full size
            console.log(`[DuplicateFieldDialog] Cell type - preserving full size ${w}x${h}`);
        } else if (isCheckboxOrRadio && isOversized) {
            if (field.placementMode === 'auto') {
                console.log(`[DuplicateFieldDialog] Preserving cell size ${w}x${h} (placementMode=auto)`);
            } else {
                console.log(`[DuplicateFieldDialog] Constraining checkbox size from ${w}x${h} to max ${MAX_CHECKBOX_NORM}`);
                w = Math.min(w, MAX_CHECKBOX_NORM);
                h = Math.min(h, MAX_CHECKBOX_NORM);
            }
        }

        // V3.10: Calculate offset based on rowHeight or automatic
        let offsetX = 0;
        let offsetY = 0;

        if (direction === 'down') {
            // PDF coordinates: Y=0 is at BOTTOM, so "down" = SUBTRACT Y
            if (rowHeight > 0) {
                // User specified row height - use as center-to-center distance
                offsetY = -(rowHeight / pdfDims.height);
                console.log(`[DuplicateFieldDialog] Down offset using rowHeight: ${rowHeight}px = ${offsetY} normalized`);
            } else {
                // Automatic - use original field height (adjacent placement)
                offsetY = -originalH;
                console.log(`[DuplicateFieldDialog] Down offset using originalH: ${originalH} (automatic)`);
            }
        } else if (direction === 'right') {
            // RTL: "right" in Hebrew UI means going LEFT (negative X)
            if (rowHeight > 0) {
                // User specified width - use as center-to-center distance
                offsetX = -(rowHeight / pdfDims.width);
                console.log(`[DuplicateFieldDialog] Right offset using rowHeight: ${rowHeight}px = ${offsetX} normalized`);
            } else {
                // Automatic - use original field width (adjacent placement)
                offsetX = -originalW;
                console.log(`[DuplicateFieldDialog] Right offset using originalW: ${originalW} (automatic)`);
            }
        }

        // Create copies
        const createdFields = [];
        for (let i = 1; i <= count; i++) {
            const newBbox = [
                x + (offsetX * i),
                y + (offsetY * i),
                w,
                h
            ];

            // Generate new field name with index
            const baseName = field.label_he || field.name || 'שדה';
            const newName = `${baseName} ${i + 1}`;

            // V3.10: Copy placementMode and overlay dimensions for proper cell rendering
            const newFieldData = {
                label_he: newName,
                label_en: field.label_en ? `${field.label_en}_${i + 1}` : null,
                type: field.type,
                bbox: newBbox,
                page: field.page,
                isMapped: true,
                status: 'mapped'
            };

            // Copy placement mode and overlay dimensions if present
            if (field.placementMode) {
                newFieldData.placementMode = field.placementMode;
            }

            // V3.10: Calculate overlay dimensions from bbox if not explicitly set
            // This is critical for placementMode='auto' fields where AutoBoxer sets bbox but not overlayWidth/Height
            let overlayW = field.overlayWidth;
            let overlayH = field.overlayHeight;

            if (!overlayW || !overlayH) {
                // Calculate from bbox - convert normalized coords to screen pixels
                // bbox is [x, y, w, h] in normalized 0-1 coords
                const layerWidth = pdfDims.width;   // Already in pixels
                const layerHeight = pdfDims.height;
                overlayW = w * layerWidth;   // w is already extracted from bbox
                overlayH = h * layerHeight;  // h is already extracted from bbox
                console.log(`[DuplicateFieldDialog] Calculated overlay dims from bbox: ${overlayW.toFixed(1)}x${overlayH.toFixed(1)}`);
            }

            if (overlayW) {
                newFieldData.overlayWidth = overlayW;
            }
            if (overlayH) {
                newFieldData.overlayHeight = overlayH;
            }

            const newField = state.addField(newFieldData, true);

            if (newField) {
                createdFields.push(newField);
            }
        }

        console.log(`[DuplicateFieldDialog] Created ${createdFields.length} copies`);

        // Emit event for overlay refresh
        eventBus.emit(Events.FIELDS_CHANGED);

        // Show success message
        eventBus.emit(Events.TOAST_SHOW, {
            message: `נוצרו ${createdFields.length} עותקים`,
            type: 'success',
            duration: 2000
        });

        this.hide();
    }
}

// Singleton export
export const duplicateFieldDialog = new DuplicateFieldDialog();
