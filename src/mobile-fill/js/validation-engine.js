/**
 * validation-engine.js
 * Smart validation for mobile PDF filling
 *
 * Features:
 * - Required field validation
 * - Format validation (Israeli ID, phone, email, date)
 * - Cross-field logic validation
 * - Hebrew error messages
 * - Integration with export flow
 */
(function() {
    'use strict';

    // ========================================
    // Israeli ID Validation (Luhn algorithm)
    // ========================================
    function isValidIsraeliId(id) {
        id = String(id).trim().replace(/\D/g, '');

        if (id.length !== 9) return false;

        // Pad with leading zeros if needed
        id = id.padStart(9, '0');

        let sum = 0;
        for (let i = 0; i < 9; i++) {
            let digit = parseInt(id[i]) * ((i % 2) + 1);
            if (digit > 9) digit -= 9;
            sum += digit;
        }

        return sum % 10 === 0;
    }

    // ========================================
    // Format Validators
    // ========================================
    const formatValidators = {
        // Israeli ID: 9 digits with Luhn check
        israeli_id: {
            validate: (value) => {
                const cleaned = value.replace(/\D/g, '');
                if (!cleaned) return null; // Empty is OK (required check is separate)
                if (cleaned.length !== 9) return 'מספר ת"ז חייב להכיל 9 ספרות';
                if (!isValidIsraeliId(cleaned)) return 'מספר ת"ז לא תקין (ספרת ביקורת שגויה)';
                return null;
            }
        },

        // Phone: Israeli format 05X-XXXXXXX or 0X-XXXXXXX
        phone: {
            validate: (value) => {
                const cleaned = value.replace(/[\s\-\.]/g, '');
                if (!cleaned) return null;
                if (!/^0\d{8,9}$/.test(cleaned)) return 'מספר טלפון לא תקין';
                return null;
            }
        },

        // Mobile phone: 05X-XXXXXXX
        mobile: {
            validate: (value) => {
                const cleaned = value.replace(/[\s\-\.]/g, '');
                if (!cleaned) return null;
                if (!/^05\d{8}$/.test(cleaned)) return 'מספר נייד לא תקין (חייב להתחיל ב-05)';
                return null;
            }
        },

        // Email
        email: {
            validate: (value) => {
                if (!value) return null;
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'כתובת אימייל לא תקינה';
                return null;
            }
        },

        // Date: DD/MM/YYYY
        date: {
            validate: (value) => {
                if (!value) return null;

                // Allow various formats
                const cleaned = value.replace(/[\.\-]/g, '/');
                const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

                if (!match) return 'תאריך לא תקין (פורמט: DD/MM/YYYY)';

                const [, d, m, y] = match;
                const day = parseInt(d);
                const month = parseInt(m);
                const year = parseInt(y.length === 2 ? (parseInt(y) > 50 ? '19' + y : '20' + y) : y);

                if (month < 1 || month > 12) return 'חודש לא תקין';
                if (day < 1 || day > 31) return 'יום לא תקין';

                // Check valid date
                const date = new Date(year, month - 1, day);
                if (date.getDate() !== day || date.getMonth() !== month - 1) {
                    return 'תאריך לא קיים';
                }

                return null;
            }
        },

        // Bank account: 6-9 digits
        bank_account: {
            validate: (value) => {
                const cleaned = value.replace(/\D/g, '');
                if (!cleaned) return null;
                if (!/^\d{6,9}$/.test(cleaned)) return 'מספר חשבון בנק לא תקין (6-9 ספרות)';
                return null;
            }
        },

        // Bank branch: 3-4 digits
        bank_branch: {
            validate: (value) => {
                const cleaned = value.replace(/\D/g, '');
                if (!cleaned) return null;
                if (!/^\d{3,4}$/.test(cleaned)) return 'מספר סניף לא תקין (3-4 ספרות)';
                return null;
            }
        },

        // Postal code: 7 digits
        postal_code: {
            validate: (value) => {
                const cleaned = value.replace(/\D/g, '');
                if (!cleaned) return null;
                if (!/^\d{7}$/.test(cleaned)) return 'מיקוד לא תקין (7 ספרות)';
                return null;
            }
        },

        // Number only
        number: {
            validate: (value) => {
                if (!value) return null;
                if (!/^\d+$/.test(value.replace(/[\s\.\,]/g, ''))) return 'יש להזין מספרים בלבד';
                return null;
            }
        },

        // Hebrew text only
        hebrew: {
            validate: (value) => {
                if (!value) return null;
                if (!/^[\u0590-\u05FF\s\.\-\'\"]+$/.test(value)) return 'יש להזין טקסט בעברית בלבד';
                return null;
            }
        }
    };

    // ========================================
    // Infer Format from Canonical Name
    // ========================================
    function inferFormatFromCanonical(canonical) {
        if (!canonical) return null;

        const c = canonical.toLowerCase();

        if (c.includes('id_number') || c.includes('israeli_id') || c === 'tz' || c === 'id') {
            return 'israeli_id';
        }
        if (c.includes('mobile') || c.includes('cellular')) {
            return 'mobile';
        }
        if (c.includes('phone') || c.includes('tel')) {
            return 'phone';
        }
        if (c.includes('email') || c.includes('mail')) {
            return 'email';
        }
        if (c.includes('date') || c.includes('birth') || c.includes('start') || c.includes('end')) {
            return 'date';
        }
        if (c.includes('bank_account') || c.includes('account_number')) {
            return 'bank_account';
        }
        if (c.includes('branch')) {
            return 'bank_branch';
        }
        if (c.includes('postal') || c.includes('zip')) {
            return 'postal_code';
        }

        return null;
    }

    // ========================================
    // Main Validation Function
    // ========================================
    function validateBeforeExport() {
        const state = window.MobileFillStateStore?.state;
        const fields = state?.mappingState?.fields || [];
        const values = state?.liveFillState?.liveFillData || {};

        const errors = [];

        for (const field of fields) {
            const fieldId = field.id || field.fieldId;
            const fieldType = (field.type || 'text').toLowerCase();

            // Skip non-text fields for value validation
            if (fieldType === 'checkbox' || fieldType === 'radio') continue;

            const entry = values[fieldId];
            const value = entry?.value ? String(entry.value).trim() : '';
            const rules = field.rules || {};

            // Get field label for error messages
            const label = field.label_he || field.label_en || field.canonical || fieldId;

            // ========================================
            // Required Field Check
            // ========================================
            if (rules.required && !value) {
                errors.push({
                    fieldId,
                    type: 'required',
                    message: `${label} - שדה חובה`,
                    label
                });
                continue; // Don't check format if empty
            }

            // ========================================
            // Format Validation
            // ========================================
            if (value) {
                // Explicit format rule
                let format = rules.format;

                // Infer format from canonical if not specified
                if (!format && field.canonical) {
                    format = inferFormatFromCanonical(field.canonical);
                }

                if (format && formatValidators[format]) {
                    const errorMsg = formatValidators[format].validate(value);
                    if (errorMsg) {
                        errors.push({
                            fieldId,
                            type: 'format',
                            message: `${label} - ${errorMsg}`,
                            label
                        });
                    }
                }
            }
        }

        // ========================================
        // Cross-Field Logic Validation
        // ========================================
        const logicErrors = validateCrossFieldLogic(fields, values);
        errors.push(...logicErrors);

        return errors;
    }

    // ========================================
    // Cross-Field Logic Validation
    // ========================================
    function validateCrossFieldLogic(fields, values) {
        const errors = [];

        // Helper to find value by canonical name
        const findValue = (canonical) => {
            const field = fields.find(f => f.canonical === canonical);
            if (!field) return null;
            const fieldId = field.id || field.fieldId;
            return values[fieldId]?.value || null;
        };

        const findField = (canonical) => {
            return fields.find(f => f.canonical === canonical);
        };

        // ========================================
        // End date must be after start date
        // ========================================
        const startDate = findValue('employment_start_date') || findValue('start_date');
        const endDate = findValue('employment_end_date') || findValue('end_date');

        if (startDate && endDate) {
            const start = parseDate(startDate);
            const end = parseDate(endDate);

            if (start && end && end < start) {
                const endField = findField('employment_end_date') || findField('end_date');
                if (endField) {
                    errors.push({
                        fieldId: endField.id || endField.fieldId,
                        type: 'logic',
                        message: 'תאריך סיום חייב להיות אחרי תאריך התחלה',
                        label: endField.label_he || 'תאריך סיום'
                    });
                }
            }
        }

        // ========================================
        // If bank account exists, branch is required
        // ========================================
        const bankAccount = findValue('bank_account') || findValue('account_number');
        const bankBranch = findValue('bank_branch') || findValue('branch_number');

        if (bankAccount && !bankBranch) {
            const branchField = findField('bank_branch') || findField('branch_number');
            if (branchField) {
                errors.push({
                    fieldId: branchField.id || branchField.fieldId,
                    type: 'logic',
                    message: 'יש להזין מספר סניף כאשר מספר חשבון קיים',
                    label: branchField.label_he || 'מספר סניף'
                });
            }
        }

        return errors;
    }

    // ========================================
    // Date Parsing Helper
    // ========================================
    function parseDate(value) {
        if (!value) return null;

        const cleaned = value.replace(/[\.\-]/g, '/');
        const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

        if (!match) return null;

        const [, d, m, y] = match;
        const year = parseInt(y.length === 2 ? (parseInt(y) > 50 ? '19' + y : '20' + y) : y);

        return new Date(year, parseInt(m) - 1, parseInt(d));
    }

    // ========================================
    // Get Validation Summary
    // ========================================
    function getValidationSummary(errors) {
        if (!errors || errors.length === 0) {
            return { valid: true, message: null };
        }

        const requiredCount = errors.filter(e => e.type === 'required').length;
        const formatCount = errors.filter(e => e.type === 'format').length;
        const logicCount = errors.filter(e => e.type === 'logic').length;

        let message = 'נמצאו שגיאות:';
        if (requiredCount > 0) message += ` ${requiredCount} שדות חובה חסרים`;
        if (formatCount > 0) message += ` ${formatCount} שגיאות פורמט`;
        if (logicCount > 0) message += ` ${logicCount} בעיות לוגיות`;

        return {
            valid: false,
            message,
            total: errors.length,
            byType: { required: requiredCount, format: formatCount, logic: logicCount }
        };
    }

    // ========================================
    // Validate Single Field
    // ========================================
    function validateField(field, value) {
        const fieldType = (field.type || 'text').toLowerCase();
        if (fieldType === 'checkbox' || fieldType === 'radio') return null;

        const rules = field.rules || {};
        const trimmedValue = value ? String(value).trim() : '';

        // Required check
        if (rules.required && !trimmedValue) {
            return 'שדה חובה';
        }

        // Format check
        if (trimmedValue) {
            let format = rules.format;
            if (!format && field.canonical) {
                format = inferFormatFromCanonical(field.canonical);
            }

            if (format && formatValidators[format]) {
                return formatValidators[format].validate(trimmedValue);
            }
        }

        return null;
    }

    // ========================================
    // Public API
    // ========================================
    window.MobileFillValidation = {
        validateBeforeExport,
        validateField,
        getValidationSummary,
        isValidIsraeliId,
        formatValidators
    };

    console.log('[MobileFill] Validation engine initialized');
})();
