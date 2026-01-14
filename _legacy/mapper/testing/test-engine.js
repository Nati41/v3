/**
 * Test Engine
 * Core testing framework for Tofesly Mapper
 *
 * Responsibilities:
 * - Register test cases
 * - Execute tests individually or all at once
 * - Collect and report results
 *
 * NOTE: This is an ADDITIVE module - does not modify any existing mapper logic
 */

class TestEngine {
    /**
     * @param {Object} mapper - Reference to the FieldMapper instance
     */
    constructor(mapper) {
        this.mapper = mapper;
        this.tests = new Map();
        this.results = [];
        this.isRunning = false;
    }

    /**
     * Register a test case
     * @param {string} name - Unique test name
     * @param {Function} fn - Async test function that returns { passed: boolean, message: string }
     */
    registerTest(name, fn) {
        if (this.tests.has(name)) {
            console.warn(`[TestEngine] Test "${name}" already exists, overwriting`);
        }
        this.tests.set(name, fn);
        console.log(`[TestEngine] Registered test: ${name}`);
    }

    /**
     * Run all registered tests
     * @returns {Promise<Array>} Array of test results
     */
    async runAll() {
        if (this.isRunning) {
            console.warn('[TestEngine] Tests already running');
            return this.results;
        }

        this.isRunning = true;
        this.results = [];

        console.log(`[TestEngine] Running ${this.tests.size} tests...`);
        const startTime = Date.now();

        for (const [name, fn] of this.tests) {
            const result = await this._runSingleTest(name, fn);
            this.results.push(result);
        }

        const duration = Date.now() - startTime;
        console.log(`[TestEngine] All tests completed in ${duration}ms`);

        this.isRunning = false;
        return this.results;
    }

    /**
     * Run a single test by name
     * @param {string} name - Test name to run
     * @returns {Promise<Object>} Test result
     */
    async run(name) {
        const fn = this.tests.get(name);
        if (!fn) {
            console.error(`[TestEngine] Test "${name}" not found`);
            return { name, passed: false, message: 'Test not found', duration: 0 };
        }

        return await this._runSingleTest(name, fn);
    }

    /**
     * Internal: Execute a single test with error handling
     * @param {string} name - Test name
     * @param {Function} fn - Test function
     * @returns {Promise<Object>} Test result
     */
    async _runSingleTest(name, fn) {
        const startTime = Date.now();
        let result;

        try {
            console.log(`[TestEngine] Running: ${name}`);
            const testResult = await fn(this.mapper);

            result = {
                name,
                passed: testResult.passed,
                message: testResult.message || '',
                duration: Date.now() - startTime
            };

            if (result.passed) {
                console.log(`  ✅ PASSED: ${name} (${result.duration}ms)`);
            } else {
                console.log(`  ❌ FAILED: ${name} - ${result.message}`);
            }
        } catch (error) {
            result = {
                name,
                passed: false,
                message: `Error: ${error.message}`,
                duration: Date.now() - startTime,
                error: error.stack
            };
            console.error(`  💥 ERROR: ${name} - ${error.message}`);
        }

        return result;
    }

    /**
     * Get all test results
     * @returns {Array} Array of test results
     */
    getResults() {
        return this.results;
    }

    /**
     * Get summary of test results
     * @returns {Object} Summary with counts
     */
    getSummary() {
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;
        const failed = total - passed;
        const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

        return {
            total,
            passed,
            failed,
            passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : 0,
            totalDuration
        };
    }

    /**
     * Clear all registered tests
     */
    clear() {
        this.tests.clear();
        this.results = [];
        console.log('[TestEngine] Cleared all tests');
    }
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.TestEngine = TestEngine;
}
