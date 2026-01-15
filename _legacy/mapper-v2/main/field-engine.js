/**
 * Mapper Field Engine - Field management logic
 * These functions handle field creation, modification, and removal.
 *
 * NOTE: All functions receive mapper state as parameters.
 * No internal "this" references - all state passed in.
 */
(function() {
    'use strict';

    // ============ ID GENERATION ============

    /**
     * Generate a unique field ID
     * @param {Object} mapper - FieldMapper instance for state access
     * @returns {string} Unique field ID
     */
    function generateUniqueId(mapper) {
        let id = 'field_' + Date.now();
        let counter = 1;

        while (mapper.fields.some(f => f.id === id)) {
            id = 'field_' + Date.now() + '_' + counter;
            counter++;
        }

        return id;
    }

    /**
     * Ensure a base ID is unique by appending counter if needed
     * @param {string} baseId - Base ID to make unique
     * @param {Object} mapper - FieldMapper instance for state access
     * @returns {string} Unique field ID
     */
    function ensureUniqueId(baseId, mapper) {
        let id = baseId;
        let counter = 2;

        while (mapper.fields.some(f => f.id === id)) {
            id = baseId + '_' + counter;
            counter++;
        }

        return id;
    }

    // ============ FIELD CREATION ============

    /**
     * Add a new field
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function addNewField(mapper) {
        const id = generateUniqueId(mapper);
        const newField = {
            id,
            label_he: '',
            label_en: '',
            type: 'text',
            direction: 'rtl',
            fontSize: 14,
            letterSpacing: 0,
            wordSpacing: 0,
            lineHeight: 1.0,
            anchorH: 'start',
            anchorV: 'middle',
            padStart: 4,
            padEnd: 4,
            padTop: 2,
            padBottom: 2,
            page: mapper.currentPage,
            xPct: null,
            yPct: null,
            wPct: null,
            hPct: null,
            liveText: '',
            textSettings: {
                fontFamily: 'David Libre',
                fontSize: 14,
                alignmentH: 'center',
                alignmentV: 'middle',
                color: '#000000',
                opacity: 1.0,
                letterSpacing: 0,
                wordSpacing: 0
            },
            isMapped: false,
            isComplete: false,
            element: null
        };

        setAutoNames(newField, mapper);

        // ✅ Normalize field before adding
        const normalizedField = normalizeField(newField);
        if (!normalizedField) {
            console.error('❌ Failed to normalize new field');
            return;
        }

        mapper.fields.push(normalizedField);

        mapper.interaction.mode = 'mapping';
        mapper.interaction.targetFieldId = normalizedField.id;

        mapper.switchTab('editing');
        mapper.selectField(normalizedField.id, { scroll: true });
        mapper.expandedFieldId = normalizedField.id;
        mapper.updateFieldList();

        mapper.saveState('add_field');

        mapper.setStatus(`📌 שדה חדש: ${normalizedField.label_he} - צייר מלבן למיפוי`, 'info');
        mapper.updateMappingBadge(`📌 שדה חדש: ${normalizedField.label_he} - צייר מלבן למיפוי - Esc לביטול`);

        if (mapper.mode === 'preview') {
            mapper.setMode('mapping');
        }

        mapper.showToast(`שדה חדש "${normalizedField.label_he}" נוסף לרשימה. צייר מלבן למיפוי.`, 'success');
    }

    /**
     * Set auto-generated names for a field
     * @param {Object} field - Field object
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function setAutoNames(field, mapper) {
        if (!field.label_he || !field.label_he.trim()) {
            const byType = {
                text: 'שדה טקסט',
                number: 'מספר',
                date: 'תאריך',
                email: 'אימייל',
                phone: 'טלפון',
                id_number: 'תעודת זהות',
                address: 'כתובת',
                checkbox: 'Checkbox',
                radio: 'Radio',
                signature: 'חתימה'
            };
            field.label_he = byType[field.type] || 'שדה חדש';
        }

        field.label_en = generateEnglishId(field.label_he, mapper).replace(/_/g, ' ');
        field.liveText = '';  // Add live text property
        field.id = ensureUniqueId(generateEnglishId(field.label_he, mapper), mapper);
    }

    /**
     * Generate English ID from Hebrew text
     * @param {string} hebrewText - Hebrew text to convert
     * @param {Object} mapper - FieldMapper instance for state access
     * @returns {string} English ID
     */
    function generateEnglishId(hebrewText, mapper) {
        if (!hebrewText) return 'field';

        const normalized = hebrewText.trim().toLowerCase();
        if (mapper.fieldDictionary[normalized]) {
            return mapper.fieldDictionary[normalized];
        }

        const map = {
            'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h',
            'ו': 'v', 'ז': 'z', 'ח': 'h', 'ט': 't', 'י': 'y',
            'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm',
            'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
            'ף': 'p', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r',
            'ש': 'sh', 'ת': 't'
        };

        let result = hebrewText.split('').map(char => map[char] || char).join('')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');

        return result || 'field';
    }

    /**
     * Detect text direction (RTL or LTR)
     * @param {string} text - Text to analyze
     * @param {Object} mapper - FieldMapper instance for state access
     * @returns {string} 'rtl' or 'ltr'
     */
    function detectTextDirection(text, mapper) {
        if (!text) return 'rtl';

        const hasHebrew = /[\u0590-\u05FF]/.test(text);
        const hasEnglish = /[a-zA-Z]/.test(text);
        const isNumber = /^[\d\s\-\+\.\,\(\)]+$/.test(text);

        if (isNumber) return 'ltr';
        if (hasHebrew && !hasEnglish) return 'rtl';
        if (hasEnglish) return 'ltr';

        return 'rtl';
    }

    // ============ FIELD REMOVAL ============

    /**
     * Remove a field by ID
     * @param {string} fieldId - Field ID to remove
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function removeField(fieldId, mapper) {
        const index = mapper.fields.findIndex(f => f.id === fieldId);
        if (index === -1) return;

        const field = mapper.fields[index];

        if (field.element) {
            field.element.remove();
        }

        mapper.fields.splice(index, 1);

        if (mapper.selectedField?.id === fieldId) {
            mapper.selectedField = null;
        }

        mapper.updateFieldList();
        mapper.checkFieldOverlaps();
        mapper.saveState('remove_field');

        // Update preview in real-time
        mapper.updatePreviewRealTime();

        mapper.showToast('השדה נמחק', 'success');
    }

    /**
     * Duplicate a field (currently shows info message)
     * @param {string} fieldId - Field ID to duplicate
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function duplicateField(fieldId, mapper) {
        mapper.showToast('השתמש בכפתור "➕ הוסף שדה" ליצירת שדה חדש', 'info');
    }

    /**
     * Remap a field (clear mapping and start fresh)
     * @param {string} fieldId - Field ID to remap
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function remapField(fieldId, mapper) {
        const field = mapper.fields.find(f => f.id === fieldId);
        if (!field) return;

        // Clear existing mapping but keep the field data
        field.isMapped = false;
        field.isComplete = false;
        field.bbox = null;
        field.xPct = null;
        field.yPct = null;
        field.wPct = null;
        field.hPct = null;

        // Remove the visual element
        if (field.element) {
            field.element.remove();
            field.element = null;
        }

        // Start mapping mode for this field
        mapper.mappingTargetField = field;
        mapper.interaction.mode = 'mapping';
        mapper.interaction.targetFieldId = field.id;
        mapper.selectField(field.id);
        mapper.updateMappingBadge(`מיפוי מחדש: ${field.label_he || field.id}`);
        mapper.setStatus('גרור על המסמך כדי למפות את השדה מחדש', 'info');

        mapper.updateFieldList();
        mapper.showToast(`התחל מיפוי מחדש עבור "${field.label_he || field.id}"`, 'info');
    }

    // ============ TABLE FIELD CREATION ============

    /**
     * Open table field creation dialog
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function addTableField(mapper) {
        const dialog = document.getElementById('table-dialog');
        if (dialog) {
            dialog.style.display = 'flex';
            // Reset form values
            document.getElementById('table-name').value = '';
            document.getElementById('table-base-field').value = '';
            document.getElementById('table-rows').value = '5';
            document.getElementById('table-cols').value = '1';
            document.getElementById('table-field-type').value = 'text';
        }
    }

    /**
     * Create table fields from dialog values
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function createTableFields(mapper) {
        // Get values from UI module
        const dialogValues = mapper.UI.getTableDialogValues();
        const tableName = dialogValues.name;
        const baseField = dialogValues.baseField;
        const rows = dialogValues.rows;
        const cols = dialogValues.cols;
        const fieldType = dialogValues.fieldType;

        if (!tableName || !baseField) {
            mapper.showToast('נא למלא את כל השדות', 'warning');
            return;
        }

        // Show grid preview first
        mapper.showTableGridPreview(rows, cols);

        // Create table group
        const tableGroup = {
            id: 'table_' + Date.now(),
            name: tableName,
            baseField: baseField,
            rows: rows,
            cols: cols,
            fields: []
        };

        // Wait for user to draw the table area
        mapper.interaction.mode = 'drawing_table';
        mapper.interaction.tableConfig = {
            group: tableGroup,
            rows: rows,
            cols: cols,
            fieldType: fieldType,
            tableName: tableName,
            baseField: baseField
        };

        mapper.closeTableDialog();
        mapper.setStatus(`📋 צייר אזור לטבלה "${tableName}" (${rows}×${cols})`, 'info');
        mapper.showToast('צייר מלבן על המסמך לאזור הטבלה', 'info');
    }

    /**
     * Create table fields in a drawn area
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function createTableFieldsInArea(x, y, width, height, mapper) {
        const config = mapper.interaction.tableConfig;
        if (!config) return;

        const cellWidth = width / config.cols;
        const cellHeight = height / config.rows;

        const fields = [];

        for (let row = 0; row < config.rows; row++) {
            for (let col = 0; col < config.cols; col++) {
                const fieldId = config.cols > 1
                    ? `${config.baseField}_r${row + 1}_c${col + 1}`
                    : `${config.baseField}_${row + 1}`;

                const cellX = x + (col * cellWidth);
                const cellY = y + (row * cellHeight);

                const layer = document.getElementById('mapping-layer');
                const field = {
                    id: fieldId,
                    label_he: config.cols > 1
                        ? `${config.tableName} - שורה ${row + 1} עמודה ${col + 1}`
                        : `${config.tableName} - שורה ${row + 1}`,
                    label_en: fieldId,
                    type: config.fieldType,
                    direction: 'rtl',
                    fontSize: mapper.Core.calculateAutoFitFontSize(cellHeight * 0.8),
                    letterSpacing: 0,
                    wordSpacing: 0,
                    lineHeight: 1.0,
                    anchorH: 'start',
                    anchorV: 'middle',
                    padStart: 4,
                    padEnd: 4,
                    padTop: 2,
                    padBottom: 2,
                    page: mapper.currentPage,
                    xPct: (cellX / layer.offsetWidth) * 100,
                    yPct: (cellY / layer.offsetHeight) * 100,
                    wPct: (cellWidth / layer.offsetWidth) * 100,
                    hPct: (cellHeight / layer.offsetHeight) * 100,
                    // No dummy data in Mapper mode - structure only
                    isMapped: true,
                    isComplete: true,
                    element: null,
                    tableGroupId: config.group.id,
                    tableRow: row + 1,
                    tableCol: col + 1
                };

                // ✅ Normalize field before adding
                const normalizedField = normalizeField(field);
                if (!normalizedField) continue;

                mapper.fields.push(normalizedField);
                config.group.fields.push(normalizedField.id);
                fields.push(normalizedField);
            }
        }

        mapper.tableGroups.push(config.group);

        // Render all table fields
        fields.forEach(field => mapper.renderField(field));

        mapper.switchTab('tables');
        mapper.updateFieldList();
        mapper.saveState('create_table');
        mapper.checkFieldOverlaps();

        mapper.showToast(`נוצרה טבלה "${config.tableName}" עם ${config.rows * config.cols} שדות`, 'success');

        // Reset interaction
        mapper.interaction.mode = 'idle';
        mapper.interaction.tableConfig = null;
    }

    // ============ EXPORT ============

    window.MapperFieldEngine = {
        generateUniqueId,
        ensureUniqueId,
        addNewField,
        setAutoNames,
        generateEnglishId,
        detectTextDirection,
        removeField,
        duplicateField,
        remapField,
        addTableField,
        createTableFields,
        createTableFieldsInArea
    };
})();
