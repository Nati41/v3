/**
 * MappingLoader.js
 * V3.10: Load mapping JSON and create QuickFill boxes
 *
 * This module provides a way to load pre-existing field mappings
 * from a JSON file (fill-engine-v2.0 format) and display them
 * as QuickFill boxes for filling and export.
 *
 * IMPORTANT: This module ONLY ADDS functionality.
 * It does NOT modify any existing logic:
 * - QuickFillOverlay rendering remains unchanged
 * - ExportEngine remains unchanged
 * - PDFEngine remains unchanged
 * - OverlayRenderer remains unchanged (only reads bboxToScreen)
 *
 * Usage flow:
 * 1. User loads PDF
 * 2. User clicks "טען מיפוי (JSON)" button
 * 3. User selects mapping.json file
 * 4. This module reads the JSON and creates QuickFill boxes
 * 5. User fills the boxes
 * 6. Export works through existing QuickFillOverlay.exportPDF()
 */

import { quickFillOverlay } from './QuickFillOverlay.js';
import { overlayRenderer } from '../engines/OverlayRenderer.js';
import { pdfEngine, CHECKBOX_SIZE, RADIO_SIZE } from '../engines/PDFEngine.js';
import { state } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';

// Expected JSON schema version
const EXPECTED_SCHEMA = 'fill-engine-v2.0';

class MappingLoader {
    constructor() {
        this._initialized = false;
        this._fileInput = null;
        this._loadButton = null;
    }

    /**
     * Initialize the MappingLoader
     * Injects the load button into QuickFill status bar
     */
    init() {
        if (this._initialized) return;

        // Wait for QuickFillOverlay status bar to exist
        this._waitForStatusBar();

        this._initialized = true;
        console.log('[MappingLoader] Initialized');
    }

    /**
     * Wait for QuickFill toolbar group to be created, then inject button handler
     */
    _waitForStatusBar() {
        const checkToolbar = () => {
            // Look for load button in toolbar (new location) or legacy status bar
            const loadBtn = document.querySelector('#quick-fill-toolbar')?.closest('.toolbar')?.querySelector('.load-mapping-btn') ||
                           document.querySelector('.quick-fill-tools .load-mapping-btn') ||
                           document.getElementById('quick-fill-status')?.querySelector('.load-mapping-btn');

            if (loadBtn) {
                this._injectLoadButton(loadBtn);
            } else {
                // Retry after a short delay
                setTimeout(checkToolbar, 100);
            }
        };
        checkToolbar();
    }

    /**
     * Attach to existing load mapping button in QuickFill toolbar
     * @param {HTMLElement} button - The load mapping button element
     */
    _injectLoadButton(button) {
        // Store button reference
        this._loadButton = button;
        if (!this._loadButton) {
            console.warn('[MappingLoader] Load button not found');
            return;
        }

        // Create hidden file input
        this._fileInput = document.createElement('input');
        this._fileInput.type = 'file';
        this._fileInput.accept = '.json';
        this._fileInput.style.display = 'none';
        this._fileInput.addEventListener('change', (e) => this._onFileSelected(e));
        document.body.appendChild(this._fileInput);

        // Attach click handler to existing button
        this._loadButton.addEventListener('click', () => {
            this._fileInput.click();
        });

        console.log('[MappingLoader] Load button handler attached');
    }

    /**
     * Handle file selection
     * @param {Event} e - File input change event
     */
    async _onFileSelected(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Reset input for re-selection of same file
        this._fileInput.value = '';

        try {
            // Show loading state
            const originalText = this._loadButton.innerHTML;
            this._loadButton.innerHTML = '⏳ טוען...';
            this._loadButton.disabled = true;

            // Read file
            const text = await file.text();
            const json = JSON.parse(text);

            // Load mapping
            const result = await this.loadMappingFromJson(json);

            // Show result
            if (result.success) {
                console.log(`[MappingLoader] Loaded ${result.loaded} fields (${result.skipped} skipped)`);
                if (result.skipped > 0) {
                    console.warn('[MappingLoader] Skipped fields:', result.warnings);
                }

                // V3.10: Show toast with load result
                const currentPage = state.get('document.currentPage') || 1;
                const pagesWithFields = [...new Set(json.fields.filter(f => f.isMapped !== false).map(f => f.page))];
                const fieldsOnCurrentPage = json.fields.filter(f => f.isMapped !== false && f.page === currentPage).length;

                let message = `נטענו ${result.loaded} שדות`;
                if (fieldsOnCurrentPage < result.loaded) {
                    message += ` (${fieldsOnCurrentPage} בעמוד הנוכחי)`;
                }

                eventBus.emit('toast:show', {
                    message: message,
                    type: 'success',
                    duration: 4000
                });

                console.log(`[MappingLoader] Pages with fields: ${pagesWithFields.join(', ')}. Current page: ${currentPage}. Fields on current page: ${fieldsOnCurrentPage}`);
            }

            // Restore button
            this._loadButton.innerHTML = originalText;
            this._loadButton.disabled = false;

        } catch (error) {
            console.error('[MappingLoader] Failed to load mapping:', error);
            alert('שגיאה בטעינת הקובץ: ' + error.message);

            // Restore button
            this._loadButton.innerHTML = '📂 טען מיפוי (JSON)';
            this._loadButton.disabled = false;
        }
    }

    /**
     * Load mapping from JSON and create QuickFill boxes
     * This is the main public API
     *
     * @param {Object} json - Parsed JSON object in fill-engine-v2.0 format
     * @returns {Object} { success: boolean, loaded: number, skipped: number, warnings: string[] }
     */
    async loadMappingFromJson(json) {
        const result = {
            success: false,
            loaded: 0,
            skipped: 0,
            warnings: []
        };

        // Validate schema
        if (!json.$schema) {
            result.warnings.push('Missing $schema in JSON');
            console.warn('[MappingLoader] Missing $schema, attempting to load anyway');
        } else if (json.$schema !== EXPECTED_SCHEMA) {
            result.warnings.push(`Unexpected schema: ${json.$schema} (expected ${EXPECTED_SCHEMA})`);
            console.warn('[MappingLoader] Unexpected schema, attempting to load anyway');
        }

        // Validate fields array
        if (!json.fields || !Array.isArray(json.fields)) {
            result.warnings.push('Missing or invalid fields array');
            console.error('[MappingLoader] No fields array in JSON');
            return result;
        }

        // Check if PDF is loaded
        const pdfDims = pdfEngine.getPdfPageDimensions();
        if (!pdfDims) {
            result.warnings.push('No PDF loaded - please load a PDF first');
            console.error('[MappingLoader] No PDF loaded');
            alert('יש לטעון קובץ PDF לפני טעינת מיפוי');
            return result;
        }

        // Check if QuickFill is initialized
        if (!quickFillOverlay) {
            result.warnings.push('QuickFillOverlay not initialized');
            console.error('[MappingLoader] QuickFillOverlay not available');
            return result;
        }

        console.log(`[MappingLoader] Loading ${json.fields.length} fields from JSON`);

        // Process each field
        for (const field of json.fields) {
            try {
                const loadResult = this._loadField(field);
                if (loadResult.success) {
                    result.loaded++;
                } else {
                    result.skipped++;
                    result.warnings.push(`Field ${field.id}: ${loadResult.reason}`);
                }
            } catch (error) {
                result.skipped++;
                result.warnings.push(`Field ${field.id}: ${error.message}`);
                console.error(`[MappingLoader] Error loading field ${field.id}:`, error);
            }
        }

        result.success = result.loaded > 0;
        console.log(`[MappingLoader] Load complete: ${result.loaded} loaded, ${result.skipped} skipped`);

        // V3.10: Log warnings if any fields were skipped
        if (result.warnings.length > 0) {
            console.warn('[MappingLoader] Skipped field reasons:', result.warnings);
        }

        // V3.10: Trigger position update after all fields are loaded
        // The screenRect values might have been calculated with incorrect layer dimensions
        if (result.loaded > 0) {
            // Give the DOM time to settle, then update positions
            setTimeout(() => {
                eventBus.emit('MAPPING_LOADED', { count: result.loaded });
            }, 100);
        }

        return result;
    }

    /**
     * Load a single field and create QuickFill box
     * @param {Object} field - Field object from JSON
     * @returns {Object} { success: boolean, reason?: string }
     */
    _loadField(field) {
        // Validate field has required properties
        if (!field.id) {
            return { success: false, reason: 'Missing id' };
        }

        if (!field.page || typeof field.page !== 'number') {
            return { success: false, reason: 'Missing or invalid page' };
        }

        // Only support mapped fields
        if (field.isMapped === false) {
            return { success: false, reason: 'Field is not mapped' };
        }

        const fieldType = field.type || 'text';

        // Route to appropriate handler based on type
        if (fieldType === 'checkbox' || fieldType === 'radio') {
            return this._loadCheckboxRadio(field);
        } else {
            return this._loadTextField(field);
        }
    }

    /**
     * Load a text field
     * @param {Object} field - Field object with bbox
     * @returns {Object} { success: boolean, reason?: string }
     */
    _loadTextField(field) {
        // Text fields require bbox
        if (!field.bbox || !Array.isArray(field.bbox) || field.bbox.length !== 4) {
            return { success: false, reason: 'Missing or invalid bbox for text field' };
        }

        const [x, y, w, h] = field.bbox;

        // Validate bbox values
        if (!this._isValidNumber(x) || !this._isValidNumber(y) ||
            !this._isValidNumber(w) || !this._isValidNumber(h)) {
            return { success: false, reason: 'Invalid bbox values' };
        }

        // Convert bbox to screen coordinates
        const screenRect = overlayRenderer.bboxToScreen(field.bbox);

        if (!screenRect || screenRect.width <= 0 || screenRect.height <= 0) {
            return { success: false, reason: 'Could not convert bbox to screen coordinates' };
        }

        // Create box data for QuickFillOverlay
        const boxData = {
            bbox: field.bbox,
            screenRect: screenRect,
            page: field.page,
            tool: 'draw_text'
        };

        // Emit event to create box (same as DrawController does)
        eventBus.emit(Events.QUICK_FILL_BOX_CREATED, boxData);

        console.log(`[MappingLoader] Loaded text field: ${field.id} on page ${field.page}`);
        return { success: true };
    }

    /**
     * Load a checkbox or radio field
     * @param {Object} field - Field object with anchor
     * @returns {Object} { success: boolean, reason?: string }
     */
    _loadCheckboxRadio(field) {
        // Checkbox/radio can have anchor OR bbox
        let centerX, centerY, size;

        if (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
            // Use anchor (center point)
            const [anchorX, anchorY] = field.anchor;

            if (!this._isValidNumber(anchorX) || !this._isValidNumber(anchorY)) {
                return { success: false, reason: 'Invalid anchor values' };
            }

            // Convert anchor to screen coordinates
            const screenCenter = overlayRenderer.anchorToScreen(field.anchor);
            centerX = screenCenter.x;
            centerY = screenCenter.y;

            // Use default size from PDFEngine
            size = field.type === 'radio' ? RADIO_SIZE : CHECKBOX_SIZE;

        } else if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            // Use bbox instead
            const screenRect = overlayRenderer.bboxToScreen(field.bbox);
            centerX = screenRect.x + screenRect.width / 2;
            centerY = screenRect.y + screenRect.height / 2;
            size = Math.min(screenRect.width, screenRect.height);

        } else {
            return { success: false, reason: 'Missing anchor or bbox for checkbox/radio' };
        }

        // Calculate bbox from center and size for QuickFill
        const halfSize = size / 2;
        const screenRect = {
            x: centerX - halfSize,
            y: centerY - halfSize,
            width: size,
            height: size
        };

        // Convert screen rect back to normalized bbox
        const bbox = overlayRenderer.screenToBbox(screenRect);

        // Create box data for QuickFillOverlay
        const boxData = {
            bbox: bbox,
            screenRect: screenRect,
            page: field.page,
            tool: field.type === 'radio' ? 'draw_radio' : 'draw_checkbox'
        };

        // Emit event to create box
        eventBus.emit(Events.QUICK_FILL_BOX_CREATED, boxData);

        console.log(`[MappingLoader] Loaded ${field.type} field: ${field.id} on page ${field.page}`);
        return { success: true };
    }

    /**
     * Check if value is a valid number
     * @param {*} value - Value to check
     * @returns {boolean}
     */
    _isValidNumber(value) {
        return typeof value === 'number' && !isNaN(value) && isFinite(value);
    }

    /**
     * Clear all loaded fields
     * Delegates to QuickFillOverlay.clearAll()
     */
    clearAll() {
        if (quickFillOverlay) {
            quickFillOverlay.clearAll();
        }
    }
}

// Singleton export
export const mappingLoader = new MappingLoader();

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => mappingLoader.init());
    } else {
        // DOM already ready
        setTimeout(() => mappingLoader.init(), 0);
    }
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
    window.mappingLoader = mappingLoader;
}
