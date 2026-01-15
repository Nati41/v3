/**
 * LiveFill Core - Non-DOM utility functions
 * These functions have zero DOM dependencies and can be safely reused.
 */
(function() {
    'use strict';

    /**
     * Calculate bounding box position from percentage-based bbox
     * @param {Object} field - Field object with bbox array
     * @param {number} pdfWidth - PDF width in pixels
     * @param {number} pdfHeight - PDF height in pixels
     * @returns {Object} Position object with x, y, width, height
     */
    function calculateBBoxPosition(field, pdfWidth, pdfHeight) {
        const [xPct, yPct, wPct, hPct] = field.bbox;

        const x = xPct * pdfWidth;
        const y = (1 - yPct - hPct) * pdfHeight;
        const w = wPct * pdfWidth;
        const h = hPct * pdfHeight;

        return { x, y, width: w, height: h };
    }

    /**
     * Get default style object for text fields
     * @returns {Object} Default style configuration
     */
    function getDefaultStyle() {
        return {
            fontFamily: 'David Libre',
            fontSize: 14,
            color: '#000000',
            alignment: 'right',
            letterSpacing: 0,
            wordSpacing: 0,
            opacity: 1
        };
    }

    /**
     * Build export field data from a field object
     * @param {Object} field - Field object
     * @param {number} CHECKBOX_SIZE - Checkbox size constant
     * @param {number} RADIO_SIZE - Radio size constant
     * @returns {Object} Export-ready field data
     */
    function buildExportFieldData(field, CHECKBOX_SIZE, RADIO_SIZE) {
        const fieldData = {
            id: field.id || field.fieldId,
            type: field.type,
            page: field.page || 1
        };

        // Checkbox/Radio: export with anchor + overlay size
        if ((field.type === 'checkbox' || field.type === 'radio') && field.anchor) {
            fieldData.anchor = field.anchor;
            fieldData.overlayWidth = field.overlayWidth || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
            fieldData.overlayHeight = field.overlayHeight || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
        }
        // Regular fields: export with bbox
        else if (field.bbox) {
            fieldData.bbox = field.bbox;
        }

        return fieldData;
    }

    /**
     * Initialize liveFillData entry for a field
     * @param {Object} field - Field object
     * @param {Object} existingData - Existing liveFillData object
     * @returns {Object|null} New data entry or null if already exists
     */
    function initializeFieldData(field, existingData) {
        const fieldId = field.id || field.fieldId;
        if (!fieldId || existingData[fieldId]) return null;

        if (field.type === 'checkbox' || field.type === 'radio') {
            return {
                checked: false,
                value: ''
            };
        } else {
            return {
                value: '',
                style: getDefaultStyle()
            };
        }
    }

    /**
     * Validate field has required coordinate data
     * @param {Object} field - Field to validate
     * @returns {boolean} True if valid
     */
    function hasValidCoordinates(field) {
        if (!field) return false;

        // Check for anchor (checkbox/radio)
        if (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
            return true;
        }

        // Check for bbox (text fields)
        if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            return true;
        }

        // Check for V2 PDF coordinates
        if (typeof field.pdfX === 'number' && typeof field.pdfY === 'number') {
            return true;
        }

        return false;
    }

    // Export all functions
    window.LiveFillCore = {
        calculateBBoxPosition,
        getDefaultStyle,
        buildExportFieldData,
        initializeFieldData,
        hasValidCoordinates
    };
})();
