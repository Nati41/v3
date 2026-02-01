# AutoBoxer & Debug System Instrumentation

## Purpose

This instrumentation system is designed to **VALIDATE HYPOTHESES** about system instability.

**GOLDEN RULE: DO NOT FIX before VALIDATION**

First: instrument + validate.
Only then: fix.

---

## Quick Start

### 1. Enable Instrumentation

Open the mapper tool and run in browser console:

```javascript
// Load instrumentation
await import('/src/mapper-v3/debug/InstrumentationLoader.js')

// Instrumentation is now active!
```

### 2. Use The Tool Normally

Click on PDF to create fields, navigate pages, etc.
The instrumentation will track everything in the background.

### 3. View Reports

```javascript
// Full combined report
window.printFullReport()

// Hypothesis summary (quick view)
window.getHypothesisSummary()

// AutoBoxer only
window.AutoBoxerInstrumentation.printReport()

// Debug System only
window.DebugInstrumentation.printReport()

// Compare good vs bad AutoBoxer runs
window.AutoBoxerInstrumentation.compareRuns()
```

---

## Hypotheses Being Validated

### AutoBoxer Instability

| Hypothesis | Description | How It's Detected |
|------------|-------------|-------------------|
| **H1** | AutoBoxer runs on non-stable / live state | Snapshot comparison shows DOM not ready |
| **H2** | AutoBoxer is triggered from multiple sources | Trigger source varies between runs |
| **H3** | AutoBoxer runs before layout/zoom/page are fully stabilized | Layout stability check fails |
| **H4** | State mutates during execution (race conditions) | Snapshot before != snapshot after |

### Debug System Instability

| Hypothesis | Description | How It's Detected |
|------------|-------------|-------------------|
| **H1** | No mandatory handshake between components | HELLO sent without ACK received |
| **H2** | No single source of truth | Multiple owners for connection state |
| **H3** | Components load in unpredictable order | Load order differs from expected |
| **H4** | Messages sent before listeners are ready | Messages have 0 listeners |

---

## Detailed API

### AutoBoxer Instrumentation

```javascript
// Get full report object
const report = window.AutoBoxerInstrumentation.getReport()

// Access raw state
const state = window.AutoBoxerInstrumentation.getState()

// Get all runs
const runs = window.AutoBoxerInstrumentation.getRuns()

// Get only good runs
const goodRuns = window.AutoBoxerInstrumentation.getGoodRuns()

// Get only bad runs
const badRuns = window.AutoBoxerInstrumentation.getBadRuns()

// Get detected state mutations
const mutations = window.AutoBoxerInstrumentation.getMutations()

// Capture current snapshot manually
const snapshot = window.AutoBoxerInstrumentation.captureSnapshot()

// Check layout stability
const stability = window.AutoBoxerInstrumentation.checkLayoutStability(snapshot)
```

### Debug System Instrumentation

```javascript
// Get full report object
const report = window.DebugInstrumentation.getReport()

// Get component load order
const loadOrder = window.DebugInstrumentation.getLoadOrder()

// Get lost messages (sent with no listeners)
const lost = window.DebugInstrumentation.getLostMessages()

// Get duplicate listener registrations
const dupes = window.DebugInstrumentation.getDuplicates()

// Manual tracking (for custom components)
window.DebugInstrumentation.logComponentLoad('MyComponent', 'loaded')
window.DebugInstrumentation.logHelloSent('ComponentA', 'ComponentB')
window.DebugInstrumentation.logAckReceived('ComponentA', 'ComponentB')
```

---

## Interpreting Results

### Report Status

- **CONFIRMED** = Hypothesis is TRUE (bug found!)
- **NOT_CONFIRMED** = Hypothesis is FALSE (not the issue)

### What To Do When Hypothesis Is CONFIRMED

1. **Document the evidence** - Save the report output
2. **Identify the root cause** - Look at the evidence array
3. **Plan the fix** - Follow the rules in the original instruction
4. **Implement the fix** - Only after validation is complete

---

## Files

| File | Purpose |
|------|---------|
| `AutoBoxerInstrumentation.js` | Tracks AutoBoxer runs, snapshots, mutations |
| `DebugSystemInstrumentation.js` | Tracks component load order, messages, listeners |
| `InstrumentationLoader.js` | Easy loader + console utilities |
| `README.md` | This documentation |

---

## Enabling More Verbose Logging

```javascript
// AutoBoxer verbose mode (logs every pixel scan, wall detection, etc.)
window.AUTOBOXER_DEBUG = true

// BboxRefiner verbose mode
window.BBOXREFINER_DEBUG = true

// EventBus verbose mode (logs every event)
window.eventBus.debugMode = true
```

---

## Example Session

```javascript
// 1. Load instrumentation
await import('/src/mapper-v3/debug/InstrumentationLoader.js')

// 2. Do some operations...
// (click on PDF, create fields, change pages, etc.)

// 3. Check results
window.getHypothesisSummary()

// Output:
// AutoBoxer Hypotheses:
//   🟢 H1_liveStateAccess: NOT_CONFIRMED
//   🔴 H2_multipleTriggers: CONFIRMED         <-- Bug found!
//   🟢 H3_unstableLayout: NOT_CONFIRMED
//   🟢 H4_stateMutation: NOT_CONFIRMED
//
// Debug System Hypotheses:
//   🔴 H1_noHandshake: CONFIRMED              <-- Bug found!
//   🟢 H2_noSingleSource: NOT_CONFIRMED
//   🟢 H3_unpredictableLoad: NOT_CONFIRMED
//   🔴 H4_messageBeforeReady: CONFIRMED       <-- Bug found!

// 4. Get detailed evidence
const report = window.AutoBoxerInstrumentation.getReport()
console.log(report.hypotheses.H2_multipleTriggers.evidence)
```

---

## Next Steps After Validation

Once hypotheses are confirmed, apply fixes according to the rules:

### AutoBoxer Rules (if hypotheses confirmed)

- **Rule A1**: AutoBoxer receives immutable snapshot only
- **Rule A2**: Hard mode guard (only ADVANCED_MAPPING)
- **Rule A3**: Single trigger (AUTOBOXER_RUN_REQUESTED event)
- **Rule A4**: Cancel on state change

### Debug System Rules (if hypotheses confirmed)

- **Rule B1**: Mandatory handshake (HELLO → ACK)
- **Rule B2**: Debug is a system mode
- **Rule B3**: Single source of truth for connection state
