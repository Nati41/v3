/**
 * Visual Guidance Engine (Global)
 * General-purpose educational overlay for the entire mapper
 *
 * Features:
 * - Semi-transparent hint overlays
 * - Step-by-step visual guidance for all field types
 * - PNG/SVG example hints per mode
 * - Toggle visibility with Help button
 * - Non-interactive (pointer-events: none)
 * - Scales with zoom (same transform as PDF canvas)
 * - Fade-in/out animations
 *
 * STABILITY FEATURES (Task 4):
 * - Dedicated persistent layer (#visual-guide-layer)
 * - Protection from accidental cleanup
 * - Stable lifecycle across mode switches
 * - Scale/position synchronization with PDF canvas
 * - Debug logging for all state changes
 */

class VisualGuide {
    /**
     * @param {HTMLElement} layerElement - The layer element to attach overlays to
     */
    constructor(layerElement) {
        this.layer = layerElement;
        this._isVisible = false;
        this._currentMode = null;
        this._overlayContainer = null;
        this._helpImageContainer = null;
        this._currentScale = 1;
        this._currentTranslateX = 0;
        this._currentTranslateY = 0;
        this._persistMode = false; // When true, guide persists through mode changes
        this._init();
    }

    /**
     * Initialize the visual guide system
     * STABILITY: Uses dedicated layer that won't be cleared by other systems
     */
    _init() {
        // STABILITY FIX: First try to use the existing dedicated layer from HTML
        const existingLayer = document.getElementById('visual-guide-overlay');
        if (existingLayer) {
            this._overlayContainer = existingLayer;
            // Ensure proper styling
            this._overlayContainer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 500;
                display: none;
                transition: opacity 0.3s ease;
            `;
            console.log('[VisualGuide] Using existing dedicated layer');
        } else {
            // Create overlay container if not exists
            this._overlayContainer = document.createElement('div');
            this._overlayContainer.id = 'visual-guide-overlay';
            this._overlayContainer.className = 'visual-guide-overlay';
            // STABILITY: Add data attribute to prevent accidental cleanup
            this._overlayContainer.dataset.persistent = 'true';
            this._overlayContainer.dataset.visualGuide = 'true';
            this._overlayContainer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 500;
                display: none;
                transition: opacity 0.3s ease;
            `;

            // Insert into the layer (transform container)
            if (this.layer) {
                this.layer.appendChild(this._overlayContainer);
            } else {
                // Fallback to canvas-container for proper scaling
                const canvasContainer = document.getElementById('canvas-container');
                if (canvasContainer) {
                    canvasContainer.appendChild(this._overlayContainer);
                } else {
                    // Last resort: transform-container
                    const transformContainer = document.getElementById('transform-container');
                    if (transformContainer) {
                        transformContainer.appendChild(this._overlayContainer);
                    }
                }
            }
            console.log('[VisualGuide] Created new dedicated layer');
        }

        // Create help image container (for PNG/SVG hints)
        if (!this._helpImageContainer) {
            this._helpImageContainer = document.createElement('div');
            this._helpImageContainer.id = 'visual-guide-help-image';
            this._helpImageContainer.className = 'visual-guide-help-image';
            this._helpImageContainer.dataset.persistent = 'true';
            this._helpImageContainer.dataset.visualGuide = 'true';
            this._helpImageContainer.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 10001;
                display: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(this._helpImageContainer);
        }

        // Add CSS for animations
        this._addStyles();

        console.log('[VisualGuide] Initialized with stability features');
    }

    /**
     * Add CSS styles for the visual guide
     */
    _addStyles() {
        if (document.getElementById('visual-guide-styles')) return;

        const styleSheet = document.createElement('style');
        styleSheet.id = 'visual-guide-styles';
        styleSheet.textContent = `
            @keyframes vg-pulseHint {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }

            @keyframes vg-fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes vg-fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }

            @keyframes vg-slideUp {
                from { transform: translateX(-50%) translateY(20px); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }

            @keyframes vg-slideDown {
                from { transform: translateX(-50%) translateY(0); opacity: 1; }
                to { transform: translateX(-50%) translateY(20px); opacity: 0; }
            }

            .visual-guide-overlay {
                transition: opacity 0.3s ease;
            }

            .visual-guide-hint {
                animation: vg-pulseHint 2s infinite;
            }

            .visual-guide-tooltip {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
                z-index: 10000;
                pointer-events: none;
                animation: vg-slideUp 0.3s ease-out;
            }

            .visual-guide-tooltip.hiding {
                animation: vg-slideDown 0.3s ease-in forwards;
            }

            .visual-guide-help-image {
                background: white;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 8px 40px rgba(0,0,0,0.3);
                max-width: 400px;
            }

            .visual-guide-help-image.visible {
                display: block !important;
                opacity: 1;
                animation: vg-fadeIn 0.3s ease-out;
            }

            .visual-guide-help-image .help-title {
                font-size: 18px;
                font-weight: bold;
                color: #333;
                margin-bottom: 12px;
                text-align: center;
            }

            .visual-guide-help-image .help-content {
                font-size: 14px;
                color: #666;
                line-height: 1.6;
                text-align: center;
            }

            .visual-guide-help-image .help-example {
                margin-top: 15px;
                padding: 15px;
                background: #f5f5f5;
                border-radius: 8px;
                text-align: center;
            }

            .visual-guide-help-image .help-example svg {
                max-width: 100%;
                height: auto;
            }

            #btn-visual-help.active {
                background: linear-gradient(135deg, #667eea, #764ba2) !important;
                color: white !important;
            }
        `;
        document.head.appendChild(styleSheet);
    }

    /**
     * Start visual guidance for a specific mode
     * STABILITY: Mode persists until explicitly stopped
     * @param {string} mode - Mode: 'text', 'checkbox', 'radio', 'table', 'field'
     * @param {boolean} autoShow - If true, automatically show the guide (default: false)
     */
    start(mode, autoShow = false) {
        const previousMode = this._currentMode;
        this._currentMode = mode;
        this._persistMode = true;

        console.log('[VisualGuide] Started mode:', mode, '(previous:', previousMode, ')');

        if (this._isVisible) {
            this._renderGuide(mode);
        } else if (autoShow) {
            this.show();
        }
    }

    /**
     * Stop visual guidance - explicit cleanup
     * STABILITY: Only this method should hide the guide when exiting modes
     * @param {string} caller - Caller identifier for debugging
     */
    stop(caller = 'unknown') {
        console.log('[VisualGuide] Stopped by:', caller, '(was mode:', this._currentMode, ')');

        // Remove overlay container contents
        if (this._overlayContainer) {
            this._overlayContainer.innerHTML = '';
            this._overlayContainer.style.display = 'none';
        }

        // Hide tooltip
        const tooltip = document.getElementById('visual-guide-tooltip');
        if (tooltip) {
            tooltip.remove();
        }

        // Hide help image
        if (this._helpImageContainer) {
            this._helpImageContainer.classList.remove('visible');
        }

        // Reset state
        this._currentMode = null;
        this._persistMode = false;
        this._isVisible = false;

        // Update button state
        const helpBtn = document.getElementById('btn-visual-help');
        if (helpBtn) {
            helpBtn.classList.remove('active');
        }
    }

    /**
     * Update visual guide when zoom level changes
     * STABILITY: Synchronize with PDF canvas transform
     * @param {number} scale - New scale factor
     * @param {number} translateX - X translation (optional)
     * @param {number} translateY - Y translation (optional)
     */
    updateOnZoom(scale, translateX = 0, translateY = 0) {
        this._currentScale = scale;
        this._currentTranslateX = translateX;
        this._currentTranslateY = translateY;

        console.log('[VisualGuide] Updated for scale:', scale);

        // Re-render hints at new scale if visible
        if (this._isVisible && this._currentMode) {
            this._renderGuide(this._currentMode);
        }
    }

    /**
     * Update visual guide when page changes
     * STABILITY: Guide persists through page navigation
     * @param {number} pageNum - New page number
     */
    updateOnPageChange(pageNum) {
        console.log('[VisualGuide] Updated for page:', pageNum);

        // Clear current hints but keep guide visible if it was visible
        if (this._overlayContainer) {
            this._overlayContainer.innerHTML = '';
        }

        // Re-render for current mode
        if (this._isVisible && this._currentMode) {
            this._renderGuide(this._currentMode);
        }
    }

    /**
     * Apply transform to synchronize with PDF canvas
     * STABILITY: Same transform as PDF canvas and overlay-engine
     * @param {number} scale - Scale factor
     * @param {number} translateX - X translation
     * @param {number} translateY - Y translation
     */
    applyTransform(scale, translateX, translateY) {
        if (!this._overlayContainer) return;

        this._currentScale = scale;
        this._currentTranslateX = translateX;
        this._currentTranslateY = translateY;

        // Apply transform to match PDF canvas
        this._overlayContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        this._overlayContainer.style.transformOrigin = 'top left';

        console.log('[VisualGuide] Applied transform:', { scale, translateX, translateY });
    }

    /**
     * Get current mode
     * @returns {string|null}
     */
    getCurrentMode() {
        return this._currentMode;
    }

    /**
     * Check if guide is in persistent mode
     * @returns {boolean}
     */
    isPersistent() {
        return this._persistMode;
    }

    /**
     * Highlight a specific area with a visual hint
     * @param {Object} bbox - Bounding box { x, y, width, height }
     * @param {string} label - Optional label text
     * @param {string} color - Optional color (default: blue)
     */
    highlightArea(bbox, label = '', color = 'rgba(102, 126, 234, 0.3)') {
        if (!this._isVisible || !this._overlayContainer) return;

        const hint = document.createElement('div');
        hint.className = 'visual-guide-hint';
        hint.style.cssText = `
            position: absolute;
            left: ${bbox.x}px;
            top: ${bbox.y}px;
            width: ${bbox.width}px;
            height: ${bbox.height}px;
            background: ${color};
            border: 2px dashed rgba(102, 126, 234, 0.8);
            border-radius: 4px;
            pointer-events: none;
        `;

        if (label) {
            const labelEl = document.createElement('div');
            labelEl.className = 'visual-guide-label';
            labelEl.textContent = label;
            labelEl.style.cssText = `
                position: absolute;
                top: -24px;
                right: 0;
                background: #667eea;
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 500;
                white-space: nowrap;
            `;
            hint.appendChild(labelEl);
        }

        this._overlayContainer.appendChild(hint);
        return hint;
    }

    /**
     * Show contextual help for a specific step with PNG/SVG example
     * @param {string} step - Step identifier
     */
    showHelp(step) {
        // Show tooltip message
        const helpConfig = this._getHelpConfig(step);
        if (helpConfig) {
            this._showHelpTooltip(helpConfig.message);

            // Show example image if available
            if (helpConfig.example) {
                this._showExampleImage(helpConfig);
            }
        }
    }

    /**
     * Get help configuration for a step
     * @param {string} step - Step identifier
     * @returns {Object} Help configuration
     */
    _getHelpConfig(step) {
        const helpConfigs = {
            'field_draw': {
                message: 'גרור מלבן סביב השדה שברצונך למפות',
                title: 'יצירת שדה טקסט',
                description: 'לחץ וגרור כדי ליצור מלבן סביב אזור הטקסט',
                example: this._getFieldDrawSVG()
            },
            'text_select': {
                message: 'בחר טקסט כדי לתת שם לשדה',
                title: 'בחירת טקסט',
                description: 'סמן את הטקסט שישמש כשם השדה',
                example: this._getTextSelectSVG()
            },
            'checkbox_place': {
                message: 'לחץ במיקום הרצוי ליצירת Checkbox',
                title: 'יצירת Checkbox',
                description: 'לחץ במקום הרצוי ליצירת תיבת סימון',
                example: this._getCheckboxSVG()
            },
            'radio_place': {
                message: 'לחץ במיקום הרצוי ליצירת Radio Button',
                title: 'יצירת Radio Button',
                description: 'לחץ במקום הרצוי ליצירת כפתור בחירה',
                example: this._getRadioSVG()
            },
            'table_header': {
                message: 'גרור מלבן סביב שורת הכותרת של הטבלה',
                title: 'שלב 1: בחירת כותרת',
                description: 'סמן את שורת הכותרת שמכילה את שמות העמודות',
                example: this._getTableHeaderSVG()
            },
            'table_row': {
                message: 'גרור מלבן סביב שורת נתונים אחת לדוגמא',
                title: 'שלב 2: שורה לדוגמא',
                description: 'סמן שורה אחת של נתונים כדוגמה',
                example: this._getTableRowSVG()
            },
            'table_column': {
                message: 'גרור מלבן סביב כל עמודה בנפרד',
                title: 'שלב 3: הגדרת עמודות',
                description: 'סמן כל עמודה בנפרד והגדר את השם והסוג',
                example: this._getTableColumnSVG()
            },
            'table_count': {
                message: 'הזן את מספר השורות בטבלה',
                title: 'שלב 4: מספר שורות',
                description: 'ספור את כל שורות הנתונים (ללא הכותרת)',
                example: null
            }
        };

        return helpConfigs[step];
    }

    /**
     * Show example image overlay
     * @param {Object} config - Help configuration with example
     */
    _showExampleImage(config) {
        if (!this._helpImageContainer || !config.example) return;

        this._helpImageContainer.innerHTML = `
            <div class="help-title">${config.title}</div>
            <div class="help-content">${config.description}</div>
            <div class="help-example">${config.example}</div>
        `;

        this._helpImageContainer.classList.add('visible');

        // Auto-hide after 4 seconds
        setTimeout(() => {
            this._helpImageContainer.classList.remove('visible');
        }, 4000);
    }

    /**
     * Hide all visual guides
     * STABILITY: Protected hide - won't hide if in persistent mode unless forced
     * @param {string} caller - Caller identifier for debug
     * @param {boolean} force - If true, hide even in persistent mode
     */
    hide(caller = 'unknown', force = false) {
        // STABILITY: Protect against accidental cleanup
        if (this._persistMode && !force && caller !== 'toggle' && caller !== 'stop') {
            console.log('[VisualGuide] Hide blocked - in persistent mode. Caller:', caller);
            return;
        }

        console.log('[VisualGuide] VG removed by:', caller, '(force:', force, ')');

        this._isVisible = false;

        if (this._overlayContainer) {
            this._overlayContainer.style.display = 'none';
            this._overlayContainer.innerHTML = '';
        }

        // Hide help tooltip
        const tooltip = document.getElementById('visual-guide-tooltip');
        if (tooltip) {
            tooltip.classList.add('hiding');
            setTimeout(() => tooltip.remove(), 300);
        }

        // Hide example image
        if (this._helpImageContainer) {
            this._helpImageContainer.classList.remove('visible');
        }

        // Update help button state
        const helpBtn = document.getElementById('btn-visual-help');
        if (helpBtn) {
            helpBtn.classList.remove('active');
        }

        console.log('[VisualGuide] Hidden');
    }

    /**
     * Toggle visibility of visual guides
     * @returns {boolean} New visibility state
     */
    toggle() {
        if (this._isVisible) {
            this.hide('toggle');
        } else {
            this.show();
        }
        return this._isVisible;
    }

    /**
     * Show visual guides
     */
    show() {
        this._isVisible = true;
        // FIX TASK 1: Log when visual guide is created/shown
        console.log('[VisualGuide] VG created:', this._overlayContainer);

        if (this._overlayContainer) {
            this._overlayContainer.style.display = 'block';
        }

        // Update help button state
        const helpBtn = document.getElementById('btn-visual-help');
        if (helpBtn) {
            helpBtn.classList.add('active');
        }

        // Render guide for current mode
        if (this._currentMode) {
            this._renderGuide(this._currentMode);
        } else {
            this._showHelpTooltip('בחר כלי מהסרגל להתחלת המיפוי');
        }

        console.log('[VisualGuide] Shown');
    }

    /**
     * Check if visual guide is visible
     * @returns {boolean}
     */
    isVisible() {
        return this._isVisible;
    }

    /**
     * Clear all hints but keep guide visible
     */
    clearHints() {
        if (this._overlayContainer) {
            this._overlayContainer.innerHTML = '';
        }
    }

    /**
     * Render mode-specific guidance
     * @param {string} mode - Current mode
     */
    _renderGuide(mode) {
        this.clearHints();

        const modeMessages = {
            'text': 'בחר אזור טקסט כדי לתת שם לשדה',
            'checkbox': 'לחץ במיקום הרצוי ליצירת Checkbox',
            'radio': 'לחץ במיקום הרצוי ליצירת Radio Button',
            'table': 'עקוב אחר השלבים בפאנל למיפוי טבלה',
            'field': 'גרור מלבן סביב השדה שברצונך למפות'
        };

        const message = modeMessages[mode] || 'בחר כלי מהסרגל להתחלת המיפוי';
        this._showHelpTooltip(message);
    }

    /**
     * Show a help tooltip with fade animation
     * @param {string} message - Message to display
     */
    _showHelpTooltip(message) {
        // Remove existing tooltip
        let tooltip = document.getElementById('visual-guide-tooltip');
        if (tooltip) {
            tooltip.remove();
        }

        // Create new tooltip
        tooltip = document.createElement('div');
        tooltip.id = 'visual-guide-tooltip';
        tooltip.className = 'visual-guide-tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-icon">💡</div>
            <div class="tooltip-text">${message}</div>
        `;

        document.body.appendChild(tooltip);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (tooltip && tooltip.parentNode) {
                tooltip.classList.add('hiding');
                setTimeout(() => {
                    if (tooltip && tooltip.parentNode) {
                        tooltip.remove();
                    }
                }, 300);
            }
        }, 5000);
    }

    // ============ SVG EXAMPLE GENERATORS ============

    _getFieldDrawSVG() {
        return `<svg width="200" height="60" viewBox="0 0 200 60">
            <rect x="10" y="10" width="180" height="40" fill="none" stroke="#667eea" stroke-width="2" stroke-dasharray="5,5" rx="4"/>
            <text x="100" y="35" text-anchor="middle" fill="#666" font-size="12">שדה טקסט</text>
            <circle cx="10" cy="10" r="4" fill="#667eea"/>
            <path d="M10,10 L190,50" stroke="#667eea" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>
            <circle cx="190" cy="50" r="4" fill="#667eea"/>
        </svg>`;
    }

    _getTextSelectSVG() {
        return `<svg width="200" height="60" viewBox="0 0 200 60">
            <rect x="20" y="15" width="160" height="30" fill="rgba(102,126,234,0.2)" stroke="#667eea" stroke-width="1" rx="2"/>
            <text x="100" y="35" text-anchor="middle" fill="#333" font-size="14" font-weight="bold">שם השדה</text>
        </svg>`;
    }

    _getCheckboxSVG() {
        return `<svg width="120" height="60" viewBox="0 0 120 60">
            <rect x="40" y="15" width="24" height="24" fill="white" stroke="#4CAF50" stroke-width="2" rx="4"/>
            <path d="M46,27 L52,33 L66,19" stroke="#4CAF50" stroke-width="3" fill="none"/>
            <text x="60" y="55" text-anchor="middle" fill="#666" font-size="10">Checkbox</text>
        </svg>`;
    }

    _getRadioSVG() {
        return `<svg width="120" height="60" viewBox="0 0 120 60">
            <circle cx="60" cy="25" r="12" fill="white" stroke="#2196F3" stroke-width="2"/>
            <circle cx="60" cy="25" r="6" fill="#2196F3"/>
            <text x="60" y="55" text-anchor="middle" fill="#666" font-size="10">Radio Button</text>
        </svg>`;
    }

    _getTableHeaderSVG() {
        return `<svg width="240" height="80" viewBox="0 0 240 80">
            <rect x="10" y="10" width="220" height="25" fill="rgba(156,39,176,0.2)" stroke="#9C27B0" stroke-width="2" rx="2"/>
            <text x="40" y="27" fill="#333" font-size="11">עמודה 1</text>
            <text x="100" y="27" fill="#333" font-size="11">עמודה 2</text>
            <text x="170" y="27" fill="#333" font-size="11">עמודה 3</text>
            <rect x="10" y="40" width="220" height="20" fill="#f5f5f5" stroke="#ddd" stroke-width="1"/>
            <rect x="10" y="60" width="220" height="20" fill="#fff" stroke="#ddd" stroke-width="1"/>
            <text x="120" y="75" text-anchor="middle" fill="#9C27B0" font-size="9">כותרת</text>
        </svg>`;
    }

    _getTableRowSVG() {
        return `<svg width="240" height="80" viewBox="0 0 240 80">
            <rect x="10" y="10" width="220" height="20" fill="#f0f0f0" stroke="#ddd" stroke-width="1"/>
            <rect x="10" y="35" width="220" height="25" fill="rgba(33,150,243,0.2)" stroke="#2196F3" stroke-width="2" rx="2"/>
            <text x="40" y="52" fill="#333" font-size="11">נתון 1</text>
            <text x="100" y="52" fill="#333" font-size="11">נתון 2</text>
            <text x="170" y="52" fill="#333" font-size="11">נתון 3</text>
            <rect x="10" y="65" width="220" height="20" fill="#fff" stroke="#ddd" stroke-width="1"/>
            <text x="120" y="78" text-anchor="middle" fill="#2196F3" font-size="9">שורה לדוגמא</text>
        </svg>`;
    }

    _getTableColumnSVG() {
        return `<svg width="240" height="80" viewBox="0 0 240 80">
            <rect x="10" y="10" width="220" height="60" fill="#f5f5f5" stroke="#ddd" stroke-width="1"/>
            <rect x="15" y="15" width="65" height="50" fill="rgba(76,175,80,0.2)" stroke="#4CAF50" stroke-width="2" rx="2"/>
            <rect x="85" y="15" width="65" height="50" fill="rgba(76,175,80,0.1)" stroke="#4CAF50" stroke-width="1" stroke-dasharray="3,3" rx="2"/>
            <rect x="155" y="15" width="70" height="50" fill="rgba(76,175,80,0.1)" stroke="#4CAF50" stroke-width="1" stroke-dasharray="3,3" rx="2"/>
            <text x="47" y="45" text-anchor="middle" fill="#4CAF50" font-size="10">עמודה 1</text>
        </svg>`;
    }
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.VisualGuide = VisualGuide;
}
