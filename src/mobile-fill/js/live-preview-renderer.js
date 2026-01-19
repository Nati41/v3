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

        window.MobileFillEventBus.on('VIEWER_RENDER_DONE', () => {
            renderAllFilledFields();
        });

        window.MobileFillEventBus.on('HOTSPOTS_READY', () => {
            renderAllFilledFields();
        });
    }

    function renderField(fieldId, fieldOverride = null) {
        if (!fieldId) return;
        if (!window.PreviewTextRenderer) {
            console.warn('[MobileFill] PreviewTextRenderer missing; preview skipped');
            return;
        }

        const state = window.MobileFillStateStore.state;
        const mapping = state.mappingState.fieldsMapping;
        const fields = mapping?.fields || [];
        const field = fieldOverride || fields.find((item) => (item.id || item.fieldId) === fieldId);
        if (!field) return;

        const layer = findHotspotLayer(field.page || 1);
        if (!layer) return;

        const hotspot = layer.querySelector(`.mobilefill-hotspot[data-field-id="${fieldId}"]`);
        if (!hotspot) return;

        const entry = state.liveFillState.liveFillData.fields?.[fieldId] || {};
        const fieldType = field.type || 'text';

        if (fieldType === 'checkbox' || fieldType === 'radio') {
            renderChoiceIntoHotspot(hotspot, fieldType, Boolean(entry.checked));
            return;
        }

        const value = entry.value ?? '';
        renderPreviewIntoHotspot(hotspot, value, field, field.page || 1);
    }

    function renderAllFilledFields() {
        const state = window.MobileFillStateStore.state;
        const fields = state.mappingState.fieldsMapping?.fields || [];
        fields.forEach((field) => {
            const fieldId = field.id || field.fieldId;
            if (!fieldId) return;
            renderField(fieldId, field);
        });
    }

    function findHotspotLayer(pageNum) {
        return document.querySelector(`.mobilefill-hotspot-layer[data-page-num="${pageNum}"]`);
    }

    function renderPreviewIntoHotspot(hotspot, value, field, pageNum) {
        if (hotspot.classList.contains('is-editing')) {
            return;
        }
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

    function renderChoiceIntoHotspot(hotspot, fieldType, checked) {
        hotspot.innerHTML = '';

        if (!checked) return;

        const symbol = document.createElement('span');
        symbol.className = 'mobilefill-choice-symbol';
        symbol.textContent = fieldType === 'radio' ? '●' : '✓';

        const size = Math.min(hotspot.offsetWidth, hotspot.offsetHeight) * 0.7;
        symbol.style.fontSize = `${size}px`;

        hotspot.appendChild(symbol);
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
