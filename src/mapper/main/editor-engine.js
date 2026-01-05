/**
 * Mapper Editor Engine - Field editing logic
 * These functions handle field property updates, text styling, and field manipulation.
 *
 * NOTE: All functions receive mapper state as parameters.
 * No internal "this" references - all state passed in.
 */
(function() {
    'use strict';

    // ============ FIELD TEXT UPDATES ============

    /**
     * Update field text value
     * @param {string} fieldId - Field ID
     * @param {string} text - New text value
     * @param {boolean} shouldRerender - Whether to re-render preview
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateFieldText(fieldId, text, shouldRerender = true, mapper) {
        const field = mapper.fields.find(f => f.id === fieldId);
        if (!field) return;

        // Store in liveFillData with new structure, not in field object
        if (!mapper.liveFillData[fieldId]) {
            mapper.liveFillData[fieldId] = {
                value: '',
                style: {
                    fontFamily: mapper.textPreviewSettings.fontFamily,
                    fontSize: mapper.textPreviewSettings.fontSize,
                    alignmentH: mapper.textPreviewSettings.alignmentH,
                    alignmentV: mapper.textPreviewSettings.alignmentV,
                    color: mapper.textPreviewSettings.color,
                    opacity: mapper.textPreviewSettings.opacity,
                    letterSpacing: mapper.textPreviewSettings.letterSpacing,
                    wordSpacing: mapper.textPreviewSettings.wordSpacing
                }
            };
        }
        mapper.liveFillData[fieldId].value = text;

        // Auto-refresh PDF preview when text changes (unless explicitly disabled)
        if (shouldRerender) {
            mapper.refreshPdfPreview();
            mapper.renderTextPreview(field);
        }
        mapper.autoSave();
    }

    // ============ FONT SIZE UPDATES ============

    /**
     * Update font size from slider
     * @param {string|number} value - Font size value
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateFontSizeFromSlider(value, mapper) {
        console.log('updateFontSizeFromSlider called with:', value);
        const fontSizeInput = document.getElementById('text-font-size');
        if (fontSizeInput) fontSizeInput.value = value;

        mapper.textPreviewSettings.fontSize = parseInt(value);
        console.log('Updated textPreviewSettings.fontSize to:', mapper.textPreviewSettings.fontSize);

        // Update selected field's font size
        if (mapper.selectedTextPreview && mapper.liveFillData[mapper.selectedTextPreview]) {
            if (!mapper.liveFillData[mapper.selectedTextPreview].style) {
                mapper.liveFillData[mapper.selectedTextPreview].style = {};
            }
            mapper.liveFillData[mapper.selectedTextPreview].style.fontSize = parseInt(value);
            console.log('Updated field', mapper.selectedTextPreview, 'fontSize to:', parseInt(value));
        }

        // Direct update without re-rendering
        mapper.applyFontSizeDirectly(parseInt(value));

        // Apply real-time styling
        if (mapper.selectedTextPreview) {
            mapper.applyRealTimeStyleToPreview(mapper.selectedTextPreview);
        }
    }

    /**
     * Apply font size directly
     * @param {number} fontSize - Font size value
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function applyFontSizeDirectly(fontSize, mapper) {
        // Simply re-render all text previews with updated settings
        mapper.updateAllTextPreviews();
    }

    // ============ TEXT ALIGNMENT ============

    /**
     * Set horizontal text alignment
     * @param {string} alignment - Alignment value (left, center, right)
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function setTextAlignment(alignment, mapper) {
        mapper.textPreviewSettings.alignmentH = alignment;

        // Update selected field's alignment
        if (mapper.selectedTextPreview && mapper.liveFillData[mapper.selectedTextPreview]) {
            if (!mapper.liveFillData[mapper.selectedTextPreview].style) {
                mapper.liveFillData[mapper.selectedTextPreview].style = {};
            }
            mapper.liveFillData[mapper.selectedTextPreview].style.alignmentH = alignment;
        }

        // Update UI buttons
        if (event && event.target) {
            document.querySelectorAll('.alignment-buttons button').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
        }

        mapper.updateAllTextPreviews();

        // Apply real-time styling
        if (mapper.selectedTextPreview) {
            mapper.applyRealTimeStyleToPreview(mapper.selectedTextPreview);
        }
    }

    /**
     * Set vertical text alignment
     * @param {string} alignment - Alignment value (top, middle, bottom)
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function setTextAlignmentV(alignment, mapper) {
        mapper.textPreviewSettings.alignmentV = alignment;

        // Update selected field's vertical alignment
        if (mapper.selectedTextPreview && mapper.liveFillData[mapper.selectedTextPreview]) {
            if (!mapper.liveFillData[mapper.selectedTextPreview].style) {
                mapper.liveFillData[mapper.selectedTextPreview].style = {};
            }
            mapper.liveFillData[mapper.selectedTextPreview].style.alignmentV = alignment;
        }

        // Update UI buttons
        document.querySelectorAll('.alignment-buttons button').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');

        mapper.updateAllTextPreviews();

        // Apply real-time styling
        if (mapper.selectedTextPreview) {
            mapper.applyRealTimeStyleToPreview(mapper.selectedTextPreview);
        }
    }

    // ============ TEXT OPACITY ============

    /**
     * Update text opacity
     * @param {number} value - Opacity value (0-100)
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateTextOpacity(value, mapper) {
        mapper.textPreviewSettings.opacity = value / 100;

        // Update selected field's opacity
        if (mapper.selectedTextPreview && mapper.liveFillData[mapper.selectedTextPreview]) {
            if (!mapper.liveFillData[mapper.selectedTextPreview].style) {
                mapper.liveFillData[mapper.selectedTextPreview].style = {};
            }
            mapper.liveFillData[mapper.selectedTextPreview].style.opacity = value / 100;
        }

        const opacityValue = document.getElementById('text-opacity-value');
        if (opacityValue) opacityValue.textContent = value + '%';

        mapper.updateAllTextPreviews();

        // Apply real-time styling
        if (mapper.selectedTextPreview) {
            mapper.applyRealTimeStyleToPreview(mapper.selectedTextPreview);
        }
    }

    // ============ TEXT COLOR ============

    /**
     * Update color from hex input
     * @param {string} value - Hex color value
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateColorFromHex(value, mapper) {
        const colorPicker = document.getElementById('text-color');
        if (colorPicker) colorPicker.value = value;

        mapper.textPreviewSettings.color = value;

        // Update selected field's color
        if (mapper.selectedTextPreview && mapper.liveFillData[mapper.selectedTextPreview]) {
            if (!mapper.liveFillData[mapper.selectedTextPreview].style) {
                mapper.liveFillData[mapper.selectedTextPreview].style = {};
            }
            mapper.liveFillData[mapper.selectedTextPreview].style.color = value;
        }

        mapper.updateAllTextPreviews();

        // Apply real-time styling
        if (mapper.selectedTextPreview) {
            mapper.applyRealTimeStyleToPreview(mapper.selectedTextPreview);
        }
    }

    // ============ LETTER/WORD SPACING ============

    /**
     * Update letter spacing
     * @param {string|number} value - Letter spacing value
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateLetterSpacing(value, mapper) {
        mapper.textPreviewSettings.letterSpacing = parseFloat(value);

        // Update selected field's letter spacing
        if (mapper.selectedTextPreview && mapper.liveFillData[mapper.selectedTextPreview]) {
            if (!mapper.liveFillData[mapper.selectedTextPreview].style) {
                mapper.liveFillData[mapper.selectedTextPreview].style = {};
            }
            mapper.liveFillData[mapper.selectedTextPreview].style.letterSpacing = parseFloat(value);
        }

        mapper.updateAllTextPreviews();

        // Apply real-time styling
        if (mapper.selectedTextPreview) {
            mapper.applyRealTimeStyleToPreview(mapper.selectedTextPreview);
        }
    }

    /**
     * Update letter spacing from slider
     * @param {string|number} value - Letter spacing value
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateLetterSpacingFromSlider(value, mapper) {
        const letterSpacingInput = document.getElementById('text-letter-spacing');
        if (letterSpacingInput) letterSpacingInput.value = value;

        mapper.updateLetterSpacing(value);
    }

    /**
     * Update word spacing
     * @param {string|number} value - Word spacing value
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateWordSpacing(value, mapper) {
        mapper.textPreviewSettings.wordSpacing = parseFloat(value);

        // Update selected field's word spacing
        if (mapper.selectedTextPreview && mapper.liveFillData[mapper.selectedTextPreview]) {
            if (!mapper.liveFillData[mapper.selectedTextPreview].style) {
                mapper.liveFillData[mapper.selectedTextPreview].style = {};
            }
            mapper.liveFillData[mapper.selectedTextPreview].style.wordSpacing = parseFloat(value);
        }

        mapper.updateAllTextPreviews();

        // Apply real-time styling
        if (mapper.selectedTextPreview) {
            mapper.applyRealTimeStyleToPreview(mapper.selectedTextPreview);
        }
    }

    /**
     * Update word spacing from slider
     * @param {string|number} value - Word spacing value
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateWordSpacingFromSlider(value, mapper) {
        const wordSpacingInput = document.getElementById('text-word-spacing');
        if (wordSpacingInput) wordSpacingInput.value = value;

        mapper.updateWordSpacing(value);
    }

    // ============ TEXT PREVIEW ============

    /**
     * Update text preview with current settings
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function updateTextPreview(mapper) {
        console.log('updateTextPreview called');
        const fontFamily = document.getElementById('text-font-family')?.value || 'Arial';
        const fontSize = document.getElementById('text-font-size')?.value || 14;
        const color = document.getElementById('text-color')?.value || '#000000';
        const letterSpacing = document.getElementById('text-letter-spacing')?.value || 0;
        const wordSpacing = document.getElementById('text-word-spacing')?.value || 0;

        console.log('Read values:', { fontFamily, fontSize, color, letterSpacing, wordSpacing });

        mapper.textPreviewSettings.fontFamily = fontFamily;
        mapper.textPreviewSettings.fontSize = parseInt(fontSize);
        mapper.textPreviewSettings.color = color;
        mapper.textPreviewSettings.letterSpacing = parseFloat(letterSpacing);
        mapper.textPreviewSettings.wordSpacing = parseFloat(wordSpacing);

        // Update selected field's settings if there's one selected
        if (mapper.selectedTextPreview && mapper.liveFillData[mapper.selectedTextPreview]) {
            if (!mapper.liveFillData[mapper.selectedTextPreview].style) {
                mapper.liveFillData[mapper.selectedTextPreview].style = {};
            }
            mapper.liveFillData[mapper.selectedTextPreview].style.fontFamily = fontFamily;
            mapper.liveFillData[mapper.selectedTextPreview].style.fontSize = parseInt(fontSize);
            mapper.liveFillData[mapper.selectedTextPreview].style.color = color;
            mapper.liveFillData[mapper.selectedTextPreview].style.letterSpacing = parseFloat(letterSpacing);
            mapper.liveFillData[mapper.selectedTextPreview].style.wordSpacing = parseFloat(wordSpacing);
        }

        // Always update all text previews
        mapper.updateAllTextPreviews();

        // Apply styling to the selected text element in real time
        if (mapper.selectedTextPreview) {
            mapper.applyRealTimeStyleToPreview(mapper.selectedTextPreview);
        }
    }

    // ============ REAL-TIME STYLING ============

    /**
     * Apply real-time styling to preview element
     * @param {string} fieldId - Field ID
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function applyRealTimeStyleToPreview(fieldId, mapper) {
        const preview = document.querySelector(`.field-text-preview[data-field-id="${fieldId}"]`);
        if (!preview || !mapper.liveFillData[fieldId] || !mapper.liveFillData[fieldId].style) return;

        const style = mapper.liveFillData[fieldId].style;

        // Apply styles directly to the preview element
        preview.style.fontFamily = style.fontFamily || mapper.textPreviewSettings.fontFamily;
        preview.style.fontSize = (style.fontSize || mapper.textPreviewSettings.fontSize) + 'px';
        preview.style.color = style.color || mapper.textPreviewSettings.color;
        preview.style.opacity = (style.opacity !== undefined ? style.opacity : mapper.textPreviewSettings.opacity).toString();
        preview.style.letterSpacing = (style.letterSpacing || mapper.textPreviewSettings.letterSpacing) + 'px';
        preview.style.wordSpacing = (style.wordSpacing || mapper.textPreviewSettings.wordSpacing) + 'px';

        // Apply horizontal alignment
        if (style.alignmentH === 'left') {
            preview.style.justifyContent = 'flex-start';
        } else if (style.alignmentH === 'right') {
            preview.style.justifyContent = 'flex-end';
        } else {
            preview.style.justifyContent = 'center';
        }

        // Apply vertical alignment
        if (style.alignmentV === 'top') {
            preview.style.alignItems = 'flex-start';
        } else if (style.alignmentV === 'bottom') {
            preview.style.alignItems = 'flex-end';
        } else {
            preview.style.alignItems = 'center';
        }
    }

    // ============ TEXT LAYOUT ============

    /**
     * Apply text layout to a field element
     * @param {Object} field - Field object
     * @param {HTMLElement} textElement - Text DOM element
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function applyTextLayout(field, textElement, mapper) {
        const dir = field.direction || 'rtl'; // Default to RTL, no dummy data dependency
        textElement.classList.remove('rtl', 'ltr');
        textElement.classList.add(dir);

        // Apply alignment classes
        textElement.classList.remove('anchor-start', 'anchor-center', 'anchor-end',
                                   'valign-top', 'valign-middle', 'valign-bottom');
        textElement.classList.add(`anchor-${field.anchorH || 'start'}`);
        textElement.classList.add(`valign-${field.anchorV || 'middle'}`);

        // Apply padding based on direction
        const padStart = field.padStart ?? 4;
        const padEnd = field.padEnd ?? 4;
        const padTop = field.padTop ?? 2;
        const padBottom = field.padBottom ?? 2;

        if (dir === 'rtl') {
            textElement.style.paddingRight = padStart + 'px';
            textElement.style.paddingLeft = padEnd + 'px';
        } else {
            textElement.style.paddingLeft = padStart + 'px';
            textElement.style.paddingRight = padEnd + 'px';
        }

        textElement.style.paddingTop = padTop + 'px';
        textElement.style.paddingBottom = padBottom + 'px';

        // Apply typography with responsive text handling
        textElement.style.fontSize = (field.fontSize || 14) + 'px';
        textElement.style.letterSpacing = (field.letterSpacing || 0) + 'px';
        textElement.style.wordWrap = 'break-word';
        textElement.style.overflow = 'hidden';
        textElement.style.textOverflow = 'ellipsis';
        textElement.style.whiteSpace = 'nowrap';

        // התאמת רוחב מקסימלי דינמי
        if (field.element && field.wPct) {
            const container = document.getElementById('mapping-layer');
            if (container) {
                const logicalWidth = mapper.getLogicalWidth(container);
                const fieldWidth = Math.round((field.wPct * logicalWidth) / 100);
                const maxWidth = Math.max(25, fieldWidth - padStart - padEnd - 5);
                textElement.style.maxWidth = maxWidth + 'px';
            }
        }
        textElement.style.wordSpacing = (field.wordSpacing || 0) + 'px';
    }

    // ============ TEXT NUDGING ============

    /**
     * Nudge text position
     * @param {number} dx - X delta
     * @param {number} dy - Y delta
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function nudgeText(dx, dy, mapper) {
        if (!mapper.selectedTextPreview) {
            mapper.showToast('בחר טקסט תחילה על ידי לחיצה עליו', 'warning');
            return;
        }

        const field = mapper.fields.find(f => f.id === mapper.selectedTextPreview);
        if (!field || !field.isMapped) return;

        const nudgeAmount = 2; // 2px nudge for better visibility
        const currentX = (field.xPct / 100) * mapper.baseDimensions.width;
        const currentY = (field.yPct / 100) * mapper.baseDimensions.height;

        const newX = currentX + (dx * nudgeAmount);
        const newY = currentY + (dy * nudgeAmount);

        // Ensure we don't go outside bounds
        const maxX = mapper.baseDimensions.width - (field.wPct / 100) * mapper.baseDimensions.width;
        const maxY = mapper.baseDimensions.height - (field.hPct / 100) * mapper.baseDimensions.height;

        const boundedX = Math.max(0, Math.min(maxX, newX));
        const boundedY = Math.max(0, Math.min(maxY, newY));

        field.xPct = (boundedX / mapper.baseDimensions.width) * 100;
        field.yPct = (boundedY / mapper.baseDimensions.height) * 100;

        // Only render text preview, don't render mapper field overlay
        mapper.renderTextPreview(field);
        mapper.autoSave();
    }

    // ============ EXPORT ============

    window.MapperEditorEngine = {
        updateFieldText,
        updateFontSizeFromSlider,
        applyFontSizeDirectly,
        setTextAlignment,
        setTextAlignmentV,
        updateTextOpacity,
        updateColorFromHex,
        updateLetterSpacing,
        updateLetterSpacingFromSlider,
        updateWordSpacing,
        updateWordSpacingFromSlider,
        updateTextPreview,
        applyRealTimeStyleToPreview,
        applyTextLayout,
        nudgeText
    };
})();
