/**
 * PDFEngine - PDF Rendering for Mapper V3
 * EXACT PORT from legacy pdf-engine.js
 *
 * Key features (from legacy):
 * - Renders PDF at 300 DPI to canvas
 * - Converts to PNG data URL
 * - Displays as <img> element (NOT canvas!)
 * - Caches PNG per page for fast switching
 * - Sets pdfPageDimensions EARLY before overlay render
 */
import { state } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';

// ============ CONSTANTS (EXACT from legacy) ============
export const PDF_DPI = 72;           // PDF.js default DPI
export const RENDER_DPI = 300;       // High-quality render DPI
export const CHECKBOX_SIZE = 20;     // Default checkbox overlay size
export const RADIO_SIZE = 16;        // Default radio overlay size

export class PDFEngine {
    constructor() {
        this.pdfDocument = null;
        this.pageCache = {};         // PNG data URLs per page (object, not Map - like legacy)
        this.pdfPageDimensions = null;
        this.baseDimensions = { width: 0, height: 0 };
        this.dpiSetting = RENDER_DPI;
        this.currentPage = 1;
        this.totalPages = 0;

        // DOM references
        this.pdfContainer = null;
        this.mappingLayer = null;
    }

    /**
     * Initialize the PDF engine
     * EXACT structure from legacy
     * @param {Object} options - Configuration options
     */
    init(options = {}) {
        this.options = {
            pdfContainerId: 'pdf-container',
            mappingLayerId: 'overlay-layer',
            dpi: RENDER_DPI,
            ...options
        };

        this.dpiSetting = this.options.dpi;
        this.pdfContainer = document.getElementById(this.options.pdfContainerId);
        this.mappingLayer = document.getElementById(this.options.mappingLayerId);

        if (!this.pdfContainer) {
            console.warn('[PDFEngine] PDF container not found:', this.options.pdfContainerId);
        }

        console.log('[PDFEngine] Initialized with DPI:', this.dpiSetting);
    }

    /**
     * Get DPI scale factor
     * EXACT formula from legacy: dpiSetting / 72
     * @returns {number} Scale factor (e.g., 300/72 = 4.167)
     */
    getDpiScale() {
        return this.dpiSetting / PDF_DPI;
    }

    /**
     * Get current PDF page dimensions
     * @returns {Object|null} { width, height, scale }
     */
    getPdfPageDimensions() {
        return this.pdfPageDimensions;
    }

    /**
     * Load a PDF file
     * EXACT PORT from legacy loadPDF()
     * @param {File} file - PDF file to load
     */
    async load(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            this.pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            this.totalPages = this.pdfDocument.numPages;
            this.currentPage = 1;
            this.pageCache = {};

            // Update state
            state.batch({
                'document.loaded': true,
                'document.fileName': file.name.replace('.pdf', ''),
                'document.totalPages': this.totalPages,
                'document.currentPage': 1
            });

            // ============ CRITICAL: Set pdfPageDimensions IMMEDIATELY ============
            // This MUST happen before ANY overlay rendering (EXACT from legacy)
            const firstPage = await this.pdfDocument.getPage(1);
            const scale = this.getDpiScale();  // 300/72 = 4.167
            const viewport = firstPage.getViewport({ scale });

            this.pdfPageDimensions = {
                width: viewport.width,
                height: viewport.height,
                scale: scale
            };

            console.log('✅ [PDFEngine] EARLY PDF DIMENSIONS SET:', this.pdfPageDimensions);

            // Update state with PDF dimensions
            state.set('pdfDimensions', {
                width: viewport.width,
                height: viewport.height,
                scale: scale
            });

            // Now load and render the first page (as PNG image)
            await this.loadPage(1);

            eventBus.emit(Events.PDF_LOADED, {
                numPages: this.totalPages,
                dimensions: this.pdfPageDimensions
            });

            console.log('[PDFEngine] PDF loaded:', file.name, this.totalPages, 'pages');

            // ============ Trigger overlay re-render after delay (from legacy) ============
            setTimeout(() => {
                eventBus.emit(Events.PDF_PAGE_CHANGED, { page: 1 });
            }, 30);

        } catch (error) {
            console.error('[PDFEngine] Failed to load PDF:', error);
            eventBus.emit(Events.PDF_ERROR, { error });
            throw error;
        }
    }

    /**
     * Load and render a specific page
     * EXACT PORT from legacy loadPage()
     * - Renders to canvas at high DPI (300)
     * - Converts canvas to PNG data URL
     * - Displays as <img> element with width: 100%
     * @param {number} pageNum - Page number to load
     */
    async loadPage(pageNum) {
        if (!this.pdfDocument || pageNum < 1 || pageNum > this.totalPages) {
            return;
        }

        if (!this.pdfContainer) {
            console.warn('[PDFEngine] No PDF container');
            return;
        }

        this.currentPage = pageNum;
        state.set('document.currentPage', pageNum);

        // ============ Check cache first (EXACT from legacy) ============
        if (this.pageCache[pageNum]) {
            console.log('[PDFEngine] Loading from cache, page:', pageNum);

            // Ensure PDF dimensions are set even from cache
            if (!this.pdfPageDimensions && this.pdfDocument) {
                const page = await this.pdfDocument.getPage(pageNum);
                const scale = this.getDpiScale();
                this.pdfPageDimensions = page.getViewport({ scale });
                console.log('📐 [PDFEngine] PDF dimensions set from cache path:', this.pdfPageDimensions);
            }

            this.pdfContainer.innerHTML = '';
            const img = document.createElement('img');
            img.src = this.pageCache[pageNum];
            img.style.width = '100%';
            img.style.height = 'auto';

            // Wait for image to load before updating overlay (EXACT from legacy)
            await new Promise((resolve) => {
                img.onload = () => {
                    this.baseDimensions = {
                        width: img.offsetWidth,
                        height: img.offsetHeight
                    };
                    this._updateOverlaySize();
                    resolve();
                };
                this.pdfContainer.appendChild(img);
            });

            eventBus.emit(Events.PDF_PAGE_CHANGED, { page: pageNum });
            return;
        }

        // Show loading indicator (EXACT from legacy)
        this.pdfContainer.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';

        try {
            const page = await this.pdfDocument.getPage(pageNum);

            // ============ Calculate scale based on DPI setting ============
            // EXACT formula from legacy: dpiSetting / 72
            const scale = this.getDpiScale();
            const viewport = page.getViewport({ scale });

            // Set PDF dimensions early
            if (!this.pdfPageDimensions) {
                this.pdfPageDimensions = {
                    width: viewport.width,
                    height: viewport.height,
                    scale: scale
                };
                console.log('📐 [PDFEngine] PDF dimensions set in loadPage:', this.pdfPageDimensions);
            }

            // ============ Create canvas for high-DPI rendering ============
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const context = canvas.getContext('2d');

            // Render PDF to canvas
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // ============ Convert canvas to PNG data URL ============
            const dataUrl = canvas.toDataURL('image/png');

            // Cache the PNG (EXACT from legacy)
            this.pageCache[pageNum] = dataUrl;

            // ============ Display as <img> element ============
            this.pdfContainer.innerHTML = '';
            const img = document.createElement('img');
            img.src = dataUrl;
            img.style.width = '100%';
            img.style.height = 'auto';

            // Wait for image to load (EXACT from legacy)
            await new Promise((resolve) => {
                img.onload = () => {
                    this.baseDimensions = {
                        width: img.offsetWidth,
                        height: img.offsetHeight
                    };
                    this._updateOverlaySize();
                    resolve();
                };
                this.pdfContainer.appendChild(img);
            });

            console.log('[PDFEngine] Page rendered:', pageNum, 'baseDimensions:', this.baseDimensions);

            eventBus.emit(Events.PDF_PAGE_CHANGED, { page: pageNum });

        } catch (error) {
            console.error('[PDFEngine] Page loading error:', error);
            this.pdfContainer.innerHTML = `<div class="error-message">שגיאה בטעינת עמוד</div>`;
        }
    }

    /**
     * Update overlay layer size to match PDF image
     * This ensures the overlay perfectly aligns with the PDF
     */
    _updateOverlaySize() {
        if (!this.mappingLayer || !this.pdfContainer) return;

        const img = this.pdfContainer.querySelector('img');
        if (img) {
            this.mappingLayer.style.width = `${img.offsetWidth}px`;
            this.mappingLayer.style.height = `${img.offsetHeight}px`;
            console.log('[PDFEngine] Overlay size updated:', img.offsetWidth, 'x', img.offsetHeight);
        }
    }

    /**
     * Go to next page
     */
    async nextPage() {
        if (this.currentPage < this.totalPages) {
            await this.loadPage(this.currentPage + 1);
        }
    }

    /**
     * Go to previous page
     */
    async prevPage() {
        if (this.currentPage > 1) {
            await this.loadPage(this.currentPage - 1);
        }
    }

    /**
     * Go to specific page
     * @param {number} pageNum - Page number
     */
    async goToPage(pageNum) {
        if (pageNum >= 1 && pageNum <= this.totalPages) {
            await this.loadPage(pageNum);
        }
    }

    /**
     * Get base dimensions (displayed image size)
     * @returns {Object} { width, height }
     */
    getBaseDimensions() {
        return { ...this.baseDimensions };
    }

    /**
     * Get logical width for coordinate calculations
     * EXACT from legacy getLogicalWidth()
     * @returns {number}
     */
    getLogicalWidth() {
        if (this.baseDimensions.width > 0) {
            return this.baseDimensions.width;
        }

        const img = this.pdfContainer?.querySelector('img');
        if (img && img.offsetWidth > 0) {
            return img.offsetWidth;
        }

        return this.mappingLayer?.offsetWidth || 0;
    }

    /**
     * Get logical height for coordinate calculations
     * EXACT from legacy getLogicalHeight()
     * @returns {number}
     */
    getLogicalHeight() {
        if (this.baseDimensions.height > 0) {
            return this.baseDimensions.height;
        }

        const img = this.pdfContainer?.querySelector('img');
        if (img && img.offsetHeight > 0) {
            return img.offsetHeight;
        }

        return this.mappingLayer?.offsetHeight || 0;
    }

    /**
     * Clear page cache
     */
    clearCache() {
        this.pageCache = {};
    }

    /**
     * Reset the engine
     */
    reset() {
        this.pdfDocument = null;
        this.pageCache = {};
        this.pdfPageDimensions = null;
        this.baseDimensions = { width: 0, height: 0 };
        this.currentPage = 1;
        this.totalPages = 0;

        if (this.pdfContainer) {
            this.pdfContainer.innerHTML = '';
        }

        console.log('[PDFEngine] Reset');
    }
    /**
     * Get pixel data from the rendered PDF page
     * Used by AutoBoxer for physics detection
     * @param {number} x - Start X
     * @param {number} y - Start Y
     * @param {number} w - Width
     * @param {number} h - Height
     * @returns {Promise<ImageData|null>}
     */
    async getPixelData(x, y, w, h) {
        if (!this.pdfContainer) return null;

        const img = this.pdfContainer.querySelector('img');
        if (!img) return null;

        try {
            // Create a temporary canvas
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');

            // Draw only the requested slice
            // source coords: x, y, w, h
            // dest coords: 0, 0, w, h
            ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

            return ctx.getImageData(0, 0, w, h);
        } catch (error) {
            console.error('[PDFEngine] getPixelData error:', error);
            return null;
        }
    }
}

// Singleton instance
export const pdfEngine = new PDFEngine();
