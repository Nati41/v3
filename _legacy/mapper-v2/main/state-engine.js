/**
 * Mapper State Engine - State management logic
 * These functions handle undo/redo, auto-save, project save/load, and viewport state.
 *
 * NOTE: All functions receive mapper state as parameters.
 * No internal "this" references - all state passed in.
 */
(function() {
    'use strict';

    // ============ HISTORY MANAGEMENT (UNDO/REDO) ============

    /**
     * Save current state to history
     * @param {string} action - Action name for this state
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function saveState(action, mapper) {
        // Create state snapshot
        const state = {
            action: action,
            fields: JSON.parse(JSON.stringify(mapper.fields.map(f => ({...f, element: null})))),
            tableGroups: JSON.parse(JSON.stringify(mapper.tableGroups)),
            tables: JSON.parse(JSON.stringify(mapper.mappedTables || [])),
            timestamp: Date.now()
        };

        // Remove any states after current index
        mapper.history = mapper.history.slice(0, mapper.historyIndex + 1);

        // Add new state
        mapper.history.push(state);

        // Limit history size
        if (mapper.history.length > mapper.maxHistorySize) {
            mapper.history.shift();
        } else {
            mapper.historyIndex++;
        }

        mapper.updateUndoRedoButtons();
        mapper.autoSave();
    }

    /**
     * Undo last action
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function undo(mapper) {
        if (mapper.historyIndex > 0) {
            mapper.historyIndex--;
            await mapper.restoreState(mapper.history[mapper.historyIndex]);
            mapper.showToast('פעולה בוטלה', 'info');
        }
    }

    /**
     * Redo last undone action
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function redo(mapper) {
        if (mapper.historyIndex < mapper.history.length - 1) {
            mapper.historyIndex++;
            await mapper.restoreState(mapper.history[mapper.historyIndex]);
            mapper.showToast('פעולה שוחזרה', 'info');
        }
    }

    // ============ AUTO-SAVE FUNCTIONALITY ============

    /**
     * Auto-save current state to localStorage
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function autoSave(mapper) {
        if (!mapper.autoSaveEnabled) return;

        const saveData = {
            fields: mapper.fields.map(field => ({
                ...field,
                element: null // Don't save DOM references
            })),
            tableGroups: mapper.tableGroups,
            tables: mapper.mappedTables || [],
            currentPage: mapper.currentPage,
            totalPages: mapper.totalPages,
            pageViewStates: mapper.pageViewStates,
            timestamp: Date.now()
        };

        try {
            localStorage.setItem(mapper.autoSaveKey, JSON.stringify(saveData));
            mapper.lastAutoSave = Date.now();
            mapper.showAutoSaveIndicator();
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }

    /**
     * Check for and optionally restore auto-saved data
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function checkAutoSave(mapper) {
        const savedData = localStorage.getItem(mapper.autoSaveKey);
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                const timeDiff = Date.now() - data.timestamp;
                const hoursDiff = timeDiff / (1000 * 60 * 60);

                if (hoursDiff < 24) {
                    if (confirm('נמצאה עבודה שנשמרה אוטומטית. האם לטעון אותה?')) {
                        await mapper.loadAutoSave(data);
                        mapper.showToast('העבודה השמורה נטענה בהצלחה', 'success');
                    }
                }
            } catch (error) {
                console.error('Failed to load auto-save:', error);
            }
        }
    }

    // ============ PROJECT SAVE/LOAD ============

    /**
     * Save current project to file
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function saveProject(mapper) {
        const hasFields = mapper.fields && mapper.fields.length > 0;
        const hasTables = mapper.mappedTables && mapper.mappedTables.length > 0;

        if (!hasFields && !hasTables) {
            mapper.showToast('אין שדות או טבלאות לשמירה', 'warning');
            return;
        }

        const projectData = {
            version: '2.0',
            fields: mapper.fields.map(field => ({
                id: field.id,
                label_he: field.label_he,
                type: field.type,
                direction: field.direction,
                fontSize: field.fontSize,
                letterSpacing: field.letterSpacing,
                page: field.page,
                xPct: field.xPct,
                yPct: field.yPct,
                wPct: field.wPct,
                hPct: field.hPct,
                isComplete: field.isComplete,
                tableGroupId: field.tableGroupId,
                bbox: field.bbox,
                anchor: field.anchor,
                pdfX: field.pdfX,
                pdfY: field.pdfY,
                pdfWidth: field.pdfWidth,
                pdfHeight: field.pdfHeight
            })),
            tableGroups: mapper.tableGroups,
            tables: (mapper.mappedTables || []).map(table => ({
                tableId: table.tableId,
                page: table.page,
                bbox: table.bbox,
                headerBBox: table.headerBBox,
                sampleRowBBox: table.sampleRowBBox,
                rowCount: table.rowCount,
                rowHeight: table.rowHeight,
                repeatDirection: table.repeatDirection || 'vertical',
                columns: table.columns || [],
                rows: table.rows || [],
                isComplete: table.isComplete
            })),
            document: mapper.currentDocument ? {
                type: mapper.currentDocument.type,
                pages: mapper.currentDocument.pages
            } : null,
            pageViewStates: mapper.pageViewStates,
            createdAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `field-mapping-project-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        mapper.showToast('הפרויקט נשמר', 'success');
    }

    /**
     * Load project from file
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function loadProject(mapper) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (!data.fields || !Array.isArray(data.fields)) {
                    throw new Error('קובץ פרויקט לא תקין');
                }

                // Clear existing
                mapper.clearAll();

                // Load fields
                mapper.fields = data.fields.map(field => ({
                    ...field,
                    element: null,
                    isMapped: field.xPct != null && field.yPct != null || field.bbox != null || field.anchor != null,
                    isComplete: field.isComplete || false
                }));

                mapper.tableGroups = data.tableGroups || [];
                mapper.pageViewStates = data.pageViewStates || {};

                // Load tables (mappedTables)
                mapper.mappedTables = (data.tables || []).map(table => ({
                    ...table,
                    isComplete: table.isComplete || true
                }));

                // Render fields for current page
                const renderPromises = mapper.fields
                    .filter(field => field.isMapped && field.page === mapper.currentPage)
                    .map(field => mapper.renderField(field));
                await Promise.all(renderPromises);

                // FIX TASK 3: Render table overlays for current page after PDF viewport is ready
                if (mapper.mappedTables.length > 0) {
                    const renderTableOverlays = () => {
                        mapper.mappedTables
                            .filter(table => table.page === mapper.currentPage)
                            .forEach(table => {
                                if (typeof mapper.renderTableOverlay === 'function') {
                                    mapper.renderTableOverlay(table);
                                }
                            });
                    };

                    if (typeof mapper.ensurePDFViewportReady === 'function') {
                        mapper.ensurePDFViewportReady(mapper.currentPage, renderTableOverlays);
                    } else {
                        // Fallback: render immediately
                        renderTableOverlays();
                    }
                }

                mapper.updateFieldList();
                mapper.saveState('load_project');
                mapper.checkFieldOverlaps();

                const mappedCount = mapper.fields.filter(f => f.isComplete).length;
                const editingCount = mapper.fields.filter(f => !f.isComplete).length;
                const tableCount = mapper.mappedTables.length;

                let message = `נטען פרויקט: ${mappedCount} שדות ממופים, ${editingCount} בעריכה`;
                if (tableCount > 0) {
                    message += `, ${tableCount} טבלאות`;
                }
                mapper.showToast(message, 'success');

            } catch (error) {
                mapper.showToast('שגיאה בטעינת הפרויקט: ' + error.message, 'error');
            }
        };

        input.click();
    }

    /**
     * Load mapper data from JSON file
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function loadMapperData(mapper) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const jsonData = JSON.parse(text);

                console.log('Loaded JSON data:', jsonData);

                // Handle different JSON formats
                let fieldsToLoad = [];

                if (Array.isArray(jsonData)) {
                    // Direct array format from mapping export
                    fieldsToLoad = jsonData;
                    console.log('Using direct array format');
                } else if (jsonData.fields && Array.isArray(jsonData.fields)) {
                    // Project format with fields property
                    fieldsToLoad = jsonData.fields;
                    console.log('Using project format with fields array');
                } else {
                    console.error('Unsupported JSON format:', jsonData);
                    throw new Error('פורמט JSON לא נתמך - צריך להיות מערך של שדות או אובייקט עם תכונת fields');
                }

                console.log('Fields to load:', fieldsToLoad);

                // Load tables if present
                let tablesToLoad = [];
                if (jsonData.tables && Array.isArray(jsonData.tables)) {
                    tablesToLoad = jsonData.tables;
                    console.log('Tables to load:', tablesToLoad);
                }

                // Convert to internal field format compatible with Live Fill mode
                await mapper.loadMappingFields(fieldsToLoad);

                // Load tables into mappedTables
                if (tablesToLoad.length > 0) {
                    mapper.mappedTables = tablesToLoad.map(table => ({
                        ...table,
                        isComplete: table.isComplete !== false
                    }));

                    // FIX TASK 3: Render table overlays after PDF viewport is ready
                    const renderTableOverlays = () => {
                        mapper.mappedTables
                            .filter(table => table.page === mapper.currentPage)
                            .forEach(table => {
                                if (typeof mapper.renderTableOverlay === 'function') {
                                    mapper.renderTableOverlay(table);
                                }
                            });
                    };

                    if (typeof mapper.ensurePDFViewportReady === 'function') {
                        mapper.ensurePDFViewportReady(mapper.currentPage, renderTableOverlays);
                    } else {
                        // Fallback: render immediately
                        renderTableOverlays();
                    }
                }

                let message = `נתוני מיפוי נטענו: ${fieldsToLoad.length} שדות`;
                if (tablesToLoad.length > 0) {
                    message += `, ${tablesToLoad.length} טבלאות`;
                }
                mapper.showToast(message, 'success');

                // DISABLED: Live Fill mode removed from mapper tool
                // Stay in mapper mode, update field list to show loaded fields
                mapper.updateFieldList();

                // Detect mapping mode based on loaded fields
                mapper._detectMappingMode();

            } catch (error) {
                console.error('Error loading mapper data:', error);
                mapper.showToast('שגיאה בטעינת נתוני מיפוי: ' + error.message, 'error');
            }
        };

        input.click();
    }

    /**
     * Load mapping fields with bbox support
     * @param {Array} fieldsData - Array of field data objects
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function loadMappingFields(fieldsData, mapper) {
        // Clear existing fields
        mapper.clearAll();

        // Process each field from the mapping JSON
        console.log('Processing fields data:', fieldsData);
        for (const fieldData of fieldsData) {
            try {
                console.log('Processing field:', fieldData);
                // Skip invalid fields
                if (!fieldData.id && !fieldData.fieldId) {
                    console.warn('Skipping field without id:', fieldData);
                    continue;
                }

                const fieldId = fieldData.id || fieldData.fieldId;
                console.log('Field ID:', fieldId);
                const fieldType = fieldData.type || 'text';
                const fieldPage = fieldData.page || 1;

                // Handle bbox coordinates (preferred format)
                let bbox = null;
                if (fieldData.bbox && Array.isArray(fieldData.bbox) && fieldData.bbox.length === 4) {
                    bbox = [...fieldData.bbox]; // [x, y, width, height] in PDF points
                }
                // Fallback to old coordinate system if available
                else if (fieldData.x != null && fieldData.y != null && fieldData.width != null && fieldData.height != null) {
                    bbox = [fieldData.x, fieldData.y, fieldData.width, fieldData.height];
                }

                if (!bbox) {
                    console.warn('Field missing coordinates:', fieldId, 'Field data:', fieldData);
                    continue;
                }

                // Create internal field structure
                const field = {
                    id: fieldId,
                    label_he: fieldData.label_he || fieldData.name || fieldId,
                    label_en: fieldData.label_en || fieldId,
                    type: fieldType,
                    direction: fieldData.direction || 'rtl',
                    fontSize: fieldData.fontSize || 14,
                    letterSpacing: fieldData.letterSpacing || 0,
                    wordSpacing: fieldData.wordSpacing || 0,
                    lineHeight: fieldData.lineHeight || 1.0,
                    anchorH: fieldData.anchorH || 'start',
                    anchorV: fieldData.anchorV || 'middle',
                    page: fieldPage,
                    bbox: bbox, // Store bbox directly
                    // Template fields load as unmapped - user must explicitly map them
                    isMapped: false,

                    // Initialize Live Fill data structure
                    textSettings: {
                        fontFamily: fieldData.fontFamily || 'David Libre',
                        fontSize: fieldData.fontSize || 14,
                        alignmentH: fieldData.alignment || 'center',
                        alignmentV: fieldData.verticalAlign || 'middle',
                        color: fieldData.color || '#000000',
                        opacity: fieldData.opacity !== undefined ? fieldData.opacity : 1.0,
                        letterSpacing: fieldData.letterSpacing || 0,
                        wordSpacing: fieldData.wordSpacing || 0
                    }
                };

                // ✅ Normalize field before adding
                const normalizedField = normalizeField(field);
                if (!normalizedField) continue;

                // Add field to fields array
                mapper.fields.push(normalizedField);

                // Initialize liveFillData with new structure
                mapper.liveFillData[fieldId] = {
                    value: fieldData.value || '', // Pre-filled value if exists
                    style: {
                        fontFamily: field.textSettings.fontFamily,
                        fontSize: field.textSettings.fontSize,
                        alignmentH: field.textSettings.alignmentH,
                        alignmentV: field.textSettings.alignmentV,
                        color: field.textSettings.color,
                        opacity: field.textSettings.opacity,
                        letterSpacing: field.textSettings.letterSpacing,
                        wordSpacing: field.textSettings.wordSpacing
                    }
                };

                console.log('Loaded field:', fieldId, 'with bbox:', bbox);

            } catch (error) {
                console.error('Error loading field:', fieldData, error);
            }
        }

        // Update counters and UI
        mapper.updateFieldCounters();
        mapper.updateLiveTextPanel();

        // Build Live Fill overlay for the loaded fields
        mapper.buildLiveFillOverlay();

        // Render text previews if we're in Live Fill mode
        if (mapper.appMode === 'livefill') {
            setTimeout(() => {
                mapper.updateAllTextPreviews();
            }, 100);
        }

        // Auto-save the loaded data
        mapper.autoSave();

        console.log(`Loaded ${mapper.fields.length} fields for Live Fill mode`);
    }

    // ============ VIEWPORT STATE ============

    /**
     * Save current viewport state
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function saveViewportState(mapper) {
        mapper.savedViewportState = {
            zoom: mapper.zoomLevel,
            panX: mapper.panX,
            panY: mapper.panY
        };
    }

    /**
     * Restore saved viewport state
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function restoreViewportState(mapper) {
        if (mapper.savedViewportState) {
            mapper.zoomLevel = mapper.savedViewportState.zoom;
            mapper.panX = mapper.savedViewportState.panX;
            mapper.panY = mapper.savedViewportState.panY;
            mapper.updateZoomDisplay();
            mapper.updateZoomInfo();
        }
    }

    // ============ EXPORT ============

    window.MapperStateEngine = {
        saveState,
        undo,
        redo,
        autoSave,
        checkAutoSave,
        saveProject,
        loadProject,
        loadMapperData,
        loadMappingFields,
        saveViewportState,
        restoreViewportState
    };
})();
