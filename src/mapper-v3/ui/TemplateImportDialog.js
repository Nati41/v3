/**
 * TemplateImportDialog - UI for loading AI-generated template skeletons
 * V3.3: Template-guided mapping workflow
 */
import { eventBus, Events } from '../core/EventBus.js';
import { templateStore } from '../core/TemplateStore.js';
import { state } from '../core/StateManager.js';
import { makeDraggable } from './DialogUtils.js';

export class TemplateImportDialog {
    constructor() {
        this.dialog = null;
        this.isOpen = false;
        this._dragController = null;
    }

    /**
     * Initialize the dialog
     */
    init() {
        this._createDialog();
        this._setupEventListeners();
        console.log('[TemplateImportDialog] Initialized');
    }

    /**
     * Create the dialog DOM structure
     */
    _createDialog() {
        // Check if dialog already exists
        if (document.getElementById('template-import-dialog')) {
            this.dialog = document.getElementById('template-import-dialog');
            return;
        }

        const dialogHtml = `
            <div id="template-import-dialog" class="dialog-overlay hidden">
                <div class="dialog-box template-import-dialog">
                    <div class="dialog-header">
                        <h3>טעינת תבנית AI</h3>
                        <button class="dialog-close" title="סגור">&times;</button>
                    </div>
                    <div class="dialog-body">
                        <div class="template-input-section">
                            <div class="form-group">
                                <label>בחר קובץ JSON או הדבק תוכן:</label>
                                <div class="file-input-wrapper">
                                    <input type="file" id="template-file-input" accept=".json" hidden>
                                    <button class="btn-choose-file">
                                        <span class="icon">📁</span>
                                        בחר קובץ
                                    </button>
                                    <span class="file-name">לא נבחר קובץ</span>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>או הדבק JSON ישירות:</label>
                                <textarea id="template-json-input"
                                    class="dialog-input template-textarea"
                                    placeholder='{"entities": [...], "fields": [...], ...}'
                                    rows="6"></textarea>
                            </div>
                        </div>

                        <div class="template-preview-section hidden">
                            <div class="preview-header">
                                <span class="preview-icon">📋</span>
                                <span class="preview-title">תצוגה מקדימה</span>
                            </div>
                            <div class="preview-content">
                                <div class="preview-stat">
                                    <span class="stat-icon">📑</span>
                                    <span class="stat-label">ישויות:</span>
                                    <span class="stat-value" id="preview-entity-count">0</span>
                                </div>
                                <div class="preview-stat">
                                    <span class="stat-icon">📝</span>
                                    <span class="stat-label">שדות:</span>
                                    <span class="stat-value" id="preview-field-count">0</span>
                                </div>
                                <div class="preview-stat">
                                    <span class="stat-icon">📊</span>
                                    <span class="stat-label">טבלאות:</span>
                                    <span class="stat-value" id="preview-table-count">0</span>
                                </div>
                                <div class="preview-stat exception-stat hidden">
                                    <span class="stat-icon">⚠️</span>
                                    <span class="stat-label">חריגות לבדיקה:</span>
                                    <span class="stat-value" id="preview-exception-count">0</span>
                                </div>
                            </div>
                            <div class="preview-entities hidden" id="preview-entities-list">
                                <div class="entities-title">ישויות שזוהו:</div>
                                <div class="entities-list"></div>
                            </div>
                        </div>

                        <div class="template-error hidden" id="template-error">
                            <span class="error-icon">❌</span>
                            <span class="error-message"></span>
                        </div>
                    </div>
                    <div class="dialog-footer">
                        <button class="btn-cancel">ביטול</button>
                        <button class="btn-confirm" disabled>
                            <span class="icon">✅</span>
                            טען תבנית
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', dialogHtml);
        this.dialog = document.getElementById('template-import-dialog');

        // Make draggable
        const dialogBox = this.dialog.querySelector('.dialog-box');
        const header = this.dialog.querySelector('.dialog-header');
        if (dialogBox && header) {
            this._dragController = makeDraggable(dialogBox, header);
        }
    }

    /**
     * Setup event listeners
     */
    _setupEventListeners() {
        if (!this.dialog) return;

        // Close button
        this.dialog.querySelector('.dialog-close').addEventListener('click', () => {
            this.close();
        });

        // Cancel button
        this.dialog.querySelector('.btn-cancel').addEventListener('click', () => {
            this.close();
        });

        // Confirm button
        this.dialog.querySelector('.btn-confirm').addEventListener('click', () => {
            this._importTemplate();
        });

        // File input
        const fileInput = this.dialog.querySelector('#template-file-input');
        const chooseBtn = this.dialog.querySelector('.btn-choose-file');

        chooseBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                this.dialog.querySelector('.file-name').textContent = file.name;
                try {
                    const text = await file.text();
                    this.dialog.querySelector('#template-json-input').value = text;
                    this._validateAndPreview(text);
                } catch (err) {
                    this._showError('שגיאה בקריאת הקובץ: ' + err.message);
                }
            }
            e.target.value = ''; // Reset for re-selection
        });

        // Textarea input - validate on change
        const textarea = this.dialog.querySelector('#template-json-input');
        let debounceTimer;
        textarea.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const text = textarea.value.trim();
                if (text) {
                    this._validateAndPreview(text);
                } else {
                    this._hidePreview();
                    this._hideError();
                    this.dialog.querySelector('.btn-confirm').disabled = true;
                }
            }, 300);
        });

        // Close on overlay click
        this.dialog.addEventListener('click', (e) => {
            if (e.target === this.dialog) {
                this.close();
            }
        });

        // Keyboard shortcuts
        this.dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === 'Enter' && e.ctrlKey) {
                const confirmBtn = this.dialog.querySelector('.btn-confirm');
                if (!confirmBtn.disabled) {
                    this._importTemplate();
                }
            }
        });
    }

    /**
     * Validate JSON and show preview
     */
    _validateAndPreview(jsonText) {
        try {
            let data = JSON.parse(jsonText);

            // V3.4: Support flat array format [{ name, label_he, ... }, ...]
            if (Array.isArray(data)) {
                // Convert flat array to object format for preview
                // TemplateStore will handle full conversion during import
                data = { fields: data, _isFlatFormat: true };
            }

            // Basic validation
            if (!data.fields || !Array.isArray(data.fields)) {
                throw new Error('חסר מערך "fields" בתבנית');
            }

            // Store parsed data for import
            this._parsedTemplate = data;

            // Calculate stats - for flat format, count unique groups as entities
            let entityCount = (data.entities || []).length;
            if (entityCount === 0 && data._isFlatFormat) {
                // Count unique groups in flat format
                const groups = new Set(data.fields.map(f => f.group || f.entity_id).filter(Boolean));
                entityCount = groups.size;
            }
            const fieldCount = data.fields.length;
            const tableCount = (data.tables || []).length;
            const exceptionCount = (data.exceptions || []).length;

            // Update preview
            this.dialog.querySelector('#preview-entity-count').textContent = entityCount;
            this.dialog.querySelector('#preview-field-count').textContent = fieldCount;
            this.dialog.querySelector('#preview-table-count').textContent = tableCount;

            const exceptionStat = this.dialog.querySelector('.exception-stat');
            if (exceptionCount > 0) {
                this.dialog.querySelector('#preview-exception-count').textContent = exceptionCount;
                exceptionStat.classList.remove('hidden');
            } else {
                exceptionStat.classList.add('hidden');
            }

            // Show entity list if available
            const entitiesList = this.dialog.querySelector('#preview-entities-list');
            if (entityCount > 0) {
                let listHtml;
                if (data.entities && data.entities.length > 0) {
                    // Standard skeleton format
                    listHtml = data.entities.map(e =>
                        `<span class="entity-tag">${this._escapeHtml(e.label_he || e.label_en || e.id)}</span>`
                    ).join('');
                } else if (data._isFlatFormat) {
                    // V3.4: Flat format - extract unique group names
                    const groupMap = new Map();
                    data.fields.forEach(f => {
                        const groupId = f.group || f.entity_id;
                        const groupName = f.group_name || f.entity_name_he || groupId;
                        if (groupId && !groupMap.has(groupId)) {
                            groupMap.set(groupId, groupName);
                        }
                    });
                    listHtml = Array.from(groupMap.values()).map(name =>
                        `<span class="entity-tag">${this._escapeHtml(name)}</span>`
                    ).join('');
                }
                entitiesList.querySelector('.entities-list').innerHTML = listHtml || '';
                entitiesList.classList.remove('hidden');
            } else {
                entitiesList.classList.add('hidden');
            }

            // Show preview, hide error
            this.dialog.querySelector('.template-preview-section').classList.remove('hidden');
            this._hideError();

            // Enable confirm button
            this.dialog.querySelector('.btn-confirm').disabled = false;

        } catch (err) {
            this._parsedTemplate = null;
            this._showError('JSON לא תקין: ' + err.message);
            this._hidePreview();
            this.dialog.querySelector('.btn-confirm').disabled = true;
        }
    }

    /**
     * Import the validated template
     */
    _importTemplate() {
        if (!this._parsedTemplate) {
            this._showError('אין תבנית תקינה לטעינה');
            return;
        }

        try {
            // Load template into TemplateStore
            // V3.4: If this was originally a flat array, pass fields array directly
            // to let TemplateStore handle the conversion properly
            const templateData = this._parsedTemplate._isFlatFormat
                ? this._parsedTemplate.fields
                : this._parsedTemplate;
            templateStore.loadTemplate(templateData);

            // Import fields into StateManager
            state.importTemplateFields(templateStore);

            // Show success toast
            const stats = templateStore.getMappingProgress();
            eventBus.emit(Events.TOAST_SHOW, {
                message: `תבנית נטענה: ${stats.total} שדות לממות`,
                type: 'success',
                duration: 4000
            });

            // Close dialog
            this.close();

            // Check for exceptions that need resolution
            if (templateStore.hasExceptions()) {
                setTimeout(() => {
                    eventBus.emit(Events.TOAST_SHOW, {
                        message: `${templateStore.getExceptions().length} חריגות דורשות בדיקה`,
                        type: 'warning',
                        duration: 5000,
                        action: {
                            label: 'בדוק עכשיו',
                            callback: () => {
                                // TODO: Open exception review panel
                                console.log('[TemplateImportDialog] Open exception review');
                            }
                        }
                    });
                }, 500);
            }

        } catch (err) {
            console.error('[TemplateImportDialog] Import failed:', err);
            this._showError('שגיאה בטעינת התבנית: ' + err.message);
        }
    }

    /**
     * Show error message
     */
    _showError(message) {
        const errorEl = this.dialog.querySelector('#template-error');
        errorEl.querySelector('.error-message').textContent = message;
        errorEl.classList.remove('hidden');
    }

    /**
     * Hide error message
     */
    _hideError() {
        this.dialog.querySelector('#template-error').classList.add('hidden');
    }

    /**
     * Hide preview section
     */
    _hidePreview() {
        this.dialog.querySelector('.template-preview-section').classList.add('hidden');
    }

    /**
     * Escape HTML
     */
    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Open the dialog
     */
    open() {
        if (!this.dialog) {
            this._createDialog();
            this._setupEventListeners();
        }

        // Reset state
        this._parsedTemplate = null;
        this.dialog.querySelector('#template-json-input').value = '';
        this.dialog.querySelector('.file-name').textContent = 'לא נבחר קובץ';
        this._hidePreview();
        this._hideError();
        this.dialog.querySelector('.btn-confirm').disabled = true;

        // Show dialog
        this.dialog.classList.remove('hidden');
        this.isOpen = true;

        // Focus textarea
        setTimeout(() => {
            this.dialog.querySelector('#template-json-input').focus();
        }, 100);

        console.log('[TemplateImportDialog] Opened');
    }

    /**
     * Close the dialog
     */
    close() {
        if (this.dialog) {
            this.dialog.classList.add('hidden');
        }
        this.isOpen = false;
        this._parsedTemplate = null;
        console.log('[TemplateImportDialog] Closed');
    }

    /**
     * Toggle dialog visibility
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
}

// Singleton instance
export const templateImportDialog = new TemplateImportDialog();
