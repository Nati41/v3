/**
 * Mapper Sidebar Engine - Sidebar rendering logic
 * These functions handle pure HTML generation for the sidebar.
 *
 * NOTE: All functions are pure - they receive state as parameters
 * and return HTML strings. No DOM manipulation or mapper state access.
 */
(function() {
    'use strict';

    // ============ FIELD ITEM RENDERING ============

    /**
     * Render an unnamed field item for the sidebar (Step 1)
     * Shows: Unnamed Field #N, Page, BBox, Status
     * @param {Object} field - Field object
     * @param {boolean} isExpanded - Whether this field is expanded
     * @param {boolean} isSelected - Whether this field is selected
     * @returns {string} HTML string for the unnamed field item
     */
    function renderUnnamedFieldItem(field, isExpanded, isSelected) {
        // Extract bbox info for display
        let bboxDisplay = 'N/A';
        if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            const [x, y, w, h] = field.bbox.map(v => (v * 100).toFixed(1));
            bboxDisplay = `(${x}%, ${y}%, ${w}%, ${h}%)`;
        } else if (field.pdfX !== undefined) {
            bboxDisplay = `(${field.pdfX.toFixed(1)}, ${field.pdfY.toFixed(1)}, ${field.pdfWidth.toFixed(1)}, ${field.pdfHeight.toFixed(1)})`;
        }

        // RADIO GROUPING: Check if field is radio and if grouping mode is active
        const isRadio = field.type === 'radio';
        const isCheckbox = field.type === 'checkbox';
        const isGroupingMode = window.mapper?.groupingMode === true;
        const isSelectedForGroup = field._selectedForGroup === true;

        // Grouping button for radio fields
        let groupingBtn = '';
        if (isRadio && isGroupingMode) {
            groupingBtn = `
                <button type="button"
                        class="group-select-btn ${isSelectedForGroup ? 'selected' : ''}"
                        data-field-id="${field.id}"
                        onclick="event.stopPropagation(); event.preventDefault(); window.MapperSidebarEngine.toggleGroupSelection('${field.id}', ${!isSelectedForGroup}); return false;"
                        title="${isSelectedForGroup ? 'הסר מהקבוצה' : 'הוסף לקבוצה'}">
                    ${isSelectedForGroup ? '✓' : '○'}
                </button>
            `;
        }

        // Field type icon
        const typeIcon = isRadio ? '🔘' : (isCheckbox ? '☑️' : '📐');

        return `
        <div class="field-item unnamed-field ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''} ${isRadio ? 'radio-field' : ''} ${isCheckbox ? 'checkbox-field' : ''} ${isGroupingMode && isRadio ? 'grouping-selectable' : ''} ${isSelectedForGroup ? 'selected-for-group' : ''}" data-field-id="${field.id}">
            <div class="field-item-header" onclick="mapper.toggleFieldExpansion('${field.id}')">
                ${groupingBtn}
                <div class="field-item-title">
                    <div class="field-name unnamed-field-name">
                        <span class="unnamed-icon">${typeIcon}</span>
                        ${field.label_he || field.labelHe || 'שדה ללא שם'}
                    </div>
                    <div class="field-id unnamed-field-info">
                        <span class="unnamed-page">עמוד: ${field.page}</span>
                        <span class="unnamed-bbox">BBox: ${bboxDisplay}</span>
                    </div>
                    <div class="unnamed-status">
                        <span class="status-waiting">⏳ ממתין לשם שדה</span>
                    </div>
                </div>
                <div class="field-item-actions">
                    <button onclick="event.stopPropagation(); mapper.selectField('${field.id}', { scroll: true })" title="בחר והדגש">👁️</button>
                    <button onclick="event.stopPropagation(); mapper.removeField('${field.id}')" title="מחק">🗑️</button>
                </div>
            </div>
            <div class="field-editor">
                <!-- שם השדה - עריכה ידנית -->
                <div class="editor-row">
                    <label>שם השדה (עברית)</label>
                    <input type="text" value="${field.labelHe || field.label_he || ''}"
                           onchange="mapper.updateFieldHebrewName('${field.id}', this.value)"
                           placeholder="הזן שם בעברית">
                </div>
                <div class="editor-row">
                    <label>מזהה אנגלי (ID)</label>
                    <input type="text" value="${field.labelEn || field.label_en || field.id}"
                           onchange="mapper.updateFieldEnglishId('${field.id}', this.value)"
                           placeholder="Enter English ID">
                </div>
                <div class="unnamed-field-details">
                    <div class="detail-row">
                        <label>מזהה מערכת:</label>
                        <span>${field.id}</span>
                    </div>
                    <div class="detail-row">
                        <label>עמוד:</label>
                        <span>${field.page}</span>
                    </div>
                    <div class="detail-row">
                        <label>מיקום:</label>
                        <span>${bboxDisplay}</span>
                    </div>
                    <div class="detail-row">
                        <label>סוג:</label>
                        <span>${field.type}</span>
                    </div>
                </div>
                <div class="unnamed-field-note">
                    <p>💡 הזן שם לשדה או בחר טקסט מה-PDF.</p>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Render a single field item for the sidebar
     * @param {Object} field - Field object
     * @param {boolean} isExpanded - Whether this field is expanded
     * @param {boolean} isSelected - Whether this field is selected
     * @param {boolean} isInMappingMode - Whether mapper is in mapping mode
     * @returns {string} HTML string for the field item
     */
    function renderFieldItem(field, isExpanded, isSelected, isInMappingMode) {
        const isUnmapped = field.isMapped === false;
        const isUnnamed = field.isUnnamed === true;
        const isLinked = field.linked === true;

        // For unnamed fields (Step 1), use special renderer
        if (isUnnamed) {
            return renderUnnamedFieldItem(field, isExpanded, isSelected);
        }

        // Determine status badge for linked fields (Step 2)
        let statusBadge = '';
        if (isLinked) {
            statusBadge = '<span class="linked-status">✔ מקושר</span>';
        } else if (!isUnmapped) {
            statusBadge = '<span class="unlinked-status">⚠ ללא שם</span>';
        }

        // Field name display - show hebrewName if linked, otherwise label_he
        // FIX PACKAGE 1: Use labelHe/labelEn with fallbacks
        const displayName = field.labelHe || field.hebrewName || field.label_he || field.id;
        // Always show field.id as the English identifier (it's always English/system-generated)
        const fieldIdDisplay = field.id;

        // Escape quotes for HTML attributes
        const escapedDisplayName = (displayName || '').replace(/"/g, '&quot;');
        const escapedFieldId = (fieldIdDisplay || '').replace(/"/g, '&quot;');

        // RADIO GROUPING: Check if field is radio/checkbox and if grouping mode is active
        const isRadio = field.type === 'radio';
        const isCheckbox = field.type === 'checkbox';
        const isGroupingMode = window.mapper?.groupingMode === true;
        const isSelectedForGroup = field._selectedForGroup === true;
        const hasGroup = field.groupId ? true : false;

        // Radio group badge
        let groupBadge = '';
        if (isRadio && hasGroup) {
            const groupName = window.mapper?.radioGroups?.find(g => g.groupId === field.groupId)?.groupName || field.groupId;
            groupBadge = `<span class="radio-group-badge" title="קבוצה: ${groupName}">🔗</span>`;
        }

        // Grouping checkbox/button for radio fields - ALWAYS render it, CSS controls visibility
        let groupingCheckbox = '';
        if (isRadio) {
            if (isGroupingMode) {
                // In grouping mode - show a clear clickable button
                groupingCheckbox = `
                    <button type="button"
                            class="group-select-btn ${isSelectedForGroup ? 'selected' : ''}"
                            data-field-id="${field.id}"
                            onclick="event.stopPropagation(); event.preventDefault(); console.log('Group btn clicked for', '${field.id}'); window.MapperSidebarEngine.toggleGroupSelection('${field.id}', ${!isSelectedForGroup}); return false;"
                            title="${isSelectedForGroup ? 'הסר מהקבוצה' : 'הוסף לקבוצה'}">
                        ${isSelectedForGroup ? '✓' : '○'}
                    </button>
                `;
            } else {
                // Not in grouping mode - show hidden checkbox for hover
                groupingCheckbox = `
                    <input type="checkbox"
                           class="group-select-checkbox"
                           data-field-id="${field.id}"
                           ${isSelectedForGroup ? 'checked' : ''}
                           onclick="event.stopPropagation(); window.MapperSidebarEngine.toggleGroupSelection('${field.id}', this.checked)"
                           title="סמן לקיבוץ רדיו">
                `;
            }
        }

        // Field type class
        const typeClass = isRadio ? 'radio-field' : (isCheckbox ? 'checkbox-field' : '');

        return `
        <div class="field-item ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''} ${isUnmapped ? 'unmapped' : ''} ${isLinked ? 'linked' : ''} ${typeClass} ${isGroupingMode && isRadio ? 'grouping-selectable' : ''} ${isSelectedForGroup ? 'selected-for-group' : ''}" data-field-id="${field.id}">
            <div class="field-item-header" onclick="mapper.toggleFieldExpansion('${field.id}')">
                ${groupingCheckbox}
                <div class="field-item-title">
                    <!-- FIX PACKAGE 1: Click-to-edit Hebrew name -->
                    <div class="field-name editable-field-name"
                         onclick="event.stopPropagation(); window.MapperSidebarEngine.startInlineEdit(this, '${field.id}', 'labelHe')"
                         title="לחץ לעריכה">
                        ${displayName}
                        <span class="edit-icon">✏️</span>
                        ${statusBadge}
                        ${groupBadge}
                        ${isUnmapped ? '<span style="color: #999; font-size: 12px;">(טרם שורטט)</span>' : ''}
                    </div>
                    <!-- FIX PACKAGE 1: Click-to-edit English ID -->
                    <div class="field-id editable-field-id"
                         onclick="event.stopPropagation(); window.MapperSidebarEngine.startInlineEdit(this, '${field.id}', 'labelEn')"
                         title="לחץ לעריכת מזהה אנגלי">
                        <span class="field-english-id">${fieldIdDisplay}</span>
                        <span class="edit-icon">✏️</span>
                        <span class="field-meta"> | ${field.type} | ${(field.direction || 'rtl').toUpperCase()}</span>
                    </div>
                </div>
                <div class="field-item-actions">
                    <button onclick="event.stopPropagation(); mapper.selectField('${field.id}', { scroll: true })" title="בחר">👁️</button>
                    <button onclick="event.stopPropagation(); mapper.duplicateField('${field.id}')" title="שכפל">📋</button>
                    <button onclick="event.stopPropagation(); mapper.removeField('${field.id}')" title="מחק">🗑️</button>
                </div>
            </div>
            <div class="field-editor">
                <!-- FIX PACKAGE 1: Editable Hebrew Name with auto-regenerate English -->
                <div class="editor-row">
                    <label>שם השדה (עברית)</label>
                    <input type="text" value="${escapedDisplayName}"
                           onchange="mapper.updateFieldHebrewName('${field.id}', this.value)"
                           placeholder="הזן שם בעברית">
                </div>

                <!-- FIX PACKAGE 1: Editable English ID (manual override) -->
                <div class="editor-row">
                    <label>מזהה אנגלי (ID)</label>
                    <input type="text" value="${escapedFieldId}"
                           onchange="mapper.updateFieldEnglishId('${field.id}', this.value)"
                           placeholder="Enter English ID">
                </div>

                <div class="editor-row-group">
                    <div class="editor-row">
                        <label>מזהה מערכת</label>
                        <input type="text" value="${field.id}" onchange="mapper.updateFieldId('${field.id}', this.value)" readonly style="background: #f5f5f5;">
                    </div>
                    <div class="editor-row">
                        <label>סוג השדה</label>
                        <select onchange="mapper.updateFieldProperty('${field.id}', 'type', this.value)">
                            <option value="text" ${field.type === 'text' ? 'selected' : ''}>טקסט</option>
                            <option value="number" ${field.type === 'number' ? 'selected' : ''}>מספר</option>
                            <option value="date" ${field.type === 'date' ? 'selected' : ''}>תאריך</option>
                            <option value="email" ${field.type === 'email' ? 'selected' : ''}>אימייל</option>
                            <option value="phone" ${field.type === 'phone' ? 'selected' : ''}>טלפון</option>
                            <option value="id_number" ${field.type === 'id_number' ? 'selected' : ''}>ת.ז</option>
                            <option value="address" ${field.type === 'address' ? 'selected' : ''}>כתובת</option>
                            <option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                            <option value="radio" ${field.type === 'radio' ? 'selected' : ''}>Radio</option>
                            <option value="signature" ${field.type === 'signature' ? 'selected' : ''}>חתימה</option>
                        </select>
                    </div>
                </div>

                <div class="editor-row">
                    <label>כיוון טקסט</label>
                    <div class="direction-toggle">
                        <button type="button" class="${field.direction === 'rtl' ? 'active' : ''}" onclick="mapper.updateFieldProperty('${field.id}', 'direction', 'rtl')">עברית (RTL)</button>
                        <button type="button" class="${field.direction === 'ltr' ? 'active' : ''}" onclick="mapper.updateFieldProperty('${field.id}', 'direction', 'ltr')">אנגלית (LTR)</button>
                    </div>
                </div>

                <!-- Dummy data removed from Mapper mode - structure only -->

                <div class="editor-row-group">
                    <div class="editor-row">
                        <label>גודל גופן</label>
                        <input type="number" min="8" max="48" value="${field.fontSize}" onchange="mapper.updateFieldProperty('${field.id}', 'fontSize', parseInt(this.value))">
                    </div>
                    <div class="editor-row">
                        <label>ריווח אותיות</label>
                        <input type="number" min="-2" max="5" step="0.1" value="${field.letterSpacing}" onchange="mapper.updateFieldProperty('${field.id}', 'letterSpacing', parseFloat(this.value))">
                    </div>
                </div>

                ${isUnmapped ? `
                <div class="editor-row">
                    <button class="btn-apply" onclick="mapper.selectFieldForMapping('${field.id}')" style="width: 100%;">
                        🎯 שרטט שדה זה במסמך
                    </button>
                </div>
                ` : `
                <!-- Field preview removed from Mapper mode - structure only -->
                `}
            </div>
        </div>
        `;
    }

    // ============ TABLE GROUP RENDERING ============

    /**
     * Render a table group for the sidebar
     * @param {Object} group - Table group object
     * @param {boolean} isExpanded - Whether this group is expanded
     * @param {Array} groupFields - Fields belonging to this group
     * @returns {string} HTML string for the table group
     */
    function renderTableGroup(group, isExpanded, groupFields) {
        return `
        <div class="table-group ${isExpanded ? 'expanded' : ''}" data-group-id="${group.id}">
            <div class="table-group-header" onclick="mapper.toggleFieldExpansion('${group.id}')">
                <div class="table-group-title">${group.name}</div>
                <div class="table-group-info">${group.rows} × ${group.cols} = ${groupFields.length} שדות</div>
            </div>
            <div class="table-group-content">
                ${groupFields.map(field => `
                    <div class="table-field-item">
                        <div class="table-field-name">${field.id}</div>
                        <div class="table-field-actions">
                            <button onclick="mapper.selectFieldForMapping('${field.id}')" title="מפה">🎯</button>
                            <button onclick="mapper.removeField('${field.id}')" title="מחק">🗑️</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        `;
    }

    // ============ OPTION GROUP RENDERING (Step 3) ============

    /**
     * Render an option group for the sidebar
     * @param {Object} group - Option group object
     * @param {boolean} isExpanded - Whether this group is expanded
     * @returns {string} HTML string for the option group
     */
    function renderOptionGroup(group, isExpanded) {
        const isFullyLabeled = group.linked === true;
        const groupType = group.type === 'radio' ? '🔘' : '☑️';
        const typeLabel = group.type === 'radio' ? 'רדיו' : 'צ\'קבוקס';
        const statusClass = isFullyLabeled ? 'linked' : 'unlabeled';
        const statusBadge = isFullyLabeled
            ? '<span class="linked-status">✔ מקושר</span>'
            : '<span class="unlinked-status">⏳ ממתין לתיוג</span>';

        return `
        <div class="option-group ${isExpanded ? 'expanded' : ''} ${statusClass}" data-group-id="${group.groupId}">
            <div class="option-group-header" onclick="mapper.toggleFieldExpansion('${group.groupId}')">
                <div class="option-group-title">
                    <span class="option-group-icon">${groupType}</span>
                    <span class="option-group-name">${group.hebrewName || 'קבוצה ללא שם'}</span>
                    ${statusBadge}
                </div>
                <div class="option-group-info">
                    <span class="option-group-type">${typeLabel}</span>
                    <span class="option-group-count">${group.options.length} אפשרויות</span>
                </div>
            </div>
            <div class="option-group-content">
                <div class="option-group-actions">
                    <button class="btn-group-name" onclick="event.stopPropagation(); mapper.activateGroupNamingMode(mapper.getOptionGroupById('${group.groupId}'))" title="הגדר שם קבוצה">
                        📌 שם קבוצה
                    </button>
                    <button class="btn-group-delete" onclick="event.stopPropagation(); mapper.removeOptionGroup('${group.groupId}')" title="מחק קבוצה">
                        🗑️ מחק
                    </button>
                </div>
                <div class="option-group-details">
                    <div class="detail-row">
                        <label>מזהה:</label>
                        <span>${group.groupId}</span>
                    </div>
                    <div class="detail-row">
                        <label>שם עברי:</label>
                        <span>${group.hebrewName || '(לא הוגדר)'}</span>
                    </div>
                    <div class="detail-row">
                        <label>מזהה אנגלי:</label>
                        <span>${group.englishId || '(לא הוגדר)'}</span>
                    </div>
                </div>
                <div class="option-items-list">
                    <h4>אפשרויות:</h4>
                    ${group.options.map((option, index) => `
                        <div class="option-item ${option.linked ? 'labeled' : 'unlabeled'}">
                            <div class="option-item-header">
                                <span class="option-index">${index + 1}.</span>
                                <span class="option-label">${option.hebrewLabel || 'ללא תווית'}</span>
                                ${option.linked
                                    ? '<span class="option-status linked">✔</span>'
                                    : '<span class="option-status unlabeled">⏳</span>'}
                            </div>
                            <div class="option-item-actions">
                                <button onclick="event.stopPropagation(); mapper.activateOptionLabelingMode(mapper.getOptionGroupById('${group.groupId}').options[${index}], mapper.getOptionGroupById('${group.groupId}'))" title="הגדר תווית">
                                    📌 תווית
                                </button>
                                <button onclick="event.stopPropagation(); mapper.selectField('${option.fieldId}', { scroll: true })" title="הדגש">
                                    👁️
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Render all option groups for sidebar
     * @param {Array} optionGroups - Array of option groups
     * @param {string} expandedFieldId - Currently expanded group ID
     * @param {number} currentPage - Current page number
     * @returns {string} HTML string for all option groups
     */
    function renderOptionGroups(optionGroups, expandedFieldId, currentPage) {
        // Filter groups for current page
        const pageGroups = optionGroups.filter(g => g.page === currentPage);

        if (pageGroups.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">🔘</div>
                    <div class="empty-state-text">אין קבוצות אפשרויות</div>
                    <div class="empty-state-subtext">בחר מספר שדות קטנים ולחץ "🔘 קבץ" ליצירת קבוצה</div>
                </div>
            `;
        }

        return pageGroups.map(group => {
            const isExpanded = expandedFieldId === group.groupId;
            return renderOptionGroup(group, isExpanded);
        }).join('');
    }

    // ============ FULL SIDEBAR RENDERING ============

    /**
     * Render the full sidebar content based on current tab
     * @param {Array} fields - All fields
     * @param {Array} tableGroups - All table groups
     * @param {string} expandedFieldId - Currently expanded field ID
     * @param {string} selectedFieldId - Currently selected field ID
     * @param {string} currentTab - Current sidebar tab ('editing', 'mapped', 'tables')
     * @param {number} currentPage - Current page number
     * @returns {string} HTML string for the sidebar content
     */
    function renderFullSidebar(fields, tableGroups, expandedFieldId, selectedFieldId, currentTab, currentPage) {
        // Filter fields based on current tab and page
        let currentFields = [];

        if (currentTab === 'tables') {
            // Render table groups
            return tableGroups.map(group => {
                const groupFields = fields.filter(f => f.tableGroupId === group.id);
                const isExpanded = expandedFieldId === group.id;
                return renderTableGroup(group, isExpanded, groupFields);
            }).join('');
        }

        // Filter non-table fields for current page
        const pageFields = fields.filter(f => !f.isTableField && f.page === currentPage);

        if (currentTab === 'editing') {
            // Unmapped fields
            currentFields = pageFields.filter(f => !f.isMapped);
        } else if (currentTab === 'mapped') {
            // Mapped fields
            currentFields = pageFields.filter(f => f.isMapped);
        }

        if (currentFields.length === 0) {
            return renderEmptyState(currentTab);
        }

        return currentFields.map(field => {
            const isExpanded = expandedFieldId === field.id;
            const isSelected = selectedFieldId === field.id;
            return renderFieldItem(field, isExpanded, isSelected, false);
        }).join('');
    }

    /**
     * Render empty state for sidebar
     * @param {string} tab - Current tab
     * @returns {string} HTML string for empty state
     */
    function renderEmptyState(tab) {
        if (tab === 'editing') {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">🔭</div>
                    <div class="empty-state-text">אין שדות עדיין</div>
                    <div class="empty-state-subtext">גרור על המסמך כדי ליצור שדה חדש</div>
                </div>
            `;
        } else if (tab === 'mapped') {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-text">אין שדות ממופים</div>
                    <div class="empty-state-subtext">מפה שדות מטאב "עריכת שדות"</div>
                </div>
            `;
        } else if (tab === 'tables') {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-text">אין טבלאות</div>
                    <div class="empty-state-subtext">לחץ "📋 טבלה" ליצירת טבלה חדשה</div>
                </div>
            `;
        }
        return '';
    }

    // ============ SCROLL HELPER ============

    /**
     * Scroll a field item into view in the sidebar
     * @param {string} fieldId - Field ID to scroll to
     */
    function scrollFieldIntoView(fieldId) {
        const listItem = document.querySelector(`.field-item[data-field-id="${fieldId}"]`);
        if (listItem) {
            listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // ============ COUNTER CALCULATION ============

    /**
     * Calculate field counters from fields array
     * @param {Array} fields - All fields
     * @returns {Object} Counter values { total, mapped, unmapped, tables }
     */
    function calculateFieldCounters(fields) {
        const total = fields.length;
        const mapped = fields.filter(f => f.isMapped).length;
        const unmapped = total - mapped;
        const tables = fields.filter(f => f.isTableField).length;

        return { total, mapped, unmapped, tables };
    }

    // ============ TABLE VALIDATION REPORT (Step 6) ============

    /**
     * Render a table validation report for the sidebar
     * @param {Object} report - Validation report from TableValidator
     * @param {string} tableId - Table ID
     * @returns {string} HTML string for validation report
     */
    function renderTableValidationReport(report, tableId) {
        if (!report) return '';

        const { summary, errors, warnings, components } = report;

        let html = `
        <div class="table-validation-report" data-table-id="${tableId}">
            <div class="validation-header">
                <h4>📋 אימות טבלה: ${tableId}</h4>
                <div class="validation-status-badge ${summary.statusClass}">
                    ${summary.statusHebrew}
                </div>
            </div>
        `;

        // Errors section
        if (errors && errors.length > 0) {
            html += `
            <div class="validation-section validation-errors">
                <h5>❌ שגיאות (${errors.length}):</h5>
                <ul class="validation-list">
            `;
            errors.forEach(error => {
                html += `
                    <li class="validation-item error">
                        <span class="error-code">[${error.code}]</span>
                        <span class="error-message">${error.message}</span>
                        ${error.details ? `<span class="error-details"> - ${error.details}</span>` : ''}
                    </li>
                `;
            });
            html += '</ul></div>';
        }

        // Warnings section
        if (warnings && warnings.length > 0) {
            html += `
            <div class="validation-section validation-warnings">
                <h5>⚠️ אזהרות (${warnings.length}):</h5>
                <ul class="validation-list">
            `;
            warnings.forEach(warning => {
                html += `
                    <li class="validation-item warning">
                        <span class="warning-code">[${warning.code}]</span>
                        <span class="warning-message">${warning.message}</span>
                        ${warning.details ? `<span class="warning-details"> - ${warning.details}</span>` : ''}
                    </li>
                `;
            });
            html += '</ul></div>';
        }

        // Components status
        if (components) {
            html += `
            <div class="validation-section validation-components">
                <h5>📊 סטטוס רכיבים:</h5>
                <div class="components-grid">
                    <div class="component-item ${components.rows ? 'valid' : 'invalid'}">
                        <span class="component-icon">${components.rows ? '✓' : '✗'}</span>
                        <span class="component-name">שורות</span>
                    </div>
                    <div class="component-item ${components.columns ? 'valid' : 'invalid'}">
                        <span class="component-icon">${components.columns ? '✓' : '✗'}</span>
                        <span class="component-name">עמודות</span>
                    </div>
                    <div class="component-item ${components.sampleRow ? 'valid' : 'invalid'}">
                        <span class="component-icon">${components.sampleRow ? '✓' : '✗'}</span>
                        <span class="component-name">שורה לדוגמה</span>
                    </div>
                    <div class="component-item ${components.replication ? 'valid' : 'invalid'}">
                        <span class="component-icon">${components.replication ? '✓' : '✗'}</span>
                        <span class="component-name">שכפול</span>
                    </div>
                </div>
            </div>
            `;
        }

        // Valid message
        if (summary.status === 'valid') {
            html += `
            <div class="validation-section validation-success">
                <p>✅ הטבלה תקינה ומוכנה לייצוא</p>
            </div>
            `;
        }

        html += '</div>';
        return html;
    }

    /**
     * Show validation report in the sidebar
     * @param {Object} report - Validation report
     * @param {string} tableId - Table ID
     */
    function showTableValidationReport(report, tableId) {
        // Find or create validation report container
        let container = document.getElementById('table-validation-container');

        if (!container) {
            // Create container if it doesn't exist
            const fieldList = document.getElementById('field-list');
            if (fieldList) {
                container = document.createElement('div');
                container.id = 'table-validation-container';
                container.className = 'table-validation-container';
                fieldList.insertAdjacentElement('beforebegin', container);
            }
        }

        if (container) {
            // Remove previous report for this table
            const existingReport = container.querySelector(`[data-table-id="${tableId}"]`);
            if (existingReport) {
                existingReport.remove();
            }

            // Add new report
            container.insertAdjacentHTML('beforeend', renderTableValidationReport(report, tableId));

            // Auto-collapse after 10 seconds if valid
            if (report.valid) {
                setTimeout(() => {
                    const reportEl = container.querySelector(`[data-table-id="${tableId}"]`);
                    if (reportEl) {
                        reportEl.classList.add('collapsed');
                    }
                }, 10000);
            }
        }
    }

    /**
     * Clear all validation reports
     */
    function clearValidationReports() {
        const container = document.getElementById('table-validation-container');
        if (container) {
            container.innerHTML = '';
        }
    }

    // ============ FIX PACKAGE 2: TABLE MAPPING STEP INDICATOR ============

    /**
     * Render table mapping step indicator with Hebrew tooltips
     * @param {string} currentStep - Current step: 'region', 'rows', 'sample', 'columns', 'complete'
     * @returns {string} HTML string for step indicator
     */
    function renderTableStepIndicator(currentStep) {
        const steps = [
            { id: 'region', label: '1', tooltip: 'בחר את גבולות הטבלה' },
            { id: 'rows', label: '2', tooltip: 'כמה שורות יש בטבלה?' },
            { id: 'sample', label: '3', tooltip: 'בחר שורת דוגמה' },
            { id: 'columns', label: '4', tooltip: 'סמן עמודות' },
            { id: 'complete', label: '5', tooltip: 'סיום ומיפוי' }
        ];

        const stepIndex = steps.findIndex(s => s.id === currentStep);

        return `
        <div class="table-step-indicator">
            ${steps.map((step, idx) => {
                let stepClass = '';
                if (idx < stepIndex) stepClass = 'completed';
                else if (idx === stepIndex) stepClass = 'active';

                return `
                    <div class="table-step ${stepClass}" data-step="${step.id}">
                        <span>${step.label}</span>
                        <div class="table-step-tooltip">${step.tooltip}</div>
                    </div>
                    ${idx < steps.length - 1 ? '<span class="table-step-arrow">→</span>' : ''}
                `;
            }).join('')}
        </div>
        `;
    }

    /**
     * Render table data sidebar section
     * @param {Object} table - Current table being mapped
     * @returns {string} HTML string
     */
    function renderTableDataSection(table) {
        if (!table) return '';

        return `
        <div class="table-data-section">
            <h4>📊 נתוני טבלה</h4>
            <div class="table-data-actions">
                <button onclick="mapper.previewCurrentTable()">👁️ תצוגה מקדימה</button>
                <button onclick="mapper.editTableRowCount()">🔢 ערוך שורות</button>
                <button onclick="mapper.editTableColumns()">📐 ערוך עמודות</button>
            </div>
        </div>
        `;
    }

    /**
     * Render a mapped table item for the tables tab
     * @param {Object} table - Mapped table object
     * @param {boolean} isExpanded - Whether expanded
     * @returns {string} HTML string
     */
    function renderMappedTableItem(table, isExpanded) {
        const validationStatus = table.validationReport
            ? table.validationReport.summary
            : { statusClass: 'unknown', statusHebrew: 'לא נבדק' };

        const columnChips = (table.columns || []).map(col =>
            `<span class="column-chip" title="${col.columnId}">${col.hebrewName || col.columnId}</span>`
        ).join('');

        return `
        <div class="table-sidebar-item ${isExpanded ? 'expanded' : ''} ${validationStatus.statusClass}" data-table-id="${table.tableId}">
            <div class="table-header" onclick="mapper.toggleFieldExpansion('${table.tableId}')">
                <div class="table-name">📐 ${table.tableId}</div>
                <div class="table-validation-badge ${validationStatus.statusClass}">
                    ${validationStatus.statusHebrew}
                </div>
            </div>
            <div class="table-meta">
                <span>עמוד: ${table.page}</span>
                <span>שורות: ${table.rowCount}</span>
                <span>עמודות: ${(table.columns || []).length}</span>
            </div>
            <div class="table-columns">
                ${columnChips}
            </div>
            ${table.validationReport && !table.validationReport.valid ? `
            <div class="table-validation-inline">
                <span class="validation-warning-icon">⚠️</span>
                <span class="validation-warning-text">${table.validationReport.summary.criticalCount} שגיאות</span>
            </div>
            ` : ''}
            <div class="table-actions">
                <button onclick="event.stopPropagation(); mapper.highlightTable('${table.tableId}')" title="הדגש">👁️ הדגש</button>
                <button onclick="event.stopPropagation(); mapper.revalidateTable('${table.tableId}')" title="אמת מחדש">🔄 אמת</button>
                <button onclick="event.stopPropagation(); mapper.removeTable('${table.tableId}')" title="מחק">🗑️ מחק</button>
            </div>
        </div>
        `;
    }

    /**
     * Render all mapped tables for the tables tab
     * FIX PACKAGE 2: Added step indicator when in table mapping mode
     * @param {Array} mappedTables - Array of mapped tables
     * @param {string} expandedId - Currently expanded table ID
     * @param {number} currentPage - Current page number
     * @returns {string} HTML string
     */
    function renderMappedTables(mappedTables, expandedId, currentPage) {
        let html = '';

        // FIX PACKAGE 2: Show step indicator if in table mapping mode
        if (window.mapper?.tableMappingMode && window.mapper?.currentTableStep) {
            html += renderTableStepIndicator(window.mapper.currentTableStep);

            // Show current table data section if we have a table being mapped
            if (window.mapper.currentTable) {
                html += renderTableDataSection(window.mapper.currentTable);
            }
        }

        // Filter tables for current page
        const pageTables = mappedTables.filter(t => t.page === currentPage);

        if (pageTables.length === 0 && !window.mapper?.tableMappingMode) {
            return html + `
                <div class="empty-state">
                    <div class="empty-state-icon">📐</div>
                    <div class="empty-state-text">אין טבלאות ממופות</div>
                    <div class="empty-state-subtext">לחץ "📐 מפה טבלה" ליצירת טבלה חדשה</div>
                </div>
            `;
        }

        html += pageTables.map(table => {
            const isExpanded = expandedId === table.tableId;
            return renderMappedTableItem(table, isExpanded);
        }).join('');

        return html;
    }

    // ============ PREVIEW CONTROLS (Step 7) ============

    /**
     * Render preview controls panel for sidebar
     * @param {Object} settings - Current preview settings
     * @param {boolean} isPreviewActive - Whether preview mode is active
     * @returns {string} HTML string for preview controls
     */
    function renderPreviewControls(settings, isPreviewActive) {
        const fontSize = settings?.fontSize || 12;
        const opacity = Math.round((settings?.opacity || 0.85) * 100);
        const textLength = settings?.textLength || 'medium';
        const language = settings?.language || 'hebrew';

        return `
        <div class="preview-controls" id="preview-controls-panel">
            <div class="preview-controls-header">
                <h4>👁️ הגדרות תצוגה</h4>
                <div class="preview-toggle">
                    <label>מצב תצוגה</label>
                    <input type="checkbox" id="preview-mode-toggle"
                        ${isPreviewActive ? 'checked' : ''}
                        onchange="mapper.toggleLiveTablePreviewMode()">
                </div>
            </div>

            <div class="preview-settings">
                <div class="preview-setting-row">
                    <label>גודל גופן</label>
                    <input type="range" min="8" max="24" value="${fontSize}"
                        oninput="mapper.updatePreviewSetting('fontSize', parseInt(this.value)); document.getElementById('preview-font-value').textContent = this.value + 'px'">
                    <span class="setting-value" id="preview-font-value">${fontSize}px</span>
                </div>

                <div class="preview-setting-row">
                    <label>שקיפות</label>
                    <input type="range" min="30" max="100" value="${opacity}"
                        oninput="mapper.updatePreviewSetting('opacity', parseInt(this.value) / 100); document.getElementById('preview-opacity-value').textContent = this.value + '%'">
                    <span class="setting-value" id="preview-opacity-value">${opacity}%</span>
                </div>

                <div class="preview-setting-row">
                    <label>אורך טקסט</label>
                    <div class="text-length-buttons">
                        <button class="${textLength === 'short' ? 'active' : ''}"
                            onclick="mapper.updatePreviewSetting('textLength', 'short'); this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active')); this.classList.add('active')">קצר</button>
                        <button class="${textLength === 'medium' ? 'active' : ''}"
                            onclick="mapper.updatePreviewSetting('textLength', 'medium'); this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active')); this.classList.add('active')">בינוני</button>
                        <button class="${textLength === 'long' ? 'active' : ''}"
                            onclick="mapper.updatePreviewSetting('textLength', 'long'); this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active')); this.classList.add('active')">ארוך</button>
                    </div>
                </div>

                <div class="preview-setting-row">
                    <label>שפה</label>
                    <select onchange="mapper.updatePreviewSetting('language', this.value)">
                        <option value="hebrew" ${language === 'hebrew' ? 'selected' : ''}>עברית</option>
                        <option value="english" ${language === 'english' ? 'selected' : ''}>English</option>
                    </select>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Render table item with preview toggle
     * @param {Object} table - Table object
     * @param {boolean} isExpanded - Whether expanded
     * @param {boolean} isPreviewActive - Whether global preview mode is active
     * @returns {string} HTML string
     */
    function renderMappedTableItemWithPreview(table, isExpanded, isPreviewActive) {
        const validationStatus = table.validationReport
            ? table.validationReport.summary
            : { statusClass: 'unknown', statusHebrew: 'לא נבדק' };

        const columnChips = (table.columns || []).map(col =>
            `<span class="column-chip" title="${col.columnId}">${col.hebrewName || col.columnId}</span>`
        ).join('');

        const isPreviewEnabled = table._previewEnabled === true;

        return `
        <div class="table-sidebar-item ${isExpanded ? 'expanded' : ''} ${validationStatus.statusClass}" data-table-id="${table.tableId}">
            <div class="table-header" onclick="mapper.toggleFieldExpansion('${table.tableId}')">
                <div class="table-name">📐 ${table.tableId}</div>
                ${isPreviewEnabled && isPreviewActive ? '<span class="preview-badge active">👁️ תצוגה</span>' : ''}
                <div class="table-validation-badge ${validationStatus.statusClass}">
                    ${validationStatus.statusHebrew}
                </div>
            </div>
            <div class="table-meta">
                <span>עמוד: ${table.page}</span>
                <span>שורות: ${table.rowCount}</span>
                <span>עמודות: ${(table.columns || []).length}</span>
            </div>
            <div class="table-columns">
                ${columnChips}
            </div>
            ${table.validationReport && !table.validationReport.valid ? `
            <div class="table-validation-inline">
                <span class="validation-warning-icon">⚠️</span>
                <span class="validation-warning-text">${table.validationReport.summary.criticalCount} שגיאות</span>
            </div>
            ` : ''}

            <!-- Preview Toggle -->
            <div class="table-preview-toggle">
                <label>
                    <input type="checkbox"
                        ${isPreviewEnabled ? 'checked' : ''}
                        onchange="event.stopPropagation(); mapper.toggleTablePreview('${table.tableId}')">
                    👁️ תצוגת מילוי
                </label>
                <span class="preview-status ${isPreviewEnabled && isPreviewActive ? 'active' : ''}">
                    ${isPreviewEnabled && isPreviewActive ? 'פעיל' : 'כבוי'}
                </span>
            </div>

            <div class="table-actions">
                <button onclick="event.stopPropagation(); mapper.highlightTable('${table.tableId}')" title="הדגש">👁️ הדגש</button>
                <button onclick="event.stopPropagation(); mapper.revalidateTable('${table.tableId}')" title="אמת מחדש">🔄 אמת</button>
                <button onclick="event.stopPropagation(); mapper.removeTable('${table.tableId}')" title="מחק">🗑️ מחק</button>
            </div>
        </div>
        `;
    }

    /**
     * Render all mapped tables with preview support
     * @param {Array} mappedTables - Array of mapped tables
     * @param {string} expandedId - Currently expanded table ID
     * @param {number} currentPage - Current page number
     * @param {boolean} isPreviewActive - Whether preview mode is active
     * @returns {string} HTML string
     */
    function renderMappedTablesWithPreview(mappedTables, expandedId, currentPage, isPreviewActive) {
        // Filter tables for current page
        const pageTables = mappedTables.filter(t => t.page === currentPage);

        if (pageTables.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">📐</div>
                    <div class="empty-state-text">אין טבלאות ממופות</div>
                    <div class="empty-state-subtext">לחץ "📐 מפה טבלה" ליצירת טבלה חדשה</div>
                </div>
            `;
        }

        // Add preview controls at the top if there are tables
        let html = renderPreviewControls(
            window.mapper?.previewSettings,
            isPreviewActive
        );

        html += pageTables.map(table => {
            const isExpanded = expandedId === table.tableId;
            return renderMappedTableItemWithPreview(table, isExpanded, isPreviewActive);
        }).join('');

        return html;
    }

    // ============ FIX PACKAGE 1 & 2: INLINE EDITING (Enhanced UX) ============

    /**
     * Start inline editing for a field name
     * FIX PACKAGE 2: Added auto-highlight, clearer pencil icon, and success toast
     * @param {HTMLElement} element - The element that was clicked
     * @param {string} fieldId - The field ID
     * @param {string} property - The property to edit ('labelHe' or 'labelEn')
     */
    function startInlineEdit(element, fieldId, property) {
        // Don't start if already editing
        if (element.querySelector('input')) return;

        // Get current value
        const field = window.mapper?.fields?.find(f => f.id === fieldId);
        if (!field) return;

        // FIX PACKAGE 2: Auto-highlight field being edited
        if (window.mapper && typeof window.mapper.selectField === 'function') {
            window.mapper.selectField(fieldId, { scroll: false });
        }

        // Highlight the field item in sidebar
        const fieldItem = element.closest('.field-item');
        if (fieldItem) {
            fieldItem.classList.add('editing-highlight');
        }

        let currentValue = '';
        if (property === 'labelHe') {
            currentValue = field.labelHe || field.hebrewName || field.label_he || '';
        } else if (property === 'labelEn') {
            // Get only the English ID value (not the type/direction meta)
            currentValue = field.labelEn || field.englishId || field.label_en || field.id || '';
        }

        // Store original content for restoration
        const originalContent = element.innerHTML;

        // Create input element with enhanced styling
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        input.className = 'inline-edit-input';
        input.placeholder = property === 'labelHe' ? 'הזן שם בעברית...' : 'Enter English ID...';
        input.style.cssText = `
            width: 100%;
            padding: 6px 10px;
            border: 2px solid #6366f1;
            border-radius: 6px;
            font-size: inherit;
            direction: ${property === 'labelHe' ? 'rtl' : 'ltr'};
            background: white;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
            outline: none;
        `;

        // Clear element and add input
        element.innerHTML = '';
        element.appendChild(input);

        // Focus and select all
        input.focus();
        input.select();

        // Track if edit was saved (to prevent double-save on blur after Enter)
        let saved = false;

        // Handle Enter key to save
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                saveInlineEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelInlineEdit();
            }
        });

        // Handle blur to save
        input.addEventListener('blur', function() {
            // Small delay to allow click events to process
            setTimeout(() => {
                if (!saved) saveInlineEdit();
            }, 150);
        });

        function saveInlineEdit() {
            if (saved) return;
            saved = true;

            const newValue = input.value.trim();

            // Remove highlight
            if (fieldItem) {
                fieldItem.classList.remove('editing-highlight');
            }

            if (newValue && newValue !== currentValue) {
                if (property === 'labelHe') {
                    // Update Hebrew name and auto-regenerate English if not manually edited
                    if (window.mapper && typeof window.mapper.updateFieldHebrewName === 'function') {
                        window.mapper.updateFieldHebrewName(fieldId, newValue);
                    } else {
                        // Fallback: direct update
                        field.labelHe = newValue;
                        field.hebrewName = newValue;
                        field.label_he = newValue;

                        // Auto-regenerate English ID unless manually edited
                        if (!field._englishManuallyEdited && window.mapper?.toEnglishFieldId) {
                            const newEnglishId = window.mapper.toEnglishFieldId(newValue);
                            field.labelEn = newEnglishId;
                            field.englishId = newEnglishId;
                        }

                        window.mapper?.updateFieldList?.();
                        window.mapper?.saveState?.('edit_field_name');
                        // FIX PACKAGE 2: Show success toast
                        window.mapper?.showToast?.('✔ השדה עודכן בהצלחה', 'success');
                    }
                } else if (property === 'labelEn') {
                    // Update English ID and mark as manually edited
                    if (window.mapper && typeof window.mapper.updateFieldEnglishId === 'function') {
                        window.mapper.updateFieldEnglishId(fieldId, newValue);
                    } else {
                        // Fallback: direct update
                        field.labelEn = newValue;
                        field.englishId = newValue;
                        field._englishManuallyEdited = true;

                        window.mapper?.updateFieldList?.();
                        window.mapper?.saveState?.('edit_field_english');
                        // FIX PACKAGE 2: Show success toast
                        window.mapper?.showToast?.('✔ השדה עודכן בהצלחה', 'success');
                    }
                }

                console.log('📝 Inline edit saved:', { fieldId, property, newValue });
            } else {
                // Restore original content if cancelled or empty
                element.innerHTML = originalContent;
            }
        }

        function cancelInlineEdit() {
            saved = true;
            element.innerHTML = originalContent;
            if (fieldItem) {
                fieldItem.classList.remove('editing-highlight');
            }
        }
    }

    // ============ RADIO GROUPING: Toggle Selection ============

    /**
     * Toggle a field's selection for grouping
     * Called when user clicks checkbox in sidebar field list
     * @param {string} fieldId - ID of the field to toggle
     * @param {boolean} isChecked - Whether checkbox is now checked
     */
    function toggleGroupSelection(fieldId, isChecked) {
        console.log('🔗 toggleGroupSelection called:', { fieldId, isChecked });

        const field = window.mapper?.fields?.find(f => f.id === fieldId);
        if (!field) {
            console.warn('⚠️ toggleGroupSelection: Field not found:', fieldId);
            return;
        }

        // Only allow radio fields to be selected for grouping
        if (field.type !== 'radio') {
            console.warn('⚠️ toggleGroupSelection: Field is not a radio type:', fieldId);
            return;
        }

        // Toggle the selection state
        field._selectedForGroup = isChecked;

        console.log(`🔗 Group selection toggled: ${fieldId} = ${isChecked}`);

        // Update the field list to reflect the change
        if (window.mapper && typeof window.mapper.updateFieldList === 'function') {
            window.mapper.updateFieldList();
        }

        // Update the pending group indicator
        if (window.mapper && typeof window.mapper.updatePendingGroupIndicator === 'function') {
            window.mapper.updatePendingGroupIndicator();
        }

        // Update overlay to show visual feedback
        if (window.mapper && typeof window.mapper.updateFieldOverlay === 'function') {
            window.mapper.updateFieldOverlay(fieldId);
        }
    }

    // ============ RADIO GROUPING: Render Groups List ============

    /**
     * Render the radio groups list for the Groups tab
     * @param {Array} radioGroups - Array of radio group objects
     * @param {string} expandedGroupId - ID of currently expanded group
     * @param {number} currentPage - Current page number
     * @returns {string} HTML string for the groups list
     */
    function renderRadioGroupsList(radioGroups, expandedGroupId, currentPage) {
        if (!radioGroups || radioGroups.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">🔗</div>
                    <div class="empty-state-text">אין קבוצות רדיו</div>
                    <div class="empty-state-subtext">
                        לחץ "🔗 קבץ רדיו" כדי להתחיל לקבץ שדות רדיו
                    </div>
                </div>
            `;
        }

        // Filter groups for current page
        const pageGroups = radioGroups.filter(g => g.page === currentPage);

        if (pageGroups.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">🔗</div>
                    <div class="empty-state-text">אין קבוצות רדיו בעמוד זה</div>
                    <div class="empty-state-subtext">
                        נווט לעמוד אחר או צור קבוצה חדשה
                    </div>
                </div>
            `;
        }

        return `
            <div class="radio-groups-list">
                ${pageGroups.map(group => renderRadioGroupCard(group, expandedGroupId === group.groupId)).join('')}
            </div>
        `;
    }

    /**
     * Render a single radio group card
     * @param {Object} group - Radio group object
     * @param {boolean} isExpanded - Whether the card is expanded
     * @returns {string} HTML string for the group card
     */
    function renderRadioGroupCard(group, isExpanded) {
        const optionsHtml = (group.options || []).map((option, index) => `
            <div class="radio-group-option" data-option-index="${index}">
                <div class="option-info">
                    <span class="option-label">${option.label || `אפשרות ${index + 1}`}</span>
                    <span class="option-value">${option.value || option.fieldId}</span>
                </div>
                <div class="option-actions">
                    <button onclick="event.stopPropagation(); mapper.highlightField('${option.fieldId}')" title="הדגש">👁️</button>
                    <button onclick="event.stopPropagation(); mapper.editRadioOption('${group.groupId}', ${index})" title="ערוך">✏️</button>
                    <button onclick="event.stopPropagation(); mapper.removeRadioOption('${group.groupId}', ${index})" title="הסר">🗑️</button>
                </div>
            </div>
        `).join('');

        return `
            <div class="radio-group-card ${isExpanded ? 'expanded' : ''}" data-group-id="${group.groupId}">
                <div class="radio-group-header" onclick="mapper.toggleFieldExpansion('${group.groupId}')">
                    <div class="radio-group-name">
                        <span>🔘</span>
                        <span>${group.groupName || group.groupId}</span>
                    </div>
                    <div class="radio-group-count">${(group.options || []).length} אפשרויות</div>
                </div>
                <div class="radio-group-content">
                    <div class="radio-group-details">
                        <div class="detail-row">
                            <label>מזהה קבוצה:</label>
                            <span>${group.groupId}</span>
                        </div>
                        <div class="detail-row">
                            <label>שם קבוצה:</label>
                            <input type="text" value="${group.groupName || ''}"
                                   onchange="mapper.updateRadioGroupName('${group.groupId}', this.value)"
                                   placeholder="הזן שם קבוצה">
                        </div>
                    </div>
                    <div class="radio-group-options">
                        <h5>אפשרויות:</h5>
                        ${optionsHtml || '<p class="no-options">אין אפשרויות בקבוצה</p>'}
                    </div>
                    <div class="radio-group-actions">
                        <button onclick="mapper.highlightRadioGroup('${group.groupId}')" title="הדגש קבוצה">
                            👁️ הדגש
                        </button>
                        <button onclick="mapper.addFieldToRadioGroup('${group.groupId}')" title="הוסף שדה">
                            ➕ הוסף
                        </button>
                        <button class="btn-delete" onclick="mapper.removeRadioGroup('${group.groupId}')" title="מחק קבוצה">
                            🗑️ מחק
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ============ QUICK MODE SIDEBAR ============

    /**
     * Render sidebar content for Regular Mapping Mode
     * Shows unmapped fields from JSON that user can select and map
     * @param {Array} fields - All fields
     * @param {string} expandedFieldId - Currently expanded field ID
     * @param {string} selectedFieldId - Currently selected field ID
     * @param {string} selectedForMapping - Field ID selected for mapping (from RegularMapperEngine)
     * @returns {string} HTML string for regular mode sidebar
     */
    function renderRegularModeSidebar(fields, expandedFieldId, selectedFieldId, selectedForMapping) {
        const unmappedFields = fields.filter(f => !f.isMapped && f.label_he && !f.isUnnamed);

        if (unmappedFields.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-text">כל השדות ממופים!</div>
                    <div class="empty-state-subtext">ייבא JSON נוסף או עבור למצב מהיר</div>
                </div>
            `;
        }

        return `
            <div class="regular-mode-header">
                <h4>📋 שדות לא ממופים (${unmappedFields.length})</h4>
                <p class="mode-hint">לחץ על שדה ואז צייר מלבן למיפוי</p>
            </div>
            <div class="unmapped-fields-list">
                ${unmappedFields.map(field => {
                    const isSelected = selectedForMapping === field.id;
                    return `
                        <div class="field-item unmapped-field ${isSelected ? 'selected-for-mapping' : ''}"
                             data-field-id="${field.id}"
                             onclick="window.RegularMapperEngine?.selectFieldFromSidebar('${field.id}', window.mapper)">
                            <div class="field-item-header">
                                <div class="field-item-title">
                                    <div class="field-name">${field.label_he}</div>
                                    <div class="field-id">${field.id}</div>
                                </div>
                                <div class="field-type-badge">${field.type || 'text'}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * Render sidebar content for Quick Mapping Mode
     * Shows created fields with pending review status
     * @param {Array} fields - All fields
     * @param {Array} radioGroups - Radio groups in progress
     * @param {Array} checkboxGroups - Checkbox groups in progress
     * @param {string} expandedFieldId - Currently expanded field ID
     * @param {string} selectedFieldId - Currently selected field ID
     * @returns {string} HTML string for quick mode sidebar
     */
    function renderQuickModeSidebar(fields, radioGroups, checkboxGroups, expandedFieldId, selectedFieldId) {
        // In manual mode, show ALL mapped fields (regardless of how they were created)
        const mappedFields = fields.filter(f => f.isMapped);
        const textFields = mappedFields.filter(f => f.type === 'text' || !f.type);
        const radioFields = mappedFields.filter(f => f.type === 'radio');
        const checkboxFields = mappedFields.filter(f => f.type === 'checkbox');

        let html = `
            <div class="quick-mode-header">
                <h4>⚡ מצב מהיר</h4>
                <p class="mode-hint">צור שדות חדשים עם שמות אוטומטיים</p>
            </div>
        `;

        // Created fields section
        if (mappedFields.length > 0) {
            html += `
                <div class="quick-mode-section">
                    <h5>📝 שדות ממופים (${mappedFields.length})</h5>
                    <div class="created-fields-list">
            `;

            // Text fields
            if (textFields.length > 0) {
                html += `<div class="field-type-group"><span class="group-label">Text (${textFields.length})</span>`;
                textFields.forEach(field => {
                    const isExpanded = expandedFieldId === field.id;
                    const isSelected = selectedFieldId === field.id;
                    html += renderQuickFieldItem(field, isExpanded, isSelected);
                });
                html += `</div>`;
            }

            // Radio fields
            if (radioFields.length > 0) {
                html += `<div class="field-type-group"><span class="group-label">Radio (${radioFields.length})</span>`;
                radioFields.forEach(field => {
                    const isExpanded = expandedFieldId === field.id;
                    const isSelected = selectedFieldId === field.id;
                    html += renderQuickFieldItem(field, isExpanded, isSelected);
                });
                html += `</div>`;
            }

            // Checkbox fields
            if (checkboxFields.length > 0) {
                html += `<div class="field-type-group"><span class="group-label">Checkbox (${checkboxFields.length})</span>`;
                checkboxFields.forEach(field => {
                    const isExpanded = expandedFieldId === field.id;
                    const isSelected = selectedFieldId === field.id;
                    html += renderQuickFieldItem(field, isExpanded, isSelected);
                });
                html += `</div>`;
            }

            html += `</div></div>`;
        } else {
            html += `
                <div class="empty-state small">
                    <div class="empty-state-icon">🎯</div>
                    <div class="empty-state-text">עדיין לא נוצרו שדות</div>
                    <div class="empty-state-subtext">השתמש בכפתורי המיפוי המהיר בסרגל</div>
                </div>
            `;
        }

        // Radio groups in progress
        if (radioGroups && radioGroups.length > 0) {
            html += `
                <div class="quick-mode-section">
                    <h5>🔘 קבוצות Radio (${radioGroups.length})</h5>
                    ${radioGroups.map(group => renderRadioGroupInProgress(group)).join('')}
                </div>
            `;
        }

        // Checkbox groups in progress
        if (checkboxGroups && checkboxGroups.length > 0) {
            html += `
                <div class="quick-mode-section">
                    <h5>☑️ קבוצות Checkbox (${checkboxGroups.length})</h5>
                    ${checkboxGroups.map(group => renderCheckboxGroupInProgress(group)).join('')}
                </div>
            `;
        }

        return html;
    }

    /**
     * Render a quick mode field item (with editing capabilities)
     * @param {Object} field - Field object
     * @param {boolean} isExpanded - Whether expanded
     * @param {boolean} isSelected - Whether selected
     * @returns {string} HTML string
     */
    function renderQuickFieldItem(field, isExpanded, isSelected) {
        const displayName = field.labelHe || field.label_he || field.hebrewName || 'שדה ללא שם';
        const englishId = field.labelEn || field.englishId || field.label_en || field.id;
        const typeIcon = field.type === 'radio' ? '🔘' : (field.type === 'checkbox' ? '☑️' : '📝');
        const pendingClass = field.pendingReview ? 'pending-review' : '';

        return `
            <div class="field-item quick-field ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''} ${pendingClass}"
                 data-field-id="${field.id}">
                <div class="field-item-header" onclick="mapper.toggleFieldExpansion('${field.id}')">
                    <span class="field-icon">${typeIcon}</span>
                    <div class="field-item-title">
                        <!-- Click-to-edit Hebrew name -->
                        <div class="field-name editable-field-name"
                             onclick="event.stopPropagation(); window.MapperSidebarEngine.startInlineEdit(this, '${field.id}', 'labelHe')"
                             title="לחץ לעריכה">
                            ${displayName}
                            <span class="edit-icon">✏️</span>
                        </div>
                        <!-- Click-to-edit English ID -->
                        <div class="field-id editable-field-id"
                             onclick="event.stopPropagation(); window.MapperSidebarEngine.startInlineEdit(this, '${field.id}', 'labelEn')"
                             title="לחץ לעריכת מזהה אנגלי">
                            <span class="field-english-id">${field.id}</span>
                            <span class="edit-icon">✏️</span>
                            <span class="field-meta"> | ${field.type || 'text'}</span>
                        </div>
                    </div>
                    <div class="field-item-actions">
                        <button onclick="event.stopPropagation(); mapper.selectField('${field.id}', { scroll: true })" title="הדגש">👁️</button>
                        <button onclick="event.stopPropagation(); mapper.removeField('${field.id}')" title="מחק">🗑️</button>
                    </div>
                </div>
                <div class="field-editor">
                    <div class="editor-row">
                        <label>שם השדה (עברית)</label>
                        <input type="text" value="${(displayName === 'שדה ללא שם' ? '' : displayName || '').replace(/"/g, '&quot;')}"
                               onchange="mapper.updateFieldHebrewName('${field.id}', this.value)"
                               placeholder="הזן שם בעברית">
                    </div>
                    <div class="editor-row">
                        <label>מזהה אנגלי (ID)</label>
                        <input type="text" value="${(field.id || '').replace(/"/g, '&quot;')}"
                               onchange="mapper.updateFieldEnglishId('${field.id}', this.value)"
                               placeholder="English ID">
                    </div>
                    <div class="editor-row">
                        <label>סוג שדה</label>
                        <select onchange="mapper.updateFieldProperty('${field.id}', 'type', this.value)">
                            <option value="text" ${field.type === 'text' || !field.type ? 'selected' : ''}>טקסט</option>
                            <option value="number" ${field.type === 'number' ? 'selected' : ''}>מספר</option>
                            <option value="date" ${field.type === 'date' ? 'selected' : ''}>תאריך</option>
                            <option value="email" ${field.type === 'email' ? 'selected' : ''}>אימייל</option>
                            <option value="phone" ${field.type === 'phone' ? 'selected' : ''}>טלפון</option>
                            <option value="id_number" ${field.type === 'id_number' ? 'selected' : ''}>ת.ז</option>
                            <option value="address" ${field.type === 'address' ? 'selected' : ''}>כתובת</option>
                            <option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                            <option value="radio" ${field.type === 'radio' ? 'selected' : ''}>Radio</option>
                            <option value="signature" ${field.type === 'signature' ? 'selected' : ''}>חתימה</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render a radio group in progress (during quick flow)
     * @param {Object} group - Radio group state
     * @returns {string} HTML string
     */
    function renderRadioGroupInProgress(group) {
        const optionCount = group.options ? group.options.length : 0;
        const labelText = group.groupLabel?.text || 'קבוצה חדשה';

        return `
            <div class="group-in-progress radio-group">
                <div class="group-header">
                    <span class="group-icon">🔘</span>
                    <span class="group-label">${labelText}</span>
                    <span class="option-count">(${optionCount} אפשרויות)</span>
                </div>
                ${optionCount > 0 ? `
                    <div class="group-options">
                        ${group.options.map((opt, i) => `
                            <div class="option-item">
                                <span class="option-bullet">○</span>
                                <span class="option-label">${opt.label || `אפשרות ${i + 1}`}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render a checkbox group in progress (during quick flow)
     * @param {Object} group - Checkbox group state
     * @returns {string} HTML string
     */
    function renderCheckboxGroupInProgress(group) {
        const optionCount = group.options ? group.options.length : 0;
        const labelText = group.groupLabel?.text || 'קבוצה חדשה';

        return `
            <div class="group-in-progress checkbox-group">
                <div class="group-header">
                    <span class="group-icon">☑️</span>
                    <span class="group-label">${labelText}</span>
                    <span class="option-count">(${optionCount} אפשרויות)</span>
                </div>
                ${optionCount > 0 ? `
                    <div class="group-options">
                        ${group.options.map((opt, i) => `
                            <div class="option-item">
                                <span class="option-bullet">☐</span>
                                <span class="option-label">${opt.label || `אפשרות ${i + 1}`}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // ============ EXPORT ============

    console.log('[SidebarEngine] Module loading...');

    window.MapperSidebarEngine = {
        renderFieldItem,
        renderUnnamedFieldItem,
        renderTableGroup,
        renderOptionGroup,
        renderOptionGroups,
        renderFullSidebar,
        renderEmptyState,
        scrollFieldIntoView,
        calculateFieldCounters,
        // Step 6: Table validation
        renderTableValidationReport,
        showTableValidationReport,
        clearValidationReports,
        renderMappedTableItem,
        renderMappedTables,
        // Step 7: Preview controls
        renderPreviewControls,
        renderMappedTableItemWithPreview,
        renderMappedTablesWithPreview,
        // FIX PACKAGE 1: Inline editing
        startInlineEdit,
        // FIX PACKAGE 2: Table step indicator
        renderTableStepIndicator,
        renderTableDataSection,
        // Radio Grouping Feature
        toggleGroupSelection,
        renderRadioGroupsList,
        renderRadioGroupCard,
        // Two-Mode Mapping System
        renderRegularModeSidebar,
        renderQuickModeSidebar,
        renderQuickFieldItem,
        renderRadioGroupInProgress,
        renderCheckboxGroupInProgress
    };

    console.log('[SidebarEngine] Module loaded successfully. Functions available:', Object.keys(window.MapperSidebarEngine));
})();
