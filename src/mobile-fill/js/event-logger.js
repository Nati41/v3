(function() {
    'use strict';

    const eventNames = [
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
        'HOTSPOTS_READY',
        'FIELD_FOCUS_REQUESTED',
        'POPOVER_OPENED',
        'POPOVER_CLOSED',
        'FIELD_UPDATED',
        'TABLE_CELL_UPDATED',
        'PAGE_CHANGED',
        'ZOOM_CHANGED',
        'EXPORT_STARTED',
        'EXPORT_BLOCKED',
        'EXPORT_DONE',
        'EXPORT_ERROR'
    ];

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; logger disabled');
            return;
        }

        eventNames.forEach((eventName) => {
            window.MobileFillEventBus.on(eventName, (payload) => {
                console.log(`[MobileFill] Event: ${eventName}`, payload || null);
            });
        });
    }

    window.MobileFillEventLogger = {
        init
    };
})();
