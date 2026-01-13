/**
 * WelcomeScreen.js
 * V3.9: Opening screen with recent PDFs and upload option
 *
 * Shows when the app loads. User can:
 * - Select a recent PDF (loads instantly from IndexedDB!)
 * - Upload a new PDF
 *
 * After PDF selection, transitions to FieldLoaderScreen.
 * Completely standalone - does not modify any existing engine code.
 */

const WelcomeScreen = (function() {
    'use strict';

    let containerEl = null;
    let onPDFSelected = null; // Callback when PDF is selected
    let isVisible = false;

    /**
     * Initialize the welcome screen
     * @param {HTMLElement} container - Container element to render into
     * @param {Function} onSelect - Callback(file, pdfDoc) when PDF is selected
     */
    function init(container, onSelect) {
        containerEl = container;
        onPDFSelected = onSelect;
        render();
    }

    /**
     * Render the welcome screen (async for IndexedDB)
     */
    async function render() {
        if (!containerEl) return;

        // Get recent PDFs from IndexedDB (async!)
        let recentPDFs = [];
        if (typeof RecentPDFs !== 'undefined') {
            try {
                recentPDFs = await RecentPDFs.getAll();
            } catch (e) {
                console.warn('[WelcomeScreen] Failed to get recent PDFs:', e);
            }
        }

        containerEl.innerHTML = `
            <div class="welcome-screen" dir="rtl">
                <div class="welcome-header">
                    <h1>מיפוי שדות PDF</h1>
                    <p class="welcome-subtitle">בחר קובץ PDF קיים או העלה חדש</p>
                </div>

                <div class="welcome-content">
                    <!-- Upload Section -->
                    <div class="upload-section">
                        <div class="upload-dropzone" id="welcomeDropzone">
                            <div class="upload-icon">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                    <polyline points="17 8 12 3 7 8"/>
                                    <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                            </div>
                            <p class="upload-text">גרור קובץ PDF לכאן</p>
                            <p class="upload-hint">או</p>
                            <button class="upload-btn" id="welcomeUploadBtn">בחר קובץ</button>
                            <input type="file" id="welcomeFileInput" accept=".pdf" style="display: none;">
                        </div>
                    </div>

                    <!-- Recent PDFs Section -->
                    ${recentPDFs.length > 0 ? `
                    <div class="recent-section">
                        <h2 class="recent-title">קבצים אחרונים</h2>
                        <div class="recent-list">
                            ${recentPDFs.map((pdf, index) => `
                                <div class="recent-item" data-index="${index}" data-name="${escapeHtml(pdf.name)}">
                                    <div class="recent-thumbnail">
                                        ${pdf.thumbnail ?
                                            `<img src="${pdf.thumbnail}" alt="${escapeHtml(pdf.name)}">` :
                                            `<div class="thumbnail-placeholder">PDF</div>`
                                        }
                                    </div>
                                    <div class="recent-info">
                                        <span class="recent-name">${escapeHtml(pdf.name)}</span>
                                        <span class="recent-meta">
                                            ${pdf.pageCount} עמודים • ${RecentPDFs.formatDate(pdf.lastOpened)}
                                        </span>
                                    </div>
                                    <button class="recent-remove" data-name="${escapeHtml(pdf.name)}" title="הסר מהרשימה">×</button>
                                </div>
                            `).join('')}
                        </div>
                        <button class="clear-recent-btn" id="clearRecentBtn">נקה הכל</button>
                    </div>
                    ` : `
                    <div class="recent-section empty">
                        <p class="no-recent">אין קבצים אחרונים</p>
                    </div>
                    `}
                </div>
            </div>
        `;

        attachEventListeners();
        isVisible = true;
    }

    /**
     * Escape HTML to prevent XSS
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
        const dropzone = containerEl.querySelector('#welcomeDropzone');
        const uploadBtn = containerEl.querySelector('#welcomeUploadBtn');
        const fileInput = containerEl.querySelector('#welcomeFileInput');
        const clearBtn = containerEl.querySelector('#clearRecentBtn');
        const recentItems = containerEl.querySelectorAll('.recent-item');
        const removeButtons = containerEl.querySelectorAll('.recent-remove');

        // File input change
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) handleFileSelected(file);
            });
        }

        // Upload button click
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                fileInput?.click();
            });
        }

        // Dropzone drag & drop
        if (dropzone) {
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            });

            dropzone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            });

            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');

                const file = e.dataTransfer.files[0];
                if (file && file.type === 'application/pdf') {
                    handleFileSelected(file);
                } else {
                    alert('נא לבחור קובץ PDF בלבד');
                }
            });
        }

        // Recent items click - LOAD FROM INDEXEDDB!
        recentItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                // Don't trigger if clicking remove button
                if (e.target.classList.contains('recent-remove')) return;

                const name = item.dataset.name;
                await loadFromRecent(name);
            });
        });

        // Remove buttons
        removeButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const name = btn.dataset.name;
                if (typeof RecentPDFs !== 'undefined') {
                    await RecentPDFs.remove(name);
                    render(); // Re-render to update list
                }
            });
        });

        // Clear all recent
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                if (confirm('למחוק את כל ההיסטוריה?')) {
                    if (typeof RecentPDFs !== 'undefined') {
                        await RecentPDFs.clear();
                        render(); // Re-render to update list
                    }
                }
            });
        }
    }

    /**
     * Load PDF from recent (IndexedDB)
     * @param {string} name - PDF filename
     */
    async function loadFromRecent(name) {
        console.log('[WelcomeScreen] Loading from recent:', name);
        showLoading('טוען PDF...');

        try {
            // Get PDF data from IndexedDB
            const pdfData = await RecentPDFs.get(name);

            if (!pdfData || !pdfData.data) {
                hideLoading();
                alert('הקובץ לא נמצא באחסון. נא להעלות מחדש.');
                return;
            }

            // V3.10: Create a copy of the ArrayBuffer BEFORE passing to pdf.js
            // pdf.js may detach the original, so we need a separate copy for export
            const pdfArrayBufferCopy = pdfData.data.slice(0);

            // Load PDF with PDF.js from stored ArrayBuffer
            const pdfDoc = await pdfjsLib.getDocument({ data: pdfData.data }).promise;

            console.log(`[WelcomeScreen] PDF loaded from cache: ${pdfDoc.numPages} pages`);

            hideLoading();

            // Create a fake File object for compatibility
            const fakeFile = {
                name: name,
                type: 'application/pdf',
                size: pdfArrayBufferCopy.byteLength
            };

            // Trigger callback - pass the COPY for export support (original may be detached)
            if (onPDFSelected) {
                onPDFSelected(fakeFile, pdfDoc, pdfArrayBufferCopy);
            }

        } catch (error) {
            console.error('[WelcomeScreen] Failed to load from recent:', error);
            hideLoading();
            alert('שגיאה בטעינת ה-PDF מהאחסון. נא להעלות מחדש.');
        }
    }

    /**
     * Handle file selection (new upload)
     * @param {File} file
     */
    async function handleFileSelected(file) {
        if (!file || file.type !== 'application/pdf') {
            alert('נא לבחור קובץ PDF בלבד');
            return;
        }

        console.log('[WelcomeScreen] PDF selected:', file.name);

        // Show loading state
        showLoading('טוען PDF...');

        try {
            // Load PDF with PDF.js
            const arrayBuffer = await file.arrayBuffer();
            // Clone the ArrayBuffer BEFORE passing to PDF.js (it detaches the original!)
            const arrayBufferCopy = arrayBuffer.slice(0);
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            console.log(`[WelcomeScreen] PDF loaded: ${pdfDoc.numPages} pages`);

            // Generate thumbnail and save to IndexedDB with the COPY
            if (typeof RecentPDFs !== 'undefined') {
                const thumbnail = await RecentPDFs.generateThumbnail(pdfDoc);
                // Save the cloned PDF data!
                await RecentPDFs.add(file.name, arrayBufferCopy, pdfDoc.numPages, thumbnail);
            }

            hideLoading();

            // Trigger callback - pass arrayBufferCopy for Quick Fill export support
            if (onPDFSelected) {
                onPDFSelected(file, pdfDoc, arrayBufferCopy);
            }

        } catch (error) {
            console.error('[WelcomeScreen] Failed to load PDF:', error);
            hideLoading();
            alert('שגיאה בטעינת ה-PDF. נא לנסות שנית.');
        }
    }

    /**
     * Show loading overlay
     */
    function showLoading(message) {
        const existing = containerEl.querySelector('.welcome-loading');
        if (existing) existing.remove();

        const loadingEl = document.createElement('div');
        loadingEl.className = 'welcome-loading';
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
        const loadingEl = containerEl.querySelector('.welcome-loading');
        if (loadingEl) loadingEl.remove();
    }

    /**
     * Show the welcome screen
     */
    function show() {
        if (containerEl) {
            containerEl.style.display = 'flex';
            render(); // Re-render to get latest recent PDFs
            isVisible = true;
        }
    }

    /**
     * Hide the welcome screen
     */
    function hide() {
        if (containerEl) {
            containerEl.style.display = 'none';
            isVisible = false;
        }
    }

    /**
     * Check if screen is visible
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
    module.exports = WelcomeScreen;
}
