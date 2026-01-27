/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - TemplateStore
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   מנהל תבניות AI - שלד של שדות שזוהו על ידי AI.
 *   עוקב אחרי התקדמות: אילו שדות מופו, אילו דולגו, אילו בעייתיים.
 *
 * איך זה עובד:
 *   - ADDITIVE ONLY - רק מוסיף מידע, לא מוחק
 *   - מצבי שדה: unmapped → mapped → complete → skipped
 *   - זיהוי כפילויות ובעיות (exceptions)
 *   - מצב Entity Mapping (טבלה / אצווה לשדות חוזרים)
 *   - נעילת תבנית למניעת שינויים מקריים
 *
 * מי משתמש בקובץ:
 *   - GuidedMappingUI.js - הצגת התקדמות למשתמש
 *   - DrawController.js - בדיקה אם שדה שייך לתבנית
 *   - MapperCore.js - טעינת תבנית
 *
 * באיזה מצבים:
 *   מצב מיפוי מונחה (Guided) - כשיש תבנית AI טעונה
 *
 * Singleton: export const templateStore
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * TemplateStore - AI Template Skeleton Manager (V3.3)
 *
 * Manages loaded AI-generated template skeletons.
 * Tracks field mapping progress, exceptions, and duplicate groups.
 *
 * ADDITIVE ONLY - does not modify existing field management.
 * Works alongside StateManager, not replacing it.
 */
import { eventBus, Events } from './EventBus.js';

// Template field status enum
export const TemplateFieldStatus = {
    UNMAPPED: 'unmapped',     // Template field, no position yet
    MAPPED: 'mapped',         // Has position, pending review
    COMPLETE: 'complete',     // Confirmed, ready for export
    SKIPPED: 'skipped'        // User marked as N/A
};

// Exception types
export const ExceptionType = {
    AMBIGUOUS_FIELD: 'ambiguous_field',
    DUPLICATE_DETECTION: 'duplicate_detection',
    TYPE_MISMATCH: 'type_mismatch'
};

// V3.4: Entity mapping mode - how repeatable entities should be mapped
export const EntityMappingMode = {
    UNDECIDED: 'undecided',    // Not yet chosen by user
    TABLE: 'table',            // Use table flow (structured rows)
    BATCH: 'batch'             // Use batch mapping (simple duplicates)
};

export class TemplateStore {
    constructor() {
        // Template data
        this.template = null;
        this.templateId = null;
        this.isLocked = false;

        // Runtime state
        this._fieldStatusMap = new Map();  // templateFieldId -> status
        this._mappedFieldIds = new Map();  // templateFieldId -> internal fieldId
        this._exceptions = [];             // Unresolved exceptions
        this._activeTargetId = null;       // Currently active unmapped field

        // V3.4: Repeatable entity mapping mode storage
        this._entityMappingModes = new Map();  // entityId -> EntityMappingMode
        this._repeatableEntities = new Map();  // entityId -> { basePattern, instances[], columns[] }

        // Progress cache
        this._progressCache = null;
        this._progressDirty = true;
    }

    /**
     * Check if a template is currently loaded
     * @returns {boolean}
     */
    isLoaded() {
        return this.template !== null;
    }

    /**
     * Load a template skeleton JSON
     * @param {Object|Array} json - Template skeleton data (skeleton format or flat array)
     * @returns {{ success: boolean, error?: string }}
     */
    loadTemplate(json) {
        // V3.4: Auto-detect and convert flat format [{ name, label_he, group, ... }]
        // V3.7: Also handle field-intelligence format and other non-skeleton formats
        let normalizedJson = json;

        if (Array.isArray(json)) {
            console.log('[TemplateStore] Detected flat array format, converting...');
            normalizedJson = this._convertFlatFormat(json);
        } else if (json && !json.$schema && json.fields) {
            // Object with fields but no $schema - treat as flat format
            console.log('[TemplateStore] Detected flat object format, converting...');
            normalizedJson = this._convertFlatFormat(json.fields, json);
        } else if (json && json.$schema && !json.$schema.startsWith('template-skeleton')) {
            // V3.7: Non-skeleton format (field-intelligence, fill-engine, etc.)
            // Convert if it has fields array
            if (json.fields && Array.isArray(json.fields)) {
                console.log(`[TemplateStore] Converting ${json.$schema} format to skeleton...`);
                normalizedJson = this._convertFlatFormat(json.fields, json);
            } else {
                console.error(`[TemplateStore] Unknown format: ${json.$schema}, no fields array`);
                return { success: false, error: `Unknown format: ${json.$schema}` };
            }
        }

        // Validate schema
        const validation = this._validateSchema(normalizedJson);
        if (!validation.valid) {
            console.error('[TemplateStore] Invalid template:', validation.error);
            return { success: false, error: validation.error };
        }

        // Clear previous state
        this.clear();

        // Store template
        this.template = normalizedJson;
        this.templateId = normalizedJson.pdfHash || `template_${Date.now()}`;

        // Initialize field status map (all unmapped initially)
        if (normalizedJson.fields && Array.isArray(normalizedJson.fields)) {
            normalizedJson.fields.forEach(field => {
                this._fieldStatusMap.set(field.template_field_id, TemplateFieldStatus.UNMAPPED);
            });
        }

        // Load exceptions - V3.4: Enrich with full field data
        if (normalizedJson.exceptions && Array.isArray(normalizedJson.exceptions)) {
            this._exceptions = normalizedJson.exceptions
                .filter(e => !e.resolved)
                .map(exc => {
                    // Find the related field and attach its data
                    const fieldId = exc.field_id || exc.template_field_id;
                    const field = normalizedJson.fields?.find(f =>
                        f.template_field_id === fieldId || f.name === fieldId
                    );

                    // Enrich exception with field data
                    return {
                        ...exc,
                        id: exc.exception_id || exc.id || `exc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        field: field || null,
                        fieldName: field?.label_he || field?.name || exc.field_name || exc.fieldName,
                        // If exception has interpretations, enrich those too
                        interpretations: exc.interpretations?.map(interp => {
                            const interpField = normalizedJson.fields?.find(f =>
                                f.template_field_id === interp.field_id || f.name === interp.field_id
                            );
                            return { ...interp, ...interpField };
                        })
                    };
                });
        }

        this._progressDirty = true;

        console.log(`[TemplateStore] Template loaded: ${this.templateId}`);
        console.log(`[TemplateStore] Fields: ${this._fieldStatusMap.size}, Exceptions: ${this._exceptions.length}`);

        // Emit event
        eventBus.emit(Events.TEMPLATE_LOADED, {
            templateId: this.templateId,
            fieldCount: this._fieldStatusMap.size,
            exceptionCount: this._exceptions.length,
            entities: this.getEntities()
        });

        return { success: true };
    }

    /**
     * Validate template schema
     * @param {Object} json - Template data
     * @returns {{ valid: boolean, error?: string }}
     */
    _validateSchema(json) {
        if (!json || typeof json !== 'object') {
            return { valid: false, error: 'Template must be an object' };
        }

        if (!json.$schema || !json.$schema.startsWith('template-skeleton')) {
            return { valid: false, error: 'Missing or invalid $schema' };
        }

        if (!json.fields || !Array.isArray(json.fields)) {
            return { valid: false, error: 'Missing or invalid fields array' };
        }

        // Validate each field has required properties
        for (const field of json.fields) {
            if (!field.template_field_id) {
                return { valid: false, error: 'Field missing template_field_id' };
            }
            if (!field.canonical) {
                return { valid: false, error: `Field ${field.template_field_id} missing canonical` };
            }
            if (!field.entity_id) {
                return { valid: false, error: `Field ${field.template_field_id} missing entity_id` };
            }
        }

        return { valid: true };
    }

    /**
     * V3.4: Convert flat JSON format to skeleton format
     * Flat format: [{ name, label_he, type, group, group_name }, ...]
     * Skeleton format: { $schema, entities: [...], fields: [...] }
     * @param {Array} flatFields - Array of flat field objects
     * @param {Object} metadata - Optional metadata from wrapper object
     * @returns {Object} Skeleton-format template
     */
    _convertFlatFormat(flatFields, metadata = {}) {
        // Extract unique groups/entities
        // V3.7: Support field-intelligence format (section_id) and flat format (group)
        const groupMap = new Map(); // group -> { group_name, fields[] }

        // V3.7: If metadata has sections, use them for group names
        const sectionsMap = new Map();
        if (metadata.sections && Array.isArray(metadata.sections)) {
            metadata.sections.forEach(s => {
                sectionsMap.set(s.id, s.name_he || s.name_en || s.id);
            });
        }

        flatFields.forEach((field, index) => {
            const groupId = field.group || field.entity_id || field.section_id || 'default';
            const groupName = field.group_name || field.entity_name_he ||
                              sectionsMap.get(groupId) || groupId;

            if (!groupMap.has(groupId)) {
                groupMap.set(groupId, {
                    entity_id: groupId,
                    entity_name_he: groupName,
                    entity_name_en: groupId,
                    order: groupMap.size,
                    fields: []
                });
            }

            groupMap.get(groupId).fields.push({
                ...field,
                _originalIndex: index
            });
        });

        // Build entities array
        const entities = [];
        groupMap.forEach((groupData, groupId) => {
            entities.push({
                entity_id: groupData.entity_id,
                entity_name_he: groupData.entity_name_he,
                entity_name_en: groupData.entity_name_en,
                label_he: groupData.entity_name_he,
                label_en: groupData.entity_name_en,
                order: groupData.order
            });
        });

        // Build fields array with skeleton format
        // V3.7: Support both flat format and field-intelligence format
        const fields = flatFields.map((field, index) => {
            // Handle different naming conventions
            const fieldName = field.name || field.id || `field_${index}`;
            const labelHe = field.label_he || field.display?.name_he || fieldName;
            const labelEn = field.label_en || field.display?.name_en || field.name || fieldName;
            const groupId = field.group || field.entity_id || field.section_id || 'default';

            return {
                // Required skeleton fields
                template_field_id: field.template_field_id || field.id || fieldName,
                canonical: field.canonical || fieldName,
                entity_id: groupId,
                // Preserve original fields
                name: fieldName,
                label_he: labelHe,
                label_en: labelEn,
                type: field.type || 'text',
                // Optional fields
                required: field.required || field.rules?.required,
                renderHint: field.renderHint,
                validations: field.validations,
                instance: field.instance,
                duplicateGroup: field.duplicateGroup,
                order: field.order || index,
                // V3.7: Preserve fill-engine hints
                context: field.context,
                headerHints: field.headerHints,
                format: field.format
            };
        });

        const skeleton = {
            $schema: 'template-skeleton-v3.4-converted',
            pdfHash: metadata.pdfHash || `flat_${Date.now()}`,
            entities: entities,
            fields: fields,
            tables: metadata.tables || [],
            exceptions: metadata.exceptions || []
        };

        console.log(`[TemplateStore] Converted flat format: ${fields.length} fields, ${entities.length} entities`);
        return skeleton;
    }

    /**
     * Clear template state
     */
    clear() {
        const hadTemplate = this.template !== null;

        this.template = null;
        this.templateId = null;
        this.isLocked = false;
        this._fieldStatusMap.clear();
        this._mappedFieldIds.clear();
        this._exceptions = [];
        this._activeTargetId = null;
        this._progressCache = null;
        this._progressDirty = true;

        // V3.4: Clear repeatable entity state
        this._entityMappingModes.clear();
        this._repeatableEntities.clear();

        if (hadTemplate) {
            console.log('[TemplateStore] Template cleared');
            eventBus.emit(Events.TEMPLATE_CLEARED, {});
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ENTITY METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get all entities from template
     * @returns {Array} Entity definitions
     */
    getEntities() {
        if (!this.template || !this.template.entities) {
            return [];
        }
        return [...this.template.entities].sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    /**
     * Get entity by ID
     * @param {string} entityId - Entity ID
     * @returns {Object|null} Entity definition
     */
    getEntity(entityId) {
        if (!this.template || !this.template.entities) {
            return null;
        }
        return this.template.entities.find(e => e.entity_id === entityId) || null;
    }

    // ═══════════════════════════════════════════════════════════════
    // V3.4: REPEATABLE ENTITY DETECTION & MODE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Detect if a template field belongs to a repeatable entity pattern
     * Patterns like: child_1_name, child_2_name, child_3_name
     *
     * @param {string} templateFieldId - The field to check
     * @returns {Object|null} Detection result or null if not repeatable
     *   { entityId, baseName, instanceNum, pattern, instances[], columns[] }
     */
    detectRepeatableEntity(templateFieldId) {
        console.log('[TemplateStore] detectRepeatableEntity called for:', templateFieldId);

        const field = this.getField(templateFieldId);
        if (!field) {
            console.log('[TemplateStore] detectRepeatableEntity: field not found');
            return null;
        }

        // Check if we already detected this entity
        const entityId = field.entity_id;
        console.log('[TemplateStore] detectRepeatableEntity: entityId =', entityId);

        if (this._repeatableEntities.has(entityId)) {
            const cached = this._repeatableEntities.get(entityId);
            console.log('[TemplateStore] detectRepeatableEntity: using cached result', cached);
            return {
                entityId,
                ...cached,
                isRepeatable: cached.instances.length > 1
            };
        }

        // Analyze fields in this entity for repeatable patterns
        const entityFields = this.template.fields.filter(f => f.entity_id === entityId);
        console.log('[TemplateStore] detectRepeatableEntity: entity has', entityFields.length, 'fields');
        console.log('[TemplateStore] detectRepeatableEntity: field IDs:', entityFields.map(f => f.template_field_id));

        const detection = this._analyzeRepeatablePattern(entityFields);
        console.log('[TemplateStore] detectRepeatableEntity: pattern analysis result:', detection);

        if (detection) {
            // Cache the result
            this._repeatableEntities.set(entityId, detection);
            console.log(`[TemplateStore] Detected repeatable entity: ${entityId}`, detection);
            return {
                entityId,
                ...detection,
                isRepeatable: detection.instances.length > 1
            };
        }

        console.log('[TemplateStore] detectRepeatableEntity: no pattern detected');
        return null;
    }

    /**
     * Analyze fields to detect repeatable pattern
     * Looks for patterns like: prefix_N_suffix (e.g., child_1_name, child_2_name)
     *
     * @param {Array} fields - Fields in the entity
     * @returns {Object|null} Pattern info or null
     */
    _analyzeRepeatablePattern(fields) {
        if (!fields || fields.length < 2) return null;

        // Try to extract patterns from field names
        // Pattern: prefix_NUMBER_suffix or prefixNUMBERsuffix
        const patternRegex = /^(.+?)[-_]?(\d+)[-_]?(.*)$/;

        // Group fields by their base pattern (without number)
        const patternGroups = new Map();

        fields.forEach(field => {
            // V3.4: Check template_field_id FIRST as it often contains the numbered pattern
            // Then fallback to label_en, canonical, name
            const name = field.template_field_id || field.label_en || field.canonical || field.name || '';
            console.log('[TemplateStore] _analyzeRepeatablePattern: checking field name:', name);
            const match = name.match(patternRegex);

            if (match) {
                const [, prefix, num, suffix] = match;
                const basePattern = `${prefix}_#_${suffix}`.toLowerCase();
                const instanceNum = parseInt(num, 10);

                if (!patternGroups.has(basePattern)) {
                    patternGroups.set(basePattern, {
                        prefix,
                        suffix,
                        instances: new Map(),  // instanceNum -> fields[]
                        columns: new Set()     // unique column names (suffix parts)
                    });
                }

                const group = patternGroups.get(basePattern);
                if (!group.instances.has(instanceNum)) {
                    group.instances.set(instanceNum, []);
                }
                group.instances.get(instanceNum).push(field);
                group.columns.add(suffix || prefix);
            }
        });

        // Find the best matching pattern (most instances)
        let bestPattern = null;
        let bestCount = 0;

        patternGroups.forEach((group, pattern) => {
            const instanceCount = group.instances.size;
            if (instanceCount > bestCount && instanceCount > 1) {
                bestCount = instanceCount;
                bestPattern = {
                    basePattern: pattern,
                    prefix: group.prefix,
                    suffix: group.suffix,
                    instances: Array.from(group.instances.keys()).sort((a, b) => a - b),
                    columns: Array.from(group.columns),
                    fieldsPerInstance: group.instances.get(Array.from(group.instances.keys())[0])?.length || 0,
                    totalFields: Array.from(group.instances.values()).reduce((sum, arr) => sum + arr.length, 0)
                };
            }
        });

        return bestPattern;
    }

    /**
     * Get the mapping mode for an entity
     * @param {string} entityId - Entity ID
     * @returns {string} EntityMappingMode value
     */
    getEntityMappingMode(entityId) {
        return this._entityMappingModes.get(entityId) || EntityMappingMode.UNDECIDED;
    }

    /**
     * Set the mapping mode for an entity
     * @param {string} entityId - Entity ID
     * @param {string} mode - EntityMappingMode value
     */
    setEntityMappingMode(entityId, mode) {
        const previousMode = this._entityMappingModes.get(entityId);
        this._entityMappingModes.set(entityId, mode);

        console.log(`[TemplateStore] Entity ${entityId} mapping mode: ${previousMode || 'none'} -> ${mode}`);

        // Emit event for UI to react
        eventBus.emit('entity:mappingModeChanged', {
            entityId,
            mode,
            previousMode
        });
    }

    /**
     * Check if entity mapping mode decision is needed
     * @param {string} templateFieldId - Field being mapped
     * @returns {Object|null} { entityId, detection } if decision needed, null otherwise
     */
    needsMappingModeDecision(templateFieldId) {
        console.log('[TemplateStore] needsMappingModeDecision called for:', templateFieldId);

        const field = this.getField(templateFieldId);
        if (!field) {
            console.log('[TemplateStore] Field not found:', templateFieldId);
            return null;
        }

        const entityId = field.entity_id;
        console.log('[TemplateStore] Field entity_id:', entityId);

        // Already decided?
        const currentMode = this.getEntityMappingMode(entityId);
        console.log('[TemplateStore] Current entity mode:', currentMode);
        if (currentMode !== EntityMappingMode.UNDECIDED) {
            console.log('[TemplateStore] Already decided, skipping');
            return null; // Already decided
        }

        // Is this a repeatable entity?
        const detection = this.detectRepeatableEntity(templateFieldId);
        console.log('[TemplateStore] Detection result:', detection);
        if (!detection || !detection.isRepeatable) {
            console.log('[TemplateStore] Not repeatable or no detection');
            return null; // Not repeatable, no decision needed
        }

        console.log('[TemplateStore] Decision needed! Returning:', { entityId, detection });
        return { entityId, detection };
    }

    /**
     * Get table columns from repeatable entity detection
     * Used when user chooses TABLE mode
     * @param {string} entityId - Entity ID
     * @returns {Array} Column definitions for table flow
     */
    getRepeatableEntityColumns(entityId) {
        const detection = this._repeatableEntities.get(entityId);
        if (!detection) return [];

        // Get entity and fields
        const entity = this.getEntity(entityId);
        const entityFields = this.template.fields.filter(f => f.entity_id === entityId);

        // Get fields from first instance to define columns
        const firstInstance = detection.instances[0];
        const patternRegex = /^(.+?)[-_]?(\d+)[-_]?(.*)$/;

        const columns = [];
        const seenColumns = new Set();

        entityFields.forEach(field => {
            // V3.4: Check template_field_id FIRST for pattern matching
            const name = field.template_field_id || field.label_en || field.canonical || field.name || '';
            const match = name.match(patternRegex);

            if (match) {
                const [, prefix, num, suffix] = match;
                const instanceNum = parseInt(num, 10);

                // Only process first instance
                if (instanceNum === firstInstance) {
                    const columnId = suffix || prefix;
                    if (!seenColumns.has(columnId)) {
                        seenColumns.add(columnId);
                        columns.push({
                            columnId: columnId,
                            hebrewName: field.label_he || columnId,
                            englishName: columnId,
                            type: field.type || 'text',
                            templateFieldPattern: `${prefix}_#_${suffix}`
                        });
                    }
                }
            }
        });

        return columns;
    }

    // ═══════════════════════════════════════════════════════════════
    // FIELD METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get all template fields
     * @returns {Array} Template field definitions
     */
    getFields() {
        if (!this.template || !this.template.fields) {
            return [];
        }
        return [...this.template.fields];
    }

    /**
     * Get fields grouped by entity
     * @returns {Map<string, Array>} entityId -> fields[]
     */
    getFieldsByEntity() {
        const grouped = new Map();

        if (!this.template || !this.template.fields) {
            return grouped;
        }

        this.template.fields.forEach(field => {
            const entityId = field.entity_id;
            if (!grouped.has(entityId)) {
                grouped.set(entityId, []);
            }
            grouped.get(entityId).push({
                ...field,
                status: this.getFieldStatus(field.template_field_id)
            });
        });

        return grouped;
    }

    /**
     * Get template field by ID
     * @param {string} templateFieldId - Template field ID
     * @returns {Object|null} Field definition
     */
    getField(templateFieldId) {
        if (!this.template || !this.template.fields) {
            return null;
        }
        return this.template.fields.find(f => f.template_field_id === templateFieldId) || null;
    }

    /**
     * Get template field by canonical name and entity
     * @param {string} canonical - Canonical field name
     * @param {string} entityId - Entity ID
     * @param {number} instance - Instance number for repeating entities (optional)
     * @returns {Object|null} Field definition
     */
    getFieldByCanonical(canonical, entityId, instance = null) {
        if (!this.template || !this.template.fields) {
            return null;
        }
        return this.template.fields.find(f =>
            f.canonical === canonical &&
            f.entity_id === entityId &&
            (instance === null || f.instance === instance)
        ) || null;
    }

    /**
     * Get field status
     * @param {string} templateFieldId - Template field ID
     * @returns {string} Status from TemplateFieldStatus enum
     */
    getFieldStatus(templateFieldId) {
        return this._fieldStatusMap.get(templateFieldId) || TemplateFieldStatus.UNMAPPED;
    }

    /**
     * Set field status
     * @param {string} templateFieldId - Template field ID
     * @param {string} status - Status from TemplateFieldStatus enum
     */
    setFieldStatus(templateFieldId, status) {
        if (this.isLocked) {
            console.warn('[TemplateStore] Cannot modify locked template');
            return;
        }

        const prevStatus = this._fieldStatusMap.get(templateFieldId);
        this._fieldStatusMap.set(templateFieldId, status);
        this._progressDirty = true;

        console.log(`[TemplateStore] Field ${templateFieldId}: ${prevStatus} -> ${status}`);
    }

    /**
     * Link a mapped field to its template field
     * @param {string} templateFieldId - Template field ID
     * @param {string} internalFieldId - Internal StateManager field ID
     */
    linkMappedField(templateFieldId, internalFieldId) {
        this._mappedFieldIds.set(templateFieldId, internalFieldId);
        this.setFieldStatus(templateFieldId, TemplateFieldStatus.MAPPED);

        // Emit mapping event
        const templateField = this.getField(templateFieldId);
        eventBus.emit(Events.TEMPLATE_FIELD_MAPPED, {
            fieldId: internalFieldId,
            templateFieldId: templateFieldId,
            canonical: templateField?.canonical,
            entity_id: templateField?.entity_id
        });

        // Update progress
        this._emitProgressChange();
    }

    /**
     * V3.4: Unlink a mapped field from its template field
     * Used when undoing a mapping (e.g., switching to table mode)
     * @param {string} templateFieldId - Template field ID
     */
    unlinkMappedField(templateFieldId) {
        this._mappedFieldIds.delete(templateFieldId);
        console.log(`[TemplateStore] Unlinked mapped field: ${templateFieldId}`);
        // Note: Status should be set separately by caller
        this._emitProgressChange();
    }

    /**
     * Get internal field ID for a template field
     * @param {string} templateFieldId - Template field ID
     * @returns {string|null} Internal field ID
     */
    getMappedFieldId(templateFieldId) {
        return this._mappedFieldIds.get(templateFieldId) || null;
    }

    // ═══════════════════════════════════════════════════════════════
    // UNMAPPED FIELD NAVIGATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get all unmapped fields
     * @param {number} page - Optional page filter
     * @returns {Array} Unmapped template fields
     */
    getUnmappedFields(page = null) {
        if (!this.template || !this.template.fields) {
            return [];
        }

        return this.template.fields.filter(field => {
            const status = this.getFieldStatus(field.template_field_id);
            return status === TemplateFieldStatus.UNMAPPED;
        });
    }

    /**
     * Get next unmapped field (smart ordering: by entity order, then field order)
     * @returns {Object|null} Next unmapped field, or null if all mapped
     */
    getNextUnmapped() {
        const unmapped = this.getUnmappedFields();
        if (unmapped.length === 0) {
            return null;
        }

        // Sort by entity order, then by field order
        const entities = this.getEntities();
        const entityOrder = new Map(entities.map((e, i) => [e.entity_id, i]));

        unmapped.sort((a, b) => {
            const entityA = entityOrder.get(a.entity_id) ?? 999;
            const entityB = entityOrder.get(b.entity_id) ?? 999;
            if (entityA !== entityB) return entityA - entityB;
            return (a.order || 0) - (b.order || 0);
        });

        return unmapped[0];
    }

    /**
     * Set the active target field for mapping
     * @param {string} templateFieldId - Template field ID to activate
     */
    setActiveTarget(templateFieldId) {
        this._activeTargetId = templateFieldId;

        const field = this.getField(templateFieldId);
        if (field) {
            eventBus.emit(Events.NEXT_UNMAPPED_ACTIVATED, {
                templateFieldId: templateFieldId,
                canonical: field.canonical,
                entity_id: field.entity_id,
                label_he: field.label_he
            });
        }
    }

    /**
     * Get current active target field
     * @returns {Object|null} Active template field
     */
    getActiveTarget() {
        if (!this._activeTargetId) {
            return null;
        }
        return this.getField(this._activeTargetId);
    }

    /**
     * Clear active target
     */
    clearActiveTarget() {
        this._activeTargetId = null;
    }

    // ═══════════════════════════════════════════════════════════════
    // DUPLICATE / BATCH MAPPING
    // ═══════════════════════════════════════════════════════════════

    /**
     * Find duplicate fields (same duplicateGroup)
     * @param {string} templateFieldId - Template field ID
     * @returns {Array} Other fields in same duplicate group (excluding source)
     */
    getDuplicatesOf(templateFieldId) {
        const sourceField = this.getField(templateFieldId);
        if (!sourceField || !sourceField.duplicateGroup) {
            return [];
        }

        return this.template.fields.filter(f =>
            f.duplicateGroup === sourceField.duplicateGroup &&
            f.template_field_id !== templateFieldId &&
            this.getFieldStatus(f.template_field_id) === TemplateFieldStatus.UNMAPPED
        );
    }

    /**
     * Get all fields in a duplicate group
     * @param {string} groupName - Duplicate group name
     * @returns {Array} All fields in group
     */
    getDuplicateGroup(groupName) {
        if (!this.template || !this.template.fields || !groupName) {
            return [];
        }
        return this.template.fields.filter(f => f.duplicateGroup === groupName);
    }

    // ═══════════════════════════════════════════════════════════════
    // EXCEPTION HANDLING
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get all unresolved exceptions
     * @returns {Array} Exception objects
     */
    getExceptions() {
        return [...this._exceptions];
    }

    /**
     * Check if there are unresolved exceptions
     * @returns {boolean}
     */
    hasExceptions() {
        return this._exceptions.length > 0;
    }

    /**
     * Get exception by ID
     * V3.4: Check both 'id' and 'exception_id' for compatibility
     * @param {string} exceptionId - Exception ID
     * @returns {Object|null} Exception object
     */
    getException(exceptionId) {
        return this._exceptions.find(e =>
            e.id === exceptionId || e.exception_id === exceptionId
        ) || null;
    }

    /**
     * Resolve an exception by choosing a candidate
     * @param {string} exceptionId - Exception ID
     * @param {Object} choice - Selected candidate { entity_id, canonical }
     * @returns {boolean} Success
     */
    resolveException(exceptionId, choice) {
        const index = this._exceptions.findIndex(e =>
            e.id === exceptionId || e.exception_id === exceptionId
        );
        if (index === -1) {
            console.warn('[TemplateStore] Exception not found:', exceptionId);
            return false;
        }

        const exception = this._exceptions[index];

        // Remove from unresolved list
        this._exceptions.splice(index, 1);

        console.log(`[TemplateStore] Exception resolved: ${exceptionId}`, choice);

        // Emit event
        eventBus.emit(Events.EXCEPTION_RESOLVED, {
            exceptionId: exceptionId,
            choice: choice,
            type: exception.type
        });

        // Check if all resolved
        if (this._exceptions.length === 0) {
            eventBus.emit(Events.ALL_EXCEPTIONS_RESOLVED, {});
        }

        return true;
    }

    /**
     * Skip an exception (mark as not applicable)
     * @param {string} exceptionId - Exception ID
     * @returns {boolean} Success
     */
    skipException(exceptionId) {
        const index = this._exceptions.findIndex(e =>
            e.id === exceptionId || e.exception_id === exceptionId
        );
        if (index === -1) {
            return false;
        }

        this._exceptions.splice(index, 1);

        eventBus.emit(Events.EXCEPTION_SKIPPED, { exceptionId });

        if (this._exceptions.length === 0) {
            eventBus.emit(Events.ALL_EXCEPTIONS_RESOLVED, {});
        }

        return true;
    }

    /**
     * Skip all remaining exceptions
     */
    skipAllExceptions() {
        const count = this._exceptions.length;
        this._exceptions.forEach(e => {
            eventBus.emit(Events.EXCEPTION_SKIPPED, { exceptionId: e.id || e.exception_id });
        });
        this._exceptions = [];

        console.log(`[TemplateStore] Skipped ${count} exceptions`);
        eventBus.emit(Events.ALL_EXCEPTIONS_RESOLVED, {});
    }

    // ═══════════════════════════════════════════════════════════════
    // PROGRESS TRACKING
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get mapping progress
     * @returns {{ mapped: number, total: number, percentage: number }}
     */
    getMappingProgress() {
        if (!this._progressDirty && this._progressCache) {
            return this._progressCache;
        }

        const total = this._fieldStatusMap.size;
        let mapped = 0;

        this._fieldStatusMap.forEach(status => {
            if (status === TemplateFieldStatus.MAPPED ||
                status === TemplateFieldStatus.COMPLETE) {
                mapped++;
            }
        });

        const percentage = total > 0 ? Math.round((mapped / total) * 100) : 0;

        this._progressCache = { mapped, total, percentage };
        this._progressDirty = false;

        return this._progressCache;
    }

    /**
     * Emit progress change event
     */
    _emitProgressChange() {
        this._progressDirty = true;
        const progress = this.getMappingProgress();
        eventBus.emit(Events.MAPPING_PROGRESS_CHANGED, progress);
    }

    /**
     * Check if all fields are mapped
     * @returns {boolean}
     */
    isComplete() {
        const progress = this.getMappingProgress();
        return progress.mapped === progress.total && progress.total > 0;
    }

    // ═══════════════════════════════════════════════════════════════
    // LOCK / EXPORT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Lock the template (prevent further edits)
     */
    lockTemplate() {
        if (this.isLocked) return;

        this.isLocked = true;
        console.log('[TemplateStore] Template locked');

        eventBus.emit(Events.TEMPLATE_LOCKED, {
            templateId: this.templateId
        });
    }

    /**
     * Export template state for saving
     * @returns {Object} Template state
     */
    toJSON() {
        return {
            templateId: this.templateId,
            isLocked: this.isLocked,
            fieldStatus: Object.fromEntries(this._fieldStatusMap),
            mappedFieldIds: Object.fromEntries(this._mappedFieldIds),
            progress: this.getMappingProgress()
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // TABLES & GROUPS (Template definitions)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get all table definitions from template
     * @returns {Array} Table definitions
     */
    getTables() {
        if (!this.template || !this.template.tables) {
            return [];
        }
        return [...this.template.tables];
    }

    /**
     * Get table by ID
     * @param {string} tableId - Table ID
     * @returns {Object|null} Table definition
     */
    getTable(tableId) {
        if (!this.template || !this.template.tables) {
            return null;
        }
        return this.template.tables.find(t => t.table_id === tableId) || null;
    }

    /**
     * Get all group definitions from template
     * @returns {Array} Group definitions (radio/checkbox)
     */
    getGroups() {
        if (!this.template || !this.template.groups) {
            return [];
        }
        return [...this.template.groups];
    }

    /**
     * Get group by ID
     * @param {string} groupId - Group ID
     * @returns {Object|null} Group definition
     */
    getGroup(groupId) {
        if (!this.template || !this.template.groups) {
            return null;
        }
        return this.template.groups.find(g => g.group_id === groupId) || null;
    }
}

// Singleton instance
export const templateStore = new TemplateStore();
