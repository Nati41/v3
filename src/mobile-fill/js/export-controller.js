(function() {
    'use strict';

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; export controller disabled');
            return;
        }

        window.MobileFillEventBus.on('EXPORT_STARTED', () => {
            handleExportRequest();
        });
    }

    async function handleExportRequest() {
        if (!window.MobileFillEventBus) {
            return;
        }

        if (!window.MobileFillStateStore) {
            logExportBlocked('State store missing');
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: 'Export dependencies missing'
            });
            return;
        }

        const state = window.MobileFillStateStore.state;

        if (!window.ExportEngine || typeof window.ExportEngine.export !== 'function') {
            logExportBlocked('Export engine unavailable');
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: 'Export engine unavailable'
            });
            return;
        }

        try {
            const pdfBytesSafe = clonePdfBytes(state.documentState.pdfBytesSafeForExport);
            if (!pdfBytesSafe) {
                logExportBlocked('PDF bytes missing');
                window.MobileFillEventBus.emit('EXPORT_ERROR', {
                    error: 'PDF bytes missing'
                });
                return;
            }

            // Rebuild mapping from scratch (not clone!)
            const fieldsMapping = buildFieldsMapping(state.quickFillState?.fields || []);

            // Rebuild liveFillData from scratch (not clone!)
            const liveFillData = rebuildLiveFillData(state.liveFillState.liveFillData);

            // Validate we have data
            if (!fieldsMapping || !fieldsMapping.fields) {
                logExportBlocked('Fields mapping unavailable');
                window.MobileFillEventBus.emit('EXPORT_ERROR', {
                    error: 'Fields mapping unavailable'
                });
                return;
            }

            logExportTrace(state);

            // Debug logs before ExportEngine call
            console.log('EXPORT DEBUG', {
                isFrozen: Object.isFrozen(liveFillData),
                isSealed: Object.isSealed(liveFillData),
                fieldCount: fieldsMapping.fields.length,
                liveFillDataKeys: Object.keys(liveFillData).length,
                liveFillDataSample: Object.keys(liveFillData).slice(0, 3)
            });

            console.log('[MobileFill] About to call ExportEngine.export with rebuilt payload');
            const { exportResult, capturedBlob, capturedBlobUrl } = await runExportWithCapture(() => {
                return window.ExportEngine.export({
                    pdfBytesSafe,
                    fieldsMapping,
                    liveFillData
                });
            });

            console.log('[MobileFill] ExportEngine.export returned:', describeExportResult(exportResult));

            const pdfBytes = extractPdfBytes(exportResult);
            if (pdfBytes) {
                downloadPdfBytes(pdfBytes, 'bytes');
            } else if (capturedBlob) {
                downloadPdfBlob(capturedBlob, 'blob');
            } else if (capturedBlobUrl) {
                downloadGeneratedUrl(capturedBlobUrl, 'fallback');
            } else {
                console.error('[MobileFill] Export failed: no generated PDF bytes or blob');
                window.MobileFillEventBus.emit('EXPORT_ERROR', {
                    error: 'Generated PDF not available'
                });
                return;
            }

            console.log('[MobileFill] Export finished successfully');
            window.MobileFillEventBus.emit('EXPORT_DONE', {
                fileName: null
            });
        } catch (error) {
            console.error('[MobileFill] Export failed:', error);
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: error?.message || 'Export failed'
            });
        }
    }

    async function runExportWithCapture(exportFn) {
        let capturedBlob = null;
        let capturedBlobUrl = null;
        const originalCreateObjectURL = URL.createObjectURL;
        const originalWindowOpen = window.open;
        const originalLocationAssign = window.location.assign.bind(window.location);

        URL.createObjectURL = function(blob) {
            if (blob instanceof Blob) {
                capturedBlob = blob;
            }
            const url = originalCreateObjectURL.call(URL, blob);
            capturedBlobUrl = url;
            logNavigationAttempt('createObjectURL', url);
            return url;
        };

        window.open = function(url, ...rest) {
            if (shouldBlockUrl(url)) {
                logNavigationAttempt('window.open (blocked)', url);
                return null;
            }

            logNavigationAttempt('window.open', url);
            return originalWindowOpen.call(window, url, ...rest);
        };

        window.location.assign = function(url) {
            if (shouldBlockUrl(url)) {
                logNavigationAttempt('location.assign (blocked)', url);
                return;
            }

            logNavigationAttempt('location.assign', url);
            return originalLocationAssign(url);
        };

        try {
            const exportResult = await exportFn();
            return { exportResult, capturedBlob, capturedBlobUrl };
        } finally {
            URL.createObjectURL = originalCreateObjectURL;
            window.open = originalWindowOpen;
            window.location.assign = originalLocationAssign;
        }
    }

    function extractPdfBytes(exportResult) {
        if (!exportResult) return null;

        if (exportResult instanceof Uint8Array) {
            return exportResult;
        }

        if (exportResult instanceof ArrayBuffer) {
            return new Uint8Array(exportResult);
        }

        if (exportResult.pdfBytes instanceof Uint8Array) {
            return exportResult.pdfBytes;
        }

        if (exportResult.pdfBytes instanceof ArrayBuffer) {
            return new Uint8Array(exportResult.pdfBytes);
        }

        return null;
    }

    function clonePdfBytes(pdfBytesSafe) {
        if (!pdfBytesSafe) return null;

        if (pdfBytesSafe instanceof Uint8Array) {
            return new Uint8Array(pdfBytesSafe.slice(0));
        }

        if (pdfBytesSafe instanceof ArrayBuffer) {
            return new Uint8Array(pdfBytesSafe.slice(0));
        }

        return null;
    }

    /**
     * Rebuild liveFillData from scratch - never clone, always create new objects.
     * This prevents "Attempted to assign to readonly property" errors.
     * @param {Object} original - Original liveFillData from state
     * @returns {Object} - Fresh object with only primitive values
     */
    function rebuildLiveFillData(original) {
        const rebuilt = {};

        if (!original || typeof original !== 'object') {
            return rebuilt;
        }

        // Iterate over all keys and copy only primitives
        Object.keys(original).forEach((fieldId) => {
            if (fieldId === 'tables') {
                // Handle tables separately if needed
                rebuilt.tables = rebuildTables(original.tables);
                return;
            }

            const entry = original[fieldId];
            if (!entry || typeof entry !== 'object') {
                return;
            }

            // Create fresh entry with primitive values only
            // Preserve original type (string/number) - don't force String()
            let valueToStore = null;
            if (entry.value !== undefined && entry.value !== null) {
                if (typeof entry.value === 'string') {
                    valueToStore = entry.value;
                } else if (typeof entry.value === 'number') {
                    valueToStore = entry.value;
                } else {
                    valueToStore = String(entry.value);
                }
            }

            rebuilt[fieldId] = {
                value: valueToStore,
                checked: entry.checked === true ? true : (entry.checked === false ? false : null)
            };

            // Copy style if exists (primitives only)
            if (entry.style && typeof entry.style === 'object') {
                rebuilt[fieldId].style = {
                    fontSize: typeof entry.style.fontSize === 'number' ? entry.style.fontSize : undefined,
                    color: typeof entry.style.color === 'string' ? entry.style.color : undefined,
                    alignment: typeof entry.style.alignment === 'string' ? entry.style.alignment : undefined
                };
            }
        });

        return rebuilt;
    }

    /**
     * Rebuild tables data from scratch
     * @param {Object} tables - Original tables object
     * @returns {Object} - Fresh tables object
     */
    function rebuildTables(tables) {
        if (!tables || typeof tables !== 'object') {
            return {};
        }

        const rebuilt = {};

        Object.keys(tables).forEach((tableId) => {
            const tableData = tables[tableId];
            if (!Array.isArray(tableData)) {
                return;
            }

            rebuilt[tableId] = tableData.map((row) => {
                if (!row || typeof row !== 'object') {
                    return {};
                }

                const newRow = {};
                Object.keys(row).forEach((colKey) => {
                    const value = row[colKey];
                    // Copy only primitives
                    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                        newRow[colKey] = value;
                    }
                });
                return newRow;
            });
        });

        return rebuilt;
    }

    function buildFieldsMapping(fields) {
        if (!Array.isArray(fields)) return { fields: [] };

        const mapped = fields.map((field) => {
            const fieldId = field.id || field.fieldId;
            const type = field.type || 'text';
            const page = field.page || 1;

            const pdfX = field.pdfX;
            const pdfY = field.pdfY;
            const pdfWidth = field.pdfWidth;
            const pdfHeight = field.pdfHeight;
            const bbox = Array.isArray(field.bbox) ? field.bbox : null;

            if (type === 'checkbox' || type === 'radio') {
                let anchor = field.anchor;
                if (!anchor && bbox) {
                    const [xPct, yPct, wPct, hPct] = bbox;
                    anchor = [xPct + (wPct / 2), yPct + (hPct / 2)];
                }

                return {
                    id: fieldId,
                    type,
                    page,
                    anchor,
                    pdfX,
                    pdfY,
                    pdfWidth,
                    pdfHeight
                };
            }

            return {
                id: fieldId,
                type: 'text',
                page,
                bbox: bbox || undefined,
                pdfX,
                pdfY,
                pdfWidth,
                pdfHeight,
                isQuickFill: true
            };
        });

        return { fields: mapped };
    }

    function downloadPdfBytes(pdfBytes, sourceType) {
        try {
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            downloadPdfBlob(blob, sourceType);
        } catch (error) {
            window.MobileFillEventBus.emit('EXPORT_ERROR', {
                error: error?.message || 'Download failed'
            });
        }
    }

    function downloadPdfBlob(blob, sourceType) {
        const url = URL.createObjectURL(blob);

        console.log(`[MobileFill] Opening generated PDF for download (source: ${sourceType || 'fallback'})`);
        if (isIOSMobileSafari()) {
            window.location.href = url;
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = `filled_form_${Date.now()}.pdf`;
            a.click();
        }

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 2000);
    }

    function isIOSMobileSafari() {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua);
        const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
        return isIOS && isSafari;
    }

    function downloadGeneratedUrl(url, sourceType) {
        if (!url) return;

        console.log(`[MobileFill] Opening generated PDF for download (source: ${sourceType || 'fallback'})`);
        if (isIOSMobileSafari()) {
            window.location.href = url;
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = `filled_form_${Date.now()}.pdf`;
            a.click();
        }

        setTimeout(() => {
            try {
                URL.revokeObjectURL(url);
            } catch (err) {
                // ignore
            }
        }, 2000);
    }

    function logNavigationAttempt(method, url) {
        console.log(`[MobileFill] NAVIGATION ATTEMPT: ${method} ${url || ''}`.trim());
    }

    function logExportTrace(state) {
        const hasPdf = state.documentState?.pdfLoadStatus === 'ready';
        const mappingCount = Array.isArray(state.quickFillState?.fields)
            ? state.quickFillState.fields.length
            : 0;
        const exportRunning = state.exportState?.exportStatus === 'running';
        const filledCount = countFilledValues(state.liveFillState?.liveFillData);
        const gateResult = {
            allowed: hasPdf && mappingCount > 0 && !exportRunning,
            reason: !hasPdf
                ? 'PDF not ready'
                : mappingCount === 0
                    ? 'No fields'
                    : exportRunning
                        ? 'Export already running'
                        : undefined
        };
        const activeEditField = Boolean(document.querySelector('.mobilefill-inline-input'));

        console.log('[ExportTrace]', {
            gate: gateResult,
            mappingCount,
            filledCount,
            activeEditField
        });
    }

    function logExportBlocked(reason) {
        console.warn('[ExportTrace] Export blocked:', reason);
    }

    function countFilledValues(liveFillData) {
        if (!liveFillData) return 0;
        let count = 0;
        Object.keys(liveFillData).forEach((key) => {
            if (key === 'tables') return;
            const entry = liveFillData[key] || {};
            if (entry.checked === true) {
                count += 1;
                return;
            }
            const value = entry.value;
            if (value !== null && value !== undefined && String(value).trim() !== '') {
                count += 1;
            }
        });

        return count;
    }

    function shouldBlockUrl(url) {
        if (!url) return false;
        return String(url).includes('/assets/forms/101.pdf');
    }

    function describeExportResult(result) {
        if (result === null || result === undefined) return String(result);
        if (result instanceof Uint8Array) return 'Uint8Array';
        if (result instanceof ArrayBuffer) return 'ArrayBuffer';
        if (result?.pdfBytes instanceof Uint8Array) return 'Object(pdfBytes: Uint8Array)';
        if (result?.pdfBytes instanceof ArrayBuffer) return 'Object(pdfBytes: ArrayBuffer)';
        return typeof result;
    }

    window.MobileFillExportController = {
        init
    };
})();
