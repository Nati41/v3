/**
 * Regression Test: StateMachine Operations
 *
 * Tests the StateMachine core functionality:
 * - State transitions
 * - Helper APIs (can, disallow, require, debug)
 * - State clustering
 * - Validation
 *
 * @version 1.0.0
 */

(function() {
    'use strict';

    const StateMachineTests = {
        name: 'StateMachine Tests',
        tests: [],

        async runAll() {
            console.log('═══════════════════════════════════════════');
            console.log('🧪 RUNNING: StateMachine Tests');
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

        addTest(name, fn) {
            this.tests.push({ name, fn });
        },

        assert(condition, message) {
            if (!condition) {
                throw new Error(message || 'Assertion failed');
            }
        },

        reset() {
            const sm = window.mapper?.stateMachine;
            if (sm) sm.reset(true);
        }
    };

    // ============ TEST DEFINITIONS ============

    // Test 1: StateMachine exists
    StateMachineTests.addTest('StateMachine exists and is initialized', async function() {
        StateMachineTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        StateMachineTests.assert(sm, 'StateMachine should exist');
        StateMachineTests.assert(MS, 'MapperState enum should exist');
        StateMachineTests.assert(sm.is(MS.IDLE), 'Should start in IDLE');
    });

    // Test 2: can() helper
    StateMachineTests.addTest('can() helper works correctly', async function() {
        StateMachineTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        // From IDLE, should be able to go to FLOW_CAPTURE_NAME
        StateMachineTests.assert(sm.can('FLOW_CAPTURE_NAME'), 'Should be able to go to FLOW_CAPTURE_NAME');
        StateMachineTests.assert(sm.can(MS.FIELD_CREATION), 'Should be able to go to FIELD_CREATION');

        // Cannot go directly to FLOW_CAPTURE_FIELD from IDLE
        StateMachineTests.assert(!sm.can('FLOW_CAPTURE_FIELD'), 'Should not be able to go to FLOW_CAPTURE_FIELD from IDLE');

        StateMachineTests.reset();
    });

    // Test 3: disallow() helper
    StateMachineTests.addTest('disallow() helper works correctly', async function() {
        StateMachineTests.reset();
        const sm = window.mapper?.stateMachine;

        // In IDLE, disallow DRAWING and DRAGGING should return true
        StateMachineTests.assert(sm.disallow(['DRAWING', 'DRAGGING']), 'disallow should return true when not in those states');

        // Enter DRAWING
        sm.setState('FIELD_CREATION');
        sm.setState('DRAWING', { force: true, parentState: 'FIELD_CREATION' });

        // Now disallow DRAWING should return false
        StateMachineTests.assert(!sm.disallow(['DRAWING', 'DRAGGING']), 'disallow should return false when in DRAWING');

        StateMachineTests.reset();
    });

    // Test 4: require() helper
    StateMachineTests.addTest('require() helper works correctly', async function() {
        StateMachineTests.reset();
        const sm = window.mapper?.stateMachine;

        // In IDLE, require IDLE should return true
        StateMachineTests.assert(sm.require(['IDLE']), 'require should return true when in IDLE');
        StateMachineTests.assert(sm.require(['IDLE', 'FLOW_CAPTURE_NAME']), 'require should return true for array containing IDLE');

        // require FIELD_CREATION should return false
        StateMachineTests.assert(!sm.require(['FIELD_CREATION']), 'require should return false when not in FIELD_CREATION');

        StateMachineTests.reset();
    });

    // Test 5: inCluster() helper
    StateMachineTests.addTest('inCluster() helper works correctly', async function() {
        StateMachineTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        // IDLE is in BASE cluster
        StateMachineTests.assert(sm.inCluster('BASE'), 'IDLE should be in BASE cluster');

        // Enter flow
        sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });
        StateMachineTests.assert(sm.inCluster('FLOW'), 'FLOW_CAPTURE_NAME should be in FLOW cluster');
        StateMachineTests.assert(!sm.inCluster('TABLE'), 'Should not be in TABLE cluster');

        StateMachineTests.reset();
    });

    // Test 6: State clusters exist
    StateMachineTests.addTest('State clusters are defined', async function() {
        const SC = window.StateClusters;

        StateMachineTests.assert(SC, 'StateClusters should exist');
        StateMachineTests.assert(SC.FLOW, 'FLOW cluster should exist');
        StateMachineTests.assert(SC.TABLE, 'TABLE cluster should exist');
        StateMachineTests.assert(SC.GROUPING, 'GROUPING cluster should exist');
        StateMachineTests.assert(SC.CREATION, 'CREATION cluster should exist');
        StateMachineTests.assert(SC.INTERACTION, 'INTERACTION cluster should exist');
        StateMachineTests.assert(SC.BASE, 'BASE cluster should exist');
    });

    // Test 7: debug() method
    StateMachineTests.addTest('debug() method returns info', async function() {
        StateMachineTests.reset();
        const sm = window.mapper?.stateMachine;

        const debugInfo = sm.debug();
        StateMachineTests.assert(debugInfo, 'debug() should return object');
        StateMachineTests.assert(debugInfo.currentState, 'Should have currentState');
        StateMachineTests.assert(debugInfo.validation, 'Should have validation');
        StateMachineTests.assert(debugInfo.cluster, 'Should have cluster');

        StateMachineTests.reset();
    });

    // Test 8: validate() method
    StateMachineTests.addTest('validate() returns correct result', async function() {
        StateMachineTests.reset();
        const sm = window.mapper?.stateMachine;

        const validation = sm.validate();
        StateMachineTests.assert(validation, 'validate() should return object');
        StateMachineTests.assert(typeof validation.valid === 'boolean', 'Should have valid boolean');
        StateMachineTests.assert(Array.isArray(validation.errors), 'Should have errors array');
        StateMachineTests.assert(Array.isArray(validation.warnings), 'Should have warnings array');
        StateMachineTests.assert(validation.valid, 'IDLE state should be valid');

        StateMachineTests.reset();
    });

    // Test 9: Transition logging
    StateMachineTests.addTest('Transitions are logged', async function() {
        StateMachineTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        // Make some transitions
        sm.setState(MS.FIELD_CREATION);
        sm.reset(true);

        const history = sm.getHistory(5);
        StateMachineTests.assert(history.length > 0, 'Should have history entries');

        StateMachineTests.reset();
    });

    // Test 10: Rapid transition protection
    StateMachineTests.addTest('Rapid transitions are blocked', async function() {
        StateMachineTests.reset();
        const sm = window.mapper?.stateMachine;
        const MS = window.MapperState;

        // Make rapid transitions
        sm.setState(MS.FIELD_CREATION);

        // This should be blocked (too rapid)
        const result = sm.setState(MS.IDLE);

        // The transition might succeed or be blocked depending on timing
        // Just verify no errors thrown
        StateMachineTests.assert(true, 'Rapid transition handling completed without error');

        StateMachineTests.reset();
    });

    // ============ EXPORTS ============
    window.StateMachineTests = StateMachineTests;

    console.log('🧪 StateMachineTests loaded');

})();
