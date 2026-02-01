/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEBUG SYSTEM INSTRUMENTATION - VALIDATION ONLY (NO FIXES)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Purpose: Validate hypotheses about Debug/Console system instability
 *
 * HYPOTHESES TO VALIDATE:
 * H1: No mandatory handshake between components
 * H2: No single source of truth for connection state
 * H3: Components load in unpredictable order
 * H4: Messages are sent before listeners are ready
 *
 * IMPORTANT: This file is for INSTRUMENTATION ONLY.
 * DO NOT FIX anything until hypotheses are validated.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const INSTRUMENTATION_VERSION = '1.0.0';
const MAX_LOG_ENTRIES = 200;
const ENABLE_CONSOLE_OUTPUT = true;

// ═══════════════════════════════════════════════════════════════════════════
// STATE STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const debugInstrumentationState = {
    // Load order tracking
    loadOrder: [],
    loadTimestamps: {},

    // Handshake tracking
    handshakes: {
        helloSent: [],
        ackReceived: [],
        pendingHellos: new Map()  // component -> timestamp
    },

    // Listener tracking
    listeners: {
        registry: new Map(),      // eventName -> Set<listenerId>
        registrationLog: [],
        unregistrationLog: [],
        duplicates: []
    },

    // Message tracking
    messages: {
        sent: [],
        received: [],
        sentBeforeAck: [],        // Messages sent before handshake complete
        lostMessages: []          // Messages with no listener
    },

    // Validation results
    validationResults: {
        H1_noHandshake: { confirmed: false, evidence: [] },
        H2_noSingleSource: { confirmed: false, evidence: [] },
        H3_unpredictableLoad: { confirmed: false, evidence: [] },
        H4_messageBeforeReady: { confirmed: false, evidence: [] }
    },

    // Connection state tracking
    connectionStates: [],         // History of connection state changes
    currentConnectionOwner: null  // Who owns the connection state
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT LOAD ORDER TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log component load event
 * @param {string} componentName - Name of the component
 * @param {string} stage - Load stage (script-start, initialized, ready)
 */
function logComponentLoad(componentName, stage = 'loaded') {
    const timestamp = Date.now();
    const entry = {
        component: componentName,
        stage,
        timestamp,
        timestampISO: new Date().toISOString(),
        order: debugInstrumentationState.loadOrder.length
    };

    debugInstrumentationState.loadOrder.push(entry);
    debugInstrumentationState.loadTimestamps[`${componentName}:${stage}`] = timestamp;

    // Check for unexpected load order
    const expectedOrder = [
        'EventBus',
        'StateManager',
        'PDFEngine',
        'DrawController',
        'AutoBoxer',
        'BboxRefiner',
        'MapperCore'
    ];

    const loadedComponents = debugInstrumentationState.loadOrder
        .filter(e => e.stage === 'loaded' || e.stage === 'initialized')
        .map(e => e.component);

    // Check if loading out of expected order
    for (let i = 1; i < loadedComponents.length; i++) {
        const current = loadedComponents[i];
        const previous = loadedComponents[i - 1];
        const currentExpectedIdx = expectedOrder.indexOf(current);
        const previousExpectedIdx = expectedOrder.indexOf(previous);

        if (currentExpectedIdx !== -1 && previousExpectedIdx !== -1) {
            if (currentExpectedIdx < previousExpectedIdx) {
                debugInstrumentationState.validationResults.H3_unpredictableLoad.confirmed = true;
                debugInstrumentationState.validationResults.H3_unpredictableLoad.evidence.push({
                    timestamp,
                    current,
                    previous,
                    expected: `${current} should load before ${previous}`,
                    loadOrder: loadedComponents
                });
            }
        }
    }

    if (ENABLE_CONSOLE_OUTPUT) {
        console.log(`%c[Debug Instrumentation] COMPONENT_LOAD: ${componentName} (${stage})`,
            'color: #00BCD4');
        console.log(`  Order: #${entry.order}`);
    }

    return entry;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDSHAKE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log handshake hello sent
 * @param {string} from - Component sending hello
 * @param {string} to - Target component
 */
function logHandshakeHelloSent(from, to) {
    const timestamp = Date.now();
    const entry = {
        from,
        to,
        timestamp,
        timestampISO: new Date().toISOString(),
        ackReceived: false,
        ackTimestamp: null
    };

    debugInstrumentationState.handshakes.helloSent.push(entry);
    debugInstrumentationState.handshakes.pendingHellos.set(`${from}->${to}`, entry);

    if (ENABLE_CONSOLE_OUTPUT) {
        console.log(`%c[Debug Instrumentation] DEBUG_HELLO_SENT: ${from} -> ${to}`,
            'color: #FF9800');
    }

    return entry;
}

/**
 * Log handshake ACK received
 * @param {string} from - Component that sent hello
 * @param {string} to - Component that ACKed
 */
function logHandshakeAckReceived(from, to) {
    const timestamp = Date.now();
    const key = `${from}->${to}`;
    const pendingHello = debugInstrumentationState.handshakes.pendingHellos.get(key);

    const entry = {
        from,
        to,
        timestamp,
        timestampISO: new Date().toISOString(),
        helloTimestamp: pendingHello?.timestamp,
        latency: pendingHello ? timestamp - pendingHello.timestamp : null
    };

    debugInstrumentationState.handshakes.ackReceived.push(entry);

    if (pendingHello) {
        pendingHello.ackReceived = true;
        pendingHello.ackTimestamp = timestamp;
        debugInstrumentationState.handshakes.pendingHellos.delete(key);
    } else {
        // ACK without HELLO - suspicious
        debugInstrumentationState.validationResults.H1_noHandshake.confirmed = true;
        debugInstrumentationState.validationResults.H1_noHandshake.evidence.push({
            timestamp,
            type: 'ACK_WITHOUT_HELLO',
            from,
            to
        });
    }

    if (ENABLE_CONSOLE_OUTPUT) {
        console.log(`%c[Debug Instrumentation] DEBUG_ACK_RECEIVED: ${from} <- ${to}`,
            'color: #4CAF50');
        if (entry.latency) {
            console.log(`  Latency: ${entry.latency}ms`);
        }
    }

    return entry;
}

/**
 * Check for pending (unacknowledged) hellos
 */
function checkPendingHandshakes() {
    const pending = Array.from(debugInstrumentationState.handshakes.pendingHellos.entries());
    const now = Date.now();

    for (const [key, hello] of pending) {
        const age = now - hello.timestamp;
        if (age > 5000) {  // 5 seconds timeout
            debugInstrumentationState.validationResults.H1_noHandshake.confirmed = true;
            debugInstrumentationState.validationResults.H1_noHandshake.evidence.push({
                timestamp: now,
                type: 'HELLO_TIMEOUT',
                key,
                age,
                hello
            });
        }
    }

    return pending;
}

// ═══════════════════════════════════════════════════════════════════════════
// LISTENER TRACKING
// ═══════════════════════════════════════════════════════════════════════════

let listenerIdCounter = 0;

/**
 * Log listener registration
 * @param {string} eventName - Event being listened to
 * @param {string} componentName - Component registering listener
 * @returns {string} Listener ID
 */
function logListenerRegistered(eventName, componentName) {
    const listenerId = `${componentName}:${eventName}:${++listenerIdCounter}`;
    const timestamp = Date.now();

    // Get or create listener set for this event
    if (!debugInstrumentationState.listeners.registry.has(eventName)) {
        debugInstrumentationState.listeners.registry.set(eventName, new Set());
    }
    const eventListeners = debugInstrumentationState.listeners.registry.get(eventName);
    eventListeners.add(listenerId);

    const entry = {
        listenerId,
        eventName,
        componentName,
        timestamp,
        timestampISO: new Date().toISOString(),
        activeListenersCount: eventListeners.size
    };

    debugInstrumentationState.listeners.registrationLog.push(entry);

    // Check for duplicate listeners (H2 validation)
    const sameComponentListeners = Array.from(eventListeners)
        .filter(id => id.startsWith(componentName + ':' + eventName));

    if (sameComponentListeners.length > 1) {
        debugInstrumentationState.listeners.duplicates.push({
            eventName,
            componentName,
            count: sameComponentListeners.length,
            timestamp
        });

        debugInstrumentationState.validationResults.H2_noSingleSource.confirmed = true;
        debugInstrumentationState.validationResults.H2_noSingleSource.evidence.push({
            timestamp,
            type: 'DUPLICATE_LISTENER',
            eventName,
            componentName,
            count: sameComponentListeners.length
        });
    }

    if (ENABLE_CONSOLE_OUTPUT) {
        console.log(`%c[Debug Instrumentation] LISTENER_REGISTERED: ${eventName}`,
            'color: #9C27B0');
        console.log(`  Component: ${componentName}`);
        console.log(`  Active listeners for event: ${eventListeners.size}`);
    }

    return listenerId;
}

/**
 * Log listener unregistration
 * @param {string} listenerId - Listener being removed
 */
function logListenerUnregistered(listenerId) {
    const timestamp = Date.now();
    const parts = listenerId.split(':');
    const eventName = parts[1];

    const eventListeners = debugInstrumentationState.listeners.registry.get(eventName);
    if (eventListeners) {
        eventListeners.delete(listenerId);
    }

    const entry = {
        listenerId,
        timestamp,
        timestampISO: new Date().toISOString(),
        remainingListeners: eventListeners?.size || 0
    };

    debugInstrumentationState.listeners.unregistrationLog.push(entry);

    if (ENABLE_CONSOLE_OUTPUT) {
        console.log(`%c[Debug Instrumentation] LISTENER_UNREGISTERED: ${listenerId}`,
            'color: #607D8B');
    }

    return entry;
}

/**
 * Get active listener count for an event
 * @param {string} eventName - Event name
 * @returns {number} Active listener count
 */
function getActiveListenerCount(eventName) {
    const listeners = debugInstrumentationState.listeners.registry.get(eventName);
    return listeners?.size || 0;
}

/**
 * Get total active listener count
 * @returns {number} Total active listeners
 */
function getTotalActiveListenerCount() {
    let total = 0;
    for (const listeners of debugInstrumentationState.listeners.registry.values()) {
        total += listeners.size;
    }
    return total;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log message sent
 * @param {string} eventName - Event/message type
 * @param {*} payload - Message payload
 * @param {string} sender - Sending component
 */
function logMessageSent(eventName, payload, sender = 'unknown') {
    const timestamp = Date.now();
    const listenerCount = getActiveListenerCount(eventName);

    const entry = {
        eventName,
        payload: payload ? JSON.stringify(payload).substring(0, 200) : null,
        sender,
        timestamp,
        timestampISO: new Date().toISOString(),
        listenerCount
    };

    debugInstrumentationState.messages.sent.push(entry);

    // Check if message sent before any ACK received (H4)
    const anyAckReceived = debugInstrumentationState.handshakes.ackReceived.length > 0;
    if (!anyAckReceived && eventName !== 'DEBUG_HELLO' && eventName !== 'DEBUG_ACK') {
        debugInstrumentationState.messages.sentBeforeAck.push(entry);
        debugInstrumentationState.validationResults.H4_messageBeforeReady.confirmed = true;
        debugInstrumentationState.validationResults.H4_messageBeforeReady.evidence.push({
            timestamp,
            type: 'MESSAGE_BEFORE_ACK',
            eventName,
            sender
        });

        if (ENABLE_CONSOLE_OUTPUT) {
            console.warn(`%c[Debug Instrumentation] MESSAGE_BEFORE_ACK: ${eventName}`,
                'color: #f44336; font-weight: bold');
        }
    }

    // Check if message has no listeners (lost message)
    if (listenerCount === 0) {
        debugInstrumentationState.messages.lostMessages.push(entry);

        if (ENABLE_CONSOLE_OUTPUT) {
            console.warn(`%c[Debug Instrumentation] LOST_MESSAGE: ${eventName} (no listeners)`,
                'color: #FF9800');
        }
    }

    // Limit log size
    if (debugInstrumentationState.messages.sent.length > MAX_LOG_ENTRIES) {
        debugInstrumentationState.messages.sent.shift();
    }

    return entry;
}

/**
 * Log message received
 * @param {string} eventName - Event/message type
 * @param {string} receiver - Receiving component
 */
function logMessageReceived(eventName, receiver = 'unknown') {
    const timestamp = Date.now();

    const entry = {
        eventName,
        receiver,
        timestamp,
        timestampISO: new Date().toISOString()
    };

    debugInstrumentationState.messages.received.push(entry);

    // Limit log size
    if (debugInstrumentationState.messages.received.length > MAX_LOG_ENTRIES) {
        debugInstrumentationState.messages.received.shift();
    }

    return entry;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION STATE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log connection state change
 * @param {string} newState - New connection state
 * @param {string} owner - Component claiming ownership
 */
function logConnectionStateChange(newState, owner) {
    const timestamp = Date.now();

    const entry = {
        state: newState,
        owner,
        timestamp,
        timestampISO: new Date().toISOString(),
        previousOwner: debugInstrumentationState.currentConnectionOwner
    };

    // Check for multiple owners (H2)
    if (debugInstrumentationState.currentConnectionOwner &&
        debugInstrumentationState.currentConnectionOwner !== owner) {
        debugInstrumentationState.validationResults.H2_noSingleSource.confirmed = true;
        debugInstrumentationState.validationResults.H2_noSingleSource.evidence.push({
            timestamp,
            type: 'MULTIPLE_CONNECTION_OWNERS',
            newOwner: owner,
            previousOwner: debugInstrumentationState.currentConnectionOwner
        });

        if (ENABLE_CONSOLE_OUTPUT) {
            console.warn(`%c[Debug Instrumentation] MULTIPLE_CONNECTION_OWNERS`,
                'color: #f44336; font-weight: bold');
            console.warn(`  Previous: ${debugInstrumentationState.currentConnectionOwner}`);
            console.warn(`  New: ${owner}`);
        }
    }

    debugInstrumentationState.currentConnectionOwner = owner;
    debugInstrumentationState.connectionStates.push(entry);

    if (ENABLE_CONSOLE_OUTPUT) {
        console.log(`%c[Debug Instrumentation] CONNECTION_STATE: ${newState}`,
            'color: #3F51B5');
        console.log(`  Owner: ${owner}`);
    }

    return entry;
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get validation report
 * @returns {Object} Complete validation report
 */
function getDebugValidationReport() {
    const report = {
        version: INSTRUMENTATION_VERSION,
        generatedAt: new Date().toISOString(),

        summary: {
            componentsLoaded: debugInstrumentationState.loadOrder.length,
            hellosSent: debugInstrumentationState.handshakes.helloSent.length,
            acksReceived: debugInstrumentationState.handshakes.ackReceived.length,
            pendingHellos: debugInstrumentationState.handshakes.pendingHellos.size,
            totalListeners: getTotalActiveListenerCount(),
            duplicateListeners: debugInstrumentationState.listeners.duplicates.length,
            messagesSent: debugInstrumentationState.messages.sent.length,
            lostMessages: debugInstrumentationState.messages.lostMessages.length,
            messagesBeforeAck: debugInstrumentationState.messages.sentBeforeAck.length
        },

        loadOrder: debugInstrumentationState.loadOrder,

        hypotheses: {
            H1_noHandshake: {
                status: debugInstrumentationState.validationResults.H1_noHandshake.confirmed
                    ? 'CONFIRMED' : 'NOT_CONFIRMED',
                description: 'No mandatory handshake between components',
                pendingHellos: debugInstrumentationState.handshakes.pendingHellos.size,
                evidenceCount: debugInstrumentationState.validationResults.H1_noHandshake.evidence.length
            },
            H2_noSingleSource: {
                status: debugInstrumentationState.validationResults.H2_noSingleSource.confirmed
                    ? 'CONFIRMED' : 'NOT_CONFIRMED',
                description: 'No single source of truth for connection state',
                duplicateListeners: debugInstrumentationState.listeners.duplicates.length,
                evidenceCount: debugInstrumentationState.validationResults.H2_noSingleSource.evidence.length
            },
            H3_unpredictableLoad: {
                status: debugInstrumentationState.validationResults.H3_unpredictableLoad.confirmed
                    ? 'CONFIRMED' : 'NOT_CONFIRMED',
                description: 'Components load in unpredictable order',
                evidenceCount: debugInstrumentationState.validationResults.H3_unpredictableLoad.evidence.length
            },
            H4_messageBeforeReady: {
                status: debugInstrumentationState.validationResults.H4_messageBeforeReady.confirmed
                    ? 'CONFIRMED' : 'NOT_CONFIRMED',
                description: 'Messages are sent before listeners are ready',
                messagesBeforeAck: debugInstrumentationState.messages.sentBeforeAck.length,
                lostMessages: debugInstrumentationState.messages.lostMessages.length,
                evidenceCount: debugInstrumentationState.validationResults.H4_messageBeforeReady.evidence.length
            }
        },

        recentMessages: debugInstrumentationState.messages.sent.slice(-10),
        lostMessages: debugInstrumentationState.messages.lostMessages.slice(-10),
        duplicateListeners: debugInstrumentationState.listeners.duplicates
    };

    return report;
}

/**
 * Print validation report to console
 */
function printDebugValidationReport() {
    const report = getDebugValidationReport();

    console.log('%c╔═══════════════════════════════════════════════════════════════╗', 'color: #00BCD4');
    console.log('%c║         DEBUG SYSTEM INSTRUMENTATION REPORT                   ║', 'color: #00BCD4; font-weight: bold');
    console.log('%c╚═══════════════════════════════════════════════════════════════╝', 'color: #00BCD4');

    console.log('\n%c📊 SUMMARY', 'font-weight: bold');
    console.log(`  Components Loaded: ${report.summary.componentsLoaded}`);
    console.log(`  Hellos Sent: ${report.summary.hellosSent}`);
    console.log(`  ACKs Received: ${report.summary.acksReceived}`);
    console.log(`  Pending Hellos: ${report.summary.pendingHellos}`);
    console.log(`  Total Listeners: ${report.summary.totalListeners}`);
    console.log(`  Duplicate Listeners: ${report.summary.duplicateListeners}`);
    console.log(`  Messages Sent: ${report.summary.messagesSent}`);
    console.log(`  Lost Messages: ${report.summary.lostMessages}`);
    console.log(`  Messages Before ACK: ${report.summary.messagesBeforeAck}`);

    console.log('\n%c📦 LOAD ORDER', 'font-weight: bold');
    for (const entry of report.loadOrder) {
        console.log(`  #${entry.order}: ${entry.component} (${entry.stage})`);
    }

    console.log('\n%c🔬 HYPOTHESIS VALIDATION', 'font-weight: bold');
    for (const [key, h] of Object.entries(report.hypotheses)) {
        const icon = h.status === 'CONFIRMED' ? '✅' : '❌';
        const color = h.status === 'CONFIRMED' ? 'color: #f44336' : 'color: #4CAF50';
        console.log(`%c  ${icon} ${key}: ${h.status}`, color);
        console.log(`     ${h.description}`);
        console.log(`     Evidence count: ${h.evidenceCount}`);
    }

    if (report.lostMessages.length > 0) {
        console.log('\n%c⚠️ LOST MESSAGES', 'color: #FF9800; font-weight: bold');
        for (const msg of report.lostMessages) {
            console.log(`  ${msg.eventName} from ${msg.sender}`);
        }
    }

    if (report.duplicateListeners.length > 0) {
        console.log('\n%c⚠️ DUPLICATE LISTENERS', 'color: #f44336; font-weight: bold');
        for (const dup of report.duplicateListeners) {
            console.log(`  ${dup.eventName}: ${dup.componentName} (${dup.count}x)`);
        }
    }

    return report;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT TO WINDOW (for console access)
// ═══════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.DebugInstrumentation = {
        // Load order
        logComponentLoad,

        // Handshake
        logHelloSent: logHandshakeHelloSent,
        logAckReceived: logHandshakeAckReceived,
        checkPendingHandshakes,

        // Listeners
        logListenerRegistered,
        logListenerUnregistered,
        getActiveListenerCount,
        getTotalActiveListenerCount,

        // Messages
        logMessageSent,
        logMessageReceived,

        // Connection state
        logConnectionStateChange,

        // Reporting
        getReport: getDebugValidationReport,
        printReport: printDebugValidationReport,

        // State access
        getState: () => debugInstrumentationState,
        getLoadOrder: () => debugInstrumentationState.loadOrder,
        getLostMessages: () => debugInstrumentationState.messages.lostMessages,
        getDuplicates: () => debugInstrumentationState.listeners.duplicates,

        // Version
        VERSION: INSTRUMENTATION_VERSION
    };

    console.log('%c[Debug System Instrumentation] Loaded v' + INSTRUMENTATION_VERSION,
        'color: #00BCD4; font-weight: bold');
    console.log('  Usage: window.DebugInstrumentation.printReport()');
}

// ═══════════════════════════════════════════════════════════════════════════
// ES MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
    logComponentLoad,
    logHandshakeHelloSent,
    logHandshakeAckReceived,
    checkPendingHandshakes,
    logListenerRegistered,
    logListenerUnregistered,
    getActiveListenerCount,
    getTotalActiveListenerCount,
    logMessageSent,
    logMessageReceived,
    logConnectionStateChange,
    getDebugValidationReport,
    printDebugValidationReport,
    INSTRUMENTATION_VERSION
};
