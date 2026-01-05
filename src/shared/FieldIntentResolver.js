/**
 * FieldIntentResolver.js
 *
 * SINGLE SOURCE OF TRUTH for determining how to render a field/cell.
 * Used by both Export Engine and LiveFill preview to ensure consistency.
 *
 * ============================================
 * GENERIC, FORM-AGNOSTIC DESIGN
 * ============================================
 *
 * This module does NOT know what "ID number", "phone", "date", or "account" is.
 * It only knows:
 * - Intent (perGlyphBoxes vs flowText)
 * - BBox shape
 * - Value pattern (consecutive digits)
 * - renderHint (if explicit from mapping)
 *
 * Decision logic:
 * - perGlyphBoxes: BBox shows boxes OR 6-20 consecutive digits OR explicit renderHint
 * - flowText: Everything else
 */

(function() {
    'use strict';

    // ========================================
    // CONFIGURATION CONSTANTS
    // ========================================

    const DEBUG = false; // Set to true for detailed logging

    // Confidence thresholds
    const CONFIDENCE_HIGH = 0.85;
    const CONFIDENCE_MEDIUM = 0.65;
    const CONFIDENCE_LOW = 0.4;

    // Generic digit range for perGlyphBoxes (form-agnostic)
    const MIN_DIGITS_FOR_BOXES = 6;
    const MAX_DIGITS_FOR_BOXES = 20;

    // BBox shape detection thresholds
    const MIN_BOX_COUNT = 6;
    const MAX_BOX_COUNT = 20;

    // Explicit type mappings that force perGlyphBoxes (GENERIC ONLY - no field semantics)
    const EXPLICIT_BOX_TYPES = [
        'digitBoxes', 'boxes', 'perGlyphBoxes'
    ];

    // ========================================
    // MAIN RESOLVER FUNCTION
    // ========================================

    /**
     * Resolves the rendering intent for a field or table cell.
     *
     * GENERIC LOGIC:
     * 1. renderHint (explicit) → use as-is
     * 2. BBox shape shows boxes → perGlyphBoxes
     * 3. Value is 6-20 consecutive digits → perGlyphBoxes
     * 4. Otherwise → flowText
     *
     * @param {Object} params
     * @param {string|number|null} params.value - The value to render
     * @param {Object} params.fieldMeta - Field metadata
     * @param {Object} params.bbox - Normalized bbox {x, y, width, height} (0-1 values)
     * @param {string} params.context - 'standalone' | 'table'
     * @returns {Object} { intent, expectedLength, confidence, reason }
     */
    function resolveRenderIntent(params) {
        const { value, fieldMeta = {}, bbox, context = 'standalone' } = params;

        const reasons = [];
        let intent = 'flowText';
        let expectedLength = null;
        let confidence = 0;

        // ========================================
        // SPECIAL TYPES: checkbox/radio
        // ========================================
        const fieldType = (fieldMeta.type || '').toLowerCase();
        if (fieldType === 'checkbox') {
            return { intent: 'checkbox', expectedLength: null, confidence: 1.0, reason: ['type: checkbox'] };
        }
        if (fieldType === 'radio') {
            return { intent: 'radio', expectedLength: null, confidence: 1.0, reason: ['type: radio'] };
        }

        // ========================================
        // RULE 0: Explicit renderHint (HIGHEST PRIORITY)
        // ========================================
        if (fieldMeta.renderHint && fieldMeta.renderHint.intent) {
            if (DEBUG) console.log('[IntentResolver] Rule 0: explicit renderHint:', fieldMeta.renderHint);
            return {
                intent: fieldMeta.renderHint.intent,
                expectedLength: fieldMeta.renderHint.expectedLength || null,
                confidence: fieldMeta.renderHint.confidence || 1.0,
                reason: ['Rule 0: explicit renderHint from mapping']
            };
        }

        // ========================================
        // RULE A: Explicit box type in metadata
        // ========================================
        if (EXPLICIT_BOX_TYPES.includes(fieldType)) {
            reasons.push(`Rule A: explicit box type "${fieldType}"`);
            intent = 'perGlyphBoxes';
            confidence = 0.95;

            // Try to get expectedLength from bbox
            if (bbox && bbox.width && bbox.height && bbox.height > 0) {
                const approxBoxes = Math.round(bbox.width / bbox.height);
                if (approxBoxes >= MIN_BOX_COUNT && approxBoxes <= MAX_BOX_COUNT) {
                    expectedLength = approxBoxes;
                    reasons.push(`bbox suggests ${approxBoxes} boxes`);
                }
            }

            if (DEBUG) console.log('[IntentResolver] Rule A:', { intent, expectedLength, confidence, reasons });
            return { intent, expectedLength, confidence, reason: reasons };
        }

        // ========================================
        // RULE B: BBox shape - REMOVED
        // ========================================
        // BBox shape detection was unreliable - can't distinguish between:
        // - A wide text field (name) with ratio 10.6
        // - A 9-digit ID field with ratio 9
        // Now relying ONLY on: renderHint, explicit type, or value pattern
        let bboxBoxCount = null;
        if (bbox && bbox.width && bbox.height && bbox.height > 0) {
            bboxBoxCount = Math.round(bbox.width / bbox.height);
        }

        // ========================================
        // RULE C: Value pattern detection (GENERIC)
        // ========================================
        let valueConfidence = 0;
        let valueLength = null;

        if (value !== null && value !== undefined && value !== '') {
            const strValue = String(value);
            const digitsOnly = strValue.replace(/\D/g, '');
            const digitCount = digitsOnly.length;

            // GENERIC CHECK: 6-20 consecutive digits → perGlyphBoxes
            if (digitCount >= MIN_DIGITS_FOR_BOXES && digitCount <= MAX_DIGITS_FOR_BOXES) {
                // Check if value is mostly digits (>= 80% digits)
                const cleanLength = strValue.replace(/[\s\-\/\.]/g, '').length || 1;
                const digitRatio = digitsOnly.length / cleanLength;

                if (digitRatio >= 0.8) {
                    // HIGH confidence - 6-20 digits is definitive perGlyphBoxes
                    valueConfidence = 0.7;
                    valueLength = digitCount;
                    reasons.push(`Rule C: value has ${digitCount} digits (${(digitRatio * 100).toFixed(0)}% numeric) → perGlyphBoxes`);
                }
            }
        }

        // ========================================
        // COMBINE CONFIDENCES (GENERIC)
        // ========================================
        // Now simplified: only value pattern matters
        // renderHint and explicit type are handled above

        let combinedConfidence = valueConfidence;

        // Cap at 0.95
        combinedConfidence = Math.min(combinedConfidence, 0.95);

        // ========================================
        // DECISION (GENERIC)
        // ========================================

        if (combinedConfidence >= CONFIDENCE_MEDIUM) {
            intent = 'perGlyphBoxes';
            confidence = combinedConfidence;
            expectedLength = valueLength || bboxBoxCount || null;
        } else {
            intent = 'flowText';
            confidence = 1 - combinedConfidence;
            expectedLength = null;
            if (reasons.length === 0) {
                reasons.push('No box indicators, defaulting to flowText');
            } else {
                reasons.push(`Confidence ${combinedConfidence.toFixed(2)} < threshold ${CONFIDENCE_MEDIUM}`);
            }
        }

        if (DEBUG) {
            console.log('[IntentResolver] Result:', {
                intent, expectedLength, confidence: confidence.toFixed(2),
                reasons,
                inputs: { value, fieldType, bbox, context }
            });
        }

        return { intent, expectedLength, confidence, reason: reasons };
    }

    // ========================================
    // HELPER: Check if value is purely numeric
    // ========================================
    function isPureDigits(value) {
        if (value === null || value === undefined || value === '') return false;
        return /^[0-9]+$/.test(String(value));
    }

    // ========================================
    // HELPER: Extract digits from value
    // ========================================
    function extractDigits(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/\D/g, '');
    }

    // ========================================
    // HELPER: Calculate expected box count from bbox
    // ========================================
    function calculateBoxCountFromBBox(bbox) {
        if (!bbox || !bbox.width || !bbox.height || bbox.height <= 0) return null;
        const ratio = bbox.width / bbox.height;
        if (ratio >= MIN_BOX_COUNT && ratio <= MAX_BOX_COUNT) {
            return Math.round(ratio);
        }
        return null;
    }

    // ========================================
    // EXPORT
    // ========================================

    const FieldIntentResolver = {
        resolveRenderIntent,
        isPureDigits,
        extractDigits,
        calculateBoxCountFromBBox,

        // Constants for external use
        CONFIDENCE_HIGH,
        CONFIDENCE_MEDIUM,
        CONFIDENCE_LOW,
        MIN_DIGITS_FOR_BOXES,
        MAX_DIGITS_FOR_BOXES,

        // Enable/disable debug
        setDebug: function(enabled) {
            console.log('[IntentResolver] Debug mode:', enabled ? 'ON' : 'OFF');
        }
    };

    // UMD export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = FieldIntentResolver;
    } else if (typeof window !== 'undefined') {
        window.FieldIntentResolver = FieldIntentResolver;
    }

})();
