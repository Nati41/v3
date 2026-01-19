(function() {
    'use strict';

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; form list UI disabled');
            return;
        }

        window.MobileFillEventBus.on('CATALOG_LOAD_SUCCESS', (payload) => {
            renderFormList(payload?.catalog?.forms || []);
        });

        window.MobileFillEventBus.on('FORM_SELECTED', () => {
            toggleListVisibility(true);
        });

        window.MobileFillEventBus.on('FORM_DESELECTED', () => {
            toggleListVisibility(false);
        });
    }

    function renderFormList(forms) {
        const listEl = document.getElementById('mobilefill-form-list');
        if (!listEl) return;

        listEl.innerHTML = '';

        forms.filter((form) => form?.status?.active !== false).forEach((form) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mobilefill-form-button';
            button.textContent = form.name || form.id || 'טופס';

            button.addEventListener('click', () => {
                window.MobileFillEventBus.emit('FORM_SELECTED', {
                    formId: form.id,
                    form
                });
            });

            listEl.appendChild(button);
        });
    }

    function toggleListVisibility(hidden) {
        const listEl = document.getElementById('mobilefill-form-list');
        if (!listEl) return;
        listEl.classList.toggle('is-hidden', Boolean(hidden));
    }

    window.MobileFillFormListUI = { init };
})();
