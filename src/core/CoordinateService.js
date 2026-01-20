/**
 * CoordinateService - Unified coordinate conversion for all desktop modules
 * Combines: UnifiedCoordinateSystem + coordinateTranslator
 *
 * Based on:
 *   /src/shared/UnifiedCoordinateSystem.js
 *   /src/shared/coordinateTranslator.js
 *
 * Created for: Phase 1 - Foundation
 *
 * COORDINATE SYSTEMS:
 * - Normalized (V1): [0-1] percentages, Y from bottom (PDF convention)
 * - PDF Points (V2): Absolute PDF User Space Units, Y from bottom
 * - Screen/Canvas: Pixels, Y from top (browser convention)
 * - CSS: Pixels with DPI adjustment, Y from top
 *
 * Usage:
 *   import { CoordinateService, getCoordinateService } from '../core/CoordinateService.js';
 *
 *   const coords = getCoordinateService(pageViewport, 2.0);
 *   const screen = coords.normalizedToScreen([0.1, 0.2, 0.3, 0.15]);
 *   const pdfPoints = coords.screenToPdfPoints(100, 200, 300, 50);
 */

'use strict';

// ============ COORDINATE FORMATS ============

/**
 * Coordinate format types
 */
export const CoordinateFormats = {
    NORMALIZED: 'normalized',    // V1: [0-1] percentages
    PDF_POINTS: 'pdfPoints',     // V2: Absolute PDF points
    SCREEN: 'screen',            // Canvas pixels
    CSS: 'css'                   // CSS pixels (DPI adjusted)
};

// ============ COORDINATE SERVICE CLASS ============

export class CoordinateService {
    /**
     * Create a coordinate service for a specific page
     * @param {Object} pageViewport - pdf.js viewport object
     * @param {number} renderScale - Render scale (default 2.0)
     * @param {number} devicePixelRatio - Device pixel ratio (default from window)
     */
    constructor(pageViewport, renderScale = 2.0, devicePixelRatio = null) {
        this.viewport = pageViewport;
        this.renderScale = renderScale;
        this.devicePixelRatio = devicePixelRatio || (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;

        // PDF dimensions (in points)
        this.pdfWidth = pageViewport.width / renderScale;
        this.pdfHeight = pageViewport.height / renderScale;

        // Canvas dimensions (in pixels)
        this.canvasWidth = pageViewport.width;
        this.canvasHeight = pageViewport.height;

        // CSS dimensions (DPI adjusted)
        this.cssWidth = this.canvasWidth / this.devicePixelRatio;
        this.cssHeight = this.canvasHeight / this.devicePixelRatio;
    }

    // ============ SCREEN ↔ NORMALIZED (V1) ============

    /**
     * Convert screen coordinates to normalized [0-1] bbox
     * @param {number} x - Screen X (pixels)
     * @param {number} y - Screen Y (pixels)
     * @param {number} width - Width (pixels)
     * @param {number} height - Height (pixels)
     * @returns {Array} [xNorm, yNorm, wNorm, hNorm] normalized coordinates
     */
    screenToNormalized(x, y, width, height) {
        // Convert to percentages
        const xNorm = x / this.canvasWidth;
        const wNorm = width / this.canvasWidth;

        // Y-axis flip: screen Y from top → normalized Y from bottom
        const yTop = y / this.canvasHeight;
        const hNorm = height / this.canvasHeight;
        const yNorm = 1 - yTop - hNorm;  // Bottom of box in normalized coords

        return [xNorm, yNorm, wNorm, hNorm];
    }

    /**
     * Convert normalized bbox to screen coordinates
     * @param {Array} bbox - [xNorm, yNorm, wNorm, hNorm] normalized coordinates
     * @returns {Object} { x, y, width, height } screen coordinates
     */
    normalizedToScreen(bbox) {
        if (!Array.isArray(bbox) || bbox.length !== 4) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        const [xNorm, yNorm, wNorm, hNorm] = bbox;

        // Detect if already absolute (not normalized)
        const isNormalized = xNorm <= 1 && yNorm <= 1 && wNorm <= 1 && hNorm <= 1;

        if (isNormalized) {
            const x = xNorm * this.canvasWidth;
            const width = wNorm * this.canvasWidth;
            const height = hNorm * this.canvasHeight;

            // Y-axis flip: normalized Y from bottom → screen Y from top
            const y = (1 - yNorm - hNorm) * this.canvasHeight;

            return { x, y, width, height };
        } else {
            // Already absolute - treat as PDF points
            return this.pdfPointsToScreen(xNorm, yNorm, wNorm, hNorm);
        }
    }

    // ============ SCREEN ↔ PDF POINTS (V2) ============

    /**
     * Convert screen coordinates to PDF points
     * @param {number} x - Screen X (pixels)
     * @param {number} y - Screen Y (pixels)
     * @param {number} width - Width (pixels)
     * @param {number} height - Height (pixels)
     * @returns {Object} { pdfX, pdfY, pdfWidth, pdfHeight } PDF coordinates
     */
    screenToPdfPoints(x, y, width, height) {
        // Scale from canvas to PDF
        const scaleX = this.pdfWidth / this.canvasWidth;
        const scaleY = this.pdfHeight / this.canvasHeight;

        const pdfX = x * scaleX;
        const pdfWidth = width * scaleX;
        const pdfHeight = height * scaleY;

        // Y-axis flip: screen Y from top → PDF Y from bottom
        const yTop = y * scaleY;
        const pdfY = this.pdfHeight - yTop - pdfHeight;

        return { pdfX, pdfY, pdfWidth, pdfHeight };
    }

    /**
     * Convert PDF points to screen coordinates
     * @param {number} pdfX - PDF X (points)
     * @param {number} pdfY - PDF Y from bottom (points)
     * @param {number} pdfWidth - Width (points)
     * @param {number} pdfHeight - Height (points)
     * @returns {Object} { x, y, width, height } screen coordinates
     */
    pdfPointsToScreen(pdfX, pdfY, pdfWidth, pdfHeight) {
        // Scale from PDF to canvas
        const scaleX = this.canvasWidth / this.pdfWidth;
        const scaleY = this.canvasHeight / this.pdfHeight;

        const x = pdfX * scaleX;
        const width = pdfWidth * scaleX;
        const height = pdfHeight * scaleY;

        // Y-axis flip: PDF Y from bottom → screen Y from top
        const y = (this.pdfHeight - pdfY - pdfHeight) * scaleY;

        return { x, y, width, height };
    }

    // ============ NORMALIZED ↔ PDF POINTS ============

    /**
     * Convert normalized bbox to PDF points
     * @param {Array} bbox - [xNorm, yNorm, wNorm, hNorm] normalized coordinates
     * @returns {Object} { pdfX, pdfY, pdfWidth, pdfHeight } PDF coordinates
     */
    normalizedToPdfPoints(bbox) {
        if (!Array.isArray(bbox) || bbox.length !== 4) {
            return { pdfX: 0, pdfY: 0, pdfWidth: 0, pdfHeight: 0 };
        }

        const [xNorm, yNorm, wNorm, hNorm] = bbox;

        // Check if already absolute
        const isNormalized = xNorm <= 1 && yNorm <= 1 && wNorm <= 1 && hNorm <= 1;

        if (isNormalized) {
            return {
                pdfX: xNorm * this.pdfWidth,
                pdfY: yNorm * this.pdfHeight,
                pdfWidth: wNorm * this.pdfWidth,
                pdfHeight: hNorm * this.pdfHeight
            };
        } else {
            // Already absolute
            return {
                pdfX: xNorm,
                pdfY: yNorm,
                pdfWidth: wNorm,
                pdfHeight: hNorm
            };
        }
    }

    /**
     * Convert PDF points to normalized bbox
     * @param {number} pdfX - PDF X (points)
     * @param {number} pdfY - PDF Y (points)
     * @param {number} pdfWidth - Width (points)
     * @param {number} pdfHeight - Height (points)
     * @returns {Array} [xNorm, yNorm, wNorm, hNorm] normalized coordinates
     */
    pdfPointsToNormalized(pdfX, pdfY, pdfWidth, pdfHeight) {
        return [
            pdfX / this.pdfWidth,
            pdfY / this.pdfHeight,
            pdfWidth / this.pdfWidth,
            pdfHeight / this.pdfHeight
        ];
    }

    // ============ ANCHOR CONVERSIONS (CENTER POINT) ============

    /**
     * Convert screen center point to normalized anchor
     * @param {number} centerX - Screen center X (pixels)
     * @param {number} centerY - Screen center Y (pixels)
     * @returns {Array} [xNorm, yNorm] normalized anchor
     */
    screenToAnchor(centerX, centerY) {
        const xNorm = centerX / this.canvasWidth;
        // Y-axis flip
        const yNorm = 1 - (centerY / this.canvasHeight);
        return [xNorm, yNorm];
    }

    /**
     * Convert normalized anchor to screen center point
     * @param {Array} anchor - [xNorm, yNorm] normalized anchor
     * @returns {Object} { x, y } screen center coordinates
     */
    anchorToScreen(anchor) {
        if (!Array.isArray(anchor) || anchor.length !== 2) {
            return { x: 0, y: 0 };
        }

        const [xNorm, yNorm] = anchor;
        const x = xNorm * this.canvasWidth;
        // Y-axis flip
        const y = (1 - yNorm) * this.canvasHeight;
        return { x, y };
    }

    /**
     * Convert anchor to PDF center point
     * @param {Array} anchor - [xNorm, yNorm] normalized anchor
     * @returns {Object} { pdfX, pdfY } PDF center coordinates
     */
    anchorToPdfPoints(anchor) {
        if (!Array.isArray(anchor) || anchor.length !== 2) {
            return { pdfX: 0, pdfY: 0 };
        }

        const [xNorm, yNorm] = anchor;
        return {
            pdfX: xNorm * this.pdfWidth,
            pdfY: yNorm * this.pdfHeight
        };
    }

    // ============ CSS OVERLAY POSITIONING ============

    /**
     * Convert screen coordinates to CSS overlay style
     * Handles DPI/devicePixelRatio adjustment
     * @param {Object} screen - { x, y, width, height } screen coordinates
     * @returns {Object} CSS style object
     */
    toOverlayStyle(screen) {
        const dpr = this.devicePixelRatio;

        return {
            position: 'absolute',
            left: (screen.x / dpr) + 'px',
            top: (screen.y / dpr) + 'px',
            width: (screen.width / dpr) + 'px',
            height: (screen.height / dpr) + 'px'
        };
    }

    /**
     * Convert normalized bbox directly to CSS overlay style
     * @param {Array} bbox - [xNorm, yNorm, wNorm, hNorm] normalized coordinates
     * @returns {Object} CSS style object
     */
    bboxToOverlayStyle(bbox) {
        const screen = this.normalizedToScreen(bbox);
        return this.toOverlayStyle(screen);
    }

    /**
     * Convert PDF points directly to CSS overlay style
     * @param {number} pdfX - PDF X (points)
     * @param {number} pdfY - PDF Y from bottom (points)
     * @param {number} pdfWidth - Width (points)
     * @param {number} pdfHeight - Height (points)
     * @returns {Object} CSS style object
     */
    pdfPointsToOverlayStyle(pdfX, pdfY, pdfWidth, pdfHeight) {
        const screen = this.pdfPointsToScreen(pdfX, pdfY, pdfWidth, pdfHeight);
        return this.toOverlayStyle(screen);
    }

    // ============ USING PDF.JS TRANSFORM MATRIX ============

    /**
     * Convert PDF point using viewport transform matrix
     * More accurate than manual calculation for rotated/skewed pages
     * @param {number} pdfX - PDF X coordinate
     * @param {number} pdfY - PDF Y coordinate
     * @returns {Object} { x, y } canvas coordinates
     */
    pdfToCanvasWithMatrix(pdfX, pdfY) {
        const vp = this.viewport;
        if (!vp || !vp.transform) {
            return this.pdfPointsToScreen(pdfX, pdfY, 0, 0);
        }

        // PDF.js viewport.transform is [scaleX, skewX, skewY, scaleY, offsetX, offsetY]
        const t = vp.transform;
        const x = pdfX * t[0] + t[4];
        const y = pdfY * t[3] + t[5];

        return { x, y };
    }

    // ============ VALIDATION ============

    /**
     * Validate that a bbox is in valid format
     * @param {Array} bbox - Bbox to validate
     * @param {string} expectedFormat - 'normalized' | 'pdfPoints'
     * @returns {Object} { valid: boolean, errors: string[] }
     */
    validateBbox(bbox, expectedFormat = null) {
        const errors = [];

        if (!Array.isArray(bbox)) {
            errors.push('Bbox must be an array');
            return { valid: false, errors };
        }

        if (bbox.length !== 4) {
            errors.push(`Bbox must have 4 elements, got ${bbox.length}`);
            return { valid: false, errors };
        }

        const [x, y, w, h] = bbox;

        // Check all are numbers
        if (!bbox.every(v => typeof v === 'number' && isFinite(v))) {
            errors.push('All bbox values must be finite numbers');
            return { valid: false, errors };
        }

        // Check dimensions are non-negative
        if (w < 0 || h < 0) {
            errors.push('Width and height must be non-negative');
        }

        // Validate expected format
        if (expectedFormat === 'normalized') {
            if (x < 0 || x > 1 || y < 0 || y > 1 || w < 0 || w > 1 || h < 0 || h > 1) {
                errors.push('Normalized values must be in range [0, 1]');
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate that an anchor is in valid format
     * @param {Array} anchor - Anchor to validate
     * @returns {Object} { valid: boolean, errors: string[] }
     */
    validateAnchor(anchor) {
        const errors = [];

        if (!Array.isArray(anchor)) {
            errors.push('Anchor must be an array');
            return { valid: false, errors };
        }

        if (anchor.length !== 2) {
            errors.push(`Anchor must have 2 elements, got ${anchor.length}`);
            return { valid: false, errors };
        }

        const [x, y] = anchor;

        if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
            errors.push('Anchor values must be finite numbers');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Detect coordinate format based on values
     * @param {Array} coords - [x, y, w?, h?] coordinates
     * @returns {string} 'normalized' | 'pdfPoints' | 'unknown'
     */
    detectFormat(coords) {
        if (!Array.isArray(coords) || coords.length < 2) {
            return 'unknown';
        }

        // Check if all values are in [0, 1] range
        const allNormalized = coords.every(v => v >= 0 && v <= 1);

        if (allNormalized) {
            return 'normalized';
        }

        // Check if values look like PDF points (typically 0-612 for width, 0-792 for height)
        const maxValue = Math.max(...coords.filter(v => typeof v === 'number'));
        if (maxValue > 1 && maxValue < 1000) {
            return 'pdfPoints';
        }

        return 'unknown';
    }

    // ============ UTILITY METHODS ============

    /**
     * Check if coordinates are within page bounds
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {string} format - 'normalized' | 'pdfPoints' | 'screen'
     * @returns {boolean}
     */
    isWithinBounds(x, y, format = 'screen') {
        let maxX, maxY;

        switch (format) {
            case 'normalized':
                maxX = 1;
                maxY = 1;
                break;
            case 'pdfPoints':
                maxX = this.pdfWidth;
                maxY = this.pdfHeight;
                break;
            case 'screen':
            default:
                maxX = this.canvasWidth;
                maxY = this.canvasHeight;
        }

        return x >= 0 && x <= maxX && y >= 0 && y <= maxY;
    }

    /**
     * Clamp coordinates to page bounds
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {string} format - 'normalized' | 'pdfPoints' | 'screen'
     * @returns {Object} { x, y } clamped coordinates
     */
    clampToBounds(x, y, format = 'screen') {
        let maxX, maxY;

        switch (format) {
            case 'normalized':
                maxX = 1;
                maxY = 1;
                break;
            case 'pdfPoints':
                maxX = this.pdfWidth;
                maxY = this.pdfHeight;
                break;
            case 'screen':
            default:
                maxX = this.canvasWidth;
                maxY = this.canvasHeight;
        }

        return {
            x: Math.max(0, Math.min(x, maxX)),
            y: Math.max(0, Math.min(y, maxY))
        };
    }

    /**
     * Get page dimensions in all formats
     * @returns {Object} { pdf, screen, css }
     */
    getPageDimensions() {
        return {
            pdf: { width: this.pdfWidth, height: this.pdfHeight },
            screen: { width: this.canvasWidth, height: this.canvasHeight },
            css: { width: this.cssWidth, height: this.cssHeight }
        };
    }
}

// ============ FACTORY & CACHING ============

const instanceCache = new WeakMap();

/**
 * Get or create CoordinateService for a viewport
 * Uses WeakMap caching to reuse instances
 * @param {Object} pageViewport - pdf.js viewport
 * @param {number} renderScale - Render scale (default 2.0)
 * @returns {CoordinateService}
 */
export function getCoordinateService(pageViewport, renderScale = 2.0) {
    if (!pageViewport) {
        throw new Error('pageViewport is required');
    }

    // Check cache
    if (instanceCache.has(pageViewport)) {
        return instanceCache.get(pageViewport);
    }

    // Create new instance
    const instance = new CoordinateService(pageViewport, renderScale);
    instanceCache.set(pageViewport, instance);
    return instance;
}

/**
 * Create CoordinateService without caching
 * Use when you need a fresh instance
 * @param {Object} pageViewport - pdf.js viewport
 * @param {number} renderScale - Render scale (default 2.0)
 * @param {number} devicePixelRatio - Device pixel ratio
 * @returns {CoordinateService}
 */
export function createCoordinateService(pageViewport, renderScale = 2.0, devicePixelRatio = null) {
    return new CoordinateService(pageViewport, renderScale, devicePixelRatio);
}

// ============ STANDALONE CONVERSION FUNCTIONS ============
// For cases where you don't have a viewport object

/**
 * Convert canvas point to PDF point (standalone)
 * @param {number} canvasX - Canvas X
 * @param {number} canvasY - Canvas Y
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {number} pdfWidth - PDF page width
 * @param {number} pdfHeight - PDF page height
 * @returns {Object} { pdfX, pdfY }
 */
export function canvasToPdfPoint(canvasX, canvasY, canvasWidth, canvasHeight, pdfWidth, pdfHeight) {
    const xPercent = canvasX / canvasWidth;
    const yPercent = canvasY / canvasHeight;

    const pdfX = xPercent * pdfWidth;
    const pdfY = (1 - yPercent) * pdfHeight;

    return { pdfX, pdfY };
}

/**
 * Convert PDF point to canvas point (standalone)
 * @param {number} pdfX - PDF X
 * @param {number} pdfY - PDF Y (from bottom)
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {number} pdfWidth - PDF page width
 * @param {number} pdfHeight - PDF page height
 * @returns {Object} { canvasX, canvasY }
 */
export function pdfToCanvasPoint(pdfX, pdfY, canvasWidth, canvasHeight, pdfWidth, pdfHeight) {
    const xPercent = pdfX / pdfWidth;
    const yPercent = pdfY / pdfHeight;

    const canvasX = xPercent * canvasWidth;
    const canvasY = (1 - yPercent) * canvasHeight;

    return { canvasX, canvasY };
}

// ============ GLOBAL EXPORT ============

if (typeof window !== 'undefined') {
    window.CoordinateService = {
        CoordinateService,
        getCoordinateService,
        createCoordinateService,
        canvasToPdfPoint,
        pdfToCanvasPoint,
        CoordinateFormats
    };
}
