/**
 * Regression Test: EventBus Operations
 *
 * Tests the EventBus functionality:
 * - Subscribe/unsubscribe
 * - Emit events
 * - Once listeners
 * - Event logging
 *
 * @version 1.0.0
 */

(function() {
    'use strict';

    const EventBusTests = {
        name: 'EventBus Tests',
        tests: [],

        async runAll() {
            console.log('═══════════════════════════════════════════');
            console.log('🧪 RUNNING: EventBus Tests');
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
        }
    };

    // ============ TEST DEFINITIONS ============

    // Test 1: EventBus exists
    EventBusTests.addTest('EventBus exists', async function() {
        EventBusTests.assert(window.EventBus, 'EventBus should exist');
        EventBusTests.assert(window.EventTypes, 'EventTypes should exist');
    });

    // Test 2: Subscribe and emit
    EventBusTests.addTest('Subscribe and emit works', async function() {
        let received = false;
        let receivedData = null;

        const unsubscribe = window.EventBus.subscribe('test_event_1', (data) => {
            received = true;
            receivedData = data;
        });

        window.EventBus.emit('test_event_1', { test: true });

        EventBusTests.assert(received, 'Handler should be called');
        EventBusTests.assert(receivedData?.test === true, 'Data should be passed');

        unsubscribe();
    });

    // Test 3: Unsubscribe works
    EventBusTests.addTest('Unsubscribe works', async function() {
        let callCount = 0;

        const unsubscribe = window.EventBus.subscribe('test_event_2', () => {
            callCount++;
        });

        window.EventBus.emit('test_event_2');
        EventBusTests.assert(callCount === 1, 'Should be called once');

        unsubscribe();

        window.EventBus.emit('test_event_2');
        EventBusTests.assert(callCount === 1, 'Should not be called after unsubscribe');
    });

    // Test 4: Once listener
    EventBusTests.addTest('Once listener only fires once', async function() {
        let callCount = 0;

        window.EventBus.once('test_event_3', () => {
            callCount++;
        });

        window.EventBus.emit('test_event_3');
        window.EventBus.emit('test_event_3');

        EventBusTests.assert(callCount === 1, 'Once handler should only be called once');
    });

    // Test 5: Multiple subscribers
    EventBusTests.addTest('Multiple subscribers receive events', async function() {
        let count1 = 0;
        let count2 = 0;

        const unsub1 = window.EventBus.subscribe('test_event_4', () => count1++);
        const unsub2 = window.EventBus.subscribe('test_event_4', () => count2++);

        window.EventBus.emit('test_event_4');

        EventBusTests.assert(count1 === 1, 'First subscriber should be called');
        EventBusTests.assert(count2 === 1, 'Second subscriber should be called');

        unsub1();
        unsub2();
    });

    // Test 6: Priority ordering
    EventBusTests.addTest('Priority ordering works', async function() {
        const order = [];

        const unsub1 = window.EventBus.subscribe('test_event_5', () => order.push('low'), { priority: 0 });
        const unsub2 = window.EventBus.subscribe('test_event_5', () => order.push('high'), { priority: 10 });
        const unsub3 = window.EventBus.subscribe('test_event_5', () => order.push('medium'), { priority: 5 });

        window.EventBus.emit('test_event_5');

        EventBusTests.assert(order[0] === 'high', 'High priority should be first');
        EventBusTests.assert(order[1] === 'medium', 'Medium priority should be second');
        EventBusTests.assert(order[2] === 'low', 'Low priority should be last');

        unsub1();
        unsub2();
        unsub3();
    });

    // Test 7: Event types exist
    EventBusTests.addTest('All event types are defined', async function() {
        const ET = window.EventTypes;

        EventBusTests.assert(ET.STATE_CHANGE, 'STATE_CHANGE should exist');
        EventBusTests.assert(ET.FLOW_START, 'FLOW_START should exist');
        EventBusTests.assert(ET.FLOW_COMPLETE, 'FLOW_COMPLETE should exist');
        EventBusTests.assert(ET.BBOX_DRAWN, 'BBOX_DRAWN should exist');
        EventBusTests.assert(ET.FIELD_CREATED, 'FIELD_CREATED should exist');
        EventBusTests.assert(ET.NAME_CAPTURED, 'NAME_CAPTURED should exist');
    });

    // Test 8: Get stats
    EventBusTests.addTest('Get stats works', async function() {
        const stats = window.EventBus.getStats();

        EventBusTests.assert(stats, 'Stats should exist');
        EventBusTests.assert(typeof stats.totalListeners === 'number', 'Should have totalListeners');
        EventBusTests.assert(typeof stats.isPaused === 'boolean', 'Should have isPaused');
    });

    // Test 9: Get event log
    EventBusTests.addTest('Event log works', async function() {
        window.EventBus.emit('test_log_event', { data: 123 });

        const log = window.EventBus.getLog(5);
        EventBusTests.assert(Array.isArray(log), 'Log should be array');
    });

    // Test 10: Clear listeners
    EventBusTests.addTest('Clear listeners works', async function() {
        let called = false;

        window.EventBus.subscribe('test_clear', () => called = true);
        window.EventBus.clear('test_clear');
        window.EventBus.emit('test_clear');

        EventBusTests.assert(!called, 'Handler should not be called after clear');
    });

    // ============ EXPORTS ============
    window.EventBusTests = EventBusTests;

    console.log('🧪 EventBusTests loaded');

})();
