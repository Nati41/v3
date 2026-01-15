/**
 * Test Utilities
 * Helper functions for writing tests
 *
 * NOTE: This is an ADDITIVE module - does not modify any existing mapper logic
 */

/**
 * Wait for a specified time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise}
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deep compare two bounding boxes
 * @param {Object} a - First bbox { x, y, width, height }
 * @param {Object} b - Second bbox { x, y, width, height }
 * @param {number} tolerance - Allowed difference (default 0.01)
 * @returns {boolean} True if boxes are equal within tolerance
 */
function compareBBox(a, b, tolerance = 0.01) {
    if (!a || !b) return false;

    return (
        Math.abs(a.x - b.x) <= tolerance &&
        Math.abs(a.y - b.y) <= tolerance &&
        Math.abs(a.width - b.width) <= tolerance &&
        Math.abs(a.height - b.height) <= tolerance
    );
}

/**
 * Log a test message with prefix
 * @param {string} msg - Message to log
 */
function log(msg) {
    console.log('🧪 TEST:', msg);
}

/**
 * Log an error message with prefix
 * @param {string} msg - Error message to log
 */
function error(msg) {
    console.error('🧪 TEST ERROR:', msg);
}

/**
 * Log a warning message with prefix
 * @param {string} msg - Warning message to log
 */
function warn(msg) {
    console.warn('🧪 TEST WARN:', msg);
}

/**
 * Assert that a condition is true
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition is false
 * @throws {Error} If condition is false
 */
function assert(condition, message = 'Assertion failed') {
    if (!condition) {
        throw new Error(message);
    }
}

/**
 * Assert that two values are equal
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} message - Error message
 */
function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message} Expected ${expected}, got ${actual}`);
    }
}

/**
 * Assert that a value is truthy
 * @param {*} value - Value to check
 * @param {string} message - Error message
 */
function assertTrue(value, message = 'Expected truthy value') {
    if (!value) {
        throw new Error(message);
    }
}

/**
 * Assert that a value is falsy
 * @param {*} value - Value to check
 * @param {string} message - Error message
 */
function assertFalse(value, message = 'Expected falsy value') {
    if (value) {
        throw new Error(message);
    }
}

/**
 * Assert that an array contains a value
 * @param {Array} arr - Array to check
 * @param {*} value - Value to find
 * @param {string} message - Error message
 */
function assertContains(arr, value, message = '') {
    if (!arr.includes(value)) {
        throw new Error(`${message} Array does not contain ${value}`);
    }
}

/**
 * Assert that an object has a property
 * @param {Object} obj - Object to check
 * @param {string} prop - Property name
 * @param {string} message - Error message
 */
function assertHasProperty(obj, prop, message = '') {
    if (!(prop in obj)) {
        throw new Error(`${message} Object does not have property ${prop}`);
    }
}

/**
 * Generate a random ID
 * @param {string} prefix - Optional prefix
 * @returns {string} Random ID
 */
function randomId(prefix = 'test') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a mock field object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock field
 */
function createMockField(overrides = {}) {
    return {
        id: randomId('field'),
        type: 'text',
        label_he: 'שדה בדיקה',
        page: 1,
        bbox: [0.1, 0.1, 0.2, 0.05],
        isMapped: true,
        isComplete: false,
        ...overrides
    };
}

/**
 * Create a mock table object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock table
 */
function createMockTable(overrides = {}) {
    return {
        tableId: randomId('table'),
        page: 1,
        rowCount: 5,
        columns: [
            { columnId: 'col1', hebrewName: 'עמודה 1', type: 'text' },
            { columnId: 'col2', hebrewName: 'עמודה 2', type: 'text' }
        ],
        ...overrides
    };
}

/**
 * Wait for element to appear in DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<Element>}
 */
async function waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element) {
            return element;
        }
        await wait(50);
    }
    throw new Error(`Element "${selector}" not found within ${timeout}ms`);
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<boolean>}
 */
async function waitForCondition(condition, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (condition()) {
            return true;
        }
        await wait(50);
    }
    return false;
}

/**
 * Measure execution time of a function
 * @param {Function} fn - Function to measure
 * @returns {Promise<{result: *, duration: number}>}
 */
async function measureTime(fn) {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.TestUtils = {
        wait,
        compareBBox,
        log,
        error,
        warn,
        assert,
        assertEqual,
        assertTrue,
        assertFalse,
        assertContains,
        assertHasProperty,
        randomId,
        createMockField,
        createMockTable,
        waitForElement,
        waitForCondition,
        measureTime
    };
}
