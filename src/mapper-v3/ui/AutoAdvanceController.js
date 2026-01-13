/**
 * AutoAdvanceController.js
 * V3.9: Automatic field advancement after mapping
 *
 * Features:
 * - Auto-advance to next unmapped field after mapping
 * - Field-type aware tool selection
 * - Toggle on/off
 *
 * Completely standalone - listens to events and controls flow.
 */

import { eventBus, Events } from '../core/EventBus.js';
import { state, Tools } from '../core/StateManager.js';

class AutoAdvanceController {
    constructor() {
        this.enabled = true; // Auto-advance is ON by default
        this._initialized = false;
    }

    /**
     * Initialize the controller
     */
    init() {
        if (this._initialized) return;

        // Listen for field mapped events
        eventBus.on(Events.FIELD_MAPPED, (data) => {
            if (this.enabled) {
                this._onFieldMapped(data);
            }
        });

        // Also listen for draw end (when bbox is set via drawing)
        eventBus.on(Events.DRAW_END, (data) => {
            if (this.enabled && data?.fieldId) {
                // Small delay to let the field update complete
                setTimeout(() => this._advanceToNext(data.fieldId), 100);
            }
        });

        // Keyboard shortcut: A to toggle auto-advance
        document.addEventListener('keydown', (e) => {
            // Don't trigger if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'a' || e.key === 'A' || e.key === 'ש') { // ש is Hebrew A
                if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                    this.toggle();
                }
            }

            // N or Space to skip to next field
            if (e.key === 'n' || e.key === 'N' || e.key === 'מ' || e.key === ' ') {
                if (!e.ctrlKey && !e.metaKey && !e.altKey && this.enabled) {
                    e.preventDefault();
                    this.skipToNext();
                }
            }
        });

        this._initialized = true;
        console.log('[AutoAdvance] Initialized - enabled:', this.enabled);
    }

    /**
     * Enable auto-advance
     */
    enable() {
        this.enabled = true;
        console.log('[AutoAdvance] Enabled');
        // Update button state directly instead of toast
        this._updateButtonState(true);
    }

    /**
     * Disable auto-advance
     */
    disable() {
        this.enabled = false;
        console.log('[AutoAdvance] Disabled');
        // Update button state directly instead of toast
        this._updateButtonState(false);
    }

    /**
     * Update toolbar button state
     */
    _updateButtonState(enabled) {
        const btn = document.getElementById('btn-auto-advance');
        if (btn) {
            btn.classList.toggle('active', enabled);
        }
    }

    /**
     * Toggle auto-advance
     */
    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
        return this.enabled;
    }

    /**
     * Check if enabled
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Handle field mapped event
     */
    _onFieldMapped(data) {
        const { fieldId } = data;
        console.log('[AutoAdvance] Field mapped:', fieldId);

        // Advance to next after short delay for UI to update
        setTimeout(() => this._advanceToNext(fieldId), 150);
    }

    /**
     * Advance to the next unmapped field
     */
    _advanceToNext(currentFieldId) {
        const fields = state.state.fields;
        const currentPage = state.state.document.currentPage;

        // Get unmapped fields on current page (no bbox)
        const unmappedFields = fields.filter(f =>
            f.page === currentPage &&
            !f.bbox &&
            f.id !== currentFieldId
        );

        if (unmappedFields.length === 0) {
            // Check if there are unmapped fields on other pages
            const allUnmapped = fields.filter(f => !f.bbox && f.id !== currentFieldId);

            if (allUnmapped.length === 0) {
                console.log('[AutoAdvance] All fields mapped!');
                eventBus.emit(Events.TOAST_SHOW, {
                    message: '🎉 כל השדות מופו!',
                    type: 'success',
                    duration: 3000
                });
                // Switch to select tool
                state.setTool(Tools.SELECT);
            } else {
                console.log('[AutoAdvance] No unmapped fields on this page');
                eventBus.emit(Events.TOAST_SHOW, {
                    message: `נותרו ${allUnmapped.length} שדות בעמודים אחרים`,
                    type: 'info',
                    duration: 3000
                });
            }
            return;
        }

        // Get the next field (first unmapped)
        const nextField = unmappedFields[0];

        console.log('[AutoAdvance] Advancing to:', nextField.id, nextField.label_he || nextField.name);

        // Select the next field
        state.selectField(nextField.id);

        // Set appropriate tool based on field type
        this._setToolForFieldType(nextField.type);

        // V3.9: No toast on auto-advance - let the sidebar selection speak for itself
        // The UI already highlights the selected field, no need for extra distraction
    }

    /**
     * Set tool based on field type
     */
    _setToolForFieldType(fieldType) {
        let tool = Tools.DRAW_TEXT; // Default

        switch (fieldType) {
            case 'text':
            case 'number':
            case 'date':
            case 'string':
                tool = Tools.DRAW_TEXT;
                break;

            case 'checkbox':
            case 'boolean':
                tool = Tools.DRAW_CHECKBOX;
                break;

            case 'radio':
            case 'radio_group':
            case 'choice':
                tool = Tools.DRAW_RADIO;
                break;

            case 'table':
                tool = Tools.DRAW_TABLE;
                break;

            default:
                tool = Tools.DRAW_TEXT;
        }

        state.setTool(tool);
        console.log('[AutoAdvance] Tool set to:', tool, 'for type:', fieldType);
    }

    /**
     * Manually advance to next field (for skip button)
     */
    skipToNext() {
        const currentFieldId = state.state.selection.fieldId;
        this._advanceToNext(currentFieldId);
    }

    /**
     * Get count of remaining unmapped fields
     */
    getRemainingCount() {
        const fields = state.state.fields;
        return fields.filter(f => !f.bbox).length;
    }

    /**
     * Get remaining unmapped fields on current page
     */
    getCurrentPageRemaining() {
        const fields = state.state.fields;
        const currentPage = state.state.document.currentPage;
        return fields.filter(f => f.page === currentPage && !f.bbox).length;
    }
}

// Singleton export
export const autoAdvanceController = new AutoAdvanceController();
