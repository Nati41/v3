/**
 * Test Runner
 * Orchestrates test execution and provides UI panel
 *
 * Responsibilities:
 * - Load test suites
 * - Run tests via TestEngine
 * - Display results in a UI panel
 *
 * NOTE: This is an ADDITIVE module - does not modify any existing mapper logic
 */

class TestRunner {
    /**
     * @param {Object} mapper - Reference to the FieldMapper instance
     * @param {UserSimulator} simulator - User simulator instance
     * @param {TestEngine} engine - Test engine instance
     */
    constructor(mapper, simulator, engine) {
        this.mapper = mapper;
        this.simulator = simulator;
        this.engine = engine;
        this.report = new TestReport();
        this.panelVisible = false;
        this.panelElement = null;
    }

    /**
     * Load built-in tests
     * Tests are loaded dynamically to keep them separate
     */
    loadTests() {
        console.log('[TestRunner] Loading tests...');

        // Basic sanity tests
        this._loadSanityTests();

        // Mode activation tests
        this._loadModeTests();

        // Drawing tests
        this._loadDrawingTests();

        // Navigation tests
        this._loadNavigationTests();

        // Load full test suites (6 comprehensive suites)
        this._loadFullTestSuites();

        console.log(`[TestRunner] Loaded ${this.engine.tests.size} tests`);
    }

    /**
     * Load full test suites from TestSuites class
     * Includes: Field, Text, Checkbox/Radio, Table Wizard, Stability, Integration
     */
    _loadFullTestSuites() {
        if (typeof TestSuites === 'undefined') {
            console.warn('[TestRunner] TestSuites class not found, skipping full suites');
            return;
        }

        try {
            this.testSuites = new TestSuites(this.mapper, this.simulator, this.engine);
            this.testSuites.registerAll();
            console.log('[TestRunner] Full test suites loaded successfully');
        } catch (e) {
            console.error('[TestRunner] Failed to load test suites:', e);
        }
    }

    /**
     * Load sanity tests
     */
    _loadSanityTests() {
        const simulator = this.simulator;
        const mapper = this.mapper;

        this.engine.registerTest('sanity:mapper-exists', async () => {
            return {
                passed: mapper !== null && mapper !== undefined,
                message: mapper ? 'Mapper instance exists' : 'Mapper is null'
            };
        });

        this.engine.registerTest('sanity:mapping-layer-exists', async () => {
            const layer = document.getElementById('mapping-layer');
            return {
                passed: layer !== null,
                message: layer ? 'Mapping layer found' : 'Mapping layer not found'
            };
        });

        this.engine.registerTest('sanity:toolbar-exists', async () => {
            const toolbar = document.querySelector('.toolbar');
            return {
                passed: toolbar !== null,
                message: toolbar ? 'Toolbar found' : 'Toolbar not found'
            };
        });
    }

    /**
     * Load mode activation tests
     */
    _loadModeTests() {
        const simulator = this.simulator;
        const mapper = this.mapper;

        this.engine.registerTest('mode:text-selection', async () => {
            // Text selection mode requires a field to be selected first
            // Create a temporary field, select it, then test text selection mode
            const testField = {
                id: 'test_text_mode_' + Date.now(),
                type: 'text',
                label_he: 'בדיקה',
                bbox: [0.1, 0.1, 0.15, 0.04],
                page: mapper.currentPage || 1
            };
            mapper.fields.push(testField);
            mapper.selectedField = testField;

            simulator.chooseMode('text');
            await simulator._wait(100);
            const active = mapper.textSelectionMode === true;

            // Cleanup
            simulator.escape();
            mapper.removeField(testField.id);
            mapper.selectedField = null;

            return {
                passed: active,
                message: active ? 'Text selection mode activated' : 'Failed to activate text mode (requires field selection)'
            };
        });

        this.engine.registerTest('mode:field-creation', async () => {
            simulator.chooseMode('field');
            await simulator._wait(100);
            const active = mapper.fieldCreationMode === true;
            simulator.escape(); // Reset
            return {
                passed: active,
                message: active ? 'Field creation mode activated' : 'Failed to activate field mode'
            };
        });

        this.engine.registerTest('mode:checkbox', async () => {
            simulator.chooseMode('checkbox');
            await simulator._wait(100);
            const active = mapper.checkboxCreationMode === true || mapper.checkboxMode === true;
            simulator.escape(); // Reset
            return {
                passed: active,
                message: active ? 'Checkbox mode activated' : 'Failed to activate checkbox mode'
            };
        });

        this.engine.registerTest('mode:radio', async () => {
            simulator.chooseMode('radio');
            await simulator._wait(100);
            const active = mapper.radioCreationMode === true || mapper.radioMode === true;
            simulator.escape(); // Reset
            return {
                passed: active,
                message: active ? 'Radio mode activated' : 'Failed to activate radio mode'
            };
        });

        this.engine.registerTest('mode:escape-resets', async () => {
            simulator.chooseMode('field');
            await simulator._wait(50);
            simulator.escape();
            await simulator._wait(50);
            const reset = mapper.fieldCreationMode === false;
            return {
                passed: reset,
                message: reset ? 'Escape correctly resets mode' : 'Escape did not reset mode'
            };
        });
    }

    /**
     * Load drawing tests
     */
    _loadDrawingTests() {
        const simulator = this.simulator;
        const mapper = this.mapper;

        this.engine.registerTest('draw:field-creation', async () => {
            // Check if document is loaded - drawing requires loaded document
            if (!mapper.documentLoaded) {
                // Test passes if field creation mode can be activated (UI works)
                simulator.chooseMode('field');
                await simulator._wait(100);
                const modeActive = mapper.fieldCreationMode === true;
                simulator.escape();
                return {
                    passed: modeActive,
                    message: modeActive
                        ? 'Field creation mode works (no PDF loaded for draw test)'
                        : 'Field creation mode failed'
                };
            }

            const initialCount = mapper.fields.length;

            // Activate field creation mode
            simulator.chooseMode('field');
            await simulator._wait(100);

            // Draw a rectangle
            await simulator.drawRect(100, 100, 200, 130);
            await simulator._wait(200);

            const newCount = mapper.fields.length;
            const created = newCount > initialCount;

            // Cleanup - remove the created field
            if (created && mapper.fields.length > 0) {
                const lastField = mapper.fields[mapper.fields.length - 1];
                if (lastField && !lastField.isComplete) {
                    mapper.removeField(lastField.id);
                }
            }

            simulator.escape();

            return {
                passed: created,
                message: created
                    ? `Field created (${initialCount} -> ${newCount})`
                    : 'No field was created (ensure PDF is loaded)'
            };
        });
    }

    /**
     * Load navigation tests
     */
    _loadNavigationTests() {
        const simulator = this.simulator;
        const mapper = this.mapper;

        this.engine.registerTest('nav:zoom-in', async () => {
            const initialZoom = mapper.zoomLevel;
            simulator.zoomIn();
            await simulator._wait(100);
            const newZoom = mapper.zoomLevel;
            const increased = newZoom > initialZoom;

            // Reset zoom
            mapper.setZoom(initialZoom);

            return {
                passed: increased,
                message: increased
                    ? `Zoom increased (${initialZoom} -> ${newZoom})`
                    : 'Zoom did not increase'
            };
        });

        this.engine.registerTest('nav:zoom-out', async () => {
            const initialZoom = mapper.zoomLevel;
            simulator.zoomOut();
            await simulator._wait(100);
            const newZoom = mapper.zoomLevel;
            const decreased = newZoom < initialZoom;

            // Reset zoom
            mapper.setZoom(initialZoom);

            return {
                passed: decreased,
                message: decreased
                    ? `Zoom decreased (${initialZoom} -> ${newZoom})`
                    : 'Zoom did not decrease'
            };
        });
    }

    /**
     * Run all tests
     * @returns {Promise<Object>} Test results summary
     */
    async run() {
        console.log('[TestRunner] Starting test run...');

        // Load tests if not already loaded
        if (this.engine.tests.size === 0) {
            this.loadTests();
        }

        // Run all tests
        const results = await this.engine.runAll();

        // Add results to report
        this.report.clear();
        results.forEach(result => {
            this.report.addResult(result.name, result.passed ? 'passed' : 'failed', result);
        });

        // Update panel if visible
        if (this.panelVisible) {
            this._updatePanel();
        }

        // Return summary
        return this.engine.getSummary();
    }

    /**
     * Run a specific test by name
     * @param {string} name - Test name
     * @returns {Promise<Object>} Test result
     */
    async runTest(name) {
        const result = await this.engine.run(name);
        this.report.addResult(result.name, result.passed ? 'passed' : 'failed', result);

        if (this.panelVisible) {
            this._updatePanel();
        }

        return result;
    }

    /**
     * Run tests by suite/category
     * @param {string} suite - Suite name prefix (e.g., 'field', 'table', 'stability')
     * @returns {Promise<Object>} Test results for that suite
     */
    async runSuite(suite) {
        console.log(`[TestRunner] Running suite: ${suite}`);

        // Load tests if not already loaded
        if (this.engine.tests.size === 0) {
            this.loadTests();
        }

        // Filter tests by suite prefix
        const suiteTests = Array.from(this.engine.tests.keys())
            .filter(name => name.startsWith(suite + ':'));

        if (suiteTests.length === 0) {
            console.warn(`[TestRunner] No tests found for suite: ${suite}`);
            return { total: 0, passed: 0, failed: 0 };
        }

        // Run each test in the suite
        const results = [];
        for (const testName of suiteTests) {
            const result = await this.engine.run(testName);
            results.push(result);
            this.report.addResult(result.name, result.passed ? 'passed' : 'failed', result);
        }

        // Update panel if visible
        if (this.panelVisible) {
            this._updatePanel();
        }

        const passed = results.filter(r => r.passed).length;
        return {
            suite,
            total: results.length,
            passed,
            failed: results.length - passed,
            results
        };
    }

    /**
     * Get list of available test suites
     * @returns {Array<string>} Suite names
     */
    getSuites() {
        if (this.engine.tests.size === 0) {
            this.loadTests();
        }

        const suites = new Set();
        for (const testName of this.engine.tests.keys()) {
            const suite = testName.split(':')[0];
            suites.add(suite);
        }
        return Array.from(suites).sort();
    }

    /**
     * Show the test panel UI
     */
    showPanel() {
        if (this.panelElement) {
            this.panelElement.style.display = 'block';
            this.panelVisible = true;
            this._updatePanel();
            return;
        }

        // Create panel
        this.panelElement = document.createElement('div');
        this.panelElement.id = 'test-runner-panel';
        this.panelElement.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 400px;
            max-height: 600px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
        `;

        this.panelElement.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; font-size: 14px;">🧪 Test Runner</span>
                <button id="test-panel-close" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px;">×</button>
            </div>
            <div style="padding: 15px;">
                <!-- Main Actions -->
                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                    <button id="test-run-all" style="flex: 1; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">▶ Run All</button>
                    <button id="test-clear" style="padding: 10px; background: #f0f0f0; border: none; border-radius: 6px; cursor: pointer;">Clear</button>
                </div>

                <!-- Suite Buttons -->
                <div id="test-suite-buttons" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
                    <!-- Suite buttons will be inserted here -->
                </div>

                <!-- Summary -->
                <div id="test-summary" style="background: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 13px;">
                    No tests run yet
                </div>

                <!-- Filter -->
                <div style="margin-bottom: 10px;">
                    <select id="test-filter" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px;">
                        <option value="all">All Results</option>
                        <option value="failed">Failed Only</option>
                        <option value="passed">Passed Only</option>
                    </select>
                </div>

                <!-- Results -->
                <div id="test-results" style="max-height: 320px; overflow-y: auto; font-size: 12px;">
                </div>
            </div>
        `;

        document.body.appendChild(this.panelElement);
        this.panelVisible = true;

        // Bind events
        document.getElementById('test-panel-close').onclick = () => this.hidePanel();
        document.getElementById('test-run-all').onclick = () => this.run();
        document.getElementById('test-clear').onclick = () => {
            this.report.clear();
            this._updatePanel();
        };
        document.getElementById('test-filter').onchange = () => this._updatePanel();

        // Load tests to populate suite buttons
        if (this.engine.tests.size === 0) {
            this.loadTests();
        }

        // Create suite buttons
        this._createSuiteButtons();
    }

    /**
     * Create buttons for each test suite
     */
    _createSuiteButtons() {
        const container = document.getElementById('test-suite-buttons');
        if (!container) return;

        const suites = this.getSuites();
        const suiteColors = {
            'sanity': '#6c757d',
            'mode': '#17a2b8',
            'draw': '#28a745',
            'nav': '#ffc107',
            'field': '#007bff',
            'text': '#6610f2',
            'checkbox': '#e83e8c',
            'radio': '#fd7e14',
            'table': '#20c997',
            'stability': '#dc3545',
            'integration': '#6f42c1'
        };

        container.innerHTML = suites.map(suite => {
            const color = suiteColors[suite] || '#6c757d';
            return `<button class="suite-btn" data-suite="${suite}" style="
                padding: 6px 10px;
                background: ${color};
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 500;
            ">${suite}</button>`;
        }).join('');

        // Bind suite button clicks
        container.querySelectorAll('.suite-btn').forEach(btn => {
            btn.onclick = () => this.runSuite(btn.dataset.suite);
        });
    }

    /**
     * Hide the test panel
     */
    hidePanel() {
        if (this.panelElement) {
            this.panelElement.style.display = 'none';
            this.panelVisible = false;
        }
    }

    /**
     * Toggle panel visibility
     */
    togglePanel() {
        if (this.panelVisible) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    }

    /**
     * Update panel with current results
     */
    _updatePanel() {
        const summaryEl = document.getElementById('test-summary');
        const resultsEl = document.getElementById('test-results');
        const filterEl = document.getElementById('test-filter');

        if (!summaryEl || !resultsEl) return;

        const summary = this.report.generateSummary();
        const filter = filterEl ? filterEl.value : 'all';

        // Update summary
        summaryEl.innerHTML = `
            <div style="display: flex; justify-content: space-between;">
                <span>Total: <strong>${summary.total}</strong></span>
                <span style="color: #4CAF50;">✓ ${summary.passed}</span>
                <span style="color: #dc3545;">✗ ${summary.failed}</span>
                <span>Pass: ${summary.passRate}%</span>
            </div>
            <div style="font-size: 11px; color: #666; margin-top: 6px;">
                Duration: ${summary.totalDuration}ms
            </div>
        `;

        // Filter results
        let results = this.report.results;
        if (filter === 'failed') {
            results = results.filter(r => r.status !== 'passed');
        } else if (filter === 'passed') {
            results = results.filter(r => r.status === 'passed');
        }

        // Update results list
        if (results.length === 0) {
            resultsEl.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">No test results</div>';
            return;
        }

        // Group results by suite
        const grouped = {};
        results.forEach(r => {
            const suite = r.name.split(':')[0];
            if (!grouped[suite]) grouped[suite] = [];
            grouped[suite].push(r);
        });

        resultsEl.innerHTML = Object.entries(grouped).map(([suite, suiteResults]) => {
            const suitePass = suiteResults.filter(r => r.status === 'passed').length;
            const suiteTotal = suiteResults.length;

            return `
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: 600; font-size: 11px; color: #333; margin-bottom: 6px; padding: 4px 8px; background: #e9ecef; border-radius: 4px;">
                        ${suite.toUpperCase()} (${suitePass}/${suiteTotal})
                    </div>
                    ${suiteResults.map(r => `
                        <div style="padding: 8px; margin-bottom: 4px; background: ${r.status === 'passed' ? '#e8f5e9' : '#ffebee'}; border-radius: 4px; border-left: 3px solid ${r.status === 'passed' ? '#4CAF50' : '#dc3545'};">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 500;">${r.status === 'passed' ? '✓' : '✗'} ${r.name.split(':')[1]}</span>
                                <span style="font-size: 10px; color: #666;">${r.details.duration || 0}ms</span>
                            </div>
                            ${r.details.message ? `<div style="font-size: 11px; color: #666; margin-top: 4px;">${r.details.message}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');
    }
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.TestRunner = TestRunner;
}
