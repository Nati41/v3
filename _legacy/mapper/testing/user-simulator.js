/**
 * User Simulator
 * Simulates real user interactions with the Tofesly Mapper
 *
 * This module imitates how a real human interacts with the tool:
 * - Clicking
 * - Drawing rectangles
 * - Selecting text
 * - Toggling modes
 * - Zooming
 * - Resizing
 * - Switching pages
 *
 * NOTE: This is an ADDITIVE module - uses ONLY public interfaces
 * Does not access private internals or modify existing logic
 */

class UserSimulator {
    /**
     * @param {Object} mapper - Reference to the FieldMapper instance
     */
    constructor(mapper) {
        this.mapper = mapper;
        this.mappingLayer = null;
        this.viewport = null;
        this._initElements();
    }

    /**
     * Initialize DOM element references
     */
    _initElements() {
        this.mappingLayer = document.getElementById('mapping-layer');
        this.viewport = document.getElementById('canvas-viewport');
    }

    /**
     * Ensure elements are available (lazy init)
     */
    _ensureElements() {
        if (!this.mappingLayer) {
            this.mappingLayer = document.getElementById('mapping-layer');
        }
        if (!this.viewport) {
            this.viewport = document.getElementById('canvas-viewport');
        }
    }

    /**
     * Simulate a mouse click at specific coordinates
     * @param {number} x - X coordinate (relative to mapping layer)
     * @param {number} y - Y coordinate (relative to mapping layer)
     */
    click(x, y) {
        this._ensureElements();
        if (!this.mappingLayer) {
            console.error('[UserSimulator] Mapping layer not found');
            return;
        }

        const rect = this.mappingLayer.getBoundingClientRect();
        const clientX = rect.left + x;
        const clientY = rect.top + y;

        // Simulate mousedown
        const downEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: clientX,
            clientY: clientY,
            button: 0
        });
        this.mappingLayer.dispatchEvent(downEvent);

        // Simulate mouseup
        const upEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            clientX: clientX,
            clientY: clientY,
            button: 0
        });
        document.dispatchEvent(upEvent);

        console.log(`[UserSimulator] Clicked at (${x}, ${y})`);
    }

    /**
     * Simulate drawing a rectangle (drag from point 1 to point 2)
     * @param {number} x1 - Start X coordinate
     * @param {number} y1 - Start Y coordinate
     * @param {number} x2 - End X coordinate
     * @param {number} y2 - End Y coordinate
     * @returns {Promise} Resolves when drawing is complete
     */
    async drawRect(x1, y1, x2, y2) {
        this._ensureElements();
        if (!this.mappingLayer) {
            console.error('[UserSimulator] Mapping layer not found');
            return;
        }

        const rect = this.mappingLayer.getBoundingClientRect();

        // Step 1: Mouse down at start point
        const downEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + x1,
            clientY: rect.top + y1,
            button: 0
        });
        this.mappingLayer.dispatchEvent(downEvent);

        // Small delay to simulate human timing
        await this._wait(50);

        // Step 2: Mouse move to end point (simulate drag)
        const moveEvent = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + x2,
            clientY: rect.top + y2,
            button: 0
        });
        document.dispatchEvent(moveEvent);

        // Small delay
        await this._wait(50);

        // Step 3: Mouse up at end point
        const upEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + x2,
            clientY: rect.top + y2,
            button: 0
        });
        document.dispatchEvent(upEvent);

        console.log(`[UserSimulator] Drew rectangle from (${x1}, ${y1}) to (${x2}, ${y2})`);
    }

    /**
     * Simulate selecting a text area (enters text selection mode and draws)
     * @param {Object} bbox - Bounding box { x, y, width, height }
     * @returns {Promise} Resolves when selection is complete
     */
    async selectTextArea(bbox) {
        // First activate text selection mode
        this.chooseMode('text');

        // Wait for mode to activate
        await this._wait(100);

        // Then draw the rectangle
        await this.drawRect(
            bbox.x,
            bbox.y,
            bbox.x + bbox.width,
            bbox.y + bbox.height
        );

        console.log(`[UserSimulator] Selected text area:`, bbox);
    }

    /**
     * Choose a mapping mode by clicking the appropriate button
     * @param {string} mode - Mode: 'text', 'checkbox', 'radio', 'table', 'field'
     */
    chooseMode(mode) {
        const buttonMap = {
            'text': 'btn-text-selection-mode',
            'checkbox': 'btn-checkbox-mode',
            'radio': 'btn-radio-mode',
            'table': 'btn-table-mapping-mode',
            'field': 'btn-field-creation-mode'
        };

        const buttonId = buttonMap[mode];
        if (!buttonId) {
            console.error(`[UserSimulator] Unknown mode: ${mode}`);
            return;
        }

        const button = document.getElementById(buttonId);
        if (button) {
            button.click();
            console.log(`[UserSimulator] Activated mode: ${mode}`);
        } else {
            console.error(`[UserSimulator] Button not found: ${buttonId}`);
        }
    }

    /**
     * Set zoom level
     * @param {number} level - Zoom level (e.g., 1.0 = 100%)
     */
    zoom(level) {
        if (this.mapper && typeof this.mapper.setZoom === 'function') {
            this.mapper.setZoom(level);
            console.log(`[UserSimulator] Set zoom to ${level * 100}%`);
        } else {
            console.error('[UserSimulator] mapper.setZoom not available');
        }
    }

    /**
     * Zoom in one step
     */
    zoomIn() {
        if (this.mapper && typeof this.mapper.zoomIn === 'function') {
            this.mapper.zoomIn();
            console.log('[UserSimulator] Zoomed in');
        }
    }

    /**
     * Zoom out one step
     */
    zoomOut() {
        if (this.mapper && typeof this.mapper.zoomOut === 'function') {
            this.mapper.zoomOut();
            console.log('[UserSimulator] Zoomed out');
        }
    }

    /**
     * Simulate window resize
     * @param {number} width - New width (optional, for reference)
     * @param {number} height - New height (optional, for reference)
     */
    resize(width, height) {
        // Dispatch resize event to trigger all resize handlers
        window.dispatchEvent(new Event('resize'));
        console.log(`[UserSimulator] Triggered window resize`);
    }

    /**
     * Navigate to a specific page
     * @param {number} num - Page number (1-indexed)
     */
    goToPage(num) {
        if (this.mapper && typeof this.mapper.goToPage === 'function') {
            this.mapper.goToPage(num);
            console.log(`[UserSimulator] Navigated to page ${num}`);
        } else {
            console.error('[UserSimulator] mapper.goToPage not available');
        }
    }

    /**
     * Go to previous page
     */
    previousPage() {
        if (this.mapper && typeof this.mapper.previousPage === 'function') {
            this.mapper.previousPage();
            console.log('[UserSimulator] Navigated to previous page');
        }
    }

    /**
     * Go to next page
     */
    nextPage() {
        if (this.mapper && typeof this.mapper.nextPage === 'function') {
            this.mapper.nextPage();
            console.log('[UserSimulator] Navigated to next page');
        }
    }

    /**
     * Simulate pressing a keyboard key
     * @param {string} key - Key name (e.g., 'Enter', 'Escape', 'Delete')
     * @param {Object} options - Additional options { ctrlKey, shiftKey, altKey }
     */
    pressKey(key, options = {}) {
        const event = new KeyboardEvent('keydown', {
            key: key,
            code: key,
            bubbles: true,
            cancelable: true,
            ctrlKey: options.ctrlKey || false,
            shiftKey: options.shiftKey || false,
            altKey: options.altKey || false
        });
        document.dispatchEvent(event);
        console.log(`[UserSimulator] Pressed key: ${key}`);
    }

    /**
     * Press Escape key
     */
    escape() {
        this.pressKey('Escape');
    }

    /**
     * Press Enter key
     */
    enter() {
        this.pressKey('Enter');
    }

    /**
     * Press Delete key
     */
    delete() {
        this.pressKey('Delete');
    }

    /**
     * Undo (Ctrl+Z)
     */
    undo() {
        this.pressKey('z', { ctrlKey: true });
    }

    /**
     * Redo (Ctrl+Y)
     */
    redo() {
        this.pressKey('y', { ctrlKey: true });
    }

    /**
     * Click a button by ID
     * @param {string} buttonId - Button element ID
     */
    clickButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.click();
            console.log(`[UserSimulator] Clicked button: ${buttonId}`);
        } else {
            console.error(`[UserSimulator] Button not found: ${buttonId}`);
        }
    }

    /**
     * Fill an input field
     * @param {string} inputId - Input element ID
     * @param {string} value - Value to set
     */
    fillInput(inputId, value) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[UserSimulator] Filled input ${inputId} with "${value}"`);
        } else {
            console.error(`[UserSimulator] Input not found: ${inputId}`);
        }
    }

    /**
     * Wait for a specified time
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise}
     */
    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Wait for an element to appear
     * @param {string} selector - CSS selector
     * @param {number} timeout - Max wait time in ms
     * @returns {Promise<Element>}
     */
    async waitForElement(selector, timeout = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
            await this._wait(100);
        }
        throw new Error(`Element "${selector}" not found within ${timeout}ms`);
    }

    /**
     * Wait for a condition to be true
     * @param {Function} condition - Function that returns boolean
     * @param {number} timeout - Max wait time in ms
     * @returns {Promise<boolean>}
     */
    async waitFor(condition, timeout = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (condition()) {
                return true;
            }
            await this._wait(100);
        }
        return false;
    }
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.UserSimulator = UserSimulator;
}
