(function() {
    'use strict';

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; export controller disabled');
            return;
        }

        window.MobileFillEventBus.on('EXPORT_STARTED', () => {
            handleExportRequest();
        });
    }

    async function handleExportRequest() {
        if (!window.MobileFillEventBus) {
            return;
        }

        if (!window.MobileFillStateStore || !window.MobileFillExportGate) {
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: 'Export dependencies missing'
            });
            return;
        }

        const state = window.MobileFillStateStore.state;
        const gateResult = window.MobileFillExportGate.canExport(state);

        if (!gateResult.allowed) {
            return;
        }

        if (!window.ExportEngine || typeof window.ExportEngine.export !== 'function') {
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: 'Export engine unavailable'
            });
            return;
        }

        try {
            await window.ExportEngine.export({
                pdfBytesSafe: state.documentState.pdfBytesSafe,
                fieldsMapping: state.mappingState.fieldsMapping,
                liveFillData: state.liveFillState.liveFillData
            });

            window.MobileFillEventBus.emit('EXPORT_DONE', {
                fileName: null
            });
        } catch (error) {
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: error?.message || 'Export failed'
            });
        }
    }

    window.MobileFillExportController = {
        init
    };
})();
