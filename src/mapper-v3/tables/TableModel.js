/**
 * TableModel - Data structure for table mapping in Mapper V3
 *
 * MIGRATED FROM: /src/shared/tables/tableModel.js
 * NO LOGIC CHANGES - Exact copy of data model and calculations
 *
 * Structure:
 * - headerBBox: Header region coordinates
 * - sampleRowBBox: Sample row region coordinates
 * - columns: Array of column definitions
 * - rowCount: Total number of data rows
 * - rows: Generated row data (after generation step)
 *
 * JSON format is unchanged for backwards compatibility.
 */

import { fieldNamer } from '../engines/FieldNamer.js';

export class TableModel {
    constructor(page = 1) {
        // Table identification
        this.tableId = `table_${Date.now()}`;
        this.page = page;

        // ============ SEMANTIC ENTITY - Table Title ============
        // Used ONLY for: UI display, JSON export, autofill, sync
        // NEVER for geometric calculations
        this.tableTitle = {
            text: '',           // Hebrew name selected by user
            englishId: '',      // English ID for export
            bbox: null          // Where user selected the title text (for reference only)
        };

        // ============ GEOMETRIC ENTITIES ============

        // tableBBox: REQUIRED - User-defined visual boundaries of the ENTIRE table
        // This is the FIRST thing the user marks - the outer boundary
        // ALL rows must fit exactly within this bbox
        // The bottom of tableBBox is the absolute visual bottom - no heuristics
        this.tableBBox = null;       // { x, y, width, height } - REQUIRED, user-defined

        // headerRowBBox: OPTIONAL - only if user explicitly maps column headers row
        // Only affects: visual header display
        // Does NOT affect: row calculations, row height, row positions
        this.headerRowBBox = null;   // { x, y, width, height } - OPTIONAL

        // sampleRowBBox: REQUIRED - The ONLY source of truth for:
        // - rowHeight calculation
        // - Row Y starting position
        // But NOT for bottom boundary (that comes from tableBBox)
        this.sampleRowBBox = null;   // { x, y, width, height } - REQUIRED

        // Combined table bbox (now derived from user-defined tableBBox)
        this.bbox = null;            // { x, y, width, height }

        // Column definitions
        this.columns = [];
        // Each column: { columnId, hebrewName, englishId, type, bbox, linked }

        // Row configuration
        this.rowCount = 0;
        this.rowHeight = 0;  // Calculated ONLY from sampleRowBBox.height
        this.repeatDirection = 'vertical';
        this.sampleRowIndex = 0;

        // Generated rows (populated in generation step)
        this.rows = [];
        // Each row: { col_1: { x, y, width, height }, col_2: {...}, ... }

        // State flags
        this.isComplete = false;
        this.createdAt = null;

        // ============ BACKWARDS COMPATIBILITY ============
        // Keep headerBBox as alias for headerRowBBox
        Object.defineProperty(this, 'headerBBox', {
            get: () => this.headerRowBBox,
            set: (val) => { this.headerRowBBox = val; },
            enumerable: false
        });
    }

    /**
     * Set the table bounding box (user-defined visual boundaries)
     * CRITICAL: This is the absolute source of truth for table boundaries
     * All rows must fit exactly within this bbox
     * @param {Object} bbox - { x, y, width, height }
     */
    setTableBBox(bbox) {
        this.tableBBox = { ...bbox };
        // Also set the computed bbox to match (user-defined wins)
        this.bbox = { ...bbox };
        console.log('[TableModel] Table bbox set (user-defined boundaries):', this.tableBBox);
    }

    /**
     * Set the table title (semantic - for UI/JSON/autofill only)
     * IMPORTANT: This is NOT used for any geometric calculations
     * @param {string} text - Hebrew title text
     * @param {Object} bbox - Optional bbox where user selected the text
     */
    setTableTitle(text, bbox = null) {
        this.tableTitle = {
            text: text || '',
            englishId: this._toEnglishId(text) || '',
            bbox: bbox ? { ...bbox } : null
        };
        console.log('[TableModel] Table title set (semantic only):', this.tableTitle.text);
    }

    /**
     * Set the header ROW bounding box (OPTIONAL - geometric only)
     * This only affects the table bbox top position
     * Does NOT affect row calculations
     * @param {Object} bbox - { x, y, width, height }
     */
    setHeader(bbox) {
        this.headerRowBBox = { ...bbox };
        console.log('[TableModel] Header row bbox set (geometric, optional):', bbox);
    }

    /**
     * Alias for setHeader - clearer naming
     * @param {Object} bbox - { x, y, width, height }
     */
    setHeaderRow(bbox) {
        this.setHeader(bbox);
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
     * @param {Object} layout - Layout object from LayoutHelper (Phase 3)
     * @returns {Object} The created column object
     */
    addColumn(bbox, name, type = 'text', layout = null) {
        const columnIndex = this.columns.length + 1;
        const columnId = `col_${columnIndex}`;

        const column = {
            columnId: columnId,
            hebrewName: name || '',
            englishId: this._toEnglishId(name) || columnId,
            type: type,
            bbox: { ...bbox },
            linked: !!name  // Compatible with old table-engine format
        };

        // Add layout if provided (Phase 3)
        if (layout) {
            column.layout = layout;
        }

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
                column.englishId = this._toEnglishId(updates.hebrewName);
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
     * Calculate and set the table bbox from geometric entities
     *
     * CRITICAL RULES:
     * 1. If tableBBox is user-defined, USE IT AS-IS (user-defined wins)
     * 2. Otherwise fall back to computed bbox
     * 3. NEVER use tableTitle for geometry
     */
    computeTableBBox() {
        // ============ USER-DEFINED BBOX WINS ============
        // If user marked table boundaries, that is the absolute truth
        if (this.tableBBox) {
            this.bbox = { ...this.tableBBox };
            console.log('[TableModel] Using user-defined tableBBox:', this.bbox);
            return;
        }

        // ============ FALLBACK: Compute from sampleRowBBox ============
        if (!this.sampleRowBBox || this.rowCount === 0) {
            console.warn('[TableModel] Cannot compute table bbox: missing sampleRowBBox or rowCount');
            return;
        }

        // Data top = sampleRowBBox.y (IRON RULE: all row calculations start here)
        const dataTop = this._precision(this.sampleRowBBox.y);

        // Total data height = rowCount * rowHeight (with precision)
        const dataHeight = this._precision(this.rowCount * this.rowHeight);

        // Data ends at sampleRow.y + (rowCount * rowHeight)
        const dataBottom = this._precision(dataTop + dataHeight);

        // ============ WIDTH CALCULATION ============
        let minX = this._precision(this.sampleRowBBox.x);
        let maxX = this._precision(this.sampleRowBBox.x + this.sampleRowBBox.width);

        if (this.columns.length > 0) {
            minX = this._precision(Math.min(...this.columns.map(c => c.bbox.x)));
            maxX = this._precision(Math.max(...this.columns.map(c => c.bbox.x + c.bbox.width)));
        }

        // ============ TABLE TOP CALCULATION ============
        const tableTop = this.headerRowBBox
            ? this._precision(this.headerRowBBox.y)
            : dataTop;

        // Total height = from table top to data bottom
        const totalHeight = this._precision(dataBottom - tableTop);

        this.bbox = {
            x: minX,
            y: tableTop,
            width: this._precision(maxX - minX),
            height: totalHeight
        };

        console.log('[TableModel] Computed table bbox (no user-defined):', this.bbox, {
            tableTop,
            dataTop,
            dataBottom,
            totalHeight,
            rowCount: this.rowCount,
            rowHeight: this.rowHeight,
            hasHeaderRow: !!this.headerRowBBox,
            headerRowUsed: this.headerRowBBox ? 'headerRowBBox.y' : 'sampleRowBBox.y'
        });
    }

    /**
     * Generate all rows based on sample row and columns
     * Compatible with old table-engine generateRows format
     *
     * CRITICAL: DIRECT DERIVATION - NO CUMULATIVE CALCULATION
     * Each row position is derived directly from fixed base point:
     * Formula: row[i].y = baseY + (i * rowHeight)
     *
     * RULES:
     * - baseY = sampleRowBBox.y (fixed reference point)
     * - rowHeight = sampleRowBBox.height (fixed height)
     * - NO currentY accumulation
     * - NO previousRow.bottom dependency
     * - Only last row height is adjusted for bottom closure
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

        // ============ PROPORTIONAL ROW DISTRIBUTION ============
        // FIX: Instead of multiplying rowHeight * i (which causes cumulative drift),
        // we calculate each row's position as a proportion of the total data height.
        // This ensures rows are evenly distributed without floating-point accumulation errors.

        const baseY = this.sampleRowBBox.y;

        // Get the total data height from tableBBox (user-defined) or calculate it
        const tableBottom = this.tableBBox
            ? (this.tableBBox.y + this.tableBBox.height)
            : (baseY + (this.rowCount * this.sampleRowBBox.height));

        const totalDataHeight = tableBottom - baseY;

        // Calculate exact row height by dividing total height by row count
        // This avoids cumulative drift from repeated multiplication
        const exactRowHeight = totalDataHeight / this.rowCount;

        console.log('[TableModel] Generating rows with PROPORTIONAL DISTRIBUTION:', {
            baseY,
            tableBottom,
            totalDataHeight,
            exactRowHeight,
            rowCount: this.rowCount,
            columns: this.columns.length,
            formula: 'row[i].y = baseY + (totalDataHeight * i / rowCount)'
        });

        for (let i = 0; i < this.rowCount; i++) {
            const row = {};

            // CRITICAL: Calculate Y as proportion of total height
            // This avoids cumulative floating-point errors
            // Formula: rowY = baseY + (totalDataHeight * i / rowCount)
            const rowY = baseY + (totalDataHeight * i / this.rowCount);

            // Calculate next row Y to get exact height for this row
            const nextRowY = (i === this.rowCount - 1)
                ? tableBottom  // Last row ends exactly at table bottom
                : baseY + (totalDataHeight * (i + 1) / this.rowCount);

            const cellHeight = nextRowY - rowY;

            this.columns.forEach(col => {
                // Create cell data matching old table-engine format
                row[col.columnId] = {
                    x: col.bbox.x,
                    y: rowY,
                    width: col.bbox.width,
                    height: cellHeight,  // Exact height for this specific row
                    type: col.type || 'text',
                    rowIndex: i
                };
            });

            this.rows.push(row);
        }

        // ============ VALIDATION ============
        // With proportional distribution, bottom closure is automatic
        const lastRow = this.rows[this.rows.length - 1];
        const finalLastRowBottom = lastRow ? (Object.values(lastRow)[0].y + Object.values(lastRow)[0].height) : 0;

        console.log('[TableModel] Generated', this.rows.length, 'rows:', {
            firstRowY: baseY,
            lastRowY: lastRow ? Object.values(lastRow)[0].y : 0,
            finalLastRowBottom: finalLastRowBottom,
            targetBottom: tableBottom,
            closureSuccess: Math.abs(finalLastRowBottom - tableBottom) < 0.0001
        });

        // Validation check
        if (this.rows.length !== this.rowCount) {
            console.error('[TableModel] Row count mismatch! Expected:', this.rowCount, 'Got:', this.rows.length);
        }

        return this.rows;
    }

    /**
     * Convert Hebrew name to English ID
     * Uses FieldNamer from mapper-v3 for consistent naming
     * @param {string} hebrewName - Hebrew name
     * @returns {string} English ID
     */
    _toEnglishId(hebrewName) {
        if (!hebrewName) return '';
        return fieldNamer.hebrewToEnglish(hebrewName);
    }

    /**
     * Get table summary for display
     * @returns {Object} Summary object
     */
    getSummary() {
        return {
            tableId: this.tableId,
            tableTitle: this.tableTitle.text,      // Semantic name for UI
            tableTitleEn: this.tableTitle.englishId,
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
            // Semantic entity - for UI/autofill/sync
            tableTitle: {
                text: this.tableTitle.text,
                englishId: this.tableTitle.englishId,
                bbox: this.tableTitle.bbox
            },
            // Geometric entities
            tableBBox: this.tableBBox,          // User-defined visual boundaries (REQUIRED)
            headerRowBBox: this.headerRowBBox,  // Optional
            sampleRowBBox: this.sampleRowBBox,  // Row height source (REQUIRED)
            bbox: this.bbox,                    // Computed/derived bbox
            rowCount: this.rowCount,
            rowHeight: this.rowHeight,
            repeatDirection: this.repeatDirection,
            sampleRowIndex: this.sampleRowIndex,
            columns: this.columns.map(col => {
                const colData = {
                    columnId: col.columnId,
                    hebrewName: col.hebrewName,
                    englishId: col.englishId,
                    type: col.type,
                    bbox: col.bbox,
                    linked: col.linked
                };
                // Include layout if defined (Phase 3)
                if (col.layout) {
                    colData.layout = col.layout;
                }
                return colData;
            }),
            rows: this.rows,
            isComplete: this.isComplete,
            createdAt: this.createdAt,
            // Backwards compatibility alias
            headerBBox: this.headerRowBBox
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
            // Semantic entity - for UI/autofill/sync (NOT for geometry)
            tableTitle: this.tableTitle.text,
            tableTitleEn: this.tableTitle.englishId,
            // Combined bbox (derived)
            bbox: this.bbox ? {
                x: this.bbox.x,
                y: this.bbox.y,
                width: this.bbox.width,
                height: this.bbox.height
            } : null,
            // Geometric entities
            tableBBox: this.tableBBox ? {
                x: this.tableBBox.x,
                y: this.tableBBox.y,
                width: this.tableBBox.width,
                height: this.tableBBox.height
            } : null,
            headerRowBBox: this.headerRowBBox ? {
                x: this.headerRowBBox.x,
                y: this.headerRowBBox.y,
                width: this.headerRowBBox.width,
                height: this.headerRowBBox.height
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
            columns: this.columns.map(col => {
                const colData = {
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
                };
                // Include layout if defined (Phase 3)
                if (col.layout) {
                    colData.layout = col.layout;
                }
                return colData;
            }),
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
            createdAt: this.createdAt,
            // Backwards compatibility
            headerBBox: this.headerRowBBox ? {
                x: this.headerRowBBox.x,
                y: this.headerRowBBox.y,
                width: this.headerRowBBox.width,
                height: this.headerRowBBox.height
            } : null
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
        // Semantic entity
        this.tableTitle = {
            text: '',
            englishId: '',
            bbox: null
        };
        // Geometric entities
        this.tableBBox = null;       // User-defined visual boundaries (REQUIRED)
        this.headerRowBBox = null;   // Optional header row
        this.sampleRowBBox = null;   // Row height source (REQUIRED)
        this.bbox = null;            // Computed/derived bbox
        this.columns = [];
        this.rowCount = 0;
        this.rowHeight = 0;
        this.repeatDirection = 'vertical';
        this.sampleRowIndex = 0;
        this.rows = [];
        this.isComplete = false;
        this.createdAt = null;

        console.log('[TableModel] Reset complete');
    }

    /**
     * Load table from JSON data
     * @param {Object} data - Table data from JSON
     */
    fromJSON(data) {
        if (!data) return;

        this.tableId = data.tableId || `table_${Date.now()}`;
        this.page = data.page || 1;

        // Load semantic entity (with backwards compatibility)
        if (data.tableTitle && typeof data.tableTitle === 'object') {
            this.tableTitle = {
                text: data.tableTitle.text || '',
                englishId: data.tableTitle.englishId || '',
                bbox: data.tableTitle.bbox || null
            };
        } else if (typeof data.tableTitle === 'string') {
            // Backwards compatibility: tableTitle was just a string
            this.tableTitle = {
                text: data.tableTitle,
                englishId: data.tableTitleEn || this._toEnglishId(data.tableTitle),
                bbox: null
            };
        } else {
            this.tableTitle = { text: '', englishId: '', bbox: null };
        }

        // Load geometric entities (with backwards compatibility)
        this.tableBBox = data.tableBBox || null;  // User-defined visual boundaries
        this.headerRowBBox = data.headerRowBBox || data.headerBBox || null;
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
