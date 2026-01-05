/**
 * SidebarController - Modern Field List Sidebar for Mapper V3
 * Clean, minimalist design with full functionality
 */
import { state, Tools, Modes } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { overlayRenderer } from '../engines/OverlayRenderer.js';

export class SidebarController {
    constructor() {
        this.container = null;
        this.fieldList = null;
        this.searchInput = null;
        this.searchTerm = '';
        this.expandedFieldId = null;
        this.selectedForMapping = null; // Field selected for mapping (unmapped)
    }

    /**
     * Initialize the controller
     */
    init(options = {}) {
        this.options = {
            containerId: 'sidebar-container',
            fieldListId: 'field-list',
            searchInputId: 'field-search',
            ...options
        };

        this.container = document.getElementById(this.options.containerId);
        this.fieldList = document.getElementById(this.options.fieldListId);
        this.searchInput = document.getElementById(this.options.searchInputId);

        if (!this.container || !this.fieldList) {
            console.warn('[SidebarController] Container or field list not found');
            return;
        }

        this._setupListeners();
        console.log('[SidebarController] Initialized');
    }

    /**
     * Setup event listeners
     */
    _setupListeners() {
        // Search input
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.render();
            });
        }

        // State changes
        eventBus.on(Events.STATE_CHANGED, () => this.render());
        eventBus.on(Events.FIELD_CREATED, () => this.render());
        eventBus.on(Events.FIELD_UPDATED, () => this.render());
        eventBus.on(Events.FIELD_DELETED, () => this.render());
        eventBus.on(Events.PDF_PAGE_CHANGED, () => this.render());
        eventBus.on(Events.PROJECT_LOAD, () => this.render());

        // Radio group changes
        eventBus.on(Events.RADIO_GROUP_CREATED, () => this.render());
        eventBus.on(Events.RADIO_GROUP_UPDATED, () => this.render());
        eventBus.on(Events.RADIO_GROUP_DELETED, () => this.render());
        eventBus.on(Events.RADIO_GROUP_BUILDING_FINISHED, () => this.render());

        // Table changes
        eventBus.on(Events.TABLE_CREATED, () => this.render());
        eventBus.on(Events.TABLE_UPDATED, () => this.render());
        eventBus.on(Events.TABLE_DELETED, () => this.render());

        // Selection changes - update without full re-render
        eventBus.on(Events.FIELD_SELECTED, ({ fieldId }) => {
            this._updateSelectionUI(fieldId);
        });

        eventBus.on(Events.FIELD_DESELECTED, () => {
            this._updateSelectionUI(null);
        });

        // Listen for draw end to clear selectedForMapping
        eventBus.on(Events.DRAW_END, ({ field }) => {
            if (this.selectedForMapping && field) {
                // Link the drawn field to the selected unmapped field
                this._linkDrawnField(field.id);
            }
        });
    }

    /**
     * Render the field list
     */
    render() {
        if (!this.fieldList) return;

        const fields = state.get('fields') || [];
        const currentPage = state.get('document.currentPage');
        const selectedId = state.get('selection.fieldId');

        // Filter by current page
        let pageFields = fields.filter(f => f.page === currentPage);

        // Filter by search term
        if (this.searchTerm) {
            pageFields = pageFields.filter(f => {
                const searchText = `${f.label_he || ''} ${f.label_en || ''} ${f.id || ''}`.toLowerCase();
                return searchText.includes(this.searchTerm);
            });
        }

        // Separate mapped and unmapped
        const unmappedFields = pageFields.filter(f => !f.isMapped);
        const mappedFields = pageFields.filter(f => f.isMapped);

        // Build HTML
        let html = '';

        // Unmapped fields section (if any)
        if (unmappedFields.length > 0) {
            html += `
                <div class="field-section">
                    <div class="section-header">
                        <span class="section-icon">📋</span>
                        <span class="section-title">ממתינים למיפוי (${unmappedFields.length})</span>
                    </div>
                    <div class="section-hint">לחץ על שדה ← בחר כלי ציור ← צייר על ה-PDF</div>
                    <div class="field-items">
                        ${unmappedFields.map(f => this._renderFieldItem(f, selectedId, false)).join('')}
                    </div>
                </div>
            `;
        }

        // Mapped fields section
        if (mappedFields.length > 0) {
            html += `
                <div class="field-section">
                    <div class="section-header">
                        <span class="section-icon">✅</span>
                        <span class="section-title">שדות ממופים (${mappedFields.length})</span>
                    </div>
                    <div class="field-items">
                        ${mappedFields.map(f => this._renderFieldItem(f, selectedId, true)).join('')}
                    </div>
                </div>
            `;
        }

        // Radio groups section
        const radioGroups = (state.get('radioGroups') || []).filter(g => g.page === currentPage);
        if (radioGroups.length > 0) {
            html += `
                <div class="field-section radio-groups-section">
                    <div class="section-header">
                        <span class="section-icon">🔘</span>
                        <span class="section-title">קבוצות רדיו (${radioGroups.length})</span>
                    </div>
                    <div class="field-items">
                        ${radioGroups.map(g => this._renderRadioGroupItem(g)).join('')}
                    </div>
                </div>
            `;
        }

        // Tables section
        const tables = (state.get('tables') || []).filter(t => t.page === currentPage);
        if (tables.length > 0) {
            html += `
                <div class="field-section tables-section">
                    <div class="section-header">
                        <span class="section-icon">📊</span>
                        <span class="section-title">טבלאות (${tables.length})</span>
                    </div>
                    <div class="field-items">
                        ${tables.map(t => this._renderTableItem(t)).join('')}
                    </div>
                </div>
            `;
        }

        // Empty state
        const totalItems = pageFields.length + radioGroups.length + tables.length;
        if (totalItems === 0) {
            html = `
                <div class="empty-state">
                    <div class="empty-icon">📄</div>
                    <div class="empty-title">${this.searchTerm ? 'לא נמצאו שדות' : 'אין שדות בעמוד זה'}</div>
                    <div class="empty-hint">${this.searchTerm ? 'נסה חיפוש אחר' : 'טען PDF וייבא JSON או צור שדות חדשים'}</div>
                </div>
            `;
        }

        this.fieldList.innerHTML = html;

        // Attach event handlers
        this._attachEventHandlers();

        console.log(`[SidebarController] Rendered ${pageFields.length} fields`);
    }

    /**
     * Render a single field item
     */
    _renderFieldItem(field, selectedId, isMapped) {
        const isSelected = field.id === selectedId;
        const isExpanded = this.expandedFieldId === field.id;
        const isSelectedForMapping = this.selectedForMapping === field.id;
        const typeIcon = this._getTypeIcon(field.type);

        // Names
        const hebrewName = field.label_he || field.labelHe || field.hebrewName || '';
        const englishName = field.label_en || field.labelEn || field.englishId || field.id || '';
        const displayName = hebrewName || `שדה ${field.id.split('_')[1] || ''}`;

        // Classes
        let classes = ['field-item'];
        if (isSelected) classes.push('selected');
        if (isExpanded) classes.push('expanded');
        if (isMapped) classes.push('mapped');
        else classes.push('unmapped');
        if (isSelectedForMapping) classes.push('ready-to-map');

        return `
            <div class="${classes.join(' ')}" data-field-id="${field.id}">
                <div class="field-header">
                    <span class="field-icon">${typeIcon}</span>
                    <div class="field-names">
                        <div class="field-name-he">${this._escapeHtml(displayName)}</div>
                        <div class="field-name-en">${this._escapeHtml(englishName)}</div>
                    </div>
                    <div class="field-actions">
                        ${!isMapped ? `
                            <button class="btn-map" title="בחר למיפוי">🎯</button>
                        ` : ''}
                        <button class="btn-expand" title="הרחב">${isExpanded ? '▲' : '▼'}</button>
                    </div>
                </div>
                ${isExpanded ? this._renderFieldEditor(field) : ''}
            </div>
        `;
    }

    /**
     * Render a radio group item in the sidebar
     * @param {Object} group - Radio group object
     * @returns {string} HTML string
     */
    _renderRadioGroupItem(group) {
        const groupName = group.groupName || 'קבוצת רדיו';
        const groupNameEn = group.groupNameEn || group.groupId;
        const optionCount = (group.options || []).length;

        return `
            <div class="field-item radio-group-item mapped" data-group-id="${group.groupId}">
                <div class="field-header">
                    <span class="field-icon">🔘</span>
                    <div class="field-names">
                        <div class="field-name-he">${this._escapeHtml(groupName)}</div>
                        <div class="field-name-en">${this._escapeHtml(groupNameEn)}</div>
                    </div>
                    <div class="field-badge">${optionCount} אפשרויות</div>
                </div>
                <div class="radio-options-preview">
                    ${(group.options || []).map((opt, i) => `
                        <div class="radio-option-mini">
                            <span class="option-num">${i + 1}</span>
                            <span class="option-label">${this._escapeHtml(opt.label_he || opt.label || `אפשרות ${i + 1}`)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render a table item in the sidebar
     * @param {Object} table - Table object from state
     * @returns {string} HTML string
     */
    _renderTableItem(table) {
        const columnCount = (table.columns || []).length;
        const rowCount = table.rowCount || 0;

        // Build table name: prefer tableTitle (semantic), fallback to column names
        let tableName;
        if (table.tableTitle && typeof table.tableTitle === 'object' && table.tableTitle.text) {
            // New format: tableTitle is an object with text property
            tableName = table.tableTitle.text;
        } else if (table.tableTitle && typeof table.tableTitle === 'string') {
            // Backwards compatibility: tableTitle is a string
            tableName = table.tableTitle;
        } else {
            // Fallback to column names
            const firstColumnNames = (table.columns || [])
                .slice(0, 2)
                .map(col => col.hebrewName || col.columnId)
                .filter(n => n)
                .join(', ');
            tableName = firstColumnNames || `טבלה ${columnCount}×${rowCount}`;
        }

        // Get column names for preview
        const columnNames = (table.columns || []).map(col => col.hebrewName || col.columnId || 'עמודה').slice(0, 3);
        const moreColumns = columnCount > 3 ? ` +${columnCount - 3}` : '';

        return `
            <div class="field-item table-item mapped" data-table-id="${table.tableId}">
                <div class="field-header">
                    <span class="field-icon">📊</span>
                    <div class="field-names">
                        <div class="field-name-he">${this._escapeHtml(tableName)}</div>
                        <div class="field-name-en">${table.tableId}</div>
                    </div>
                    <div class="field-badge">${columnCount}×${rowCount}</div>
                </div>
                <div class="table-preview">
                    <div class="table-info-row">
                        <span class="info-label">עמודות:</span>
                        <span class="info-value">${columnNames.map(n => this._escapeHtml(n)).join(', ')}${moreColumns}</span>
                    </div>
                    <div class="table-info-row">
                        <span class="info-label">שורות:</span>
                        <span class="info-value">${rowCount}</span>
                    </div>
                </div>
                <div class="table-actions">
                    <button class="btn-table-highlight" data-table-id="${table.tableId}" title="הדגש טבלה">👁️</button>
                    <button class="btn-table-delete" data-table-id="${table.tableId}" title="מחק טבלה">🗑️</button>
                </div>
            </div>
        `;
    }

    /**
     * Render the expanded field editor
     */
    _renderFieldEditor(field) {
        const hebrewName = field.label_he || field.labelHe || field.hebrewName || '';
        const englishName = field.label_en || field.labelEn || field.englishId || field.id || '';

        // Bbox info
        let positionInfo = 'לא ממופה';
        if (field.bbox && Array.isArray(field.bbox)) {
            const [x, y, w, h] = field.bbox.map(v => (v * 100).toFixed(1));
            positionInfo = `X: ${x}%, Y: ${y}%, W: ${w}%, H: ${h}%`;
        } else if (field.anchor && Array.isArray(field.anchor)) {
            const [x, y] = field.anchor.map(v => (v * 100).toFixed(1));
            positionInfo = `מרכז: ${x}%, ${y}%`;
        }

        return `
            <div class="field-editor">
                <div class="editor-row">
                    <label>שם עברי</label>
                    <input type="text"
                           class="input-he"
                           value="${this._escapeHtml(hebrewName)}"
                           data-field-id="${field.id}"
                           data-property="label_he"
                           placeholder="הזן שם בעברית">
                </div>
                <div class="editor-row">
                    <label>מזהה אנגלי</label>
                    <input type="text"
                           class="input-en"
                           value="${this._escapeHtml(englishName)}"
                           data-field-id="${field.id}"
                           data-property="label_en"
                           placeholder="English ID">
                </div>
                <div class="editor-row">
                    <label>סוג שדה</label>
                    <select class="select-type" data-field-id="${field.id}">
                        <option value="text" ${field.type === 'text' ? 'selected' : ''}>טקסט</option>
                        <option value="number" ${field.type === 'number' ? 'selected' : ''}>מספר</option>
                        <option value="date" ${field.type === 'date' ? 'selected' : ''}>תאריך</option>
                        <option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                        <option value="radio" ${field.type === 'radio' ? 'selected' : ''}>Radio</option>
                        <option value="signature" ${field.type === 'signature' ? 'selected' : ''}>חתימה</option>
                    </select>
                </div>
                <div class="editor-row info-row">
                    <label>מיקום</label>
                    <span class="info-value">${positionInfo}</span>
                </div>
                <div class="editor-row info-row">
                    <label>עמוד</label>
                    <span class="info-value">${field.page}</span>
                </div>
                <div class="editor-actions">
                    ${field.isMapped ? `
                        <button class="btn-highlight" data-field-id="${field.id}">👁️ הדגש</button>
                    ` : `
                        <button class="btn-start-map" data-field-id="${field.id}">🎯 מפה שדה זה</button>
                    `}
                    <button class="btn-delete" data-field-id="${field.id}">🗑️ מחק</button>
                </div>
            </div>
        `;
    }

    /**
     * Attach event handlers after render
     */
    _attachEventHandlers() {
        // Field header click - select field
        this.fieldList.querySelectorAll('.field-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't trigger if clicking a button
                if (e.target.closest('button')) return;

                const fieldItem = header.closest('.field-item');
                const fieldId = fieldItem.dataset.fieldId;
                const field = state.getField(fieldId);

                if (field?.isMapped) {
                    // Select mapped field - highlights overlay
                    state.selectField(fieldId);
                } else {
                    // Select unmapped field for mapping
                    this._selectForMapping(fieldId);
                }
            });
        });

        // Expand button
        this.fieldList.querySelectorAll('.btn-expand').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fieldItem = btn.closest('.field-item');
                const fieldId = fieldItem.dataset.fieldId;
                this._toggleExpand(fieldId);
            });
        });

        // Map button (for unmapped fields)
        this.fieldList.querySelectorAll('.btn-map').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fieldItem = btn.closest('.field-item');
                const fieldId = fieldItem.dataset.fieldId;
                this._selectForMapping(fieldId);
            });
        });

        // Input changes (name editing)
        this.fieldList.querySelectorAll('.field-editor input').forEach(input => {
            input.addEventListener('change', (e) => {
                const fieldId = input.dataset.fieldId;
                const property = input.dataset.property;
                const value = input.value.trim();

                state.updateField(fieldId, { [property]: value });
                console.log(`[SidebarController] Updated ${property} = "${value}" for ${fieldId}`);
            });

            // Prevent click from bubbling to header
            input.addEventListener('click', (e) => e.stopPropagation());
        });

        // Type select
        this.fieldList.querySelectorAll('.select-type').forEach(select => {
            select.addEventListener('change', (e) => {
                const fieldId = select.dataset.fieldId;
                state.updateField(fieldId, { type: select.value });
            });
            select.addEventListener('click', (e) => e.stopPropagation());
        });

        // Highlight button
        this.fieldList.querySelectorAll('.btn-highlight').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fieldId = btn.dataset.fieldId;
                state.selectField(fieldId);
            });
        });

        // Start map button
        this.fieldList.querySelectorAll('.btn-start-map').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fieldId = btn.dataset.fieldId;
                this._selectForMapping(fieldId);
            });
        });

        // Delete button
        this.fieldList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fieldId = btn.dataset.fieldId;
                if (confirm('למחוק שדה זה?')) {
                    state.deleteField(fieldId);
                }
            });
        });

        // Table highlight button
        this.fieldList.querySelectorAll('.btn-table-highlight').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tableId = btn.dataset.tableId;
                this._highlightTable(tableId);
            });
        });

        // Table delete button
        this.fieldList.querySelectorAll('.btn-table-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tableId = btn.dataset.tableId;
                if (confirm('למחוק טבלה זו?')) {
                    state.deleteTable(tableId);
                }
            });
        });
    }

    /**
     * Toggle field expansion
     */
    _toggleExpand(fieldId) {
        if (this.expandedFieldId === fieldId) {
            this.expandedFieldId = null;
        } else {
            this.expandedFieldId = fieldId;
        }
        this.render();
    }

    /**
     * Select unmapped field for mapping
     */
    _selectForMapping(fieldId) {
        const field = state.getField(fieldId);
        if (!field) return;

        this.selectedForMapping = fieldId;

        // Auto-select drawing tool based on field type
        const toolMap = {
            'text': Tools.DRAW_TEXT,
            'number': Tools.DRAW_TEXT,
            'date': Tools.DRAW_TEXT,
            'checkbox': Tools.DRAW_CHECKBOX,
            'radio': Tools.DRAW_RADIO,
            'signature': Tools.DRAW_TEXT
        };

        const tool = toolMap[field.type] || Tools.DRAW_TEXT;
        state.setTool(tool);

        // Update UI to show ready-to-map state
        this.render();

        console.log(`[SidebarController] Selected for mapping: ${fieldId}, tool: ${tool}`);
    }

    /**
     * Link drawn field to selected unmapped field
     */
    _linkDrawnField(drawnFieldId) {
        if (!this.selectedForMapping) return;

        const unmappedField = state.getField(this.selectedForMapping);
        const drawnField = state.getField(drawnFieldId);

        if (!unmappedField || !drawnField) return;

        // Copy coordinates from drawn field to unmapped field
        const updates = {
            bbox: drawnField.bbox,
            anchor: drawnField.anchor,
            overlayWidth: drawnField.overlayWidth,
            overlayHeight: drawnField.overlayHeight,
            isMapped: true
        };

        state.updateField(this.selectedForMapping, updates);

        // Delete the temporary drawn field
        state.deleteField(drawnFieldId);

        // Clear selection
        this.selectedForMapping = null;
        state.setTool(Tools.SELECT);

        // Re-render overlay for the updated field
        overlayRenderer.renderAll();

        console.log(`[SidebarController] Linked drawn field to: ${unmappedField.id}`);
    }

    /**
     * Update selection UI without full re-render
     */
    _updateSelectionUI(selectedId) {
        this.fieldList.querySelectorAll('.field-item').forEach(item => {
            const isSelected = item.dataset.fieldId === selectedId;
            item.classList.toggle('selected', isSelected);

            if (isSelected) {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    /**
     * Get type icon
     */
    _getTypeIcon(type) {
        const icons = {
            text: '📝',
            number: '🔢',
            date: '📅',
            checkbox: '☑️',
            radio: '🔘',
            signature: '✍️',
            table: '📊'
        };
        return icons[type] || '📝';
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
     * Clear search
     */
    clearSearch() {
        if (this.searchInput) {
            this.searchInput.value = '';
            this.searchTerm = '';
            this.render();
        }
    }

    /**
     * Highlight a table on the overlay (flash effect)
     * @param {string} tableId - Table ID to highlight
     */
    _highlightTable(tableId) {
        const tableEl = document.querySelector(`.table-overlay[data-table-id="${tableId}"]`);
        if (!tableEl) return;

        // Add highlight class
        tableEl.classList.add('highlighted');
        tableEl.style.border = '3px solid #f59e0b';
        tableEl.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.5)';

        // Scroll into view
        tableEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Remove highlight after animation
        setTimeout(() => {
            tableEl.classList.remove('highlighted');
            tableEl.style.border = '';
            tableEl.style.boxShadow = '';
        }, 1500);
    }
}

// Singleton instance
export const sidebarController = new SidebarController();
