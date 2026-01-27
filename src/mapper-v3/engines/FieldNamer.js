/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - FieldNamer
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   ממיר שמות שדות מעברית לאנגלית.
 *   "שם פרטי" → "first_name", "תעודת זהות" → "id_number"
 *
 * איך זה עובד:
 *   1. בדיקה במילון שמות ידועים (EXACT match בלבד)
 *   2. אם לא נמצא → טרנסליטרציה (אות עברית → אות לטינית)
 *   3. Slugify לפורמט [a-z0-9_]
 *
 * מי משתמש בקובץ:
 *   - DrawController.js - מתן שם אוטומטי לשדה חדש
 *   - GuidedMappingUI.js - הצעת שם לשדה
 *
 * באיזה מצבים:
 *   מצב מיפוי - בכל יצירת שדה חדש
 *
 * למה הוא קיים:
 *   כדי שלשדות יהיו שמות באנגלית סטנדרטיים (canonical)
 *   שמנוע המילוי יכול להשתמש בהם.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * FieldNamer - Hebrew to English field name conversion for Mapper V3
 *
 * PRIORITY FLOW:
 * 1. Check Known Fields Table (EXACT match only, no partial matches)
 * 2. If not found → Pure transliteration (Hebrew letters → Latin letters)
 * 3. Slugify to [a-z0-9_] format
 *
 * EXAMPLES:
 * - "שם פרטי" → "first_name" (known field)
 * - "תעודת זהות" → "id_number" (known field)
 * - "אני מצהיר בזה" → "any_mtshyr_bzh" (transliterated)
 */

// ============ KNOWN FIELD NAMES MAP ============
// Maps common Hebrew field labels to standard English IDs
const KNOWN_FIELD_NAMES = {
    // Personal Identification
    "שם פרטי": "first_name",
    "שם": "first_name",
    "שם מלא": "full_name",
    "שם משפחה": "last_name",
    "משפחה": "last_name",
    "שם האב": "father_name",
    "שם אב": "father_name",
    "שם האם": "mother_name",
    "שם אם": "mother_name",
    "מספר זהות": "id_number",
    "מס' זהות": "id_number",
    "מס זהות": "id_number",
    "ת.ז.": "id_number",
    "ת\"ז": "id_number",
    "תעודת זהות": "id_number",
    "ת.ז": "id_number",
    "מספר דרכון": "passport_number",
    "דרכון": "passport_number",

    // Contact Information
    "כתובת": "address",
    "כתובת מגורים": "address",
    "רחוב": "street",
    "מספר בית": "house_number",
    "מס' בית": "house_number",
    "דירה": "apartment",
    "מספר דירה": "apartment",
    "עיר": "city",
    "יישוב": "city",
    "מיקוד": "zip_code",
    "מיקוד:": "zip_code",
    "טלפון": "phone",
    "מספר טלפון": "phone",
    "טל'": "phone",
    "טל": "phone",
    "נייד": "mobile",
    "טלפון נייד": "mobile",
    "פלאפון": "mobile",
    "סלולרי": "mobile",
    "פקס": "fax",
    "דוא\"ל": "email",
    "דואל": "email",
    "אימייל": "email",
    "מייל": "email",
    "כתובת מייל": "email",
    "דואר אלקטרוני": "email",

    // Dates
    "תאריך": "date",
    "תאריך לידה": "birth_date",
    "ת. לידה": "birth_date",
    "תאריך עלייה": "immigration_date",
    "תאריך הגשה": "submission_date",
    "תאריך חתימה": "signature_date",

    // Financial
    "בנק": "bank_name",
    "שם בנק": "bank_name",
    "סניף": "bank_branch",
    "מספר סניף": "bank_branch",
    "מספר חשבון": "account_number",
    "חשבון": "account_number",

    // Signature
    "חתימה": "signature",
    "חתימת": "signature",
    "חתימת המבקש": "applicant_signature",
    "חתימת הלקוח": "customer_signature",

    // Employment
    "מקום עבודה": "workplace",
    "שם מעסיק": "employer_name",
    "מעסיק": "employer_name",
    "תפקיד": "job_title",
    "משלח יד": "occupation",
    "עיסוק": "occupation",

    // Family Status
    "מצב משפחתי": "marital_status",
    "מספר ילדים": "children_count",
    "מספר הילדים": "children_count",
    "שם הילד": "child_name",
    "שם ילד": "child_name",
    "מין": "gender",

    // Generic
    "הערות": "notes",
    "הערה": "note",
    "פרטים נוספים": "additional_info",
    "סכום": "amount",
    "מספר": "number",

    // ============ RADIO/CHECKBOX COMMON OPTIONS ============
    // Gender
    "זכר": "male",
    "נקבה": "female",
    "ז": "male",
    "נ": "female",
    "גבר": "male",
    "אישה": "female",
    "אחר": "other",

    // Yes/No
    "כן": "yes",
    "לא": "no",
    "כ": "yes",
    "ל": "no",

    // True/False
    "נכון": "true",
    "לא נכון": "false",
    "אמת": "true",
    "שקר": "false",

    // Agreement
    "מסכים": "agree",
    "לא מסכים": "disagree",
    "מאשר": "approved",
    "לא מאשר": "not_approved",
    "מקבל": "accept",
    "דוחה": "reject",

    // Status
    "פעיל": "active",
    "לא פעיל": "inactive",
    "מושבת": "disabled",
    "תקין": "valid",
    "לא תקין": "invalid",

    // Marital Status Options
    "רווק": "single",
    "רווקה": "single",
    "נשוי": "married",
    "נשואה": "married",
    "גרוש": "divorced",
    "גרושה": "divorced",
    "אלמן": "widowed",
    "אלמנה": "widowed",
    "פרוד": "separated",
    "פרודה": "separated",
    "ידוע בציבור": "common_law",
    "ידועים בציבור": "common_law",

    // Education Level
    "יסודי": "elementary",
    "תיכון": "high_school",
    "תיכוני": "high_school",
    "אקדמי": "academic",
    "תואר ראשון": "bachelors",
    "תואר שני": "masters",
    "תואר שלישי": "doctorate",

    // Priority/Urgency
    "דחוף": "urgent",
    "רגיל": "normal",
    "נמוך": "low",
    "גבוה": "high",
    "בינוני": "medium",

    // Frequency
    "יומי": "daily",
    "שבועי": "weekly",
    "חודשי": "monthly",
    "שנתי": "yearly",
    "חד פעמי": "one_time",

    // Ownership
    "שכירות": "rent",
    "בעלות": "owned",
    "משכנתא": "mortgage",

    // Numbers as text
    "ראשון": "first",
    "שני": "second",
    "שלישי": "third",
    "רביעי": "fourth",
    "חמישי": "fifth",

    // Common form options
    "חדש": "new",
    "קיים": "existing",
    "עדכון": "update",
    "ביטול": "cancel",
    "אישור": "confirm",
    "סירוב": "refuse"
};

// ============ HEBREW TO ENGLISH TRANSLITERATION ============
const TRANSLITERATION_MAP = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h',
    'ו': 'v', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y',
    'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm',
    'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
    'ף': 'p', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k', 'ר': 'r',
    'ש': 'sh', 'ת': 't'
};

export class FieldNamer {
    constructor() {
        // Allow customization of known names
        this.knownNames = { ...KNOWN_FIELD_NAMES };
    }

    /**
     * Convert Hebrew label to English field ID
     * PRIORITY: 1. Known Fields Table (EXACT match) → 2. Transliteration
     * @param {string} hebrewText - Hebrew field label
     * @returns {string} English field ID (slug format)
     */
    hebrewToEnglish(hebrewText) {
        if (!hebrewText || typeof hebrewText !== 'string') {
            return '';
        }

        // Clean the input
        const cleaned = hebrewText.trim();
        if (!cleaned) {
            return '';
        }

        // 1. FIRST: Check Known Fields Table (EXACT match only)
        const knownId = this._checkKnownNames(cleaned);
        if (knownId) {
            console.log(`[ID_GENERATOR] KNOWN FIELD: "${cleaned}" → "${knownId}"`);
            return knownId;
        }

        // 2. FALLBACK: Pure transliteration for unknown fields
        const transliterated = this._transliterate(cleaned);
        const slugified = this._slugify(transliterated);

        console.log(`[ID_GENERATOR] TRANSLITERATED: "${cleaned.substring(0, 30)}..." → "${slugified}"`);
        return slugified;
    }

    /**
     * Check if text matches a known field name - EXACT MATCH ONLY
     * No partial matches, no fuzzy logic
     * @param {string} text - Hebrew text to check
     * @returns {string|null} English ID or null
     */
    _checkKnownNames(text) {
        // 1. Direct exact match
        if (this.knownNames[text]) {
            return this.knownNames[text];
        }

        // 2. Try without trailing colon/punctuation (common in forms)
        const withoutPunctuation = text.replace(/[:.\-\s]+$/, '').trim();
        if (withoutPunctuation !== text && this.knownNames[withoutPunctuation]) {
            return this.knownNames[withoutPunctuation];
        }

        // NO PARTIAL MATCHES - if not found exactly, return null
        return null;
    }

    /**
     * Transliterate Hebrew text to English letters
     * @param {string} text - Hebrew text
     * @returns {string} Transliterated text
     */
    _transliterate(text) {
        let result = '';

        for (const char of text) {
            if (TRANSLITERATION_MAP[char]) {
                result += TRANSLITERATION_MAP[char];
            } else if (/[a-zA-Z0-9]/.test(char)) {
                // Keep English letters and numbers as-is
                result += char.toLowerCase();
            } else if (char === ' ' || char === '_' || char === '-') {
                // Convert spaces and dashes to underscores
                result += '_';
            }
            // Skip other characters (punctuation, etc.)
        }

        return result;
    }

    /**
     * Convert text to slug format: [a-z0-9_] only
     * @param {string} text - Input text
     * @returns {string} Slugified text
     */
    _slugify(text) {
        return text
            // Convert to lowercase
            .toLowerCase()
            // Replace multiple underscores with single
            .replace(/_+/g, '_')
            // Remove leading/trailing underscores
            .replace(/^_+|_+$/g, '')
            // Keep only allowed characters
            .replace(/[^a-z0-9_]/g, '')
            // Limit length
            .substring(0, 50);
    }

    /**
     * Add or update a known field name mapping
     * @param {string} hebrew - Hebrew label
     * @param {string} english - English ID
     */
    addKnownName(hebrew, english) {
        this.knownNames[hebrew] = english;
    }

    /**
     * Get all known field names
     * @returns {Object} Copy of known names map
     */
    getKnownNames() {
        return { ...this.knownNames };
    }

    /**
     * Generate a unique field ID with suffix if needed
     * @param {string} baseId - Base field ID
     * @param {Array<string>} existingIds - List of existing IDs
     * @returns {string} Unique field ID
     */
    makeUnique(baseId, existingIds = []) {
        if (!existingIds.includes(baseId)) {
            return baseId;
        }

        let counter = 2;
        while (existingIds.includes(`${baseId}_${counter}`)) {
            counter++;
        }

        return `${baseId}_${counter}`;
    }
}

// Singleton instance
export const fieldNamer = new FieldNamer();
