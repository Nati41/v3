/**
 * QuickFillLanding.js
 * Minimal landing page for QuickFill public mode
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

    /**
     * Initialize the landing page
     * @param {HTMLElement} container - Container element
     * @param {Object} callbacks - { onFormSelected, onFileUploaded }
     */
    async function init(container, callbacks) {
        containerEl = container;
        onFormSelected = callbacks.onFormSelected;
        onFileUploaded = callbacks.onFileUploaded;

        // Load forms config
        await loadFormsConfig();

        // Render the page
        render();
    }

    /**
     * Load forms configuration from JSON file
     */
    async function loadFormsConfig() {
        try {
            const response = await fetch(FORMS_CONFIG_PATH);
            if (response.ok) {
                const config = await response.json();
                // Only show enabled forms
                availableForms = (config.forms || []).filter(f => f.enabled);
                console.log('[QuickFillLanding] Loaded', availableForms.length, 'enabled forms');
            }
        } catch (e) {
            console.warn('[QuickFillLanding] Could not load forms config:', e);
            availableForms = [];
        }
    }

    /**
     * Render the landing page
     */
    function render() {
        if (!containerEl) return;

        const hasAvailableForms = availableForms.length > 0;

        containerEl.innerHTML = `
            <div class="qf-landing" dir="rtl">
                <!-- Logo/Brand -->
                <div class="qf-landing-header">
                    <div class="qf-logo">
                        <span class="qf-logo-icon">📝</span>
                        <span class="qf-logo-text">טופסלי</span>
                    </div>
                </div>

                ${hasAvailableForms ? `
                <!-- Forms Grid -->
                <div class="qf-forms-section">
                    <div class="qf-forms-grid">
                        ${availableForms.map(form => `
                            <div class="qf-form-card" data-form-id="${form.id}">
                                <div class="qf-form-icon">${form.icon}</div>
                                <div class="qf-form-name">${form.name}</div>
                                <div class="qf-form-subtitle">${form.subtitle}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Divider -->
                <div class="qf-divider">
                    <span>או</span>
                </div>
                ` : ''}

                <!-- Upload Section -->
                <div class="qf-upload-section ${!hasAvailableForms ? 'qf-upload-center' : ''}">
                    <div class="qf-upload-dropzone" id="qfDropzone">
                        <input type="file" id="qfFileInput" accept=".pdf" style="display: none;">
                        <div class="qf-upload-content">
                            <div class="qf-upload-icon">📤</div>
                            <div class="qf-upload-text">העלה קובץ PDF</div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <footer class="qf-footer">
                    <div class="qf-footer-links">
                        <a href="/accessibility.html" target="_blank">הצהרת נגישות</a>
                        <span class="qf-footer-sep">|</span>
                        <a href="/privacy.html" target="_blank">מדיניות פרטיות</a>
                        <span class="qf-footer-sep">|</span>
                        <a href="/terms.html" target="_blank">תנאי שימוש</a>
                        <span class="qf-footer-sep">|</span>
                        <a href="mailto:contact@tofesly.com">צור קשר</a>
                    </div>
                    <div class="qf-footer-copy">© 2024 טופסלי. כל הזכויות שמורות.</div>
                </footer>

                <!-- Loading Overlay (hidden by default) -->
                <div class="qf-loading" id="qfLoading" style="display: none;">
                    <div class="qf-loading-spinner"></div>
                    <div class="qf-loading-text">טוען טופס...</div>
                </div>
            </div>
        `;

        attachEventListeners();
    }

    /**
     * Attach event listeners
     */
    function attachEventListeners() {
        // Form cards
        const cards = containerEl.querySelectorAll('.qf-form-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const formId = card.dataset.formId;
                const form = availableForms.find(f => f.id === formId);
                if (form) {
                    handleFormSelected(form);
                }
            });
        });

        // File input
        const fileInput = containerEl.querySelector('#qfFileInput');
        const dropzone = containerEl.querySelector('#qfDropzone');

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) handleFileUploaded(file);
            });
        }

        // Dropzone click
        if (dropzone) {
            dropzone.addEventListener('click', () => {
                fileInput?.click();
            });

            // Drag & drop
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
        }
    }

    /**
     * Handle pre-made form selection
     */
    async function handleFormSelected(form) {
        showLoading(true);

        try {
            const pdfPath = FORMS_BASE_PATH + form.pdfFile;
            const jsonPath = FORMS_BASE_PATH + form.jsonFile;

            // Fetch PDF and JSON
            const [pdfResponse, jsonResponse] = await Promise.all([
                fetch(pdfPath),
                fetch(jsonPath)
            ]);

            if (!pdfResponse.ok) {
                throw new Error(`Failed to load PDF: ${pdfPath}`);
            }

            const pdfBlob = await pdfResponse.blob();
            const pdfFile = new File([pdfBlob], `${form.name}.pdf`, { type: 'application/pdf' });

            let jsonData = null;
            if (jsonResponse.ok) {
                jsonData = await jsonResponse.json();
            }

            // Callback with both PDF and mapping
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
            // Could show error toast here
            alert('שגיאה בטעינת הטופס. נסה שוב.');
        }
    }

    /**
     * Handle user file upload
     */
    function handleFileUploaded(file) {
        if (onFileUploaded) {
            onFileUploaded(file);
        }
    }

    /**
     * Show/hide loading overlay
     */
    function showLoading(show) {
        const loading = containerEl?.querySelector('#qfLoading');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    /**
     * Hide the landing page
     */
    function hide() {
        if (containerEl) {
            containerEl.style.display = 'none';
        }
    }

    /**
     * Show the landing page
     */
    function show() {
        if (containerEl) {
            containerEl.style.display = 'block';
        }
    }

    // Public API
    return {
        init,
        hide,
        show,
        showLoading
    };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuickFillLanding;
}
