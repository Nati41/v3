/**
 * SidebarController - Modern Field List Sidebar for Mapper V3
 * Clean, minimalist design with full functionality
 */
import { state, Tools, Modes } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { overlayRenderer } from '../engines/OverlayRenderer.js';
import { drawController } from '../engines/DrawController.js';

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

        // DEBOUNCED RENDER - prevents multiple rapid renders from crashing browser
        this._renderDebounceTimer = null;
        this._pendingRender = false;

        const debouncedRender = () => {
            if (this._renderDebounceTimer) return; // Already scheduled
            this._pendingRender = true;
            this._renderDebounceTimer = requestAnimationFrame(() => {
                this._renderDebounceTimer = null;
                if (this._pendingRender) {
                    this._pendingRender = false;
                    this.render();
                }
            });
        };

        // State changes - all use debounced render
        eventBus.on(Events.STATE_CHANGED, debouncedRender);
        eventBus.on(Events.FIELD_CREATED, debouncedRender);
        eventBus.on(Events.FIELD_UPDATED, debouncedRender);
        eventBus.on(Events.FIELD_DELETED, debouncedRender);
        eventBus.on(Events.PDF_PAGE_CHANGED, debouncedRender);
        eventBus.on(Events.PROJECT_LOAD, debouncedRender);

        // Radio group changes
        eventBus.on(Events.RADIO_GROUP_CREATED, debouncedRender);
        eventBus.on(Events.RADIO_GROUP_UPDATED, debouncedRender);
        eventBus.on(Events.RADIO_GROUP_DELETED, debouncedRender);
        eventBus.on(Events.RADIO_GROUP_BUILDING_FINISHED, debouncedRender);

        // Table changes
        eventBus.on(Events.TABLE_CREATED, debouncedRender);
        eventBus.on(Events.TABLE_UPDATED, debouncedRender);
        eventBus.on(Events.TABLE_DELETED, debouncedRender);

        // Selection changes - update without full re-render
        eventBus.on(Events.FIELD_SELECTED, ({ fieldId }) => {
            this._updateSelectionUI(fieldId);
        });

        eventBus.on(Events.FIELD_DESELECTED, () => {
            this._updateSelectionUI(null);
        });

        // Listen for draw end to clear selectedForMapping
        eventBus.on(Events.DRAW_END, ({ field }) => {
            if (this.selectedForMapping) {
                // Clear selection state - DrawController already handled the mapping
                // via pendingFieldId mechanism
                this.selectedForMapping = null;
                this.render();
            }
        });

        // AUTO-EXPAND: When a field is mapped, expand it for immediate configuration
        eventBus.on(Events.FIELD_MAPPED, ({ fieldId }) => {
            console.log('[SidebarController] Field mapped, auto-expanding:', fieldId);

            // Expand the field editor
            this.expandedFieldId = fieldId;

            // Re-render to show expanded state
            this.render();

            // Scroll to the field after DOM update
            requestAnimationFrame(() => {
                const fieldEl = this.fieldList?.querySelector(`[data-field-id="${fieldId}"]`);
                if (fieldEl) {
                    fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Add highlight animation
                    fieldEl.classList.add('just-mapped');
                    setTimeout(() => fieldEl.classList.remove('just-mapped'), 2000);
                }
            });
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

        // Get all fields, filter out group members
        let allFields = fields.filter(f => !f.groupId && !f._groupBuilding);

        // UNMAPPED fields: Show ALL regardless of page (they have no position yet)
        // MAPPED fields: Filter by current page (they have specific positions)
        const unmappedFields = allFields.filter(f => !f.isMapped);
        const mappedFields = allFields.filter(f => f.isMapped && f.page === currentPage);

        // Combine for search filtering
        let pageFields = [...unmappedFields, ...mappedFields];

        // Filter by search term
        let filteredUnmapped = unmappedFields;
        let filteredMapped = mappedFields;
        if (this.searchTerm) {
            const searchFilter = f => {
                const searchText = `${f.label_he || ''} ${f.label_en || ''} ${f.id || ''}`.toLowerCase();
                return searchText.includes(this.searchTerm);
            };
            filteredUnmapped = unmappedFields.filter(searchFilter);
            filteredMapped = mappedFields.filter(searchFilter);
        }

        // Build HTML
        let html = '';

        // Unmapped fields section (if any) - shown regardless of page
        if (filteredUnmapped.length > 0) {
            html += `
                <div class="field-section">
                    <div class="section-header">
                        <span class="section-icon">📋</span>
                        <span class="section-title">ממתינים למיפוי (${filteredUnmapped.length})</span>
                    </div>
                    <div class="section-hint">לחץ על שדה ← בחר כלי ציור ← צייר על ה-PDF</div>
                    <div class="field-items">
                        ${filteredUnmapped.map(f => this._renderFieldItem(f, selectedId, false)).join('')}
                    </div>
                </div>
            `;
        }

        // Mapped fields section - filtered by current page
        if (filteredMapped.length > 0) {
            html += `
                <div class="field-section">
                    <div class="section-header">
                        <span class="section-icon">✅</span>
                        <span class="section-title">שדות ממופים (${filteredMapped.length})</span>
                    </div>
                    <div class="field-items">
                        ${filteredMapped.map(f => this._renderFieldItem(f, selectedId, true)).join('')}
                    </div>
                </div>
            `;
        }

        // Radio/Checkbox groups section
        const allGroups = (state.get('radioGroups') || []).filter(g => g.page === currentPage);
        const radioGroups = allGroups.filter(g => g.type !== 'checkbox');
        const checkboxGroups = allGroups.filter(g => g.type === 'checkbox');

        // Radio groups
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

        // Checkbox groups
        if (checkboxGroups.length > 0) {
            html += `
                <div class="field-section checkbox-groups-section">
                    <div class="section-header">
                        <span class="section-icon">☑️</span>
                        <span class="section-title">קבוצות צ'קבוקסים (${checkboxGroups.length})</span>
                    </div>
                    <div class="field-items">
                        ${checkboxGroups.map(g => this._renderCheckboxGroupItem(g)).join('')}
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
        const totalItems = pageFields.length + allGroups.length + tables.length;
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
        // Performance: removed console.log from hot path
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
                    ${(group.options || []).map((opt, i) => {
                        const field = this._getFieldById(opt.fieldId);
                        const label = field?.label_he || opt.label_he || opt.label || `אפשרות ${i + 1}`;
                        const hasLabel = field?.labelSelection || (field?.label_he && field.label_he !== `אפשרות ${i + 1}`);
                        return `
                        <div class="radio-option-mini" data-field-id="${opt.fieldId}">
                            <span class="option-num">${i + 1}</span>
                            <span class="option-label">${this._escapeHtml(label)}</span>
                            <button class="btn-edit-label" data-field-id="${opt.fieldId}" title="${hasLabel ? 'ערוך תווית' : 'הוסף תווית'}">
                                ${hasLabel ? '✏️' : '➕'}
                            </button>
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render a checkbox group item in the sidebar
     * @param {Object} group - Checkbox group object
     * @returns {string} HTML string
     */
    _renderCheckboxGroupItem(group) {
        const groupName = group.groupName || 'קבוצת צ\'קבוקסים';
        const groupNameEn = group.groupNameEn || group.groupId;
        const optionCount = (group.options || []).length;

        return `
            <div class="field-item checkbox-group-item mapped" data-group-id="${group.groupId}">
                <div class="field-header">
                    <span class="field-icon">☑️</span>
                    <div class="field-names">
                        <div class="field-name-he">${this._escapeHtml(groupName)}</div>
                        <div class="field-name-en">${this._escapeHtml(groupNameEn)}</div>
                    </div>
                    <div class="field-badge">${optionCount} אפשרויות</div>
                </div>
                <div class="checkbox-options-preview">
                    ${(group.options || []).map((opt, i) => {
                        // Get fresh label from the field
                        const field = this._getFieldById(opt.fieldId);
                        const label = field?.label_he || opt.label_he || opt.label || `אפשרות ${i + 1}`;
                        const hasLabel = field?.labelSelection || (field?.label_he && field.label_he !== `אפשרות ${i + 1}`);
                        return `
                        <div class="checkbox-option-mini" data-field-id="${opt.fieldId}">
                            <span class="option-num">${i + 1}</span>
                            <span class="option-label">${this._escapeHtml(label)}</span>
                            <button class="btn-edit-label" data-field-id="${opt.fieldId}" title="${hasLabel ? 'ערוך תווית' : 'הוסף תווית'}">
                                ${hasLabel ? '✏️' : '➕'}
                            </button>
                        </div>
                    `}).join('')}
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

        // Check if table is mapped (has position on PDF)
        const isMapped = !!(table.bbox || table.headerBBox || table.tableBBox);

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

        // Status badge
        const statusClass = isMapped ? 'mapped' : 'unmapped';
        const statusBadge = isMapped ? '' : '<span class="unmapped-badge">ממתין למיפוי</span>';

        // Action buttons - different for mapped vs unmapped
        const actionButtons = isMapped ? `
            <button class="btn-table-highlight" data-table-id="${table.tableId}" title="הדגש טבלה">👁️</button>
            <button class="btn-table-delete" data-table-id="${table.tableId}" title="מחק טבלה">🗑️</button>
        ` : `
            <button class="btn-table-map" data-table-id="${table.tableId}" title="מפה על ה-PDF">📍 מפה</button>
            <button class="btn-table-delete" data-table-id="${table.tableId}" title="מחק טבלה">🗑️</button>
        `;

        return `
            <div class="field-item table-item ${statusClass}" data-table-id="${table.tableId}">
                <div class="field-header">
                    <span class="field-icon">📊</span>
                    <div class="field-names">
                        <div class="field-name-he">${this._escapeHtml(tableName)}</div>
                        <div class="field-name-en">${table.tableId}</div>
                    </div>
                    <div class="field-badge">${columnCount}×${rowCount}</div>
                </div>
                ${statusBadge}
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
                    ${actionButtons}
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

        // Layout toggle HTML (Phase 3)
        const layoutToggleHtml = this._renderLayoutToggle(field);

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
                ${layoutToggleHtml}
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
     * Render layout toggle UI for a field (Phase 3)
     * @param {Object} field - Field object
     * @returns {string} HTML string for layout toggle
     */
    _renderLayoutToggle(field) {
        // Only show for text-based fields (not checkbox/radio)
        if (['checkbox', 'radio'].includes(field.type)) {
            return '';
        }

        const LH = window.LayoutHelper;
        if (!LH) {
            console.warn('[SidebarController] LayoutHelper not loaded');
            return '<!-- LayoutHelper not available -->';
        }

        const layout = LH.getFieldLayout(field);
        const isSlots = layout.mode === LH.MODES.SLOTS;
        const slotCount = layout.slotCount || 9;

        return `
            <div class="editor-row layout-toggle-row">
                <label>מצב תצוגה</label>
                <div class="layout-toggle-buttons" data-field-id="${field.id}">
                    <button type="button"
                            class="layout-toggle ${!isSlots ? 'active' : ''}"
                            data-mode="flow"
                            title="טקסט זורם - לשמות, כתובות וכו'">
                        זרימה
                    </button>
                    <button type="button"
                            class="layout-toggle ${isSlots ? 'active' : ''}"
                            data-mode="slots"
                            title="תיבות - לתעודת זהות, טלפון, תאריכים">
                        תיבות
                    </button>
                </div>
            </div>
            ${isSlots ? `
            <div class="editor-row slot-count-row" data-field-id="${field.id}">
                <label>מספר תיבות</label>
                <div class="slot-count-control">
                    <button type="button" class="slot-adjust" data-delta="-1">−</button>
                    <input type="number"
                           class="slot-count-input"
                           value="${slotCount}"
                           min="1"
                           max="30"
                           data-field-id="${field.id}">
                    <button type="button" class="slot-adjust" data-delta="1">+</button>
                </div>
            </div>
            ` : ''}
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

        // Table map button (for unmapped tables from import)
        this.fieldList.querySelectorAll('.btn-table-map').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tableId = btn.dataset.tableId;
                this._startTableMapping(tableId);
            });
        });

        // Table item click - select/expand
        this.fieldList.querySelectorAll('.table-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return; // Don't handle button clicks
                const tableId = item.dataset.tableId;
                const table = state.getTable(tableId);
                if (table) {
                    // For unmapped tables, start mapping
                    const isMapped = !!(table.bbox || table.headerBBox || table.tableBBox);
                    if (!isMapped) {
                        this._startTableMapping(tableId);
                    } else {
                        // For mapped tables, highlight
                        this._highlightTable(tableId);
                    }
                }
            });
        });

        // Edit label button (for radio/checkbox options)
        this.fieldList.querySelectorAll('.btn-edit-label').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fieldId = btn.dataset.fieldId;
                if (fieldId) {
                    this.startLabelSelection(fieldId);
                }
            });
        });

        // Layout toggle buttons (Phase 3)
        this.fieldList.querySelectorAll('.layout-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const container = btn.closest('.layout-toggle-buttons');
                const fieldId = container?.dataset.fieldId;
                const mode = btn.dataset.mode;
                if (fieldId && mode) {
                    this._setFieldLayoutMode(fieldId, mode);
                }
            });
        });

        // Slot count input (Phase 3)
        this.fieldList.querySelectorAll('.slot-count-input').forEach(input => {
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                const fieldId = input.dataset.fieldId;
                const value = parseInt(input.value);
                if (fieldId && !isNaN(value)) {
                    this._setFieldSlotCount(fieldId, value);
                }
            });
            input.addEventListener('click', (e) => e.stopPropagation());
        });

        // Slot count adjust buttons (Phase 3)
        this.fieldList.querySelectorAll('.slot-adjust').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const container = btn.closest('.slot-count-row');
                const fieldId = container?.dataset.fieldId;
                const delta = parseInt(btn.dataset.delta);
                if (fieldId && !isNaN(delta)) {
                    this._adjustFieldSlotCount(fieldId, delta);
                }
            });
        });
    }

    /**
     * Set field layout mode (Phase 3)
     * @param {string} fieldId - Field ID
     * @param {string} mode - 'flow' or 'slots'
     */
    _setFieldLayoutMode(fieldId, mode) {
        const field = state.getField(fieldId);
        if (!field) return;

        const LH = window.LayoutHelper;
        if (!LH) return;

        let layout;
        if (mode === 'slots') {
            // Auto-detect slot count from bbox if possible
            let slotCount = 9;
            if (field.bbox && field.bbox[2] && field.bbox[3]) {
                const ratio = field.bbox[2] / field.bbox[3];
                if (ratio >= 4 && ratio <= 25) {
                    slotCount = Math.round(ratio);
                }
            }
            layout = LH.createSlotsLayout(slotCount, LH.SOURCES.EXPLICIT);
        } else {
            layout = LH.createFlowLayout(LH.OVERFLOW.SHRINK, LH.SOURCES.EXPLICIT);
        }

        state.updateField(fieldId, { layout });
        console.log(`[SidebarController] Set layout mode for ${fieldId}: ${mode}`);
    }

    /**
     * Set field slot count (Phase 3)
     * @param {string} fieldId - Field ID
     * @param {number} slotCount - Number of slots
     */
    _setFieldSlotCount(fieldId, slotCount) {
        const field = state.getField(fieldId);
        if (!field) return;

        const LH = window.LayoutHelper;
        if (!LH) return;

        // Validate range
        const count = Math.max(1, Math.min(30, slotCount));
        const layout = LH.createSlotsLayout(count, LH.SOURCES.EXPLICIT);

        state.updateField(fieldId, { layout });
        console.log(`[SidebarController] Set slot count for ${fieldId}: ${count}`);
    }

    /**
     * Adjust field slot count by delta (Phase 3)
     * @param {string} fieldId - Field ID
     * @param {number} delta - Amount to adjust (+1 or -1)
     */
    _adjustFieldSlotCount(fieldId, delta) {
        const field = state.getField(fieldId);
        if (!field) return;

        const LH = window.LayoutHelper;
        if (!LH) return;

        const currentLayout = LH.getFieldLayout(field);
        const currentCount = currentLayout.slotCount || 9;
        const newCount = Math.max(1, Math.min(30, currentCount + delta));

        const layout = LH.createSlotsLayout(newCount, LH.SOURCES.EXPLICIT);
        state.updateField(fieldId, { layout });
        console.log(`[SidebarController] Adjusted slot count for ${fieldId}: ${currentCount} → ${newCount}`);
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
     * When user selects an imported field, we set pendingFieldId to skip the name dialog
     */
    _selectForMapping(fieldId) {
        const field = state.getField(fieldId);
        if (!field) return;

        this.selectedForMapping = fieldId;

        // CRITICAL: Tell DrawController this is a pending field
        // This skips the NameConfirmDialog since the field already has semantic data
        drawController.pendingFieldId = fieldId;

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

        console.log(`[SidebarController] Selected for mapping: ${fieldId}, tool: ${tool}, pendingFieldId set`);
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
     * Get field by ID from state
     */
    _getFieldById(fieldId) {
        if (!fieldId) return null;
        return state.getField(fieldId);
    }

    /**
     * Start manual label selection mode for a field
     * Uses click-first-click-last word selection
     * @param {string} fieldId - Field ID to add/edit label for
     */
    startLabelSelection(fieldId) {
        console.log('[SidebarController] startLabelSelection called for:', fieldId);

        const field = state.getField(fieldId);
        if (!field) {
            console.warn('[SidebarController] Field not found:', fieldId);
            return;
        }

        // Use the new click-select mode from LabelOverlay
        import('../overlay/LabelOverlay.js').then(({ labelOverlay }) => {
            labelOverlay.startClickSelectMode(fieldId);
        }).catch(err => {
            console.error('[SidebarController] Failed to start click-select mode:', err);
        });
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
     * Start table mapping flow for an unmapped table
     * Opens the table flow UI with pre-populated columns from the detected table
     * @param {string} tableId - Table ID to map
     */
    _startTableMapping(tableId) {
        const table = state.getTable(tableId);
        if (!table) {
            console.error('[SidebarController] Table not found:', tableId);
            return;
        }

        console.log('[SidebarController] Starting table mapping for:', tableId);
        console.log('[SidebarController] Table columns:', table.columns?.map(c => ({
            hebrewName: c.hebrewName,
            englishId: c.englishId,
            type: c.type
        })));

        // Emit event to start table mapping flow with existing table data
        eventBus.emit(Events.TABLE_FLOW_STARTED, {
            mode: 'map_existing',
            tableId: tableId,
            tableName: table.tableTitle?.text || 'טבלה',
            columns: table.columns || [],
            rowCount: table.rowCount || 5
        });

        // Show toast
        eventBus.emit(Events.TOAST_SHOW, {
            message: `מתחיל מיפוי טבלה: "${table.tableTitle?.text || 'טבלה'}" - צייר את אזור הכותרת על ה-PDF`,
            type: 'info'
        });
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
