/**
 * coordinateTranslator.js
 *
 * Pure coordinate translation functions between Canvas and PDF coordinate systems.
 *
 * COORDINATE SYSTEMS:
 * - Canvas: origin at top-left, Y increases downward
 * - PDF: origin at bottom-left, Y increases upward (PDF User Space Units / points)
 *
 * All conversions are zoom-aware and handle page dimensions properly.
 */

/**
 * Validates that a value is a finite number
 * @param {number} value - Value to validate
 * @param {string} name - Name for error message
 * @throws {Error} If value is not a finite number
 */
function validateNumber(value, name) {
    if (typeof value !== 'number' || !isFinite(value)) {
        throw new Error(`${name} must be a finite number, got: ${value} (${typeof value})`);
    }
}

/**
 * Validates page dimensions
 * @param {number} width - Page width
 * @param {number} height - Page height
 * @throws {Error} If dimensions are invalid
 */
function validatePageDimensions(width, height) {
    validateNumber(width, 'Page width');
    validateNumber(height, 'Page height');
    if (width <= 0) throw new Error(`Page width must be positive, got: ${width}`);
    if (height <= 0) throw new Error(`Page height must be positive, got: ${height}`);
}

/**
 * Converts a canvas point to PDF coordinate system
 *
 * @param {number} canvasX - X coordinate in canvas pixels
 * @param {number} canvasY - Y coordinate in canvas pixels
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {number} pdfPageWidth - PDF page width in points
 * @param {number} pdfPageHeight - PDF page height in points
 * @returns {{pdfX: number, pdfY: number}} PDF coordinates in points
 * @throws {Error} If any parameter is invalid
 */
function canvasToPdfPoint(canvasX, canvasY, canvasWidth, canvasHeight, pdfPageWidth, pdfPageHeight) {
    // Validate inputs
    validateNumber(canvasX, 'canvasX');
    validateNumber(canvasY, 'canvasY');
    validatePageDimensions(canvasWidth, canvasHeight);
    validatePageDimensions(pdfPageWidth, pdfPageHeight);

    // Convert canvas coordinates to PDF percentage (0-1)
    const xPercent = canvasX / canvasWidth;
    const yPercent = canvasY / canvasHeight;

    // Convert to PDF coordinates
    // Canvas Y increases downward, PDF Y increases upward → invert Y
    const pdfX = xPercent * pdfPageWidth;
    const pdfY = (1 - yPercent) * pdfPageHeight;

    return { pdfX, pdfY };
}

/**
 * Converts a PDF point to canvas coordinate system
 *
 * @param {number} pdfX - X coordinate in PDF points
 * @param {number} pdfY - Y coordinate in PDF points (from bottom)
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {number} pdfPageWidth - PDF page width in points
 * @param {number} pdfPageHeight - PDF page height in points
 * @returns {{canvasX: number, canvasY: number}} Canvas coordinates in pixels
 * @throws {Error} If any parameter is invalid
 */
function pdfToCanvasPoint(pdfX, pdfY, canvasWidth, canvasHeight, pdfPageWidth, pdfPageHeight) {
    // Validate inputs
    validateNumber(pdfX, 'pdfX');
    validateNumber(pdfY, 'pdfY');
    validatePageDimensions(canvasWidth, canvasHeight);
    validatePageDimensions(pdfPageWidth, pdfPageHeight);

    // Convert PDF coordinates to percentage (0-1)
    const xPercent = pdfX / pdfPageWidth;
    const yPercent = pdfY / pdfPageHeight;

    // Convert to canvas coordinates
    // PDF Y increases upward, Canvas Y increases downward → invert Y
    const canvasX = xPercent * canvasWidth;
    const canvasY = (1 - yPercent) * canvasHeight;

    return { canvasX, canvasY };
}

/**
 * Converts a canvas bounding box to PDF coordinate system
 *
 * @param {number} canvasX - Left edge in canvas pixels
 * @param {number} canvasY - Top edge in canvas pixels
 * @param {number} canvasBoxWidth - Box width in canvas pixels
 * @param {number} canvasBoxHeight - Box height in canvas pixels
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {number} pdfPageWidth - PDF page width in points
 * @param {number} pdfPageHeight - PDF page height in points
 * @returns {{pdfX: number, pdfY: number, pdfWidth: number, pdfHeight: number}} PDF box in points
 * @throws {Error} If any parameter is invalid
 */
function canvasBoxToPdfBox(canvasX, canvasY, canvasBoxWidth, canvasBoxHeight, canvasWidth, canvasHeight, pdfPageWidth, pdfPageHeight) {
    // Validate box dimensions
    validateNumber(canvasBoxWidth, 'canvasBoxWidth');
    validateNumber(canvasBoxHeight, 'canvasBoxHeight');
    if (canvasBoxWidth < 0) throw new Error(`canvasBoxWidth must be non-negative, got: ${canvasBoxWidth}`);
    if (canvasBoxHeight < 0) throw new Error(`canvasBoxHeight must be non-negative, got: ${canvasBoxHeight}`);

    // Convert top-left corner
    const topLeft = canvasToPdfPoint(canvasX, canvasY, canvasWidth, canvasHeight, pdfPageWidth, pdfPageHeight);

    // Convert dimensions (scale factors only, no coordinate inversion needed)
    const pdfWidth = (canvasBoxWidth / canvasWidth) * pdfPageWidth;
    const pdfHeight = (canvasBoxHeight / canvasHeight) * pdfPageHeight;

    // PDF Y coordinate is at bottom of box in PDF space
    // Since PDF Y increases upward, we need to adjust
    const pdfX = topLeft.pdfX;
    const pdfY = topLeft.pdfY - pdfHeight; // Bottom edge in PDF space

    return { pdfX, pdfY, pdfWidth, pdfHeight };
}

/**
 * Converts a PDF bounding box to canvas coordinate system
 *
 * @param {number} pdfX - Left edge in PDF points
 * @param {number} pdfY - Bottom edge in PDF points
 * @param {number} pdfWidth - Box width in PDF points
 * @param {number} pdfHeight - Box height in PDF points
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {number} pdfPageWidth - PDF page width in points
 * @param {number} pdfPageHeight - PDF page height in points
 * @returns {{canvasX: number, canvasY: number, canvasWidth: number, canvasHeight: number}} Canvas box in pixels
 * @throws {Error} If any parameter is invalid
 */
function pdfBoxToCanvasBox(pdfX, pdfY, pdfWidth, pdfHeight, canvasWidth, canvasHeight, pdfPageWidth, pdfPageHeight) {
    // Validate box dimensions
    validateNumber(pdfWidth, 'pdfWidth');
    validateNumber(pdfHeight, 'pdfHeight');
    if (pdfWidth < 0) throw new Error(`pdfWidth must be non-negative, got: ${pdfWidth}`);
    if (pdfHeight < 0) throw new Error(`pdfHeight must be non-negative, got: ${pdfHeight}`);

    // PDF Y is at bottom, need to convert to top for canvas
    const pdfYTop = pdfY + pdfHeight;

    // Convert top-left corner
    const topLeft = pdfToCanvasPoint(pdfX, pdfYTop, canvasWidth, canvasHeight, pdfPageWidth, pdfPageHeight);

    // Convert dimensions
    const canvasBoxWidth = (pdfWidth / pdfPageWidth) * canvasWidth;
    const canvasBoxHeight = (pdfHeight / pdfPageHeight) * canvasHeight;

    return {
        canvasX: topLeft.canvasX,
        canvasY: topLeft.canvasY,
        canvasWidth: canvasBoxWidth,
        canvasHeight: canvasBoxHeight
    };
}

/**
 * Validates that coordinates are within page bounds
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} pageWidth - Page width
 * @param {number} pageHeight - Page height
 * @returns {boolean} True if within bounds
 */
function isWithinBounds(x, y, pageWidth, pageHeight) {
    return x >= 0 && x <= pageWidth && y >= 0 && y <= pageHeight;
}

/**
 * Clamps coordinates to page bounds
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} pageWidth - Page width
 * @param {number} pageHeight - Page height
 * @returns {{x: number, y: number}} Clamped coordinates
 */
function clampToBounds(x, y, pageWidth, pageHeight) {
    return {
        x: Math.max(0, Math.min(x, pageWidth)),
        y: Math.max(0, Math.min(y, pageHeight))
    };
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    // Node.js / CommonJS
    module.exports = {
        canvasToPdfPoint,
        pdfToCanvasPoint,
        canvasBoxToPdfBox,
        pdfBoxToCanvasBox,
        isWithinBounds,
        clampToBounds,
        validateNumber,
        validatePageDimensions
    };
} else {
    // Browser / Global
    window.CoordinateTranslator = {
        canvasToPdfPoint,
        pdfToCanvasPoint,
        canvasBoxToPdfBox,
        pdfBoxToCanvasBox,
        isWithinBounds,
        clampToBounds,
        validateNumber,
        validatePageDimensions
    };
}
