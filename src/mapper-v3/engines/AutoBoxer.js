/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - AutoBoxer
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   מנוע פיזיקה שמזהה גבולות שדות בטופס PDF.
 *   המשתמש לוחץ על נקודה → המנוע "שולח קרניים" לכל הכיוונים
 *   (למעלה, למטה, ימינה, שמאלה) ומחפש קירות (קווים, שוליים).
 *   התוצאה: מלבן (bbox) שמגדיר בדיוק את גבולות השדה.
 *
 * איך זה עובד:
 *   - עובד ברמת פיקסלים בלבד (לא מנתח מבנה PDF, לא paths, לא strokes)
 *   - רינדור PDF ב-300 DPI → ניתוח צבע פיקסלים → זיהוי "דיו" (INK_THRESHOLD)
 *   - מודל פיזיקלי: רצפה (חובה), קיר, תקרה, היגיון "פגיעה ראשונה"
 *   - שדות קיימים מקבלים עדיפות מוחלטת על פני קירות פיקסלים
 *
 * מי משתמש בקובץ:
 *   - DrawController.js - מפעיל את findBbox() בכל לחיצה
 *   - BboxRefiner.js - משתמש בנתוני AutoBoxer לשיפור הדרגתי
 *
 * באיזה מצבים:
 *   - מצב מיפוי (רגיל ומונחה)
 *   - מצב ניסיוני (Reverse Mapping)
 *   - כל מצב שבו המשתמש מצייר שדות על PDF
 *
 * למה הוא קיים:
 *   כדי שהמשתמש לא יצטרך לצייר מלבן מדויק ידנית.
 *   לחיצה אחת בתוך שדה → המנוע מוצא את הגבולות האמיתיים.
 *   מכויל במיוחד לטפסים ממשלתיים ישראליים בעברית.
 *
 * אזהרה: קובץ PROTECTED - אין לשנות ללא בדיקה מקיפה!
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║              AUTOBOXER - PIXEL-BASED PHYSICS ENGINE                        ║
 * ║                      VERSION 1.0.2 - STABLE                                ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  WARNING: THIS MODULE IS PROTECTED - DO NOT MODIFY WITHOUT REVIEW!         ║
 * ║                                                                            ║
 * ║  Last stable update: 2026-01-12                                            ║
 * ║  Tested with: Hebrew PDF forms (101, 106, mipuy)                           ║
 * ║  Dependencies: PDFEngine, TextExtractor, RefinerConfig                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * CHANGELOG v1.0.2 (2026-01-12):
 * - MAJOR: Existing fields now have ABSOLUTE priority over pixel-based walls
 * - Added _isClickInsideExistingField() to block clicks inside existing fields
 * - Fixed _isIsolatedVerticalLine() - isolated lines with no spatial difference are now noise
 * - Fixed _findExistingFieldEdge() - now detects overlapping fields (not just separated)
 * - Increased vertical overlap tolerance from 15px to 25px
 * - Removed problematic 'continue' statement that skipped text check after finding lines
 * - INK_THRESHOLD increased from 200 to 220 (detects gray borders)
 *
 * CHANGELOG v1.0.1 (2026-01-12):
 * - Fixed race condition in _loadPixelData() with loading lock pattern
 * - Added scale validation to prevent division by zero
 * - Added null checks for textExtractor in _loadWordBboxes()
 * - Removed dead code _isExistingFieldWall (replaced by _findExistingFieldEdge)
 * - Converted commented _hasConnectedCeiling to feature flag USE_CEILING_CONNECTION
 *
 * ARCHITECTURE:
 * - Operates EXCLUSIVELY on rendered pixels (300 DPI canvas)
 * - Does NOT parse PDF structure, paths, or strokes
 * - Does NOT use text boxes or semantic information
 * - Behaves like a human eye looking at a printed page
 *
 * THE WORLD MODEL:
 * - Ink pixels (dark)
 * - White pixels (empty)
 * - Nothing else exists
 *
 * PHYSICS RULES:
 * 1. Floor: Horizontal ink pattern below click (MANDATORY - no floor = no field)
 * 2. Wall: Vertical ink pattern that stops horizontal expansion
 * 3. Ceiling: Horizontal ink pattern that stops vertical expansion
 * 4. First-Hit Logic: First physical entity hit is the boundary
 * 5. Continuity Law: Vertical line is wall ONLY if isolated (not part of sequence)
 * 6. Gap Tolerance: Small gaps in floor are ignored
 *
 * INPUT:  Click point (x, y) in screen coordinates
 * OUTPUT: Computed bbox { x, y, width, height } in screen coordinates, or null if no floor
 */

import { pdfEngine } from './PDFEngine.js';
import { textExtractor } from './TextExtractor.js';
import { AUTOBOXER_CONFIG, REFINER_VERSION, REFINER_FEATURES } from './RefinerConfig.js';

// ═══════════════════════════════════════════════════════════════════════════
// MODULE VERSION - Must match RefinerConfig version
// ═══════════════════════════════════════════════════════════════════════════
const MODULE_VERSION = '1.0.2';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - Imported from RefinerConfig.js (DO NOT MODIFY HERE!)
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = AUTOBOXER_CONFIG;

// V3.9: Debug mode - disable verbose logging to prevent browser crash
// Enable via console: window.AUTOBOXER_DEBUG = true
const DEBUG = () => typeof window !== 'undefined' && window.AUTOBOXER_DEBUG;
const log = (...args) => { if (DEBUG()) console.log(...args); };
const warn = (...args) => { if (DEBUG()) console.warn(...args); };

export class AutoBoxer {
    constructor() {
        this._pixelCanvas = null;
        this._pixelContext = null;
        this._pixelData = null;
        this._canvasWidth = 0;
        this._canvasHeight = 0;
        this._currentPage = null;
        this._scale = 1;  // Scale from screen to canvas pixels
        this._wordBboxes = null;  // Cache of word bboxes in screen coordinates
        this._wordBboxPage = null;
        this._neighborFields = [];  // V3.2: Existing fields to treat as walls
        this._loadingPromise = null;  // V3.3: Prevent race condition in parallel calls
    }

    /**
     * V3.2: Set neighbor fields (existing fields) that should be treated as walls
     * @param {Array} fields - Array of {x, y, width, height} in screen coordinates
     */
    setNeighborFields(fields) {
        this._neighborFields = fields || [];
        log(`[AutoBoxer] Set ${this._neighborFields.length} neighbor fields as walls:`, this._neighborFields);
    }

    /**
     * V3.2: Clear neighbor fields
     */
    clearNeighborFields() {
        this._neighborFields = [];
    }

    /**
     * V3.3: Check if click point is inside any existing field
     * Used to prevent creating new fields on top of existing ones
     * @param {number} clickX - Click X in screen pixels
     * @param {number} clickY - Click Y in screen pixels
     * @returns {boolean} True if click is inside an existing field
     */
    _isClickInsideExistingField(clickX, clickY) {
        console.log(`[AutoBoxer] _isClickInsideExistingField: checking click (${clickX}, ${clickY}) against ${this._neighborFields?.length || 0} fields`);

        if (!this._neighborFields || this._neighborFields.length === 0) {
            console.log('[AutoBoxer] No neighbor fields to check');
            return false;
        }

        const MARGIN = 2;  // Small margin to avoid edge cases

        for (const field of this._neighborFields) {
            const isInsideX = clickX >= field.x + MARGIN && clickX <= field.x + field.width - MARGIN;
            const isInsideY = clickY >= field.y + MARGIN && clickY <= field.y + field.height - MARGIN;

            console.log(`[AutoBoxer] Field check: field=(${field.x}, ${field.y}, ${field.width}x${field.height}), click=(${clickX}, ${clickY}), insideX=${isInsideX}, insideY=${isInsideY}`);

            if (isInsideX && isInsideY) {
                console.log(`[AutoBoxer] ✓ Click IS inside existing field!`);
                return true;
            }
        }

        console.log('[AutoBoxer] Click is NOT inside any existing field');
        return false;
    }

    /**
     * Main API: Compute bbox from a single click point
     * Returns null if no valid floor is found (mandatory rule)
     *
     * @param {number} clickX - Click X in screen pixels
     * @param {number} clickY - Click Y in screen pixels
     * @returns {Promise<Object|null>} { x, y, width, height } in screen pixels, or null
     */
    async computeBbox(clickX, clickY) {
        log(`[AutoBoxer] Computing bbox at click (${clickX}, ${clickY}), neighborFields: ${this._neighborFields?.length || 0}`);

        // Load pixel data for current page
        const loaded = await this._loadPixelData();
        if (!loaded) {
            warn('[AutoBoxer] Failed to load pixel data');
            return null;
        }

        // V3.3: Safety check - ensure scale is valid before any division
        if (!this._scale || this._scale <= 0 || !isFinite(this._scale)) {
            warn('[AutoBoxer] Invalid scale, cannot compute bbox');
            return null;
        }

        // V3.3: Block clicks inside existing fields (prevents overlap)
        if (this._isClickInsideExistingField(clickX, clickY)) {
            warn('[AutoBoxer] ❌ Click is inside existing field - blocking bbox creation');
            return null;
        }

        // Load word bboxes for text obstacle detection
        await this._loadWordBboxes();

        // Convert screen coordinates to canvas coordinates
        const canvasX = Math.round(clickX * this._scale);
        const canvasY = Math.round(clickY * this._scale);

        log(`[AutoBoxer] Canvas coords: (${canvasX}, ${canvasY}), scale: ${this._scale}`);

        // Step 1: Find floor (MANDATORY)
        const floor = this._findFloor(canvasX, canvasY);
        if (!floor) {
            log('[AutoBoxer] ❌ No floor found - cannot create field');
            return null;  // No floor = no field (mandatory rule)
        }
        log(`[AutoBoxer] ✓ Floor found at Y=${floor.y}, length=${floor.length}, extent=[${floor.leftExtent}, ${floor.rightExtent}]`);

        const floorY = floor.y;
        // V3.2: Floor bounds are ABSOLUTE limits - no wall can be beyond these
        const floorLeftBound = floor.leftExtent;
        const floorRightBound = floor.rightExtent;

        // Step 2: Find left wall (First-Hit on floor level)
        // Pass canvasX for dead zone check (no text walls within MIN_INNER_MARGIN of click)
        const leftWall = this._findLeftWall(canvasX, floorY, canvasX);
        // V3.2: If wall found - use it (but not beyond floor). If no wall - use DEFAULT_WIDTH (but not beyond floor)
        let leftX;
        if (leftWall) {
            leftX = Math.max(leftWall.x, floorLeftBound);
        } else {
            // No wall found - use default width, but respect floor bound
            leftX = Math.max(canvasX - CONFIG.DEFAULT_WIDTH * this._scale / 2, floorLeftBound);
        }
        log(`[AutoBoxer] Left wall: ${leftWall ? `found at X=${leftWall.x}` : 'not found (using default)'}, using X=${leftX} (floor bound=${floorLeftBound})`);

        // Step 3: Find right wall (First-Hit on floor level)
        const rightWall = this._findRightWall(canvasX, floorY, canvasX);
        // V3.2: If wall found - use it (but not beyond floor). If no wall - use DEFAULT_WIDTH (but not beyond floor)
        let rightX;
        if (rightWall) {
            rightX = Math.min(rightWall.x, floorRightBound);
        } else {
            // No wall found - use default width, but respect floor bound
            rightX = Math.min(canvasX + CONFIG.DEFAULT_WIDTH * this._scale / 2, floorRightBound);
        }
        log(`[AutoBoxer] Right wall: ${rightWall ? `found at X=${rightWall.x}` : 'not found (using default)'}, using X=${rightX} (floor bound=${floorRightBound})`);

        // Step 3.5: Apply MAX_WIDTH constraint
        // If walls are too far apart (like a long floor line), use DEFAULT_WIDTH centered on click
        // BUT still respect floor bounds
        const maxWidth = CONFIG.MAX_WIDTH * this._scale;
        let computedWidth = rightX - leftX;

        if (computedWidth > maxWidth) {
            log(`[AutoBoxer] Width ${Math.round(computedWidth)} exceeds MAX_WIDTH ${Math.round(maxWidth)}, centering on click`);
            let newLeft = canvasX - CONFIG.DEFAULT_WIDTH * this._scale / 2;
            let newRight = canvasX + CONFIG.DEFAULT_WIDTH * this._scale / 2;
            // Still respect floor bounds!
            leftX = Math.max(newLeft, floorLeftBound);
            rightX = Math.min(newRight, floorRightBound);
            computedWidth = rightX - leftX;
        }

        // Step 4: Find ceiling (between walls, going up from floor)
        const ceiling = this._findCeiling(leftX, rightX, floorY);
        const topY = ceiling ? ceiling.y : Math.max(0, floorY - CONFIG.DEFAULT_HEIGHT * this._scale);
        log(`[AutoBoxer] Ceiling: ${ceiling ? `found at Y=${ceiling.y}` : 'not found, using default'}`);

        // Calculate bbox in canvas coordinates
        let width = rightX - leftX;
        let height = floorY - topY;

        // Apply minimum constraints (in canvas pixels)
        // V3.2: But still respect floor bounds!
        const minWidth = CONFIG.MIN_WIDTH * this._scale;
        const minHeight = CONFIG.MIN_HEIGHT * this._scale;

        if (width < minWidth) {
            const diff = minWidth - width;
            // Try to expand equally, but respect floor bounds
            let expandLeft = Math.min(diff / 2, leftX - floorLeftBound);
            let expandRight = Math.min(diff / 2, floorRightBound - rightX);
            leftX -= expandLeft;
            rightX += expandRight;
            width = rightX - leftX;
        }
        if (height < minHeight) {
            height = minHeight;
        }

        // Convert back to screen coordinates
        const bbox = {
            x: Math.round(leftX / this._scale),
            y: Math.round(topY / this._scale),
            width: Math.round(width / this._scale),
            height: Math.round(height / this._scale)
        };

        // Ensure within screen bounds
        const layerWidth = this._getLayerWidth();
        const layerHeight = this._getLayerHeight();
        bbox.x = Math.max(0, Math.min(bbox.x, layerWidth - bbox.width));
        bbox.y = Math.max(0, Math.min(bbox.y, layerHeight - bbox.height));

        log('[AutoBoxer] ✓ Computed bbox:', bbox);
        return bbox;
    }

    // ============ PIXEL DATA LOADING ============

    /**
     * Load pixel data from the rendered PDF page
     * Creates a canvas and extracts ImageData for pixel scanning
     * V3.3: Uses loading lock to prevent race condition in parallel calls
     */
    async _loadPixelData() {
        const currentPage = pdfEngine.currentPage;

        // Use cache if same page
        if (this._pixelData && this._currentPage === currentPage) {
            return true;
        }

        // V3.3: If already loading, wait for the existing promise (prevents race condition)
        if (this._loadingPromise) {
            return this._loadingPromise;
        }

        // V3.3: Create loading promise to prevent parallel loads
        this._loadingPromise = this._doLoadPixelData(currentPage);

        try {
            return await this._loadingPromise;
        } finally {
            this._loadingPromise = null;
        }
    }

    /**
     * V3.3: Internal method that does the actual pixel data loading
     * Separated to support the loading lock pattern
     */
    async _doLoadPixelData(currentPage) {
        // Get the rendered image element
        const imgElement = document.querySelector('#pdf-container img');
        if (!imgElement || !imgElement.complete) {
            warn('[AutoBoxer] PDF image not ready');
            return false;
        }

        // Get display dimensions
        const displayWidth = imgElement.width || imgElement.naturalWidth;
        const displayHeight = imgElement.height || imgElement.naturalHeight;

        if (!displayWidth || !displayHeight) {
            warn('[AutoBoxer] Invalid image dimensions');
            return false;
        }

        // Calculate scale (canvas might be higher resolution than display)
        // Use natural dimensions for pixel accuracy
        this._canvasWidth = imgElement.naturalWidth;
        this._canvasHeight = imgElement.naturalHeight;
        this._scale = this._canvasWidth / displayWidth;

        // V3.3: Validate scale to prevent division by zero later
        if (!this._scale || this._scale <= 0 || !isFinite(this._scale)) {
            warn('[AutoBoxer] Invalid scale calculated:', this._scale);
            this._scale = 1;  // Fallback to 1:1
        }

        // Create canvas for pixel access
        if (!this._pixelCanvas) {
            this._pixelCanvas = document.createElement('canvas');
            this._pixelContext = this._pixelCanvas.getContext('2d', { willReadFrequently: true });
        }

        this._pixelCanvas.width = this._canvasWidth;
        this._pixelCanvas.height = this._canvasHeight;

        // Draw image to canvas
        this._pixelContext.drawImage(imgElement, 0, 0);

        // Extract pixel data
        this._pixelData = this._pixelContext.getImageData(0, 0, this._canvasWidth, this._canvasHeight);
        this._currentPage = currentPage;

        log(`[AutoBoxer] Loaded pixel data: ${this._canvasWidth}x${this._canvasHeight}, scale=${this._scale.toFixed(2)}`);
        return true;
    }

    // ============ PIXEL ACCESS ============

    /**
     * Check if a pixel is "ink" (dark enough)
     * @param {number} x - Canvas X coordinate
     * @param {number} y - Canvas Y coordinate
     * @returns {boolean} True if pixel is ink
     */
    _isInk(x, y) {
        if (x < 0 || x >= this._canvasWidth || y < 0 || y >= this._canvasHeight) {
            return false;
        }

        const idx = (y * this._canvasWidth + x) * 4;
        const r = this._pixelData.data[idx];
        const g = this._pixelData.data[idx + 1];
        const b = this._pixelData.data[idx + 2];

        // Convert to grayscale and check threshold
        const gray = (r + g + b) / 3;
        return gray < CONFIG.INK_THRESHOLD;
    }

    /**
     * Count ink pixels in a horizontal line segment
     * @param {number} y - Y coordinate
     * @param {number} x1 - Start X
     * @param {number} x2 - End X
     * @returns {number} Count of ink pixels
     */
    _countHorizontalInk(y, x1, x2) {
        let count = 0;
        for (let x = x1; x <= x2; x++) {
            if (this._isInk(x, y)) count++;
        }
        return count;
    }

    /**
     * Count ink pixels in a vertical line segment
     * @param {number} x - X coordinate
     * @param {number} y1 - Start Y
     * @param {number} y2 - End Y
     * @returns {number} Count of ink pixels
     */
    _countVerticalInk(x, y1, y2) {
        let count = 0;
        for (let y = y1; y <= y2; y++) {
            if (this._isInk(x, y)) count++;
        }
        return count;
    }

    // ============ FLOOR DETECTION ============

    /**
     * Find floor below click point
     * Scans downward looking for horizontal ink pattern
     * Implements Gap Tolerance
     *
     * @param {number} startX - Canvas X
     * @param {number} startY - Canvas Y
     * @returns {Object|null} { y, length } or null if no floor
     */
    _findFloor(startX, startY) {
        const maxSearch = CONFIG.MAX_SEARCH_DOWN * this._scale;
        const minLength = CONFIG.MIN_FLOOR_LENGTH * this._scale;
        const gapTolerance = CONFIG.FLOOR_GAP_TOLERANCE * this._scale;

        // Scan downward from click point
        for (let dy = 0; dy < maxSearch; dy++) {
            const y = Math.round(startY + dy);
            if (y >= this._canvasHeight) break;

            // Check for horizontal ink pattern at this Y
            const floorInfo = this._detectHorizontalLine(y, startX, minLength, gapTolerance);
            if (floorInfo) {
                // V3.2: Return floor bounds - these are HARD limits for wall detection
                return {
                    y,
                    length: floorInfo.length,
                    leftExtent: floorInfo.leftExtent,
                    rightExtent: floorInfo.rightExtent
                };
            }
        }

        return null;
    }

    /**
     * Detect a horizontal line at given Y, centered around X
     * Implements Gap Tolerance
     */
    _detectHorizontalLine(y, centerX, minLength, gapTolerance) {
        let leftExtent = centerX;
        let rightExtent = centerX;
        let gapCount = 0;
        let totalInk = 0;

        // Scan left
        for (let x = centerX; x >= 0; x--) {
            if (this._isInk(x, y)) {
                leftExtent = x;
                gapCount = 0;
                totalInk++;
            } else {
                gapCount++;
                if (gapCount > gapTolerance) break;
            }
        }

        // Reset gap counter
        gapCount = 0;

        // Scan right
        for (let x = centerX; x < this._canvasWidth; x++) {
            if (this._isInk(x, y)) {
                rightExtent = x;
                gapCount = 0;
                totalInk++;
            } else {
                gapCount++;
                if (gapCount > gapTolerance) break;
            }
        }

        const length = rightExtent - leftExtent;
        if (length >= minLength && totalInk >= minLength * 0.3) {
            return { leftExtent, rightExtent, length, totalInk };
        }

        return null;
    }

    // ============ WALL DETECTION ============

    /**
     * Find left wall - V3.2: Priority-based wall detection
     * Priority: 1. Existing fields  2. Vertical lines  3. Text (only if no line exists)
     *
     * @param {number} startX - Start X in canvas coordinates
     * @param {number} floorY - Floor Y in canvas coordinates
     * @param {number} clickX - Original click X in canvas coordinates (for dead zone)
     */
    _findLeftWall(startX, floorY, clickX) {
        const maxSearch = CONFIG.MAX_SEARCH_LEFT * this._scale;
        const minHeight = CONFIG.MIN_WALL_HEIGHT * this._scale;
        const deadZone = CONFIG.MIN_INNER_MARGIN * this._scale;

        // V3.2: Collect walls by type, then apply priority rules
        let fieldWall = null;
        let verticalLineWall = null;
        let textWall = null;

        // Check 1: Existing field edge (can be beyond MAX_SEARCH)
        const existingField = this._findExistingFieldEdge(startX, floorY, 'left');
        if (existingField) {
            fieldWall = { x: existingField.x, distance: startX - existingField.x };
        }

        // Scan leftward for vertical lines and text
        for (let dx = 5; dx < maxSearch; dx++) {
            const x = Math.round(startX - dx);
            if (x < 0) break;

            // Check 2: Vertical LINE pattern (first-hit)
            if (!verticalLineWall && this._isVerticalWall(x, floorY, minHeight)) {
                if (this._isIsolatedVerticalLine(x, floorY, minHeight)) {
                    verticalLineWall = { x, distance: dx };
                }
                // V3.3: Removed 'continue' - still check for text at this position
            }

            // Check 3: TEXT obstacle (first-hit)
            // V3.2: Skip text BELOW floor (= LABEL, not wall)
            if (!textWall) {
                const distanceFromClick = Math.abs(x - clickX);
                if (distanceFromClick >= deadZone &&
                    this._isTextObstacle(x, floorY) &&
                    !this._isTextBelowFloor(x, floorY)) {
                    textWall = { x, distance: dx };
                }
            }

            // Stop if we found both
            if (verticalLineWall && textWall) break;
        }

        // V3.3: Apply priority rules - EXISTING FIELDS ALWAYS WIN
        // Priority: 1. Existing fields (ABSOLUTE)  2. Vertical lines  3. Text

        // RULE 1: Existing field is ALWAYS the wall (prevents overlap)
        // V3.3: Changed - existing fields have absolute priority over any pixel-based detection
        if (fieldWall) {
            log(`[AutoBoxer] Left wall: FIELD at X=${fieldWall.x} (absolute priority)`);
            return { x: fieldWall.x };
        }

        // RULE 2: If no field, use vertical line
        if (verticalLineWall) {
            log(`[AutoBoxer] Left wall: vertical_line at X=${verticalLineWall.x}`);
            return { x: verticalLineWall.x };
        }

        // RULE 3: If no line, use text
        if (textWall) {
            log(`[AutoBoxer] Left wall: text at X=${textWall.x}`);
            return { x: textWall.x };
        }

        return null;
    }

    /**
     * Find right wall - V3.2: Priority-based wall detection
     * Priority: 1. Existing fields  2. Vertical lines  3. Text (only if no line exists)
     *
     * @param {number} startX - Start X in canvas coordinates
     * @param {number} floorY - Floor Y in canvas coordinates
     * @param {number} clickX - Original click X in canvas coordinates (for dead zone)
     */
    _findRightWall(startX, floorY, clickX) {
        const maxSearch = CONFIG.MAX_SEARCH_RIGHT * this._scale;
        const minHeight = CONFIG.MIN_WALL_HEIGHT * this._scale;
        const deadZone = CONFIG.MIN_INNER_MARGIN * this._scale;

        // V3.2: Collect walls by type, then apply priority rules
        let fieldWall = null;
        let verticalLineWall = null;
        let textWall = null;

        // Check 1: Existing field edge (can be beyond MAX_SEARCH)
        const existingField = this._findExistingFieldEdge(startX, floorY, 'right');
        if (existingField) {
            fieldWall = { x: existingField.x, distance: existingField.x - startX };
        }

        // Scan rightward for vertical lines and text
        for (let dx = 5; dx < maxSearch; dx++) {
            const x = Math.round(startX + dx);
            if (x >= this._canvasWidth) break;

            // Check 2: Vertical LINE pattern (first-hit)
            if (!verticalLineWall && this._isVerticalWall(x, floorY, minHeight)) {
                if (this._isIsolatedVerticalLine(x, floorY, minHeight)) {
                    verticalLineWall = { x, distance: dx };
                }
                // V3.3: Removed 'continue' - still check for text at this position
            }

            // Check 3: TEXT obstacle (first-hit)
            // V3.2: Skip text BELOW floor (= LABEL, not wall)
            if (!textWall) {
                const distanceFromClick = Math.abs(x - clickX);
                if (distanceFromClick >= deadZone &&
                    this._isTextObstacle(x, floorY) &&
                    !this._isTextBelowFloor(x, floorY)) {
                    textWall = { x, distance: dx };
                }
            }

            // Stop if we found both
            if (verticalLineWall && textWall) break;
        }

        // V3.3: Apply priority rules - EXISTING FIELDS ALWAYS WIN
        // Priority: 1. Existing fields (ABSOLUTE)  2. Vertical lines  3. Text

        // RULE 1: Existing field is ALWAYS the wall (prevents overlap)
        // V3.3: Changed - existing fields have absolute priority over any pixel-based detection
        if (fieldWall) {
            log(`[AutoBoxer] Right wall: FIELD at X=${fieldWall.x} (absolute priority)`);
            return { x: fieldWall.x };
        }

        // RULE 2: If no field, use vertical line
        if (verticalLineWall) {
            log(`[AutoBoxer] Right wall: vertical_line at X=${verticalLineWall.x}`);
            return { x: verticalLineWall.x };
        }

        // RULE 3: If no line, use text
        if (textWall) {
            log(`[AutoBoxer] Right wall: text at X=${textWall.x}`);
            return { x: textWall.x };
        }

        return null;
    }

    /**
     * V3.2: Find ALL walls in a direction, classified as hard/soft
     * Used for wall cycling feature - returns all candidates sorted by distance
     *
     * @param {number} startX - Start X in screen coordinates
     * @param {number} floorY - Floor Y in screen coordinates
     * @param {string} direction - 'left' or 'right'
     * @param {Object} floorBounds - { leftExtent, rightExtent } from floor detection
     * @returns {Object} { walls: [...], hardLimit: number }
     */
    findAllWalls(startX, floorY, direction, floorBounds) {
        const canvasStartX = Math.round(startX * this._scale);
        const canvasFloorY = Math.round(floorY * this._scale);
        const maxSearch = (direction === 'left' ? CONFIG.MAX_SEARCH_LEFT : CONFIG.MAX_SEARCH_RIGHT) * this._scale;
        const minHeight = CONFIG.MIN_WALL_HEIGHT * this._scale;
        const structuralThreshold = CONFIG.STRUCTURAL_WALL_HEIGHT * this._scale;

        const walls = [];

        // HARD WALL 1: Floor bounds (absolute limit)
        const floorLimit = direction === 'left' ? floorBounds?.leftExtent : floorBounds?.rightExtent;
        let hardLimit = floorLimit || (direction === 'left' ? 0 : this._canvasWidth / this._scale);

        // HARD WALL 2: Existing fields
        const fieldWall = this._findExistingFieldEdge(canvasStartX, canvasFloorY, direction);
        if (fieldWall) {
            const fieldX = fieldWall.x / this._scale;
            walls.push({
                x: fieldX,
                type: 'EXISTING_FIELD',
                isHard: true,
                description: 'שדה קיים'
            });
            // Update hard limit to closest hard wall
            if (direction === 'left') {
                hardLimit = Math.max(hardLimit, fieldX);
            } else {
                hardLimit = Math.min(hardLimit, fieldX);
            }
        }

        // Scan for all walls
        let foundStructural = false;

        for (let dx = 5; dx < maxSearch; dx++) {
            const x = direction === 'left'
                ? Math.round(canvasStartX - dx)
                : Math.round(canvasStartX + dx);

            if (x < 0 || x >= this._canvasWidth) break;

            // Check for vertical line
            if (this._isVerticalWall(x, canvasFloorY, minHeight)) {
                const lineHeight = this._measureVerticalLineHeight(x, canvasFloorY);
                const screenX = x / this._scale;

                // HARD WALL 3: Structural wall (tall vertical line)
                if (lineHeight >= structuralThreshold) {
                    walls.push({
                        x: screenX,
                        type: 'STRUCTURAL_WALL',
                        isHard: true,
                        description: 'קיר מבני'
                    });
                    if (!foundStructural) {
                        foundStructural = true;
                        if (direction === 'left') {
                            hardLimit = Math.max(hardLimit, screenX);
                        } else {
                            hardLimit = Math.min(hardLimit, screenX);
                        }
                    }
                }
                // SOFT WALL: Small/medium vertical line
                else if (this._isIsolatedVerticalLine(x, canvasFloorY, minHeight)) {
                    walls.push({
                        x: screenX,
                        type: 'VERTICAL_LINE',
                        isHard: false,
                        description: 'קו אנכי'
                    });
                }
            }

            // SOFT WALL: Text obstacle
            // V3.2: Skip text that is BELOW the floor (= LABEL for this field, not wall)
            if (this._isTextObstacle(x, canvasFloorY) && !this._isTextBelowFloor(x, canvasFloorY)) {
                const screenX = x / this._scale;
                // Check if we already have a wall at similar position
                const exists = walls.some(w => Math.abs(w.x - screenX) < 5);
                if (!exists) {
                    walls.push({
                        x: screenX,
                        type: 'TEXT',
                        isHard: false,
                        description: 'טקסט'
                    });
                }
            }
        }

        // Sort by distance from start
        walls.sort((a, b) => {
            const distA = direction === 'left' ? startX - a.x : a.x - startX;
            const distB = direction === 'left' ? startX - b.x : b.x - startX;
            return distA - distB;
        });

        // Add floor bound as final hard limit
        walls.push({
            x: hardLimit,
            type: 'FLOOR_BOUND',
            isHard: true,
            description: 'גבול ריצפה'
        });

        log(`[AutoBoxer] findAllWalls ${direction}: ${walls.length} walls, hardLimit=${Math.round(hardLimit)}`);

        return { walls, hardLimit };
    }

    /**
     * Measure the height of a vertical line at X
     */
    _measureVerticalLineHeight(x, floorY) {
        let height = 0;
        // Scan upward
        for (let dy = 0; dy < 500; dy++) {
            if (this._isInk(x, floorY - dy)) {
                height++;
            } else if (dy > 10 && height > 0) {
                break; // Gap found after some ink
            }
        }
        return height;
    }

    /**
     * Check if there's a vertical line at X near floorY
     */
    _isVerticalWall(x, floorY, minHeight) {
        const searchUp = Math.round(minHeight * 1.5);
        let inkCount = 0;

        for (let dy = -searchUp; dy <= 0; dy++) {
            const y = floorY + dy;
            if (this._isInk(x, y)) inkCount++;
        }

        return inkCount >= minHeight * 0.7;
    }

    /**
     * SPATIAL PHYSICS: Determine if a vertical line is a true wall
     *
     * A vertical line is a wall ONLY if it separates two physically different fill regions.
     * The line itself is NEVER the deciding factor - only its spatial effect matters.
     *
     * CRITICAL RULE:
     * - Lines in a sequence (has neighbors) = SKIP (step over)
     * - Even the LAST line in a sequence (has neighbors only on one side) = SKIP
     * - Only truly ISOLATED lines (no neighbors at all) OR structural boundaries = WALL
     *
     * A line is a WALL only if:
     * 1. It's completely isolated (no similar lines on either side), OR
     * 2. It has significantly different spatial properties (ceiling height, free run)
     */
    _isIsolatedVerticalLine(x, floorY, minHeight) {
        const probeDistance = CONFIG.CONTINUITY_PROBE_DISTANCE * this._scale;

        // ============ CHECK 0: IS THIS A TALL STRUCTURAL LINE? ============
        // Table borders are TALL (extend above the field area into headers)
        // Kakakim (digit separators) are SHORT (only within the input row)
        // If the line is much taller than minHeight, it's a structural wall!
        const lineHeight = this._measureLineHeight(x, floorY);
        const structuralThreshold = minHeight * 3;  // Structural lines are 3x+ taller

        if (lineHeight > structuralThreshold) {
            return true;  // Tall structural line = always a wall, regardless of neighbors
        }

        // ============ CHECK 0.5: CEILING CONNECTION ============
        // V3.3: Controlled by feature flag USE_CEILING_CONNECTION (default: false)
        // May cause precision issues in some forms - enable with caution
        if (REFINER_FEATURES.USE_CEILING_CONNECTION && this._hasConnectedCeiling(x, floorY, minHeight)) {
            return true;  // Connected to ceiling = structural boundary
        }

        // ============ CHECK 1: FIND SIMILAR LINES ============
        // Use smaller step size to not miss thin lines
        // CRITICAL: Use a REDUCED height threshold for neighbor detection!
        // Kakakim (digit separators) are often shorter than full walls
        // We want to detect them as neighbors even if they're too short to be standalone walls
        // V3.2: Lowered threshold - kakakim can be very short (4px base instead of 6px)
        const kakakMinHeight = Math.max(4 * this._scale, minHeight * 0.3);  // Kakakim can be very short

        let leftSimilarCount = 0;
        let rightSimilarCount = 0;
        let leftSimilarDist = 0;
        let rightSimilarDist = 0;

        // Probe left for similar lines (count how many)
        // Use step size of 2 to catch thin lines
        for (let dx = 6; dx <= probeDistance; dx += 2) {
            if (this._isVerticalWall(x - dx, floorY, kakakMinHeight)) {
                leftSimilarCount++;
                if (leftSimilarDist === 0) leftSimilarDist = dx;
                dx += 6;  // Skip a bit after finding a line to avoid double-counting
            }
        }

        // Probe right for similar lines (count how many)
        for (let dx = 6; dx <= probeDistance; dx += 2) {
            if (this._isVerticalWall(x + dx, floorY, kakakMinHeight)) {
                rightSimilarCount++;
                if (rightSimilarDist === 0) rightSimilarDist = dx;
                dx += 6;  // Skip a bit after finding a line
            }
        }

        const hasLeftNeighbor = leftSimilarCount > 0;
        const hasRightNeighbor = rightSimilarCount > 0;
        const isPartOfSequence = hasLeftNeighbor || hasRightNeighbor;
        const totalNeighbors = leftSimilarCount + rightSimilarCount;

        // Debug log disabled - too verbose
        // log(`[AutoBoxer] Line X=${x}: neighbors L=${leftSimilarCount} R=${rightSimilarCount}`);

        // ============ CHECK 2: SPATIAL PROPERTIES ============
        // Measure free run (white space) on each side
        const leftFreeRun = this._measureFreeRun(x, floorY, -1);
        const rightFreeRun = this._measureFreeRun(x, floorY, 1);
        const freeRunRatio = Math.max(leftFreeRun, rightFreeRun) / (Math.min(leftFreeRun, rightFreeRun) + 1);

        // Measure ceiling height on each side
        const leftCeiling = this._measureCeilingHeight(x - 15, floorY);
        const rightCeiling = this._measureCeilingHeight(x + 15, floorY);
        const ceilingDiff = Math.abs(leftCeiling - rightCeiling);

        // ============ DECISION LOGIC ============

        // RULE 1: If has kakakim (sequence lines) on EITHER side = SKIP
        // This includes:
        // - Lines deep in sequence (kakakim on both sides)
        // - Lines at edge of sequence (kakakim on one side only)
        // - Small black separator lines between kakakim sections (month/year dividers)
        //
        // The logic: ANY line that has kakakim nearby is part of the field area
        if (isPartOfSequence) {
            // Check if this might be the REAL structural wall (table border)
            // Real walls have STRONG spatial asymmetry AND are at the very edge
            const isVeryStrongAsymmetry = freeRunRatio > 8.0 && ceilingDiff > 40 * this._scale;

            // Also check: if one side has many kakakim and other has none, might be edge
            const isAtEdgeOfField = (leftSimilarCount >= 3 && rightSimilarCount === 0) ||
                                     (rightSimilarCount >= 3 && leftSimilarCount === 0);

            if (isVeryStrongAsymmetry && isAtEdgeOfField) {
                return true;
            }

            // Otherwise: has kakakim nearby = part of field area = SKIP
            return false;
        }

        // RULE 2: No kakakim on either side = truly isolated = check spatial properties
        // This could be a real table border or a standalone separator
        const hasModerateAsymmetry = freeRunRatio > 3.0 || ceilingDiff > 20 * this._scale;

        if (hasModerateAsymmetry) {
            return true;
        }

        // V3.3: Isolated line with NO spatial difference = probably noise, NOT a wall
        // Changed from "return true" to "return false" to reduce false positives
        // Real table borders have clear spatial asymmetry (different ceiling/free run on each side)
        log(`[AutoBoxer] Line X=${x}: isolated but no spatial difference - treating as noise`);
        return false;
    }

    /**
     * Measure the total height of a vertical line (how far it extends up and down)
     * Structural walls (table borders) are TALL - they span multiple rows
     * Kakakim (digit separators) are SHORT - they only exist within the input row
     *
     * @param {number} x - X position of the line
     * @param {number} floorY - Floor Y level
     * @returns {number} Total height of the line in pixels
     */
    _measureLineHeight(x, floorY) {
        let topExtent = floorY;
        let bottomExtent = floorY;
        const maxSearch = 150 * this._scale;  // Search up to 150px in each direction

        // Measure upward extent
        for (let dy = 1; dy < maxSearch; dy++) {
            const y = floorY - dy;
            if (y < 0) break;
            if (this._isInk(x, y)) {
                topExtent = y;
            } else {
                // Allow small gaps (1-2 pixels)
                if (!this._isInk(x, y - 1) && !this._isInk(x, y - 2)) {
                    break;
                }
            }
        }

        // Measure downward extent
        for (let dy = 1; dy < maxSearch; dy++) {
            const y = floorY + dy;
            if (y >= this._canvasHeight) break;
            if (this._isInk(x, y)) {
                bottomExtent = y;
            } else {
                // Allow small gaps
                if (!this._isInk(x, y + 1) && !this._isInk(x, y + 2)) {
                    break;
                }
            }
        }

        return bottomExtent - topExtent;
    }

    /**
     * Check if a vertical line connects to a horizontal ceiling at its top
     * This forms an "L" or "T" shape that indicates a structural field boundary
     *
     * @param {number} x - X position of the vertical line
     * @param {number} floorY - Floor Y level
     * @param {number} minHeight - Minimum wall height
     * @returns {boolean} True if ceiling is connected at top
     */
    _hasConnectedCeiling(x, floorY, minHeight) {
        // First, find the top of this vertical line
        let topY = floorY;
        const maxSearch = 150 * this._scale;

        for (let dy = 1; dy < maxSearch; dy++) {
            const y = floorY - dy;
            if (y < 0) break;

            if (this._isInk(x, y)) {
                topY = y;
            } else {
                // Allow small gaps (1-2 pixels)
                if (!this._isInk(x, y - 1) && !this._isInk(x, y - 2)) {
                    break;
                }
            }
        }

        // Check if the line is tall enough to be meaningful
        const lineHeight = floorY - topY;
        if (lineHeight < minHeight * 0.7) {
            return false;  // Too short to check for ceiling
        }

        // Now check for horizontal ink (ceiling) at the top of this line
        // Check both left and right directions from the top point
        const ceilingCheckWidth = 20 * this._scale;  // Check 20px in each direction
        const ceilingCheckY = topY;

        let leftInkCount = 0;
        let rightInkCount = 0;

        // Check left for horizontal ink
        for (let dx = 2; dx < ceilingCheckWidth; dx++) {
            const checkX = x - dx;
            if (checkX < 0) break;

            // Check a vertical band (ceiling might be a few pixels thick)
            for (let bandY = -2; bandY <= 2; bandY++) {
                if (this._isInk(checkX, ceilingCheckY + bandY)) {
                    leftInkCount++;
                    break;  // Found ink in this column, move to next
                }
            }
        }

        // Check right for horizontal ink
        for (let dx = 2; dx < ceilingCheckWidth; dx++) {
            const checkX = x + dx;
            if (checkX >= this._canvasWidth) break;

            for (let bandY = -2; bandY <= 2; bandY++) {
                if (this._isInk(checkX, ceilingCheckY + bandY)) {
                    rightInkCount++;
                    break;
                }
            }
        }

        // A ceiling is present if there's continuous ink in either direction
        // Require at least 10 pixels of horizontal ink to be a ceiling
        const minCeilingLength = 10 * this._scale;
        const hasCeiling = leftInkCount >= minCeilingLength || rightInkCount >= minCeilingLength;

        if (hasCeiling) {
            log(`[AutoBoxer] Line X=${Math.round(x)} has ceiling (L=${leftInkCount}, R=${rightInkCount}) -> STRUCTURAL`);
        }

        return hasCeiling;
    }

    /**
     * Measure horizontal free run (continuous white pixels) from a point
     * @param {number} startX - Starting X position
     * @param {number} floorY - Floor Y level
     * @param {number} direction - -1 for left, +1 for right
     * @returns {number} Length of free run in pixels
     */
    _measureFreeRun(startX, floorY, direction) {
        const maxRun = 100 * this._scale;
        const sampleY = floorY - (CONFIG.DEFAULT_HEIGHT * this._scale * 0.5);  // Middle of field height
        let freeRun = 0;

        for (let dx = 5; dx < maxRun; dx++) {
            const x = startX + (dx * direction);
            if (x < 0 || x >= this._canvasWidth) break;

            if (this._isInk(x, sampleY)) {
                break;  // Hit ink, stop counting
            }
            freeRun = dx;
        }

        return freeRun;
    }

    /**
     * Measure ceiling height (distance from floor to first ink above)
     * @param {number} x - X position to check
     * @param {number} floorY - Floor Y level
     * @returns {number} Distance to ceiling in pixels
     */
    _measureCeilingHeight(x, floorY) {
        const maxSearch = CONFIG.MAX_SEARCH_UP * this._scale;

        for (let dy = 5; dy < maxSearch; dy++) {
            const y = floorY - dy;
            if (y < 0) return maxSearch;

            if (this._isInk(x, y)) {
                return dy;
            }
        }

        return maxSearch;  // No ceiling found
    }

    /**
     * Check if there's a TEXT obstacle at column X
     * Text is ALWAYS a wall - Continuity Law does NOT apply to text
     *
     * CRITICAL: Only text at INPUT level counts as a wall.
     * Labels ABOVE the field (which have horizontal X overlap) must NOT be walls.
     *
     * Uses two-tier detection:
     * 1. Word bbox intersection (preferred - if word bboxes available)
     * 2. Pixel-based blob detection (fallback - requires ink density, not single pixels)
     *
     * @param {number} x - Canvas X coordinate
     * @param {number} floorY - Floor Y coordinate
     * @returns {boolean} True if text obstacle exists at this column
     */
    _isTextObstacle(x, floorY) {
        // Convert to screen coordinates for word bbox check
        const screenX = x / this._scale;
        const screenFloorY = floorY / this._scale;

        // METHOD 1: Check word bboxes (preferred)
        if (this._wordBboxes && this._wordBboxes.length > 0) {
            const padding = CONFIG.TEXT_PADDING;

            // CRITICAL: For WALL detection, only consider text at INPUT level
            // This is text whose baseline (bottom) is close to the floor line
            // Labels ABOVE the field have word.bottom much higher than floor
            // Adjacent text (walls) have word.bottom near floor
            const maxDistanceFromFloor = 20;  // Max distance from floor to be "at input level"

            for (const word of this._wordBboxes) {
                // Check horizontal: does this word's X range include our scan position?
                if (screenX >= word.x - padding && screenX <= word.right + padding) {
                    // V3.2: No minimum width - text is only considered if no vertical line exists
                    // (Priority rule in _findLeftWall/_findRightWall handles this)

                    // Check vertical: is this word at INPUT level (same row)?
                    // V3.2: Hebrew forms often have labels BELOW the line, so check both above AND below
                    // distFromFloor > 0 means word bottom is above floor
                    // distFromFloor < 0 means word bottom is below floor
                    const distFromFloor = screenFloorY - word.bottom;
                    const distFromTop = screenFloorY - word.y;  // Check word top too

                    // Word is at input level if:
                    // 1. Its bottom is near floor (above or below): |distFromFloor| <= threshold
                    // 2. OR its top is near floor (for text below line)
                    const maxDistAbove = maxDistanceFromFloor;  // 20px above floor
                    const maxDistBelow = 30;  // 30px below floor (for labels under line)

                    if ((distFromFloor >= -maxDistBelow && distFromFloor <= maxDistAbove) ||
                        (distFromTop >= -maxDistBelow && distFromTop <= maxDistAbove)) {
                        return true;  // Text at input level = wall
                    }
                    // Else: word is a header/title far above the field
                }
            }
            return false;  // No word bbox at input level
        }

        // METHOD 2: Pixel-based blob detection (fallback)
        // Requires minimum ink density in a sample area, not just single pixels
        return this._hasInkBlob(x, floorY);
    }

    /**
     * V3.2: Check if text at position X is BELOW the floor line (= LABEL, not wall)
     * Labels below floor belong to THIS field, not a wall for adjacent fields
     *
     * @param {number} x - Canvas X coordinate
     * @param {number} floorY - Floor Y in canvas coordinates
     * @returns {boolean} True if text is below floor (is a label)
     */
    _isTextBelowFloor(x, floorY) {
        const screenX = x / this._scale;
        const screenFloorY = floorY / this._scale;

        if (!this._wordBboxes || this._wordBboxes.length === 0) {
            return false;
        }

        const padding = CONFIG.TEXT_PADDING;

        for (const word of this._wordBboxes) {
            // Check horizontal: does this word's X range include our scan position?
            if (screenX >= word.x - padding && screenX <= word.right + padding) {
                // Check if word TOP is below floor line
                // word.y is the TOP of the word bbox
                // If word.y > screenFloorY, the word starts BELOW the floor
                if (word.y > screenFloorY) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * V3.2: Find gaps between labels below the floor line and return as virtual walls
     * Labels below floor indicate field sections - gaps between them are field boundaries
     *
     * @param {number} floorY - Floor Y in canvas coordinates
     * @param {number} searchLeft - Left boundary of search (canvas coords)
     * @param {number} searchRight - Right boundary of search (canvas coords)
     * @returns {Array} Array of { x: screenX, type: 'LABEL_GAP' } for each gap midpoint
     */
    _findLabelGapsAsWalls(floorY, searchLeft, searchRight) {
        const screenFloorY = floorY / this._scale;
        const screenSearchLeft = searchLeft / this._scale;
        const screenSearchRight = searchRight / this._scale;

        if (!this._wordBboxes || this._wordBboxes.length === 0) {
            return [];
        }

        // Find all labels below the floor line within search range
        const labelsBelow = [];
        const maxDistBelow = 40;  // Labels up to 40px below floor

        for (const word of this._wordBboxes) {
            // Check if word is below floor
            if (word.y > screenFloorY && word.y < screenFloorY + maxDistBelow) {
                // Check if word is within horizontal search range
                if (word.right >= screenSearchLeft && word.x <= screenSearchRight) {
                    labelsBelow.push({
                        text: word.text || '',
                        x: word.x,
                        right: word.right,
                        center: (word.x + word.right) / 2
                    });
                }
            }
        }

        if (labelsBelow.length < 2) {
            // Need at least 2 labels to have a gap
            return [];
        }

        // Sort labels by X position (right to left for Hebrew)
        labelsBelow.sort((a, b) => a.x - b.x);

        // Calculate gaps between labels
        const virtualWalls = [];
        const minGap = 15;  // Minimum gap to be considered a boundary

        for (let i = 0; i < labelsBelow.length - 1; i++) {
            const currentLabel = labelsBelow[i];
            const nextLabel = labelsBelow[i + 1];

            const gapStart = currentLabel.right;
            const gapEnd = nextLabel.x;
            const gapSize = gapEnd - gapStart;

            if (gapSize >= minGap) {
                const gapMidpoint = (gapStart + gapEnd) / 2;
                virtualWalls.push({
                    x: gapMidpoint,
                    type: 'LABEL_GAP',
                    isHard: false,
                    description: 'גבול בין שדות'
                });
            }
        }

        return virtualWalls;
    }

    /**
     * Pixel-based text detection fallback
     * Requires a minimum ink "blob" - not just single pixels or thin lines
     *
     * @param {number} x - Canvas X coordinate
     * @param {number} floorY - Floor Y coordinate
     * @returns {boolean} True if ink blob exists at this column
     */
    _hasInkBlob(x, floorY) {
        const sampleHeight = CONFIG.DEFAULT_HEIGHT * this._scale;
        const blobWidth = CONFIG.MIN_TEXT_BLOB_WIDTH * this._scale;
        const minDensity = CONFIG.MIN_TEXT_INK_DENSITY;

        // Sample a rectangular area around the position
        const halfWidth = Math.round(blobWidth / 2);
        const sampleRows = 5;
        let totalPixels = 0;
        let inkPixels = 0;

        for (let i = 0; i < sampleRows; i++) {
            const y = Math.round(floorY - (sampleHeight * i / (sampleRows - 1)));

            for (let dx = -halfWidth; dx <= halfWidth; dx++) {
                totalPixels++;
                if (this._isInk(x + dx, y)) {
                    inkPixels++;
                }
            }
        }

        // Require minimum ink density to be considered "text"
        const density = inkPixels / totalPixels;
        return density >= minDensity;
    }

    /**
     * V3.2: Find the closest existing field edge in the given direction
     * Called ONCE at start of wall search (not per-pixel)
     *
     * @param {number} startX - Start X in canvas coordinates
     * @param {number} floorY - Floor Y in canvas coordinates
     * @param {string} direction - 'left' or 'right'
     * @returns {Object|null} { x: wallX in canvas coords } or null
     */
    _findExistingFieldEdge(startX, floorY, direction) {
        if (!this._neighborFields || this._neighborFields.length === 0) {
            return null;
        }

        const screenStartX = startX / this._scale;
        const screenFloorY = floorY / this._scale;
        const PADDING = 4;  // Gap between fields

        let closestWall = null;
        let closestDistance = Infinity;

        for (const field of this._neighborFields) {
            const fieldTop = field.y;
            const fieldBottom = field.y + field.height;
            const fieldLeft = field.x;
            const fieldRight = field.x + field.width;

            // V3.3: Check vertical overlap with larger tolerance (field must be on same horizontal band)
            // Increased from 15px to 25px to catch more cases
            const verticalOverlap = screenFloorY >= fieldTop - 25 && screenFloorY <= fieldBottom + 25;
            if (!verticalOverlap) continue;

            if (direction === 'left') {
                // V3.3: Looking for fields to our LEFT or overlapping from the left
                // Changed from fieldRight < screenStartX to fieldRight <= screenStartX + tolerance
                // This catches fields that are partially overlapping
                const OVERLAP_TOLERANCE = 10;  // Allow 10px overlap detection
                if (fieldRight <= screenStartX + OVERLAP_TOLERANCE && fieldRight > 0) {
                    const wallScreenX = fieldRight + PADDING;
                    const distance = Math.max(0, screenStartX - wallScreenX);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestWall = { x: Math.round(wallScreenX * this._scale) };
                    }
                }
            } else {
                // V3.3: Looking for fields to our RIGHT or overlapping from the right
                // Changed from fieldLeft > screenStartX to fieldLeft >= screenStartX - tolerance
                const OVERLAP_TOLERANCE = 10;
                if (fieldLeft >= screenStartX - OVERLAP_TOLERANCE) {
                    const wallScreenX = fieldLeft - PADDING;
                    const distance = Math.max(0, wallScreenX - screenStartX);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestWall = { x: Math.round(wallScreenX * this._scale) };
                    }
                }
            }
        }

        if (closestWall) {
            log(`[AutoBoxer] Found existing field as ${direction} wall at X=${closestWall.x}`);
        }

        return closestWall;
    }

    // V3.3: Removed dead code _isExistingFieldWall (LEGACY function that was never called)
    // Functionality replaced by _findExistingFieldEdge

    /**
     * Load word bounding boxes from TextExtractor cache
     * Converts PDF coordinates to screen coordinates
     * V3.3: Added null checks for textExtractor
     */
    async _loadWordBboxes() {
        const currentPage = pdfEngine.currentPage;

        // Use cache if same page
        if (this._wordBboxes && this._wordBboxPage === currentPage) {
            return;
        }

        this._wordBboxes = [];
        this._wordBboxPage = currentPage;

        try {
            // V3.3: Check if textExtractor exists before accessing it
            if (!textExtractor) {
                log('[AutoBoxer] TextExtractor not available, loading directly from PDF');
            }

            // Try to get text content from cache first, or load directly from PDF
            let textContent = textExtractor?.pageTextCache?.get(currentPage);

            if (!textContent || !textContent.items) {
                // Load text content directly from PDF
                const pdfDoc = pdfEngine.pdfDocument;
                if (!pdfDoc) {
                    log('[AutoBoxer] No PDF document available');
                    return;
                }

                const page = await pdfDoc.getPage(currentPage);
                textContent = await page.getTextContent();

                // Cache it for future use (V3.3: added optional chaining)
                if (textExtractor?.pageTextCache) {
                    textExtractor.pageTextCache.set(currentPage, textContent);
                }

                log(`[AutoBoxer] Loaded text content directly: ${textContent.items?.length || 0} items`);
            }

            if (!textContent || !textContent.items) {
                log('[AutoBoxer] No text content available');
                return;
            }

            const pdfDoc = pdfEngine.pdfDocument;
            if (!pdfDoc) return;

            const page = await pdfDoc.getPage(currentPage);
            const viewport = page.getViewport({ scale: 1.0 });
            const pdfHeight = viewport.height;
            const pdfWidth = viewport.width;

            // Get screen dimensions
            const layerWidth = this._getLayerWidth();
            const layerHeight = this._getLayerHeight();
            if (!layerWidth || !layerHeight) return;

            const scaleX = layerWidth / pdfWidth;
            const scaleY = layerHeight / pdfHeight;

            // Convert each text item to screen coordinates
            for (const item of textContent.items) {
                if (!item.str || !item.str.trim() || !item.transform) continue;

                const itemX = item.transform[4];
                const itemYFromBottom = item.transform[5];
                const fontSize = Math.abs(item.transform[0]) || Math.abs(item.transform[3]) || 10;
                const itemWidth = item.width || (item.str.length * fontSize * 0.5);

                // Convert to screen coordinates
                const screenX = itemX * scaleX;
                const screenY = (pdfHeight - itemYFromBottom - fontSize) * scaleY;
                const screenW = itemWidth * scaleX;
                const screenH = fontSize * scaleY * 1.2;

                this._wordBboxes.push({
                    x: screenX,
                    y: screenY,
                    width: screenW,
                    height: screenH,
                    right: screenX + screenW,
                    bottom: screenY + screenH,
                    text: item.str
                });
            }

            log(`[AutoBoxer] Loaded ${this._wordBboxes.length} word bboxes for text obstacle detection`);
        } catch (error) {
            warn('[AutoBoxer] Failed to load word bboxes:', error);
            this._wordBboxes = [];
        }
    }

    // ============ CEILING DETECTION ============

    /**
     * Find ceiling above floor level, between walls
     *
     * ABSOLUTE RULE: Text is an impenetrable physical obstacle.
     * Box expansion MUST STOP at first text contact.
     * Under no condition may a field box overlap text.
     *
     * Flow:
     * 1. Start from floor (baseline)
     * 2. Expand upward
     * 3. First contact with text OR horizontal ink = ceiling
     *
     * TEXT ALWAYS WINS. TEXT ALWAYS BLOCKS.
     */
    _findCeiling(leftX, rightX, floorY) {
        const maxSearch = CONFIG.MAX_SEARCH_UP * this._scale;

        // Convert to screen coordinates for text bbox check
        const screenLeftX = leftX / this._scale;
        const screenRightX = rightX / this._scale;
        const screenFloorY = floorY / this._scale;

        // CRITICAL: Start searching from MINIMUM field height above floor
        // This prevents detecting labels at floor level as ceiling
        const minFieldHeight = CONFIG.MIN_HEIGHT * this._scale;
        const startDy = Math.max(minFieldHeight, 20 * this._scale);  // At least MIN_HEIGHT or 20px

        // Scan upward from floor (starting above minimum field height)
        for (let dy = startDy; dy < maxSearch; dy++) {
            const y = Math.round(floorY - dy);
            if (y < 0) break;

            const screenY = y / this._scale;

            // ============ CHECK 1: TEXT COLLISION (HIGHEST PRIORITY) ============
            // Text is impenetrable - if we hit text, STOP immediately
            // But only if the text is ABOVE the field area, not at floor level
            if (this._isTextCeiling(screenLeftX, screenRightX, screenY, screenFloorY)) {
                log(`[AutoBoxer] Ceiling: TEXT collision at Y=${y} (screen=${screenY.toFixed(0)})`);
                return { y: y + 5 };  // Add small margin below text
            }

            // ============ CHECK 2: INK PATTERN ============
            // Check for horizontal ink across the width
            let inkCount = 0;
            const samples = 10;
            const step = (rightX - leftX) / samples;

            for (let i = 0; i < samples; i++) {
                const sampleX = Math.round(leftX + i * step);
                if (this._isInk(sampleX, y)) inkCount++;
            }

            // If significant ink across the width, this is ceiling
            if (inkCount >= samples * 0.5) {
                log(`[AutoBoxer] Ceiling: INK pattern at Y=${y}`);
                return { y };
            }
        }

        return null;
    }

    /**
     * Check if there's text at a given Y level within the horizontal range
     * Text is an impenetrable ceiling - expansion MUST stop here
     *
     * IMPORTANT: Only text that is significantly ABOVE the floor counts as ceiling.
     * Text at floor level (labels next to input area) should NOT block upward expansion.
     *
     * @param {number} screenLeftX - Left boundary in screen coords
     * @param {number} screenRightX - Right boundary in screen coords
     * @param {number} screenY - Y level to check in screen coords
     * @param {number} screenFloorY - Floor Y level in screen coords (to exclude floor-level text)
     * @returns {boolean} True if text exists at this level
     */
    _isTextCeiling(screenLeftX, screenRightX, screenY, screenFloorY) {
        if (!this._wordBboxes || this._wordBboxes.length === 0) {
            return false;  // No word bboxes, can't check
        }

        const padding = CONFIG.TEXT_PADDING;
        const minDistFromFloor = CONFIG.MIN_HEIGHT;  // Text must be at least MIN_HEIGHT above floor

        for (const word of this._wordBboxes) {
            // CRITICAL: Skip text that's at floor level (not a ceiling)
            // Only consider text that's significantly ABOVE the floor
            const textDistFromFloor = screenFloorY - word.bottom;
            if (textDistFromFloor < minDistFromFloor) {
                continue;  // This text is at/near floor level, not a ceiling
            }

            // Check horizontal overlap: does this word overlap our field width?
            const horizontalOverlap = word.right >= screenLeftX - padding &&
                                       word.x <= screenRightX + padding;

            if (!horizontalOverlap) continue;

            // Check if screenY is within or very close to this word's vertical extent
            // Text blocks from its top to its bottom
            if (screenY >= word.y - padding && screenY <= word.bottom + padding) {
                return true;  // TEXT COLLISION - this is our ceiling
            }
        }

        return false;
    }

    // ============ UTILITIES ============

    /**
     * Get overlay layer width (screen pixels)
     */
    _getLayerWidth() {
        const layer = document.getElementById('overlay-layer');
        return layer?.offsetWidth || 0;
    }

    /**
     * Get overlay layer height (screen pixels)
     */
    _getLayerHeight() {
        const layer = document.getElementById('overlay-layer');
        return layer?.offsetHeight || 0;
    }

    /**
     * Clear pixel cache (call on page change)
     * V3.3: Also clears loading promise
     */
    clearCache() {
        this._pixelData = null;
        this._currentPage = null;
        this._wordBboxes = null;
        this._wordBboxPage = null;
        this._neighborFields = [];  // V3.2: Also clear neighbor fields
        this._loadingPromise = null;  // V3.3: Clear loading lock
        log('[AutoBoxer] Cache cleared');
    }

    // ============ PUBLIC API FOR BBOXREFINER ============

    /**
     * Find left wall starting from a specific X position
     * Used by BboxRefiner for surgical edge updates
     * @param {number} screenX - Starting X in screen pixels
     * @param {number} screenFloorY - Floor Y in screen pixels
     * @returns {Promise<number|null>} Wall X position in screen pixels, or null
     */
    async findLeftWallFrom(screenX, screenFloorY) {
        const loaded = await this._loadPixelData();
        if (!loaded) return null;

        await this._loadWordBboxes();

        const canvasX = Math.round(screenX * this._scale);
        const canvasFloorY = Math.round(screenFloorY * this._scale);

        const wall = this._findLeftWall(canvasX, canvasFloorY, canvasX);
        if (wall) {
            return Math.round(wall.x / this._scale);
        }
        return null;
    }

    /**
     * Find right wall starting from a specific X position
     * Used by BboxRefiner for surgical edge updates
     * @param {number} screenX - Starting X in screen pixels
     * @param {number} screenFloorY - Floor Y in screen pixels
     * @returns {Promise<number|null>} Wall X position in screen pixels, or null
     */
    async findRightWallFrom(screenX, screenFloorY) {
        const loaded = await this._loadPixelData();
        if (!loaded) return null;

        await this._loadWordBboxes();

        const canvasX = Math.round(screenX * this._scale);
        const canvasFloorY = Math.round(screenFloorY * this._scale);

        const wall = this._findRightWall(canvasX, canvasFloorY, canvasX);
        if (wall) {
            return Math.round(wall.x / this._scale);
        }
        return null;
    }

    /**
     * Find floor starting from a specific position
     * Used by BboxRefiner for surgical edge updates
     * @param {number} screenX - X in screen pixels
     * @param {number} screenY - Starting Y in screen pixels
     * @returns {Promise<number|null>} Floor Y position in screen pixels, or null
     */
    async findFloorFrom(screenX, screenY) {
        const loaded = await this._loadPixelData();
        if (!loaded) return null;

        const canvasX = Math.round(screenX * this._scale);
        const canvasY = Math.round(screenY * this._scale);

        const floor = this._findFloor(canvasX, canvasY);
        if (floor) {
            return Math.round(floor.y / this._scale);
        }
        return null;
    }

    /**
     * Find ceiling starting from floor level within given X bounds
     * Used by BboxRefiner for surgical edge updates
     * @param {number} screenLeftX - Left bound in screen pixels
     * @param {number} screenRightX - Right bound in screen pixels
     * @param {number} screenFloorY - Floor Y in screen pixels
     * @returns {Promise<number|null>} Ceiling Y position in screen pixels, or null
     */
    async findCeilingFrom(screenLeftX, screenRightX, screenFloorY) {
        const loaded = await this._loadPixelData();
        if (!loaded) return null;

        await this._loadWordBboxes();

        const canvasLeftX = Math.round(screenLeftX * this._scale);
        const canvasRightX = Math.round(screenRightX * this._scale);
        const canvasFloorY = Math.round(screenFloorY * this._scale);

        const ceiling = this._findCeiling(canvasLeftX, canvasRightX, canvasFloorY);
        if (ceiling) {
            return Math.round(ceiling.y / this._scale);
        }
        return null;
    }

    /**
     * Get current scale factor (screen to canvas)
     */
    getScale() {
        return this._scale;
    }

    /**
     * Check if pixel data is loaded
     */
    isReady() {
        return this._pixelData !== null;
    }

    /**
     * Find text boundary between two X positions (for horizontal expansion)
     * Text is an IMPENETRABLE WALL - expansion cannot cross over text
     * @param {number} fromX - Starting X position (current edge)
     * @param {number} toX - Target X position (search limit)
     * @param {number} floorY - Floor Y for vertical range check
     * @param {string} direction - 'left' or 'right'
     * @returns {Promise<number|null>} X position where text blocks, or null if clear
     */
    async findTextBoundaryX(fromX, toX, floorY, direction) {
        await this._loadWordBboxes();

        log(`[AutoBoxer] findTextBoundaryX: from=${fromX}, to=${toX}, floorY=${floorY}, dir=${direction}, words=${this._wordBboxes?.length || 0}`);

        if (!this._wordBboxes || this._wordBboxes.length === 0) {
            log('[AutoBoxer] No word bboxes loaded!');
            return null;  // No text, expansion is clear
        }

        const padding = CONFIG.TEXT_PADDING;
        const fieldTop = floorY - 40;  // Field height range
        let closestTextBoundary = null;

        // Determine search range
        const minX = Math.min(fromX, toX);
        const maxX = Math.max(fromX, toX);

        log(`[AutoBoxer] Search range X: ${minX}-${maxX}, Y: ${fieldTop}-${floorY}`);

        for (const word of this._wordBboxes) {
            // Check if text is at field level (vertically overlapping)
            const textInVerticalRange = word.bottom >= fieldTop && word.y <= floorY + 10;
            if (!textInVerticalRange) continue;

            // Check if text OVERLAPS with the search range [minX, maxX]
            const textOverlaps = word.x < maxX && word.right > minX;
            if (!textOverlaps) continue;

            // Text is in the way! Calculate where to stop
            if (direction === 'left') {
                // Expanding left: stop at text's right edge + padding
                const boundary = word.right + padding;
                // Only count if boundary is between current edge and search limit
                if (boundary >= toX && boundary < fromX) {
                    if (closestTextBoundary === null || boundary > closestTextBoundary) {
                        closestTextBoundary = boundary;
                    }
                }
            } else {
                // Expanding right: stop at text's left edge - padding
                const boundary = word.x - padding;
                // Only count if boundary is between current edge and search limit
                if (boundary > fromX && boundary <= toX) {
                    if (closestTextBoundary === null || boundary < closestTextBoundary) {
                        closestTextBoundary = boundary;
                    }
                }
            }
        }

        return closestTextBoundary;
    }

    /**
     * Find text boundary between two Y positions (for vertical expansion)
     * @param {number} fromY - Starting Y position (current edge)
     * @param {number} toY - Target Y position (search limit)
     * @param {number} leftX - Left bound of field
     * @param {number} rightX - Right bound of field
     * @param {string} direction - 'up' or 'down'
     * @returns {Promise<number|null>} Y position where text blocks, or null if clear
     */
    async findTextBoundaryY(fromY, toY, leftX, rightX, direction) {
        await this._loadWordBboxes();

        if (!this._wordBboxes || this._wordBboxes.length === 0) {
            return null;
        }

        const padding = CONFIG.TEXT_PADDING;
        let closestTextBoundary = null;

        // Determine search range
        const minY = Math.min(fromY, toY);
        const maxY = Math.max(fromY, toY);

        for (const word of this._wordBboxes) {
            // Check if text is horizontally overlapping with field
            const textInHorizontalRange = word.x < rightX && word.right > leftX;
            if (!textInHorizontalRange) continue;

            // Check if text OVERLAPS with the search range [minY, maxY]
            const textOverlaps = word.y < maxY && word.bottom > minY;
            if (!textOverlaps) continue;

            // Text is in the way! Calculate where to stop
            if (direction === 'up') {
                // Expanding up: stop at text's bottom edge + padding
                const boundary = word.bottom + padding;
                if (boundary >= toY && boundary < fromY) {
                    if (closestTextBoundary === null || boundary > closestTextBoundary) {
                        closestTextBoundary = boundary;
                    }
                }
            } else {
                // Expanding down: stop at text's top edge - padding
                const boundary = word.y - padding;
                if (boundary > fromY && boundary <= toY) {
                    if (closestTextBoundary === null || boundary < closestTextBoundary) {
                        closestTextBoundary = boundary;
                    }
                }
            }
        }

        return closestTextBoundary;
    }
}

// Singleton instance
export const autoBoxer = new AutoBoxer();
