/**
 * ReverseMappingPanel.js
 * Validation and editing panel for AI-identified fields
 *
 * Shows:
 * - List of elements by number
 * - Editable label and canonical
 * - Radio groups grouped together
 * - Tables grouped with row count input
 */
import { eventBus } from '../core/EventBus.js';
import { ReverseTypes } from './ReverseMappingMode.js';

export class ReverseMappingPanel {
    constructor() {
        this.container = null;
        this.elements = [];
        this.aiResults = null;
        this.editedData = {};
        this.tableRowCounts = {};
    }

    /**
     * Open the panel with elements and AI results
     * @param {Array} elements - Array of elements
     * @param {Object} aiResults - AI identification results
     */
    open(elements, aiResults) {
        this.elements = elements;
        this.aiResults = aiResults;
        this.editedData = {};
        this.tableRowCounts = {};

        // Initialize edited data from AI results
        for (const element of elements) {
            const result = aiResults?.[String(element.number)] || {};
            this.editedData[element.number] = {
                label: result.label || element.label || '',
                canonical: result.canonical || element.canonical || '',
                radioGroup: result.radio_group || element.radioGroup || '',
                table: result.table || element.table || '',
                column: result.column || element.column || null
            };
        }

        this._createPanel();
        this._render();
    }

    /**
     * Close the panel
     */
    close() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }

    /**
     * Create panel DOM
     */
    _createPanel() {
        // Remove existing panel
        this.close();

        this.container = document.createElement('div');
        this.container.id = 'reverse-mapping-panel';
        this.container.className = 'reverse-mapping-panel';

        this.container.innerHTML = `
            <div class="reverse-panel-header">
                <h2>🧠 אימות שדות</h2>
                <button class="panel-close-btn" title="סגור">✕</button>
            </div>
            <div class="reverse-panel-content">
                <div class="reverse-panel-list"></div>
            </div>
            <div class="reverse-panel-footer">
                <button class="panel-btn cancel">ביטול</button>
                <button class="panel-btn confirm">אישור וסיום</button>
            </div>
        `;

        document.body.appendChild(this.container);

        // Bind events
        this._bindPanelEvents();
    }

    /**
     * Render panel content
     */
    _render() {
        const listContainer = this.container.querySelector('.reverse-panel-list');
        if (!listContainer) return;

        // Group elements by type
        const fields = [];
        const radios = {};
        const tables = {};
        const signatures = [];

        for (const element of this.elements) {
            const data = this.editedData[element.number];

            switch (element.type) {
                case ReverseTypes.RADIO:
                    const group = data.radioGroup || 'ungrouped';
                    if (!radios[group]) radios[group] = [];
                    radios[group].push({ element, data });
                    break;
                case ReverseTypes.TABLE:
                    const table = data.table || 'ungrouped';
                    if (!tables[table]) tables[table] = [];
                    tables[table].push({ element, data });
                    break;
                case ReverseTypes.SIGNATURE:
                    signatures.push({ element, data });
                    break;
                default:
                    fields.push({ element, data });
            }
        }

        let html = '';

        // Regular fields
        if (fields.length > 0) {
            html += `
                <div class="panel-section">
                    <h3>📝 שדות טקסט</h3>
                    ${fields.map(({ element, data }) => this._renderFieldRow(element, data)).join('')}
                </div>
            `;
        }

        // Radio groups
        if (Object.keys(radios).length > 0) {
            html += `<div class="panel-section"><h3>🔘 קבוצות רדיו</h3>`;
            for (const [groupName, items] of Object.entries(radios)) {
                html += `
                    <div class="radio-group-section">
                        <div class="group-header">
                            <label>שם קבוצה:</label>
                            <input type="text" class="radio-group-name" data-group="${groupName}" value="${groupName !== 'ungrouped' ? groupName : ''}">
                        </div>
                        ${items.map(({ element, data }) => this._renderRadioRow(element, data)).join('')}
                    </div>
                `;
            }
            html += `</div>`;
        }

        // Tables
        if (Object.keys(tables).length > 0) {
            html += `<div class="panel-section"><h3>▦ טבלאות</h3>`;
            for (const [tableName, items] of Object.entries(tables)) {
                // Sort by column
                items.sort((a, b) => (a.data.column || 0) - (b.data.column || 0));

                html += `
                    <div class="table-section">
                        <div class="table-header">
                            <span class="table-icon">▦</span>
                            <label>טבלה:</label>
                            <input type="text" class="table-name-input" data-table="${tableName}" value="${tableName !== 'ungrouped' ? tableName : ''}">
                        </div>
                        <div class="table-columns">
                            ${items.map(({ element, data }, idx) => this._renderTableRow(element, data, idx + 1)).join('')}
                        </div>
                        <div class="table-row-count">
                            <label>כמה שורות יש בטבלה?</label>
                            <input type="number" class="row-count-input" data-table="${tableName}" min="1" max="50" value="${this.tableRowCounts[tableName] || 10}">
                        </div>
                    </div>
                `;
            }
            html += `</div>`;
        }

        // Signatures
        if (signatures.length > 0) {
            html += `
                <div class="panel-section">
                    <h3>✍️ חתימות</h3>
                    ${signatures.map(({ element, data }) => this._renderFieldRow(element, data)).join('')}
                </div>
            `;
        }

        listContainer.innerHTML = html;

        // Bind input events
        this._bindInputEvents();
    }

    /**
     * Render a field row
     */
    _renderFieldRow(element, data) {
        const typeLabel = this._getTypeLabel(element.type);

        return `
            <div class="field-row" data-number="${element.number}">
                <div class="field-badge">
                    <span class="badge-num">${element.number}</span>
                    <span class="badge-type">${element.type}</span>
                </div>
                <div class="field-inputs">
                    <div class="input-group">
                        <label>תווית:</label>
                        <input type="text" class="field-label-input" data-number="${element.number}" value="${data.label || ''}" placeholder="תווית בעברית">
                    </div>
                    <div class="input-group">
                        <label>קנוניקל:</label>
                        <input type="text" class="field-canonical-input" data-number="${element.number}" value="${data.canonical || ''}" placeholder="canonical_name">
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render a radio option row
     */
    _renderRadioRow(element, data) {
        return `
            <div class="radio-row" data-number="${element.number}">
                <div class="field-badge radio">
                    <span class="badge-num">${element.number}</span>
                    <span class="badge-type">R</span>
                </div>
                <div class="field-inputs">
                    <div class="input-group">
                        <label>אפשרות:</label>
                        <input type="text" class="field-label-input" data-number="${element.number}" value="${data.label || ''}" placeholder="תווית האפשרות">
                    </div>
                    <div class="input-group">
                        <label>ערך:</label>
                        <input type="text" class="field-canonical-input" data-number="${element.number}" value="${data.canonical || ''}" placeholder="option_value">
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render a table cell row
     */
    _renderTableRow(element, data, columnNum) {
        return `
            <div class="table-row" data-number="${element.number}">
                <div class="field-badge table">
                    <span class="badge-num">${element.number}</span>
                    <span class="badge-type">T</span>
                    <span class="column-num">עמודה ${columnNum}</span>
                </div>
                <div class="field-inputs">
                    <div class="input-group">
                        <label>כותרת עמודה:</label>
                        <input type="text" class="field-label-input" data-number="${element.number}" value="${data.label || ''}" placeholder="כותרת העמודה">
                    </div>
                    <div class="input-group">
                        <label>קנוניקל:</label>
                        <input type="text" class="field-canonical-input" data-number="${element.number}" value="${data.canonical || ''}" placeholder="column_name">
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get type label
     */
    _getTypeLabel(type) {
        const labels = {
            [ReverseTypes.FIELD]: 'שדה טקסט',
            [ReverseTypes.CHECKBOX]: 'צ\'קבוקס',
            [ReverseTypes.RADIO]: 'רדיו',
            [ReverseTypes.TABLE]: 'תא טבלה',
            [ReverseTypes.SIGNATURE]: 'חתימה'
        };
        return labels[type] || type;
    }

    /**
     * Bind panel button events
     */
    _bindPanelEvents() {
        // Close button
        const closeBtn = this.container.querySelector('.panel-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Cancel button
        const cancelBtn = this.container.querySelector('.panel-btn.cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.close());
        }

        // Confirm button
        const confirmBtn = this.container.querySelector('.panel-btn.confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this._onConfirm());
        }
    }

    /**
     * Bind input change events
     */
    _bindInputEvents() {
        // Field label inputs
        this.container.querySelectorAll('.field-label-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const number = parseInt(e.target.dataset.number);
                if (this.editedData[number]) {
                    this.editedData[number].label = e.target.value;
                }
            });
        });

        // Field canonical inputs
        this.container.querySelectorAll('.field-canonical-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const number = parseInt(e.target.dataset.number);
                if (this.editedData[number]) {
                    this.editedData[number].canonical = e.target.value;
                }
            });
        });

        // Radio group name inputs
        this.container.querySelectorAll('.radio-group-name').forEach(input => {
            input.addEventListener('change', (e) => {
                const oldGroup = e.target.dataset.group;
                const newGroup = e.target.value;

                // Update all radios in this group
                for (const [num, data] of Object.entries(this.editedData)) {
                    if (data.radioGroup === oldGroup) {
                        data.radioGroup = newGroup;
                    }
                }

                e.target.dataset.group = newGroup;
            });
        });

        // Table name inputs
        this.container.querySelectorAll('.table-name-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const oldTable = e.target.dataset.table;
                const newTable = e.target.value;

                // Update all cells in this table
                for (const [num, data] of Object.entries(this.editedData)) {
                    if (data.table === oldTable) {
                        data.table = newTable;
                    }
                }

                // Update row counts key
                if (this.tableRowCounts[oldTable]) {
                    this.tableRowCounts[newTable] = this.tableRowCounts[oldTable];
                    delete this.tableRowCounts[oldTable];
                }

                e.target.dataset.table = newTable;
            });
        });

        // Table row count inputs
        this.container.querySelectorAll('.row-count-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const table = e.target.dataset.table;
                this.tableRowCounts[table] = parseInt(e.target.value) || 1;
            });
        });
    }

    /**
     * Handle confirm button
     */
    _onConfirm() {
        console.log('[ReverseMappingPanel] Confirming...');

        const confirmedData = {
            elements: this.editedData,
            tableRowCounts: this.tableRowCounts
        };

        // Emit confirmation event
        eventBus.emit('REVERSE_MAPPING_CONFIRMED', confirmedData);

        // Close panel
        this.close();
    }

    /**
     * Get current edited data
     */
    getEditedData() {
        return {
            elements: this.editedData,
            tableRowCounts: this.tableRowCounts
        };
    }
}
