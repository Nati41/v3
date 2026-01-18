(function() {
    'use strict';

    let currentMapping = null;
    let pageViewports = null;
    let canvasSize = null;

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; hotspot overlay disabled');
            return;
        }

        window.MobileFillEventBus.on('MAPPING_READY', (payload) => {
            currentMapping = payload?.fieldsMapping || null;
            renderIfReady();
        });

        window.MobileFillEventBus.on('VIEWER_RENDER_DONE', (payload) => {
            pageViewports = payload?.pageViewports || null;
            canvasSize = payload?.canvasSize || null;
            renderIfReady();
        });
    }

    function renderIfReady() {
        if (!currentMapping || !pageViewports || !canvasSize) return;

        clearOverlays();
        renderFieldHotspots();
        window.MobileFillEventBus.emit('HOTSPOTS_READY');
    }

    function clearOverlays() {
        document.querySelectorAll('.mobilefill-hotspot-layer').forEach((layer) => layer.remove());
    }

    function renderFieldHotspots() {
        const fields = currentMapping?.fields || [];
        if (!fields.length) return;

        const fieldsByPage = fields.reduce((acc, field) => {
            const pageNum = field.page || 1;
            if (!acc[pageNum]) acc[pageNum] = [];
            acc[pageNum].push(field);
            return acc;
        }, {});

        Object.keys(fieldsByPage).forEach((pageKey) => {
            const pageNum = Number(pageKey);
            const viewport = pageViewports?.[pageNum];
            const pageCanvasSize = canvasSize?.[pageNum];
            if (!viewport || !pageCanvasSize) return;

            const wrapper = document.querySelector(`.mobilefill-page[data-page-num="${pageNum}"]`);
            if (!wrapper) return;

            const overlay = document.createElement('div');
            overlay.className = 'mobilefill-hotspot-layer';
            overlay.dataset.pageNum = String(pageNum);

            wrapper.appendChild(overlay);

            fieldsByPage[pageNum].forEach((field) => {
                const fieldId = field.id || field.fieldId;
                if (!fieldId) return;

                const hotspot = document.createElement('div');
                hotspot.className = 'mobilefill-hotspot';
                hotspot.dataset.fieldId = fieldId;
                hotspot.dataset.fieldType = field.type || 'text';

                const position = calculateFieldPosition(field, viewport, pageCanvasSize);
                if (!position) return;

                hotspot.style.left = `${position.x}px`;
                hotspot.style.top = `${position.y}px`;
                hotspot.style.width = `${position.width}px`;
                hotspot.style.height = `${position.height}px`;

                hotspot.addEventListener('click', () => {
                    window.MobileFillEventBus.emit('FIELD_FOCUS_REQUESTED', {
                        fieldId,
                        tableContext: null,
                        anchorElement: hotspot
                    });
                });

                overlay.appendChild(hotspot);
            });
        });
    }

    function calculateFieldPosition(field, viewport, pageCanvasSize) {
        const baseWidth = viewport.width;
        const baseHeight = viewport.height;
        const scaleX = pageCanvasSize.width / baseWidth;
        const scaleY = pageCanvasSize.height / baseHeight;

        if (field.pdfX !== undefined && field.pdfY !== undefined &&
            field.pdfWidth !== undefined && field.pdfHeight !== undefined) {
            const x = field.pdfX * scaleX;
            const y = (baseHeight - field.pdfY - field.pdfHeight) * scaleY;
            const width = field.pdfWidth * scaleX;
            const height = field.pdfHeight * scaleY;
            return { x, y, width, height };
        }

        if ((field.type === 'checkbox' || field.type === 'radio') &&
            field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
            const [anchorX, anchorY] = field.anchor;
            const centerX = anchorX * pageCanvasSize.width;
            const centerY = (1 - anchorY) * pageCanvasSize.height;

            let width = field.overlayWidth || 0;
            let height = field.overlayHeight || 0;
            if (width <= 1) width = width * pageCanvasSize.width;
            if (height <= 1) height = height * pageCanvasSize.height;

            const x = centerX - width / 2;
            const y = centerY - height / 2;

            return { x, y, width, height };
        }

        return null;
    }

    window.MobileFillHotspotOverlay = { init };
})();
