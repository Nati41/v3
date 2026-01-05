/**
 * Pre-Mapper Module
 *
 * Handles import of AI-prepared field templates into the Mapper
 * Uses Unified Import JSON Schema v1 as the standard format
 */

export { UnifiedImportAdapter } from './UnifiedImportAdapter.js';
export { SmartTableDetector } from './SmartTableDetector.js';

/**
 * Check if JSON is in Unified format
 * @param {Object} json - JSON to check
 * @returns {boolean}
 */
export function isUnifiedFormat(json) {
    return json.$schema === 'unified-import-v1' ||
           (json.meta?.source && json.fields) ||
           (json.meta?.version && json.fields);
}

/**
 * Wrap unknown format as Unified schema (basic conversion)
 * @param {Object} json - Raw JSON
 * @returns {Object} Unified Import Schema v1
 */
export function wrapAsUnified(json) {
    if (isUnifiedFormat(json)) {
        console.log('[PreMapper] Already in Unified format');
        return json;
    }

    console.log('[PreMapper] Wrapping as Unified format');
    return {
        "$schema": "unified-import-v1",
        "version": "1.0",
        "meta": {
            version: "1.0",
            source: "template",
            generatedAt: new Date().toISOString()
        },
        "fields": Array.isArray(json) ? json : (json.fields || []),
        "groups": json.groups || json.radioGroups || [],
        "tables": json.tables || []
    };
}
