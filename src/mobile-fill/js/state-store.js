(function() {
    'use strict';

    const state = {
        catalogState: {
            catalog: null,
            isCatalogLoading: false,
            catalogError: null,
            activeCategory: null,
            searchQuery: ''
        },
        selectionState: {
            selectedFormId: null,
            selectedForm: null
        },
        documentState: {
            pdfBytesSafe: null,
            pdfJsDoc: null,
            pdfLoadStatus: 'idle',
            pdfError: null,
            pageCount: null
        },
        mappingState: {
            fieldsMapping: null,
            mappingLoadStatus: 'idle',
            mappingError: null,
            normalized: false
        },
        liveFillState: {
            liveFillData: {
                fields: {},
                tables: {}
            },
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
            screen: 'landing',
            isPopoverOpen: false,
            activeFieldId: null,
            activeTableContext: null,
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
