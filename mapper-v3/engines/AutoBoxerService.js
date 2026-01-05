/**
 * AutoBoxerService - Physics-based Auto-Placement Engine
 * 
 * Logic:
 * 1. Takes a seed point (click coordinates)
 * 2. Floor Detection: Scans DOWN to find "ink" (text underline or box bottom)
 * 3. Walls: Expands LEFT/RIGHT from the floor level
 * 4. Ceiling: Scans UP to find top boundary
 * 5. Returns a standardized BBox
 * 
 * Strictly for TEXT fields.
 */
import { pdfEngine, RENDER_DPI } from './PDFEngine.js';
import { textExtractor } from './TextExtractor.js';
import { state } from '../core/StateManager.js';

// Physics Constants
const SCAN_LIMIT_Y = 200; // Max pixels to scan down for floor
const SCAN_LIMIT_X = 500; // Max pixels to scan sideways
const NOISE_THRESHOLD = 50; // Alpha threshold for "ink" (0-255)
const MIN_HEIGHT = 15;     // Minimum valid field height
const STANDARD_HEIGHT = 28; // Fallback height
const SEARCH_STEP = 1;     // Pixel step for scanning

export class AutoBoxerService {
    constructor() {
        this.ctx = null; // Reusable canvas context if needed
    }

    /**
     * Calculate BBox based on seed point using physics rules
     * @param {Object} seedPoint - { x, y } in screen coordinates
     * @returns {Promise<Object>} BBox { x, y, width, height } or null
     */
    async calculateBBox(seedPoint) {
        console.time('AutoBoxer');
        console.log('[AutoBoxer] Starting calculation at:', seedPoint);

        const { x, y } = seedPoint;

        // 1. Get pixel data window around the click
        // We grab a slice that is large enough to cover probable field size
        const scanRegion = {
            x: Math.max(0, x - SCAN_LIMIT_X),
            y: Math.max(0, y - SCAN_LIMIT_Y),
            width: SCAN_LIMIT_X * 2,
            height: SCAN_LIMIT_Y * 2
        };

        const pixelData = await pdfEngine.getPixelData(
            scanRegion.x,
            scanRegion.y,
            scanRegion.width,
            scanRegion.height
        );

        if (!pixelData) {
            console.error('[AutoBoxer] Failed to get pixel data');
            return this._getFallbackBBox(x, y);
        }

        // Helper to get pixel alpha at LOCAL coordinates (relative to scanRegion)
        const getAlpha = (localX, localY) => {
            if (localX < 0 || localX >= scanRegion.width || localY < 0 || localY >= scanRegion.height) return 0;
            const index = (Math.floor(localY) * scanRegion.width + Math.floor(localX)) * 4;
            return pixelData.data[index + 3]; // Alpha channel
        };

        // Helper: Is pixel "ink"?
        const isInk = (localX, localY) => getAlpha(localX, localY) > NOISE_THRESHOLD;

        // Coordinates buffer relative to the seed point
        // seed_local_x = x - scanRegion.x
        // seed_local_y = y - scanRegion.y
        const seedLocalX = x - scanRegion.x;
        const seedLocalY = y - scanRegion.y;

        // ============ STEP 1: FLOOR DETECTION ============
        // Verify we are not ON a line. If we are, move up slightly.
        let startY = seedLocalY;

        let floorY = -1;
        // Scan DOWN
        for (let dy = 0; dy < SCAN_LIMIT_Y; dy += SEARCH_STEP) {
            const scanY = startY + dy;
            if (isInk(seedLocalX, scanY)) {
                // Confirm it's a line/floor (check neighbors to avoid noise)
                if (this._verifyHorizontalLine(isInk, seedLocalX, scanY)) {
                    floorY = scanY;
                    break;
                }
            }
        }

        if (floorY === -1) {
            console.log('[AutoBoxer] No floor found - using standard size');
            return this._getFallbackBBox(x, y);
        }

        console.log('[AutoBoxer] Floor found at local Y:', floorY);

        // ============ STEP 2: WALLS SEARCH ============
        // Search LEFT and RIGHT *along the floor* (or slightly above it to catch vertical lines)
        const searchY = floorY - 2; // Look slightly above pixels finding the floor line

        let leftWallX = 0; // Default to scan region edge
        let rightWallX = scanRegion.width;

        // Search LEFT
        for (let dx = 1; dx < SCAN_LIMIT_X; dx += SEARCH_STEP) {
            const scanX = seedLocalX - dx;
            if (isInk(scanX, searchY)) {
                // Continuity Law: Check if it's a "real" wall or just a dashed line/dot
                if (this._isRealWall(isInk, scanX, searchY)) {
                    leftWallX = scanX;
                    break;
                } else {
                    console.log('[AutoBoxer] Ignoring dashed line at X:', scanX);
                }
            }
        }

        // Search RIGHT
        for (let dx = 1; dx < SCAN_LIMIT_X; dx += SEARCH_STEP) {
            const scanX = seedLocalX + dx;
            if (isInk(scanX, searchY)) {
                if (this._isRealWall(isInk, scanX, searchY)) {
                    rightWallX = scanX;
                    break;
                }
            }
        }

        // Adjust for padding
        // If we hit ink, we want to stay slightly inside
        const PADDING = 2;
        leftWallX += PADDING;
        rightWallX -= PADDING;

        // ============ STEP 3: CEILING DETECTION ============
        // Scan UP from floor
        let ceilingY = Math.max(0, floorY - STANDARD_HEIGHT); // Default

        // Try to find physical ceiling
        /* 
           Simpler approach for V3 first pass: 
           Use Standard Height from floor up, unless blocked immediately.
           Many forms don't have top lines for fields, just bottom lines.
           If we find a line within reasonable height (~30px), use it.
        */
        for (let dy = 5; dy < 50; dy += SEARCH_STEP) { // Start 5px up to avoid the floor itself
            const scanY = floorY - dy;
            if (isInk(seedLocalX, scanY)) {
                if (this._verifyHorizontalLine(isInk, seedLocalX, scanY)) {
                    ceilingY = scanY + PADDING;
                    console.log('[AutoBoxer] Ceiling found at local Y:', ceilingY);
                    break;
                }
            }
        }

        // Map back to global coordinates
        const globalX = scanRegion.x + leftWallX;
        const globalY = scanRegion.y + ceilingY;
        const globalW = (scanRegion.x + rightWallX) - globalX;
        const globalH = (scanRegion.y + floorY) - globalY;

        console.log('[AutoBoxer] Calculated Box:', { globalX, globalY, globalW, globalH });
        console.timeEnd('AutoBoxer');

        // Validation
        if (globalW < 5 || globalH < 5) {
            return this._getFallbackBBox(x, y);
        }

        return {
            x: globalX,
            y: globalY,
            width: globalW,
            height: globalH
        };
    }

    /**
     * Fallback if physics fails
     */
    _getFallbackBBox(centerX, centerY) {
        const width = 120;
        const height = STANDARD_HEIGHT;
        return {
            x: centerX - width / 2,
            y: centerY - height / 2,
            width: width,
            height: height
        };
    }

    /**
     * Verify if a hit is part of a horizontal line (for floor/ceiling)
     * Checks if there are ink pixels to the left and right
     */
    _verifyHorizontalLine(isInkFn, x, y) {
        let hCount = 0;
        // Check 3 pixels to left and right
        for (let i = -3; i <= 3; i++) {
            if (isInkFn(x + i, y)) hCount++;
        }
        return hCount > 4; // High confidence it's a line
    }

    /**
     * CONTINUITY LAW: Check if vertical hit is a solid wall or dashed/noise
     * A solid wall should have significant vertical continuity.
     */
    _isRealWall(isInkFn, x, y) {
        let vCount = 0;
        // Check vertical column around the hit
        // e.g. 10 pixels up and down
        for (let i = -10; i <= 10; i++) {
            if (isInkFn(x, y + i)) vCount++;
        }

        // If we found many ink pixels vertically, it's a wall.
        // If we found very few (e.g. just the point where a horizontal dashed line crosses), it's not a wall.
        return vCount > 8;
    }
}

// Singleton
export const autoBoxer = new AutoBoxerService();
