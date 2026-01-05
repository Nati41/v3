/**
 * Field Type Suggestion - Floating overlay for field type selection
 * Part of the Unified Mapping Flow (Step 5 / Part 4)
 *
 * Shows a suggestion box when a field is drawn, allowing the user to
 * confirm or change the suggested field type before creation.
 *
 * IMPORTANT: This is an additive layer only - does NOT modify any existing logic.
 */

export class FieldTypeSuggestion {
    constructor(mapper) {
        this.mapper = mapper;
        this.overlay = null;
        this.timeoutId = null;
        this.callback = null;
        this.isVisible = false;

        // Configuration
        this.TIMEOUT_MS = 1200;  // Auto-confirm after 1.2 seconds

        // Type configuration with icons and labels
        this.typeConfig = {
            text: { icon: '📝', label: 'Text', labelHe: 'טקסט' },
            checkbox: { icon: '☑️', label: 'Checkbox', labelHe: 'צ\'קבוקס' },
            radio: { icon: '🔘', label: 'Radio', labelHe: 'רדיו' },
            table: { icon: '📊', label: 'Table', labelHe: 'טבלה' }
        };
    }

    /**
     * Show the suggestion overlay
     * @param {Object} bbox - { x, y, width, height } in canvas coordinates
     * @param {string} suggestedType - The auto-detected type suggestion
     * @param {Function} callback - Called with selected type when user chooses or timeout
     */
    show(bbox, suggestedType, callback) {
        // Clean up any existing overlay
        this.hide();

        this.callback = callback;
        this.isVisible = true;

        // Create overlay element
        this.overlay = document.createElement('div');
        this.overlay.className = 'field-type-suggestion-overlay';
        this.overlay.id = 'field-type-suggestion-overlay';

        // Position above the bbox (accounting for zoom)
        const zoomLevel = this.mapper.zoomLevel || 1;
        const layer = document.getElementById('mapping-layer');
        if (!layer) {
            console.warn('⚠️ FieldTypeSuggestion: mapping-layer not found');
            this._selectType(suggestedType);
            return;
        }

        const layerRect = layer.getBoundingClientRect();

        // Calculate position relative to viewport
        const overlayX = layerRect.left + (bbox.x * zoomLevel) + (bbox.width * zoomLevel / 2);
        const overlayY = layerRect.top + (bbox.y * zoomLevel) - 10; // 10px above bbox

        this.overlay.style.left = `${overlayX}px`;
        this.overlay.style.top = `${overlayY}px`;

        // Build content
        this.overlay.innerHTML = this._buildContent(suggestedType);

        // Add to document body (fixed positioning)
        document.body.appendChild(this.overlay);

        // Attach button handlers
        this._attachHandlers(suggestedType);

        // Start timeout for auto-confirm
        this._startTimeout(suggestedType);

        // Start countdown animation
        this._startCountdown();

        console.log('🎯 FieldTypeSuggestion shown:', { bbox, suggestedType });
    }

    /**
     * Build the overlay HTML content
     * @param {string} suggestedType - The suggested type to highlight
     * @returns {string} HTML content
     */
    _buildContent(suggestedType) {
        const types = ['text', 'checkbox', 'radio', 'table'];

        let buttonsHtml = types.map(type => {
            const config = this.typeConfig[type];
            const isSelected = type === suggestedType;
            const selectedClass = isSelected ? 'selected' : '';

            return `
                <button class="fts-btn fts-btn-${type} ${selectedClass}" data-type="${type}">
                    <span class="fts-icon">${config.icon}</span>
                    <span class="fts-label">${config.label}</span>
                </button>
            `;
        }).join('');

        return `
            <div class="fts-header">
                <span class="fts-title">סוג שדה</span>
                <div class="fts-countdown">
                    <div class="fts-countdown-bar"></div>
                </div>
            </div>
            <div class="fts-buttons">
                ${buttonsHtml}
            </div>
        `;
    }

    /**
     * Attach click handlers to buttons
     * @param {string} suggestedType - Fallback type if something goes wrong
     */
    _attachHandlers(suggestedType) {
        if (!this.overlay) return;

        const buttons = this.overlay.querySelectorAll('.fts-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const type = btn.dataset.type;
                this._selectType(type || suggestedType);
            });
        });

        // Close on click outside (after a short delay to prevent immediate close)
        setTimeout(() => {
            this._outsideClickHandler = (e) => {
                if (this.overlay && !this.overlay.contains(e.target)) {
                    this._selectType(suggestedType);
                }
            };
            document.addEventListener('click', this._outsideClickHandler, { once: true });
        }, 100);
    }

    /**
     * Start the auto-confirm timeout
     * @param {string} suggestedType - Type to confirm if timeout expires
     */
    _startTimeout(suggestedType) {
        this.timeoutId = setTimeout(() => {
            if (this.isVisible) {
                console.log('⏱️ FieldTypeSuggestion timeout - auto-confirming:', suggestedType);
                this._selectType(suggestedType);
            }
        }, this.TIMEOUT_MS);
    }

    /**
     * Start countdown bar animation
     */
    _startCountdown() {
        if (!this.overlay) return;

        const bar = this.overlay.querySelector('.fts-countdown-bar');
        if (bar) {
            // Force reflow to restart animation
            bar.style.animation = 'none';
            bar.offsetHeight; // Trigger reflow
            bar.style.animation = `fts-countdown ${this.TIMEOUT_MS}ms linear forwards`;
        }
    }

    /**
     * Handle type selection (from user click or timeout)
     * @param {string} type - Selected field type
     */
    _selectType(type) {
        // Clear timeout
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        // Remove outside click handler
        if (this._outsideClickHandler) {
            document.removeEventListener('click', this._outsideClickHandler);
            this._outsideClickHandler = null;
        }

        // CRITICAL FIX: Save callback BEFORE calling hide()
        // because hide() sets this.callback = null
        const cb = this.callback;
        this.callback = null;

        // Hide overlay (this no longer affects the callback we saved)
        this.hide();

        // Call the saved callback with selected type
        if (cb) {
            console.log('✅ FieldTypeSuggestion selected:', type, '- calling callback');
            cb(type);
        } else {
            console.error('❌ FieldTypeSuggestion: callback was null, field NOT created!');
        }
    }

    /**
     * Hide and remove the overlay
     * NOTE: This does NOT invoke the callback - it just clears references.
     * If you need to invoke callback before hiding, save it first like _selectType does.
     */
    hide() {
        // Clear timeout
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        // Remove outside click handler
        if (this._outsideClickHandler) {
            document.removeEventListener('click', this._outsideClickHandler);
            this._outsideClickHandler = null;
        }

        // Remove overlay element
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        this.isVisible = false;
        // NOTE: callback is cleared here - callers that need it should save it first
        this.callback = null;
    }

    /**
     * Full cleanup - call on page change, file upload, etc.
     */
    cleanup() {
        this.hide();
        console.log('🧹 FieldTypeSuggestion cleaned up');
    }

    /**
     * Check if suggestion box is currently visible
     * @returns {boolean}
     */
    isActive() {
        return this.isVisible;
    }
}

// Self-register to window for easy access
if (typeof window !== 'undefined') {
    window.FieldTypeSuggestion = FieldTypeSuggestion;
}

console.log('🎯 Field Type Suggestion module loaded');
