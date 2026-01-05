/**
 * Auto-Label Engine - Suggests field names based on nearby PDF text
 * This module analyzes text items from the PDF and suggests field names
 * based on proximity to the drawn field rectangle.
 *
 * Enhanced with SmartLabelScoring for better accuracy.
 * Enhanced with NameFusionEngine for unified name source decision.
 */
(function() {
    'use strict';

    // SmartLabelScoring will be loaded dynamically
    let SmartLabelScoring = null;

    // NameFusionEngine will be loaded dynamically
    let NameFusionEngine = null;

    // Load SmartLabelScoring module dynamically
    (async function loadSmartLabelScoring() {
        try {
            const module = await import('./smart-label-scoring.js');
            SmartLabelScoring = module.SmartLabelScoring;
            console.log('✅ SmartLabelScoring integrated into AutoLabelEngine');
        } catch (error) {
            console.warn('⚠️ SmartLabelScoring could not be loaded, using fallback:', error.message);
            SmartLabelScoring = null;
        }
    })();

    // Load NameFusionEngine module dynamically
    (async function loadNameFusionEngine() {
        try {
            const module = await import('./name-fusion-engine.js');
            NameFusionEngine = module.NameFusionEngine;
            console.log('✅ NameFusionEngine integrated into AutoLabelEngine');
        } catch (error) {
            console.warn('⚠️ NameFusionEngine could not be loaded, using fallback:', error.message);
            NameFusionEngine = null;
        }
    })();

    const AutoLabelEngine = {

        // Confidence threshold for smart scoring
        SMART_SCORE_THRESHOLD: 30,

        /**
         * Suggest a field name based on text near the bbox.
         * Uses NameFusionEngine to unify all name sources when available.
         * Falls back to SmartLabelScoring and old heuristic when fusion unavailable.
         *
         * @param {Object} bbox - { x, y, width, height } in canvas coordinates
         * @param {Array} pageTextItems - list of text items with { str, x, y }
         * @param {Object} options - optional settings { field, skipIfEdited, userCandidate }
         * @returns {Object|null} { label, key, text, score, source } or null if no suggestion
         */
        suggestName(bbox, pageTextItems, options = {}) {
            // Step 1: Validate inputs
            if (!bbox || !pageTextItems || pageTextItems.length === 0) {
                return null;
            }

            // Check if auto-label is disabled for this field
            if (options.field) {
                if (options.field._autoLabelDisabled) {
                    return null;
                }
                // Don't overwrite user-edited names
                if (options.field._userEditedName && options.skipIfEdited !== false) {
                    return null;
                }
            }

            // Calculate bbox center for distance calculations
            const bboxCenterX = bbox.x + bbox.width / 2;
            const bboxCenterY = bbox.y + bbox.height / 2;

            // ============ COLLECT ALL CANDIDATES ============
            const allCandidates = [];

            // Candidate 1: User-provided candidate (highest priority)
            if (options.userCandidate) {
                allCandidates.push({
                    text: options.userCandidate.text,
                    score: options.userCandidate.score || 100,
                    source: 'user',
                    distance: 0,
                    used: false
                });
            }

            // Candidate 2: SmartLabelScoring results
            let scoringResult = null;
            if (SmartLabelScoring) {
                try {
                    scoringResult = SmartLabelScoring.scoreCandidates(bbox, pageTextItems);
                    if (scoringResult && scoringResult.candidates) {
                        // Add all smart scoring candidates
                        for (const c of scoringResult.candidates) {
                            allCandidates.push({
                                text: c.text,
                                score: c.score,
                                source: 'smart',
                                distance: c.details?.distance || 50,
                                used: false
                            });
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ SmartLabelScoring error:', error);
                }
            }

            // Candidate 3: PDF text items (with distance calculation)
            for (const t of pageTextItems) {
                const dx = t.x - bboxCenterX;
                const dy = t.y - bboxCenterY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Check if text is inside the bbox
                const isInside = (
                    t.x >= bbox.x && t.x <= bbox.x + bbox.width &&
                    t.y >= bbox.y && t.y <= bbox.y + bbox.height
                );

                allCandidates.push({
                    text: t.str,
                    score: isInside ? 50 : 20,  // Higher base score if inside bbox
                    source: isInside ? 'pdf_in_field' : 'pdf',
                    distance: distance,
                    used: false
                });
            }

            // Candidate 4: Old heuristic result (as fallback)
            const oldHeuristicResult = this._oldSuggestName(bbox, pageTextItems);
            if (oldHeuristicResult) {
                allCandidates.push({
                    text: oldHeuristicResult.label,
                    score: oldHeuristicResult.score || 25,
                    source: 'auto',
                    distance: oldHeuristicResult.distance || 100,
                    used: false
                });
            }

            // ============ USE FUSION ENGINE IF AVAILABLE ============
            if (NameFusionEngine && allCandidates.length > 0) {
                try {
                    const fused = NameFusionEngine.fuse(allCandidates);

                    if (fused && fused.text && fused.source !== 'none') {
                        // Mark the selected text as used to prevent duplicates
                        if (NameFusionEngine.markAsUsed) {
                            NameFusionEngine.markAsUsed(fused.text);
                        }

                        // ============ DEBUG OVERLAY ============
                        // Show visual debug info if NameDebugOverlay is available
                        if (window.NameDebugOverlay) {
                            // Show debug panel with all candidates
                            const debugCandidates = NameFusionEngine.debug ?
                                NameFusionEngine.debug(allCandidates) : allCandidates;
                            window.NameDebugOverlay.showDebugPanel(debugCandidates, fused);

                            // Show candidate boxes for top candidates
                            allCandidates.slice(0, 5).forEach(c => {
                                if (c.canvasBBox || (c.x !== undefined && c.y !== undefined)) {
                                    const cBbox = c.canvasBBox || {
                                        x: c.x - 20,
                                        y: c.y - 10,
                                        width: 100,
                                        height: 20
                                    };
                                    window.NameDebugOverlay.showCandidateBox(
                                        cBbox,
                                        c.source,
                                        c.text,
                                        c.score
                                    );
                                }
                            });

                            // Show fusion winner
                            if (bbox) {
                                window.NameDebugOverlay.showFusionWinner(bbox, fused.text);
                            }
                        }

                        console.log('🔀 NameFusion result:', {
                            text: fused.text,
                            key: fused.key,
                            source: fused.source,
                            score: fused.score,
                            candidatesCount: allCandidates.length
                        });

                        return {
                            label: fused.text,
                            key: fused.key,
                            text: fused.text,
                            score: fused.score,
                            source: fused.source
                        };
                    }
                } catch (error) {
                    console.warn('⚠️ NameFusionEngine error, falling back to legacy logic:', error);
                }
            }

            // ============ FALLBACK TO LEGACY LOGIC ============
            // This code path is only used if NameFusionEngine is not available
            let chosenText = null;
            let chosenScore = 0;
            let source = 'none';

            // Legacy merge: If scoringResult.bestScore > 30 → use smart scoring
            // Otherwise → use old heuristic
            if (scoringResult && scoringResult.bestScore > this.SMART_SCORE_THRESHOLD) {
                chosenText = scoringResult.bestText;
                chosenScore = scoringResult.bestScore;
                source = 'smart';
            } else if (oldHeuristicResult) {
                chosenText = oldHeuristicResult.label;
                chosenScore = oldHeuristicResult.score || 25;
                source = 'old';
            }

            // If both methods failed
            if (!chosenText) {
                return null;
            }

            // Clean the chosen text
            const cleaned = chosenText
                .replace(/[•:;]/g, "")
                .trim();

            if (!cleaned) {
                return null;
            }

            // Convert to field key
            const key = this._toFieldKey(cleaned);

            return {
                label: cleaned,
                key: key,
                text: cleaned,
                score: chosenScore,
                source: source
            };
        },

        /**
         * Old heuristic method - finds nearest text by distance
         * Preserved for fallback and comparison
         * @private
         */
        _oldSuggestName(bbox, pageTextItems) {
            if (!bbox || !pageTextItems || pageTextItems.length === 0) return null;

            const cx = bbox.x + bbox.width / 2;
            const cy = bbox.y + bbox.height / 2;

            // Find nearest text item by distance to bbox center
            let best = null;
            let bestDist = Infinity;

            for (const t of pageTextItems) {
                const dx = (t.x - cx);
                const dy = (t.y - cy);
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < bestDist) {
                    bestDist = dist;
                    best = t;
                }
            }

            if (!best) return null;

            // Clean the text
            const cleaned = best.str
                .replace(/[•:;]/g, "")
                .trim();

            if (!cleaned) return null;

            // Calculate a simple score based on distance (inverse relationship)
            // Closer = higher score, max 50 for old method
            const score = Math.max(5, Math.min(50, 100 - bestDist));

            return {
                label: cleaned,
                key: this._toFieldKey(cleaned),
                score: score,
                distance: bestDist
            };
        },

        /**
         * Convert Hebrew text to field key
         * @param {string} str - Hebrew text
         * @returns {string} English field key
         */
        _toFieldKey(str) {
            return str
                .normalize("NFKD")
                .replace(/[^\u0590-\u05FFa-zA-Z0-9 ]/g, "")
                .trim()
                .split(/\s+/)
                .map(w => w.toLowerCase())
                .join("_");
        },

        /**
         * Check if SmartLabelScoring is available
         * @returns {boolean}
         */
        isSmartScoringAvailable() {
            return SmartLabelScoring !== null;
        },

        /**
         * Check if NameFusionEngine is available
         * @returns {boolean}
         */
        isFusionEngineAvailable() {
            return NameFusionEngine !== null;
        },

        /**
         * Get scoring details for debugging
         * @param {Object} bbox - Field bounding box
         * @param {Array} pageTextItems - Text items from PDF
         * @returns {Object} Detailed scoring information
         */
        getDetailedScoring(bbox, pageTextItems) {
            if (!SmartLabelScoring) {
                return {
                    available: false,
                    message: 'SmartLabelScoring not loaded'
                };
            }

            try {
                const result = SmartLabelScoring.scoreCandidates(bbox, pageTextItems);
                return {
                    available: true,
                    ...result
                };
            } catch (error) {
                return {
                    available: false,
                    error: error.message
                };
            }
        },

        /**
         * Debug fusion engine with all candidates
         * @param {Object} bbox - Field bounding box
         * @param {Array} pageTextItems - Text items from PDF
         * @param {Object} userCandidate - Optional user-provided candidate
         * @returns {Object} Debug information showing all candidates and fusion result
         */
        debugFusion(bbox, pageTextItems, userCandidate = null) {
            if (!NameFusionEngine) {
                return {
                    available: false,
                    message: 'NameFusionEngine not loaded'
                };
            }

            const bboxCenterX = bbox.x + bbox.width / 2;
            const bboxCenterY = bbox.y + bbox.height / 2;
            const allCandidates = [];

            // Collect user candidate
            if (userCandidate) {
                allCandidates.push({
                    text: userCandidate.text,
                    score: userCandidate.score || 100,
                    source: 'user',
                    distance: 0,
                    used: false
                });
            }

            // Collect smart scoring candidates
            if (SmartLabelScoring) {
                try {
                    const scoringResult = SmartLabelScoring.scoreCandidates(bbox, pageTextItems);
                    if (scoringResult && scoringResult.candidates) {
                        for (const c of scoringResult.candidates) {
                            allCandidates.push({
                                text: c.text,
                                score: c.score,
                                source: 'smart',
                                distance: c.details?.distance || 50,
                                used: false
                            });
                        }
                    }
                } catch (error) {
                    // Ignore errors in debug
                }
            }

            // Collect PDF text items
            for (const t of pageTextItems) {
                const dx = t.x - bboxCenterX;
                const dy = t.y - bboxCenterY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const isInside = (
                    t.x >= bbox.x && t.x <= bbox.x + bbox.width &&
                    t.y >= bbox.y && t.y <= bbox.y + bbox.height
                );

                allCandidates.push({
                    text: t.str,
                    score: isInside ? 50 : 20,
                    source: isInside ? 'pdf_in_field' : 'pdf',
                    distance: distance,
                    used: false
                });
            }

            // Get fusion debug info
            const debugInfo = NameFusionEngine.debug(allCandidates);
            const fusionResult = NameFusionEngine.fuse(allCandidates);

            return {
                available: true,
                candidatesCount: allCandidates.length,
                candidates: debugInfo,
                fusionResult: fusionResult
            };
        }
    };

    // Export to window
    window.AutoLabelEngine = AutoLabelEngine;

    console.log('🏷️ Auto-Label Engine Module Loaded (with Smart Scoring support)');
})();
