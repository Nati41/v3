/**
 * LabelOverlay - Renders label overlays for fields
 *
 * RESPONSIBILITY:
 * - Render yellow overlays from saved labelSelection
 * - Support edit mode with expand/shrink
 * - Delegate word selection to WordSelector
 *
 * NOTE: Word selection is handled by WordSelector module
 */
import { state } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { pdfEngine } from '../engines/PDFEngine.js';
import { fieldNamer } from '../engines/FieldNamer.js';

const urlParams = new URLSearchParams(window.location.search);
const modeParam = urlParams.get('mode');
const isQuickFillMode = modeParam === 'quickfill' || modeParam === 'quick_fill' || modeParam === 'quick-fill';
let wordSelectorPromise = null;

async function getWordSelector() {
    if (isQuickFillMode) {
        return null;
    }

    if (!wordSelectorPromise) {
        wordSelectorPromise = import('../engines/WordSelector.js')
            .then((module) => module.wordSelector)
            .catch((err) => {
                console.error('[LabelOverlay] Failed to load WordSelector:', err);
                return null;
            });
    }

    return wordSelectorPromise;
}

export class LabelOverlay {
    constructor() {
        // Active label overlays
        // Map<fieldId, HTMLElement>
        this.labelElements = new Map();

        // Overlay layer reference
        this.overlayLayer = null;

        // Edit mode state
        this.editingFieldId = null;

        // Configuration
        this.config = {
            backgroundColor: 'rgba(255, 243, 140, 0.3)',
            borderColor: 'rgba(255, 193, 7, 0.5)',
            editBackgroundColor: 'rgba(255, 235, 59, 0.4)',
            editBorderColor: 'rgba(255, 152, 0, 0.9)',
            lineHeightTolerance: 10
        };
    }

    /**
     * Initialize
     */
    init(options = {}) {
        this.overlayLayer = document.getElementById(options.overlayLayerId || 'overlay-layer');

        if (!this.overlayLayer) {
            console.warn('[LabelOverlay] Overlay layer not found');
            return;
        }

        this._setupListeners();
        console.log('[LabelOverlay] Initialized');
    }

    _setupListeners() {
        // Field deleted - remove overlay
        eventBus.on(Events.FIELD_DELETED, (field) => {
            this.removeLabelOverlay(field.id);
        });

        // Label selected - render it
        eventBus.on('label:selected', ({ fieldId }) => {
            if (fieldId) {
                const field = state.getField(fieldId);
                if (field) {
                    this.renderLabelForField(field);
                }
            }
        });
    }

    // ============ SELECTION API (delegates to WordSelector) ============

    /**
     * Start label selection for a field
     */
    async startClickSelectMode(fieldId) {
        const selector = await getWordSelector();
        if (!selector) return;
        await selector.startLabelSelection(fieldId);
    }

    /**
     * Start title selection (for groups)
     */
    async startTitleSelection(callback) {
        const selector = await getWordSelector();
        if (!selector) return;
        await selector.startTitleSelection(callback);
    }

    /**
     * Start field name selection
     */
    async startFieldNameSelection(callback) {
        const selector = await getWordSelector();
        if (!selector) return;
        await selector.startFieldNameSelection(callback);
    }

    /**
     * Exit selection mode
     */
    exitClickSelectMode() {
        if (!wordSelectorPromise) return;
        wordSelectorPromise.then((selector) => {
            selector?.cancelSelection();
        });
    }

    // ============ RENDERING ============

    /**
     * Render all label overlays for current page
     */
    async renderAll() {
        if (!this.overlayLayer) return;

        this.clearAll();

        const currentPage = state.get('document.currentPage');
        const fields = state.get('fields').filter(f =>
            f.page === currentPage && f.labelSelection
        );

        for (const field of fields) {
            await this.renderLabelForField(field);
        }
    }

    /**
     * Render label overlay for a field
     */
    async renderLabelForField(field) {
        if (!this.overlayLayer || !field.labelSelection) return;

        this.removeLabelOverlay(field.id);

        const { wordIds, page } = field.labelSelection;

        // Only render on current page
        const currentPage = state.get('document.currentPage');
        if (page !== currentPage) return;

        // Get words from WordSelector
        const allWords = await wordSelector.getWords(page);
        const wordMap = new Map(allWords.map(w => [w.wordId, w]));
        const words = wordIds.map(id => wordMap.get(id)).filter(Boolean);

        if (words.length === 0) {
            console.log(`[LabelOverlay] No words found for field ${field.id}`);
            return;
        }

        // Calculate combined bounding box
        const bbox = this._calculateCombinedBbox(words);
        const screenBbox = this._pdfToScreenBbox(bbox);

        if (screenBbox.width <= 0 || screenBbox.height <= 0) {
            return;
        }

        const isEditing = this.editingFieldId === field.id;

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'label-overlay' + (isEditing ? ' editing' : '');
        overlay.dataset.fieldId = field.id;

        overlay.style.cssText = `
            position: absolute;
            left: ${screenBbox.x}px;
            top: ${screenBbox.y}px;
            width: ${screenBbox.width}px;
            height: ${screenBbox.height}px;
            background: ${isEditing ? this.config.editBackgroundColor : this.config.backgroundColor};
            border: ${isEditing ? '2px solid' : '1px dashed'} ${isEditing ? this.config.editBorderColor : this.config.borderColor};
            pointer-events: auto;
            cursor: pointer;
            z-index: ${isEditing ? 10 : 3};
            border-radius: 3px;
            transition: all 0.15s;
        `;

        // Double-click to edit
        overlay.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.startEditing(field.id);
        });

        this.overlayLayer.appendChild(overlay);
        this.labelElements.set(field.id, overlay);

        // Add resize handles in edit mode
        if (isEditing) {
            this._addResizeHandles(overlay, field, words);
        }
    }

    /**
     * Add resize handles for word adjustment
     */
    async _addResizeHandles(overlay, field, words) {
        const handleStyle = `
            position: absolute;
            background: rgba(255, 152, 0, 0.8);
            z-index: 11;
            transition: background 0.1s;
        `;

        // Horizontal handles (expand/shrink words)
        const rightHandle = document.createElement('div');
        rightHandle.className = 'label-handle right';
        rightHandle.style.cssText = handleStyle + `
            width: 8px; height: 100%; top: 0; right: -4px;
            cursor: ew-resize; border-radius: 0 3px 3px 0;
        `;
        rightHandle.title = 'הוסף/הסר מילה מימין';

        const leftHandle = document.createElement('div');
        leftHandle.className = 'label-handle left';
        leftHandle.style.cssText = handleStyle + `
            width: 8px; height: 100%; top: 0; left: -4px;
            cursor: ew-resize; border-radius: 3px 0 0 3px;
        `;
        leftHandle.title = 'הוסף/הסר מילה משמאל';

        // Vertical handles (expand to other lines)
        const topHandle = document.createElement('div');
        topHandle.className = 'label-handle top';
        topHandle.style.cssText = handleStyle + `
            height: 8px; width: 100%; left: 0; top: -4px;
            cursor: ns-resize; border-radius: 3px 3px 0 0;
            background: rgba(100, 181, 246, 0.8);
        `;
        topHandle.title = 'הרחב לשורה למעלה';

        const bottomHandle = document.createElement('div');
        bottomHandle.className = 'label-handle bottom';
        bottomHandle.style.cssText = handleStyle + `
            height: 8px; width: 100%; left: 0; bottom: -4px;
            cursor: ns-resize; border-radius: 0 0 3px 3px;
            background: rgba(100, 181, 246, 0.8);
        `;
        bottomHandle.title = 'הרחב לשורה למטה';

        // Hover effects
        [rightHandle, leftHandle].forEach(h => {
            h.addEventListener('mouseenter', () => h.style.background = 'rgba(255, 87, 34, 1)');
            h.addEventListener('mouseleave', () => h.style.background = 'rgba(255, 152, 0, 0.8)');
        });

        [topHandle, bottomHandle].forEach(h => {
            h.addEventListener('mouseenter', () => h.style.background = 'rgba(33, 150, 243, 1)');
            h.addEventListener('mouseleave', () => h.style.background = 'rgba(100, 181, 246, 0.8)');
        });

        // Click handlers for word adjustment
        rightHandle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.expandStart(field.id);
        });

        leftHandle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.expandEnd(field.id);
        });

        topHandle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.expandUp(field.id);
        });

        bottomHandle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.expandDown(field.id);
        });

        overlay.appendChild(rightHandle);
        overlay.appendChild(leftHandle);
        overlay.appendChild(topHandle);
        overlay.appendChild(bottomHandle);

        // Add control buttons
        this._addEditControls(overlay, field);
    }

    /**
     * Add edit control buttons
     */
    _addEditControls(overlay, field) {
        const controls = document.createElement('div');
        controls.className = 'label-edit-controls';
        controls.style.cssText = `
            position: absolute;
            bottom: -36px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 4px;
            background: white;
            padding: 6px 10px;
            border-radius: 6px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 100;
            white-space: nowrap;
        `;

        const btnStyle = `
            padding: 4px 8px;
            font-size: 12px;
            border: 1px solid #ddd;
            background: white;
            cursor: pointer;
            border-radius: 4px;
        `;

        // Shrink start
        const shrinkStartBtn = document.createElement('button');
        shrinkStartBtn.innerHTML = '→−';
        shrinkStartBtn.title = 'הסר מילה מימין';
        shrinkStartBtn.style.cssText = btnStyle;
        shrinkStartBtn.onclick = (e) => { e.stopPropagation(); this.shrinkStart(field.id); };

        // Expand start
        const expandStartBtn = document.createElement('button');
        expandStartBtn.innerHTML = '→+';
        expandStartBtn.title = 'הוסף מילה מימין';
        expandStartBtn.style.cssText = btnStyle;
        expandStartBtn.onclick = (e) => { e.stopPropagation(); this.expandStart(field.id); };

        // Expand end
        const expandEndBtn = document.createElement('button');
        expandEndBtn.innerHTML = '←+';
        expandEndBtn.title = 'הוסף מילה משמאל';
        expandEndBtn.style.cssText = btnStyle;
        expandEndBtn.onclick = (e) => { e.stopPropagation(); this.expandEnd(field.id); };

        // Shrink end
        const shrinkEndBtn = document.createElement('button');
        shrinkEndBtn.innerHTML = '←−';
        shrinkEndBtn.title = 'הסר מילה משמאל';
        shrinkEndBtn.style.cssText = btnStyle;
        shrinkEndBtn.onclick = (e) => { e.stopPropagation(); this.shrinkEnd(field.id); };

        // Done
        const doneBtn = document.createElement('button');
        doneBtn.innerHTML = '✓';
        doneBtn.title = 'סיום';
        doneBtn.style.cssText = btnStyle + 'background: #4caf50; color: white; border-color: #4caf50;';
        doneBtn.onclick = (e) => { e.stopPropagation(); this.stopEditing(); };

        controls.appendChild(shrinkStartBtn);
        controls.appendChild(expandStartBtn);
        controls.appendChild(expandEndBtn);
        controls.appendChild(shrinkEndBtn);
        controls.appendChild(doneBtn);

        overlay.appendChild(controls);
    }

    // ============ LABEL MANIPULATION ============

    /**
     * Expand at start (RTL: add word to the right)
     */
    async expandStart(fieldId) {
        const field = state.getField(fieldId);
        if (!field?.labelSelection) return;

        const { wordIds, page } = field.labelSelection;
        const allWords = await wordSelector.getWords(page);

        // Find word before first (lower wordId in sorted order = to the right in RTL)
        const firstWordId = Math.min(...wordIds);
        if (firstWordId <= 0) return;

        // Find the previous selectable word
        for (let id = firstWordId - 1; id >= 0; id--) {
            const word = allWords.find(w => w.wordId === id);
            if (word && word.selectable) {
                const newWordIds = [id, ...wordIds];
                await this._updateLabel(fieldId, newWordIds, page);
                break;
            }
        }
    }

    /**
     * Shrink from start
     */
    async shrinkStart(fieldId) {
        const field = state.getField(fieldId);
        if (!field?.labelSelection) return;

        const { wordIds, page } = field.labelSelection;
        if (wordIds.length <= 1) return;

        // Remove first word (smallest wordId)
        const sorted = [...wordIds].sort((a, b) => a - b);
        const newWordIds = sorted.slice(1);
        await this._updateLabel(fieldId, newWordIds, page);
    }

    /**
     * Expand at end (RTL: add word to the left)
     */
    async expandEnd(fieldId) {
        const field = state.getField(fieldId);
        if (!field?.labelSelection) return;

        const { wordIds, page } = field.labelSelection;
        const allWords = await wordSelector.getWords(page);

        const lastWordId = Math.max(...wordIds);
        const maxId = allWords.length - 1;
        if (lastWordId >= maxId) return;

        // Find the next selectable word
        for (let id = lastWordId + 1; id <= maxId; id++) {
            const word = allWords.find(w => w.wordId === id);
            if (word && word.selectable) {
                const newWordIds = [...wordIds, id];
                await this._updateLabel(fieldId, newWordIds, page);
                break;
            }
        }
    }

    /**
     * Shrink from end
     */
    async shrinkEnd(fieldId) {
        const field = state.getField(fieldId);
        if (!field?.labelSelection) return;

        const { wordIds, page } = field.labelSelection;
        if (wordIds.length <= 1) return;

        // Remove last word (largest wordId)
        const sorted = [...wordIds].sort((a, b) => a - b);
        const newWordIds = sorted.slice(0, -1);
        await this._updateLabel(fieldId, newWordIds, page);
    }

    /**
     * Expand up (add previous line)
     */
    async expandUp(fieldId) {
        const field = state.getField(fieldId);
        if (!field?.labelSelection) return;

        const { wordIds, page } = field.labelSelection;
        const allWords = await wordSelector.getWords(page);

        // Get current words
        const currentWords = wordIds.map(id => allWords.find(w => w.wordId === id)).filter(Boolean);
        if (currentWords.length === 0) return;

        const topY = Math.min(...currentWords.map(w => w.pdfY));

        // Find words on previous line
        const prevLineWords = allWords.filter(w =>
            w.selectable &&
            w.pdfY < topY - 5 &&
            w.pdfY > topY - this.config.lineHeightTolerance * 3
        );

        if (prevLineWords.length === 0) return;

        const newWordIds = [...new Set([...prevLineWords.map(w => w.wordId), ...wordIds])];
        await this._updateLabel(fieldId, newWordIds, page);
    }

    /**
     * Expand down (add next line)
     */
    async expandDown(fieldId) {
        const field = state.getField(fieldId);
        if (!field?.labelSelection) return;

        const { wordIds, page } = field.labelSelection;
        const allWords = await wordSelector.getWords(page);

        const currentWords = wordIds.map(id => allWords.find(w => w.wordId === id)).filter(Boolean);
        if (currentWords.length === 0) return;

        const bottomY = Math.max(...currentWords.map(w => w.pdfY + w.pdfHeight));

        // Find words on next line
        const nextLineWords = allWords.filter(w =>
            w.selectable &&
            w.pdfY > bottomY - 5 &&
            w.pdfY < bottomY + this.config.lineHeightTolerance * 3
        );

        if (nextLineWords.length === 0) return;

        const newWordIds = [...new Set([...wordIds, ...nextLineWords.map(w => w.wordId)])];
        await this._updateLabel(fieldId, newWordIds, page);
    }

    /**
     * Update field's label
     */
    async _updateLabel(fieldId, wordIds, page) {
        const allWords = await wordSelector.getWords(page);
        const wordMap = new Map(allWords.map(w => [w.wordId, w]));

        // Sort wordIds and get text
        const sortedIds = [...wordIds].sort((a, b) => a - b);
        const labelText = sortedIds.map(id => wordMap.get(id)?.text).filter(Boolean).join(' ');

        state.updateField(fieldId, {
            labelSelection: { wordIds: sortedIds, page },
            label_he: labelText,
            label_en: fieldNamer.hebrewToEnglish(labelText)
        });

        // Re-render
        const field = state.getField(fieldId);
        if (field) {
            await this.renderLabelForField(field);
        }

        eventBus.emit('label:updated', { fieldId, labelText });
    }

    // ============ EDIT MODE ============

    startEditing(fieldId) {
        if (this.editingFieldId === fieldId) return;

        // Stop editing previous
        if (this.editingFieldId) {
            this.stopEditing();
        }

        this.editingFieldId = fieldId;

        // Setup exit listeners
        this._exitKeyHandler = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault();
                this.stopEditing();
            }
        };
        document.addEventListener('keydown', this._exitKeyHandler);

        this._exitClickHandler = (e) => {
            const overlay = this.labelElements.get(this.editingFieldId);
            if (overlay && !overlay.contains(e.target)) {
                this.stopEditing();
            }
        };
        setTimeout(() => document.addEventListener('click', this._exitClickHandler), 100);

        // Re-render with edit mode
        const field = state.getField(fieldId);
        if (field) {
            this.renderLabelForField(field);
        }

        state.selectField(fieldId);
        eventBus.emit('label:editStart', { fieldId });
    }

    stopEditing() {
        if (!this.editingFieldId) return;

        const fieldId = this.editingFieldId;
        this.editingFieldId = null;

        // Remove listeners
        if (this._exitKeyHandler) {
            document.removeEventListener('keydown', this._exitKeyHandler);
        }
        if (this._exitClickHandler) {
            document.removeEventListener('click', this._exitClickHandler);
        }

        // Re-render without edit mode
        const field = state.getField(fieldId);
        if (field) {
            this.renderLabelForField(field);
        }

        eventBus.emit('label:editEnd', { fieldId });
    }

    // ============ CLEANUP ============

    removeLabelOverlay(fieldId) {
        const el = this.labelElements.get(fieldId);
        if (el) {
            el.remove();
            this.labelElements.delete(fieldId);
        }
    }

    clearAll() {
        this.labelElements.forEach(el => el.remove());
        this.labelElements.clear();
    }

    // ============ COORDINATE CONVERSION ============

    _pdfToScreenBbox(bbox) {
        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) return { x: 0, y: 0, width: 0, height: 0 };

        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfPageDimensions.width / dpiScale;
        const pdfH = pdfPageDimensions.height / dpiScale;

        const layerWidth = this.overlayLayer?.offsetWidth || 1;
        const layerHeight = this.overlayLayer?.offsetHeight || 1;

        const scaleX = layerWidth / pdfW;
        const scaleY = layerHeight / pdfH;

        return {
            x: Math.round(bbox.x * scaleX),
            y: Math.round(bbox.y * scaleY),
            width: Math.round(bbox.width * scaleX),
            height: Math.round(bbox.height * scaleY)
        };
    }

    _calculateCombinedBbox(words) {
        if (words.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const word of words) {
            minX = Math.min(minX, word.pdfX);
            minY = Math.min(minY, word.pdfY);
            maxX = Math.max(maxX, word.pdfX + word.pdfWidth);
            maxY = Math.max(maxY, word.pdfY + word.pdfHeight);
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    // ============ UTILITY ============

    async getLabelText(fieldId) {
        const field = state.getField(fieldId);
        if (!field?.labelSelection) return field?.label_he || '';

        return await wordSelector.getLabelText(field.labelSelection);
    }

    clearWordCache(page) {
        wordSelector.clearCache(page);
    }

    // ============ LEGACY COMPATIBILITY ============

    async getProcessedWords(page) {
        return await wordSelector.getWords(page);
    }

    /**
     * Create labelSelection from screen bbox (for auto-detection)
     */
    async createLabelSelectionFromBbox(screenX, screenY, screenWidth, screenHeight, page) {
        const words = await wordSelector.getWords(page);

        // Convert screen to PDF coordinates
        const pdfBbox = this._screenToPdfBbox(screenX, screenY, screenWidth, screenHeight);

        // Find words with center inside bbox OR significant overlap
        const matchingWords = words.filter(word => {
            if (!word.selectable) return false;

            const centerX = word.pdfX + word.pdfWidth / 2;
            const centerY = word.pdfY + word.pdfHeight / 2;

            // Check if center is inside bbox
            const centerInside = (
                centerX >= pdfBbox.x &&
                centerX <= pdfBbox.x + pdfBbox.width &&
                centerY >= pdfBbox.y &&
                centerY <= pdfBbox.y + pdfBbox.height
            );

            if (centerInside) return true;

            // Also check for 25% overlap
            const overlapX1 = Math.max(word.pdfX, pdfBbox.x);
            const overlapX2 = Math.min(word.pdfX + word.pdfWidth, pdfBbox.x + pdfBbox.width);
            const overlapY1 = Math.max(word.pdfY, pdfBbox.y);
            const overlapY2 = Math.min(word.pdfY + word.pdfHeight, pdfBbox.y + pdfBbox.height);

            if (overlapX1 >= overlapX2 || overlapY1 >= overlapY2) return false;

            const overlapArea = (overlapX2 - overlapX1) * (overlapY2 - overlapY1);
            const wordArea = word.pdfWidth * word.pdfHeight;

            return overlapArea / wordArea >= 0.25;
        });

        if (matchingWords.length === 0) return null;

        matchingWords.sort((a, b) => a.wordId - b.wordId);

        return {
            wordIds: matchingWords.map(w => w.wordId),
            page: page
        };
    }

    /**
     * Get words by IDs
     */
    async getWordsByIds(wordIds, page) {
        const words = await wordSelector.getWords(page);
        const wordMap = new Map(words.map(w => [w.wordId, w]));
        return wordIds.map(id => wordMap.get(id)).filter(Boolean);
    }

    /**
     * Convert screen to PDF bbox
     */
    _screenToPdfBbox(screenX, screenY, screenWidth, screenHeight) {
        const pdfPageDimensions = pdfEngine.getPdfPageDimensions();
        if (!pdfPageDimensions) return { x: 0, y: 0, width: 0, height: 0 };

        const dpiScale = pdfEngine.getDpiScale();
        const pdfW = pdfPageDimensions.width / dpiScale;
        const pdfH = pdfPageDimensions.height / dpiScale;

        const layerWidth = this.overlayLayer?.offsetWidth || 1;
        const layerHeight = this.overlayLayer?.offsetHeight || 1;

        const scaleX = pdfW / layerWidth;
        const scaleY = pdfH / layerHeight;

        return {
            x: screenX * scaleX,
            y: screenY * scaleY,
            width: screenWidth * scaleX,
            height: screenHeight * scaleY
        };
    }
}

// Singleton
export const labelOverlay = new LabelOverlay();
