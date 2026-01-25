/**
 * form-selector-screen.js
 * Shows a list of available forms from the catalog.
 * User selects a form → loads PDF + mapping.
 */
(function() {
    'use strict';

    let screenEl = null;
    let listEl = null;
    let currentCatalog = null;

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; form selector disabled');
            return;
        }

        screenEl = document.getElementById('mobilefill-form-selector');
        listEl = document.getElementById('mobilefill-form-list');

        if (!screenEl || !listEl) {
            console.warn('[MobileFill] Form selector elements not found');
            return;
        }

        // Listen for catalog loaded
        window.MobileFillEventBus.on('CATALOG_LOAD_SUCCESS', handleCatalogLoaded);

        // Listen for form selected to hide screen
        window.MobileFillEventBus.on('FORM_SELECTED', hideScreen);

        // Listen for PDF loaded to ensure screen is hidden
        window.MobileFillEventBus.on('PDF_LOADED', hideScreen);

        // Auto-load catalog on init
        loadCatalog();

        console.log('[MobileFill] Form selector initialized');
    }

    function loadCatalog() {
        if (window.MobileFillFormCatalogService) {
            window.MobileFillFormCatalogService.loadCatalog();
        }
    }

    function handleCatalogLoaded(payload) {
        const catalog = payload?.catalog;
        if (!catalog || !Array.isArray(catalog.forms)) {
            console.warn('[MobileFill] Invalid catalog format');
            return;
        }

        currentCatalog = catalog;
        renderFormList(catalog.forms);
        showScreen();
    }

    function renderFormList(forms) {
        if (!listEl) return;

        listEl.innerHTML = '';

        const activeForms = forms.filter(f => f.status?.active !== false);

        if (activeForms.length === 0) {
            listEl.innerHTML = '<div class="mobilefill-no-forms">אין טפסים זמינים</div>';
            return;
        }

        activeForms.forEach(form => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mobilefill-form-item';
            btn.dataset.formId = form.id;

            btn.innerHTML = `
                <span class="form-item-name">${form.name || form.id}</span>
                <span class="form-item-arrow">←</span>
            `;

            btn.addEventListener('click', () => selectForm(form));
            listEl.appendChild(btn);
        });
    }

    function selectForm(form) {
        if (!form) return;

        console.log('[MobileFill] Form selected:', form.id);

        // Emit form selected event - pdf-loader.js will handle the PDF loading
        window.MobileFillEventBus.emit('FORM_SELECTED', {
            formId: form.id,
            form
        });
    }

    function showScreen() {
        if (screenEl) {
            screenEl.classList.remove('is-hidden');
        }
        // Hide upload overlay when showing form selector
        const uploadOverlay = document.getElementById('mobilefill-upload-overlay');
        if (uploadOverlay) {
            uploadOverlay.classList.add('is-hidden');
        }
    }

    function hideScreen() {
        if (screenEl) {
            screenEl.classList.add('is-hidden');
        }
    }

    window.MobileFillFormSelector = { init, loadCatalog, showScreen, hideScreen };
})();
