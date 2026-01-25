/**
 * SidebarController - Modern Field List Sidebar for Mapper V3
 * Clean, minimalist design with full functionality
 * V3.3: Extended with template entity grouping and progress tracking
 */
import { state, Tools, Modes } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { overlayRenderer } from '../engines/OverlayRenderer.js';
import { drawController } from '../engines/DrawController.js';
import { templateStore, TemplateFieldStatus } from '../core/TemplateStore.js';
import { fieldIntelligenceStore } from '../core/FieldIntelligenceStore.js';
import { intentManager, IntentType, IntentSource } from '../core/IntentManager.js';

export class SidebarController {
    constructor() {
        this.container = null;
        this.fieldList = null;
        this.searchInput = null;
        this.searchTerm = '';
        this.expandedFieldId = null;
        this.selectedForMapping = null; // Field selected for mapping (unmapped)

        // V3.3: Template mode state
        this.expandedEntities = new Set(); // Track expanded entity groups
        this.activeTemplateTarget = null;  // Current field being mapped

        // V3.6: Track expanded tables
        this.expandedTables = new Set();

        // V3.8: Guided mode state
        this._guidedModeInitialized = false;
        this._lastGuidedId = null;

        // V3.9: CRASH PROTECTION - Auto-advance timer
        this._autoAdvanceTimer = null;
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
                this._scheduleRender();  // V3.5: Use debounced render
            });
        }

        // DEBOUNCED RENDER - prevents multiple rapid renders from crashing browser
        this._renderDebounceTimer = null;
        this._pendingRender = false;
        this._renderCount = 0;  // V3.5: Track renders for debugging
        this._lastRenderTime = 0;

        // V3.5: Central render scheduler - ALL renders must go through this
        // This prevents browser crash from rapid DOM updates
        this._scheduleRender = () => {
            if (this._renderDebounceTimer) return; // Already scheduled
            this._pendingRender = true;
            this._renderDebounceTimer = requestAnimationFrame(() => {
                this._renderDebounceTimer = null;
                if (this._pendingRender) {
                    this._pendingRender = false;

                    // V3.5: Throttle if renders are too fast
                    const now = performance.now();
                    const timeSinceLastRender = now - this._lastRenderTime;
                    if (timeSinceLastRender < 16) { // Less than ~60fps
                        // Reschedule for next frame
                        this._scheduleRender();
                        return;
                    }

                    this._lastRenderTime = now;
                    this._renderCount++;
                    this.render();
                }
            });
        };

        // Alias for backward compatibility
        const debouncedRender = this._scheduleRender;

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

        // Table changes (legacy)
        eventBus.on(Events.TABLE_CREATED, debouncedRender);
        eventBus.on(Events.TABLE_UPDATED, debouncedRender);
        eventBus.on(Events.TABLE_DELETED, debouncedRender);

        // V3.10: Table Region changes (new system)
        // V3.14: Auto-expand tables when created or updated
        eventBus.on(Events.TABLE_REGION_CREATED, ({ region }) => {
            if (region?.id) {
                this.expandedEntities.add(`table_${region.id}`);
            }
            debouncedRender();
        });
        eventBus.on(Events.TABLE_REGION_UPDATED, ({ region }) => {
            if (region?.id) {
                this.expandedEntities.add(`table_${region.id}`);
            }
            debouncedRender();
        });
        eventBus.on(Events.TABLE_REGION_DELETED, debouncedRender);

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
                // V3.9: Intent already cleared in DrawController, just clear legacy flags
                // Removed duplicate intentManager.clearIntent() call
                this.selectedForMapping = null;
                this._scheduleRender();  // V3.5: Use debounced render
            }
        });

        // AUTO-EXPAND: When a field is mapped, expand it for immediate configuration
        // AND auto-advance to next unmapped field in template mode
        eventBus.on(Events.FIELD_MAPPED, ({ fieldId }) => {
            // Mark mapped field with animation
            requestAnimationFrame(() => {
                const fieldEl = this.fieldList?.querySelector(`[data-field-id="${fieldId}"]`);
                if (fieldEl) {
                    fieldEl.classList.add('just-mapped');
                    setTimeout(() => fieldEl.classList.remove('just-mapped'), 2000);
                }
            });

            // AUTO-ADVANCE: Check if there are more unmapped fields
            // Works with both TemplateStore and direct JSON import to StateManager
            const unmappedFields = state.getAllUnmappedFields();
            const hasUnmappedFields = unmappedFields.length > 0;

            // V3.9: Reduced logging to prevent performance issues with many fields
            console.log('[SidebarController] FIELD_MAPPED:', fieldId, '| Remaining:', unmappedFields.length);

            if (hasUnmappedFields) {
                // V3.9: CRASH PROTECTION - Cancel previous auto-advance to prevent race
                if (this._autoAdvanceTimer) {
                    clearTimeout(this._autoAdvanceTimer);
                }
                // Small delay to let the mapping complete visually
                this._autoAdvanceTimer = setTimeout(() => {
                    this._autoAdvanceTimer = null;

                    // V3.9: CRASH PROTECTION - Check if auto-advance is disabled
                    if (window._autoAdvanceDisabled) {
                        console.log('[SidebarController] Auto-advance DISABLED by user');
                        return;
                    }

                    // V3.9: CRASH PROTECTION - Don't auto-advance if another mapping is in progress
                    if (drawController._quickPlacementInProgress) {
                        console.log('[SidebarController] Skipping auto-advance: mapping in progress');
                        return;
                    }

                    const nextUnmapped = this._getNextUnmappedField();
                    if (nextUnmapped) {
                        this._selectForMapping(nextUnmapped.id);
                    } else {
                        // All done!
                        // V3.9: Clear intent (new unified way)
                        intentManager.clearIntent();
                        // LEGACY: Keep old flag clearing
                        this.selectedForMapping = null;
                        this.activeTemplateTarget = null;
                        this._scheduleRender();  // V3.5: Use debounced render
                        // Show completion toast
                        if (typeof window.showToast === 'function') {
                            window.showToast('🎉 כל השדות מופו!', 'success', 3000);
                        }
                    }
                }, 300);
            } else {
                // No more unmapped fields - just expand the mapped field
                console.log('[SidebarController] No more unmapped fields, expanding mapped field');
                this.expandedFieldId = fieldId;
                this._scheduleRender();  // V3.5: Use debounced render
            }
        });

        // V3.3: Template event listeners
        eventBus.on(Events.TEMPLATE_LOADED, () => {
            // Expand first entity by default
            const entities = templateStore.getEntities?.() || [];
            if (entities.length > 0) {
                this.expandedEntities.add(entities[0].id);
            }
            this._scheduleRender();  // V3.5: Use debounced render

            // Auto-select first unmapped field for immediate mapping
            setTimeout(() => {
                const firstUnmapped = this._getNextUnmappedField();
                if (firstUnmapped) {
                    this._selectForMapping(firstUnmapped.id);
                }
            }, 500);
        });

        eventBus.on(Events.TEMPLATE_CLEARED, () => {
            this.expandedEntities.clear();
            this.activeTemplateTarget = null;
            this._scheduleRender();  // V3.5: Use debounced render
        });

        eventBus.on(Events.NEXT_UNMAPPED_ACTIVATED, ({ fieldId }) => {
            this.activeTemplateTarget = fieldId;
            this.selectedForMapping = fieldId;  // Also update selectedForMapping for consistency
            this._scheduleRender();  // V3.5: Use debounced render
            // Scroll to active target with highlight effect
            requestAnimationFrame(() => {
                const fieldEl = this.fieldList?.querySelector(`[data-field-id="${fieldId}"]`);
                if (fieldEl) {
                    fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Add brief highlight animation
                    fieldEl.classList.add('highlight-pulse');
                    setTimeout(() => fieldEl.classList.remove('highlight-pulse'), 1000);
                }
            });
        });

        eventBus.on(Events.TEMPLATE_FIELD_MAPPED, debouncedRender);
        eventBus.on(Events.MAPPING_PROGRESS_CHANGED, debouncedRender);
    }

    /**
     * Render the field list
     * V3.9: Unified rendering - same beautiful style for all modes
     */
    render() {
        if (!this.fieldList) return;

        // V3.9: PRESERVE SCROLL POSITION - Save before render
        // Note: fieldList itself is the scrollable container (has overflow-y: auto)
        const savedScrollTop = this.fieldList.scrollTop;

        // V3.9: CRASH PROTECTION - Track render count and time
        this._totalRenderCount = (this._totalRenderCount || 0) + 1;
        if (this._totalRenderCount % 20 === 0) {
            console.log('[SidebarController] Render count:', this._totalRenderCount);
        }
        const renderStart = performance.now();

        const fields = state.get('fields') || [];
        const currentPage = state.get('document.currentPage');
        const selectedId = state.get('selection.fieldId');

        // Get all fields, filter out group members and table fields (shown separately)
        let allFields = fields.filter(f => !f.groupId && !f._groupBuilding && !f.tableRegionId);

        // Build HTML - V3.9: Always use unified style
        let html = '';

        // V3.9: Unified rendering for all modes
        html = this._renderUnifiedMode(allFields, currentPage, selectedId);

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

        // Empty state - V3.14: Also check for table regions (new system)
        const tableRegionCount = window.tableRegionManager ? window.tableRegionManager.getRegionsForSidebar().length : 0;
        const totalItems = allFields.length + allGroups.length + tables.length + tableRegionCount;
        if (totalItems === 0 && !templateStore.isLoaded()) {
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

        // V3.9: RESTORE SCROLL POSITION - After DOM update
        if (savedScrollTop > 0) {
            requestAnimationFrame(() => {
                this.fieldList.scrollTop = savedScrollTop;
            });
        }

        // V3.9: Log slow renders
        const renderTime = performance.now() - renderStart;
        if (renderTime > 50) {
            console.warn('[SidebarController] Slow render:', renderTime.toFixed(1), 'ms');
        }
    }

    /**
     * V3.9: Unified rendering mode - same beautiful style for all data sources
     * Works with: Field Intelligence, Template, or plain fields
     */
    _renderUnifiedMode(allFields, currentPage, selectedId) {
        let html = '';

        // Determine data source and get grouping info
        const intelligence = fieldIntelligenceStore.getCurrent();
        const templateLoaded = templateStore.isLoaded();

        // Calculate progress
        const totalFields = allFields.length;
        const mappedCount = allFields.filter(f => f.isMapped).length;
        const percentage = totalFields > 0 ? Math.round((mappedCount / totalFields) * 100) : 0;

        // Determine mode title
        let modeTitle = '📋 שדות';
        let modeClass = 'standard';
        if (intelligence) {
            modeTitle = '🎯 מיפוי מודרך';
            modeClass = 'guided';
        } else if (templateLoaded) {
            modeTitle = '📋 מיפוי תבנית';
            modeClass = 'template';
        }

        // Progress bar at top (always show if there are fields)
        if (totalFields > 0) {
            html += `
                <div class="template-progress-section unified-progress ${modeClass}">
                    <div class="progress-header">
                        <span class="progress-title">${modeTitle}</span>
                        <span class="progress-stats">${mappedCount}/${totalFields} (${percentage}%)</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${percentage}%;"></div>
                    </div>
                </div>
            `;
        }

        // V3.10: Render table regions section if any exist
        html += this._renderTableRegionsSection();

        // Get sections/groups for organizing fields
        const sections = this._getSectionsForUnifiedMode(intelligence, templateLoaded, allFields);

        // Auto-expand all sections on first load
        if (this.expandedEntities.size === 0 && sections.length > 0) {
            sections.forEach(s => this.expandedEntities.add(s.id));
        }

        // Render each section
        for (const section of sections) {
            html += this._renderUnifiedSection(section, allFields, currentPage, selectedId);
        }

        return html;
    }

    /**
     * V3.10: Render table regions section with collapsible fields
     * V3.14: Updated to use getRegionsForSidebar() for better structure
     */
    _renderTableRegionsSection() {
        // Check if tableRegionManager is available
        if (!window.tableRegionManager) return '';

        // V3.14: Use new sidebar-optimized API
        const tableSections = window.tableRegionManager.getRegionsForSidebar();
        if (tableSections.length === 0) return '';

        // Get all fields to find table fields (for rendering expanded content)
        const allFields = state.get('fields') || [];

        let html = `
            <div class="table-regions-section">
                <div class="section-header">
                    <span class="section-icon">📊</span>
                    <span class="section-title">טבלאות</span>
                    <span class="section-count">${tableSections.length}</span>
                </div>
                <div class="table-regions-list">
        `;

        for (const tableInfo of tableSections) {
            // Get the actual region for expanded content rendering
            const region = window.tableRegionManager.getRegion(tableInfo.id);
            const tableFields = allFields.filter(f => f.tableRegionId === tableInfo.id);

            // V3.14: Use pre-calculated data from getRegionsForSidebar
            const expandKey = `table_${tableInfo.id}`;
            const isExpanded = this.expandedEntities.has(expandKey);
            const statusIcon = tableInfo.status === 'complete' ? '✓' :
                              tableInfo.status === 'partial' ? '◐' : '⏳';
            const statusClass = tableInfo.status === 'complete' ? 'complete' :
                               tableInfo.status === 'partial' ? 'partial' : 'pending';

            html += `
                <div class="table-region-item ${statusClass} ${isExpanded ? 'expanded' : ''}" data-region-id="${tableInfo.id}">
                    <div class="table-region-header" data-toggle-table="${tableInfo.id}">
                        <span class="table-expand-icon">${isExpanded ? '▼' : '▶'}</span>
                        <span class="table-region-name">${tableInfo.name_he}</span>
                        <span class="table-region-stats">${tableInfo.totalColumns} עמודות × ${tableInfo.rowCount} שורות</span>
                        <span class="table-mapped-info">(${tableInfo.mappedColumns}/${tableInfo.totalColumns} ממופות)</span>
                        <div class="table-region-actions">
                            <span class="table-status table-status-${statusClass}">${statusIcon}</span>
                            <button class="btn-delete-region" data-region-id="${tableInfo.id}" title="מחק טבלה">🗑</button>
                        </div>
                    </div>
                    ${isExpanded ? this._renderTableColumns(tableInfo, tableFields, region) : ''}
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        return html;
    }

    /**
     * V3.14: Render columns inside a table (when expanded)
     * Shows columns as single items, not individual row fields
     */
    _renderTableColumns(tableInfo, tableFields, region) {
        if (tableInfo.totalColumns === 0) {
            return `<div class="table-columns-empty">
                <span class="empty-icon">📝</span>
                <span class="empty-text">מפה שדה בשורה הראשונה כדי ליצור עמודה</span>
                <button class="btn-add-column btn-add-first-column" data-region-id="${tableInfo.id}">
                    ➕ התחל למפות עמודות
                </button>
            </div>`;
        }

        let html = '<div class="table-columns-list">';

        for (const col of tableInfo.columns) {
            const statusIcon = col.isMapped ? '✓' : '○';
            const statusClass = col.isMapped ? 'mapped' : 'pending';

            html += `
                <div class="table-column-item ${statusClass}" data-column-id="${col.id}">
                    <span class="column-status">${statusIcon}</span>
                    <span class="column-icon">${this._getFieldTypeIcon(col.type)}</span>
                    <span class="column-name">${col.name_he || col.name_en || 'עמודה'}</span>
                    ${col.isMapped ? `<span class="column-rows">(${tableInfo.rowCount} שורות)</span>` : ''}
                </div>
            `;
        }

        html += '</div>';

        // V3.14: Add action buttons for table mapping
        html += `
            <div class="table-actions">
                <button class="btn-add-column" data-region-id="${tableInfo.id}" title="הוסף עמודה נוספת">
                    ➕ הוסף עמודה
                </button>
                <button class="btn-finish-table" data-region-id="${tableInfo.id}" title="סיים מיפוי טבלה">
                    ✓ סיים מיפוי
                </button>
            </div>
        `;

        return html;
    }

    /**
     * V3.10: Generate smart table name from field names
     */
    _generateTableName(tableFields, region) {
        // Use saved name if exists
        if (region.name) {
            return region.name;
        }

        if (tableFields.length === 0) {
            return `טבלה ${region.id.split('_')[1]}`;
        }

        // Get unique base names from row 0 fields
        const row0Fields = tableFields.filter(f => f.tableRow === 0);
        if (row0Fields.length === 0) {
            return `טבלה ${region.id.split('_')[1]}`;
        }

        // Try to find common prefix in field names
        const fieldNames = row0Fields.map(f => f.label_en || f.name || '');
        const commonPrefix = this._findCommonPrefix(fieldNames);

        if (commonPrefix && commonPrefix.length > 2) {
            // Convert common prefix to Hebrew if possible
            const hebrewNames = {
                'child': 'ילדים',
                'otherIncome': 'הכנסות נוספות',
                'change': 'שינויים',
                'income': 'הכנסות',
                'expense': 'הוצאות',
                'employee': 'עובדים',
                'item': 'פריטים',
                'row': 'שורות',
                'line': 'שורות'
            };

            const cleanPrefix = commonPrefix.replace(/_$/, '').replace(/\d+$/, '');
            return hebrewNames[cleanPrefix] || `טבלת ${cleanPrefix}`;
        }

        // Fallback: use first field's Hebrew label if available
        const firstField = row0Fields[0];
        if (firstField.label_he) {
            return `טבלת ${firstField.label_he.split(' ')[0]}`;
        }

        return `טבלה ${region.id.split('_')[1]}`;
    }

    /**
     * V3.10: Find common prefix among field names
     */
    _findCommonPrefix(names) {
        if (names.length === 0) return '';
        if (names.length === 1) return names[0].split('_')[0] + '_';

        const validNames = names.filter(n => n && n.length > 0);
        if (validNames.length === 0) return '';

        // Find common prefix
        let prefix = validNames[0];
        for (let i = 1; i < validNames.length; i++) {
            while (validNames[i].indexOf(prefix) !== 0 && prefix.length > 0) {
                prefix = prefix.substring(0, prefix.length - 1);
            }
        }

        // Make sure prefix ends at word boundary
        const lastUnderscore = prefix.lastIndexOf('_');
        if (lastUnderscore > 0) {
            return prefix.substring(0, lastUnderscore + 1);
        }

        return prefix;
    }

    /**
     * V3.10: Render fields inside a table (when expanded)
     */
    _renderTableFields(tableFields, region) {
        if (tableFields.length === 0) {
            return '<div class="table-fields-empty">אין שדות ממופים בטבלה זו</div>';
        }

        // Group fields by column (row 0 fields)
        const columnFields = tableFields.filter(f => f.tableRow === 0);

        let html = '<div class="table-fields-list">';

        for (const columnField of columnFields) {
            // Find all rows for this column
            const columnName = columnField.label_en || columnField.name || '';
            const baseLabel = columnField.label_he || columnField.label_en || columnField.name;

            // Get all fields in this column
            const columnRows = tableFields.filter(f => {
                if (f.tableRow === 0) return f.id === columnField.id;
                // Match by similar name pattern
                const fName = f.label_en || f.name || '';
                return fName.startsWith(baseLabel.split(' ')[0]) || f.id.includes(columnField.id.split('_')[0]);
            });

            html += `
                <div class="table-column-group">
                    <div class="table-column-header">
                        <span class="column-icon">${this._getFieldTypeIcon(columnField.type)}</span>
                        <span class="column-name">${baseLabel}</span>
                        <span class="column-rows">(${region.rowCount} שורות)</span>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    /**
     * V3.10: Get icon for field type
     */
    _getFieldTypeIcon(type) {
        const icons = {
            'text': '📝',
            'checkbox': '☑️',
            'radio': '🔘',
            'signature': '✍️',
            'cell': '📦'
        };
        return icons[type] || '📝';
    }

    /**
     * V3.9: Get sections for unified mode based on available data
     */
    _getSectionsForUnifiedMode(intelligence, templateLoaded, allFields) {
        // Priority 1: Field Intelligence sections
        if (intelligence?.sections?.length > 0) {
            const fieldsBySection = new Map();
            (intelligence.fields || []).forEach(f => {
                const sectionId = f.section_id || '_default';
                if (!fieldsBySection.has(sectionId)) {
                    fieldsBySection.set(sectionId, []);
                }
                fieldsBySection.get(sectionId).push(f.id);
            });

            return intelligence.sections.map(s => ({
                id: s.id,
                name: s.name_he || s.name_en || s.id,
                fieldIds: fieldsBySection.get(s.id) || [],
                source: 'intelligence'
            }));
        }

        // Priority 2: Template entities
        if (templateLoaded) {
            const entities = templateStore.getEntities() || [];
            const fieldsByEntity = templateStore.getFieldsByEntity();

            if (entities.length > 0) {
                return entities.map(e => {
                    const entityId = e.entity_id || e.id;
                    const entityFields = fieldsByEntity.get(entityId) || [];
                    return {
                        id: entityId,
                        name: e.label_he || e.entity_name_he || e.label_en || entityId,
                        fieldIds: entityFields.map(f => f.template_field_id || f.id),
                        source: 'template'
                    };
                });
            }
        }

        // Priority 3: Default grouping by mapped/unmapped
        const unmapped = allFields.filter(f => !f.isMapped);
        const mapped = allFields.filter(f => f.isMapped);

        const sections = [];
        if (unmapped.length > 0) {
            sections.push({
                id: '_unmapped',
                name: 'ממתינים למיפוי',
                fieldIds: unmapped.map(f => f.id),
                source: 'default',
                icon: '⬜'
            });
        }
        if (mapped.length > 0) {
            sections.push({
                id: '_mapped',
                name: 'שדות ממופים',
                fieldIds: mapped.map(f => f.id),
                source: 'default',
                icon: '✅'
            });
        }

        return sections;
    }

    /**
     * V3.9: Render a section in unified mode
     */
    _renderUnifiedSection(section, allFields, currentPage, selectedId) {
        const sectionId = section.id;
        const isExpanded = this.expandedEntities.has(sectionId);

        // Get fields for this section
        let sectionFields = [];
        if (section.source === 'default') {
            // Default mode - fieldIds are already state field IDs
            sectionFields = section.fieldIds.map(id => allFields.find(f => f.id === id)).filter(Boolean);
        } else {
            // Intelligence/Template mode - need to match by ID or templateFieldId
            sectionFields = section.fieldIds.map(id => {
                return allFields.find(f => f.id === id || f.templateFieldId === id);
            }).filter(Boolean);
        }

        // Apply search filter
        if (this.searchTerm) {
            sectionFields = sectionFields.filter(f => {
                const searchText = `${f.label_he || ''} ${f.label_en || ''} ${f.id || ''}`.toLowerCase();
                return searchText.includes(this.searchTerm);
            });
        }

        if (sectionFields.length === 0) return '';

        // Count mapped in section
        const mappedInSection = sectionFields.filter(f => f.isMapped).length;
        const sectionIcon = section.icon || (mappedInSection === sectionFields.length ? '✅' : '📋');

        let html = `
            <div class="field-section guided-section ${isExpanded ? 'expanded' : ''}" data-section-id="${sectionId}">
                <div class="section-header clickable" data-toggle-section="${sectionId}">
                    <span class="section-icon">${sectionIcon}</span>
                    <span class="section-title">${section.name}</span>
                    <span class="section-count">${mappedInSection}/${sectionFields.length}</span>
                    <span class="expand-icon">${isExpanded ? '▼' : '◀'}</span>
                </div>
        `;

        if (isExpanded) {
            html += '<div class="field-items">';
            for (const field of sectionFields) {
                html += this._renderUnifiedFieldItem(field, selectedId);
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    /**
     * V3.9: Render a field item in unified style
     */
    _renderUnifiedFieldItem(field, selectedId) {
        const isSelected = field.id === selectedId;
        const isExpanded = this.expandedFieldId === field.id;
        const isSelectedForMapping = this.selectedForMapping === field.id;
        const isMapped = field.isMapped;
        const typeIcon = this._getTypeIcon(field.type);

        const statusIcon = isMapped ? '✅' : '⬜';

        // V3.9.1: For unmapped checkbox only, show placement mode toggle
        // Radio doesn't need this - it's always small circles
        const showHeaderPlacementToggle = !isMapped && field.type === 'checkbox';
        const isAutoMode = field.placementMode === 'auto';

        // Build classes
        let classes = ['field-item', 'guided-field-item', isMapped ? 'mapped' : 'unmapped'];
        if (isSelected) classes.push('selected');
        if (isSelectedForMapping) classes.push('selected-for-mapping');
        if (isExpanded) classes.push('expanded');

        // Display name
        const displayName = field.label_he || field.name || field.id;
        const englishName = field.label_en || field.canonical || '';

        return `
            <div class="${classes.join(' ')}" data-field-id="${field.id}" data-guided="true">
                <div class="field-header guided-field-header">
                    <span class="field-status">${statusIcon}</span>
                    <span class="field-type-icon">${typeIcon}</span>
                    <div class="field-names">
                        <span class="field-name">${this._escapeHtml(displayName)}</span>
                        ${englishName ? `<span class="field-name-en-small">${this._escapeHtml(englishName)}</span>` : ''}
                    </div>
                    ${showHeaderPlacementToggle ? `
                        <div class="header-placement-toggle" data-field-id="${field.id}">
                            <button type="button"
                                    class="placement-mini-btn ${!isAutoMode ? 'active' : ''}"
                                    data-mode="symbol"
                                    title="סימן קטן">■</button>
                            <button type="button"
                                    class="placement-mini-btn ${isAutoMode ? 'active' : ''}"
                                    data-mode="auto"
                                    title="זיהוי תא">▭</button>
                        </div>
                    ` : ''}
                    <div class="field-actions">
                        ${!isMapped ? `
                            <button class="btn-map" title="בחר למיפוי">🎯</button>
                        ` : `
                            <button class="btn-locate" title="הצג בעמוד">👁</button>
                        `}
                        <button class="btn-expand" title="הרחב">${isExpanded ? '▲' : '▼'}</button>
                    </div>
                </div>
                ${isExpanded ? this._renderFieldEditor(field) : ''}
            </div>
        `;
    }

    /**
     * V3.3: Render standard mode (unmapped/mapped sections)
     * @deprecated V3.9: Use _renderUnifiedMode instead
     */
    _renderStandardMode(allFields, currentPage, selectedId) {
        // Redirect to unified mode
        return this._renderUnifiedMode(allFields, currentPage, selectedId);
    }

    /**
     * V3.8: Render guided mode with Field Intelligence (sections and progress)
     * @deprecated V3.9: Use _renderUnifiedMode instead
     */
    _renderGuidedMode(allFields, currentPage, selectedId) {
        // Redirect to unified mode
        return this._renderUnifiedMode(allFields, currentPage, selectedId);
    }

    /**
     * V3.8: Render a section in guided mode
     */
    _renderGuidedSection(section, intelligenceFields, allFields, currentPage, selectedId) {
        const sectionId = section.id;
        const isExpanded = this.expandedEntities.has(sectionId);
        const sectionName = section.name_he || section.name_en || sectionId;

        // Count mapped fields in this section
        const mappedInSection = intelligenceFields.filter(intField => {
            const stateField = allFields.find(f => f.id === intField.id || f.templateFieldId === intField.id);
            return stateField?.isMapped;
        }).length;

        const sectionIcon = mappedInSection === intelligenceFields.length ? '✅' : '📋';

        let html = `
            <div class="field-section guided-section ${isExpanded ? 'expanded' : ''}" data-section-id="${sectionId}">
                <div class="section-header clickable" data-toggle-section="${sectionId}">
                    <span class="section-icon">${sectionIcon}</span>
                    <span class="section-title">${sectionName}</span>
                    <span class="section-count">${mappedInSection}/${intelligenceFields.length}</span>
                    <span class="expand-icon">${isExpanded ? '▼' : '◀'}</span>
                </div>
        `;

        if (isExpanded) {
            html += '<div class="field-items">';

            for (const intField of intelligenceFields) {
                // Find corresponding state field
                const stateField = allFields.find(f => f.id === intField.id || f.templateFieldId === intField.id);
                const isMapped = stateField?.isMapped || false;
                const displayField = stateField || {
                    id: intField.id,
                    label_he: intField.display?.name_he || intField.id,
                    label_en: intField.display?.name_en || intField.id,
                    type: 'text',
                    isMapped: false
                };

                html += this._renderGuidedFieldItem(displayField, intField, selectedId, isMapped);
            }

            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    /**
     * V3.8: Render a field item in guided mode
     */
    _renderGuidedFieldItem(field, intField, selectedId, isMapped) {
        const isSelected = field.id === selectedId;
        const isExpanded = this.expandedFieldId === field.id;
        const isSelectedForMapping = this.selectedForMapping === field.id;
        const fieldType = intField?.type || field.type;
        const typeIcon = this._getTypeIcon(fieldType);

        const statusClass = isMapped ? 'mapped' : 'unmapped';
        const statusIcon = isMapped ? '✅' : '⬜';

        // V3.9.1: For unmapped checkbox/radio, show placement mode toggle
        // V3.9.1: Only checkbox gets placement toggle (radio is always small circles)
        const showHeaderPlacementToggle = !isMapped && fieldType === 'checkbox';
        const isAutoMode = field.placementMode === 'auto';

        // Build classes
        let classes = ['field-item', 'guided-field-item', statusClass];
        if (isSelected) classes.push('selected');
        if (isSelectedForMapping) classes.push('selected-for-mapping');
        if (isExpanded) classes.push('expanded');

        return `
            <div class="${classes.join(' ')}" data-field-id="${field.id}" data-guided="true">
                <div class="field-header guided-field-header">
                    <span class="field-status">${statusIcon}</span>
                    <span class="field-type-icon">${typeIcon}</span>
                    <span class="field-name">${field.label_he || intField?.display?.name_he || field.id}</span>
                    ${showHeaderPlacementToggle ? `
                        <div class="header-placement-toggle" data-field-id="${field.id}">
                            <button type="button"
                                    class="placement-mini-btn ${!isAutoMode ? 'active' : ''}"
                                    data-mode="symbol"
                                    title="סימן קטן">■</button>
                            <button type="button"
                                    class="placement-mini-btn ${isAutoMode ? 'active' : ''}"
                                    data-mode="auto"
                                    title="זיהוי תא">▭</button>
                        </div>
                    ` : ''}
                    <div class="field-actions">
                        ${!isMapped ? `
                            <button class="btn-map" title="בחר למיפוי">🎯</button>
                        ` : `
                            <button class="btn-locate" title="הצג בעמוד">👁</button>
                        `}
                        <button class="btn-expand" title="הרחב">${isExpanded ? '▲' : '▼'}</button>
                    </div>
                </div>
                ${isExpanded ? this._renderFieldEditor(field) : ''}
            </div>
        `;
    }

    /**
     * V3.3: Render template mode (entity groups with progress bar)
     * @deprecated V3.9: Use _renderUnifiedMode instead
     */
    _renderTemplateMode(allFields, currentPage, selectedId) {
        // Redirect to unified mode
        return this._renderUnifiedMode(allFields, currentPage, selectedId);
    }

    /**
     * V3.3: Render a single entity section with its fields
     * V3.4: Fixed to use entity_id (not id)
     * V3.4: Hide fields when entity is in TABLE mode (shown via Tables section instead)
     */
    _renderEntitySection(entity, templateFields, allFields, currentPage, selectedId) {
        const entityId = entity.entity_id || entity.id;
        const isExpanded = this.expandedEntities.has(entityId);
        const entityName = entity.label_he || entity.entity_name_he || entity.label_en || entity.entity_name_en || entityId;

        // V3.4: Check if this entity is in TABLE mode - if so, hide individual fields
        const entityMappingMode = templateStore.getEntityMappingMode(entityId);
        if (entityMappingMode === 'table') {
            // Entity is mapped as table - show info message instead of fields
            return `
                <div class="entity-section ${isExpanded ? 'expanded' : ''}" data-entity-id="${entityId}">
                    <div class="entity-header" data-entity-id="${entityId}">
                        <span class="entity-icon">📊</span>
                        <span class="entity-name">${this._escapeHtml(entityName)}</span>
                        <span class="entity-badge table-mode">טבלה</span>
                        <span class="entity-expand">▼</span>
                    </div>
                    <div class="entity-fields">
                        <div class="entity-table-notice">
                            <span class="notice-icon">ℹ️</span>
                            <span class="notice-text">ישות זו ממופה כטבלה. ראה סקשן "טבלאות" למטה.</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Count mapped vs total
        let mappedCount = 0;
        for (const tf of templateFields) {
            const tfId = tf.template_field_id || tf.id;
            const status = templateStore.getFieldStatus(tfId);
            if (status === TemplateFieldStatus.MAPPED || status === TemplateFieldStatus.COMPLETE) {
                mappedCount++;
            }
        }

        // Find linked StateManager fields for each template field
        const fieldItems = templateFields.map(tf => {
            const tfId = tf.template_field_id || tf.id;
            // Find the StateManager field linked to this template field
            const stateField = allFields.find(f => f.templateFieldId === tfId);
            return {
                templateField: tf,
                stateField: stateField,
                status: templateStore.getFieldStatus(tfId) || TemplateFieldStatus.UNMAPPED
            };
        });

        // Apply search filter
        let filteredItems = fieldItems;
        if (this.searchTerm) {
            filteredItems = fieldItems.filter(item => {
                const tf = item.templateField;
                const sf = item.stateField;
                const searchText = `${tf.label_he || ''} ${tf.label_en || ''} ${sf?.label_he || ''} ${sf?.label_en || ''}`.toLowerCase();
                return searchText.includes(this.searchTerm);
            });
        }

        if (filteredItems.length === 0 && this.searchTerm) {
            return ''; // Hide entity if no matching fields
        }

        return `
            <div class="entity-section ${isExpanded ? 'expanded' : ''}" data-entity-id="${entityId}">
                <div class="entity-header" data-entity-id="${entityId}">
                    <span class="entity-icon">📁</span>
                    <span class="entity-name">${this._escapeHtml(entityName)}</span>
                    <span class="entity-count">${mappedCount}/${templateFields.length}</span>
                    <span class="entity-expand">▼</span>
                </div>
                <div class="entity-fields">
                    ${filteredItems.map(item => this._renderTemplateFieldItem(item, selectedId)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * V3.3: Render a template field item with status indicator
     * V3.4: Enhanced with mapped field info and clearer duplicate display
     */
    _renderTemplateFieldItem(item, selectedId) {
        const { templateField, stateField, status } = item;

        // Get template field ID (may be template_field_id or id)
        const tfId = templateField.template_field_id || templateField.id;

        const isSelected = stateField && stateField.id === selectedId;
        const isExpanded = stateField && this.expandedFieldId === stateField.id;
        const isActiveTarget = stateField && this.activeTemplateTarget === stateField.id;
        const isMapped = status === TemplateFieldStatus.MAPPED || status === TemplateFieldStatus.COMPLETE;

        // Get display names
        // V3.4: Support multiple English name fields: label_en, name, canonical
        // V3.4: Extract instance number for repeatable entity fields (e.g., child_1_name -> 1)
        const hebrewName = templateField.label_he || stateField?.label_he || '';
        const canonical = templateField.canonical || stateField?.canonical || '';
        const fieldName = templateField.name || stateField?.name || ''; // Common flat format uses 'name'

        // Check if template_field_id has a numbered pattern (e.g., child_1_name, child_2_name)
        const instanceMatch = tfId?.match(/^(.+?)[-_](\d+)[-_](.*)$/);
        const instanceNum = instanceMatch ? parseInt(instanceMatch[2], 10) : null;

        // Use template_field_id for English name when it's more descriptive than generic label_en
        const genericLabels = ['name', 'id', 'date', 'number', 'text', ''];
        const labelEnIsGeneric = genericLabels.includes((templateField.label_en || '').toLowerCase());
        const englishName = labelEnIsGeneric && tfId ? tfId : (templateField.label_en || stateField?.label_en || fieldName || canonical || '');

        // Add instance number to display name for repeatable fields
        let displayName = hebrewName || fieldName || canonical || `שדה ${(tfId || '').split('_')[1] || ''}`;
        if (instanceNum !== null && hebrewName) {
            displayName = `${hebrewName} ${instanceNum}`;
        }

        // Status class for indicator dot
        let statusClass = 'unmapped';
        let statusTitle = 'ממתין למיפוי';
        if (status === TemplateFieldStatus.MAPPED) {
            statusClass = 'mapped';
            statusTitle = 'מופה';
        } else if (status === TemplateFieldStatus.COMPLETE) {
            statusClass = 'complete';
            statusTitle = 'הושלם';
        } else if (status === TemplateFieldStatus.SKIPPED) {
            statusClass = 'skipped';
            statusTitle = 'דולג';
        }

        // Type icon
        const fieldType = templateField.type || stateField?.type || 'text';
        const typeIcon = this._getTypeIcon(fieldType);

        // V3.9.1: For unmapped checkbox/radio, show placement mode toggle
        // V3.9.1: Only checkbox gets placement toggle (radio is always small circles)
        const showHeaderPlacementToggle = !isMapped && fieldType === 'checkbox';
        const isAutoMode = stateField?.placementMode === 'auto';

        // Build classes
        let classes = ['field-item'];
        if (isSelected) classes.push('selected');
        if (isExpanded) classes.push('expanded');
        if (isMapped) classes.push('mapped');
        else classes.push('unmapped');
        if (isActiveTarget) classes.push('active-target');

        // Check if this field has duplicates for batch mapping
        const duplicates = templateStore.getDuplicatesOf(tfId) || [];
        const hasDuplicates = duplicates.length > 0;

        const fieldId = stateField?.id || tfId;

        // V3.4: Build mapped field info line
        let mappedInfoHtml = '';
        if (isMapped && stateField) {
            const pageNum = stateField.page || '?';
            const bboxInfo = stateField.bbox ?
                `${Math.round(stateField.bbox[2] * 100)}×${Math.round(stateField.bbox[3] * 100)}%` : '';
            mappedInfoHtml = `
                <div class="field-mapped-info">
                    <span class="mapped-badge">✓ מופה</span>
                    <span class="mapped-page">עמ׳ ${pageNum}</span>
                    ${bboxInfo ? `<span class="mapped-size">${bboxInfo}</span>` : ''}
                </div>
            `;
        }

        // V3.4: Build duplicate info with explanation
        let duplicateInfoHtml = '';
        if (hasDuplicates) {
            const dupNames = duplicates.slice(0, 3).map(d => d.label_he || d.label_en || d.template_field_id).join(', ');
            const moreCount = duplicates.length > 3 ? ` +${duplicates.length - 3}` : '';
            duplicateInfoHtml = `
                <div class="field-duplicate-info" title="שדות זהים בתבנית: ${dupNames}${moreCount}. מיפוי אחד יחול על כולם.">
                    <span class="duplicate-icon">📋</span>
                    <span class="duplicate-text">כפיל (${duplicates.length + 1} שדות זהים)</span>
                </div>
            `;
        }

        return `
            <div class="${classes.join(' ')}" data-field-id="${fieldId}" data-template-field-id="${tfId}">
                <div class="field-header">
                    <span class="field-status-icon ${statusClass}" title="${statusTitle}"></span>
                    <span class="field-icon">${typeIcon}</span>
                    <div class="field-names">
                        <div class="field-name-he">${this._escapeHtml(displayName)}</div>
                        <div class="field-name-en">${this._escapeHtml(englishName)}</div>
                        ${mappedInfoHtml}
                        ${duplicateInfoHtml}
                    </div>
                    ${showHeaderPlacementToggle ? `
                        <div class="header-placement-toggle" data-field-id="${fieldId}">
                            <button type="button"
                                    class="placement-mini-btn ${!isAutoMode ? 'active' : ''}"
                                    data-mode="symbol"
                                    title="סימן קטן">■</button>
                            <button type="button"
                                    class="placement-mini-btn ${isAutoMode ? 'active' : ''}"
                                    data-mode="auto"
                                    title="זיהוי תא">▭</button>
                        </div>
                    ` : ''}
                    <div class="field-actions">
                        ${!isMapped ? `
                            <button class="btn-map" title="בחר למיפוי">🎯</button>
                        ` : `
                            <button class="btn-locate" title="הצג בעמוד">👁</button>
                        `}
                        <button class="btn-expand" title="הרחב">${isExpanded ? '▲' : '▼'}</button>
                    </div>
                </div>
                ${isExpanded ? this._renderFieldEditor(stateField || templateField) : ''}
            </div>
        `;
    }

    /**
     * Render a single field item
     */
    _renderFieldItem(field, selectedId, isMapped) {
        const isSelected = field.id === selectedId;
        const isExpanded = this.expandedFieldId === field.id;
        const isSelectedForMapping = this.selectedForMapping === field.id;
        const typeIcon = this._getTypeIcon(field.type);

        // Names - V3.4: Include 'name' field for flat format support
        const hebrewName = field.label_he || field.labelHe || field.hebrewName || '';
        const fieldName = field.name || ''; // Flat format uses 'name' as English identifier
        const englishName = field.label_en || field.labelEn || fieldName || field.englishId || field.canonical || '';
        const displayName = hebrewName || fieldName || `שדה ${field.id.split('_')[1] || ''}`;

        // Classes
        let classes = ['field-item'];
        if (isSelected) classes.push('selected');
        if (isExpanded) classes.push('expanded');
        if (isMapped) classes.push('mapped');
        else classes.push('unmapped');
        if (isSelectedForMapping) classes.push('ready-to-map');

        // V3.9.1: Only checkbox gets placement toggle (radio is always small circles)
        const showHeaderPlacementToggle = !isMapped && field.type === 'checkbox';
        const isAutoMode = field.placementMode === 'auto';

        return `
            <div class="${classes.join(' ')}" data-field-id="${field.id}">
                <div class="field-header">
                    <span class="field-icon">${typeIcon}</span>
                    <div class="field-names">
                        <div class="field-name-he">${this._escapeHtml(displayName)}</div>
                        <div class="field-name-en">${this._escapeHtml(englishName)}</div>
                    </div>
                    ${showHeaderPlacementToggle ? `
                        <div class="header-placement-toggle" data-field-id="${field.id}">
                            <button type="button"
                                    class="placement-mini-btn ${!isAutoMode ? 'active' : ''}"
                                    data-mode="symbol"
                                    title="סימן קטן">■</button>
                            <button type="button"
                                    class="placement-mini-btn ${isAutoMode ? 'active' : ''}"
                                    data-mode="auto"
                                    title="זיהוי תא">▭</button>
                        </div>
                    ` : ''}
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
     * V3.6: Now expandable with full column/field details
     * @param {Object} table - Table object from state
     * @returns {string} HTML string
     */
    _renderTableItem(table) {
        const columnCount = (table.columns || []).length;
        const rowCount = table.rowCount || 0;
        const isExpanded = this.expandedTables.has(table.tableId);

        // Check if table is mapped (has position on PDF)
        const isMapped = !!(table.bbox || table.headerBBox || table.tableBBox);

        // Build table name: prefer tableTitle/tableName (semantic), fallback to column names
        let tableName;
        if (table.tableName && typeof table.tableName === 'string') {
            tableName = table.tableName;
        } else if (table.tableTitle && typeof table.tableTitle === 'object' && table.tableTitle.text) {
            tableName = table.tableTitle.text;
        } else if (table.tableTitle && typeof table.tableTitle === 'string') {
            tableName = table.tableTitle;
        } else {
            const firstColumnNames = (table.columns || [])
                .slice(0, 2)
                .map(col => col.hebrewName || col.columnId)
                .filter(n => n)
                .join(', ');
            tableName = firstColumnNames || `טבלה ${columnCount}×${rowCount}`;
        }

        // Status badge
        const statusClass = isMapped ? 'mapped' : 'unmapped';
        const statusBadge = isMapped ? '' : '<span class="unmapped-badge">ממתין למיפוי</span>';

        // Action buttons - different for mapped vs unmapped
        const actionButtons = isMapped ? `
            <button class="btn-table-highlight" data-table-id="${table.tableId}" title="הדגש טבלה">👁️</button>
            <button class="btn-table-expand" data-table-id="${table.tableId}" title="${isExpanded ? 'כווץ' : 'הרחב'}">${isExpanded ? '▲' : '▼'}</button>
            <button class="btn-table-delete" data-table-id="${table.tableId}" title="מחק טבלה">🗑️</button>
        ` : `
            <button class="btn-table-map" data-table-id="${table.tableId}" title="מפה על ה-PDF">📍 מפה</button>
            <button class="btn-table-expand" data-table-id="${table.tableId}" title="${isExpanded ? 'כווץ' : 'הרחב'}">${isExpanded ? '▲' : '▼'}</button>
            <button class="btn-table-delete" data-table-id="${table.tableId}" title="מחק טבלה">🗑️</button>
        `;

        // Get fields belonging to this table
        const tableFields = (state.get('fields') || []).filter(f => f.tableGroupId === table.tableId);

        // Render expanded content
        let expandedContent = '';
        if (isExpanded) {
            expandedContent = this._renderTableExpandedContent(table, tableFields);
        }

        return `
            <div class="field-item table-item ${statusClass} ${isExpanded ? 'expanded' : ''}" data-table-id="${table.tableId}">
                <div class="field-header table-header-clickable" data-table-id="${table.tableId}">
                    <span class="field-icon">📊</span>
                    <div class="field-names">
                        <div class="field-name-he">${this._escapeHtml(tableName)}</div>
                        <div class="field-name-en">${table.tableId}</div>
                    </div>
                    <div class="field-badge">${columnCount}×${rowCount}</div>
                </div>
                ${statusBadge}
                <div class="table-actions">
                    ${actionButtons}
                </div>
                ${expandedContent}
            </div>
        `;
    }

    /**
     * V3.6: Render expanded table content with columns and fields
     * @param {Object} table - Table object
     * @param {Array} tableFields - Fields belonging to this table
     * @returns {string} HTML string
     */
    _renderTableExpandedContent(table, tableFields) {
        const columns = table.columns || [];
        const rowCount = table.rowCount || 0;

        // Group fields by column
        const fieldsByColumn = {};
        tableFields.forEach(field => {
            const colIdx = field.tableColumn ?? 0;
            if (!fieldsByColumn[colIdx]) {
                fieldsByColumn[colIdx] = [];
            }
            fieldsByColumn[colIdx].push(field);
        });

        // Build columns HTML
        let columnsHtml = '';
        columns.forEach((col, colIdx) => {
            const colFields = fieldsByColumn[colIdx] || [];
            const colName = col.hebrewName || col.name || col.columnId || `עמודה ${colIdx + 1}`;
            const colType = col.type || 'text';
            const typeIcon = this._getTypeIcon(colType);

            columnsHtml += `
                <div class="table-column-item" data-column-idx="${colIdx}">
                    <div class="column-header">
                        <span class="column-icon">${typeIcon}</span>
                        <span class="column-name">${this._escapeHtml(colName)}</span>
                        <span class="column-type">(${colType})</span>
                        <span class="column-field-count">${colFields.length} שדות</span>
                    </div>
                    <div class="column-fields">
                        ${colFields.slice(0, 5).map((field, idx) => `
                            <div class="table-field-mini" data-field-id="${field.id}">
                                <span class="field-row-num">שורה ${field.tableRow + 1}:</span>
                                <span class="field-label">${this._escapeHtml(field.label_he || field.columnName || '')}</span>
                                ${field.isMapped ? '<span class="mapped-check">✓</span>' : ''}
                            </div>
                        `).join('')}
                        ${colFields.length > 5 ? `<div class="more-fields">+${colFields.length - 5} שדות נוספים</div>` : ''}
                    </div>
                </div>
            `;
        });

        // Position info
        let positionInfo = 'לא ממופה';
        if (table.bbox) {
            const bbox = table.bbox;
            if (Array.isArray(bbox)) {
                positionInfo = `X: ${bbox[0].toFixed(0)}, Y: ${bbox[1].toFixed(0)}, W: ${bbox[2].toFixed(0)}, H: ${bbox[3].toFixed(0)}`;
            } else if (bbox.x !== undefined) {
                positionInfo = `X: ${bbox.x.toFixed(0)}, Y: ${bbox.y.toFixed(0)}, W: ${bbox.width.toFixed(0)}, H: ${bbox.height.toFixed(0)}`;
            }
        }

        return `
            <div class="table-expanded-content">
                <div class="table-info-section">
                    <div class="info-row">
                        <span class="info-label">עמוד:</span>
                        <span class="info-value">${table.page || '?'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">מיקום:</span>
                        <span class="info-value">${positionInfo}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">סה"כ שדות:</span>
                        <span class="info-value">${tableFields.length}</span>
                    </div>
                </div>
                <div class="table-columns-section">
                    <div class="section-title">עמודות (${columns.length})</div>
                    ${columnsHtml}
                </div>
            </div>
        `;
    }

    /**
     * V3.6: Toggle table expansion
     * @param {string} tableId - Table ID
     */
    _toggleTableExpand(tableId) {
        if (this.expandedTables.has(tableId)) {
            this.expandedTables.delete(tableId);
        } else {
            this.expandedTables.add(tableId);
        }
        this._scheduleRender();
    }

    /**
     * Render the expanded field editor
     */
    _renderFieldEditor(field) {
        const hebrewName = field.label_he || field.labelHe || field.hebrewName || '';
        // V3.4: Better English name extraction - use name/canonical before falling back
        // Don't use field.id as fallback since that's a system-generated ID
        const englishName = field.label_en || field.labelEn || field.name || field.canonical || field.englishId || '';

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

        // V3.9.1: Placement mode toggle for checkbox/radio
        const placementModeHtml = this._renderPlacementModeToggle(field);

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
                    <label>שם אנגלי</label>
                    <input type="text"
                           class="input-en"
                           value="${this._escapeHtml(englishName)}"
                           data-field-id="${field.id}"
                           data-property="label_en"
                           placeholder="English name (e.g. firstName)">
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
                ${placementModeHtml}
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
                        <button class="btn-duplicate" data-field-id="${field.id}">📋 שכפל ×N</button>
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
     * V3.9.1: Render placement mode toggle for checkbox/radio fields
     * @param {Object} field - Field object
     * @returns {string} HTML string for placement mode toggle
     */
    _renderPlacementModeToggle(field) {
        // Only show for checkbox/radio fields
        if (!['checkbox', 'radio'].includes(field.type)) {
            return '';
        }

        const isAuto = field.placementMode === 'auto';
        const symbolIcon = field.type === 'checkbox' ? '☑️' : '🔘';

        return `
            <div class="editor-row placement-mode-row">
                <label>מצב הצבה</label>
                <div class="placement-toggle-buttons" data-field-id="${field.id}">
                    <button type="button"
                            class="placement-toggle ${!isAuto ? 'active' : ''}"
                            data-mode="symbol"
                            title="סימון קטן - ריבוע/עיגול קבוע">
                        ${symbolIcon} סימן
                    </button>
                    <button type="button"
                            class="placement-toggle ${isAuto ? 'active' : ''}"
                            data-mode="auto"
                            title="זיהוי אוטומטי - מזהה תא/עמודה">
                        ▭ תא
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Attach event handlers after render
     */
    _attachEventHandlers() {
        // V3.3: Entity header click - toggle expand/collapse
        this.fieldList.querySelectorAll('.entity-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const entityId = header.dataset.entityId;
                if (entityId) {
                    this._toggleEntityExpand(entityId);
                }
            });
        });

        // V3.8: Section header click (for guided mode) - toggle expand
        this.fieldList.querySelectorAll('[data-toggle-section]').forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                const sectionId = header.dataset.toggleSection;
                if (sectionId) {
                    this._toggleEntityExpand(sectionId);
                }
            });
        });

        // Field header click - toggle expand AND select
        // V3.8: Separate handling for guided mode vs template mode
        this.fieldList.querySelectorAll('.field-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't trigger if clicking a button
                if (e.target.closest('button')) return;

                const fieldItem = header.closest('.field-item');
                const fieldId = fieldItem.dataset.fieldId;
                const field = state.getField(fieldId);
                const isGuidedMode = fieldItem.dataset.guided === 'true';

                if (isGuidedMode) {
                    // V3.8: Guided mode - simpler behavior
                    // For unmapped: just select for mapping (no expand)
                    // For mapped: select to highlight
                    if (field?.isMapped) {
                        state.selectField(fieldId);
                    }
                    // Don't auto-select for mapping on header click in guided mode
                    // User should click the 🎯 button explicitly
                } else {
                    // Template mode - original behavior
                    this._toggleExpand(fieldId);

                    if (field?.isMapped) {
                        state.selectField(fieldId);
                    } else {
                        this._selectForMapping(fieldId);
                    }
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

        // V3.4: Locate button (for mapped fields) - navigate to field on canvas
        this.fieldList.querySelectorAll('.btn-locate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fieldItem = btn.closest('.field-item');
                const fieldId = fieldItem.dataset.fieldId;
                this._locateField(fieldId);
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

        // V3.9: Duplicate button
        this.fieldList.querySelectorAll('.btn-duplicate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fieldId = btn.dataset.fieldId;
                if (window.duplicateFieldDialog) {
                    window.duplicateFieldDialog.show(fieldId);
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

        // V3.6: Table expand button
        this.fieldList.querySelectorAll('.btn-table-expand').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tableId = btn.dataset.tableId;
                this._toggleTableExpand(tableId);
            });
        });

        // V3.6: Table header click - toggle expand
        this.fieldList.querySelectorAll('.table-header-clickable').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                const tableId = header.dataset.tableId;
                this._toggleTableExpand(tableId);
            });
        });

        // Table item click - select/expand (legacy support for non-header clicks)
        this.fieldList.querySelectorAll('.table-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return; // Don't handle button clicks
                if (e.target.closest('.table-header-clickable')) return; // Header handles its own click
                if (e.target.closest('.table-expanded-content')) return; // Don't close when clicking expanded content

                const tableId = item.dataset.tableId;
                const table = state.getTable(tableId);
                if (table) {
                    // Toggle expand on any click
                    this._toggleTableExpand(tableId);
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

        // V3.9.1: Placement mode toggle for checkbox/radio (in editor)
        this.fieldList.querySelectorAll('.placement-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const container = btn.closest('.placement-toggle-buttons');
                const fieldId = container?.dataset.fieldId;
                const mode = btn.dataset.mode;
                if (fieldId && mode) {
                    this._setFieldPlacementMode(fieldId, mode);
                }
            });
        });

        // V3.9.1: Mini placement toggle in header (for unmapped checkbox/radio)
        this.fieldList.querySelectorAll('.placement-mini-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const container = btn.closest('.header-placement-toggle');
                const fieldId = container?.dataset.fieldId;
                const mode = btn.dataset.mode;
                if (fieldId && mode) {
                    this._setFieldPlacementMode(fieldId, mode);
                    // Update mini buttons immediately
                    container.querySelectorAll('.placement-mini-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.mode === mode);
                    });
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

        // V3.10: Delete table region buttons
        this.fieldList.querySelectorAll('.btn-delete-region').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const regionId = btn.dataset.regionId;
                if (regionId && window.tableRegionManager) {
                    if (confirm('למחוק את הטבלה?')) {
                        window.tableRegionManager.deleteRegion(regionId);
                        this.render();
                    }
                }
            });
        });

        // V3.14: Add column button - starts Capture Name mode for table
        this.fieldList.querySelectorAll('.btn-add-column').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const regionId = btn.dataset.regionId;
                if (regionId && window.tableRegionManager) {
                    // Set active table region
                    window.tableRegionManager.setActiveRegion(regionId);
                    // Start Capture Name mode
                    eventBus.emit(Events.TOOL_CHANGED, { tool: 'capture_name' });
                    eventBus.emit(Events.TOAST_SHOW, {
                        message: 'בחר שם לעמודה החדשה, ואז צייר בשורה הראשונה',
                        type: 'info',
                        duration: 5000
                    });
                }
            });
        });

        // V3.14: Finish table mapping button
        this.fieldList.querySelectorAll('.btn-finish-table').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const regionId = btn.dataset.regionId;
                if (regionId && window.tableRegionManager) {
                    const region = window.tableRegionManager.getRegion(regionId);
                    const columnCount = region?.columns?.length || 0;

                    // Clear active region
                    window.tableRegionManager.setActiveRegion(null);

                    // Switch to select tool
                    eventBus.emit(Events.TOOL_CHANGED, { tool: 'select' });

                    // Show completion message
                    eventBus.emit(Events.TOAST_SHOW, {
                        message: `מיפוי טבלה "${region?.name_he || 'טבלה'}" הושלם (${columnCount} עמודות)`,
                        type: 'success',
                        duration: 3000
                    });
                }
            });
        });

        // V3.10: Toggle table expand/collapse
        this.fieldList.querySelectorAll('[data-toggle-table]').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking delete button
                if (e.target.closest('.btn-delete-region')) return;

                e.stopPropagation();
                const regionId = header.dataset.toggleTable;
                if (regionId) {
                    const tableKey = `table_${regionId}`;
                    if (this.expandedEntities.has(tableKey)) {
                        this.expandedEntities.delete(tableKey);
                    } else {
                        this.expandedEntities.add(tableKey);
                    }
                    this.render();
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
     * V3.9.1: Set placement mode for checkbox/radio field
     * @param {string} fieldId - Field ID
     * @param {string} mode - 'symbol' or 'auto'
     */
    _setFieldPlacementMode(fieldId, mode) {
        const field = state.getField(fieldId);
        if (!field) return;

        // Update field with new placement mode
        // 'symbol' = small checkbox/radio symbol (default)
        // 'auto' = use AutoBoxer to detect cell/column boundaries
        state.updateField(fieldId, { placementMode: mode });
        console.log(`[SidebarController] Set placement mode for ${fieldId}: ${mode}`);

        // Update UI
        const container = this.fieldList.querySelector(`.placement-toggle-buttons[data-field-id="${fieldId}"]`);
        if (container) {
            container.querySelectorAll('.placement-toggle').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
        }
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
        this._scheduleRender();  // V3.5: Use debounced render
    }

    /**
     * V3.3: Toggle entity section expand/collapse
     */
    _toggleEntityExpand(entityId) {
        if (this.expandedEntities.has(entityId)) {
            this.expandedEntities.delete(entityId);
        } else {
            this.expandedEntities.add(entityId);
        }
        this._scheduleRender();  // V3.5: Use debounced render
    }

    /**
     * Select unmapped field for mapping
     * V3.9: Uses IntentManager instead of scattered flags
     */
    _selectForMapping(fieldId) {
        const field = state.getField(fieldId);
        if (!field) return;

        // V3.9: Set Intent - this is the new unified way
        const source = templateStore.isLoaded() ? IntentSource.TEMPLATE :
                       fieldIntelligenceStore.getCurrent() ? IntentSource.AI_GUIDED :
                       IntentSource.SIDEBAR;

        intentManager.setIntent(
            intentManager.constructor.placeField(fieldId, source, {
                label_he: field.label_he,
                label_en: field.label_en,
                fieldType: field.type
            })
        );

        // LEGACY: Keep old flags for backward compatibility during migration
        this.selectedForMapping = fieldId;
        this.activeTemplateTarget = fieldId;
        drawController.pendingFieldId = fieldId;

        // Also set in templateStore if loaded
        if (templateStore.isLoaded() && field.templateFieldId) {
            templateStore.setActiveTarget(field.templateFieldId);
        }

        // V3.9: Always use DRAW_TEXT (AutoBoxer) for mapping from sidebar
        // The field TYPE (checkbox/radio) is preserved in data, but drawing always uses AutoBoxer
        state.setTool(Tools.DRAW_TEXT);

        // Update UI
        this._scheduleRender();  // V3.5: Use debounced render

        // Scroll to the selected field with highlight
        requestAnimationFrame(() => {
            const fieldEl = this.fieldList?.querySelector(`[data-field-id="${fieldId}"]`);
            if (fieldEl) {
                fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                fieldEl.classList.add('highlight-pulse');
                setTimeout(() => fieldEl.classList.remove('highlight-pulse'), 1000);
            }
        });

        // Show guidance toast
        const fieldName = field.label_he || field.name || 'שדה';
        if (typeof window.showToast === 'function') {
            window.showToast(`📍 ${fieldName}`, 'info', 2000);
        }
    }

    /**
     * Get the next unmapped field
     * @returns {Object|null} Next unmapped state field or null
     */
    _getNextUnmappedField() {
        // Get ALL unmapped fields - works with both template and direct JSON import
        const unmappedFields = state.getAllUnmappedFields();
        if (unmappedFields.length === 0) return null;

        // Return the first unmapped field
        return unmappedFields[0];
    }

    /**
     * V3.4: Locate a mapped field - navigate to its page and highlight it
     */
    _locateField(fieldId) {
        const field = state.getField(fieldId);
        if (!field || !field.isMapped) {
            console.warn('[SidebarController] Cannot locate unmapped field:', fieldId);
            return;
        }

        // Navigate to field's page if different
        const currentPage = state.get('document.currentPage');
        if (field.page && field.page !== currentPage) {
            state.setPage(field.page);
        }

        // Select the field to highlight it
        state.selectField(fieldId);

        // Emit event for overlay to scroll/highlight
        eventBus.emit(Events.FIELD_LOCATE, {
            fieldId: field.id,
            page: field.page,
            bbox: field.bbox
        });

        console.log(`[SidebarController] Located field: ${fieldId} on page ${field.page}`);
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
            this._scheduleRender();  // V3.5: Use debounced render
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
