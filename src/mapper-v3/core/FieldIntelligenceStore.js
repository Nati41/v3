/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - FieldIntelligenceStore
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   שומר ומחזיר נתוני אינטליגנציה סמנטית שנוצרו על ידי AI.
 *   נתונים כמו: שם קנוני, הקשר, פורמט, סוג נתון - לכל שדה.
 *
 * איך זה עובד:
 *   - שומר ב-IndexedDB (מסד נתונים מקומי של הדפדפן)
 *   - מפריד נתונים סמנטיים (שם, הקשר) מנתוני קואורדינטות (מיקום)
 *   - מאפשר שימוש חוזר בנתוני AI גם אם המיקום השתנה
 *
 * מי משתמש בקובץ:
 *   - AIService.js - שומר תוצאות ניתוח
 *   - FillEngineExporter.js - ממזג עם קואורדינטות לייצוא
 *   - GuidedMappingUI.js - מציג מידע AI למשתמש
 *
 * באיזה מצבים:
 *   כשיש נתוני AI - אופציונלי, לא חובה למיפוי ידני
 *
 * Singleton: export const fieldIntelligenceStore
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * FieldIntelligenceStore - AI-Generated Field Intelligence Manager
 * Version 1.0
 *
 * Manages storage and retrieval of Field Intelligence JSON data.
 * COMPLETELY SEPARATE from TemplateStore - no mixing of concerns.
 *
 * Responsibilities:
 * - Store Field Intelligence JSON in IndexedDB
 * - Provide data to Mapping Tool (simplified view)
 * - Provide data to Filling Tool (full view)
 * - Track which forms have Intelligence data
 *
 * This store is ADDITIVE - it enhances existing functionality
 * without replacing or modifying anything.
 */

import { eventBus } from './EventBus.js';
import {
    FIELD_INTELLIGENCE_SCHEMA_VERSION,
    validateFieldIntelligence,
    extractMappingData,
    extractSectionNames,
    getSequentialMappingOrder
} from '../ai/schemas/field-intelligence-schema.js';

// IndexedDB configuration
const DB_NAME = 'FormMapperIntelligence';
const DB_VERSION = 1;
const STORE_NAME = 'field_intelligence';

// Events
export const IntelligenceEvents = {
    LOADED: 'intelligence:loaded',
    SAVED: 'intelligence:saved',
    CLEARED: 'intelligence:cleared',
    VALIDATION_ERROR: 'intelligence:validationError'
};

class FieldIntelligenceStore {
    constructor() {
        this._db = null;
        this._currentIntelligence = null;
        this._currentFormId = null;
        this._isInitialized = false;
    }

    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Initialize IndexedDB connection
     * @returns {Promise<boolean>} Success status
     */
    async init() {
        if (this._isInitialized) {
            console.log('[FieldIntelligenceStore] Already initialized');
            return true;
        }

        console.log('[FieldIntelligenceStore] Initializing IndexedDB...');

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('[FieldIntelligenceStore] ❌ IndexedDB error:', request.error);
                resolve(false);
            };

            request.onsuccess = () => {
                this._db = request.result;
                this._isInitialized = true;
                console.log('[FieldIntelligenceStore] ✅ Initialized successfully');
                resolve(true);
            };

            request.onupgradeneeded = (event) => {
                console.log('[FieldIntelligenceStore] Upgrading database schema...');
                const db = event.target.result;

                // Create object store with formId as key
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'form.id' });
                    store.createIndex('generated', '$generated', { unique: false });
                    console.log('[FieldIntelligenceStore] ✅ Object store created');
                }
            };
        });
    }

    /**
     * Ensure database is initialized
     */
    async _ensureInit() {
        if (!this._isInitialized) {
            await this.init();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // STORAGE OPERATIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Save Field Intelligence JSON for a form
     * @param {Object} intelligence - Field Intelligence JSON
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async save(intelligence) {
        await this._ensureInit();

        // Validate before saving
        const validation = validateFieldIntelligence(intelligence);
        if (!validation.valid) {
            const error = `Validation failed: ${validation.errors.join(', ')}`;
            console.error('[FieldIntelligenceStore] ' + error);
            eventBus.emit(IntelligenceEvents.VALIDATION_ERROR, { errors: validation.errors });
            return { success: false, error };
        }

        return new Promise((resolve) => {
            const transaction = this._db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(intelligence);

            request.onsuccess = () => {
                console.log(`[FieldIntelligenceStore] Saved: ${intelligence.form.id}`);
                eventBus.emit(IntelligenceEvents.SAVED, { formId: intelligence.form.id });
                resolve({ success: true });
            };

            request.onerror = () => {
                const error = `Save failed: ${request.error}`;
                console.error('[FieldIntelligenceStore] ' + error);
                resolve({ success: false, error });
            };
        });
    }

    /**
     * Load Field Intelligence for a form
     * @param {string} formId - Form identifier
     * @returns {Promise<Object|null>} Intelligence data or null
     */
    async load(formId) {
        await this._ensureInit();

        return new Promise((resolve) => {
            const transaction = this._db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(formId);

            request.onsuccess = () => {
                const data = request.result;
                if (data) {
                    console.log(`[FieldIntelligenceStore] Loaded: ${formId}`);
                    this._currentIntelligence = data;
                    this._currentFormId = formId;
                    eventBus.emit(IntelligenceEvents.LOADED, { formId, fieldCount: data.fields?.length || 0 });
                } else {
                    console.log(`[FieldIntelligenceStore] Not found: ${formId}`);
                }
                resolve(data || null);
            };

            request.onerror = () => {
                console.error('[FieldIntelligenceStore] Load error:', request.error);
                resolve(null);
            };
        });
    }

    /**
     * Delete Field Intelligence for a form
     * @param {string} formId - Form identifier
     * @returns {Promise<boolean>} Success status
     */
    async delete(formId) {
        await this._ensureInit();

        return new Promise((resolve) => {
            const transaction = this._db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(formId);

            request.onsuccess = () => {
                console.log(`[FieldIntelligenceStore] Deleted: ${formId}`);
                if (this._currentFormId === formId) {
                    this._currentIntelligence = null;
                    this._currentFormId = null;
                }
                eventBus.emit(IntelligenceEvents.CLEARED, { formId });
                resolve(true);
            };

            request.onerror = () => {
                console.error('[FieldIntelligenceStore] Delete error:', request.error);
                resolve(false);
            };
        });
    }

    /**
     * Check if Intelligence exists for a form
     * @param {string} formId - Form identifier
     * @returns {Promise<boolean>}
     */
    async exists(formId) {
        await this._ensureInit();

        return new Promise((resolve) => {
            const transaction = this._db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.count(IDBKeyRange.only(formId));

            request.onsuccess = () => resolve(request.result > 0);
            request.onerror = () => resolve(false);
        });
    }

    /**
     * Get list of all stored form IDs
     * @returns {Promise<string[]>} Array of form IDs
     */
    async getAllFormIds() {
        await this._ensureInit();

        return new Promise((resolve) => {
            const transaction = this._db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAllKeys();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // CURRENT INTELLIGENCE ACCESS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Set current intelligence (from AI analysis, before saving)
     * @param {Object} intelligence - Field Intelligence JSON
     */
    setCurrent(intelligence) {
        const validation = validateFieldIntelligence(intelligence);
        if (!validation.valid) {
            console.warn('[FieldIntelligenceStore] Setting invalid intelligence:', validation.errors);
        }

        this._currentIntelligence = intelligence;
        this._currentFormId = intelligence?.form?.id || null;
        console.log(`[FieldIntelligenceStore] Current set: ${this._currentFormId}`);
    }

    /**
     * Get current intelligence
     * @returns {Object|null}
     */
    getCurrent() {
        return this._currentIntelligence;
    }

    /**
     * Check if current intelligence is loaded
     * @returns {boolean}
     */
    hasCurrent() {
        return this._currentIntelligence !== null;
    }

    /**
     * Clear current intelligence (memory only, not storage)
     */
    clearCurrent() {
        this._currentIntelligence = null;
        this._currentFormId = null;
        console.log('[FieldIntelligenceStore] Current cleared');
    }

    // ═══════════════════════════════════════════════════════════════
    // MAPPING TOOL DATA ACCESS
    // These methods provide simplified data for the Mapping Tool
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get fields for sequential mapping (Mapping Tool)
     * Returns ONLY: id, order, name_he, section_id
     * @returns {Array} Simplified field list sorted by order
     */
    getMappingFields() {
        if (!this._currentIntelligence) {
            return [];
        }
        return extractMappingData(this._currentIntelligence);
    }

    /**
     * Get section names (Mapping Tool)
     * @returns {Map<string, string>} section_id -> section name
     */
    getSectionNames() {
        if (!this._currentIntelligence) {
            return new Map();
        }
        return extractSectionNames(this._currentIntelligence);
    }

    /**
     * Get field by ID (Mapping Tool - simplified)
     * @param {string} fieldId - Field ID
     * @returns {Object|null} { id, order, name_he, section_id }
     */
    getMappingField(fieldId) {
        const fields = this.getMappingFields();
        return fields.find(f => f.id === fieldId) || null;
    }

    /**
     * Get field at specific order position
     * @param {number} order - Order number
     * @returns {Object|null}
     */
    getFieldAtOrder(order) {
        const fields = this.getMappingFields();
        return fields.find(f => f.order === order) || null;
    }

    /**
     * Get total field count
     * @returns {number}
     */
    getFieldCount() {
        return this._currentIntelligence?.fields?.length || 0;
    }

    /**
     * Get current section for a field
     * @param {string} fieldId - Field ID
     * @returns {Object|null} Section info
     */
    getFieldSection(fieldId) {
        if (!this._currentIntelligence) return null;

        const field = this._currentIntelligence.fields.find(f => f.id === fieldId);
        if (!field) return null;

        return this._currentIntelligence.sections.find(s => s.id === field.section_id) || null;
    }

    // ═══════════════════════════════════════════════════════════════
    // FILLING TOOL DATA ACCESS
    // These methods provide full data for the Filling Tool
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get full field data (Filling Tool)
     * @param {string} fieldId - Field ID
     * @returns {Object|null} Complete field object
     */
    getFieldFull(fieldId) {
        if (!this._currentIntelligence) return null;
        return this._currentIntelligence.fields.find(f => f.id === fieldId) || null;
    }

    /**
     * Get field guidance (Filling Tool)
     * @param {string} fieldId - Field ID
     * @returns {Object|null} { purpose_short, purpose_full, instructions, examples, common_mistakes }
     */
    getFieldGuidance(fieldId) {
        const field = this.getFieldFull(fieldId);
        if (!field) return null;

        return {
            purpose_short: field.semantics?.purpose_short || '',
            purpose_full: field.semantics?.purpose_full || '',
            instructions: field.guidance?.instructions || [],
            examples: field.guidance?.examples || [],
            common_mistakes: field.guidance?.common_mistakes || []
        };
    }

    /**
     * Get field options (Filling Tool)
     * @param {string} fieldId - Field ID
     * @returns {Array} Options array
     */
    getFieldOptions(fieldId) {
        const field = this.getFieldFull(fieldId);
        return field?.options || [];
    }

    /**
     * Get field rules (Filling Tool)
     * @param {string} fieldId - Field ID
     * @returns {Object|null} Rules object
     */
    getFieldRules(fieldId) {
        const field = this.getFieldFull(fieldId);
        return field?.rules || null;
    }

    /**
     * Get dependencies that affect a field (Filling Tool)
     * @param {string} fieldId - Field ID
     * @returns {Array} Dependencies where this field is affected
     */
    getDependenciesFor(fieldId) {
        if (!this._currentIntelligence?.dependencies) return [];

        return this._currentIntelligence.dependencies.filter(dep =>
            dep.affected_fields?.includes(fieldId)
        );
    }

    /**
     * Get dependencies triggered by a field (Filling Tool)
     * @param {string} fieldId - Field ID
     * @returns {Array} Dependencies where this field is the trigger
     */
    getDependenciesFrom(fieldId) {
        if (!this._currentIntelligence?.dependencies) return [];

        return this._currentIntelligence.dependencies.filter(dep =>
            dep.trigger_field === fieldId
        );
    }

    /**
     * Get all required attachments based on current field values (Filling Tool)
     * @param {Object} fieldValues - Map of fieldId -> value
     * @returns {Array} Required attachments
     */
    getRequiredAttachments(fieldValues = {}) {
        if (!this._currentIntelligence?.attachments) return [];

        return this._currentIntelligence.attachments.filter(att => {
            // Always required
            if (!att.condition || att.condition.type === 'always') {
                return true;
            }

            // Evaluate condition
            return this._evaluateCondition(att.condition, fieldValues);
        });
    }

    /**
     * Get validation hints for a field (Filling Tool)
     * @param {string} fieldId - Field ID
     * @returns {Array} Validation hints
     */
    getValidationHints(fieldId) {
        if (!this._currentIntelligence?.validation_hints) return [];

        return this._currentIntelligence.validation_hints.filter(hint =>
            hint.field === fieldId
        );
    }

    /**
     * Evaluate a condition against field values
     * @param {Object} condition - Condition object
     * @param {Object} fieldValues - Field values
     * @returns {boolean}
     */
    _evaluateCondition(condition, fieldValues) {
        if (!condition) return true;

        const { type, field, value, values } = condition;
        const fieldValue = fieldValues[field];

        switch (type) {
            case 'always':
                return true;
            case 'field_equals':
                return fieldValue === value;
            case 'field_not_equals':
                return fieldValue !== value;
            case 'field_empty':
                return !fieldValue || fieldValue === '';
            case 'field_not_empty':
                return fieldValue && fieldValue !== '';
            case 'field_checked':
                return fieldValue === true || fieldValue === 'true' || fieldValue === 1;
            case 'field_unchecked':
                return !fieldValue || fieldValue === false || fieldValue === 'false' || fieldValue === 0;
            case 'field_in_list':
                return values?.includes(fieldValue);
            case 'and':
                return (condition.conditions || []).every(c => this._evaluateCondition(c, fieldValues));
            case 'or':
                return (condition.conditions || []).some(c => this._evaluateCondition(c, fieldValues));
            default:
                return true;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // FORM METADATA
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get form metadata
     * @returns {Object|null}
     */
    getFormMetadata() {
        return this._currentIntelligence?.form || null;
    }

    /**
     * Get all sections
     * @returns {Array}
     */
    getSections() {
        return this._currentIntelligence?.sections || [];
    }

    /**
     * Get confidence score
     * @returns {number}
     */
    getConfidence() {
        return this._currentIntelligence?.$confidence || 0;
    }

    /**
     * Get generation timestamp
     * @returns {string|null}
     */
    getGeneratedAt() {
        return this._currentIntelligence?.$generated || null;
    }
}

// Singleton instance
export const fieldIntelligenceStore = new FieldIntelligenceStore();
