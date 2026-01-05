/**
 * Regression Test: Basic Flow Operations
 *
 * Tests the basic mapping flow functionality:
 * - Flow start
 * - Name capture
 * - Field creation
 * - Flow loop
 * - Flow exit
 *
 * @version 1.0.0
 */

(function() {
    'use strict';

    const FlowBasicTests = {
        name: 'Flow Basic Tests',
        tests: [],

        /**
         * Run all tests
         */
        async runAll() {
            console.log('═══════════════════════════════════════════');
            console.log('🧪 RUNNING: Flow Basic Tests');
            console.log('═══════════════════════════════════════════');

            const results = {
                passed: 0,
                failed: 0,
                errors: []
            };

            for (const test of this.tests) {
                try {
                    console.log(`\n▶ ${test.name}`);
                    await test.fn();
                    console.log(`  ✅ PASSED`);
                    results.passed++;
                } catch (error) {
                    console.log(`  ❌ FAILED: ${error.message}`);
                    results.failed++;
                    results.errors.push({ test: test.name, error: error.message });
                }
            }

            console.log('\n═══════════════════════════════════════════');
            console.log(`📊 Results: ${results.passed} passed, ${results.failed} failed`);
            console.log('═══════════════════════════════════════════');

            return results;
        },

        /**
         * Add a test
         */
        addTest(name, fn) {
            this.tests.push({ name, fn });
        },

        /**
         * Assert helper
         */
        assert(condition, message) {
            if (!condition) {
                throw new Error(message || 'Assertion failed');
            }
        },

        /**
         * Reset to clean state
         */
        reset() {
            const sm = window.mapper?.stateMachine;
            if (sm) sm.reset(true);
        }
    };

    // ============ TEST DEFINITIONS ============

    // Test 1: Can start flow
    FlowBasicTests.addTest('Can start text flow', async function() {
        FlowBasicTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        FlowBasicTests.assert(sm, 'StateMachine should exist');
        FlowBasicTests.assert(sm.is(MS.IDLE), 'Should start in IDLE');

        const result = window.MappingFlowLogic?.startFlow('text');
        FlowBasicTests.assert(result?.success, 'startFlow should succeed');
        FlowBasicTests.assert(sm.is(MS.FLOW_CAPTURE_NAME), 'Should be in FLOW_CAPTURE_NAME');
        FlowBasicTests.assert(sm.getFlowType() === 'text', 'Flow type should be text');

        FlowBasicTests.reset();
    });

    // Test 2: Can start different flow types
    FlowBasicTests.addTest('Can start checkbox flow', async function() {
        FlowBasicTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        const result = window.MappingFlowLogic?.startFlow('checkbox');
        FlowBasicTests.assert(result?.success, 'startFlow should succeed');
        FlowBasicTests.assert(sm.getFlowType() === 'checkbox', 'Flow type should be checkbox');

        FlowBasicTests.reset();
    });

    // Test 3: Continue flow with name
    FlowBasicTests.addTest('Continue flow with captured name', async function() {
        FlowBasicTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        // Start flow
        window.MappingFlowLogic?.startFlow('text');
        FlowBasicTests.assert(sm.is(MS.FLOW_CAPTURE_NAME), 'Should be in FLOW_CAPTURE_NAME');

        // Continue with name
        const result = window.MappingFlowLogic?.continueFlow({
            text: 'שם השדה',
            key: 'field_name',
            source: 'test'
        });

        FlowBasicTests.assert(result?.success, 'continueFlow should succeed');
        FlowBasicTests.assert(sm.is(MS.FLOW_CAPTURE_FIELD), 'Should be in FLOW_CAPTURE_FIELD');

        const pending = sm.getPendingName();
        FlowBasicTests.assert(pending?.text === 'שם השדה', 'Pending name should be set');

        FlowBasicTests.reset();
    });

    // Test 4: Exit flow
    FlowBasicTests.addTest('Exit flow returns to IDLE', async function() {
        FlowBasicTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        // Start flow
        window.MappingFlowLogic?.startFlow('text');
        FlowBasicTests.assert(sm.is(MS.FLOW_CAPTURE_NAME), 'Should be in FLOW_CAPTURE_NAME');

        // Exit flow
        const result = window.MappingFlowLogic?.exitFlow();
        FlowBasicTests.assert(result?.success, 'exitFlow should succeed');
        FlowBasicTests.assert(sm.is(MS.IDLE), 'Should be in IDLE');
        FlowBasicTests.assert(!sm.isInFlow(), 'Should not be in flow');

        FlowBasicTests.reset();
    });

    // Test 5: Cannot start flow while in creation mode
    FlowBasicTests.addTest('Cannot start flow while in creation mode', async function() {
        FlowBasicTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        // Enter field creation mode
        sm.setState(MS.FIELD_CREATION);
        FlowBasicTests.assert(sm.is(MS.FIELD_CREATION), 'Should be in FIELD_CREATION');

        // Try to start flow
        const result = window.MappingFlowLogic?.startFlow('text');
        FlowBasicTests.assert(!result?.success, 'startFlow should fail');

        FlowBasicTests.reset();
    });

    // Test 6: Validate flow
    FlowBasicTests.addTest('Validate flow detects issues', async function() {
        FlowBasicTests.reset();
        const sm = window.mapper?.stateMachine;

        // Valid state
        let validation = window.MappingFlowLogic?.validateFlow();
        FlowBasicTests.assert(validation?.valid, 'IDLE should be valid');

        // Start flow
        window.MappingFlowLogic?.startFlow('text');
        validation = window.MappingFlowLogic?.validateFlow();
        FlowBasicTests.assert(validation?.valid, 'Flow should be valid');

        FlowBasicTests.reset();
    });

    // Test 7: Get flow status
    FlowBasicTests.addTest('Get flow status returns correct info', async function() {
        FlowBasicTests.reset();

        // Not in flow
        let status = window.MappingFlowLogic?.getFlowStatus();
        FlowBasicTests.assert(!status?.inFlow, 'Should not be in flow');

        // Start flow
        window.MappingFlowLogic?.startFlow('radio');
        status = window.MappingFlowLogic?.getFlowStatus();
        FlowBasicTests.assert(status?.inFlow, 'Should be in flow');
        FlowBasicTests.assert(status?.type === 'radio', 'Type should be radio');
        FlowBasicTests.assert(status?.step === 'capture_name', 'Step should be capture_name');

        FlowBasicTests.reset();
    });

    // ============ EXPORTS ============
    window.FlowBasicTests = FlowBasicTests;

    console.log('🧪 FlowBasicTests loaded');

})();
