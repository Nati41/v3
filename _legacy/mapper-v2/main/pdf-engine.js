/**
 * Mapper PDF Engine - PDF rendering logic
 * These functions handle PDF loading, rendering, and dimension calculations.
 *
 * NOTE: All functions receive mapper state as parameters.
 * No internal "this" references - all state passed in.
 */
(function() {
    'use strict';

    // ============ PDF LOADING ============

    /**
     * Load a PDF file and initialize page data
     * @param {File} file - PDF file to load
     * @param {Object} mapper - FieldMapper instance for state access
     * @returns {Promise<Object>} PDF document info
     */
    async function loadPDF(file, mapper) {
        const arrayBuffer = await file.arrayBuffer();
        mapper.pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        mapper.totalPages = mapper.pdfDocument.numPages;
        mapper.currentPage = 1;
        mapper.pageCache = {};

        // Store the PDF data for preview
        mapper.pdfArrayBuffer = arrayBuffer;

        // CRITICAL FIX: Set pdfPageDimensions IMMEDIATELY after PDF loads
        // This ensures overlays can be rendered before loadPage completes
        try {
            const firstPage = await mapper.pdfDocument.getPage(1);
            const scale = mapper.dpiSetting / 72;
            mapper.pdfPageDimensions = firstPage.getViewport({ scale });
            console.log('✅ EARLY PDF DIMENSIONS SET:', mapper.pdfPageDimensions);
            mapper.setStatus('✅ PDF ממדים נקבעו - מצייר שדות...', 'success');

            // 🔁 Auto-render overlays once pdfPageDimensions is ready
            setTimeout(() => {
                try {
                    if (window.mapper && typeof window.mapper.renderOverlayFromJson === "function") {
                        console.log("🔁 Triggering overlay re-render (late init)");
                        window.mapper.renderOverlayFromJson();
                    } else {
                        console.warn("⚠️ Mapper or renderOverlayFromJson not ready yet");
                    }
                } catch (err) {
                    console.error("❌ Failed to auto-render overlays:", err);
                }
            }, 30);

            // Now render any queued fields
            if (mapper._pendingRenderFields && mapper._pendingRenderFields.length > 0) {
                console.log('✅ Rendering', mapper._pendingRenderFields.length, 'queued fields');
                const queuedFields = [...mapper._pendingRenderFields];
                mapper._pendingRenderFields = [];
                for (const field of queuedFields) {
                    await mapper.renderField(field);
                }
            }
        } catch (error) {
            console.error('❌ Failed to set early pdfPageDimensions:', error);
        }

        // Show page navigation
        const pageNav = document.getElementById('page-navigation');
        if (pageNav) pageNav.style.display = 'flex';

        mapper.updatePageSelector();
        mapper.updatePageInfo();

        // Load page for mapping (PNG)
        await mapper.loadPage(1);

        // Also load the preview
        await mapper.loadPreviewPage(1);

        // Migrate existing fields to new coordinate system
        await mapper.migrateFieldCoordinates();

        mapper.currentDocument = {
            type: 'pdf',
            pages: mapper.totalPages
        };

        return {
            numPages: mapper.totalPages,
            dimensions: mapper.pdfPageDimensions
        };
    }

    // ============ PAGE RENDERING ============

    /**
     * Load and render a specific PDF page for mapping
     * @param {number} pageNum - Page number to load
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function loadPage(pageNum, mapper) {
        if (pageNum < 1 || pageNum > mapper.totalPages) return;

        // Save current page view state before switching
        if (mapper.currentPage !== pageNum) {
            mapper.savePageViewState();
        }

        mapper.currentPage = pageNum;
        const container = document.getElementById('pdf-container');
        if (!container) return;

        // Check cache first
        if (mapper.pageCache[pageNum]) {
            // Ensure PDF dimensions are set even when loading from cache
            if (!mapper.pdfPageDimensions && mapper.pdfDocument) {
                const page = await mapper.pdfDocument.getPage(pageNum);
                const scale = mapper.dpiSetting / 72;
                mapper.pdfPageDimensions = page.getViewport({ scale });
                console.log("📐 PDF dimensions set from cache path:", mapper.pdfPageDimensions);
            }

            container.innerHTML = '';
            const img = document.createElement('img');
            img.src = mapper.pageCache[pageNum];
            img.style.width = '100%';
            img.style.height = 'auto';

            // FIX: Wait for image to load before updating fields
            await new Promise((resolve) => {
                img.onload = () => {
                    // Initialize base dimensions from cache
                    mapper.baseDimensions = {
                        width: img.offsetWidth,
                        height: img.offsetHeight
                    };
                    resolve();
                };
                container.appendChild(img);
            });

            await mapper.updateFieldsForPage(pageNum);
            mapper.updatePageInfo();
            mapper.restorePageViewState(pageNum);
            return;
        }

        // Show loading indicator
        container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';

        try {
            const page = await mapper.pdfDocument.getPage(pageNum);

            // Calculate scale based on DPI setting
            const scale = mapper.dpiSetting / 72; // 72 DPI is the default
            const viewport = page.getViewport({ scale });

            // Set PDF dimensions early - before any field rendering
            if (!mapper.pdfPageDimensions) {
                mapper.pdfPageDimensions = viewport;
                console.log("📐 PDF dimensions set early in loadPage:", mapper.pdfPageDimensions);
            }

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const context = canvas.getContext('2d');
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const dataUrl = canvas.toDataURL('image/png');
            mapper.pageCache[pageNum] = dataUrl;

            container.innerHTML = '';
            const img = document.createElement('img');
            img.src = dataUrl;
            img.style.width = '100%';
            img.style.height = 'auto';

            // FIX: Wait for image to load before updating fields
            await new Promise((resolve) => {
                img.onload = () => {
                    // Initialize base dimensions from PDF
                    mapper.baseDimensions = {
                        width: img.offsetWidth,
                        height: img.offsetHeight
                    };
                    resolve();
                };
                container.appendChild(img);
            });

            await mapper.updateFieldsForPage(pageNum);
            mapper.updatePageInfo();
            mapper.restorePageViewState(pageNum);

        } catch (error) {
            mapper.setStatus('שגיאה בטעינת עמוד', 'error');
            console.error('Page loading error:', error);
        }
    }

    /**
     * Load and render a specific PDF page for preview
     * @param {number} pageNum - Page number to load
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function loadPreviewPage(pageNum, mapper) {
        // Guards to prevent invalid page errors
        if (!mapper.pdfDocument || !mapper.totalPages) {
            console.warn("PDF not fully loaded yet — skipping preview load.");
            return;
        }

        if (pageNum < 1 || pageNum > mapper.totalPages) {
            console.warn("Requested page is out of range — skipping.");
            return;
        }

        const previewContainer = document.getElementById('preview-container');
        if (!previewContainer) return;

        try {
            const page = await mapper.pdfDocument.getPage(pageNum);
            const scale = 1.5; // Fixed scale for preview
            const viewport = page.getViewport({ scale });

            // Create canvas for preview
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = '100%';
            canvas.style.height = 'auto';

            const context = canvas.getContext('2d');
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Now render field overlays from JSON coordinates
            await mapper.renderFieldsOnPreviewCanvas(context, viewport, pageNum);

            previewContainer.innerHTML = '';
            previewContainer.appendChild(canvas);

        } catch (error) {
            console.error('Preview loading error:', error);
        }
    }

    /**
     * Load an image file for mapping
     * @param {File} file - Image file to load
     * @param {Object} mapper - FieldMapper instance for state access
     * @returns {Promise<void>}
     */
    async function loadImage(file, mapper) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const container = document.getElementById('pdf-container');
                const previewContainer = document.getElementById('preview-container');
                if (!container) return reject('Container not found');

                // Load for mapping view
                container.innerHTML = '';
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.width = '100%';
                img.style.height = 'auto';

                // Load for preview view
                if (previewContainer) {
                    previewContainer.innerHTML = '';
                    const previewImg = document.createElement('img');
                    previewImg.src = e.target.result;
                    previewImg.style.width = '100%';
                    previewImg.style.height = 'auto';
                    previewContainer.appendChild(previewImg);
                }

                img.onload = () => {
                    mapper.currentDocument = {
                        type: 'image',
                        data: e.target.result,
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                        pages: 1
                    };
                    mapper.totalPages = 1;
                    mapper.currentPage = 1;

                    // Initialize base dimensions from image
                    mapper.baseDimensions = {
                        width: img.offsetWidth,
                        height: img.offsetHeight
                    };

                    // Update mapping system
                    setTimeout(() => mapper.resizeHandler(), 100);

                    resolve();
                };

                img.onerror = () => reject('Failed to load image');
                container.appendChild(img);
            };
            reader.onerror = () => reject('Failed to read file');
            reader.readAsDataURL(file);
        });
    }

    // ============ LIVE FILL RENDERING ============

    /**
     * Render original PDF for live fill mode
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function renderPDFForLiveFill(mapper) {
        if (!mapper.pdfDocument) return;

        try {
            mapper.setStatus('מעבר למצב מילוי חי - מעבד PDF מקורי...', 'info');

            const page = await mapper.pdfDocument.getPage(mapper.currentPage);

            // Get preview viewport for proper scaling
            const previewViewport = document.getElementById('preview-viewport');
            const availableWidth = previewViewport ? previewViewport.clientWidth - 40 : 800; // Account for margins

            // Calculate scale to fit width while maintaining aspect ratio
            const originalViewport = page.getViewport({ scale: 1.0 });
            const scale = Math.min(availableWidth / originalViewport.width, 2.0); // Max 2x scale
            const viewport = page.getViewport({ scale });

            // NEW ARCHITECTURE: Render PDF in preview container for live fill
            const previewContainer = document.getElementById('preview-container');
            if (previewContainer) {
                // Clear existing content
                previewContainer.innerHTML = '';

                // Create canvas for PDF.js
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                // Set CSS dimensions for proper display and scrolling
                canvas.style.width = viewport.width + 'px';
                canvas.style.height = viewport.height + 'px';
                canvas.style.display = 'block';

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };

                await page.render(renderContext).promise;
                previewContainer.appendChild(canvas);

                // Store viewport for coordinate calculations
                mapper.liveFillViewport = viewport;

                // Clear mapping references
                mapper.mappingCanvas = null;
                mapper.mappingImageData = null;
            }

            mapper.setStatus('PDF מוכן למילוי חי', 'success');
            mapper.showToast('🔹 מצב מילוי חי: עובד עם PDF מקורי בלבד - אין תמונה!', 'info');

            // Update text previews after PDF re-render (for zoom changes)
            setTimeout(() => {
                mapper.updateAllTextPreviews();
            }, 100);

        } catch (error) {
            console.error('Error rendering PDF for live fill:', error);
            mapper.setStatus('שגיאה בעיבוד PDF למילוי חי: ' + error.message, 'error');
        }
    }

    /**
     * Refresh PDF preview with current field data
     * @param {Object} mapper - FieldMapper instance for state access
     */
    async function refreshPdfPreview(mapper) {
        if (mapper.appMode === 'livefill' && mapper.currentPage) {
            await loadPreviewPage(mapper.currentPage, mapper);
        }
    }

    // ============ DIMENSION HELPERS ============

    /**
     * Save base dimensions for percentage calculations
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function saveBaseDimensions(mapper) {
        const container = document.getElementById('mapping-layer');
        const pdfContainer = document.getElementById('pdf-container');

        if (!container) {
            return;
        }

        // Try to get dimensions from loaded image
        const img = pdfContainer?.querySelector('img');
        if (img && img.complete && img.offsetWidth > 0) {
            mapper.baseDimensions = {
                width: img.offsetWidth,
                height: img.offsetHeight
            };
        } else {
            // Fallback to container dimensions
            mapper.baseDimensions = {
                width: container.offsetWidth,
                height: container.offsetHeight
            };
        }

        // If still failed, retry after short delay
        if (mapper.baseDimensions.width === 0 || mapper.baseDimensions.height === 0) {
            setTimeout(() => saveBaseDimensions(mapper), 100);
        }
    }

    /**
     * Get logical width for coordinate calculations
     * @param {HTMLElement} container - Container element
     * @param {Object} baseDimensions - Base dimensions object
     * @returns {number} Logical width
     */
    function getLogicalWidth(container, baseDimensions) {
        let width = 0;

        if (baseDimensions.width > 0) {
            width = baseDimensions.width;
        } else {
            // Fallback - try to get from image or PDF
            const pdfContainer = document.getElementById('pdf-container');
            const img = pdfContainer?.querySelector('img');
            if (img && img.offsetWidth > 0) {
                width = img.offsetWidth;
            } else {
                width = container.offsetWidth;
            }
        }

        return width;
    }

    /**
     * Get logical height for coordinate calculations
     * @param {HTMLElement} container - Container element
     * @param {Object} baseDimensions - Base dimensions object
     * @returns {number} Logical height
     */
    function getLogicalHeight(container, baseDimensions) {
        let height = 0;

        if (baseDimensions.height > 0) {
            height = baseDimensions.height;
        } else {
            // Fallback - try to get from image or PDF
            const pdfContainer = document.getElementById('pdf-container');
            const img = pdfContainer?.querySelector('img');
            if (img && img.offsetHeight > 0) {
                height = img.offsetHeight;
            } else {
                height = container.offsetHeight;
            }
        }

        return height;
    }

    // ============ EXPORT ============

    window.MapperPdfEngine = {
        loadPDF,
        loadPage,
        loadPreviewPage,
        loadImage,
        renderPDFForLiveFill,
        refreshPdfPreview,
        saveBaseDimensions,
        getLogicalWidth,
        getLogicalHeight
    };
})();
