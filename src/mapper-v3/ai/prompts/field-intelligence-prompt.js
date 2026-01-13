/**
 * Field Intelligence AI Prompt
 * Version 2.0 - Enhanced for Fill Engine Integration
 *
 * This prompt generates comprehensive Field Intelligence JSON for ANY PDF form.
 * The output is GENERIC - not specific to any form type.
 *
 * Key principles:
 * - Semantic understanding, not visual layout
 * - Complete field documentation with guidance
 * - Logical dependencies between fields
 * - Required documents tracking
 * - No coordinates or page numbers
 *
 * V2.0 Additions:
 * - canonical: Standard field name for dictionary matching
 * - context: Who the field belongs to (employee, spouse, child, employer)
 * - headerHints: Excel column names for fuzzy matching
 * - headerExclude: Column names to avoid matching
 * - format: Date/phone/ID format specifications
 * - radioGroups with valueMap: Excel value → option mapping
 * - tables with excelFormat: How to find table data in Excel
 */

import { FIELD_INTELLIGENCE_SCHEMA_VERSION } from '../schemas/field-intelligence-schema.js';

// ============ SYSTEM MESSAGE ============
export const FIELD_INTELLIGENCE_SYSTEM = `You are an expert document analyst specializing in understanding the meaning and logic of official forms.

Your task is to analyze a PDF form and create a complete "Field Intelligence" document that captures:
1. What each field means and why it exists
2. How to correctly fill each field
3. Logical relationships between fields
4. Required supporting documents
5. How to match data from Excel/databases to each field (semantic hints)

CRITICAL RULES:
- Output ONLY valid JSON - no explanations, no markdown
- Use the EXACT schema version provided
- Field order must be sequential (1, 2, 3...) for guided mapping
- NEVER include coordinates, page numbers, or visual layout information
- Be EXHAUSTIVE - capture EVERY fillable field
- Create SEPARATE fields for EACH radio/checkbox option
- Create ALL instances of repeated fields (row 1, row 2, row 3...)
- Assign CONTEXT to every field (employee, spouse, child_1, employer, etc.)
- Add HEADER HINTS for Excel column matching

Your output will be used by:
- A Mapping Tool that shows field names one at a time for coordinate drawing
- A Filling Tool that shows guidance, warnings, and dependencies to users
- A Fill Engine that automatically matches Excel columns to PDF fields`;

// ============ MAIN PROMPT ============
export const FIELD_INTELLIGENCE_PROMPT = `
Analyze this PDF form and create a comprehensive Field Intelligence JSON document.

📋 YOUR TASK
Extract the COMPLETE semantic understanding of this form:
- Every field, its purpose, and how to fill it correctly
- All options for selection fields (radio buttons, checkboxes)
- Logical dependencies (which fields depend on others)
- Required supporting documents
- Common mistakes to avoid

⚠️ CRITICAL FORMAT RULES
1. Output ONLY valid JSON - no text before or after
2. Use compact JSON format (minimize whitespace)
3. NO coordinates, NO page numbers, NO bbox, NO visual info
4. Field "order" must be sequential: 1, 2, 3, 4...
5. Every field must have a unique "id"

📦 REQUIRED JSON STRUCTURE

{
  "$schema": "${FIELD_INTELLIGENCE_SCHEMA_VERSION}",
  "$generated": "<ISO 8601 timestamp>",
  "$generator": "claude-ai",
  "$confidence": <0.0-1.0>,

  "form": {
    "id": "<unique_form_id>",
    "name_he": "<Hebrew form name>",
    "name_en": "<English form name>",
    "issuer": "<issuing organization>",
    "year": <year or null>,
    "purpose": "<what this form is for>",
    "typical_filler": "<employee|employer|agent|any>",
    "revision_note": null
  },

  "sections": [
    {
      "id": "<section_id>",
      "order": <number>,
      "name_he": "<Hebrew section name>",
      "name_en": "<English section name>",
      "purpose": "<what this section captures>",
      "filled_by": "<employee|employer|agent|any>",
      "field_count": <number>,
      "context": "<employee|employer|spouse|child|general>"
    }
  ],

  "fields": [
    {
      "id": "<unique_field_id>",
      "order": <global sequential number starting from 1>,
      "section_id": "<parent section id>",

      "display": {
        "name_he": "<Hebrew field name as shown on form>",
        "name_en": "<English translation>"
      },

      "semantics": {
        "purpose_short": "<one-line explanation>",
        "purpose_full": "<detailed explanation of what this field is for>",
        "data_type": "<israeli_id|passport_number|person_name|organization_name|phone|email|address|city|postal_code|date|currency|percentage|count|number|enum|boolean|free_text|signature>",
        "sensitivity": "<low|medium|high|critical>"
      },

      // ⭐ V2.0 FILL ENGINE FIELDS - CRITICAL!
      "canonical": "<standard_field_name>",
      "context": "<employee|employer|spouse|child|dependent|general>",
      "instance": <number for repeating contexts like child_1, child_2> or null,
      "headerHints": ["<Excel column name 1>", "<variation 2>", "<variation 3>"],
      "headerExclude": ["<column name to exclude>"] or null,
      "format": {
        "type": "<DD/MM/YYYY|phone_il|id_il|currency_ils>",
        "locale": "he-IL"
      } or null,

      "guidance": {
        "instructions": ["<instruction 1>", "<instruction 2>"],
        "examples": ["<example value 1>", "<example value 2>"] or null,
        "common_mistakes": ["<mistake to avoid>"] or null
      },

      "options": [
        {
          "value": "<internal value>",
          "label_he": "<Hebrew label>",
          "description": "<optional explanation>",
          "warning": "<warning if selected>" or null,
          "triggers_attachment": "<document needed if selected>" or null,
          "excelValues": ["<value1>", "<value2>"]
        }
      ] or null,

      "rules": {
        "required": <true|false>,
        "filled_by": "<employee|employer|agent|any>",
        "condition": {
          "type": "<field_equals|field_empty|field_checked|always>",
          "field": "<triggering field id>",
          "value": "<value to match>"
        } or null,
        "triggers_attachment": "<document required>" or null,
        "part_of_group": "<group id>" or null
      }
    }
  ],

  "dependencies": [
    {
      "id": "<dependency_id>",
      "trigger_field": "<field id that triggers>",
      "trigger_condition": {
        "type": "<field_equals|field_checked|field_empty>",
        "value": "<value>" or null
      },
      "affected_fields": ["<field_id_1>", "<field_id_2>"],
      "action": "<show|hide|require|optional>"
    }
  ],

  "attachments": [
    {
      "id": "<attachment_id>",
      "name_he": "<Hebrew document name>",
      "name_en": "<English document name>",
      "condition": {
        "type": "<always|field_equals|field_checked>",
        "field": "<field id>" or null,
        "value": "<value>" or null
      },
      "triggered_by_fields": ["<field_id>"]
    }
  ],

  "field_groups": [
    {
      "id": "<group_id>",
      "name_he": "<Hebrew group name>",
      "description": "<what this group represents>",
      "fields_pattern": "<pattern like 'child_{n}_{property}'>",
      "instances": <number of instances>,
      "properties": ["<property1>", "<property2>"],
      "is_table": <true|false>,
      "table_justification": "<explanation why this is/isn't a table>" or null
    }
  ],

  "validation_hints": [
    {
      "field": "<field id>",
      "hint": "<israeli_id_checksum|email_format|phone_format|exact_length|min_value|max_value>",
      "params": { "length": 9 } or null,
      "message_he": "<Hebrew error message>"
    }
  ],

  // ⭐ V2.0: RADIO GROUPS WITH VALUE MAPPING
  "radioGroups": [
    {
      "id": "<group_id like gender or marital_status>",
      "name_he": "<Hebrew group name>",
      "name_en": "<English name>",
      "context": "<employee|spouse|etc>",
      "category": "<gender|marital_status|yes_no|etc>",
      "options": [
        {
          "field_id": "<field id to mark>",
          "label_he": "<Hebrew label>",
          "label_en": "<English value>",
          "excelValues": ["<value1>", "<value2>", "..."]
        }
      ],
      "valueMap": {
        "<excel_value_1>": "<option_field_id>",
        "<excel_value_2>": "<option_field_id>"
      }
    }
  ],

  // ⭐ V2.0: TABLES WITH EXCEL FORMAT HINTS
  "tables": [
    {
      "id": "<table_id>",
      "name_he": "<Hebrew table name like 'פרטי ילדים'>",
      "name_en": "<English name like 'children_details'>",
      "context": "<child|dependent|previous_employer>",
      "rowCount": <number>,
      "columns": [
        {
          "id": "<column_id>",
          "name_he": "<Hebrew column header>",
          "name_en": "<English column ID>",
          "canonical": "<standard_name like first_name>",
          "type": "<text|date|number|checkbox>",
          "headerHints": ["<Excel column hint 1>", "<hint 2>"],
          "format": "<DD/MM/YYYY or null>",
          "excelFormat": {
            "horizontal": <true if Excel has child1_name, child2_name columns>,
            "vertical": <true if Excel has one column with multiple rows>,
            "columnPattern": "<pattern like child{n}_name>"
          }
        }
      ]
    }
  ]
}

📋 FIELD EXTRACTION RULES

0. CHECKBOX COLUMNS IN TABLES - Detect from visual pattern:
   - If a table column contains small squares (☐) → ALL cells in that column are type: "checkbox"
   - If field/column name contains: "checkbox", "_cb", "_chk", "bool", "סימון", "תיבה" → type: "checkbox"
   - Examples: is_active_checkbox, has_item_cb, approved_chk → type: "checkbox"
   - Boolean columns (yes/no per row) are checkboxes, NOT text fields!

1. RADIO BUTTONS - Create SEPARATE fields for EACH option:
   ❌ WRONG: { "id": "gender", "type": "enum" }
   ✅ RIGHT:
      { "id": "gender_male", "display": { "name_he": "זכר" }, "rules": { "part_of_group": "gender" } }
      { "id": "gender_female", "display": { "name_he": "נקבה" }, "rules": { "part_of_group": "gender" } }

2. REPEATED ROWS - Create ALL instances:
   For a table with 10 rows for children, create:
   - child_1_name, child_1_id, child_1_birth_date
   - child_2_name, child_2_id, child_2_birth_date
   - ... up to child_10_*

3. CHECKBOXES - Each checkbox is a separate field:
   - exemption_item_1_checkbox
   - exemption_item_2_checkbox
   - etc.

4. CONDITIONAL FIELDS - Document dependencies:
   If "spouse section" should only appear when "married" is selected:
   {
     "id": "dep_spouse_section",
     "trigger_field": "marital_status_married",
     "trigger_condition": { "type": "field_checked" },
     "affected_fields": ["spouse_id", "spouse_name", ...],
     "action": "show"
   }

📊 TABLE vs SELECTION GROUP - CRITICAL DISTINCTION

A field_group can be either a TABLE or a SELECTION GROUP. You MUST set "is_table" correctly.

🔷 WHAT IS A TABLE (is_table: true):
A table is a semantic structure that repeats with IDENTICAL meaning, where the form
explicitly supports VARIABLE number of instances.

✅ TABLE CRITERIA (ALL must be true):
1. SEMANTIC REPETITION - Same purpose repeating (e.g., "child details" × N times)
2. EXPLICIT MULTIPLICITY - Form indicates "for each...", "row 1, 2, 3...", "up to N..."
3. IDENTICAL STRUCTURE - Each instance has EXACT same properties (name, id, date...)
4. OPEN-ENDED LOGIC - The number of instances is conceptually variable (0 to N)

✅ TABLE EXAMPLES:
- Children details (name, ID, birth date) × 10 rows → is_table: true
- Previous employers (name, dates, income) × 5 rows → is_table: true
- Bank accounts (bank, branch, account#) × 3 rows → is_table: true
- Family members for insurance → is_table: true

🔶 WHAT IS A SELECTION GROUP (is_table: false):
A selection group is a fixed set of mutually exclusive or multiple-choice options.

❌ NOT A TABLE:
- Gender (male/female) → is_table: false (fixed options, not repeatable data)
- Marital status (single/married/divorced/widowed) → is_table: false
- Yes/No questions → is_table: false
- Income type checkboxes → is_table: false (selection, not data entry)
- Any radio button group → is_table: false
- Any checkbox group for selection → is_table: false

🎯 DECISION RULE:
Ask yourself: "Does the form expect the user to enter VARIABLE DATA for each instance?"
- YES → is_table: true (e.g., entering details for each child)
- NO → is_table: false (e.g., selecting one option from a list)

EXAMPLE field_groups:
{
  "id": "children_details",
  "is_table": true,
  "table_justification": "Form has 10 identical rows for entering child details (name, ID, birth date). Each row represents one child with same data structure."
}
{
  "id": "gender",
  "is_table": false,
  "table_justification": "Radio button selection between male/female. Fixed options, not variable data entry."
}
{
  "id": "marital_status",
  "is_table": false,
  "table_justification": "Single selection from fixed list of marital statuses."
}

🔗 V2.0 FILL ENGINE FIELDS - CRITICAL!

For EVERY field, you MUST provide these fill engine hints:

1. CANONICAL - Standard field name:
   Use standard names from this dictionary:
   - Identity: first_name, last_name, full_name, id_number, passport_number
   - Dates: birth_date, start_date, end_date, hire_date
   - Contact: phone, mobile, email, address, city, postal_code
   - Banking: bank_code, branch_code, account_number
   - Employment: job_title, department, salary, employer_name
   - Tax: tax_year, income_amount, tax_amount

2. CONTEXT - Who does this field belong to:
   - employee: The primary person filling the form
   - employer: Company/organization details
   - spouse: Spouse details (use for all בן/בת זוג fields)
   - child: Child details (add instance: 1, 2, 3... for each child)
   - dependent: Generic dependent
   - previous_employer: Previous job details
   - general: Form-level fields, signatures

3. HEADER HINTS - Excel column names that match this field:
   Include Hebrew AND English variations:
   - For first_name: ["שם פרטי", "first name", "fname", "שם"]
   - For id_number: ["ת.ז.", "תעודת זהות", "מספר זהות", "id", "ID Number"]
   - For birth_date: ["תאריך לידה", "ת.לידה", "birth date", "DOB"]

4. HEADER EXCLUDE - Prevent false matches:
   - For first_name, exclude: ["שם משפחה", "שם האב"]
   - For phone, exclude: ["פקס", "fax"]

5. FORMAT - Expected format with locale:
   - Dates: { type: "DD/MM/YYYY", locale: "he-IL" }
   - Israeli ID: { type: "id_il", locale: "he-IL" }
   - Phone: { type: "phone_il", locale: "he-IL" }

6. VALUE MAP - For radio/checkbox groups:
   Map Excel values to which option to mark:
   {
     "valueMap": {
       "זכר": "gender_male",
       "male": "gender_male",
       "M": "gender_male",
       "1": "gender_male",
       "נקבה": "gender_female",
       "female": "gender_female",
       "F": "gender_female",
       "2": "gender_female"
     }
   }

📋 QUALITY CHECKLIST

Before outputting, verify:
- [ ] Is JSON valid? (no trailing commas, proper brackets)
- [ ] Does every field have a unique id?
- [ ] Is field.order sequential (1, 2, 3...)?
- [ ] Does every field have display.name_he?
- [ ] Are ALL radio options separate fields?
- [ ] Are ALL table rows represented?
- [ ] Are dependencies documented?
- [ ] Are required documents listed in attachments?
- [ ] No coordinates, no page numbers, no bbox?
- [ ] Does EVERY field have canonical and context? (V2.0)
- [ ] Do text fields have headerHints? (V2.0)
- [ ] Do radio groups have valueMap? (V2.0)

If all checks pass, output the JSON.
`.trim();

/**
 * Get the complete prompt for Field Intelligence generation
 * @param {Object} options - Additional context
 * @param {number} options.pageCount - Number of pages in PDF
 * @param {string} options.fileName - PDF file name
 * @returns {string} Complete prompt
 */
export function getFieldIntelligencePrompt(options = {}) {
    let prompt = FIELD_INTELLIGENCE_PROMPT;

    if (options.pageCount && options.pageCount > 1) {
        prompt += `\n\n⚠️ MULTI-PAGE FORM: This PDF has ${options.pageCount} pages. Analyze ALL pages thoroughly. Page 2+ often contains important sections like exemptions, declarations, and signatures.`;
    }

    if (options.fileName) {
        prompt += `\n\n📄 File name hint: "${options.fileName}"`;
    }

    return prompt;
}

/**
 * Post-process AI response to ensure schema compliance
 * V2.0: Also processes fill engine fields (canonical, context, headerHints)
 * @param {Object} json - Raw AI response
 * @returns {Object} Cleaned JSON
 */
export function postProcessFieldIntelligence(json) {
    // Ensure schema version
    if (!json.$schema) {
        json.$schema = FIELD_INTELLIGENCE_SCHEMA_VERSION;
    }

    // Ensure timestamp
    if (!json.$generated) {
        json.$generated = new Date().toISOString();
    }

    // Ensure arrays exist
    json.sections = json.sections || [];
    json.fields = json.fields || [];
    json.dependencies = json.dependencies || [];
    json.attachments = json.attachments || [];
    json.field_groups = json.field_groups || [];
    json.validation_hints = json.validation_hints || [];
    // V2.0: New arrays
    json.radioGroups = json.radioGroups || [];
    json.tables = json.tables || [];

    // Fix field order if not sequential
    json.fields.forEach((field, index) => {
        if (field.order === undefined) {
            field.order = index + 1;
        }
    });

    // Sort fields by order
    json.fields.sort((a, b) => a.order - b.order);

    // Re-number to ensure sequential
    json.fields.forEach((field, index) => {
        field.order = index + 1;
    });

    // Ensure all fields have required properties
    json.fields.forEach(field => {
        if (!field.display) {
            field.display = { name_he: field.id, name_en: field.id };
        }
        if (!field.semantics) {
            field.semantics = {
                purpose_short: '',
                purpose_full: '',
                data_type: 'free_text',
                sensitivity: 'low'
            };
        }
        if (!field.guidance) {
            field.guidance = { instructions: [], examples: null, common_mistakes: null };
        }
        if (!field.rules) {
            field.rules = { required: false, filled_by: 'any', condition: null };
        }

        // V2.0: Auto-detect checkbox type from field name (generic patterns only)
        const fieldId = (field.id || '').toLowerCase();
        const fieldNameHe = (field.display?.name_he || '').toLowerCase();
        const checkboxPatterns = [
            'checkbox', '_cb', '_chk', 'check_', 'bool',
            'סימון', 'תיבה', 'וי_'
        ];
        if (checkboxPatterns.some(p => fieldId.includes(p) || fieldNameHe.includes(p))) {
            if (field.semantics?.data_type !== 'checkbox' && field.type !== 'checkbox') {
                console.log(`[PostProcess] Auto-detected checkbox: ${field.id}`);
                field.type = 'checkbox';
                if (field.semantics) {
                    field.semantics.data_type = 'boolean';
                }
            }
        }

        // V2.0: Ensure fill engine fields
        if (!field.context) {
            field.context = 'employee'; // Default context
        }
        if (!field.headerHints) {
            field.headerHints = [];
            // Auto-generate from display name
            if (field.display?.name_he) {
                field.headerHints.push(field.display.name_he);
            }
            if (field.display?.name_en && field.display.name_en !== field.display.name_he) {
                field.headerHints.push(field.display.name_en);
            }
        }
        if (!field.headerExclude) {
            field.headerExclude = [];
        }
    });

    // Update section field counts
    json.sections.forEach(section => {
        section.field_count = json.fields.filter(f => f.section_id === section.id).length;
        // V2.0: Ensure section context
        if (!section.context) {
            section.context = 'employee';
        }
    });

    // V2.0: Process radioGroups - build valueMap if missing
    json.radioGroups.forEach(group => {
        if (!group.valueMap) {
            group.valueMap = {};
            // Build from options
            (group.options || []).forEach(opt => {
                if (opt.excelValues) {
                    opt.excelValues.forEach(val => {
                        group.valueMap[val] = opt.field_id;
                    });
                }
                // Also add label as possible value
                if (opt.label_he) {
                    group.valueMap[opt.label_he] = opt.field_id;
                }
                if (opt.label_en) {
                    group.valueMap[opt.label_en] = opt.field_id;
                }
            });
        }
        // Ensure context
        if (!group.context) {
            group.context = 'employee';
        }
    });

    // V2.0: Process tables - ensure column metadata
    json.tables.forEach(table => {
        if (!table.context) {
            table.context = 'child'; // Default for tables
        }
        (table.columns || []).forEach(col => {
            if (!col.headerHints) {
                col.headerHints = [];
                if (col.name_he) col.headerHints.push(col.name_he);
                if (col.name_en) col.headerHints.push(col.name_en);
            }
            if (!col.excelFormat) {
                col.excelFormat = {
                    horizontal: true,
                    vertical: false,
                    columnPattern: null
                };
            }

            // V2.0: Auto-detect checkbox columns from name (generic patterns only)
            const colId = (col.id || col.name_en || '').toLowerCase();
            const colNameHe = (col.name_he || '').toLowerCase();
            const checkboxPatterns = [
                'checkbox', '_cb', '_chk', 'check_', 'bool',
                'סימון', 'תיבה', 'וי_'
            ];
            if (checkboxPatterns.some(p => colId.includes(p) || colNameHe.includes(p))) {
                if (col.type !== 'checkbox') {
                    console.log(`[PostProcess] Auto-detected checkbox column: ${col.id || col.name_en}`);
                    col.type = 'checkbox';
                }
            }
        });
    });

    return json;
}

/**
 * Validate AI response structure
 * V2.0: Also validates fill engine fields
 * @param {Object} json - AI response
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateFieldIntelligenceResponse(json) {
    const errors = [];
    const warnings = [];

    if (!json) {
        errors.push('Response is empty');
        return { valid: false, errors, warnings };
    }

    if (!json.form?.id) {
        errors.push('Missing form.id');
    }

    if (!json.fields || !Array.isArray(json.fields)) {
        errors.push('Missing or invalid fields array');
    } else if (json.fields.length === 0) {
        errors.push('No fields extracted');
    } else {
        // Check for duplicate IDs
        const ids = json.fields.map(f => f.id);
        const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
        if (duplicates.length > 0) {
            errors.push(`Duplicate field IDs: ${[...new Set(duplicates)].join(', ')}`);
        }

        // Check for coordinate data (forbidden)
        json.fields.forEach((field, i) => {
            if (field.x !== undefined || field.y !== undefined ||
                field.bbox !== undefined || field.page !== undefined ||
                field.coordinates !== undefined) {
                errors.push(`Field ${field.id}: contains forbidden coordinate data`);
            }

            // V2.0: Check for fill engine fields (warnings, not errors)
            if (!field.canonical) {
                warnings.push(`Field ${field.id}: missing canonical`);
            }
            if (!field.context) {
                warnings.push(`Field ${field.id}: missing context`);
            }
            if (!field.headerHints || field.headerHints.length === 0) {
                warnings.push(`Field ${field.id}: missing headerHints`);
            }
        });
    }

    if (!json.sections || !Array.isArray(json.sections)) {
        errors.push('Missing sections array');
    }

    // V2.0: Validate radioGroups if present
    if (json.radioGroups && Array.isArray(json.radioGroups)) {
        json.radioGroups.forEach((group, i) => {
            if (!group.id) {
                warnings.push(`RadioGroup ${i}: missing id`);
            }
            if (!group.valueMap || Object.keys(group.valueMap).length === 0) {
                warnings.push(`RadioGroup ${group.id || i}: empty valueMap`);
            }
        });
    }

    // V2.0: Validate tables if present
    if (json.tables && Array.isArray(json.tables)) {
        json.tables.forEach((table, i) => {
            if (!table.id) {
                warnings.push(`Table ${i}: missing id`);
            }
            if (!table.columns || table.columns.length === 0) {
                warnings.push(`Table ${table.id || i}: no columns`);
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
