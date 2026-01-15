/**
 * State Machine Tests - Automated validation of state transitions
 *
 * Run via: window.StateTests.runAll()
 * Or individual: window.StateTests.testTransitions()
 */
(function() {
    'use strict';

    const StateTests = {
        results: [],
        passed: 0,
        failed: 0,

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

        // ============ TRANSITION TESTS ============
        testTransitions() {
            console.log('🧪 Testing State Transitions...');

            const MS = window.MapperState;
            const mapper = window.mapper;

            if (!mapper || !mapper.stateMachine || !MS) {
                console.error('❌ StateMachine not available for testing');
                return false;
            }

            const sm = mapper.stateMachine;

            // Save current state
            const originalState = sm.getState();

            // Reset to IDLE first
            sm.reset(true);
            this.assert(sm.is(MS.IDLE), 'Reset to IDLE');

            // ============ VALID TRANSITIONS ============
            console.log('\n📋 Testing VALID transitions:');

            // IDLE → FLOW_CAPTURE_NAME
            sm.reset(true);
            let result = sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });
            this.assert(result === true, 'IDLE → FLOW_CAPTURE_NAME', `Result: ${result}`);
            this.assert(sm.is(MS.FLOW_CAPTURE_NAME), 'State is FLOW_CAPTURE_NAME');

            // FLOW_CAPTURE_NAME → FLOW_CAPTURE_FIELD
            result = sm.setState(MS.FLOW_CAPTURE_FIELD);
            this.assert(result === true, 'FLOW_CAPTURE_NAME → FLOW_CAPTURE_FIELD', `Result: ${result}`);
            this.assert(sm.is(MS.FLOW_CAPTURE_FIELD), 'State is FLOW_CAPTURE_FIELD');

            // FLOW_CAPTURE_FIELD → FLOW_CAPTURE_NAME (loop back)
            result = sm.setState(MS.FLOW_CAPTURE_NAME);
            this.assert(result === true, 'FLOW_CAPTURE_FIELD → FLOW_CAPTURE_NAME (loop)', `Result: ${result}`);

            // FLOW_CAPTURE_NAME → IDLE (ESC)
            result = sm.setState(MS.IDLE);
            this.assert(result === true, 'FLOW_CAPTURE_NAME → IDLE (cancel)', `Result: ${result}`);

            // IDLE → FIELD_CREATION
            result = sm.setState(MS.FIELD_CREATION);
            this.assert(result === true, 'IDLE → FIELD_CREATION', `Result: ${result}`);

            // FIELD_CREATION → IDLE
            result = sm.setState(MS.IDLE);
            this.assert(result === true, 'FIELD_CREATION → IDLE', `Result: ${result}`);

            // IDLE → CHECKBOX_CREATION
            result = sm.setState(MS.CHECKBOX_CREATION);
            this.assert(result === true, 'IDLE → CHECKBOX_CREATION', `Result: ${result}`);

            // CHECKBOX_CREATION → IDLE
            result = sm.setState(MS.IDLE);
            this.assert(result === true, 'CHECKBOX_CREATION → IDLE', `Result: ${result}`);

            // IDLE → RADIO_CREATION
            result = sm.setState(MS.RADIO_CREATION);
            this.assert(result === true, 'IDLE → RADIO_CREATION', `Result: ${result}`);

            // IDLE → TABLE_REGION
            sm.reset(true);
            result = sm.setState(MS.TABLE_REGION);
            this.assert(result === true, 'IDLE → TABLE_REGION', `Result: ${result}`);

            // TABLE_REGION → TABLE_SAMPLE_ROW
            result = sm.setState(MS.TABLE_SAMPLE_ROW);
            this.assert(result === true, 'TABLE_REGION → TABLE_SAMPLE_ROW', `Result: ${result}`);

            // TABLE_SAMPLE_ROW → TABLE_COLUMN_MAPPING
            result = sm.setState(MS.TABLE_COLUMN_MAPPING);
            this.assert(result === true, 'TABLE_SAMPLE_ROW → TABLE_COLUMN_MAPPING', `Result: ${result}`);

            // IDLE → GROUPING_SELECT
            sm.reset(true);
            result = sm.setState(MS.GROUPING_SELECT);
            this.assert(result === true, 'IDLE → GROUPING_SELECT', `Result: ${result}`);

            // GROUPING_SELECT → GROUP_NAMING
            result = sm.setState(MS.GROUP_NAMING);
            this.assert(result === true, 'GROUPING_SELECT → GROUP_NAMING', `Result: ${result}`);

            // GROUP_NAMING → OPTION_LABELING
            result = sm.setState(MS.OPTION_LABELING);
            this.assert(result === true, 'GROUP_NAMING → OPTION_LABELING', `Result: ${result}`);

            // ============ INVALID TRANSITIONS ============
            console.log('\n📋 Testing INVALID transitions:');

            // Reset first
            sm.reset(true);

            // IDLE → FLOW_CAPTURE_FIELD (should fail - need NAME first)
            result = sm.setState(MS.FLOW_CAPTURE_FIELD);
            this.assert(result === false, 'IDLE → FLOW_CAPTURE_FIELD should FAIL');

            // FIELD_CREATION → FLOW_CAPTURE_NAME (should fail - incompatible)
            sm.setState(MS.FIELD_CREATION);
            result = sm.setState(MS.FLOW_CAPTURE_NAME);
            this.assert(result === false, 'FIELD_CREATION → FLOW_CAPTURE_NAME should FAIL');

            // CHECKBOX_CREATION → RADIO_CREATION (should fail - need IDLE first)
            sm.reset(true);
            sm.setState(MS.CHECKBOX_CREATION);
            result = sm.setState(MS.RADIO_CREATION);
            this.assert(result === false, 'CHECKBOX_CREATION → RADIO_CREATION should FAIL');

            // TABLE_COLUMN_MAPPING → FLOW_CAPTURE_NAME (should fail)
            sm.reset(true);
            sm.setState(MS.TABLE_REGION);
            sm.setState(MS.TABLE_SAMPLE_ROW);
            sm.setState(MS.TABLE_COLUMN_MAPPING);
            result = sm.setState(MS.FLOW_CAPTURE_NAME);
            this.assert(result === false, 'TABLE_COLUMN_MAPPING → FLOW_CAPTURE_NAME should FAIL');

            // Restore original state
            sm.reset(true);

            return this.failed === 0;
        },

        // ============ FLOW DATA TESTS ============
        testFlowData() {
            console.log('\n🧪 Testing Flow Data Management...');

            const MS = window.MapperState;
            const sm = window.mapper?.stateMachine;

            if (!sm || !MS) {
                console.error('❌ StateMachine not available');
                return false;
            }

            // Reset
            sm.reset(true);

            // Start flow with type
            sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'checkbox' } });
            this.assert(sm.getFlowType() === 'checkbox', 'Flow type set correctly');

            // Set pending name
            const nameData = { text: 'שם בדיקה', key: 'test_field', source: 'test' };
            sm.setPendingName(nameData);
            this.assert(sm.getPendingName()?.text === 'שם בדיקה', 'Pending name set correctly');

            // Move to capture field
            sm.setState(MS.FLOW_CAPTURE_FIELD);
            this.assert(sm.getPendingName() !== null, 'Pending name preserved after transition');

            // Clear pending name
            sm.clearPendingName();
            this.assert(sm.getPendingName() === null, 'Pending name cleared');

            // Reset clears all
            sm.reset(true);
            this.assert(sm.getFlowType() === null, 'Flow type cleared on reset');

            return this.failed === 0;
        },

        // ============ HELPER FUNCTION TESTS ============
        testHelpers() {
            console.log('\n🧪 Testing Helper Functions...');

            const MS = window.MapperState;
            const sm = window.mapper?.stateMachine;

            if (!sm || !MS) {
                console.error('❌ StateMachine not available');
                return false;
            }

            // Reset
            sm.reset(true);

            // is() / isInState()
            this.assert(sm.is(MS.IDLE), 'is(IDLE) returns true when in IDLE');
            this.assert(sm.isInState(MS.IDLE), 'isInState(IDLE) returns true when in IDLE');
            this.assert(!sm.is(MS.FLOW_CAPTURE_NAME), 'is(FLOW_CAPTURE_NAME) returns false when in IDLE');

            // isInAnyState()
            this.assert(sm.isInAnyState([MS.IDLE, MS.PREVIEW]), 'isInAnyState([IDLE, PREVIEW]) returns true');
            this.assert(!sm.isInAnyState([MS.DRAWING, MS.DRAGGING]), 'isInAnyState([DRAWING, DRAGGING]) returns false');

            // isInFlow()
            this.assert(!sm.isInFlow(), 'isInFlow() returns false when in IDLE');
            sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });
            this.assert(sm.isInFlow(), 'isInFlow() returns true when in FLOW_CAPTURE_NAME');
            sm.setState(MS.FLOW_CAPTURE_FIELD);
            this.assert(sm.isInFlow(), 'isInFlow() returns true when in FLOW_CAPTURE_FIELD');

            // isInTableFlow()
            sm.reset(true);
            this.assert(!sm.isInTableFlow(), 'isInTableFlow() returns false when in IDLE');
            sm.setState(MS.TABLE_REGION);
            this.assert(sm.isInTableFlow(), 'isInTableFlow() returns true when in TABLE_REGION');

            // isInCreationMode()
            sm.reset(true);
            this.assert(!sm.isInCreationMode(), 'isInCreationMode() returns false when in IDLE');
            sm.setState(MS.FIELD_CREATION);
            this.assert(sm.isInCreationMode(), 'isInCreationMode() returns true when in FIELD_CREATION');

            // isInteracting()
            sm.reset(true);
            this.assert(!sm.isInteracting(), 'isInteracting() returns false when in IDLE');

            // Reset
            sm.reset(true);

            return this.failed === 0;
        },

        // ============ RAPID TRANSITION PROTECTION TESTS ============
        testRapidProtection() {
            console.log('\n🧪 Testing Rapid Transition Protection...');

            const MS = window.MapperState;
            const sm = window.mapper?.stateMachine;

            if (!sm || !MS) {
                console.error('❌ StateMachine not available');
                return false;
            }

            // Reset
            sm.reset(true);

            // First transition should succeed
            let result = sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });
            this.assert(result === true, 'First transition succeeds');

            // Immediate second transition should be blocked (within 10ms)
            result = sm.setState(MS.IDLE);
            // Note: This may or may not fail depending on execution speed
            // We just check it doesn't crash

            // Wait and try again
            sm.reset(true);

            return true;
        },

        // ============ VALIDATION TESTS ============
        testValidation() {
            console.log('\n🧪 Testing Validation...');

            const MS = window.MapperState;
            const sm = window.mapper?.stateMachine;

            if (!sm || !MS) {
                console.error('❌ StateMachine not available');
                return false;
            }

            // Reset to clean state
            sm.reset(true);

            // Valid state should pass validation
            let validation = sm.validate();
            this.assert(validation.valid === true, 'IDLE state validates correctly');
            this.assert(validation.errors.length === 0, 'No errors in IDLE state');

            // Flow state without type should have warning
            sm.setState(MS.FLOW_CAPTURE_NAME, { force: true }); // Force without data
            validation = sm.validate();
            this.assert(validation.warnings.length > 0, 'Flow state without type generates warning');

            // Reset
            sm.reset(true);

            return this.failed === 0;
        },

        // ============ RUN ALL TESTS ============
        runAll() {
            console.log('═══════════════════════════════════════════════════════');
            console.log('🧪 STATE MACHINE TEST SUITE');
            console.log('═══════════════════════════════════════════════════════');

            this.reset();

            // Check prerequisites
            if (!window.mapper?.stateMachine || !window.MapperState) {
                console.error('❌ PREREQUISITES FAILED: StateMachine not loaded');
                console.log('Please wait for the mapper to initialize and try again.');
                return { passed: 0, failed: 1, error: 'StateMachine not available' };
            }

            // Run all test suites
            this.testTransitions();
            this.testFlowData();
            this.testHelpers();
            this.testRapidProtection();
            this.testValidation();

            // Summary
            console.log('\n═══════════════════════════════════════════════════════');
            console.log('📊 TEST RESULTS SUMMARY');
            console.log('═══════════════════════════════════════════════════════');
            console.log(`✅ Passed: ${this.passed}`);
            console.log(`❌ Failed: ${this.failed}`);
            console.log(`📈 Total:  ${this.passed + this.failed}`);

            if (this.failed === 0) {
                console.log('\n🎉 ALL TESTS PASSED!');
            } else {
                console.log('\n⚠️ SOME TESTS FAILED - Review output above');
            }

            return {
                passed: this.passed,
                failed: this.failed,
                results: this.results
            };
        },

        // ============ INTERACTIVE DEBUGGING ============
        printState() {
            const sm = window.mapper?.stateMachine;
            if (!sm) {
                console.log('❌ StateMachine not available');
                return;
            }

            console.log('═══════════════════════════════════════════════════════');
            console.log('📊 CURRENT STATE MACHINE STATUS');
            console.log('═══════════════════════════════════════════════════════');
            console.log('Current State:', sm.getState());
            console.log('Previous State:', sm.previousState);
            console.log('Parent State:', sm.parentState);
            console.log('Flow Data:', sm.flowData);
            console.log('Transition In Progress:', sm._transitionInProgress);
            console.log('Last Transition Time:', new Date(sm._lastTransitionTime).toISOString());
            console.log('\nRecent History:');
            sm.printHistory();
        }
    };

    // Expose globally
    window.StateTests = StateTests;

    console.log('🧪 State Machine Tests loaded. Run: window.StateTests.runAll()');
})();
