/**
 * Smart Type Classifier - Automatic Field Type Detection (Step 4)
 *
 * This module provides intelligent field type classification based on:
 * - Field geometry (size, aspect ratio)
 * - Text labels (Hebrew keyword detection)
 * - Group structures (radio/checkbox groups)
 *
 * NOTE: All functions are pure - they receive field data and return classification results.
 * User overrides are always respected.
 */
(function() {
    'use strict';

    // ============ CONFIGURATION ============

    /**
     * Size thresholds for checkbox/radio detection (in pixels)
     */
    const CHECKBOX_SIZE_MIN = 8;
    const CHECKBOX_SIZE_MAX = 30;
    const ASPECT_RATIO_TOLERANCE = 0.3; // Allow 30% deviation from square

    /**
     * Hebrew keyword mappings for type detection
     * Order matters - more specific patterns should come first
     */
    const HEBREW_TYPE_KEYWORDS = [
        // Date patterns
        { keywords: ['תאריך', 'לידה', 'הנפקה', 'תוקף'], type: 'date' },

        // ID/Number patterns
        { keywords: ['ת.ז', 'ת"ז', 'תעודת זהות', 'זהות', 'מספר זהות', 'ת.ז.'], type: 'id_number' },

        // Phone patterns
        { keywords: ['טלפון', 'נייד', 'פלאפון', 'סלולרי', 'טל.', 'טל\''], type: 'phone' },

        // Email patterns
        { keywords: ['דוא"ל', 'דואל', 'אימייל', 'מייל', 'email', 'דוא״ל'], type: 'email' },

        // Address patterns
        { keywords: ['כתובת', 'רחוב', 'עיר', 'מיקוד', 'יישוב', 'ישוב'], type: 'address' },

        // Signature patterns
        { keywords: ['חתימה', 'חתימת', 'חתום'], type: 'signature' },

        // Name patterns (generic text)
        { keywords: ['שם', 'משפחה', 'פרטי'], type: 'text' }
    ];

    // ============ GEOMETRY-BASED CLASSIFICATION ============

    /**
     * Classify field type based on its geometry (size and shape)
     * Used immediately after Step 1 rectangle creation
     *
     * @param {Object} field - Field object with bbox or dimension info
     * @param {Object} containerDimensions - Optional container dimensions for percentage conversion
     * @returns {Object} Classification result { type: string, confidence: number, source: 'geometry' }
     */
    function classifyFieldByGeometry(field, containerDimensions = null) {
        let width, height;

        // Extract dimensions from field
        if (field.pdfWidth !== undefined && field.pdfHeight !== undefined) {
            width = field.pdfWidth;
            height = field.pdfHeight;
        } else if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            // bbox can be normalized (0-1) or absolute
            let [bboxX, bboxY, bboxW, bboxH] = field.bbox;

            // Check if normalized (0-1 range)
            if (bboxW <= 1 && bboxH <= 1 && containerDimensions) {
                width = bboxW * containerDimensions.width;
                height = bboxH * containerDimensions.height;
            } else {
                width = bboxW;
                height = bboxH;
            }
        } else if (field.overlayWidth && field.overlayHeight) {
            width = field.overlayWidth;
            height = field.overlayHeight;
        }

        // Cannot classify without dimensions
        if (!width || !height || width <= 0 || height <= 0) {
            return { type: 'text', confidence: 0.3, source: 'geometry', reason: 'no_dimensions' };
        }

        // Calculate aspect ratio (1.0 = perfect square)
        const aspectRatio = Math.min(width, height) / Math.max(width, height);
        const isSquarish = aspectRatio >= (1 - ASPECT_RATIO_TOLERANCE);

        // Check if dimensions fall within checkbox/radio range
        const isSmall = (width >= CHECKBOX_SIZE_MIN && width <= CHECKBOX_SIZE_MAX) &&
                        (height >= CHECKBOX_SIZE_MIN && height <= CHECKBOX_SIZE_MAX);

        // Small square = checkbox candidate
        if (isSmall && isSquarish) {
            return {
                type: 'checkbox',
                confidence: 0.8,
                source: 'geometry',
                reason: 'small_square',
                dimensions: { width, height, aspectRatio }
            };
        }

        // Small but not perfectly square - might still be checkbox
        if (isSmall) {
            return {
                type: 'checkbox',
                confidence: 0.6,
                source: 'geometry',
                reason: 'small_rectangle',
                dimensions: { width, height, aspectRatio }
            };
        }

        // Signature detection: Wide and short
        const signatureAspect = width / height;
        if (signatureAspect >= 3 && height >= 20 && height <= 60) {
            return {
                type: 'signature',
                confidence: 0.7,
                source: 'geometry',
                reason: 'wide_short_box',
                dimensions: { width, height, aspectRatio: signatureAspect }
            };
        }

        // Default to text for larger fields
        return {
            type: 'text',
            confidence: 0.5,
            source: 'geometry',
            reason: 'default_size',
            dimensions: { width, height, aspectRatio }
        };
    }

    // ============ TEXT-BASED CLASSIFICATION ============

    /**
     * Normalize Hebrew label for matching
     * Removes common suffixes, punctuation, and normalizes spaces
     *
     * @param {string} label - Hebrew label text
     * @returns {string} Normalized label
     */
    function normalizeForMatching(label) {
        if (!label) return '';

        return label
            .trim()
            .toLowerCase()
            // Remove RTL marks
            .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
            // Remove punctuation except apostrophes in Hebrew
            .replace(/[:\*\.\,\!\?]/g, '')
            // Normalize spaces
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Classify field type based on its Hebrew label
     * Used after Step 2 text selection
     *
     * @param {Object} field - Field object with label_he or hebrewName
     * @returns {Object} Classification result { type: string, confidence: number, source: 'label', matchedKeyword: string }
     */
    function classifyFieldByLabel(field) {
        // Get the Hebrew label
        const label = field.hebrewName || field.label_he || '';

        if (!label || label.trim() === '') {
            return { type: null, confidence: 0, source: 'label', reason: 'no_label' };
        }

        const normalizedLabel = normalizeForMatching(label);

        // Check each keyword group
        for (const group of HEBREW_TYPE_KEYWORDS) {
            for (const keyword of group.keywords) {
                const normalizedKeyword = normalizeForMatching(keyword);

                if (normalizedLabel.includes(normalizedKeyword)) {
                    return {
                        type: group.type,
                        confidence: 0.9,
                        source: 'label',
                        matchedKeyword: keyword,
                        originalLabel: label
                    };
                }
            }
        }

        // No keyword match - don't change type
        return {
            type: null,
            confidence: 0,
            source: 'label',
            reason: 'no_keyword_match',
            originalLabel: label
        };
    }

    // ============ GROUP-BASED CLASSIFICATION ============

    /**
     * Classify option group type (radio vs checkbox)
     * Used after Step 3 group creation
     *
     * @param {Object} group - OptionGroup object with options array
     * @param {Array} fields - All fields array to look up option dimensions
     * @returns {Object} Classification result { type: 'radio'|'checkbox', confidence: number, source: 'group' }
     */
    function classifyGroup(group, fields = []) {
        if (!group || !group.options || group.options.length === 0) {
            return { type: 'radio', confidence: 0.5, source: 'group', reason: 'default' };
        }

        let checkboxLikeCount = 0;
        let radioLikeCount = 0;
        let totalAnalyzed = 0;

        // Analyze each option's field
        for (const option of group.options) {
            const field = fields.find(f => f.id === option.fieldId);
            if (!field) continue;

            const geoResult = classifyFieldByGeometry(field);
            totalAnalyzed++;

            // Count checkbox-like vs radio-like shapes
            if (geoResult.dimensions) {
                const { aspectRatio } = geoResult.dimensions;

                // Perfect squares are more likely checkboxes
                if (aspectRatio >= 0.95) {
                    checkboxLikeCount++;
                } else {
                    radioLikeCount++;
                }
            }
        }

        // If most options are perfect squares, likely checkbox group
        if (totalAnalyzed > 0) {
            const checkboxRatio = checkboxLikeCount / totalAnalyzed;

            if (checkboxRatio >= 0.7) {
                return {
                    type: 'checkbox',
                    confidence: 0.8,
                    source: 'group',
                    reason: 'square_options',
                    stats: { checkboxLikeCount, radioLikeCount, totalAnalyzed }
                };
            }
        }

        // Default to radio (most common for option groups)
        return {
            type: 'radio',
            confidence: 0.7,
            source: 'group',
            reason: 'default_radio',
            stats: { checkboxLikeCount, radioLikeCount, totalAnalyzed }
        };
    }

    // ============ COMBINED SMART CLASSIFICATION ============

    /**
     * Apply smart classification to a field
     * Runs geometry → label → respects user override
     *
     * @param {Object} field - Field object
     * @param {Object} options - Options { containerDimensions, preserveUserOverride }
     * @returns {Object} Final classification { type: string, confidence: number, sources: array }
     */
    function applySmartClassification(field, options = {}) {
        const { containerDimensions = null, preserveUserOverride = true } = options;

        // Check for user override
        if (preserveUserOverride && field.typeOverriddenByUser) {
            return {
                type: field.type,
                confidence: 1.0,
                sources: ['user_override'],
                preserved: true
            };
        }

        const results = [];
        let finalType = 'text';
        let highestConfidence = 0;

        // Step 1: Geometry-based classification
        const geoResult = classifyFieldByGeometry(field, containerDimensions);
        results.push(geoResult);

        if (geoResult.confidence > highestConfidence) {
            highestConfidence = geoResult.confidence;
            finalType = geoResult.type;
        }

        // Step 2: Label-based classification (higher priority if matched)
        const labelResult = classifyFieldByLabel(field);
        results.push(labelResult);

        // Label classification overrides geometry if it has a match
        if (labelResult.type && labelResult.confidence > 0) {
            // Special case: Don't override checkbox/radio with text just because of name keywords
            if (!(finalType === 'checkbox' || finalType === 'radio') ||
                (labelResult.type !== 'text')) {
                finalType = labelResult.type;
                highestConfidence = labelResult.confidence;
            }
        }

        return {
            type: finalType,
            confidence: highestConfidence,
            sources: results.map(r => r.source),
            details: results
        };
    }

    /**
     * Apply classification to a field and update it in place
     *
     * @param {Object} field - Field object to classify and update
     * @param {Object} options - Classification options
     * @returns {Object} The updated field
     */
    function classifyAndUpdateField(field, options = {}) {
        const result = applySmartClassification(field, options);

        // Only update if not user-overridden
        if (!result.preserved) {
            field.type = result.type;
            field.classificationConfidence = result.confidence;
            field.classificationSources = result.sources;
        }

        return field;
    }

    /**
     * Apply classification to a group and update it in place
     *
     * @param {Object} group - OptionGroup to classify and update
     * @param {Array} fields - All fields array
     * @returns {Object} The updated group
     */
    function classifyAndUpdateGroup(group, fields = []) {
        // Don't override if user has set the type
        if (group.typeOverriddenByUser) {
            return group;
        }

        const result = classifyGroup(group, fields);

        group.type = result.type;
        group.classificationConfidence = result.confidence;
        group.classificationSource = result.source;

        // Update all options in the group to match
        if (group.options) {
            group.options.forEach(option => {
                const field = fields.find(f => f.id === option.fieldId);
                if (field && !field.typeOverriddenByUser) {
                    field.type = result.type;
                }
            });
        }

        return group;
    }

    // ============ VALIDATION ============

    /**
     * Validate field classification and add warnings if needed
     * Used during JSON export
     *
     * @param {Object} field - Field to validate
     * @returns {Object} Validation result { valid: boolean, warnings: array }
     */
    function validateFieldClassification(field) {
        const warnings = [];

        // Check if field has a type
        if (!field.type) {
            warnings.push('missing_type');
        }

        // Check if classification confidence is low
        if (field.classificationConfidence && field.classificationConfidence < 0.5) {
            warnings.push('low_confidence');
        }

        // Check for potential misclassification
        if (field.type === 'text' && !field.classificationSources) {
            warnings.push('unclassified');
        }

        return {
            valid: warnings.length === 0,
            warnings
        };
    }

    // ============ EXPORT ============

    window.TypeClassifier = {
        // Core classification functions
        classifyFieldByGeometry,
        classifyFieldByLabel,
        classifyGroup,
        applySmartClassification,

        // Update functions
        classifyAndUpdateField,
        classifyAndUpdateGroup,

        // Utilities
        normalizeForMatching,
        validateFieldClassification,

        // Configuration (read-only exposure)
        config: {
            CHECKBOX_SIZE_MIN,
            CHECKBOX_SIZE_MAX,
            ASPECT_RATIO_TOLERANCE,
            HEBREW_TYPE_KEYWORDS
        }
    };

    console.log('%c🧠 Type Classifier Module Loaded (Step 4)', 'background: #9C27B0; color: white; font-size: 14px; padding: 5px;');
})();
