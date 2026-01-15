/**
 * Mapper Drag Engine - Drag, Resize, and Drawing logic
 * These functions handle the state machine for field manipulation.
 *
 * NOTE: All functions receive the mapper instance as a parameter
 * to access state and call mapper methods.
 */
(function() {
    'use strict';

    // ============ CONSTANTS ============
    // Minimum size for drawn rectangles (in pixels)
    // Small rectangles are normalized to this size, not rejected
    const MIN_SIZE = 24;

    // ============ DRAWING ============

    /**
     * Start drawing a new field rectangle
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Event} event - Mouse event
     * @param {Object} mapper - FieldMapper instance
     */
    function startDrawing(x, y, event, mapper) {
        console.log('📝 [startDrawing] Called with:', { x, y, mode: mapper.interaction.mode, selectFieldNameMode: mapper.selectFieldNameMode });
        mapper.isDrawing = true;

        // Apply snap to grid
        x = mapper.Core.snapToGridValue(x, mapper.snapToGrid, mapper.gridSize);
        y = mapper.Core.snapToGridValue(y, mapper.snapToGrid, mapper.gridSize);

        mapper.dragStart = { x, y };

        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        // Debug log for field placement start
        const canvas = document.querySelector('.pdf-canvas');
        if (canvas && event) {
            const logData = {
                offsetX: x,
                offsetY: y,
                clientX: event.clientX,
                clientY: event.clientY,
                clientX_dpr: event.clientX / window.devicePixelRatio,
                clientY_dpr: event.clientY / window.devicePixelRatio,
                canvasLogical: { w: canvas.width, h: canvas.height },
                canvasDisplay: { w: canvas.clientWidth, h: canvas.clientHeight },
                devicePixelRatio: window.devicePixelRatio
            };
            console.log("[DEBUG] Field placement started:", logData);
            addLog("Field placement started", logData);
        }

        const rect = document.createElement('div');
        rect.className = 'drawing-rect';
        rect.style.left = x + 'px';
        rect.style.top = y + 'px';

        const info = document.createElement('div');
        info.className = 'drawing-info';
        rect.appendChild(info);

        // Add table grid preview if drawing table
        if (mapper.interaction.mode === 'drawing_table') {
            mapper.createTableGridPreview(rect);
        }

        layer.appendChild(rect);
        mapper.currentDrawing = rect;
    }

    /**
     * Update drawing rectangle dimensions
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} mapper - FieldMapper instance
     */
    function updateDrawing(x, y, mapper) {
        if (!mapper.currentDrawing || !mapper.dragStart) return;

        // Apply snap to grid
        x = mapper.Core.snapToGridValue(x, mapper.snapToGrid, mapper.gridSize);
        y = mapper.Core.snapToGridValue(y, mapper.snapToGrid, mapper.gridSize);

        const left = Math.min(x, mapper.dragStart.x);
        const top = Math.min(y, mapper.dragStart.y);
        const width = Math.abs(x - mapper.dragStart.x);
        const height = Math.abs(y - mapper.dragStart.y);

        mapper.currentDrawing.style.left = left + 'px';
        mapper.currentDrawing.style.top = top + 'px';
        mapper.currentDrawing.style.width = width + 'px';
        mapper.currentDrawing.style.height = height + 'px';

        // Update table grid preview if drawing table
        if (mapper.interaction.mode === 'drawing_table') {
            mapper.updateTableGridPreview(mapper.currentDrawing, width, height);
        }

        const info = mapper.currentDrawing.querySelector('.drawing-info');
        if (info) {
            info.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
        }
    }

    /**
     * Finish drawing and create the field
     * STATE MACHINE DRIVEN - All logic based on StateMachine state
     * @param {Object} mapper - FieldMapper instance
     */
    async function finishDrawing(mapper) {
        if (!mapper.currentDrawing) return;

        // Get StateMachine reference (may be null during initialization)
        const sm = mapper.stateMachine;
        const MS = window.MapperState;

        // Log state transition for debugging
        const currentState = sm ? sm.getState() : 'NO_STATE_MACHINE';
        console.log(`[STATE] finishDrawing() triggered in state: ${currentState}`);

        // Parse dimensions - these might be empty strings if drawing wasn't updated
        let width = parseFloat(mapper.currentDrawing.style.width);
        let height = parseFloat(mapper.currentDrawing.style.height);
        let x = parseFloat(mapper.currentDrawing.style.left);
        let y = parseFloat(mapper.currentDrawing.style.top);

        // Handle NaN values by defaulting to 0 (will be normalized below)
        if (isNaN(width)) width = 0;
        if (isNaN(height)) height = 0;
        if (isNaN(x)) x = mapper.dragStart?.x || 0;
        if (isNaN(y)) y = mapper.dragStart?.y || 0;

        // Clear table grid preview before removing drawing (legacy check for table grid)
        if (mapper.interaction.mode === 'drawing_table') {
            mapper.clearTableGridPreview();
        }

        // Store drawing reference (will be removed after render)
        const drawingToRemove = mapper.currentDrawing;
        mapper.currentDrawing = null;

        // ============ AUTOMATIC SIZE NORMALIZATION ============
        const originalWidth = width;
        const originalHeight = height;

        if (width < MIN_SIZE) {
            const centerX = x + (originalWidth / 2);
            width = MIN_SIZE;
            x = centerX - (width / 2);
        }

        if (height < MIN_SIZE) {
            const centerY = y + (originalHeight / 2);
            height = MIN_SIZE;
            y = centerY - (height / 2);
        }

        // Ensure x and y don't go negative after centering adjustment
        const layer = document.getElementById('mapping-layer');
        if (layer) {
            if (x < 0) x = 0;
            if (y < 0) y = 0;
            if (x + width > layer.offsetWidth) x = layer.offsetWidth - width;
            if (y + height > layer.offsetHeight) y = layer.offsetHeight - height;
        }

        if (originalWidth < MIN_SIZE || originalHeight < MIN_SIZE) {
            console.log('📐 Rectangle normalized:', {
                original: { width: originalWidth, height: originalHeight },
                normalized: { width, height, x, y }
            });
        }

        // ============ STATE MACHINE DRIVEN LOGIC ============
        // All mode detection goes through StateMachine state
        if (sm && MS) {
            const state = sm.getState();

            switch (state) {
                // ============ TABLE STATES ============
                case MS.TABLE_REGION:
                    if (drawingToRemove) drawingToRemove.remove();
                    mapper.createTableFromRegion(x, y, width, height);
                    console.log(`[STATE] ${state} → createTableFromRegion()`);
                    return;

                case MS.TABLE_SAMPLE_ROW:
                    if (drawingToRemove) drawingToRemove.remove();
                    mapper.setSampleRow(x, y, width, height);
                    console.log(`[STATE] ${state} → setSampleRow()`);
                    return;

                case MS.TABLE_COLUMN_MAPPING:
                    if (drawingToRemove) drawingToRemove.remove();
                    mapper.addTableColumn(x, y, width, height);
                    console.log(`[STATE] ${state} → addTableColumn()`);
                    return;

                // ============ MAPPING FLOW STATES ============
                case MS.FLOW_CAPTURE_FIELD:
                    console.log(`[STATE] ${state} → Creating field with captured name`);
                    if (drawingToRemove) drawingToRemove.remove();

                    // Get field type and name from StateMachine
                    const fieldType = sm.getFlowType() || 'text';
                    const pendingName = sm.getPendingName();

                    const newFieldFlow = await mapper.createUnnamedFieldFromRect(x, y, width, height, {
                        type: fieldType,
                        labelHe: pendingName?.text || '',
                        labelEn: pendingName?.key || '',
                        autoLabel: true,
                        autoLabelSource: pendingName?.source || 'manual',
                        isUnnamed: false,
                        skipSuggestion: true
                    });

                    if (newFieldFlow) {
                        await mapper.renderField(newFieldFlow);
                        mapper.updateFieldList();
                        mapper.selectField(newFieldFlow.id, { scroll: true });
                        mapper.saveState('create_field_with_name');
                        mapper.showToast(`📌 שדה חדש נוצר: "${pendingName?.text || 'שדה חדש'}"`, 'success');
                        console.log(`[STATE] Field created: ${newFieldFlow.id}`);
                    } else {
                        console.error(`[STATE] ${state} → Field creation FAILED!`);
                    }

                    // Complete field and loop back to name capture
                    mapper._completeMappingFlowField(newFieldFlow);
                    return;

                case MS.FLOW_CAPTURE_NAME:
                    console.log(`[STATE] ${state} → Capturing text for field name`);
                    if (drawingToRemove) drawingToRemove.remove();
                    const bbox = { x, y, width, height };
                    mapper.handleSelectFieldNameRect(bbox);
                    return;

                // ============ DIRECT CREATION STATES ============
                case MS.FIELD_CREATION:
                    console.log(`[STATE] ${state} → Creating unnamed field`);
                    const newFieldDirect = await mapper.createUnnamedFieldFromRect(x, y, width, height);

                    if (newFieldDirect) {
                        await mapper.renderField(newFieldDirect);
                        if (drawingToRemove) drawingToRemove.remove();
                        mapper.updateFieldList();
                        mapper.selectField(newFieldDirect.id, { scroll: true });
                        mapper.saveState('create_unnamed_field');
                        mapper.showToast(`שדה חדש נוצר: ${newFieldDirect.label_he}`, 'success');
                    } else {
                        if (drawingToRemove) drawingToRemove.remove();
                        mapper.showToast('שגיאה ביצירת השדה', 'error');
                    }
                    return;

                case MS.CHECKBOX_CREATION:
                case MS.RADIO_CREATION:
                    // These are click-based, not drag-based, so just clean up
                    if (drawingToRemove) drawingToRemove.remove();
                    console.log(`[STATE] ${state} → Click-based creation (ignoring drag)`);
                    return;

                case MS.TEXT_SELECTION:
                    console.log(`[STATE] ${state} → Text selection for existing field`);
                    if (drawingToRemove) drawingToRemove.remove();
                    const textBbox = { x, y, width, height };
                    mapper.handleTextSelectionRect(textBbox);
                    return;

                case MS.GROUPING_SELECT:
                case MS.GROUP_NAMING:
                case MS.OPTION_LABELING:
                    // Grouping modes don't create fields from drawing
                    if (drawingToRemove) drawingToRemove.remove();
                    console.log(`[STATE] ${state} → Grouping mode (no field creation)`);
                    return;

                case MS.IDLE:
                case MS.PREVIEW:
                    // Not in any creation mode - fall through to legacy or default behavior
                    console.log(`[STATE] ${state} → No active mode, checking legacy`);
                    break;

                default:
                    console.warn(`[STATE] Unknown state: ${state}, falling back to legacy`);
                    break;
            }
        }

        // ============ LEGACY FALLBACK (StateMachine not available) ============
        // This code will be removed in Phase 3

        // Check if drawing table (legacy)
        if (mapper.interaction.mode === 'drawing_table') {
            mapper.createTableFieldsInArea(x, y, width, height);
            if (drawingToRemove) drawingToRemove.remove();
            return;
        }

        // Handle table step drawing mode (legacy)
        if (mapper.interaction.mode === 'table_step_drawing') {
            if (drawingToRemove) drawingToRemove.remove();
            if (mapper.tableController && mapper.tableController.isActive()) {
                const bbox = { x, y, width, height };
                mapper.tableController.onRectangleDrawn(bbox);
            }
            mapper.interaction.mode = 'idle';
            return;
        }

        // Legacy table modes
        if (mapper.interaction.mode === 'table_region_selection' || mapper.tableSelectionMode) {
            if (drawingToRemove) drawingToRemove.remove();
            mapper.createTableFromRegion(x, y, width, height);
            return;
        }

        if (mapper.interaction.mode === 'sample_row_selection' || mapper.sampleRowSelectionMode) {
            if (drawingToRemove) drawingToRemove.remove();
            mapper.setSampleRow(x, y, width, height);
            return;
        }

        if (mapper.interaction.mode === 'column_mapping' || mapper.columnMappingMode) {
            if (drawingToRemove) drawingToRemove.remove();
            mapper.addTableColumn(x, y, width, height);
            mapper.interaction.mode = 'column_mapping';
            return;
        }

        // Legacy: DRAW FIELD AFTER NAME MODE
        if (mapper.interaction.mode === 'draw_field_after_name' || (mapper.drawFieldAfterName && mapper.pendingFieldName)) {
            console.log('[LEGACY] DRAW_FIELD_AFTER_NAME mode detected');
            if (drawingToRemove) drawingToRemove.remove();

            const fieldType = mapper.mappingFlowFieldType || 'text';
            const newField = await mapper.createUnnamedFieldFromRect(x, y, width, height, {
                type: fieldType,
                labelHe: mapper.pendingFieldName?.text || '',
                labelEn: mapper.pendingFieldName?.key || '',
                autoLabel: true,
                autoLabelSource: mapper.pendingFieldName?.source || 'manual',
                isUnnamed: false,
                skipSuggestion: true
            });

            if (newField) {
                await mapper.renderField(newField);
                mapper.updateFieldList();
                mapper.selectField(newField.id, { scroll: true });
                mapper.saveState('create_field_with_name');
                mapper.showToast(`📌 שדה חדש נוצר: "${mapper.pendingFieldName?.text || 'שדה חדש'}"`, 'success');
            }

            mapper.deactivateDrawFieldAfterNameMode();
            return;
        }

        // Legacy: SELECT FIELD NAME MODE
        if (mapper.interaction.mode === 'select_field_name' || mapper.selectFieldNameMode) {
            console.log('[LEGACY] SELECT_FIELD_NAME mode detected');
            if (drawingToRemove) drawingToRemove.remove();
            const bbox = { x, y, width, height };
            mapper.handleSelectFieldNameRect(bbox);
            return;
        }

        // Legacy: FIELD CREATION MODE
        if (mapper.interaction.mode === 'field_creation' || mapper.fieldCreationMode) {
            // Create the unnamed field (async for auto-label support)
            const newField = await mapper.createUnnamedFieldFromRect(x, y, width, height);

            if (newField) {
                // Render the field overlay
                await mapper.renderField(newField);

                // Remove drawing box
                if (drawingToRemove) drawingToRemove.remove();

                // Update sidebar
                mapper.updateFieldList();

                // Select the new field
                mapper.selectField(newField.id, { scroll: true });

                // Save state for undo
                mapper.saveState('create_unnamed_field');

                // Show success message
                mapper.showToast(`שדה חדש נוצר: ${newField.label_he}`, 'success');

                // Keep field creation mode active for continuous drawing
                mapper.interaction.mode = 'field_creation';
            } else {
                if (drawingToRemove) drawingToRemove.remove();
                mapper.showToast('שגיאה ביצירת השדה', 'error');
            }

            return;
        }

        // Regular field drawing
        let field = null;

        if (mapper.mappingTargetField) {
            field = mapper.mappingTargetField;
        } else if (mapper.selectedField) {
            field = mapper.selectedField;
        } else if (mapper.interaction.targetFieldId) {
            field = mapper.fields.find(f => f.id === mapper.interaction.targetFieldId);
        }

        if (!field) {
            mapper.showToast('אין שדה נבחר למיפוי', 'warning');
            if (drawingToRemove) drawingToRemove.remove();
            return;
        }

        // Check if field is outside page boundaries
        // Note: 'layer' already defined above for normalization
        if (!layer || x < 0 || y < 0 || x + width > layer.offsetWidth || y + height > layer.offsetHeight) {
            mapper.showToast('השדה מחוץ לגבולות הדף', 'warning');
            if (drawingToRemove) drawingToRemove.remove();
            return;
        }

        // ============ V2 COORDINATE SYSTEM: PDF POINTS ============
        // Convert canvas coordinates to PDF User Space Units (points) using coordinateTranslator

        const layerWidth = Math.max(layer.offsetWidth, 1);
        const layerHeight = Math.max(layer.offsetHeight, 1);

        // ✅ FIX: pdfPageDimensions is scaled by DPI setting, we need actual PDF points (scale=1.0)
        // PDF points = viewport dimensions / scale
        const dpiScale = mapper.dpiSetting / 72;  // e.g., 300/72 = 4.17
        const pageWidth = (mapper.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;   // Convert to PDF points
        const pageHeight = (mapper.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale; // Convert to PDF points

        // ✅ DEBUG: Log coordinate conversion inputs
        console.log('🔍 COORDINATE CONVERSION INPUTS:', {
            canvasX: x,
            canvasY: y,
            canvasWidth: width,
            canvasHeight: height,
            layerWidth,
            layerHeight,
            pdfPageWidth: pageWidth,
            pdfPageHeight: pageHeight,
            pdfPageDimensions: mapper.pdfPageDimensions
        });

        let pdfCoords;
        try {
            pdfCoords = window.CoordinateTranslator.canvasBoxToPdfBox(
                x,           // canvasX
                y,           // canvasY
                width,       // canvasBoxWidth
                height,      // canvasBoxHeight
                layerWidth,  // canvasWidth
                layerHeight, // canvasHeight
                pageWidth,   // pdfPageWidth (in points)
                pageHeight   // pdfPageHeight (in points)
            );

            // ✅ DEBUG: Log coordinate conversion outputs
            console.log('🔍 COORDINATE CONVERSION OUTPUTS:', pdfCoords);
        } catch (error) {
            console.error('❌ Coordinate conversion failed:', error);
            addLog('❌ Coordinate conversion failed: ' + error.message);
            mapper.showToast('שגיאה בהמרת קואורדינטות', 'error');
            if (drawingToRemove) drawingToRemove.remove();
            return;
        }

        // Validate converted coordinates
        let { pdfX, pdfY, pdfWidth, pdfHeight } = pdfCoords;

        // Check for NaN values
        if (isNaN(pdfX) || isNaN(pdfY) || isNaN(pdfWidth) || isNaN(pdfHeight)) {
            console.error('❌ Invalid PDF coordinates: NaN detected', pdfCoords);
            addLog('❌ Invalid PDF coordinates: NaN values');
            mapper.showToast('שגיאה: קואורדינטות לא תקינות', 'error');
            if (drawingToRemove) drawingToRemove.remove();
            return;
        }

        // Enforce minimum dimensions for text fields (prevent disappearing fields)
        const MIN_PDF_WIDTH = 10;   // Minimum 10 points (~3.5mm)
        const MIN_PDF_HEIGHT = 8;   // Minimum 8 points (~2.8mm)
        const DEFAULT_TEXT_WIDTH = 80;
        const DEFAULT_TEXT_HEIGHT = 20;

        if (pdfWidth <= 0 || pdfHeight <= 0) {
            console.warn(`⚠️ Field ${field.id}: Invalid dimensions (${pdfWidth}×${pdfHeight}), using defaults`);
            pdfWidth = DEFAULT_TEXT_WIDTH;
            pdfHeight = DEFAULT_TEXT_HEIGHT;
        } else if (pdfWidth < MIN_PDF_WIDTH || pdfHeight < MIN_PDF_HEIGHT) {
            console.warn(`⚠️ Field ${field.id}: Dimensions too small (${pdfWidth.toFixed(2)}×${pdfHeight.toFixed(2)}), expanding to minimum`);
            if (pdfWidth < MIN_PDF_WIDTH) pdfWidth = MIN_PDF_WIDTH;
            if (pdfHeight < MIN_PDF_HEIGHT) pdfHeight = MIN_PDF_HEIGHT;
        }

        // Calculate bbox percentages for backwards compatibility with rendering
        // (Rendering layer still expects bbox, will be migrated later)
        const bboxXPercent = pdfX / pageWidth;
        const bboxYPercent = pdfY / pageHeight;
        const bboxWPercent = pdfWidth / pageWidth;
        const bboxHPercent = pdfHeight / pageHeight;

        // Assign PDF coordinates to field (V2 format + bbox for rendering compatibility)
        Object.assign(field, {
            pdfX,
            pdfY,
            pdfWidth,
            pdfHeight,
            bbox: [bboxXPercent, bboxYPercent, bboxWPercent, bboxHPercent],  // For rendering
            fontSize: mapper.Core.calculateAutoFitFontSize(height),
            isMapped: true,
            page: mapper.currentPage
        });

        // Validate field using FieldSchema
        const validation = window.FieldSchema.validateField(field);
        if (!validation.valid) {
            console.error('❌ Field validation failed:', field.id, validation.errors);

            // Log each error to UI log panel
            validation.errors.forEach(err => {
                addLog(`❌ Field "${field.id}": ${err}`);
            });

            // Show toast with first error
            mapper.showToast(`שגיאת ולידציה: ${validation.errors[0]}`, 'error');

            // Revert isMapped flag
            field.isMapped = false;
            if (drawingToRemove) drawingToRemove.remove();
            return;
        }

        // Debug log for new field mapping
        console.log("🆕 New field mapped (V2):", {
            id: field.id,
            type: field.type,
            page: mapper.currentPage,
            pdfX,
            pdfY,
            pdfWidth,
            pdfHeight,
            pdfPageSize: { width: pageWidth, height: pageHeight },
            canvasClick: { x: x, y: y }
        });
        addLog(`✅ Field mapped: ${field.id} (${field.type}) at PDF(${pdfX.toFixed(2)}, ${pdfY.toFixed(2)})`);

        // Additional debug log for field placement finish
        const canvas = document.querySelector('.pdf-canvas');
        if (canvas) {
            const logData = {
                offsetX: x,
                offsetY: y,
                width: width,
                height: height,
                canvasLogical: { w: canvas.width, h: canvas.height },
                canvasDisplay: { w: canvas.clientWidth, h: canvas.clientHeight },
                devicePixelRatio: window.devicePixelRatio,
                pdfCoordinates: { pdfX, pdfY, pdfWidth, pdfHeight }
            };
            console.log("[DEBUG] Field placement finished:", logData);
            addLog("Field placement finished", logData);
        }

        // Update complete status
        mapper.updateFieldCompleteStatus(field);

        console.log('🎯 finishDrawing: About to render field', field.id);
        mapper.setStatus(`מצייר overlay לשדה ${field.id}...`, 'info');

        await mapper.renderField(field);

        console.log('🎯 finishDrawing: Render completed for', field.id);

        // ✅ DEBUG: Check if overlay actually exists in DOM
        const overlayCheck = document.querySelector(`.field-overlay[data-field-id="${field.id}"]`);
        if (overlayCheck) {
            console.log('✅ Overlay exists in DOM!', overlayCheck);
            mapper.setStatus(`✅ Overlay נוצר בהצלחה!`, 'success');
        } else {
            console.error('❌ Overlay NOT found in DOM after render!');
            mapper.setStatus(`❌ Overlay לא נמצא ב-DOM!`, 'error');
        }

        // Remove drawing box AFTER render completes (smooth transition)
        if (drawingToRemove) {
            drawingToRemove.remove();
            console.log('🗑️ Removed temporary drawing box');
        }

        mapper.updateFieldList();
        mapper.selectField(field.id, { scroll: false });
        mapper.checkFieldOverlaps();
        mapper.saveState('map_field');

        // Update preview in real-time
        mapper.updatePreviewRealTime();

        // ✅ Check again after all operations
        setTimeout(() => {
            const finalCheck = document.querySelector(`.field-overlay[data-field-id="${field.id}"]`);
            if (finalCheck) {
                console.log('✅ FINAL CHECK: Overlay still exists after 100ms');
            } else {
                console.error('❌ FINAL CHECK: Overlay was removed!');
                mapper.setStatus(`❌ Overlay נמחק אחרי 100ms!`, 'error');
            }
        }, 100);

        mapper.showToast(`השדה "${field.label_he || field.id}" מופה בהצלחה`, 'success');

        mapper.mappingTargetField = null;

        if (mapper.interaction.mode === 'mapping') {
            mapper.interaction.mode = 'idle';
            mapper.interaction.targetFieldId = null;
            mapper.setStatus('מוכן', 'success');
            mapper.updateMappingBadge(null);
        }
    }

    // ============ DRAGGING ============

    /**
     * Start dragging a field overlay
     * @param {HTMLElement} overlay - The overlay element
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} mapper - FieldMapper instance
     */
    function startDrag(overlay, x, y, mapper) {
        const fieldId = overlay.dataset.fieldId;

        // SINGLE ACTIVE OVERLAY: Only allow drag if this overlay is already selected
        // or select it first (which will deactivate all others)
        if (mapper.selectedField && mapper.selectedField.id !== fieldId) {
            // Different field is selected - select this one instead
            mapper.selectField(fieldId);
        } else if (!mapper.selectedField) {
            // No field selected - select this one
            mapper.selectField(fieldId);
        }

        if (!mapper.selectedField || mapper.selectedField.id !== fieldId) return;

        mapper.isDragging = true;
        mapper.dragStart = {
            x: x - overlay.offsetLeft,
            y: y - overlay.offsetTop
        };
    }

    /**
     * Update drag position (immediate version for debounced calls)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} mapper - FieldMapper instance
     */
    function updateDragImmediate(x, y, mapper) {
        if (!mapper.selectedField || !mapper.dragStart) return;

        const container = document.getElementById('mapping-layer');
        if (!container) return;

        const isCheckboxOrRadio = mapper.selectedField.type === 'checkbox' || mapper.selectedField.type === 'radio';

        let newX = x - mapper.dragStart.x;
        let newY = y - mapper.dragStart.y;

        // Apply snap to grid (5px for checkbox/radio, default for others)
        if (isCheckboxOrRadio) {
            newX = Math.round(newX / 5) * 5;
            newY = Math.round(newY / 5) * 5;
        } else {
            newX = mapper.Core.snapToGridValue(newX, mapper.snapToGrid, mapper.gridSize);
            newY = mapper.Core.snapToGridValue(newY, mapper.snapToGrid, mapper.gridSize);
        }

        // Constrain to container
        newX = Math.max(0, Math.min(container.offsetWidth - mapper.selectedField.element.offsetWidth, newX));
        newY = Math.max(0, Math.min(container.offsetHeight - mapper.selectedField.element.offsetHeight, newY));

        mapper.selectedField.element.style.left = newX + 'px';
        mapper.selectedField.element.style.top = newY + 'px';

        // Checkbox/Radio: update anchor (NO bbox)
        if (isCheckboxOrRadio) {
            const layerWidth = Math.max(container.offsetWidth, 1);
            const layerHeight = Math.max(container.offsetHeight, 1);

            // ✅ FIX: Use PDF points (scale 1.0) to match finishDrawing coordinate system
            // pdfPageDimensions is scaled by DPI, we need unscaled PDF points
            const dpiScale = mapper.dpiSetting / 72;
            const pageWidth = (mapper.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
            const pageHeight = (mapper.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;
            const widthScale = pageWidth / layerWidth;
            const heightScale = pageHeight / layerHeight;

            // Calculate center of overlay
            const centerX = newX + (mapper.selectedField.element.offsetWidth / 2);
            const centerY = newY + (mapper.selectedField.element.offsetHeight / 2);

            const xPdf = centerX * widthScale;
            const yPdfTop = centerY * heightScale;
            const yPdfBottom = pageHeight - yPdfTop;

            const xPercent = xPdf / pageWidth;
            const yPercent = yPdfBottom / pageHeight;

            mapper.selectedField.anchor = [xPercent, yPercent];

            console.log("✏️ Checkbox/Radio moved:", {
                id: mapper.selectedField.id,
                type: mapper.selectedField.type,
                anchor: mapper.selectedField.anchor
            });
        } else {
            // Regular fields: update legacy percentages
            mapper.selectedField.xPct = (newX / container.offsetWidth) * 100;
            mapper.selectedField.yPct = (newY / container.offsetHeight) * 100;

            // Update bbox as relative percentages relative to the original PDF page
            if (mapper.selectedField.bbox) {
                const layerWidth = Math.max(container.offsetWidth, 1);
                const layerHeight = Math.max(container.offsetHeight, 1);

                // ✅ FIX: Use PDF points (scale 1.0) to match finishDrawing coordinate system
                // pdfPageDimensions is scaled by DPI, we need unscaled PDF points
                const dpiScale = mapper.dpiSetting / 72;
                const pageWidth = (mapper.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
                const pageHeight = (mapper.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;
                const widthScale = pageWidth / layerWidth;
                const heightScale = pageHeight / layerHeight;

                const elementWidth = mapper.selectedField.element.offsetWidth;
                const elementHeight = mapper.selectedField.element.offsetHeight;
                const xPdf = newX * widthScale;
                const widthPdf = elementWidth * widthScale;
                const yPdfTop = newY * heightScale;
                const heightPdf = elementHeight * heightScale;
                const yPdfBottom = pageHeight - (yPdfTop + heightPdf);

                const xPercent = xPdf / pageWidth;
                const yPercent = yPdfBottom / pageHeight;
                const wPercent = widthPdf / pageWidth;
                const hPercent = heightPdf / pageHeight;
                mapper.selectedField.bbox = [xPercent, yPercent, wPercent, hPercent];

                // Debug log for field move/drag
                console.log("✏️ Field updated (moved):", {
                    id: mapper.selectedField.id,
                    bbox: [xPercent, yPercent, wPercent, hPercent]
                });

                // Additional debug log for field movement
                const canvas = document.querySelector('.pdf-canvas');
                if (canvas) {
                    const logData = {
                        offsetX: newX,
                        offsetY: newY,
                        width: mapper.selectedField.element.offsetWidth,
                        height: mapper.selectedField.element.offsetHeight,
                        canvasLogical: { w: canvas.width, h: canvas.height },
                        canvasDisplay: { w: canvas.clientWidth, h: canvas.clientHeight },
                        devicePixelRatio: window.devicePixelRatio,
                        bbox_percentages: [xPercent, yPercent, wPercent, hPercent]
                    };
                    console.log("[DEBUG] Field moved:", logData);
                    addLog("Field moved", logData);
                }
            }
        }

        if (mapper.expandedFieldId === mapper.selectedField.id) {
            mapper.updateFieldList();
        }
    }

    // ============ RESIZING ============

    /**
     * Start resizing a field
     * @param {HTMLElement} handle - The resize handle element
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} mapper - FieldMapper instance
     */
    function startResize(handle, x, y, mapper) {
        const overlay = handle.closest('.field-overlay');
        if (!overlay) return;

        const fieldId = overlay.dataset.fieldId;

        // SINGLE ACTIVE OVERLAY: Only allow resize if this overlay is already selected
        // or select it first (which will deactivate all others)
        if (mapper.selectedField && mapper.selectedField.id !== fieldId) {
            // Different field is selected - select this one instead
            mapper.selectField(fieldId);
        } else if (!mapper.selectedField) {
            // No field selected - select this one
            mapper.selectField(fieldId);
        }

        if (!mapper.selectedField || mapper.selectedField.id !== fieldId) return;

        mapper.isResizing = true;
        mapper.resizeHandle = handle.className.split(' ').find(c => c !== 'resize-handle');
        mapper.dragStart = {
            x, y,
            left: overlay.offsetLeft,
            top: overlay.offsetTop,
            width: overlay.offsetWidth,
            height: overlay.offsetHeight
        };
    }

    /**
     * Update resize dimensions (immediate version for debounced calls)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} mapper - FieldMapper instance
     */
    function updateResizeImmediate(x, y, mapper) {
        if (!mapper.selectedField || !mapper.dragStart || !mapper.resizeHandle) return;

        const container = document.getElementById('mapping-layer');
        if (!container) return;

        const isCheckboxOrRadio = mapper.selectedField.type === 'checkbox' || mapper.selectedField.type === 'radio';

        // Apply snap to grid (5px for checkbox/radio, default for others)
        if (isCheckboxOrRadio) {
            x = Math.round(x / 5) * 5;
            y = Math.round(y / 5) * 5;
        } else {
            x = mapper.Core.snapToGridValue(x, mapper.snapToGrid, mapper.gridSize);
            y = mapper.Core.snapToGridValue(y, mapper.snapToGrid, mapper.gridSize);
        }

        const dx = x - mapper.dragStart.x;
        const dy = y - mapper.dragStart.y;

        let newLeft = mapper.dragStart.left;
        let newTop = mapper.dragStart.top;
        let newWidth = mapper.dragStart.width;
        let newHeight = mapper.dragStart.height;

        if (mapper.resizeHandle.includes('w')) {
            newLeft = mapper.dragStart.left + dx;
            newWidth = mapper.dragStart.width - dx;
        }
        if (mapper.resizeHandle.includes('e')) {
            newWidth = mapper.dragStart.width + dx;
        }
        if (mapper.resizeHandle.includes('n')) {
            newTop = mapper.dragStart.top + dy;
            newHeight = mapper.dragStart.height - dy;
        }
        if (mapper.resizeHandle.includes('s')) {
            newHeight = mapper.dragStart.height + dy;
        }

        // CRITICAL: Enforce 1:1 aspect ratio for checkbox/radio
        if (isCheckboxOrRadio) {
            // Use the larger dimension to maintain visual feedback
            const size = Math.max(Math.abs(newWidth), Math.abs(newHeight));
            newWidth = size;
            newHeight = size;

            // Adjust position to keep overlay centered during resize
            if (mapper.resizeHandle.includes('w')) {
                newLeft = mapper.dragStart.left + mapper.dragStart.width - size;
            }
            if (mapper.resizeHandle.includes('n')) {
                newTop = mapper.dragStart.top + mapper.dragStart.height - size;
            }
        }

        newWidth = Math.max(isCheckboxOrRadio ? 10 : 30, newWidth);
        newHeight = Math.max(isCheckboxOrRadio ? 10 : 20, newHeight);
        newLeft = Math.max(0, Math.min(container.offsetWidth - newWidth, newLeft));
        newTop = Math.max(0, Math.min(container.offsetHeight - newHeight, newTop));

        const element = mapper.selectedField.element;
        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
        element.style.width = newWidth + 'px';
        element.style.height = newHeight + 'px';

        // Checkbox/Radio: update overlayWidth/overlayHeight (NO bbox)
        if (isCheckboxOrRadio) {
            mapper.selectedField.overlayWidth = newWidth;
            mapper.selectedField.overlayHeight = newHeight;

            console.log("✏️ Checkbox/Radio resized:", {
                id: mapper.selectedField.id,
                type: mapper.selectedField.type,
                overlaySize: `${newWidth}x${newHeight}`
            });
        } else {
            // Regular fields: update legacy percentages
            mapper.selectedField.xPct = (newLeft / container.offsetWidth) * 100;
            mapper.selectedField.yPct = (newTop / container.offsetHeight) * 100;
            mapper.selectedField.wPct = (newWidth / container.offsetWidth) * 100;
            mapper.selectedField.hPct = (newHeight / container.offsetHeight) * 100;
        }

        // Update bbox as relative percentages relative to the original PDF page (NOT for checkbox/radio)
        if (mapper.selectedField.bbox && !isCheckboxOrRadio) {
            const layerWidth = Math.max(container.offsetWidth, 1);
            const layerHeight = Math.max(container.offsetHeight, 1);

            // ✅ FIX: Use PDF points (scale 1.0) to match finishDrawing coordinate system
            // pdfPageDimensions is scaled by DPI, we need unscaled PDF points
            const dpiScale = mapper.dpiSetting / 72;
            const pageWidth = (mapper.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
            const pageHeight = (mapper.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;
            const widthScale = pageWidth / layerWidth;
            const heightScale = pageHeight / layerHeight;

            const xPdf = newLeft * widthScale;
            const widthPdf = newWidth * widthScale;
            const yPdfTop = newTop * heightScale;
            const heightPdf = newHeight * heightScale;
            const yPdfBottom = pageHeight - (yPdfTop + heightPdf);

            const xPercent = xPdf / pageWidth;
            const yPercent = yPdfBottom / pageHeight;
            const wPercent = widthPdf / pageWidth;
            const hPercent = heightPdf / pageHeight;
            mapper.selectedField.bbox = [xPercent, yPercent, wPercent, hPercent];

            // Debug log for field resize
            console.log("✏️ Field updated (resized):", {
                id: mapper.selectedField.id,
                bbox: [xPercent, yPercent, wPercent, hPercent]
            });

            // Additional debug log for field resizing
            const canvas = document.querySelector('.pdf-canvas');
            if (canvas) {
                const logData = {
                    offsetX: newLeft,
                    offsetY: newTop,
                    width: newWidth,
                    height: newHeight,
                    canvasLogical: { w: canvas.width, h: canvas.height },
                    canvasDisplay: { w: canvas.clientWidth, h: canvas.clientHeight },
                    devicePixelRatio: window.devicePixelRatio,
                    bbox_percentages: [xPercent, yPercent, wPercent, hPercent]
                };
                console.log("[DEBUG] Field resized:", logData);
                addLog("Field resized", logData);
            }
        }

        mapper.selectedField.fontSize = mapper.Core.calculateAutoFitFontSize(newHeight);
        const text = element.querySelector('.field-text');
        if (text) {
            text.style.fontSize = mapper.selectedField.fontSize + 'px';
        }

        mapper.updateFieldEditor();
        mapper.checkFieldOverlaps();
    }

    // ============ EXPORT ============

    window.MapperDragEngine = {
        startDrawing,
        updateDrawing,
        finishDrawing,
        startDrag,
        updateDragImmediate,
        startResize,
        updateResizeImmediate
    };
})();
