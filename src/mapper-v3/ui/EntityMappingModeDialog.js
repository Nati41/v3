/**
 * EntityMappingModeDialog - Choice dialog for repeatable entity mapping mode
 *
 * V3.4: Shows when a repeatable entity pattern is detected (e.g., child_1_name, child_2_name)
 * Allows user to choose between:
 *   - TABLE mode: Use table flow for structured rows
 *   - BATCH mode: Use batch mapping for simple duplicates
 */
import { eventBus, Events } from '../core/EventBus.js';
import { templateStore, EntityMappingMode, TemplateFieldStatus } from '../core/TemplateStore.js';
import { state } from '../core/StateManager.js';
import { enhanceDialog, addDialogStyles } from './DialogUtils.js';

export class EntityMappingModeDialog {
    constructor() {
        this.dialog = null;
        this.overlay = null;
        this.onChoiceCallback = null;
        this.isOpen = false;
        this._currentEntityId = null;
        this._currentDetection = null;
    }

    /**
     * Initialize the dialog (create DOM elements)
     */
    init() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'entity-mode-dialog-overlay';
        this.overlay.style.display = 'none';

        // Create dialog container
        this.dialog = document.createElement('div');
        this.dialog.className = 'entity-mode-dialog';
        this.dialog.innerHTML = `
            <div class="dialog-header">
                <h3>זוהתה קבוצה חוזרת</h3>
                <button class="dialog-close" title="סגור">&times;</button>
            </div>
            <div class="dialog-body">
                <div class="detection-info">
                    <div class="detection-icon">🔄</div>
                    <div class="detection-text">
                        <div class="detection-title" id="entity-name">קבוצה חוזרת</div>
                        <div class="detection-subtitle" id="entity-details">
                            <span id="instance-count">0</span> חזרות,
                            <span id="column-count">0</span> עמודות
                        </div>
                    </div>
                </div>

                <div class="mode-question">איך לבצע את המיפוי?</div>

                <div class="mode-options">
                    <button class="mode-option" id="btn-table-mode">
                        <div class="mode-icon">📊</div>
                        <div class="mode-content">
                            <div class="mode-title">כטבלה</div>
                            <div class="mode-description">
                                מיפוי מובנה עם שורות ועמודות.
                                מומלץ כשיש מבנה טבלאי ברור.
                            </div>
                        </div>
                        <div class="mode-badge recommended">מומלץ</div>
                    </button>

                    <button class="mode-option" id="btn-batch-mode">
                        <div class="mode-icon">📑</div>
                        <div class="mode-content">
                            <div class="mode-title">כשדות בודדים</div>
                            <div class="mode-description">
                                מיפוי כל שדה בנפרד עם שכפול אוטומטי.
                                מתאים לשדות מפוזרים.
                            </div>
                        </div>
                    </button>
                </div>

                <div class="mode-note">
                    <strong>💡 טיפ:</strong> הבחירה תישמר לקבוצה זו. ניתן לשנות מאוחר יותר.
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

        // Listen for entity mapping mode prompts from other components
        eventBus.on(Events.ENTITY_MAPPING_MODE_PROMPT, (data) => {
            this.show(data);
        });

        console.log('[EntityMappingModeDialog] Initialized');
    }

    /**
     * Setup dialog event listeners
     */
    _setupListeners() {
        // Close button
        const closeBtn = this.dialog.querySelector('.dialog-close');
        closeBtn.addEventListener('click', () => this._cancel());

        // Overlay click to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this._cancel();
            }
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this._cancel();
            }
        });

        // Table mode button
        const tableBtn = this.dialog.querySelector('#btn-table-mode');
        tableBtn.addEventListener('click', () => this._choose(EntityMappingMode.TABLE));

        // Batch mode button
        const batchBtn = this.dialog.querySelector('#btn-batch-mode');
        batchBtn.addEventListener('click', () => this._choose(EntityMappingMode.BATCH));
    }

    /**
     * Add component styles
     */
    _addStyles() {
        if (document.getElementById('entity-mode-dialog-styles')) return;

        const style = document.createElement('style');
        style.id = 'entity-mode-dialog-styles';
        style.textContent = `
            .entity-mode-dialog-overlay {
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
                backdrop-filter: blur(2px);
            }

            .entity-mode-dialog {
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                width: 400px;
                max-width: 90vw;
                direction: rtl;
                overflow: hidden;
            }

            .entity-mode-dialog .dialog-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }

            .entity-mode-dialog .dialog-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
            }

            .entity-mode-dialog .dialog-close {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                opacity: 0.8;
            }

            .entity-mode-dialog .dialog-close:hover {
                opacity: 1;
            }

            .entity-mode-dialog .dialog-body {
                padding: 20px;
            }

            .detection-info {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px;
                background: #f3f4f6;
                border-radius: 8px;
                margin-bottom: 20px;
            }

            .detection-icon {
                font-size: 32px;
                line-height: 1;
            }

            .detection-title {
                font-size: 16px;
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 4px;
            }

            .detection-subtitle {
                font-size: 13px;
                color: #6b7280;
            }

            .mode-question {
                font-size: 15px;
                font-weight: 600;
                color: #374151;
                margin-bottom: 16px;
                text-align: center;
            }

            .mode-options {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .mode-option {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 16px;
                background: white;
                border: 2px solid #e5e7eb;
                border-radius: 10px;
                cursor: pointer;
                text-align: right;
                transition: all 0.2s ease;
            }

            .mode-option:hover {
                border-color: #667eea;
                background: #f8faff;
            }

            .mode-option:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
            }

            .mode-icon {
                font-size: 28px;
                line-height: 1;
                flex-shrink: 0;
            }

            .mode-content {
                flex: 1;
            }

            .mode-title {
                font-size: 15px;
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 4px;
            }

            .mode-description {
                font-size: 12px;
                color: #6b7280;
                line-height: 1.5;
            }

            .mode-badge {
                font-size: 10px;
                padding: 2px 8px;
                border-radius: 12px;
                font-weight: 600;
                white-space: nowrap;
            }

            .mode-badge.recommended {
                background: #d1fae5;
                color: #065f46;
            }

            .mode-note {
                margin-top: 16px;
                padding: 12px;
                background: #fef3c7;
                border-radius: 8px;
                font-size: 12px;
                color: #92400e;
                line-height: 1.5;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show the dialog with detection info
     * @param {Object} options - Dialog options
     * @param {string} options.entityId - Entity ID
     * @param {Object} options.detection - Detection result from detectRepeatableEntity()
     * @param {Object} options.entity - Entity definition (optional)
     * @param {string} options.mappedFieldId - ID of field that was just mapped (for cleanup)
     * @param {string} options.mappedTemplateFieldId - Template field ID that was just mapped
     * @returns {Promise<string|null>} Resolved with mode choice or null if cancelled
     */
    show({ entityId, detection, entity, mappedFieldId, mappedTemplateFieldId } = {}) {
        return new Promise((resolve) => {
            this._currentEntityId = entityId;
            this._currentDetection = detection;
            // V3.4: Store mapped field info for cleanup if TABLE mode chosen
            this._mappedFieldId = mappedFieldId;
            this._mappedTemplateFieldId = mappedTemplateFieldId;

            // Update UI with detection info
            const entityName = entity?.label_he || entity?.entity_name_he || detection?.prefix || entityId;
            this.dialog.querySelector('#entity-name').textContent = `"${entityName}"`;
            this.dialog.querySelector('#instance-count').textContent = detection?.instances?.length || 0;
            this.dialog.querySelector('#column-count').textContent = detection?.columns?.length || 0;

            // Setup callback
            this.onChoiceCallback = (mode) => {
                resolve(mode);
            };

            // Show dialog
            this.overlay.style.display = 'flex';
            this.isOpen = true;

            // Focus first button
            setTimeout(() => {
                this.dialog.querySelector('#btn-table-mode').focus();
            }, 100);

            console.log('[EntityMappingModeDialog] Showing for entity:', entityId, detection);
        });
    }

    /**
     * Handle mode choice
     * @param {string} mode - EntityMappingMode value
     */
    _choose(mode) {
        if (!this.isOpen) return;

        const entityId = this._currentEntityId;
        const detection = this._currentDetection;

        // Save choice in TemplateStore
        templateStore.setEntityMappingMode(entityId, mode);

        // V3.4: If TABLE mode chosen, remove the field that was just mapped
        // (it will be replaced by the table)
        if (mode === EntityMappingMode.TABLE && this._mappedFieldId) {
            console.log('[EntityMappingModeDialog] TABLE mode - removing mapped field:', this._mappedFieldId);

            // Delete the field from state
            state.deleteField(this._mappedFieldId);

            // Reset template field status back to unmapped
            if (this._mappedTemplateFieldId) {
                templateStore.setFieldStatus(this._mappedTemplateFieldId, TemplateFieldStatus.UNMAPPED);
                templateStore.unlinkMappedField(this._mappedTemplateFieldId);
            }
        }

        // Emit event for other components
        eventBus.emit(Events.ENTITY_MAPPING_MODE_CHANGED, {
            entityId,
            mode,
            detection
        });

        // If table mode, also trigger table flow start
        if (mode === EntityMappingMode.TABLE) {
            const columns = templateStore.getRepeatableEntityColumns(entityId);
            eventBus.emit(Events.ENTITY_TABLE_FLOW_START, {
                entityId,
                columns,
                rowCount: detection?.instances?.length || 0
            });
        }

        console.log(`[EntityMappingModeDialog] User chose: ${mode} for entity: ${entityId}`);

        // Save callback before hiding
        const callback = this.onChoiceCallback;

        // Hide dialog
        this._hide();

        // Call callback
        if (callback) {
            callback(mode);
        }

        // Show toast
        const modeLabel = mode === EntityMappingMode.TABLE ? 'כטבלה' : 'כשדות בודדים';
        eventBus.emit(Events.TOAST_SHOW, {
            message: `הקבוצה תמופה ${modeLabel}`,
            type: 'success'
        });
    }

    /**
     * Cancel and close dialog (defaults to BATCH mode)
     */
    _cancel() {
        if (!this.isOpen) return;

        // Default to BATCH mode if cancelled
        const entityId = this._currentEntityId;
        if (entityId) {
            templateStore.setEntityMappingMode(entityId, EntityMappingMode.BATCH);
            console.log('[EntityMappingModeDialog] Cancelled - defaulting to BATCH mode');
        }

        this._hide();

        if (this.onChoiceCallback) {
            this.onChoiceCallback(EntityMappingMode.BATCH);
        }
    }

    /**
     * Hide the dialog
     */
    _hide() {
        this.overlay.style.display = 'none';
        this.isOpen = false;
        this.onChoiceCallback = null;
        this._currentEntityId = null;
        this._currentDetection = null;
        // V3.4: Clear mapped field info
        this._mappedFieldId = null;
        this._mappedTemplateFieldId = null;
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
export const entityMappingModeDialog = new EntityMappingModeDialog();
