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
            const exportResult = await window.ExportEngine.export({
                pdfBytesSafe: state.documentState.pdfBytesSafe,
                fieldsMapping: state.mappingState.fieldsMapping,
                liveFillData: state.liveFillState.liveFillData
            });

            const pdfBytes = extractPdfBytes(exportResult);
            if (pdfBytes) {
                downloadPdfBytes(pdfBytes);
            }

            window.MobileFillEventBus.emit('EXPORT_DONE', {
                fileName: null
            });
        } catch (error) {
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: error?.message || 'Export failed'
            });
        }
    }

    function extractPdfBytes(exportResult) {
        if (!exportResult) return null;

        if (exportResult instanceof Uint8Array) {
            return exportResult;
        }

        if (exportResult instanceof ArrayBuffer) {
            return new Uint8Array(exportResult);
        }

        if (exportResult.pdfBytes instanceof Uint8Array) {
            return exportResult.pdfBytes;
        }

        if (exportResult.pdfBytes instanceof ArrayBuffer) {
            return new Uint8Array(exportResult.pdfBytes);
        }

        return null;
    }

    function downloadPdfBytes(pdfBytes) {
        try {
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            if (isIOSMobileSafari()) {
                window.location.href = url;
            } else {
                const a = document.createElement('a');
                a.href = url;
                a.download = `filled_form_${Date.now()}.pdf`;
                a.click();
            }

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 2000);
        } catch (error) {
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: error?.message || 'Download failed'
            });
        }
    }

    function isIOSMobileSafari() {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua);
        const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
        return isIOS && isSafari;
    }

    window.MobileFillExportController = {
        init
    };
})();
