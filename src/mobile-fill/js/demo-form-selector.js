(function() {
    'use strict';

    function selectFirst() {
        if (!window.MobileFillEventBus || !window.MobileFillStateStore) {
            console.warn('[MobileFill] EventBus or StateStore missing; demo selector disabled');
            return;
        }

        const catalog = window.MobileFillStateStore.state.catalogState.catalog;
        const forms = catalog?.forms || [];
        if (forms.length === 0) return;

        const form = forms[0];
        window.MobileFillEventBus.emit('FORM_SELECTED', {
            formId: form.id,
            form
        });
    }

    window.MobileFillDemoFormSelector = {
        selectFirst
    };
})();
