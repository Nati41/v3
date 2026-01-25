/**
 * FillEngineExporter - Comprehensive JSON Export for Fill Engine
 * Version 2.0
 *
 * This module exports mapped PDF fields in a format optimized for the Fill Engine.
 * It merges:
 * - Mapped coordinates (bbox, page) from StateManager
 * - Semantic data (canonical, context, headerHints) from AI analysis
 * - Radio group value mappings for Excel→PDF conversion
 * - Table metadata with column hints for Excel matching
 *
 * The output JSON is designed to be consumed by:
 * - Fill Engine: For automatic Excel→PDF field matching
 * - Live Fill: For real-time form filling
 * - Batch Processing: For bulk PDF generation
 */

import { state } from './StateManager.js';
import { templateStore } from './TemplateStore.js';
import { pdfEngine } from '../engines/PDFEngine.js';
import { FIELD_INTELLIGENCE_SCHEMA_VERSION, ContextType, FormatType } from '../ai/schemas/field-intelligence-schema.js';

// Export schema version
export const FILL_ENGINE_EXPORT_VERSION = 'fill-engine-v2.0';

/**
 * Standard canonical field names dictionary
 * Used for validation and auto-suggestion
 */
export const CANONICAL_DICTIONARY = {
    // Identity
    first_name: { category: 'identity', headerHints: ['שם פרטי', 'first name', 'fname', 'שם'] },
    last_name: { category: 'identity', headerHints: ['שם משפחה', 'last name', 'lname', 'משפחה'] },
    full_name: { category: 'identity', headerHints: ['שם מלא', 'full name', 'name'] },
    id_number: { category: 'identity', headerHints: ['ת.ז.', 'תעודת זהות', 'מספר זהות', 'id', 'ID Number'], format: 'id_il' },
    passport_number: { category: 'identity', headerHints: ['דרכון', 'passport', 'passport number'] },

    // Dates
    birth_date: { category: 'dates', headerHints: ['תאריך לידה', 'ת.לידה', 'birth date', 'DOB', 'date of birth'], format: 'DD/MM/YYYY' },
    start_date: { category: 'dates', headerHints: ['תאריך התחלה', 'מתאריך', 'start date', 'from'], format: 'DD/MM/YYYY' },
    end_date: { category: 'dates', headerHints: ['תאריך סיום', 'עד תאריך', 'end date', 'to'], format: 'DD/MM/YYYY' },
    hire_date: { category: 'dates', headerHints: ['תאריך קבלה', 'תחילת עבודה', 'hire date'], format: 'DD/MM/YYYY' },

    // Contact
    phone: { category: 'contact', headerHints: ['טלפון', 'phone', 'tel', 'נייד', 'mobile'], format: 'phone_il' },
    mobile: { category: 'contact', headerHints: ['נייד', 'סלולרי', 'mobile', 'cell'], format: 'phone_il' },
    email: { category: 'contact', headerHints: ['אימייל', 'דוא"ל', 'email', 'e-mail'], format: 'email' },
    address: { category: 'contact', headerHints: ['כתובת', 'רחוב', 'address', 'street'] },
    city: { category: 'contact', headerHints: ['עיר', 'יישוב', 'city', 'town'] },
    postal_code: { category: 'contact', headerHints: ['מיקוד', 'postal code', 'zip'] },

    // Banking
    bank_code: { category: 'banking', headerHints: ['קוד בנק', 'מספר בנק', 'bank code', 'bank number'] },
    branch_code: { category: 'banking', headerHints: ['סניף', 'קוד סניף', 'branch', 'branch code'] },
    account_number: { category: 'banking', headerHints: ['חשבון', 'מספר חשבון', 'account', 'account number'] },

    // Employment
    job_title: { category: 'employment', headerHints: ['תפקיד', 'משרה', 'job title', 'position'] },
    department: { category: 'employment', headerHints: ['מחלקה', 'department', 'dept'] },
    salary: { category: 'employment', headerHints: ['שכר', 'משכורת', 'salary', 'wage'], format: 'currency_ils' },
    employer_name: { category: 'employment', headerHints: ['שם מעסיק', 'מעביד', 'employer', 'company'] },

    // Tax
    tax_year: { category: 'tax', headerHints: ['שנת מס', 'שנה', 'tax year', 'year'] },
    income_amount: { category: 'tax', headerHints: ['הכנסה', 'סכום הכנסה', 'income'], format: 'currency_ils' },
    tax_amount: { category: 'tax', headerHints: ['מס', 'סכום מס', 'tax amount'], format: 'currency_ils' },

    // Selection categories
    gender: { category: 'selection', valueMap: { 'זכר': 'male', 'נקבה': 'female', 'male': 'male', 'female': 'female', 'M': 'male', 'F': 'female', '1': 'male', '2': 'female' } },
    marital_status: { category: 'selection', valueMap: { 'רווק': 'single', 'נשוי': 'married', 'גרוש': 'divorced', 'אלמן': 'widowed', 'single': 'single', 'married': 'married' } },
    yes_no: { category: 'selection', valueMap: { 'כן': 'yes', 'לא': 'no', 'yes': 'yes', 'no': 'no', '1': 'yes', '0': 'no', 'true': 'yes', 'false': 'no' } }
};

/**
 * Export mapped fields for fill engine
 * @param {Object} options - Export options
 * @param {boolean} options.includeUnmapped - Include unmapped fields (default: false)
 * @param {boolean} options.enrichFromTemplate - Add AI-generated hints from template (default: true)
 * @returns {Object} Fill engine compatible JSON
 */
export function exportForFillEngine(options = {}) {
    const { includeUnmapped = false, enrichFromTemplate = true } = options;

    // Get state data
    const fields = state.get('fields') || [];
    const radioGroups = state.get('radioGroups') || [];
    const tables = state.get('tables') || [];
    const document = state.get('document') || {};

    // V3.10: Get new TableRegions from TableRegionManager
    const tableRegions = window.tableRegionManager?.getAllRegions?.() || [];

    // Filter fields
    const fieldsToExport = includeUnmapped
        ? fields
        : fields.filter(f => f.isMapped);

    // V3.9: Filter out incomplete tables (no bbox = not mapped on PDF)
    const tablesToExport = tables.filter(t => {
        // Table must have bbox (was drawn on PDF)
        if (!t.bbox) {
            console.log(`[FillEngineExporter] Skipping table ${t.tableId} - no bbox`);
            return false;
        }
        // Table must have at least one column with bbox
        const hasValidColumns = t.columns?.some(c => c.bbox);
        if (!hasValidColumns) {
            console.log(`[FillEngineExporter] Skipping table ${t.tableId} - no valid columns`);
            return false;
        }
        return true;
    });

    // Build export structure
    const exportData = {
        $schema: FILL_ENGINE_EXPORT_VERSION,
        $generated: new Date().toISOString(),
        $generator: 'mapper-v3',

        // Document metadata
        document: {
            fileName: document.fileName || null,
            totalPages: document.totalPages || 1,
            pdfHash: document.pdfHash || null
        },

        // Statistics
        stats: {
            totalFields: fields.length,
            mappedFields: fields.filter(f => f.isMapped).length,
            radioGroups: radioGroups.length,
            tables: tablesToExport.length,  // V3.9: Use filtered count
            tableRegions: tableRegions.length  // V3.10: New table region count
        },

        // Enriched fields
        fields: fieldsToExport.map(f => enrichFieldForFillEngine(f, enrichFromTemplate)),

        // Radio groups with value mapping
        radioGroups: radioGroups.map(g => enrichRadioGroupForFillEngine(g)),

        // Tables with column metadata (V3.9: only complete tables)
        tables: tablesToExport.map(t => enrichTableForFillEngine(t)),

        // V3.10: New table regions (simple system)
        tableRegions: tableRegions.map(r => r.toJSON?.() || r)
    };

    // Add template reference if available
    if (templateStore.isLoaded()) {
        exportData.templateId = templateStore.templateId;
    }

    return exportData;
}

/**
 * Enrich a single field with fill engine hints
 * @param {Object} field - Original field from StateManager
 * @param {boolean} enrichFromTemplate - Whether to enrich from template
 * @returns {Object} Enriched field
 */
function enrichFieldForFillEngine(field, enrichFromTemplate = true) {
    // Start with base field data
    const enriched = {
        id: field.id,
        type: field.type || 'text',
        page: field.page,
        bbox: field.bbox,
        anchor: field.anchor || null,

        // Labels
        label_he: field.label_he || '',
        label_en: field.label_en || field.name || '',

        // Core fill engine fields
        canonical: field.canonical || null,
        context: field.context || 'employee',
        instance: field.instance || null,

        // Mapping state
        isMapped: field.isMapped || false,

        // V3.14: Table region metadata (for fields inside tables)
        tableRegionId: field.tableRegionId || null,
        tableRow: field.tableRow != null ? field.tableRow : null
    };

    // V3.14: Add V2 coordinates (pdfX, pdfY, pdfWidth, pdfHeight) for floor anchoring in export
    // These are preferred by export-engine over bbox
    if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
        const pdfDims = pdfEngine.getPdfPageDimensions?.();
        if (pdfDims) {
            const dpiScale = pdfEngine.getDpiScale?.() || 1;
            const pdfW = pdfDims.width / dpiScale;
            const pdfH = pdfDims.height / dpiScale;

            const [xPct, yPct, wPct, hPct] = field.bbox;
            enriched.pdfX = xPct * pdfW;
            enriched.pdfY = yPct * pdfH;
            enriched.pdfWidth = wPct * pdfW;
            enriched.pdfHeight = hPct * pdfH;
        }
    }

    // Add headerHints if not present
    if (!field.headerHints && field.canonical && CANONICAL_DICTIONARY[field.canonical]) {
        enriched.headerHints = CANONICAL_DICTIONARY[field.canonical].headerHints;
    } else {
        enriched.headerHints = field.headerHints || [];
    }

    // Auto-generate headerHints from label_he if still empty
    if (enriched.headerHints.length === 0 && field.label_he) {
        enriched.headerHints = [field.label_he];
        // Add English name if different
        if (field.label_en && field.label_en !== field.label_he) {
            enriched.headerHints.push(field.label_en);
        }
    }

    // Add headerExclude
    enriched.headerExclude = field.headerExclude || [];

    // Add format hint
    if (field.format) {
        enriched.format = field.format;
    } else if (field.canonical && CANONICAL_DICTIONARY[field.canonical]?.format) {
        enriched.format = {
            type: CANONICAL_DICTIONARY[field.canonical].format,
            locale: 'he-IL'
        };
    }

    // Add render hint if present
    if (field.renderHint) {
        enriched.renderHint = field.renderHint;
    }

    // Enrich from template if available
    if (enrichFromTemplate && field.templateFieldId && templateStore.isLoaded()) {
        const templateField = templateStore.getField(field.templateFieldId);
        if (templateField) {
            // Merge template data (template takes precedence for semantic fields)
            if (templateField.canonical && !enriched.canonical) {
                enriched.canonical = templateField.canonical;
            }
            if (templateField.headerHints?.length > 0) {
                enriched.headerHints = [...new Set([...enriched.headerHints, ...templateField.headerHints])];
            }
            if (templateField.format && !enriched.format) {
                enriched.format = templateField.format;
            }
        }
    }

    return enriched;
}

/**
 * Enrich a radio group with value mapping for fill engine
 * @param {Object} group - Original radio group from StateManager
 * @returns {Object} Enriched radio group
 */
function enrichRadioGroupForFillEngine(group) {
    const enriched = {
        groupId: group.groupId,
        groupName: group.groupName || '',
        groupNameEn: group.groupNameEn || '',
        page: group.page,
        type: group.type || 'radio',

        // Fill engine fields
        context: group.context || 'employee',
        category: group.category || null,
        canonical: group.canonical || null,

        // Options with field IDs
        options: (group.options || []).map(opt => ({
            fieldId: opt.fieldId,
            label_he: opt.label_he || opt.label || '',
            label_en: opt.label_en || opt.value || '',
            excelValues: opt.excelValues || []
        }))
    };

    // Build valueMap for quick lookup
    const valueMap = {};

    // Add from existing valueMap if present
    if (group.valueMap) {
        Object.assign(valueMap, group.valueMap);
    }

    // Auto-generate valueMap from options
    enriched.options.forEach(opt => {
        // Add Hebrew label
        if (opt.label_he) {
            valueMap[opt.label_he] = opt.fieldId;
            valueMap[opt.label_he.toLowerCase()] = opt.fieldId;
        }
        // Add English label
        if (opt.label_en) {
            valueMap[opt.label_en] = opt.fieldId;
            valueMap[opt.label_en.toLowerCase()] = opt.fieldId;
        }
        // Add explicit excelValues
        if (opt.excelValues) {
            opt.excelValues.forEach(v => {
                valueMap[v] = opt.fieldId;
                if (typeof v === 'string') {
                    valueMap[v.toLowerCase()] = opt.fieldId;
                }
            });
        }
    });

    // Add standard value mappings from dictionary if category matches
    if (enriched.category && CANONICAL_DICTIONARY[enriched.category]?.valueMap) {
        const standardMap = CANONICAL_DICTIONARY[enriched.category].valueMap;
        // Map standard values to actual field IDs
        Object.entries(standardMap).forEach(([excelVal, standardVal]) => {
            const matchingOption = enriched.options.find(opt =>
                opt.label_en?.toLowerCase() === standardVal.toLowerCase() ||
                opt.label_he?.includes(standardVal)
            );
            if (matchingOption) {
                valueMap[excelVal] = matchingOption.fieldId;
            }
        });
    }

    enriched.valueMap = valueMap;

    return enriched;
}

/**
 * Enrich a table with column metadata for fill engine
 * @param {Object} table - Original table from StateManager
 * @returns {Object} Enriched table
 */
function enrichTableForFillEngine(table) {
    const enriched = {
        tableId: table.tableId,
        page: table.page,
        bbox: table.bbox,

        // Table metadata
        tableTitle: table.tableTitle || null,
        rowCount: table.rowCount || 0,
        rowHeight: table.rowHeight || 0,

        // Fill engine fields
        context: table.context || 'child', // Most tables are for children/dependents

        // Enriched columns
        columns: (table.columns || []).map(col => enrichColumnForFillEngine(col)),

        // Row data if present
        rows: table.rows || []
    };

    // Detect context from table title if not set
    if (!table.context && table.tableTitle?.text) {
        const title = table.tableTitle.text.toLowerCase();
        if (title.includes('ילד') || title.includes('child')) {
            enriched.context = 'child';
        } else if (title.includes('מעסיק') || title.includes('employer')) {
            enriched.context = 'previous_employer';
        } else if (title.includes('תלוי') || title.includes('dependent')) {
            enriched.context = 'dependent';
        }
    }

    return enriched;
}

/**
 * Enrich a table column with fill engine hints
 * @param {Object} col - Original column
 * @returns {Object} Enriched column
 */
function enrichColumnForFillEngine(col) {
    const enriched = {
        columnId: col.columnId || col.id,
        hebrewName: col.hebrewName || '',
        englishId: col.englishId || col.columnId || '',
        type: col.type || 'text',
        bbox: col.bbox || null,

        // Fill engine fields
        canonical: col.canonical || null,
        headerHints: col.headerHints || [],
        format: col.format || null,

        // Excel format hints
        excelFormat: col.excelFormat || {
            horizontal: true,  // Default: child1_name, child2_name
            vertical: false,
            columnPattern: null
        }
    };

    // Auto-generate headerHints if empty
    if (enriched.headerHints.length === 0 && enriched.hebrewName) {
        enriched.headerHints = [enriched.hebrewName];
        if (enriched.englishId && enriched.englishId !== enriched.hebrewName) {
            enriched.headerHints.push(enriched.englishId);
        }
    }

    // Add from canonical dictionary
    if (enriched.canonical && CANONICAL_DICTIONARY[enriched.canonical]) {
        const dictEntry = CANONICAL_DICTIONARY[enriched.canonical];
        enriched.headerHints = [...new Set([...enriched.headerHints, ...(dictEntry.headerHints || [])])];
        if (dictEntry.format && !enriched.format) {
            enriched.format = dictEntry.format;
        }
    }

    // Add render hint if present
    if (col.renderHint) {
        enriched.renderHint = col.renderHint;
    }

    return enriched;
}

/**
 * Validate export data for fill engine compatibility
 * @param {Object} exportData - Export data to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateFillEngineExport(exportData) {
    const errors = [];
    const warnings = [];

    if (!exportData.$schema) {
        errors.push('Missing $schema');
    }

    if (!exportData.fields || !Array.isArray(exportData.fields)) {
        errors.push('Missing or invalid fields array');
    } else {
        exportData.fields.forEach((field, i) => {
            // Check required fill engine fields
            if (!field.canonical) {
                warnings.push(`Field ${field.id || i}: missing canonical`);
            }
            if (!field.context) {
                warnings.push(`Field ${field.id || i}: missing context`);
            }
            if (field.isMapped && !field.bbox && !field.anchor) {
                errors.push(`Field ${field.id || i}: marked as mapped but no coordinates`);
            }
            if (!field.headerHints || field.headerHints.length === 0) {
                warnings.push(`Field ${field.id || i}: no headerHints for Excel matching`);
            }
        });
    }

    // Check radio groups
    if (exportData.radioGroups) {
        exportData.radioGroups.forEach((group, i) => {
            if (!group.valueMap || Object.keys(group.valueMap).length === 0) {
                warnings.push(`RadioGroup ${group.groupId || i}: empty valueMap`);
            }
        });
    }

    // Check tables
    if (exportData.tables) {
        exportData.tables.forEach((table, i) => {
            if (!table.columns || table.columns.length === 0) {
                warnings.push(`Table ${table.tableId || i}: no columns defined`);
            }
            table.columns?.forEach((col, j) => {
                if (!col.canonical) {
                    warnings.push(`Table ${table.tableId || i}, column ${j}: missing canonical`);
                }
            });
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Quick export for current state
 * @returns {Object} Fill engine JSON
 */
export function quickExport() {
    return exportForFillEngine({ includeUnmapped: false, enrichFromTemplate: true });
}

// Export as singleton for easy access
export const fillEngineExporter = {
    export: exportForFillEngine,
    validate: validateFillEngineExport,
    quickExport,
    CANONICAL_DICTIONARY,
    VERSION: FILL_ENGINE_EXPORT_VERSION
};
