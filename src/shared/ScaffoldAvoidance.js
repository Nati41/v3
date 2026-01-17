/**
 * ScaffoldAvoidance.js
 *
 * Pixel-based detection and HORIZONTAL avoidance of printed scaffolding
 * (slashes, lines, separators) within text field bboxes in Quick Fill mode.
 *
 * DESIGN PRINCIPLES:
 * 1. NO VERTICAL MOVEMENT - never shifts baseline Y
 * 2. Horizontal X offset only - shifts entire text left/right
 * 3. Font scale reduction as fallback - shrinks text if offset doesn't help
 * 4. Last-resort safety rule - only activates on detected collision
 * 5. Respects digit groups - never splits or reorders digits
 * 6. Isolated module - no dependencies on core rendering logic
 * 7. Additive only - returns original placement if no safe solution
 * 8. Feature-flagged - can be disabled via FEATURES.SCAFFOLD_AVOIDANCE
 * 9. QuickFill only - does not affect mapped-fill export
 *
 * @version 2.1.0 - Added structured placement for date fields
 */

(function() {
    'use strict';

    // ════════════════════════════════════════════════════════════════════════
    // CONFIGURATION
    // ════════════════════════════════════════════════════════════════════════

    const CONFIG = {
        // Ink detection thresholds
        INK_THRESHOLD: 180,              // Luminance < 180 = "ink" (dark pixel)
        INK_DENSITY_THRESHOLD: 0.12,     // 12% ink in column = likely a printed element
        BAND_WIDTH: 3,                   // px per vertical band (column width)

        // Horizontal offset constraints
        MAX_OFFSET_PX: 8,                // Maximum horizontal shift in pixels
        OFFSET_STEP: 2,                  // Offset search step in pixels
        OFFSET_CANDIDATES: [2, -2, 4, -4, 6, -6, 8, -8], // Ordered offset attempts

        // Font scale constraints
        MIN_FONT_SCALE: 0.90,            // Minimum font scale (10% reduction max)
        FONT_SCALE_STEPS: [0.96, 0.93, 0.90], // Ordered scale attempts

        // Collision detection
        COLLISION_OVERLAP_THRESHOLD: 0.08, // 8% overlap with ink band = collision
        TEXT_MARGIN_PX: 2,               // Margin around text bounds for collision

        // Gating
        MIN_BBOX_HEIGHT: 10,             // Minimum bbox height to attempt detection
        MIN_BBOX_WIDTH: 20,              // Minimum bbox width to attempt detection

        // Structured placement
        STRUCTURED_MIN_SLOT_WIDTH: 8,    // Minimum slot width in pixels
        STRUCTURED_MIN_INK_GAP: 4,       // Minimum gap between ink regions
        STRUCTURED_SLOT_PADDING: 2       // Padding inside each slot
    };

    // Known structured patterns: [digitCount, slotCount, segmentLengths]
    const STRUCTURED_PATTERNS = {
        DATE_8: { digits: 8, slots: 3, segments: [2, 2, 4], name: 'DD/MM/YYYY' },
        DATE_6: { digits: 6, slots: 3, segments: [2, 2, 2], name: 'DD/MM/YY' }
    };

    // ════════════════════════════════════════════════════════════════════════
    // PIXEL ANALYSIS
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Get ImageData for a bbox region from the PDF image or canvas
     * Note: PDFEngine renders PDF to a temporary canvas, converts to PNG,
     * and displays as <img>. So we need to read from the img element.
     * @param {Object} screenRect - { x, y, width, height } in screen coordinates
     * @returns {ImageData|null} - ImageData for the region, or null if unavailable
     */
    function getImageDataForBbox(screenRect) {
        if (!screenRect || screenRect.width < CONFIG.MIN_BBOX_WIDTH ||
            screenRect.height < CONFIG.MIN_BBOX_HEIGHT) {
            console.log('[ScaffoldAvoidance] getImageDataForBbox: INVALID RECT', screenRect);
            return null;
        }

        // PDFEngine displays the PDF as an <img> element (not a canvas)
        // Try to find the PDF image first, then fall back to canvas
        const pdfImage = document.querySelector('#pdf-container img');
        const pdfCanvas = document.querySelector('#pdf-container canvas') ||
                          document.querySelector('.pdf-canvas') ||
                          document.querySelector('canvas[id*="pdf"]');

        const sourceElement = pdfImage || pdfCanvas;

        if (!sourceElement) {
            console.log('[ScaffoldAvoidance] getImageDataForBbox: NO PDF IMAGE OR CANVAS FOUND');
            return null;
        }

        console.log('[ScaffoldAvoidance] getImageDataForBbox: found', sourceElement.tagName,
            sourceElement.id || sourceElement.className || '(no id)');

        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = Math.ceil(screenRect.width);
            tempCanvas.height = Math.ceil(screenRect.height);
            const ctx = tempCanvas.getContext('2d');

            // For img elements, we need to account for the displayed size vs natural size
            // The screenRect is in screen coordinates (displayed size)
            // But the img's natural size might be different (high DPI rendering)
            let scaleX = 1, scaleY = 1;
            if (sourceElement.tagName === 'IMG') {
                const displayedWidth = sourceElement.offsetWidth || sourceElement.width;
                const displayedHeight = sourceElement.offsetHeight || sourceElement.height;
                const naturalWidth = sourceElement.naturalWidth;
                const naturalHeight = sourceElement.naturalHeight;

                if (naturalWidth && displayedWidth) {
                    scaleX = naturalWidth / displayedWidth;
                    scaleY = naturalHeight / displayedHeight;
                }
                console.log('[ScaffoldAvoidance] Image scale:', scaleX.toFixed(2), 'x', scaleY.toFixed(2));
            }

            // Scale the coordinates from screen space to image space
            const srcX = Math.floor(screenRect.x * scaleX);
            const srcY = Math.floor(screenRect.y * scaleY);
            const srcW = Math.ceil(screenRect.width * scaleX);
            const srcH = Math.ceil(screenRect.height * scaleY);

            ctx.drawImage(
                sourceElement,
                srcX, srcY, srcW, srcH,
                0, 0,
                tempCanvas.width, tempCanvas.height
            );

            const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            console.log('[ScaffoldAvoidance] getImageDataForBbox: SUCCESS, size=' + imageData.data.length);
            return imageData;
        } catch (error) {
            console.warn('[ScaffoldAvoidance] Failed to get image data:', error.message);
            return null;
        }
    }

    /**
     * Detect vertical ink bands (columns with high ink density)
     * Used to find printed slashes, separators, lines
     * @param {ImageData} imageData - ImageData for the bbox region
     * @param {Object} bbox - { width, height } dimensions
     * @returns {Array} - Array of band objects { x, width, density, isInk }
     */
    function detectVerticalInkBands(imageData, bbox) {
        const bands = [];
        const numBands = Math.floor(bbox.width / CONFIG.BAND_WIDTH);
        const height = Math.floor(bbox.height);
        const width = Math.floor(bbox.width);

        for (let bandIdx = 0; bandIdx < numBands; bandIdx++) {
            const bandX = bandIdx * CONFIG.BAND_WIDTH;
            let inkPixels = 0;
            let totalPixels = 0;

            for (let x = bandX; x < bandX + CONFIG.BAND_WIDTH && x < width; x++) {
                for (let y = 0; y < height; y++) {
                    const idx = (y * width + x) * 4;

                    if (idx + 2 >= imageData.data.length) continue;

                    const r = imageData.data[idx];
                    const g = imageData.data[idx + 1];
                    const b = imageData.data[idx + 2];

                    // Calculate luminance
                    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

                    totalPixels++;
                    if (luminance < CONFIG.INK_THRESHOLD) {
                        inkPixels++;
                    }
                }
            }

            const density = totalPixels > 0 ? inkPixels / totalPixels : 0;
            bands.push({
                x: bandX,
                width: CONFIG.BAND_WIDTH,
                density: density,
                isInk: density > CONFIG.INK_DENSITY_THRESHOLD
            });
        }

        return bands;
    }

    /**
     * Find contiguous ink regions (merged adjacent ink bands)
     * @param {Array} bands - Array of band objects from detectVerticalInkBands
     * @returns {Array} - Array of ink regions { x, width }
     */
    function findInkRegions(bands) {
        const regions = [];
        let currentRegion = null;

        for (const band of bands) {
            if (band.isInk) {
                if (currentRegion) {
                    // Extend current region
                    currentRegion.width = (band.x + band.width) - currentRegion.x;
                } else {
                    // Start new region
                    currentRegion = { x: band.x, width: band.width };
                }
            } else {
                if (currentRegion) {
                    regions.push(currentRegion);
                    currentRegion = null;
                }
            }
        }

        // Don't forget last region
        if (currentRegion) {
            regions.push(currentRegion);
        }

        return regions;
    }

    // ════════════════════════════════════════════════════════════════════════
    // COLLISION DETECTION
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Estimate text bounds within the bbox
     * @param {string} text - The text being rendered
     * @param {number} fontSize - Font size in pixels
     * @param {Object} bbox - { width, height } of the field
     * @returns {Object} - { x, width } estimated text position
     */
    function estimateTextBounds(text, fontSize, bbox) {
        // Estimate character width (monospace approximation)
        const charWidth = fontSize * 0.6;
        const textWidth = text.length * charWidth;

        // Text is typically centered or left-aligned with padding
        // Assume centered for date fields
        const x = (bbox.width - textWidth) / 2;

        return {
            x: Math.max(0, x),
            width: Math.min(textWidth, bbox.width)
        };
    }

    /**
     * Check if text bounds collide with any ink regions
     * @param {Object} textBounds - { x, width } text position
     * @param {Array} inkRegions - Array of { x, width } ink regions
     * @param {number} margin - Extra margin around text for collision
     * @returns {boolean} - true if collision detected
     */
    function hasCollision(textBounds, inkRegions, margin = CONFIG.TEXT_MARGIN_PX) {
        const textLeft = textBounds.x - margin;
        const textRight = textBounds.x + textBounds.width + margin;

        for (const region of inkRegions) {
            const inkLeft = region.x;
            const inkRight = region.x + region.width;

            // Check overlap
            if (textLeft < inkRight && textRight > inkLeft) {
                // Calculate overlap amount
                const overlapStart = Math.max(textLeft, inkLeft);
                const overlapEnd = Math.min(textRight, inkRight);
                const overlapWidth = overlapEnd - overlapStart;
                const overlapRatio = overlapWidth / textBounds.width;

                if (overlapRatio > CONFIG.COLLISION_OVERLAP_THRESHOLD) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Shift text bounds by offset
     * @param {Object} textBounds - { x, width }
     * @param {number} offset - Horizontal offset in pixels
     * @returns {Object} - New bounds { x, width }
     */
    function shiftBounds(textBounds, offset) {
        return {
            x: textBounds.x + offset,
            width: textBounds.width
        };
    }

    /**
     * Scale text bounds (for font reduction)
     * @param {Object} textBounds - { x, width }
     * @param {number} scale - Scale factor (e.g., 0.9 for 90%)
     * @param {number} bboxWidth - Width of containing bbox
     * @returns {Object} - New bounds { x, width }
     */
    function scaleBounds(textBounds, scale, bboxWidth) {
        const newWidth = textBounds.width * scale;
        // Re-center after scaling
        const newX = (bboxWidth - newWidth) / 2;
        return {
            x: Math.max(0, newX),
            width: newWidth
        };
    }

    // ════════════════════════════════════════════════════════════════════════
    // MAIN API
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Compute horizontal adjustment to avoid scaffolding collision
     *
     * @param {Object} params
     * @param {Object} params.screenRect - { x, y, width, height } in screen coordinates
     * @param {number} params.fontSize - Font size in pixels
     * @param {string} params.text - The text to be rendered
     * @returns {Object} - { xOffset, fontScale, didAdjust, reason, debug }
     */
    function computeAdjustment(params) {
        // Default: no adjustment
        const NO_ADJUST = {
            xOffset: 0,
            fontScale: 1.0,
            didAdjust: false,
            reason: 'skipped',
            debug: null
        };

        // ═══════════════════════════════════════════════════
        // GATE 1: Feature flag
        // ═══════════════════════════════════════════════════
        if (!window.FEATURES?.SCAFFOLD_AVOIDANCE) {
            return { ...NO_ADJUST, reason: 'feature_disabled' };
        }

        // ═══════════════════════════════════════════════════
        // GATE 2: Valid params
        // ═══════════════════════════════════════════════════
        const rect = params.screenRect;
        if (!rect || !rect.width || !rect.height) {
            return { ...NO_ADJUST, reason: 'invalid_rect' };
        }

        // ═══════════════════════════════════════════════════
        // GATE 3: Text looks like structured numeric (dates, IDs, etc.)
        // Includes: 12/03/2026, 01-01-24, 1.1.25, 09022013, 123456789
        // ═══════════════════════════════════════════════════
        const looksLikeStructuredNumeric = /^[0-9./-]+$/.test(params.text);
        if (!looksLikeStructuredNumeric) {
            return { ...NO_ADJUST, reason: 'not_structured_numeric' };
        }

        // ═══════════════════════════════════════════════════
        // GATE 4: Get image data
        // ═══════════════════════════════════════════════════
        const imageData = getImageDataForBbox(rect);
        if (!imageData) {
            return { ...NO_ADJUST, reason: 'no_image_data' };
        }

        // ═══════════════════════════════════════════════════
        // DETECT: Find vertical ink bands (printed scaffolding)
        // ═══════════════════════════════════════════════════
        const bands = detectVerticalInkBands(imageData, rect);
        const inkRegions = findInkRegions(bands);

        if (inkRegions.length === 0) {
            return { ...NO_ADJUST, reason: 'no_ink_detected' };
        }

        // ═══════════════════════════════════════════════════
        // COLLISION CHECK: Does current position collide?
        // ═══════════════════════════════════════════════════
        const fontSize = params.fontSize || (rect.height * 0.65);
        const textBounds = estimateTextBounds(params.text, fontSize, rect);

        if (!hasCollision(textBounds, inkRegions)) {
            return { ...NO_ADJUST, reason: 'no_collision' };
        }

        // ═══════════════════════════════════════════════════
        // ATTEMPT 1: Horizontal offset
        // Try small X shifts to avoid collision
        // ═══════════════════════════════════════════════════
        for (const offset of CONFIG.OFFSET_CANDIDATES) {
            const shiftedBounds = shiftBounds(textBounds, offset);

            // Ensure shifted bounds stay within bbox
            if (shiftedBounds.x < 0 || shiftedBounds.x + shiftedBounds.width > rect.width) {
                continue;
            }

            if (!hasCollision(shiftedBounds, inkRegions)) {
                console.log(`[ScaffoldAvoidance] X offset: ${offset}px, ` +
                           `ink regions: ${inkRegions.length}`);
                return {
                    xOffset: offset,
                    fontScale: 1.0,
                    didAdjust: true,
                    reason: 'x_offset',
                    debug: {
                        inkRegions: inkRegions.length,
                        offset: offset,
                        textBounds: textBounds
                    }
                };
            }
        }

        // ═══════════════════════════════════════════════════
        // ATTEMPT 2: Font scale reduction
        // Try reducing font size slightly
        // ═══════════════════════════════════════════════════
        for (const scale of CONFIG.FONT_SCALE_STEPS) {
            const scaledBounds = scaleBounds(textBounds, scale, rect.width);

            if (!hasCollision(scaledBounds, inkRegions)) {
                console.log(`[ScaffoldAvoidance] Font scale: ${scale}, ` +
                           `ink regions: ${inkRegions.length}`);
                return {
                    xOffset: 0,
                    fontScale: scale,
                    didAdjust: true,
                    reason: 'font_scale',
                    debug: {
                        inkRegions: inkRegions.length,
                        scale: scale,
                        originalBounds: textBounds,
                        scaledBounds: scaledBounds
                    }
                };
            }

            // Also try offset + scale combination
            for (const offset of CONFIG.OFFSET_CANDIDATES.slice(0, 4)) { // Try first 4 offsets
                const shiftedScaledBounds = shiftBounds(scaledBounds, offset);

                if (shiftedScaledBounds.x < 0 ||
                    shiftedScaledBounds.x + shiftedScaledBounds.width > rect.width) {
                    continue;
                }

                if (!hasCollision(shiftedScaledBounds, inkRegions)) {
                    console.log(`[ScaffoldAvoidance] Font scale: ${scale} + offset: ${offset}px`);
                    return {
                        xOffset: offset,
                        fontScale: scale,
                        didAdjust: true,
                        reason: 'scale_and_offset',
                        debug: {
                            inkRegions: inkRegions.length,
                            scale: scale,
                            offset: offset
                        }
                    };
                }
            }
        }

        // ═══════════════════════════════════════════════════
        // FALLBACK: No safe solution found
        // Return original (no adjustment)
        // ═══════════════════════════════════════════════════
        console.log('[ScaffoldAvoidance] No safe horizontal solution found, using original');
        return {
            ...NO_ADJUST,
            reason: 'no_safe_solution',
            debug: {
                inkRegions: inkRegions.length,
                textBounds: textBounds,
                triedOffsets: CONFIG.OFFSET_CANDIDATES,
                triedScales: CONFIG.FONT_SCALE_STEPS
            }
        };
    }

    // ════════════════════════════════════════════════════════════════════════
    // STRUCTURED PLACEMENT (V2.1)
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Extract pure digits from text (removes separators)
     * @param {string} text - Input text (e.g., "09/09/2013" or "09092013")
     * @returns {string} - Pure digits only (e.g., "09092013")
     */
    function extractDigits(text) {
        return text.replace(/[^0-9]/g, '');
    }

    /**
     * Detect slots between ink regions
     * @param {Array} inkRegions - Array of { x, width } ink regions
     * @param {number} bboxWidth - Total width of the bbox
     * @returns {Array|null} - Array of slots { x, width } or null if invalid
     */
    function detectSlots(inkRegions, bboxWidth) {
        if (!inkRegions || inkRegions.length === 0) {
            return null;
        }

        // Sort ink regions by X position
        const sortedInk = [...inkRegions].sort((a, b) => a.x - b.x);

        const slots = [];

        // Slot 1: from bbox start to first ink region
        const firstSlotEnd = sortedInk[0].x;
        if (firstSlotEnd >= CONFIG.STRUCTURED_MIN_SLOT_WIDTH) {
            slots.push({
                x: 0,
                width: firstSlotEnd,
                innerX: CONFIG.STRUCTURED_SLOT_PADDING,
                innerWidth: firstSlotEnd - CONFIG.STRUCTURED_SLOT_PADDING * 2
            });
        }

        // Middle slots: between ink regions
        for (let i = 0; i < sortedInk.length - 1; i++) {
            const slotStart = sortedInk[i].x + sortedInk[i].width;
            const slotEnd = sortedInk[i + 1].x;
            const slotWidth = slotEnd - slotStart;

            if (slotWidth >= CONFIG.STRUCTURED_MIN_SLOT_WIDTH) {
                slots.push({
                    x: slotStart,
                    width: slotWidth,
                    innerX: slotStart + CONFIG.STRUCTURED_SLOT_PADDING,
                    innerWidth: slotWidth - CONFIG.STRUCTURED_SLOT_PADDING * 2
                });
            }
        }

        // Last slot: from last ink region to bbox end
        const lastInk = sortedInk[sortedInk.length - 1];
        const lastSlotStart = lastInk.x + lastInk.width;
        const lastSlotWidth = bboxWidth - lastSlotStart;
        if (lastSlotWidth >= CONFIG.STRUCTURED_MIN_SLOT_WIDTH) {
            slots.push({
                x: lastSlotStart,
                width: lastSlotWidth,
                innerX: lastSlotStart + CONFIG.STRUCTURED_SLOT_PADDING,
                innerWidth: lastSlotWidth - CONFIG.STRUCTURED_SLOT_PADDING * 2
            });
        }

        // CRITICAL: Ensure slots are sorted by X position (left → right in visual/PDF space)
        // This guarantees slot[0] is leftmost, slot[1] is next, etc.
        slots.sort((a, b) => a.x - b.x);

        return slots.length > 0 ? slots : null;
    }

    /**
     * Match text against known structured patterns
     * @param {string} digits - Pure digits
     * @param {number} slotCount - Number of detected slots
     * @returns {Object|null} - Matched pattern or null
     */
    function matchPattern(digits, slotCount) {
        for (const [key, pattern] of Object.entries(STRUCTURED_PATTERNS)) {
            if (pattern.digits === digits.length && pattern.slots === slotCount) {
                return { ...pattern, key };
            }
        }
        return null;
    }

    /**
     * Split digits into segments according to pattern
     * @param {string} digits - Pure digits (e.g., "09092013")
     * @param {Array} segmentLengths - Array of segment lengths (e.g., [2, 2, 4])
     * @returns {Array} - Array of segment strings (e.g., ["09", "09", "2013"])
     */
    function splitIntoSegments(digits, segmentLengths) {
        const segments = [];
        let pos = 0;
        for (const len of segmentLengths) {
            segments.push(digits.substring(pos, pos + len));
            pos += len;
        }
        return segments;
    }

    /**
     * Compute structured placement for date fields with printed slashes
     *
     * Simple logic:
     * - If 2 ink regions (slashes) detected AND 8 digits → DD/MM/YYYY
     * - Zone 1: before first slash → DD
     * - Zone 2: between slashes → MM
     * - Zone 3: after second slash → YYYY
     *
     * @param {Object} params
     * @param {Object} params.screenRect - { x, y, width, height } in screen coordinates
     * @param {number} params.fontSize - Font size in pixels
     * @param {string} params.text - The text to be rendered (e.g., "09092013" or "09/09/2013")
     * @returns {Object} - { mode: "structured"|"fallback", segments?, reason, debug }
     */
    function computeStructuredPlacement(params) {
        const FALLBACK = {
            mode: 'fallback',
            reason: 'not_applicable',
            debug: null
        };

        // ═══════════════════════════════════════════════════
        // GATE 1: Feature flag
        // ═══════════════════════════════════════════════════
        if (!window.FEATURES?.SCAFFOLD_AVOIDANCE) {
            return { ...FALLBACK, reason: 'feature_disabled' };
        }

        // ═══════════════════════════════════════════════════
        // GATE 2: Valid params
        // ═══════════════════════════════════════════════════
        const rect = params.screenRect;
        if (!rect || !rect.width || !rect.height) {
            return { ...FALLBACK, reason: 'invalid_rect' };
        }

        // ═══════════════════════════════════════════════════
        // GATE 3: Extract pure digits - must be exactly 8 for date
        // ═══════════════════════════════════════════════════
        const digits = extractDigits(params.text);
        if (!digits || digits.length !== 8) {
            return { ...FALLBACK, reason: 'not_8_digits', debug: { digits: digits?.length } };
        }

        // ═══════════════════════════════════════════════════
        // GATE 4: Get image data
        // ═══════════════════════════════════════════════════
        const imageData = getImageDataForBbox(rect);
        if (!imageData) {
            return { ...FALLBACK, reason: 'no_image_data' };
        }

        // ═══════════════════════════════════════════════════
        // DETECT: Find ink regions (slashes)
        // ═══════════════════════════════════════════════════
        const bands = detectVerticalInkBands(imageData, rect);
        const inkRegions = findInkRegions(bands);

        // Must have exactly 2 slashes for DD/MM/YYYY
        if (!inkRegions || inkRegions.length !== 2) {
            return {
                ...FALLBACK,
                reason: 'not_2_slashes',
                debug: { inkRegions: inkRegions?.length || 0 }
            };
        }

        // ═══════════════════════════════════════════════════
        // COMPUTE: Sort slashes left→right, build zones
        // ═══════════════════════════════════════════════════
        const sortedSlashes = [...inkRegions].sort((a, b) => a.x - b.x);
        const slash1 = sortedSlashes[0];  // First slash (after DD)
        const slash2 = sortedSlashes[1];  // Second slash (after MM)

        // Define zones:
        // Zone 1: 0 → slash1.x (for DD)
        // Zone 2: slash1.x + slash1.width → slash2.x (for MM)
        // Zone 3: slash2.x + slash2.width → rect.width (for YYYY)
        const zone1 = { start: 0, end: slash1.x };
        const zone2 = { start: slash1.x + slash1.width, end: slash2.x };
        const zone3 = { start: slash2.x + slash2.width, end: rect.width };

        console.debug('[StructuredPlacement] slashes at:', slash1.x, slash2.x);
        console.debug('[StructuredPlacement] zones:', zone1, zone2, zone3);

        // ═══════════════════════════════════════════════════
        // SPLIT: DD (2), MM (2), YYYY (4)
        // ═══════════════════════════════════════════════════
        const dd = digits.substring(0, 2);
        const mm = digits.substring(2, 4);
        const yyyy = digits.substring(4, 8);

        const fontSize = params.fontSize || (rect.height * 0.65);
        const charWidth = fontSize * 0.6;

        // ═══════════════════════════════════════════════════
        // PLACE: Center each segment in its zone
        // ═══════════════════════════════════════════════════
        const segments = [];

        // DD in zone 1
        const ddWidth = 2 * charWidth;
        const ddX = zone1.start + (zone1.end - zone1.start - ddWidth) / 2;
        segments.push({ text: dd, x: Math.max(0, ddX), width: ddWidth });

        // MM in zone 2
        const mmWidth = 2 * charWidth;
        const mmX = zone2.start + (zone2.end - zone2.start - mmWidth) / 2;
        segments.push({ text: mm, x: mmX, width: mmWidth });

        // YYYY in zone 3
        const yyyyWidth = 4 * charWidth;
        const yyyyX = zone3.start + (zone3.end - zone3.start - yyyyWidth) / 2;
        segments.push({ text: yyyy, x: yyyyX, width: yyyyWidth });

        console.debug('[StructuredPlacement] segments:', segments.map(s => ({ text: s.text, x: s.x.toFixed(1) })));
        console.log(`[ScaffoldAvoidance] Structured placement: DD/MM/YYYY → ${dd}/${mm}/${yyyy}`);

        return {
            mode: 'structured',
            segments: segments,
            pattern: 'DD/MM/YYYY',
            fontSize: fontSize,
            reason: 'structured_match',
            debug: {
                slashes: [slash1.x, slash2.x],
                zones: [zone1, zone2, zone3],
                digits: digits
            }
        };
    }

    // ════════════════════════════════════════════════════════════════════════
    // EXPORT
    // ════════════════════════════════════════════════════════════════════════

    window.ScaffoldAvoidance = {
        computeAdjustment,
        computeStructuredPlacement,

        // Expose for debugging/testing
        CONFIG,
        STRUCTURED_PATTERNS,
        getImageDataForBbox,
        detectVerticalInkBands,
        findInkRegions,
        detectSlots,
        estimateTextBounds,
        hasCollision,
        extractDigits,
        matchPattern,
        splitIntoSegments
    };

    console.log('%c[ScaffoldAvoidance] v2.1 - Structured placement for dates ready',
        'background: #9C27B0; color: white; padding: 3px 8px; border-radius: 3px;');

})();
