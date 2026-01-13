/**
 * FieldLoaderScreen.js
 * V3.9: Field loading options screen
 *
 * Shows after PDF is selected. User chooses how to load field names:
 * 1. From JSON file (existing mapping)
 * 2. AI extraction from PDF
 * 3. OCR sidebar extraction
 *
 * After field loading, transitions to the main mapping workspace.
 * Completely standalone - does not modify any existing engine code.
 */

const FieldLoaderScreen = (function() {
    'use strict';

    let containerEl = null;
    let currentPdfDoc = null;
    let currentPdfFile = null;
    let currentPdfArrayBuffer = null; // V3.10: Store PDF bytes for Quick Fill export
    let onFieldsLoaded = null; // Callback when fields are ready
    let isVisible = false;

    /**
     * Initialize the field loader screen
     * @param {HTMLElement} container - Container element to render into
     * @param {Function} onLoaded - Callback(fields, loadMethod) when fields are loaded
     */
    function init(container, onLoaded) {
        containerEl = container;
        onFieldsLoaded = onLoaded;
    }

    /**
     * Show the screen with the given PDF
     * @param {File} pdfFile - The PDF file
     * @param {PDFDocumentProxy} pdfDoc - PDF.js document
     * @param {ArrayBuffer} pdfArrayBuffer - Optional: PDF bytes for export
     */
    function show(pdfFile, pdfDoc, pdfArrayBuffer = null) {
        currentPdfFile = pdfFile;
        currentPdfDoc = pdfDoc;
        currentPdfArrayBuffer = pdfArrayBuffer; // V3.10
        render();
        if (containerEl) {
            containerEl.style.display = 'flex';
            isVisible = true;
        }
    }

    /**
     * Render the screen
     */
    function render() {
        if (!containerEl) return;

        const fileName = currentPdfFile?.name || 'PDF';
        const pageCount = currentPdfDoc?.numPages || 0;

        containerEl.innerHTML = `
            <div class="field-loader-screen" dir="rtl">
                <div class="field-loader-header">
                    <button class="back-btn" id="fieldLoaderBackBtn" title="חזור">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <div class="pdf-info">
                        <h2>${escapeHtml(fileName)}</h2>
                        <span class="page-count">${pageCount} עמודים</span>
                    </div>
                </div>

                <div class="field-loader-content">
                    <h1>איך לטעון את שמות השדות?</h1>
                    <p class="field-loader-subtitle">בחר את השיטה המתאימה לך</p>

                    <div class="loader-options">
                        <!-- Option 1: JSON File -->
                        <div class="loader-option" id="optionJson">
                            <div class="option-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                </svg>
                            </div>
                            <div class="option-text">
                                <h3>מקובץ JSON</h3>
                                <p>טען מיפוי קיים או רשימת שדות</p>
                            </div>
                            <input type="file" id="jsonFileInput" accept=".json" style="display: none;">
                        </div>

                        <!-- Option 2: AI Extraction -->
                        <div class="loader-option" id="optionAI">
                            <div class="option-icon ai-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <circle cx="12" cy="12" r="10"/>
                                    <path d="M12 16v-4M12 8h.01"/>
                                    <path d="M8 12h.01M16 12h.01"/>
                                    <path d="M9 9l.01.01M15 9l.01.01M9 15l.01.01M15 15l.01.01"/>
                                </svg>
                            </div>
                            <div class="option-text">
                                <h3>חילוץ AI</h3>
                                <p>זיהוי אוטומטי של שדות מה-PDF</p>
                            </div>
                            <span class="option-badge">מומלץ</span>
                        </div>

                        <!-- Option 3: OCR Sidebar -->
                        <div class="loader-option" id="optionOCR">
                            <div class="option-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    <line x1="9" y1="3" x2="9" y2="21"/>
                                    <line x1="14" y1="9" x2="19" y2="9"/>
                                    <line x1="14" y1="13" x2="19" y2="13"/>
                                    <line x1="14" y1="17" x2="19" y2="17"/>
                                </svg>
                            </div>
                            <div class="option-text">
                                <h3>OCR סרגל צד</h3>
                                <p>סרוק וחלץ טקסט מאזור מסוים</p>
                            </div>
                        </div>

                        <!-- Option 4: Manual Entry -->
                        <div class="loader-option" id="optionManual">
                            <div class="option-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M12 20h9"/>
                                    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                                </svg>
                            </div>
                            <div class="option-text">
                                <h3>הזנה ידנית</h3>
                                <p>הוסף שדות בזמן המיפוי</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        attachEventListeners();
    }

    /**
     * Escape HTML
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Attach event listeners
     */
    function attachEventListeners() {
        const backBtn = containerEl.querySelector('#fieldLoaderBackBtn');
        const jsonOption = containerEl.querySelector('#optionJson');
        const aiOption = containerEl.querySelector('#optionAI');
        const ocrOption = containerEl.querySelector('#optionOCR');
        const manualOption = containerEl.querySelector('#optionManual');
        const jsonInput = containerEl.querySelector('#jsonFileInput');

        // Back button
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                hide();
                // Signal to show welcome screen again
                if (typeof WelcomeScreen !== 'undefined') {
                    WelcomeScreen.show();
                }
            });
        }

        // JSON option
        if (jsonOption && jsonInput) {
            jsonOption.addEventListener('click', () => {
                jsonInput.click();
            });

            jsonInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) handleJsonFile(file);
            });
        }

        // AI option
        if (aiOption) {
            aiOption.addEventListener('click', () => {
                handleAIExtraction();
            });
        }

        // OCR option
        if (ocrOption) {
            ocrOption.addEventListener('click', () => {
                handleOCRExtraction();
            });
        }

        // Manual option
        if (manualOption) {
            manualOption.addEventListener('click', () => {
                handleManualEntry();
            });
        }
    }

    /**
     * Handle JSON file loading
     */
    async function handleJsonFile(file) {
        console.log('[FieldLoaderScreen] Loading JSON:', file.name);
        showLoading('טוען קובץ JSON...');

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            let fields = [];

            // Support multiple JSON formats
            // V3.9: Preserve label_he, label_en properly
            if (Array.isArray(data)) {
                // Simple array of field names or objects
                fields = data.map(item => {
                    if (typeof item === 'string') {
                        return { name: item, label_he: item, type: 'text' };
                    }
                    // Spread first, then set computed values to preserve originals
                    return {
                        ...item,
                        name: item.label_he || item.name || item.fieldName || item.label,
                        label_he: item.label_he || item.name || item.fieldName || item.label,
                        label_en: item.label_en || item.name || item.fieldName || item.label,
                        type: item.type || 'text'
                    };
                });
            } else if (data.fields) {
                // Object with fields array (unified schema)
                fields = data.fields.map(f => ({
                    ...f,
                    name: f.label_he || f.name || f.fieldName || f.label,
                    label_he: f.label_he || f.name || f.fieldName || f.label,
                    label_en: f.label_en || f.name || f.fieldName || f.label,
                    type: f.type || 'text'
                }));
            } else if (data.mapping) {
                // Existing mapping format
                fields = Object.keys(data.mapping).map(key => ({
                    ...data.mapping[key],
                    name: key,
                    label_he: data.mapping[key]?.label_he || key,
                    label_en: data.mapping[key]?.label_en || key,
                    type: data.mapping[key]?.type || 'text',
                    existingBbox: data.mapping[key]?.bbox
                }));
            }

            hideLoading();

            if (fields.length === 0) {
                alert('לא נמצאו שדות בקובץ');
                return;
            }

            console.log(`[FieldLoaderScreen] Loaded ${fields.length} fields from JSON`);
            completeFieldLoading(fields, 'json');

        } catch (error) {
            console.error('[FieldLoaderScreen] JSON load error:', error);
            hideLoading();
            alert('שגיאה בקריאת קובץ JSON');
        }
    }

    /**
     * Handle AI extraction
     */
    async function handleAIExtraction() {
        console.log('[FieldLoaderScreen] Starting AI extraction');

        // Check if AIFieldExtractor is available
        if (typeof AIFieldExtractor === 'undefined') {
            // V3.9: Show friendly message - AI not connected yet
            showNotAvailable('חילוץ AI עדיין לא מחובר.\nבינתיים, השתמש בטעינה מ-JSON או הזנה ידנית.');
            return;
        }

        showLoading('מחלץ שדות עם AI...');

        try {
            const fields = await AIFieldExtractor.extractFromPDF(currentPdfDoc);

            hideLoading();

            if (!fields || fields.length === 0) {
                showNotAvailable('לא נמצאו שדות. נסה שיטה אחרת.');
                return;
            }

            console.log(`[FieldLoaderScreen] AI extracted ${fields.length} fields`);
            completeFieldLoading(fields, 'ai');

        } catch (error) {
            console.error('[FieldLoaderScreen] AI extraction error:', error);
            hideLoading();
            showNotAvailable('שגיאה בחילוץ AI. נסה שיטה אחרת.');
        }
    }

    /**
     * Show "not available" message
     */
    function showNotAvailable(message) {
        const existing = containerEl.querySelector('.not-available-msg');
        if (existing) existing.remove();

        const msgEl = document.createElement('div');
        msgEl.className = 'not-available-msg';
        msgEl.innerHTML = `
            <div class="not-available-content">
                <span class="not-available-icon">⚠️</span>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <button class="not-available-close">הבנתי</button>
            </div>
        `;
        containerEl.appendChild(msgEl);

        msgEl.querySelector('.not-available-close').addEventListener('click', () => {
            msgEl.remove();
        });
    }

    /**
     * Handle OCR sidebar extraction
     */
    function handleOCRExtraction() {
        console.log('[FieldLoaderScreen] Starting OCR extraction mode');

        // For OCR, we proceed to the main view and let user draw the sidebar region
        const fields = []; // Empty - will be populated from OCR
        completeFieldLoading(fields, 'ocr');
    }

    /**
     * Handle manual entry
     */
    function handleManualEntry() {
        console.log('[FieldLoaderScreen] Manual entry mode');

        // Proceed with empty fields - user will add them manually
        const fields = [];
        completeFieldLoading(fields, 'manual');
    }

    /**
     * Complete field loading and transition to main view
     */
    function completeFieldLoading(fields, method) {
        console.log(`[FieldLoaderScreen] Complete: ${fields.length} fields via ${method}`);

        hide();

        if (onFieldsLoaded) {
            onFieldsLoaded({
                fields: fields,
                method: method,
                pdfFile: currentPdfFile,
                pdfDoc: currentPdfDoc,
                pdfArrayBuffer: currentPdfArrayBuffer // V3.10: For Quick Fill export
            });
        }
    }

    /**
     * Show loading overlay
     */
    function showLoading(message) {
        const existing = containerEl.querySelector('.field-loader-loading');
        if (existing) existing.remove();

        const loadingEl = document.createElement('div');
        loadingEl.className = 'field-loader-loading';
        loadingEl.innerHTML = `
            <div class="loading-spinner"></div>
            <p>${message || 'טוען...'}</p>
        `;
        containerEl.appendChild(loadingEl);
    }

    /**
     * Hide loading overlay
     */
    function hideLoading() {
        const loadingEl = containerEl.querySelector('.field-loader-loading');
        if (loadingEl) loadingEl.remove();
    }

    /**
     * Hide the screen
     */
    function hide() {
        if (containerEl) {
            containerEl.style.display = 'none';
            isVisible = false;
        }
    }

    /**
     * Check if visible
     */
    function getIsVisible() {
        return isVisible;
    }

    // Public API
    return {
        init,
        show,
        hide,
        isVisible: getIsVisible
    };

})();

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldLoaderScreen;
}
