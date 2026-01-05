/**
 * CanonicalSelector - Helper for canonical field selection in mapper
 *
 * Provides:
 * - Auto-suggest canonical names based on Hebrew text
 * - Grouped canonical options for dropdowns
 * - Context and format detection
 */

// Hebrew labels for canonical fields (fallback when dictionary not loaded)
export const CANONICAL_LABELS_HE = {
    // Personal
    id_number: 'מספר זהות',
    first_name: 'שם פרטי',
    last_name: 'שם משפחה',
    full_name: 'שם מלא',
    birth_date: 'תאריך לידה',
    gender: 'מין',
    gender_male: 'זכר',
    gender_female: 'נקבה',

    // Contact
    phone: 'טלפון',
    phone_mobile: 'טלפון נייד',
    phone_landline: 'טלפון קווי',
    email: 'דוא"ל',

    // Address
    street: 'רחוב',
    house_number: 'מספר בית',
    city: 'עיר',
    zip_code: 'מיקוד',

    // Employer
    company_name: 'שם מעסיק',
    company_id: 'ח.פ / ע.מ',

    // Employment
    start_date: 'תאריך התחלה',
    end_date: 'תאריך סיום',
    job_title: 'תפקיד',

    // Salary
    salary: 'שכר',
    salary_gross: 'שכר ברוטו',
    salary_net: 'שכר נטו',
    income_type: 'סוג הכנסה',
    income_type_monthly: 'הכנסה חודשית',
    income_type_partial: 'הכנסה חלקית',
    income_type_additional: 'הכנסה נוספת',

    // Bank
    bank_name: 'שם בנק',
    bank_code: 'קוד בנק',
    bank_branch: 'סניף',
    bank_account: 'מספר חשבון',

    // Family
    marital_status: 'מצב משפחתי',
    marital_single: 'רווק/ה',
    marital_married: 'נשוי/אה',
    marital_divorced: 'גרוש/ה',
    marital_widowed: 'אלמן/ה',
    marital_separated: 'פרוד/ה',
    children_count: 'מספר ילדים',
    spouse_name: 'שם בן/בת זוג',
    spouse_id: 'ת.ז בן/בת זוג',

    // Health
    health_fund: 'קופת חולים',
    health_fund_clalit: 'כללית',
    health_fund_maccabi: 'מכבי',
    health_fund_meuhedet: 'מאוחדת',
    health_fund_leumit: 'לאומית',

    // Tax
    tax_credit_points: 'נקודות זיכוי',
    resident_status: 'סטטוס תושבות',

    // Dates
    date: 'תאריך',
    signature_date: 'תאריך חתימה',

    // Signature
    signature: 'חתימה'
};

// Canonical field groups for organized dropdowns
export const CANONICAL_GROUPS = {
    personal: {
        label_he: 'פרטים אישיים',
        label_en: 'Personal',
        fields: [
            'id_number', 'first_name', 'last_name', 'full_name', 'birth_date',
            'gender', 'gender_male', 'gender_female'
        ]
    },
    contact: {
        label_he: 'פרטי קשר',
        label_en: 'Contact',
        fields: [
            'phone', 'phone_mobile', 'phone_landline', 'email'
        ]
    },
    address: {
        label_he: 'כתובת',
        label_en: 'Address',
        fields: [
            'street', 'house_number', 'city', 'zip_code'
        ]
    },
    employer: {
        label_he: 'מעסיק',
        label_en: 'Employer',
        fields: [
            'company_name', 'company_id'
        ]
    },
    employment: {
        label_he: 'תעסוקה',
        label_en: 'Employment',
        fields: [
            'start_date', 'end_date', 'job_title'
        ]
    },
    salary: {
        label_he: 'שכר והכנסה',
        label_en: 'Salary',
        fields: [
            'salary', 'salary_gross', 'salary_net',
            'income_type', 'income_type_monthly', 'income_type_partial', 'income_type_additional'
        ]
    },
    bank: {
        label_he: 'בנק',
        label_en: 'Bank',
        fields: [
            'bank_name', 'bank_code', 'bank_branch', 'bank_account'
        ]
    },
    family: {
        label_he: 'משפחה',
        label_en: 'Family',
        fields: [
            'marital_status', 'marital_single', 'marital_married', 'marital_divorced', 'marital_widowed', 'marital_separated',
            'children_count', 'spouse_name', 'spouse_id'
        ]
    },
    health: {
        label_he: 'בריאות',
        label_en: 'Health',
        fields: [
            'health_fund', 'health_fund_clalit', 'health_fund_maccabi', 'health_fund_meuhedet', 'health_fund_leumit'
        ]
    },
    tax: {
        label_he: 'מס ותושבות',
        label_en: 'Tax & Legal',
        fields: [
            'tax_credit_points', 'resident_status'
        ]
    },
    dates: {
        label_he: 'תאריכים',
        label_en: 'Dates',
        fields: [
            'date', 'signature_date'
        ]
    },
    signature: {
        label_he: 'חתימות',
        label_en: 'Signature',
        fields: [
            'signature'
        ]
    }
};

// Context options for fields
export const CONTEXT_OPTIONS = [
    { value: 'employee', label_he: 'עובד', label_en: 'Employee' },
    { value: 'employer', label_he: 'מעסיק', label_en: 'Employer' },
    { value: 'spouse', label_he: 'בן/בת זוג', label_en: 'Spouse' },
    { value: 'company', label_he: 'חברה', label_en: 'Company' },
    { value: 'bank', label_he: 'בנק', label_en: 'Bank' }
];

// Format hints for common field types
export const FORMAT_HINTS = {
    // ID Numbers
    id_number: { format: 'israeli_id', placeholder: '9 ספרות', pattern: '^\\d{9}$', boxCount: 9, structure: 'boxes' },
    passport_number: { format: 'passport', placeholder: 'מספר דרכון', boxCount: 9, structure: 'boxes' },
    company_id: { format: 'israeli_company', placeholder: 'ח.פ / ע.מ', pattern: '^\\d{9}$', boxCount: 9, structure: 'boxes' },

    // Dates
    birth_date: { format: 'DD/MM/YYYY', placeholder: 'DD/MM/YYYY', type: 'date', boxCount: 8, structure: 'boxes' },
    start_date: { format: 'DD/MM/YYYY', placeholder: 'DD/MM/YYYY', type: 'date', boxCount: 8, structure: 'boxes' },
    end_date: { format: 'DD/MM/YYYY', placeholder: 'DD/MM/YYYY', type: 'date', boxCount: 8, structure: 'boxes' },
    signature_date: { format: 'DD/MM/YYYY', placeholder: 'DD/MM/YYYY', type: 'date', boxCount: 8, structure: 'boxes' },

    // Phone Numbers
    phone: { format: 'phone_il', placeholder: '0X-XXXXXXX', type: 'tel', boxCount: 10, structure: 'boxes' },
    phone_mobile: { format: 'phone_mobile_il', placeholder: '05X-XXXXXXX', type: 'tel', boxCount: 10, structure: 'boxes' },
    phone_landline: { format: 'phone_il', placeholder: '0X-XXXXXXX', type: 'tel', boxCount: 10, structure: 'boxes' },
    fax: { format: 'phone_il', placeholder: 'פקס', type: 'tel', boxCount: 10, structure: 'boxes' },

    // Address
    zip_code: { format: 'zip_il', placeholder: '7 ספרות', pattern: '^\\d{7}$', boxCount: 7, structure: 'boxes' },

    // Bank Details
    bank_account: { format: 'numeric', placeholder: 'מספרים בלבד', boxCount: 9, structure: 'boxes' },
    bank_branch: { format: 'numeric', placeholder: '3 ספרות', pattern: '^\\d{3}$', boxCount: 3, structure: 'boxes' },
    bank_code: { format: 'numeric', placeholder: '2 ספרות', pattern: '^\\d{2}$', boxCount: 2, structure: 'boxes' },

    // Text fields (no boxes)
    email: { format: 'email', placeholder: 'email@example.com', type: 'email', structure: 'text' },
    salary: { format: 'currency_ils', placeholder: '₪', structure: 'text' },
    salary_gross: { format: 'currency_ils', placeholder: '₪', structure: 'text' },
    salary_net: { format: 'currency_ils', placeholder: '₪', structure: 'text' }
};

// Categories for radio/checkbox groups
export const CATEGORY_OPTIONS = [
    { value: 'gender', label_he: 'מין', label_en: 'Gender' },
    { value: 'marital_status', label_he: 'מצב משפחתי', label_en: 'Marital Status' },
    { value: 'income_type', label_he: 'סוג הכנסה', label_en: 'Income Type' },
    { value: 'health_fund', label_he: 'קופת חולים', label_en: 'Health Fund' },
    { value: 'resident_status', label_he: 'תושבות', label_en: 'Resident Status' }
];

/**
 * CanonicalSelector class
 */
export class CanonicalSelector {
    constructor() {
        this.dictionary = null;
        this.loaded = false;
    }

    /**
     * Load the synonyms dictionary
     * Tries window.SEMANTIC_DICTIONARY first, then fetches from file
     */
    async loadDictionary() {
        // Check if already loaded globally
        if (window.SEMANTIC_DICTIONARY) {
            this.dictionary = window.SEMANTIC_DICTIONARY;
            this.loaded = true;
            console.log('[CanonicalSelector] Loaded dictionary from window');
            return;
        }

        // Try to load from file
        try {
            const script = document.createElement('script');
            script.src = '../fill-engine/semantic/dictionaries/synonyms.js';
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });

            if (window.SEMANTIC_DICTIONARY) {
                this.dictionary = window.SEMANTIC_DICTIONARY;
                this.loaded = true;
                console.log('[CanonicalSelector] Loaded dictionary from file');
            }
        } catch (e) {
            console.warn('[CanonicalSelector] Failed to load synonyms dictionary:', e);
        }
    }

    /**
     * Suggest canonical names based on Hebrew text
     * @param {string} hebrewText - Hebrew text to match
     * @param {number} limit - Max suggestions (default 5)
     * @returns {Array} Array of { canonical, score, matchedSynonym }
     */
    suggestCanonical(hebrewText, limit = 5) {
        if (!this.dictionary || !hebrewText) return [];

        const textLower = hebrewText.toLowerCase().trim();
        const suggestions = [];

        for (const [canonical, synonyms] of Object.entries(this.dictionary)) {
            for (const synonym of synonyms) {
                const synLower = synonym.toLowerCase();

                // Exact match - highest score
                if (synLower === textLower) {
                    suggestions.push({ canonical, score: 100, matchedSynonym: synonym });
                    break;
                }

                // Text contains synonym
                if (textLower.includes(synLower) && synLower.length > 2) {
                    const score = 50 + (synLower.length / textLower.length) * 30;
                    suggestions.push({ canonical, score, matchedSynonym: synonym });
                    break;
                }

                // Synonym contains text
                if (synLower.includes(textLower) && textLower.length > 2) {
                    const score = 40 + (textLower.length / synLower.length) * 20;
                    suggestions.push({ canonical, score, matchedSynonym: synonym });
                    break;
                }
            }
        }

        // Sort by score and return top matches
        return suggestions
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Get the best canonical match for Hebrew text
     * @param {string} hebrewText - Hebrew text to match
     * @returns {string|null} Best matching canonical or null
     */
    getBestMatch(hebrewText) {
        const suggestions = this.suggestCanonical(hebrewText, 1);
        return suggestions.length > 0 && suggestions[0].score >= 50
            ? suggestions[0].canonical
            : null;
    }

    /**
     * Get format hint for a canonical field
     * @param {string} canonical - Canonical field name
     * @returns {Object|null} Format hint object or null
     */
    getFormatHint(canonical) {
        return FORMAT_HINTS[canonical] || null;
    }

    /**
     * Detect field type from canonical name
     * @param {string} canonical - Canonical field name
     * @returns {string} Field type (text, date, checkbox, etc.)
     */
    detectFieldType(canonical) {
        if (!canonical) return 'text';

        // Date fields
        if (canonical.includes('date') || canonical.includes('birth')) return 'date';

        // Number fields - IDs, phone numbers, bank details, etc.
        const numberFields = [
            'id_number', 'passport_number', 'company_id',
            'phone', 'phone_mobile', 'phone_landline', 'mobile', 'fax',
            'bank_code', 'bank_branch', 'bank_account', 'account_number',
            'zip_code', 'house_number', 'apartment',
            'children_count', 'amount', 'number', 'tax_credit_points'
        ];
        if (numberFields.includes(canonical)) return 'number';

        // Checkbox/radio fields (options within categories)
        if (canonical.startsWith('gender_') ||
            canonical.startsWith('marital_') ||
            canonical.startsWith('income_type_') ||
            canonical.startsWith('health_fund_')) {
            return 'checkbox';
        }

        // Radio group categories (the group itself, not options)
        const radioCategories = ['gender', 'marital_status', 'income_type', 'health_fund', 'resident_status'];
        if (radioCategories.includes(canonical)) return 'radio';

        // Signature
        if (canonical === 'signature') return 'signature';

        return 'text';
    }

    /**
     * Suggest context based on canonical name
     * @param {string} canonical - Canonical field name
     * @returns {string|null} Suggested context
     */
    suggestContext(canonical) {
        if (!canonical) return null;

        // Bank fields
        if (canonical.startsWith('bank_')) return 'bank';

        // Company/employer fields
        if (canonical.startsWith('company_')) return 'employer';

        // Spouse fields
        if (canonical.startsWith('spouse_')) return 'spouse';

        // Most personal fields default to employee context
        const employeeFields = [
            'id_number', 'first_name', 'last_name', 'full_name', 'birth_date',
            'phone', 'phone_mobile', 'email', 'street', 'city', 'zip_code',
            'marital_status', 'gender', 'health_fund', 'start_date'
        ];
        if (employeeFields.includes(canonical)) return 'employee';

        return null;
    }

    /**
     * Detect context from Hebrew label text
     * Uses pattern matching to identify entity context
     * @param {string} label_he - Hebrew label text
     * @returns {string} Detected context (defaults to 'employee')
     */
    detectContextFromLabel(label_he) {
        if (!label_he) return 'employee';

        const textLower = label_he.toLowerCase().trim();

        // Context patterns - ordered by specificity
        const CONTEXT_PATTERNS = {
            employer: ['מעסיק', 'מעביד', 'חברה', 'מקום עבודה', 'העבודה', 'המעסיק', 'שם החברה'],
            spouse: ['בן זוג', 'בת זוג', 'זוג', 'בן/בת זוג', 'נלווה', 'שם בן הזוג'],
            bank: ['בנק', 'חשבון בנק', 'סניף', 'מספר חשבון'],
            company: ['ח.פ', 'ח"פ', 'ע.מ', 'ע"מ', 'עוסק מורשה', 'תאגיד']
        };

        for (const [context, patterns] of Object.entries(CONTEXT_PATTERNS)) {
            for (const pattern of patterns) {
                if (textLower.includes(pattern.toLowerCase())) {
                    console.log(`[CanonicalSelector] detectContextFromLabel: "${label_he}" → ${context} (matched: "${pattern}")`);
                    return context;
                }
            }
        }

        // Default to employee
        return 'employee';
    }

    /**
     * Combined suggestion function - returns canonical, context, and format
     * @param {string} label_he - Hebrew label text
     * @returns {Object} { canonical, context, format, score, source }
     */
    suggestFromLabel(label_he) {
        if (!label_he) {
            return { canonical: null, context: 'employee', format: null, score: 0, source: 'none' };
        }

        // Get canonical suggestion
        const suggestions = this.suggestCanonical(label_he, 1);
        const canonical = suggestions.length > 0 && suggestions[0].score >= 50
            ? suggestions[0].canonical
            : null;
        const score = suggestions.length > 0 ? suggestions[0].score : 0;

        // Detect context - first try from canonical, then from label
        let context = canonical ? this.suggestContext(canonical) : null;
        if (!context) {
            context = this.detectContextFromLabel(label_he);
        }

        // Get format hint
        const formatHint = canonical ? this.getFormatHint(canonical) : null;
        const format = formatHint ? formatHint.format : null;

        const result = {
            canonical,
            context,
            format,
            score,
            source: canonical ? 'dictionary' : 'pattern'
        };

        console.log(`[CanonicalSelector] suggestFromLabel: "${label_he}" →`, result);
        return result;
    }

    /**
     * Get all canonical options grouped for dropdown
     * @returns {Array} Array of { group, label_he, options: [{ value, label }] }
     */
    getGroupedOptions() {
        const result = [];

        for (const [groupKey, group] of Object.entries(CANONICAL_GROUPS)) {
            const options = group.fields.map(canonical => ({
                value: canonical,
                label: this.getCanonicalLabel(canonical)
            }));

            result.push({
                group: groupKey,
                label_he: group.label_he,
                label_en: group.label_en,
                options
            });
        }

        return result;
    }

    /**
     * Get Hebrew label for a canonical field
     * @param {string} canonical - Canonical field name
     * @returns {string} Hebrew label
     */
    getCanonicalLabel(canonical) {
        // Priority 1: Use built-in Hebrew labels (always available)
        if (CANONICAL_LABELS_HE[canonical]) {
            return CANONICAL_LABELS_HE[canonical];
        }

        // Priority 2: Try dictionary if loaded
        if (this.dictionary && this.dictionary[canonical]) {
            const synonyms = this.dictionary[canonical];
            const hebrewSynonym = synonyms.find(s => /[\u0590-\u05FF]/.test(s));
            if (hebrewSynonym) return hebrewSynonym;
        }

        // Fallback: Convert snake_case to readable
        return canonical.replace(/_/g, ' ');
    }

    /**
     * Get category for a canonical field (if it's part of an enum group)
     * @param {string} canonical - Canonical field name
     * @returns {string|null} Category name or null
     */
    getCategoryForCanonical(canonical) {
        if (canonical.startsWith('marital_') && canonical !== 'marital_status') return 'marital_status';
        if (canonical.startsWith('gender_') && canonical !== 'gender') return 'gender';
        if (canonical.startsWith('income_type_') && canonical !== 'income_type') return 'income_type';
        if (canonical.startsWith('health_fund_') && canonical !== 'health_fund') return 'health_fund';
        return null;
    }
}

// Singleton instance
export const canonicalSelector = new CanonicalSelector();

// Initialize on load
if (typeof window !== 'undefined') {
    canonicalSelector.loadDictionary();
}
