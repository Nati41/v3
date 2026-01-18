(function() {
    'use strict';

    const WATCH_EVENTS = [
        'CATALOG_LOAD_STARTED',
        'CATALOG_LOAD_SUCCESS',
        'CATALOG_LOAD_ERROR',
        'FORM_SELECTED',
        'FORM_DESELECTED',
        'PDF_LOAD_STARTED',
        'PDF_LOADED',
        'PDF_LOAD_ERROR',
        'MAPPING_LOAD_STARTED',
        'MAPPING_READY',
        'MAPPING_LOAD_ERROR',
        'VIEWER_RENDER_STARTED',
        'VIEWER_RENDER_DONE',
        'HOTSPOTS_READY'
    ];

    function update() {
        const statusEl = document.getElementById('mobilefill-status');
        if (!statusEl || !window.MobileFillStateStore) return;

        const { state } = window.MobileFillStateStore;
        const catalogStatus = state.catalogState.isCatalogLoading
            ? 'loading'
            : state.catalogState.catalogError
                ? 'error'
                : state.catalogState.catalog
                    ? 'ready'
                    : 'idle';

        const pdfStatus = state.documentState.pdfLoadStatus;
        const mappingStatus = state.mappingState.mappingLoadStatus;
        const viewerReady = Object.keys(state.viewerState.pageViewports || {}).length > 0;
        const hotspotsReady = state.uiState.hotspotsReady;
        const screen = state.uiState.screen;
        const selectedFormId = state.selectionState.selectedFormId || 'none';

        statusEl.textContent = [
            `screen: ${screen}`,
            `catalog: ${catalogStatus}`,
            `selectedFormId: ${selectedFormId}`,
            `pdfLoadStatus: ${pdfStatus}`,
            `mapping: ${mappingStatus}`,
            `viewerReady: ${viewerReady}`,
            `hotspotsReady: ${hotspotsReady}`
        ].join('\n');
    }

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; UI status disabled');
            return;
        }

        WATCH_EVENTS.forEach((eventName) => {
            window.MobileFillEventBus.on(eventName, update);
        });

        update();
    }

    window.MobileFillUIStatus = {
        init
    };
})();
