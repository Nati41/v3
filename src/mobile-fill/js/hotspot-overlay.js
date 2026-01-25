(function() {
    'use strict';

    const MOBILE_HOTSPOT_Y_OFFSET_PX = 3;

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

        // Listen for highlight requests from input panel
        window.MobileFillEventBus.on('FIELD_HIGHLIGHT', handleFieldHighlight);
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

                hotspot.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const fieldType = field.type || 'text';

                    // Checkbox toggle
                    if (fieldType === 'checkbox') {
                        const nextChecked = !getFieldChecked(fieldId);
                        window.MobileFillEventBus.emit('FIELD_UPDATED', {
                            fieldId,
                            value: null,
                            checked: nextChecked,
                            tableContext: null
                        });
                        return;
                    }

                    // Radio toggle
                    if (fieldType === 'radio') {
                        uncheckRadioSiblings(field);
                        window.MobileFillEventBus.emit('FIELD_UPDATED', {
                            fieldId,
                            value: null,
                            checked: true,
                            tableContext: null
                        });
                        return;
                    }

                    // Text/number/date fields - emit FIELD_TAP for input panel
                    window.MobileFillEventBus.emit('FIELD_TAP', {
                        fieldId,
                        field
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
            const y = (baseHeight - field.pdfY - field.pdfHeight) * scaleY - MOBILE_HOTSPOT_Y_OFFSET_PX;
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
            const y = centerY - height / 2 - MOBILE_HOTSPOT_Y_OFFSET_PX;

            return { x, y, width, height };
        }

        return null;
    }

    function handleFieldHighlight(payload) {
        const { fieldId, active } = payload || {};
        if (!fieldId) return;

        // Remove highlight from all hotspots
        document.querySelectorAll('.mobilefill-hotspot.is-active').forEach((hotspot) => {
            hotspot.classList.remove('is-active');
        });

        // Add highlight to target hotspot if active
        if (active) {
            const hotspot = document.querySelector(`.mobilefill-hotspot[data-field-id="${fieldId}"]`);
            if (hotspot) {
                hotspot.classList.add('is-active');
            }
        }
    }

    function getFieldChecked(fieldId) {
        const state = window.MobileFillStateStore?.state;
        const entry = state?.liveFillState?.liveFillData?.[fieldId];
        return Boolean(entry?.checked);
    }

    function uncheckRadioSiblings(field) {
        const groupKey = getRadioGroupKey(field);
        if (!groupKey) return;

        const fields = currentMapping?.fields || [];
        fields.forEach((item) => {
            const itemId = item.id || item.fieldId;
            if (!itemId || itemId === (field.id || field.fieldId)) return;
            if ((item.type || 'text') !== 'radio') return;

            const itemGroupKey = getRadioGroupKey(item);
            if (itemGroupKey !== groupKey) return;

            window.MobileFillEventBus.emit('FIELD_UPDATED', {
                fieldId: itemId,
                value: null,
                checked: false,
                tableContext: null
            });
        });
    }

    function getRadioGroupKey(field) {
        return field.groupId ||
            field.group ||
            field.group_id ||
            field.entity_id ||
            field.section_id ||
            field.rules?.part_of_group ||
            null;
    }

    window.MobileFillHotspotOverlay = { init };
})();
