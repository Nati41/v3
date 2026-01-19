(function() {
    'use strict';

    const MOBILE_HOTSPOT_Y_OFFSET_PX = 3;
    const DEFAULT_FIELD_WIDTH_PX = 140;
    const DEFAULT_FIELD_HEIGHT_PX = 36;
    const DRAG_THRESHOLD_PX = 6;
    const TAP_MAX_DURATION_MS = 280;
    const LONG_PRESS_MS = 450;
    const KEYBOARD_SAFE_OFFSET_PX = 80;

    let pageViewports = null;
    let canvasSize = null;
    let activeEditor = null;
    let activeTypePicker = null;
    let drawingState = null;

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; QuickFill editor disabled');
            return;
        }

        window.MobileFillEventBus.on('VIEWER_RENDER_DONE', (payload) => {
            pageViewports = payload?.pageViewports || null;
            canvasSize = payload?.canvasSize || null;
            renderIfReady();
        });

        window.MobileFillEventBus.on('FIELD_CREATED', renderIfReady);
        window.MobileFillEventBus.on('FIELD_REMOVED', renderIfReady);
        window.MobileFillEventBus.on('FIELD_TYPE_CHANGED', renderIfReady);
        window.MobileFillEventBus.on('FIELD_UPDATED', renderIfReady);

        window.MobileFillEventBus.on('PDF_LOAD_STARTED', () => {
            clearOverlays();
        });

        const container = document.getElementById('mobilefill-pdf-container');
        if (container) {
            container.addEventListener('pointerdown', handlePointerDown);
            container.addEventListener('pointermove', handlePointerMove);
            container.addEventListener('pointerup', handlePointerUp);
            container.addEventListener('pointercancel', handlePointerUp);
        }

        document.addEventListener('click', handleDocumentClick, true);
    }

    function renderIfReady() {
        if (!pageViewports || !canvasSize) return;
        clearOverlays();
        renderFieldHotspots();
        window.MobileFillEventBus.emit('HOTSPOTS_READY');
    }

    function clearOverlays() {
        document.querySelectorAll('.mobilefill-hotspot-layer').forEach((layer) => layer.remove());
        if (drawingState?.rectEl) {
            drawingState.rectEl.remove();
        }
        drawingState = null;
        activeEditor = null;
        removeTypePicker();
    }

    function renderFieldHotspots() {
        const fields = window.MobileFillStateStore?.state?.quickFillState?.fields || [];
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

                attachHotspotHandlers(hotspot, field);
                overlay.appendChild(hotspot);
            });
        });
    }

    function attachHotspotHandlers(hotspot, field) {
        const fieldId = field.id || field.fieldId;
        let longPressTimer = null;
        let moved = false;

        const onPointerDown = (event) => {
            event.stopPropagation();
            moved = false;
            setActiveHotspot(hotspot);
            if (activeEditor && activeEditor.hotspot !== hotspot) {
                cleanupInlineEdit(activeEditor.hotspot);
            }
            removeTypePicker();

            longPressTimer = setTimeout(() => {
                showTypePicker(hotspot, field);
            }, LONG_PRESS_MS);
        };

        const onPointerMove = () => {
            moved = true;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        const onPointerUp = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (moved || activeTypePicker) return;

            const fieldType = field.type || 'text';
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
        };

        hotspot.addEventListener('pointerdown', onPointerDown);
        hotspot.addEventListener('pointermove', onPointerMove);
        hotspot.addEventListener('pointerup', onPointerUp);
        hotspot.addEventListener('pointercancel', onPointerUp);
    }

    function handlePointerDown(event) {
        if (event.button && event.button !== 0) return;
        if (event.target.closest('.mobilefill-hotspot')) return;
        if (!pageViewports || !canvasSize) return;

        const pageInfo = getPageInfoFromPoint(event.clientX, event.clientY);
        if (!pageInfo) return;

        drawingState = {
            startX: event.clientX,
            startY: event.clientY,
            pageNum: pageInfo.pageNum,
            pageRect: pageInfo.pageRect,
            wrapper: pageInfo.wrapper,
            startTime: Date.now(),
            rectEl: null,
            moved: false
        };
    }

    function handlePointerMove(event) {
        if (!drawingState) return;
        const dx = event.clientX - drawingState.startX;
        const dy = event.clientY - drawingState.startY;
        const distance = Math.hypot(dx, dy);
        if (distance < DRAG_THRESHOLD_PX) return;

        drawingState.moved = true;

        if (!drawingState.rectEl) {
            const rectEl = document.createElement('div');
            rectEl.className = 'mobilefill-draw-rect';
            drawingState.rectEl = rectEl;
            drawingState.wrapper.appendChild(rectEl);
        }

        const rect = getRectFromPoints(drawingState.startX, drawingState.startY, event.clientX, event.clientY, drawingState.pageRect);
        if (!rect) return;

        applyRectToElement(drawingState.rectEl, rect);
    }

    function handlePointerUp(event) {
        if (!drawingState) return;

        const duration = Date.now() - drawingState.startTime;
        const rectEl = drawingState.rectEl;
        const pageRect = drawingState.pageRect;
        const pageNum = drawingState.pageNum;

        if (drawingState.moved && rectEl) {
            const rect = rectEl.getBoundingClientRect();
            const relativeRect = {
                x: rect.left - pageRect.left,
                y: rect.top - pageRect.top,
                width: rect.width,
                height: rect.height
            };
            rectEl.remove();
            drawingState = null;
            createFieldFromRect(pageNum, relativeRect);
            return;
        }

        if (!drawingState.moved && duration <= TAP_MAX_DURATION_MS) {
            const relativeRect = getDefaultRect(event.clientX, event.clientY, pageRect);
            drawingState = null;
            createFieldFromRect(pageNum, relativeRect);
            return;
        }

        if (rectEl) rectEl.remove();
        drawingState = null;
    }

    function getPageInfoFromPoint(clientX, clientY) {
        const pages = Array.from(document.querySelectorAll('.mobilefill-page'));
        for (const wrapper of pages) {
            const rect = wrapper.getBoundingClientRect();
            if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
                return { wrapper, pageRect: rect, pageNum: Number(wrapper.dataset.pageNum || 1) };
            }
        }
        return null;
    }

    function getRectFromPoints(startX, startY, endX, endY, pageRect) {
        const left = Math.min(startX, endX);
        const right = Math.max(startX, endX);
        const top = Math.min(startY, endY);
        const bottom = Math.max(startY, endY);
        const width = right - left;
        const height = bottom - top;
        if (width < 6 || height < 6) return null;

        return {
            x: clamp(left - pageRect.left, 0, pageRect.width),
            y: clamp(top - pageRect.top, 0, pageRect.height),
            width: clamp(width, 6, pageRect.width),
            height: clamp(height, 6, pageRect.height)
        };
    }

    function getDefaultRect(clientX, clientY, pageRect) {
        const halfW = DEFAULT_FIELD_WIDTH_PX / 2;
        const halfH = DEFAULT_FIELD_HEIGHT_PX / 2;
        const x = clamp(clientX - pageRect.left - halfW, 0, pageRect.width - DEFAULT_FIELD_WIDTH_PX);
        const y = clamp(clientY - pageRect.top - halfH, 0, pageRect.height - DEFAULT_FIELD_HEIGHT_PX);
        return {
            x,
            y,
            width: DEFAULT_FIELD_WIDTH_PX,
            height: DEFAULT_FIELD_HEIGHT_PX
        };
    }

    function applyRectToElement(el, rect) {
        el.style.left = `${rect.x}px`;
        el.style.top = `${rect.y}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
    }

    function createFieldFromRect(pageNum, rect) {
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        const viewport = pageViewports?.[pageNum];
        const pageCanvas = canvasSize?.[pageNum];
        if (!viewport || !pageCanvas) return;

        const baseWidth = viewport.width;
        const baseHeight = viewport.height;
        const pdfX = (rect.x / pageCanvas.width) * baseWidth;
        const pdfWidth = (rect.width / pageCanvas.width) * baseWidth;
        const pdfHeight = (rect.height / pageCanvas.height) * baseHeight;
        const pdfY = baseHeight - ((rect.y + rect.height) / pageCanvas.height) * baseHeight;

        const xPct = pdfX / baseWidth;
        const yPct = pdfY / baseHeight;
        const wPct = pdfWidth / baseWidth;
        const hPct = pdfHeight / baseHeight;

        const id = `mf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const field = {
            id,
            type: 'text',
            page: pageNum,
            bbox: [xPct, yPct, wPct, hPct],
            pdfX,
            pdfY,
            pdfWidth,
            pdfHeight
        };

        window.MobileFillEventBus.emit('FIELD_CREATED', { field });
        window.MobileFillEventBus.emit('FIELD_UPDATED', {
            fieldId: id,
            value: '',
            checked: null,
            tableContext: null
        });

        const wrapper = document.querySelector(`.mobilefill-page[data-page-num="${pageNum}"]`);
        if (wrapper) {
            const hotspot = wrapper.querySelector(`.mobilefill-hotspot[data-field-id="${id}"]`);
            if (hotspot) {
                startInlineEdit(field, hotspot);
            }
        }
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

        if (field.bbox && Array.isArray(field.bbox)) {
            const [xPct, yPct, wPct, hPct] = field.bbox;
            const pdfX = xPct * baseWidth;
            const pdfY = yPct * baseHeight;
            const pdfWidth = wPct * baseWidth;
            const pdfHeight = hPct * baseHeight;
            const x = pdfX * scaleX;
            const y = (baseHeight - pdfY - pdfHeight) * scaleY - MOBILE_HOTSPOT_Y_OFFSET_PX;
            const width = pdfWidth * scaleX;
            const height = pdfHeight * scaleY;
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
        removeTypePicker();

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
        // REMOVED: clampHotspotIntoView(hotspot) - causes document jumps during keyboard open
        // User controls scroll manually - no auto-scroll during inline edit
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
        if (activeTypePicker && !activeTypePicker.contains(event.target)) {
            removeTypePicker();
        }
        if (!activeEditor?.input) return;
        const editorHotspot = activeEditor.hotspot;
        if (!editorHotspot || editorHotspot.contains(event.target)) return;
        finalizeEdit(activeEditor.fieldId, activeEditor.input.value);
    }

    function showTypePicker(hotspot, field) {
        removeTypePicker();

        const picker = document.createElement('div');
        picker.className = 'mobilefill-type-picker';

        const makeButton = (label, type) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mobilefill-type-btn';
            btn.textContent = label;
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                switchFieldType(field, type);
                removeTypePicker();
            });
            return btn;
        };

        picker.appendChild(makeButton('טקסט', 'text'));
        picker.appendChild(makeButton('✓', 'checkbox'));
        picker.appendChild(makeButton('●', 'radio'));

        hotspot.appendChild(picker);
        activeTypePicker = picker;
    }

    function removeTypePicker() {
        if (activeTypePicker) {
            activeTypePicker.remove();
            activeTypePicker = null;
        }
    }

    function switchFieldType(field, type) {
        const fieldId = field.id || field.fieldId;
        if (!fieldId) return;

        window.MobileFillEventBus.emit('FIELD_TYPE_CHANGED', {
            fieldId,
            type
        });

        if (type === 'text') {
            window.MobileFillEventBus.emit('FIELD_UPDATED', {
                fieldId,
                value: getFieldValue(fieldId) || '',
                checked: null,
                tableContext: null
            });
            return;
        }

        window.MobileFillEventBus.emit('FIELD_UPDATED', {
            fieldId,
            value: null,
            checked: Boolean(getFieldChecked(fieldId)),
            tableContext: null
        });
    }

    function getFieldChecked(fieldId) {
        const state = window.MobileFillStateStore?.state;
        const entry = state?.liveFillState?.liveFillData?.[fieldId];
        return Boolean(entry?.checked);
    }

    function getFieldValue(fieldId) {
        const state = window.MobileFillStateStore?.state;
        const entry = state?.liveFillState?.liveFillData?.[fieldId];
        return entry?.value ? String(entry.value) : '';
    }

    function uncheckRadioSiblings(field) {
        const groupKey = getRadioGroupKey(field);
        if (!groupKey) return;

        const fields = window.MobileFillStateStore?.state?.quickFillState?.fields || [];
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
            field.id ||
            field.fieldId ||
            null;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    window.MobileFillQuickFillEditor = { init };
})();
