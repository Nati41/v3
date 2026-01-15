/**
 * Visual Test Rules
 * Defines all validation rules for visual testing
 *
 * Each rule has:
 * - id: Unique identifier
 * - name: Human-readable name
 * - category: Category for grouping
 * - severity: 'warn', 'error', 'critical'
 * - check: Function that returns { passed, message, element, data }
 */
(function() {
    'use strict';

    // Tolerance values for boundary checks (in pixels)
    const BOUNDARY_TOLERANCE = 10;
    const SIZE_TOLERANCE = 1.1; // 110% of page size

    /**
     * Get page boundaries
     */
    function getPageBounds(mapper) {
        const container = document.getElementById('mapping-layer');
        if (!container) return null;

        const rect = container.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
        };
    }

    /**
     * Check if element is within page bounds
     */
    function isWithinBounds(elementRect, pageBounds, tolerance = BOUNDARY_TOLERANCE) {
        return (
            elementRect.left >= pageBounds.left - tolerance &&
            elementRect.top >= pageBounds.top - tolerance &&
            elementRect.right <= pageBounds.right + tolerance &&
            elementRect.bottom <= pageBounds.bottom + tolerance
        );
    }

    // ============ BOUNDARY RULES ============

    const RULE_OVERLAY_IN_BOUNDS = {
        id: 'overlay-in-bounds',
        name: 'Overlay Within Page Bounds',
        category: 'boundary',
        severity: 'warn',
        check: function(element, mapper) {
            const pageBounds = getPageBounds(mapper);
            if (!pageBounds) return { passed: true, message: 'No page bounds available' };

            const rect = element.getBoundingClientRect();

            if (!isWithinBounds(rect, pageBounds)) {
                return {
                    passed: false,
                    message: `Overlay outside page bounds`,
                    element,
                    data: {
                        elementRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
                        pageBounds,
                        overflow: {
                            left: Math.max(0, pageBounds.left - rect.left),
                            top: Math.max(0, pageBounds.top - rect.top),
                            right: Math.max(0, rect.right - pageBounds.right),
                            bottom: Math.max(0, rect.bottom - pageBounds.bottom)
                        }
                    }
                };
            }

            return { passed: true };
        }
    };

    const RULE_OVERLAY_SIZE = {
        id: 'overlay-size',
        name: 'Overlay Size Check',
        category: 'boundary',
        severity: 'warn',
        check: function(element, mapper) {
            const pageBounds = getPageBounds(mapper);
            if (!pageBounds) return { passed: true };

            const rect = element.getBoundingClientRect();

            // Check if oversized (more than 110% of page)
            if (rect.width > pageBounds.width * SIZE_TOLERANCE ||
                rect.height > pageBounds.height * SIZE_TOLERANCE) {
                return {
                    passed: false,
                    message: 'Overlay is oversized (larger than page)',
                    element,
                    data: {
                        elementSize: { width: rect.width, height: rect.height },
                        pageSize: { width: pageBounds.width, height: pageBounds.height },
                        ratio: {
                            width: (rect.width / pageBounds.width).toFixed(2),
                            height: (rect.height / pageBounds.height).toFixed(2)
                        }
                    }
                };
            }

            return { passed: true };
        }
    };

    const RULE_OVERLAY_MINIMUM_SIZE = {
        id: 'overlay-min-size',
        name: 'Overlay Minimum Size',
        category: 'boundary',
        severity: 'warn',
        check: function(element, mapper) {
            const rect = element.getBoundingClientRect();

            // Check for near-zero dimensions (likely a rendering error)
            if (rect.width < 2 || rect.height < 2) {
                return {
                    passed: false,
                    message: 'Overlay has near-zero dimensions',
                    element,
                    data: {
                        width: rect.width,
                        height: rect.height
                    }
                };
            }

            return { passed: true };
        }
    };

    // ============ MODE CONSISTENCY RULES ============

    const RULE_MODE_CONSISTENCY = {
        id: 'mode-consistency',
        name: 'Mode-Overlay Consistency',
        category: 'mode',
        severity: 'warn',
        check: function(element, mapper) {
            const interactionMode = mapper.interaction?.mode || 'idle';
            const classList = element.classList;

            // Table overlays should only appear in table mode
            if (classList.contains('table-hint') ||
                classList.contains('table-cell-preview') ||
                classList.contains('table-drawing-area')) {

                const tableActive = interactionMode === 'table_step_drawing' ||
                                   mapper.tableMappingMode ||
                                   (mapper.tableController && mapper.tableController.isActive());

                if (!tableActive) {
                    return {
                        passed: false,
                        message: 'Table overlay visible while table mode is inactive',
                        element,
                        data: { interactionMode, tableMappingMode: mapper.tableMappingMode }
                    };
                }
            }

            // Text selection overlays should only appear in text mode
            if (classList.contains('text-selection-rect')) {
                if (!mapper.textSelectionMode) {
                    return {
                        passed: false,
                        message: 'Text selection overlay visible while text mode is inactive',
                        element,
                        data: { textSelectionMode: mapper.textSelectionMode }
                    };
                }
            }

            return { passed: true };
        }
    };

    const RULE_IDLE_MODE_CLEAN = {
        id: 'idle-mode-clean',
        name: 'Idle Mode Cleanliness',
        category: 'mode',
        severity: 'warn',
        checkGlobal: function(mapper) {
            const interactionMode = mapper.interaction?.mode || 'idle';

            // Skip if not in idle mode
            if (interactionMode !== 'idle') return { passed: true };

            // Check that no temporary overlays exist
            const tempOverlays = document.querySelectorAll(
                '.table-hint, .table-drawing-area, .text-selection-rect, ' +
                '.visual-guide-overlay.visible, .drawing-rect'
            );

            const violations = [];
            tempOverlays.forEach(el => {
                // Skip if it's a persistent element (like mapped table cells)
                if (!el.classList.contains('table-cell-overlay')) {
                    violations.push(el);
                }
            });

            if (violations.length > 0) {
                return {
                    passed: false,
                    message: `${violations.length} temporary overlay(s) visible in idle mode`,
                    data: {
                        count: violations.length,
                        elements: violations.map(el => ({
                            className: el.className,
                            id: el.id
                        }))
                    }
                };
            }

            return { passed: true };
        }
    };

    // ============ VISUAL GUIDE RULES ============

    const RULE_VISUAL_GUIDE_PERSISTENCE = {
        id: 'visual-guide-persistence',
        name: 'Visual Guide Persistence',
        category: 'visual-guide',
        severity: 'warn',
        checkGlobal: function(mapper) {
            const isAnyModeActive =
                mapper.fieldCreationMode ||
                mapper.checkboxCreationMode ||
                mapper.radioCreationMode ||
                mapper.textSelectionMode ||
                mapper.tableMappingMode ||
                (mapper.tableController && mapper.tableController.isActive());

            const visualGuide = mapper.visualGuide;
            const isVisible = visualGuide && visualGuide._isVisible;

            // Visual guide should be visible when a mode is active
            if (isAnyModeActive && !isVisible) {
                return {
                    passed: false,
                    message: 'Visual guide not visible while a mapping mode is active',
                    data: {
                        fieldCreationMode: mapper.fieldCreationMode,
                        checkboxCreationMode: mapper.checkboxCreationMode,
                        radioCreationMode: mapper.radioCreationMode,
                        textSelectionMode: mapper.textSelectionMode,
                        tableMappingMode: mapper.tableMappingMode,
                        visualGuideVisible: isVisible
                    }
                };
            }

            return { passed: true };
        }
    };

    // ============ DATA ATTRIBUTE RULES ============

    const RULE_FIELD_OVERLAY_ATTRIBUTES = {
        id: 'field-overlay-attributes',
        name: 'Field Overlay Required Attributes',
        category: 'attributes',
        severity: 'warn',
        check: function(element, mapper) {
            if (!element.classList.contains('field-overlay')) return { passed: true };

            const missing = [];

            if (!element.dataset.fieldId) {
                missing.push('data-field-id');
            }

            if (missing.length > 0) {
                return {
                    passed: false,
                    message: `Field overlay missing required attributes: ${missing.join(', ')}`,
                    element,
                    data: { missingAttributes: missing }
                };
            }

            return { passed: true };
        }
    };

    const RULE_TABLE_CELL_ATTRIBUTES = {
        id: 'table-cell-attributes',
        name: 'Table Cell Required Attributes',
        category: 'attributes',
        severity: 'warn',
        check: function(element, mapper) {
            if (!element.classList.contains('table-cell-overlay')) return { passed: true };

            const missing = [];

            if (!element.dataset.tableId) missing.push('data-table-id');
            if (!element.dataset.columnId) missing.push('data-column-id');
            if (element.dataset.rowIndex === undefined) missing.push('data-row-index');

            if (missing.length > 0) {
                return {
                    passed: false,
                    message: `Table cell missing required attributes: ${missing.join(', ')}`,
                    element,
                    data: { missingAttributes: missing }
                };
            }

            return { passed: true };
        }
    };

    // ============ PAGE CONSISTENCY RULES ============

    const RULE_PAGE_OVERLAY_CONSISTENCY = {
        id: 'page-overlay-consistency',
        name: 'Page Overlay Consistency',
        category: 'page',
        severity: 'warn',
        checkGlobal: function(mapper) {
            const currentPage = mapper.currentPage || 1;
            const violations = [];

            // Check field overlays
            document.querySelectorAll('.field-overlay').forEach(el => {
                const fieldId = el.dataset.fieldId;
                if (fieldId) {
                    const field = mapper.fields.find(f => f.id === fieldId);
                    if (field && field.page !== currentPage) {
                        violations.push({
                            type: 'field',
                            id: fieldId,
                            elementPage: field.page,
                            currentPage
                        });
                    }
                }
            });

            // Check table cell overlays
            document.querySelectorAll('.table-cell-overlay').forEach(el => {
                const page = parseInt(el.dataset.page);
                if (page && page !== currentPage) {
                    violations.push({
                        type: 'table-cell',
                        tableId: el.dataset.tableId,
                        elementPage: page,
                        currentPage
                    });
                }
            });

            if (violations.length > 0) {
                return {
                    passed: false,
                    message: `${violations.length} overlay(s) from wrong page visible`,
                    data: { violations }
                };
            }

            return { passed: true };
        }
    };

    // ============ TABLE CELL INTEGRITY RULES ============

    const RULE_TABLE_CELL_INTEGRITY = {
        id: 'table-cell-integrity',
        name: 'Table Cell Integrity',
        category: 'table',
        severity: 'warn',
        check: function(element, mapper) {
            if (!element.classList.contains('table-cell-overlay')) return { passed: true };

            const tableId = element.dataset.tableId;
            const table = mapper.mappedTables?.find(t => t.tableId === tableId);

            if (!table) {
                return {
                    passed: false,
                    message: 'Table cell references non-existent table',
                    element,
                    data: { tableId }
                };
            }

            // Check if cell is within table region bounds
            const cellRect = element.getBoundingClientRect();
            const pageBounds = getPageBounds(mapper);

            if (pageBounds && !isWithinBounds(cellRect, pageBounds, 20)) {
                return {
                    passed: false,
                    message: 'Table cell extends outside page bounds',
                    element,
                    data: {
                        tableId,
                        cellRect: { left: cellRect.left, top: cellRect.top, width: cellRect.width, height: cellRect.height }
                    }
                };
            }

            return { passed: true };
        }
    };

    const RULE_TABLE_REGION_INTEGRITY = {
        id: 'table-region-integrity',
        name: 'Table Region Integrity',
        category: 'table',
        severity: 'warn',
        checkGlobal: function(mapper) {
            const violations = [];

            mapper.mappedTables?.forEach(table => {
                if (!table.bbox) {
                    violations.push({
                        tableId: table.tableId,
                        issue: 'missing bbox'
                    });
                    return;
                }

                // Check bbox has valid values
                const { x, y, width, height } = table.bbox;
                if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
                    violations.push({
                        tableId: table.tableId,
                        issue: 'invalid bbox values',
                        bbox: table.bbox
                    });
                }

                // Check for negative or zero dimensions
                if (width <= 0 || height <= 0) {
                    violations.push({
                        tableId: table.tableId,
                        issue: 'zero or negative dimensions',
                        bbox: table.bbox
                    });
                }
            });

            if (violations.length > 0) {
                return {
                    passed: false,
                    message: `${violations.length} table(s) with integrity issues`,
                    data: { violations }
                };
            }

            return { passed: true };
        }
    };

    // ============ ZOOM STABILITY RULES ============

    const RULE_ZOOM_GHOST_CHECK = {
        id: 'zoom-ghost-check',
        name: 'Zoom Ghost Overlay Check',
        category: 'zoom',
        severity: 'warn',
        checkGlobal: function(mapper) {
            // Count overlays that might be ghosts (outside visible area)
            const pageBounds = getPageBounds(mapper);
            if (!pageBounds) return { passed: true };

            const ghosts = [];

            document.querySelectorAll('.field-overlay, .table-cell-overlay').forEach(el => {
                const rect = el.getBoundingClientRect();

                // Check for severely out-of-bounds elements (ghosts)
                const severeOverflow =
                    rect.right < pageBounds.left - 100 ||
                    rect.left > pageBounds.right + 100 ||
                    rect.bottom < pageBounds.top - 100 ||
                    rect.top > pageBounds.bottom + 100;

                if (severeOverflow) {
                    ghosts.push({
                        className: el.className,
                        fieldId: el.dataset.fieldId,
                        tableId: el.dataset.tableId,
                        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
                    });
                }
            });

            if (ghosts.length > 0) {
                return {
                    passed: false,
                    message: `${ghosts.length} ghost overlay(s) detected outside page`,
                    data: { ghosts }
                };
            }

            return { passed: true };
        }
    };

    // ============ RULE REGISTRY ============

    const ALL_RULES = [
        // Boundary rules
        RULE_OVERLAY_IN_BOUNDS,
        RULE_OVERLAY_SIZE,
        RULE_OVERLAY_MINIMUM_SIZE,
        // Mode rules
        RULE_MODE_CONSISTENCY,
        RULE_IDLE_MODE_CLEAN,
        // Visual guide rules
        RULE_VISUAL_GUIDE_PERSISTENCE,
        // Attribute rules
        RULE_FIELD_OVERLAY_ATTRIBUTES,
        RULE_TABLE_CELL_ATTRIBUTES,
        // Page rules
        RULE_PAGE_OVERLAY_CONSISTENCY,
        // Table rules
        RULE_TABLE_CELL_INTEGRITY,
        RULE_TABLE_REGION_INTEGRITY,
        // Zoom rules
        RULE_ZOOM_GHOST_CHECK
    ];

    // Export
    window.VisualTestRules = {
        ALL_RULES,
        BOUNDARY_TOLERANCE,
        SIZE_TOLERANCE,
        getPageBounds,
        isWithinBounds,
        // Individual rules for custom tests
        rules: {
            OVERLAY_IN_BOUNDS: RULE_OVERLAY_IN_BOUNDS,
            OVERLAY_SIZE: RULE_OVERLAY_SIZE,
            OVERLAY_MINIMUM_SIZE: RULE_OVERLAY_MINIMUM_SIZE,
            MODE_CONSISTENCY: RULE_MODE_CONSISTENCY,
            IDLE_MODE_CLEAN: RULE_IDLE_MODE_CLEAN,
            VISUAL_GUIDE_PERSISTENCE: RULE_VISUAL_GUIDE_PERSISTENCE,
            FIELD_OVERLAY_ATTRIBUTES: RULE_FIELD_OVERLAY_ATTRIBUTES,
            TABLE_CELL_ATTRIBUTES: RULE_TABLE_CELL_ATTRIBUTES,
            PAGE_OVERLAY_CONSISTENCY: RULE_PAGE_OVERLAY_CONSISTENCY,
            TABLE_CELL_INTEGRITY: RULE_TABLE_CELL_INTEGRITY,
            TABLE_REGION_INTEGRITY: RULE_TABLE_REGION_INTEGRITY,
            ZOOM_GHOST_CHECK: RULE_ZOOM_GHOST_CHECK
        }
    };

})();
