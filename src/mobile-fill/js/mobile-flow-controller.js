(function() {
    'use strict';

    const FlowController = {
        init() {
            if (!window.MobileFillEventBus || !window.MobileFillStateStore) {
                console.warn('[MobileFill] Missing EventBus or StateStore');
                return;
            }

            const { on } = window.MobileFillEventBus;
            const { state } = window.MobileFillStateStore;

            on('SESSION_RESET', () => {
                state.documentState.pdfBytesSafe = null;
                state.documentState.pdfBytesSafeForExport = null;
                state.documentState.pdfJsDoc = null;
                state.documentState.pdfLoadStatus = 'idle';
                state.documentState.pdfError = null;
                state.documentState.pageCount = null;

                state.quickFillState.fields = [];
                state.quickFillState.activeFieldId = null;

                state.liveFillState.liveFillData = {};
                state.liveFillState.dirty = false;
                state.liveFillState.lastChangedAt = null;

                state.viewerState.renderScale = null;
                state.viewerState.currentZoom = null;
                state.viewerState.activePage = null;
                state.viewerState.pageViewports = {};
                state.viewerState.canvasSize = {};

                state.uiState.hotspotsReady = false;

                state.exportState.exportStatus = 'idle';
                state.exportState.exportError = null;
                state.exportState.lastExportAt = null;
                state.exportState.exportFileName = null;
            });

            on('PDF_LOAD_STARTED', () => {
                state.documentState.pdfLoadStatus = 'loading';
                state.documentState.pdfError = null;
            });

            on('PDF_LOADED', (payload) => {
                state.documentState.pdfBytesSafe = payload?.pdfBytesSafe || null;
                state.documentState.pdfBytesSafeForExport = payload?.pdfBytesSafeForExport || null;
                state.documentState.pdfJsDoc = payload?.pdfJsDoc || null;
                state.documentState.pageCount = payload?.pageCount ?? null;
                state.documentState.pdfLoadStatus = 'ready';
                state.documentState.pdfError = null;
            });

            on('PDF_LOAD_ERROR', (payload) => {
                state.documentState.pdfLoadStatus = 'error';
                state.documentState.pdfError = payload?.error ? String(payload.error) : 'PDF load failed';
            });

            on('VIEWER_RENDER_STARTED', (payload) => {
                state.viewerState.renderScale = payload?.renderScale ?? null;
                state.viewerState.currentZoom = payload?.currentZoom ?? null;
            });

            on('VIEWER_RENDER_DONE', (payload) => {
                state.viewerState.pageViewports = payload?.pageViewports || {};
                state.viewerState.canvasSize = payload?.canvasSize || {};
            });

            on('HOTSPOTS_READY', () => {
                state.uiState.hotspotsReady = true;
            });

            on('FIELD_CREATED', (payload) => {
                if (!payload?.field) return;
                state.quickFillState.fields.push(payload.field);
            });

            on('FIELD_REMOVED', (payload) => {
                const fieldId = payload?.fieldId;
                if (!fieldId) return;
                state.quickFillState.fields = state.quickFillState.fields.filter((field) => {
                    return (field.id || field.fieldId) !== fieldId;
                });
            });

            on('FIELD_TYPE_CHANGED', (payload) => {
                const fieldId = payload?.fieldId;
                if (!fieldId) return;
                const field = state.quickFillState.fields.find((item) => {
                    return (item.id || item.fieldId) === fieldId;
                });
                if (field) {
                    field.type = payload?.type || field.type || 'text';
                }
            });

            on('FIELD_UPDATED', (payload) => {
                const fieldId = payload?.fieldId;
                if (!fieldId) return;

                const value = payload?.value;
                const checked = payload?.checked;

                state.liveFillState.liveFillData[fieldId] = {
                    value,
                    checked
                };
                state.liveFillState.dirty = true;
                state.liveFillState.lastChangedAt = Date.now();
            });

            on('EXPORT_STARTED', () => {
                state.exportState.exportStatus = 'running';
                state.exportState.exportError = null;
            });

            on('EXPORT_DONE', (payload) => {
                state.exportState.exportStatus = 'done';
                state.exportState.exportError = null;
                state.exportState.lastExportAt = Date.now();
                state.exportState.exportFileName = payload?.fileName || null;
                state.liveFillState.dirty = false;
            });

            on('EXPORT_ERROR', (payload) => {
                state.exportState.exportStatus = 'error';
                state.exportState.exportError = payload?.error ? String(payload.error) : 'Export failed';
            });
        }
    };

    window.MobileFillFlowController = FlowController;
})();
