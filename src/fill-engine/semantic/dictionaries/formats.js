/**
 * Format Patterns - Regex patterns for Israeli data formats
 *
 * Used by Preprocessor to identify and validate field types from data values.
 * Each pattern includes:
 * - regex: Pattern to match
 * - normalize: Function to clean/standardize the value
 * - validate: Optional function for semantic validation
 *
 * Rules:
 * - Patterns are tested in order, first match wins
 * - More specific patterns (like israeli_id) should come before generic (like number)
 */
(function() {
    'use strict';

    const FORMAT_PATTERNS = {

        // === Israeli ID Number (9 digits, Luhn-like checksum) ===
        israeli_id: {
            // Matches 9 digits, optionally with dashes or spaces
            regex: /^[\s]*0?(\d[\s-]?){8,9}[\s]*$/,
            normalize: function(value) {
                // Remove all non-digits
                let digits = String(value).replace(/\D/g, '');
                // Pad to 9 digits with leading zeros
                return digits.padStart(9, '0');
            },
            validate: function(value) {
                const digits = this.normalize(value);
                if (digits.length !== 9) return false;

                // Israeli ID checksum (similar to Luhn)
                let sum = 0;
                for (let i = 0; i < 9; i++) {
                    let digit = parseInt(digits[i], 10);
                    if (i % 2 === 1) {
                        digit *= 2;
                        if (digit > 9) digit -= 9;
                    }
                    sum += digit;
                }
                return sum % 10 === 0;
            }
        },

        // === Phone Numbers ===
        phone_mobile: {
            // Israeli mobile: 05X-XXXXXXX
            regex: /^[\s]*(05[0-9])[\s-]?(\d{3})[\s-]?(\d{4})[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/\D/g, '');
            },
            validate: function(value) {
                const digits = this.normalize(value);
                return digits.length === 10 && digits.startsWith('05');
            }
        },

        phone_landline: {
            // Israeli landline: 0X-XXXXXXX (area codes: 02,03,04,08,09,077)
            regex: /^[\s]*(0[2-9]|077)[\s-]?(\d{3})[\s-]?(\d{4})[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/\D/g, '');
            },
            validate: function(value) {
                const digits = this.normalize(value);
                return (digits.length === 9 || digits.length === 10) &&
                       !digits.startsWith('05') &&
                       digits.startsWith('0');
            }
        },

        phone: {
            // Any Israeli phone number
            regex: /^[\s]*0[\d\s-]{8,11}[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/\D/g, '');
            }
        },

        // === Email ===
        email: {
            regex: /^[\s]*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[\s]*$/i,
            normalize: function(value) {
                return String(value).trim().toLowerCase();
            }
        },

        // === Dates ===
        date_dmy: {
            // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
            regex: /^[\s]*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})[\s]*$/,
            normalize: function(value) {
                const match = String(value).match(this.regex);
                if (!match) return value;
                const day = match[1].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                let year = match[3];
                if (year.length === 2) {
                    year = parseInt(year) > 50 ? '19' + year : '20' + year;
                }
                return `${day}/${month}/${year}`;
            },
            validate: function(value) {
                const match = String(value).match(this.regex);
                if (!match) return false;
                const day = parseInt(match[1]);
                const month = parseInt(match[2]);
                return day >= 1 && day <= 31 && month >= 1 && month <= 12;
            }
        },

        date_ymd: {
            // YYYY/MM/DD or YYYY-MM-DD
            regex: /^[\s]*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})[\s]*$/,
            normalize: function(value) {
                const match = String(value).match(this.regex);
                if (!match) return value;
                const day = match[3].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                const year = match[1];
                // Convert to DD/MM/YYYY (Israeli standard)
                return `${day}/${month}/${year}`;
            }
        },

        date_hebrew: {
            // Hebrew month names: ינואר, פברואר, etc.
            regex: /(\d{1,2})[\s]+(בינואר|בפברואר|במרץ|באפריל|במאי|ביוני|ביולי|באוגוסט|בספטמבר|באוקטובר|בנובמבר|בדצמבר|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)[\s]+(\d{4})/i,
            normalize: function(value) {
                const hebrewMonths = {
                    'ינואר': '01', 'בינואר': '01',
                    'פברואר': '02', 'בפברואר': '02',
                    'מרץ': '03', 'במרץ': '03',
                    'אפריל': '04', 'באפריל': '04',
                    'מאי': '05', 'במאי': '05',
                    'יוני': '06', 'ביוני': '06',
                    'יולי': '07', 'ביולי': '07',
                    'אוגוסט': '08', 'באוגוסט': '08',
                    'ספטמבר': '09', 'בספטמבר': '09',
                    'אוקטובר': '10', 'באוקטובר': '10',
                    'נובמבר': '11', 'בנובמבר': '11',
                    'דצמבר': '12', 'בדצמבר': '12'
                };
                const match = String(value).match(this.regex);
                if (!match) return value;
                const day = match[1].padStart(2, '0');
                const month = hebrewMonths[match[2]] || '01';
                const year = match[3];
                return `${day}/${month}/${year}`;
            }
        },

        // === Bank Details ===
        bank_account: {
            // Israeli bank account: typically 6-9 digits
            regex: /^[\s]*\d{6,9}[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/\D/g, '');
            }
        },

        bank_branch: {
            // Bank branch: 3-4 digits
            regex: /^[\s]*\d{3,4}[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/\D/g, '');
            }
        },

        bank_code: {
            // Bank code: 2 digits (10=Leumi, 12=Hapoalim, 20=Mizrahi, etc.)
            regex: /^[\s]*\d{2}[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/\D/g, '').padStart(2, '0');
            }
        },

        // === Company IDs ===
        company_id: {
            // Israeli company number (ח.פ): 9 digits starting with 51-59
            regex: /^[\s]*(5[1-9]\d{7})[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/\D/g, '');
            }
        },

        business_id: {
            // Osek Murshe (ע.מ): Same as ID number or company number
            regex: /^[\s]*\d{9}[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/\D/g, '').padStart(9, '0');
            }
        },

        // === Currency & Numbers ===
        currency_ils: {
            // Israeli Shekel amounts: ₪1,234.56 or 1234.56 ש"ח
            regex: /^[\s]*(₪|ש["״]ח)?[\s]*[\d,]+(\.\d{1,2})?[\s]*(₪|ש["״]ח)?[\s]*$/,
            normalize: function(value) {
                // Remove currency symbols and format as number
                return String(value)
                    .replace(/[₪ש"״ח,\s]/g, '')
                    .replace(/[^\d.]/g, '');
            }
        },

        percentage: {
            // Percentage: 12.5% or 12.5 אחוז
            regex: /^[\s]*[\d.]+[\s]*(%|אחוז)?[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/[^\d.]/g, '');
            }
        },

        number: {
            // Generic number (including with commas)
            regex: /^[\s]*[\d,]+(\.\d+)?[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/[,\s]/g, '');
            }
        },

        // === Boolean/Checkbox ===
        boolean: {
            regex: /^[\s]*(true|false|כן|לא|yes|no|1|0|v|x|✓|✔|✕|✗)[\s]*$/i,
            normalize: function(value) {
                const v = String(value).trim().toLowerCase();
                const trueValues = ['true', 'כן', 'yes', '1', 'v', 'x', '✓', '✔'];
                return trueValues.includes(v);
            }
        },

        // === Zip Code ===
        zip_code: {
            // Israeli zip code: 7 digits
            regex: /^[\s]*\d{7}[\s]*$/,
            normalize: function(value) {
                return String(value).replace(/\D/g, '');
            }
        },

        // === Gender ===
        gender: {
            regex: /^[\s]*(זכר|נקבה|male|female|m|f|ז|נ)[\s]*$/i,
            normalize: function(value) {
                const v = String(value).trim().toLowerCase();
                const maleValues = ['זכר', 'male', 'm', 'ז'];
                return maleValues.includes(v) ? 'male' : 'female';
            }
        },

        // === Marital Status ===
        marital_status: {
            regex: /^[\s]*(רווק|נשוי|גרוש|אלמן|רווקה|נשואה|גרושה|אלמנה|single|married|divorced|widowed)[\s]*$/i,
            normalize: function(value) {
                const v = String(value).trim();
                const statusMap = {
                    'רווק': 'single', 'רווקה': 'single', 'single': 'single',
                    'נשוי': 'married', 'נשואה': 'married', 'married': 'married',
                    'גרוש': 'divorced', 'גרושה': 'divorced', 'divorced': 'divorced',
                    'אלמן': 'widowed', 'אלמנה': 'widowed', 'widowed': 'widowed'
                };
                return statusMap[v.toLowerCase()] || v;
            }
        }
    };

    // Helper function to detect format from value
    function detectFormat(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        const str = String(value);

        // Test patterns in priority order
        const priorityOrder = [
            'israeli_id',
            'phone_mobile',
            'phone_landline',
            'phone',
            'email',
            'date_dmy',
            'date_ymd',
            'date_hebrew',
            'company_id',
            'business_id',
            'zip_code',
            'bank_code',
            'bank_branch',
            'bank_account',
            'currency_ils',
            'percentage',
            'boolean',
            'gender',
            'marital_status',
            'number'
        ];

        for (const formatName of priorityOrder) {
            const pattern = FORMAT_PATTERNS[formatName];
            if (pattern && pattern.regex.test(str)) {
                return {
                    format: formatName,
                    pattern: pattern,
                    normalized: pattern.normalize ? pattern.normalize(str) : str,
                    isValid: pattern.validate ? pattern.validate(str) : true
                };
            }
        }

        return {
            format: 'text',
            pattern: null,
            normalized: str.trim(),
            isValid: true
        };
    }

    // Export for use in browser and Node.js
    if (typeof window !== 'undefined') {
        window.FORMAT_PATTERNS = FORMAT_PATTERNS;
        window.detectFormat = detectFormat;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { FORMAT_PATTERNS, detectFormat };
    }

})();
