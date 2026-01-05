/**
 * Semantic Dictionary - Canonical Names to Synonyms
 *
 * Maps canonical field names to arrays of Hebrew/English synonyms.
 * Used by SemanticMatcher to find the best match for Excel headers.
 *
 * Rules:
 * - All matching is case-insensitive
 * - Longer matches take priority over shorter ones
 * - Canonical names follow pattern: entity_field (e.g., id_number, phone_mobile)
 */
(function() {
    'use strict';

    const SEMANTIC_DICTIONARY = {

        // === 🆔 PERSONAL IDENTIFICATION ===
        id_number: [
            'תעודת זהות', 'ת"ז', 'ת.ז', 'מספר זהות', 'מס זהות', 'תז',
            'מזהה', 'מספר אישי', 'id', 'identity', 'tz', 'id_number',
            'מספר ת.ז', 'מס ת.ז'
        ],

        first_name: [
            'שם פרטי', 'שם ראשון', 'שם עברי',
            'first name', 'given name', 'first_name', 'firstname'
        ],

        last_name: [
            'שם משפחה', 'משפחה', 'שם אחרון',
            'last name', 'surname', 'family name', 'last_name', 'lastname'
        ],

        full_name: [
            'שם מלא', 'שם העובד', 'שם המעסיק', 'שם המוטב',
            'full name', 'fullname', 'full_name', 'name'
        ],

        birth_date: [
            'תאריך לידה', 'ת.לידה', 'יום הולדת', 'ת לידה',
            'birth date', 'dob', 'date of birth', 'birth_date', 'birthdate'
        ],

        // === 📞 CONTACT ===
        phone_mobile: [
            'טלפון נייד', 'נייד', 'סלולרי', 'פלאפון', 'טלפון סלולרי',
            'mobile', 'cell', 'cellular', 'cellphone', 'mobile phone'
        ],

        phone: [
            'טלפון', 'מספר טלפון', 'phone', 'telephone', 'tel'
        ],

        phone_landline: [
            'טלפון קווי', 'טלפון בית', 'קווי', 'בית',
            'landline', 'home phone', 'home_phone'
        ],

        email: [
            'אימייל', 'מייל', 'דוא"ל', 'דואר אלקטרוני', 'כתובת מייל',
            'כתובת דואר אלקטרוני', 'דואל', 'אי-מייל',
            'email', 'e-mail', 'mail'
        ],

        // === 🏠 ADDRESS ===
        street: [
            'רחוב', 'כתובת', 'מען', 'רחוב/שכונה', 'שכונה', 'רח',
            'street', 'address', 'street_address'
        ],

        house_number: [
            'מספר בית', 'מס בית', 'בית', 'מספר',
            'house number', 'house_number', 'number'
        ],

        city: [
            'עיר', 'ישוב', 'יישוב', 'מקום מגורים', 'עיר מגורים', 'עיר/ישוב',
            'city', 'location', 'town'
        ],

        zip_code: [
            'מיקוד', 'מיקוד דואר', 'קוד דואר',
            'zip', 'zip code', 'zip_code', 'postal', 'postal code', 'postal_code'
        ],

        // === 💼 EMPLOYER ===
        company_name: [
            'שם מעסיק', 'שם חברה', 'שם עסק', 'מעסיק', 'חברה', 'עסק',
            'שם המעסיק', 'פרטי מעסיק',
            'employer name', 'company name', 'company', 'employer', 'business name'
        ],

        company_id: [
            'ח"פ', 'ח.פ', 'מספר חברה', 'מספר תאגיד', 'מספר מעסיק',
            'ע.מ', 'ע"מ', 'עוסק מורשה', 'מספר עוסק',
            'company id', 'company_id', 'business id', 'employer id', 'ein', 'bn'
        ],

        // === 💼 EMPLOYMENT ===
        start_date: [
            'תאריך תחילת עבודה', 'תחילת עבודה', 'מועד קליטה', 'תאריך קליטה',
            'תאריך התחלה', 'מועד תחילה', 'תאריך תחילה העבודה',
            'start date', 'hire date', 'start_date', 'employment date'
        ],

        end_date: [
            'תאריך סיום', 'סיום עבודה', 'תאריך עזיבה',
            'end date', 'end_date', 'termination date'
        ],

        job_title: [
            'תפקיד', 'עיסוק', 'מקצוע', 'תיאור תפקיד',
            'position', 'job title', 'job_title', 'role', 'occupation'
        ],

        // === 💰 SALARY & INCOME ===
        salary: [
            'שכר', 'משכורת', 'הכנסה',
            'salary', 'income', 'pay', 'wage'
        ],

        salary_gross: [
            'שכר ברוטו', 'ברוטו', 'משכורת ברוטו', 'הכנסה ברוטו',
            'gross salary', 'gross', 'total pay', 'gross_salary'
        ],

        salary_net: [
            'שכר נטו', 'נטו', 'משכורת נטו', 'הכנסה נטו',
            'net salary', 'net', 'take home', 'net_salary'
        ],

        // Income types for checkbox matching (Form 101)
        income_type_monthly: [
            'משכורת חודש', 'משכורת חודשית', 'שכר חודשי', 'הכנסה חודשית',
            'משכורת רגילה', 'חודשי', 'חודש',
            'monthly salary', 'monthly_salary', 'monthly income', 'monthly'
        ],

        income_type_partial: [
            'משכורת חלקית', 'משרה חלקית', 'חלקית', 'עבודה חלקית',
            'partial salary', 'partial_salary', 'part time', 'part_time', 'partial'
        ],

        income_type_additional: [
            'משכורת בעד משרה נוספת', 'משרה נוספת', 'עבודה נוספת', 'הכנסה נוספת',
            'עבודה שנייה', 'מעסיק נוסף', 'נוספת', 'נוסף',
            'additional job', 'additional_job', 'second job', 'second_job', 'additional'
        ],

        // Income type category (for column header matching)
        income_type: [
            'סוג הכנסה', 'סוג משכורת', 'סוג שכר', 'אופי ההכנסה',
            'income type', 'income_type', 'salary type'
        ],

        // === 🏦 BANK ===
        bank_account: [
            'מספר חשבון', 'חשבון בנק', 'חשבון', 'ח-ן', 'מס חשבון',
            'account number', 'account', 'bank account', 'bank_account'
        ],

        bank_branch: [
            'סניף', 'מספר סניף', 'קוד סניף', 'מס סניף',
            'branch', 'branch number', 'branch_number', 'branch code'
        ],

        bank_name: [
            'בנק', 'שם הבנק', 'שם בנק',
            'bank', 'bank name', 'bank_name'
        ],

        bank_code: [
            'קוד בנק', 'מספר בנק',
            'bank code', 'bank_code'
        ],

        // === 👪 FAMILY ===
        marital_status: [
            'מצב משפחתי', 'סטטוס משפחתי', 'סטטוס', 'מעמד אישי',
            'marital status', 'marital_status', 'status'
        ],

        // Marital status values (for checkbox/radio matching)
        marital_single: [
            'רווק', 'רווקה', 'לא נשוי', 'לא נשואה',
            'single', 'unmarried'
        ],

        marital_married: [
            'נשוי', 'נשואה', 'married'
        ],

        marital_divorced: [
            'גרוש', 'גרושה', 'divorced'
        ],

        marital_widowed: [
            'אלמן', 'אלמנה', 'widowed', 'widow', 'widower'
        ],

        marital_separated: [
            'פרוד', 'פרודה', 'separated'
        ],

        gender: [
            'מין', 'מגדר',
            'gender', 'sex'
        ],

        gender_male: [
            'זכר', 'גבר', 'male', 'm', 'ז'
        ],

        gender_female: [
            'נקבה', 'אישה', 'female', 'f', 'נ'
        ],

        children_count: [
            'מספר ילדים', 'ילדים', 'כמות ילדים', 'מס ילדים',
            'children', 'number of children', 'children_count', 'kids', 'num_children'
        ],

        spouse_name: [
            'שם בן/בת זוג', 'בן זוג', 'בת זוג', 'שם בן זוג', 'שם בת זוג',
            'spouse', 'partner', 'spouse name', 'spouse_name'
        ],

        spouse_id: [
            'ת.ז בן/בת זוג', 'ת.ז בן זוג', 'ת.ז בת זוג', 'מספר זהות בן זוג',
            'spouse id', 'spouse_id', 'partner id'
        ],

        // === 🏥 HEALTH ===
        health_fund: [
            'קופת חולים', 'קופ"ח', 'קופ\'ח', 'קופח', 'קוה"ח', 'קוהח',
            'שם קופת חולים', 'קופה', 'ביטוח בריאות',
            'health fund', 'health_fund', 'hmo', 'kupat cholim'
        ],

        health_fund_clalit: [
            'כללית', 'קופ"ח כללית', 'שירותי בריאות כללית',
            'clalit', 'kupat cholim clalit'
        ],

        health_fund_maccabi: [
            'מכבי', 'קופ"ח מכבי', 'מכבי שירותי בריאות',
            'maccabi', 'kupat cholim maccabi'
        ],

        health_fund_meuhedet: [
            'מאוחדת', 'קופ"ח מאוחדת',
            'meuhedet', 'kupat cholim meuhedet'
        ],

        health_fund_leumit: [
            'לאומית', 'קופ"ח לאומית',
            'leumit', 'kupat cholim leumit'
        ],

        // === 📋 TAX & LEGAL ===
        tax_credit_points: [
            'נקודות זיכוי', 'נ.ז', 'נקודות', 'נק זיכוי',
            'tax credits', 'credit points', 'tax_credit_points'
        ],

        resident_status: [
            'תושב ישראל', 'תושבות', 'אזרחות', 'סטטוס תושבות',
            'resident', 'residency', 'resident_status', 'citizenship'
        ],

        // === 📅 DATES ===
        date: [
            'תאריך', 'date'
        ],

        signature_date: [
            'תאריך חתימה', 'תאריך החתימה',
            'signature date', 'sign date'
        ],

        // === ✍️ SIGNATURE ===
        signature: [
            'חתימה', 'חתימת העובד', 'חתימת המעסיק',
            'signature', 'sign'
        ]
    };

    // Export for use in browser and Node.js
    if (typeof window !== 'undefined') {
        window.SEMANTIC_DICTIONARY = SEMANTIC_DICTIONARY;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SEMANTIC_DICTIONARY };
    }

})();
