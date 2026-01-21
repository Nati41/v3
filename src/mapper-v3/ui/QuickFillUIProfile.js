/**
 * QuickFillUIProfile.js
 * V3.10: Public QuickFill Mode - UI Profile Only
 * V3.12: Integrated QuickFillLanding page for minimal first experience
 *
 * This module manages the UI visibility for Public QuickFill mode.
 * When ?mode=quickfill is present:
 * 1. Shows QuickFillLanding page (forms + upload)
 * 2. When user selects form/uploads PDF, transitions to mapper
 *
 * IMPORTANT: This module ONLY controls UI visibility.
 * It does NOT touch any engines or logic.
 *
 * Features:
 * - Minimal landing page with pre-made forms
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
        this._landingContainer = null;
        this._landingVisible = false;

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
     * V3.12: Now shows landing page first, then transitions to mapper
     */
    enterPublicMode() {
        if (this._isPublicMode) return;

        this._isPublicMode = true;

        // Add body class for CSS-based hiding
        document.body.classList.add('quickfill-public-mode');

        // Hide elements
        this._hideElements();

        // Hide mapper container - will show it when PDF is loaded
        const mapperContainer = document.getElementById('mapper-container');
        if (mapperContainer) {
            mapperContainer.style.display = 'none';
        }

        // Also hide the welcome screen containers
        const welcomeContainer = document.getElementById('welcome-screen-container');
        const fieldLoaderContainer = document.getElementById('field-loader-screen-container');
        if (welcomeContainer) {
            welcomeContainer.style.display = 'none';
        }
        if (fieldLoaderContainer) {
            fieldLoaderContainer.style.display = 'none';
        }

        // V3.12: Show landing page
        this._showLanding();

        // Update page title
        document.title = 'טופסלי - מילוי טפסים';

        console.log('[QuickFillUIProfile] Entered public mode with landing page');

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
     * V3.11: Skip if static toolbar already has an advanced mode button
     */
    _addAdvancedModeButton() {
        if (this._advancedModeBtn) return;

        // V3.11: Check if static toolbar already has advanced mode button
        const staticActions = document.getElementById('qf-static-actions');
        const existingBtn = staticActions?.querySelector('.advanced-mode-btn');
        if (existingBtn) {
            console.log('[QuickFillUIProfile] Using existing advanced mode button from static toolbar');
            // The static toolbar handler already calls setFlowMode(MAPPING)
            // We need to make it also call our exitPublicMode for proper cleanup
            this._advancedModeBtn = existingBtn;

            existingBtn.addEventListener('click', (e) => {
                // V3.11: Only run if this is a real user click and button is not disabled
                if (!e.isTrusted || existingBtn.disabled) return;

                // Exit public mode (hides UI elements, restores sidebar, etc.)
                this._isPublicMode = false;
                document.body.classList.remove('quickfill-public-mode');
                this._showElements();
                this._restorePdfViewer();
                document.title = 'Mapper V3 - Field Mapping Tool';
                eventBus.emit('UI_PROFILE_CHANGED', { mode: 'full' });
                console.log('[QuickFillUIProfile] Exited public mode via static button');
            });
            return;
        }

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
        this._advancedModeBtn.addEventListener('click', (e) => {
            // V3.11: Only run if this is a real user click
            if (e.isTrusted) {
                this.exitPublicMode();
            }
        });
    }

    /**
     * Remove "Advanced Mode" button
     * V3.11: Don't remove if using static toolbar button
     */
    _removeAdvancedModeButton() {
        if (this._advancedModeBtn) {
            // V3.11: Don't remove static toolbar button, just clear reference
            const staticActions = document.getElementById('qf-static-actions');
            if (staticActions?.contains(this._advancedModeBtn)) {
                // Static button - just clear reference, don't remove from DOM
                this._advancedModeBtn = null;
                return;
            }
            // Dynamic button - remove from DOM
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

    /**
     * V3.12: Show the QuickFill landing page
     */
    _showLanding() {
        console.log('[QuickFillUIProfile] _showLanding called');
        console.log('[QuickFillUIProfile] QuickFillLanding available:', typeof QuickFillLanding !== 'undefined');

        // Create container if needed
        if (!this._landingContainer) {
            this._landingContainer = document.createElement('div');
            this._landingContainer.id = 'qf-landing-container';
            document.body.appendChild(this._landingContainer);
            console.log('[QuickFillUIProfile] Created landing container');
        }

        this._landingContainer.style.display = 'block';
        this._landingVisible = true;

        // Initialize landing page if QuickFillLanding is available
        if (typeof QuickFillLanding !== 'undefined') {
            console.log('[QuickFillUIProfile] Initializing QuickFillLanding...');
            QuickFillLanding.init(this._landingContainer, {
                onFormSelected: (data) => this._handleFormSelected(data),
                onFileUploaded: (file) => this._handleFileUploaded(file)
            });
            console.log('[QuickFillUIProfile] QuickFillLanding initialized');
        } else {
            console.warn('[QuickFillUIProfile] QuickFillLanding not loaded, showing direct upload');
            // Fallback: just show the mapper
            this._transitionToMapper();
        }
    }

    /**
     * V3.12: Hide landing and show mapper
     */
    _transitionToMapper() {
        // Hide landing
        if (this._landingContainer) {
            this._landingContainer.style.display = 'none';
        }
        this._landingVisible = false;

        // Show mapper
        const mapperContainer = document.getElementById('mapper-container');
        if (mapperContainer) {
            mapperContainer.style.display = 'flex';
        }

        // Expand PDF viewer to full width
        this._expandPdfViewer();

        // Add "Advanced Mode" button
        this._addAdvancedModeButton();

        console.log('[QuickFillUIProfile] Transitioned to mapper');
    }

    /**
     * V3.12: Handle pre-made form selection from landing
     */
    async _handleFormSelected(data) {
        console.log('[QuickFillUIProfile] Form selected:', data.formName);

        // Transition to mapper first
        this._transitionToMapper();

        // Wait for mapper to be ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Load the PDF
        if (data.file && window.pdfEngine) {
            try {
                await window.pdfEngine.loadPDF(data.file);
                console.log('[QuickFillUIProfile] PDF loaded:', data.file.name);

                // If form has mapping data, load it
                if (data.mapping && window.quickFillOverlay) {
                    // Wait for PDF to render
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // Import mapping to QuickFill
                    const imported = window.quickFillOverlay.importFromMappingData(data.mapping);
                    console.log('[QuickFillUIProfile] Mapping imported, fields:', imported);
                }
            } catch (e) {
                console.error('[QuickFillUIProfile] Failed to load form:', e);
                alert('שגיאה בטעינת הטופס');
            }
        }

        // Hide landing loading
        if (typeof QuickFillLanding !== 'undefined') {
            QuickFillLanding.showLoading(false);
        }
    }

    /**
     * V3.12: Handle user file upload from landing
     */
    async _handleFileUploaded(file) {
        console.log('[QuickFillUIProfile] File uploaded:', file.name);

        // Transition to mapper
        this._transitionToMapper();

        // Wait for mapper to be ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Load the PDF
        if (file && window.pdfEngine) {
            try {
                await window.pdfEngine.loadPDF(file);
                console.log('[QuickFillUIProfile] PDF loaded:', file.name);
            } catch (e) {
                console.error('[QuickFillUIProfile] Failed to load PDF:', e);
                alert('שגיאה בטעינת הקובץ');
            }
        }
    }

    /**
     * V3.12: Check if landing is currently visible
     */
    isLandingVisible() {
        return this._landingVisible;
    }
}

// Singleton export
export const quickFillUIProfile = new QuickFillUIProfile();

// Expose to window for debugging
if (typeof window !== 'undefined') {
    window.quickFillUIProfile = quickFillUIProfile;
}
