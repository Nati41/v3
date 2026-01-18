(function() {
    'use strict';

    function init() {
        if (!window.MobileFillEventBus || !window.MobileFillStateStore) {
            console.warn('[MobileFill] EventBus or StateStore missing; preview renderer disabled');
            return;
        }

        window.MobileFillEventBus.on('FIELD_UPDATED', (payload) => {
            renderField(payload?.fieldId);
        });
    }

    function renderField(fieldId) {
        if (!fieldId) return;
        if (!window.PreviewTextRenderer) {
            console.warn('[MobileFill] PreviewTextRenderer missing; preview skipped');
            return;
        }

        const state = window.MobileFillStateStore.state;
        const mapping = state.mappingState.fieldsMapping;
        const fields = mapping?.fields || [];
        const field = fields.find((item) => (item.id || item.fieldId) === fieldId);
        if (!field) return;

        const layer = findHotspotLayer(field.page || 1);
        if (!layer) return;

        const hotspot = layer.querySelector(`.mobilefill-hotspot[data-field-id="${fieldId}"]`);
        if (!hotspot) return;

        const entry = state.liveFillState.liveFillData.fields?.[fieldId];
        const value = entry?.value ?? '';

        renderPreviewIntoHotspot(hotspot, value, field, field.page || 1);
    }

    function findHotspotLayer(pageNum) {
        return document.querySelector(`.mobilefill-hotspot-layer[data-page-num="${pageNum}"]`);
    }

    function renderPreviewIntoHotspot(hotspot, value, field, pageNum) {
        const viewport = window.MobileFillStateStore.state.viewerState.pageViewports?.[pageNum];
        const canvasSize = window.MobileFillStateStore.state.viewerState.canvasSize?.[pageNum];
        if (!viewport || !canvasSize) return;

        const fieldPt = getFieldPt(field, viewport);
        if (!fieldPt) return;

        const scale = canvasSize.width / viewport.width;

        hotspot.innerHTML = '';
        hotspot.style.position = 'absolute';
        hotspot.style.overflow = 'hidden';

        window.PreviewTextRenderer.render(hotspot, value, {
            fieldPt,
            scale,
            style: field.style || {}
        });
    }

    function getFieldPt(field, viewport) {
        if (field.pdfWidth !== undefined && field.pdfHeight !== undefined) {
            return {
                width: field.pdfWidth,
                height: field.pdfHeight
            };
        }

        if (Array.isArray(field.bbox) && field.bbox.length === 4) {
            const [xPct, yPct, wPct, hPct] = field.bbox;
            return {
                width: wPct * viewport.width,
                height: hPct * viewport.height
            };
        }

        return null;
    }

    window.MobileFillLivePreviewRenderer = { init };
})();
