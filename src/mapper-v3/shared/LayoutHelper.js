/**
 * LayoutHelper.js
 *
 * Safe accessor utilities for field/column layout properties.
 * Provides backward-compatible access to layout data with guaranteed
 * non-throwing behavior on missing or malformed data.
 *
 * DESIGN PRINCIPLES:
 * 1. Never throw errors - always return safe defaults
 * 2. Support both new `layout` object and legacy `renderHint`
 * 3. Work identically for standalone fields AND table columns
 * 4. Provide clear source tracking for debugging
 *
 * Usage:
 *   const layout = getFieldLayout(field);
 *   if (layout.mode === 'slots') { ... }
 */

(function() {
    'use strict';

    // ========================================
    // CONSTANTS
    // ========================================

    /**
     * Layout rendering modes
     */
    const LAYOUT_MODES = {
        FLOW: 'flow',     // Free-flowing text (names, addresses, etc.)
        SLOTS: 'slots'    // Character-per-box (ID numbers, dates, phones)
    };

    /**
     * Overflow behavior when content exceeds bbox
     */
    const OVERFLOW_MODES = {
        SHRINK: 'shrink', // Reduce font size to fit
        CLIP: 'clip'      // Cut off at boundary
    };

    /**
     * Source of layout decision (for debugging/tracking)
     */
    const LAYOUT_SOURCES = {
        EXPLICIT: 'explicit',           // User set via Mapper UI
        LEGACY_RENDER_HINT: 'legacy_renderHint', // Old renderHint format
        AUTO_DETECTED: 'auto_detected', // System detected from bbox/value
        DEFAULT: 'default'              // No data, using safe default
    };

    /**
     * Default layout object - returned when no layout data exists
     * This is the SAFEST default: flow text with shrink overflow
     */
    const DEFAULT_LAYOUT = Object.freeze({
        mode: LAYOUT_MODES.FLOW,
        slotCount: null,
        overflow: OVERFLOW_MODES.SHRINK,
        source: LAYOUT_SOURCES.DEFAULT
    });

    // ========================================
    // MAIN ACCESSOR FUNCTIONS
    // ========================================

    /**
     * Get layout configuration for a field or table column.
     * SAFE: Never throws, always returns valid layout object.
     *
     * Priority:
     * 1. New `layout` object (if exists and valid)
     * 2. Legacy `renderHint` object (backward compatibility)
     * 3. Default flow layout (safest fallback)
     *
     * @param {Object|null|undefined} fieldOrColumn - Field or column object
     * @returns {Object} Layout object with guaranteed structure:
     *   { mode: 'flow'|'slots', slotCount: number|null, overflow: string, source: string }
     */
    function getFieldLayout(fieldOrColumn) {
        // Case 1: No input at all - return default
        if (!fieldOrColumn) {
            return { ...DEFAULT_LAYOUT };
        }

        // Case 2: New layout object exists (preferred format)
        if (fieldOrColumn.layout && typeof fieldOrColumn.layout === 'object') {
            const layout = fieldOrColumn.layout;

            // Validate mode is one of our known modes
            const mode = (layout.mode === LAYOUT_MODES.SLOTS)
                ? LAYOUT_MODES.SLOTS
                : LAYOUT_MODES.FLOW;

            return {
                mode: mode,
                slotCount: (typeof layout.slotCount === 'number' && layout.slotCount > 0)
                    ? layout.slotCount
                    : null,
                overflow: (layout.overflow === OVERFLOW_MODES.CLIP)
                    ? OVERFLOW_MODES.CLIP
                    : OVERFLOW_MODES.SHRINK,
                source: layout.source || LAYOUT_SOURCES.EXPLICIT
            };
        }

        // Case 3: Legacy renderHint exists (backward compatibility)
        if (fieldOrColumn.renderHint && typeof fieldOrColumn.renderHint === 'object') {
            const hint = fieldOrColumn.renderHint;

            // Check if intent indicates slots/boxes
            const isSlots = hint.intent === 'perGlyphBoxes' ||
                           hint.intent === 'slots' ||
                           hint.intent === 'digitBoxes';

            return {
                mode: isSlots ? LAYOUT_MODES.SLOTS : LAYOUT_MODES.FLOW,
                slotCount: (typeof hint.expectedLength === 'number' && hint.expectedLength > 0)
                    ? hint.expectedLength
                    : null,
                overflow: isSlots ? OVERFLOW_MODES.CLIP : OVERFLOW_MODES.SHRINK,
                source: LAYOUT_SOURCES.LEGACY_RENDER_HINT
            };
        }

        // Case 4: No layout data - return safe default
        return { ...DEFAULT_LAYOUT };
    }

    /**
     * Check if a field/column has explicit layout data (not heuristic-based).
     * Use this to decide whether to use new layout logic or fall back to heuristics.
     *
     * @param {Object|null|undefined} fieldOrColumn - Field or column object
     * @returns {boolean} True if explicit layout exists
     */
    function hasExplicitLayout(fieldOrColumn) {
        if (!fieldOrColumn) return false;

        // Check for new layout object with valid mode
        if (fieldOrColumn.layout &&
            typeof fieldOrColumn.layout === 'object' &&
            fieldOrColumn.layout.mode) {
            return true;
        }

        // Check for legacy renderHint with valid intent
        if (fieldOrColumn.renderHint &&
            typeof fieldOrColumn.renderHint === 'object' &&
            fieldOrColumn.renderHint.intent) {
            return true;
        }

        return false;
    }

    /**
     * Check if layout mode is 'slots' (character boxes).
     * Convenience function for common check.
     *
     * @param {Object|null|undefined} fieldOrColumn - Field or column object
     * @returns {boolean} True if layout is slots mode
     */
    function isLayoutSlots(fieldOrColumn) {
        const layout = getFieldLayout(fieldOrColumn);
        return layout.mode === LAYOUT_MODES.SLOTS;
    }

    /**
     * Check if layout mode is 'flow' (free text).
     * Convenience function for common check.
     *
     * @param {Object|null|undefined} fieldOrColumn - Field or column object
     * @returns {boolean} True if layout is flow mode
     */
    function isLayoutFlow(fieldOrColumn) {
        const layout = getFieldLayout(fieldOrColumn);
        return layout.mode === LAYOUT_MODES.FLOW;
    }

    // ========================================
    // LAYOUT CREATION HELPERS
    // ========================================

    /**
     * Create a new slots layout object.
     * Use when user explicitly sets layout to slots mode.
     *
     * @param {number} slotCount - Number of character slots (default: 9)
     * @param {string} source - Layout source (default: 'explicit')
     * @returns {Object} Layout object for slots mode
     */
    function createSlotsLayout(slotCount = 9, source = LAYOUT_SOURCES.EXPLICIT) {
        return {
            mode: LAYOUT_MODES.SLOTS,
            slotCount: Math.max(1, Math.min(30, parseInt(slotCount) || 9)),
            overflow: OVERFLOW_MODES.CLIP,
            source: source
        };
    }

    /**
     * Create a new flow layout object.
     * Use when user explicitly sets layout to flow mode.
     *
     * @param {string} overflow - Overflow mode ('shrink' or 'clip', default: 'shrink')
     * @param {string} source - Layout source (default: 'explicit')
     * @returns {Object} Layout object for flow mode
     */
    function createFlowLayout(overflow = OVERFLOW_MODES.SHRINK, source = LAYOUT_SOURCES.EXPLICIT) {
        return {
            mode: LAYOUT_MODES.FLOW,
            slotCount: null,
            overflow: overflow === OVERFLOW_MODES.CLIP ? OVERFLOW_MODES.CLIP : OVERFLOW_MODES.SHRINK,
            source: source
        };
    }

    // ========================================
    // CONVERSION HELPERS
    // ========================================

    /**
     * Convert layout to legacy renderHint format.
     * Useful for backward compatibility with old code paths.
     *
     * @param {Object} layout - Layout object from getFieldLayout()
     * @returns {Object} Legacy renderHint format
     */
    function layoutToRenderHint(layout) {
        if (!layout) {
            return { intent: 'flowText', expectedLength: null };
        }

        return {
            intent: layout.mode === LAYOUT_MODES.SLOTS ? 'perGlyphBoxes' : 'flowText',
            expectedLength: layout.slotCount,
            confidence: layout.source === LAYOUT_SOURCES.EXPLICIT ? 1.0 : 0.8
        };
    }

    /**
     * Convert layout mode to rendering intent string.
     * Maps our internal mode to the intent strings used by renderers.
     *
     * @param {Object|null} fieldOrColumn - Field/column or layout object
     * @returns {string} 'perGlyphBoxes' or 'flowText'
     */
    function getIntentFromLayout(fieldOrColumn) {
        const layout = getFieldLayout(fieldOrColumn);
        return layout.mode === LAYOUT_MODES.SLOTS ? 'perGlyphBoxes' : 'flowText';
    }

    // ========================================
    // VALIDATION HELPERS
    // ========================================

    /**
     * Validate and normalize a layout object.
     * Ensures all required properties exist with valid values.
     *
     * @param {Object|null} layout - Layout object to validate
     * @returns {Object} Validated layout object
     */
    function normalizeLayout(layout) {
        if (!layout || typeof layout !== 'object') {
            return { ...DEFAULT_LAYOUT };
        }

        return {
            mode: (layout.mode === LAYOUT_MODES.SLOTS) ? LAYOUT_MODES.SLOTS : LAYOUT_MODES.FLOW,
            slotCount: (typeof layout.slotCount === 'number' && layout.slotCount > 0)
                ? Math.min(30, layout.slotCount)
                : null,
            overflow: (layout.overflow === OVERFLOW_MODES.CLIP)
                ? OVERFLOW_MODES.CLIP
                : OVERFLOW_MODES.SHRINK,
            source: layout.source || LAYOUT_SOURCES.DEFAULT
        };
    }

    // ========================================
    // EXPORT
    // ========================================

    const LayoutHelper = {
        // Constants
        MODES: LAYOUT_MODES,
        OVERFLOW: OVERFLOW_MODES,
        SOURCES: LAYOUT_SOURCES,
        DEFAULT_LAYOUT: DEFAULT_LAYOUT,

        // Main accessors
        getFieldLayout,
        hasExplicitLayout,
        isLayoutSlots,
        isLayoutFlow,

        // Creation helpers
        createSlotsLayout,
        createFlowLayout,

        // Conversion helpers
        layoutToRenderHint,
        getIntentFromLayout,

        // Validation
        normalizeLayout
    };

    // UMD export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LayoutHelper;
    } else if (typeof window !== 'undefined') {
        window.LayoutHelper = LayoutHelper;
    }

    console.log('%c[LayoutHelper] Module loaded - Safe layout accessors ready',
        'background: #4CAF50; color: white; padding: 3px 8px; border-radius: 3px;');

})();
