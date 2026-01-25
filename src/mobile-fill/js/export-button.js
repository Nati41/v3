(function() {
    'use strict';

    const WATCH_EVENTS = [
        'PDF_LOADED',
        'PDF_LOAD_ERROR',
        'MAPPING_READY',
        'VIEWER_RENDER_DONE',
        'HOTSPOTS_READY',
        'FIELD_CREATED',
        'FIELD_REMOVED',
        'FIELD_UPDATED',
        'EXPORT_DONE',
        'EXPORT_ERROR'
    ];

    let isLocked = false;

    function init() {
        if (!window.MobileFillEventBus || !window.MobileFillStateStore) {
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

        updateButtonState();
    }

    function updateButtonState() {
        const button = document.getElementById('mobilefill-export-button');
        if (!button) return;

        const state = window.MobileFillStateStore.state;
        const hasPdf = state.documentState.pdfLoadStatus === 'ready';
        // Check mapping fields (from loaded JSON) OR quickFillState fields (from editor)
        const mappingFieldsCount = state.mappingState?.fields?.length || 0;
        const quickFillFieldsCount = state.quickFillState?.fields?.length || 0;
        const fieldsCount = mappingFieldsCount || quickFillFieldsCount;
        const exportRunning = state.exportState.exportStatus === 'running';
        const shouldDisable = isLocked || exportRunning || !hasPdf || fieldsCount === 0;
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
