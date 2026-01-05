/**
 * Visual Test Engine
 * Core engine that orchestrates visual tests
 *
 * Features:
 * - Runs all rules against detected elements
 * - Produces structured results
 * - Optimized for < 5ms execution
 * - Soft mode (never blocks UI)
 */
(function() {
    'use strict';

    // Engine state
    let isEnabled = true;
    let lastResult = null;
    let lastRunTime = 0;
    let runCount = 0;
    let listeners = [];

    // Configuration
    const config = {
        maxRunTimeMs: 5,          // Target max execution time
        debounceMs: 50,           // Debounce rapid calls
        enabledRules: null,       // null = all rules, or array of rule IDs
        disabledRules: [],        // Array of rule IDs to skip
        debugHighlight: false,    // Highlight problematic elements
        autoRun: true,            // Auto-run on triggers
        logLevel: 'WARN'          // Minimum log level
    };

    // Debounce timer
    let debounceTimer = null;

    /**
     * Run all visual tests
     * @param {Object} mapper - FieldMapper instance
     * @param {Object} options - Run options
     * @returns {Object} Test results
     */
    function run(mapper, options = {}) {
        if (!isEnabled) {
            return { skipped: true, reason: 'Engine disabled' };
        }

        const startTime = performance.now();
        const Logger = window.VisualTestLogger;
        const Rules = window.VisualTestRules;
        const Detectors = window.VisualTestDetectors;

        if (!Logger || !Rules || !Detectors) {
            console.warn('[VisualTestEngine] Dependencies not loaded');
            return { error: 'Dependencies not loaded' };
        }

        Logger.startRun();

        // Get trigger context
        const trigger = options.trigger || 'manual';
        const context = options.context || {};

        // Initialize result
        const result = {
            timestamp: Date.now(),
            trigger,
            context,
            passed: 0,
            warnings: 0,
            errors: 0,
            skipped: 0,
            results: [],
            snapshot: null,
            runTimeMs: 0
        };

        try {
            // Take snapshot first
            result.snapshot = Detectors.takeSnapshot(mapper);

            // Get all elements to test
            const elements = Detectors.getAllOverlays();

            // Get rules to run
            const rulesToRun = getRulesToRun();

            // Run element-level rules
            elements.forEach(element => {
                rulesToRun.forEach(rule => {
                    if (rule.check) {
                        runRule(rule, element, mapper, result);
                    }
                });
            });

            // Run global rules
            rulesToRun.forEach(rule => {
                if (rule.checkGlobal) {
                    runGlobalRule(rule, mapper, result);
                }
            });

            // Calculate summary
            result.summary = {
                total: result.passed + result.warnings + result.errors,
                passed: result.passed,
                warnings: result.warnings,
                errors: result.errors,
                skipped: result.skipped,
                clean: result.warnings === 0 && result.errors === 0
            };

        } catch (err) {
            Logger.error('engine', 'Test run failed', { error: err.message });
            result.error = err.message;
        }

        // Calculate run time
        result.runTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
        lastRunTime = result.runTimeMs;
        runCount++;

        // Warn if too slow
        if (result.runTimeMs > config.maxRunTimeMs) {
            Logger.warn('performance', `Test run exceeded target time: ${result.runTimeMs}ms (target: ${config.maxRunTimeMs}ms)`);
        }

        Logger.endRun();

        // Store result
        lastResult = result;

        // Notify listeners
        notifyListeners(result);

        // Log summary
        if (result.warnings > 0 || result.errors > 0) {
            Logger.warn('summary', `Test complete: ${result.warnings} warnings, ${result.errors} errors`, {
                trigger,
                runTimeMs: result.runTimeMs
            });
        } else {
            Logger.debug('summary', `Test complete: All ${result.passed} checks passed`, {
                trigger,
                runTimeMs: result.runTimeMs
            });
        }

        return result;
    }

    /**
     * Run with debouncing (for rapid triggers)
     */
    function runDebounced(mapper, options = {}) {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
            run(mapper, options);
            debounceTimer = null;
        }, config.debounceMs);
    }

    /**
     * Get rules to run based on config
     */
    function getRulesToRun() {
        const Rules = window.VisualTestRules;
        let rules = Rules.ALL_RULES;

        // Filter by enabled rules
        if (config.enabledRules && config.enabledRules.length > 0) {
            rules = rules.filter(r => config.enabledRules.includes(r.id));
        }

        // Filter out disabled rules
        if (config.disabledRules.length > 0) {
            rules = rules.filter(r => !config.disabledRules.includes(r.id));
        }

        return rules;
    }

    /**
     * Run a single rule against an element
     */
    function runRule(rule, element, mapper, result) {
        const Logger = window.VisualTestLogger;

        try {
            const check = rule.check(element, mapper);

            if (check.passed === false) {
                // Rule failed
                const entry = {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    category: rule.category,
                    severity: rule.severity,
                    message: check.message,
                    data: check.data,
                    element: check.element ? {
                        className: check.element.className,
                        id: check.element.id,
                        dataFieldId: check.element.dataset?.fieldId,
                        dataTableId: check.element.dataset?.tableId
                    } : null
                };

                result.results.push(entry);

                if (rule.severity === 'error' || rule.severity === 'critical') {
                    result.errors++;
                    Logger.error(rule.category, check.message, check.data, check.element);
                } else {
                    result.warnings++;
                    Logger.warn(rule.category, check.message, check.data, check.element);
                }

                // Highlight if enabled
                if (config.debugHighlight && check.element) {
                    Logger.highlightElement(check.element, rule.severity.toUpperCase());
                }
            } else {
                result.passed++;
            }
        } catch (err) {
            result.skipped++;
            Logger.debug('engine', `Rule ${rule.id} threw error`, { error: err.message });
        }
    }

    /**
     * Run a global rule (not element-specific)
     */
    function runGlobalRule(rule, mapper, result) {
        const Logger = window.VisualTestLogger;

        try {
            const check = rule.checkGlobal(mapper);

            if (check.passed === false) {
                const entry = {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    category: rule.category,
                    severity: rule.severity,
                    message: check.message,
                    data: check.data,
                    global: true
                };

                result.results.push(entry);

                if (rule.severity === 'error' || rule.severity === 'critical') {
                    result.errors++;
                    Logger.error(rule.category, check.message, check.data);
                } else {
                    result.warnings++;
                    Logger.warn(rule.category, check.message, check.data);
                }
            } else {
                result.passed++;
            }
        } catch (err) {
            result.skipped++;
            Logger.debug('engine', `Global rule ${rule.id} threw error`, { error: err.message });
        }
    }

    /**
     * Add result listener
     */
    function addListener(callback) {
        listeners.push(callback);
        return () => {
            listeners = listeners.filter(l => l !== callback);
        };
    }

    /**
     * Notify all listeners
     */
    function notifyListeners(result) {
        listeners.forEach(callback => {
            try {
                callback(result);
            } catch (err) {
                console.error('[VisualTestEngine] Listener error:', err);
            }
        });
    }

    /**
     * Get last result
     */
    function getLastResult() {
        return lastResult;
    }

    /**
     * Get statistics
     */
    function getStats() {
        return {
            enabled: isEnabled,
            runCount,
            lastRunTimeMs: lastRunTime,
            lastResult: lastResult ? {
                warnings: lastResult.warnings,
                errors: lastResult.errors,
                timestamp: lastResult.timestamp
            } : null
        };
    }

    /**
     * Enable/disable engine
     */
    function setEnabled(enabled) {
        isEnabled = enabled;
        window.VisualTestLogger?.info('engine', `Visual tests ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Update configuration
     */
    function configure(newConfig) {
        Object.assign(config, newConfig);

        if (newConfig.logLevel) {
            window.VisualTestLogger?.setLevel(newConfig.logLevel);
        }
    }

    /**
     * Get current configuration
     */
    function getConfig() {
        return { ...config };
    }

    /**
     * Reset engine state
     */
    function reset() {
        lastResult = null;
        lastRunTime = 0;
        runCount = 0;
        window.VisualTestLogger?.clear();
    }

    /**
     * Run specific rule by ID
     */
    function runRule(ruleId, mapper) {
        const Rules = window.VisualTestRules;
        const rule = Rules.ALL_RULES.find(r => r.id === ruleId);

        if (!rule) {
            return { error: `Rule not found: ${ruleId}` };
        }

        const result = { ruleId, results: [] };

        if (rule.checkGlobal) {
            const check = rule.checkGlobal(mapper);
            result.results.push(check);
        }

        if (rule.check) {
            const Detectors = window.VisualTestDetectors;
            Detectors.getAllOverlays().forEach(el => {
                const check = rule.check(el, mapper);
                if (!check.passed) {
                    result.results.push(check);
                }
            });
        }

        return result;
    }

    /**
     * Quick health check (minimal tests)
     */
    function quickCheck(mapper) {
        const Detectors = window.VisualTestDetectors;

        return {
            ghosts: Detectors.detectGhostOverlays(mapper).length,
            oversized: Detectors.detectOversizedOverlays(mapper).length,
            wrongPage: Detectors.detectWrongPageOverlays(mapper).length,
            mode: Detectors.detectMapperMode(mapper),
            visualGuide: Detectors.detectVisualGuideState(mapper),
            healthy: Detectors.detectGhostOverlays(mapper).length === 0 &&
                     Detectors.detectOversizedOverlays(mapper).length === 0
        };
    }

    // Export
    window.VisualTestEngine = {
        run,
        runDebounced,
        runRule,
        quickCheck,
        getLastResult,
        getStats,
        setEnabled,
        configure,
        getConfig,
        reset,
        addListener
    };

})();
