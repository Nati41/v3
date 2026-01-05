/**
 * PerGlyphBoxRenderer.js
 *
 * Generic renderer for per-glyph boxes (ID numbers, dates, phone numbers, etc.)
 * Used by both Export Engine (PDF) and LiveFill (Canvas preview).
 *
 * Renders each character centered in equal-width boxes across the bbox.
 */

(function() {
    'use strict';

    // ========================================
    // CONFIGURATION
    // ========================================

    const DEBUG = false;

    // Font size constraints (in points for PDF, pixels for canvas)
    const MAX_FONT_SIZE = 14;
    const MIN_FONT_SIZE = 6;

    // Baseline correction constant (matches EXPORT_SPEC)
    const BASELINE_OFFSET = 1.2;

    // ========================================
    // PDF RENDERER
    // ========================================

    /**
     * Renders characters in per-glyph boxes on a PDF page.
     *
     * @param {PDFPage} page - pdf-lib page object
     * @param {Object} bboxPDF - { x, y, width, height } in PDF points (y is bottom)
     * @param {string} rawValue - The value to render
     * @param {Object} options - Rendering options
     * @param {PDFFont} options.font - pdf-lib font object
     * @param {Object} options.color - { r, g, b } color (0-1 values)
     * @param {number} [options.expectedLength] - Expected number of boxes (if known)
     * @param {boolean} [options.digitsOnly=true] - Strip non-digits from value
     * @param {number} [options.maxFontSize=14] - Maximum font size
     * @param {number} [options.minFontSize=6] - Minimum font size
     */
    function renderPerGlyphBoxesPDF(page, bboxPDF, rawValue, options = {}) {
        const {
            font,
            color = { r: 0, g: 0, b: 0 },
            expectedLength = null,
            digitsOnly = true,
            maxFontSize = MAX_FONT_SIZE,
            minFontSize = MIN_FONT_SIZE
        } = options;

        if (!page || !font || !bboxPDF) {
            console.warn('[PerGlyphBoxRenderer] Missing required params');
            return;
        }

        // Process value
        let text = String(rawValue || '');
        if (digitsOnly) {
            text = text.replace(/\D/g, '');
        }

        if (!text.length) {
            if (DEBUG) console.log('[PerGlyphBoxRenderer] Empty value, skipping');
            return;
        }

        // Determine number of boxes
        const N = expectedLength || text.length;
        if (N <= 0) return;

        // Calculate cell dimensions
        const cellWidth = bboxPDF.width / N;
        const cellHeight = bboxPDF.height;

        // Auto-fit font size to cell height (per EXPORT_SPEC)
        let fontSize = Math.min(maxFontSize, cellHeight * 0.85);
        fontSize = Math.max(minFontSize, fontSize);

        // PDF coordinates: x is left edge, y is bottom edge
        const xStart = bboxPDF.x;
        const yBottom = bboxPDF.y;

        if (DEBUG) {
            console.log('[PerGlyphBoxRenderer PDF]', {
                text, N, cellWidth, cellHeight, fontSize,
                bbox: bboxPDF
            });
        }

        // Draw each character centered in its cell
        for (let i = 0; i < N && i < text.length; i++) {
            const ch = text[i];
            const cellX = xStart + i * cellWidth;
            const cellMidX = cellX + cellWidth / 2;

            // Measure glyph width for centering
            const glyphWidth = font.widthOfTextAtSize(ch, fontSize);

            // Center horizontally
            const tx = cellMidX - glyphWidth / 2;

            // Center vertically with baseline offset
            const ty = yBottom + ((cellHeight - fontSize) / 2) + BASELINE_OFFSET;

            page.drawText(ch, {
                x: tx,
                y: ty,
                size: fontSize,
                font: font,
                color: typeof PDFLib !== 'undefined' ? PDFLib.rgb(color.r, color.g, color.b) : color
            });
        }
    }

    // ========================================
    // CANVAS RENDERER (LiveFill Preview)
    // ========================================

    /**
     * Renders characters in per-glyph boxes on a Canvas 2D context.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
     * @param {Object} bboxPx - { x, y, width, height } in CSS pixels (y is top)
     * @param {string} rawValue - The value to render
     * @param {Object} options - Rendering options
     * @param {string} [options.fontFamily="'David Libre', serif"] - Font family
     * @param {string} [options.color='#000000'] - Text color
     * @param {number} [options.expectedLength] - Expected number of boxes
     * @param {boolean} [options.digitsOnly=true] - Strip non-digits from value
     * @param {number} [options.renderScale=2.0] - Canvas render scale
     */
    function renderPerGlyphBoxesCanvas(ctx, bboxPx, rawValue, options = {}) {
        const {
            fontFamily = "'David Libre', serif",
            color = '#000000',
            expectedLength = null,
            digitsOnly = true,
            renderScale = 2.0
        } = options;

        if (!ctx || !bboxPx) {
            console.warn('[PerGlyphBoxRenderer] Missing required params');
            return;
        }

        // Process value
        let text = String(rawValue || '');
        if (digitsOnly) {
            text = text.replace(/\D/g, '');
        }

        if (!text.length) {
            if (DEBUG) console.log('[PerGlyphBoxRenderer Canvas] Empty value, skipping');
            return;
        }

        // Determine number of boxes
        const N = expectedLength || text.length;
        if (N <= 0) return;

        // Calculate cell dimensions
        const cellWidth = bboxPx.width / N;
        const cellHeight = bboxPx.height;

        // Auto-fit font size (scaled for render)
        const baseFontSize = Math.min(MAX_FONT_SIZE, (cellHeight / renderScale) * 0.85);
        const fontSize = Math.max(MIN_FONT_SIZE, baseFontSize) * renderScale;

        // Canvas coordinates: x is left edge, y is top edge
        const xStart = bboxPx.x;
        const yTop = bboxPx.y;

        if (DEBUG) {
            console.log('[PerGlyphBoxRenderer Canvas]', {
                text, N, cellWidth, cellHeight, fontSize,
                bbox: bboxPx
            });
        }

        // Save context state
        ctx.save();

        // Set font and color
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        // Draw each character centered in its cell
        for (let i = 0; i < N && i < text.length; i++) {
            const ch = text[i];
            const cellX = xStart + i * cellWidth;
            const cellMidX = cellX + cellWidth / 2;
            const cellMidY = yTop + cellHeight / 2;

            ctx.fillText(ch, cellMidX, cellMidY);
        }

        // Restore context state
        ctx.restore();
    }

    // ========================================
    // HELPER: Create DOM element for per-glyph boxes (LiveFill overlay)
    // ========================================

    /**
     * Creates a DOM element with per-glyph box styling for LiveFill overlays.
     *
     * @param {Object} params
     * @param {string} params.value - The value to display
     * @param {number} params.expectedLength - Number of boxes
     * @param {Object} params.bbox - { x, y, width, height } in CSS pixels
     * @param {Object} params.style - Style options
     * @returns {HTMLElement} - Container element with digit spans
     */
    function createPerGlyphElement(params) {
        const {
            value,
            expectedLength,
            bbox,
            style = {}
        } = params;

        const {
            fontFamily = "'David Libre', serif",
            fontSize = 14,
            color = '#000000',
            renderScale = 2.0
        } = style;

        // Process value
        let text = String(value || '').replace(/\D/g, '');
        const N = expectedLength || text.length || 9;

        // Create container
        const wrapper = document.createElement('div');
        wrapper.className = 'per-glyph-boxes';
        wrapper.dir = 'ltr'; // Digits are always LTR

        // Apply positioning
        wrapper.style.position = 'absolute';
        wrapper.style.left = bbox.x + 'px';
        wrapper.style.top = bbox.y + 'px';
        wrapper.style.width = bbox.width + 'px';
        wrapper.style.height = bbox.height + 'px';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'row';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'space-between';
        wrapper.style.boxSizing = 'border-box';

        // Calculate font size to fit
        const cellHeight = bbox.height;
        const autoFontSize = Math.min(fontSize * renderScale, cellHeight * 0.85);
        const finalFontSize = Math.max(MIN_FONT_SIZE * renderScale, autoFontSize);

        // Create digit spans
        for (let i = 0; i < N; i++) {
            const digitSpan = document.createElement('span');
            digitSpan.className = 'digit';
            digitSpan.textContent = text[i] || '';
            digitSpan.style.flex = '1';
            digitSpan.style.textAlign = 'center';
            digitSpan.style.fontFamily = fontFamily;
            digitSpan.style.fontSize = finalFontSize + 'px';
            digitSpan.style.color = color;
            digitSpan.style.lineHeight = bbox.height + 'px';
            wrapper.appendChild(digitSpan);
        }

        return wrapper;
    }

    // ========================================
    // HELPER: Prepare value for box rendering
    // ========================================

    /**
     * Prepares a value for per-glyph rendering.
     *
     * @param {string} value - Raw value
     * @param {string} subtype - 'id' | 'date' | 'phone' | etc.
     * @param {number} expectedLength - Expected length
     * @returns {string} - Prepared value
     */
    function prepareValue(value, subtype, expectedLength) {
        if (!value) return '';

        let text = String(value).replace(/\D/g, '');

        // Pad ID numbers to 9 digits (Israeli standard)
        if (subtype === 'id' && expectedLength === 9) {
            text = text.padStart(9, '0').slice(0, 9);
        }
        // Pad dates to 8 digits (DDMMYYYY)
        else if (subtype === 'date' && expectedLength === 8) {
            text = text.padStart(8, '0').slice(0, 8);
        }
        // Pad dates to 6 digits (DDMMYY)
        else if (subtype === 'date' && expectedLength === 6) {
            text = text.slice(0, 6);
        }
        // Limit to expectedLength if specified
        else if (expectedLength && text.length > expectedLength) {
            text = text.slice(0, expectedLength);
        }

        return text;
    }

    // ========================================
    // EXPORT
    // ========================================

    const PerGlyphBoxRenderer = {
        renderPerGlyphBoxesPDF,
        renderPerGlyphBoxesCanvas,
        createPerGlyphElement,
        prepareValue,

        // Constants
        MAX_FONT_SIZE,
        MIN_FONT_SIZE,
        BASELINE_OFFSET
    };

    // UMD export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PerGlyphBoxRenderer;
    } else if (typeof window !== 'undefined') {
        window.PerGlyphBoxRenderer = PerGlyphBoxRenderer;
    }

})();
