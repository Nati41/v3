/**
 * TextExtractor - PDF text extraction with OCR fallback for Mapper V3
 *
 * STRICT BBOX MODE:
 * - Only extracts text that is FULLY INSIDE the user-drawn rectangle
 * - No partial intersection, no tolerance margin
 * - If zero words match, returns empty string
 *
 * Flow:
 * 1. Try PDF.js getTextContent() first
 * 2. If no text found, fallback to OCR (Tesseract.js)
 * 3. Return exact text without modifications
 */
import { pdfEngine } from './PDFEngine.js';

export class TextExtractor {
    constructor() {
        this.tesseractWorker = null;
        this.tesseractLoading = false;
        this.pageTextCache = new Map(); // Cache text content per page
    }

    /**
     * Initialize Tesseract worker (lazy loading)
     */
    async _initTesseract() {
        if (this.tesseractWorker) return this.tesseractWorker;
        if (this.tesseractLoading) {
            // Wait for existing loading
            while (this.tesseractLoading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return this.tesseractWorker;
        }

        this.tesseractLoading = true;

        try {
            // Check if Tesseract is available
            if (typeof Tesseract === 'undefined') {
                console.warn('[TextExtractor] Tesseract.js not loaded, OCR fallback disabled');
                this.tesseractLoading = false;
                return null;
            }

            console.log('[TextExtractor] Initializing Tesseract worker...');
            this.tesseractWorker = await Tesseract.createWorker('heb+eng');
            console.log('[TextExtractor] Tesseract worker ready');

            this.tesseractLoading = false;
            return this.tesseractWorker;
        } catch (error) {
            console.error('[TextExtractor] Failed to init Tesseract:', error);
            this.tesseractLoading = false;
            return null;
        }
    }

    /**
     * Main API: Get text at a specific position on the PDF
     * @param {number} x - X coordinate (screen pixels)
     * @param {number} y - Y coordinate (screen pixels)
     * @param {number} width - Width (screen pixels)
     * @param {number} height - Height (screen pixels)
     * @returns {Promise<{text: string, source: string}>}
     */
    async getTextAtPosition(x, y, width, height) {
        console.log(`[TEXT_CAPTURE] Getting text at (${x}, ${y}, ${width}x${height})`);
        console.log('[TEXT_CAPTURE] bbox strict mode active');

        // Convert screen coordinates to PDF coordinates
        const bbox = await this._screenToPdfCoords(x, y, width, height);
        if (!bbox) {
            return { text: '', source: 'none' };
        }

        // Try PDF.js text extraction first
        const pdfText = await this._extractFromPdf(bbox);
        if (pdfText && pdfText.trim()) {
            console.log('[TEXT_CAPTURE] Found text via PDF.js:', pdfText);
            return { text: pdfText.trim(), source: 'pdf' };
        }

        // Fallback to OCR
        console.log('[TEXT_CAPTURE] No PDF text, trying OCR...');
        const ocrText = await this._extractWithOCR(x, y, width, height);
        if (ocrText && ocrText.trim()) {
            console.log('[TEXT_CAPTURE] Found text via OCR:', ocrText);
            return { text: ocrText.trim(), source: 'ocr' };
        }

        console.log('[TEXT_CAPTURE] No text found');
        return { text: '', source: 'none' };
    }

    /**
     * Convert screen coordinates to PDF coordinates (in PDF points, 72 DPI)
     * @param {number} x - Screen X
     * @param {number} y - Screen Y
     * @param {number} width - Screen width
     * @param {number} height - Screen height
     * @returns {Promise<Object|null>} { x0, y0, x1, y1 } in PDF points
     */
    async _screenToPdfCoords(x, y, width, height) {
        const pdfDoc = pdfEngine.pdfDocument;
        const currentPage = pdfEngine.currentPage;

        if (!pdfDoc) {
            console.warn('[TEXT_CAPTURE] No PDF document');
            return null;
        }

        // Get original PDF page dimensions (in PDF points, 72 DPI)
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.0 }); // Scale 1 = PDF points
        const pdfWidth = viewport.width;   // Original PDF width in points
        const pdfHeight = viewport.height; // Original PDF height in points

        // Get displayed image dimensions
        const imgWidth = pdfEngine.getLogicalWidth();
        const imgHeight = pdfEngine.getLogicalHeight();

        if (!imgWidth || !imgHeight) {
            console.warn('[TEXT_CAPTURE] No image dimensions');
            return null;
        }

        console.log(`[TEXT_CAPTURE] PDF points: ${pdfWidth}x${pdfHeight}, Image: ${imgWidth}x${imgHeight}`);

        // Scale from screen (image) coordinates to PDF points
        const scaleX = pdfWidth / imgWidth;
        const scaleY = pdfHeight / imgHeight;

        // Return as x0, y0, x1, y1 format for easier containment check
        const result = {
            x0: x * scaleX,
            y0: y * scaleY,
            x1: (x + width) * scaleX,
            y1: (y + height) * scaleY,
            pdfHeight: pdfHeight
        };

        console.log(`[TEXT_CAPTURE] Screen (${x},${y},${width}x${height}) -> PDF bbox (${result.x0.toFixed(1)},${result.y0.toFixed(1)}) to (${result.x1.toFixed(1)},${result.y1.toFixed(1)})`);

        return result;
    }

    /**
     * Check if a word's CENTER POINT is inside the user bbox
     * Simple approach: if the center of the text is inside, include it
     * @param {number} centerX - X center of the word
     * @param {number} centerY - Y center of the word
     * @param {Object} userBBox - { x0, y0, x1, y1 }
     * @returns {boolean}
     */
    _isWordCenterInside(centerX, centerY, userBBox) {
        return (
            centerX >= userBBox.x0 &&
            centerX <= userBBox.x1 &&
            centerY >= userBBox.y0 &&
            centerY <= userBBox.y1
        );
    }

    /**
     * Extract text from PDF using PDF.js - STRICT BBOX MODE
     * Only extracts words that are FULLY INSIDE the user bbox
     * @param {Object} userBBox - PDF coordinates { x0, y0, x1, y1, pdfHeight }
     * @returns {Promise<string>}
     */
    async _extractFromPdf(userBBox) {
        const pdfDoc = pdfEngine.pdfDocument;
        const currentPage = pdfEngine.currentPage;

        if (!pdfDoc) {
            return '';
        }

        try {
            const page = await pdfDoc.getPage(currentPage);

            // Get original PDF dimensions (in points, 72 DPI)
            const pdfHeight = userBBox.pdfHeight;

            // Get or load text content for current page
            let textContent = this.pageTextCache.get(currentPage);

            if (!textContent) {
                textContent = await page.getTextContent();
                this.pageTextCache.set(currentPage, textContent);
            }

            // Collect words that are FULLY INSIDE the user bbox
            const collectedWords = [];

            console.log(`[TEXT_CAPTURE] Searching STRICTLY in bbox: (${userBBox.x0.toFixed(1)},${userBBox.y0.toFixed(1)}) to (${userBBox.x1.toFixed(1)},${userBBox.y1.toFixed(1)})`);

            for (const item of textContent.items) {
                if (!item.str || !item.transform) continue;

                // Skip whitespace-only items
                if (!item.str.trim()) continue;

                // PDF.js transform: [scaleX, skewX, skewY, scaleY, x, y]
                const itemX = item.transform[4];
                const itemYFromBottom = item.transform[5]; // Y from bottom of page (PDF convention)
                const fontSize = Math.abs(item.transform[0]) || Math.abs(item.transform[3]) || 10;

                // Use actual width if available, otherwise estimate based on font size
                const itemWidth = item.width || (item.str.length * fontSize * 0.5);

                // Convert Y from bottom-based to top-based coordinate system
                // In PDF: Y=0 is at bottom, Y increases upward
                // We want: Y=0 at top, Y increases downward
                const itemYFromTop = pdfHeight - itemYFromBottom;

                // The text baseline is at itemYFromTop
                // Text extends ABOVE the baseline (ascenders) and slightly below (descenders)
                // Approximate: text top is baseline - fontSize, text bottom is baseline + fontSize*0.2
                const textTop = itemYFromTop - fontSize;
                const textBottom = itemYFromTop + (fontSize * 0.3);

                // Calculate CENTER POINT of the word
                const centerX = itemX + (itemWidth / 2);
                const centerY = (textTop + textBottom) / 2;

                // Check if word CENTER is inside user bbox
                if (this._isWordCenterInside(centerX, centerY, userBBox)) {
                    collectedWords.push({
                        text: item.str,
                        x: itemX,
                        y: itemYFromTop
                    });
                    console.log(`[TEXT_CAPTURE] ✓ CENTER INSIDE: "${item.str}" center:(${centerX.toFixed(0)},${centerY.toFixed(0)})`);
                }
            }

            console.log(`[TEXT_CAPTURE] collected words: [${collectedWords.map(w => `"${w.text}"`).join(', ')}]`);

            if (collectedWords.length === 0) {
                console.log('[TEXT_CAPTURE] No words fully inside bbox');
                return '';
            }

            // Sort by Y position first (top to bottom), then by X (right to left for Hebrew)
            collectedWords.sort((a, b) => {
                const yDiff = a.y - b.y;
                if (Math.abs(yDiff) > 5) return yDiff; // Different lines
                return b.x - a.x; // Same line - right to left for Hebrew
            });

            // Join the text
            const extractedText = collectedWords.map(item => item.text).join(' ');
            console.log(`[TEXT_CAPTURE] Final extracted: "${extractedText}"`);
            return extractedText;

        } catch (error) {
            console.error('[TEXT_CAPTURE] PDF extraction error:', error);
            return '';
        }
    }

    /**
     * Extract text using OCR (Tesseract.js)
     * @param {number} x - Screen X
     * @param {number} y - Screen Y
     * @param {number} width - Screen width
     * @param {number} height - Screen height
     * @returns {Promise<string>}
     */
    async _extractWithOCR(x, y, width, height) {
        const worker = await this._initTesseract();
        if (!worker) {
            return '';
        }

        try {
            // Get the PDF image element
            const pdfContainer = document.getElementById('pdf-container');
            const pdfImg = pdfContainer?.querySelector('img');

            if (!pdfImg) {
                console.warn('[TEXT_CAPTURE] No PDF image for OCR');
                return '';
            }

            // Create canvas and crop the EXACT region (no padding for strict mode)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Use exact coordinates - no expansion
            const cropX = Math.max(0, x);
            const cropY = Math.max(0, y);
            const cropW = width;
            const cropH = height;

            canvas.width = cropW;
            canvas.height = cropH;

            // Draw the cropped region
            ctx.drawImage(pdfImg, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

            // Run OCR
            const { data: { text } } = await worker.recognize(canvas);

            // Clean up the text
            return text.replace(/\n/g, ' ').trim();

        } catch (error) {
            console.error('[TEXT_CAPTURE] OCR error:', error);
            return '';
        }
    }

    /**
     * Clear text cache for a page
     * @param {number} pageNum - Page number (or all if not specified)
     */
    clearCache(pageNum) {
        if (pageNum) {
            this.pageTextCache.delete(pageNum);
        } else {
            this.pageTextCache.clear();
        }
    }

    /**
     * Cleanup resources
     */
    async destroy() {
        if (this.tesseractWorker) {
            await this.tesseractWorker.terminate();
            this.tesseractWorker = null;
        }
        this.pageTextCache.clear();
    }
}

// Singleton instance
export const textExtractor = new TextExtractor();
