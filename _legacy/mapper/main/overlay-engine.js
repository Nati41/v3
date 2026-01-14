/**
 * Mapper Overlay Engine - Field overlay rendering logic
 * These functions handle rendering field overlays on the canvas.
 *
 * NOTE: All functions receive mapper state as parameters.
 * No internal "this" references - all state passed in.
 */
(function() {
    'use strict';

    // ============ FIELD RENDERING ============

    /**
     * Render a single field overlay (RAF-optimized wrapper)
     * @param {Object} field - Field to render
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function renderField(field, mapper) {
        // Render immediately without RAF batching to ensure all fields are rendered
        await renderFieldImmediate(field, mapper);
    }

    /**
     * Internal immediate version of field rendering
     * @param {Object} field - Field to render
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function renderFieldImmediate(field, mapper) {
        // Don't render if PDF viewport not loaded yet - queue for later
        if (!mapper.pdfPageDimensions) {
            // Queue this field to be rendered later (silently)
            if (!mapper._pendingRenderFields) {
                mapper._pendingRenderFields = [];
            }
            if (!mapper._pendingRenderFields.includes(field)) {
                mapper._pendingRenderFields.push(field);
                console.log('📝 Field queued (no dimensions yet):', field.id);
            }
            return;
        }

        // Remove existing element if any
        if (field.element) {
            field.element.remove();
        }

        const container = document.getElementById('mapping-layer');
        if (!container) return;

        // Create field overlay element
        const overlay = document.createElement('div');
        overlay.className = 'field-overlay';

        // Add type-specific class
        if (field.type === 'checkbox' || field.type === 'radio' || field.type === 'signature') {
            overlay.classList.add(`type-${field.type}`);
        }

        // Add unnamed field class for Step 1 fields
        if (field.isUnnamed === true) {
            overlay.classList.add('unnamed-field-overlay');
        }

        // Add named/linked field class for Step 2 fields
        if (field.linked === true) {
            overlay.classList.add('named-field-overlay');
        }

        if (field.tableGroupId) {
            overlay.classList.add('table-field');
        }

        // Radio Grouping Feature: Add group-related classes
        if (field.groupId) {
            overlay.classList.add('has-radio-group');
            overlay.dataset.groupId = field.groupId;
        }
        if (field._selectedForGroup === true) {
            overlay.classList.add('selected-for-grouping');
        }

        overlay.dataset.fieldId = field.id;

        // ========== FIXED COORDINATE CONVERSION ==========
        // Convert PDF points directly to canvas pixels using simple linear scale
        // DO NOT use UnifiedCoordinateSystem here - it's designed for PDF.js canvas, not for the mapper UI

        let x, y, width, height;

        // ✅ FIX: Use PDF points (scale 1.0) to match drag-engine coordinate system
        // pdfPageDimensions is scaled by DPI, we need unscaled PDF points for consistent rendering
        const dpiScale = mapper.dpiSetting / 72;
        const pdfW = (mapper.pdfPageDimensions?.width || 595 * dpiScale) / dpiScale;
        const pdfH = (mapper.pdfPageDimensions?.height || 842 * dpiScale) / dpiScale;

        // Get the actual displayed layer size in pixels (same as drag/resize handlers use)
        const layerWidth = Math.max(container.offsetWidth, 1);
        const layerHeight = Math.max(container.offsetHeight, 1);

        // Calculate scale factors: viewport dimensions → display pixels
        const scaleX = layerWidth / pdfW;
        const scaleY = layerHeight / pdfH;

        if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            // bbox format: [x, y, w, h] - can be normalized (0-1) or absolute PDF points
            let [bboxX, bboxY, bboxW, bboxH] = field.bbox;

            // If values are normalized (0-1), convert to absolute PDF points
            if (bboxX <= 1 && bboxY <= 1 && bboxW <= 1 && bboxH <= 1) {
                bboxX *= pdfW;
                bboxY *= pdfH;
                bboxW *= pdfW;
                bboxH *= pdfH;
            }

            // Convert PDF points to canvas pixels (simple linear scale)
            // Note: PDF Y is from bottom, canvas Y is from top
            // The bbox Y is stored as bottom-left in PDF coordinates
            x = Math.round(bboxX * scaleX);
            y = Math.round((pdfH - bboxY - bboxH) * scaleY);  // Flip Y axis
            width = Math.round(bboxW * scaleX);
            height = Math.round(bboxH * scaleY);

        } else if ((field.type === 'checkbox' || field.type === 'radio') && field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
            // anchor format: [xPercent, yPercent] - normalized 0-1 values for center point
            // NOTE: yPercent is already stored as "from bottom" (Y-flipped during save in placeCheckboxRadio)
            const [anchorX, anchorY] = field.anchor;

            // Convert anchor (0-1) to canvas pixels
            // anchorY is already Y-flipped (stored as yPdfBottom/pageHeight), so we need to flip it back
            // to get canvas coordinates (canvas Y is from top)
            const canvasCenterX = anchorX * layerWidth;
            const canvasCenterY = (1 - anchorY) * layerHeight;

            width = field.overlayWidth || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
            height = field.overlayHeight || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
            x = Math.round(canvasCenterX - width / 2);
            y = Math.round(canvasCenterY - height / 2);

            console.log('🔲 Checkbox/Radio render:', { id: field.id, anchorX, anchorY, canvasCenterX, canvasCenterY, x, y, layerWidth, layerHeight });

        } else {
            // Fallback to legacy percentage system
            const position = mapper.calculatePixelPosition(field);
            x = position.x;
            y = position.y;
            width = position.width;
            height = position.height;
        }

        overlay.style.left = x + 'px';
        overlay.style.top = y + 'px';
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';

        // Add resize handles (hidden by default, shown only when selected)
        ['nw', 'ne', 'sw', 'se'].forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${pos}`;
            handle.style.display = 'none';
            overlay.appendChild(handle);
        });

        // Set initial z-index to 1
        overlay.style.zIndex = '1';

        console.log('🎨 Adding overlay to container:', {
            fieldId: field.id,
            position: { x, y, width, height },
            overlayStyle: {
                left: overlay.style.left,
                top: overlay.style.top,
                width: overlay.style.width,
                height: overlay.style.height
            }
        });

        // Add to container
        container.appendChild(overlay);
        field.element = overlay;

        console.log('✅ Overlay added to DOM successfully');

        // Add click handler
        overlay.addEventListener('click', (e) => {
            if (!e.target.classList.contains('resize-handle')) {
                mapper.selectField(field.id);
            }
        });

        // Add right-click context menu handler
        overlay.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            mapper.showFieldContextMenu(field, e.clientX, e.clientY);
        });
    }

    // ============ BATCH FIELD RENDERING ============

    /**
     * Render all mapped fields
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function renderFields(mapper) {
        console.log('renderFields: rendering', mapper.fields.length, 'fields');

        // Migrate legacy percentage-based fields to PDF coordinates if needed
        if (mapper.needsLegacyMigration) {
            await mapper.migrateLegacyFields();
            mapper.needsLegacyMigration = false;
        }

        // Use Promise.all to render all fields in parallel
        const renderPromises = mapper.fields
            .filter(field => field.isMapped && (field.bbox || (field.xPct !== null && field.yPct !== null) || field.anchor))
            .map(async (field) => {
                try {
                    await renderField(field, mapper);
                } catch (error) {
                    console.error('Error rendering field:', field.id, error);
                }
            });

        await Promise.all(renderPromises);
        console.log('All fields rendered');
    }

    // ============ OVERLAY FROM JSON ============

    /**
     * Re-render image view overlays from JSON using dynamic pt→px conversion
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function renderOverlayFromJson(mapper) {
        console.log('[DEBUG][renderOverlayFromJson] CALLED - will clear and re-render overlays');
        console.log('[DEBUG][renderOverlayFromJson] Call stack:', new Error().stack);

        // Don't render if PDF viewport not loaded yet
        if (!mapper.pdfPageDimensions) {
            console.log('[DEBUG][renderOverlayFromJson] ABORTED - no pdfPageDimensions');
            return;
        }

        // Debug: Log all fields before filtering
        console.log('🔍 renderOverlayFromJson: All fields:', mapper.fields.map(f => ({
            id: f.id,
            type: f.type,
            isMapped: f.isMapped,
            page: f.page,
            currentPage: mapper.currentPage,
            hasBbox: !!(f.bbox && Array.isArray(f.bbox) && f.bbox.length === 4),
            hasAnchor: !!(f.anchor && Array.isArray(f.anchor) && f.anchor.length === 2),
            bbox: f.bbox,
            anchor: f.anchor
        })));

        // Only render fields for the mapping/image view
        // Include fields with bbox OR anchor (for checkbox/radio types)
        const mappedFields = mapper.fields.filter(field => {
            if (!field.isMapped || field.page !== mapper.currentPage) {
                return false;
            }
            // Check for valid bbox
            const hasBbox = field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4;
            // Check for valid anchor (used by checkbox/radio)
            const hasAnchor = field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2;
            return hasBbox || hasAnchor;
        });

        console.log('🔍 renderOverlayFromJson: Filtered fields to render:', mappedFields.map(f => f.id));

        // Clear existing overlays
        document.querySelectorAll('.field-overlay').forEach(el => el.remove());

        // Re-render each field with fresh pt→px conversion
        const renderPromises = mappedFields.map(field => renderField(field, mapper));
        await Promise.all(renderPromises);

        console.log(`Re-rendered ${mappedFields.length} image view overlays from JSON`);
    }

    // ============ LIVE FILL OVERLAYS ============

    /**
     * Clear all live fill overlays
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function clearLiveFillOverlays(mapper) {
        const textLayer = document.getElementById('text-preview-layer');
        if (textLayer) {
            textLayer.innerHTML = '';
        }
    }

    /**
     * Build live fill overlay based on mapped fields
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function buildLiveFillOverlay(mapper) {
        // This will create the live text overlay based on mapped fields
        const mappedFields = mapper.fields.filter(f => f.isMapped && f.page === mapper.currentPage);

        mappedFields.forEach(field => {
            // Initialize live fill data for this field if not exists
            if (!mapper.liveFillData[field.id]) {
                mapper.liveFillData[field.id] = {
                    value: '', // Real value, not dummy
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
        });
    }

    // ============ EXPORT ============

    window.MapperOverlayEngine = {
        renderField,
        renderFields,
        renderOverlayFromJson,
        buildLiveFillOverlay,
        clearLiveFillOverlays
    };
})();
