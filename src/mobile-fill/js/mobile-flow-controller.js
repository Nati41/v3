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

            on('CATALOG_LOAD_STARTED', (payload) => {
                state.catalogState.isCatalogLoading = true;
                state.catalogState.catalogError = null;
                state.catalogState.catalog = null;
            });

            on('CATALOG_LOAD_SUCCESS', (payload) => {
                state.catalogState.catalog = payload?.catalog || null;
                state.catalogState.isCatalogLoading = false;
                state.catalogState.catalogError = null;
            });

            on('CATALOG_LOAD_ERROR', (payload) => {
                state.catalogState.isCatalogLoading = false;
                state.catalogState.catalogError = payload?.error ? String(payload.error) : 'Catalog load failed';
            });

            on('FORM_SELECTED', (payload) => {
                state.selectionState.selectedFormId = payload?.formId || null;
                state.selectionState.selectedForm = payload?.form || null;
                state.uiState.screen = 'viewer';
            });

            on('FORM_DESELECTED', () => {
                state.selectionState.selectedFormId = null;
                state.selectionState.selectedForm = null;

                state.documentState.pdfBytesSafe = null;
                state.documentState.pdfBytesSafeForExport = null;
                state.documentState.pdfJsDoc = null;
                state.documentState.pdfLoadStatus = 'idle';
                state.documentState.pdfError = null;
                state.documentState.pageCount = null;

                state.mappingState.fieldsMapping = null;
                state.mappingState.mappingLoadStatus = 'idle';
                state.mappingState.mappingError = null;
                state.mappingState.normalized = false;

                state.liveFillState.liveFillData.fields = {};
                state.liveFillState.liveFillData.tables = {};
                state.liveFillState.dirty = false;
                state.liveFillState.lastChangedAt = null;

                state.viewerState.renderScale = null;
                state.viewerState.currentZoom = null;
                state.viewerState.activePage = null;
                state.viewerState.pageViewports = {};
                state.viewerState.canvasSize = {};

                state.uiState.screen = 'list';
                state.uiState.isPopoverOpen = false;
                state.uiState.activeFieldId = null;
                state.uiState.activeTableContext = null;
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

            on('MAPPING_LOAD_STARTED', () => {
                state.mappingState.mappingLoadStatus = 'loading';
                state.mappingState.mappingError = null;
            });

            on('MAPPING_READY', (payload) => {
                state.mappingState.fieldsMapping = payload?.fieldsMapping || null;
                state.mappingState.mappingLoadStatus = 'ready';
                state.mappingState.mappingError = null;
                state.mappingState.normalized = Boolean(payload?.normalized);
            });

            on('MAPPING_LOAD_ERROR', (payload) => {
                state.mappingState.mappingLoadStatus = 'error';
                state.mappingState.mappingError = payload?.error ? String(payload.error) : 'Mapping load failed';
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

            on('FIELD_FOCUS_REQUESTED', (payload) => {
                state.uiState.activeFieldId = payload?.fieldId || null;
                state.uiState.activeTableContext = payload?.tableContext || null;
                state.uiState.isPopoverOpen = true;
            });

            on('POPOVER_OPENED', () => {
                state.uiState.isPopoverOpen = true;
            });

            on('POPOVER_CLOSED', () => {
                state.uiState.isPopoverOpen = false;
                state.uiState.activeFieldId = null;
                state.uiState.activeTableContext = null;
            });

            on('FIELD_UPDATED', (payload) => {
                const fieldId = payload?.fieldId;
                if (!fieldId) return;

                const value = payload?.value;
                const checked = payload?.checked;

                state.liveFillState.liveFillData.fields[fieldId] = {
                    value,
                    checked
                };
                state.liveFillState.dirty = true;
                state.liveFillState.lastChangedAt = Date.now();
            });

            on('TABLE_CELL_UPDATED', (payload) => {
                const tableId = payload?.tableId;
                const rowIndex = payload?.rowIndex;
                const columnKey = payload?.columnKey;

                if (!tableId || rowIndex === undefined || rowIndex === null || !columnKey) return;

                if (!state.liveFillState.liveFillData.tables[tableId]) {
                    state.liveFillState.liveFillData.tables[tableId] = [];
                }
                if (!state.liveFillState.liveFillData.tables[tableId][rowIndex]) {
                    state.liveFillState.liveFillData.tables[tableId][rowIndex] = {};
                }

                state.liveFillState.liveFillData.tables[tableId][rowIndex][columnKey] = payload?.value;
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
