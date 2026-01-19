(function() {
    'use strict';

    const state = {
        documentState: {
            pdfBytesSafe: null,
            pdfBytesSafeForExport: null,
            pdfJsDoc: null,
            pdfLoadStatus: 'idle',
            pdfError: null,
            pageCount: null
        },
        quickFillState: {
            fields: [],
            activeFieldId: null
        },
        liveFillState: {
            liveFillData: {},
            dirty: false,
            lastChangedAt: null
        },
        viewerState: {
            renderScale: null,
            currentZoom: null,
            activePage: null,
            pageViewports: {},
            canvasSize: {}
        },
        uiState: {
            hotspotsReady: false,
            toastQueue: []
        },
        exportState: {
            exportStatus: 'idle',
            exportError: null,
            lastExportAt: null,
            exportFileName: null
        }
    };

    window.MobileFillStateStore = {
        state
    };
})();
