/**
 * Regression Test Runner
 *
 * Runs all regression tests and provides summary report.
 *
 * Usage:
 *   window.RegressionTests.runAll()     - Run all tests
 *   window.RegressionTests.runSuite(name) - Run specific suite
 *   window.RegressionTests.list()       - List available suites
 *
 * @version 1.0.0
 */

(function() {
    'use strict';

    const RegressionTests = {
        // Registered test suites
        suites: {},

        /**
         * Register a test suite
         */
        register(name, suite) {
            this.suites[name] = suite;
            console.log(`[RegressionTests] Registered: ${name}`);
        },

        /**
         * List all available test suites
         */
        list() {
            console.log('═══════════════════════════════════════════');
            console.log('📋 AVAILABLE TEST SUITES');
            console.log('═══════════════════════════════════════════');
            Object.keys(this.suites).forEach((name, i) => {
                const suite = this.suites[name];
                const testCount = suite.tests?.length || 0;
                console.log(`${i + 1}. ${name} (${testCount} tests)`);
            });
            console.log('═══════════════════════════════════════════');
            console.log('Run with: RegressionTests.runAll() or RegressionTests.runSuite("name")');
        },

        /**
         * Run a specific test suite
         */
        async runSuite(name) {
            const suite = this.suites[name];
            if (!suite) {
                console.error(`[RegressionTests] Suite not found: ${name}`);
                return null;
            }

            return await suite.runAll();
        },

        /**
         * Run all test suites
         */
        async runAll() {
            console.log('');
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║           REGRESSION TEST RUNNER - Phase 5                ║');
            console.log('╚═══════════════════════════════════════════════════════════╝');
            console.log('');

            const startTime = Date.now();
            const allResults = {
                totalPassed: 0,
                totalFailed: 0,
                suites: {}
            };

            const suiteNames = Object.keys(this.suites);
            console.log(`Running ${suiteNames.length} test suite(s)...\n`);

            for (const name of suiteNames) {
                try {
                    const result = await this.runSuite(name);
                    allResults.suites[name] = result;
                    allResults.totalPassed += result?.passed || 0;
                    allResults.totalFailed += result?.failed || 0;
                } catch (error) {
                    console.error(`[RegressionTests] Error in suite ${name}:`, error);
                    allResults.suites[name] = { error: error.message };
                    allResults.totalFailed++;
                }
            }

            const duration = Date.now() - startTime;

            // Print summary
            console.log('');
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║                    FINAL SUMMARY                          ║');
            console.log('╚═══════════════════════════════════════════════════════════╝');
            console.log('');

            Object.entries(allResults.suites).forEach(([name, result]) => {
                if (result?.error) {
                    console.log(`❌ ${name}: ERROR - ${result.error}`);
                } else {
                    const status = result.failed === 0 ? '✅' : '❌';
                    console.log(`${status} ${name}: ${result.passed} passed, ${result.failed} failed`);
                }
            });

            console.log('');
            console.log('───────────────────────────────────────────────────────────');
            const overallStatus = allResults.totalFailed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED';
            console.log(`${overallStatus}`);
            console.log(`Total: ${allResults.totalPassed} passed, ${allResults.totalFailed} failed`);
            console.log(`Duration: ${duration}ms`);
            console.log('───────────────────────────────────────────────────────────');

            return allResults;
        },

        /**
         * Quick test - run minimal validation
         */
        async quick() {
            console.log('Running quick validation...');

            const checks = {
                stateMachine: !!window.mapper?.stateMachine,
                mapperState: !!window.MapperState,
                eventBus: !!window.EventBus,
                eventTypes: !!window.EventTypes,
                controller: !!window.Controller,
                mappingFlowLogic: !!window.MappingFlowLogic,
                tableLogic: !!window.TableLogic,
                groupingLogic: !!window.GroupingLogic,
                fieldCreationLogic: !!window.FieldCreationLogic,
                textSelectionLogic: !!window.TextSelectionLogic
            };

            console.log('Quick Validation Results:');
            let allPassed = true;
            Object.entries(checks).forEach(([name, passed]) => {
                console.log(`  ${passed ? '✅' : '❌'} ${name}`);
                if (!passed) allPassed = false;
            });

            return { passed: allPassed, checks };
        }
    };

    // ============ AUTO-REGISTER SUITES ============
    // These will be registered when the test files load

    // Register suites when available
    setTimeout(() => {
        if (window.FlowBasicTests) {
            RegressionTests.register('flow-basic', window.FlowBasicTests);
        }
        if (window.StateMachineTests) {
            RegressionTests.register('state-machine', window.StateMachineTests);
        }
        if (window.EventBusTests) {
            RegressionTests.register('event-bus', window.EventBusTests);
        }
    }, 100);

    // ============ EXPORTS ============
    window.RegressionTests = RegressionTests;

    console.log('🧪 RegressionTests runner loaded');
    console.log('   Run: RegressionTests.runAll() or RegressionTests.quick()');

})();
