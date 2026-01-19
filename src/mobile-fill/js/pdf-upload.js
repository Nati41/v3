(function() {
    'use strict';

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; PDF upload disabled');
            return;
        }

        const input = document.getElementById('mobilefill-pdf-input');
        if (!input) {
            console.warn('[MobileFill] PDF input missing; upload disabled');
            return;
        }

        input.addEventListener('change', handleFileSelect);
        window.MobileFillEventBus.on('PDF_LOADED', () => toggleOverlay(false));
        window.MobileFillEventBus.on('PDF_LOAD_ERROR', () => toggleOverlay(true));
        window.MobileFillEventBus.on('SESSION_RESET', () => toggleOverlay(true));

        toggleOverlay(true);
    }

    async function handleFileSelect(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        window.MobileFillEventBus.emit('SESSION_RESET');
        window.MobileFillEventBus.emit('PDF_LOAD_STARTED', { name: file.name });

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfBytesSafe = new Uint8Array(arrayBuffer);
            const pdfBytesSafeForExport = new Uint8Array(arrayBuffer.slice(0));
            window.MobileFillEventBus.emit('PDF_LOADED', {
                pdfBytesSafe,
                pdfBytesSafeForExport,
                pageCount: null
            });
        } catch (error) {
            window.MobileFillEventBus.emit('PDF_LOAD_ERROR', {
                error: error?.message || 'PDF upload failed'
            });
        } finally {
            event.target.value = '';
        }
    }

    function toggleOverlay(show) {
        const overlay = document.getElementById('mobilefill-upload-overlay');
        if (!overlay) return;
        overlay.classList.toggle('is-hidden', !show);
    }

    window.MobileFillPdfUpload = { init };
})();
