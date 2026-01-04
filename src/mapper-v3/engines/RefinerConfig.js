/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    REFINER ENGINE CONFIGURATION                            ║
 * ║                         VERSION 1.0.0 - STABLE                             ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  WARNING: DO NOT MODIFY THESE VALUES WITHOUT EXTENSIVE TESTING!            ║
 * ║                                                                            ║
 * ║  This configuration was carefully tuned on 2026-01-04 after extensive      ║
 * ║  testing with Hebrew PDF forms. Each value affects field detection         ║
 * ║  accuracy in specific scenarios.                                           ║
 * ║                                                                            ║
 * ║  BEFORE CHANGING ANY VALUE:                                                ║
 * ║  1. Document the current behavior                                          ║
 * ║  2. Test on multiple PDF forms                                             ║
 * ║  3. Verify no regression in edge cases                                     ║
 * ║  4. Update the version number                                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * MODULES USING THIS CONFIG:
 * - AutoBoxer.js (v1.0.0)    - Pixel-based field detection
 * - BboxRefiner.js (v1.0.0)  - Progressive bbox refinement
 * - DrawController.js        - UI and interaction handling
 */

// ═══════════════════════════════════════════════════════════════════════════
// VERSION TRACKING - Update when making changes
// ═══════════════════════════════════════════════════════════════════════════
export const REFINER_VERSION = '1.0.0';
export const REFINER_BUILD_DATE = '2026-01-04';

// ═══════════════════════════════════════════════════════════════════════════
// AUTOBOXER CONFIGURATION - Pixel-based physics engine
// ═══════════════════════════════════════════════════════════════════════════
export const AUTOBOXER_CONFIG = Object.freeze({
    // Ink detection threshold (0-255, lower = more sensitive)
    // Value 200 works well for standard black text on white background
    INK_THRESHOLD: 200,

    // ─────────────────────────────────────────────────────────────────────
    // FIELD DIMENSIONS - Standard sizes for different scenarios
    // ─────────────────────────────────────────────────────────────────────

    // Used when no walls found (e.g., signature fields with only floor)
    DEFAULT_WIDTH: 200,
    DEFAULT_HEIGHT: 35,

    // Maximum width constraint - prevents bbox spanning entire page
    // Set to 500 to accommodate address fields while blocking signature line issues
    MAX_WIDTH: 500,

    // Minimum field size - ensures fields aren't too small
    // MIN_WIDTH: 100 handles large fields like addresses
    MIN_WIDTH: 100,
    MIN_HEIGHT: 18,

    // ─────────────────────────────────────────────────────────────────────
    // SEARCH DISTANCES - How far to look for boundaries (screen pixels)
    // ─────────────────────────────────────────────────────────────────────
    MAX_SEARCH_DOWN: 50,     // Floor search distance
    MAX_SEARCH_LEFT: 400,    // Left wall search
    MAX_SEARCH_RIGHT: 400,   // Right wall search
    MAX_SEARCH_UP: 100,      // Ceiling search

    // ─────────────────────────────────────────────────────────────────────
    // FLOOR DETECTION - Horizontal line recognition
    // ─────────────────────────────────────────────────────────────────────
    MIN_FLOOR_LENGTH: 20,    // Minimum ink pixels to be considered a floor
    FLOOR_GAP_TOLERANCE: 8,  // Max gap in floor line (handles dashed lines)

    // ─────────────────────────────────────────────────────────────────────
    // WALL DETECTION - Vertical line recognition
    // ─────────────────────────────────────────────────────────────────────
    MIN_WALL_HEIGHT: 12,     // Minimum height for wall candidate

    // ─────────────────────────────────────────────────────────────────────
    // CONTINUITY LAW - Distinguishes walls from digit separators
    // ─────────────────────────────────────────────────────────────────────
    // A vertical line is a wall ONLY if isolated (not part of a sequence)
    CONTINUITY_PROBE_DISTANCE: 50,      // How far to check for neighbors
    CONTINUITY_SIMILARITY_THRESHOLD: 0.7, // Similarity required for sequence

    // ─────────────────────────────────────────────────────────────────────
    // TEXT DETECTION - Prevents bbox from overlapping text
    // ─────────────────────────────────────────────────────────────────────
    TEXT_PADDING: 4,              // Padding around text boxes
    MIN_TEXT_BLOB_WIDTH: 6,       // Minimum width to be "text"
    MIN_TEXT_INK_DENSITY: 0.15,   // Ink density threshold
    MIN_INNER_MARGIN: 40,         // Dead zone around click (ignores nearby chars)
});

// ═══════════════════════════════════════════════════════════════════════════
// BBOX REFINER CONFIGURATION - Progressive refinement UI
// ═══════════════════════════════════════════════════════════════════════════
export const REFINER_CONFIG = Object.freeze({
    // Edge detection thresholds (screen pixels)
    EDGE_PROXIMITY: 25,     // Distance from edge to be "near edge"
    CENTER_ZONE: 0.4,       // Middle 40% of bbox is "center"

    // Drag interaction
    DRAG_ZONE_SIZE: 12,     // Invisible drag area on each edge
    CORNER_HANDLE_SIZE: 10, // Visible corner handle size

    // Collision prevention
    FIELD_PADDING: 2,       // Gap between adjacent fields
    MIN_BBOX_SIZE: 20,      // Minimum dimension during resize

    // Visual feedback
    TRANSITION_DURATION: '0.15s',
    BORDER_COLOR: '#2196F3',
    BACKGROUND_ALPHA: 0.08,
});

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS - Enable/disable functionality
// ═══════════════════════════════════════════════════════════════════════════
export const REFINER_FEATURES = Object.freeze({
    // Core features
    PROGRESSIVE_REFINEMENT: true,    // Click-based refinement
    DRAG_EDGES: true,                // Drag to resize
    DRAG_CORNERS: true,              // Corner handles
    DRAG_MOVE: true,                 // Move entire bbox

    // Collision prevention
    PREVENT_TEXT_OVERLAP: true,      // Don't overlap text
    PREVENT_FIELD_OVERLAP: true,     // Don't overlap other fields

    // Visual features
    SHOW_ARROWS: true,               // Arrow indicators on edges
    SHOW_CORNER_HANDLES: true,       // Visible corner handles
});

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
export const REFINER_DEBUG = Object.freeze({
    LOG_AUTOBOXER: true,
    LOG_REFINER: true,
    LOG_DRAG: false,
    LOG_COLLISIONS: true,
});

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION - Ensure config is not modified at runtime
// ═══════════════════════════════════════════════════════════════════════════
console.log(`[RefinerConfig] Loaded v${REFINER_VERSION} (${REFINER_BUILD_DATE})`);
