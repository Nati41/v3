/**
 * Mapper UI - DOM-dependent UI functions
 * These functions manipulate the DOM and handle UI interactions.
 *
 * NOTE: These functions are designed to be used with a FieldMapper instance.
 * They are extracted here for modularity but require the mapper context.
 */
(function() {
    'use strict';

    // ============ STATUS & TOAST ============

    /**
     * Show status indicator in the toolbar
     * @param {string} message - Status message
     * @param {string} type - Status type ('info', 'success', 'error', 'loading')
     */
    function setStatus(message, type = 'info') {
        const indicator = document.getElementById('status-indicator');
        if (!indicator) return;

        indicator.textContent = message;
        indicator.className = 'status-indicator';

        const typeClasses = {
            'info': 'status-info',
            'success': 'status-success',
            'error': 'status-error',
            'loading': 'status-loading'
        };

        if (typeClasses[type]) {
            indicator.classList.add(typeClasses[type]);
        }
    }

    /**
     * Show toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type ('success', 'error', 'info')
     */
    function showToast(message, type = 'info') {
        // Use shared toast system if available
        if (window.showToast) {
            window.showToast(message, type);
            return;
        }

        // Fallback to custom implementation
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('toast-visible'), 10);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('toast-visible');
            toast.classList.add('toast-hiding');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Show auto-save indicator
     */
    function showAutoSaveIndicator() {
        const indicator = document.getElementById('auto-save-indicator');
        if (indicator) {
            indicator.style.display = 'block';
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 2000);
        }
    }

    // ============ ZOOM & VIEW TRANSFORM ============

    /**
     * Update view transform based on zoom and pan
     * @param {number} zoomLevel - Current zoom level
     * @param {number} panX - Pan X offset
     * @param {number} panY - Pan Y offset
     */
    function updateViewTransform(zoomLevel, panX, panY) {
        const transformContainer = document.getElementById('transform-container');
        if (!transformContainer) return;

        transformContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
        transformContainer.style.transformOrigin = 'center center';
    }

    /**
     * Update zoom display in the UI
     * @param {number} zoomLevel - Current zoom level
     */
    function updateZoomDisplay(zoomLevel) {
        const zoomInfo = document.getElementById('zoom-info');
        if (zoomInfo) {
            zoomInfo.textContent = Math.round(zoomLevel * 100) + '%';
        }
    }

    // ============ PAGE NAVIGATION UI ============

    /**
     * Update page selector dropdown
     * @param {number} totalPages - Total number of pages
     * @param {number} currentPage - Current page number
     */
    function updatePageSelector(totalPages, currentPage) {
        const selector = document.getElementById('page-selector');
        if (!selector) return;

        selector.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `עמוד ${i}`;
            if (i === currentPage) option.selected = true;
            selector.appendChild(option);
        }
    }

    /**
     * Update page info display
     * @param {number} currentPage - Current page number
     * @param {number} totalPages - Total number of pages
     */
    function updatePageInfo(currentPage, totalPages) {
        const pageInfo = document.getElementById('page-info');
        const pageNumber = document.getElementById('page-number');
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');

        if (pageInfo) pageInfo.textContent = `${currentPage} / ${totalPages}`;
        if (pageNumber) pageNumber.textContent = currentPage;

        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;
    }

    // ============ UNDO/REDO BUTTONS ============

    /**
     * Update undo/redo button states
     * @param {number} historyIndex - Current history index
     * @param {number} historyLength - Total history length
     */
    function updateUndoRedoButtons(historyIndex, historyLength) {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) {
            undoBtn.disabled = historyIndex <= 0;
        }

        if (redoBtn) {
            redoBtn.disabled = historyIndex >= historyLength - 1;
        }
    }

    // ============ GRID OVERLAY ============

    /**
     * Update grid overlay visibility
     * @param {boolean} snapToGrid - Whether grid snapping is enabled
     */
    function updateGridOverlay(snapToGrid) {
        let gridOverlay = document.querySelector('.grid-overlay');
        const layer = document.getElementById('mapping-layer');

        if (!layer) return;

        if (!gridOverlay) {
            gridOverlay = document.createElement('div');
            gridOverlay.className = 'grid-overlay';
            layer.appendChild(gridOverlay);
        }

        if (snapToGrid) {
            gridOverlay.classList.add('active');
        } else {
            gridOverlay.classList.remove('active');
        }
    }

    // ============ MAPPING BADGE ============

    /**
     * Update mapping status badge
     * @param {string} text - Badge text
     */
    function updateMappingBadge(text) {
        const badge = document.getElementById('mapping-badge');
        const badgeText = document.getElementById('mapping-badge-text');

        if (badge && badgeText) {
            badgeText.textContent = text;
            badge.style.display = text ? 'flex' : 'none';
        }
    }

    /**
     * Hide mapping badge
     */
    function hideMappingBadge() {
        const badge = document.getElementById('mapping-badge');
        if (badge) {
            badge.style.display = 'none';
        }
    }

    // ============ FIELD OVERLAYS ============

    /**
     * Add resize handles to a field overlay element
     * @param {HTMLElement} overlay - The overlay element
     */
    function addResizeHandles(overlay) {
        const handles = ['nw', 'ne', 'sw', 'se'];

        handles.forEach(position => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-${position}`;
            handle.dataset.position = position;

            const positions = {
                'nw': { top: '-4px', left: '-4px' },
                'ne': { top: '-4px', right: '-4px' },
                'sw': { bottom: '-4px', left: '-4px' },
                'se': { bottom: '-4px', right: '-4px' }
            };

            Object.assign(handle.style, positions[position]);
            handle.style.position = 'absolute';
            handle.style.width = '8px';
            handle.style.height = '8px';
            handle.style.background = '#667eea';
            handle.style.border = '1px solid white';
            handle.style.borderRadius = '50%';
            handle.style.cursor = position.includes('n') && position.includes('w') ? 'nw-resize' :
                                  position.includes('n') && position.includes('e') ? 'ne-resize' :
                                  position.includes('s') && position.includes('w') ? 'sw-resize' : 'se-resize';
            handle.style.zIndex = '15';
            handle.style.opacity = '0.8';

            overlay.appendChild(handle);
        });
    }

    /**
     * Remove all field overlay elements from the DOM
     */
    function clearFieldOverlays() {
        document.querySelectorAll('.field-overlay').forEach(el => el.remove());
    }

    /**
     * Deselect all field overlays
     */
    function deselectAllOverlays() {
        document.querySelectorAll('.field-overlay.selected').forEach(el => {
            el.classList.remove('selected');
            el.style.zIndex = '1';
            const handles = el.querySelectorAll('.resize-handle');
            handles.forEach(handle => {
                handle.style.display = 'none';
            });
        });
    }

    /**
     * Select a field overlay element
     * @param {HTMLElement} element - The overlay element to select
     */
    function selectOverlay(element) {
        if (!element) return;

        element.classList.add('selected');
        element.style.zIndex = '9999';

        const resizeHandles = element.querySelectorAll('.resize-handle');
        resizeHandles.forEach(handle => {
            handle.style.display = 'block';
        });
    }

    /**
     * Scroll a field item into view in the sidebar
     * @param {string} fieldId - The field ID
     */
    function scrollFieldIntoView(fieldId) {
        const listItem = document.querySelector(`.field-item[data-field-id="${fieldId}"]`);
        if (listItem) {
            listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // ============ CONTEXT MENU ============

    /**
     * Show context menu for a field
     * @param {Object} field - The field object
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {Object} callbacks - Callback functions for menu actions
     */
    function showFieldContextMenu(field, x, y, callbacks) {
        // Remove any existing context menu
        const existingMenu = document.getElementById('field-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'field-context-menu';
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.zIndex = '10000';

        menu.innerHTML = `
            <div class="context-menu-item" data-action="edit">
                <span>✏️</span> ערוך שדה
            </div>
            <div class="context-menu-item" data-action="duplicate">
                <span>📋</span> שכפל
            </div>
            <div class="context-menu-item" data-action="delete">
                <span>🗑️</span> מחק
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" data-action="cancel">
                <span>✖️</span> ביטול
            </div>
        `;

        document.body.appendChild(menu);

        // Add click handlers for menu items
        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                menu.remove();

                if (callbacks && callbacks[action]) {
                    callbacks[action](field.id);
                }
            });
        });

        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    // ============ DRAWING PREVIEW ============

    /**
     * Create a drawing preview element
     * @param {number} x - X position
     * @param {number} y - Y position
     * @returns {HTMLElement} The preview element
     */
    function createDrawingPreview(x, y) {
        const container = document.getElementById('mapping-layer');
        if (!container) return null;

        const preview = document.createElement('div');
        preview.id = 'drawing-preview';
        preview.className = 'drawing-preview';
        preview.style.position = 'absolute';
        preview.style.left = x + 'px';
        preview.style.top = y + 'px';
        preview.style.width = '0px';
        preview.style.height = '0px';
        preview.style.border = '2px dashed #667eea';
        preview.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
        preview.style.pointerEvents = 'none';
        preview.style.zIndex = '1000';

        container.appendChild(preview);
        return preview;
    }

    /**
     * Update drawing preview dimensions
     * @param {HTMLElement} preview - The preview element
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     */
    function updateDrawingPreview(preview, x, y, width, height) {
        if (!preview) return;

        preview.style.left = x + 'px';
        preview.style.top = y + 'px';
        preview.style.width = width + 'px';
        preview.style.height = height + 'px';
    }

    /**
     * Remove drawing preview element
     */
    function removeDrawingPreview() {
        const preview = document.getElementById('drawing-preview');
        if (preview) {
            preview.remove();
        }
    }

    // ============ FIELD LIST / SIDEBAR ============

    /**
     * Render a single field item for the sidebar
     * @param {Object} field - Field object
     * @param {boolean} isExpanded - Whether the field is expanded
     * @param {boolean} isSelected - Whether the field is selected
     * @param {boolean} isInMappingMode - Whether mapping mode is active for this field
     * @returns {string} HTML string for the field item
     */
    function renderFieldItem(field, isExpanded, isSelected, isInMappingMode) {
        const statusIcon = field.isMapped ? '✅' : '⏳';
        const typeIcons = {
            'text': '📝',
            'number': '🔢',
            'date': '📅',
            'checkbox': '☑️',
            'radio': '🔘',
            'signature': '✍️',
            'email': '📧',
            'phone': '📱',
            'id_number': '🆔',
            'address': '🏠'
        };
        const typeIcon = typeIcons[field.type] || '📝';

        const expandedClass = isExpanded ? 'expanded' : '';
        const selectedClass = isSelected ? 'selected' : '';
        const mappingClass = isInMappingMode ? 'mapping-active' : '';

        let html = `
            <div class="field-item ${expandedClass} ${selectedClass} ${mappingClass}"
                 data-field-id="${field.id}">
                <div class="field-header">
                    <span class="field-status">${statusIcon}</span>
                    <span class="field-type-icon">${typeIcon}</span>
                    <span class="field-name">${field.label_he || field.id}</span>
                    <span class="field-toggle">${isExpanded ? '▼' : '▶'}</span>
                </div>
        `;

        if (isExpanded) {
            html += `
                <div class="field-details">
                    <div class="field-detail-row">
                        <label>מזהה:</label>
                        <input type="text" class="field-id-input" value="${field.id}"
                               data-field-id="${field.id}" data-property="id">
                    </div>
                    <div class="field-detail-row">
                        <label>שם עברי:</label>
                        <input type="text" value="${field.label_he || ''}"
                               data-field-id="${field.id}" data-property="label_he">
                    </div>
                    <div class="field-detail-row">
                        <label>סוג:</label>
                        <select data-field-id="${field.id}" data-property="type">
                            <option value="text" ${field.type === 'text' ? 'selected' : ''}>טקסט</option>
                            <option value="number" ${field.type === 'number' ? 'selected' : ''}>מספר</option>
                            <option value="date" ${field.type === 'date' ? 'selected' : ''}>תאריך</option>
                            <option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                            <option value="radio" ${field.type === 'radio' ? 'selected' : ''}>Radio</option>
                            <option value="signature" ${field.type === 'signature' ? 'selected' : ''}>חתימה</option>
                            <option value="email" ${field.type === 'email' ? 'selected' : ''}>אימייל</option>
                            <option value="phone" ${field.type === 'phone' ? 'selected' : ''}>טלפון</option>
                            <option value="id_number" ${field.type === 'id_number' ? 'selected' : ''}>ת.ז</option>
                        </select>
                    </div>
                    <div class="field-detail-row">
                        <label>כיוון:</label>
                        <select data-field-id="${field.id}" data-property="direction">
                            <option value="rtl" ${field.direction === 'rtl' ? 'selected' : ''}>RTL</option>
                            <option value="ltr" ${field.direction === 'ltr' ? 'selected' : ''}>LTR</option>
                        </select>
                    </div>
                    <div class="field-actions">
                        <button class="btn-small btn-map" data-action="map" data-field-id="${field.id}">
                            ${field.isMapped ? '🔄 מפה מחדש' : '📍 מפה'}
                        </button>
                        <button class="btn-small btn-delete" data-action="delete" data-field-id="${field.id}">
                            🗑️ מחק
                        </button>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    /**
     * Render the empty state for the field list
     * @returns {string} HTML string for empty state
     */
    function renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">🔭</div>
                <div class="empty-state-text">אין שדות עדיין</div>
                <div class="empty-state-subtext">גרור על המסמך כדי ליצור שדה חדש</div>
            </div>
        `;
    }

    /**
     * Update field counters in the sidebar
     * @param {number} totalFields - Total field count
     * @param {number} mappedFields - Mapped field count
     * @param {number} unmappedFields - Unmapped field count
     * @param {number} tableFields - Table field count
     */
    function updateFieldCounters(totalFields, mappedFields, unmappedFields, tableFields) {
        const totalCount = document.getElementById('field-count');
        const editingCount = document.getElementById('editing-count');
        const mappedCount = document.getElementById('mapped-count');
        const tablesCount = document.getElementById('tables-count');

        if (totalCount) totalCount.textContent = totalFields;
        if (editingCount) editingCount.textContent = unmappedFields;
        if (mappedCount) mappedCount.textContent = mappedFields;
        if (tablesCount) tablesCount.textContent = tableFields;
    }

    // ============ MODE UI ============

    /**
     * Update mode-specific UI elements
     * @param {string} appMode - Current app mode ('mapper' or 'livefill')
     */
    function updateModeUI(appMode) {
        // Update mode toggle buttons
        document.querySelectorAll('.mode-toggle button').forEach(btn => btn.classList.remove('active'));
        const activeButton = document.getElementById(`mode-${appMode}`);
        if (activeButton) activeButton.classList.add('active');

        // Update sidebar title
        const sidebarTitle = document.getElementById('sidebar-title');
        if (sidebarTitle) {
            sidebarTitle.textContent = appMode === 'mapper' ? '📐 מצב מיפוי' : '✍️ מילוי חי';
        }

        // Set data attribute on app container
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.setAttribute('data-mode', appMode);
        }
    }

    // ============ MOBILE VIEW ============

    /**
     * Switch between mobile views
     * @param {string} view - View to switch to ('mapping' or 'preview')
     */
    function switchMobileView(view) {
        const tabs = document.querySelectorAll('.mobile-view-switcher .view-tab');
        const panels = document.querySelectorAll('.view-panel');

        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-view') === view);
        });

        panels.forEach(panel => {
            if (view === 'mapping') {
                panel.classList.toggle('active', panel.classList.contains('mapping-view'));
            } else {
                panel.classList.toggle('active', panel.classList.contains('preview-view'));
            }
        });
    }

    // ============ TABLE DIALOG ============

    /**
     * Show table creation dialog
     */
    function showTableDialog() {
        const dialog = document.getElementById('table-dialog');
        if (dialog) {
            dialog.style.display = 'flex';
        }
    }

    /**
     * Close table creation dialog
     */
    function closeTableDialog() {
        const dialog = document.getElementById('table-dialog');
        if (dialog) {
            dialog.style.display = 'none';
        }
    }

    /**
     * Get table dialog values
     * @returns {Object} Dialog values
     */
    function getTableDialogValues() {
        return {
            name: document.getElementById('table-name')?.value || '',
            baseField: document.getElementById('table-base-field')?.value || '',
            rows: parseInt(document.getElementById('table-rows')?.value) || 5,
            cols: parseInt(document.getElementById('table-cols')?.value) || 1,
            fieldType: document.getElementById('table-field-type')?.value || 'text'
        };
    }

    // ============ TAB SWITCHING ============

    /**
     * Switch sidebar tabs
     * @param {string} tabId - Tab ID to switch to
     */
    function switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === `tab-${tabId}`);
        });
    }

    // ============ FILE DOWNLOAD ============

    /**
     * Download data as JSON file
     * @param {Object} data - Data to download
     * @param {string} filename - Filename for the download
     */
    function downloadJSON(data, filename) {
        // Debug log for JSON export
        console.log("💾 Exporting mapping:", JSON.stringify(data, null, 2));

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    }

    // ============ EXPORT ============

    window.MapperUI = {
        // Status & Toast
        setStatus,
        showToast,
        showAutoSaveIndicator,

        // Zoom & View
        updateViewTransform,
        updateZoomDisplay,

        // Page Navigation
        updatePageSelector,
        updatePageInfo,

        // Undo/Redo
        updateUndoRedoButtons,

        // Grid
        updateGridOverlay,

        // Mapping Badge
        updateMappingBadge,
        hideMappingBadge,

        // Field Overlays
        addResizeHandles,
        clearFieldOverlays,
        deselectAllOverlays,
        selectOverlay,
        scrollFieldIntoView,

        // Context Menu
        showFieldContextMenu,

        // Drawing
        createDrawingPreview,
        updateDrawingPreview,
        removeDrawingPreview,

        // Field List / Sidebar
        renderFieldItem,
        renderEmptyState,
        updateFieldCounters,

        // Mode UI
        updateModeUI,

        // Mobile View
        switchMobileView,

        // Table Dialog
        showTableDialog,
        closeTableDialog,
        getTableDialogValues,

        // Tab Switching
        switchTab,

        // File Download
        downloadJSON
    };
})();
