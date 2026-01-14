/**
 * Name Fusion Engine - Unified Name Source Decision Engine
 *
 * This module unifies all name sources (PDF text, OCR text, Smart Scoring,
 * AutoLabel, User Capture) into a single decision engine.
 *
 * SAFE: This module is fully isolated and does not modify any existing logic.
 * It wraps existing naming sources with a fusion layer.
 */

export class NameFusionEngine {

    // ============ USED TEXTS TRACKING ============
    // Tracks which text labels have been used to prevent duplicates
    static _usedTexts = new Set();

    // ============ SOURCE PRIORITY SCORES ============
    // Priority hierarchy (strongest → weakest)
    static SOURCE_SCORES = {
        'user': 1000,           // text captured manually by user (SelectFieldName mode)
        'pdf_in_field': 400,    // text located inside user's bounding box
        'ocr': 300,             // floating / difficult text captured by OCR
        'smart': 200,           // SmartLabelScoring result
        'pdf': 80,              // plain PDF text
        'auto': 20              // legacy AutoLabelEngine fallback
    };

    // ============ FILTERING THRESHOLDS ============
    static THRESHOLDS = {
        MIN_TEXT_LENGTH: 2,
        MAX_TEXT_LENGTH: 22,
        MIN_SCORE: -20,
        MAX_DISTANCE: 200
    };

    // ============ HEBREW TO ENGLISH KEY MAPPING ============
    static HEBREW_TO_ENGLISH = {
        'שם': 'name',
        'שם פרטי': 'first_name',
        'שם משפחה': 'last_name',
        'תעודת זהות': 'id_number',
        'ת.ז': 'id_number',
        'ת"ז': 'id_number',
        'תז': 'id_number',
        'טלפון': 'phone',
        'נייד': 'mobile',
        'כתובת': 'address',
        'עיר': 'city',
        'רחוב': 'street',
        'מיקוד': 'zip_code',
        'דואר אלקטרוני': 'email',
        'אימייל': 'email',
        'מייל': 'email',
        'תאריך': 'date',
        'תאריך לידה': 'birth_date',
        'חתימה': 'signature',
        'הערות': 'notes',
        'סכום': 'amount',
        'מספר': 'number',
        'בנק': 'bank',
        'סניף': 'branch',
        'חשבון': 'account',
        'מס חשבון': 'account_number',
        'שנה': 'year',
        'חודש': 'month',
        'יום': 'day'
    };

    /**
     * Fuse multiple name candidates into a single best result
     *
     * @param {Object[]} candidates - Array of candidate objects:
     *  {
     *     text: string,
     *     score: number,
     *     source: 'user' | 'pdf' | 'pdf_in_field' | 'ocr' | 'smart' | 'auto',
     *     distance: number,   // px distance from field bbox center
     *     used: boolean       // was this text used before? (default false)
     *  }
     *
     * @returns {Object} Result object:
     *  {
     *    text: string,
     *    key: string,
     *    source: string,
     *    score: number
     *  }
     */
    static fuse(candidates) {
        if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
            return { text: '', key: '', source: 'none', score: 0 };
        }

        // Step 1: Filter candidates
        const validCandidates = candidates.filter(c => this._isValidCandidate(c));

        if (validCandidates.length === 0) {
            return { text: '', key: '', source: 'none', score: 0 };
        }

        // Step 2: Calculate final scores for each candidate
        const scoredCandidates = validCandidates.map(c => ({
            ...c,
            finalScore: this._calculateFinalScore(c)
        }));

        // Step 3: Sort by final score (descending)
        scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);

        // Step 4: Select winner
        const winner = scoredCandidates[0];

        // Step 5: Clean and return result
        const cleanedText = this._cleanText(winner.text);

        return {
            text: cleanedText,
            key: this.toKey(cleanedText),
            source: winner.source,
            score: Math.round(winner.finalScore)
        };
    }

    /**
     * Convert Hebrew text to English field key
     * @param {string} text - Hebrew text
     * @returns {string} English key in snake_case
     */
    static toKey(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        const trimmed = text.trim();

        // Check for direct mapping first
        const lowerText = trimmed.toLowerCase();
        for (const [hebrew, english] of Object.entries(this.HEBREW_TO_ENGLISH)) {
            if (trimmed === hebrew || lowerText === hebrew.toLowerCase()) {
                return english;
            }
        }

        // Check for partial matches
        for (const [hebrew, english] of Object.entries(this.HEBREW_TO_ENGLISH)) {
            if (trimmed.includes(hebrew)) {
                return english;
            }
        }

        // Transliterate Hebrew to English-like key
        return this._transliterateToKey(trimmed);
    }

    /**
     * Check if a candidate passes all filtering rules
     * @private
     */
    static _isValidCandidate(candidate) {
        if (!candidate || !candidate.text) {
            return false;
        }

        const text = candidate.text.trim();

        // Rule 1: Reject if used === true (passed in candidate)
        if (candidate.used === true) {
            return false;
        }

        // Rule 1b: Reject if text was previously used (tracked in _usedTexts)
        if (this.isUsed(text)) {
            return false;
        }

        // Rule 2: Reject if text too short
        if (text.length < this.THRESHOLDS.MIN_TEXT_LENGTH) {
            return false;
        }

        // Rule 3: Reject if text too long
        if (text.length > this.THRESHOLDS.MAX_TEXT_LENGTH) {
            return false;
        }

        // Rule 4: Reject if text contains colon
        if (text.includes(':')) {
            return false;
        }

        // Rule 5: Reject if score too low
        if (typeof candidate.score === 'number' && candidate.score < this.THRESHOLDS.MIN_SCORE) {
            return false;
        }

        // Rule 6: Reject if distance too far
        if (typeof candidate.distance === 'number' && candidate.distance > this.THRESHOLDS.MAX_DISTANCE) {
            return false;
        }

        return true;
    }

    /**
     * Calculate final fusion score for a candidate
     * Formula: baseSourceScore + candidate.score * 1.5 + (200 - candidate.distance) * 0.4
     * @private
     */
    static _calculateFinalScore(candidate) {
        // Base score from source priority
        const baseSourceScore = this.SOURCE_SCORES[candidate.source] || 0;

        // Candidate's raw score contribution
        const scoreContribution = (candidate.score || 0) * 1.5;

        // Distance contribution (closer = higher score)
        const distance = candidate.distance || 0;
        const distanceContribution = (200 - Math.min(distance, 200)) * 0.4;

        return baseSourceScore + scoreContribution + distanceContribution;
    }

    /**
     * Clean text for final output
     * @private
     */
    static _cleanText(text) {
        if (!text) return '';

        return text
            .trim()
            .replace(/\s+/g, ' ')      // Normalize whitespace
            .replace(/[:\-_]+$/, '')   // Remove trailing punctuation
            .replace(/^[:\-_]+/, '')   // Remove leading punctuation
            .trim();
    }

    /**
     * Transliterate Hebrew text to English-like key
     * @private
     */
    static _transliterateToKey(text) {
        // Simple Hebrew to Latin transliteration map
        const hebrewToLatin = {
            'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h',
            'ו': 'v', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y',
            'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm',
            'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
            'ף': 'f', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k', 'ר': 'r',
            'ש': 'sh', 'ת': 't'
        };

        let result = '';
        for (const char of text) {
            if (hebrewToLatin[char]) {
                result += hebrewToLatin[char];
            } else if (/[a-zA-Z0-9]/.test(char)) {
                result += char.toLowerCase();
            } else if (char === ' ' || char === '_') {
                result += '_';
            }
            // Skip other characters
        }

        // Clean up multiple underscores and trim
        return result
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .toLowerCase();
    }

    /**
     * Debug helper: Show all candidates with their scores
     * @param {Object[]} candidates - Array of candidates
     * @returns {Object[]} Scored and sorted candidates for debugging
     */
    static debug(candidates) {
        if (!candidates || !Array.isArray(candidates)) {
            return [];
        }

        return candidates.map(c => ({
            text: c.text,
            source: c.source,
            rawScore: c.score || 0,
            distance: c.distance || 0,
            used: c.used || false,
            isValid: this._isValidCandidate(c),
            finalScore: this._isValidCandidate(c) ? this._calculateFinalScore(c) : 'FILTERED'
        })).sort((a, b) => {
            if (a.finalScore === 'FILTERED' && b.finalScore === 'FILTERED') return 0;
            if (a.finalScore === 'FILTERED') return 1;
            if (b.finalScore === 'FILTERED') return -1;
            return b.finalScore - a.finalScore;
        });
    }

    // ============ USED TEXT TRACKING METHODS ============

    /**
     * Mark a text as used (prevents it from being selected again)
     * @param {string} text - The text to mark as used
     */
    static markAsUsed(text) {
        if (text && typeof text === 'string') {
            const normalized = text.trim().toLowerCase();
            this._usedTexts.add(normalized);
            console.log('🔒 NameFusion: Marked as used:', text);
        }
    }

    /**
     * Check if a text has been used
     * @param {string} text - The text to check
     * @returns {boolean} True if the text has been used
     */
    static isUsed(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }
        const normalized = text.trim().toLowerCase();
        return this._usedTexts.has(normalized);
    }

    /**
     * Clear all used texts (call when loading a new document)
     */
    static clearUsed() {
        this._usedTexts.clear();
        console.log('🔓 NameFusion: Cleared all used texts');
    }

    /**
     * Get count of used texts
     * @returns {number} Number of used texts
     */
    static getUsedCount() {
        return this._usedTexts.size;
    }

    /**
     * Get all used texts (for debugging)
     * @returns {string[]} Array of used texts
     */
    static getUsedTexts() {
        return Array.from(this._usedTexts);
    }
}

// Also expose to window for global access
if (typeof window !== 'undefined') {
    window.NameFusionEngine = NameFusionEngine;
    console.log('🔀 NameFusionEngine loaded and exposed to window');
}
