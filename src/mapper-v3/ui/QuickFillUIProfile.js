/**
 * QuickFillUIProfile.js
 * V3.10: Public QuickFill Mode - UI Profile Only
 *
 * This module manages the UI visibility for Public QuickFill mode.
 * When ?mode=quickfill is present, it hides technical/advanced UI
 * and shows only: Upload PDF → Fill → Export
 *
 * IMPORTANT: This module ONLY controls UI visibility.
 * It does NOT touch any engines or logic.
 *
 * Features:
 * - Hides mapping tools, import/export JSON, AI, templates
 * - Hides sidebar, properties panel
 * - Adds "Advanced Mode" button to reveal full UI
 * - Fully reversible
 */

import { eventBus, Events } from '../core/EventBus.js';
import { state, FlowModes } from '../core/StateManager.js';

class QuickFillUIProfile {
    constructor() {
        this._isPublicMode = false;
        this._advancedModeBtn = null;

        // Elements to hide in public mode
        this._hiddenSelectors = [
            // Toolbar buttons - mapping related
            '#btn-import-json',
            '#btn-export-json',
            '#btn-load-template',
            '#btn-ai-analyze',

            // Tool groups with data-mapper-only
            '[data-mapper-only]',

            // Sidebar
            '#sidebar-container',

            // Properties panel
            '#properties-panel',

            // Welcome screens (we want direct to tool)
            '#welcome-screen-container',
            '#field-loader-screen-container',

            // Table flow panel
            '#table-flow-panel',

            // Separators after hidden groups
            '.toolbar-separator:nth-of-type(2)',
            '.toolbar-separator:nth-of-type(3)',
        ];
    }

    /**
     * Check if public mode should be active (URL param)
     * @returns {boolean}
     */
    isPublicModeRequested() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('mode') === 'quickfill';
    }

    /**
     * Initialize the UI profile
     * Call this after DOM is ready
     */
    init() {
        if (this.isPublicModeRequested()) {
            this.enterPublicMode();
        }

        console.log('[QuickFillUIProfile] Initialized, public mode:', this._isPublicMode);
    }

    /**
     * Enter public QuickFill mode
     * Hides advanced UI, shows simplified interface
     */
    enterPublicMode() {
        if (this._isPublicMode) return;

        this._isPublicMode = true;

        // Add body class for CSS-based hiding
        document.body.classList.add('quickfill-public-mode');

        // Hide elements
        this._hideElements();

        // CRITICAL: Show mapper-container (welcome screens hide it by default)
        const mapperContainer = document.getElementById('mapper-container');
        if (mapperContainer) {
            mapperContainer.style.display = 'flex';
        }

        // Also hide the welcome screen containers directly
        const welcomeContainer = document.getElementById('welcome-screen-container');
        const fieldLoaderContainer = document.getElementById('field-loader-screen-container');
        if (welcomeContainer) {
            welcomeContainer.style.display = 'none';
        }
        if (fieldLoaderContainer) {
            fieldLoaderContainer.style.display = 'none';
        }

        // Expand PDF viewer to full width (no sidebar)
        this._expandPdfViewer();

        // Add "Advanced Mode" button
        this._addAdvancedModeButton();

        // Update page title
        document.title = 'Tofesly - מילוי טפסים';

        console.log('[QuickFillUIProfile] Entered public mode');

        // Emit event for other modules
        eventBus.emit('UI_PROFILE_CHANGED', { mode: 'public' });
    }

    /**
     * Exit public mode, restore full UI
     */
    exitPublicMode() {
        if (!this._isPublicMode) return;

        this._isPublicMode = false;

        // Remove body class
        document.body.classList.remove('quickfill-public-mode');

        // Show hidden elements
        this._showElements();

        // Restore PDF viewer width
        this._restorePdfViewer();

        // Remove "Advanced Mode" button
        this._removeAdvancedModeButton();

        // V3.10: Exit QuickFill mode to return to Mapping mode
        // This hides the QuickFill toolbar buttons (load, export, clear)
        if (state.getFlowMode() === FlowModes.QUICK_FILL) {
            state.setFlowMode(FlowModes.MAPPING);
            console.log('[QuickFillUIProfile] Exited QuickFill flow mode');
        }

        // Restore page title
        document.title = 'Mapper V3 - Field Mapping Tool';

        console.log('[QuickFillUIProfile] Exited public mode');

        // Emit event
        eventBus.emit('UI_PROFILE_CHANGED', { mode: 'full' });
    }

    /**
     * Hide elements for public mode
     */
    _hideElements() {
        this._hiddenSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.dataset.hiddenByProfile = 'true';
                el.style.display = 'none';
            });
        });
    }

    /**
     * Show elements hidden by profile
     */
    _showElements() {
        const elements = document.querySelectorAll('[data-hidden-by-profile="true"]');
        elements.forEach(el => {
            delete el.dataset.hiddenByProfile;
            el.style.display = '';
        });
    }

    /**
     * Expand PDF viewer to full width
     */
    _expandPdfViewer() {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.add('no-sidebar');
        }
    }

    /**
     * Restore PDF viewer width
     */
    _restorePdfViewer() {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.remove('no-sidebar');
        }
    }

    /**
     * Add "Advanced Mode" button to toolbar
     */
    _addAdvancedModeButton() {
        if (this._advancedModeBtn) return;

        const toolbar = document.getElementById('toolbar');
        if (!toolbar) return;

        // Create button
        this._advancedModeBtn = document.createElement('button');
        this._advancedModeBtn.id = 'btn-advanced-mode';
        this._advancedModeBtn.className = 'toolbar-btn advanced-mode-btn';
        this._advancedModeBtn.title = 'מצב מתקדם';
        this._advancedModeBtn.innerHTML = `
            <span class="icon">⚙️</span>
            <span class="label">מצב מתקדם</span>
        `;

        // Insert before status indicator
        const statusIndicator = document.getElementById('status-indicator');
        if (statusIndicator && statusIndicator.parentElement) {
            statusIndicator.parentElement.insertBefore(this._advancedModeBtn, statusIndicator);
        } else {
            toolbar.appendChild(this._advancedModeBtn);
        }

        // Click handler
        this._advancedModeBtn.addEventListener('click', () => {
            this.exitPublicMode();
        });
    }

    /**
     * Remove "Advanced Mode" button
     */
    _removeAdvancedModeButton() {
        if (this._advancedModeBtn) {
            this._advancedModeBtn.remove();
            this._advancedModeBtn = null;
        }
    }

    /**
     * Check if currently in public mode
     * @returns {boolean}
     */
    isPublicMode() {
        return this._isPublicMode;
    }
}

// Singleton export
export const quickFillUIProfile = new QuickFillUIProfile();

// Expose to window for debugging
if (typeof window !== 'undefined') {
    window.quickFillUIProfile = quickFillUIProfile;
}
