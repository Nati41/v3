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
        if (!window.FieldInputPopover) {
            console.warn('[MobileFill] FieldInputPopover missing; popover disabled');
            return;
        }

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

    window.MobileFillPopoverInputController = { init };
})();
