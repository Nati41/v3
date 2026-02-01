/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INSTRUMENTATION LOADER - Easy setup for validation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * HOW TO USE:
 *
 * 1. In browser console, run:
 *    await import('/src/mapper-v3/debug/InstrumentationLoader.js')
 *
 * 2. Or add to mapper-v3.html:
 *    <script type="module" src="debug/InstrumentationLoader.js"></script>
 *
 * 3. After loading, use these commands:
 *
 *    // Enable AutoBoxer instrumentation
 *    window.AUTOBOXER_INSTRUMENTATION = true
 *
 *    // Enable debug mode (more verbose)
 *    window.AUTOBOXER_DEBUG = true
 *
 *    // After some clicks, get the report
 *    window.AutoBoxerInstrumentation.printReport()
 *
 *    // Compare good vs bad runs
 *    window.AutoBoxerInstrumentation.compareRuns()
 *
 *    // Debug system report
 *    window.DebugInstrumentation.printReport()
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-LOAD INSTRUMENTATION MODULES
// ═══════════════════════════════════════════════════════════════════════════

async function loadInstrumentation() {
    console.log('%c╔═══════════════════════════════════════════════════════════════╗', 'color: #9C27B0');
    console.log('%c║              INSTRUMENTATION LOADER                            ║', 'color: #9C27B0; font-weight: bold');
    console.log('%c╚═══════════════════════════════════════════════════════════════╝', 'color: #9C27B0');

    try {
        // Load AutoBoxer instrumentation
        await import('./AutoBoxerInstrumentation.js');
        console.log('%c✓ AutoBoxer Instrumentation loaded', 'color: #4CAF50');
    } catch (e) {
        console.error('✗ Failed to load AutoBoxer Instrumentation:', e);
    }

    try {
        // Load Debug system instrumentation
        await import('./DebugSystemInstrumentation.js');
        console.log('%c✓ Debug System Instrumentation loaded', 'color: #4CAF50');
    } catch (e) {
        console.error('✗ Failed to load Debug System Instrumentation:', e);
    }

    // Enable instrumentation by default
    window.AUTOBOXER_INSTRUMENTATION = true;

    console.log('\n%c📋 QUICK REFERENCE:', 'font-weight: bold');
    console.log(`
  // AutoBoxer
  window.AUTOBOXER_INSTRUMENTATION = true   // Enable instrumentation
  window.AUTOBOXER_DEBUG = true             // Enable verbose logging
  window.AutoBoxerInstrumentation.printReport()    // Show validation report
  window.AutoBoxerInstrumentation.compareRuns()    // Compare good vs bad
  window.AutoBoxerInstrumentation.getState()       // Get raw state

  // Debug System
  window.DebugInstrumentation.printReport()        // Show validation report
  window.DebugInstrumentation.getLoadOrder()       // Get component load order
  window.DebugInstrumentation.getLostMessages()    // Get lost messages

  // Combined Report
  window.printFullReport()                         // Print both reports
    `);

    // Add combined report function
    window.printFullReport = function() {
        console.log('\n');
        if (window.AutoBoxerInstrumentation) {
            window.AutoBoxerInstrumentation.printReport();
        }
        console.log('\n');
        if (window.DebugInstrumentation) {
            window.DebugInstrumentation.printReport();
        }
    };

    // Add hypothesis summary
    window.getHypothesisSummary = function() {
        const summary = {
            AutoBoxer: {},
            DebugSystem: {}
        };

        if (window.AutoBoxerInstrumentation) {
            const report = window.AutoBoxerInstrumentation.getReport();
            for (const [key, value] of Object.entries(report.hypotheses)) {
                summary.AutoBoxer[key] = value.status;
            }
        }

        if (window.DebugInstrumentation) {
            const report = window.DebugInstrumentation.getReport();
            for (const [key, value] of Object.entries(report.hypotheses)) {
                summary.DebugSystem[key] = value.status;
            }
        }

        console.log('%c╔═══════════════════════════════════════════════════════════════╗', 'color: #FF5722');
        console.log('%c║              HYPOTHESIS SUMMARY                                ║', 'color: #FF5722; font-weight: bold');
        console.log('%c╚═══════════════════════════════════════════════════════════════╝', 'color: #FF5722');

        console.log('\n%cAutoBoxer Hypotheses:', 'font-weight: bold');
        for (const [key, status] of Object.entries(summary.AutoBoxer)) {
            const icon = status === 'CONFIRMED' ? '🔴' : '🟢';
            console.log(`  ${icon} ${key}: ${status}`);
        }

        console.log('\n%cDebug System Hypotheses:', 'font-weight: bold');
        for (const [key, status] of Object.entries(summary.DebugSystem)) {
            const icon = status === 'CONFIRMED' ? '🔴' : '🟢';
            console.log(`  ${icon} ${key}: ${status}`);
        }

        return summary;
    };

    console.log('%c\n🔬 Instrumentation ready! Use printFullReport() to see results.', 'color: #4CAF50; font-weight: bold');
}

// Auto-load
loadInstrumentation();

export { loadInstrumentation };
