(function() {
    'use strict';

    async function handleFormSelected(payload) {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; pdf loader disabled');
            return;
        }

        const form = payload?.form;
        const pdfUrl = form?.pdfUrl;

        window.MobileFillEventBus.emit('PDF_LOAD_STARTED');

        if (!pdfUrl) {
            window.MobileFillEventBus.emit('PDF_LOAD_ERROR', {
                error: 'PDF URL missing'
            });
            return;
        }

        try {
            const response = await fetch(pdfUrl, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`PDF request failed (${response.status})`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const pdfBytesSafe = new Uint8Array(arrayBuffer);
            const pdfBytesSafeForExport = new Uint8Array(arrayBuffer.slice(0));

            window.MobileFillEventBus.emit('PDF_LOADED', {
                pdfBytesSafe,
                pdfBytesSafeForExport,
                pageCount: null
            });
        } catch (error) {
            window.MobileFillEventBus.emit('PDF_LOAD_ERROR', {
                error: error?.message || 'PDF load failed'
            });
        }
    }

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; pdf loader disabled');
            return;
        }

        window.MobileFillEventBus.on('FORM_SELECTED', handleFormSelected);
    }

    window.MobileFillPdfLoader = {
        init
    };
})();
