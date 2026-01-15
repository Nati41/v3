/**
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║                    🔒 LOCKED MODULE - DO NOT MODIFY 🔒                      ║
 * ╠════════════════════════════════════════════════════════════════════════════╣
 * ║  PreviewTextRenderer - Export-matching text rendering for LiveFill         ║
 * ║                                                                            ║
 * ║  STATUS: WORKING & TESTED (2026-01-08)                                     ║
 * ║  LOCKED BY: Development Team                                               ║
 * ║                                                                            ║
 * ║  ⚠️  WARNING: This code controls text positioning in Preview.              ║
 * ║      Any changes may break the visual match between Preview and Export.    ║
 * ║                                                                            ║
 * ║  CRITICAL SETTINGS THAT MAKE IT WORK:                                      ║
 * ║  • line-height: 0.8 (reduces text box height)                              ║
 * ║  • translateY(15%) (pushes text down to anchor at bottom)                  ║
 * ║  • position: absolute; bottom: 0 (anchors to container bottom)             ║
 * ║  • FONT_SIZE_RATIO: 0.65 (font size = 65% of field height)                 ║
 * ║                                                                            ║
 * ║  DEPENDENCIES:                                                             ║
 * ║  • .field-editor CSS must have padding: 0                                  ║
 * ║  • .table-cell-editor CSS must have padding: 0                             ║
 * ║                                                                            ║
 * ║  DO NOT modify export-engine.js - it is the source of truth.               ║
 * ║  If Preview doesn't match Export, fix THIS file only.                      ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */
(function() {
    'use strict';

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  🔒 LOCKED CONSTANTS - DO NOT CHANGE THESE VALUES 🔒          ║
    // ║  These values were calibrated to match Export engine output   ║
    // ╚═══════════════════════════════════════════════════════════════╝
    const FONT_SIZE_RATIO = 0.65;  // 🔒 Font size = 65% of field height
    const MAX_FONT_SIZE = 14;      // 🔒 pt - cap for very tall fields
    const MIN_FONT_SIZE = 8;       // 🔒 pt - floor for very short fields
    const BOTTOM_OFFSET_RATIO = 0.08;  // 🔒 Bottom offset = 8% of field height
    const DIGIT_WIDTH_RATIO = 0.55;    // 🔒 Approximate digit width / fontSize for David Libre

    // Date field constants - spacing to avoid printed slashes
    const DATE_SLASH_GAP_RATIO = 0.08;  // 8% gap for each slash area
    const DATE_SEGMENT_RATIOS = [0.22, 0.22, 0.44];  // DD=22%, MM=22%, YYYY=44%

    // ============================================
    // Font measurement cache
    // ============================================
    let measureCanvas = null;
    let measureCtx = null;

    function getMeasureContext() {
        if (!measureCanvas) {
            measureCanvas = document.createElement('canvas');
            measureCtx = measureCanvas.getContext('2d');
        }
        return measureCtx;
    }

    /**
     * Measure text width using Canvas 2D (approximates pdf-lib behavior)
     * @param {string} text - Text to measure
     * @param {number} fontSizePt - Font size in points
     * @returns {number} Width in points
     */
    function measureTextWidth(text, fontSizePt) {
        const ctx = getMeasureContext();
        // Use the same font as export
        ctx.font = `${fontSizePt}pt "David Libre", serif`;
        const metrics = ctx.measureText(text);
        return metrics.width;
    }

    /**
     * Calculate font size proportional to field height
     * @param {number} fieldHeightPt - Field height in points
     * @returns {number} Font size in points
     */
    function calcFontSize(fieldHeightPt) {
        const proportional = fieldHeightPt * FONT_SIZE_RATIO;
        return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, proportional));
    }

    /**
     * Calculate bottom offset proportional to field height
     * @param {number} fieldHeightPt - Field height in points
     * @returns {number} Bottom offset in points
     */
    function calcBottomOffset(fieldHeightPt) {
        return fieldHeightPt * BOTTOM_OFFSET_RATIO;
    }

    // ============================================
    // NUMERIC FIELD RENDERING
    // Replicates: drawNumericInBoxes() from export-engine.js
    // ============================================

    /**
     * Render numeric field with each digit in its cell
     * EXACT replication of Export engine logic
     *
     * @param {HTMLElement} container - Container element (positioned, sized)
     * @param {string} value - Numeric string (digits only)
     * @param {Object} fieldPt - Field dimensions in PDF points {width, height}
     * @param {number} scale - Scale factor: pt → px
     * @param {Object} style - Style options {fontSize, color}
     */
    function renderNumericField(container, value, fieldPt, scale, style = {}) {
        const digits = String(value || '');
        if (!digits || digits.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Clear container
        container.innerHTML = '';

        const numDigits = digits.length;
        // Generic: font size proportional to field height
        const fontSizePt = style.fontSize || calcFontSize(fieldPt.height);
        const color = style.color || '#000000';

        // Cell width for digit distribution
        const cellWidthPt = fieldPt.width / numDigits;

        // Generic: bottom offset proportional to field height
        const bottomOffsetPt = calcBottomOffset(fieldPt.height);

        // Container for digits
        const digitsContainer = document.createElement('div');
        digitsContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        `;

        // Convert to px
        const fontSizePx = fontSizePt * scale;
        const cellWidthPx = cellWidthPt * scale;
        const containerHeightPx = fieldPt.height * scale;

        for (let i = 0; i < numDigits; i++) {
            const ch = digits[i];

            // Center digit horizontally in cell
            const cellLeftPx = i * cellWidthPx;
            const cellCenterPx = cellLeftPx + cellWidthPx / 2;

            const digitSpan = document.createElement('span');
            digitSpan.textContent = ch;
            digitSpan.style.cssText = `
                position: absolute;
                left: ${cellCenterPx}px;
                bottom: 0;
                transform: translateX(-50%) translateY(15%);
                font-family: 'David Libre', serif;
                font-size: ${fontSizePx}px;
                line-height: 0.8;
                color: ${color};
                direction: ltr;
            `;

            digitsContainer.appendChild(digitSpan);
        }

        container.appendChild(digitsContainer);
    }

    // ============================================
    // DATE FIELD RENDERING
    // Renders 8-digit dates (DDMMYYYY) with gaps for printed slashes
    // ============================================

    /**
     * Check if value is an 8-digit date (DDMMYYYY format)
     * @param {string} value - Value to check
     * @returns {boolean} True if value is 8 digits
     */
    function isDateValue(value) {
        return /^[0-9]{8}$/.test(value);
    }

    /**
     * Render date field with segments spaced for printed slashes
     * Splits DDMMYYYY into DD, MM, YYYY with gaps between
     *
     * @param {HTMLElement} container - Container element
     * @param {string} value - 8-digit date string (DDMMYYYY)
     * @param {Object} fieldPt - Field dimensions in PDF points {width, height}
     * @param {number} scale - Scale factor: pt → px
     * @param {Object} style - Style options
     */
    function renderDateField(container, value, fieldPt, scale, style = {}) {
        const digits = String(value || '');
        if (digits.length !== 8) {
            // Fallback to regular numeric rendering
            renderNumericField(container, value, fieldPt, scale, style);
            return;
        }

        // Clear container
        container.innerHTML = '';

        // Split into segments: DD, MM, YYYY
        const segments = [
            digits.substring(0, 2),   // Day
            digits.substring(2, 4),   // Month
            digits.substring(4, 8)    // Year
        ];

        // Calculate positions for each segment
        // Layout: [DD][gap][MM][gap][YYYY]
        // Total gaps take 16% (2 × 8%), segments take 84%
        const totalGapRatio = DATE_SLASH_GAP_RATIO * 2;
        const segmentTotalRatio = 1 - totalGapRatio;

        // Segment positions (normalized to field width)
        const segmentPositions = [
            { start: 0, width: DATE_SEGMENT_RATIOS[0] * segmentTotalRatio },
            { start: DATE_SEGMENT_RATIOS[0] * segmentTotalRatio + DATE_SLASH_GAP_RATIO,
              width: DATE_SEGMENT_RATIOS[1] * segmentTotalRatio },
            { start: (DATE_SEGMENT_RATIOS[0] + DATE_SEGMENT_RATIOS[1]) * segmentTotalRatio + totalGapRatio,
              width: DATE_SEGMENT_RATIOS[2] * segmentTotalRatio }
        ];

        const fontSizePt = style.fontSize || calcFontSize(fieldPt.height);
        const color = style.color || '#000000';
        const fontSizePx = fontSizePt * scale;
        const containerWidthPx = fieldPt.width * scale;

        // Container for all segments
        const dateContainer = document.createElement('div');
        dateContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        `;

        // Render each segment
        segments.forEach((segment, segIndex) => {
            const pos = segmentPositions[segIndex];
            const segmentStartPx = pos.start * containerWidthPx;
            const segmentWidthPx = pos.width * containerWidthPx;
            const digitCount = segment.length;
            const cellWidthPx = segmentWidthPx / digitCount;

            for (let i = 0; i < digitCount; i++) {
                const ch = segment[i];
                const cellLeftPx = segmentStartPx + (i * cellWidthPx);
                const cellCenterPx = cellLeftPx + cellWidthPx / 2;

                const digitSpan = document.createElement('span');
                digitSpan.textContent = ch;
                digitSpan.style.cssText = `
                    position: absolute;
                    left: ${cellCenterPx}px;
                    bottom: 0;
                    transform: translateX(-50%) translateY(15%);
                    font-family: 'David Libre', serif;
                    font-size: ${fontSizePx}px;
                    line-height: 0.8;
                    color: ${color};
                    direction: ltr;
                `;

                dateContainer.appendChild(digitSpan);
            }
        });

        container.appendChild(dateContainer);
    }

    // ============================================
    // TEXT FIELD RENDERING
    // Replicates regular text rendering from export-engine.js
    // ============================================

    /**
     * Render text field (Hebrew/mixed) with proper alignment
     * EXACT replication of Export engine logic
     *
     * @param {HTMLElement} container - Container element (positioned, sized)
     * @param {string} value - Text value
     * @param {Object} fieldPt - Field dimensions in PDF points {width, height}
     * @param {number} scale - Scale factor: pt → px
     * @param {Object} style - Style options {fontSize, color, alignment}
     */
    function renderTextField(container, value, fieldPt, scale, style = {}) {
        const text = String(value || '');
        if (!text) {
            container.innerHTML = '';
            return;
        }

        // Clear container
        container.innerHTML = '';

        // Generic: font size proportional to field height
        const fontSizePt = style.fontSize || calcFontSize(fieldPt.height);
        const color = style.color || '#000000';
        const align = style.alignment || 'right';  // RTL default

        // Convert pt → px
        const fontSizePx = fontSizePt * scale;

        // Create text element with absolute positioning
        const textSpan = document.createElement('span');
        textSpan.textContent = text;

        // Horizontal positioning + transform (includes translateY to push down)
        let positionCSS = 'right: 0;';
        let transformCSS = 'translateY(15%)';

        if (align === 'center') {
            positionCSS = 'left: 50%;';
            transformCSS = 'translateX(-50%) translateY(15%)';
        } else if (align === 'left') {
            positionCSS = 'left: 0;';
        }

        // Check if text is numeric/date (should not be reversed)
        const isNumericOrDate = /^[\d\s.,\-\/\\:]+$/.test(text);
        const textDirection = isNumericOrDate ? 'ltr' : 'rtl';

        textSpan.style.cssText = `
            position: absolute;
            bottom: 0;
            ${positionCSS}
            transform: ${transformCSS};
            font-family: 'David Libre', serif;
            font-size: ${fontSizePx}px;
            line-height: 0.8;
            color: ${color};
            white-space: nowrap;
            direction: ${textDirection};
        `;

        container.appendChild(textSpan);
    }

    // ============================================
    // MAIN ENTRY POINT
    // ============================================

    /**
     * Render field value in Preview - matches Export exactly
     *
     * @param {HTMLElement} container - Container element (must be positioned absolutely)
     * @param {string} value - Field value
     * @param {Object} options - Rendering options
     * @param {Object} options.fieldPt - Field dimensions in PDF points {width, height}
     * @param {number} options.scale - Scale factor: pt → px
     * @param {Object} options.style - Style from liveFillData
     * @param {boolean} options.hasSlashes - V3.11: True if field area has "/" characters
     */
    function render(container, value, options = {}) {
        const { fieldPt, scale = 1, style = {}, hasSlashes = false } = options;

        if (!fieldPt || !fieldPt.width || !fieldPt.height) {
            console.warn('[PreviewTextRenderer] Missing fieldPt dimensions');
            return;
        }

        const text = String(value || '');
        if (!text) {
            container.innerHTML = '';
            return;
        }

        // Detect if numeric (digits only) - same check as export
        const isNumeric = /^[0-9]+$/.test(text);

        if (isNumeric) {
            // V3.11: If hasSlashes detected AND 8-digit value → use date spacing
            if (hasSlashes && isDateValue(text)) {
                renderDateField(container, text, fieldPt, scale, style);
            }
            // V3.10: Smart spacing - short numbers (1-3 digits) render as regular text
            // Long numbers (4+) get spaced digits for ID/phone number fields
            else if (text.length >= 4) {
                renderNumericField(container, text, fieldPt, scale, style);
            } else {
                // Short number (1-3 digits) - render centered, no spacing
                renderTextField(container, text, fieldPt, scale, { ...style, alignment: 'center' });
            }
        } else {
            renderTextField(container, text, fieldPt, scale, style);
        }
    }

    // ============================================
    // EXPORT API
    // ============================================
    window.PreviewTextRenderer = {
        render,
        renderNumericField,
        renderTextField,
        renderDateField,
        isDateValue,
        measureTextWidth,

        // Expose constants for debugging
        FONT_SIZE_RATIO,
        MAX_FONT_SIZE,
        MIN_FONT_SIZE,
        BOTTOM_OFFSET_RATIO,
        DATE_SLASH_GAP_RATIO,
        DATE_SEGMENT_RATIOS
    };

    console.log('[PreviewTextRenderer] Module loaded - Export-matching text renderer ready');
})();
