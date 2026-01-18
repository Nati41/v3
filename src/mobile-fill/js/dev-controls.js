(function() {
    'use strict';

    function init() {
        const controls = document.getElementById('mobilefill-controls');
        if (!controls) return;

        const { MobileFillFormCatalogService, MobileFillDemoFormSelector,
            MobileFillMappingLoader, MobileFillPdfViewer, MobileFillHotspotOverlay,
            MobileFillPopoverInputController, MobileFillExportController, MobileFillEventBus,
            MobileFillStateStore } = window;

        controls.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            const action = button.dataset.action;

            if (action === 'load-catalog') {
                MobileFillFormCatalogService?.loadCatalog?.();
            } else if (action === 'select-demo-form') {
                MobileFillDemoFormSelector?.selectFirst?.();
            } else if (action === 'load-pdf') {
                const selectedForm = MobileFillStateStore?.state?.selectionState?.selectedForm || null;
                if (selectedForm && MobileFillEventBus?.emit) {
                    MobileFillEventBus.emit('FORM_SELECTED', {
                        formId: selectedForm.id,
                        form: selectedForm
                    });
                }
            } else if (action === 'load-mapping') {
                const selectedForm = MobileFillStateStore?.state?.selectionState?.selectedForm || null;
                if (selectedForm && MobileFillEventBus?.emit) {
                    MobileFillEventBus.emit('FORM_SELECTED', {
                        formId: selectedForm.id,
                        form: selectedForm
                    });
                }
            } else if (action === 'render-viewer') {
                MobileFillPdfViewer?.render?.();
            } else if (action === 'hotspots-ready') {
                MobileFillHotspotOverlay?.init?.();
            } else if (action === 'open-popover') {
                const mapping = MobileFillStateStore?.state?.mappingState?.fieldsMapping;
                const fields = mapping?.fields || [];
                const firstField = fields[0];
                if (!firstField || !MobileFillEventBus?.emit) return;

                const fieldId = firstField.id || firstField.fieldId;
                if (!fieldId) return;

                MobileFillEventBus.emit('FIELD_FOCUS_REQUESTED', {
                    fieldId,
                    tableContext: null,
                    anchorElement: document.getElementById('mobilefill-status')
                });
            } else if (action === 'export-stub') {
                MobileFillExportController?.exportPdf?.();
            } else if (action === 'form-deselected') {
                MobileFillEventBus?.emit?.('FORM_DESELECTED');
            }
        });
    }

    window.MobileFillDevControls = { init };
})();
