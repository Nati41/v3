/**
 * PDFService - Unified PDF loading and rendering service
 * Supports: Mapper-v3, LiveFill, Mobile-Fill
 *
 * Based on:
 *   /src/mapper-v3/engines/PDFEngine.js
 *   /src/livefill/main-livefill.js (PDF loading section)
 *
 * Created for: Phase 1 - Foundation
 *
 * Features:
 * - Load PDF from File or ArrayBuffer
 * - Multiple rendering strategies (canvas vs image)
 * - Per-page viewport management
 * - Page caching
 * - Coordinate service integration
 *
 * Usage:
 *   import { PDFService, createPDFService } from '../core/PDFService.js';
 *
 *   const pdfService = createPDFService();
 *   await pdfService.loadFromFile(file);
 *   const viewport = pdfService.getPageViewport(1);
 */

'use strict';

import { eventBus, Events } from './UnifiedEventBus.js';
import { getCoordinateService } from './CoordinateService.js';

// ============ CONSTANTS ============

export const PDF_DPI = 72;           // PDF.js default DPI
export const DEFAULT_RENDER_DPI = 300;  // High-quality render DPI (Mapper style)
export const DEFAULT_RENDER_SCALE = 2.0; // LiveFill style render scale

/**
 * Rendering strategies
 */
export const RenderStrategy = {
    IMAGE: 'image',    // Render to canvas, convert to PNG, display as <img> (Mapper style)
    CANVAS: 'canvas'   // Render directly to canvas, use CSS zoom (LiveFill style)
};

// ============ PDF SERVICE CLASS ============

export class PDFService {
    constructor(options = {}) {
        // PDF.js document
        this.pdfDocument = null;

        // Raw PDF data
        this.pdfBytes = null;
        this.pdfBytesSafe = null;
        this.fileName = null;

        // Page data
        this.pageCount = 0;
        this.currentPage = 1;

        // Viewports (per page)
        this.pageViewports = {};      // { 1: viewport, 2: viewport, ... }
        this.baseViewports = {};      // Scale 1.0 viewports
        this.canvasSizes = {};        // { 1: {width, height}, ... }

        // Page cache (for image strategy)
        this.pageCache = {};          // { 1: dataUrl, ... }
        this.canvasCache = {};        // { 1: canvas, ... }

        // Settings
        this.renderDpi = options.dpi || DEFAULT_RENDER_DPI;
        this.renderScale = options.renderScale || DEFAULT_RENDER_SCALE;
        this.renderStrategy = options.renderStrategy || RenderStrategy.IMAGE;

        // State
        this.loaded = false;
    }

    // ============ LOADING ============

    /**
     * Load PDF from a File object
     * @param {File} file - PDF file
     * @param {Object} options - Load options
     * @returns {Promise<Object>} Load result
     */
    async loadFromFile(file, options = {}) {
        try {
            // Validate file
            if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
                throw new Error('Invalid PDF file');
            }

            // Check file size (optional limit)
            const maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB default
            if (file.size > maxSize) {
                throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${maxSize / 1024 / 1024}MB)`);
            }

            // Read file
            const arrayBuffer = await file.arrayBuffer();
            this.fileName = file.name;

            return await this._loadFromArrayBuffer(arrayBuffer);

        } catch (error) {
            console.error('[PDFService] Failed to load file:', error);
            eventBus.emit(Events.PDF_ERROR, { error: error.message });
            throw error;
        }
    }

    /**
     * Load PDF from ArrayBuffer
     * @param {ArrayBuffer} arrayBuffer - PDF data
     * @param {string} fileName - File name
     * @returns {Promise<Object>} Load result
     */
    async loadFromBytes(arrayBuffer, fileName = 'document.pdf') {
        this.fileName = fileName;
        return await this._loadFromArrayBuffer(arrayBuffer);
    }

    /**
     * Load from an already-loaded pdf.js document
     * @param {PDFDocumentProxy} pdfDoc - pdf.js document
     * @param {string} fileName - File name
     * @param {ArrayBuffer} pdfBytes - Optional PDF bytes for export
     * @returns {Promise<Object>} Load result
     */
    async loadFromDocument(pdfDoc, fileName = 'document.pdf', pdfBytes = null) {
        try {
            this.pdfDocument = pdfDoc;
            this.fileName = fileName;
            this.pageCount = pdfDoc.numPages;
            this.currentPage = 1;

            if (pdfBytes) {
                this.pdfBytes = pdfBytes;
                this.pdfBytesSafe = new Uint8Array(pdfBytes);
            }

            // Clear caches
            this.pageCache = {};
            this.canvasCache = {};
            this.pageViewports = {};
            this.baseViewports = {};
            this.canvasSizes = {};

            // Get first page viewport
            await this._initializeViewport(1);

            this.loaded = true;

            const result = {
                fileName: this.fileName,
                pageCount: this.pageCount,
                pdfDocument: this.pdfDocument
            };

            eventBus.emit(Events.PDF_LOADED, {
                pdfName: this.fileName,
                pageCount: this.pageCount,
                pdfJsDoc: this.pdfDocument,
                pdfBytes: this.pdfBytes
            });

            return result;

        } catch (error) {
            console.error('[PDFService] Failed to load from document:', error);
            eventBus.emit(Events.PDF_ERROR, { error: error.message });
            throw error;
        }
    }

    /**
     * Internal: Load from ArrayBuffer
     * @private
     */
    async _loadFromArrayBuffer(arrayBuffer) {
        // Store copies of PDF data
        this.pdfBytes = arrayBuffer;
        this.pdfBytesSafe = new Uint8Array(arrayBuffer.slice(0));

        // Clear caches
        this.pageCache = {};
        this.canvasCache = {};
        this.pageViewports = {};
        this.baseViewports = {};
        this.canvasSizes = {};

        // Load with pdf.js
        // Check for pdfjsLib
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('pdf.js library not loaded');
        }

        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true
        });

        this.pdfDocument = await loadingTask.promise;
        this.pageCount = this.pdfDocument.numPages;
        this.currentPage = 1;

        // Get first page viewport
        await this._initializeViewport(1);

        this.loaded = true;

        const result = {
            fileName: this.fileName,
            pageCount: this.pageCount,
            pdfDocument: this.pdfDocument
        };

        eventBus.emit(Events.PDF_LOADED, {
            pdfName: this.fileName,
            pageCount: this.pageCount,
            pdfJsDoc: this.pdfDocument,
            pdfBytes: this.pdfBytes
        });

        console.log('[PDFService] PDF loaded:', this.fileName, this.pageCount, 'pages');

        return result;
    }

    /**
     * Initialize viewport for a page
     * @private
     */
    async _initializeViewport(pageNum) {
        const page = await this.pdfDocument.getPage(pageNum);

        // Base viewport (scale 1.0)
        const baseViewport = page.getViewport({ scale: 1.0 });
        this.baseViewports[pageNum] = baseViewport;

        // Render viewport (based on strategy)
        let renderViewport;
        if (this.renderStrategy === RenderStrategy.IMAGE) {
            // Mapper style: DPI-based scaling
            const scale = this.renderDpi / PDF_DPI;
            renderViewport = page.getViewport({ scale });
        } else {
            // LiveFill style: Fixed scale with DPR
            const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
            const scale = this.renderScale * dpr;
            renderViewport = page.getViewport({ scale });
        }

        this.pageViewports[pageNum] = renderViewport;
        this.canvasSizes[pageNum] = {
            width: renderViewport.width,
            height: renderViewport.height
        };

        return renderViewport;
    }

    // ============ DOCUMENT INFO ============

    /**
     * Check if a PDF is loaded
     * @returns {boolean}
     */
    isLoaded() {
        return this.loaded && this.pdfDocument !== null;
    }

    /**
     * Get pdf.js document
     * @returns {PDFDocumentProxy|null}
     */
    getDocument() {
        return this.pdfDocument;
    }

    /**
     * Get PDF bytes for export
     * @returns {Uint8Array|null}
     */
    getBytes() {
        return this.pdfBytesSafe;
    }

    /**
     * Get PDF bytes as ArrayBuffer
     * @returns {ArrayBuffer|null}
     */
    getBytesAsArrayBuffer() {
        return this.pdfBytes;
    }

    /**
     * Get file name
     * @returns {string|null}
     */
    getFileName() {
        return this.fileName;
    }

    /**
     * Get page count
     * @returns {number}
     */
    getPageCount() {
        return this.pageCount;
    }

    /**
     * Get current page number
     * @returns {number}
     */
    getCurrentPage() {
        return this.currentPage;
    }

    // ============ VIEWPORTS ============

    /**
     * Get base viewport for a page (scale 1.0)
     * @param {number} pageNum - Page number
     * @returns {Object|null} pdf.js viewport
     */
    getBaseViewport(pageNum) {
        return this.baseViewports[pageNum] || null;
    }

    /**
     * Get render viewport for a page
     * @param {number} pageNum - Page number
     * @returns {Object|null} pdf.js viewport
     */
    getPageViewport(pageNum) {
        return this.pageViewports[pageNum] || null;
    }

    /**
     * Get viewport at custom scale
     * @param {number} pageNum - Page number
     * @param {number} scale - Scale factor
     * @returns {Promise<Object>} pdf.js viewport
     */
    async getViewportAtScale(pageNum, scale) {
        if (!this.pdfDocument || pageNum < 1 || pageNum > this.pageCount) {
            return null;
        }

        const page = await this.pdfDocument.getPage(pageNum);
        return page.getViewport({ scale });
    }

    /**
     * Get page dimensions (in PDF points)
     * @param {number} pageNum - Page number
     * @returns {Object|null} { width, height }
     */
    getPageDimensions(pageNum) {
        const baseViewport = this.baseViewports[pageNum];
        if (!baseViewport) return null;

        return {
            width: baseViewport.width,
            height: baseViewport.height
        };
    }

    /**
     * Get canvas size for a page
     * @param {number} pageNum - Page number
     * @returns {Object|null} { width, height }
     */
    getCanvasSize(pageNum) {
        return this.canvasSizes[pageNum] || null;
    }

    /**
     * Get all page viewports
     * @returns {Object} { 1: viewport, 2: viewport, ... }
     */
    getAllViewports() {
        return { ...this.pageViewports };
    }

    /**
     * Get all canvas sizes
     * @returns {Object} { 1: {width, height}, ... }
     */
    getAllCanvasSizes() {
        return { ...this.canvasSizes };
    }

    // ============ RENDERING ============

    /**
     * Render page to a canvas
     * @param {number} pageNum - Page number
     * @param {HTMLCanvasElement} canvas - Target canvas
     * @param {Object} options - Render options
     * @returns {Promise<void>}
     */
    async renderPageToCanvas(pageNum, canvas, options = {}) {
        if (!this.pdfDocument || pageNum < 1 || pageNum > this.pageCount) {
            throw new Error('Invalid page number or no PDF loaded');
        }

        const page = await this.pdfDocument.getPage(pageNum);

        // Get or create viewport
        let viewport = this.pageViewports[pageNum];
        if (!viewport || options.scale) {
            const scale = options.scale || (this.renderStrategy === RenderStrategy.IMAGE
                ? this.renderDpi / PDF_DPI
                : this.renderScale * (window.devicePixelRatio || 1));
            viewport = page.getViewport({ scale });
        }

        // Set canvas size
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');

        // Clear canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Render
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Store viewport info on canvas
        canvas._viewport = viewport;
        canvas._pageNum = pageNum;
        canvas._renderScale = options.scale || this.renderScale;

        // Cache canvas if needed
        if (options.cache !== false) {
            this.canvasCache[pageNum] = canvas;
        }

        // Update viewport storage
        if (!this.pageViewports[pageNum]) {
            this.pageViewports[pageNum] = viewport;
            this.canvasSizes[pageNum] = { width: canvas.width, height: canvas.height };
        }
    }

    /**
     * Render page to PNG data URL (Mapper style)
     * @param {number} pageNum - Page number
     * @param {Object} options - Render options
     * @returns {Promise<string>} Data URL
     */
    async renderPageToImage(pageNum, options = {}) {
        // Check cache
        if (!options.noCache && this.pageCache[pageNum]) {
            return this.pageCache[pageNum];
        }

        if (!this.pdfDocument || pageNum < 1 || pageNum > this.pageCount) {
            throw new Error('Invalid page number or no PDF loaded');
        }

        const page = await this.pdfDocument.getPage(pageNum);

        // Calculate scale
        const scale = options.scale || this.renderDpi / PDF_DPI;
        const viewport = page.getViewport({ scale });

        // Create temporary canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');

        // Render
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/png');

        // Cache
        if (options.cache !== false) {
            this.pageCache[pageNum] = dataUrl;
        }

        // Store viewport
        if (!this.pageViewports[pageNum]) {
            this.pageViewports[pageNum] = viewport;
            this.canvasSizes[pageNum] = { width: canvas.width, height: canvas.height };
        }

        return dataUrl;
    }

    /**
     * Get cached page image
     * @param {number} pageNum - Page number
     * @returns {string|null} Data URL or null
     */
    getCachedPageImage(pageNum) {
        return this.pageCache[pageNum] || null;
    }

    /**
     * Get cached page canvas
     * @param {number} pageNum - Page number
     * @returns {HTMLCanvasElement|null}
     */
    getCachedPageCanvas(pageNum) {
        return this.canvasCache[pageNum] || null;
    }

    // ============ NAVIGATION ============

    /**
     * Go to a specific page
     * @param {number} pageNum - Page number
     */
    async goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.pageCount) return;

        const oldPage = this.currentPage;
        this.currentPage = pageNum;

        // Ensure viewport is initialized
        if (!this.pageViewports[pageNum]) {
            await this._initializeViewport(pageNum);
        }

        eventBus.emit(Events.PDF_PAGE_CHANGED, { page: pageNum, oldPage });
    }

    /**
     * Go to next page
     */
    async nextPage() {
        if (this.currentPage < this.pageCount) {
            await this.goToPage(this.currentPage + 1);
        }
    }

    /**
     * Go to previous page
     */
    async prevPage() {
        if (this.currentPage > 1) {
            await this.goToPage(this.currentPage - 1);
        }
    }

    // ============ COORDINATE SERVICE ============

    /**
     * Get CoordinateService for a page
     * @param {number} pageNum - Page number
     * @returns {CoordinateService|null}
     */
    getCoordinateService(pageNum) {
        const viewport = this.pageViewports[pageNum];
        if (!viewport) return null;

        return getCoordinateService(viewport, this.renderScale);
    }

    // ============ PRELOADING ============

    /**
     * Preload multiple pages
     * @param {Array<number>} pageNums - Page numbers to preload
     * @returns {Promise<void>}
     */
    async preloadPages(pageNums) {
        const promises = pageNums
            .filter(num => num >= 1 && num <= this.pageCount)
            .filter(num => !this.pageViewports[num])
            .map(num => this._initializeViewport(num));

        await Promise.all(promises);
    }

    /**
     * Preload all pages
     * @returns {Promise<void>}
     */
    async preloadAllPages() {
        const pageNums = Array.from({ length: this.pageCount }, (_, i) => i + 1);
        await this.preloadPages(pageNums);
    }

    // ============ CLEANUP ============

    /**
     * Clear page cache
     */
    clearCache() {
        this.pageCache = {};
        this.canvasCache = {};
    }

    /**
     * Close and cleanup
     */
    close() {
        if (this.pdfDocument) {
            this.pdfDocument.destroy();
        }

        this.pdfDocument = null;
        this.pdfBytes = null;
        this.pdfBytesSafe = null;
        this.fileName = null;
        this.pageCount = 0;
        this.currentPage = 1;
        this.loaded = false;

        this.pageCache = {};
        this.canvasCache = {};
        this.pageViewports = {};
        this.baseViewports = {};
        this.canvasSizes = {};

        eventBus.emit(Events.PDF_UNLOADED);
    }

    /**
     * Reset (alias for close)
     */
    reset() {
        this.close();
    }
}

// ============ FACTORY FUNCTIONS ============

/**
 * Create a new PDFService instance
 * @param {Object} options - Service options
 * @returns {PDFService}
 */
export function createPDFService(options = {}) {
    return new PDFService(options);
}

/**
 * Create PDFService with Mapper-style rendering (high DPI, image output)
 * @param {Object} options - Additional options
 * @returns {PDFService}
 */
export function createMapperPDFService(options = {}) {
    return new PDFService({
        dpi: 300,
        renderStrategy: RenderStrategy.IMAGE,
        ...options
    });
}

/**
 * Create PDFService with LiveFill-style rendering (canvas, CSS zoom)
 * @param {Object} options - Additional options
 * @returns {PDFService}
 */
export function createLiveFillPDFService(options = {}) {
    return new PDFService({
        renderScale: 2.0,
        renderStrategy: RenderStrategy.CANVAS,
        ...options
    });
}

// ============ GLOBAL EXPORT ============

if (typeof window !== 'undefined') {
    window.PDFService = {
        PDFService,
        createPDFService,
        createMapperPDFService,
        createLiveFillPDFService,
        RenderStrategy,
        PDF_DPI,
        DEFAULT_RENDER_DPI,
        DEFAULT_RENDER_SCALE
    };
}
