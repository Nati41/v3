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
        'EXPORT_DONE',
        'EXPORT_ERROR',
        'EXPORT_BLOCKED'
    ];

    let isLocked = false;

    function init() {
        if (!window.MobileFillEventBus || !window.MobileFillExportGate || !window.MobileFillStateStore) {
            console.warn('[MobileFill] Export button dependencies missing');
            return;
        }

        const button = document.getElementById('mobilefill-export-button');
        if (!button) return;

        button.addEventListener('click', () => {
            if (isLocked) return;

            lockButton();
            window.MobileFillEventBus.emit('EXPORT_STARTED');
        });

        WATCH_EVENTS.forEach((eventName) => {
            window.MobileFillEventBus.on(eventName, updateButtonState);
        });

        window.MobileFillEventBus.on('EXPORT_DONE', unlockButton);
        window.MobileFillEventBus.on('EXPORT_ERROR', unlockButton);
        window.MobileFillEventBus.on('EXPORT_BLOCKED', unlockButton);

        updateButtonState();
    }

    function updateButtonState() {
        const button = document.getElementById('mobilefill-export-button');
        if (!button) return;

        const state = window.MobileFillStateStore.state;
        const result = window.MobileFillExportGate.canExport(state);

        const shouldDisable = isLocked || !result.allowed;
        button.classList.toggle('is-disabled', shouldDisable);
        button.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    }

    function lockButton() {
        const button = document.getElementById('mobilefill-export-button');
        if (!button) return;

        isLocked = true;
        button.classList.add('is-disabled');
        button.setAttribute('aria-disabled', 'true');
    }

    function unlockButton() {
        const button = document.getElementById('mobilefill-export-button');
        if (!button) return;

        isLocked = false;
        updateButtonState();
    }

    window.MobileFillExportButton = { init };
})();
