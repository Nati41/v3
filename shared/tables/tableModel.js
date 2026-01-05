/**
 * Table Model
 * Data structure for storing table mapping information
 *
 * Structure:
 * - headerBBox: Header region coordinates
 * - sampleRowBBox: Sample row region coordinates
 * - columns: Array of column definitions
 * - rowCount: Total number of data rows
 * - rows: Generated row data (after step 5)
 *
 * Compatible with the old table-engine.js JSON format for backwards compatibility.
 */

export class TableModel {
    constructor(page = 1) {
        // Table identification
        this.tableId = `table_${Date.now()}`;
        this.page = page;

        // Geometric regions (canvas coordinates - will be converted to PDF on export)
        this.headerBBox = null;      // { x, y, width, height }
        this.sampleRowBBox = null;   // { x, y, width, height }

        // Combined table bbox (calculated from header + data area)
        this.bbox = null;            // { x, y, width, height }

        // Column definitions
        this.columns = [];
        // Each column: { columnId, hebrewName, englishId, type, bbox, linked }

        // Row configuration
        this.rowCount = 0;
        this.rowHeight = 0;  // Calculated from sampleRowBBox
        this.repeatDirection = 'vertical';
        this.sampleRowIndex = 0;

        // Generated rows (populated in step 5)
        this.rows = [];
        // Each row: { col_1: { x, y, width, height }, col_2: {...}, ... }

        // State flags
        this.isComplete = false;
        this.createdAt = null;
    }

    /**
     * Set the header bounding box
     * @param {Object} bbox - { x, y, width, height }
     */
    setHeader(bbox) {
        this.headerBBox = { ...bbox };
    }

    /**
     * Set the sample row bounding box
     * @param {Object} bbox - { x, y, width, height }
     */
    setSampleRow(bbox) {
        this.sampleRowBBox = { ...bbox };
        this.rowHeight = bbox.height;
    }

    /**
     * Add a column to the table
     * @param {Object} bbox - Column bounding box { x, y, width, height }
     * @param {string} name - Hebrew name for the column
     * @param {string} type - Field type: 'text', 'number', 'date', 'checkbox'
     * @returns {Object} The created column object
     */
    addColumn(bbox, name, type = 'text') {
        const columnIndex = this.columns.length + 1;
        const columnId = `col_${columnIndex}`;

        const column = {
            columnId: columnId,
            hebrewName: name || '',
            englishId: this.toEnglishId(name) || columnId,
            type: type,
            bbox: { ...bbox },
            linked: !!name  // Compatible with old table-engine format
        };

        this.columns.push(column);
        return column;
    }

    /**
     * Update a column's properties
     * @param {string} columnId - Column ID to update
     * @param {Object} updates - Properties to update
     */
    updateColumn(columnId, updates) {
        const column = this.columns.find(c => c.columnId === columnId);
        if (column) {
            Object.assign(column, updates);
            if (updates.hebrewName) {
                column.englishId = this.toEnglishId(updates.hebrewName);
            }
        }
    }

    /**
     * Remove a column
     * @param {string} columnId - Column ID to remove
     */
    removeColumn(columnId) {
        const index = this.columns.findIndex(c => c.columnId === columnId);
        if (index !== -1) {
            this.columns.splice(index, 1);
        }
    }

    /**
     * Set the total row count
     * @param {number} num - Number of rows
     */
    setRowCount(num) {
        this.rowCount = parseInt(num, 10) || 0;
    }

    /**
     * Compute row height from sample row bbox with precision
     * CRITICAL: Uses exact sample row height - NOT inferred from header
     * Uses 4 decimal precision to avoid floating-point drift
     * @returns {number} The computed row height
     */
    computeRowHeightFromSampleRow() {
        if (!this.sampleRowBBox) {
            console.warn('[TableModel] Cannot compute row height: no sample row defined');
            return 0;
        }

        // CRITICAL: rowHeight = sampleRowBBox.height (exact, not inferred)
        // Use 4 decimal precision (±0.0001px tolerance)
        this.rowHeight = this._precision(this.sampleRowBBox.height);

        console.log('[TableModel] Computed row height from sample row:', {
            sampleRowHeight: this.sampleRowBBox.height,
            precisionRowHeight: this.rowHeight
        });

        return this.rowHeight;
    }

    /**
     * Round to 4 decimal precision to avoid floating-point drift
     * Uses Number().toFixed(4) for maximum accuracy
     * @param {number} value - Value to round
     * @returns {number} Rounded value
     */
    _precision(value) {
        return Number(value.toFixed(4));
    }

    /**
     * Calculate and set the table bbox from header and data area
     * Includes header height in total table height calculation
     */
    computeTableBBox() {
        if (!this.sampleRowBBox || this.rowCount === 0) {
            console.warn('[TableModel] Cannot compute table bbox: missing sampleRowBBox or rowCount');
            return;
        }

        // Calculate header height if header exists
        const headerHeight = this.headerBBox ? this._precision(this.headerBBox.height) : 0;

        // Table data starts at sample row Y position
        const dataTop = this._precision(this.sampleRowBBox.y);

        // Total data height = rowCount * rowHeight (with precision)
        const dataHeight = this._precision(this.rowCount * this.rowHeight);

        // Get the leftmost and rightmost column positions
        let minX = this._precision(this.sampleRowBBox.x);
        let maxX = this._precision(this.sampleRowBBox.x + this.sampleRowBBox.width);

        if (this.columns.length > 0) {
            minX = this._precision(Math.min(...this.columns.map(c => c.bbox.x)));
            maxX = this._precision(Math.max(...this.columns.map(c => c.bbox.x + c.bbox.width)));
        }

        // Table top includes header if present
        const tableTop = this.headerBBox ? this._precision(this.headerBBox.y) : dataTop;

        // Total height = header height + data height
        const totalHeight = this.headerBBox
            ? this._precision(headerHeight + dataHeight)
            : dataHeight;

        this.bbox = {
            x: minX,
            y: tableTop,
            width: this._precision(maxX - minX),
            height: totalHeight
        };

        console.log('[TableModel] Computed table bbox:', this.bbox, {
            headerHeight,
            dataHeight,
            totalHeight,
            rowCount: this.rowCount,
            rowHeight: this.rowHeight
        });
    }

    /**
     * Generate all rows based on sample row and columns
     * Compatible with old table-engine generateRows format
     *
     * CRITICAL: Uses PROPORTIONAL SEGMENTATION to avoid cumulative rounding errors
     * Formula: row[i].y = startY + (i / rowCount) * totalHeight
     * This ensures last row ends exactly at bbox.bottom with zero drift
     *
     * @returns {Array} Generated rows
     */
    generateRows() {
        // Precondition checks
        if (!this.sampleRowBBox) {
            console.warn('[TableModel] Cannot generate rows: no sample row defined');
            return [];
        }
        if (this.columns.length === 0) {
            console.warn('[TableModel] Cannot generate rows: no columns defined');
            return [];
        }
        if (this.rowCount === 0) {
            console.warn('[TableModel] Cannot generate rows: rowCount is 0');
            return [];
        }

        // Ensure row height is computed with precision
        if (!this.rowHeight || this.rowHeight === 0) {
            this.computeRowHeightFromSampleRow();
        }

        // Compute table bbox
        this.computeTableBBox();

        this.rows = [];

        // CRITICAL: Use PROPORTIONAL SEGMENTATION for zero cumulative drift
        // startY = the Y coordinate of the sample row (first data row)
        // totalHeight = total data area height (rowCount * rowHeight)
        const startY = this.sampleRowBBox.y;
        const totalHeight = this.rowCount * this.rowHeight;

        console.log('[TableModel] Generating rows with PROPORTIONAL segmentation:', {
            startY,
            totalHeight,
            rowCount: this.rowCount,
            columns: this.columns.length,
            formula: 'row[i].y = startY + (i / rowCount) * totalHeight'
        });

        for (let rowIndex = 0; rowIndex < this.rowCount; rowIndex++) {
            const row = {};

            // CRITICAL: PROPORTIONAL SEGMENTATION — no cumulative rounding
            // Formula: row[i].y = startY + (i / rowCount) * totalHeight
            // Do NOT round during calculation - only for final display if needed
            const rowY = startY + (rowIndex / this.rowCount) * totalHeight;
            const nextRowY = startY + ((rowIndex + 1) / this.rowCount) * totalHeight;
            const cellHeight = nextRowY - rowY;

            this.columns.forEach(col => {
                // Create cell data matching old table-engine format
                // Use raw values - no rounding during calculation
                row[col.columnId] = {
                    x: col.bbox.x,
                    y: rowY,
                    width: col.bbox.width,
                    height: cellHeight,
                    type: col.type || 'text',
                    rowIndex: rowIndex
                };
            });

            this.rows.push(row);
        }

        // Validation: verify last row ends exactly at bbox.bottom
        const lastRow = this.rows[this.rows.length - 1];
        const lastRowBottom = lastRow ? (Object.values(lastRow)[0].y + Object.values(lastRow)[0].height) : 0;
        const expectedBottom = startY + totalHeight;

        console.log('[TableModel] Generated', this.rows.length, 'rows (proportional):', {
            firstRowY: startY,
            lastRowY: lastRow ? Object.values(lastRow)[0].y : 0,
            lastRowBottom: lastRowBottom,
            expectedBottom: expectedBottom,
            bottomDrift: Math.abs(lastRowBottom - expectedBottom)
        });

        // Validation check
        if (this.rows.length !== this.rowCount) {
            console.error('[TableModel] Row count mismatch! Expected:', this.rowCount, 'Got:', this.rows.length);
        }

        // VERIFY: Last row should end EXACTLY at expectedBottom (zero drift)
        if (Math.abs(lastRowBottom - expectedBottom) > 0.001) {
            console.warn('[TableModel] Bottom drift detected:', lastRowBottom - expectedBottom);
        }

        return this.rows;
    }

    /**
     * Convert Hebrew name to English ID
     * @param {string} hebrewName - Hebrew name
     * @returns {string} English ID
     */
    toEnglishId(hebrewName) {
        if (!hebrewName) return '';

        // Hebrew to English mapping for common words
        const mapping = {
            'שם': 'name',
            'תעודת זהות': 'id_number',
            'ת.ז.': 'id_number',
            'תאריך': 'date',
            'כתובת': 'address',
            'טלפון': 'phone',
            'דוא"ל': 'email',
            'אימייל': 'email',
            'חתימה': 'signature',
            'הערות': 'notes',
            'סכום': 'amount',
            'מספר': 'number'
        };

        const lower = hebrewName.trim();
        if (mapping[lower]) {
            return mapping[lower];
        }

        // Generate generic ID
        return `field_${Date.now()}`;
    }

    /**
     * Get table summary for display
     * @returns {Object} Summary object
     */
    getSummary() {
        return {
            tableId: this.tableId,
            columnsCount: this.columns.length,
            rowCount: this.rowCount,
            totalCells: this.columns.length * this.rowCount,
            columns: this.columns.map(c => ({
                name: c.hebrewName,
                type: c.type
            })),
            isComplete: this.isComplete
        };
    }

    /**
     * Export table to JSON format (internal format with all data)
     * @returns {Object} JSON-serializable table data
     */
    toJSON() {
        return {
            tableId: this.tableId,
            page: this.page,
            headerBBox: this.headerBBox,
            sampleRowBBox: this.sampleRowBBox,
            bbox: this.bbox,
            rowCount: this.rowCount,
            rowHeight: this.rowHeight,
            repeatDirection: this.repeatDirection,
            sampleRowIndex: this.sampleRowIndex,
            columns: this.columns.map(col => ({
                columnId: col.columnId,
                hebrewName: col.hebrewName,
                englishId: col.englishId,
                type: col.type,
                bbox: col.bbox,
                linked: col.linked
            })),
            rows: this.rows,
            isComplete: this.isComplete,
            createdAt: this.createdAt
        };
    }

    /**
     * Export table to mapping JSON format
     * Compatible with the old table-engine.js exportTableToJSON format
     * @returns {Object} Table data in mapper export format
     */
    toMappingJSON() {
        return {
            tableId: this.tableId,
            page: this.page,
            bbox: this.bbox ? {
                x: this.bbox.x,
                y: this.bbox.y,
                width: this.bbox.width,
                height: this.bbox.height
            } : null,
            headerBBox: this.headerBBox ? {
                x: this.headerBBox.x,
                y: this.headerBBox.y,
                width: this.headerBBox.width,
                height: this.headerBBox.height
            } : null,
            sampleRowBBox: this.sampleRowBBox ? {
                x: this.sampleRowBBox.x,
                y: this.sampleRowBBox.y,
                width: this.sampleRowBBox.width,
                height: this.sampleRowBBox.height
            } : null,
            rowCount: this.rowCount,
            rowHeight: this.rowHeight,
            repeatDirection: this.repeatDirection || 'vertical',
            sampleRowIndex: this.sampleRowIndex || 0,
            columns: this.columns.map(col => ({
                columnId: col.columnId,
                hebrewName: col.hebrewName || '',
                englishId: col.englishId || col.columnId,
                bbox: {
                    x: col.bbox.x,
                    y: col.bbox.y,
                    width: col.bbox.width,
                    height: col.bbox.height
                },
                type: col.type || 'text',
                linked: col.linked || false
            })),
            rows: this.rows.map(row => {
                const rowData = {};
                for (const colId in row) {
                    rowData[colId] = {
                        x: row[colId].x,
                        y: row[colId].y,
                        width: row[colId].width,
                        height: row[colId].height
                    };
                }
                return rowData;
            }),
            isComplete: this.isComplete,
            createdAt: this.createdAt
        };
    }

    /**
     * Generate field overlays for all table cells
     * Compatible with old table-engine generateTableFieldOverlays format
     * @returns {Array} Array of field overlay objects ready for rendering
     */
    generateFieldOverlays() {
        const overlays = [];

        if (!this.rows || this.rows.length === 0) {
            console.warn('[TableModel] No rows to generate overlays for');
            return overlays;
        }

        this.rows.forEach((row, rowIndex) => {
            this.columns.forEach(col => {
                const cellData = row[col.columnId];
                if (!cellData) return;

                const fieldId = `${this.tableId}_${col.columnId}_row${rowIndex}`;

                overlays.push({
                    id: fieldId,
                    tableId: this.tableId,
                    columnId: col.columnId,
                    rowIndex: rowIndex,
                    page: this.page,
                    type: col.type || 'text',
                    hebrewName: col.hebrewName || '',
                    englishId: col.englishId || col.columnId,
                    bbox: cellData,
                    pdfX: cellData.x,
                    pdfY: cellData.y,
                    pdfWidth: cellData.width,
                    pdfHeight: cellData.height,
                    isTableField: true,
                    isMapped: true,
                    direction: 'rtl'
                });
            });
        });

        return overlays;
    }

    /**
     * Reset the model to initial state
     */
    reset() {
        this.tableId = `table_${Date.now()}`;
        this.headerBBox = null;
        this.sampleRowBBox = null;
        this.bbox = null;
        this.columns = [];
        this.rowCount = 0;
        this.rowHeight = 0;
        this.repeatDirection = 'vertical';
        this.sampleRowIndex = 0;
        this.rows = [];
        this.isComplete = false;
        this.createdAt = null;
    }

    /**
     * Load table from JSON data
     * @param {Object} data - Table data from JSON
     */
    fromJSON(data) {
        if (!data) return;

        this.tableId = data.tableId || `table_${Date.now()}`;
        this.page = data.page || 1;
        this.headerBBox = data.headerBBox || null;
        this.sampleRowBBox = data.sampleRowBBox || null;
        this.bbox = data.bbox || null;
        this.rowCount = data.rowCount || 0;
        this.rowHeight = data.rowHeight || 0;
        this.repeatDirection = data.repeatDirection || 'vertical';
        this.sampleRowIndex = data.sampleRowIndex || 0;
        this.columns = data.columns || [];
        this.rows = data.rows || [];
        this.isComplete = data.isComplete || false;
        this.createdAt = data.createdAt || null;
    }
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.TableModel = TableModel;
}
