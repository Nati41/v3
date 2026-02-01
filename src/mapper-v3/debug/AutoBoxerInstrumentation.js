/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTOBOXER INSTRUMENTATION - VALIDATION ONLY (NO FIXES)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Purpose: Validate hypotheses about AutoBoxer instability
 *
 * HYPOTHESES TO VALIDATE:
 * H1: AutoBoxer runs on non-stable / live state
 * H2: AutoBoxer is triggered from multiple sources
 * H3: AutoBoxer runs before layout/zoom/page are fully stabilized
 * H4: State mutates during execution (race conditions)
 *
 * IMPORTANT: This file is for INSTRUMENTATION ONLY.
 * DO NOT FIX anything until hypotheses are validated.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const INSTRUMENTATION_VERSION = '1.0.0';
const MAX_LOG_ENTRIES = 100;
const ENABLE_CONSOLE_OUTPUT = true;

// ═══════════════════════════════════════════════════════════════════════════
// STATE STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const instrumentationState = {
    runs: [],                    // All AutoBoxer run logs
    triggerSources: new Map(),   // Trigger source frequency
    stateMutations: [],          // Detected state mutations
    goodRuns: [],                // Runs that produced expected results
    badRuns: [],                 // Runs that produced unexpected results
    currentRun: null,            // Currently executing run
    runCounter: 0,               // Total run count

    // State snapshot at run start (for mutation detection)
    snapshotAtStart: null,

    // Validation results
    validationResults: {
        H1_liveStateAccess: { confirmed: false, evidence: [] },
        H2_multipleTriggers: { confirmed: false, evidence: [] },
        H3_unstableLayout: { confirmed: false, evidence: [] },
        H4_stateMutation: { confirmed: false, evidence: [] }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SNAPSHOT CAPTURE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Capture full state snapshot at AutoBoxer invocation
 * @returns {Object} Complete state snapshot
 */
function captureSnapshot() {
    const snapshot = {
        timestamp: Date.now(),
        timestampISO: new Date().toISOString(),

        // PDF Engine state
        pdf: {
            currentPage: null,
            pageCount: null,
            dimensions: null,
            documentLoaded: false
        },

        // DOM state
        dom: {
            pdfContainerImg: null,
            overlayLayer: null,
            drawingLayer: null
        },

        // View state
        view: {
            zoom: null,
            scrollTop: null,
            scrollLeft: null
        },

        // Canvas state
        canvas: {
            width: null,
            height: null,
            scale: null
        },

        // Field state
        fields: {
            count: 0,
            neighborCount: 0
        }
    };

    try {
        // Get pdfEngine if available
        const pdfEngine = window.pdfEngine ||
            (window.MapperV3 && window.MapperV3.pdfEngine);

        if (pdfEngine) {
            snapshot.pdf.currentPage = pdfEngine.currentPage;
            snapshot.pdf.pageCount = pdfEngine.pageCount;
            snapshot.pdf.dimensions = pdfEngine.pdfPageDimensions ?
                { ...pdfEngine.pdfPageDimensions } : null;
            snapshot.pdf.documentLoaded = !!pdfEngine.pdfDocument;
        }

        // Get DOM elements
        const pdfImg = document.querySelector('#pdf-container img');
        if (pdfImg) {
            snapshot.dom.pdfContainerImg = {
                exists: true,
                complete: pdfImg.complete,
                naturalWidth: pdfImg.naturalWidth,
                naturalHeight: pdfImg.naturalHeight,
                displayWidth: pdfImg.width,
                displayHeight: pdfImg.height,
                src: pdfImg.src ? pdfImg.src.substring(0, 50) + '...' : null
            };
        } else {
            snapshot.dom.pdfContainerImg = { exists: false };
        }

        const overlayLayer = document.getElementById('overlay-layer');
        if (overlayLayer) {
            const rect = overlayLayer.getBoundingClientRect();
            snapshot.dom.overlayLayer = {
                exists: true,
                offsetWidth: overlayLayer.offsetWidth,
                offsetHeight: overlayLayer.offsetHeight,
                clientRect: {
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    left: rect.left
                }
            };
        } else {
            snapshot.dom.overlayLayer = { exists: false };
        }

        const drawingLayer = document.getElementById('drawing-layer');
        if (drawingLayer) {
            snapshot.dom.drawingLayer = {
                exists: true,
                offsetWidth: drawingLayer.offsetWidth,
                offsetHeight: drawingLayer.offsetHeight
            };
        } else {
            snapshot.dom.drawingLayer = { exists: false };
        }

        // Get view state from StateManager
        const state = window.MapperV3 && window.MapperV3.state;
        if (state) {
            const viewState = state.get('view');
            if (viewState) {
                snapshot.view.zoom = viewState.zoom;
            }

            const fields = state.get('fields') || [];
            snapshot.fields.count = fields.length;
        }

        // Get scroll position
        const pdfContainer = document.getElementById('pdf-container');
        if (pdfContainer) {
            snapshot.view.scrollTop = pdfContainer.scrollTop;
            snapshot.view.scrollLeft = pdfContainer.scrollLeft;
        }

    } catch (error) {
        snapshot.captureError = error.message;
    }

    return snapshot;
}

/**
 * Compare two snapshots and detect differences
 * @param {Object} before - Snapshot before
 * @param {Object} after - Snapshot after
 * @returns {Object} Differences found
 */
function compareSnapshots(before, after) {
    const diffs = [];

    function compare(path, a, b) {
        if (typeof a !== typeof b) {
            diffs.push({ path, before: a, after: b, type: 'type_change' });
            return;
        }

        if (a === null || b === null) {
            if (a !== b) {
                diffs.push({ path, before: a, after: b, type: 'null_change' });
            }
            return;
        }

        if (typeof a === 'object') {
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const key of keys) {
                compare(`${path}.${key}`, a[key], b[key]);
            }
            return;
        }

        if (a !== b) {
            diffs.push({ path, before: a, after: b, type: 'value_change' });
        }
    }

    compare('snapshot', before, after);
    return diffs;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIGGER SOURCE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valid trigger sources
 */
const TriggerSource = {
    CLICK: 'click',
    MOUSEUP: 'mouseup',
    ZOOM: 'zoom',
    PAGE_CHANGE: 'page-change',
    MANUAL: 'manual',
    UNKNOWN: 'unknown'
};

/**
 * Detect trigger source from call stack
 * @returns {string} Detected trigger source
 */
function detectTriggerSource() {
    const stack = new Error().stack;

    if (stack.includes('_onMouseDown') || stack.includes('_autoBoxAndFinish')) {
        return TriggerSource.CLICK;
    }
    if (stack.includes('_onMouseUp')) {
        return TriggerSource.MOUSEUP;
    }
    if (stack.includes('handleZoom') || stack.includes('onZoomChange')) {
        return TriggerSource.ZOOM;
    }
    if (stack.includes('handlePageChange') || stack.includes('PDF_PAGE_CHANGED')) {
        return TriggerSource.PAGE_CHANGE;
    }
    if (stack.includes('console') || stack.includes('eval')) {
        return TriggerSource.MANUAL;
    }

    return TriggerSource.UNKNOWN;
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN LOGGING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log AutoBoxer run start
 * @param {Object} params - Run parameters
 * @returns {number} Run ID
 */
function logAutoBoxerRunStart(params = {}) {
    const runId = ++instrumentationState.runCounter;
    const trigger = params.trigger || detectTriggerSource();
    const snapshot = captureSnapshot();

    const runLog = {
        runId,
        trigger,
        startTime: Date.now(),
        startTimeISO: new Date().toISOString(),
        endTime: null,
        duration: null,

        // Input parameters
        input: {
            clickX: params.clickX,
            clickY: params.clickY,
            mode: params.mode,
            neighborFieldsCount: params.neighborFieldsCount
        },

        // Snapshot at start
        snapshotAtStart: snapshot,
        snapshotAtEnd: null,

        // Result
        result: null,
        success: null,
        error: null,

        // State mutation detection
        stateMutatedDuringRun: false,
        mutations: []
    };

    // Track trigger source frequency
    const triggerCount = instrumentationState.triggerSources.get(trigger) || 0;
    instrumentationState.triggerSources.set(trigger, triggerCount + 1);

    // Check H2: Multiple trigger sources
    if (instrumentationState.triggerSources.size > 1) {
        instrumentationState.validationResults.H2_multipleTriggers.confirmed = true;
        instrumentationState.validationResults.H2_multipleTriggers.evidence.push({
            runId,
            triggers: Array.from(instrumentationState.triggerSources.entries())
        });
    }

    // Store current run for mutation detection
    instrumentationState.currentRun = runLog;
    instrumentationState.snapshotAtStart = snapshot;

    // Add to runs list (limit size)
    instrumentationState.runs.push(runLog);
    if (instrumentationState.runs.length > MAX_LOG_ENTRIES) {
        instrumentationState.runs.shift();
    }

    if (ENABLE_CONSOLE_OUTPUT) {
        console.log(`%c[AutoBoxer Instrumentation] RUN #${runId} START`,
            'color: #2196F3; font-weight: bold');
        console.log('  Trigger:', trigger);
        console.log('  Click:', params.clickX, params.clickY);
        console.log('  Snapshot:', snapshot);
    }

    return runId;
}

/**
 * Log AutoBoxer run end
 * @param {number} runId - Run ID
 * @param {Object} result - Run result
 */
function logAutoBoxerRunEnd(runId, result) {
    const runLog = instrumentationState.runs.find(r => r.runId === runId);
    if (!runLog) {
        console.warn('[AutoBoxer Instrumentation] Run not found:', runId);
        return;
    }

    const endTime = Date.now();
    const snapshotAtEnd = captureSnapshot();

    runLog.endTime = endTime;
    runLog.duration = endTime - runLog.startTime;
    runLog.snapshotAtEnd = snapshotAtEnd;
    runLog.result = result;
    runLog.success = !!result;

    // Detect state mutations during run
    const mutations = compareSnapshots(runLog.snapshotAtStart, snapshotAtEnd);
    const significantMutations = mutations.filter(m =>
        !m.path.includes('timestamp') &&
        !m.path.includes('scrollTop') &&
        !m.path.includes('scrollLeft')
    );

    if (significantMutations.length > 0) {
        runLog.stateMutatedDuringRun = true;
        runLog.mutations = significantMutations;

        // H4: State mutation confirmed
        instrumentationState.validationResults.H4_stateMutation.confirmed = true;
        instrumentationState.validationResults.H4_stateMutation.evidence.push({
            runId,
            mutations: significantMutations
        });

        instrumentationState.stateMutations.push({
            runId,
            mutations: significantMutations,
            timestamp: endTime
        });

        if (ENABLE_CONSOLE_OUTPUT) {
            console.warn(`%c[AutoBoxer Instrumentation] STATE_MUTATED_DURING_AUTOBOXER`,
                'color: #f44336; font-weight: bold');
            console.warn('  Mutations:', significantMutations);
        }
    }

    // Classify as good or bad run
    if (result) {
        instrumentationState.goodRuns.push(runLog);
    } else {
        instrumentationState.badRuns.push(runLog);
    }

    // Clear current run
    instrumentationState.currentRun = null;
    instrumentationState.snapshotAtStart = null;

    if (ENABLE_CONSOLE_OUTPUT) {
        const color = result ? '#4CAF50' : '#f44336';
        console.log(`%c[AutoBoxer Instrumentation] RUN #${runId} END`,
            `color: ${color}; font-weight: bold`);
        console.log('  Duration:', runLog.duration, 'ms');
        console.log('  Success:', runLog.success);
        console.log('  Result:', result);
        if (runLog.stateMutatedDuringRun) {
            console.log('  Mutations:', significantMutations);
        }
    }
}

/**
 * Log AutoBoxer run error
 * @param {number} runId - Run ID
 * @param {Error} error - Error that occurred
 */
function logAutoBoxerRunError(runId, error) {
    const runLog = instrumentationState.runs.find(r => r.runId === runId);
    if (runLog) {
        runLog.endTime = Date.now();
        runLog.duration = runLog.endTime - runLog.startTime;
        runLog.success = false;
        runLog.error = {
            message: error.message,
            stack: error.stack
        };

        instrumentationState.badRuns.push(runLog);
    }

    if (ENABLE_CONSOLE_OUTPUT) {
        console.error(`%c[AutoBoxer Instrumentation] RUN #${runId} ERROR`,
            'color: #f44336; font-weight: bold');
        console.error('  Error:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HYPOTHESIS VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if layout is stable (H3 validation)
 * @param {Object} snapshot - State snapshot
 * @returns {Object} Stability check result
 */
function checkLayoutStability(snapshot) {
    const issues = [];

    // Check if PDF image is fully loaded
    if (!snapshot.dom.pdfContainerImg?.exists) {
        issues.push('PDF image element not found');
    } else if (!snapshot.dom.pdfContainerImg.complete) {
        issues.push('PDF image not fully loaded');
    }

    // Check if dimensions are valid
    if (!snapshot.dom.overlayLayer?.exists) {
        issues.push('Overlay layer not found');
    } else if (snapshot.dom.overlayLayer.offsetWidth === 0) {
        issues.push('Overlay layer has zero width');
    }

    // Check if page dimensions are available
    if (!snapshot.pdf.dimensions) {
        issues.push('PDF page dimensions not available');
    }

    // Check zoom is set
    if (!snapshot.view.zoom || snapshot.view.zoom <= 0) {
        issues.push('Invalid zoom value');
    }

    const isStable = issues.length === 0;

    if (!isStable) {
        instrumentationState.validationResults.H3_unstableLayout.confirmed = true;
        instrumentationState.validationResults.H3_unstableLayout.evidence.push({
            timestamp: Date.now(),
            issues,
            snapshot
        });
    }

    return { isStable, issues };
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get validation report
 * @returns {Object} Complete validation report
 */
function getValidationReport() {
    const report = {
        version: INSTRUMENTATION_VERSION,
        generatedAt: new Date().toISOString(),

        summary: {
            totalRuns: instrumentationState.runCounter,
            goodRuns: instrumentationState.goodRuns.length,
            badRuns: instrumentationState.badRuns.length,
            successRate: instrumentationState.runCounter > 0
                ? (instrumentationState.goodRuns.length / instrumentationState.runCounter * 100).toFixed(1) + '%'
                : 'N/A'
        },

        triggerSources: Object.fromEntries(instrumentationState.triggerSources),

        hypotheses: {
            H1_liveStateAccess: {
                status: instrumentationState.validationResults.H1_liveStateAccess.confirmed
                    ? 'CONFIRMED' : 'NOT_CONFIRMED',
                description: 'AutoBoxer runs on non-stable / live state',
                evidenceCount: instrumentationState.validationResults.H1_liveStateAccess.evidence.length
            },
            H2_multipleTriggers: {
                status: instrumentationState.validationResults.H2_multipleTriggers.confirmed
                    ? 'CONFIRMED' : 'NOT_CONFIRMED',
                description: 'AutoBoxer is triggered from multiple sources',
                triggers: Object.fromEntries(instrumentationState.triggerSources),
                evidenceCount: instrumentationState.validationResults.H2_multipleTriggers.evidence.length
            },
            H3_unstableLayout: {
                status: instrumentationState.validationResults.H3_unstableLayout.confirmed
                    ? 'CONFIRMED' : 'NOT_CONFIRMED',
                description: 'AutoBoxer runs before layout/zoom/page are fully stabilized',
                evidenceCount: instrumentationState.validationResults.H3_unstableLayout.evidence.length
            },
            H4_stateMutation: {
                status: instrumentationState.validationResults.H4_stateMutation.confirmed
                    ? 'CONFIRMED' : 'NOT_CONFIRMED',
                description: 'State mutates during execution (race conditions)',
                mutationCount: instrumentationState.stateMutations.length,
                evidenceCount: instrumentationState.validationResults.H4_stateMutation.evidence.length
            }
        },

        recentRuns: instrumentationState.runs.slice(-10),
        stateMutations: instrumentationState.stateMutations.slice(-10)
    };

    return report;
}

/**
 * Print validation report to console
 */
function printValidationReport() {
    const report = getValidationReport();

    console.log('%c╔═══════════════════════════════════════════════════════════════╗', 'color: #9C27B0');
    console.log('%c║         AUTOBOXER INSTRUMENTATION REPORT                      ║', 'color: #9C27B0; font-weight: bold');
    console.log('%c╚═══════════════════════════════════════════════════════════════╝', 'color: #9C27B0');

    console.log('\n%c📊 SUMMARY', 'font-weight: bold');
    console.log(`  Total Runs: ${report.summary.totalRuns}`);
    console.log(`  Good Runs: ${report.summary.goodRuns}`);
    console.log(`  Bad Runs: ${report.summary.badRuns}`);
    console.log(`  Success Rate: ${report.summary.successRate}`);

    console.log('\n%c🎯 TRIGGER SOURCES', 'font-weight: bold');
    for (const [source, count] of Object.entries(report.triggerSources)) {
        console.log(`  ${source}: ${count}`);
    }

    console.log('\n%c🔬 HYPOTHESIS VALIDATION', 'font-weight: bold');
    for (const [key, h] of Object.entries(report.hypotheses)) {
        const icon = h.status === 'CONFIRMED' ? '✅' : '❌';
        const color = h.status === 'CONFIRMED' ? 'color: #f44336' : 'color: #4CAF50';
        console.log(`%c  ${icon} ${key}: ${h.status}`, color);
        console.log(`     ${h.description}`);
        console.log(`     Evidence count: ${h.evidenceCount}`);
    }

    if (report.stateMutations.length > 0) {
        console.log('\n%c⚠️ STATE MUTATIONS DETECTED', 'color: #f44336; font-weight: bold');
        for (const mutation of report.stateMutations) {
            console.log(`  Run #${mutation.runId}:`, mutation.mutations);
        }
    }

    return report;
}

/**
 * Compare good vs bad runs
 */
function compareGoodVsBadRuns() {
    const good = instrumentationState.goodRuns.slice(-5);
    const bad = instrumentationState.badRuns.slice(-5);

    console.log('%c╔═══════════════════════════════════════════════════════════════╗', 'color: #FF9800');
    console.log('%c║              GOOD vs BAD RUNS COMPARISON                       ║', 'color: #FF9800; font-weight: bold');
    console.log('%c╚═══════════════════════════════════════════════════════════════╝', 'color: #FF9800');

    console.log('\n%c✅ GOOD RUNS (last 5)', 'color: #4CAF50; font-weight: bold');
    for (const run of good) {
        console.log(`  Run #${run.runId}:`);
        console.log(`    Trigger: ${run.trigger}`);
        console.log(`    Duration: ${run.duration}ms`);
        console.log(`    Page: ${run.snapshotAtStart.pdf.currentPage}`);
        console.log(`    Zoom: ${run.snapshotAtStart.view.zoom}`);
        console.log(`    ImgComplete: ${run.snapshotAtStart.dom.pdfContainerImg?.complete}`);
    }

    console.log('\n%c❌ BAD RUNS (last 5)', 'color: #f44336; font-weight: bold');
    for (const run of bad) {
        console.log(`  Run #${run.runId}:`);
        console.log(`    Trigger: ${run.trigger}`);
        console.log(`    Duration: ${run.duration}ms`);
        console.log(`    Page: ${run.snapshotAtStart.pdf.currentPage}`);
        console.log(`    Zoom: ${run.snapshotAtStart.view.zoom}`);
        console.log(`    ImgComplete: ${run.snapshotAtStart.dom.pdfContainerImg?.complete}`);
        if (run.error) {
            console.log(`    Error: ${run.error.message}`);
        }
        if (run.stateMutatedDuringRun) {
            console.log(`    Mutations:`, run.mutations);
        }
    }

    return { good, bad };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT TO WINDOW (for console access)
// ═══════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.AutoBoxerInstrumentation = {
        // Core functions
        logRunStart: logAutoBoxerRunStart,
        logRunEnd: logAutoBoxerRunEnd,
        logRunError: logAutoBoxerRunError,

        // Reporting
        getReport: getValidationReport,
        printReport: printValidationReport,
        compareRuns: compareGoodVsBadRuns,

        // State access
        getState: () => instrumentationState,
        getRuns: () => instrumentationState.runs,
        getGoodRuns: () => instrumentationState.goodRuns,
        getBadRuns: () => instrumentationState.badRuns,
        getMutations: () => instrumentationState.stateMutations,

        // Utilities
        captureSnapshot,
        checkLayoutStability,
        TriggerSource,

        // Version
        VERSION: INSTRUMENTATION_VERSION
    };

    console.log('%c[AutoBoxer Instrumentation] Loaded v' + INSTRUMENTATION_VERSION,
        'color: #9C27B0; font-weight: bold');
    console.log('  Usage: window.AutoBoxerInstrumentation.printReport()');
}

// ═══════════════════════════════════════════════════════════════════════════
// ES MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
    logAutoBoxerRunStart,
    logAutoBoxerRunEnd,
    logAutoBoxerRunError,
    getValidationReport,
    printValidationReport,
    compareGoodVsBadRuns,
    captureSnapshot,
    checkLayoutStability,
    TriggerSource,
    INSTRUMENTATION_VERSION
};
