/**
 * Mapper Core - Non-DOM utility functions
 * These functions have zero DOM dependencies and can be safely reused.
 */
(function() {
    'use strict';

    // ============ CONSTANTS ============

    const CHECKBOX_SIZE = 20;
    const RADIO_SIZE = 16;

    // ============ PURE LOGIC FUNCTIONS ============

    /**
     * Generate a unique ID for a field
     * @returns {string} Unique field ID
     */
    function generateUniqueId() {
        return 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Ensure a field ID is unique by appending a number if necessary
     * @param {string} baseId - The base ID to check
     * @param {Array} existingFields - Array of existing field objects
     * @returns {string} Unique field ID
     */
    function ensureUniqueId(baseId, existingFields) {
        let newId = baseId;
        let counter = 1;

        while (existingFields.some(f => f.id === newId)) {
            newId = `${baseId}_${counter}`;
            counter++;
        }

        return newId;
    }

    /**
     * Generate an English ID from Hebrew text using transliteration
     * @param {string} hebrewText - Hebrew text to transliterate
     * @returns {string} English transliterated ID
     */
    function generateEnglishId(hebrewText) {
        if (!hebrewText) return '';

        const hebrewToEnglish = {
            'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h',
            'ו': 'v', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y',
            'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm',
            'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
            'ף': 'p', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k', 'ר': 'r',
            'ש': 'sh', 'ת': 't'
        };

        let result = '';
        for (const char of hebrewText) {
            if (hebrewToEnglish[char]) {
                result += hebrewToEnglish[char];
            } else if (/[a-zA-Z0-9_]/.test(char)) {
                result += char.toLowerCase();
            } else if (char === ' ') {
                result += '_';
            }
        }

        // Clean up multiple underscores and trim
        return result.replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    /**
     * Detect text direction (RTL or LTR)
     * @param {string} text - Text to analyze
     * @returns {string} 'rtl' or 'ltr'
     */
    function detectTextDirection(text) {
        if (!text) return 'rtl';

        // Check for Hebrew characters
        const hebrewPattern = /[\u0590-\u05FF]/;
        if (hebrewPattern.test(text)) {
            return 'rtl';
        }
        return 'ltr';
    }

    /**
     * Calculate auto-fit font size based on field height
     * @param {number} height - Field height in pixels
     * @returns {number} Calculated font size
     */
    function calculateAutoFitFontSize(height) {
        // Use 70% of height as font size, with min 8 and max 48
        return Math.max(8, Math.min(48, Math.round(height * 0.7)));
    }

    /**
     * Calculate overlap percentage between two bounding boxes
     * @param {Array} bbox1 - First bbox [x, y, width, height]
     * @param {Array} bbox2 - Second bbox [x, y, width, height]
     * @param {number} threshold - Overlap threshold (default 0.1)
     * @returns {boolean} True if overlap exceeds threshold
     */
    function checkFieldOverlap(bbox1, bbox2, threshold = 0.1) {
        const [x1, y1, w1, h1] = bbox1;
        const [x2, y2, w2, h2] = bbox2;

        // Calculate overlap area
        const overlapX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
        const overlapY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
        const overlapArea = overlapX * overlapY;

        // Calculate minimum area of the two fields
        const area1 = w1 * h1;
        const area2 = w2 * h2;
        const minArea = Math.min(area1, area2);

        // Check if overlap exceeds threshold percentage
        return minArea > 0 && (overlapArea / minArea) > threshold;
    }

    /**
     * Snap a value to the nearest grid point
     * @param {number} value - Value to snap
     * @param {boolean} snapToGrid - Whether grid snapping is enabled
     * @param {number} gridSize - Grid size (default 10)
     * @returns {number} Snapped value
     */
    function snapToGridValue(value, snapToGrid, gridSize = 10) {
        if (!snapToGrid) return value;
        return Math.round(value / gridSize) * gridSize;
    }

    /**
     * Get default text direction based on field type
     * @param {string} type - Field type
     * @returns {string} 'rtl' or 'ltr'
     */
    function getDefaultDirectionForType(type) {
        // Numbers should be left-to-right
        if (type === 'number' || type === 'phone' || type === 'id' || type === 'id_number') {
            return 'ltr';
        }
        return 'rtl'; // Hebrew text default
    }

    /**
     * Map external field type to internal type
     * @param {string} templateType - External field type
     * @returns {string} Internal field type
     */
    function mapFieldType(templateType) {
        const typeMapping = {
            'text': 'text',
            'date': 'date',
            'number': 'number',
            'radio': 'checkbox',  // Convert radio to checkbox for simplicity
            'checkbox': 'checkbox'
        };

        return typeMapping[templateType] || 'text';
    }

    /**
     * Get font name for a field based on its type and direction
     * @param {Object} field - Field object
     * @returns {string} Font name
     */
    function getFontNameForField(field) {
        if (field.type === 'checkbox') {
            return 'Helvetica';
        }
        return field.direction === 'ltr' ? 'Helvetica' : 'DavidLibre';
    }

    /**
     * Get horizontal anchor based on field properties
     * @param {Object} field - Field object
     * @returns {string} Anchor value ('start', 'center', 'end')
     */
    function getAnchorH(field) {
        if (field.type === 'checkbox' || field.type === 'radio') {
            return 'center';
        }
        return field.direction === 'rtl' ? 'end' : 'start';
    }

    /**
     * Get vertical anchor (always middle)
     * @param {Object} field - Field object
     * @returns {string} Anchor value
     */
    function getAnchorV(field) {
        return 'middle';
    }

    /**
     * Get placeholder text for a field type
     * @param {string} type - Field type
     * @returns {string} Placeholder text
     */
    function getPlaceholderForType(type) {
        const placeholders = {
            'text': 'הזן טקסט...',
            'number': 'הזן מספר...',
            'id_number': 'הזן מספר זהות...',
            'phone': 'הזן מספר טלפון...',
            'date': 'הזן תאריך...',
            'email': 'הזן כתובת אימייל...'
        };
        return placeholders[type] || 'הזן ערך...';
    }

    /**
     * Build export field data for mapping JSON
     * @param {Object} field - Field object
     * @returns {Object} Export-ready field data
     */
    function buildExportFieldData(field) {
        const data = {
            fieldId: field.id,
            type: field.type || 'text',
            page: field.page || 1
        };

        // Checkbox/Radio: include anchor and overlay size
        if (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
            data.anchor = field.anchor;
            data.overlayWidth = field.overlayWidth || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
            data.overlayHeight = field.overlayHeight || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
        }
        // Regular fields: include bbox
        else if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            data.bbox = field.bbox;
        }

        return data;
    }

    /**
     * Validate that a field has required coordinate data
     * @param {Object} field - Field to validate
     * @returns {boolean} True if valid coordinates exist
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

        // Check for legacy percentage coordinates
        if (field.xPct != null && field.yPct != null) {
            return true;
        }

        return false;
    }

    /**
     * Check if a field is properly mapped
     * @param {Object} field - Field to check
     * @returns {boolean} True if field is mapped
     */
    function isFieldMapped(field) {
        if (!field) return false;

        // Check for valid bbox
        const hasBbox = field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4;

        // Check for valid anchor (used by checkbox/radio)
        const hasAnchor = field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2;

        // Check for valid V2 coordinates
        const hasV2Coords = typeof field.pdfX === 'number' && typeof field.pdfY === 'number';

        return hasBbox || hasAnchor || hasV2Coords;
    }

    /**
     * Check if a bbox represents an unmapped default
     * @param {Array} bbox - Bbox array [x, y, w, h]
     * @returns {boolean} True if this is a default unmapped bbox
     */
    function isDefaultUnmappedBbox(bbox) {
        if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) return false;
        const [x, y, w, h] = bbox;
        return (x === 0 && y === 0 && w === 0.1 && h === 0.05);
    }

    /**
     * Parse hex color to RGB values (0-1 range)
     * @param {string} hexColor - Hex color string (with or without #)
     * @returns {Object} Object with r, g, b properties
     */
    function hexToRgb(hexColor) {
        const hex = hexColor.replace('#', '');
        return {
            r: parseInt(hex.substr(0, 2), 16) / 255,
            g: parseInt(hex.substr(2, 2), 16) / 255,
            b: parseInt(hex.substr(4, 2), 16) / 255
        };
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
            alignmentH: 'center',
            alignmentV: 'middle',
            opacity: 1,
            letterSpacing: 0,
            wordSpacing: 0
        };
    }

    // ============ EXPORT ============

    window.MapperCore = {
        // Constants
        CHECKBOX_SIZE,
        RADIO_SIZE,

        // Functions
        generateUniqueId,
        ensureUniqueId,
        generateEnglishId,
        detectTextDirection,
        calculateAutoFitFontSize,
        checkFieldOverlap,
        snapToGridValue,
        getDefaultDirectionForType,
        mapFieldType,
        getFontNameForField,
        getAnchorH,
        getAnchorV,
        getPlaceholderForType,
        buildExportFieldData,
        hasValidCoordinates,
        isFieldMapped,
        isDefaultUnmappedBbox,
        hexToRgb,
        getDefaultStyle
    };
})();
