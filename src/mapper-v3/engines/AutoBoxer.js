/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║              AUTOBOXER - PIXEL-BASED PHYSICS ENGINE                        ║
 * ║                      VERSION 1.0.0 - STABLE                                ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  WARNING: THIS MODULE IS PROTECTED - DO NOT MODIFY WITHOUT REVIEW!         ║
 * ║                                                                            ║
 * ║  Last stable update: 2026-01-04                                            ║
 * ║  Tested with: Hebrew PDF forms (101, 106, mipuy)                           ║
 * ║  Dependencies: PDFEngine, TextExtractor, RefinerConfig                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ARCHITECTURE:
 * - Operates EXCLUSIVELY on rendered pixels (300 DPI canvas)
 * - Does NOT parse PDF structure, paths, or strokes
 * - Does NOT use text boxes or semantic information
 * - Behaves like a human eye looking at a printed page
 *
 * THE WORLD MODEL:
 * - Ink pixels (dark)
 * - White pixels (empty)
 * - Nothing else exists
 *
 * PHYSICS RULES:
 * 1. Floor: Horizontal ink pattern below click (MANDATORY - no floor = no field)
 * 2. Wall: Vertical ink pattern that stops horizontal expansion
 * 3. Ceiling: Horizontal ink pattern that stops vertical expansion
 * 4. First-Hit Logic: First physical entity hit is the boundary
 * 5. Continuity Law: Vertical line is wall ONLY if isolated (not part of sequence)
 * 6. Gap Tolerance: Small gaps in floor are ignored
 *
 * INPUT:  Click point (x, y) in screen coordinates
 * OUTPUT: Computed bbox { x, y, width, height } in screen coordinates, or null if no floor
 */

import { pdfEngine } from './PDFEngine.js';
import { textExtractor } from './TextExtractor.js';
import { AUTOBOXER_CONFIG, REFINER_VERSION } from './RefinerConfig.js';

// ═══════════════════════════════════════════════════════════════════════════
// MODULE VERSION - Must match RefinerConfig version
// ═══════════════════════════════════════════════════════════════════════════
const MODULE_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - Imported from RefinerConfig.js (DO NOT MODIFY HERE!)
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = AUTOBOXER_CONFIG;

export class AutoBoxer {
    constructor() {
        this._pixelCanvas = null;
        this._pixelContext = null;
        this._pixelData = null;
        this._canvasWidth = 0;
        this._canvasHeight = 0;
        this._currentPage = null;
        this._scale = 1;  // Scale from screen to canvas pixels
        this._wordBboxes = null;  // Cache of word bboxes in screen coordinates
        this._wordBboxPage = null;
    }

    /**
     * Main API: Compute bbox from a single click point
     * Returns null if no valid floor is found (mandatory rule)
     *
     * @param {number} clickX - Click X in screen pixels
     * @param {number} clickY - Click Y in screen pixels
     * @returns {Promise<Object|null>} { x, y, width, height } in screen pixels, or null
     */
    async computeBbox(clickX, clickY) {
        console.log(`[AutoBoxer] Computing bbox at click (${clickX}, ${clickY})`);

        // Load pixel data for current page
        const loaded = await this._loadPixelData();
        if (!loaded) {
            console.warn('[AutoBoxer] Failed to load pixel data');
            return null;
        }

        // Load word bboxes for text obstacle detection
        await this._loadWordBboxes();

        // Convert screen coordinates to canvas coordinates
        const canvasX = Math.round(clickX * this._scale);
        const canvasY = Math.round(clickY * this._scale);

        console.log(`[AutoBoxer] Canvas coords: (${canvasX}, ${canvasY}), scale: ${this._scale}`);

        // Step 1: Find floor (MANDATORY)
        const floor = this._findFloor(canvasX, canvasY);
        if (!floor) {
            console.log('[AutoBoxer] ❌ No floor found - cannot create field');
            return null;  // No floor = no field (mandatory rule)
        }
        console.log(`[AutoBoxer] ✓ Floor found at Y=${floor.y}, length=${floor.length}`);

        const floorY = floor.y;

        // Step 2: Find left wall (First-Hit on floor level)
        // Pass canvasX for dead zone check (no text walls within MIN_INNER_MARGIN of click)
        const leftWall = this._findLeftWall(canvasX, floorY, canvasX);
        let leftX = leftWall ? leftWall.x : Math.max(0, canvasX - CONFIG.DEFAULT_WIDTH * this._scale / 2);
        console.log(`[AutoBoxer] Left wall: ${leftWall ? `found at X=${leftWall.x}` : 'not found, using default'}`);

        // Step 3: Find right wall (First-Hit on floor level)
        const rightWall = this._findRightWall(canvasX, floorY, canvasX);
        let rightX = rightWall ? rightWall.x : Math.min(this._canvasWidth, canvasX + CONFIG.DEFAULT_WIDTH * this._scale / 2);
        console.log(`[AutoBoxer] Right wall: ${rightWall ? `found at X=${rightWall.x}` : 'not found, using default'}`);

        // Step 3.5: Apply MAX_WIDTH constraint
        // If walls are too far apart (like a long floor line), use DEFAULT_WIDTH
        const maxWidth = CONFIG.MAX_WIDTH * this._scale;
        let computedWidth = rightX - leftX;

        if (computedWidth > maxWidth) {
            console.log(`[AutoBoxer] Width ${Math.round(computedWidth)} exceeds MAX_WIDTH ${Math.round(maxWidth)}, using default centered on click`);
            leftX = canvasX - CONFIG.DEFAULT_WIDTH * this._scale / 2;
            rightX = canvasX + CONFIG.DEFAULT_WIDTH * this._scale / 2;
            computedWidth = rightX - leftX;
        }

        // Step 4: Find ceiling (between walls, going up from floor)
        const ceiling = this._findCeiling(leftX, rightX, floorY);
        const topY = ceiling ? ceiling.y : Math.max(0, floorY - CONFIG.DEFAULT_HEIGHT * this._scale);
        console.log(`[AutoBoxer] Ceiling: ${ceiling ? `found at Y=${ceiling.y}` : 'not found, using default'}`);

        // Calculate bbox in canvas coordinates
        let width = rightX - leftX;
        let height = floorY - topY;

        // Apply minimum constraints (in canvas pixels)
        const minWidth = CONFIG.MIN_WIDTH * this._scale;
        const minHeight = CONFIG.MIN_HEIGHT * this._scale;

        if (width < minWidth) {
            const diff = minWidth - width;
            leftX -= diff / 2;
            width = minWidth;
        }
        if (height < minHeight) {
            height = minHeight;
        }

        // Convert back to screen coordinates
        const bbox = {
            x: Math.round(leftX / this._scale),
            y: Math.round(topY / this._scale),
            width: Math.round(width / this._scale),
            height: Math.round(height / this._scale)
        };

        // Ensure within screen bounds
        const layerWidth = this._getLayerWidth();
        const layerHeight = this._getLayerHeight();
        bbox.x = Math.max(0, Math.min(bbox.x, layerWidth - bbox.width));
        bbox.y = Math.max(0, Math.min(bbox.y, layerHeight - bbox.height));

        console.log('[AutoBoxer] ✓ Computed bbox:', bbox);
        return bbox;
    }

    // ============ PIXEL DATA LOADING ============

    /**
     * Load pixel data from the rendered PDF page
     * Creates a canvas and extracts ImageData for pixel scanning
     */
    async _loadPixelData() {
        const currentPage = pdfEngine.currentPage;

        // Use cache if same page
        if (this._pixelData && this._currentPage === currentPage) {
            return true;
        }

        // Get the rendered image element
        const imgElement = document.querySelector('#pdf-container img');
        if (!imgElement || !imgElement.complete) {
            console.warn('[AutoBoxer] PDF image not ready');
            return false;
        }

        // Get display dimensions
        const displayWidth = imgElement.width || imgElement.naturalWidth;
        const displayHeight = imgElement.height || imgElement.naturalHeight;

        if (!displayWidth || !displayHeight) {
            console.warn('[AutoBoxer] Invalid image dimensions');
            return false;
        }

        // Calculate scale (canvas might be higher resolution than display)
        // Use natural dimensions for pixel accuracy
        this._canvasWidth = imgElement.naturalWidth;
        this._canvasHeight = imgElement.naturalHeight;
        this._scale = this._canvasWidth / displayWidth;

        // Create canvas for pixel access
        if (!this._pixelCanvas) {
            this._pixelCanvas = document.createElement('canvas');
            this._pixelContext = this._pixelCanvas.getContext('2d', { willReadFrequently: true });
        }

        this._pixelCanvas.width = this._canvasWidth;
        this._pixelCanvas.height = this._canvasHeight;

        // Draw image to canvas
        this._pixelContext.drawImage(imgElement, 0, 0);

        // Extract pixel data
        this._pixelData = this._pixelContext.getImageData(0, 0, this._canvasWidth, this._canvasHeight);
        this._currentPage = currentPage;

        console.log(`[AutoBoxer] Loaded pixel data: ${this._canvasWidth}x${this._canvasHeight}, scale=${this._scale.toFixed(2)}`);
        return true;
    }

    // ============ PIXEL ACCESS ============

    /**
     * Check if a pixel is "ink" (dark enough)
     * @param {number} x - Canvas X coordinate
     * @param {number} y - Canvas Y coordinate
     * @returns {boolean} True if pixel is ink
     */
    _isInk(x, y) {
        if (x < 0 || x >= this._canvasWidth || y < 0 || y >= this._canvasHeight) {
            return false;
        }

        const idx = (y * this._canvasWidth + x) * 4;
        const r = this._pixelData.data[idx];
        const g = this._pixelData.data[idx + 1];
        const b = this._pixelData.data[idx + 2];

        // Convert to grayscale and check threshold
        const gray = (r + g + b) / 3;
        return gray < CONFIG.INK_THRESHOLD;
    }

    /**
     * Count ink pixels in a horizontal line segment
     * @param {number} y - Y coordinate
     * @param {number} x1 - Start X
     * @param {number} x2 - End X
     * @returns {number} Count of ink pixels
     */
    _countHorizontalInk(y, x1, x2) {
        let count = 0;
        for (let x = x1; x <= x2; x++) {
            if (this._isInk(x, y)) count++;
        }
        return count;
    }

    /**
     * Count ink pixels in a vertical line segment
     * @param {number} x - X coordinate
     * @param {number} y1 - Start Y
     * @param {number} y2 - End Y
     * @returns {number} Count of ink pixels
     */
    _countVerticalInk(x, y1, y2) {
        let count = 0;
        for (let y = y1; y <= y2; y++) {
            if (this._isInk(x, y)) count++;
        }
        return count;
    }

    // ============ FLOOR DETECTION ============

    /**
     * Find floor below click point
     * Scans downward looking for horizontal ink pattern
     * Implements Gap Tolerance
     *
     * @param {number} startX - Canvas X
     * @param {number} startY - Canvas Y
     * @returns {Object|null} { y, length } or null if no floor
     */
    _findFloor(startX, startY) {
        const maxSearch = CONFIG.MAX_SEARCH_DOWN * this._scale;
        const minLength = CONFIG.MIN_FLOOR_LENGTH * this._scale;
        const gapTolerance = CONFIG.FLOOR_GAP_TOLERANCE * this._scale;

        // Scan downward from click point
        for (let dy = 0; dy < maxSearch; dy++) {
            const y = Math.round(startY + dy);
            if (y >= this._canvasHeight) break;

            // Check for horizontal ink pattern at this Y
            const floorInfo = this._detectHorizontalLine(y, startX, minLength, gapTolerance);
            if (floorInfo) {
                return { y, length: floorInfo.length };
            }
        }

        return null;
    }

    /**
     * Detect a horizontal line at given Y, centered around X
     * Implements Gap Tolerance
     */
    _detectHorizontalLine(y, centerX, minLength, gapTolerance) {
        let leftExtent = centerX;
        let rightExtent = centerX;
        let gapCount = 0;
        let totalInk = 0;

        // Scan left
        for (let x = centerX; x >= 0; x--) {
            if (this._isInk(x, y)) {
                leftExtent = x;
                gapCount = 0;
                totalInk++;
            } else {
                gapCount++;
                if (gapCount > gapTolerance) break;
            }
        }

        // Reset gap counter
        gapCount = 0;

        // Scan right
        for (let x = centerX; x < this._canvasWidth; x++) {
            if (this._isInk(x, y)) {
                rightExtent = x;
                gapCount = 0;
                totalInk++;
            } else {
                gapCount++;
                if (gapCount > gapTolerance) break;
            }
        }

        const length = rightExtent - leftExtent;
        if (length >= minLength && totalInk >= minLength * 0.3) {
            return { leftExtent, rightExtent, length, totalInk };
        }

        return null;
    }

    // ============ WALL DETECTION ============

    /**
     * Find left wall using First-Hit Logic
     * Scans leftward on floor level looking for:
     * 1. Vertical line patterns (subject to Continuity Law)
     * 2. Text obstacles (ALWAYS a wall, no continuity check)
     *
     * @param {number} startX - Start X in canvas coordinates
     * @param {number} floorY - Floor Y in canvas coordinates
     * @param {number} clickX - Original click X in canvas coordinates (for dead zone)
     */
    _findLeftWall(startX, floorY, clickX) {
        const maxSearch = CONFIG.MAX_SEARCH_LEFT * this._scale;
        const minHeight = CONFIG.MIN_WALL_HEIGHT * this._scale;
        const deadZone = CONFIG.MIN_INNER_MARGIN * this._scale;

        // Scan leftward from start
        for (let dx = 5; dx < maxSearch; dx++) {
            const x = Math.round(startX - dx);
            if (x < 0) break;

            // Check for vertical LINE pattern at this X
            if (this._isVerticalWall(x, floorY, minHeight)) {
                // Apply Continuity Law: is this line isolated?
                if (this._isIsolatedVerticalLine(x, floorY, minHeight)) {
                    console.log(`[AutoBoxer] Left wall: isolated vertical line at X=${x}`);
                    return { x };
                }
                // Line is part of a sequence (like date separators) - skip it
                continue;
            }

            // Check for TEXT obstacle (requires robust detection)
            // Skip if within dead zone near click point
            const distanceFromClick = Math.abs(x - clickX);
            if (distanceFromClick < deadZone) {
                continue;  // Too close to click - ignore small marks
            }

            // Text is ALWAYS a wall - NO continuity check
            if (this._isTextObstacle(x, floorY)) {
                console.log(`[AutoBoxer] Left wall: text obstacle at X=${x} (dist=${Math.round(distanceFromClick)})`);
                return { x };
            }
        }

        return null;
    }

    /**
     * Find right wall using First-Hit Logic
     * Scans rightward on floor level looking for:
     * 1. Vertical line patterns (subject to Continuity Law)
     * 2. Text obstacles (ALWAYS a wall, no continuity check)
     *
     * @param {number} startX - Start X in canvas coordinates
     * @param {number} floorY - Floor Y in canvas coordinates
     * @param {number} clickX - Original click X in canvas coordinates (for dead zone)
     */
    _findRightWall(startX, floorY, clickX) {
        const maxSearch = CONFIG.MAX_SEARCH_RIGHT * this._scale;
        const minHeight = CONFIG.MIN_WALL_HEIGHT * this._scale;
        const deadZone = CONFIG.MIN_INNER_MARGIN * this._scale;

        // Scan rightward from start
        for (let dx = 5; dx < maxSearch; dx++) {
            const x = Math.round(startX + dx);
            if (x >= this._canvasWidth) break;

            // Check for vertical LINE pattern at this X
            if (this._isVerticalWall(x, floorY, minHeight)) {
                // Apply Continuity Law: is this line isolated?
                if (this._isIsolatedVerticalLine(x, floorY, minHeight)) {
                    console.log(`[AutoBoxer] Right wall: isolated vertical line at X=${x}`);
                    return { x };
                }
                // Line is part of a sequence - skip it
                continue;
            }

            // Check for TEXT obstacle (requires robust detection)
            // Skip if within dead zone near click point
            const distanceFromClick = Math.abs(x - clickX);
            if (distanceFromClick < deadZone) {
                continue;  // Too close to click - ignore small marks
            }

            // Text is ALWAYS a wall - NO continuity check
            if (this._isTextObstacle(x, floorY)) {
                console.log(`[AutoBoxer] Right wall: text obstacle at X=${x} (dist=${Math.round(distanceFromClick)})`);
                return { x };
            }
        }

        return null;
    }

    /**
     * Check if there's a vertical line at X near floorY
     */
    _isVerticalWall(x, floorY, minHeight) {
        const searchUp = Math.round(minHeight * 1.5);
        let inkCount = 0;

        for (let dy = -searchUp; dy <= 0; dy++) {
            const y = floorY + dy;
            if (this._isInk(x, y)) inkCount++;
        }

        return inkCount >= minHeight * 0.7;
    }

    /**
     * SPATIAL PHYSICS: Determine if a vertical line is a true wall
     *
     * A vertical line is a wall ONLY if it separates two physically different fill regions.
     * The line itself is NEVER the deciding factor - only its spatial effect matters.
     *
     * CRITICAL RULE:
     * - Lines in a sequence (has neighbors) = SKIP (step over)
     * - Even the LAST line in a sequence (has neighbors only on one side) = SKIP
     * - Only truly ISOLATED lines (no neighbors at all) OR structural boundaries = WALL
     *
     * A line is a WALL only if:
     * 1. It's completely isolated (no similar lines on either side), OR
     * 2. It has significantly different spatial properties (ceiling height, free run)
     */
    _isIsolatedVerticalLine(x, floorY, minHeight) {
        const probeDistance = CONFIG.CONTINUITY_PROBE_DISTANCE * this._scale;

        // ============ CHECK 0: IS THIS A TALL STRUCTURAL LINE? ============
        // Table borders are TALL (extend above the field area into headers)
        // Kakakim (digit separators) are SHORT (only within the input row)
        // If the line is much taller than minHeight, it's a structural wall!
        const lineHeight = this._measureLineHeight(x, floorY);
        const structuralThreshold = minHeight * 3;  // Structural lines are 3x+ taller

        if (lineHeight > structuralThreshold) {
            console.log(`[AutoBoxer] STRUCTURAL WALL at X=${x} (height=${lineHeight.toFixed(0)} > ${structuralThreshold.toFixed(0)}) → WALL`);
            return true;  // Tall structural line = always a wall, regardless of neighbors
        }

        // ============ CHECK 1: FIND SIMILAR LINES ============
        // Use smaller step size to not miss thin lines
        // CRITICAL: Use a REDUCED height threshold for neighbor detection!
        // Kakakim (digit separators) are often shorter than full walls
        // We want to detect them as neighbors even if they're too short to be standalone walls
        const kakakMinHeight = Math.max(6 * this._scale, minHeight * 0.4);  // Kakakim can be shorter

        let leftSimilarCount = 0;
        let rightSimilarCount = 0;
        let leftSimilarDist = 0;
        let rightSimilarDist = 0;

        // Probe left for similar lines (count how many)
        // Use step size of 2 to catch thin lines
        for (let dx = 6; dx <= probeDistance; dx += 2) {
            if (this._isVerticalWall(x - dx, floorY, kakakMinHeight)) {
                leftSimilarCount++;
                if (leftSimilarDist === 0) leftSimilarDist = dx;
                dx += 6;  // Skip a bit after finding a line to avoid double-counting
            }
        }

        // Probe right for similar lines (count how many)
        for (let dx = 6; dx <= probeDistance; dx += 2) {
            if (this._isVerticalWall(x + dx, floorY, kakakMinHeight)) {
                rightSimilarCount++;
                if (rightSimilarDist === 0) rightSimilarDist = dx;
                dx += 6;  // Skip a bit after finding a line
            }
        }

        const hasLeftNeighbor = leftSimilarCount > 0;
        const hasRightNeighbor = rightSimilarCount > 0;
        const isPartOfSequence = hasLeftNeighbor || hasRightNeighbor;
        const totalNeighbors = leftSimilarCount + rightSimilarCount;

        console.log(`[AutoBoxer] Line X=${x}: kakakMinHeight=${kakakMinHeight.toFixed(0)}, neighbors L=${leftSimilarCount} R=${rightSimilarCount}`);

        // ============ CHECK 2: SPATIAL PROPERTIES ============
        // Measure free run (white space) on each side
        const leftFreeRun = this._measureFreeRun(x, floorY, -1);
        const rightFreeRun = this._measureFreeRun(x, floorY, 1);
        const freeRunRatio = Math.max(leftFreeRun, rightFreeRun) / (Math.min(leftFreeRun, rightFreeRun) + 1);

        // Measure ceiling height on each side
        const leftCeiling = this._measureCeilingHeight(x - 15, floorY);
        const rightCeiling = this._measureCeilingHeight(x + 15, floorY);
        const ceilingDiff = Math.abs(leftCeiling - rightCeiling);

        // ============ DECISION LOGIC ============

        // RULE 1: If has kakakim (sequence lines) on EITHER side = SKIP
        // This includes:
        // - Lines deep in sequence (kakakim on both sides)
        // - Lines at edge of sequence (kakakim on one side only)
        // - Small black separator lines between kakakim sections (month/year dividers)
        //
        // The logic: ANY line that has kakakim nearby is part of the field area
        if (isPartOfSequence) {
            // Check if this might be the REAL structural wall (table border)
            // Real walls have STRONG spatial asymmetry AND are at the very edge
            const isVeryStrongAsymmetry = freeRunRatio > 8.0 && ceilingDiff > 40 * this._scale;

            // Also check: if one side has many kakakim and other has none, might be edge
            const isAtEdgeOfField = (leftSimilarCount >= 3 && rightSimilarCount === 0) ||
                                     (rightSimilarCount >= 3 && leftSimilarCount === 0);

            if (isVeryStrongAsymmetry && isAtEdgeOfField) {
                console.log(`[AutoBoxer] TRUE WALL at X=${x} (edge of field, strong asymmetry) → WALL`);
                return true;
            }

            // Otherwise: has kakakim nearby = part of field area = SKIP
            console.log(`[AutoBoxer] Continuity: Line at X=${x} near kakakim (L=${leftSimilarCount}, R=${rightSimilarCount}) → SKIP`);
            return false;
        }

        // RULE 2: No kakakim on either side = truly isolated = check spatial properties
        // This could be a real table border or a standalone separator
        const hasModerateAsymmetry = freeRunRatio > 3.0 || ceilingDiff > 20 * this._scale;

        if (hasModerateAsymmetry) {
            console.log(`[AutoBoxer] Isolated line at X=${x} with spatial break → WALL`);
            return true;
        }

        // Isolated but no spatial difference - still a wall (standalone vertical line)
        console.log(`[AutoBoxer] Isolated line at X=${x} → WALL`);
        return true;
    }

    /**
     * Measure the total height of a vertical line (how far it extends up and down)
     * Structural walls (table borders) are TALL - they span multiple rows
     * Kakakim (digit separators) are SHORT - they only exist within the input row
     *
     * @param {number} x - X position of the line
     * @param {number} floorY - Floor Y level
     * @returns {number} Total height of the line in pixels
     */
    _measureLineHeight(x, floorY) {
        let topExtent = floorY;
        let bottomExtent = floorY;
        const maxSearch = 150 * this._scale;  // Search up to 150px in each direction

        // Measure upward extent
        for (let dy = 1; dy < maxSearch; dy++) {
            const y = floorY - dy;
            if (y < 0) break;
            if (this._isInk(x, y)) {
                topExtent = y;
            } else {
                // Allow small gaps (1-2 pixels)
                if (!this._isInk(x, y - 1) && !this._isInk(x, y - 2)) {
                    break;
                }
            }
        }

        // Measure downward extent
        for (let dy = 1; dy < maxSearch; dy++) {
            const y = floorY + dy;
            if (y >= this._canvasHeight) break;
            if (this._isInk(x, y)) {
                bottomExtent = y;
            } else {
                // Allow small gaps
                if (!this._isInk(x, y + 1) && !this._isInk(x, y + 2)) {
                    break;
                }
            }
        }

        return bottomExtent - topExtent;
    }

    /**
     * Measure horizontal free run (continuous white pixels) from a point
     * @param {number} startX - Starting X position
     * @param {number} floorY - Floor Y level
     * @param {number} direction - -1 for left, +1 for right
     * @returns {number} Length of free run in pixels
     */
    _measureFreeRun(startX, floorY, direction) {
        const maxRun = 100 * this._scale;
        const sampleY = floorY - (CONFIG.DEFAULT_HEIGHT * this._scale * 0.5);  // Middle of field height
        let freeRun = 0;

        for (let dx = 5; dx < maxRun; dx++) {
            const x = startX + (dx * direction);
            if (x < 0 || x >= this._canvasWidth) break;

            if (this._isInk(x, sampleY)) {
                break;  // Hit ink, stop counting
            }
            freeRun = dx;
        }

        return freeRun;
    }

    /**
     * Measure ceiling height (distance from floor to first ink above)
     * @param {number} x - X position to check
     * @param {number} floorY - Floor Y level
     * @returns {number} Distance to ceiling in pixels
     */
    _measureCeilingHeight(x, floorY) {
        const maxSearch = CONFIG.MAX_SEARCH_UP * this._scale;

        for (let dy = 5; dy < maxSearch; dy++) {
            const y = floorY - dy;
            if (y < 0) return maxSearch;

            if (this._isInk(x, y)) {
                return dy;
            }
        }

        return maxSearch;  // No ceiling found
    }

    /**
     * Check if there's a TEXT obstacle at column X
     * Text is ALWAYS a wall - Continuity Law does NOT apply to text
     *
     * CRITICAL: Only text at INPUT level counts as a wall.
     * Labels ABOVE the field (which have horizontal X overlap) must NOT be walls.
     *
     * Uses two-tier detection:
     * 1. Word bbox intersection (preferred - if word bboxes available)
     * 2. Pixel-based blob detection (fallback - requires ink density, not single pixels)
     *
     * @param {number} x - Canvas X coordinate
     * @param {number} floorY - Floor Y coordinate
     * @returns {boolean} True if text obstacle exists at this column
     */
    _isTextObstacle(x, floorY) {
        // Convert to screen coordinates for word bbox check
        const screenX = x / this._scale;
        const screenFloorY = floorY / this._scale;

        // METHOD 1: Check word bboxes (preferred)
        if (this._wordBboxes && this._wordBboxes.length > 0) {
            const padding = CONFIG.TEXT_PADDING;

            // CRITICAL: For WALL detection, only consider text at INPUT level
            // This is text whose baseline (bottom) is close to the floor line
            // Labels ABOVE the field have word.bottom much higher than floor
            // Adjacent text (walls) have word.bottom near floor
            const maxDistanceFromFloor = 20;  // Max distance from floor to be "at input level"

            for (const word of this._wordBboxes) {
                // Check horizontal: does this word's X range include our scan position?
                if (screenX >= word.x - padding && screenX <= word.right + padding) {
                    // Check vertical: is this word at INPUT level (same row), not LABEL level (above)?
                    // Word baseline (bottom) should be close to floor baseline
                    const distFromFloor = screenFloorY - word.bottom;

                    // distFromFloor > 0 means word is above floor (normal)
                    // distFromFloor < 0 means word is below floor (unlikely)
                    // We want words where: -padding <= distFromFloor <= maxDistanceFromFloor
                    if (distFromFloor >= -padding && distFromFloor <= maxDistanceFromFloor) {
                        return true;  // Text at input level = wall
                    }
                    // Else: word is a label above the field, not a wall
                }
            }
            return false;  // No word bbox at input level
        }

        // METHOD 2: Pixel-based blob detection (fallback)
        // Requires minimum ink density in a sample area, not just single pixels
        return this._hasInkBlob(x, floorY);
    }

    /**
     * Pixel-based text detection fallback
     * Requires a minimum ink "blob" - not just single pixels or thin lines
     *
     * @param {number} x - Canvas X coordinate
     * @param {number} floorY - Floor Y coordinate
     * @returns {boolean} True if ink blob exists at this column
     */
    _hasInkBlob(x, floorY) {
        const sampleHeight = CONFIG.DEFAULT_HEIGHT * this._scale;
        const blobWidth = CONFIG.MIN_TEXT_BLOB_WIDTH * this._scale;
        const minDensity = CONFIG.MIN_TEXT_INK_DENSITY;

        // Sample a rectangular area around the position
        const halfWidth = Math.round(blobWidth / 2);
        const sampleRows = 5;
        let totalPixels = 0;
        let inkPixels = 0;

        for (let i = 0; i < sampleRows; i++) {
            const y = Math.round(floorY - (sampleHeight * i / (sampleRows - 1)));

            for (let dx = -halfWidth; dx <= halfWidth; dx++) {
                totalPixels++;
                if (this._isInk(x + dx, y)) {
                    inkPixels++;
                }
            }
        }

        // Require minimum ink density to be considered "text"
        const density = inkPixels / totalPixels;
        return density >= minDensity;
    }

    /**
     * Load word bounding boxes from TextExtractor cache
     * Converts PDF coordinates to screen coordinates
     */
    async _loadWordBboxes() {
        const currentPage = pdfEngine.currentPage;

        // Use cache if same page
        if (this._wordBboxes && this._wordBboxPage === currentPage) {
            return;
        }

        this._wordBboxes = [];
        this._wordBboxPage = currentPage;

        try {
            // Try to get text content from cache first, or load directly from PDF
            let textContent = textExtractor.pageTextCache?.get(currentPage);

            if (!textContent || !textContent.items) {
                // Load text content directly from PDF
                const pdfDoc = pdfEngine.pdfDocument;
                if (!pdfDoc) {
                    console.log('[AutoBoxer] No PDF document available');
                    return;
                }

                const page = await pdfDoc.getPage(currentPage);
                textContent = await page.getTextContent();

                // Cache it for future use
                if (textExtractor.pageTextCache) {
                    textExtractor.pageTextCache.set(currentPage, textContent);
                }

                console.log(`[AutoBoxer] Loaded text content directly: ${textContent.items?.length || 0} items`);
            }

            if (!textContent || !textContent.items) {
                console.log('[AutoBoxer] No text content available');
                return;
            }

            const pdfDoc = pdfEngine.pdfDocument;
            if (!pdfDoc) return;

            const page = await pdfDoc.getPage(currentPage);
            const viewport = page.getViewport({ scale: 1.0 });
            const pdfHeight = viewport.height;
            const pdfWidth = viewport.width;

            // Get screen dimensions
            const layerWidth = this._getLayerWidth();
            const layerHeight = this._getLayerHeight();
            if (!layerWidth || !layerHeight) return;

            const scaleX = layerWidth / pdfWidth;
            const scaleY = layerHeight / pdfHeight;

            // Convert each text item to screen coordinates
            for (const item of textContent.items) {
                if (!item.str || !item.str.trim() || !item.transform) continue;

                const itemX = item.transform[4];
                const itemYFromBottom = item.transform[5];
                const fontSize = Math.abs(item.transform[0]) || Math.abs(item.transform[3]) || 10;
                const itemWidth = item.width || (item.str.length * fontSize * 0.5);

                // Convert to screen coordinates
                const screenX = itemX * scaleX;
                const screenY = (pdfHeight - itemYFromBottom - fontSize) * scaleY;
                const screenW = itemWidth * scaleX;
                const screenH = fontSize * scaleY * 1.2;

                this._wordBboxes.push({
                    x: screenX,
                    y: screenY,
                    width: screenW,
                    height: screenH,
                    right: screenX + screenW,
                    bottom: screenY + screenH,
                    text: item.str
                });
            }

            console.log(`[AutoBoxer] Loaded ${this._wordBboxes.length} word bboxes for text obstacle detection`);
        } catch (error) {
            console.warn('[AutoBoxer] Failed to load word bboxes:', error);
            this._wordBboxes = [];
        }
    }

    // ============ CEILING DETECTION ============

    /**
     * Find ceiling above floor level, between walls
     *
     * ABSOLUTE RULE: Text is an impenetrable physical obstacle.
     * Box expansion MUST STOP at first text contact.
     * Under no condition may a field box overlap text.
     *
     * Flow:
     * 1. Start from floor (baseline)
     * 2. Expand upward
     * 3. First contact with text OR horizontal ink = ceiling
     *
     * TEXT ALWAYS WINS. TEXT ALWAYS BLOCKS.
     */
    _findCeiling(leftX, rightX, floorY) {
        const maxSearch = CONFIG.MAX_SEARCH_UP * this._scale;

        // Convert to screen coordinates for text bbox check
        const screenLeftX = leftX / this._scale;
        const screenRightX = rightX / this._scale;
        const screenFloorY = floorY / this._scale;

        // CRITICAL: Start searching from MINIMUM field height above floor
        // This prevents detecting labels at floor level as ceiling
        const minFieldHeight = CONFIG.MIN_HEIGHT * this._scale;
        const startDy = Math.max(minFieldHeight, 20 * this._scale);  // At least MIN_HEIGHT or 20px

        // Scan upward from floor (starting above minimum field height)
        for (let dy = startDy; dy < maxSearch; dy++) {
            const y = Math.round(floorY - dy);
            if (y < 0) break;

            const screenY = y / this._scale;

            // ============ CHECK 1: TEXT COLLISION (HIGHEST PRIORITY) ============
            // Text is impenetrable - if we hit text, STOP immediately
            // But only if the text is ABOVE the field area, not at floor level
            if (this._isTextCeiling(screenLeftX, screenRightX, screenY, screenFloorY)) {
                console.log(`[AutoBoxer] Ceiling: TEXT collision at Y=${y} (screen=${screenY.toFixed(0)})`);
                return { y: y + 5 };  // Add small margin below text
            }

            // ============ CHECK 2: INK PATTERN ============
            // Check for horizontal ink across the width
            let inkCount = 0;
            const samples = 10;
            const step = (rightX - leftX) / samples;

            for (let i = 0; i < samples; i++) {
                const sampleX = Math.round(leftX + i * step);
                if (this._isInk(sampleX, y)) inkCount++;
            }

            // If significant ink across the width, this is ceiling
            if (inkCount >= samples * 0.5) {
                console.log(`[AutoBoxer] Ceiling: INK pattern at Y=${y}`);
                return { y };
            }
        }

        return null;
    }

    /**
     * Check if there's text at a given Y level within the horizontal range
     * Text is an impenetrable ceiling - expansion MUST stop here
     *
     * IMPORTANT: Only text that is significantly ABOVE the floor counts as ceiling.
     * Text at floor level (labels next to input area) should NOT block upward expansion.
     *
     * @param {number} screenLeftX - Left boundary in screen coords
     * @param {number} screenRightX - Right boundary in screen coords
     * @param {number} screenY - Y level to check in screen coords
     * @param {number} screenFloorY - Floor Y level in screen coords (to exclude floor-level text)
     * @returns {boolean} True if text exists at this level
     */
    _isTextCeiling(screenLeftX, screenRightX, screenY, screenFloorY) {
        if (!this._wordBboxes || this._wordBboxes.length === 0) {
            return false;  // No word bboxes, can't check
        }

        const padding = CONFIG.TEXT_PADDING;
        const minDistFromFloor = CONFIG.MIN_HEIGHT;  // Text must be at least MIN_HEIGHT above floor

        for (const word of this._wordBboxes) {
            // CRITICAL: Skip text that's at floor level (not a ceiling)
            // Only consider text that's significantly ABOVE the floor
            const textDistFromFloor = screenFloorY - word.bottom;
            if (textDistFromFloor < minDistFromFloor) {
                continue;  // This text is at/near floor level, not a ceiling
            }

            // Check horizontal overlap: does this word overlap our field width?
            const horizontalOverlap = word.right >= screenLeftX - padding &&
                                       word.x <= screenRightX + padding;

            if (!horizontalOverlap) continue;

            // Check if screenY is within or very close to this word's vertical extent
            // Text blocks from its top to its bottom
            if (screenY >= word.y - padding && screenY <= word.bottom + padding) {
                return true;  // TEXT COLLISION - this is our ceiling
            }
        }

        return false;
    }

    // ============ UTILITIES ============

    /**
     * Get overlay layer width (screen pixels)
     */
    _getLayerWidth() {
        const layer = document.getElementById('overlay-layer');
        return layer?.offsetWidth || 0;
    }

    /**
     * Get overlay layer height (screen pixels)
     */
    _getLayerHeight() {
        const layer = document.getElementById('overlay-layer');
        return layer?.offsetHeight || 0;
    }

    /**
     * Clear pixel cache (call on page change)
     */
    clearCache() {
        this._pixelData = null;
        this._currentPage = null;
        this._wordBboxes = null;
        this._wordBboxPage = null;
        console.log('[AutoBoxer] Cache cleared');
    }

    // ============ PUBLIC API FOR BBOXREFINER ============

    /**
     * Find left wall starting from a specific X position
     * Used by BboxRefiner for surgical edge updates
     * @param {number} screenX - Starting X in screen pixels
     * @param {number} screenFloorY - Floor Y in screen pixels
     * @returns {Promise<number|null>} Wall X position in screen pixels, or null
     */
    async findLeftWallFrom(screenX, screenFloorY) {
        const loaded = await this._loadPixelData();
        if (!loaded) return null;

        await this._loadWordBboxes();

        const canvasX = Math.round(screenX * this._scale);
        const canvasFloorY = Math.round(screenFloorY * this._scale);

        const wall = this._findLeftWall(canvasX, canvasFloorY, canvasX);
        if (wall) {
            return Math.round(wall.x / this._scale);
        }
        return null;
    }

    /**
     * Find right wall starting from a specific X position
     * Used by BboxRefiner for surgical edge updates
     * @param {number} screenX - Starting X in screen pixels
     * @param {number} screenFloorY - Floor Y in screen pixels
     * @returns {Promise<number|null>} Wall X position in screen pixels, or null
     */
    async findRightWallFrom(screenX, screenFloorY) {
        const loaded = await this._loadPixelData();
        if (!loaded) return null;

        await this._loadWordBboxes();

        const canvasX = Math.round(screenX * this._scale);
        const canvasFloorY = Math.round(screenFloorY * this._scale);

        const wall = this._findRightWall(canvasX, canvasFloorY, canvasX);
        if (wall) {
            return Math.round(wall.x / this._scale);
        }
        return null;
    }

    /**
     * Find floor starting from a specific position
     * Used by BboxRefiner for surgical edge updates
     * @param {number} screenX - X in screen pixels
     * @param {number} screenY - Starting Y in screen pixels
     * @returns {Promise<number|null>} Floor Y position in screen pixels, or null
     */
    async findFloorFrom(screenX, screenY) {
        const loaded = await this._loadPixelData();
        if (!loaded) return null;

        const canvasX = Math.round(screenX * this._scale);
        const canvasY = Math.round(screenY * this._scale);

        const floor = this._findFloor(canvasX, canvasY);
        if (floor) {
            return Math.round(floor.y / this._scale);
        }
        return null;
    }

    /**
     * Find ceiling starting from floor level within given X bounds
     * Used by BboxRefiner for surgical edge updates
     * @param {number} screenLeftX - Left bound in screen pixels
     * @param {number} screenRightX - Right bound in screen pixels
     * @param {number} screenFloorY - Floor Y in screen pixels
     * @returns {Promise<number|null>} Ceiling Y position in screen pixels, or null
     */
    async findCeilingFrom(screenLeftX, screenRightX, screenFloorY) {
        const loaded = await this._loadPixelData();
        if (!loaded) return null;

        await this._loadWordBboxes();

        const canvasLeftX = Math.round(screenLeftX * this._scale);
        const canvasRightX = Math.round(screenRightX * this._scale);
        const canvasFloorY = Math.round(screenFloorY * this._scale);

        const ceiling = this._findCeiling(canvasLeftX, canvasRightX, canvasFloorY);
        if (ceiling) {
            return Math.round(ceiling.y / this._scale);
        }
        return null;
    }

    /**
     * Get current scale factor (screen to canvas)
     */
    getScale() {
        return this._scale;
    }

    /**
     * Check if pixel data is loaded
     */
    isReady() {
        return this._pixelData !== null;
    }

    /**
     * Find text boundary between two X positions (for horizontal expansion)
     * Text is an IMPENETRABLE WALL - expansion cannot cross over text
     * @param {number} fromX - Starting X position (current edge)
     * @param {number} toX - Target X position (search limit)
     * @param {number} floorY - Floor Y for vertical range check
     * @param {string} direction - 'left' or 'right'
     * @returns {Promise<number|null>} X position where text blocks, or null if clear
     */
    async findTextBoundaryX(fromX, toX, floorY, direction) {
        await this._loadWordBboxes();

        console.log(`[AutoBoxer] findTextBoundaryX: from=${fromX}, to=${toX}, floorY=${floorY}, dir=${direction}, words=${this._wordBboxes?.length || 0}`);

        if (!this._wordBboxes || this._wordBboxes.length === 0) {
            console.log('[AutoBoxer] No word bboxes loaded!');
            return null;  // No text, expansion is clear
        }

        const padding = CONFIG.TEXT_PADDING;
        const fieldTop = floorY - 40;  // Field height range
        let closestTextBoundary = null;

        // Determine search range
        const minX = Math.min(fromX, toX);
        const maxX = Math.max(fromX, toX);

        console.log(`[AutoBoxer] Search range X: ${minX}-${maxX}, Y: ${fieldTop}-${floorY}`);

        for (const word of this._wordBboxes) {
            // Check if text is at field level (vertically overlapping)
            const textInVerticalRange = word.bottom >= fieldTop && word.y <= floorY + 10;
            if (!textInVerticalRange) continue;

            // Check if text OVERLAPS with the search range [minX, maxX]
            const textOverlaps = word.x < maxX && word.right > minX;
            if (!textOverlaps) continue;

            // Text is in the way! Calculate where to stop
            if (direction === 'left') {
                // Expanding left: stop at text's right edge + padding
                const boundary = word.right + padding;
                // Only count if boundary is between current edge and search limit
                if (boundary >= toX && boundary < fromX) {
                    if (closestTextBoundary === null || boundary > closestTextBoundary) {
                        closestTextBoundary = boundary;
                        console.log(`[AutoBoxer] Text "${word.text}" blocks LEFT at ${boundary}`);
                    }
                }
            } else {
                // Expanding right: stop at text's left edge - padding
                const boundary = word.x - padding;
                // Only count if boundary is between current edge and search limit
                if (boundary > fromX && boundary <= toX) {
                    if (closestTextBoundary === null || boundary < closestTextBoundary) {
                        closestTextBoundary = boundary;
                        console.log(`[AutoBoxer] Text "${word.text}" blocks RIGHT at ${boundary}`);
                    }
                }
            }
        }

        return closestTextBoundary;
    }

    /**
     * Find text boundary between two Y positions (for vertical expansion)
     * @param {number} fromY - Starting Y position (current edge)
     * @param {number} toY - Target Y position (search limit)
     * @param {number} leftX - Left bound of field
     * @param {number} rightX - Right bound of field
     * @param {string} direction - 'up' or 'down'
     * @returns {Promise<number|null>} Y position where text blocks, or null if clear
     */
    async findTextBoundaryY(fromY, toY, leftX, rightX, direction) {
        await this._loadWordBboxes();

        if (!this._wordBboxes || this._wordBboxes.length === 0) {
            return null;
        }

        const padding = CONFIG.TEXT_PADDING;
        let closestTextBoundary = null;

        // Determine search range
        const minY = Math.min(fromY, toY);
        const maxY = Math.max(fromY, toY);

        for (const word of this._wordBboxes) {
            // Check if text is horizontally overlapping with field
            const textInHorizontalRange = word.x < rightX && word.right > leftX;
            if (!textInHorizontalRange) continue;

            // Check if text OVERLAPS with the search range [minY, maxY]
            const textOverlaps = word.y < maxY && word.bottom > minY;
            if (!textOverlaps) continue;

            // Text is in the way! Calculate where to stop
            if (direction === 'up') {
                // Expanding up: stop at text's bottom edge + padding
                const boundary = word.bottom + padding;
                if (boundary >= toY && boundary < fromY) {
                    if (closestTextBoundary === null || boundary > closestTextBoundary) {
                        closestTextBoundary = boundary;
                        console.log(`[AutoBoxer] Text "${word.text}" blocks UP at ${boundary}`);
                    }
                }
            } else {
                // Expanding down: stop at text's top edge - padding
                const boundary = word.y - padding;
                if (boundary > fromY && boundary <= toY) {
                    if (closestTextBoundary === null || boundary < closestTextBoundary) {
                        closestTextBoundary = boundary;
                        console.log(`[AutoBoxer] Text "${word.text}" blocks DOWN at ${boundary}`);
                    }
                }
            }
        }

        return closestTextBoundary;
    }
}

// Singleton instance
export const autoBoxer = new AutoBoxer();
