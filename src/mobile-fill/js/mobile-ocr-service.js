/**
 * mobile-ocr-service.js
 * OCR service for MobileFill - extracts text from images using Tesseract.js
 *
 * Usage:
 * 1. User taps attachment button in input panel
 * 2. Captures image from camera or gallery
 * 3. Runs OCR to extract text
 * 4. Shows preview modal for user to confirm/edit
 * 5. Applies text to current field
 */
(function() {
    'use strict';

    let tesseractWorker = null;
    let tesseractLoading = false;
    let modalEl = null;
    let previewImageEl = null;
    let extractedTextEl = null;
    let loadingIndicator = null;
    let currentCallback = null;

    function init() {
        createModal();
        console.log('[MobileFill] OCR service initialized');
    }

    /**
     * Initialize Tesseract worker (lazy loading)
     */
    async function initTesseract() {
        if (tesseractWorker) return tesseractWorker;
        if (tesseractLoading) {
            // Wait for existing loading
            while (tesseractLoading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return tesseractWorker;
        }

        tesseractLoading = true;

        try {
            if (typeof Tesseract === 'undefined') {
                console.warn('[MobileFill OCR] Tesseract.js not loaded');
                tesseractLoading = false;
                if (window.MobileFillToast) {
                    window.MobileFillToast.error('OCR לא זמין');
                }
                return null;
            }

            console.log('[MobileFill OCR] Initializing Tesseract worker...');

            // Show loading toast
            if (window.MobileFillToast) {
                window.MobileFillToast.info('טוען מנוע OCR...');
            }

            tesseractWorker = await Tesseract.createWorker('heb+eng');
            console.log('[MobileFill OCR] Tesseract worker ready');

            tesseractLoading = false;
            return tesseractWorker;
        } catch (error) {
            console.error('[MobileFill OCR] Failed to init Tesseract:', error);
            tesseractLoading = false;
            if (window.MobileFillToast) {
                window.MobileFillToast.error('שגיאה בטעינת OCR');
            }
            return null;
        }
    }

    /**
     * Create OCR preview modal
     */
    function createModal() {
        modalEl = document.createElement('div');
        modalEl.id = 'mobilefill-ocr-modal';
        modalEl.className = 'mobilefill-ocr-modal is-hidden';
        modalEl.innerHTML = `
            <div class="ocr-modal-content">
                <div class="ocr-modal-header">
                    <span class="ocr-modal-title">זיהוי טקסט</span>
                    <button type="button" class="ocr-modal-close">&times;</button>
                </div>
                <div class="ocr-preview-container">
                    <img class="ocr-preview-image" alt="תמונה לזיהוי">
                    <div class="ocr-loading">
                        <div class="ocr-loading-spinner"></div>
                        <span>מזהה טקסט...</span>
                    </div>
                </div>
                <div class="ocr-result-container">
                    <label class="ocr-result-label">טקסט שזוהה:</label>
                    <textarea class="ocr-result-text" rows="3" placeholder="לא זוהה טקסט"></textarea>
                </div>
                <div class="ocr-modal-actions">
                    <button type="button" class="ocr-btn cancel">ביטול</button>
                    <button type="button" class="ocr-btn apply">השתמש בטקסט</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);

        // Cache elements
        previewImageEl = modalEl.querySelector('.ocr-preview-image');
        extractedTextEl = modalEl.querySelector('.ocr-result-text');
        loadingIndicator = modalEl.querySelector('.ocr-loading');

        // Bind events
        modalEl.querySelector('.ocr-modal-close').addEventListener('click', closeModal);
        modalEl.querySelector('.ocr-btn.cancel').addEventListener('click', closeModal);
        modalEl.querySelector('.ocr-btn.apply').addEventListener('click', applyText);

        // Close on backdrop click
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) closeModal();
        });
    }

    /**
     * Open file picker and process selected image
     * @param {Function} callback - Called with extracted text
     */
    function captureAndExtract(callback) {
        currentCallback = callback;

        // Create hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.capture = 'environment'; // Use rear camera on mobile

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            await processImage(file);
        });

        fileInput.click();
    }

    /**
     * Process image file with OCR
     * @param {File} file - Image file
     */
    async function processImage(file) {
        // Show modal with loading state
        showModal();
        showLoading(true);
        extractedTextEl.value = '';

        // Display image preview
        const imageUrl = URL.createObjectURL(file);
        previewImageEl.src = imageUrl;
        previewImageEl.onload = () => URL.revokeObjectURL(imageUrl);

        // Init Tesseract if needed
        const worker = await initTesseract();
        if (!worker) {
            showLoading(false);
            extractedTextEl.value = 'שגיאה: OCR לא זמין';
            return;
        }

        try {
            console.log('[MobileFill OCR] Processing image...');

            // Resize image if too large (for performance)
            const processedImage = await resizeImage(file, 1500);

            // Run OCR
            const { data: { text } } = await worker.recognize(processedImage);

            // Clean up text
            let cleanedText = text
                .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
                .replace(/[ \t]+/g, ' ')     // Collapse spaces
                .trim();

            // Apply aggressive RTL fix - Hebrew from Tesseract is often reversed
            if (window.MobileFillSmartImport?.aggressiveRTLFix) {
                const normalFixed = window.MobileFillSmartImport.fixHebrewRTL(cleanedText);
                const aggressiveFixed = window.MobileFillSmartImport.aggressiveRTLFix(cleanedText);

                // Use aggressive fix for Hebrew-heavy text (like ID cards)
                const hebrewCount = (cleanedText.match(/[\u0590-\u05FF]/g) || []).length;
                if (hebrewCount > 20) {
                    cleanedText = aggressiveFixed;
                    console.log('[MobileFill OCR] Applied aggressive RTL fix');
                } else {
                    cleanedText = normalFixed;
                }
            }

            console.log('[MobileFill OCR] Extracted text:', cleanedText);

            showLoading(false);
            extractedTextEl.value = cleanedText;

            // Select all text for easy editing
            extractedTextEl.focus();
            extractedTextEl.select();

        } catch (error) {
            console.error('[MobileFill OCR] Recognition error:', error);
            showLoading(false);
            extractedTextEl.value = 'שגיאה בזיהוי טקסט';

            if (window.MobileFillToast) {
                window.MobileFillToast.error('שגיאה בזיהוי טקסט');
            }
        }
    }

    /**
     * Resize image for better OCR performance
     * @param {File} file - Original image file
     * @param {number} maxSize - Max dimension
     * @returns {Promise<HTMLCanvasElement>}
     */
    function resizeImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;

                // Only resize if larger than maxSize
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Show modal
     */
    function showModal() {
        modalEl.classList.remove('is-hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
    }

    /**
     * Close modal
     */
    function closeModal() {
        modalEl.classList.add('is-hidden');
        document.body.style.overflow = '';
        currentCallback = null;
    }

    /**
     * Show/hide loading indicator
     */
    function showLoading(show) {
        if (loadingIndicator) {
            loadingIndicator.style.display = show ? 'flex' : 'none';
        }
    }

    /**
     * Apply extracted text to current field
     */
    function applyText() {
        const text = extractedTextEl.value.trim();

        if (currentCallback && text) {
            currentCallback(text);

            if (window.MobileFillToast) {
                window.MobileFillToast.success('הטקסט הוחל');
            }
        }

        closeModal();
    }

    /**
     * Cleanup resources
     */
    async function destroy() {
        if (tesseractWorker) {
            await tesseractWorker.terminate();
            tesseractWorker = null;
        }
    }

    // Public API
    window.MobileFillOCR = {
        init,
        captureAndExtract,
        destroy
    };
})();
