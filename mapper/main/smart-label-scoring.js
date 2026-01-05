/**
 * Smart Label Scoring Engine
 * Advanced scoring system for choosing the best field-label text
 * based on proximity, alignment, keywords, and font characteristics.
 */

export class SmartLabelScoring {

    // Hebrew field keywords that indicate a label
    static FIELD_KEYWORDS = [
        "שם", "תאריך", "טלפון", "רחוב", "מספר", "בית",
        "ישוב", "משפחה", "ת\"ז", "זהות"
    ];

    // Scoring constants
    static SCORES = {
        // Distance scoring
        INSIDE_FIELD: 100,
        TOUCHING_TOP: 60,
        CLOSE_ABOVE: 40,      // <=12px above
        BELOW_FIELD: -60,

        // Alignment scoring
        LEFT_ALIGNED: 20,
        CENTERED: 10,
        MISALIGNED: -15,      // >30px drift

        // Keyword boost
        KEYWORD_MATCH: 25,

        // Font size scoring
        SMALL_FONT: 20,       // 9-11px
        MEDIUM_FONT: 5,       // 12-14px
        LARGE_FONT: -20       // >14px
    };

    // Thresholds
    static THRESHOLDS = {
        CLOSE_ABOVE_DISTANCE: 12,
        ALIGNMENT_DRIFT_PENALTY: 30,
        MAX_TEXT_LENGTH: 22,
        MAX_FONT_SIZE: 18,
        MAX_DISTANCE_FROM_CENTER: 130
    };

    /**
     * Score all candidate text items and return the best match
     * @param {Object} fieldBBox - { x, y, width, height } in PDF coordinates
     * @param {Array} textItems - [{ str, x, y, width, height, fontSize }] from PDF.js
     * @returns {Object} { bestText, bestScore, candidates }
     */
    static scoreCandidates(fieldBBox, textItems) {
        if (!fieldBBox || !textItems || textItems.length === 0) {
            return {
                bestText: null,
                bestScore: 0,
                candidates: []
            };
        }

        const candidates = [];

        // Calculate field center for distance calculations
        const fieldCenterX = fieldBBox.x + fieldBBox.width / 2;
        const fieldCenterY = fieldBBox.y + fieldBBox.height / 2;

        for (const item of textItems) {
            // Apply noise filtering - skip disqualified items
            if (this._isDisqualified(item, fieldCenterX, fieldCenterY)) {
                continue;
            }

            const scoreDetails = this._calculateScore(item, fieldBBox, fieldCenterX, fieldCenterY);

            candidates.push({
                text: item.str.trim(),
                score: scoreDetails.totalScore,
                details: scoreDetails
            });
        }

        // Sort by score descending
        candidates.sort((a, b) => b.score - a.score);

        // Get best match
        const best = candidates.length > 0 ? candidates[0] : null;

        return {
            bestText: best ? best.text : null,
            bestScore: best ? best.score : 0,
            candidates: candidates
        };
    }

    /**
     * Check if a text item should be disqualified (noise filtering)
     * @private
     */
    static _isDisqualified(item, fieldCenterX, fieldCenterY) {
        const text = item.str || '';

        // Length > 22 chars
        if (text.length > this.THRESHOLDS.MAX_TEXT_LENGTH) {
            return true;
        }

        // Contains ":" (likely label/title separator)
        if (text.includes(':')) {
            return true;
        }

        // Font size > 18px
        if (item.fontSize && item.fontSize > this.THRESHOLDS.MAX_FONT_SIZE) {
            return true;
        }

        // Distance from field center > 130px
        const textCenterX = item.x + (item.width || 0) / 2;
        const textCenterY = item.y + (item.height || 0) / 2;
        const distance = Math.sqrt(
            Math.pow(textCenterX - fieldCenterX, 2) +
            Math.pow(textCenterY - fieldCenterY, 2)
        );

        if (distance > this.THRESHOLDS.MAX_DISTANCE_FROM_CENTER) {
            return true;
        }

        // Empty or whitespace only
        if (!text.trim()) {
            return true;
        }

        return false;
    }

    /**
     * Calculate the total score for a text item
     * @private
     */
    static _calculateScore(item, fieldBBox, fieldCenterX, fieldCenterY) {
        const details = {
            distanceScore: 0,
            verticalBias: 0,
            alignmentScore: 0,
            keywordBoost: 0,
            fontSizeScore: 0,
            totalScore: 0
        };

        // 1️⃣ Distance Score
        details.distanceScore = this._calculateDistanceScore(item, fieldBBox);

        // 2️⃣ Vertical Bias (included in distance score calculation)
        details.verticalBias = this._calculateVerticalBias(item, fieldBBox);

        // 3️⃣ Alignment Score
        details.alignmentScore = this._calculateAlignmentScore(item, fieldBBox);

        // 4️⃣ Keyword Boost
        details.keywordBoost = this._calculateKeywordBoost(item.str);

        // 5️⃣ Font Size Score
        details.fontSizeScore = this._calculateFontSizeScore(item.fontSize);

        // Calculate total
        details.totalScore =
            details.distanceScore +
            details.verticalBias +
            details.alignmentScore +
            details.keywordBoost +
            details.fontSizeScore;

        return details;
    }

    /**
     * Calculate distance score based on text position relative to field
     * @private
     */
    static _calculateDistanceScore(item, fieldBBox) {
        const textX = item.x;
        const textY = item.y;
        const textWidth = item.width || 0;
        const textHeight = item.height || item.fontSize || 12;

        const textBottom = textY + textHeight;
        const textRight = textX + textWidth;

        const fieldTop = fieldBBox.y;
        const fieldBottom = fieldBBox.y + fieldBBox.height;
        const fieldLeft = fieldBBox.x;
        const fieldRight = fieldBBox.x + fieldBBox.width;

        // Check if text is inside field
        const isInsideVertically = textY >= fieldTop && textBottom <= fieldBottom;
        const isInsideHorizontally = textX >= fieldLeft && textRight <= fieldRight;

        if (isInsideVertically && isInsideHorizontally) {
            return this.SCORES.INSIDE_FIELD;
        }

        // Check if touching top boundary (text bottom touches field top)
        const touchingTop = Math.abs(textBottom - fieldTop) <= 2;
        if (touchingTop) {
            return this.SCORES.TOUCHING_TOP;
        }

        // Check if close above (<=12px above field)
        const distanceAbove = fieldTop - textBottom;
        if (distanceAbove > 0 && distanceAbove <= this.THRESHOLDS.CLOSE_ABOVE_DISTANCE) {
            return this.SCORES.CLOSE_ABOVE;
        }

        // Check if below field
        if (textY > fieldBottom) {
            return this.SCORES.BELOW_FIELD;
        }

        // Calculate horizontal drift penalty
        const fieldCenterX = fieldBBox.x + fieldBBox.width / 2;
        const textCenterX = textX + textWidth / 2;
        const horizontalDrift = Math.abs(textCenterX - fieldCenterX);

        // Base score for other positions, with drift penalty
        let score = 20; // Base score for being in vicinity
        if (horizontalDrift > this.THRESHOLDS.ALIGNMENT_DRIFT_PENALTY) {
            score -= Math.min(30, horizontalDrift / 3);
        }

        return score;
    }

    /**
     * Calculate vertical bias score
     * Priority: Inside > On top line > Slightly above > Far above > Below
     * @private
     */
    static _calculateVerticalBias(item, fieldBBox) {
        const textY = item.y;
        const textHeight = item.height || item.fontSize || 12;
        const textBottom = textY + textHeight;

        const fieldTop = fieldBBox.y;
        const fieldBottom = fieldBBox.y + fieldBBox.height;

        // Inside field - highest priority
        if (textY >= fieldTop && textBottom <= fieldBottom) {
            return 30;
        }

        // On top of field line (touching)
        if (Math.abs(textBottom - fieldTop) <= 2) {
            return 25;
        }

        // Slightly above (0-12px)
        const distanceAbove = fieldTop - textBottom;
        if (distanceAbove > 0 && distanceAbove <= 12) {
            return 20;
        }

        // Far above (12-50px)
        if (distanceAbove > 12 && distanceAbove <= 50) {
            return 10;
        }

        // Very far above
        if (distanceAbove > 50) {
            return 0;
        }

        // Below field - lowest priority
        if (textY > fieldBottom) {
            return -20;
        }

        return 5; // Overlapping or other cases
    }

    /**
     * Calculate alignment score based on horizontal position
     * @private
     */
    static _calculateAlignmentScore(item, fieldBBox) {
        const textX = item.x;
        const textWidth = item.width || 0;
        const textCenterX = textX + textWidth / 2;

        const fieldLeft = fieldBBox.x;
        const fieldRight = fieldBBox.x + fieldBBox.width;
        const fieldCenterX = fieldBBox.x + fieldBBox.width / 2;

        // Check left alignment (text starts near field left edge)
        const leftAlignmentDiff = Math.abs(textX - fieldLeft);
        if (leftAlignmentDiff <= 10) {
            return this.SCORES.LEFT_ALIGNED;
        }

        // Check center alignment
        const centerAlignmentDiff = Math.abs(textCenterX - fieldCenterX);
        if (centerAlignmentDiff <= 15) {
            return this.SCORES.CENTERED;
        }

        // Check for significant misalignment
        const horizontalDrift = Math.abs(textCenterX - fieldCenterX);
        if (horizontalDrift > this.THRESHOLDS.ALIGNMENT_DRIFT_PENALTY) {
            return this.SCORES.MISALIGNED;
        }

        return 0; // Neutral alignment
    }

    /**
     * Calculate keyword boost for Hebrew field keywords
     * @private
     */
    static _calculateKeywordBoost(text) {
        if (!text) return 0;

        const normalizedText = text.trim().toLowerCase();

        for (const keyword of this.FIELD_KEYWORDS) {
            if (normalizedText.includes(keyword)) {
                return this.SCORES.KEYWORD_MATCH;
            }
        }

        return 0;
    }

    /**
     * Calculate font size score
     * Small fonts (9-11px) → +20, Medium (12-14px) → +5, Large (>14px) → -20
     * @private
     */
    static _calculateFontSizeScore(fontSize) {
        if (!fontSize) return 0;

        // Small fonts - likely field labels
        if (fontSize >= 9 && fontSize <= 11) {
            return this.SCORES.SMALL_FONT;
        }

        // Medium fonts - acceptable
        if (fontSize >= 12 && fontSize <= 14) {
            return this.SCORES.MEDIUM_FONT;
        }

        // Large fonts - likely titles/headers
        if (fontSize > 14) {
            return this.SCORES.LARGE_FONT;
        }

        return 0;
    }
}
