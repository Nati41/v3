(function() {
    'use strict';

    const MOBILE_HOTSPOT_Y_OFFSET_PX = 3;

    let currentMapping = null;
    let pageViewports = null;
    let canvasSize = null;
    let activeEditor = null;
    const KEYBOARD_SAFE_OFFSET_PX = 80;

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

        document.addEventListener('click', handleDocumentClick, true);
    }

    function renderIfReady() {
        if (!currentMapping || !pageViewports || !canvasSize) return;

        clearOverlays();
        renderFieldHotspots();
        window.MobileFillEventBus.emit('HOTSPOTS_READY');
    }

    function clearOverlays() {
        document.querySelectorAll('.mobilefill-hotspot-layer').forEach((layer) => layer.remove());
        activeEditor = null;
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
                    setActiveHotspot(hotspot);

                    if (activeEditor && activeEditor.hotspot !== hotspot) {
                        cleanupInlineEdit(activeEditor.hotspot);
                    }

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

                    startInlineEdit(field, hotspot);
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

    function setActiveHotspot(target) {
        document.querySelectorAll('.mobilefill-hotspot.is-active').forEach((item) => {
            if (item !== target) item.classList.remove('is-active');
        });
        target.classList.add('is-active');
    }

    function startInlineEdit(field, hotspot) {
        const fieldId = field.id || field.fieldId;
        if (!fieldId) return;

        if (activeEditor && activeEditor.hotspot !== hotspot) {
            cleanupInlineEdit(activeEditor.hotspot);
        }

        hotspot.classList.add('is-editing');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'mobilefill-inline-input';
        const initialValue = getFieldValue(fieldId) || '';
        input.value = initialValue;

        const actions = document.createElement('div');
        actions.className = 'mobilefill-inline-actions';

        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'mobilefill-inline-btn done';
        doneBtn.textContent = '✔';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'mobilefill-inline-btn cancel';
        cancelBtn.textContent = '✕';

        actions.appendChild(doneBtn);
        actions.appendChild(cancelBtn);

        input.addEventListener('input', () => {
            window.MobileFillEventBus.emit('FIELD_UPDATED', {
                fieldId,
                value: input.value,
                checked: null,
                tableContext: null
            });
        });

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                finalizeEdit(fieldId, input.value);
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                cancelEdit(fieldId, initialValue);
            }
        });

        input.addEventListener('blur', () => {
            finalizeEdit(fieldId, input.value);
        });

        doneBtn.addEventListener('click', () => {
            finalizeEdit(fieldId, input.value);
        });

        cancelBtn.addEventListener('click', () => {
            cancelEdit(fieldId, initialValue);
        });

        hotspot.innerHTML = '';
        hotspot.appendChild(input);
        hotspot.appendChild(actions);
        clampHotspotIntoView(hotspot);
        input.focus();
        input.select();

        activeEditor = { hotspot, input, fieldId, initialValue };
    }

    function cleanupInlineEdit(hotspot) {
        if (!hotspot) return;
        hotspot.classList.remove('is-editing');
        if (activeEditor?.hotspot === hotspot) {
            activeEditor = null;
        }
    }

    function finalizeEdit(fieldId, value) {
        window.MobileFillEventBus.emit('FIELD_UPDATED', {
            fieldId,
            value,
            checked: null,
            tableContext: null
        });
        if (activeEditor?.hotspot) {
            cleanupInlineEdit(activeEditor.hotspot);
        }
    }

    function cancelEdit(fieldId, value) {
        window.MobileFillEventBus.emit('FIELD_UPDATED', {
            fieldId,
            value,
            checked: null,
            tableContext: null
        });
        if (activeEditor?.hotspot) {
            cleanupInlineEdit(activeEditor.hotspot);
        }
    }

    function clampHotspotIntoView(hotspot) {
        const container = document.getElementById('mobilefill-pdf-container');
        if (!container || !hotspot) return;

        const containerRect = container.getBoundingClientRect();
        const hotspotRect = hotspot.getBoundingClientRect();
        const currentScroll = container.scrollTop;
        const hotspotOffsetTop = hotspotRect.top - containerRect.top + currentScroll;
        const target = Math.max(
            0,
            hotspotOffsetTop - (containerRect.height / 2) + (hotspotRect.height / 2) - KEYBOARD_SAFE_OFFSET_PX
        );
        const maxScroll = Math.max(0, container.scrollHeight - containerRect.height);
        const clamped = Math.min(maxScroll, target);

        container.scrollTo({ top: clamped, behavior: 'smooth' });
    }

    function handleDocumentClick(event) {
        if (!activeEditor?.input) return;
        const editorHotspot = activeEditor.hotspot;
        if (!editorHotspot || editorHotspot.contains(event.target)) return;
        finalizeEdit(activeEditor.fieldId, activeEditor.input.value);
    }

    function getFieldChecked(fieldId) {
        const state = window.MobileFillStateStore?.state;
        const entry = state?.liveFillState?.liveFillData?.fields?.[fieldId];
        return Boolean(entry?.checked);
    }

    function getFieldValue(fieldId) {
        const state = window.MobileFillStateStore?.state;
        const entry = state?.liveFillState?.liveFillData?.fields?.[fieldId];
        return entry?.value ? String(entry.value) : '';
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
