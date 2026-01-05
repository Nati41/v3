/**
 * Tofesly Shell - Application Controller
 * Version: 4.0
 *
 * Handles:
 * - Mode switching (Mapping ↔ Filling)
 * - iframe visibility management
 * - No direct manipulation of iframe internals
 *
 * IMPORTANT RULES:
 * - NO access to iframe internal logic
 * - NO communication between iframes
 * - NO modification of mapper.js or livefill logic
 * - ONLY show/hide iframes via CSS classes
 */

(function() {
    'use strict';

    // ===== Shell Controller =====
    const Shell = {
        // Current active mode
        currentMode: 'mapping',

        // DOM references
        elements: {
            mapperFrame: null,
            livefillFrame: null,
            modeButtons: null
        },

        /**
         * Initialize the shell
         */
        init() {
            this.cacheElements();
            this.bindEvents();
            this.setMode('mapping');

            console.log('[Shell] Tofesly Shell v4.0 initialized');
        },

        /**
         * Cache DOM elements
         */
        cacheElements() {
            this.elements.mapperFrame = document.getElementById('mapper-frame');
            this.elements.livefillFrame = document.getElementById('livefill-frame');
            this.elements.modeButtons = document.querySelectorAll('.mode-btn');
        },

        /**
         * Bind event listeners
         */
        bindEvents() {
            // Mode switcher buttons
            this.elements.modeButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const mode = e.currentTarget.dataset.mode;
                    if (mode) {
                        this.setMode(mode);
                    }
                });
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                // Alt+1 = Mapping mode
                if (e.altKey && e.key === '1') {
                    e.preventDefault();
                    this.setMode('mapping');
                }
                // Alt+2 = Filling mode
                if (e.altKey && e.key === '2') {
                    e.preventDefault();
                    this.setMode('filling');
                }
            });
        },

        /**
         * Set the active mode
         * @param {string} mode - 'mapping' or 'filling'
         */
        setMode(mode) {
            if (mode !== 'mapping' && mode !== 'filling') {
                console.warn(`[Shell] Invalid mode: ${mode}`);
                return;
            }

            this.currentMode = mode;

            // Update button states
            this.elements.modeButtons.forEach(btn => {
                const isActive = btn.dataset.mode === mode;
                btn.classList.toggle('active', isActive);
            });

            // Update iframe visibility
            if (this.elements.mapperFrame) {
                this.elements.mapperFrame.classList.toggle('active', mode === 'mapping');
            }
            if (this.elements.livefillFrame) {
                this.elements.livefillFrame.classList.toggle('active', mode === 'filling');
            }

            console.log(`[Shell] Mode changed to: ${mode}`);
        },

        /**
         * Get current mode
         * @returns {string} Current mode
         */
        getMode() {
            return this.currentMode;
        },

        /**
         * Toggle between modes
         */
        toggleMode() {
            const newMode = this.currentMode === 'mapping' ? 'filling' : 'mapping';
            this.setMode(newMode);
        }
    };

    // ===== Initialize on DOM Ready =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Shell.init());
    } else {
        Shell.init();
    }

    // ===== Expose to global scope (read-only API) =====
    window.TofeslyShell = {
        getMode: () => Shell.getMode(),
        setMode: (mode) => Shell.setMode(mode),
        toggleMode: () => Shell.toggleMode()
        // NOTE: No methods to access iframe internals
    };

})();
