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
 * @version 2.0.0
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
        MIN_BBOX_WIDTH: 20               // Minimum bbox width to attempt detection
    };

    // ════════════════════════════════════════════════════════════════════════
    // PIXEL ANALYSIS
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Get ImageData for a bbox region from the PDF canvas
     * @param {Object} screenRect - { x, y, width, height } in screen coordinates
     * @returns {ImageData|null} - ImageData for the region, or null if unavailable
     */
    function getImageDataForBbox(screenRect) {
        if (!screenRect || screenRect.width < CONFIG.MIN_BBOX_WIDTH ||
            screenRect.height < CONFIG.MIN_BBOX_HEIGHT) {
            return null;
        }

        // PDF.js renders to canvas
        const pdfCanvas = document.querySelector('#pdf-container canvas') ||
                          document.querySelector('.pdf-canvas') ||
                          document.querySelector('canvas[id*="pdf"]');

        if (!pdfCanvas) {
            return null;
        }

        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = Math.ceil(screenRect.width);
            tempCanvas.height = Math.ceil(screenRect.height);
            const ctx = tempCanvas.getContext('2d');

            ctx.drawImage(
                pdfCanvas,
                Math.floor(screenRect.x), Math.floor(screenRect.y),
                Math.ceil(screenRect.width), Math.ceil(screenRect.height),
                0, 0,
                tempCanvas.width, tempCanvas.height
            );

            return ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
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
    // EXPORT
    // ════════════════════════════════════════════════════════════════════════

    window.ScaffoldAvoidance = {
        computeAdjustment,

        // Expose for debugging/testing
        CONFIG,
        getImageDataForBbox,
        detectVerticalInkBands,
        findInkRegions,
        estimateTextBounds,
        hasCollision
    };

    console.log('%c[ScaffoldAvoidance] v2.0 - Horizontal-only scaffold avoidance ready',
        'background: #9C27B0; color: white; padding: 3px 8px; border-radius: 3px;');

})();
