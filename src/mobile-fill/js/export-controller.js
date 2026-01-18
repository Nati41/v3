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

        if (!window.MobileFillStateStore) {
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: 'Export dependencies missing'
            });
            return;
        }

        const state = window.MobileFillStateStore.state;

        if (!window.ExportEngine || typeof window.ExportEngine.export !== 'function') {
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: 'Export engine unavailable'
            });
            return;
        }

        try {
            const pdfBytesSafe = clonePdfBytes(state.documentState.pdfBytesSafe);
            if (!pdfBytesSafe) {
                window.MobileFillEventBus.emit('EXPORT_ERROR', {
                    error: 'PDF bytes missing'
                });
                return;
            }

            const fieldsMapping = state.mappingState.fieldsMapping;
            const liveFillData = state.liveFillState.liveFillData;

            console.log('[MobileFill] Calling ExportEngine.export');
            const { exportResult, capturedBlob } = await runExportWithCapture(() => {
                return window.ExportEngine.export({
                    pdfBytesSafe,
                    fieldsMapping,
                    liveFillData
                });
            });

            const pdfBytes = extractPdfBytes(exportResult);
            if (pdfBytes) {
                downloadPdfBytes(pdfBytes);
            } else if (capturedBlob) {
                downloadPdfBlob(capturedBlob);
            }

            console.log('[MobileFill] Export finished successfully');
            window.MobileFillEventBus.emit('EXPORT_DONE', {
                fileName: null
            });
        } catch (error) {
            console.error('[MobileFill] Export failed:', error);
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: error?.message || 'Export failed'
            });
        }
    }

    async function runExportWithCapture(exportFn) {
        let capturedBlob = null;
        const originalCreateObjectURL = URL.createObjectURL;

        URL.createObjectURL = function(blob) {
            if (blob instanceof Blob) {
                capturedBlob = blob;
            }
            return originalCreateObjectURL.call(URL, blob);
        };

        try {
            const exportResult = await exportFn();
            return { exportResult, capturedBlob };
        } finally {
            URL.createObjectURL = originalCreateObjectURL;
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

    function clonePdfBytes(pdfBytesSafe) {
        if (!pdfBytesSafe) return null;

        if (pdfBytesSafe instanceof Uint8Array) {
            return new Uint8Array(pdfBytesSafe.slice(0));
        }

        if (pdfBytesSafe instanceof ArrayBuffer) {
            return new Uint8Array(pdfBytesSafe.slice(0));
        }

        return null;
    }

    function downloadPdfBytes(pdfBytes) {
        try {
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            downloadPdfBlob(blob);
        } catch (error) {
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: error?.message || 'Download failed'
            });
        }
    }

    function downloadPdfBlob(blob) {
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
