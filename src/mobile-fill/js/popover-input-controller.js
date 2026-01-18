(function() {
    'use strict';

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; popover controller disabled');
            return;
        }

        window.MobileFillEventBus.on('FIELD_FOCUS_REQUESTED', (payload) => {
            openPopover(payload);
        });
    }

    function openPopover(payload) {
        if (!window.MobileFillEventBus || !window.MobileFillStateStore) {
            console.warn('[MobileFill] EventBus or StateStore missing; popover disabled');
            return;
        }

        const state = window.MobileFillStateStore.state;
        const fieldId = payload?.fieldId || null;
        const tableContext = payload?.tableContext || null;
        if (!fieldId) return;

        const fieldMeta = findFieldMeta(state.mappingState.fieldsMapping, fieldId);
        const currentValue = getCurrentValue(state, fieldId, tableContext);
        const anchorElement = payload?.anchorElement ||
            document.getElementById('mobilefill-status') ||
            document.body;

        const fieldType = fieldMeta?.type || 'text';

        if (fieldType === 'checkbox' || fieldType === 'radio') {
            openChoicePopover({
                anchorElement,
                fieldId,
                fieldMeta,
                checked: getCurrentChecked(state, fieldId, tableContext),
                tableContext,
                fieldType
            });
            return;
        }

        if (!window.FieldInputPopover) {
            console.warn('[MobileFill] FieldInputPopover missing; popover disabled');
            return;
        }

        window.MobileFillEventBus.emit('POPOVER_OPENED');

        window.FieldInputPopover.open({
            anchorElement,
            fieldMeta: fieldMeta || { id: fieldId, type: 'text' },
            currentValue: currentValue || '',
            tableContext,
            onConfirm: (value) => {
                window.MobileFillEventBus.emit('FIELD_UPDATED', {
                    fieldId,
                    value,
                    checked: null,
                    tableContext
                });
                window.MobileFillEventBus.emit('POPOVER_CLOSED');
            },
            onCancel: () => {
                window.MobileFillEventBus.emit('POPOVER_CLOSED');
            }
        });
    }

    function findFieldMeta(fieldsMapping, fieldId) {
        const fields = fieldsMapping?.fields || [];
        return fields.find((field) => (field.id || field.fieldId) === fieldId) || null;
    }

    function getCurrentValue(state, fieldId, tableContext) {
        if (tableContext) {
            const tableId = tableContext.tableId;
            const rowIndex = tableContext.rowIndex;
            const columnKey = tableContext.columnKey;
            return state.liveFillState.liveFillData.tables?.[tableId]?.[rowIndex]?.[columnKey] || '';
        }

        const entry = state.liveFillState.liveFillData.fields?.[fieldId];
        if (!entry) return '';
        if (entry.value !== undefined && entry.value !== null) return entry.value;
        if (entry.checked !== undefined) return entry.checked ? 'true' : 'false';
        return '';
    }

    function getCurrentChecked(state, fieldId, tableContext) {
        if (tableContext) {
            const tableId = tableContext.tableId;
            const rowIndex = tableContext.rowIndex;
            const columnKey = tableContext.columnKey;
            return Boolean(state.liveFillState.liveFillData.tables?.[tableId]?.[rowIndex]?.[columnKey]);
        }

        const entry = state.liveFillState.liveFillData.fields?.[fieldId];
        return Boolean(entry?.checked);
    }

    function openChoicePopover({ anchorElement, fieldId, fieldMeta, checked, tableContext, fieldType }) {
        closeChoicePopover();
        const existingTextPopover = document.getElementById('field-input-popover');
        if (existingTextPopover) {
            existingTextPopover.remove();
        }

        const label = fieldMeta?.label_he || fieldMeta?.label || fieldId;
        const popover = document.createElement('div');
        popover.id = 'mobilefill-choice-popover';
        popover.className = 'field-input-popover mobilefill-choice-popover';
        popover.innerHTML = `
            <div class="popover-header">
                <span class="popover-title">${escapeHtml(label)}</span>
                <button class="popover-close" type="button">✕</button>
            </div>
            <div class="popover-body">
                ${fieldType === 'checkbox' ? `
                    <label class="mobilefill-choice-option">
                        <input type="checkbox" ${checked ? 'checked' : ''}>
                        <span>סמן</span>
                    </label>
                ` : `
                    <label class="mobilefill-choice-option">
                        <input type="radio" name="mobilefill-radio" ${checked ? 'checked' : ''}>
                        <span>בחר</span>
                    </label>
                `}
            </div>
            <div class="popover-footer">
                <button class="popover-btn cancel" type="button">ביטול</button>
                <button class="popover-btn confirm" type="button">✓ אישור</button>
            </div>
        `;

        positionPopover(popover, anchorElement);
        document.body.appendChild(popover);

        const checkbox = popover.querySelector('input');
        const confirmBtn = popover.querySelector('.popover-btn.confirm');
        const cancelBtn = popover.querySelector('.popover-btn.cancel');
        const closeBtn = popover.querySelector('.popover-close');

        window.MobileFillEventBus.emit('POPOVER_OPENED');

        confirmBtn.addEventListener('click', () => {
            const isChecked = Boolean(checkbox?.checked);
            window.MobileFillEventBus.emit('FIELD_UPDATED', {
                fieldId,
                value: null,
                checked: isChecked,
                tableContext
            });
            window.MobileFillEventBus.emit('POPOVER_CLOSED');
            closeChoicePopover();
        });

        cancelBtn.addEventListener('click', () => {
            window.MobileFillEventBus.emit('POPOVER_CLOSED');
            closeChoicePopover();
        });

        closeBtn.addEventListener('click', () => {
            window.MobileFillEventBus.emit('POPOVER_CLOSED');
            closeChoicePopover();
        });

        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 50);
    }

    function positionPopover(popover, anchorElement) {
        const anchorRect = anchorElement.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        popover.style.position = 'absolute';
        popover.style.top = `${anchorRect.bottom + scrollTop + 8}px`;
        popover.style.left = `${anchorRect.left + scrollLeft}px`;
        popover.style.zIndex = '10001';
    }

    function closeChoicePopover() {
        const existing = document.getElementById('mobilefill-choice-popover');
        if (existing) {
            existing.remove();
            document.removeEventListener('click', handleOutsideClick);
        }
    }

    function handleOutsideClick(event) {
        const popover = document.getElementById('mobilefill-choice-popover');
        if (!popover) return;

        if (!popover.contains(event.target)) {
            window.MobileFillEventBus.emit('POPOVER_CLOSED');
            closeChoicePopover();
        }
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.MobileFillPopoverInputController = { init };
})();
