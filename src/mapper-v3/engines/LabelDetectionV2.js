/**
 * LabelDetectionV2 - Smart label detection for radio/checkbox groups
 *
 * STEP 1: Baseline implementation (same behavior as legacy _autoDetectLabels)
 * - LEFT scan 80x24px, fallback to RIGHT scan 80x24px
 * - Debug output support
 *
 * STEP 2: Boundary-aware detection
 * - Groups anchors by row (same Y ± tolerance)
 * - Sorts RTL by X within each row
 * - Label for anchor N ends where anchor N+1 begins (in same row)
 * - Prevents label "stealing" in horizontal checkbox groups
 *
 * Feature flag: window.USE_LABEL_V2 = true
 * Boundary mode: window.LABEL_V2_BOUNDARY = true (Step 2+)
 */
import { state } from '../core/StateManager.js';
import { overlayRenderer } from './OverlayRenderer.js';
import { textExtractor } from './TextExtractor.js';
import { fieldNamer } from './FieldNamer.js';

export class LabelDetectionV2 {
    constructor() {
        // Configuration - Balanced: Find labels but not too wide
        this.config = {
            // Step 1: Balanced label detection
            scanWidth: 60,      // Moderate width - 3-5 words
            scanHeight: 22,     // Single line with some tolerance
            anchorGap: 4,       // Small gap between anchor and scan
            yOffset: -4,        // Slight Y offset

            // Step 2: Boundary-aware settings
            rowTolerance: 14,   // Moderate Y tolerance
            minGap: 8,          // Gap between anchors
            pageLeftMargin: 20, // Default left margin

            // Step 3: Noise filtering settings
            minTokenLength: 2,   // Minimum characters for a valid token
            maxTokenLength: 80,  // Allow reasonable label length

            // Step 4: Vertical group and title detection
            xTolerance: 18,     // X tolerance for vertical grouping
            titleScanHeight: 28, // Height above group to scan for title
            titleMinWidth: 45,  // Minimum width for title scan area
            titleMaxDistance: 38 // Maximum distance from first anchor to title
        };

        // Step 3: Known boilerplate patterns to filter out
        this.boilerplatePatterns = [
            /^\d+$/,                    // Just numbers
            /^[\.\,\:\;\-\_\(\)\[\]]+$/, // Just punctuation
            /^(עמוד|דף)\s*\d+$/,        // Page numbers
            /^\*+$/,                    // Just asterisks
            /^[א-ת]$/,                  // Single Hebrew letter
            /^[a-z]$/i                  // Single English letter
        ];
    }

    /**
     * Main API: Detect labels for all anchors
     * @param {Array} circles - Array of { fieldId, number } from radioGroupBuilder
     * @param {number} page - Current page number
     * @param {boolean} includeDebug - Include debug info in results
     * @returns {Promise<Array>} Array of { circleIndex, label_he, label_en, labelBbox, source, debug? }
     */
    async detectLabels(circles, page, includeDebug = false) {
        const labels = [];

        // Check if boundary mode is enabled (Step 2+)
        const useBoundaryMode = window.LABEL_V2_BOUNDARY === true;

        // Debug: log detection start
        if (includeDebug) {
            console.log('[LabelDetectionV2:DEBUG] ========== V2 DETECTION START ==========');
            console.log('[LabelDetectionV2:DEBUG] Circles count:', circles.length);
            console.log('[LabelDetectionV2:DEBUG] Config:', this.config);
            console.log('[LabelDetectionV2:DEBUG] Page:', page);
            console.log('[LabelDetectionV2:DEBUG] Boundary mode:', useBoundaryMode);
        }

        // Step 1: Get screen positions for all anchors
        const anchorsWithScreen = this._getAnchorsWithScreen(circles, includeDebug);

        if (includeDebug) {
            console.log('[LabelDetectionV2:DEBUG] Anchors with screen positions:', anchorsWithScreen.length);
        }

        if (useBoundaryMode && anchorsWithScreen.length > 1) {
            // ============ STEP 2: BOUNDARY-AWARE DETECTION ============
            // Group anchors by row, calculate boundaries, scan within boundaries
            return await this._detectLabelsWithBoundaries(anchorsWithScreen, includeDebug);
        } else {
            // ============ STEP 1: LEGACY MODE ============
            // Detect label for each anchor independently (same logic as legacy)
            for (let i = 0; i < anchorsWithScreen.length; i++) {
                const anchorData = anchorsWithScreen[i];
                const labelResult = await this._detectLabelForAnchor(anchorData, i, includeDebug);
                labels.push(labelResult);
            }
        }

        // Debug: log detection summary
        if (includeDebug) {
            console.log('[LabelDetectionV2:DEBUG] ========== V2 DETECTION COMPLETE ==========');
            console.log('[LabelDetectionV2:DEBUG] Results:', labels.map(l => ({
                index: l.circleIndex,
                label: l.label_he,
                direction: l.debug?.chosenDirection,
                bbox: l.labelBbox
            })));
        }

        return labels;
    }

    // ============ STEP 2: LINE-BY-LINE DETECTION WITH CHECKBOX AWARENESS ============

    /**
     * Detect labels using line-by-line scanning
     * KEY RULE: Label continues until we hit a line that has ANOTHER checkbox
     * @param {Array} anchorsWithScreen - Array of { fieldId, screen, anchor, index }
     * @param {boolean} includeDebug - Include debug info
     * @returns {Promise<Array>} Labels array
     */
    async _detectLabelsWithBoundaries(anchorsWithScreen, includeDebug) {
        const labels = [];
        const { rowTolerance, minGap, pageLeftMargin, scanHeight, yOffset } = this.config;
        const LINE_HEIGHT = 22;  // Height of one text line in pixels
        const MAX_LINES = 1;     // Single line only - label on same line as checkbox

        // Step 1: Group anchors by row (for X boundaries on same line)
        const rows = this._groupAnchorsByRow(anchorsWithScreen, rowTolerance);

        if (includeDebug) {
            console.log('[LabelDetectionV2:DEBUG] ========== LINE-BY-LINE MODE ==========');
            console.log('[LabelDetectionV2:DEBUG] Total anchors:', anchorsWithScreen.length);
            console.log('[LabelDetectionV2:DEBUG] Grouped into', rows.length, 'rows');
            rows.forEach((row, i) => {
                console.log(`[LabelDetectionV2:DEBUG] Row ${i}: ${row.length} anchors at Y≈${row[0]?.screen.centerY.toFixed(0)}`);
            });
        }

        // Step 2: For each row, sort RTL by X and detect labels
        for (const row of rows) {
            // Sort RTL (right to left) by centerX - highest X first (rightmost)
            row.sort((a, b) => b.screen.centerX - a.screen.centerX);

            if (includeDebug) {
                console.log('[LabelDetectionV2:DEBUG] Processing row RTL:', row.map(a => ({
                    index: a.index,
                    x: a.screen.centerX.toFixed(0)
                })));
            }

            // Step 3: For each anchor in the row
            for (let i = 0; i < row.length; i++) {
                const anchor = row[i];
                const nextAnchorInRow = row[i + 1]; // Next anchor to the LEFT (RTL order)

                // ============ X BOUNDARIES (horizontal) ============
                const rightBoundary = anchor.screen.x - minGap;
                // Limit scan to max 70px to left (3-5 words)
                const maxScanWidth = 70;
                const naturalLeft = nextAnchorInRow
                    ? nextAnchorInRow.screen.x + nextAnchorInRow.screen.width + minGap
                    : pageLeftMargin;
                const leftBoundary = Math.max(naturalLeft, rightBoundary - maxScanWidth);

                // ============ LINE-BY-LINE SCANNING ============
                const labelResult = await this._detectLabelLineByLine(
                    anchor,
                    leftBoundary,
                    rightBoundary,
                    anchorsWithScreen,  // Pass ALL anchors for "has checkbox?" check
                    LINE_HEIGHT,
                    MAX_LINES,
                    rowTolerance,
                    includeDebug
                );

                labels.push(labelResult);
            }
        }

        // Sort labels by original circleIndex to maintain order
        labels.sort((a, b) => a.circleIndex - b.circleIndex);

        // Debug: log detection summary
        if (includeDebug) {
            console.log('[LabelDetectionV2:DEBUG] ========== V2 BOUNDARY DETECTION COMPLETE ==========');
            console.log('[LabelDetectionV2:DEBUG] Results:', labels.map(l => ({
                index: l.circleIndex,
                label: l.label_he,
                boundaries: l.debug?.boundaries,
                bbox: l.labelBbox
            })));
        }

        return labels;
    }

    /**
     * Group anchors by row (same Y ± tolerance)
     * @param {Array} anchors - Array of anchor data
     * @param {number} tolerance - Y tolerance for same-row grouping
     * @returns {Array<Array>} Array of rows, each row is array of anchors
     */
    _groupAnchorsByRow(anchors, tolerance) {
        const rows = [];

        for (const anchor of anchors) {
            const y = anchor.screen.centerY;

            // Find existing row with similar Y
            let foundRow = null;
            for (const row of rows) {
                const rowY = row[0].screen.centerY;
                if (Math.abs(y - rowY) <= tolerance) {
                    foundRow = row;
                    break;
                }
            }

            if (foundRow) {
                foundRow.push(anchor);
            } else {
                rows.push([anchor]);
            }
        }

        return rows;
    }

    /**
     * Find the next anchor below a given anchor (for Y boundary calculation)
     * @param {Object} currentAnchor - The anchor to find the next below
     * @param {Array} anchorsSortedByY - All anchors sorted by Y (top to bottom)
     * @param {number} rowTolerance - Y tolerance to skip anchors in same row
     * @returns {Object|null} Next anchor below or null if none
     */
    _findNextAnchorBelow(currentAnchor, anchorsSortedByY, rowTolerance) {
        const currentY = currentAnchor.screen.centerY;

        for (const anchor of anchorsSortedByY) {
            // Skip same anchor
            if (anchor.index === currentAnchor.index) continue;

            // Skip anchors in the same row (within tolerance)
            if (Math.abs(anchor.screen.centerY - currentY) <= rowTolerance) continue;

            // Found an anchor below
            if (anchor.screen.centerY > currentY) {
                return anchor;
            }
        }

        return null;
    }

    /**
     * Check if there's another checkbox at a given Y position
     * @param {number} y - Y position to check
     * @param {Object} currentAnchor - The current anchor (to exclude)
     * @param {Array} allAnchors - All anchors
     * @param {number} tolerance - Y tolerance for "same line"
     * @returns {Object|null} The other anchor at this Y, or null
     */
    _hasAnotherCheckboxAtY(y, currentAnchor, allAnchors, tolerance) {
        for (const anchor of allAnchors) {
            // Skip the current anchor
            if (anchor.index === currentAnchor.index) continue;

            // Check if this anchor is on the same line (within tolerance)
            if (Math.abs(anchor.screen.centerY - y) <= tolerance) {
                return anchor;  // Found another checkbox on this line
            }
        }
        return null;
    }

    /**
     * Detect label using line-by-line scanning
     * RULE: Continue scanning lines until we hit a line that has ANOTHER checkbox
     * @param {Object} anchor - Current anchor
     * @param {number} leftBoundary - Left X boundary
     * @param {number} rightBoundary - Right X boundary
     * @param {Array} allAnchors - All anchors (for checkbox detection)
     * @param {number} lineHeight - Height of one line
     * @param {number} maxLines - Maximum lines to scan
     * @param {number} rowTolerance - Y tolerance for same-line detection
     * @param {boolean} includeDebug - Include debug info
     * @returns {Promise<Object>} Label result
     */
    async _detectLabelLineByLine(anchor, leftBoundary, rightBoundary, allAnchors, lineHeight, maxLines, rowTolerance, includeDebug) {
        const circleIndex = anchor.index;
        const boundaryWidth = Math.max(0, rightBoundary - leftBoundary);

        const debug = includeDebug ? {
            circleIndex,
            screenPosition: { ...anchor.screen, anchor: anchor.anchor },
            boundaries: { left: leftBoundary, right: rightBoundary, width: boundaryWidth },
            linesScanned: [],
            stoppedReason: null,
            v2Engine: true,
            lineByLineMode: true
        } : null;

        let collectedText = [];
        let lastBbox = null;
        let lastSource = 'none';

        // Start scanning from the anchor's Y position
        let currentY = anchor.screen.y - 5;  // Slightly above center

        if (includeDebug) {
            console.log(`[LabelDetectionV2:DEBUG] Anchor ${circleIndex}: Starting line-by-line scan at Y=${currentY.toFixed(0)}`);
            console.log(`[LabelDetectionV2:DEBUG]   X boundaries: [${leftBoundary.toFixed(0)}, ${rightBoundary.toFixed(0)}], width=${boundaryWidth.toFixed(0)}`);
        }

        // Scan line by line
        for (let lineNum = 0; lineNum < maxLines; lineNum++) {
            const lineY = currentY + (lineNum * lineHeight);

            // ============ KEY CHECK: Is there another checkbox on this line? ============
            // Skip this check for the FIRST line (the anchor's own line)
            if (lineNum > 0) {
                const otherCheckbox = this._hasAnotherCheckboxAtY(lineY + lineHeight/2, anchor, allAnchors, rowTolerance);
                if (otherCheckbox) {
                    if (includeDebug) {
                        console.log(`[LabelDetectionV2:DEBUG]   Line ${lineNum + 1} (Y=${lineY.toFixed(0)}): STOP - found checkbox ${otherCheckbox.index}`);
                    }
                    if (debug) debug.stoppedReason = `Found checkbox ${otherCheckbox.index} at line ${lineNum + 1}`;
                    break;  // Stop! This line belongs to another checkbox
                }
            }

            // Scan this line
            if (boundaryWidth > 10) {
                try {
                    const lineResult = await textExtractor.getTextAtPosition(
                        leftBoundary, lineY, boundaryWidth, lineHeight
                    );

                    if (debug) {
                        debug.linesScanned.push({
                            lineNum: lineNum + 1,
                            y: lineY,
                            bbox: [leftBoundary, lineY, boundaryWidth, lineHeight],
                            text: lineResult.text || '',
                            source: lineResult.source
                        });
                    }

                    if (lineResult.text && lineResult.text.trim()) {
                        collectedText.push(lineResult.text.trim());
                        lastBbox = [leftBoundary, lineY, boundaryWidth, lineHeight];
                        lastSource = lineResult.source;

                        if (includeDebug) {
                            console.log(`[LabelDetectionV2:DEBUG]   Line ${lineNum + 1} (Y=${lineY.toFixed(0)}): "${lineResult.text.trim()}"`);
                        }
                    } else {
                        // Empty line - might be end of label, but continue checking
                        if (includeDebug) {
                            console.log(`[LabelDetectionV2:DEBUG]   Line ${lineNum + 1} (Y=${lineY.toFixed(0)}): (empty)`);
                        }
                        // If we already have text and hit empty line, stop
                        if (collectedText.length > 0) {
                            if (debug) debug.stoppedReason = 'Empty line after text';
                            break;
                        }
                    }
                } catch (error) {
                    console.warn(`[LabelDetectionV2] Line scan error:`, error);
                    if (debug) debug.linesScanned.push({ lineNum: lineNum + 1, y: lineY, error: error.message });
                }
            }
        }

        // Combine collected text
        const fullText = collectedText.join(' ');

        // Apply text filtering
        let finalText = fullText;
        if (fullText) {
            const filterResult = this._filterAndCleanText(fullText, includeDebug);
            if (filterResult.filtered) {
                if (debug) debug.stoppedReason = `Text filtered: ${filterResult.reason}`;
                finalText = '';
            } else {
                finalText = filterResult.text;
            }
        }

        // Build result
        const labelEntry = {
            circleIndex,
            label_he: finalText || '',
            label_en: finalText ? fieldNamer.hebrewToEnglish(finalText) : `option_${circleIndex + 1}`,
            labelBbox: lastBbox,
            source: finalText ? lastSource : 'none'
        };

        if (debug) {
            labelEntry.debug = debug;
        }

        if (includeDebug) {
            console.log(`[LabelDetectionV2:DEBUG] Anchor ${circleIndex} RESULT: "${finalText}" (${collectedText.length} lines)`);
        }

        return labelEntry;
    }

    /**
     * Detect label within calculated boundaries
     * @param {Object} anchor - Anchor data
     * @param {number} leftBoundary - Left boundary X (pixels)
     * @param {number} rightBoundary - Right boundary X (pixels)
     * @param {number} scanY - Y position for scanning
     * @param {number} scanHeight - Height of scan area
     * @param {boolean} includeDebug - Include debug info
     * @returns {Promise<Object>} Label result
     */
    async _detectLabelInBoundary(anchor, leftBoundary, rightBoundary, scanY, scanHeight, includeDebug) {
        const circleIndex = anchor.index;
        const boundaryWidth = Math.max(0, rightBoundary - leftBoundary);

        const debug = includeDebug ? {
            circleIndex,
            screenPosition: { ...anchor.screen, anchor: anchor.anchor },
            boundaries: {
                left: leftBoundary,
                right: rightBoundary,
                width: boundaryWidth
            },
            leftScan: null,
            rightScan: null,
            chosenDirection: null,
            filteredReasons: [],
            v2Engine: true,
            boundaryMode: true
        } : null;

        let foundText = null;
        let foundSource = 'none';
        let foundBbox = null;

        // ============ LEFT SCAN (within boundaries) ============
        if (boundaryWidth > 10) {
            // Only scan if boundary width is reasonable
            const scanLeftX = Math.max(0, leftBoundary);
            const leftBbox = [scanLeftX, scanY, boundaryWidth, scanHeight];

            if (debug) {
                debug.leftScan = { bbox: leftBbox, result: null, error: null };
            }

            try {
                const leftResult = await textExtractor.getTextAtPosition(
                    scanLeftX, scanY, boundaryWidth, scanHeight
                );

                if (debug) {
                    debug.leftScan.result = { text: leftResult.text, source: leftResult.source };
                }

                if (leftResult.text) {
                    foundText = leftResult.text;
                    foundSource = leftResult.source;
                    foundBbox = leftBbox;
                    if (debug) debug.chosenDirection = 'left-boundary';
                    console.log(`[LabelDetectionV2] Circle ${circleIndex + 1} (left-boundary): "${foundText}"`);
                }
            } catch (error) {
                console.warn(`[LabelDetectionV2] Boundary scan error for circle ${circleIndex + 1}:`, error);
                if (debug) debug.leftScan.error = error.message;
            }
        } else {
            if (debug) {
                debug.filteredReasons.push(`Boundary too narrow: ${boundaryWidth.toFixed(0)}px`);
            }
        }

        // ============ RIGHT SCAN (fallback - same as Step 1) ============
        if (!foundText) {
            const scanRightX = anchor.screen.x + anchor.screen.width + this.config.anchorGap;
            const rightBbox = [scanRightX, scanY, this.config.scanWidth, scanHeight];

            if (debug) {
                debug.rightScan = { bbox: rightBbox, result: null, error: null };
            }

            try {
                const rightResult = await textExtractor.getTextAtPosition(
                    scanRightX, scanY, this.config.scanWidth, scanHeight
                );

                if (debug) {
                    debug.rightScan.result = { text: rightResult.text, source: rightResult.source };
                }

                if (rightResult.text) {
                    foundText = rightResult.text;
                    foundSource = rightResult.source;
                    foundBbox = rightBbox;
                    if (debug) debug.chosenDirection = 'right';
                    console.log(`[LabelDetectionV2] Circle ${circleIndex + 1} (right): "${foundText}"`);
                }
            } catch (error) {
                console.warn(`[LabelDetectionV2] Right scan error for circle ${circleIndex + 1}:`, error);
                if (debug) debug.rightScan.error = error.message;
            }
        }

        // ============ STEP 3: FILTER AND CLEAN TEXT ============
        if (foundText) {
            const filterResult = this._filterAndCleanText(foundText, includeDebug);
            if (filterResult.filtered) {
                if (debug) {
                    debug.filteredReasons.push(`Text filtered: "${foundText}" → ${filterResult.reason}`);
                }
                foundText = null;
                foundSource = 'none';
                foundBbox = null;
            } else {
                foundText = filterResult.text;
            }
        }

        // ============ BUILD RESULT ============
        const labelEntry = {
            circleIndex,
            label_he: foundText || '',
            label_en: foundText ? fieldNamer.hebrewToEnglish(foundText) : `option_${circleIndex + 1}`,
            labelBbox: foundBbox,
            source: foundText ? foundSource : 'none'
        };

        if (debug) {
            labelEntry.debug = debug;
            if (!foundText) {
                debug.filteredReasons.push('No text found in boundary or right side');
            }
        }

        if (!foundText) {
            console.log(`[LabelDetectionV2] Circle ${circleIndex + 1}: No text found`);
        }

        return labelEntry;
    }

    // ============ STEP 3: TEXT FILTERING ============

    /**
     * Filter and clean extracted text
     * @param {string} text - Raw extracted text
     * @param {boolean} includeDebug - Include debug info
     * @returns {Object} { text, filtered, reason }
     */
    _filterAndCleanText(text, includeDebug) {
        if (!text) {
            return { text: '', filtered: true, reason: 'empty' };
        }

        // Step 1: Trim and normalize whitespace
        let cleaned = text.trim().replace(/\s+/g, ' ');

        // Step 2: Check length constraints
        if (cleaned.length < this.config.minTokenLength) {
            return { text: cleaned, filtered: true, reason: `too short (${cleaned.length} < ${this.config.minTokenLength})` };
        }

        if (cleaned.length > this.config.maxTokenLength) {
            // Truncate long text to max length
            cleaned = cleaned.substring(0, this.config.maxTokenLength).trim();
            if (includeDebug) {
                console.log(`[LabelDetectionV2:DEBUG] Text truncated to ${this.config.maxTokenLength} chars`);
            }
        }

        // Step 3: Check against boilerplate patterns
        for (const pattern of this.boilerplatePatterns) {
            if (pattern.test(cleaned)) {
                return { text: cleaned, filtered: true, reason: `matches boilerplate: ${pattern}` };
            }
        }

        // Passed all filters
        return { text: cleaned, filtered: false, reason: null };
    }

    /**
     * Check if text is likely a valid label (not noise)
     * @param {string} text - Text to check
     * @returns {boolean} True if valid label
     */
    _isValidLabel(text) {
        if (!text || text.length < this.config.minTokenLength) {
            return false;
        }

        // Check against boilerplate patterns
        for (const pattern of this.boilerplatePatterns) {
            if (pattern.test(text)) {
                return false;
            }
        }

        return true;
    }

    // ============ STEP 4: VERTICAL GROUP + TITLE DETECTION ============

    /**
     * Detect vertical groups (anchors with same X)
     * @param {Array} anchorsWithScreen - Array of anchor data
     * @param {boolean} includeDebug - Include debug info
     * @returns {Object} { verticalGroups, isVertical }
     */
    detectVerticalGroups(anchorsWithScreen, includeDebug) {
        const { xTolerance } = this.config;
        const columns = [];

        for (const anchor of anchorsWithScreen) {
            const x = anchor.screen.centerX;

            // Find existing column with similar X
            let foundColumn = null;
            for (const col of columns) {
                const colX = col[0].screen.centerX;
                if (Math.abs(x - colX) <= xTolerance) {
                    foundColumn = col;
                    break;
                }
            }

            if (foundColumn) {
                foundColumn.push(anchor);
            } else {
                columns.push([anchor]);
            }
        }

        // Check if we have a significant vertical group (more items in column than rows)
        const maxColumnSize = Math.max(...columns.map(c => c.length));
        const isVertical = maxColumnSize >= 2 && maxColumnSize > anchorsWithScreen.length / 2;

        if (includeDebug) {
            console.log('[LabelDetectionV2:DEBUG] Vertical group detection:');
            console.log(`  - Found ${columns.length} columns`);
            console.log(`  - Max column size: ${maxColumnSize}`);
            console.log(`  - Is vertical layout: ${isVertical}`);
            columns.forEach((col, i) => {
                console.log(`  - Column ${i}: ${col.length} anchors, X≈${col[0]?.screen.centerX.toFixed(0)}`);
            });
        }

        return {
            columns,
            isVertical,
            maxColumnSize
        };
    }

    /**
     * Detect group title above a vertical group
     * @param {Array} verticalColumn - Array of anchors in vertical column
     * @param {boolean} includeDebug - Include debug info
     * @returns {Promise<Object|null>} { text, bbox } or null if not found
     */
    async detectGroupTitle(verticalColumn, includeDebug) {
        if (!verticalColumn || verticalColumn.length < 2) {
            return null;
        }

        const { titleScanHeight, titleMinWidth, titleMaxDistance, minGap } = this.config;

        // Sort by Y (top to bottom)
        const sorted = [...verticalColumn].sort((a, b) => a.screen.centerY - b.screen.centerY);
        const topAnchor = sorted[0];

        // Calculate title scan area:
        // - Just above the first (top) anchor
        // - Width: from leftmost anchor to rightmost anchor + padding
        const minX = Math.min(...verticalColumn.map(a => a.screen.x));
        const maxX = Math.max(...verticalColumn.map(a => a.screen.x + a.screen.width));
        const groupWidth = Math.max(titleMinWidth, maxX - minX + 50);

        // Title scan bbox
        const titleScanX = Math.max(0, minX - 20); // Some left padding
        const titleScanY = Math.max(0, topAnchor.screen.y - titleMaxDistance - titleScanHeight);
        const titleScanW = groupWidth;
        const titleScanH = titleMaxDistance;

        if (includeDebug) {
            console.log('[LabelDetectionV2:DEBUG] Title detection:');
            console.log(`  - Top anchor Y: ${topAnchor.screen.y.toFixed(0)}`);
            console.log(`  - Scan area: [${titleScanX.toFixed(0)}, ${titleScanY.toFixed(0)}, ${titleScanW.toFixed(0)}, ${titleScanH.toFixed(0)}]`);
        }

        try {
            const titleResult = await textExtractor.getTextAtPosition(
                titleScanX, titleScanY, titleScanW, titleScanH
            );

            if (titleResult.text) {
                const cleaned = this._filterAndCleanText(titleResult.text, includeDebug);
                if (!cleaned.filtered) {
                    if (includeDebug) {
                        console.log(`[LabelDetectionV2:DEBUG] Group title found: "${cleaned.text}"`);
                    }
                    return {
                        text: cleaned.text,
                        bbox: [titleScanX, titleScanY, titleScanW, titleScanH],
                        source: titleResult.source
                    };
                } else {
                    if (includeDebug) {
                        console.log(`[LabelDetectionV2:DEBUG] Title filtered: "${titleResult.text}" → ${cleaned.reason}`);
                    }
                }
            }
        } catch (error) {
            console.warn('[LabelDetectionV2] Title scan error:', error);
        }

        if (includeDebug) {
            console.log('[LabelDetectionV2:DEBUG] No group title found');
        }

        return null;
    }

    /**
     * Full detection with vertical group and title support (Step 4)
     * @param {Array} circles - Circle data
     * @param {number} page - Current page
     * @param {boolean} includeDebug - Include debug info
     * @returns {Promise<Object>} { labels, groupInfo }
     */
    async detectLabelsWithGroupInfo(circles, page, includeDebug = false) {
        // Run standard label detection
        const labels = await this.detectLabels(circles, page, includeDebug);

        // Get anchors for group analysis
        const anchorsWithScreen = this._getAnchorsWithScreen(circles, includeDebug);

        // Detect vertical groups
        const groupAnalysis = this.detectVerticalGroups(anchorsWithScreen, includeDebug);

        let groupTitle = null;

        // If vertical layout, try to detect group title
        if (groupAnalysis.isVertical && groupAnalysis.columns.length > 0) {
            // Find the largest column (main vertical group)
            const mainColumn = groupAnalysis.columns.reduce((a, b) =>
                a.length > b.length ? a : b
            );

            groupTitle = await this.detectGroupTitle(mainColumn, includeDebug);
        }

        // Build group info (for debug output, not storage)
        const groupInfo = {
            isVertical: groupAnalysis.isVertical,
            columnCount: groupAnalysis.columns.length,
            maxColumnSize: groupAnalysis.maxColumnSize,
            detectedTitle: groupTitle
        };

        if (includeDebug) {
            console.log('[LabelDetectionV2:DEBUG] Group info:', groupInfo);
        }

        return {
            labels,
            groupInfo
        };
    }

    /**
     * Convert circles to screen coordinates
     * @param {Array} circles - Array of { fieldId, number }
     * @param {boolean} includeDebug - Include debug info
     * @returns {Array} Array of { fieldId, screen, anchor, index }
     */
    _getAnchorsWithScreen(circles, includeDebug) {
        const result = [];

        for (let i = 0; i < circles.length; i++) {
            const circle = circles[i];
            let screen = null;
            let anchor = null;

            if (circle.fieldId) {
                const field = state.getField(circle.fieldId);
                if (field && field.anchor) {
                    anchor = field.anchor;
                    const screenPos = overlayRenderer.anchorToScreen(field.anchor);
                    const size = field.overlayWidth || 24;
                    screen = {
                        x: screenPos.x - size / 2,
                        y: screenPos.y - size / 2,
                        width: size,
                        height: size,
                        centerX: screenPos.x,
                        centerY: screenPos.y
                    };
                } else {
                    if (includeDebug) {
                        console.warn(`[LabelDetectionV2:DEBUG] Field ${circle.fieldId} not found or no anchor`);
                    }
                    continue;
                }
            } else if (circle.bbox) {
                // Legacy support
                screen = overlayRenderer.bboxToScreen(circle.bbox);
                screen.centerX = screen.x + screen.width / 2;
                screen.centerY = screen.y + screen.height / 2;
            } else {
                if (includeDebug) {
                    console.warn(`[LabelDetectionV2:DEBUG] Circle ${i} has no fieldId or bbox`);
                }
                continue;
            }

            result.push({
                fieldId: circle.fieldId,
                screen,
                anchor,
                index: i,
                number: circle.number
            });
        }

        return result;
    }

    /**
     * Detect label for a single anchor (Step 1: same logic as legacy)
     * @param {Object} anchorData - { fieldId, screen, anchor, index }
     * @param {number} circleIndex - Index in original circles array
     * @param {boolean} includeDebug - Include debug info
     * @returns {Promise<Object>} Label result
     */
    async _detectLabelForAnchor(anchorData, circleIndex, includeDebug) {
        const { screen, anchor } = anchorData;
        const { scanWidth, scanHeight, anchorGap, yOffset } = this.config;

        const debug = includeDebug ? {
            circleIndex,
            screenPosition: { ...screen, anchor },
            leftScan: null,
            rightScan: null,
            chosenDirection: null,
            filteredReasons: [],
            v2Engine: true
        } : null;

        let foundText = null;
        let foundSource = 'none';
        let foundBbox = null;

        // ============ LEFT SCAN (Hebrew style - most common) ============
        const scanLeftX = Math.max(0, screen.x - scanWidth - anchorGap);
        const scanY = screen.y + yOffset;
        const leftBbox = [scanLeftX, scanY, scanWidth, scanHeight];

        if (debug) {
            debug.leftScan = { bbox: leftBbox, result: null, error: null };
        }

        try {
            const leftResult = await textExtractor.getTextAtPosition(
                scanLeftX, scanY, scanWidth, scanHeight
            );

            if (debug) {
                debug.leftScan.result = { text: leftResult.text, source: leftResult.source };
            }

            if (leftResult.text) {
                foundText = leftResult.text;
                foundSource = leftResult.source;
                foundBbox = leftBbox;
                if (debug) debug.chosenDirection = 'left';
                console.log(`[LabelDetectionV2] Circle ${circleIndex + 1} (left): "${foundText}"`);
            }
        } catch (error) {
            console.warn(`[LabelDetectionV2] Left scan error for circle ${circleIndex + 1}:`, error);
            if (debug) debug.leftScan.error = error.message;
        }

        // ============ RIGHT SCAN (fallback) ============
        if (!foundText) {
            const scanRightX = screen.x + screen.width + anchorGap;
            const rightBbox = [scanRightX, scanY, scanWidth, scanHeight];

            if (debug) {
                debug.rightScan = { bbox: rightBbox, result: null, error: null };
            }

            try {
                const rightResult = await textExtractor.getTextAtPosition(
                    scanRightX, scanY, scanWidth, scanHeight
                );

                if (debug) {
                    debug.rightScan.result = { text: rightResult.text, source: rightResult.source };
                }

                if (rightResult.text) {
                    foundText = rightResult.text;
                    foundSource = rightResult.source;
                    foundBbox = rightBbox;
                    if (debug) debug.chosenDirection = 'right';
                    console.log(`[LabelDetectionV2] Circle ${circleIndex + 1} (right): "${foundText}"`);
                }
            } catch (error) {
                console.warn(`[LabelDetectionV2] Right scan error for circle ${circleIndex + 1}:`, error);
                if (debug) debug.rightScan.error = error.message;
            }
        }

        // ============ BUILD RESULT ============
        const labelEntry = {
            circleIndex,
            label_he: foundText || '',
            label_en: foundText ? fieldNamer.hebrewToEnglish(foundText) : `option_${circleIndex + 1}`,
            labelBbox: foundBbox,
            source: foundText ? foundSource : 'none'
        };

        if (debug) {
            labelEntry.debug = debug;
            if (!foundText) {
                debug.filteredReasons.push('No text found on either side');
            }
        }

        if (!foundText) {
            console.log(`[LabelDetectionV2] Circle ${circleIndex + 1}: No text found on either side`);
        }

        return labelEntry;
    }

    /**
     * Compare V2 results with legacy results for validation
     * @param {Array} v2Results - Results from V2 engine
     * @param {Array} legacyResults - Results from legacy engine
     * @returns {Object} { identical: boolean, differences: Array }
     */
    compareWithLegacy(v2Results, legacyResults) {
        const differences = [];

        if (v2Results.length !== legacyResults.length) {
            return {
                identical: false,
                differences: [`Length mismatch: V2=${v2Results.length}, Legacy=${legacyResults.length}`]
            };
        }

        for (let i = 0; i < v2Results.length; i++) {
            const v2 = v2Results[i];
            const legacy = legacyResults[i];

            if (v2.label_he !== legacy.label_he) {
                differences.push(`Circle ${i}: label_he mismatch - V2="${v2.label_he}", Legacy="${legacy.label_he}"`);
            }
            if (v2.label_en !== legacy.label_en) {
                differences.push(`Circle ${i}: label_en mismatch - V2="${v2.label_en}", Legacy="${legacy.label_en}"`);
            }
            if (v2.source !== legacy.source) {
                differences.push(`Circle ${i}: source mismatch - V2="${v2.source}", Legacy="${legacy.source}"`);
            }
        }

        return {
            identical: differences.length === 0,
            differences
        };
    }
}

// Singleton instance
export const labelDetectionV2 = new LabelDetectionV2();
