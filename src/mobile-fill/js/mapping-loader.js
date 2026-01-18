(function() {
    'use strict';

    const DEFAULT_PAGE_WIDTH = 595;
    const DEFAULT_PAGE_HEIGHT = 842;

    async function handleFormSelected(payload) {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; mapping loader disabled');
            return;
        }

        const form = payload?.form;
        const mappingUrl = form?.mappingUrl;

        window.MobileFillEventBus.emit('MAPPING_LOAD_STARTED');

        if (!mappingUrl) {
            window.MobileFillEventBus.emit('MAPPING_LOAD_ERROR', {
                error: 'Mapping URL missing'
            });
            return;
        }

        try {
            const response = await fetch(mappingUrl, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Mapping request failed (${response.status})`);
            }

            const rawData = await response.json();
            const normalizedData = normalizeMapping(rawData);

            window.MobileFillEventBus.emit('MAPPING_READY', {
                fieldsMapping: normalizedData
            });
        } catch (error) {
            window.MobileFillEventBus.emit('MAPPING_LOAD_ERROR', {
                error: error?.message || 'Mapping load failed'
            });
        }
    }

    function normalizeMapping(rawData) {
        const normalizeField = window.normalizeField;
        const migrateV1toV2 = window.migrateV1toV2;

        if (!normalizeField || !migrateV1toV2) {
            throw new Error('Mapping tools not available');
        }

        let mappingData = rawData;
        if (Array.isArray(mappingData)) {
            mappingData = { fields: mappingData };
        }

        if (!Array.isArray(mappingData.fields)) {
            throw new Error('Invalid mapping format: missing fields array');
        }

        const normalizedFields = mappingData.fields
            .map((field) => normalizeField(field))
            .filter((field) => field !== null);

        const migrationResult = migrateV1toV2(
            normalizedFields,
            DEFAULT_PAGE_WIDTH,
            DEFAULT_PAGE_HEIGHT
        );

        return {
            ...mappingData,
            fields: migrationResult.fields
        };
    }

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; mapping loader disabled');
            return;
        }

        window.MobileFillEventBus.on('FORM_SELECTED', handleFormSelected);
    }

    window.MobileFillMappingLoader = {
        init
    };
})();
