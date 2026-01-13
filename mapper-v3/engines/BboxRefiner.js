/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║              BBOXREFINER - PROGRESSIVE BBOX REFINEMENT                     ║
 * ║                      VERSION 1.0.0 - STABLE                                ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  WARNING: THIS MODULE IS PROTECTED - DO NOT MODIFY WITHOUT REVIEW!         ║
 * ║                                                                            ║
 * ║  Last stable update: 2026-01-04                                            ║
 * ║  Tested with: Hebrew PDF forms (101, 106, mipuy)                           ║
 * ║  Dependencies: AutoBoxer, RefinerConfig                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * CONCEPT:
 * Instead of trying to get perfect bbox on first click, we generate
 * a catalog of candidate solutions for each edge. User clicks cycle
 * through these candidates.
 *
 * EDGE CANDIDATES:
 * Each edge (left, right, top, bottom) has its own candidate array:
 * - left:   [wall1, wall2, skipObstacles, alignToNeighbor, pageEdge]
 * - right:  [wall1, wall2, skipObstacles, alignToNeighbor, pageEdge]
 * - top:    [ceiling1, ceiling2, labelBottom, defaultHeight]
 * - bottom: [floor1, bridgedFloor, rowBottom]
 *
 * CLICK LOGIC:
 * - Click OUTSIDE bbox → expand that edge to click point
 * - Click INSIDE near edge → shrink that edge to click point
 * - Drag edge/corner → fine-tune resize
 * - Drag center → move entire bbox
 * - Enter → confirm, Escape → cancel
 *
 * COLLISION PREVENTION:
 * - Text boundaries: Cannot overlap text content
 * - Field boundaries: Cannot overlap existing mapped fields
 */

import { autoBoxer } from './AutoBoxer.js';
import { REFINER_CONFIG, REFINER_VERSION } from './RefinerConfig.js';

// ═══════════════════════════════════════════════════════════════════════════
// MODULE VERSION - Must match RefinerConfig version
// ═══════════════════════════════════════════════════════════════════════════
const MODULE_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - From RefinerConfig.js (DO NOT MODIFY HERE!)
// ═══════════════════════════════════════════════════════════════════════════
const EDGE_PROXIMITY = REFINER_CONFIG.EDGE_PROXIMITY;
const CENTER_ZONE = REFINER_CONFIG.CENTER_ZONE;

export class BboxRefiner {
    constructor() {
        this._currentBbox = null;
        this._candidates = null;
        this._clickPoint = null;
        this._floorY = null;
        this._problemType = null;
        this._neighborBboxes = [];  // Previous fields for alignment

        // V3.2: Wall cycling state
        this._currentCandidateIndex = { left: 0, right: 0, top: 0, bottom: 0 };
        this._hardLimits = { left: 0, right: Infinity, top: 0, bottom: Infinity };
        this._floorBounds = null;  // { leftExtent, rightExtent } from floor detection
    }

    /**
     * Set neighbor bboxes for alignment candidates
     * @param {Array} bboxes - Array of {x, y, width, height}
     */
    setNeighbors(bboxes) {
        this._neighborBboxes = bboxes || [];
    }

    /**
     * First click - compute initial bbox and generate candidates
     * @param {number} clickX
     * @param {number} clickY
     * @returns {Promise<Object>} { bbox, candidates, problemType }
     */
    async initFromClick(clickX, clickY) {
        this._clickPoint = { x: clickX, y: clickY };

        // V3.2: Pass neighbor fields to AutoBoxer so it treats them as walls
        autoBoxer.setNeighborFields(this._neighborBboxes);

        // Get initial bbox from AutoBoxer
        const initialBbox = await autoBoxer.computeBbox(clickX, clickY);

        if (!initialBbox) {
            return null;
        }

        // Adjust bbox to not overlap with existing fields
        this._currentBbox = this._adjustForExistingFields({ ...initialBbox });

        // Detect problem type and generate candidates
        this._problemType = await this._detectProblemType(clickX, clickY, initialBbox);
        this._candidates = await this._generateCandidates(clickX, clickY, initialBbox);

        console.log('[BboxRefiner] Initialized:', {
            bbox: this._currentBbox,
            problemType: this._problemType,
            candidates: {
                left: this._candidates.left.length,
                right: this._candidates.right.length,
                top: this._candidates.top.length,
                bottom: this._candidates.bottom.length
            }
        });

        return {
            bbox: this._currentBbox,
            candidates: this._candidates,
            problemType: this._problemType
        };
    }

    /**
     * Handle click - detect direction and move edge TO click point
     * - Click OUTSIDE bbox → expand that edge TO click point
     * - Click INSIDE near edge → shrink that edge TO click point
     * @param {number} clickX
     * @param {number} clickY
     * @returns {Promise<Object>} { bbox, action, edge, message }
     */
    async refine(clickX, clickY) {
        if (!this._currentBbox) {
            console.warn('[BboxRefiner] No active bbox to refine');
            return null;
        }

        const analysis = this._analyzeClickPosition(clickX, clickY, this._currentBbox);

        console.log('[BboxRefiner] Click analysis:', analysis);

        // Center click = no action
        if (analysis.type === 'CENTER') {
            return {
                bbox: this._currentBbox,
                action: 'none',
                edge: null,
                message: 'לחץ Enter לאישור'
            };
        }

        // Move the edge TO the click point
        const direction = analysis.direction;
        const newBbox = await this._moveEdgeToClickPoint(direction, clickX, clickY);

        if (newBbox) {
            const changed =
                newBbox.x !== this._currentBbox.x ||
                newBbox.y !== this._currentBbox.y ||
                newBbox.width !== this._currentBbox.width ||
                newBbox.height !== this._currentBbox.height;

            if (changed) {
                this._currentBbox = newBbox;
                return {
                    bbox: this._currentBbox,
                    action: analysis.type.toLowerCase(),
                    edge: direction,
                    message: null
                };
            } else {
                return {
                    bbox: this._currentBbox,
                    action: 'none',
                    edge: direction,
                    message: 'טקסט חוסם'
                };
            }
        }

        return {
            bbox: this._currentBbox,
            action: 'none',
            edge: null,
            message: 'לא ניתן לבצע פעולה'
        };
    }

    /**
     * Move edge TO the click point (respecting text AND field boundaries)
     */
    async _moveEdgeToClickPoint(edge, clickX, clickY) {
        const bbox = { ...this._currentBbox };
        const floorY = bbox.y + bbox.height;
        const MIN_SIZE = 20;

        let targetPos, textBoundary, fieldBoundary, newPos;

        switch (edge) {
            case 'left':
                targetPos = clickX;
                if (targetPos < bbox.x) {
                    // Expanding left - check for text AND existing fields
                    textBoundary = await autoBoxer.findTextBoundaryX(bbox.x, targetPos, floorY, 'left');
                    fieldBoundary = this._findFieldBoundaryX(bbox, targetPos, 'left');

                    // Take the closest boundary (highest X value when expanding left)
                    newPos = targetPos;
                    if (textBoundary !== null) newPos = Math.max(newPos, textBoundary);
                    if (fieldBoundary !== null) newPos = Math.max(newPos, fieldBoundary);
                } else {
                    // Shrinking - just go to click point (with min size check)
                    newPos = Math.min(targetPos, bbox.x + bbox.width - MIN_SIZE);
                }
                if (newPos !== bbox.x) {
                    const diff = bbox.x - newPos;
                    bbox.x = newPos;
                    bbox.width += diff;
                }
                break;

            case 'right':
                targetPos = clickX;
                if (targetPos > bbox.x + bbox.width) {
                    // Expanding right - check for text AND existing fields
                    textBoundary = await autoBoxer.findTextBoundaryX(bbox.x + bbox.width, targetPos, floorY, 'right');
                    fieldBoundary = this._findFieldBoundaryX(bbox, targetPos, 'right');

                    // Take the closest boundary (lowest X value when expanding right)
                    newPos = targetPos;
                    if (textBoundary !== null) newPos = Math.min(newPos, textBoundary);
                    if (fieldBoundary !== null) newPos = Math.min(newPos, fieldBoundary);
                } else {
                    // Shrinking
                    newPos = Math.max(targetPos, bbox.x + MIN_SIZE);
                }
                if (newPos !== bbox.x + bbox.width) {
                    bbox.width = newPos - bbox.x;
                }
                break;

            case 'top':
                targetPos = clickY;
                if (targetPos < bbox.y) {
                    // Expanding up - check for text AND existing fields
                    textBoundary = await autoBoxer.findTextBoundaryY(bbox.y, targetPos, bbox.x, bbox.x + bbox.width, 'up');
                    fieldBoundary = this._findFieldBoundaryY(bbox, targetPos, 'up');

                    // Take the closest boundary (highest Y value when expanding up)
                    newPos = targetPos;
                    if (textBoundary !== null) newPos = Math.max(newPos, textBoundary);
                    if (fieldBoundary !== null) newPos = Math.max(newPos, fieldBoundary);
                } else {
                    // Shrinking
                    newPos = Math.min(targetPos, bbox.y + bbox.height - MIN_SIZE);
                }
                if (newPos !== bbox.y) {
                    const diff = bbox.y - newPos;
                    bbox.y = newPos;
                    bbox.height += diff;
                }
                break;

            case 'bottom':
                targetPos = clickY;
                if (targetPos > bbox.y + bbox.height) {
                    // Expanding down - check for text AND existing fields
                    textBoundary = await autoBoxer.findTextBoundaryY(bbox.y + bbox.height, targetPos, bbox.x, bbox.x + bbox.width, 'down');
                    fieldBoundary = this._findFieldBoundaryY(bbox, targetPos, 'down');

                    // Take the closest boundary (lowest Y value when expanding down)
                    newPos = targetPos;
                    if (textBoundary !== null) newPos = Math.min(newPos, textBoundary);
                    if (fieldBoundary !== null) newPos = Math.min(newPos, fieldBoundary);
                } else {
                    // Shrinking
                    newPos = Math.max(targetPos, bbox.y + MIN_SIZE);
                }
                if (newPos !== bbox.y + bbox.height) {
                    bbox.height = newPos - bbox.y;
                }
                break;
        }

        return bbox;
    }

    /**
     * Adjust initial bbox to not overlap with existing fields
     * Shrinks the bbox if it would overlap any neighbor
     */
    _adjustForExistingFields(bbox) {
        console.log('[BboxRefiner] Checking overlap with', this._neighborBboxes.length, 'existing fields');
        if (this._neighborBboxes.length === 0) return bbox;

        const PADDING = 2;
        let adjusted = { ...bbox };
        let wasAdjusted = false;

        for (const field of this._neighborBboxes) {
            // Check if there's overlap
            const overlapLeft = adjusted.x < field.x + field.width;
            const overlapRight = adjusted.x + adjusted.width > field.x;
            const overlapTop = adjusted.y < field.y + field.height;
            const overlapBottom = adjusted.y + adjusted.height > field.y;

            const hasOverlap = overlapLeft && overlapRight && overlapTop && overlapBottom;
            console.log('[BboxRefiner] Field check:', {
                field, adjusted,
                checks: { overlapLeft, overlapRight, overlapTop, overlapBottom },
                hasOverlap
            });

            if (hasOverlap) {
                // There IS overlap - need to shrink
                // Determine which edge to adjust based on which side has less overlap
                const clickX = this._clickPoint.x;
                const clickY = this._clickPoint.y;

                const fieldCenterX = field.x + field.width / 2;
                const fieldCenterY = field.y + field.height / 2;

                // If click is to the right of field center, shrink left edge
                // If click is to the left of field center, shrink right edge
                if (clickX > fieldCenterX) {
                    // Our click is to the right - field is to our left
                    // Shrink our left edge to not overlap
                    const newLeft = field.x + field.width + PADDING;
                    if (newLeft > adjusted.x && newLeft < adjusted.x + adjusted.width - 20) {
                        adjusted.width -= (newLeft - adjusted.x);
                        adjusted.x = newLeft;
                        wasAdjusted = true;
                    }
                } else {
                    // Our click is to the left - field is to our right
                    // Shrink our right edge to not overlap
                    const newRight = field.x - PADDING;
                    if (newRight < adjusted.x + adjusted.width && newRight > adjusted.x + 20) {
                        adjusted.width = newRight - adjusted.x;
                        wasAdjusted = true;
                    }
                }

                // Same for vertical
                if (clickY > fieldCenterY) {
                    // Our click is below - field is above
                    const newTop = field.y + field.height + PADDING;
                    if (newTop > adjusted.y && newTop < adjusted.y + adjusted.height - 20) {
                        adjusted.height -= (newTop - adjusted.y);
                        adjusted.y = newTop;
                        wasAdjusted = true;
                    }
                } else {
                    // Our click is above - field is below
                    const newBottom = field.y - PADDING;
                    if (newBottom < adjusted.y + adjusted.height && newBottom > adjusted.y + 20) {
                        adjusted.height = newBottom - adjusted.y;
                        wasAdjusted = true;
                    }
                }
            }
        }

        if (wasAdjusted) {
            console.log('[BboxRefiner] Adjusted initial bbox to avoid field overlap:', adjusted);
        }

        return adjusted;
    }

    /**
     * Find field boundary in X direction
     * Returns the edge of the closest field that would block expansion
     */
    _findFieldBoundaryX(currentBbox, targetX, direction) {
        if (this._neighborBboxes.length === 0) return null;

        const PADDING = 2;  // Small gap between fields
        const currentTop = currentBbox.y;
        const currentBottom = currentBbox.y + currentBbox.height;

        let boundary = null;

        for (const field of this._neighborBboxes) {
            const fieldTop = field.y;
            const fieldBottom = field.y + field.height;
            const fieldLeft = field.x;
            const fieldRight = field.x + field.width;

            // Check vertical overlap (fields must be on same horizontal band)
            const verticalOverlap = !(currentBottom <= fieldTop || currentTop >= fieldBottom);
            if (!verticalOverlap) continue;

            if (direction === 'left') {
                // Expanding left - find fields to our left that we'd hit
                if (fieldRight <= currentBbox.x && fieldRight > targetX) {
                    const edge = fieldRight + PADDING;
                    if (boundary === null || edge > boundary) {
                        boundary = edge;
                    }
                }
            } else {
                // Expanding right - find fields to our right that we'd hit
                const currentRight = currentBbox.x + currentBbox.width;
                if (fieldLeft >= currentRight && fieldLeft < targetX) {
                    const edge = fieldLeft - PADDING;
                    if (boundary === null || edge < boundary) {
                        boundary = edge;
                    }
                }
            }
        }

        return boundary;
    }

    /**
     * Find field boundary in Y direction
     * Returns the edge of the closest field that would block expansion
     */
    _findFieldBoundaryY(currentBbox, targetY, direction) {
        if (this._neighborBboxes.length === 0) return null;

        const PADDING = 2;  // Small gap between fields
        const currentLeft = currentBbox.x;
        const currentRight = currentBbox.x + currentBbox.width;

        let boundary = null;

        for (const field of this._neighborBboxes) {
            const fieldTop = field.y;
            const fieldBottom = field.y + field.height;
            const fieldLeft = field.x;
            const fieldRight = field.x + field.width;

            // Check horizontal overlap (fields must be on same vertical band)
            const horizontalOverlap = !(currentRight <= fieldLeft || currentLeft >= fieldRight);
            if (!horizontalOverlap) continue;

            if (direction === 'up') {
                // Expanding up - find fields above us that we'd hit
                if (fieldBottom <= currentBbox.y && fieldBottom > targetY) {
                    const edge = fieldBottom + PADDING;
                    if (boundary === null || edge > boundary) {
                        boundary = edge;
                    }
                }
            } else {
                // Expanding down - find fields below us that we'd hit
                const currentBottom = currentBbox.y + currentBbox.height;
                if (fieldTop >= currentBottom && fieldTop < targetY) {
                    const edge = fieldTop - PADDING;
                    if (boundary === null || edge < boundary) {
                        boundary = edge;
                    }
                }
            }
        }

        return boundary;
    }

    /**
     * Get current bbox
     */
    getCurrentBbox() {
        return this._currentBbox;
    }

    /**
     * Reset refiner state
     */
    reset() {
        this._currentBbox = null;
        this._candidates = null;
        this._clickPoint = null;
        this._floorY = null;
        this._problemType = null;

        // V3.2: Reset cycling state
        this._currentCandidateIndex = { left: 0, right: 0, top: 0, bottom: 0 };
        this._hardLimits = { left: 0, right: Infinity, top: 0, bottom: Infinity };
        this._floorBounds = null;
    }

    // ==================== V3.2: WALL CYCLING ====================

    /**
     * Cycle to the next wall candidate for a given edge
     * @param {string} edge - 'left', 'right', 'top', or 'bottom'
     * @returns {Object|null} { bbox, action, message } or null if can't cycle
     */
    cycleWall(edge) {
        if (!this._currentBbox || !this._candidates) {
            console.warn('[BboxRefiner] No active bbox to cycle');
            return null;
        }

        const candidates = this._candidates[edge];
        if (!candidates || candidates.length === 0) {
            return { bbox: this._currentBbox, action: 'none', message: 'אין מועמדים' };
        }

        const currentIndex = this._currentCandidateIndex[edge];
        const nextIndex = currentIndex + 1;

        // Check if we've reached the end of candidates
        if (nextIndex >= candidates.length) {
            console.log(`[BboxRefiner] cycleWall ${edge}: Already at last candidate`);
            return { bbox: this._currentBbox, action: 'none', message: 'הגעת לקיר האחרון' };
        }

        const nextCandidate = candidates[nextIndex];

        // Check if next candidate exceeds hard limit
        if (this._exceedsHardLimit(edge, nextCandidate.value)) {
            console.log(`[BboxRefiner] cycleWall ${edge}: Next candidate exceeds hard limit`);
            return { bbox: this._currentBbox, action: 'blocked', message: 'חסום ע"י קיר קשיח' };
        }

        // Apply the candidate
        this._currentCandidateIndex[edge] = nextIndex;
        const newBbox = this._applyCandidate(edge, nextCandidate);

        console.log(`[BboxRefiner] cycleWall ${edge}: Moved to candidate ${nextIndex} (${nextCandidate.type})`);

        return {
            bbox: newBbox,
            action: 'cycle',
            edge: edge,
            candidate: nextCandidate,
            message: nextCandidate.description
        };
    }

    /**
     * Cycle back to the previous wall candidate for a given edge
     * @param {string} edge - 'left', 'right', 'top', or 'bottom'
     * @returns {Object|null} { bbox, action, message } or null if can't cycle
     */
    cycleWallBack(edge) {
        if (!this._currentBbox || !this._candidates) {
            console.warn('[BboxRefiner] No active bbox to cycle');
            return null;
        }

        const candidates = this._candidates[edge];
        if (!candidates || candidates.length === 0) {
            return { bbox: this._currentBbox, action: 'none', message: 'אין מועמדים' };
        }

        const currentIndex = this._currentCandidateIndex[edge];

        // Check if we're already at the first candidate
        if (currentIndex <= 0) {
            console.log(`[BboxRefiner] cycleWallBack ${edge}: Already at first candidate`);
            return { bbox: this._currentBbox, action: 'none', message: 'הגעת לקיר הראשון' };
        }

        const prevIndex = currentIndex - 1;
        const prevCandidate = candidates[prevIndex];

        // Apply the candidate
        this._currentCandidateIndex[edge] = prevIndex;
        const newBbox = this._applyCandidate(edge, prevCandidate);

        console.log(`[BboxRefiner] cycleWallBack ${edge}: Moved to candidate ${prevIndex} (${prevCandidate.type})`);

        return {
            bbox: newBbox,
            action: 'cycle_back',
            edge: edge,
            candidate: prevCandidate,
            message: prevCandidate.description
        };
    }

    /**
     * Check if a value exceeds the hard limit for an edge
     */
    _exceedsHardLimit(edge, value) {
        switch (edge) {
            case 'left':
                return value < this._hardLimits.left;
            case 'right':
                return value > this._hardLimits.right;
            case 'top':
                return value < this._hardLimits.top;
            case 'bottom':
                return value > this._hardLimits.bottom;
            default:
                return false;
        }
    }

    /**
     * Apply a candidate to the current bbox
     */
    _applyCandidate(edge, candidate) {
        const bbox = { ...this._currentBbox };

        switch (edge) {
            case 'left':
                const deltaLeft = bbox.x - candidate.value;
                bbox.x = candidate.value;
                bbox.width += deltaLeft;
                break;
            case 'right':
                bbox.width = candidate.value - bbox.x;
                break;
            case 'top':
                const deltaTop = bbox.y - candidate.value;
                bbox.y = candidate.value;
                bbox.height += deltaTop;
                break;
            case 'bottom':
                bbox.height = candidate.value - bbox.y;
                break;
        }

        this._currentBbox = bbox;
        return bbox;
    }

    /**
     * Get current candidate info for an edge (for UI display)
     */
    getCandidateInfo(edge) {
        if (!this._candidates || !this._candidates[edge]) return null;

        const candidates = this._candidates[edge];
        const currentIndex = this._currentCandidateIndex[edge];

        return {
            current: candidates[currentIndex],
            currentIndex,
            total: candidates.length,
            hasNext: currentIndex < candidates.length - 1,
            hasPrev: currentIndex > 0
        };
    }

    // ==================== PROBLEM DETECTION ====================

    /**
     * Detect what type of problem exists in this area
     * @returns {string} Problem type
     */
    async _detectProblemType(clickX, clickY, bbox) {
        const problems = [];

        // Check for slash characters (/) in the bbox area
        if (await this._hasSlashesInArea(bbox)) {
            problems.push('SLASHES');
        }

        // Check for dashed floor
        if (this._hasDashedFloor(bbox)) {
            problems.push('DASHED_FLOOR');
        }

        // Check for text inside field area
        if (await this._hasTextInside(bbox)) {
            problems.push('TEXT_INSIDE');
        }

        // Check if no clear walls
        if (!this._hasWalls(bbox)) {
            problems.push('NO_WALLS');
        }

        return problems.length > 0 ? problems.join('+') : 'NORMAL';
    }

    async _hasSlashesInArea(bbox) {
        // Check if there are "/" characters in the area
        // This would be detected via text extraction
        try {
            const textContent = await this._getTextInBbox(bbox);
            return textContent && textContent.includes('/');
        } catch {
            return false;
        }
    }

    _hasDashedFloor(bbox) {
        // Would check pixel data for dashed pattern
        // For now, return false - will be enhanced
        return false;
    }

    async _hasTextInside(bbox) {
        try {
            const textContent = await this._getTextInBbox(bbox);
            return textContent && textContent.length > 0;
        } catch {
            return false;
        }
    }

    _hasWalls(bbox) {
        // Check if bbox has clear vertical boundaries
        // If bbox width is close to default, probably no walls found
        return bbox.width > 100;  // Rough heuristic
    }

    async _getTextInBbox(bbox) {
        // Would use textExtractor - placeholder for now
        return '';
    }

    // ==================== CANDIDATE GENERATION ====================

    /**
     * Generate candidate arrays for each edge
     */
    async _generateCandidates(clickX, clickY, initialBbox) {
        const candidates = {
            left: [],
            right: [],
            top: [],
            bottom: []
        };

        // LEFT EDGE CANDIDATES
        candidates.left = this._generateLeftCandidates(clickX, clickY, initialBbox);

        // RIGHT EDGE CANDIDATES
        candidates.right = this._generateRightCandidates(clickX, clickY, initialBbox);

        // TOP EDGE CANDIDATES
        candidates.top = this._generateTopCandidates(clickX, clickY, initialBbox);

        // BOTTOM EDGE CANDIDATES
        candidates.bottom = this._generateBottomCandidates(clickX, clickY, initialBbox);

        return candidates;
    }

    _generateLeftCandidates(clickX, clickY, bbox) {
        const candidates = [];
        const floorY = bbox.y + bbox.height;

        // V3.2: ALWAYS add current position as candidate[0]
        // This ensures cycling starts from current and goes to next wall
        candidates.push({
            type: 'CURRENT',
            value: bbox.x,
            description: 'מיקום נוכחי',
            isHard: false
        });

        // V3.2: Use AutoBoxer's findAllWalls to get all candidates with hard/soft classification
        const { walls, hardLimit } = autoBoxer.findAllWalls(clickX, floorY, 'left', this._floorBounds);

        // Store hard limit
        this._hardLimits.left = hardLimit;

        // Add walls as candidates
        for (const wall of walls) {
            // Skip walls beyond the current bbox (we're looking for walls to expand TO)
            if (wall.x >= bbox.x) continue;

            candidates.push({
                type: wall.type,
                value: wall.x,
                description: wall.description,
                isHard: wall.isHard
            });
        }

        // Add neighbor alignment if available
        const neighborX = this._findNeighborAlignment('left');
        if (neighborX !== null && neighborX < bbox.x) {
            candidates.push({
                type: 'ALIGN_NEIGHBOR',
                value: neighborX,
                description: 'יישור לשדה שכן',
                isHard: false
            });
        }

        // Sort by distance from current edge (closest first), but keep CURRENT at index 0
        const currentCandidate = candidates[0];
        const otherCandidates = candidates.slice(1);
        otherCandidates.sort((a, b) => (bbox.x - a.value) - (bbox.x - b.value));

        const result = [currentCandidate, ...otherCandidates];

        console.log(`[BboxRefiner] Left candidates: ${result.length}`, result.map(c => `${c.type}:${Math.round(c.value)}`));

        return result;
    }

    _generateRightCandidates(clickX, clickY, bbox) {
        const candidates = [];
        const floorY = bbox.y + bbox.height;
        const bboxRight = bbox.x + bbox.width;

        // V3.2: ALWAYS add current position as candidate[0]
        // This ensures cycling starts from current and goes to next wall
        candidates.push({
            type: 'CURRENT',
            value: bboxRight,
            description: 'מיקום נוכחי',
            isHard: false
        });

        // V3.2: Use AutoBoxer's findAllWalls to get all candidates with hard/soft classification
        const { walls, hardLimit } = autoBoxer.findAllWalls(clickX, floorY, 'right', this._floorBounds);

        // Store hard limit
        this._hardLimits.right = hardLimit;

        // Add walls as candidates
        for (const wall of walls) {
            // Skip walls before the current bbox right edge (we're looking for walls to expand TO)
            if (wall.x <= bboxRight) continue;

            candidates.push({
                type: wall.type,
                value: wall.x,
                description: wall.description,
                isHard: wall.isHard
            });
        }

        // Add neighbor alignment if available
        const neighborX = this._findNeighborAlignment('right');
        if (neighborX !== null && neighborX > bboxRight) {
            candidates.push({
                type: 'ALIGN_NEIGHBOR',
                value: neighborX,
                description: 'יישור לשדה שכן',
                isHard: false
            });
        }

        // Sort by distance from current edge (closest first), but keep CURRENT at index 0
        const currentCandidate = candidates[0];
        const otherCandidates = candidates.slice(1);
        otherCandidates.sort((a, b) => (a.value - bboxRight) - (b.value - bboxRight));

        const result = [currentCandidate, ...otherCandidates];

        console.log(`[BboxRefiner] Right candidates: ${result.length}`, result.map(c => `${c.type}:${Math.round(c.value)}`));

        return result;
    }

    _generateTopCandidates(clickX, clickY, bbox) {
        const candidates = [];

        // Candidate 0: Current ceiling
        candidates.push({
            type: 'FIRST_CEILING',
            value: bbox.y,
            description: 'תקרה ראשונה'
        });

        // Candidate 1: Below label (if label detected above)
        const labelBottomY = this._findLabelBottom(clickX, bbox.y);
        if (labelBottomY !== null) {
            candidates.push({
                type: 'BELOW_LABEL',
                value: labelBottomY,
                description: 'מתחת לתווית'
            });
        }

        // Candidate 2: Default height from floor
        const floorY = bbox.y + bbox.height;
        const defaultTopY = floorY - 24;  // Default field height
        candidates.push({
            type: 'DEFAULT_HEIGHT',
            value: defaultTopY,
            description: 'גובה ברירת מחדל'
        });

        // Candidate 3: Align to neighbor
        const neighborY = this._findNeighborAlignment('top');
        if (neighborY !== null) {
            candidates.push({
                type: 'ALIGN_NEIGHBOR',
                value: neighborY,
                description: 'יישור לשדה שכן'
            });
        }

        return candidates;
    }

    _generateBottomCandidates(clickX, clickY, bbox) {
        const candidates = [];
        const bboxBottom = bbox.y + bbox.height;

        // Candidate 0: Current floor
        candidates.push({
            type: 'FIRST_FLOOR',
            value: bboxBottom,
            description: 'ריצפה ראשונה'
        });

        // Candidate 1: Bridged floor (for dashed lines)
        const bridgedFloorY = this._findBridgedFloor(clickX, bboxBottom);
        if (bridgedFloorY !== null && bridgedFloorY !== bboxBottom) {
            candidates.push({
                type: 'BRIDGED_FLOOR',
                value: bridgedFloorY,
                description: 'ריצפה מגושרת (קווקווים)'
            });
        }

        // Candidate 2: Row bottom (table row)
        const rowBottomY = this._findRowBottom(clickX, bboxBottom);
        if (rowBottomY !== null) {
            candidates.push({
                type: 'ROW_BOTTOM',
                value: rowBottomY,
                description: 'תחתית השורה'
            });
        }

        return candidates;
    }

    // ==================== EDGE OPERATIONS ====================

    // Maximum expansion per click (prevents running to end of page)
    static MAX_STEP = 40;

    /**
     * Expand in a direction - find next boundary OR expand by MAX_STEP
     * CRITICAL RULES:
     * 1. Text is IMPENETRABLE - never cross text
     * 2. Physics boundaries (walls/floors) are respected
     * 3. If no boundary found, expand by MAX_STEP only (not to infinity)
     */
    async _expandInDirection(direction) {
        const bbox = { ...this._currentBbox };
        const floorY = bbox.y + bbox.height;
        const MAX_STEP = BboxRefiner.MAX_STEP;

        console.log(`[BboxRefiner] _expandInDirection: ${direction}, bbox:`, bbox, 'floorY:', floorY);

        let currentEdge, searchLimit, textBoundary, physicsBoundary, newEdge;

        switch (direction) {
            case 'left':
                currentEdge = bbox.x;
                searchLimit = currentEdge - MAX_STEP;  // Don't search beyond MAX_STEP

                // 1. Check for text in the way
                textBoundary = await autoBoxer.findTextBoundaryX(currentEdge, searchLimit, floorY, 'left');

                // 2. Check for physics wall
                physicsBoundary = await autoBoxer.findLeftWallFrom(currentEdge - 5, floorY);

                // 3. Determine new edge position
                if (textBoundary !== null && textBoundary > searchLimit) {
                    // Text blocks - stop at text
                    newEdge = textBoundary;
                    console.log(`[BboxRefiner] LEFT: text boundary at ${textBoundary}`);
                } else if (physicsBoundary !== null && physicsBoundary > searchLimit && physicsBoundary < currentEdge) {
                    // Wall found within range
                    newEdge = physicsBoundary;
                    console.log(`[BboxRefiner] LEFT: wall at ${physicsBoundary}`);
                } else {
                    // No boundary - expand by MAX_STEP
                    newEdge = searchLimit;
                    console.log(`[BboxRefiner] LEFT: no boundary, step to ${newEdge}`);
                }

                // Apply if actually expanding
                if (newEdge < currentEdge) {
                    const diff = currentEdge - newEdge;
                    bbox.x = newEdge;
                    bbox.width += diff;
                }
                break;

            case 'right':
                currentEdge = bbox.x + bbox.width;
                searchLimit = currentEdge + MAX_STEP;

                textBoundary = await autoBoxer.findTextBoundaryX(currentEdge, searchLimit, floorY, 'right');
                physicsBoundary = await autoBoxer.findRightWallFrom(currentEdge + 5, floorY);

                if (textBoundary !== null && textBoundary < searchLimit) {
                    newEdge = textBoundary;
                    console.log(`[BboxRefiner] RIGHT: text boundary at ${textBoundary}`);
                } else if (physicsBoundary !== null && physicsBoundary < searchLimit && physicsBoundary > currentEdge) {
                    newEdge = physicsBoundary;
                    console.log(`[BboxRefiner] RIGHT: wall at ${physicsBoundary}`);
                } else {
                    newEdge = searchLimit;
                    console.log(`[BboxRefiner] RIGHT: no boundary, step to ${newEdge}`);
                }

                if (newEdge > currentEdge) {
                    bbox.width = newEdge - bbox.x;
                }
                break;

            case 'top':
                currentEdge = bbox.y;
                searchLimit = currentEdge - MAX_STEP;

                textBoundary = await autoBoxer.findTextBoundaryY(currentEdge, searchLimit, bbox.x, bbox.x + bbox.width, 'up');
                physicsBoundary = await autoBoxer.findCeilingFrom(bbox.x, bbox.x + bbox.width, currentEdge - 5);

                if (textBoundary !== null && textBoundary > searchLimit) {
                    newEdge = textBoundary;
                    console.log(`[BboxRefiner] TOP: text boundary at ${textBoundary}`);
                } else if (physicsBoundary !== null && physicsBoundary > searchLimit && physicsBoundary < currentEdge) {
                    newEdge = physicsBoundary;
                    console.log(`[BboxRefiner] TOP: ceiling at ${physicsBoundary}`);
                } else {
                    newEdge = searchLimit;
                    console.log(`[BboxRefiner] TOP: no boundary, step to ${newEdge}`);
                }

                if (newEdge < currentEdge) {
                    const diff = currentEdge - newEdge;
                    bbox.y = newEdge;
                    bbox.height += diff;
                }
                break;

            case 'bottom':
                currentEdge = bbox.y + bbox.height;
                searchLimit = currentEdge + MAX_STEP;

                textBoundary = await autoBoxer.findTextBoundaryY(currentEdge, searchLimit, bbox.x, bbox.x + bbox.width, 'down');
                physicsBoundary = await autoBoxer.findFloorFrom(bbox.x + bbox.width / 2, currentEdge + 5);

                if (textBoundary !== null && textBoundary < searchLimit) {
                    newEdge = textBoundary;
                    console.log(`[BboxRefiner] BOTTOM: text boundary at ${textBoundary}`);
                } else if (physicsBoundary !== null && physicsBoundary < searchLimit && physicsBoundary > currentEdge) {
                    newEdge = physicsBoundary;
                    console.log(`[BboxRefiner] BOTTOM: floor at ${physicsBoundary}`);
                } else {
                    newEdge = searchLimit;
                    console.log(`[BboxRefiner] BOTTOM: no boundary, step to ${newEdge}`);
                }

                if (newEdge > currentEdge) {
                    bbox.height = newEdge - bbox.y;
                }
                break;
        }

        return bbox;
    }

    /**
     * Shrink in a direction - move edge INWARD by a fixed step
     * Simpler than expand - just move inward step by step
     */
    async _shrinkInDirection(direction) {
        const bbox = { ...this._currentBbox };
        const SHRINK_STEP = 15;  // Smaller steps for shrinking
        const MIN_SIZE = 20;    // Minimum bbox dimension

        switch (direction) {
            case 'left':
                // Shrink left = move left edge RIGHT
                if (bbox.width > MIN_SIZE + SHRINK_STEP) {
                    bbox.x += SHRINK_STEP;
                    bbox.width -= SHRINK_STEP;
                    console.log(`[BboxRefiner] Shrink LEFT by ${SHRINK_STEP}px`);
                }
                break;

            case 'right':
                // Shrink right = move right edge LEFT
                if (bbox.width > MIN_SIZE + SHRINK_STEP) {
                    bbox.width -= SHRINK_STEP;
                    console.log(`[BboxRefiner] Shrink RIGHT by ${SHRINK_STEP}px`);
                }
                break;

            case 'top':
                // Shrink top = move top edge DOWN
                if (bbox.height > MIN_SIZE + SHRINK_STEP) {
                    bbox.y += SHRINK_STEP;
                    bbox.height -= SHRINK_STEP;
                    console.log(`[BboxRefiner] Shrink TOP by ${SHRINK_STEP}px`);
                }
                break;

            case 'bottom':
                // Shrink bottom = move bottom edge UP
                if (bbox.height > MIN_SIZE + SHRINK_STEP) {
                    bbox.height -= SHRINK_STEP;
                    console.log(`[BboxRefiner] Shrink BOTTOM by ${SHRINK_STEP}px`);
                }
                break;
        }

        return bbox;
    }

    // ==================== CLICK ANALYSIS ====================

    /**
     * Analyze click position relative to bbox BOUNDS (not center)
     * More intuitive:
     * - Click OUTSIDE bbox → expand in that direction
     * - Click INSIDE near edge → shrink that edge
     */
    _analyzeClickPosition(clickX, clickY, bbox) {
        const left = bbox.x;
        const right = bbox.x + bbox.width;
        const top = bbox.y;
        const bottom = bbox.y + bbox.height;

        // Margin for "outside" detection (clicks very close to edge count as outside)
        const OUTSIDE_MARGIN = 3;

        // ========== OUTSIDE CHECKS ==========
        // Click is clearly outside bbox → EXPAND in that direction

        if (clickX < left - OUTSIDE_MARGIN) {
            return { type: 'EXPAND', direction: 'left' };
        }
        if (clickX > right + OUTSIDE_MARGIN) {
            return { type: 'EXPAND', direction: 'right' };
        }
        if (clickY < top - OUTSIDE_MARGIN) {
            return { type: 'EXPAND', direction: 'top' };
        }
        if (clickY > bottom + OUTSIDE_MARGIN) {
            return { type: 'EXPAND', direction: 'bottom' };
        }

        // ========== INSIDE CHECKS ==========
        // Click is inside bbox → SHRINK based on proximity to edge

        const distToLeft = clickX - left;
        const distToRight = right - clickX;
        const distToTop = clickY - top;
        const distToBottom = bottom - clickY;

        // Find which edge is closest
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

        // Edge proximity threshold (proportional to bbox size)
        const edgeThreshold = Math.min(25, bbox.width * 0.3, bbox.height * 0.3);

        if (minDist <= edgeThreshold) {
            // Near an edge → shrink that edge
            if (minDist === distToLeft) {
                return { type: 'SHRINK', direction: 'left' };
            }
            if (minDist === distToRight) {
                return { type: 'SHRINK', direction: 'right' };
            }
            if (minDist === distToTop) {
                return { type: 'SHRINK', direction: 'top' };
            }
            if (minDist === distToBottom) {
                return { type: 'SHRINK', direction: 'bottom' };
            }
        }

        // Click in center area → no action
        return { type: 'CENTER', direction: null };
    }

    // ==================== HELPER METHODS ====================

    _findWallSkippingSmall(startX, floorY, direction) {
        // This would use AutoBoxer's pixel scanning
        // Skip walls shorter than 20px, find next substantial wall
        // Placeholder - returns null for now
        return null;
    }

    _findNeighborAlignment(edge) {
        if (this._neighborBboxes.length === 0) return null;

        // Find closest neighbor's corresponding edge
        // Placeholder - would implement proper neighbor finding
        return null;
    }

    _findWhiteSpaceEdge(startX, floorY, direction) {
        // Find edge of continuous white space
        // Placeholder
        return null;
    }

    _findLabelBottom(x, currentTop) {
        // Find bottom of label text above current position
        // Placeholder
        return null;
    }

    _findBridgedFloor(x, currentBottom) {
        // Find floor by bridging gaps in dashed lines
        // Placeholder
        return null;
    }

    _findRowBottom(x, currentBottom) {
        // Find bottom of table row
        // Placeholder
        return null;
    }

    _getPageWidth() {
        const layer = document.getElementById('overlay-layer');
        return layer?.offsetWidth || 800;
    }

    _getPageHeight() {
        const layer = document.getElementById('overlay-layer');
        return layer?.offsetHeight || 1000;
    }
}

// Singleton
export const bboxRefiner = new BboxRefiner();
