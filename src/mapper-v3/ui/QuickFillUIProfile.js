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
            '#btn-open-pdf',        // V3.12: Hide Open PDF button (use center upload instead)
            '#btn-import-json',
            '#btn-export-json',
            '#btn-load-template',
            '#btn-ai-analyze',
            '#btn-continue-to-livefill',  // V3.12: Hide continue to livefill

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
     * V3.13: Default to quickfill mode when no mode specified (for clean URLs)
     * @returns {boolean}
     */
    isPublicModeRequested() {
        const urlParams = new URLSearchParams(window.location.search);
        const mode = (urlParams.get('mode') || 'quickfill').toLowerCase();
        // Only return false if explicitly requesting advanced mode
        return mode !== 'advanced';
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
     * V3.12: Embeds landing content inside the PDF drop zone
     */
    enterPublicMode() {
        if (this._isPublicMode) return;

        this._isPublicMode = true;

        // Add body class for CSS-based hiding
        document.body.classList.add('quickfill-public-mode');

        // Hide elements (sidebar, properties, etc.)
        this._hideElements();

        // Hide welcome screen containers
        const welcomeContainer = document.getElementById('welcome-screen-container');
        const fieldLoaderContainer = document.getElementById('field-loader-screen-container');
        if (welcomeContainer) {
            welcomeContainer.style.display = 'none';
        }
        if (fieldLoaderContainer) {
            fieldLoaderContainer.style.display = 'none';
        }

        // Show mapper container (we need the toolbar visible)
        const mapperContainer = document.getElementById('mapper-container');
        if (mapperContainer) {
            mapperContainer.style.display = 'flex';
        }

        // V3.12: Replace drop zone content with landing content
        this._embedLandingInDropZone();

        // Update page title
        document.title = 'tofesPDF - מילוי טפסים';

        console.log('[QuickFillUIProfile] Entered public mode with embedded landing');

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

        // Show hidden elements (sidebar, properties panel, etc.)
        this._showElements();

        // Restore PDF viewer width
        this._restorePdfViewer();

        // Remove "Advanced Mode" button
        this._removeAdvancedModeButton();

        // V3.12: Restore drop zone if it was modified
        const dropZone = document.getElementById('pdf-drop-zone');
        if (dropZone && this._originalDropZoneContent) {
            dropZone.innerHTML = this._originalDropZoneContent;
            dropZone.classList.remove('qf-landing-embedded-zone');

            // V3.13: Only show drop zone if NO PDF is loaded
            // If PDF is already loaded, keep it hidden so it doesn't block the PDF
            const pdfLoaded = window.pdfEngine && window.pdfEngine.isLoaded();
            if (pdfLoaded) {
                dropZone.style.display = 'none';
                dropZone.classList.add('hidden');
            } else {
                dropZone.style.display = '';
                dropZone.classList.remove('hidden');
            }
        }

        // V3.12: Show mapper container
        const mapperContainer = document.getElementById('mapper-container');
        if (mapperContainer) {
            mapperContainer.style.display = 'flex';
        }

        // V3.10: Exit QuickFill mode to return to Mapping mode
        // This hides the QuickFill toolbar buttons (load, export, clear)
        if (state.getFlowMode() === FlowModes.QUICK_FILL) {
            state.setFlowMode(FlowModes.MAPPING);
            console.log('[QuickFillUIProfile] Exited QuickFill flow mode');
        }

        // V3.13: Hide NagishLi accessibility plugin in advanced mode
        const nagishli = document.querySelector('nagishli#NagishLiTag');
        if (nagishli) {
            nagishli.style.display = 'none';
            console.log('[QuickFillUIProfile] NagishLi hidden for advanced mode');
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
            // V3.13: Just save reference - the mapper-v3.html handler will call exitPublicMode()
            this._advancedModeBtn = existingBtn;
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
                // V3.13: Use AuthManager for authorization
                if (typeof AuthManager !== 'undefined' && !AuthManager.isAuthorized()) {
                    // Show auth dialog, then exit public mode if successful
                    const onAuthSuccess = () => {
                        document.removeEventListener(AuthManager.EVENTS.LOGIN_SUCCESS, onAuthSuccess);
                        this.exitPublicMode();
                    };
                    document.addEventListener(AuthManager.EVENTS.LOGIN_SUCCESS, onAuthSuccess);
                    AuthManager.showLoginDialog();
                    return;
                }
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
     * V3.12: Embed landing content inside the PDF drop zone
     */
    _embedLandingInDropZone() {
        console.log('[QuickFillUIProfile] _embedLandingInDropZone called');

        const dropZone = document.getElementById('pdf-drop-zone');
        if (!dropZone) {
            console.error('[QuickFillUIProfile] Drop zone not found');
            return;
        }

        // Store original content
        this._originalDropZoneContent = dropZone.innerHTML;

        // Clear and replace with landing content container
        dropZone.innerHTML = '';
        dropZone.classList.add('qf-landing-embedded-zone');

        // Create embedded container
        this._landingContainer = document.createElement('div');
        this._landingContainer.className = 'qf-landing-embedded';
        dropZone.appendChild(this._landingContainer);

        // Prevent drop zone click from triggering file picker
        dropZone.onclick = null;
        dropZone.removeAttribute('onclick');

        // Stop propagation on the landing container
        this._landingContainer.addEventListener('click', (e) => {
            // Don't stop propagation for the upload dropzone inside
            if (!e.target.closest('#qfDropzone')) {
                e.stopPropagation();
            }
        });

        this._landingVisible = true;

        // Initialize landing page if QuickFillLanding is available
        if (typeof QuickFillLanding !== 'undefined') {
            console.log('[QuickFillUIProfile] Initializing QuickFillLanding in drop zone...');
            QuickFillLanding.init(this._landingContainer, {
                onFormSelected: (data) => this._handleFormSelected(data),
                onFileUploaded: (file) => this._handleFileUploaded(file)
            });
            console.log('[QuickFillUIProfile] QuickFillLanding initialized');
        } else {
            console.warn('[QuickFillUIProfile] QuickFillLanding not loaded');
        }
    }

    /**
     * V3.12: Show the QuickFill landing page (legacy - now uses _embedLandingInDropZone)
     */
    _showLanding() {
        this._embedLandingInDropZone();
    }

    /**
     * V3.12: Hide landing and show mapper with PDF
     */
    _transitionToMapper() {
        this._landingVisible = false;

        // V3.12: Hide the drop zone entirely (PDF will be shown instead)
        const dropZone = document.getElementById('pdf-drop-zone');
        if (dropZone) {
            dropZone.style.display = 'none';
            dropZone.classList.add('hidden');
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
                // V3.13: If form has mapping data, tell QuickFillOverlay to skip auto-save check
                // This prevents old auto-save from overwriting the pre-made form's fields
                if (data.mapping && window.quickFillOverlay) {
                    window.quickFillOverlay._skipAutoSaveCheck = true;
                    console.log('[QuickFillUIProfile] Pre-made form with mapping - skipping auto-save check');
                }

                await window.pdfEngine.load(data.file);
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
                // Reset the flag on error
                if (window.quickFillOverlay) {
                    window.quickFillOverlay._skipAutoSaveCheck = false;
                }
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
                await window.pdfEngine.load(file);
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
