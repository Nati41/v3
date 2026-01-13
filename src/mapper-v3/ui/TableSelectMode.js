/**
 * TableSelectMode.js
 * V3.10: Simple table region selection mode
 *
 * User draws a rectangle around the table area.
 * System detects fields inside and asks for confirmation.
 */

import { eventBus, Events } from '../core/EventBus.js';
import { state, Tools } from '../core/StateManager.js';
import { tableRegionManager } from '../core/TableRegionManager.js';
import { pdfEngine } from '../engines/PDFEngine.js';

class TableSelectMode {
    constructor() {
        this._active = false;
        this._previousTool = null;
        this._confirmDialog = null;
    }

    /**
     * Check if mode is active
     */
    isActive() {
        return this._active;
    }

    /**
     * Start table selection mode
     */
    start() {
        if (this._active) return;

        this._active = true;
        this._previousTool = state.get('tool');

        // Set tool to DRAW_TABLE
        state.set('tool', Tools.DRAW_TABLE);

        // Show instruction toast
        this._showToast('צייר מלבן סביב הטבלה', 'info', 5000);

        console.log('[TableSelectMode] Started');
        eventBus.emit(Events.TABLE_SELECT_MODE_STARTED, {});

        // Listen for rectangle completion
        this._boundOnRectangleDrawn = this._onRectangleDrawn.bind(this);
        eventBus.on(Events.DRAW_END, this._boundOnRectangleDrawn);
    }

    /**
     * Cancel and exit mode
     */
    cancel() {
        if (!this._active) return;

        this._cleanup();
        this._showToast('בחירת טבלה בוטלה', 'warning');

        console.log('[TableSelectMode] Cancelled');
        eventBus.emit(Events.TABLE_SELECT_MODE_ENDED, { cancelled: true });
    }

    /**
     * Handle rectangle drawn
     * @param {Object} data - { bbox, screenCoords }
     */
    _onRectangleDrawn(data) {
        if (!this._active) return;

        // Get current tool - only process if it's DRAW_TABLE
        const tool = state.get('tool');
        if (tool !== Tools.DRAW_TABLE) return;

        const { bbox } = data;
        if (!bbox || bbox.length !== 4) {
            console.warn('[TableSelectMode] Invalid bbox:', bbox);
            return;
        }

        console.log('[TableSelectMode] Rectangle drawn:', bbox);

        // Create a temporary region to detect fields
        const tempRegion = tableRegionManager.createRegion(bbox);

        // Show confirmation dialog
        this._showConfirmDialog(tempRegion);
    }

    /**
     * Show confirmation dialog with detected fields
     * @param {TableRegion} region
     */
    _showConfirmDialog(region) {
        // Remove existing dialog if any
        if (this._confirmDialog) {
            this._confirmDialog.remove();
        }

        const columns = region.columns || [];

        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'table-region-confirm-dialog';
        dialog.innerHTML = `
            <div class="table-region-dialog-content">
                <h3>${columns.length > 0 ? `נמצאו ${columns.length} עמודות` : 'אזור טבלה נוצר'}</h3>
                ${columns.length > 0 ? `
                    <div class="table-region-columns-list">
                        ${columns.map(col => `
                            <div class="table-region-column-item">
                                <span class="col-name">${col.name_he || col.name_en || col.baseName}</span>
                                <span class="col-type">${this._getTypeLabel(col.type)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <p class="no-columns-message">מפה שדות בתוך האזור והם ישוכפלו אוטומטית לכל השורות</p>
                `}
                <div class="table-region-dialog-buttons">
                    <button class="btn-confirm">
                        ✓ המשך
                    </button>
                    <button class="btn-cancel">
                        ✗ ביטול
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        const confirmBtn = dialog.querySelector('.btn-confirm');
        const cancelBtn = dialog.querySelector('.btn-cancel');

        confirmBtn.addEventListener('click', () => {
            this._confirmRegion(region);
        });

        cancelBtn.addEventListener('click', () => {
            // Delete the temporary region
            tableRegionManager.deleteRegion(region.id);
            this._confirmDialog.remove();
            this._confirmDialog = null;
            // Stay in mode for another attempt
            this._showToast('נסה שוב - צייר מלבן סביב הטבלה', 'info');
        });

        // Position dialog
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10000;
        `;

        document.body.appendChild(dialog);
        this._confirmDialog = dialog;
    }

    /**
     * Confirm the region and proceed to next step
     * @param {TableRegion} region
     */
    _confirmRegion(region) {
        if (this._confirmDialog) {
            this._confirmDialog.remove();
            this._confirmDialog = null;
        }

        // Ask for row count
        this._showRowCountDialog(region);
    }

    /**
     * Show row count input dialog
     * @param {TableRegion} region
     */
    _showRowCountDialog(region) {
        const dialog = document.createElement('div');
        dialog.className = 'table-region-confirm-dialog';
        dialog.innerHTML = `
            <div class="table-region-dialog-content">
                <h3>כמה שורות בטבלה?</h3>
                <p class="row-count-hint">לא כולל כותרת</p>
                <input type="number" class="row-count-input" min="1" max="100" value="5" />
                <div class="table-region-dialog-buttons">
                    <button class="btn-confirm">✓ המשך</button>
                    <button class="btn-cancel">✗ ביטול</button>
                </div>
            </div>
        `;

        const input = dialog.querySelector('.row-count-input');
        const confirmBtn = dialog.querySelector('.btn-confirm');
        const cancelBtn = dialog.querySelector('.btn-cancel');

        confirmBtn.addEventListener('click', () => {
            const rowCount = parseInt(input.value, 10);
            if (rowCount > 0 && rowCount <= 100) {
                region.rowCount = rowCount;
                this._finishSetup(region);
                dialog.remove();
            }
        });

        cancelBtn.addEventListener('click', () => {
            tableRegionManager.deleteRegion(region.id);
            dialog.remove();
            this.cancel();
        });

        // Position and show
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10000;
        `;

        document.body.appendChild(dialog);
        this._confirmDialog = dialog;

        // Focus input
        input.focus();
        input.select();
    }

    /**
     * Finish setup and exit mode
     * @param {TableRegion} region
     */
    _finishSetup(region) {
        console.log('[TableSelectMode] Region confirmed:', region.id, 'with', region.rowCount, 'rows');

        this._showToast(`טבלה נוצרה: ${region.columns.length} עמודות, ${region.rowCount} שורות`, 'success');

        // Clean up and exit
        this._cleanup();

        eventBus.emit(Events.TABLE_SELECT_MODE_ENDED, { cancelled: false });
        eventBus.emit(Events.TABLE_REGION_UPDATED, { region });

        // Show next step hint
        setTimeout(() => {
            this._showToast('מפה שדה טקסט אחד בשורה הראשונה להגדרת גובה שורה', 'info', 8000);
        }, 1500);
    }

    /**
     * Clean up and restore previous state
     */
    _cleanup() {
        this._active = false;

        // Remove event listener
        if (this._boundOnRectangleDrawn) {
            eventBus.off(Events.DRAW_END, this._boundOnRectangleDrawn);
            this._boundOnRectangleDrawn = null;
        }

        // Remove dialog if exists
        if (this._confirmDialog) {
            this._confirmDialog.remove();
            this._confirmDialog = null;
        }

        // Restore previous tool
        if (this._previousTool) {
            state.set('tool', this._previousTool);
            this._previousTool = null;
        } else {
            state.set('tool', Tools.SELECT);
        }
    }

    /**
     * Get Hebrew type label
     */
    _getTypeLabel(type) {
        const labels = {
            'text': 'טקסט',
            'checkbox': 'תיבת סימון',
            'radio': 'בחירה',
            'signature': 'חתימה',
            'cell': 'תא'
        };
        return labels[type] || type;
    }

    /**
     * Show toast notification
     */
    _showToast(message, type = 'info', duration = 3000) {
        eventBus.emit(Events.TOAST_SHOW, { message, type, duration });
    }
}

// Singleton export
export const tableSelectMode = new TableSelectMode();

// Make available globally for button handler
if (typeof window !== 'undefined') {
    window.tableSelectMode = tableSelectMode;
}
