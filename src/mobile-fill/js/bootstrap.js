/**
 * bootstrap.js
 * Initializes all MobileFill modules in the correct order.
 */
(function() {
    'use strict';

    console.log('[MobileFill] Bootstrap starting...');

    // Core modules (must init first)
    if (window.MobileFillEventLogger && typeof window.MobileFillEventLogger.init === 'function') {
        window.MobileFillEventLogger.init();
    }

    if (window.MobileFillDebugConsole && typeof window.MobileFillDebugConsole.init === 'function') {
        window.MobileFillDebugConsole.init();
    }

    // Flow controller (state management)
    if (window.MobileFillFlowController && typeof window.MobileFillFlowController.init === 'function') {
        window.MobileFillFlowController.init();
    }

    // UI modules
    if (window.MobileFillLandscapeGate && typeof window.MobileFillLandscapeGate.init === 'function') {
        window.MobileFillLandscapeGate.init();
    }

    if (window.MobileFillUIStatus && typeof window.MobileFillUIStatus.init === 'function') {
        window.MobileFillUIStatus.init();
    }

    // Form selector (new)
    if (window.MobileFillFormSelector && typeof window.MobileFillFormSelector.init === 'function') {
        window.MobileFillFormSelector.init();
    }

    // Mapping loader
    if (window.MobileFillMappingLoader && typeof window.MobileFillMappingLoader.init === 'function') {
        window.MobileFillMappingLoader.init();
    }

    // PDF handling
    if (window.MobileFillPdfUpload && typeof window.MobileFillPdfUpload.init === 'function') {
        window.MobileFillPdfUpload.init();
    }

    // PDF loader (loads PDF when form is selected)
    if (window.MobileFillPdfLoader && typeof window.MobileFillPdfLoader.init === 'function') {
        window.MobileFillPdfLoader.init();
    }

    if (window.MobileFillPdfViewer && typeof window.MobileFillPdfViewer.init === 'function') {
        window.MobileFillPdfViewer.init();
    }

    // Hotspot overlay (field rectangles)
    if (window.MobileFillHotspotOverlay && typeof window.MobileFillHotspotOverlay.init === 'function') {
        window.MobileFillHotspotOverlay.init();
    }

    // Field navigator (new)
    if (window.MobileFillFieldNavigator && typeof window.MobileFillFieldNavigator.init === 'function') {
        window.MobileFillFieldNavigator.init();
    }

    // QuickFillEditor removed - MobileFill is view/fill only mode
    // Fields come from mapping JSON, not user-drawn

    // Live preview
    if (window.MobileFillLivePreviewRenderer && typeof window.MobileFillLivePreviewRenderer.init === 'function') {
        window.MobileFillLivePreviewRenderer.init();
    }

    // Export
    if (window.MobileFillExportButton && typeof window.MobileFillExportButton.init === 'function') {
        window.MobileFillExportButton.init();
    }

    if (window.MobileFillExportController && typeof window.MobileFillExportController.init === 'function') {
        window.MobileFillExportController.init();
    }

    // Show/hide UI based on events
    setupScreenTransitions();

    console.log('[MobileFill] Bootstrap complete');
})();

/**
 * Setup screen transitions based on events
 */
function setupScreenTransitions() {
    if (!window.MobileFillEventBus) return;

    const formSelector = document.getElementById('mobilefill-form-selector');
    const fillScreen = document.getElementById('mobilefill-fill-screen');
    const navBar = document.getElementById('mobilefill-nav-bar');
    const exportBar = document.getElementById('mobilefill-export-bar');

    // When PDF is loaded, show fill screen
    window.MobileFillEventBus.on('PDF_LOADED', () => {
        if (formSelector) formSelector.classList.add('is-hidden');
        if (fillScreen) fillScreen.classList.remove('is-hidden');
        if (exportBar) exportBar.classList.remove('is-hidden');
    });

    // When hotspots are ready, show nav bar
    window.MobileFillEventBus.on('HOTSPOTS_READY', () => {
        if (navBar) navBar.classList.remove('is-hidden');
    });

    // When session resets, go back to form selector
    window.MobileFillEventBus.on('SESSION_RESET', () => {
        if (formSelector) formSelector.classList.remove('is-hidden');
        if (fillScreen) fillScreen.classList.add('is-hidden');
        if (navBar) navBar.classList.add('is-hidden');
        if (exportBar) exportBar.classList.add('is-hidden');
    });
}
