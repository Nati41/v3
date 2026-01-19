(function() {
    'use strict';

    console.log('[MobileFill] bootstrap loaded');

    if (window.MobileFillEventLogger && typeof window.MobileFillEventLogger.init === 'function') {
        window.MobileFillEventLogger.init();
    }

    if (window.MobileFillDebugConsole && typeof window.MobileFillDebugConsole.init === 'function') {
        window.MobileFillDebugConsole.init();
    }

    if (window.MobileFillLandscapeGate && typeof window.MobileFillLandscapeGate.init === 'function') {
        window.MobileFillLandscapeGate.init();
    }

    if (window.MobileFillUIStatus && typeof window.MobileFillUIStatus.init === 'function') {
        window.MobileFillUIStatus.init();
    }

    if (window.MobileFillFlowController && typeof window.MobileFillFlowController.init === 'function') {
        window.MobileFillFlowController.init();
    }

    if (window.MobileFillExportButton && typeof window.MobileFillExportButton.init === 'function') {
        window.MobileFillExportButton.init();
    }

    if (window.MobileFillPdfUpload && typeof window.MobileFillPdfUpload.init === 'function') {
        window.MobileFillPdfUpload.init();
    }

    if (window.MobileFillPdfViewer && typeof window.MobileFillPdfViewer.init === 'function') {
        window.MobileFillPdfViewer.init();
    }

    if (window.MobileFillQuickFillEditor && typeof window.MobileFillQuickFillEditor.init === 'function') {
        window.MobileFillQuickFillEditor.init();
    }

    if (window.MobileFillLivePreviewRenderer && typeof window.MobileFillLivePreviewRenderer.init === 'function') {
        window.MobileFillLivePreviewRenderer.init();
    }

    if (window.MobileFillExportController && typeof window.MobileFillExportController.init === 'function') {
        window.MobileFillExportController.init();
    }
})();
