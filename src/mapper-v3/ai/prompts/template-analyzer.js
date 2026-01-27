/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - template-analyzer
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   מכיל את הפרומפט הראשי לניתוח מבנה טופס PDF.
 *   AI מקבל תמונת PDF ומחזיר רשימת שדות מזוהים עם מיקום ומשמעות.
 *
 * מי משתמש בקובץ:
 *   - AIService.js - שליחת פרומפט ל-Claude/OpenAI
 *
 * באיזה מצבים:
 *   מצב AI - בניתוח תבנית טופס
 *
 * למה הוא קיים:
 *   הפרדה בין לוגיקת AI לתוכן הפרומפט.
 *   מאפשר עדכון פרומפטים בלי לגעת בקוד התקשורת.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * AI Template Analyzer - Master Prompt
 * V3.4: Built-in AI integration for automatic form analysis
 *
 * This prompt is sent to AI (Claude/OpenAI) to analyze PDF forms
 * and generate template JSON for the mapping tool.
 */

// ============ STRICT TYPE ENUM ============
export const ALLOWED_FIELD_TYPES = [
    'text',
    'number',
    'id_number',
    'date',
    'checkbox',
    'radio',
    'email',
    'phone',
    'signature'
];

// ============ HEBREW ENTITY NAME TRANSLATIONS ============
// Fallback translations for common entity/category names
export const ENTITY_HEBREW_MAP = {
    // מעסיק
    'employer_details': 'פרטי מעסיק',
    'employer': 'מעסיק',
    'employer_info': 'פרטי מעסיק',
    // עובד
    'employee_details': 'פרטי עובד',
    'employee': 'עובד',
    'employee_info': 'פרטי עובד',
    'personal_details': 'פרטים אישיים',
    'personal': 'פרטים אישיים',
    // הכנסה
    'income_type': 'סוג הכנסה',
    'income': 'הכנסה',
    'income_details': 'פרטי הכנסה',
    // ילדים
    'children_details': 'פרטי ילדים',
    'children': 'ילדים',
    'child_details': 'פרטי ילד',
    // בן/בת זוג
    'spouse_details': 'פרטי בן/בת זוג',
    'spouse': 'בן/בת זוג',
    'spouse_info': 'פרטי בן/בת זוג',
    // עבודה
    'work_details': 'פרטי עבודה',
    'work': 'עבודה',
    'employment': 'תעסוקה',
    'employment_details': 'פרטי תעסוקה',
    // הכנסות אחרות
    'other_income': 'הכנסות אחרות',
    'additional_income': 'הכנסות נוספות',
    // חתימות
    'signature_section': 'חתימות',
    'signatures': 'חתימות',
    // כתובת
    'address': 'כתובת',
    'address_details': 'פרטי כתובת',
    // בנק
    'bank_details': 'פרטי בנק',
    'bank': 'בנק',
    'banking': 'בנקאות',
    // מס
    'tax_details': 'פרטי מס',
    'tax': 'מס',
    // פטורים וזיכויים
    'exemptions': 'פטורים וזיכויים',
    'exemption': 'פטור',
    'exemption_details': 'פרטי פטור',
    'tax_credits': 'נקודות זיכוי',
    'credits': 'זיכויים',
    // כללי
    'general': 'כללי',
    'other': 'אחר',
    'misc': 'שונות'
};

// ============ WARNING FLAGS ============
export const WarningFlags = {
    AMBIGUOUS_DUPLICATE: 'ambiguous_duplicate',
    POSSIBLE_TABLE: 'possible_table',
    UNCLEAR_TYPE: 'unclear_type',
    MISSING_HEBREW: 'missing_hebrew',
    UNUSUAL_STRUCTURE: 'unusual_structure'
};

export const TEMPLATE_ANALYZER_PROMPT = `
You are a professional document analyst specializing in structured PDF forms (government, finance, HR).

Task:
Analyze the attached PDF form and extract all logical fields required to fill this form digitally.

You must output ONLY valid JSON in the exact format below.
No explanations. No markdown. No comments.

⚠️ JSON FORMAT CRITICAL:
- Output COMPACT JSON (no extra whitespace/newlines between fields)
- Double-check all commas and brackets before outputting
- Ensure JSON is 100% valid - test it mentally before returning

🎯 GOAL

Create a Template Skeleton for a form-mapping system.
This template will later be used by a human (or another tool) to map coordinates manually.

⚠️ IMPORTANT: Analyze ALL pages of the PDF document, not just the first page!
Many forms have important fields on page 2, 3, etc.

📄 PAGE HANDLING:
- Extract fields from ALL pages that contain fillable fields
- SKIP pages that are only explanations/instructions without actual fillable fields
- A fillable field = text box, checkbox, radio button, date field, signature area

You are NOT allowed to:
- Guess coordinates
- Guess page numbers
- Create bbox / position data
- Mark fields as mapped

🧠 THINKING RULES (IMPORTANT)

- Treat this as a real production form, not a demo.
- BE EXHAUSTIVE - extract EVERY single fillable field, checkbox, and radio button.

📋 REPEATED FIELDS (CRITICAL):
- If rows repeat (children, income sources, changes), create fields for ALL rows visible:
  - CHILDREN TABLE: Form 101 has 10 rows - create child1_name through child10_name, child1_id through child10_id, etc.
  - INCOME TABLE: Usually 3 rows - create otherIncome1_*, otherIncome2_*, otherIncome3_*
  - CHANGES TABLE: Usually 3 rows - create change1_*, change2_*, change3_*
  - Use duplicateGroup to link related fields (e.g., all child names share duplicateGroup: "child_name")
- Do NOT create just one example - create ALL instances

📋 RADIO BUTTONS (CRITICAL):
- Create SEPARATE fields for EACH radio option:
  - ❌ WRONG: {"name": "gender", "type": "radio"}
  - ✅ RIGHT: {"name": "gender_male", "type": "radio"} AND {"name": "gender_female", "type": "radio"}
  - ❌ WRONG: {"name": "marital_status", "type": "radio"}
  - ✅ RIGHT: {"name": "marital_single", "type": "radio"}, {"name": "marital_married", "type": "radio"}, etc.

📋 TABLES (CRITICAL):
- For tables with multiple rows, create fields for EACH cell in EACH row
- Example for 3-row income table: otherIncome1_employer, otherIncome2_employer, otherIncome3_employer

📋 EXEMPTION/CREDIT SECTIONS (FORM 101 PAGE 2 - CRITICAL):
- Section ח "פטור או זיכוי ממס" has 12+ numbered items (1-12)
- EACH numbered item may have: checkbox + multiple number fields
- Items 7, 8, 9 have AGE-BASED CHILD COUNT fields - extract ALL:
  - Example: item7_children_born_this_year, item7_children_age_1_2, item7_children_age_3, item7_children_age_4_5, item7_children_age_6_17, item7_children_age_18
  - Same pattern repeats for item 8 and item 9!
- Create SEPARATE fields for EACH age group in EACH item (18+ fields just for children counts)
- Don't skip any numbered item (1-12) - each needs at least a checkbox field
- Items may have additional sub-fields like dates, text, or spouse checkboxes

📋 OTHER RULES:
- If a field is optional, mark required: false
- If unsure about type – choose the safest usable type
- Prefer clear canonical English names
- Hebrew labels must be exactly how they appear on the form

📦 REQUIRED OUTPUT FORMAT (STRICT)
{
  "meta": {
    "form_name": "<short english name>",
    "form_name_he": "<hebrew name if exists>",
    "source": "pdf",
    "language": "he",
    "confidence": 0.95,
    "warnings": [],
    "notes": "<optional short note>"
  },
  "entities": [
    {
      "key": "<entity_key>",
      "label_he": "<entity label in hebrew>",
      "fields": [
        {
          "name": "<canonical_english_name>",
          "label_he": "<hebrew label from form>",
          "label_en": "<english meaning>",
          "type": "<field_type>",
          "required": true,
          "duplicateGroup": null,
          "options": null,
          "notes": null
        }
      ]
    }
  ]
}

🧩 ALLOWED FIELD TYPES (ENUM – USE ONLY THESE)
- text
- number
- id_number
- date
- checkbox
- radio
- email
- phone
- signature

⚠️ CONFIDENCE & WARNINGS

Set meta.confidence (0.0 to 1.0) based on how clear the form structure is.
Add warnings to meta.warnings array if needed:
- "ambiguous_duplicate" - unclear if fields are duplicates or separate
- "possible_table" - detected what might be a table structure
- "unclear_type" - field type was hard to determine
- "missing_hebrew" - some Hebrew labels could not be read
- "unusual_structure" - form has non-standard layout

🔁 DUPLICATE FIELDS RULE

If the same logical field repeats (example: children names):
{
  "name": "child_name_1",
  "duplicateGroup": "child_name"
}

All duplicates must share the same duplicateGroup value.

❌ DO NOT INCLUDE
- bbox
- page
- x / y
- isMapped
- status
- coordinates of any kind

✅ FINAL CHECK BEFORE OUTPUT
- Is JSON valid?
- Are all fields grouped under entities?
- Are names in English, labels in Hebrew?
- No geometry data exists?
- Is confidence set?
- Are any warnings applicable?
- Did you analyze ALL pages (not just page 1)?
- Did you create SEPARATE fields for EACH radio button option?
- Did you create fields for ALL rows in tables (children, income, etc.)?
- PAGE 2 CHECK: Did you extract ALL 12 exemption items with their sub-fields?
- PAGE 2 CHECK: Did you create 6 age-group fields for items 7, 8, AND 9? (18 fields total)
- Is the field count reasonable? (Form 101 should have 180+ fields)

If yes — output the JSON.
`.trim();

/**
 * System message for AI context
 */
export const SYSTEM_MESSAGE = `You are a form analysis expert. You analyze PDF documents and extract field structures. You always respond with valid JSON only, no additional text or explanation.

CRITICAL RULES:
1. Use only allowed field types: text, number, id_number, date, checkbox, radio, email, phone, signature.
2. Create SEPARATE fields for EACH radio button option (gender_male AND gender_female, NOT just gender).
3. Create fields for ALL 10 rows in children table (child1 through child10, NOT just child1-3).
4. Analyze ALL pages of the PDF document - PAGE 2 is often the most field-dense!
5. Be EXHAUSTIVE - a typical Israeli tax form (101) has 180-200 fields.
6. EXEMPTION SECTIONS: Items 7, 8, 9 each have 6 age-group number fields - that's 18 fields just for children counts!
7. Every numbered item (1-12) in exemption section needs at least a checkbox field.`;

/**
 * Get the full prompt with optional context
 * @param {Object} options - Additional context
 * @param {string} options.formName - Optional form name hint
 * @param {number} options.pageCount - Number of pages in the PDF
 * @returns {string} Complete prompt
 */
export function getAnalyzerPrompt(options = {}) {
    let prompt = TEMPLATE_ANALYZER_PROMPT;

    if (options.pageCount && options.pageCount > 1) {
        prompt += `\n\n⚠️ CRITICAL: This PDF has ${options.pageCount} pages. You MUST analyze ALL ${options.pageCount} pages, not just page 1! Fields on page 2, 3, etc. are just as important.`;
    }

    if (options.formName) {
        prompt += `\n\nHint: The form appears to be named "${options.formName}".`;
    }

    return prompt;
}

/**
 * STRICT Validation - rejects on ANY deviation
 * @param {Object} json - Parsed JSON from AI
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function strictValidateTemplateJson(json) {
    // 1. Must have meta
    if (!json.meta) {
        return { valid: false, error: 'חסר מקטע "meta" - תגובת AI לא תקינה' };
    }

    if (!json.meta.form_name) {
        return { valid: false, error: 'חסר שם טופס (meta.form_name)' };
    }

    // 2. Must have entities array
    if (!json.entities) {
        return { valid: false, error: 'חסר מקטע "entities" - תגובת AI לא תקינה' };
    }

    if (!Array.isArray(json.entities)) {
        return { valid: false, error: '"entities" חייב להיות מערך' };
    }

    if (json.entities.length === 0) {
        return { valid: false, error: 'לא נמצאו ישויות בטופס - האם הקובץ תקין?' };
    }

    // 3. Validate each entity
    for (let i = 0; i < json.entities.length; i++) {
        const entity = json.entities[i];

        if (!entity.key) {
            return { valid: false, error: `ישות ${i + 1}: חסר "key"` };
        }

        if (!entity.fields || !Array.isArray(entity.fields)) {
            return { valid: false, error: `ישות "${entity.key}": חסר מערך "fields"` };
        }

        // 4. Validate each field
        for (let j = 0; j < entity.fields.length; j++) {
            const field = entity.fields[j];

            if (!field.name) {
                return { valid: false, error: `ישות "${entity.key}", שדה ${j + 1}: חסר "name"` };
            }

            if (!field.type) {
                return { valid: false, error: `שדה "${field.name}": חסר "type"` };
            }

            // 5. STRICT: type must be from allowed enum
            if (!ALLOWED_FIELD_TYPES.includes(field.type)) {
                return {
                    valid: false,
                    error: `שדה "${field.name}": סוג "${field.type}" לא מוכר. סוגים מותרים: ${ALLOWED_FIELD_TYPES.join(', ')}`
                };
            }

            // 6. STRICT: No coordinate data allowed
            if (field.bbox || field.page !== undefined || field.x !== undefined || field.y !== undefined) {
                return { valid: false, error: `שדה "${field.name}": מכיל נתוני מיקום אסורים` };
            }
        }
    }

    return { valid: true, error: null };
}

/**
 * Soft validation - collects warnings but doesn't reject
 * @param {Object} json - Parsed JSON from AI
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateTemplateJson(json) {
    const errors = [];
    const warnings = [];

    // Check meta
    if (!json.meta) {
        errors.push('Missing "meta" section');
    } else {
        if (!json.meta.form_name) errors.push('Missing meta.form_name');

        // Collect AI-reported warnings
        if (json.meta.warnings && Array.isArray(json.meta.warnings)) {
            warnings.push(...json.meta.warnings);
        }

        // Check confidence
        if (json.meta.confidence !== undefined && json.meta.confidence < 0.7) {
            warnings.push(`low_confidence: ${json.meta.confidence}`);
        }
    }

    // Check entities
    if (!json.entities || !Array.isArray(json.entities)) {
        errors.push('Missing or invalid "entities" array');
    } else {
        json.entities.forEach((entity, i) => {
            if (!entity.key) errors.push(`Entity ${i}: missing "key"`);
            if (!entity.fields || !Array.isArray(entity.fields)) {
                errors.push(`Entity ${i}: missing or invalid "fields" array`);
            } else {
                entity.fields.forEach((field, j) => {
                    if (!field.name) errors.push(`Entity ${i}, Field ${j}: missing "name"`);
                    if (!field.type) errors.push(`Entity ${i}, Field ${j}: missing "type"`);

                    // Check for unknown type (soft warning)
                    if (field.type && !ALLOWED_FIELD_TYPES.includes(field.type)) {
                        warnings.push(`Field "${field.name}": unknown type "${field.type}"`);
                    }

                    // Check for forbidden coordinate fields
                    if (field.bbox || field.page || field.x || field.y) {
                        errors.push(`Entity ${i}, Field ${j}: contains forbidden coordinate data`);
                    }

                    // Check for missing Hebrew label (soft warning)
                    if (!field.label_he) {
                        warnings.push(`Field "${field.name}": missing Hebrew label`);
                    }
                });
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Convert AI response format to internal template format
 * @param {Object} aiJson - JSON from AI
 * @returns {Object} Internal template format
 */
export function convertToInternalFormat(aiJson) {
    const templateId = `template_${Date.now()}`;

    // Flatten entities to fields with entity_id
    const fields = [];
    const entities = [];

    (aiJson.entities || []).forEach(entity => {
        const entityId = entity.key;

        // Use Hebrew from AI, fallback to translation map, then to key
        const hebrewLabel = entity.label_he ||
            ENTITY_HEBREW_MAP[entityId.toLowerCase()] ||
            ENTITY_HEBREW_MAP[entityId] ||
            entityId;

        entities.push({
            entity_id: entityId,
            label_he: hebrewLabel,
            entity_name_he: hebrewLabel,  // For compatibility with TemplateStore
            label_en: entity.key,
            entity_name_en: entity.key,
            order: entities.length
        });

        (entity.fields || []).forEach(field => {
            fields.push({
                template_field_id: field.name,
                canonical: field.name,  // Required by TemplateStore validation
                entity_id: entityId,
                name: field.name,
                label_he: field.label_he || '',
                label_en: field.label_en || field.name,
                type: field.type || 'text',
                required: field.required !== false,
                duplicateGroup: field.duplicateGroup || null,
                options: field.options || null,
                notes: field.notes || null
            });
        });
    });

    return {
        $schema: 'template-skeleton-v1',  // Mark as proper format so TemplateStore doesn't re-convert
        templateId,
        meta: {
            ...aiJson.meta,
            confidence: aiJson.meta?.confidence || null,
            warnings: aiJson.meta?.warnings || []
        },
        entities,
        fields,
        exceptions: []
    };
}
