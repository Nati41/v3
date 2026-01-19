(function() {
    'use strict';

    const WATCH_EVENTS = [
        'PDF_LOAD_STARTED',
        'PDF_LOADED',
        'PDF_LOAD_ERROR',
        'VIEWER_RENDER_STARTED',
        'VIEWER_RENDER_DONE',
        'HOTSPOTS_READY',
        'FIELD_CREATED',
        'FIELD_REMOVED',
        'FIELD_UPDATED'
    ];

    function update() {
        const statusEl = document.getElementById('mobilefill-status');
        if (!statusEl || !window.MobileFillStateStore) return;

        const { state } = window.MobileFillStateStore;
        const pdfStatus = state.documentState.pdfLoadStatus;
        const viewerReady = Object.keys(state.viewerState.pageViewports || {}).length > 0;
        const hotspotsReady = state.uiState.hotspotsReady;
        const fieldCount = state.quickFillState?.fields?.length || 0;

        statusEl.textContent = [
            `pdfLoadStatus: ${pdfStatus}`,
            `viewerReady: ${viewerReady}`,
            `hotspotsReady: ${hotspotsReady}`,
            `fields: ${fieldCount}`
        ].join('\n');
    }

    function init() {
        const statusEl = document.getElementById('mobilefill-status');
        const isDebug = window.location.search.includes('debug');

        if (!isDebug && statusEl) {
            statusEl.style.display = 'none';
        }

        if (!isDebug || !window.MobileFillEventBus) {
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
