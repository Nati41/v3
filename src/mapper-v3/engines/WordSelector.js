/**
 * WordSelector - Word-based field label selection using PDF.js only
 *
 * DESIGN:
 * - Extract words from PDF.js text layer (NO OCR)
 * - Classify words: selectable vs excluded
 * - User clicks words one by one to build label
 * - Click order = label order (NOT spatial order)
 * - Supports multi-line, wrapped text, any layout
 */
import { state } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { pdfEngine } from './PDFEngine.js';
import { textExtractor } from './TextExtractor.js';
import { fieldNamer } from './FieldNamer.js';

// ============ WORD CLASSIFICATION PATTERNS ============

const PATTERNS = {
    // Allowed: Hebrew words (2+ characters)
    hebrew: /[\u0590-\u05FF]{2,}/,

    // Allowed: Date keywords (always allowed)
    dateKeyword: /(תאריך|יום|חודש|שנה|מתאריך|עד תאריך|לתאריך|בתאריך)/,

    // Allowed but "weak": Numeric date formats
    numericDate: /^\d{1,4}[\/\-\.]\d{1,2}([\/\-\.]\d{1,4})?$/,

    // EXCLUDED: Pure numbers
    pureNumber: /^\d+$/,

    // EXCLUDED: Only numbers inside brackets like (1), [1]
    indexMarker: /^[\(\[]\d+[\)\]]$/,

    // EXCLUDED: Checkbox/symbols
    symbols: /^[□■○●✔✖✓✗|—\-–]+$/,

    // EXCLUDED: Single characters (except Hebrew letters and digits)
    singleChar: /^[^\u0590-\u05FF0-9]$/
};

// Word type enum
const WordType = {
    HEBREW: 'hebrew',
    DATE_KEYWORD: 'date-keyword',
    DATE_TOKEN: 'date-token',
    EXCLUDED: 'excluded'
};

export class WordSelector {
    constructor() {
        // Processed words cache per page
        // Map<pageNum, Array<ProcessedWord>>
        this.wordsCache = new Map();

        // Selection state
        this.selectionState = {
            active: false,
            mode: null,           // 'label' | 'title' | 'fieldName'
            fieldId: null,        // For label mode
            callback: null,       // For title/fieldName modes
            selectedWords: [],    // Words in CLICK ORDER
            container: null,      // Overlay container
            wordElements: new Map() // wordId -> HTMLElement
        };

        // Overlay layer reference
        this.overlayLayer = null;

        // PROTECTION: Prevent rapid multiple clicks from breaking the flow
        this._isStarting = false;

        // Configuration
        this.config = {
            lineHeightTolerance: 10  // px - for determining same line
        };
    }

    /**
     * Initialize the word selector
     * V3.13: Added safeguards - tracks initialization state, validates elements
     */
    init(options = {}) {
        // Prevent double initialization
        if (this._initialized) {
            console.log('[WordSelector] Already initialized, skipping');
            return;
        }

        this.overlayLayer = document.getElementById(options.overlayLayerId || 'overlay-layer');

        // V3.13: Validate critical elements exist
        if (!this.overlayLayer) {
            console.error('[WordSelector] ⚠️ CRITICAL: overlay-layer element not found! Word selection will NOT work.');
            console.error('[WordSelector] Make sure the DOM has an element with id="overlay-layer"');
            return;
        }

        // Listen for escape to cancel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.selectionState.active) {
                this.cancelSelection();
            }
        });

        this._initialized = true;
        console.log('[WordSelector] Initialized successfully, overlayLayer:', this.overlayLayer.id);
    }

    /**
     * V3.13: Check if WordSelector is ready to use
     * @returns {boolean}
     */
    isReady() {
        return this._initialized && this.overlayLayer !== null;
    }

    // ============ WORD EXTRACTION ============

    /**
     * Extract and classify words from current page
     * @param {number} page - Page number (1-based)
     * @returns {Promise<Array<ProcessedWord>>}
     */
    async getWords(page) {
        // Check cache
        if (this.wordsCache.has(page)) {
            return this.wordsCache.get(page);
        }

        // Get text content from PDF.js
        let textContent = textExtractor.pageTextCache.get(page);

        if (!textContent || !textContent.items) {
            console.log('[WordSelector] Extracting text for page', page);
            const pdfDoc = pdfEngine.pdfDocument;
            if (pdfDoc) {
                const pdfPage = await pdfDoc.getPage(page);
                textContent = await pdfPage.getTextContent();
                textExtractor.pageTextCache.set(page, textContent);
            }
        }

        if (!textContent || !textContent.items) {
            console.warn('[WordSelector] No text content for page', page);
            return [];
        }

        // Get PDF dimensions for coordinate conversion
        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) {
            console.warn('[WordSelector] No PDF dimensions');
            return [];
        }

        const dpiScale = pdfEngine.getDpiScale();
        const pdfH = pdfPageDimensions.height / dpiScale;

        // Process each text item into words
        const words = [];
        let wordId = 0;

        for (const item of textContent.items) {
            if (!item.str || !item.transform) continue;
            if (!item.str.trim()) continue;

            // PDF.js transform: [scaleX, skewX, skewY, scaleY, x, y]
            const itemX = item.transform[4];
            const itemYFromBottom = item.transform[5];
            const fontSize = Math.abs(item.transform[0]) || Math.abs(item.transform[3]) || 10;
            const itemWidth = item.width || (item.str.length * fontSize * 0.5);

            // Convert Y from bottom-based to top-based
            const itemYFromTop = pdfH - itemYFromBottom;
            const textTop = itemYFromTop - fontSize;
            const textHeight = fontSize * 1.3;

            // Split into individual words
            const textWords = item.str.split(/\s+/).filter(w => w.length > 0);
            const avgCharWidth = itemWidth / Math.max(item.str.length, 1);
            const spaceWidth = avgCharWidth;

            // Check if text contains Hebrew (RTL)
            const isRTL = /[\u0590-\u05FF]/.test(item.str);

            // Calculate word positions based on their order in the text item
            // For RTL: PDF stores position where text STARTS (rightmost for RTL)
            // Words in stream are in logical (reading) order
            let accumulatedWidth = 0;

            for (let i = 0; i < textWords.length; i++) {
                const text = textWords[i];
                const wordWidth = text.length * avgCharWidth;

                // Classify the word
                const wordType = this._classifyWord(text);

                // Calculate X position:
                // For LTR: itemX + accumulated width (left to right)
                // For RTL: itemX + (itemWidth - accumulated width - wordWidth)
                //          because itemX is at the left edge, but text reads RTL
                let wordX;
                if (isRTL) {
                    // RTL: First word (i=0) is rightmost, subsequent words are to its left
                    wordX = itemX + itemWidth - accumulatedWidth - wordWidth;
                } else {
                    wordX = itemX + accumulatedWidth;
                }

                words.push({
                    wordId: wordId++,
                    text: text,
                    type: wordType,
                    selectable: wordType !== WordType.EXCLUDED,
                    // PDF coordinates (points, top-based Y)
                    pdfX: wordX,
                    pdfY: textTop,
                    pdfWidth: wordWidth,
                    pdfHeight: textHeight,
                    page: page,
                    isRTL: isRTL,
                    docOrder: wordId - 1 // Keep track of document order
                });

                accumulatedWidth += wordWidth + spaceWidth;
            }
        }

        // Merge consecutive single Hebrew letters that are close together
        // This handles spaced-out text like "מ ס פ ר" -> "מספר"
        this._mergeSpacedLetters(words);

        // Sort by position: top to bottom, then by X (right to left for visual)
        // This ensures words are ordered as they visually appear on the page
        words.sort((a, b) => {
            const yDiff = a.pdfY - b.pdfY;
            if (Math.abs(yDiff) > this.config.lineHeightTolerance) {
                return yDiff; // Different lines - sort by Y
            }
            // Same line - sort by X descending (rightmost first)
            return b.pdfX - a.pdfX;
        });

        // Re-assign wordIds after sorting
        words.forEach((word, index) => {
            word.wordId = index;
        });

        // Cache
        this.wordsCache.set(page, words);

        console.log(`[WordSelector] Extracted ${words.length} words for page ${page}`);
        return words;
    }

    /**
     * Fix mirrored parentheses/brackets in RTL text
     * In RTL, ( should display as ) and vice versa
     * @param {string} text - Text to fix
     * @returns {string} Fixed text
     */
    _fixRTLParentheses(text) {
        const mirrorMap = {
            '(': ')',
            ')': '(',
            '[': ']',
            ']': '[',
            '{': '}',
            '}': '{',
            '<': '>',
            '>': '<',
            '«': '»',
            '»': '«'
        };

        // Check if text contains Hebrew
        if (!/[\u0590-\u05FF]/.test(text)) {
            return text; // Not RTL, no fix needed
        }

        // Mirror parentheses in RTL text
        return text.split('').map(char => mirrorMap[char] || char).join('');
    }

    /**
     * Classify a word
     * @param {string} text - Word text
     * @returns {string} WordType
     */
    _classifyWord(text) {
        // Check exclusions first - ONLY symbols and single non-Hebrew chars
        if (PATTERNS.symbols.test(text)) return WordType.EXCLUDED;
        if (PATTERNS.singleChar.test(text)) return WordType.EXCLUDED;

        // Check date keyword (highest priority for allowed)
        if (PATTERNS.dateKeyword.test(text)) return WordType.DATE_KEYWORD;

        // Check numeric date (allowed but weak)
        if (PATTERNS.numericDate.test(text)) return WordType.DATE_TOKEN;

        // Check Hebrew
        if (PATTERNS.hebrew.test(text)) return WordType.HEBREW;

        // Allow pure numbers (for field names like "עיוור 100 אחוז")
        if (PATTERNS.pureNumber.test(text)) return WordType.HEBREW;

        // Allow index markers too (1), 1. etc
        if (PATTERNS.indexMarker.test(text)) return WordType.HEBREW;

        // Default: allow if it has some letters or digits
        if (/[a-zA-Z\u0590-\u05FF0-9]/.test(text)) return WordType.HEBREW;

        return WordType.EXCLUDED;
    }

    /**
     * Merge consecutive single Hebrew letters that are close together
     * Handles spaced-out text like "מ ס פ ר" -> "מספר"
     * @param {Array} words - Array of word objects (modified in place)
     */
    _mergeSpacedLetters(words) {
        if (words.length < 2) return;

        // First, sort by Y then X (right to left for RTL)
        words.sort((a, b) => {
            const yDiff = a.pdfY - b.pdfY;
            if (Math.abs(yDiff) > this.config.lineHeightTolerance) {
                return yDiff;
            }
            return b.pdfX - a.pdfX; // RTL: right to left
        });

        const toRemove = new Set();
        const hebrewSingleChar = /^[\u0590-\u05FF]$/;

        for (let i = 0; i < words.length - 1; i++) {
            if (toRemove.has(i)) continue;

            const word = words[i];

            // Check if this is a single Hebrew letter
            if (!hebrewSingleChar.test(word.text)) continue;

            // Look for consecutive single Hebrew letters on the same line
            let mergedText = word.text;
            let lastMergedIdx = i;
            let minX = word.pdfX;
            let maxX = word.pdfX + word.pdfWidth;

            for (let j = i + 1; j < words.length; j++) {
                if (toRemove.has(j)) continue;

                const nextWord = words[j];

                // Must be on same line
                if (Math.abs(nextWord.pdfY - word.pdfY) > this.config.lineHeightTolerance) {
                    break;
                }

                // Must be a single Hebrew letter
                if (!hebrewSingleChar.test(nextWord.text)) {
                    break;
                }

                // Must be close (within 3x average char width)
                const gap = Math.abs(nextWord.pdfX - minX);
                const avgCharWidth = word.pdfWidth;
                if (gap > avgCharWidth * 5) {
                    break;
                }

                // Merge: append for RTL (we're iterating right-to-left, so first letter is rightmost)
                mergedText = mergedText + nextWord.text;
                minX = Math.min(minX, nextWord.pdfX);
                maxX = Math.max(maxX, nextWord.pdfX + nextWord.pdfWidth);
                toRemove.add(j);
                lastMergedIdx = j;
            }

            // If we merged letters, update the first word
            if (mergedText.length > 1) {
                word.text = mergedText;
                word.pdfX = minX;
                word.pdfWidth = maxX - minX;
                word.type = this._classifyWord(mergedText);
                word.selectable = word.type !== WordType.EXCLUDED;
                console.log(`[WordSelector] Merged spaced letters: "${mergedText}"`);
            }
        }

        // Remove merged words (iterate backwards to preserve indices)
        const removeIndices = Array.from(toRemove).sort((a, b) => b - a);
        for (const idx of removeIndices) {
            words.splice(idx, 1);
        }
    }

    // ============ SELECTION MODE ============

    /**
     * Start word selection mode
     * @param {Object} options - { mode, fieldId, callback }
     */
    async startSelection(options) {
        // V3.13: Auto-init if not ready (handles race condition in dynamic loading)
        if (!this.isReady()) {
            console.log('[WordSelector] Auto-initializing (not ready)');
            this.init();

            // If still not ready after init, show error and abort
            if (!this.isReady()) {
                console.error('[WordSelector] Failed to initialize! Cannot start selection.');
                this._showMessage('שגיאה באתחול בחירת מילים', 'error');
                return;
            }
        }

        // PROTECTION: Prevent rapid clicks from breaking the flow
        if (this._isStarting) {
            console.log('[WordSelector] ⚠️ Already starting, ignoring duplicate call');
            return;
        }

        // If already active in the same mode, just return (don't restart)
        if (this.selectionState.active && this.selectionState.mode === options.mode) {
            console.log('[WordSelector] Already active in same mode, ignoring');
            return;
        }

        console.log('[WordSelector] Starting selection mode:', options.mode);
        this._isStarting = true;

        // Cancel any existing selection
        this.cancelSelection();

        // Clear cache to get fresh word positions (important after zoom/resize)
        this.clearCache();

        const page = state.get('document.currentPage');
        const words = await this.getWords(page);

        if (!words || words.length === 0) {
            console.warn('[WordSelector] No words found');
            this._showMessage('לא נמצאו מילים בעמוד', 'error');
            this._isStarting = false;
            return;
        }

        // Setup state
        this.selectionState = {
            active: true,
            mode: options.mode,
            fieldId: options.fieldId || null,
            callback: options.callback || null,
            selectedWords: [],
            container: null,
            wordElements: new Map()
        };

        // Render word overlays
        this._renderWordOverlays(words);

        // Show instruction
        this._showMessage('לחץ על מילים לבניית השם. לחץ שוב להסרה. Enter לאישור.');

        // PROTECTION: Clear the starting flag
        this._isStarting = false;
    }

    /**
     * Start label selection for a field
     */
    async startLabelSelection(fieldId) {
        await this.startSelection({
            mode: 'label',
            fieldId: fieldId
        });
    }

    /**
     * Start title selection (for groups)
     */
    async startTitleSelection(callback) {
        await this.startSelection({
            mode: 'title',
            callback: callback
        });
    }

    /**
     * Start field name selection
     */
    async startFieldNameSelection(callback) {
        await this.startSelection({
            mode: 'fieldName',
            callback: callback
        });
    }

    /**
     * Render clickable word overlays
     */
    _renderWordOverlays(words) {
        if (!this.overlayLayer) {
            console.error('[WordSelector] ⚠️ overlayLayer is null! Words will NOT be rendered.');
            return;
        }

        // Create container
        const container = document.createElement('div');
        container.id = 'word-selector-container';
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 9999;
            pointer-events: none;
        `;

        // Create confirm/cancel bar
        const toolbar = this._createToolbar();
        container.appendChild(toolbar);

        let validCount = 0;

        // Use DocumentFragment for batched DOM operations (PERFORMANCE FIX)
        const fragment = document.createDocumentFragment();

        // Store word data for event delegation
        this._wordDataMap = new Map();

        for (const word of words) {
            // Skip excluded words - don't render them at all
            if (!word.selectable) continue;

            const screenBbox = this._pdfToScreen(word);

            if (!screenBbox || screenBbox.width <= 0 || screenBbox.height <= 0) {
                continue;
            }

            validCount++;

            const el = document.createElement('div');
            el.className = 'word-selectable';
            el.dataset.wordId = word.wordId;
            el.style.cssText = this._getWordStyle(word.type, false);
            el.style.left = `${screenBbox.x}px`;
            el.style.top = `${screenBbox.y}px`;
            el.style.width = `${screenBbox.width}px`;
            el.style.height = `${screenBbox.height}px`;

            // Store word data for event delegation (instead of per-element listeners)
            this._wordDataMap.set(word.wordId.toString(), { word, type: word.type });

            fragment.appendChild(el);
            this.selectionState.wordElements.set(word.wordId, el);
        }

        // Append all elements at once (single reflow)
        container.appendChild(fragment);

        // EVENT DELEGATION - single listener instead of N listeners (PERFORMANCE FIX)
        container.addEventListener('mouseover', (e) => {
            const el = e.target.closest('.word-selectable');
            if (el && !el.classList.contains('selected')) {
                el.style.background = 'rgba(33, 150, 243, 0.35)';
                el.style.borderColor = 'rgba(33, 150, 243, 0.8)';
            }
        });

        container.addEventListener('mouseout', (e) => {
            const el = e.target.closest('.word-selectable');
            if (el && !el.classList.contains('selected')) {
                const wordId = el.dataset.wordId;
                const data = this._wordDataMap.get(wordId);
                if (data) {
                    const style = this._getWordStyleObj(data.type, false);
                    el.style.background = style.background;
                    el.style.borderColor = style.borderColor;
                }
            }
        });

        container.addEventListener('click', (e) => {
            const el = e.target.closest('.word-selectable');
            if (el) {
                e.preventDefault();
                e.stopPropagation();
                const wordId = el.dataset.wordId;
                const data = this._wordDataMap.get(wordId);
                if (data) {
                    this._toggleWord(data.word, el);
                }
            }
        });

        this.overlayLayer.appendChild(container);
        this.selectionState.container = container;

        console.log(`[WordSelector] Rendered ${validCount} selectable words`);

        // Add keyboard listeners
        this._keyHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.confirmSelection();
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    }

    /**
     * Create toolbar with confirm/cancel buttons
     */
    _createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.id = 'word-selector-toolbar';
        toolbar.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            padding: 12px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.25);
            display: flex;
            gap: 12px;
            align-items: center;
            z-index: 10001;
            direction: rtl;
            pointer-events: auto;
        `;

        // Preview label
        const preview = document.createElement('span');
        preview.id = 'word-selector-preview';
        preview.style.cssText = `
            font-size: 14px;
            color: #333;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
        preview.textContent = 'בחר מילים...';

        // Confirm button
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'אישור';
        confirmBtn.style.cssText = `
            padding: 8px 16px;
            background: #4caf50;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
        `;
        confirmBtn.onclick = (e) => {
            console.log('[WordSelector] Confirm button clicked!');
            e.preventDefault();
            e.stopPropagation();
            this.confirmSelection();
        };

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'ביטול';
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            background: #f5f5f5;
            color: #333;
            border: 1px solid #ddd;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        `;
        cancelBtn.onclick = () => this.cancelSelection();

        // Clear button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'נקה';
        clearBtn.style.cssText = `
            padding: 8px 16px;
            background: #ff9800;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        `;
        clearBtn.onclick = () => this._clearSelection();

        toolbar.appendChild(preview);
        toolbar.appendChild(confirmBtn);
        toolbar.appendChild(clearBtn);
        toolbar.appendChild(cancelBtn);

        return toolbar;
    }

    /**
     * Toggle word selection
     */
    _toggleWord(word, element) {
        const selectedWords = this.selectionState.selectedWords;
        const index = selectedWords.findIndex(w => w.wordId === word.wordId);

        if (index >= 0) {
            // Remove from selection
            selectedWords.splice(index, 1);
            element.classList.remove('selected');
            const style = this._getWordStyleObj(word.type, false);
            element.style.background = style.background;
            element.style.borderColor = style.borderColor;
            element.style.borderStyle = style.borderStyle;

            // Remove number badge
            const badge = element.querySelector('.word-order-badge');
            if (badge) badge.remove();

            // Update remaining badges
            this._updateOrderBadges();

            console.log('[WordSelector] Removed word:', word.text);
        } else {
            // Add to selection (at end - click order)
            selectedWords.push(word);
            element.classList.add('selected');
            element.style.background = 'rgba(76, 175, 80, 0.4)';
            element.style.borderColor = 'rgba(76, 175, 80, 1)';
            element.style.borderStyle = 'solid';

            // Add order badge
            this._addOrderBadge(element, selectedWords.length);

            console.log('[WordSelector] Added word:', word.text, 'order:', selectedWords.length);
        }

        // Update preview
        this._updatePreview();
    }

    /**
     * Add order badge to word element
     */
    _addOrderBadge(element, order) {
        const badge = document.createElement('span');
        badge.className = 'word-order-badge';
        badge.textContent = order;
        badge.style.cssText = `
            position: absolute;
            top: -8px;
            right: -8px;
            background: #4caf50;
            color: white;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            font-size: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        `;
        element.appendChild(badge);
    }

    /**
     * Update all order badges after removal
     */
    _updateOrderBadges() {
        this.selectionState.selectedWords.forEach((word, index) => {
            const el = this.selectionState.wordElements.get(word.wordId);
            if (el) {
                const badge = el.querySelector('.word-order-badge');
                if (badge) {
                    badge.textContent = index + 1;
                }
            }
        });
    }

    /**
     * Update preview text
     */
    _updatePreview() {
        const preview = document.getElementById('word-selector-preview');
        if (!preview) return;

        const selectedWords = this.selectionState.selectedWords;

        if (selectedWords.length === 0) {
            preview.textContent = 'בחר מילים...';
            preview.style.color = '#999';
        } else {
            const rawText = selectedWords.map(w => w.text).join(' ');
            const text = this._fixRTLParentheses(rawText);
            preview.textContent = text;
            preview.style.color = '#333';
        }
    }

    /**
     * Clear all selected words
     */
    _clearSelection() {
        for (const word of this.selectionState.selectedWords) {
            const el = this.selectionState.wordElements.get(word.wordId);
            if (el) {
                el.classList.remove('selected');
                const style = this._getWordStyleObj(word.type, false);
                el.style.background = style.background;
                el.style.borderColor = style.borderColor;
                el.style.borderStyle = style.borderStyle;

                const badge = el.querySelector('.word-order-badge');
                if (badge) badge.remove();
            }
        }

        this.selectionState.selectedWords = [];
        this._updatePreview();
        console.log('[WordSelector] Selection cleared');
    }

    /**
     * Confirm and apply selection
     */
    confirmSelection() {
        console.log('[WordSelector] confirmSelection called');
        console.log('[WordSelector] selectionState:', this.selectionState);

        const selectedWords = this.selectionState.selectedWords;

        if (selectedWords.length === 0) {
            this._showMessage('יש לבחור לפחות מילה אחת', 'error');
            return;
        }

        const page = state.get('document.currentPage');
        // Join words and fix RTL parentheses
        const rawText = selectedWords.map(w => w.text).join(' ');
        const labelText = this._fixRTLParentheses(rawText);
        const wordIds = selectedWords.map(w => w.wordId);

        const labelSelection = {
            wordIds: wordIds,
            page: page
        };

        const mode = this.selectionState.mode;
        const callback = this.selectionState.callback;
        const fieldId = this.selectionState.fieldId;

        // Handle based on mode
        if (mode === 'label' && fieldId) {
            state.updateField(fieldId, {
                labelSelection: labelSelection,
                label_he: labelText,
                label_en: fieldNamer.hebrewToEnglish(labelText)
            });
            console.log('[WordSelector] Label saved:', labelText);
            this._showMessage(`נשמר: "${labelText}"`, 'success');

        } else if (callback) {
            console.log('[WordSelector] About to invoke callback for mode:', mode);
            try {
                callback({
                    text: labelText,
                    labelSelection: labelSelection,
                    words: selectedWords
                });
                console.log('[WordSelector] Callback invoked successfully:', labelText);
            } catch (err) {
                console.error('[WordSelector] Callback error:', err);
            }
            this._showMessage(`נבחר: "${labelText}"`, 'success');
        } else {
            console.warn('[WordSelector] No callback and no fieldId! mode:', mode);
        }

        // Emit event for overlay rendering
        eventBus.emit('label:selected', { fieldId, labelText, labelSelection });

        // Clean up
        this._cleanup();
    }

    /**
     * Cancel selection
     */
    cancelSelection() {
        // Always reset the starting flag
        this._isStarting = false;

        if (!this.selectionState.active) return;

        console.log('[WordSelector] Selection cancelled');
        this._cleanup();
        this._showMessage('בחירה בוטלה', 'info');
    }

    /**
     * Clean up selection mode
     */
    _cleanup() {
        if (this.selectionState.container) {
            this.selectionState.container.remove();
        }

        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }

        this.selectionState = {
            active: false,
            mode: null,
            fieldId: null,
            callback: null,
            selectedWords: [],
            container: null,
            wordElements: new Map()
        };

        this._hideMessage();
    }

    // ============ STYLING ============

    /**
     * Get CSS style string for word type
     */
    _getWordStyle(type, selected) {
        const style = this._getWordStyleObj(type, selected);
        return `
            position: absolute;
            background: ${style.background};
            border: ${style.border};
            cursor: pointer;
            pointer-events: auto;
            transition: all 0.15s;
            box-sizing: border-box;
            border-radius: 2px;
        `;
    }

    /**
     * Get style object for word type
     */
    _getWordStyleObj(type, selected) {
        if (selected) {
            return {
                background: 'rgba(76, 175, 80, 0.4)',
                borderColor: 'rgba(76, 175, 80, 1)',
                borderStyle: 'solid',
                border: '2px solid rgba(76, 175, 80, 1)'
            };
        }

        switch (type) {
            case WordType.DATE_KEYWORD:
                return {
                    background: 'rgba(255, 235, 59, 0.35)',
                    borderColor: 'rgba(255, 193, 7, 0.7)',
                    borderStyle: 'solid',
                    border: '1px solid rgba(255, 193, 7, 0.7)'
                };
            case WordType.DATE_TOKEN:
                return {
                    background: 'rgba(255, 235, 59, 0.15)',
                    borderColor: 'rgba(255, 193, 7, 0.4)',
                    borderStyle: 'dashed',
                    border: '1px dashed rgba(255, 193, 7, 0.4)'
                };
            case WordType.HEBREW:
            default:
                return {
                    background: 'rgba(255, 243, 140, 0.25)',
                    borderColor: 'rgba(255, 193, 7, 0.5)',
                    borderStyle: 'solid',
                    border: '1px solid rgba(255, 193, 7, 0.5)'
                };
        }
    }

    // ============ COORDINATE CONVERSION ============

    /**
     * Convert PDF word bbox to screen coordinates
     * Coordinates are relative to the overlay layer
     */
    _pdfToScreen(word) {
        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) return null;

        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfPageDimensions.width / dpiScale;
        const pdfH = pdfPageDimensions.height / dpiScale;

        // Get the actual rendered size from the PDF image
        // V3.13: Fix - look for img inside pdf-container (not #pdf-image which doesn't exist)
        const pdfImg = document.querySelector('#pdf-container img');
        if (!pdfImg) {
            console.warn('[WordSelector] PDF image not found! Using overlayLayer dimensions');
        }
        const layerWidth = pdfImg?.offsetWidth || this.overlayLayer?.offsetWidth || 1;
        const layerHeight = pdfImg?.offsetHeight || this.overlayLayer?.offsetHeight || 1;

        const scaleX = layerWidth / pdfW;
        const scaleY = layerHeight / pdfH;

        // Calculate screen position
        const x = word.pdfX * scaleX;
        const y = word.pdfY * scaleY;
        const width = word.pdfWidth * scaleX;
        const height = word.pdfHeight * scaleY;

        return {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.max(Math.round(width), 5), // Minimum 5px width
            height: Math.max(Math.round(height), 10) // Minimum 10px height
        };
    }

    // ============ MESSAGES ============

    _showMessage(text, type = 'info') {
        this._hideMessage();

        const msg = document.createElement('div');
        msg.id = 'word-selector-message';

        const colors = {
            info: '#2196f3',
            success: '#4caf50',
            error: '#f44336'
        };

        msg.style.cssText = `
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10002;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            direction: rtl;
        `;
        msg.textContent = text;
        document.body.appendChild(msg);

        if (type === 'success' || type === 'info') {
            setTimeout(() => this._hideMessage(), 2500);
        }
    }

    _hideMessage() {
        const existing = document.getElementById('word-selector-message');
        if (existing) existing.remove();
    }

    // ============ PUBLIC UTILITIES ============

    /**
     * Get label text from labelSelection
     */
    async getLabelText(labelSelection) {
        if (!labelSelection || !labelSelection.wordIds) return '';

        const words = await this.getWords(labelSelection.page);
        const wordMap = new Map(words.map(w => [w.wordId, w]));

        const rawText = labelSelection.wordIds
            .map(id => wordMap.get(id)?.text)
            .filter(Boolean)
            .join(' ');

        return this._fixRTLParentheses(rawText);
    }

    /**
     * Clear cache
     */
    clearCache(page) {
        if (page) {
            this.wordsCache.delete(page);
        } else {
            this.wordsCache.clear();
        }
    }

    /**
     * Check if selection mode is active
     */
    isActive() {
        return this.selectionState.active;
    }
}

// Singleton
export const wordSelector = new WordSelector();
