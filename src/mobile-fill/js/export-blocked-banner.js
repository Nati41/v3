(function() {
    'use strict';

    function showReason(reason) {
        const banner = document.getElementById('export-blocked-banner');
        if (!banner) return;

        banner.textContent = reason || 'Export blocked';
        banner.classList.add('visible');
    }

    function hideBanner() {
        const banner = document.getElementById('export-blocked-banner');
        if (!banner) return;

        banner.textContent = '';
        banner.classList.remove('visible');
    }

    function maybeClearOnStateChange() {
        if (!window.MobileFillExportGate || !window.MobileFillStateStore) return;

        const result = window.MobileFillExportGate.canExport(window.MobileFillStateStore.state);
        if (result.allowed) {
            hideBanner();
        }
    }

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; export blocked banner disabled');
            return;
        }

        window.MobileFillEventBus.on('EXPORT_BLOCKED', (payload) => {
            showReason(payload?.reason);
        });

        window.MobileFillEventBus.on('EXPORT_DONE', hideBanner);

        [
            'PDF_LOADED',
            'MAPPING_READY',
            'VIEWER_RENDER_DONE',
            'HOTSPOTS_READY',
            'FIELD_UPDATED',
            'TABLE_CELL_UPDATED',
            'EXPORT_ERROR'
        ].forEach((eventName) => {
            window.MobileFillEventBus.on(eventName, maybeClearOnStateChange);
        });
    }

    window.MobileFillExportBlockedBanner = {
        init
    };
})();
