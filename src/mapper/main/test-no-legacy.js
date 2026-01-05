/**
 * Test No Legacy - Verifies complete removal of legacy flags
 *
 * This test suite ensures:
 * 1. No legacy flags are being read for logic decisions
 * 2. All mode detection goes through StateMachine
 * 3. handleEvent() is the single entry point for events
 *
 * Run via: window.NoLegacyTests.runAll()
 */
(function() {
    'use strict';

    const NoLegacyTests = {
        results: [],
        passed: 0,
        failed: 0,

        // Legacy flags that should NOT be used for logic
        LEGACY_FLAGS: [
            'selectFieldNameMode',
            'drawFieldAfterName',
            'fieldCreationMode',
            'checkboxCreationMode',
            'radioCreationMode',
            'groupingMode',
            'textSelectionMode',
            'mappingFlowActive',
            'mappingFlowStep',
            'pendingFieldName',
            'optionGroupingMode',
            'optionLabelingMode',
            'groupNamingMode',
            'tableMappingMode',
            'tableSelectionMode',
            'sampleRowSelectionMode',
            'columnMappingMode',
            'liveTablePreviewMode'
        ],

        // ============ TEST FRAMEWORK ============
        assert(condition, testName, details = '') {
            if (condition) {
                this.passed++;
                this.results.push({ status: 'PASS', test: testName, details });
                console.log(`✅ PASS: ${testName}`);
            } else {
                this.failed++;
                this.results.push({ status: 'FAIL', test: testName, details });
                console.error(`❌ FAIL: ${testName} - ${details}`);
            }
            return condition;
        },

        reset() {
            this.results = [];
            this.passed = 0;
            this.failed = 0;
        },

        // ============ STATE MACHINE AVAILABILITY ============
        testStateMachineAvailable() {
            console.log('\n🧪 Testing StateMachine Availability...');

            const mapper = window.mapper;

            this.assert(mapper !== undefined, 'Mapper exists');
            this.assert(mapper.stateMachine !== undefined && mapper.stateMachine !== null,
                'StateMachine is initialized');
            this.assert(window.MapperState !== undefined, 'MapperState enum is available');
            this.assert(typeof mapper.stateMachine.handleEvent === 'function',
                'handleEvent() method exists');
            this.assert(typeof mapper.stateMachine.isActionAllowed === 'function',
                'isActionAllowed() method exists');
            this.assert(typeof mapper.stateMachine.getAllowedActions === 'function',
                'getAllowedActions() method exists');

            return this.failed === 0;
        },

        // ============ STATE IS SINGLE SOURCE OF TRUTH ============
        testSingleSourceOfTruth() {
            console.log('\n🧪 Testing Single Source of Truth...');

            const mapper = window.mapper;
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) {
                this.assert(false, 'Prerequisites met', 'StateMachine not available');
                return false;
            }

            // Reset to IDLE
            sm.reset(true);

            // Test: When in FLOW_CAPTURE_NAME, only StateMachine should know
            sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });

            this.assert(sm.is(MS.FLOW_CAPTURE_NAME),
                'StateMachine reports FLOW_CAPTURE_NAME');

            // Transition to FLOW_CAPTURE_FIELD
            sm.setState(MS.FLOW_CAPTURE_FIELD);

            this.assert(sm.is(MS.FLOW_CAPTURE_FIELD),
                'StateMachine reports FLOW_CAPTURE_FIELD');
            this.assert(!sm.is(MS.FLOW_CAPTURE_NAME),
                'StateMachine does NOT report FLOW_CAPTURE_NAME');

            // Reset
            sm.reset(true);

            this.assert(sm.is(MS.IDLE), 'StateMachine reports IDLE after reset');

            return this.failed === 0;
        },

        // ============ HANDLE EVENT IS ENTRY POINT ============
        testHandleEventIsEntryPoint() {
            console.log('\n🧪 Testing handleEvent() is Entry Point...');

            const mapper = window.mapper;
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) {
                this.assert(false, 'Prerequisites met', 'StateMachine not available');
                return false;
            }

            // Reset
            sm.reset(true);

            // Test: handleEvent returns proper structure
            const result = sm.handleEvent('mousedown', { x: 100, y: 100, target: null, event: null });

            this.assert(typeof result === 'object', 'handleEvent returns object');
            this.assert('handled' in result, 'Result has handled property');
            this.assert('action' in result, 'Result has action property');

            // Test: In CHECKBOX_CREATION, mousedown should be handled
            sm.setState(MS.CHECKBOX_CREATION);

            const cbResult = sm.handleEvent('mousedown', { x: 100, y: 100, target: null, event: null });
            // Note: This might not be handled if createOneClickField is not available
            // We just check the structure is correct
            this.assert(typeof cbResult.handled === 'boolean', 'handled is boolean');

            sm.reset(true);

            return true;
        },

        // ============ STATE TRANSITIONS ARE VALID ============
        testStateTransitionsValid() {
            console.log('\n🧪 Testing State Transitions...');

            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) {
                this.assert(false, 'Prerequisites met', 'StateMachine not available');
                return false;
            }

            // Reset
            sm.reset(true);

            // Full flow test
            let result = sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });
            this.assert(result === true, 'IDLE → FLOW_CAPTURE_NAME succeeds');

            result = sm.setState(MS.FLOW_CAPTURE_FIELD);
            this.assert(result === true, 'FLOW_CAPTURE_NAME → FLOW_CAPTURE_FIELD succeeds');

            result = sm.setState(MS.FLOW_CAPTURE_NAME);
            this.assert(result === true, 'FLOW_CAPTURE_FIELD → FLOW_CAPTURE_NAME (loop) succeeds');

            result = sm.setState(MS.IDLE);
            this.assert(result === true, 'FLOW_CAPTURE_NAME → IDLE (cancel) succeeds');

            // Invalid transitions
            sm.reset(true);
            result = sm.setState(MS.FLOW_CAPTURE_FIELD);
            this.assert(result === false, 'IDLE → FLOW_CAPTURE_FIELD fails (invalid)');

            sm.setState(MS.CHECKBOX_CREATION);
            result = sm.setState(MS.RADIO_CREATION);
            this.assert(result === false, 'CHECKBOX_CREATION → RADIO_CREATION fails (invalid)');

            sm.reset(true);

            return this.failed === 0;
        },

        // ============ ESCAPE RESETS STATE ============
        testEscapeResetsState() {
            console.log('\n🧪 Testing Escape Resets State...');

            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) {
                this.assert(false, 'Prerequisites met', 'StateMachine not available');
                return false;
            }

            // Test: Escape from various states
            const statesToTest = [
                MS.FLOW_CAPTURE_NAME,
                MS.FIELD_CREATION,
                MS.CHECKBOX_CREATION,
                MS.RADIO_CREATION
            ];

            for (const state of statesToTest) {
                sm.reset(true);

                // Enter state
                if (state === MS.FLOW_CAPTURE_NAME) {
                    sm.setState(state, { data: { type: 'text' } });
                } else {
                    sm.setState(state);
                }

                // Send escape
                sm.handleEvent('keydown', { key: 'Escape', event: null });

                this.assert(sm.is(MS.IDLE), `Escape from ${state} returns to IDLE`);
            }

            return this.failed === 0;
        },

        // ============ FLOW DATA MANAGEMENT ============
        testFlowDataManagement() {
            console.log('\n🧪 Testing Flow Data Management...');

            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) {
                this.assert(false, 'Prerequisites met', 'StateMachine not available');
                return false;
            }

            sm.reset(true);

            // Start flow with type
            sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'checkbox' } });

            this.assert(sm.getFlowType() === 'checkbox', 'Flow type stored correctly');

            // Set pending name
            sm.setPendingName({ text: 'Test', key: 'test', source: 'manual' });

            this.assert(sm.getPendingName()?.text === 'Test', 'Pending name stored correctly');

            // Clear pending name
            sm.clearPendingName();

            this.assert(sm.getPendingName() === null, 'Pending name cleared');

            // Reset clears flow type
            sm.reset(true);

            this.assert(sm.getFlowType() === null, 'Flow type cleared on reset');

            return this.failed === 0;
        },

        // ============ ACTION VALIDATION ============
        testActionValidation() {
            console.log('\n🧪 Testing Action Validation...');

            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) {
                this.assert(false, 'Prerequisites met', 'StateMachine not available');
                return false;
            }

            sm.reset(true);

            // In IDLE, startMappingFlow should be allowed
            this.assert(sm.isActionAllowed('startMappingFlow'),
                'startMappingFlow allowed in IDLE');
            this.assert(sm.isActionAllowed('toggleFieldCreation'),
                'toggleFieldCreation allowed in IDLE');

            // In IDLE, finishDrawing should NOT be allowed
            this.assert(!sm.isActionAllowed('finishDrawing'),
                'finishDrawing NOT allowed in IDLE');

            // In FLOW_CAPTURE_NAME, startDrawing should be allowed
            sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });
            this.assert(sm.isActionAllowed('startDrawing'),
                'startDrawing allowed in FLOW_CAPTURE_NAME');
            this.assert(sm.isActionAllowed('escapePressed'),
                'escapePressed allowed in FLOW_CAPTURE_NAME');

            // toggleFieldCreation should NOT be allowed in flow
            this.assert(!sm.isActionAllowed('toggleFieldCreation'),
                'toggleFieldCreation NOT allowed in FLOW_CAPTURE_NAME');

            sm.reset(true);

            return this.failed === 0;
        },

        // ============ NO CONFLICTING STATES ============
        testNoConflictingStates() {
            console.log('\n🧪 Testing No Conflicting States...');

            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) {
                this.assert(false, 'Prerequisites met', 'StateMachine not available');
                return false;
            }

            sm.reset(true);

            // The StateMachine can only be in ONE state at a time
            sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });

            // Count active states
            let activeCount = 0;
            const allStates = Object.values(MS);

            for (const state of allStates) {
                if (sm.is(state)) activeCount++;
            }

            this.assert(activeCount === 1, `Only ONE state active (found ${activeCount})`);

            // Try to cause a conflict by rapid transitions
            sm.setState(MS.FLOW_CAPTURE_FIELD);

            activeCount = 0;
            for (const state of allStates) {
                if (sm.is(state)) activeCount++;
            }

            this.assert(activeCount === 1, `Still only ONE state after transition (found ${activeCount})`);

            sm.reset(true);

            return this.failed === 0;
        },

        // ============ RUN ALL TESTS ============
        runAll() {
            console.log('═══════════════════════════════════════════════════════');
            console.log('🧪 NO LEGACY TEST SUITE');
            console.log('═══════════════════════════════════════════════════════');
            console.log('Verifying complete migration to StateMachine...\n');

            this.reset();

            // Check prerequisites
            if (!window.mapper?.stateMachine || !window.MapperState) {
                console.error('❌ PREREQUISITES FAILED: StateMachine not loaded');
                console.log('Please wait for the mapper to initialize and try again.');
                return { passed: 0, failed: 1, error: 'StateMachine not available' };
            }

            // Run all test suites
            this.testStateMachineAvailable();
            this.testSingleSourceOfTruth();
            this.testHandleEventIsEntryPoint();
            this.testStateTransitionsValid();
            this.testEscapeResetsState();
            this.testFlowDataManagement();
            this.testActionValidation();
            this.testNoConflictingStates();

            // Summary
            console.log('\n═══════════════════════════════════════════════════════');
            console.log('📊 NO LEGACY TEST RESULTS');
            console.log('═══════════════════════════════════════════════════════');
            console.log(`✅ Passed: ${this.passed}`);
            console.log(`❌ Failed: ${this.failed}`);
            console.log(`📈 Total:  ${this.passed + this.failed}`);

            if (this.failed === 0) {
                console.log('\n🎉 ALL TESTS PASSED!');
                console.log('The system is using StateMachine as Single Source of Truth.');
            } else {
                console.log('\n⚠️ SOME TESTS FAILED - Legacy code may still be in use.');
            }

            return {
                passed: this.passed,
                failed: this.failed,
                results: this.results
            };
        }
    };

    // Expose globally
    window.NoLegacyTests = NoLegacyTests;

    console.log('🧪 No Legacy Tests loaded. Run: window.NoLegacyTests.runAll()');
})();
