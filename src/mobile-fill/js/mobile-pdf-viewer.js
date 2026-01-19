(function() {
    'use strict';

    let lastPdfBytesSafe = null;
    let resizeTimeout = null;

    async function renderPdf(pdfBytesSafe) {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; viewer disabled');
            return;
        }

        if (!window.pdfjsLib) {
            console.warn('[MobileFill] pdfjsLib missing; viewer disabled');
            return;
        }

        if (!pdfBytesSafe) {
            console.warn('[MobileFill] PDF bytes missing; viewer render skipped');
            return;
        }

        if (isExportRunning()) {
            return;
        }

        const container = document.getElementById('mobilefill-pdf-container');
        if (!container) {
            console.warn('[MobileFill] PDF container missing; viewer render skipped');
            return;
        }

        lastPdfBytesSafe = pdfBytesSafe;

        const renderScale = 1;
        const currentZoom = 1;

        window.MobileFillEventBus.emit('VIEWER_RENDER_STARTED', {
            renderScale,
            currentZoom
        });

        try {
            const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytesSafe });
            const pdfDoc = await loadingTask.promise;
            const pageViewports = {};
            const canvasSize = {};

            container.innerHTML = '';

            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                const baseViewport = page.getViewport({ scale: 1 });
                const containerWidth = container.clientWidth || baseViewport.width;
                const targetScale = containerWidth / baseViewport.width;
                const pixelRatio = window.devicePixelRatio || 1;
                const viewport = page.getViewport({ scale: targetScale * pixelRatio });
                const targetWidth = baseViewport.width * targetScale;
                const targetHeight = baseViewport.height * targetScale;

                const wrapper = document.createElement('div');
                wrapper.className = 'mobilefill-page';
                wrapper.dataset.pageNum = String(pageNum);
                wrapper.style.width = '100%';
                wrapper.style.height = `${targetHeight}px`;

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');

                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.width = '100%';
                canvas.style.height = '100%';

                await page.render({ canvasContext: context, viewport }).promise;

                wrapper.appendChild(canvas);
                container.appendChild(wrapper);

                pageViewports[pageNum] = baseViewport;
                canvasSize[pageNum] = {
                    width: targetWidth,
                    height: targetHeight
                };
            }

            container.scrollLeft = 0;

            window.MobileFillEventBus.emit('VIEWER_RENDER_DONE', {
                pageViewports,
                canvasSize
            });
        } catch (error) {
            console.warn('[MobileFill] Viewer render failed:', error);
        }
    }

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; viewer disabled');
            return;
        }

        window.MobileFillEventBus.on('PDF_LOADED', (payload) => {
            renderPdf(payload?.pdfBytesSafe);
        });

        window.addEventListener('resize', () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }

            resizeTimeout = setTimeout(() => {
                if (lastPdfBytesSafe) {
                    if (isExportRunning()) {
                        return;
                    }
                    renderPdf(lastPdfBytesSafe);
                }
            }, 150);
        });
    }

    function render() {
        renderPdf(window.MobileFillStateStore?.state?.documentState?.pdfBytesSafe || null);
    }

    function isExportRunning() {
        const status = window.MobileFillStateStore?.state?.exportState?.exportStatus;
        return status === 'running';
    }

    window.MobileFillPdfViewer = {
        init,
        render
    };
})();
