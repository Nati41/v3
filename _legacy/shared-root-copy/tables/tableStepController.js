/**
 * Table Step Controller
 * Controls the flow of table mapping through 6 steps
 *
 * Steps:
 * 0 - IDLE: Not in table mode
 * 1 - HEADER: Select table header row
 * 2 - SAMPLE_ROW: Select one example data row
 * 3 - COLUMNS: Draw columns within the sample row
 * 4 - ROW_COUNT: Enter total number of rows
 * 5 - GENERATE: Auto-generate all table cells
 * 6 - REVIEW: Final review and confirmation
 */

export const TableSteps = {
    IDLE: 0,
    HEADER: 1,
    SAMPLE_ROW: 2,
    COLUMNS: 3,
    ROW_COUNT: 4,
    GENERATE: 5,
    REVIEW: 6,
};

export class TableStepController {
    /**
     * @param {TableUIManager} ui - UI manager for panels and messages
     * @param {TableOverlay} overlay - Overlay manager for visual hints
     * @param {Object} validator - Validation functions
     * @param {TableModel} model - Table data model
     */
    constructor(ui, overlay, validator, model) {
        this.ui = ui;
        this.overlay = overlay;
        this.validator = validator;
        this.model = model;
        this.currentStep = TableSteps.IDLE;

        // Callback for when table is finished
        this.onFinish = null;
    }

    /**
     * Start the table mapping process
     */
    start() {
        // Reset the model to clear any previous data
        this.model.reset();

        // Hide any existing overlay
        this.overlay.hide();

        // Set up UI callbacks
        this.ui.setCallbacks({
            onNext: () => this.next(),
            onBack: () => this.back(),
            onCancel: () => this.cancel(),
            onRowCountChange: (value) => this._handleRowCountChange(value),
            onColumnDelete: (columnId) => this.deleteColumn(columnId),
            onColumnEdit: (columnId) => this.editColumn(columnId)
        });

        // Activate "Table Mode" toolbar state
        this.ui.activateToolbar();

        // Jump to Step 1 (HEADER)
        this.goTo(TableSteps.HEADER);
    }

    /**
     * Handle row count input change
     * @param {number} value - Row count value
     */
    _handleRowCountChange(value) {
        if (this.currentStep !== TableSteps.ROW_COUNT) return;

        const validation = this.validator.rowCount(value);

        if (validation.valid) {
            this.model.setRowCount(value);
            this.ui.unlockNext();
        } else {
            this.ui.lockNext();
        }
    }

    /**
     * Go to a specific step
     * @param {number} step - Step number from TableSteps
     */
    goTo(step) {
        // Validate step is within valid range
        if (step < TableSteps.IDLE || step > TableSteps.REVIEW) {
            this.ui.showMessage('error', 'שלב לא תקין');
            return;
        }

        // Update current step
        this.currentStep = step;

        // Clear temporary overlays but keep columns during transitions
        this.overlay.clearTemporary();
        // Also clear columns for steps that need to rebuild them
        if (step !== TableSteps.COLUMNS && step !== TableSteps.ROW_COUNT) {
            this.overlay.clearColumns();
        }

        // Tell the UI to show the correct step panel
        this.ui.showStepPanel(step);

        // Update the step progress indicator
        this.ui.updateProgress(step);

        // Lock/unlock the "Next" button depending on the state
        switch (step) {
            case TableSteps.HEADER:
                // Lock until header is drawn
                this.ui.lockNext();
                break;

            case TableSteps.SAMPLE_ROW:
                // Lock until sample row is drawn
                this.ui.lockNext();
                // Show header hint to remind user where header is
                if (this.model.headerBBox) {
                    this.overlay.showHeaderHint(this.model.headerBBox);
                }
                break;

            case TableSteps.COLUMNS:
                // Lock until at least one column is defined
                this.ui.lockNext();
                // Show sample row hint and highlight drawing area
                if (this.model.sampleRowBBox) {
                    this.overlay.showSampleRowHint(this.model.sampleRowBBox);
                    this.overlay.highlightDrawingArea(this.model.sampleRowBBox);
                }
                // Show existing columns
                this.model.columns.forEach((col, idx) => {
                    this.overlay.showColumnHint(idx, col.bbox, col.hebrewName);
                });
                // Update column list
                this.ui.updateColumnList(this.model.columns);
                // Unlock if we already have columns
                if (this.model.columns.length > 0) {
                    this.ui.unlockNext();
                }
                break;

            case TableSteps.ROW_COUNT:
                // Lock until row count is entered
                this.ui.lockNext();
                // Show sample row and columns preview
                if (this.model.sampleRowBBox) {
                    this.overlay.showSampleRowHint(this.model.sampleRowBBox);
                }
                this.model.columns.forEach((col, idx) => {
                    this.overlay.showColumnHint(idx, col.bbox, col.hebrewName);
                });
                // Unlock if we already have row count
                if (this.model.rowCount > 0) {
                    this.ui.unlockNext();
                }
                break;

            case TableSteps.GENERATE:
                // Lock during generation
                this.ui.lockNext();
                // Auto-generate rows
                this._generateTable();
                break;

            case TableSteps.REVIEW:
                // Unlock for final confirmation
                this.ui.unlockNext();
                // Show preview
                this.overlay.showDonePreview(this.model);
                // Show summary in panel
                this.ui.showSummary(this.model);
                break;

            case TableSteps.IDLE:
            default:
                // Reset state
                this.ui.deactivateToolbar();
                break;
        }
    }

    /**
     * Move to next step
     */
    next() {
        const step = this.currentStep;

        // Validate current step before progressing
        const validation = this.validator.validateStep(step, this.model);

        if (!validation.valid) {
            this.ui.showMessage('error', validation.error || 'יש להשלים את השלב הנוכחי');
            return;
        }

        // If we're at the review step, finish the process
        if (step === TableSteps.REVIEW) {
            this.finish();
            return;
        }

        // Move to next step
        this.goTo(step + 1);
    }

    /**
     * Go back to previous step
     */
    back() {
        if (this.currentStep > TableSteps.HEADER) {
            this.goTo(this.currentStep - 1);
        }
    }

    /**
     * Refresh overlays after resize/zoom
     * Called by mapper when window is resized
     */
    refreshOverlays() {
        if (!this.isActive()) return;

        // Re-render current step overlays based on model state
        switch (this.currentStep) {
            case TableSteps.HEADER:
                if (this.model.headerBBox) {
                    this.overlay.showHeaderHint(this.model.headerBBox);
                }
                break;
            case TableSteps.SAMPLE_ROW:
                if (this.model.headerBBox) {
                    this.overlay.showHeaderHint(this.model.headerBBox);
                }
                if (this.model.sampleRowBBox) {
                    this.overlay.showSampleRowHint(this.model.sampleRowBBox);
                }
                break;
            case TableSteps.COLUMNS:
            case TableSteps.ROW_COUNT:
                this.overlay.clearColumns();
                this.model.columns.forEach((col, index) => {
                    this.overlay.showColumnHint(index, col.bbox, col.hebrewName);
                });
                if (this.currentStep === TableSteps.ROW_COUNT && this.model.rowCount > 0) {
                    this.overlay.showRowHint(this.model.rowCount, this.model.sampleRowBBox, this.model.rowHeight);
                }
                break;
            case TableSteps.GENERATE:
            case TableSteps.REVIEW:
                this.overlay.showDonePreview(this.model);
                break;
        }
    }

    /**
     * Clean up all table-related hints from the DOM
     * CRITICAL: Prevents ghost hints appearing in idle mode
     * @param {string} source - Caller identifier for debugging
     */
    cleanupHints(source = 'unknown') {
        // Remove all table hints
        document.querySelectorAll('.table-hint').forEach(el => el.remove());
        document.querySelectorAll('.table-header-hint').forEach(el => el.remove());
        document.querySelectorAll('.table-row-hint').forEach(el => el.remove());
        document.querySelectorAll('.table-column-hint').forEach(el => el.remove());
        document.querySelectorAll('.table-drawing-area').forEach(el => el.remove());
        document.querySelectorAll('.table-sample-row-hint').forEach(el => el.remove());
        document.querySelectorAll('.table-cell-preview').forEach(el => el.remove());
        // Also clear by ID pattern
        document.querySelectorAll('[id^="table-hint-"]').forEach(el => el.remove());
        document.querySelectorAll('[id^="column-hint-"]').forEach(el => el.remove());

        console.log('[TableHints] Cleaned by:', source);
    }

    /**
     * Cancel table mapping and reset
     */
    cancel() {
        // Clean up all hints before reset
        this.cleanupHints('cancel');

        // Reset model
        this.model.reset();

        // Clear all overlays
        this.overlay.clearAll();

        // Deactivate UI
        this.ui.deactivateToolbar();

        // Set step to IDLE
        this.currentStep = TableSteps.IDLE;

        // Show cancellation message
        this.ui.showMessage('info', 'מיפוי הטבלה בוטל');

        // Call cancel callback if provided
        if (this.onCancel && typeof this.onCancel === 'function') {
            this.onCancel();
        }
    }

    /**
     * Complete the table mapping
     */
    finish() {
        // Validate all data
        const validation = this.validator.complete(this.model);

        if (!validation.valid) {
            this.ui.showMessage('error', validation.errors.join(', '));
            return;
        }

        // Mark table as complete
        this.model.isComplete = true;
        this.model.createdAt = new Date().toISOString();

        // Get the table data in mapping-compatible format
        const tableData = this.model.toMappingJSON();

        // Also generate field overlays for the mapper
        const fieldOverlays = this.model.generateFieldOverlays();

        console.log('[TableStepController] Table finished:', {
            tableId: tableData.tableId,
            columns: tableData.columns.length,
            rows: tableData.rows.length,
            fieldOverlays: fieldOverlays.length
        });

        // Clean up all hints before finishing
        this.cleanupHints('finish');

        // Clear all overlays
        this.overlay.clearAll();

        // Deactivate UI
        this.ui.deactivateToolbar();

        // Reset step to IDLE
        this.currentStep = TableSteps.IDLE;

        // Show success message
        this.ui.showMessage('success', 'הטבלה נשמרה בהצלחה!');

        // Call the finish callback if provided
        // Pass both the table data and the field overlays
        if (this.onFinish && typeof this.onFinish === 'function') {
            this.onFinish(tableData, fieldOverlays);
        }

        return tableData;
    }

    /**
     * Unlock the next button (called externally when step is complete)
     */
    unlockNext() {
        this.ui.unlockNext();
    }

    /**
     * Get current step
     * @returns {number} Current step number
     */
    getCurrentStep() {
        return this.currentStep;
    }

    /**
     * Check if in table mapping mode
     * @returns {boolean} True if in table mode
     */
    isActive() {
        return this.currentStep !== TableSteps.IDLE;
    }

    /**
     * Internal: Generate the table
     * Creates all rows based on sample row and columns
     */
    _generateTable() {
        // Precondition checks
        if (!this.model.headerBBox) {
            this.ui.showMessage('error', 'חסרה כותרת - חזור לשלב 1');
            return;
        }
        if (!this.model.sampleRowBBox) {
            this.ui.showMessage('error', 'חסרה שורה לדוגמא - חזור לשלב 2');
            return;
        }
        if (this.model.columns.length === 0) {
            this.ui.showMessage('error', 'לא הוגדרו עמודות - חזור לשלב 3');
            return;
        }
        if (this.model.rowCount <= 0) {
            this.ui.showMessage('error', 'מספר שורות לא תקין - חזור לשלב 4');
            return;
        }

        // Compute row height from sample row
        this.model.computeRowHeightFromSampleRow();

        // Generate all rows
        const rows = this.model.generateRows();

        if (rows.length > 0) {
            const totalCells = rows.length * this.model.columns.length;
            this.ui.showMessage('success', `נוצרו ${rows.length} שורות (${totalCells} תאים)`);

            // Show loading briefly then proceed to review
            setTimeout(() => {
                this.goTo(TableSteps.REVIEW);
            }, 500);
        } else {
            this.ui.showMessage('error', 'לא ניתן ליצור שורות - בדוק את ההגדרות');
        }
    }

    // ============ DRAWING HANDLERS (Step 3 Implementation) ============

    /**
     * Handle pointer down event
     * @param {Event} evt - Mouse event
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} false to block underlying handlers, true to allow
     */
    handlePointerDown(evt, x, y) {
        if (!this.isActive()) {
            return true; // Allow other modes when table mode is off
        }

        // Block other modes while table mode is active
        evt.stopPropagation();
        return false; // Signal to start drawing for table
    }

    /**
     * Handle completed rectangle drawing
     * @param {Object} bbox - Bounding box { x, y, width, height }
     */
    onRectangleDrawn(bbox) {
        if (!this.isActive()) return;

        switch (this.currentStep) {
            case TableSteps.HEADER:
                this._handleHeaderDraw(bbox);
                break;

            case TableSteps.SAMPLE_ROW:
                this._handleSampleRowDraw(bbox);
                break;

            case TableSteps.COLUMNS:
                this._handleColumnDraw(bbox);
                break;

            default:
                console.log('[TableStepController] Rectangle drawn in unexpected step:', this.currentStep);
                break;
        }
    }

    /**
     * Handle header rectangle drawing
     * @param {Object} bbox - Bounding box { x, y, width, height }
     */
    _handleHeaderDraw(bbox) {
        // Validate the header
        const validation = this.validator.header(bbox);

        if (!validation.valid) {
            this.ui.showMessage('error', validation.error || 'אזור הכותרת לא תקין');
            return;
        }

        // Assign to model
        this.model.setHeader(bbox);

        // Show overlay feedback
        this.overlay.showHeaderHint(bbox);

        // Unlock NEXT button
        this.ui.unlockNext();

        // Show success message
        this.ui.showMessage('success', 'כותרת נבחרה בהצלחה');

        // Auto-advance after 600ms
        setTimeout(() => {
            if (this.currentStep === TableSteps.HEADER) {
                this.next();
            }
        }, 600);
    }

    /**
     * Handle sample row rectangle drawing
     * @param {Object} bbox - Bounding box { x, y, width, height }
     */
    _handleSampleRowDraw(bbox) {
        // Validate relative to header
        const validation = this.validator.row(bbox, this.model.headerBBox);

        if (!validation.valid) {
            this.ui.showMessage('error', validation.error || 'שורת הדוגמא לא תקינה');
            return;
        }

        // Save to model
        this.model.setSampleRow(bbox);

        // Show overlay
        this.overlay.showSampleRowHint(bbox);

        // Unlock NEXT button
        this.ui.unlockNext();

        // Show success message
        this.ui.showMessage('success', 'שורה לדוגמא נבחרה בהצלחה');

        // Auto-advance after 500ms
        setTimeout(() => {
            if (this.currentStep === TableSteps.SAMPLE_ROW) {
                this.next();
            }
        }, 500);
    }

    /**
     * Handle column rectangle drawing
     * @param {Object} bbox - Bounding box { x, y, width, height }
     */
    _handleColumnDraw(bbox) {
        // Validate the column
        const validation = this.validator.column(
            bbox,
            this.model.sampleRowBBox,
            this.model.columns
        );

        if (!validation.valid) {
            this.ui.showMessage('error', validation.error || 'העמודה לא תקינה');
            return;
        }

        // Ask for column details using the UI prompt
        this.ui.promptColumnDetails()
            .then(({ name, type }) => {
                // Add column to model
                const column = this.model.addColumn(bbox, name, type);

                // Show column overlay
                this.overlay.showColumnHint(
                    this.model.columns.length - 1,
                    bbox,
                    name || `עמודה ${this.model.columns.length}`
                );

                // Update the column list in sidebar
                this.ui.updateColumnList(this.model.columns);

                // Unlock NEXT if we have at least one column
                if (this.model.columns.length > 0) {
                    this.ui.unlockNext();
                }

                // Show success message
                this.ui.showMessage('success', `עמודה "${name || column.columnId}" נוספה`);
            })
            .catch((err) => {
                // User cancelled or error
                console.log('[TableStepController] Column details cancelled:', err);
            });
    }

    /**
     * Edit a column's details
     * @param {string} columnId - Column ID to edit
     */
    editColumn(columnId) {
        const column = this.model.columns.find(c => c.columnId === columnId);
        if (!column) return;

        this.ui.promptColumnDetails(column.hebrewName, column.type)
            .then(({ name, type }) => {
                this.model.updateColumn(columnId, {
                    hebrewName: name,
                    type: type
                });

                // Update column list
                this.ui.updateColumnList(this.model.columns);

                // Update overlay
                const colIndex = this.model.columns.findIndex(c => c.columnId === columnId);
                if (colIndex !== -1) {
                    this.overlay.clearColumns();
                    this.model.columns.forEach((col, idx) => {
                        this.overlay.showColumnHint(idx, col.bbox, col.hebrewName);
                    });
                }

                this.ui.showMessage('success', 'העמודה עודכנה');
            })
            .catch(() => {
                // User cancelled
            });
    }

    /**
     * Delete a column
     * @param {string} columnId - Column ID to delete
     */
    deleteColumn(columnId) {
        this.model.removeColumn(columnId);

        // Update column list
        this.ui.updateColumnList(this.model.columns);

        // Redraw column overlays
        this.overlay.clearColumns();
        this.model.columns.forEach((col, idx) => {
            this.overlay.showColumnHint(idx, col.bbox, col.hebrewName);
        });

        // Lock NEXT if no columns left
        if (this.model.columns.length === 0) {
            this.ui.lockNext();
        }

        this.ui.showMessage('info', 'העמודה נמחקה');
    }
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.TableStepController = TableStepController;
    window.TableSteps = TableSteps;
}
