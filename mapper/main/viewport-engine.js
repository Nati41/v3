/**
 * Mapper Viewport Engine - Viewport management logic
 * These functions handle zoom, pan, dimensions, and viewport state.
 *
 * NOTE: All functions receive mapper state as parameters.
 * No internal "this" references - all state passed in.
 * UI DOM updates are delegated to mapper-ui.js via mapper instance.
 */
(function() {
    'use strict';

    // ============ ZOOM FUNCTIONS ============

    /**
     * Set internal zoom level and update view
     * @param {number} newZoomLevel - New zoom level
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function setInternalZoom(newZoomLevel, mapper) {
        console.log('setInternalZoom:', newZoomLevel);

        mapper.zoomLevel = Math.max(0.1, Math.min(5.0, newZoomLevel));

        // Apply zoom via UI module
        mapper.updateViewTransform();

        // Update zoom display via UI module
        const zoomInfo = document.getElementById('zoom-info');
        if (zoomInfo) {
            zoomInfo.textContent = Math.round(mapper.zoomLevel * 100) + '%';
        }

        // STABILITY: Update visual guide on zoom change
        if (mapper.visualGuide) {
            mapper.visualGuide.updateOnZoom(mapper.zoomLevel, mapper.panX || 0, mapper.panY || 0);
        }
    }

    /**
     * Set zoom with center-point preservation
     * @param {number} newZoom - New zoom level
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function setZoom(newZoom, mapper) {
        const viewport = document.getElementById('canvas-viewport');
        if (!viewport) return;

        const rect = viewport.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const pointX = (centerX - mapper.panX) / mapper.zoomLevel;
        const pointY = (centerY - mapper.panY) / mapper.zoomLevel;

        mapper.zoomLevel = newZoom;

        mapper.panX = centerX - pointX * mapper.zoomLevel;
        mapper.panY = centerY - pointY * mapper.zoomLevel;

        mapper.updateZoomDisplay();

        // Update field positions after zoom
    }

    /**
     * Zoom in by 20%
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function zoomIn(mapper) {
        // STABILITY: Stop visual guide before zoom
        if (mapper.visualGuide) {
            mapper.visualGuide.stop('zoomIn');
        }

        if (mapper.appMode === 'livefill') {
            // In live fill mode, re-render PDF with new zoom
            mapper.zoomLevel = Math.min(mapper.zoomLevel * 1.2, 5.0);
            mapper.renderPDFForLiveFill();
        } else {
            setInternalZoom(mapper.zoomLevel * 1.2, mapper);
        }
        updateZoomInfo(mapper);

        // FIX PACKAGE 2: Refresh table previews after zoom
        refreshTablePreviewsAfterZoom(mapper);

        // Visual Test hook - notify runner of zoom change
        window.VisualTestRunner?.onZoomChange();
    }

    /**
     * Zoom out by 20%
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function zoomOut(mapper) {
        // STABILITY: Stop visual guide before zoom
        if (mapper.visualGuide) {
            mapper.visualGuide.stop('zoomOut');
        }

        if (mapper.appMode === 'livefill') {
            // In live fill mode, re-render PDF with new zoom
            mapper.zoomLevel = Math.max(mapper.zoomLevel / 1.2, 0.1);
            mapper.renderPDFForLiveFill();
        } else {
            setInternalZoom(mapper.zoomLevel / 1.2, mapper);
        }
        updateZoomInfo(mapper);

        // FIX PACKAGE 2: Refresh table previews after zoom
        refreshTablePreviewsAfterZoom(mapper);

        // Visual Test hook - notify runner of zoom change
        window.VisualTestRunner?.onZoomChange();
    }

    /**
     * Reset zoom to 100%
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function resetZoom(mapper) {
        // STABILITY: Stop visual guide before zoom
        if (mapper.visualGuide) {
            mapper.visualGuide.stop('resetZoom');
        }

        if (mapper.appMode === 'livefill') {
            // In live fill mode, re-render PDF with default zoom
            mapper.zoomLevel = 1.0;
            mapper.renderPDFForLiveFill();
        } else {
            setInternalZoom(1.0, mapper);
        }
        updateZoomInfo(mapper);
        resetView(mapper);

        // FIX PACKAGE 2: Refresh table previews after zoom reset
        refreshTablePreviewsAfterZoom(mapper);

        // Visual Test hook - notify runner of zoom change
        window.VisualTestRunner?.onZoomChange();
    }

    /**
     * FIX PACKAGE 2: Refresh table previews after zoom change
     * Ensures previews remain properly positioned and not clipped
     * @param {Object} mapper - FieldMapper instance
     */
    function refreshTablePreviewsAfterZoom(mapper) {
        if (!mapper) return;

        // TASK 5: Refresh table cell overlays on zoom (always, for proper scaling)
        refreshTableCellsAfterZoom(mapper);

        // Refresh live table preview mode if enabled
        if (mapper.liveTablePreviewMode) {
            // Check if PreviewEngine is available
            if (window.MapperPreviewEngine && typeof window.MapperPreviewEngine.refreshAllPreviews === 'function') {
                const tables = mapper.mappedTables || [];
                const options = mapper.previewSettings || {};

                // Use requestAnimationFrame for smooth update
                requestAnimationFrame(() => {
                    window.MapperPreviewEngine.refreshAllPreviews(tables, options);
                    console.log('📺 Table previews refreshed after zoom');
                });
            }
        }
    }

    /**
     * TASK 5: Refresh table cell overlays after zoom change
     * Re-renders cells with proper coordinates derived from PDF points
     * @param {Object} mapper - FieldMapper instance
     */
    function refreshTableCellsAfterZoom(mapper) {
        if (!mapper || !mapper.mappedTables || mapper.mappedTables.length === 0) return;

        // Use requestAnimationFrame for smooth update
        requestAnimationFrame(() => {
            // ========== CENTRALIZED CLEANUP — USE MAPPER'S AUTHORITATIVE FUNCTION ==========
            // This ensures ALL table overlays are removed before re-render
            if (typeof mapper.fullTableOverlayReset === 'function') {
                mapper.fullTableOverlayReset('refreshTableCellsAfterZoom');
            } else {
                // Fallback for backwards compatibility
                document.querySelectorAll('.table-cell-overlay').forEach(el => el.remove());
                document.querySelectorAll('.table-region-overlay').forEach(el => el.remove());
                document.querySelectorAll('.table-hint').forEach(el => el.remove());
                console.log('📐 [refreshTableCellsAfterZoom] Fallback cleanup executed');
            }

            // Re-render table cells for current page with updated coordinates
            mapper.mappedTables
                .filter(table => (table.page || 1) === mapper.currentPage)
                .forEach(table => {
                    if (typeof mapper.renderTableCells === 'function') {
                        mapper.renderTableCells(table);
                    }
                    // Also re-render region overlay if available
                    if (typeof mapper.renderTableOverlay === 'function') {
                        mapper.renderTableOverlay(table);
                    }
                });
            console.log('📐 Table cells refreshed after zoom');
        });
    }

    /**
     * Clear table overlays for a specific page
     * Used during page navigation to prevent ghost cells
     * @param {number} pageNum - Page number to clear overlays for
     */
    function clearTableOverlaysForPage(pageNum) {
        // Remove cell overlays for this page
        document.querySelectorAll(`.table-cell-overlay[data-page="${pageNum}"]`)
            .forEach(el => el.remove());

        // Remove region overlays for this page
        document.querySelectorAll(`.table-region-overlay[data-page="${pageNum}"]`)
            .forEach(el => el.remove());

        console.log(`📐 Cleared table overlays for page ${pageNum}`);
    }

    /**
     * Clear ALL table overlays globally
     * Used before major re-renders (window resize, PDF reload)
     * @param {Object} [mapper] - Optional mapper instance for centralized cleanup
     */
    function clearAllTableOverlays(mapper) {
        // ========== USE CENTRALIZED CLEANUP IF AVAILABLE ==========
        if (mapper && typeof mapper.fullTableOverlayReset === 'function') {
            mapper.fullTableOverlayReset('viewport-clearAllTableOverlays');
            return;
        }

        // Fallback cleanup
        document.querySelectorAll('.table-cell-overlay').forEach(el => el.remove());
        document.querySelectorAll('.table-region-overlay').forEach(el => el.remove());
        document.querySelectorAll('.table-hint').forEach(el => el.remove());
        document.querySelectorAll('.table-drawing-area').forEach(el => el.remove());
        document.querySelectorAll('.table-cell-preview').forEach(el => el.remove());

        console.log('📐 [viewport] Hard cleanup: removed ALL table overlays globally');
    }

    /**
     * Update zoom info display
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateZoomInfo(mapper) {
        const zoomInfo = document.getElementById('zoom-info');
        if (zoomInfo) {
            const currentZoom = mapper.zoomLevel;
            zoomInfo.textContent = Math.round(currentZoom * 100) + '%';
        }
    }

    /**
     * Update view transform (delegated to UI)
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateViewTransform(mapper) {
        // Delegate to UI module
        mapper.UI.updateViewTransform(mapper.zoomLevel, mapper.panX, mapper.panY);
    }

    // ============ PAN FUNCTIONS ============

    /**
     * Update pan position based on mouse coordinates
     * @param {number} clientX - Mouse X position
     * @param {number} clientY - Mouse Y position
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updatePan(clientX, clientY, mapper) {
        if (!mapper.dragStart) return;
        mapper.panX = clientX - mapper.dragStart.x;
        mapper.panY = clientY - mapper.dragStart.y;
    }

    /**
     * Reset view to default state
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function resetView(mapper) {
        mapper.zoomLevel = 1;
        mapper.panX = 0;
        mapper.panY = 0;
        mapper.updateZoomDisplay();
    }

    // ============ DIMENSION FUNCTIONS ============

    /**
     * Get logical width of container
     * @param {HTMLElement} container - Container element
     * @param {Object} baseDimensions - Base dimensions object
     * @returns {number} Logical width
     */
    function getLogicalWidth(container, baseDimensions) {
        // Delegate to PdfEngine which has the calculation logic
        return window.MapperPdfEngine.getLogicalWidth(container, baseDimensions);
    }

    /**
     * Get logical height of container
     * @param {HTMLElement} container - Container element
     * @param {Object} baseDimensions - Base dimensions object
     * @returns {number} Logical height
     */
    function getLogicalHeight(container, baseDimensions) {
        // Delegate to PdfEngine which has the calculation logic
        return window.MapperPdfEngine.getLogicalHeight(container, baseDimensions);
    }

    /**
     * Get logical dimensions of the container
     * @param {Object} mapper - FieldMapper instance for state access
     * @returns {Object} { width, height }
     */
    function getLogicalDimensions(mapper) {
        // If base dimensions are saved, use them
        if (mapper.baseDimensions.width > 0 && mapper.baseDimensions.height > 0) {
            return {
                width: mapper.baseDimensions.width,
                height: mapper.baseDimensions.height
            };
        }

        // Fallback to container dimensions
        const container = document.getElementById('mapping-layer');
        if (!container) return { width: 0, height: 0 };

        const rect = container.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }

    // ============ RESIZE & FULLSCREEN HANDLERS ============

    /**
     * Handle window resize event
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function handleWindowResize(mapper) {
        const container = document.getElementById('mapping-layer');
        if (!container) {
            return;
        }

        // ========== CENTRALIZED CLEANUP — USE MAPPER'S AUTHORITATIVE FUNCTION ==========
        // Clear all table overlays to prevent ghost cells during resize
        if (typeof mapper.fullTableOverlayReset === 'function') {
            mapper.fullTableOverlayReset('handleWindowResize');
        } else {
            clearAllTableOverlays(mapper);
        }

        // Reset base dimensions to force recalculation
        mapper.baseDimensions = { width: 0, height: 0 };

        // Save new dimensions
        mapper.saveBaseDimensions();

        // Update field positions with delay to ensure new dimensions are saved
        setTimeout(() => {
            mapper.refreshFieldText();

            // Re-render table cells after resize with new coordinates
            if (mapper.mappedTables && mapper.mappedTables.length > 0) {
                mapper.mappedTables
                    .filter(table => (table.page || 1) === mapper.currentPage)
                    .forEach(table => {
                        if (typeof mapper.renderTableCells === 'function') {
                            mapper.renderTableCells(table);
                        }
                        if (typeof mapper.renderTableOverlay === 'function') {
                            mapper.renderTableOverlay(table);
                        }
                    });
                console.log('📐 Table cells refreshed after window resize');
            }
        }, 300);
    }

    /**
     * Handle fullscreen change event
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function handleFullscreenChange(mapper) {
        // Delay to allow browser to adjust to new dimensions
        setTimeout(() => {
            handleWindowResize(mapper);
        }, 300);
    }

    // ============ EXPORT ============

    window.MapperViewportEngine = {
        setInternalZoom,
        setZoom,
        zoomIn,
        zoomOut,
        resetZoom,
        updateZoomInfo,
        updateViewTransform,
        updatePan,
        resetView,
        getLogicalWidth,
        getLogicalHeight,
        getLogicalDimensions,
        handleWindowResize,
        handleFullscreenChange,
        // Table overlay cleanup functions
        clearTableOverlaysForPage,
        clearAllTableOverlays,
        refreshTableCellsAfterZoom
    };
})();
