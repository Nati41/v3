(function() {
    'use strict';

    const WATCH_EVENTS = [
        'PDF_LOADED',
        'PDF_LOAD_ERROR',
        'MAPPING_READY',
        'MAPPING_LOAD_ERROR',
        'VIEWER_RENDER_DONE',
        'HOTSPOTS_READY',
        'FIELD_UPDATED',
        'TABLE_CELL_UPDATED',
        'EXPORT_STARTED',
        'EXPORT_DONE',
        'EXPORT_ERROR'
    ];

    function init() {
        if (!window.MobileFillEventBus || !window.MobileFillExportGate || !window.MobileFillStateStore) {
            console.warn('[MobileFill] Export button dependencies missing');
            return;
        }

        const button = document.getElementById('mobilefill-export-button');
        if (!button) return;

        button.addEventListener('click', () => {
            window.MobileFillEventBus.emit('EXPORT_STARTED');
        });

        WATCH_EVENTS.forEach((eventName) => {
            window.MobileFillEventBus.on(eventName, updateButtonState);
        });

        updateButtonState();
    }

    function updateButtonState() {
        const button = document.getElementById('mobilefill-export-button');
        if (!button) return;

        const state = window.MobileFillStateStore.state;
        const result = window.MobileFillExportGate.canExport(state);

        if (result.allowed) {
            button.classList.remove('is-disabled');
            button.setAttribute('aria-disabled', 'false');
        } else {
            button.classList.add('is-disabled');
            button.setAttribute('aria-disabled', 'true');
        }
    }

    window.MobileFillExportButton = { init };
})();
