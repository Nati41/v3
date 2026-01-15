/**
 * OCR Engine - Optical Character Recognition Fallback
 * This module provides OCR capability when PDF text extraction fails.
 * It crops the relevant region and sends it to an OCR service.
 *
 * SAFE: This module is fully isolated and does not modify any existing logic.
 */

export class OCREngine {

    // OCR API endpoint configuration
    static OCR_ENDPOINT = "http://localhost:5009/ocr";

    /**
     * Recognize text from a canvas region using OCR
     * @param {HTMLCanvasElement} canvas - The source canvas (PDF render)
     * @param {Object} bbox - { x, y, width, height } in canvas coordinates
     * @returns {Promise<string>} - Recognized text or empty string
     */
    static async recognizeFromCanvas(canvas, bbox) {
        if (!canvas || !bbox) {
            console.warn("OCREngine: Invalid canvas or bbox");
            return "";
        }

        try {
            // Create a temporary canvas for cropping
            const tempCanvas = document.createElement('canvas');
            const ctx = tempCanvas.getContext('2d');

            // Ensure minimum dimensions
            const cropWidth = Math.max(10, Math.round(bbox.width));
            const cropHeight = Math.max(10, Math.round(bbox.height));

            tempCanvas.width = cropWidth;
            tempCanvas.height = cropHeight;

            // Calculate source coordinates
            // Note: Canvas Y coordinate may need adjustment based on coordinate system
            const sourceX = Math.max(0, Math.round(bbox.x));
            const sourceY = Math.max(0, Math.round(bbox.y));

            // Crop the relevant region from the source canvas
            ctx.drawImage(
                canvas,
                sourceX,                    // source X
                sourceY,                    // source Y
                cropWidth,                  // source width
                cropHeight,                 // source height
                0,                          // destination X
                0,                          // destination Y
                cropWidth,                  // destination width
                cropHeight                  // destination height
            );

            // Convert canvas to blob
            const blob = await new Promise((resolve, reject) => {
                tempCanvas.toBlob(
                    (b) => b ? resolve(b) : reject(new Error("Failed to create blob")),
                    'image/png'
                );
            });

            // Prepare form data for OCR API
            const formData = new FormData();
            formData.append("file", blob, "crop.png");

            console.log("🔍 OCR: Sending cropped image to OCR service...", {
                width: cropWidth,
                height: cropHeight,
                sourceX,
                sourceY
            });

            // Send to OCR API
            const response = await fetch(OCREngine.OCR_ENDPOINT, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                throw new Error(`OCR API returned ${response.status}`);
            }

            const data = await response.json();
            const text = data.text || "";

            console.log("🔍 OCR: Result received:", text);
            return text.trim();

        } catch (err) {
            console.warn("🔍 OCR fallback failed:", err.message);
            return "";
        }
    }

    /**
     * Check if OCR service is available
     * @returns {Promise<boolean>} - True if OCR service is reachable
     */
    static async isAvailable() {
        try {
            const response = await fetch(OCREngine.OCR_ENDPOINT, {
                method: "GET",
                signal: AbortSignal.timeout(2000)  // 2 second timeout
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Set custom OCR endpoint
     * @param {string} endpoint - The OCR API endpoint URL
     */
    static setEndpoint(endpoint) {
        OCREngine.OCR_ENDPOINT = endpoint;
        console.log("🔍 OCR: Endpoint set to", endpoint);
    }
}
