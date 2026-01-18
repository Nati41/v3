(function() {
    'use strict';

    console.log('[MobileFill] bootstrap loaded');

    if (window.MobileFillEventLogger && typeof window.MobileFillEventLogger.init === 'function') {
        window.MobileFillEventLogger.init();
    }

    if (window.MobileFillUIStatus && typeof window.MobileFillUIStatus.init === 'function') {
        window.MobileFillUIStatus.init();
    }

    if (window.MobileFillFlowController && typeof window.MobileFillFlowController.init === 'function') {
        window.MobileFillFlowController.init();
    }

    if (window.MobileFillExportGate && typeof window.MobileFillExportGate.init === 'function') {
        window.MobileFillExportGate.init();
    }

    if (window.MobileFillExportBlockedBanner && typeof window.MobileFillExportBlockedBanner.init === 'function') {
        window.MobileFillExportBlockedBanner.init();
    }

    if (window.MobileFillPdfLoader && typeof window.MobileFillPdfLoader.init === 'function') {
        window.MobileFillPdfLoader.init();
    }

    if (window.MobileFillMappingLoader && typeof window.MobileFillMappingLoader.init === 'function') {
        window.MobileFillMappingLoader.init();
    }

    if (window.MobileFillPdfViewer && typeof window.MobileFillPdfViewer.init === 'function') {
        window.MobileFillPdfViewer.init();
    }

    if (window.MobileFillHotspotOverlay && typeof window.MobileFillHotspotOverlay.init === 'function') {
        window.MobileFillHotspotOverlay.init();
    }

    if (window.MobileFillPopoverInputController && typeof window.MobileFillPopoverInputController.init === 'function') {
        window.MobileFillPopoverInputController.init();
    }

    if (window.MobileFillLivePreviewRenderer && typeof window.MobileFillLivePreviewRenderer.init === 'function') {
        window.MobileFillLivePreviewRenderer.init();
    }

    if (window.MobileFillDevControls && typeof window.MobileFillDevControls.init === 'function') {
        window.MobileFillDevControls.init();
    }
})();
