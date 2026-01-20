/**
 * UnifiedStateManager - Single source of truth for all desktop modules
 * Supports: Mapper-v3, LiveFill, Excel integration, Export
 *
 * Based on: /src/mapper-v3/core/StateManager.js
 * Created for: Phase 1 - Foundation
 *
 * Features:
 * - Immutable state updates
 * - History tracking (undo/redo)
 * - Field management (mapping + filling)
 * - LiveFill data management
 * - EventBus integration
 *
 * Usage:
 *   import { state, Tools, Modes } from '../core/UnifiedStateManager.js';
 *   state.addField({ type: 'text', bbox: [...] });
 *   state.setFieldValue('fld_1', 'John Doe');
 */

'use strict';

import { eventBus, Events } from './UnifiedEventBus.js';

// ============ ENUMS ============

/**
 * Available tools
 */
export const Tools = {
    SELECT: 'select',
    DRAW_TEXT: 'draw_text',
    DRAW_CHECKBOX: 'draw_checkbox',
    DRAW_RADIO: 'draw_radio',
    DRAW_TABLE: 'draw_table',
    DRAW_SIGNATURE: 'draw_signature',
    DRAW_CELL: 'draw_cell',
    PAN: 'pan',
    CAPTURE_NAME: 'capture_name'
};

/**
 * Application modes
 */
export const Modes = {
    IDLE: 'idle',
    DRAWING: 'drawing',
    DRAGGING: 'dragging',
    RESIZING: 'resizing',
    PANNING: 'panning',
    TEXT_SELECTION: 'text_selection',
    CAPTURE_NAME: 'capture_name',
    RADIO_GROUP_BUILDING: 'radio_group_building',
    FILLING: 'filling'  // LiveFill mode
};

/**
 * Flow modes - mapping vs filling
 */
export const FlowModes = {
    MAPPING: 'mapping',
    QUICK_FILL: 'quick_fill',
    LIVE_FILL: 'live_fill'
};

/**
 * Export status
 */
export const ExportStatus = {
    IDLE: 'idle',
    RUNNING: 'running',
    DONE: 'done',
    ERROR: 'error'
};

// ============ INITIAL STATE ============

/**
 * Create initial state structure
 */
function createInitialState() {
    return {
        // ============ DOCUMENT STATE ============
        document: {
            loaded: false,
            fileName: null,
            pageCount: 0,
            currentPage: 1,
            pdfBytes: null,          // ArrayBuffer for export
            pdfBytesSafe: null,      // Uint8Array copy
            pdfJsDoc: null           // pdf.js document object
        },

        // ============ FIELDS (MAPPING) ============
        fields: [],

        // ============ LIVE FILL DATA ============
        liveFillData: {},            // { fieldId: { value, checked, style } }
        liveFillDirty: false,        // Has unsaved changes
        liveFillLastChanged: null,   // Timestamp of last change

        // ============ SELECTION ============
        selection: {
            fieldId: null,
            expandedFieldId: null
        },

        // ============ TOOL & MODE ============
        tool: Tools.SELECT,
        mode: Modes.IDLE,
        flowMode: FlowModes.MAPPING,

        // ============ VIEW STATE ============
        view: {
            zoom: 1.0,
            renderScale: 2.0,
            panX: 0,
            panY: 0
        },

        // ============ PDF DIMENSIONS ============
        pdfDimensions: {
            width: 595,   // A4 default
            height: 842,
            scale: 1.0
        },

        // ============ VIEWPORTS (per page) ============
        pageViewports: {},           // { 1: viewport, 2: viewport, ... }
        canvasSizes: {},             // { 1: {width, height}, ... }

        // ============ SETTINGS ============
        settings: {
            dpi: 300,
            snapToGrid: false,
            gridSize: 20,
            autoSave: true
        },

        // ============ RADIO GROUPS ============
        radioGroups: [],

        // ============ TABLES ============
        tables: [],

        // ============ EXPORT STATE ============
        exportStatus: ExportStatus.IDLE,
        exportError: null,
        lastExportAt: null,

        // ============ EXCEL STATE ============
        excelData: null,             // Loaded Excel data
        excelFileName: null,
        excelMatchResults: null,     // { matched: [], unmatched: [] }

        // ============ COUNTERS ============
        counters: {
            field: 0,
            radioGroup: 0,
            table: 0
        },

        // ============ TEMPLATE ============
        templateId: null
    };
}

// ============ HELPER FUNCTIONS ============

/**
 * Normalize field name aliases to standard format
 */
function normalizeFieldNames(field) {
    if (!field.label_he) {
        field.label_he = field.labelHe || field.hebrewName || '';
    }
    if (!field.label_en) {
        field.label_en = field.labelEn || field.englishId || field.name || field.id || '';
    }
    return field;
}

/**
 * Remove transient UI flags that shouldn't be persisted
 */
function removeTransientFlags(field) {
    const transientFlags = [
        '_selectedForGroup',
        '_userEditedName',
        '_englishManuallyEdited',
        'element',
        'isComplete'
    ];

    const cleaned = { ...field };
    transientFlags.forEach(flag => {
        delete cleaned[flag];
    });

    return cleaned;
}

/**
 * Determine if field is mapped based on coordinates
 */
function isFieldMapped(field) {
    // Has valid bbox
    if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
        const [x, y, w, h] = field.bbox;
        if (!(x === 0 && y === 0 && w === 0.1 && h === 0.05)) {
            return true;
        }
    }

    // Has valid anchor (checkbox/radio)
    if (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
        return true;
    }

    // Has V2 PDF points
    if (typeof field.pdfX === 'number' && typeof field.pdfY === 'number') {
        return true;
    }

    return false;
}

// ============ STATE MANAGER CLASS ============

export class UnifiedStateManager {
    constructor() {
        this.state = createInitialState();
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        this._undoStack = [];
        this.subscribers = new Set();
    }

    // ============ STATE ACCESS ============

    /**
     * Get current state (shallow copy)
     * @returns {Object} State copy
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Get a specific part of state using dot notation
     * @param {string} path - Dot-notation path (e.g., 'document.fileName')
     * @returns {*} Value at path
     */
    get(path) {
        const parts = path.split('.');
        let value = this.state;
        for (const part of parts) {
            if (value === undefined) return undefined;
            value = value[part];
        }
        return value;
    }

    // ============ STATE UPDATES ============

    /**
     * Update state immutably
     * @param {string} path - Dot-notation path
     * @param {*} value - New value
     * @param {boolean} addToHistory - Whether to add to undo history
     */
    set(path, value, addToHistory = false) {
        const oldState = this.state;
        const newState = this._shallowCloneWithPath(this.state, path);

        // Set value at path
        const parts = path.split('.');
        let target = newState;
        for (let i = 0; i < parts.length - 1; i++) {
            target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;

        this.state = newState;

        if (addToHistory) {
            this._pushHistory(oldState);
        }

        this._notify(path, value, oldState);
    }

    /**
     * Batch update multiple paths atomically
     * @param {Object} updates - { 'path.to.value': newValue, ... }
     * @param {boolean} addToHistory - Whether to add to undo history
     */
    batch(updates, addToHistory = false) {
        const oldState = this.state;
        const newState = this._deepClone(this.state);

        for (const [path, value] of Object.entries(updates)) {
            const parts = path.split('.');
            let target = newState;
            for (let i = 0; i < parts.length - 1; i++) {
                target = target[parts[i]];
            }
            target[parts[parts.length - 1]] = value;
        }

        this.state = newState;

        if (addToHistory) {
            this._pushHistory(oldState);
        }

        eventBus.emit(Events.STATE_CHANGED, { updates, oldState, newState });
    }

    // ============ DOCUMENT OPERATIONS ============

    /**
     * Set document data after PDF load
     * @param {Object} pdfJsDoc - pdf.js document
     * @param {ArrayBuffer|Uint8Array} pdfBytes - PDF bytes
     * @param {string} fileName - File name
     * @param {number} pageCount - Number of pages
     */
    setDocument(pdfJsDoc, pdfBytes, fileName, pageCount) {
        const pdfBytesSafe = pdfBytes instanceof Uint8Array
            ? new Uint8Array(pdfBytes)
            : new Uint8Array(pdfBytes);

        this.batch({
            'document.loaded': true,
            'document.pdfJsDoc': pdfJsDoc,
            'document.pdfBytes': pdfBytes,
            'document.pdfBytesSafe': pdfBytesSafe,
            'document.fileName': fileName,
            'document.pageCount': pageCount,
            'document.currentPage': 1
        }, false);

        eventBus.emit(Events.PDF_LOADED, {
            pdfName: fileName,
            pageCount,
            pdfJsDoc,
            pdfBytes
        });
    }

    /**
     * Get document data
     * @returns {Object} Document state
     */
    getDocument() {
        return { ...this.state.document };
    }

    /**
     * Set current page
     * @param {number} pageNum - Page number (1-indexed)
     */
    setCurrentPage(pageNum) {
        if (pageNum < 1 || pageNum > this.state.document.pageCount) return;

        const oldPage = this.state.document.currentPage;
        this.set('document.currentPage', pageNum);

        eventBus.emit(Events.PDF_PAGE_CHANGED, { page: pageNum, oldPage });
    }

    /**
     * Set page viewport
     * @param {number} pageNum - Page number
     * @param {Object} viewport - pdf.js viewport
     * @param {Object} canvasSize - { width, height }
     */
    setPageViewport(pageNum, viewport, canvasSize) {
        const newViewports = { ...this.state.pageViewports, [pageNum]: viewport };
        const newCanvasSizes = { ...this.state.canvasSizes, [pageNum]: canvasSize };

        this.batch({
            'pageViewports': newViewports,
            'canvasSizes': newCanvasSizes
        }, false);
    }

    /**
     * Get viewport for a page
     * @param {number} pageNum - Page number
     * @returns {Object|null} Viewport or null
     */
    getPageViewport(pageNum) {
        return this.state.pageViewports[pageNum] || null;
    }

    /**
     * Get canvas size for a page
     * @param {number} pageNum - Page number
     * @returns {Object|null} { width, height } or null
     */
    getCanvasSize(pageNum) {
        return this.state.canvasSizes[pageNum] || null;
    }

    // ============ FIELD OPERATIONS ============

    /**
     * Add a new field
     * @param {Object} fieldData - Field data
     * @returns {Object|null} Created field or null
     */
    addField(fieldData) {
        const id = `fld_${++this.state.counters.field}_${Date.now()}`;

        const context = fieldData.context || 'employee';
        const page = fieldData.page ?? this.state.document.currentPage ?? 1;
        const hasGeometry = !!(fieldData.bbox || fieldData.anchor);
        const isMapped = fieldData.isMapped !== undefined ? fieldData.isMapped : hasGeometry;

        let field = {
            id,
            type: fieldData.type || 'text',
            page,
            bbox: fieldData.bbox || null,
            anchor: fieldData.anchor || null,
            label_he: fieldData.label_he || '',
            label_en: fieldData.label_en || '',
            isMapped,
            canonical: fieldData.canonical || null,
            context,
            category: fieldData.category || null,
            format: fieldData.format || null,
            ...fieldData,
            id,
            page,
            isMapped,
            context
        };

        field = normalizeFieldNames(field);

        const newFields = [...this.state.fields, field];
        this.set('fields', newFields, true);

        eventBus.emit(Events.FIELD_CREATED, { field });
        return field;
    }

    /**
     * Update a field
     * @param {string} fieldId - Field ID
     * @param {Object} updates - Updates to apply
     * @param {boolean} addToHistory - Whether to add to history
     * @returns {Object|null} Updated field or null
     */
    updateField(fieldId, updates, addToHistory = true) {
        const index = this.state.fields.findIndex(f => f.id === fieldId);
        if (index === -1) return null;

        const existingField = this.state.fields[index];
        let enrichedUpdates = { ...updates };

        // Sync isMapped with geometry
        if (enrichedUpdates.bbox != null || enrichedUpdates.anchor != null) {
            const hasBbox = enrichedUpdates.bbox ?? existingField.bbox;
            const hasAnchor = enrichedUpdates.anchor ?? existingField.anchor;
            if (hasBbox || hasAnchor) {
                enrichedUpdates.isMapped = true;
            }
        }

        // Auto-set page if bbox is set
        if (enrichedUpdates.bbox != null && enrichedUpdates.page === undefined && existingField.page == null) {
            enrichedUpdates.page = this.state.document.currentPage;
        }

        const updatedField = { ...existingField, ...enrichedUpdates };
        const newFields = [...this.state.fields];
        newFields[index] = updatedField;

        this.set('fields', newFields, addToHistory);
        eventBus.emit(Events.FIELD_UPDATED, { field: updatedField, changes: enrichedUpdates });
        return updatedField;
    }

    /**
     * Delete a field
     * @param {string} fieldId - Field ID
     * @returns {boolean} Success
     */
    deleteField(fieldId) {
        const field = this.state.fields.find(f => f.id === fieldId);
        if (!field) return false;

        const newFields = this.state.fields.filter(f => f.id !== fieldId);
        const updates = { 'fields': newFields };

        // Clear selection if deleted field was selected
        if (this.state.selection.fieldId === fieldId) {
            updates['selection.fieldId'] = null;
        }

        // Also remove from liveFillData
        if (this.state.liveFillData[fieldId]) {
            const newLiveFillData = { ...this.state.liveFillData };
            delete newLiveFillData[fieldId];
            updates['liveFillData'] = newLiveFillData;
        }

        this.batch(updates, true);
        eventBus.emit(Events.FIELD_DELETED, { field });
        return true;
    }

    /**
     * Get field by ID
     * @param {string} fieldId - Field ID
     * @returns {Object|undefined}
     */
    getField(fieldId) {
        return this.state.fields.find(f => f.id === fieldId);
    }

    /**
     * Get fields for current page
     * @returns {Array}
     */
    getCurrentPageFields() {
        return this.state.fields.filter(f => f.page === this.state.document.currentPage);
    }

    /**
     * Get fields for specific page
     * @param {number} pageNum - Page number
     * @returns {Array}
     */
    getFieldsForPage(pageNum) {
        return this.state.fields.filter(f => f.page === pageNum);
    }

    /**
     * Get all mapped fields
     * @returns {Array}
     */
    getMappedFields() {
        return this.state.fields.filter(f => f.isMapped);
    }

    /**
     * Get all unmapped fields
     * @returns {Array}
     */
    getUnmappedFields() {
        return this.state.fields.filter(f => !f.isMapped);
    }

    // ============ LIVE FILL OPERATIONS ============

    /**
     * Set field value (for filling)
     * @param {string} fieldId - Field ID
     * @param {*} value - Field value
     * @param {boolean|null} checked - Checked state (for checkboxes/radios)
     * @param {Object} style - Optional style { fontSize, color, alignment }
     */
    setFieldValue(fieldId, value, checked = null, style = null) {
        const entry = {
            value: value !== undefined ? value : null,
            checked: checked
        };

        if (style) {
            entry.style = style;
        }

        const newLiveFillData = {
            ...this.state.liveFillData,
            [fieldId]: entry
        };

        this.batch({
            'liveFillData': newLiveFillData,
            'liveFillDirty': true,
            'liveFillLastChanged': Date.now()
        }, false);

        eventBus.emit(Events.LIVEFILL_VALUE_CHANGED, { fieldId, value, checked });
    }

    /**
     * Get field value
     * @param {string} fieldId - Field ID
     * @returns {Object|null} { value, checked, style } or null
     */
    getFieldValue(fieldId) {
        return this.state.liveFillData[fieldId] || null;
    }

    /**
     * Get all live fill data
     * @returns {Object}
     */
    getLiveFillData() {
        return { ...this.state.liveFillData };
    }

    /**
     * Set all live fill data (bulk update)
     * @param {Object} data - { fieldId: { value, checked }, ... }
     */
    setLiveFillData(data) {
        this.batch({
            'liveFillData': { ...data },
            'liveFillDirty': true,
            'liveFillLastChanged': Date.now()
        }, false);

        eventBus.emit(Events.LIVEFILL_DATA_LOADED, { liveFillData: data });
    }

    /**
     * Clear all live fill data
     */
    clearLiveFillData() {
        this.batch({
            'liveFillData': {},
            'liveFillDirty': false,
            'liveFillLastChanged': null
        }, false);

        eventBus.emit(Events.LIVEFILL_DATA_CLEARED);
    }

    /**
     * Mark live fill data as clean (after save/export)
     */
    markLiveFillClean() {
        this.set('liveFillDirty', false);
    }

    /**
     * Check if live fill has unsaved changes
     * @returns {boolean}
     */
    isLiveFillDirty() {
        return this.state.liveFillDirty;
    }

    // ============ EXCEL OPERATIONS ============

    /**
     * Set Excel data after import
     * @param {Object} data - Excel data
     * @param {string} fileName - Excel file name
     */
    setExcelData(data, fileName) {
        this.batch({
            'excelData': data,
            'excelFileName': fileName
        }, false);

        eventBus.emit(Events.EXCEL_LOADED, { fileName, data });
    }

    /**
     * Set Excel match results
     * @param {Object} results - { matched: [], unmatched: [] }
     */
    setExcelMatchResults(results) {
        this.set('excelMatchResults', results);
        eventBus.emit(Events.EXCEL_MATCHED, results);
    }

    /**
     * Clear Excel data
     */
    clearExcelData() {
        this.batch({
            'excelData': null,
            'excelFileName': null,
            'excelMatchResults': null
        }, false);

        eventBus.emit(Events.EXCEL_CLEARED);
    }

    /**
     * Get Excel data
     * @returns {Object|null}
     */
    getExcelData() {
        return this.state.excelData;
    }

    // ============ EXPORT OPERATIONS ============

    /**
     * Set export status
     * @param {string} status - ExportStatus value
     * @param {string} error - Error message (if status is ERROR)
     */
    setExportStatus(status, error = null) {
        const updates = { 'exportStatus': status };

        if (status === ExportStatus.ERROR) {
            updates['exportError'] = error;
        } else if (status === ExportStatus.DONE) {
            updates['exportError'] = null;
            updates['lastExportAt'] = Date.now();
            updates['liveFillDirty'] = false;
        } else if (status === ExportStatus.RUNNING) {
            updates['exportError'] = null;
        }

        this.batch(updates, false);

        if (status === ExportStatus.RUNNING) {
            eventBus.emit(Events.EXPORT_STARTED);
        } else if (status === ExportStatus.DONE) {
            eventBus.emit(Events.EXPORT_DONE, { lastExportAt: Date.now() });
        } else if (status === ExportStatus.ERROR) {
            eventBus.emit(Events.EXPORT_ERROR, { error });
        }
    }

    /**
     * Get export status
     * @returns {string}
     */
    getExportStatus() {
        return this.state.exportStatus;
    }

    // ============ SELECTION ============

    /**
     * Select a field
     * @param {string} fieldId - Field ID
     */
    selectField(fieldId) {
        const oldId = this.state.selection.fieldId;
        if (oldId === fieldId) return;

        this.set('selection.fieldId', fieldId);

        if (oldId) {
            eventBus.emit(Events.FIELD_DESELECTED, { fieldId: oldId });
        }
        if (fieldId) {
            eventBus.emit(Events.FIELD_SELECTED, { fieldId });
        }
    }

    /**
     * Deselect all fields
     */
    deselectAll() {
        this.selectField(null);
    }

    /**
     * Get selected field
     * @returns {Object|null}
     */
    getSelectedField() {
        if (!this.state.selection.fieldId) return null;
        return this.getField(this.state.selection.fieldId);
    }

    // ============ RADIO GROUP OPERATIONS ============

    /**
     * Add a radio group
     * @param {Object} groupData - Group data
     * @returns {Object} Created group
     */
    addRadioGroup(groupData) {
        const groupId = groupData.groupId || `rg_${++this.state.counters.radioGroup}_${Date.now()}`;
        const group = {
            groupId,
            groupName: groupData.groupName || '',
            groupNameEn: groupData.groupNameEn || '',
            page: groupData.page || this.state.document.currentPage,
            type: groupData.type || 'radio',
            options: groupData.options || [],
            ...groupData
        };

        const newGroups = [...this.state.radioGroups, group];
        this.set('radioGroups', newGroups, true);

        eventBus.emit(Events.RADIO_GROUP_CREATED, { group });
        return group;
    }

    /**
     * Update a radio group
     * @param {string} groupId - Group ID
     * @param {Object} updates - Updates to apply
     * @returns {Object|null}
     */
    updateRadioGroup(groupId, updates) {
        const index = this.state.radioGroups.findIndex(g => g.groupId === groupId);
        if (index === -1) return null;

        const updatedGroup = { ...this.state.radioGroups[index], ...updates };
        const newGroups = [...this.state.radioGroups];
        newGroups[index] = updatedGroup;

        this.set('radioGroups', newGroups, true);
        eventBus.emit(Events.RADIO_GROUP_UPDATED, { group: updatedGroup });
        return updatedGroup;
    }

    /**
     * Delete a radio group
     * @param {string} groupId - Group ID
     * @returns {boolean}
     */
    deleteRadioGroup(groupId) {
        const group = this.state.radioGroups.find(g => g.groupId === groupId);
        if (!group) return false;

        const newGroups = this.state.radioGroups.filter(g => g.groupId !== groupId);
        this.set('radioGroups', newGroups, true);

        eventBus.emit(Events.RADIO_GROUP_DELETED, { group });
        return true;
    }

    /**
     * Get radio group by ID
     * @param {string} groupId - Group ID
     * @returns {Object|undefined}
     */
    getRadioGroup(groupId) {
        return this.state.radioGroups.find(g => g.groupId === groupId);
    }

    // ============ TABLE OPERATIONS ============

    /**
     * Add a table
     * @param {Object} tableData - Table data
     * @returns {Object} Created table
     */
    addTable(tableData) {
        const tableId = tableData.tableId || `tbl_${++this.state.counters.table}_${Date.now()}`;
        const table = {
            tableId,
            page: tableData.page || this.state.document.currentPage,
            bbox: tableData.bbox || null,
            rowCount: tableData.rowCount || 0,
            rowHeight: tableData.rowHeight || 0,
            columns: tableData.columns || [],
            ...tableData
        };

        const newTables = [...this.state.tables, table];
        this.set('tables', newTables, true);

        eventBus.emit(Events.TABLE_CREATED, { table });
        return table;
    }

    /**
     * Update a table
     * @param {string} tableId - Table ID
     * @param {Object} updates - Updates to apply
     * @returns {Object|null}
     */
    updateTable(tableId, updates) {
        const index = this.state.tables.findIndex(t => t.tableId === tableId);
        if (index === -1) return null;

        const updatedTable = { ...this.state.tables[index], ...updates };
        const newTables = [...this.state.tables];
        newTables[index] = updatedTable;

        this.set('tables', newTables, true);
        eventBus.emit(Events.TABLE_UPDATED, { table: updatedTable });
        return updatedTable;
    }

    /**
     * Delete a table
     * @param {string} tableId - Table ID
     * @returns {boolean}
     */
    deleteTable(tableId) {
        const table = this.state.tables.find(t => t.tableId === tableId);
        if (!table) return false;

        const newTables = this.state.tables.filter(t => t.tableId !== tableId);
        this.set('tables', newTables, true);

        eventBus.emit(Events.TABLE_DELETED, { table });
        return true;
    }

    /**
     * Get table by ID
     * @param {string} tableId - Table ID
     * @returns {Object|undefined}
     */
    getTable(tableId) {
        return this.state.tables.find(t => t.tableId === tableId);
    }

    // ============ TOOL & MODE ============

    /**
     * Set current tool
     * @param {string} tool - Tool value
     */
    setTool(tool) {
        if (this.state.tool === tool) return;
        this.set('tool', tool);
        eventBus.emit(Events.TOOL_CHANGED, { tool });
    }

    /**
     * Set current mode
     * @param {string} mode - Mode value
     */
    setMode(mode) {
        if (this.state.mode === mode) return;
        const oldMode = this.state.mode;
        this.set('mode', mode);
        eventBus.emit(Events.MODE_CHANGED, { mode, oldMode });
    }

    /**
     * Set flow mode
     * @param {string} flowMode - FlowModes value
     */
    setFlowMode(flowMode) {
        if (this.state.flowMode === flowMode) return;
        const oldFlowMode = this.state.flowMode;
        this.set('flowMode', flowMode);
        eventBus.emit(Events.MODE_CHANGED, { mode: flowMode, oldMode: oldFlowMode });
    }

    /**
     * Get current flow mode
     * @returns {string}
     */
    getFlowMode() {
        return this.state.flowMode;
    }

    /**
     * Check if in live fill mode
     * @returns {boolean}
     */
    isLiveFillMode() {
        return this.state.flowMode === FlowModes.LIVE_FILL;
    }

    // ============ VIEW ============

    /**
     * Set zoom level
     * @param {number} zoom - Zoom level
     */
    setZoom(zoom) {
        const oldZoom = this.state.view.zoom;
        this.set('view.zoom', zoom);
        eventBus.emit(Events.ZOOM_CHANGED, { zoom, oldZoom });
    }

    /**
     * Get zoom level
     * @returns {number}
     */
    getZoom() {
        return this.state.view.zoom;
    }

    // ============ HISTORY (UNDO/REDO) ============

    /**
     * Push state to history
     * @private
     */
    _pushHistory(oldState) {
        this._undoStack = [];

        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push(this._deepClone(oldState));

        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }

        eventBus.emit(Events.HISTORY_PUSH, { index: this.historyIndex });
    }

    /**
     * Undo last action
     * @returns {boolean} Success
     */
    undo() {
        if (this.historyIndex < 0) return false;

        if (!this._undoStack) this._undoStack = [];
        this._undoStack.push(this._deepClone(this.state));

        const previousState = this.history[this.historyIndex];
        this.state = this._deepClone(previousState);
        this.historyIndex--;

        eventBus.emit(Events.HISTORY_UNDO, { index: this.historyIndex });
        eventBus.emit(Events.STATE_CHANGED, { action: 'undo' });
        return true;
    }

    /**
     * Redo last undone action
     * @returns {boolean} Success
     */
    redo() {
        if (!this._undoStack || this._undoStack.length === 0) return false;

        const nextState = this._undoStack.pop();
        this.state = this._deepClone(nextState);
        this.historyIndex++;

        eventBus.emit(Events.HISTORY_REDO, { index: this.historyIndex });
        eventBus.emit(Events.STATE_CHANGED, { action: 'redo' });
        return true;
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this.historyIndex >= 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this._undoStack && this._undoStack.length > 0;
    }

    // ============ PERSISTENCE ============

    /**
     * Export full state for saving
     * @returns {Object}
     */
    exportState() {
        const cleanedFields = this.state.fields.map(f => removeTransientFlags(f));

        return {
            version: '4.0',
            type: 'unified',
            exportedAt: new Date().toISOString(),
            document: {
                fileName: this.state.document.fileName,
                pageCount: this.state.document.pageCount
            },
            fields: cleanedFields,
            radioGroups: this.state.radioGroups,
            tables: this.state.tables,
            liveFillData: this.state.liveFillData,
            settings: this.state.settings
        };
    }

    /**
     * Export only mapped fields
     * @returns {Object}
     */
    exportMappedFields() {
        const mappedFields = this.state.fields
            .filter(f => f.isMapped)
            .map(f => removeTransientFlags(f));

        return {
            version: '4.0',
            type: 'mapping',
            exportedAt: new Date().toISOString(),
            document: {
                fileName: this.state.document.fileName,
                pageCount: this.state.document.pageCount
            },
            fields: mappedFields,
            radioGroups: this.state.radioGroups,
            tables: this.state.tables
        };
    }

    /**
     * Import state from saved data
     * @param {Object|Array} data - Saved state data
     */
    importState(data) {
        if (!data) {
            throw new Error('Invalid state data');
        }

        let fieldsToImport = [];
        let radioGroupsToImport = [];
        let tablesToImport = [];
        let liveFillDataToImport = {};

        // Handle array format
        if (Array.isArray(data)) {
            fieldsToImport = data.map(f => this._normalizeField(f));
        }
        // Handle object format
        else if (data.fields && Array.isArray(data.fields)) {
            fieldsToImport = data.fields.map(f => this._normalizeField(f));

            if (data.radioGroups && Array.isArray(data.radioGroups)) {
                radioGroupsToImport = data.radioGroups;
            }

            if (data.tables && Array.isArray(data.tables)) {
                tablesToImport = data.tables;
            }

            if (data.liveFillData && typeof data.liveFillData === 'object') {
                liveFillDataToImport = data.liveFillData;
            }
        }

        this.batch({
            'fields': fieldsToImport,
            'radioGroups': radioGroupsToImport,
            'tables': tablesToImport,
            'liveFillData': liveFillDataToImport
        }, true);

        eventBus.emit(Events.MAPPING_LOADED, { fieldsMapping: { fields: fieldsToImport } });
    }

    /**
     * Normalize a field from various formats
     * @private
     */
    _normalizeField(f) {
        const id = f.id || f.fieldId || `fld_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        let field = {
            id,
            type: f.type || 'text',
            page: f.page || 1,
            ...f
        };

        if (field.fieldId && field.id !== field.fieldId) {
            delete field.fieldId;
        }

        field = normalizeFieldNames(field);
        field.context = field.context || 'employee';
        field.isMapped = isFieldMapped(field);
        field = removeTransientFlags(field);

        return field;
    }

    /**
     * Reset to initial state
     */
    reset() {
        this.state = createInitialState();
        this.history = [];
        this.historyIndex = -1;
        this._undoStack = [];
        eventBus.emit(Events.STATE_CHANGED, { action: 'reset' });
    }

    // ============ INTERNAL UTILITIES ============

    /**
     * Deep clone an object
     * @private
     */
    _deepClone(obj) {
        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(obj);
            } catch (e) {
                // Fall back for non-cloneable values
            }
        }
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Shallow clone with path
     * @private
     */
    _shallowCloneWithPath(state, path) {
        const parts = path.split('.');
        const newState = { ...state };

        let current = newState;

        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            current[key] = Array.isArray(current[key])
                ? [...current[key]]
                : { ...current[key] };
            current = current[key];
        }

        return newState;
    }

    /**
     * Notify subscribers of state change
     * @private
     */
    _notify(path, value, oldState) {
        eventBus.emit(Events.STATE_CHANGED, { path, value, oldState });
    }
}

// ============ SINGLETON INSTANCE ============

export const state = new UnifiedStateManager();

// ============ DEBUG UTILITIES ============

if (typeof window !== 'undefined') {
    window.unifiedState = state;

    window.unifiedStateSnapshot = () => {
        const s = state.getState();
        console.log('=== Unified State Snapshot ===');
        console.log('Document:', s.document.fileName, '| Pages:', s.document.pageCount);
        console.log('Fields:', s.fields.length, '| Mapped:', s.fields.filter(f => f.isMapped).length);
        console.log('LiveFill entries:', Object.keys(s.liveFillData).length);
        console.log('Radio groups:', s.radioGroups.length);
        console.log('Tables:', s.tables.length);
        console.log('Flow mode:', s.flowMode);
        console.log('Export status:', s.exportStatus);
        console.log('History:', state.historyIndex + 1, '/', state.history.length);
        return s;
    };
}
