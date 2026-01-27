/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - field-intelligence-schema
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   מגדיר את הסכמה (schema) של נתוני AI.
 *   מבנה ה-JSON שה-AI מחזיר: שם קנוני, הקשר, פורמט,
 *   סוג נתון (ISRAELI_ID, PERSON_NAME, PHONE, DATE...).
 *
 * עיקרון חשוב:
 *   הסכמה היא סמנטית בלבד - אין בה קואורדינטות, מספרי עמוד,
 *   או מידע ויזואלי. רק משמעות.
 *
 * מי משתמש בקובץ:
 *   - AIService.js - ולידציית תשובות AI
 *   - FieldIntelligenceStore.js - אחסון לפי הסכמה
 *   - FillEngineExporter.js - ייצוא עם מידע סמנטי
 *
 * באיזה מצבים:
 *   כשיש נתוני AI - ולידציה ואחסון
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Field Intelligence Schema Definition
 * Version 2.0 - Enhanced for Fill Engine Integration
 *
 * This file defines the structure of AI-generated Field Intelligence JSON.
 * The format is GENERIC - works for ANY PDF form, not specific to any form type.
 *
 * CRITICAL: This is a SEMANTIC format only.
 * NO coordinates, NO page numbers, NO visual layout.
 *
 * Consumers:
 * - Mapping Tool: reads only { id, order, display.name_he, section_id }
 * - Filling Tool: reads everything for guidance and logic
 * - Fill Engine: reads semantic hints for Excel→PDF matching
 * - Export Engine: produces merged output with coordinates + semantics
 *
 * V2.0 Additions for Fill Engine:
 * - canonical: Standard field name (e.g., 'first_name', 'id_number')
 * - context: Who this field belongs to ('employee', 'employer', 'spouse', 'child')
 * - headerHints: Excel column names that should match this field
 * - headerExclude: Excel column names that should NOT match this field
 * - format: Expected format (date, phone, etc.) with locale hints
 * - valueMap: For radio/checkbox - maps Excel values to PDF marks
 */

// ============ SCHEMA VERSION ============
export const FIELD_INTELLIGENCE_SCHEMA_VERSION = 'field-intelligence-v2';

// ============ DATA TYPES ============
// Generic semantic data types (not display types)
export const SemanticDataTypes = {
    // Identity
    ISRAELI_ID: 'israeli_id',
    PASSPORT_NUMBER: 'passport_number',

    // Personal
    PERSON_NAME: 'person_name',
    ORGANIZATION_NAME: 'organization_name',

    // Contact
    PHONE: 'phone',
    EMAIL: 'email',
    ADDRESS: 'address',
    CITY: 'city',
    POSTAL_CODE: 'postal_code',

    // Dates
    DATE: 'date',
    DATE_RANGE: 'date_range',

    // Numbers
    CURRENCY: 'currency',
    PERCENTAGE: 'percentage',
    COUNT: 'count',
    NUMBER: 'number',

    // Selection
    ENUM: 'enum',
    BOOLEAN: 'boolean',

    // Text
    FREE_TEXT: 'free_text',
    MULTILINE_TEXT: 'multiline_text',

    // Special
    SIGNATURE: 'signature',
    FILE_ATTACHMENT: 'file_attachment'
};

// ============ SENSITIVITY LEVELS ============
export const SensitivityLevel = {
    LOW: 'low',       // Public info (form name, section titles)
    MEDIUM: 'medium', // Personal but not secret (address, marital status)
    HIGH: 'high',     // Sensitive (ID numbers, financial info)
    CRITICAL: 'critical' // Highly sensitive (full financial records)
};

// ============ FILLER TYPES ============
export const FillerType = {
    EMPLOYEE: 'employee',
    EMPLOYER: 'employer',
    AGENT: 'agent',
    SYSTEM: 'system',
    ANY: 'any'
};

// ============ CONTEXT TYPES (V2.0) ============
// Context determines WHO the field belongs to - critical for Excel matching
export const ContextType = {
    EMPLOYEE: 'employee',      // Primary person (the employee/applicant)
    EMPLOYER: 'employer',      // Employer/company
    SPOUSE: 'spouse',          // Spouse (בן/בת זוג)
    CHILD: 'child',            // Child - with instance number (child_1, child_2)
    DEPENDENT: 'dependent',    // Generic dependent
    PARENT: 'parent',          // Parent (for dependent care)
    PREVIOUS_EMPLOYER: 'previous_employer',  // Previous employer
    BANK: 'bank',              // Banking details
    TAX_AUTHORITY: 'tax_authority',  // Tax authority
    GENERAL: 'general'         // Form-level or shared fields
};

// ============ FORMAT TYPES (V2.0) ============
// Format hints for the fill engine
export const FormatType = {
    // Date formats
    DATE_DMY: 'DD/MM/YYYY',
    DATE_YMD: 'YYYY-MM-DD',
    DATE_MDY: 'MM/DD/YYYY',
    DATE_HEBREW: 'DD/MM/YYYY',  // Israeli standard

    // Phone formats
    PHONE_IL: 'phone_il',       // Israeli phone (05X-XXXXXXX)
    PHONE_IL_LANDLINE: 'phone_il_landline',  // 0X-XXXXXXX
    PHONE_INTL: 'phone_intl',   // International format

    // ID formats
    ID_IL: 'id_il',             // Israeli ID (9 digits with checksum)
    PASSPORT: 'passport',

    // Number formats
    CURRENCY_ILS: 'currency_ils',  // ₪ format
    PERCENTAGE: 'percentage',

    // Text formats
    HEBREW_ONLY: 'hebrew_only',
    ENGLISH_ONLY: 'english_only',
    ALPHANUMERIC: 'alphanumeric'
};

// ============ CONDITION TYPES ============
export const ConditionType = {
    FIELD_EQUALS: 'field_equals',
    FIELD_NOT_EQUALS: 'field_not_equals',
    FIELD_EMPTY: 'field_empty',
    FIELD_NOT_EMPTY: 'field_not_empty',
    FIELD_CHECKED: 'field_checked',
    FIELD_UNCHECKED: 'field_unchecked',
    FIELD_GREATER_THAN: 'field_greater_than',
    FIELD_LESS_THAN: 'field_less_than',
    FIELD_IN_LIST: 'field_in_list',
    AND: 'and',
    OR: 'or',
    ALWAYS: 'always'
};

// ============ ACTION TYPES ============
export const ActionType = {
    SHOW: 'show',
    HIDE: 'hide',
    REQUIRE: 'require',
    OPTIONAL: 'optional',
    ENABLE: 'enable',
    DISABLE: 'disable'
};

// ============ VALIDATION HINT TYPES ============
export const ValidationHintType = {
    // Format validation
    ISRAELI_ID_CHECKSUM: 'israeli_id_checksum',
    EMAIL_FORMAT: 'email_format',
    PHONE_FORMAT: 'phone_format',
    DATE_FORMAT: 'date_format',
    POSTAL_CODE_FORMAT: 'postal_code_format',

    // Value validation
    MIN_LENGTH: 'min_length',
    MAX_LENGTH: 'max_length',
    EXACT_LENGTH: 'exact_length',
    MIN_VALUE: 'min_value',
    MAX_VALUE: 'max_value',
    REGEX_PATTERN: 'regex_pattern',

    // Business logic
    DATE_NOT_FUTURE: 'date_not_future',
    DATE_NOT_PAST: 'date_not_past',
    AGE_MINIMUM: 'age_minimum',
    AGE_MAXIMUM: 'age_maximum'
};

// ============ SCHEMA STRUCTURE ============

/**
 * Complete Field Intelligence JSON structure
 * This is the schema definition - actual data will follow this structure
 */
export const FieldIntelligenceSchema = {
    // Required metadata
    $schema: FIELD_INTELLIGENCE_SCHEMA_VERSION,
    $generated: 'ISO 8601 datetime',
    $generator: 'AI model identifier',
    $confidence: 'number 0-1',

    // Form metadata
    form: {
        id: 'string - unique form identifier',
        name_he: 'string - Hebrew form name',
        name_en: 'string - English form name',
        issuer: 'string - issuing organization',
        year: 'number - form year (optional)',
        purpose: 'string - form purpose description',
        typical_filler: 'FillerType - who usually fills this',
        revision_note: 'string - any version notes (optional)'
    },

    // Sections (logical groupings)
    sections: [
        {
            id: 'string - section identifier',
            order: 'number - display order',
            name_he: 'string - Hebrew section name',
            name_en: 'string - English section name',
            purpose: 'string - section purpose',
            filled_by: 'FillerType',
            field_count: 'number',
            required_attachments: ['array of attachment names']
        }
    ],

    // Fields (the core data)
    fields: [
        {
            // Identification (used by Mapping Tool)
            id: 'string - unique field identifier',
            order: 'number - global order for sequential mapping',
            section_id: 'string - parent section',

            // Display (used by both tools)
            display: {
                name_he: 'string - Hebrew field name (shown to mapping user)',
                name_en: 'string - English field name'
            },

            // Semantics (used by Filling Tool)
            semantics: {
                purpose_short: 'string - one-line explanation',
                purpose_full: 'string - detailed explanation',
                data_type: 'SemanticDataTypes',
                sensitivity: 'SensitivityLevel'
            },

            // ============ V2.0: FILL ENGINE HINTS ============
            // These fields enable smart Excel→PDF matching

            // Canonical name - standard field identifier for matching
            // Examples: 'first_name', 'id_number', 'birth_date', 'bank_account'
            canonical: 'string - standard semantic name from dictionary',

            // Context - WHO this field belongs to (critical for disambiguation)
            // Examples: 'employee', 'spouse', 'child_1', 'employer'
            context: 'ContextType - who this data belongs to',

            // Instance number for repeating contexts (child_1, child_2, etc.)
            instance: 'number (optional) - instance for repeating entities',

            // Header hints - Excel column names that should match this field
            // Fill engine uses these for fuzzy matching
            headerHints: ['array of strings - column names like "שם פרטי", "First Name", "fname"'],

            // Header exclude - column names that should NOT match even if similar
            // Prevents false positives
            headerExclude: ['array of strings - columns to exclude like "שם משפחה" for first_name'],

            // Format hint for validation and display
            format: {
                type: 'FormatType - format like DD/MM/YYYY or phone_il',
                locale: 'string - locale hint like he-IL',
                pattern: 'string (optional) - regex pattern for validation'
            },

            // Guidance (used by Filling Tool)
            guidance: {
                instructions: ['array of instruction strings'],
                examples: ['array of example values'],
                common_mistakes: ['array of common mistakes to avoid']
            },

            // Options for enum/selection fields
            options: [
                {
                    value: 'string - internal value',
                    label_he: 'string - Hebrew label',
                    label_en: 'string - English label (optional)',
                    description: 'string - option description (optional)',
                    warning: 'string - warning if selected (optional)',
                    triggers_attachment: 'string - document required if selected (optional)'
                }
            ],

            // Rules (used by Filling Tool)
            rules: {
                required: 'boolean',
                filled_by: 'FillerType',
                condition: {
                    type: 'ConditionType',
                    field: 'string - field id to check',
                    value: 'any - value to compare',
                    values: ['array - for IN_LIST condition']
                },
                triggers_attachment: 'string - document required',
                part_of_group: 'string - field group identifier'
            }
        }
    ],

    // Dependencies between fields
    dependencies: [
        {
            id: 'string - dependency identifier',
            trigger_field: 'string - field that triggers',
            trigger_condition: {
                type: 'ConditionType',
                value: 'any'
            },
            affected_fields: ['array of field ids'],
            action: 'ActionType'
        }
    ],

    // Required attachments/documents
    attachments: [
        {
            id: 'string - attachment identifier',
            name_he: 'string - Hebrew name',
            name_en: 'string - English name (optional)',
            condition: {
                type: 'ConditionType',
                field: 'string',
                value: 'any'
            },
            triggered_by_fields: ['array of field ids']
        }
    ],

    // Field groups (for repeated patterns)
    field_groups: [
        {
            id: 'string - group identifier',
            name_he: 'string - Hebrew name',
            name_en: 'string - English name (optional)',
            description: 'string',
            fields_pattern: 'string - pattern like "child_{n}_{property}"',
            instances: 'number - how many instances',
            properties: ['array of property names'],
            is_table: 'boolean - true if this is a data entry table, false if selection group',
            table_justification: 'string - AI explanation for is_table decision (optional)'
        }
    ],

    // ============ V2.0: RADIO GROUPS WITH VALUE MAPPING ============
    // Radio groups need valueMap for Excel→PDF conversion
    radioGroups: [
        {
            id: 'string - group identifier (e.g., "gender", "marital_status")',
            name_he: 'string - Hebrew group name',
            name_en: 'string - English group name',
            // Context for this group (e.g., employee.gender, spouse.marital_status)
            context: 'ContextType',
            // Canonical category for semantic matching
            category: 'string - e.g., "gender", "marital_status", "employment_type"',
            // The options in this group
            options: [
                {
                    field_id: 'string - field ID to mark',
                    label_he: 'string - Hebrew label',
                    label_en: 'string - English value',
                    // Excel values that should select this option
                    excelValues: ['array - e.g., ["זכר", "male", "M", "1", "ז"]']
                }
            ],
            // Direct value mapping for fill engine (convenience shortcut)
            // Maps Excel values directly to which option to select
            valueMap: {
                'excelValue1': 'optionFieldId1',
                'excelValue2': 'optionFieldId2'
            }
        }
    ],

    // ============ V2.0: TABLES WITH ENHANCED COLUMN METADATA ============
    tables: [
        {
            id: 'string - table identifier',
            name_he: 'string - Hebrew table name (e.g., "פרטי ילדים")',
            name_en: 'string - English name (e.g., "children_details")',
            // Context for all rows in this table
            context: 'ContextType - e.g., "child" (each row is a child)',
            // Row count and detection hints
            rowCount: 'number - expected number of rows',
            // Column definitions with semantic hints
            columns: [
                {
                    id: 'string - column ID',
                    name_he: 'string - Hebrew column header',
                    name_en: 'string - English column ID',
                    canonical: 'string - standard name (e.g., "first_name", "birth_date")',
                    type: 'string - text, date, number, checkbox',
                    // Header hints for Excel matching
                    headerHints: ['array - e.g., ["שם הילד", "child name"]'],
                    // Format hint
                    format: 'FormatType',
                    // Excel format options (how to find this column in Excel)
                    excelFormat: {
                        // Excel may have single row per child (horizontal)
                        horizontal: 'boolean - true if Excel has child1_name, child2_name columns',
                        // Or vertical (one column, multiple rows)
                        vertical: 'boolean - true if Excel has one "שם ילד" column with rows',
                        // Column name pattern for horizontal format
                        columnPattern: 'string - e.g., "child{n}_name"'
                    }
                }
            ],
            // Rules for the table
            rules: {
                minRows: 'number - minimum required rows',
                maxRows: 'number - maximum allowed rows',
                required: 'boolean'
            }
        }
    ],

    // Validation hints
    validation_hints: [
        {
            field: 'string - field id',
            hint: 'ValidationHintType',
            params: 'object - additional parameters',
            message_he: 'string - Hebrew error message',
            message_en: 'string - English error message (optional)'
        }
    ]
};

// ============ VALIDATION FUNCTIONS ============

/**
 * Validate a Field Intelligence JSON object against the schema
 * @param {Object} json - The JSON to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFieldIntelligence(json) {
    const errors = [];

    // Check schema version
    if (!json.$schema) {
        errors.push('Missing $schema property');
    } else if (!json.$schema.startsWith('field-intelligence')) {
        errors.push(`Invalid schema: ${json.$schema}`);
    }

    // Check required metadata
    if (!json.form) {
        errors.push('Missing form metadata');
    } else {
        if (!json.form.id) errors.push('Missing form.id');
        if (!json.form.name_he) errors.push('Missing form.name_he');
    }

    // Check sections
    if (!json.sections || !Array.isArray(json.sections)) {
        errors.push('Missing or invalid sections array');
    } else {
        json.sections.forEach((section, i) => {
            if (!section.id) errors.push(`Section ${i}: missing id`);
            if (section.order === undefined) errors.push(`Section ${i}: missing order`);
            if (!section.name_he) errors.push(`Section ${i}: missing name_he`);
        });
    }

    // Check fields
    if (!json.fields || !Array.isArray(json.fields)) {
        errors.push('Missing or invalid fields array');
    } else {
        json.fields.forEach((field, i) => {
            if (!field.id) errors.push(`Field ${i}: missing id`);
            if (field.order === undefined) errors.push(`Field ${i}: missing order`);
            if (!field.section_id) errors.push(`Field ${i}: missing section_id`);
            if (!field.display?.name_he) errors.push(`Field ${i}: missing display.name_he`);
        });

        // Check for duplicate orders
        const orders = json.fields.map(f => f.order);
        const duplicateOrders = orders.filter((o, i) => orders.indexOf(o) !== i);
        if (duplicateOrders.length > 0) {
            errors.push(`Duplicate field orders found: ${[...new Set(duplicateOrders)].join(', ')}`);
        }
    }

    // Forbidden properties check (no coordinates!)
    const forbiddenProps = ['x', 'y', 'width', 'height', 'bbox', 'page', 'coordinates'];
    json.fields?.forEach((field, i) => {
        forbiddenProps.forEach(prop => {
            if (field[prop] !== undefined) {
                errors.push(`Field ${i} (${field.id}): contains forbidden property "${prop}"`);
            }
        });
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Extract mapping-only data from Field Intelligence JSON
 * This is what the Mapping Tool sees
 * @param {Object} json - Full Field Intelligence JSON
 * @returns {Array} Simplified field list for mapping
 */
export function extractMappingData(json) {
    if (!json?.fields) return [];

    return json.fields
        .map(field => ({
            id: field.id,
            order: field.order,
            section_id: field.section_id,
            name_he: field.display?.name_he || field.id,
            name_en: field.display?.name_en || field.id
        }))
        .sort((a, b) => a.order - b.order);
}

/**
 * Extract section names for UI grouping
 * @param {Object} json - Full Field Intelligence JSON
 * @returns {Map<string, string>} section_id -> section name
 */
export function extractSectionNames(json) {
    const map = new Map();
    if (!json?.sections) return map;

    json.sections.forEach(section => {
        map.set(section.id, section.name_he || section.name_en || section.id);
    });

    return map;
}

/**
 * Get fields ordered for sequential mapping
 * @param {Object} json - Full Field Intelligence JSON
 * @returns {Array} Fields sorted by order
 */
export function getSequentialMappingOrder(json) {
    return extractMappingData(json);
}

/**
 * Create empty Field Intelligence structure
 * Used as a starting point
 * @param {string} formId - Form identifier
 * @returns {Object} Empty structure
 */
export function createEmptyFieldIntelligence(formId = 'unknown') {
    return {
        $schema: FIELD_INTELLIGENCE_SCHEMA_VERSION,
        $generated: new Date().toISOString(),
        $generator: 'manual',
        $confidence: 0,

        form: {
            id: formId,
            name_he: '',
            name_en: '',
            issuer: '',
            purpose: '',
            typical_filler: FillerType.ANY
        },

        sections: [],
        fields: [],
        dependencies: [],
        attachments: [],
        field_groups: [],
        validation_hints: []
    };
}
