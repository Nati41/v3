(function() {
    'use strict';

    const DEFAULT_CATALOG_URL = 'data/form-catalog.json';

    async function loadCatalog(url = DEFAULT_CATALOG_URL) {
        if (!window.MobileFillEventBus) {
            throw new Error('MobileFillEventBus is not available');
        }

        window.MobileFillEventBus.emit('CATALOG_LOAD_STARTED', { url });

        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Catalog request failed (${response.status})`);
            }

            const catalog = await response.json();
            window.MobileFillEventBus.emit('CATALOG_LOAD_SUCCESS', { url, catalog });
        } catch (error) {
            window.MobileFillEventBus.emit('CATALOG_LOAD_ERROR', { url, error });
        }
    }

    window.MobileFillFormCatalogService = {
        loadCatalog
    };
})();
