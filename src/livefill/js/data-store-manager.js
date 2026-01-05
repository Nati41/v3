/**
 * DataStoreManager - Separation of Imported Data vs Manual Fill
 *
 * This module maintains complete separation between:
 * 1. ImportedDataStore - Data from Excel/CSV (read-only in LiveFill)
 * 2. ManualFillStore - Data entered manually by user
 *
 * Priority Rules:
 * - If import is active AND imported value exists → use imported value
 * - Else if manual value exists → use manual value
 * - Else → empty/placeholder
 */
(function() {
    'use strict';

    // ============ DATA STORES ============

    /**
     * ImportedDataStore - Data from external sources (Excel/CSV)
     * Structure: { tables: { [tableId]: [ { col1: val1, col2: val2 }, ... ] }, fields: { [fieldId]: value } }
     */
    const importedDataStore = {
        tables: {},
        fields: {},
        meta: {
            source: null,      // 'excel', 'csv', 'api'
            fileName: null,
            importedAt: null,
            rowCount: 0
        }
    };

    /**
     * ManualFillStore - Data entered manually by user
     * Structure mirrors importedDataStore
     */
    const manualFillStore = {
        tables: {},
        fields: {}
    };

    /**
     * Import state
     */
    let isImportActive = false;

    // ============ CORE API ============

    /**
     * Get value for a table cell using priority rules
     * @param {string} tableId
     * @param {number} rowIndex
     * @param {string} columnKey
     * @returns {*} The resolved value
     */
    function getTableCellValue(tableId, rowIndex, columnKey) {
        // Priority 1: Imported data (if import is active)
        if (isImportActive) {
            const importedValue = importedDataStore.tables[tableId]?.[rowIndex]?.[columnKey];
            if (importedValue !== undefined && importedValue !== null) {
                return importedValue;
            }
        }

        // Priority 2: Manual data
        const manualValue = manualFillStore.tables[tableId]?.[rowIndex]?.[columnKey];
        if (manualValue !== undefined && manualValue !== null) {
            return manualValue;
        }

        // Priority 3: Empty
        return undefined;
    }

    /**
     * Get value for a regular field using priority rules
     * @param {string} fieldId
     * @returns {*} The resolved value
     */
    function getFieldValue(fieldId) {
        // Priority 1: Imported data (if import is active)
        if (isImportActive) {
            const importedValue = importedDataStore.fields[fieldId];
            if (importedValue !== undefined && importedValue !== null) {
                return importedValue;
            }
        }

        // Priority 2: Manual data
        const manualValue = manualFillStore.fields[fieldId];
        if (manualValue !== undefined && manualValue !== null) {
            return manualValue;
        }

        // Priority 3: Empty
        return undefined;
    }

    /**
     * Set value for a table cell (manual only!)
     * @param {string} tableId
     * @param {number} rowIndex
     * @param {string} columnKey
     * @param {*} value
     * @returns {boolean} True if write succeeded, false if blocked
     */
    function setTableCellValue(tableId, rowIndex, columnKey, value) {
        // BLOCK: Cannot write manually when import is active for this cell
        if (isImportActive && hasImportedTableCellValue(tableId, rowIndex, columnKey)) {
            console.warn(`[DataStoreManager] BLOCKED: Cannot manually edit imported cell ${tableId}[${rowIndex}][${columnKey}]`);
            return false;
        }

        // Initialize structure
        if (!manualFillStore.tables[tableId]) {
            manualFillStore.tables[tableId] = [];
        }
        if (!manualFillStore.tables[tableId][rowIndex]) {
            manualFillStore.tables[tableId][rowIndex] = {};
        }

        // Write to manual store
        manualFillStore.tables[tableId][rowIndex][columnKey] = value;
        console.log(`[DataStoreManager] Manual write: ${tableId}[${rowIndex}][${columnKey}] = "${value}"`);

        return true;
    }

    /**
     * Set value for a regular field (manual only!)
     * @param {string} fieldId
     * @param {*} value
     * @returns {boolean} True if write succeeded, false if blocked
     */
    function setFieldValue(fieldId, value) {
        // BLOCK: Cannot write manually when import is active for this field
        if (isImportActive && hasImportedFieldValue(fieldId)) {
            console.warn(`[DataStoreManager] BLOCKED: Cannot manually edit imported field ${fieldId}`);
            return false;
        }

        // Write to manual store
        manualFillStore.fields[fieldId] = value;
        console.log(`[DataStoreManager] Manual write: field ${fieldId}`);

        return true;
    }

    // ============ IMPORT API ============

    /**
     * Import table data from Excel/CSV
     * This DOES NOT overwrite manual data - it goes to a separate store
     * @param {string} tableId
     * @param {Array} data - Array of row objects
     * @param {Object} meta - Import metadata
     */
    function importTableData(tableId, data, meta = {}) {
        importedDataStore.tables[tableId] = data;
        importedDataStore.meta = {
            source: meta.source || 'excel',
            fileName: meta.fileName || 'unknown',
            importedAt: new Date().toISOString(),
            rowCount: data.length
        };

        isImportActive = true;

        console.log(`[DataStoreManager] Imported ${data.length} rows to table ${tableId}`);
        console.log(`[DataStoreManager] Import is now ACTIVE`);

        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('datastore:import-activated', {
            detail: { tableId, rowCount: data.length, meta: importedDataStore.meta }
        }));
    }

    /**
     * Import field data from Excel/CSV
     * @param {string} fieldId
     * @param {*} value
     */
    function importFieldData(fieldId, value) {
        importedDataStore.fields[fieldId] = value;
        isImportActive = true;
    }

    /**
     * Clear all imported data (returns to manual mode)
     * Manual data is preserved!
     */
    function clearImportedData() {
        const hadData = Object.keys(importedDataStore.tables).length > 0 ||
                       Object.keys(importedDataStore.fields).length > 0;

        importedDataStore.tables = {};
        importedDataStore.fields = {};
        importedDataStore.meta = {
            source: null,
            fileName: null,
            importedAt: null,
            rowCount: 0
        };

        isImportActive = false;

        console.log(`[DataStoreManager] Cleared imported data. Import is now INACTIVE`);
        console.log(`[DataStoreManager] Manual data preserved:`, {
            tables: Object.keys(manualFillStore.tables).length,
            fields: Object.keys(manualFillStore.fields).length
        });

        // Dispatch event for UI updates
        if (hadData) {
            window.dispatchEvent(new CustomEvent('datastore:import-cleared'));
        }
    }

    /**
     * Clear manual data for a specific table
     */
    function clearManualTableData(tableId) {
        if (manualFillStore.tables[tableId]) {
            delete manualFillStore.tables[tableId];
            console.log(`[DataStoreManager] Cleared manual data for table ${tableId}`);
        }
    }

    /**
     * Clear all manual data
     */
    function clearAllManualData() {
        manualFillStore.tables = {};
        manualFillStore.fields = {};
        console.log(`[DataStoreManager] Cleared all manual data`);
    }

    // ============ QUERY API ============

    /**
     * Check if import is currently active
     */
    function getIsImportActive() {
        return isImportActive;
    }

    /**
     * Check if a specific table cell has imported data
     */
    function hasImportedTableCellValue(tableId, rowIndex, columnKey) {
        const value = importedDataStore.tables[tableId]?.[rowIndex]?.[columnKey];
        return value !== undefined && value !== null;
    }

    /**
     * Check if a specific field has imported data
     */
    function hasImportedFieldValue(fieldId) {
        const value = importedDataStore.fields[fieldId];
        return value !== undefined && value !== null;
    }

    /**
     * Get import metadata
     */
    function getImportMeta() {
        return { ...importedDataStore.meta };
    }

    /**
     * Get all table data for a tableId (combined view for export)
     * Uses priority rules to resolve each cell
     * @param {string} tableId
     * @returns {Array} Array of row objects
     */
    function getTableDataForExport(tableId) {
        const importedRows = importedDataStore.tables[tableId] || [];
        const manualRows = manualFillStore.tables[tableId] || [];
        const maxRows = Math.max(importedRows.length, manualRows.length);

        const result = [];
        for (let i = 0; i < maxRows; i++) {
            const row = {};
            const importedRow = importedRows[i] || {};
            const manualRow = manualRows[i] || {};

            // Merge all keys
            const allKeys = new Set([...Object.keys(importedRow), ...Object.keys(manualRow)]);

            for (const key of allKeys) {
                // Priority: imported (if active) > manual
                if (isImportActive && importedRow[key] !== undefined) {
                    row[key] = importedRow[key];
                } else if (manualRow[key] !== undefined) {
                    row[key] = manualRow[key];
                }
            }

            result.push(row);
        }

        return result;
    }

    /**
     * Check if a table cell is editable (not locked by import)
     * @param {string} tableId
     * @param {number} rowIndex
     * @param {string} columnKey
     * @returns {boolean}
     */
    function isTableCellEditable(tableId, rowIndex, columnKey) {
        // If import is not active, always editable
        if (!isImportActive) return true;

        // If import is active but this cell has no imported data, editable
        return !hasImportedTableCellValue(tableId, rowIndex, columnKey);
    }

    /**
     * Check if a field is editable (not locked by import)
     * @param {string} fieldId
     * @returns {boolean}
     */
    function isFieldEditable(fieldId) {
        if (!isImportActive) return true;
        return !hasImportedFieldValue(fieldId);
    }

    /**
     * Get row count for a table (max of imported or manual)
     */
    function getTableRowCount(tableId) {
        const importedCount = importedDataStore.tables[tableId]?.length || 0;
        const manualCount = manualFillStore.tables[tableId]?.length || 0;
        return Math.max(importedCount, manualCount);
    }

    // ============ MIGRATION / SYNC API ============

    /**
     * Sync with legacy liveFillData object
     * Call this after any store change to keep legacy code working
     */
    function syncToLegacyLiveFillData(liveFillData) {
        if (!liveFillData) return;

        // Sync tables
        const allTableIds = new Set([
            ...Object.keys(importedDataStore.tables),
            ...Object.keys(manualFillStore.tables)
        ]);

        liveFillData.tables = liveFillData.tables || {};

        for (const tableId of allTableIds) {
            liveFillData.tables[tableId] = getTableDataForExport(tableId);
            // Also set direct reference for compatibility
            liveFillData[tableId] = liveFillData.tables[tableId];
        }

        // Sync fields (for regular fields, not tables)
        for (const fieldId of Object.keys(manualFillStore.fields)) {
            liveFillData[fieldId] = manualFillStore.fields[fieldId];
        }

        if (isImportActive) {
            for (const fieldId of Object.keys(importedDataStore.fields)) {
                liveFillData[fieldId] = importedDataStore.fields[fieldId];
            }
        }
    }

    /**
     * Initialize from existing liveFillData (migration)
     * Assumes existing data is "manual" data
     */
    function initFromLegacyLiveFillData(liveFillData) {
        if (!liveFillData) return;

        // Import tables as manual data
        if (liveFillData.tables) {
            for (const tableId of Object.keys(liveFillData.tables)) {
                manualFillStore.tables[tableId] = liveFillData.tables[tableId];
            }
        }

        // Import fields as manual data (skip tables and meta)
        const skipKeys = ['tables', 'meta', '_timestamp'];
        for (const key of Object.keys(liveFillData)) {
            if (!skipKeys.includes(key) && !Array.isArray(liveFillData[key])) {
                manualFillStore.fields[key] = liveFillData[key];
            }
        }

        console.log(`[DataStoreManager] Initialized from legacy data:`, {
            tables: Object.keys(manualFillStore.tables).length,
            fields: Object.keys(manualFillStore.fields).length
        });
    }

    // ============ DEBUG API ============

    function getDebugState() {
        return {
            isImportActive,
            importedDataStore: JSON.parse(JSON.stringify(importedDataStore)),
            manualFillStore: JSON.parse(JSON.stringify(manualFillStore))
        };
    }

    // ============ EXPORT ============

    window.DataStoreManager = {
        // Core getters
        getTableCellValue,
        getFieldValue,

        // Core setters (manual only)
        setTableCellValue,
        setFieldValue,

        // Import API
        importTableData,
        importFieldData,
        clearImportedData,

        // Manual data management
        clearManualTableData,
        clearAllManualData,

        // Query API
        getIsImportActive,
        hasImportedTableCellValue,
        hasImportedFieldValue,
        getImportMeta,
        isTableCellEditable,
        isFieldEditable,
        getTableRowCount,

        // Export API
        getTableDataForExport,

        // Legacy sync
        syncToLegacyLiveFillData,
        initFromLegacyLiveFillData,

        // Debug
        getDebugState
    };

    console.log('%c[DataStoreManager] Module loaded - Import/Manual separation ready', 'background: #9C27B0; color: white; padding: 3px 8px; border-radius: 3px;');

})();
