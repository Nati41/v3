/**
 * Preview Engine - Live Table Preview (Step 7)
 *
 * This module provides live preview functionality for table data:
 * - Mock data generation based on field types
 * - Cell preview rendering with proper positioning
 * - Row and table preview management
 * - Zoom-aware preview scaling
 * - Validation error indicators
 *
 * NOTE: All functions are modular and receive state as parameters.
 */
(function() {
    'use strict';

    // ============ CONFIGURATION ============

    const PREVIEW_CONFIG = {
        DEFAULT_FONT_SIZE: 12,
        MIN_FONT_SIZE: 8,
        MAX_FONT_SIZE: 24,
        DEFAULT_OPACITY: 0.85,
        TEXT_COLOR: '#4CAF50',
        ERROR_COLOR: '#FF9800',
        WARNING_BORDER_COLOR: '#FFC107',
        FONT_FAMILY: "'David Libre', 'Heebo', sans-serif",
        MOCK_TEXT_SHORT: 'דוגמה',
        MOCK_TEXT_MEDIUM: 'טקסט לדוגמה',
        MOCK_TEXT_LONG: 'זהו טקסט ארוך לדוגמה בלבד',
        DEFAULT_LANGUAGE: 'hebrew'
    };

    // ============ MOCK DATA GENERATION ============

    /**
     * Generate mock data for a specific field type
     * @param {string} type - Field type
     * @param {number} rowIndex - Row index for variation
     * @param {Object} options - Generation options
     * @returns {string} Mock value
     */
    function generateMockValue(type, rowIndex = 0, options = {}) {
        const lang = options.language || PREVIEW_CONFIG.DEFAULT_LANGUAGE;
        const length = options.textLength || 'medium'; // short, medium, long

        switch (type) {
            case 'number':
                return generateMockNumber(rowIndex);
            case 'date':
                return generateMockDate(rowIndex);
            case 'id_number':
                return generateMockIdNumber(rowIndex);
            case 'phone':
                return generateMockPhone(rowIndex);
            case 'email':
                return generateMockEmail(rowIndex, lang);
            case 'checkbox':
                return rowIndex % 2 === 0 ? '✓' : '';
            case 'radio':
                return rowIndex === 0 ? '●' : '○';
            case 'signature':
                return lang === 'hebrew' ? 'חתימה' : 'Signature';
            case 'address':
                return lang === 'hebrew' ? `רחוב הדוגמה ${rowIndex + 1}` : `Example St. ${rowIndex + 1}`;
            case 'text':
            default:
                return generateMockText(rowIndex, lang, length);
        }
    }

    /**
     * Generate mock number value
     * @param {number} rowIndex - Row index
     * @returns {string} Mock number
     */
    function generateMockNumber(rowIndex) {
        const baseNumbers = [100, 250, 500, 750, 1000, 1500, 2000, 2500];
        return String(baseNumbers[rowIndex % baseNumbers.length] + rowIndex * 50);
    }

    /**
     * Generate mock date value
     * @param {number} rowIndex - Row index
     * @returns {string} Mock date in DD/MM/YYYY format
     */
    function generateMockDate(rowIndex) {
        const day = String((rowIndex % 28) + 1).padStart(2, '0');
        const month = String((rowIndex % 12) + 1).padStart(2, '0');
        const year = 2024 - (rowIndex % 5);
        return `${day}/${month}/${year}`;
    }

    /**
     * Generate mock Israeli ID number
     * @param {number} rowIndex - Row index
     * @returns {string} Mock ID number
     */
    function generateMockIdNumber(rowIndex) {
        const base = 123456780 + rowIndex;
        return String(base).padStart(9, '0');
    }

    /**
     * Generate mock phone number
     * @param {number} rowIndex - Row index
     * @returns {string} Mock phone number
     */
    function generateMockPhone(rowIndex) {
        const prefixes = ['050', '052', '053', '054', '058'];
        const prefix = prefixes[rowIndex % prefixes.length];
        const suffix = String(1234567 + rowIndex * 111).slice(-7);
        return `${prefix}-${suffix}`;
    }

    /**
     * Generate mock email
     * @param {number} rowIndex - Row index
     * @param {string} lang - Language
     * @returns {string} Mock email
     */
    function generateMockEmail(rowIndex, lang) {
        const names = lang === 'hebrew'
            ? ['user', 'example', 'test', 'demo']
            : ['user', 'example', 'test', 'demo'];
        const name = names[rowIndex % names.length];
        return `${name}${rowIndex + 1}@example.com`;
    }

    /**
     * Generate mock text value
     * @param {number} rowIndex - Row index
     * @param {string} lang - Language (hebrew/english)
     * @param {string} length - Text length (short/medium/long)
     * @returns {string} Mock text
     */
    function generateMockText(rowIndex, lang, length) {
        const hebrewTexts = {
            short: ['דוגמה', 'בדיקה', 'טקסט', 'ערך', 'שם'],
            medium: ['טקסט לדוגמה', 'ערך בדיקה', 'שם מלא', 'כתובת', 'פרטים'],
            long: ['זהו טקסט ארוך לדוגמה', 'תיאור מפורט לבדיקה', 'שם מלא של הנבדק', 'כתובת מגורים מלאה']
        };

        const englishTexts = {
            short: ['Sample', 'Test', 'Text', 'Value', 'Name'],
            medium: ['Sample text', 'Test value', 'Full name', 'Address', 'Details'],
            long: ['This is a long sample text', 'Detailed test description', 'Full name of person', 'Complete home address']
        };

        const texts = lang === 'hebrew' ? hebrewTexts : englishTexts;
        const textArray = texts[length] || texts.medium;

        return textArray[rowIndex % textArray.length] + (rowIndex > 0 ? ` ${rowIndex + 1}` : '');
    }

    /**
     * Generate mock data for all columns in a row
     * @param {Array} columns - Array of column definitions
     * @param {number} rowIndex - Row index
     * @param {Object} options - Generation options
     * @returns {Object} Row data object { columnId: mockValue }
     */
    function generateMockRowData(columns, rowIndex, options = {}) {
        const rowData = {};

        columns.forEach(col => {
            const type = col.type || 'text';
            rowData[col.columnId] = generateMockValue(type, rowIndex, options);
        });

        return rowData;
    }

    // ============ PREVIEW RENDERING ============

    /**
     * Get or create the preview layer container
     * @returns {HTMLElement} Preview layer element
     */
    function getPreviewLayer() {
        let layer = document.getElementById('table-preview-layer');

        if (!layer) {
            const mappingLayer = document.getElementById('mapping-layer');
            if (!mappingLayer) return null;

            layer = document.createElement('div');
            layer.id = 'table-preview-layer';
            layer.className = 'table-preview-layer';

            // Insert after mapping layer (above it)
            mappingLayer.parentNode.insertBefore(layer, mappingLayer.nextSibling);
        }

        return layer;
    }

    /**
     * Render preview text for a single cell
     * @param {Object} cellBBox - Cell bounding box in canvas coordinates
     * @param {string} mockValue - Value to display
     * @param {Object} options - Rendering options
     * @returns {HTMLElement} Preview element
     */
    function renderCellPreview(cellBBox, mockValue, options = {}) {
        const layer = getPreviewLayer();
        if (!layer) return null;

        const {
            fontSize = PREVIEW_CONFIG.DEFAULT_FONT_SIZE,
            opacity = PREVIEW_CONFIG.DEFAULT_OPACITY,
            textColor = PREVIEW_CONFIG.TEXT_COLOR,
            hasError = false,
            hasWarning = false,
            errorMessage = '',
            warningMessage = '',
            cellId = ''
        } = options;

        const preview = document.createElement('div');
        preview.className = 'cell-preview';
        if (cellId) preview.dataset.cellId = cellId;

        // Position and size
        preview.style.left = cellBBox.x + 'px';
        preview.style.top = cellBBox.y + 'px';
        preview.style.width = cellBBox.width + 'px';
        preview.style.height = cellBBox.height + 'px';

        // Styling
        preview.style.fontSize = fontSize + 'px';
        preview.style.opacity = opacity;
        preview.style.color = hasError ? PREVIEW_CONFIG.ERROR_COLOR : textColor;
        preview.style.fontFamily = PREVIEW_CONFIG.FONT_FAMILY;

        // Error/warning indicators
        if (hasError || hasWarning) {
            preview.classList.add(hasError ? 'has-error' : 'has-warning');

            // Add indicator icon
            const indicator = document.createElement('span');
            indicator.className = 'preview-indicator';
            indicator.textContent = '⚠';
            indicator.title = hasError ? errorMessage : warningMessage;
            preview.appendChild(indicator);
        }

        // Text content
        const textSpan = document.createElement('span');
        textSpan.className = 'preview-text';
        textSpan.textContent = mockValue || '';
        preview.appendChild(textSpan);

        layer.appendChild(preview);
        return preview;
    }

    /**
     * Render preview for a single row
     * @param {Object} table - Table object
     * @param {number} rowIndex - Row index
     * @param {Object} rowData - Row data from table.rows
     * @param {Object} mockData - Mock data for the row
     * @param {Object} options - Rendering options
     */
    function renderRowPreview(table, rowIndex, rowData, mockData, options = {}) {
        const { columns, invalidComponents, _canvasBBox, rowCount } = table;

        // Calculate display dimensions
        const displayRowHeight = _canvasBBox.height / rowCount;

        columns.forEach((col, colIndex) => {
            const cellData = rowData[col.columnId];
            if (!cellData) return;

            // Calculate canvas position
            const cellX = col._canvasBBox.x;
            const cellY = col._canvasBBox.y + (rowIndex - table.sampleRowIndex) * displayRowHeight;
            const cellWidth = col._canvasBBox.width;
            const cellHeight = col._canvasBBox.height;

            const cellBBox = { x: cellX, y: cellY, width: cellWidth, height: cellHeight };
            const mockValue = mockData[col.columnId] || '';

            // Check for validation errors
            const invalidCols = invalidComponents?.columns || [];
            const invalidRows = invalidComponents?.rows || [];
            const hasError = invalidCols.includes(col.columnId) || invalidCols.includes(colIndex);
            const hasWarning = invalidRows.includes(rowIndex);

            // Get error/warning message
            let errorMessage = '';
            let warningMessage = '';

            if (hasError && invalidComponents?.errors) {
                const colErrors = invalidComponents.errors.filter(e =>
                    e.context?.columnId === col.columnId || e.context?.columnIndex === colIndex
                );
                errorMessage = colErrors.map(e => e.message).join('\n');
            }

            if (hasWarning && invalidComponents?.warnings) {
                const rowWarnings = invalidComponents.warnings?.filter(w =>
                    w.context?.rowIndex === rowIndex
                ) || [];
                warningMessage = rowWarnings.map(w => w.message).join('\n');
            }

            renderCellPreview(cellBBox, mockValue, {
                ...options,
                cellId: `${table.tableId}_${col.columnId}_row${rowIndex}`,
                hasError,
                hasWarning,
                errorMessage,
                warningMessage
            });
        });
    }

    /**
     * Render preview for an entire table
     * @param {Object} table - Table object
     * @param {Object} options - Rendering options
     */
    function renderTablePreview(table, options = {}) {
        if (!table || !table.rows || !table.columns) {
            console.warn('⚠️ Cannot render preview: invalid table structure');
            return;
        }

        const { tableId, columns, rows } = table;
        const previewOptions = {
            language: options.language || PREVIEW_CONFIG.DEFAULT_LANGUAGE,
            textLength: options.textLength || 'medium',
            fontSize: options.fontSize || PREVIEW_CONFIG.DEFAULT_FONT_SIZE,
            opacity: options.opacity || PREVIEW_CONFIG.DEFAULT_OPACITY
        };

        // Clear existing preview for this table
        clearTablePreview(tableId);

        // Render each row
        rows.forEach((rowData, rowIndex) => {
            const mockData = generateMockRowData(columns, rowIndex, previewOptions);
            renderRowPreview(table, rowIndex, rowData, mockData, previewOptions);
        });

        console.log(`✅ Preview rendered for table ${tableId}: ${rows.length} rows`);
    }

    /**
     * Clear preview for a specific table
     * @param {string} tableId - Table ID
     */
    function clearTablePreview(tableId) {
        const layer = document.getElementById('table-preview-layer');
        if (!layer) return;

        const previews = layer.querySelectorAll(`[data-cell-id^="${tableId}_"]`);
        previews.forEach(p => p.remove());
    }

    /**
     * Clear all previews
     */
    function clearAllPreviews() {
        const layer = document.getElementById('table-preview-layer');
        if (layer) {
            layer.innerHTML = '';
        }
    }

    /**
     * Update preview with new options
     * @param {Object} table - Table object
     * @param {Object} options - New rendering options
     */
    function updateTablePreview(table, options) {
        clearTablePreview(table.tableId);
        renderTablePreview(table, options);
    }

    /**
     * Refresh all table previews (e.g., after zoom)
     * FIX PACKAGE 2: Added safety fallback and warning log for empty previews
     * @param {Array} tables - Array of table objects
     * @param {Object} options - Rendering options
     */
    function refreshAllPreviews(tables, options = {}) {
        clearAllPreviews();

        if (!tables || tables.length === 0) {
            console.warn('📺 refreshAllPreviews: No tables to preview');
            return;
        }

        let previewedCount = 0;
        tables.forEach(table => {
            if (table._previewEnabled) {
                renderTablePreview(table, options);
                previewedCount++;
            }
        });

        // FIX PACKAGE 2: Log warning if no previews rendered
        if (previewedCount === 0) {
            console.warn('📺 refreshAllPreviews: No tables have preview enabled');
        } else {
            console.log(`📺 refreshAllPreviews: Rendered ${previewedCount} table previews`);
        }
    }

    // ============ PREVIEW STATE MANAGEMENT ============

    /**
     * Enable preview for a table
     * @param {Object} table - Table object
     * @param {Object} options - Rendering options
     */
    function enableTablePreview(table, options = {}) {
        if (!table) return;

        table._previewEnabled = true;
        renderTablePreview(table, options);
    }

    /**
     * Disable preview for a table
     * @param {Object} table - Table object
     */
    function disableTablePreview(table) {
        if (!table) return;

        table._previewEnabled = false;
        clearTablePreview(table.tableId);
    }

    /**
     * Toggle preview for a table
     * @param {Object} table - Table object
     * @param {Object} options - Rendering options
     * @returns {boolean} New preview state
     */
    function toggleTablePreview(table, options = {}) {
        if (!table) return false;

        if (table._previewEnabled) {
            disableTablePreview(table);
        } else {
            enableTablePreview(table, options);
        }

        return table._previewEnabled;
    }

    /**
     * Check if preview is enabled for a table
     * @param {Object} table - Table object
     * @returns {boolean} Preview enabled state
     */
    function isPreviewEnabled(table) {
        return table?._previewEnabled === true;
    }

    // ============ PREVIEW SETTINGS ============

    /**
     * Get default preview settings
     * @returns {Object} Default settings
     */
    function getDefaultSettings() {
        return {
            fontSize: PREVIEW_CONFIG.DEFAULT_FONT_SIZE,
            opacity: PREVIEW_CONFIG.DEFAULT_OPACITY,
            textLength: 'medium',
            language: PREVIEW_CONFIG.DEFAULT_LANGUAGE,
            showErrors: true,
            showWarnings: true
        };
    }

    /**
     * Validate preview settings
     * @param {Object} settings - Settings to validate
     * @returns {Object} Validated settings
     */
    function validateSettings(settings) {
        const defaults = getDefaultSettings();

        return {
            fontSize: Math.min(
                Math.max(settings.fontSize || defaults.fontSize, PREVIEW_CONFIG.MIN_FONT_SIZE),
                PREVIEW_CONFIG.MAX_FONT_SIZE
            ),
            opacity: Math.min(Math.max(settings.opacity || defaults.opacity, 0.3), 1),
            textLength: ['short', 'medium', 'long'].includes(settings.textLength)
                ? settings.textLength
                : defaults.textLength,
            language: ['hebrew', 'english'].includes(settings.language)
                ? settings.language
                : defaults.language,
            showErrors: settings.showErrors !== false,
            showWarnings: settings.showWarnings !== false
        };
    }

    // ============ EXPORT ============

    window.PreviewEngine = {
        // Configuration
        config: PREVIEW_CONFIG,

        // Mock data generation
        generateMockValue,
        generateMockRowData,
        generateMockNumber,
        generateMockDate,
        generateMockIdNumber,
        generateMockPhone,
        generateMockEmail,
        generateMockText,

        // Preview rendering
        getPreviewLayer,
        renderCellPreview,
        renderRowPreview,
        renderTablePreview,

        // Preview management
        clearTablePreview,
        clearAllPreviews,
        updateTablePreview,
        refreshAllPreviews,

        // State management
        enableTablePreview,
        disableTablePreview,
        toggleTablePreview,
        isPreviewEnabled,

        // Settings
        getDefaultSettings,
        validateSettings
    };

    console.log('%c👁️ Preview Engine Module Loaded (Step 7)', 'background: #4CAF50; color: white; font-size: 14px; padding: 5px;');
})();
