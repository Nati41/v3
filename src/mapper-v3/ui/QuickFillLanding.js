/**
 * QuickFillLanding.js
 * Modern landing page for QuickFill public mode
 *
 * Shows only:
 * - Pre-made government forms as cards (loaded from config)
 * - "Upload your own PDF" button
 *
 * No explanations. No clutter. The experience explains itself.
 */

const QuickFillLanding = (function() {
    'use strict';

    let containerEl = null;
    let onFormSelected = null;
    let onFileUploaded = null;
    let availableForms = [];

    // Config path - relative to site root
    const FORMS_CONFIG_PATH = '/assets/forms/forms-config.json';
    const FORMS_BASE_PATH = '/assets/forms/';

    // SVG Icons (modern, clean)
    const ICONS = {
        logo: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="4" width="28" height="36" rx="3" stroke="currentColor" stroke-width="2.5" fill="none"/>
            <path d="M12 14h16M12 20h16M12 26h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <circle cx="34" cy="34" r="10" fill="#3b82f6"/>
            <path d="M31 34l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
        </svg>`,
        upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>`,
        tax: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="16" rx="2"/>
            <path d="M7 8h2v8H7zM11 8h2v4h-2zM15 8h2v6h-2z"/>
        </svg>`,
        health: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>`,
        car: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M5 17h14v-5l-2-5H7l-2 5v5z"/>
            <circle cx="7.5" cy="17.5" r="1.5"/>
            <circle cx="16.5" cy="17.5" r="1.5"/>
        </svg>`,
        home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 12l9-9 9 9"/>
            <path d="M9 21V12h6v9"/>
        </svg>`,
        baby: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="8" r="4"/>
            <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
        </svg>`,
        contract: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <path d="M14 2v6h6"/>
            <path d="M9 15l2 2 4-4"/>
        </svg>`
    };

    // Category to icon mapping
    const CATEGORY_ICONS = {
        'מס הכנסה': 'tax',
        'ביטוח לאומי': 'health',
        'משרד התחבורה': 'car',
        'חוזים': 'contract',
        'default': 'document'
    };

    /**
     * Initialize the landing page
     */
    async function init(container, callbacks) {
        containerEl = container;
        onFormSelected = callbacks.onFormSelected;
        onFileUploaded = callbacks.onFileUploaded;

        await loadFormsConfig();
        render();
    }

    /**
     * Load forms configuration
     */
    async function loadFormsConfig() {
        try {
            const response = await fetch(FORMS_CONFIG_PATH);
            if (response.ok) {
                const config = await response.json();
                availableForms = (config.forms || []).filter(f => f.enabled);
                console.log('[QuickFillLanding] Loaded', availableForms.length, 'enabled forms');
            }
        } catch (e) {
            console.warn('[QuickFillLanding] Could not load forms config:', e);
            availableForms = [];
        }
    }

    /**
     * Get icon for category
     */
    function getIconForCategory(category) {
        const iconKey = CATEGORY_ICONS[category] || CATEGORY_ICONS['default'];
        return ICONS[iconKey] || ICONS.document;
    }

    /**
     * Render the landing page
     * V3.12: Compact mode when embedded in drop zone
     */
    function render() {
        if (!containerEl) return;

        const hasAvailableForms = availableForms.length > 0;
        const isEmbedded = containerEl.classList.contains('qf-landing-embedded');

        containerEl.innerHTML = `
            <div class="qf-landing ${isEmbedded ? 'qf-landing-compact' : ''}" dir="rtl">
                ${!isEmbedded ? `
                <!-- Header (only in standalone mode) -->
                <header class="qf-header">
                    <div class="qf-logo">
                        <div class="qf-logo-icon">${ICONS.logo}</div>
                        <span class="qf-logo-text">tofesPDF</span>
                    </div>
                </header>
                ` : ''}

                <!-- Main Content -->
                <main class="qf-main">
                    ${hasAvailableForms ? `
                    <!-- Forms Section -->
                    <section class="qf-forms-section">
                        <h2 class="qf-section-title">בחר טופס למילוי</h2>
                        <div class="qf-forms-grid">
                            ${availableForms.map((form, index) => `
                                <article class="qf-form-card" data-form-id="${form.id}" style="animation-delay: ${index * 0.05}s">
                                    <div class="qf-form-icon">
                                        ${getIconForCategory(form.category)}
                                    </div>
                                    <div class="qf-form-info">
                                        <h3 class="qf-form-name">${form.name}</h3>
                                        <p class="qf-form-subtitle">${form.subtitle}</p>
                                    </div>
                                    <div class="qf-form-arrow">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="9 18 15 12 9 6"/>
                                        </svg>
                                    </div>
                                </article>
                            `).join('')}
                        </div>
                    </section>

                    <!-- Divider -->
                    <div class="qf-divider">
                        <span>או</span>
                    </div>
                    ` : ''}

                    <!-- Upload Section -->
                    <section class="qf-upload-section ${!hasAvailableForms ? 'qf-upload-center' : ''}">
                        <label class="qf-upload-dropzone" id="qfDropzone" for="qfFileInput">
                            <input type="file" id="qfFileInput" accept=".pdf" class="qf-hidden-input">
                            <div class="qf-upload-icon">${ICONS.upload}</div>
                            <p class="qf-upload-text">העלה קובץ PDF משלך</p>
                            <p class="qf-upload-hint">גרור לכאן או לחץ לבחירה</p>
                        </label>
                    </section>
                </main>

                <!-- Footer -->
                <footer class="qf-footer">
                    <nav class="qf-footer-links">
                        <a href="/accessibility.html" target="_blank">הצהרת נגישות</a>
                        <span class="qf-footer-sep"></span>
                        <a href="/privacy.html" target="_blank">מדיניות פרטיות</a>
                        <span class="qf-footer-sep"></span>
                        <a href="/terms.html" target="_blank">תנאי שימוש</a>
                        <span class="qf-footer-sep"></span>
                        <a href="/contact.html" target="_blank">צור קשר</a>
                    </nav>
                    <p class="qf-footer-copy">© ${new Date().getFullYear()} tofesPDF</p>
                </footer>

                <!-- Loading Overlay -->
                <div class="qf-loading" id="qfLoading" style="display: none;">
                    <div class="qf-loading-spinner"></div>
                    <p class="qf-loading-text">טוען...</p>
                </div>
            </div>
        `;

        attachEventListeners();
    }

    /**
     * Attach event listeners
     */
    function attachEventListeners() {
        // Form cards - prevent event from bubbling to dropzone
        const cards = containerEl.querySelectorAll('.qf-form-card');
        cards.forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering file picker
                e.preventDefault();
                const formId = card.dataset.formId;
                const form = availableForms.find(f => f.id === formId);
                if (form) {
                    card.classList.add('qf-form-card-loading');
                    handleFormSelected(form);
                }
            });
        });

        // File input - get fresh reference inside handlers
        const dropzone = containerEl.querySelector('#qfDropzone');

        if (dropzone) {
            // Click is handled automatically by label[for="qfFileInput"]
            // No click listener needed - the label handles it natively
            console.log('[QuickFillLanding] Upload dropzone is a label - native click handling');

            // File change handler - delegate to dropzone
            dropzone.addEventListener('change', (e) => {
                if (e.target && e.target.id === 'qfFileInput') {
                    const file = e.target.files[0];
                    if (file) {
                        console.log('[QuickFillLanding] File selected:', file.name);
                        handleFileUploaded(file);
                    }
                }
            });

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
                const file = e.dataTransfer?.files[0];
                if (file && file.type === 'application/pdf') {
                    handleFileUploaded(file);
                }
            });

            console.log('[QuickFillLanding] Upload dropzone listeners attached');
        }
    }

    /**
     * Handle form selection
     */
    async function handleFormSelected(form) {
        showLoading(true);

        try {
            const pdfPath = FORMS_BASE_PATH + form.pdfFile;
            const pdfResponse = await fetch(pdfPath);

            if (!pdfResponse.ok) {
                throw new Error(`Failed to load PDF: ${pdfPath}`);
            }

            const pdfBlob = await pdfResponse.blob();
            const pdfFile = new File([pdfBlob], form.pdfFile, { type: 'application/pdf' });

            let jsonData = null;
            if (form.jsonFile) {
                const jsonPath = FORMS_BASE_PATH + form.jsonFile;
                const jsonResponse = await fetch(jsonPath);
                if (jsonResponse.ok) {
                    jsonData = await jsonResponse.json();
                }
            }

            if (onFormSelected) {
                onFormSelected({
                    file: pdfFile,
                    mapping: jsonData,
                    formId: form.id,
                    formName: form.name
                });
            }

        } catch (error) {
            console.error('[QuickFillLanding] Failed to load form:', error);
            showLoading(false);
            alert('שגיאה בטעינת הטופס. נסה שוב.');
        }
    }

    /**
     * Handle file upload
     */
    function handleFileUploaded(file) {
        if (onFileUploaded) {
            onFileUploaded(file);
        }
    }

    /**
     * Show/hide loading
     */
    function showLoading(show) {
        const loading = containerEl?.querySelector('#qfLoading');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    function hide() {
        if (containerEl) containerEl.style.display = 'none';
    }

    function show() {
        if (containerEl) containerEl.style.display = 'block';
    }

    return { init, hide, show, showLoading };

})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuickFillLanding;
}
