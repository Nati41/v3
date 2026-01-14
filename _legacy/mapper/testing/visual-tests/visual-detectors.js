/**
 * Visual Test Detectors
 * Functions that detect and collect DOM elements for testing
 *
 * Optimized for speed (< 2ms target)
 */
(function() {
    'use strict';

    // Cache for frequently accessed elements
    let elementCache = {
        timestamp: 0,
        fieldOverlays: [],
        tableCellOverlays: [],
        tableRegionOverlays: [],
        visualGuideOverlay: null,
        mappingLayer: null
    };

    const CACHE_TTL = 100; // Cache TTL in ms

    /**
     * Invalidate cache
     */
    function invalidateCache() {
        elementCache.timestamp = 0;
    }

    /**
     * Refresh cache if stale
     */
    function refreshCache() {
        const now = Date.now();
        if (now - elementCache.timestamp < CACHE_TTL) {
            return; // Cache still valid
        }

        elementCache = {
            timestamp: now,
            fieldOverlays: Array.from(document.querySelectorAll('.field-overlay')),
            tableCellOverlays: Array.from(document.querySelectorAll('.table-cell-overlay')),
            tableRegionOverlays: Array.from(document.querySelectorAll('.table-region-overlay')),
            tableHints: Array.from(document.querySelectorAll('.table-hint')),
            visualGuideOverlay: document.getElementById('visual-guide-overlay'),
            mappingLayer: document.getElementById('mapping-layer'),
            textSelectionRect: document.querySelector('.text-selection-rect'),
            drawingRect: document.querySelector('.drawing-rect')
        };
    }

    // ============ ELEMENT DETECTORS ============

    /**
     * Get all field overlays
     */
    function getFieldOverlays() {
        refreshCache();
        return elementCache.fieldOverlays;
    }

    /**
     * Get all table cell overlays
     */
    function getTableCellOverlays() {
        refreshCache();
        return elementCache.tableCellOverlays;
    }

    /**
     * Get all table region overlays
     */
    function getTableRegionOverlays() {
        refreshCache();
        return elementCache.tableRegionOverlays;
    }

    /**
     * Get all table hints (temporary during wizard)
     */
    function getTableHints() {
        refreshCache();
        return elementCache.tableHints;
    }

    /**
     * Get visual guide overlay
     */
    function getVisualGuideOverlay() {
        refreshCache();
        return elementCache.visualGuideOverlay;
    }

    /**
     * Get mapping layer
     */
    function getMappingLayer() {
        refreshCache();
        return elementCache.mappingLayer;
    }

    /**
     * Get all testable overlays (combined)
     */
    function getAllOverlays() {
        refreshCache();
        return [
            ...elementCache.fieldOverlays,
            ...elementCache.tableCellOverlays,
            ...elementCache.tableRegionOverlays,
            ...elementCache.tableHints
        ];
    }

    /**
     * Get overlays by selector
     */
    function getOverlaysBySelector(selector) {
        return Array.from(document.querySelectorAll(selector));
    }

    // ============ STATE DETECTORS ============

    /**
     * Detect current mapper mode
     */
    function detectMapperMode(mapper) {
        if (!mapper) return 'unknown';

        if (mapper.tableController?.isActive() || mapper.tableMappingMode) {
            return 'table';
        }
        if (mapper.textSelectionMode) {
            return 'text-selection';
        }
        if (mapper.fieldCreationMode) {
            return 'field-creation';
        }
        if (mapper.checkboxCreationMode) {
            return 'checkbox';
        }
        if (mapper.radioCreationMode) {
            return 'radio';
        }
        if (mapper.groupingMode) {
            return 'grouping';
        }
        if (mapper.optionGroupingMode) {
            return 'option-grouping';
        }

        return 'idle';
    }

    /**
     * Detect visual guide state
     */
    function detectVisualGuideState(mapper) {
        if (!mapper?.visualGuide) {
            return { exists: false, visible: false, mode: null };
        }

        const vg = mapper.visualGuide;
        return {
            exists: true,
            visible: vg._isVisible || false,
            mode: vg._currentMode || null,
            persistent: vg._persistMode || false
        };
    }

    /**
     * Detect zoom state
     */
    function detectZoomState(mapper) {
        return {
            level: mapper?.zoomLevel || 1,
            panX: mapper?.panX || 0,
            panY: mapper?.panY || 0
        };
    }

    /**
     * Detect page state
     */
    function detectPageState(mapper) {
        return {
            currentPage: mapper?.currentPage || 1,
            totalPages: mapper?.totalPages || 1
        };
    }

    // ============ ANOMALY DETECTORS ============

    /**
     * Detect ghost overlays (severely out of bounds)
     */
    function detectGhostOverlays(mapper) {
        const pageBounds = window.VisualTestRules?.getPageBounds(mapper);
        if (!pageBounds) return [];

        const ghosts = [];
        const tolerance = 100;

        getAllOverlays().forEach(el => {
            const rect = el.getBoundingClientRect();

            const isGhost =
                rect.right < pageBounds.left - tolerance ||
                rect.left > pageBounds.right + tolerance ||
                rect.bottom < pageBounds.top - tolerance ||
                rect.top > pageBounds.bottom + tolerance;

            if (isGhost) {
                ghosts.push({
                    element: el,
                    className: el.className,
                    rect: {
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height
                    }
                });
            }
        });

        return ghosts;
    }

    /**
     * Detect oversized overlays
     */
    function detectOversizedOverlays(mapper) {
        const pageBounds = window.VisualTestRules?.getPageBounds(mapper);
        if (!pageBounds) return [];

        const oversized = [];
        const sizeThreshold = 1.1;

        getAllOverlays().forEach(el => {
            const rect = el.getBoundingClientRect();

            if (rect.width > pageBounds.width * sizeThreshold ||
                rect.height > pageBounds.height * sizeThreshold) {
                oversized.push({
                    element: el,
                    className: el.className,
                    size: { width: rect.width, height: rect.height },
                    pageSize: { width: pageBounds.width, height: pageBounds.height }
                });
            }
        });

        return oversized;
    }

    /**
     * Detect overlays with missing attributes
     */
    function detectMissingAttributes() {
        const issues = [];

        // Field overlays without field-id
        getFieldOverlays().forEach(el => {
            if (!el.dataset.fieldId) {
                issues.push({
                    element: el,
                    type: 'field-overlay',
                    missing: ['data-field-id']
                });
            }
        });

        // Table cells without required attributes
        getTableCellOverlays().forEach(el => {
            const missing = [];
            if (!el.dataset.tableId) missing.push('data-table-id');
            if (!el.dataset.columnId) missing.push('data-column-id');
            if (el.dataset.rowIndex === undefined) missing.push('data-row-index');

            if (missing.length > 0) {
                issues.push({
                    element: el,
                    type: 'table-cell',
                    missing
                });
            }
        });

        return issues;
    }

    /**
     * Detect overlays from wrong page
     */
    function detectWrongPageOverlays(mapper) {
        const currentPage = mapper?.currentPage || 1;
        const wrongPage = [];

        // Check table cell overlays
        getTableCellOverlays().forEach(el => {
            const page = parseInt(el.dataset.page);
            if (page && page !== currentPage) {
                wrongPage.push({
                    element: el,
                    type: 'table-cell',
                    elementPage: page,
                    currentPage
                });
            }
        });

        // Check field overlays
        getFieldOverlays().forEach(el => {
            const fieldId = el.dataset.fieldId;
            if (fieldId) {
                const field = mapper.fields?.find(f => f.id === fieldId);
                if (field && field.page !== currentPage) {
                    wrongPage.push({
                        element: el,
                        type: 'field',
                        elementPage: field.page,
                        currentPage
                    });
                }
            }
        });

        return wrongPage;
    }

    /**
     * Detect orphaned table cells (no matching table)
     */
    function detectOrphanedTableCells(mapper) {
        const orphaned = [];
        const tableIds = new Set(mapper.mappedTables?.map(t => t.tableId) || []);

        getTableCellOverlays().forEach(el => {
            const tableId = el.dataset.tableId;
            if (tableId && !tableIds.has(tableId)) {
                orphaned.push({
                    element: el,
                    tableId
                });
            }
        });

        return orphaned;
    }

    // ============ SNAPSHOT FUNCTIONS ============

    /**
     * Take a snapshot of current overlay state
     */
    function takeSnapshot(mapper) {
        invalidateCache();
        refreshCache();

        return {
            timestamp: Date.now(),
            mode: detectMapperMode(mapper),
            visualGuide: detectVisualGuideState(mapper),
            zoom: detectZoomState(mapper),
            page: detectPageState(mapper),
            counts: {
                fieldOverlays: elementCache.fieldOverlays.length,
                tableCells: elementCache.tableCellOverlays.length,
                tableRegions: elementCache.tableRegionOverlays.length,
                tableHints: elementCache.tableHints.length,
                total: getAllOverlays().length
            },
            anomalies: {
                ghosts: detectGhostOverlays(mapper).length,
                oversized: detectOversizedOverlays(mapper).length,
                missingAttrs: detectMissingAttributes().length,
                wrongPage: detectWrongPageOverlays(mapper).length,
                orphaned: detectOrphanedTableCells(mapper).length
            }
        };
    }

    /**
     * Compare two snapshots for drift detection
     */
    function compareSnapshots(before, after) {
        const changes = [];

        // Check for overlay count changes
        if (before.counts.total !== after.counts.total) {
            changes.push({
                type: 'count-change',
                before: before.counts.total,
                after: after.counts.total,
                diff: after.counts.total - before.counts.total
            });
        }

        // Check for anomaly increases
        Object.keys(before.anomalies).forEach(key => {
            if (after.anomalies[key] > before.anomalies[key]) {
                changes.push({
                    type: 'anomaly-increase',
                    anomaly: key,
                    before: before.anomalies[key],
                    after: after.anomalies[key]
                });
            }
        });

        return changes;
    }

    // Export
    window.VisualTestDetectors = {
        // Cache management
        invalidateCache,
        refreshCache,

        // Element getters
        getFieldOverlays,
        getTableCellOverlays,
        getTableRegionOverlays,
        getTableHints,
        getVisualGuideOverlay,
        getMappingLayer,
        getAllOverlays,
        getOverlaysBySelector,

        // State detectors
        detectMapperMode,
        detectVisualGuideState,
        detectZoomState,
        detectPageState,

        // Anomaly detectors
        detectGhostOverlays,
        detectOversizedOverlays,
        detectMissingAttributes,
        detectWrongPageOverlays,
        detectOrphanedTableCells,

        // Snapshots
        takeSnapshot,
        compareSnapshots
    };

})();
