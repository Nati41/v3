/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - Fill Engine
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   מנוע מילוי PDF - מקבל תבנית מיפוי + נתוני לקוח
 *   ומייצר PDF מלא מוכן להגשה.
 *
 * איך זה עובד:
 *   - שדות טקסט: RTL (עברית), סקיילינג אוטומטי, חיתוך, גלישת שורות
 *   - צ'קבוקס: סימן V במיקום מדויק
 *   - רדיו: סימון האפשרות הנבחרת
 *   - טבלאות: מילוי שורות חוזרות
 *   - חתימות: הוספת תמונת חתימה
 *   - דיאגנוסטיקה מלאה של תהליך המילוי
 *
 * מי משתמש בקובץ:
 *   - LiveFill - מילוי בפועל
 *   - Mobile Fill - ייצוא סופי
 *   - Mapper v3 - סימולציית מילוי
 *
 * באיזה מצבים:
 *   מצב מילוי / ייצוא - בכל יצירת PDF סופי
 *
 * למה הוא קיים:
 *   זה המנוע שבסופו של דבר מייצר את ה-PDF הממולא.
 *   כל שאר המערכת (מיפוי, AI, ממשק) מובילים לכאן.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Fill Engine - Production-Grade PDF Filling (Step 8)
 *
 * Complete PDF filling engine that integrates with Steps 1-7 mapping:
 * - Text fields with RTL support
 * - Checkbox & radio groups
 * - Tables (multi-row, multi-column)
 * - Signatures
 * - Automatic scaling, clipping, wrapping
 * - Full diagnostics
 *
 * Uses PDF-LIB for PDF manipulation.
 */
(function() {
    'use strict';

    // ============ CONFIGURATION ============

    const FILL_CONFIG = {
        // Font settings
        DEFAULT_FONT_SIZE: 12,
        MIN_FONT_SIZE: 6,
        MAX_FONT_SIZE: 48,
        LINE_HEIGHT_FACTOR: 1.2,

        // Checkbox/Radio settings
        CHECKBOX_MARKER: '✔',
        RADIO_MARKER_FILLED: '●',
        RADIO_MARKER_EMPTY: '○',
        MARKER_SIZE_FACTOR: 0.75,

        // Text settings
        TEXT_PADDING: 2,
        MAX_LINES: 10,
        OVERFLOW_ELLIPSIS: '...',

        // Signature settings
        SIGNATURE_PADDING: 4,
        SIGNATURE_MAX_HEIGHT_RATIO: 0.9,

        // Date format
        DATE_FORMAT: 'DD/MM/YYYY',

        // DPI settings
        PDF_DPI: 72,
        RENDER_DPI: 300
    };

    // ============ DIAGNOSTICS ============

    /**
     * Create a diagnostic entry
     * @param {string} type - Diagnostic type
     * @param {string} fieldId - Field ID
     * @param {string} message - Message
     * @param {Object} details - Additional details
     * @returns {Object} Diagnostic entry
     */
    function createDiagnostic(type, fieldId, message, details = {}) {
        return {
            type,
            fieldId,
            message,
            details,
            timestamp: Date.now()
        };
    }

    // Diagnostic types
    const DIAGNOSTIC_TYPES = {
        MISSING_VALUE: 'missing_value',
        TRUNCATED: 'truncated',
        SCALED_DOWN: 'scaled_down',
        OVERFLOW: 'overflow',
        UNSUPPORTED_TYPE: 'unsupported_type',
        FONT_FALLBACK: 'font_fallback',
        VALIDATION_ERROR: 'validation_error',
        SUCCESS: 'success'
    };

    // ============ COORDINATE TRANSLATION ============

    /**
     * Convert mapper coordinates to PDF coordinates
     * The mapper uses top-left origin, PDF uses bottom-left
     * @param {Object} bbox - Bounding box from mapper { x, y, width, height }
     * @param {number} pageHeight - PDF page height in points
     * @param {number} renderDpi - DPI used for rendering (default 300)
     * @returns {Object} PDF coordinates { x, y, width, height }
     */
    function mapToPdfCoords(bbox, pageHeight, renderDpi = FILL_CONFIG.RENDER_DPI) {
        // Scale factor from render DPI to PDF points (72 DPI)
        const scale = FILL_CONFIG.PDF_DPI / renderDpi;

        // Convert coordinates
        const x = bbox.x * scale;
        const width = bbox.width * scale;
        const height = bbox.height * scale;

        // Y coordinate: PDF uses bottom-left origin
        // bbox.y is from top in mapper, convert to bottom-left
        const yFromTop = bbox.y * scale;
        const y = pageHeight - yFromTop - height;

        return { x, y, width, height };
    }

    /**
     * Convert percentage-based bbox to PDF coordinates
     * @param {Array} bboxPercent - [x%, y%, w%, h%] percentages
     * @param {number} pageWidth - PDF page width
     * @param {number} pageHeight - PDF page height
     * @returns {Object} PDF coordinates { x, y, width, height }
     */
    function percentToPdfCoords(bboxPercent, pageWidth, pageHeight) {
        if (!Array.isArray(bboxPercent) || bboxPercent.length !== 4) {
            return null;
        }

        const [xPct, yPct, wPct, hPct] = bboxPercent;

        const x = (xPct / 100) * pageWidth;
        const width = (wPct / 100) * pageWidth;
        const height = (hPct / 100) * pageHeight;

        // Y from percentage (top-based) to PDF (bottom-based)
        const yFromTop = (yPct / 100) * pageHeight;
        const y = pageHeight - yFromTop - height;

        return { x, y, width, height };
    }

    // ============ TEXT UTILITIES ============

    /**
     * Measure text width
     * @param {string} text - Text to measure
     * @param {Object} font - PDF-LIB font
     * @param {number} fontSize - Font size
     * @returns {number} Text width in points
     */
    function measureTextWidth(text, font, fontSize) {
        try {
            return font.widthOfTextAtSize(text, fontSize);
        } catch (e) {
            // Fallback estimation
            return text.length * fontSize * 0.5;
        }
    }

    /**
     * Check if text contains Hebrew characters
     * @param {string} text - Text to check
     * @returns {boolean} True if contains Hebrew
     */
    function containsHebrew(text) {
        return /[\u0590-\u05FF]/.test(text);
    }

    /**
     * Check if text is a dimension string (e.g., "600×720×18" or "600x720x18")
     * @param {string} text - Text to check
     * @returns {boolean} True if dimension string
     */
    function isDimensionString(text) {
        if (!text) return false;
        // Remove directional marks and trim
        const cleaned = text.replace(/[\u200E\u200F]/g, '').trim();
        // Match patterns like "600×720×18" or "100x200x30"
        return /^[\d.,]+[×xX*][\d.,]+([×xX*][\d.,]+)?$/.test(cleaned);
    }

    /**
     * Check if text is primarily numeric (numbers, dimension strings, etc.)
     * @param {string} text - Text to check
     * @returns {boolean} True if primarily numeric
     */
    function isPrimarilyNumeric(text) {
        if (!text) return false;
        const cleaned = text.replace(/[\u200E\u200F]/g, ''); // Remove directional marks
        // Check for dimension strings
        if (isDimensionString(cleaned)) return true;
        // Check for simple numbers
        if (/^[\d\s.,\-:\/]+$/.test(cleaned)) return true;
        // Check if mostly digits (>70%)
        const digitCount = (cleaned.match(/\d/g) || []).length;
        return digitCount / cleaned.length > 0.7;
    }

    /**
     * Reverse text for RTL rendering in PDF
     * PDF-LIB renders left-to-right, so Hebrew needs visual reversal
     * @param {string} text - Text to reverse
     * @returns {string} Reversed text for PDF rendering
     */
    function reverseForRTL(text) {
        if (!text) return text;

        // Don't reverse dimension strings or primarily numeric content
        if (isPrimarilyNumeric(text)) {
            return text;
        }

        // For pure Hebrew text, reverse the entire string
        if (!containsEnglish(text) && containsHebrew(text)) {
            return reverseString(text);
        }

        // For mixed content (Hebrew + English/numbers), process segments
        // Split into segments: Hebrew vs non-Hebrew
        const segments = [];
        let currentSegment = '';
        let currentIsHebrew = null;

        for (const char of text) {
            const charIsHebrew = /[\u0590-\u05FF]/.test(char);
            const charIsSpace = /\s/.test(char);

            if (charIsSpace) {
                currentSegment += char;
            } else if (currentIsHebrew === null || currentIsHebrew === charIsHebrew) {
                currentIsHebrew = charIsHebrew;
                currentSegment += char;
            } else {
                if (currentSegment) {
                    segments.push({ text: currentSegment, isHebrew: currentIsHebrew });
                }
                currentSegment = char;
                currentIsHebrew = charIsHebrew;
            }
        }

        if (currentSegment) {
            segments.push({ text: currentSegment, isHebrew: currentIsHebrew });
        }

        // Reverse segment order and reverse Hebrew segments internally
        return segments.reverse().map(seg => {
            if (seg.isHebrew) {
                return reverseString(seg.text.trim());
            }
            return seg.text.trim();
        }).join(' ');
    }

    /**
     * Reverse a string (handle combining characters properly)
     * @param {string} str - String to reverse
     * @returns {string} Reversed string
     */
    function reverseString(str) {
        // Use spread operator to handle Unicode properly
        return [...str].reverse().join('');
    }

    /**
     * Check if text contains English/Latin characters
     * @param {string} text - Text to check
     * @returns {boolean} True if contains English
     */
    function containsEnglish(text) {
        return /[a-zA-Z]/.test(text);
    }

    /**
     * Character replacements for fonts that don't support certain characters
     */
    const CHAR_REPLACEMENTS = {
        '\u00D7': 'x',      // × Multiplication sign → lowercase x
        '\u00F7': '/',      // ÷ Division sign → forward slash
        '\u2212': '-',      // − Minus sign → hyphen
        '\u2013': '-',      // – En dash → hyphen
        '\u2014': '-',      // — Em dash → hyphen
        '\u201C': '"',      // " Left double quote → regular quote
        '\u201D': '"',      // " Right double quote → regular quote
        '\u2018': "'",      // ' Left single quote → apostrophe
        '\u2019': "'",      // ' Right single quote → apostrophe
        '\u2026': '...',    // … Ellipsis → three dots
    };

    /**
     * Replace unsupported characters with font-safe alternatives
     * @param {string} text - Text to process
     * @param {Object} font - PDF-LIB font (optional, for checking support)
     * @returns {string} Text with replacements
     */
    function replaceUnsupportedChars(text, font = null) {
        if (!text) return text;

        let result = text;

        // Remove LTR/RTL marks that might cause issues
        result = result.replace(/[\u200E\u200F\u202A-\u202E]/g, '');

        // Apply character replacements
        for (const [from, to] of Object.entries(CHAR_REPLACEMENTS)) {
            result = result.split(from).join(to);
        }

        return result;
    }

    /**
     * Calculate auto-fit font size
     * @param {string} text - Text to fit
     * @param {Object} font - PDF-LIB font
     * @param {number} maxWidth - Maximum width
     * @param {number} maxHeight - Maximum height
     * @param {number} startSize - Starting font size
     * @returns {number} Optimal font size
     */
    function calculateAutoFitFontSize(text, font, maxWidth, maxHeight, startSize) {
        let fontSize = startSize;
        const padding = FILL_CONFIG.TEXT_PADDING * 2;
        const absoluteMinSize = 1; // מינימום אבסולוטי - ממשיך להקטין עד שנכנס

        while (fontSize > absoluteMinSize) {
            const textWidth = measureTextWidth(text, font, fontSize);
            const lineHeight = fontSize * FILL_CONFIG.LINE_HEIGHT_FACTOR;

            if (textWidth <= maxWidth - padding && lineHeight <= maxHeight - padding) {
                break;
            }

            fontSize -= 0.5;
        }

        return Math.max(fontSize, absoluteMinSize);
    }

    /**
     * Wrap text to fit width
     * @param {string} text - Text to wrap
     * @param {Object} font - PDF-LIB font
     * @param {number} fontSize - Font size
     * @param {number} maxWidth - Maximum width
     * @returns {Array} Array of lines
     */
    function wrapText(text, font, fontSize, maxWidth) {
        const words = text.split(/\s+/);
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const testWidth = measureTextWidth(testLine, font, fontSize);

            if (testWidth <= maxWidth) {
                currentLine = testLine;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                }
                currentLine = word;
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.slice(0, FILL_CONFIG.MAX_LINES);
    }

    /**
     * Truncate text with ellipsis to fit within maxWidth
     * Used when text doesn't fit even at minimum font size
     * @param {string} text - Text to truncate
     * @param {Object} font - PDF-LIB font
     * @param {number} fontSize - Font size
     * @param {number} maxWidth - Maximum width available
     * @returns {string} Truncated text with ellipsis if needed
     */
    function truncateTextToFit(text, font, fontSize, maxWidth) {
        if (!text || maxWidth <= 0) return text;

        const ellipsis = FILL_CONFIG.OVERFLOW_ELLIPSIS;
        const ellipsisWidth = measureTextWidth(ellipsis, font, fontSize);
        const textWidth = measureTextWidth(text, font, fontSize);

        // Text fits - no truncation needed
        if (textWidth <= maxWidth) {
            return text;
        }

        // Not enough space even for ellipsis
        if (ellipsisWidth >= maxWidth) {
            return ellipsis;
        }

        // Binary search for optimal truncation point
        const availableWidth = maxWidth - ellipsisWidth;
        let left = 0;
        let right = text.length;

        while (left < right) {
            const mid = Math.ceil((left + right) / 2);
            const truncated = text.substring(0, mid);
            const truncatedWidth = measureTextWidth(truncated, font, fontSize);

            if (truncatedWidth <= availableWidth) {
                left = mid;
            } else {
                right = mid - 1;
            }
        }

        // Return truncated text with ellipsis
        if (left > 0) {
            return text.substring(0, left) + ellipsis;
        }

        return ellipsis;
    }

    /**
     * Format value based on field type
     * @param {any} value - Value to format
     * @param {string} type - Field type
     * @returns {string} Formatted value
     */
    function formatValue(value, type) {
        if (value === null || value === undefined) {
            return '';
        }

        const strValue = String(value);

        switch (type) {
            case 'date':
                // Try to parse and format date
                if (strValue.includes('/') || strValue.includes('-')) {
                    return strValue;
                }
                try {
                    const date = new Date(strValue);
                    if (!isNaN(date)) {
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = date.getFullYear();
                        return `${day}/${month}/${year}`;
                    }
                } catch (e) {
                    // Return as-is
                }
                return strValue;

            case 'number':
                // Format number with thousands separator for Hebrew
                const num = parseFloat(strValue.replace(/,/g, ''));
                if (!isNaN(num)) {
                    return num.toLocaleString('he-IL');
                }
                return strValue;

            case 'id_number':
                // Israeli ID - ensure 9 digits
                return strValue.replace(/\D/g, '').padStart(9, '0').slice(0, 9);

            case 'phone':
                // Format phone number
                const digits = strValue.replace(/\D/g, '');
                if (digits.length === 10) {
                    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
                }
                return strValue;

            default:
                return strValue;
        }
    }

    // ============ FIELD FILLING ============

    /**
     * Fill a text field
     * @param {Object} page - PDF-LIB page
     * @param {Object} field - Field definition
     * @param {string} value - Value to fill
     * @param {Object} fonts - Font objects { main, fallback }
     * @param {Object} options - Fill options
     * @returns {Object} Diagnostic info
     */
    async function fillTextField(page, field, value, fonts, options = {}) {
        const diagnostics = [];

        if (!value && value !== 0) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.MISSING_VALUE,
                field.id,
                'No value provided'
            ));
            return { success: false, diagnostics };
        }

        // Get coordinates
        const pageHeight = page.getHeight();
        const pageWidth = page.getWidth();

        let pdfCoords;
        if (field.bbox && Array.isArray(field.bbox)) {
            pdfCoords = percentToPdfCoords(field.bbox, pageWidth, pageHeight);
        } else if (field.pdfX !== undefined) {
            pdfCoords = mapToPdfCoords({
                x: field.pdfX,
                y: field.pdfY,
                width: field.pdfWidth,
                height: field.pdfHeight
            }, pageHeight, options.renderDpi || FILL_CONFIG.RENDER_DPI);
        } else {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                field.id,
                'No valid coordinates'
            ));
            return { success: false, diagnostics };
        }

        // Format value
        const formattedValue = formatValue(value, field.type);

        // Select font
        const isHebrew = containsHebrew(formattedValue);
        let font = isHebrew && fonts.main ? fonts.main : (fonts.fallback || fonts.main);

        if (!font) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.FONT_FALLBACK,
                field.id,
                'No font available'
            ));
            return { success: false, diagnostics };
        }

        // Calculate font size
        let fontSize = field.fontSize || FILL_CONFIG.DEFAULT_FONT_SIZE;
        const originalFontSize = fontSize;

        fontSize = calculateAutoFitFontSize(
            formattedValue,
            font,
            pdfCoords.width,
            pdfCoords.height,
            fontSize
        );

        if (fontSize < originalFontSize) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.SCALED_DOWN,
                field.id,
                `Font scaled from ${originalFontSize} to ${fontSize}`,
                { original: originalFontSize, scaled: fontSize }
            ));
        }

        // Wrap text if needed
        let lines = wrapText(formattedValue, font, fontSize, pdfCoords.width - FILL_CONFIG.TEXT_PADDING * 2);
        const lineHeight = fontSize * FILL_CONFIG.LINE_HEIGHT_FACTOR;

        // Calculate max lines that fit in the field
        const maxLinesInField = Math.floor((pdfCoords.height - FILL_CONFIG.TEXT_PADDING) / lineHeight);

        // Truncate if overflow and add ellipsis indicator
        if (lines.length > maxLinesInField && maxLinesInField > 0) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.OVERFLOW,
                field.id,
                `Text truncated from ${lines.length} to ${maxLinesInField} lines`,
                { originalLines: lines.length, maxLines: maxLinesInField }
            ));
            lines = lines.slice(0, maxLinesInField);
            // Add ellipsis to last line if truncated
            if (lines.length > 0) {
                lines[lines.length - 1] = lines[lines.length - 1] + '...';
            }
        }

        // Determine alignment
        const isRTL = field.direction === 'rtl' || isHebrew;
        // Use improved numeric detection that handles dimensions like "600×720×18"
        const isNumeric = field.type === 'number' || isPrimarilyNumeric(formattedValue);

        // Draw each line
        try {
            lines.forEach((line, index) => {
                // First, replace unsupported characters
                let textToDraw = replaceUnsupportedChars(line);

                // Handle RTL text - but NOT for numeric/dimension content
                if (isRTL && !isNumeric && !isPrimarilyNumeric(textToDraw)) {
                    textToDraw = reverseForRTL(textToDraw);
                }

                const textWidth = measureTextWidth(textToDraw, font, fontSize);

                // Calculate X position based on alignment
                let x;
                if (isNumeric || field.alignment === 'right') {
                    // Right align for numbers
                    x = pdfCoords.x + pdfCoords.width - textWidth - FILL_CONFIG.TEXT_PADDING;
                } else if (field.alignment === 'center') {
                    x = pdfCoords.x + (pdfCoords.width - textWidth) / 2;
                } else if (isRTL) {
                    // RTL default: right align
                    x = pdfCoords.x + pdfCoords.width - textWidth - FILL_CONFIG.TEXT_PADDING;
                } else {
                    // LTR default: left align
                    x = pdfCoords.x + FILL_CONFIG.TEXT_PADDING;
                }

                // Calculate Y position (baseline)
                const y = pdfCoords.y + pdfCoords.height - (index + 1) * lineHeight + (lineHeight - fontSize) / 2;

                // Draw text
                page.drawText(textToDraw, {
                    x,
                    y,
                    size: fontSize,
                    font,
                    color: options.textColor || { r: 0, g: 0, b: 0 }
                });
            });

            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.SUCCESS,
                field.id,
                'Text field filled successfully'
            ));

            return { success: true, diagnostics };
        } catch (error) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                field.id,
                `Error filling text: ${error.message}`
            ));
            return { success: false, diagnostics };
        }
    }

    /**
     * Fill a checkbox field
     * @param {Object} page - PDF-LIB page
     * @param {Object} field - Field definition
     * @param {boolean} isChecked - Whether checked
     * @param {Object} fonts - Font objects
     * @param {Object} options - Fill options
     * @returns {Object} Diagnostic info
     */
    async function fillCheckboxField(page, field, isChecked, fonts, options = {}) {
        const diagnostics = [];

        if (!isChecked) {
            return { success: true, diagnostics };
        }

        const pageHeight = page.getHeight();
        const pageWidth = page.getWidth();

        let pdfCoords;
        if (field.bbox && Array.isArray(field.bbox)) {
            pdfCoords = percentToPdfCoords(field.bbox, pageWidth, pageHeight);
        } else if (field.pdfX !== undefined) {
            pdfCoords = mapToPdfCoords({
                x: field.pdfX,
                y: field.pdfY,
                width: field.pdfWidth,
                height: field.pdfHeight
            }, pageHeight, options.renderDpi || FILL_CONFIG.RENDER_DPI);
        } else {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                field.id,
                'No valid coordinates'
            ));
            return { success: false, diagnostics };
        }

        try {
            // Calculate marker size and position
            const markerSize = Math.min(pdfCoords.width, pdfCoords.height) * FILL_CONFIG.MARKER_SIZE_FACTOR;
            const x = pdfCoords.x + (pdfCoords.width - markerSize) / 2;
            const y = pdfCoords.y + (pdfCoords.height - markerSize) / 2;

            // Draw checkmark using font or fallback to drawing
            if (fonts.dingbats) {
                page.drawText('✔', {
                    x: x,
                    y: y,
                    size: markerSize,
                    font: fonts.dingbats,
                    color: { r: 0, g: 0, b: 0 }
                });
            } else {
                // Draw X mark as fallback
                const { rgb } = await import('pdf-lib');

                page.drawLine({
                    start: { x: pdfCoords.x + 2, y: pdfCoords.y + 2 },
                    end: { x: pdfCoords.x + pdfCoords.width - 2, y: pdfCoords.y + pdfCoords.height - 2 },
                    thickness: 2,
                    color: rgb(0, 0, 0)
                });
                page.drawLine({
                    start: { x: pdfCoords.x + pdfCoords.width - 2, y: pdfCoords.y + 2 },
                    end: { x: pdfCoords.x + 2, y: pdfCoords.y + pdfCoords.height - 2 },
                    thickness: 2,
                    color: rgb(0, 0, 0)
                });
            }

            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.SUCCESS,
                field.id,
                'Checkbox filled successfully'
            ));

            return { success: true, diagnostics };
        } catch (error) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                field.id,
                `Error filling checkbox: ${error.message}`
            ));
            return { success: false, diagnostics };
        }
    }

    /**
     * Fill a radio group
     * @param {Object} page - PDF-LIB page
     * @param {Object} group - Group definition
     * @param {string} selectedValue - Selected option value
     * @param {Object} fonts - Font objects
     * @param {Object} options - Fill options
     * @returns {Object} Diagnostic info
     */
    async function fillRadioField(page, group, selectedValue, fonts, options = {}) {
        const diagnostics = [];

        if (!group.options || group.options.length === 0) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                group.groupId,
                'No options in radio group'
            ));
            return { success: false, diagnostics };
        }

        const pageHeight = page.getHeight();
        const pageWidth = page.getWidth();

        try {
            for (const option of group.options) {
                // Radio Grouping Feature: Support multiple naming conventions
                const isSelected = option.englishId === selectedValue ||
                    option.hebrewLabel === selectedValue ||
                    option.fieldId === selectedValue ||
                    option.value === selectedValue ||  // New: from mapper radioGroups export
                    option.label === selectedValue;    // New: from mapper radioGroups export

                if (!isSelected) continue;

                let pdfCoords;
                if (option.bbox && Array.isArray(option.bbox)) {
                    pdfCoords = percentToPdfCoords(option.bbox, pageWidth, pageHeight);
                } else if (option.anchor && Array.isArray(option.anchor)) {
                    // Radio Grouping Feature: Support anchor format from mapper
                    // anchor format: [xPercent, yPercent] - normalized 0-1 values for center point
                    const [anchorX, anchorY] = option.anchor;
                    const overlayWidth = option.overlayWidth || 24;
                    const overlayHeight = option.overlayHeight || 24;

                    // Convert anchor percentages to PDF coordinates
                    // Note: anchorY is stored as "from bottom" in mapper export
                    const centerX = anchorX * pageWidth;
                    const centerY = anchorY * pageHeight;

                    pdfCoords = {
                        x: centerX - overlayWidth / 2,
                        y: centerY - overlayHeight / 2,
                        width: overlayWidth,
                        height: overlayHeight
                    };
                } else if (option.pdfX !== undefined) {
                    pdfCoords = mapToPdfCoords({
                        x: option.pdfX,
                        y: option.pdfY,
                        width: option.pdfWidth,
                        height: option.pdfHeight
                    }, pageHeight, options.renderDpi || FILL_CONFIG.RENDER_DPI);
                } else {
                    continue;
                }

                // Draw filled circle
                const radius = Math.min(pdfCoords.width, pdfCoords.height) * 0.35;
                const centerX = pdfCoords.x + pdfCoords.width / 2;
                const centerY = pdfCoords.y + pdfCoords.height / 2;

                page.drawCircle({
                    x: centerX,
                    y: centerY,
                    size: radius,
                    color: { r: 0, g: 0, b: 0 },
                    borderWidth: 0
                });
            }

            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.SUCCESS,
                group.groupId,
                'Radio group filled successfully'
            ));

            return { success: true, diagnostics };
        } catch (error) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                group.groupId,
                `Error filling radio: ${error.message}`
            ));
            return { success: false, diagnostics };
        }
    }

    // ============ TABLE FILLING ============

    /**
     * Fill a table with data
     * @param {Object} page - PDF-LIB page
     * @param {Object} table - Table definition
     * @param {Array} dataRows - Array of row data objects
     * @param {Object} fonts - Font objects
     * @param {Object} options - Fill options
     * @returns {Object} Diagnostic info
     */
    async function fillTable(page, table, dataRows, fonts, options = {}) {
        const diagnostics = [];

        if (!table || !table.columns || table.columns.length === 0) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                table?.tableId || 'unknown',
                'Invalid table structure'
            ));
            return { success: false, diagnostics };
        }

        if (!dataRows || dataRows.length === 0) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.MISSING_VALUE,
                table.tableId,
                'No data rows provided'
            ));
            return { success: false, diagnostics };
        }

        const pageHeight = page.getHeight();
        const pageWidth = page.getWidth();

        // Get table bbox in PDF coordinates
        let tableBBox;
        if (table.bbox) {
            if (Array.isArray(table.bbox)) {
                tableBBox = percentToPdfCoords(table.bbox, pageWidth, pageHeight);
            } else {
                tableBBox = mapToPdfCoords(table.bbox, pageHeight, options.renderDpi || FILL_CONFIG.RENDER_DPI);
            }
        } else {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                table.tableId,
                'No table bounding box'
            ));
            return { success: false, diagnostics };
        }

        // Calculate row height in PDF units
        const pdfRowHeight = tableBBox.height / table.rowCount;

        // Determine number of rows to fill
        const rowsToFill = Math.min(dataRows.length, table.rowCount);

        if (dataRows.length > table.rowCount) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.OVERFLOW,
                table.tableId,
                `Data has ${dataRows.length} rows but table only has ${table.rowCount}`,
                { dataRows: dataRows.length, tableRows: table.rowCount }
            ));
        }

        try {
            // Fill each row
            for (let rowIndex = 0; rowIndex < rowsToFill; rowIndex++) {
                const rowData = dataRows[rowIndex];

                // Fill each column
                for (const column of table.columns) {
                    const value = rowData[column.columnId] || rowData[column.englishId] || '';

                    if (!value && value !== 0) {
                        continue;
                    }

                    // Get column bbox and convert
                    let colBBox;
                    if (column.bbox) {
                        if (Array.isArray(column.bbox)) {
                            colBBox = percentToPdfCoords(column.bbox, pageWidth, pageHeight);
                        } else {
                            colBBox = mapToPdfCoords(column.bbox, pageHeight, options.renderDpi || FILL_CONFIG.RENDER_DPI);
                        }
                    } else {
                        continue;
                    }

                    // Calculate cell position for this row
                    // Y offset from sample row
                    const sampleRowIndex = table.sampleRowIndex || 0;
                    const yOffset = (rowIndex - sampleRowIndex) * pdfRowHeight;

                    const cellBBox = {
                        x: colBBox.x,
                        y: colBBox.y - yOffset, // PDF Y increases upward
                        width: colBBox.width,
                        height: colBBox.height
                    };

                    // Create a temporary field object for filling
                    const cellField = {
                        id: `${table.tableId}_${column.columnId}_row${rowIndex}`,
                        type: column.type || 'text',
                        direction: column.direction || 'rtl',
                        fontSize: column.fontSize || Math.min(10, pdfRowHeight * 0.6),
                        pdfX: cellBBox.x,
                        pdfY: pageHeight - cellBBox.y - cellBBox.height,
                        pdfWidth: cellBBox.width,
                        pdfHeight: cellBBox.height,
                        _isPdfCoords: true
                    };

                    // Fill the cell
                    const cellResult = await fillTextFieldDirect(page, cellField, value, fonts, {
                        ...options,
                        skipCoordConversion: true
                    });

                    diagnostics.push(...cellResult.diagnostics);
                }
            }

            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.SUCCESS,
                table.tableId,
                `Table filled: ${rowsToFill} rows, ${table.columns.length} columns`
            ));

            return { success: true, diagnostics };
        } catch (error) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                table.tableId,
                `Error filling table: ${error.message}`
            ));
            return { success: false, diagnostics };
        }
    }

    /**
     * Fill text field with direct PDF coordinates (for table cells)
     * @param {Object} page - PDF-LIB page
     * @param {Object} field - Field with PDF coordinates
     * @param {string} value - Value to fill
     * @param {Object} fonts - Font objects
     * @param {Object} options - Fill options
     * @returns {Object} Diagnostic info
     */
    async function fillTextFieldDirect(page, field, value, fonts, options = {}) {
        const diagnostics = [];

        if (!value && value !== 0) {
            return { success: true, diagnostics };
        }

        const formattedValue = formatValue(value, field.type);
        const isHebrew = containsHebrew(formattedValue);
        let font = isHebrew && fonts.main ? fonts.main : (fonts.fallback || fonts.main);

        if (!font) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.FONT_FALLBACK,
                field.id,
                'No font available'
            ));
            return { success: false, diagnostics };
        }

        const pdfCoords = options.skipCoordConversion ? {
            x: field.pdfX,
            y: field.pdfY,
            width: field.pdfWidth,
            height: field.pdfHeight
        } : null;

        if (!pdfCoords) {
            return { success: false, diagnostics };
        }

        // Calculate font size
        let fontSize = field.fontSize || FILL_CONFIG.DEFAULT_FONT_SIZE;
        fontSize = calculateAutoFitFontSize(
            formattedValue,
            font,
            pdfCoords.width,
            pdfCoords.height,
            fontSize
        );

        // Handle text
        const isRTL = field.direction === 'rtl' || isHebrew;
        const isNumeric = field.type === 'number' || /^\d+([.,]\d+)?$/.test(formattedValue);

        let textToDraw = formattedValue;
        if (isRTL && !isNumeric) {
            textToDraw = reverseForRTL(formattedValue);
        }

        // Calculate available width for text (with padding)
        const availableWidth = pdfCoords.width - (FILL_CONFIG.TEXT_PADDING * 2);

        // Keep shrinking font until text fits (no minimum limit for table cells)
        let textWidth = measureTextWidth(textToDraw, font, fontSize);
        while (textWidth > availableWidth && fontSize > 1) {
            fontSize -= 0.5;
            textWidth = measureTextWidth(textToDraw, font, fontSize);
        }

        // Calculate position
        let x;
        if (isNumeric) {
            x = pdfCoords.x + pdfCoords.width - textWidth - FILL_CONFIG.TEXT_PADDING;
        } else if (isRTL) {
            x = pdfCoords.x + pdfCoords.width - textWidth - FILL_CONFIG.TEXT_PADDING;
        } else {
            x = pdfCoords.x + FILL_CONFIG.TEXT_PADDING;
        }

        // Bottom anchor: 15% padding from bottom or at least 2pt
        const bottomPadding = Math.max(2, pdfCoords.height * 0.15);
        const y = pdfCoords.y + bottomPadding;

        try {
            page.drawText(textToDraw, {
                x,
                y,
                size: fontSize,
                font,
                color: options.textColor || { r: 0, g: 0, b: 0 }
            });

            return { success: true, diagnostics };
        } catch (error) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                field.id,
                `Error: ${error.message}`
            ));
            return { success: false, diagnostics };
        }
    }

    // ============ SIGNATURE FILLING ============

    /**
     * Fill a signature field with an image
     * @param {Object} page - PDF-LIB page
     * @param {Object} field - Field definition
     * @param {Uint8Array} signatureImageBytes - Image bytes (PNG or JPEG)
     * @param {Object} options - Fill options
     * @returns {Object} Diagnostic info
     */
    async function fillSignature(page, field, signatureImageBytes, options = {}) {
        const diagnostics = [];

        if (!signatureImageBytes) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.MISSING_VALUE,
                field.id,
                'No signature image provided'
            ));
            return { success: false, diagnostics };
        }

        const pageHeight = page.getHeight();
        const pageWidth = page.getWidth();

        let pdfCoords;
        if (field.bbox && Array.isArray(field.bbox)) {
            pdfCoords = percentToPdfCoords(field.bbox, pageWidth, pageHeight);
        } else if (field.pdfX !== undefined) {
            pdfCoords = mapToPdfCoords({
                x: field.pdfX,
                y: field.pdfY,
                width: field.pdfWidth,
                height: field.pdfHeight
            }, pageHeight, options.renderDpi || FILL_CONFIG.RENDER_DPI);
        } else {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                field.id,
                'No valid coordinates'
            ));
            return { success: false, diagnostics };
        }

        try {
            const pdfDoc = page.doc;

            // Try to embed as PNG first, then JPEG
            let image;
            try {
                image = await pdfDoc.embedPng(signatureImageBytes);
            } catch (e) {
                try {
                    image = await pdfDoc.embedJpg(signatureImageBytes);
                } catch (e2) {
                    throw new Error('Unsupported image format');
                }
            }

            // Calculate dimensions preserving aspect ratio
            const imageAspect = image.width / image.height;
            const boxAspect = pdfCoords.width / pdfCoords.height;

            let drawWidth, drawHeight;
            const maxHeight = pdfCoords.height * FILL_CONFIG.SIGNATURE_MAX_HEIGHT_RATIO;
            const maxWidth = pdfCoords.width - FILL_CONFIG.SIGNATURE_PADDING * 2;

            if (imageAspect > boxAspect) {
                // Image is wider - fit to width
                drawWidth = maxWidth;
                drawHeight = drawWidth / imageAspect;
            } else {
                // Image is taller - fit to height
                drawHeight = maxHeight;
                drawWidth = drawHeight * imageAspect;
            }

            // Center in box
            const x = pdfCoords.x + (pdfCoords.width - drawWidth) / 2;
            const y = pdfCoords.y + (pdfCoords.height - drawHeight) / 2;

            page.drawImage(image, {
                x,
                y,
                width: drawWidth,
                height: drawHeight
            });

            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.SUCCESS,
                field.id,
                'Signature filled successfully'
            ));

            return { success: true, diagnostics };
        } catch (error) {
            diagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                field.id,
                `Error filling signature: ${error.message}`
            ));
            return { success: false, diagnostics };
        }
    }

    // ============ MAIN FILL FUNCTION ============

    /**
     * Fill a PDF with form data based on mapping
     * @param {Uint8Array} inputPdfBytes - Input PDF bytes
     * @param {Object} mapping - Mapping from Steps 1-7 { fields, groups, tables }
     * @param {Object} formData - User input data
     * @param {Object} options - Fill options
     * @returns {Object} { pdfBytes, diagnostics }
     */
    async function fillPDF(inputPdfBytes, mapping, formData, options = {}) {
        const allDiagnostics = [];

        // Validate inputs
        if (!inputPdfBytes) {
            throw new Error('No PDF input provided');
        }

        if (!mapping) {
            throw new Error('No mapping provided');
        }

        // Radio Grouping Feature: Support both 'groups' and 'radioGroups' keys
        const { fields = [], groups = [], radioGroups = [], tables = [] } = mapping;
        // Merge groups and radioGroups for backwards compatibility
        const allGroups = [...groups, ...radioGroups];

        // Validate tables using Step 6 validator
        if (window.TableValidator) {
            for (const table of tables) {
                if (!window.TableValidator.validateExportReady(table)) {
                    const report = window.TableValidator.validateTableStructure(table);
                    allDiagnostics.push(createDiagnostic(
                        DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                        table.tableId,
                        'Table validation failed',
                        { errors: report.errors }
                    ));

                    if (options.strictValidation) {
                        throw new Error(`Table validation failed for ${table.tableId}`);
                    }
                }
            }
        }

        try {
            // Load PDF
            const { PDFDocument, StandardFonts } = await import('pdf-lib');
            const pdfDoc = await PDFDocument.load(inputPdfBytes);

            // Embed fonts
            const fonts = {
                fallback: await pdfDoc.embedFont(StandardFonts.Helvetica),
                main: null,
                dingbats: null
            };

            // Try to embed Hebrew font if available
            if (options.hebrewFontBytes) {
                try {
                    fonts.main = await pdfDoc.embedFont(options.hebrewFontBytes);
                } catch (e) {
                    allDiagnostics.push(createDiagnostic(
                        DIAGNOSTIC_TYPES.FONT_FALLBACK,
                        'fonts',
                        'Could not embed Hebrew font, using fallback'
                    ));
                }
            }

            // Try to embed ZapfDingbats
            try {
                fonts.dingbats = await pdfDoc.embedFont(StandardFonts.ZapfDingbats);
            } catch (e) {
                // Dingbats not critical
            }

            const pages = pdfDoc.getPages();

            // Fill regular fields
            for (const field of fields) {
                if (field.isTableField) continue; // Skip table fields

                const pageIndex = (field.page || 1) - 1;
                if (pageIndex >= pages.length) continue;

                const page = pages[pageIndex];
                const value = formData[field.id] || formData[field.englishId];

                if (field.type === 'checkbox') {
                    const result = await fillCheckboxField(page, field, !!value, fonts, options);
                    allDiagnostics.push(...result.diagnostics);
                } else if (field.type === 'signature') {
                    if (value) {
                        const result = await fillSignature(page, field, value, options);
                        allDiagnostics.push(...result.diagnostics);
                    }
                } else {
                    const result = await fillTextField(page, field, value, fonts, options);
                    allDiagnostics.push(...result.diagnostics);
                }
            }

            // Fill groups (includes both groups and radioGroups)
            for (const group of allGroups) {
                const pageIndex = (group.page || 1) - 1;
                if (pageIndex >= pages.length) continue;

                const page = pages[pageIndex];
                const selectedValue = formData[group.groupId] || formData[group.englishId];

                if (group.type === 'radio') {
                    const result = await fillRadioField(page, group, selectedValue, fonts, options);
                    allDiagnostics.push(...result.diagnostics);
                } else if (group.type === 'checkbox') {
                    // Multiple selections possible
                    const selectedValues = Array.isArray(selectedValue) ? selectedValue : [selectedValue];
                    for (const option of group.options) {
                        const isChecked = selectedValues.includes(option.englishId) ||
                            selectedValues.includes(option.hebrewLabel) ||
                            selectedValues.includes(option.fieldId);

                        if (isChecked) {
                            const result = await fillCheckboxField(page, option, true, fonts, options);
                            allDiagnostics.push(...result.diagnostics);
                        }
                    }
                }
            }

            // Fill tables
            for (const table of tables) {
                const pageIndex = (table.page || 1) - 1;
                if (pageIndex >= pages.length) continue;

                const page = pages[pageIndex];
                const tableData = formData[table.tableId] || formData.tables?.[table.tableId] || [];

                const result = await fillTable(page, table, tableData, fonts, options);
                allDiagnostics.push(...result.diagnostics);
            }

            // Save PDF
            const pdfBytes = await pdfDoc.save();

            return {
                pdfBytes,
                diagnostics: allDiagnostics
            };
        } catch (error) {
            allDiagnostics.push(createDiagnostic(
                DIAGNOSTIC_TYPES.VALIDATION_ERROR,
                'pdf',
                `PDF processing error: ${error.message}`
            ));

            throw error;
        }
    }

    // ============ SIMULATION FOR PREVIEW ============

    /**
     * Simulate fill for live preview (Step 7 integration)
     * @param {Object} mappedObject - Single field, group, or table
     * @param {Object} formData - Form data
     * @param {Object} options - Preview options
     * @returns {Object} Simulation result with preview data
     */
    function simulateFill(mappedObject, formData, options = {}) {
        const result = {
            type: null,
            cells: [],
            diagnostics: []
        };

        if (!mappedObject) return result;

        // Determine type
        if (mappedObject.tableId) {
            result.type = 'table';
            result.cells = simulateTableFill(mappedObject, formData, options);
        } else if (mappedObject.groupId) {
            result.type = 'group';
            result.cells = simulateGroupFill(mappedObject, formData, options);
        } else if (mappedObject.id) {
            result.type = 'field';
            result.cells = [simulateFieldFill(mappedObject, formData, options)];
        }

        return result;
    }

    /**
     * Simulate table fill for preview
     * @param {Object} table - Table definition
     * @param {Object} formData - Form data
     * @param {Object} options - Options
     * @returns {Array} Array of cell preview objects
     */
    function simulateTableFill(table, formData, options = {}) {
        const cells = [];
        const tableData = formData[table.tableId] || formData.tables?.[table.tableId] || [];

        const rowsToFill = Math.min(tableData.length || table.rowCount, table.rowCount);

        for (let rowIndex = 0; rowIndex < rowsToFill; rowIndex++) {
            const rowData = tableData[rowIndex] || {};

            for (const column of table.columns) {
                const value = rowData[column.columnId] || rowData[column.englishId] || '';

                cells.push({
                    rowIndex,
                    columnId: column.columnId,
                    value: formatValue(value, column.type),
                    type: column.type,
                    bbox: column.bbox
                });
            }
        }

        return cells;
    }

    /**
     * Simulate group fill for preview
     * @param {Object} group - Group definition
     * @param {Object} formData - Form data
     * @param {Object} options - Options
     * @returns {Array} Array of option preview objects
     */
    function simulateGroupFill(group, formData, options = {}) {
        const cells = [];
        const selectedValue = formData[group.groupId] || formData[group.englishId];
        const selectedValues = Array.isArray(selectedValue) ? selectedValue : [selectedValue];

        for (const option of group.options) {
            const isSelected = selectedValues.includes(option.englishId) ||
                selectedValues.includes(option.hebrewLabel) ||
                selectedValues.includes(option.fieldId);

            cells.push({
                optionId: option.fieldId,
                isSelected,
                type: group.type,
                bbox: option.bbox
            });
        }

        return cells;
    }

    /**
     * Simulate field fill for preview
     * @param {Object} field - Field definition
     * @param {Object} formData - Form data
     * @param {Object} options - Options
     * @returns {Object} Field preview object
     */
    function simulateFieldFill(field, formData, options = {}) {
        const value = formData[field.id] || formData[field.englishId] || '';

        return {
            fieldId: field.id,
            value: formatValue(value, field.type),
            type: field.type,
            bbox: field.bbox
        };
    }

    // ============ EXPORT ============

    window.FillEngine = {
        // Configuration
        config: FILL_CONFIG,
        diagnosticTypes: DIAGNOSTIC_TYPES,

        // Main API
        fillPDF,
        simulateFill,

        // Field filling
        fillTextField,
        fillCheckboxField,
        fillRadioField,
        fillTable,
        fillSignature,

        // Utilities
        mapToPdfCoords,
        percentToPdfCoords,
        formatValue,
        measureTextWidth,
        containsHebrew,
        reverseForRTL,
        calculateAutoFitFontSize,
        wrapText,

        // Diagnostics
        createDiagnostic
    };

    console.log('%c📄 Fill Engine Module Loaded (Step 8)', 'background: #673AB7; color: white; font-size: 14px; padding: 5px;');
})();
