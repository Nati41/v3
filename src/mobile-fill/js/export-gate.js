(function() {
    'use strict';

    function hasFieldValues(fields) {
        if (!fields) return false;

        return Object.values(fields).some((entry) => {
            if (!entry) return false;
            if (entry.value !== undefined && entry.value !== null && entry.value !== '') return true;
            if (entry.checked !== undefined) return true;
            return false;
        });
    }

    function hasTableValues(tables) {
        if (!tables) return false;

        return Object.values(tables).some((rows) => {
            if (!Array.isArray(rows)) return false;
            return rows.some((row) => {
                if (!row) return false;
                return Object.values(row).some((value) => value !== undefined && value !== null && value !== '');
            });
        });
    }

    function canExport(state) {
        if (!state) return { allowed: false, reason: 'State unavailable' };

        if (state.documentState.pdfLoadStatus !== 'ready') {
            return { allowed: false, reason: 'PDF not ready' };
        }

        if (state.mappingState.mappingLoadStatus !== 'ready') {
            return { allowed: false, reason: 'Mapping not ready' };
        }

        const pageViewports = state.viewerState.pageViewports || {};
        if (Object.keys(pageViewports).length === 0) {
            return { allowed: false, reason: 'Viewer not ready' };
        }

        if (state.uiState.hotspotsReady !== true) {
            return { allowed: false, reason: 'Hotspots not ready' };
        }

        const hasValues = hasFieldValues(state.liveFillState.liveFillData.fields) ||
            hasTableValues(state.liveFillState.liveFillData.tables);
        if (!hasValues) {
            return { allowed: false, reason: 'No fields filled' };
        }

        if (state.exportState.exportStatus === 'running') {
            return { allowed: false, reason: 'Export already running' };
        }

        return { allowed: true };
    }

    function init() {
        if (!window.MobileFillEventBus || !window.MobileFillStateStore) {
            console.warn('[MobileFill] EventBus or StateStore missing; export gate disabled');
            return;
        }

        window.MobileFillEventBus.on('EXPORT_STARTED', () => {
            const result = canExport(window.MobileFillStateStore.state);
            if (!result.allowed) {
                console.warn('[ExportTrace] Export blocked by gate:', result.reason);
                window.MobileFillEventBus.emit('EXPORT_BLOCKED', {
                    reason: result.reason || 'Export blocked'
                });
            }
        });
    }

    window.MobileFillExportGate = {
        init,
        canExport
    };
})();
