/**
 * Entity Groups - Logical grouping of related fields
 *
 * Used to improve matching accuracy by:
 * 1. Identifying which fields belong together (e.g., employee info)
 * 2. Helping disambiguate similar fields (e.g., employee phone vs employer phone)
 * 3. Enabling "smart fill" features (fill related fields together)
 *
 * Each entity has:
 * - canonicalFields: Array of field names from synonyms.js that belong to this entity
 * - contextHints: Words/phrases that help identify this entity in Excel headers
 * - priority: Higher priority entities are matched first (for disambiguation)
 */
(function() {
    'use strict';

    const ENTITY_GROUPS = {

        // === Employee (Person being processed) ===
        employee: {
            label: 'עובד',
            label_en: 'Employee',
            priority: 100,
            canonicalFields: [
                'id_number',
                'first_name',
                'last_name',
                'full_name',
                'birth_date',
                'phone_mobile',
                'phone',
                'phone_landline',
                'email',
                'gender',
                'marital_status'
            ],
            contextHints: [
                'עובד', 'מועסק', 'עמית', 'נישום', 'מבוטח',
                'employee', 'worker', 'member', 'insured'
            ]
        },

        // === Employer (Company/Business) ===
        employer: {
            label: 'מעסיק',
            label_en: 'Employer',
            priority: 90,
            canonicalFields: [
                'company_name',
                'company_id',
                'phone',
                'email'
            ],
            contextHints: [
                'מעסיק', 'חברה', 'עסק', 'מפעל', 'תאגיד',
                'employer', 'company', 'business', 'corp', 'organization'
            ]
        },

        // === Address (Location details) ===
        address: {
            label: 'כתובת',
            label_en: 'Address',
            priority: 70,
            canonicalFields: [
                'street',
                'house_number',
                'city',
                'zip_code'
            ],
            contextHints: [
                'כתובת', 'מען', 'מגורים', 'מיקום',
                'address', 'location', 'residence'
            ],
            // Sub-entities for disambiguation
            subEntities: {
                home: {
                    label: 'כתובת מגורים',
                    contextHints: ['מגורים', 'בית', 'home', 'residence']
                },
                work: {
                    label: 'כתובת עבודה',
                    contextHints: ['עבודה', 'משרד', 'work', 'office']
                }
            }
        },

        // === Bank (Banking details) ===
        bank: {
            label: 'פרטי בנק',
            label_en: 'Bank Details',
            priority: 80,
            canonicalFields: [
                'bank_name',
                'bank_code',
                'bank_branch',
                'bank_account'
            ],
            contextHints: [
                'בנק', 'חשבון', 'פרטי תשלום',
                'bank', 'account', 'payment'
            ]
        },

        // === Employment (Job details) ===
        employment: {
            label: 'פרטי העסקה',
            label_en: 'Employment Details',
            priority: 85,
            canonicalFields: [
                'start_date',
                'end_date',
                'job_title',
                'salary',
                'salary_gross',
                'salary_net'
            ],
            contextHints: [
                'העסקה', 'עבודה', 'משרה', 'תפקיד',
                'employment', 'job', 'position', 'work'
            ]
        },

        // === Income Types (Form 101 specific) ===
        income: {
            label: 'סוג הכנסה',
            label_en: 'Income Type',
            priority: 75,
            canonicalFields: [
                'income_type_monthly',
                'income_type_partial',
                'income_type_additional'
            ],
            contextHints: [
                'הכנסה', 'משכורת', 'שכר', 'תשלום',
                'income', 'salary', 'payment'
            ]
        },

        // === Family (Spouse/Children) ===
        family: {
            label: 'פרטי משפחה',
            label_en: 'Family Details',
            priority: 60,
            canonicalFields: [
                'spouse_name',
                'spouse_id',
                'children_count'
            ],
            contextHints: [
                'משפחה', 'בן זוג', 'בת זוג', 'ילדים',
                'family', 'spouse', 'partner', 'children'
            ]
        },

        // === Tax (Tax-related fields) ===
        tax: {
            label: 'מס',
            label_en: 'Tax',
            priority: 65,
            canonicalFields: [
                'tax_credit_points',
                'resident_status'
            ],
            contextHints: [
                'מס', 'זיכוי', 'ניכוי', 'תושבות',
                'tax', 'credit', 'deduction', 'resident'
            ]
        },

        // === Signature (Signature and dates) ===
        signature: {
            label: 'חתימה',
            label_en: 'Signature',
            priority: 50,
            canonicalFields: [
                'signature',
                'signature_date',
                'date'
            ],
            contextHints: [
                'חתימה', 'אישור', 'תאריך',
                'signature', 'sign', 'date', 'confirm'
            ]
        }
    };

    /**
     * Find which entity a canonical field belongs to
     * @param {string} canonicalField - Field name from synonyms.js
     * @returns {Object|null} Entity info or null
     */
    function findEntityForField(canonicalField) {
        for (const [entityName, entity] of Object.entries(ENTITY_GROUPS)) {
            if (entity.canonicalFields.includes(canonicalField)) {
                return {
                    entity: entityName,
                    label: entity.label,
                    label_en: entity.label_en,
                    priority: entity.priority
                };
            }
        }
        return null;
    }

    /**
     * Detect entity from header text using context hints
     * @param {string} headerText - Excel column header
     * @returns {Array} Array of possible entities, sorted by relevance
     */
    function detectEntityFromHeader(headerText) {
        if (!headerText) return [];

        const text = String(headerText).toLowerCase().trim();
        const matches = [];

        for (const [entityName, entity] of Object.entries(ENTITY_GROUPS)) {
            let score = 0;

            // Check context hints
            for (const hint of entity.contextHints) {
                if (text.includes(hint.toLowerCase())) {
                    score += 10;
                }
            }

            // Check sub-entities if present
            if (entity.subEntities) {
                for (const [subName, subEntity] of Object.entries(entity.subEntities)) {
                    for (const hint of subEntity.contextHints) {
                        if (text.includes(hint.toLowerCase())) {
                            score += 5;
                            matches.push({
                                entity: entityName,
                                subEntity: subName,
                                score: score,
                                priority: entity.priority
                            });
                        }
                    }
                }
            }

            if (score > 0) {
                matches.push({
                    entity: entityName,
                    subEntity: null,
                    score: score,
                    priority: entity.priority
                });
            }
        }

        // Sort by score (desc), then by priority (desc)
        return matches.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.priority - a.priority;
        });
    }

    /**
     * Get all fields for an entity
     * @param {string} entityName - Entity name
     * @returns {Array} Array of canonical field names
     */
    function getEntityFields(entityName) {
        const entity = ENTITY_GROUPS[entityName];
        return entity ? entity.canonicalFields : [];
    }

    /**
     * Disambiguate a field based on entity context
     * Example: "טלפון" could be employee.phone or employer.phone
     * @param {string} canonicalField - Field name
     * @param {string} headerText - Original header for context
     * @returns {Object} Disambiguated field with entity prefix
     */
    function disambiguateField(canonicalField, headerText) {
        const entityHints = detectEntityFromHeader(headerText);

        if (entityHints.length === 0) {
            // No context - use default entity (employee for personal fields)
            return {
                field: canonicalField,
                entity: 'employee',
                qualified: `employee.${canonicalField}`,
                confidence: 0.5
            };
        }

        const bestMatch = entityHints[0];

        // Check if this field belongs to the detected entity
        const entityFields = getEntityFields(bestMatch.entity);
        if (entityFields.includes(canonicalField)) {
            return {
                field: canonicalField,
                entity: bestMatch.entity,
                subEntity: bestMatch.subEntity,
                qualified: `${bestMatch.entity}.${canonicalField}`,
                confidence: Math.min(1.0, 0.5 + (bestMatch.score / 20))
            };
        }

        // Field doesn't belong to detected entity - return without entity
        return {
            field: canonicalField,
            entity: null,
            qualified: canonicalField,
            confidence: 0.3
        };
    }

    // Export for use in browser and Node.js
    if (typeof window !== 'undefined') {
        window.ENTITY_GROUPS = ENTITY_GROUPS;
        window.findEntityForField = findEntityForField;
        window.detectEntityFromHeader = detectEntityFromHeader;
        window.getEntityFields = getEntityFields;
        window.disambiguateField = disambiguateField;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ENTITY_GROUPS,
            findEntityForField,
            detectEntityFromHeader,
            getEntityFields,
            disambiguateField
        };
    }

})();
