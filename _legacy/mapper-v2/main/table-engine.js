/**
 * Table Engine - Table Detection & Field Mapping (Step 5)
 *
 * This module provides comprehensive table mapping functionality:
 * - Table region selection
 * - Row detection and estimation
 * - Sample row mapping
 * - Column field definition
 * - Automatic row replication
 *
 * NOTE: All functions are modular and receive mapper state as parameters.
 */
(function() {
    'use strict';

    // ============ CONFIGURATION ============

    const TABLE_CONFIG = {
        MIN_TABLE_WIDTH: 100,
        MIN_TABLE_HEIGHT: 50,
        MIN_ROW_HEIGHT: 15,
        MAX_ROW_HEIGHT: 100,
        DEFAULT_ROW_HEIGHT: 28,
        MIN_ROWS: 2,
        MAX_ROWS: 100,
        DETECTION_TOLERANCE: 5 // pixels
    };

    // ============ TABLE DATA STRUCTURE ============

    /**
     * Create a new table object with default values
     * @param {string} tableId - Unique table identifier
     * @param {number} page - Page number
     * @param {Object} bbox - Bounding box { x, y, width, height }
     * @returns {Object} New table object
     */
    function createTableObject(tableId, page, bbox) {
        return {
            tableId: tableId,
            page: page,
            bbox: bbox,
            rowCount: null,
            rowHeight: null,
            repeatDirection: 'vertical',
            columns: [],
            rows: [],
            sampleRowBBox: null,
            sampleRowIndex: 0,
            isComplete: false,
            createdAt: Date.now()
        };
    }

    /**
     * Create a column definition object
     * @param {string} columnId - Unique column identifier
     * @param {string} hebrewName - Hebrew column name
     * @param {Object} bbox - Column field bounding box (relative to row)
     * @param {string} type - Field type
     * @returns {Object} Column definition
     */
    function createColumnObject(columnId, hebrewName, bbox, type = 'text') {
        return {
            columnId: columnId,
            hebrewName: hebrewName,
            englishId: columnId,
            bbox: bbox,
            type: type,
            linked: !!hebrewName
        };
    }

    // ============ ROW DETECTION ============

    /**
     * Detect rows within a table region using text positions
     * @param {Object} tableBBox - Table bounding box
     * @param {Array} textItems - PDF.js text content items
     * @param {Object} viewport - PDF viewport for coordinate conversion
     * @returns {Object} Detection result { rowCount, rowHeight, confidence, rowPositions }
     */
    function detectRowsFromText(tableBBox, textItems, viewport) {
        if (!textItems || textItems.length === 0) {
            return { rowCount: null, rowHeight: null, confidence: 0, rowPositions: [] };
        }

        // Filter text items within table bounds
        const tableTextItems = textItems.filter(item => {
            if (!item.transform) return false;

            const x = item.transform[4];
            const y = viewport.height - item.transform[5]; // Convert PDF Y to canvas Y

            return x >= tableBBox.x &&
                   x <= tableBBox.x + tableBBox.width &&
                   y >= tableBBox.y &&
                   y <= tableBBox.y + tableBBox.height;
        });

        if (tableTextItems.length === 0) {
            return { rowCount: null, rowHeight: null, confidence: 0, rowPositions: [] };
        }

        // Extract Y positions and cluster them
        const yPositions = tableTextItems.map(item => viewport.height - item.transform[5]);
        const clusters = clusterYPositions(yPositions, TABLE_CONFIG.DETECTION_TOLERANCE);

        if (clusters.length < 2) {
            return { rowCount: clusters.length, rowHeight: null, confidence: 0.3, rowPositions: clusters };
        }

        // Calculate row height from cluster gaps
        const sortedClusters = clusters.sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < sortedClusters.length; i++) {
            gaps.push(sortedClusters[i] - sortedClusters[i - 1]);
        }

        // Find most common gap (row height)
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const consistentGaps = gaps.filter(g => Math.abs(g - avgGap) < TABLE_CONFIG.DETECTION_TOLERANCE);
        const confidence = consistentGaps.length / gaps.length;

        return {
            rowCount: sortedClusters.length,
            rowHeight: Math.round(avgGap),
            confidence: confidence,
            rowPositions: sortedClusters
        };
    }

    /**
     * Cluster Y positions to identify row centers
     * @param {Array} yPositions - Array of Y coordinates
     * @param {number} tolerance - Clustering tolerance in pixels
     * @returns {Array} Array of cluster center Y positions
     */
    function clusterYPositions(yPositions, tolerance) {
        if (yPositions.length === 0) return [];

        const sorted = [...yPositions].sort((a, b) => a - b);
        const clusters = [];
        let currentCluster = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] - sorted[i - 1] <= tolerance) {
                currentCluster.push(sorted[i]);
            } else {
                // Save current cluster center
                const center = currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length;
                clusters.push(Math.round(center));
                currentCluster = [sorted[i]];
            }
        }

        // Don't forget the last cluster
        if (currentCluster.length > 0) {
            const center = currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length;
            clusters.push(Math.round(center));
        }

        return clusters;
    }

    /**
     * Estimate row count and height from table dimensions
     * @param {Object} tableBBox - Table bounding box
     * @param {number} estimatedRowHeight - Estimated row height (optional)
     * @returns {Object} Estimation { rowCount, rowHeight }
     */
    function estimateRowsFromDimensions(tableBBox, estimatedRowHeight = TABLE_CONFIG.DEFAULT_ROW_HEIGHT) {
        const tableHeight = tableBBox.height;
        const rowCount = Math.round(tableHeight / estimatedRowHeight);
        const actualRowHeight = tableHeight / rowCount;

        return {
            rowCount: Math.max(TABLE_CONFIG.MIN_ROWS, Math.min(rowCount, TABLE_CONFIG.MAX_ROWS)),
            rowHeight: Math.round(actualRowHeight)
        };
    }

    // ============ SAMPLE ROW PROCESSING ============

    /**
     * Calculate sample row index from its position within the table
     * @param {Object} tableBBox - Table bounding box
     * @param {Object} sampleRowBBox - Sample row bounding box
     * @param {number} rowHeight - Row height
     * @returns {number} Zero-based row index
     */
    function calculateSampleRowIndex(tableBBox, sampleRowBBox, rowHeight) {
        const relativeY = sampleRowBBox.y - tableBBox.y;
        return Math.round(relativeY / rowHeight);
    }

    /**
     * Convert column positions from sample row to relative positions
     * @param {Array} columns - Array of column objects with absolute bbox
     * @param {Object} sampleRowBBox - Sample row bounding box
     * @returns {Array} Columns with relative positions
     */
    function convertColumnsToRelative(columns, sampleRowBBox) {
        return columns.map(col => ({
            ...col,
            relativeBBox: {
                x: col.bbox.x - sampleRowBBox.x,
                y: col.bbox.y - sampleRowBBox.y,
                width: col.bbox.width,
                height: col.bbox.height
            }
        }));
    }

    // ============ ROW REPLICATION ============

    /**
     * Generate all rows from sample row and columns
     * @param {Object} table - Table object with columns, rowCount, rowHeight
     * @param {Object} sampleRowBBox - Sample row bounding box
     * @returns {Array} Array of row objects with field positions
     */
    function generateRows(table, sampleRowBBox) {
        const rows = [];
        const { columns, rowCount, rowHeight, bbox: tableBBox } = table;

        if (!columns || columns.length === 0 || !rowCount || !rowHeight) {
            console.warn('⚠️ Cannot generate rows: missing columns, rowCount, or rowHeight');
            return rows;
        }

        // ============ FIX: Calculate rows starting from TABLE TOP, going DOWN ============
        // The table bbox defines the full table area
        // We generate rows from top to bottom within this area

        const tableTop = tableBBox.y;
        const actualRowHeight = tableBBox.height / rowCount;

        console.log('📐 generateRows INPUT:', {
            tableBBox: tableBBox,
            tableTop,
            tableHeight: tableBBox.height,
            rowCount,
            actualRowHeight,
            sampleRowBBox,
            columns: columns.map(c => ({ id: c.columnId, bbox: c.bbox }))
        });

        for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
            const row = {};

            // ============ FIX: Calculate row Y position from table top ============
            // Row 0 starts at tableTop, Row 1 at tableTop + actualRowHeight, etc.
            const rowTopY = tableTop + (rowIndex * actualRowHeight);

            columns.forEach(col => {
                // Column X position stays the same for all rows
                // Column width stays the same
                // Column height should match the actual row height (not sample row height)

                // Calculate absolute position for this row's field
                // X stays the same, Y is calculated from row top
                const fieldBBox = {
                    x: col.bbox.x,
                    y: rowTopY,
                    width: col.bbox.width,
                    height: actualRowHeight
                };

                // Store field data for this column
                row[col.columnId] = {
                    x: fieldBBox.x,
                    y: fieldBBox.y,
                    width: fieldBBox.width,
                    height: fieldBBox.height,
                    type: col.type || 'text',
                    rowIndex: rowIndex
                };
            });

            rows.push(row);
        }

        console.log('📐 Generated rows:', rows.length, 'First row Y:', rows[0]?.[columns[0]?.columnId]?.y);

        return rows;
    }

    /**
     * Generate field overlays for all table cells
     * @param {Object} table - Complete table object
     * @param {Object} mapper - Mapper instance for coordinate conversion
     * @returns {Array} Array of field overlay objects ready for rendering
     */
    function generateTableFieldOverlays(table, mapper) {
        const overlays = [];
        const { tableId, page, columns, rows } = table;

        if (!rows || rows.length === 0) {
            console.warn('⚠️ No rows to generate overlays for');
            return overlays;
        }

        rows.forEach((row, rowIndex) => {
            columns.forEach(col => {
                const cellData = row[col.columnId];
                if (!cellData) return;

                const fieldId = `${tableId}_${col.columnId}_row${rowIndex}`;

                overlays.push({
                    id: fieldId,
                    tableId: tableId,
                    columnId: col.columnId,
                    rowIndex: rowIndex,
                    page: page,
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
                    direction: 'rtl' // Default direction for table fields
                });
            });
        });

        return overlays;
    }

    // ============ TABLE VALIDATION ============

    /**
     * Validate table object for completeness
     * @param {Object} table - Table object to validate
     * @returns {Object} Validation result { valid: boolean, errors: array, warnings: array }
     */
    function validateTable(table) {
        const errors = [];
        const warnings = [];

        if (!table.tableId) errors.push('Missing tableId');
        if (!table.bbox) errors.push('Missing table bounding box');
        if (!table.rowCount || table.rowCount < 1) errors.push('Invalid rowCount');
        if (!table.rowHeight || table.rowHeight < TABLE_CONFIG.MIN_ROW_HEIGHT) errors.push('Invalid rowHeight');
        if (!table.columns || table.columns.length === 0) errors.push('No columns defined');
        if (!table.sampleRowBBox) errors.push('No sample row defined');

        // Warnings
        if (table.columns && table.columns.some(col => !col.hebrewName)) {
            warnings.push('Some columns have no Hebrew name');
        }
        if (table.rows && table.rows.length === 0) {
            warnings.push('No rows generated');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ============ TABLE EXPORT ============

    /**
     * Export table to JSON format
     * @param {Object} table - Table object
     * @returns {Object} Clean JSON representation
     */
    function exportTableToJSON(table) {
        return {
            tableId: table.tableId,
            page: table.page,
            bbox: {
                x: table.bbox.x,
                y: table.bbox.y,
                width: table.bbox.width,
                height: table.bbox.height
            },
            rowCount: table.rowCount,
            rowHeight: table.rowHeight,
            repeatDirection: table.repeatDirection || 'vertical',
            columns: table.columns.map(col => ({
                columnId: col.columnId,
                hebrewName: col.hebrewName || '',
                englishId: col.englishId || col.columnId,
                bbox: {
                    x: col.bbox.x,
                    y: col.bbox.y,
                    width: col.bbox.width,
                    height: col.bbox.height
                },
                type: col.type || 'text'
            })),
            rows: table.rows.map(row => {
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
            })
        };
    }

    // ============ GRID RENDERING HELPERS ============

    /**
     * Generate grid lines for table visualization
     * @param {Object} table - Table object
     * @returns {Object} Grid data { horizontalLines: [], verticalLines: [] }
     */
    function generateTableGrid(table) {
        const { bbox, rowCount, rowHeight, columns } = table;
        const horizontalLines = [];
        const verticalLines = [];

        // Generate horizontal lines (row separators)
        for (let i = 0; i <= rowCount; i++) {
            horizontalLines.push({
                x1: bbox.x,
                y1: bbox.y + (i * rowHeight),
                x2: bbox.x + bbox.width,
                y2: bbox.y + (i * rowHeight)
            });
        }

        // Generate vertical lines (column separators) if columns are defined
        if (columns && columns.length > 0) {
            // Left edge
            verticalLines.push({
                x1: bbox.x,
                y1: bbox.y,
                x2: bbox.x,
                y2: bbox.y + bbox.height
            });

            // Column edges
            columns.forEach(col => {
                // Right edge of each column
                verticalLines.push({
                    x1: col.bbox.x + col.bbox.width,
                    y1: bbox.y,
                    x2: col.bbox.x + col.bbox.width,
                    y2: bbox.y + bbox.height
                });
            });
        }

        return { horizontalLines, verticalLines };
    }

    // ============ EXPORT ============

    window.TableEngine = {
        // Configuration
        config: TABLE_CONFIG,

        // Data structure creation
        createTableObject,
        createColumnObject,

        // Row detection
        detectRowsFromText,
        clusterYPositions,
        estimateRowsFromDimensions,

        // Sample row processing
        calculateSampleRowIndex,
        convertColumnsToRelative,

        // Row replication
        generateRows,
        generateTableFieldOverlays,

        // Validation and export
        validateTable,
        exportTableToJSON,

        // Grid rendering
        generateTableGrid
    };

    console.log('%c📐 Table Engine Module Loaded (Step 5)', 'background: #FF5722; color: white; font-size: 14px; padding: 5px;');
})();
