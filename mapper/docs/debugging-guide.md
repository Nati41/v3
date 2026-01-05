# Debugging Guide

## Quick Diagnostics

Open the browser console and run:

```javascript
// Full state report
window.DebugMap.printState();

// Validate current state
window.DebugMap.validate();

// Recent history
window.DebugMap.printHistory();

// Run all tests
window.StateTests.runAll();
window.NoLegacyTests.runAll();
```

---

## Common Issues

### 1. UI Freeze / Tool Stuck

**Symptom:**
The tool vibrates, freezes, or doesn't respond to clicks.

**Likely Causes:**
- State transition loop
- Double event firing
- State mismatch between UI and StateMachine

**Diagnosis:**
```javascript
// Check current state
window.DebugMap.printState();

// Look for rapid transitions
window.DebugMap.printHistory();

// Validate state
window.DebugMap.validate();
```

**Fix:**
```javascript
// Force reset to IDLE
window.mapper.stateMachine.reset(true);

// Clear any interaction state
window.mapper.interaction = { mode: 'idle', targetFieldId: null };
```

---

### 2. State Doesn't Change After Click

**Symptom:**
Clicking a mode button doesn't activate the mode.

**Likely Causes:**
- Another mode is active (blocking transition)
- Transition not allowed from current state
- Event handler not reaching StateMachine

**Diagnosis:**
```javascript
// Check what state we're in
console.log('Current:', window.mapper.stateMachine.getState());

// Check if transition is allowed
const MS = window.MapperState;
console.log('Can transition:',
    window.mapper.stateMachine.isTransitionAllowed(MS.FIELD_CREATION));
```

**Fix:**
```javascript
// Reset first, then enter mode
window.mapper.stateMachine.reset(true);
window.mapper.stateMachine.setState(window.MapperState.FIELD_CREATION);
```

---

### 3. Flow Doesn't Loop Back

**Symptom:**
After creating a field in flow mode, it doesn't return to name capture.

**Likely Causes:**
- `_completeMappingFlowField()` not called
- `_flowCompletionInProgress` guard stuck
- State transition failed

**Diagnosis:**
```javascript
// Check flow state
console.log('In flow:', window.mapper.stateMachine.isInFlow());
console.log('Flow type:', window.mapper.stateMachine.getFlowType());
console.log('Pending name:', window.mapper.stateMachine.getPendingName());

// Check guard
console.log('Completion guard:', window.mapper._flowCompletionInProgress);
```

**Fix:**
```javascript
// Reset guard
window.mapper._flowCompletionInProgress = false;

// Manually transition
window.mapper.stateMachine.setState(window.MapperState.FLOW_CAPTURE_NAME);
```

---

### 4. Field Created Without Name

**Symptom:**
Field is created but has "unnamed" label instead of selected text.

**Likely Causes:**
- `pendingName` not set before field creation
- Wrong flow step
- Name cleared too early

**Diagnosis:**
```javascript
// Check pending name
console.log('Pending:', window.mapper.stateMachine.getPendingName());

// Check state (should be FLOW_CAPTURE_FIELD)
console.log('State:', window.mapper.stateMachine.getState());
```

**Fix:**
Manually set the pending name before creating field:
```javascript
window.mapper.stateMachine.setPendingName({
    text: 'שם השדה',
    key: 'field_name',
    source: 'manual'
});
```

---

### 5. Table Mapping Stuck

**Symptom:**
Table mapping doesn't progress to next step.

**Likely Causes:**
- Wrong table step
- `currentTable` not set
- State transition failed

**Diagnosis:**
```javascript
// Check table state
console.log('In table flow:', window.mapper.stateMachine.isInTableFlow());
console.log('State:', window.mapper.stateMachine.getState());
console.log('Table step:', window.mapper.currentTableStep);
console.log('Current table:', window.mapper.currentTable);
```

**Fix:**
```javascript
// Reset table mode
window.mapper.deactivateTableMappingMode();

// Or force to specific step
const MS = window.MapperState;
window.mapper.stateMachine.setState(MS.TABLE_COLUMN_MAPPING);
window.mapper.currentTableStep = 'columns';
```

---

### 6. UI Doesn't Match State

**Symptom:**
Button shows active but mode isn't working, or vice versa.

**Likely Causes:**
- UI update missed
- Legacy code updating UI directly
- State changed without UI hook

**Diagnosis:**
```javascript
// Check StateMachine state
const state = window.mapper.stateMachine.getState();
console.log('SM State:', state);

// Check button state
const btn = document.getElementById('btn-field-mode');
console.log('Button active:', btn?.classList.contains('active'));

// Check layer class
const layer = document.getElementById('mapping-layer');
console.log('Layer classes:', layer?.className);
```

**Fix:**
```javascript
// Force UI sync by toggling state
window.mapper.stateMachine.reset(true);
// Then re-enter desired state
```

---

### 7. Escape Key Doesn't Work

**Symptom:**
Pressing ESC doesn't exit the current mode.

**Likely Causes:**
- Event not reaching handler
- State doesn't allow escape
- Another element has focus

**Diagnosis:**
```javascript
// Check if in a mode
console.log('Current state:', window.mapper.stateMachine.getState());

// Check if escape is allowed
console.log('Escape allowed:',
    window.mapper.stateMachine.isActionAllowed('escapePressed'));
```

**Fix:**
```javascript
// Force reset
window.mapper.stateMachine.reset(true);
window.mapper.exitMappingFlow?.();
```

---

### 8. Rapid Mode Switching Issues

**Symptom:**
Quickly switching modes causes unexpected behavior.

**Likely Causes:**
- Transitions happening within 10ms protection window
- Events queuing up
- Async operations not completing

**Diagnosis:**
```javascript
// Check history for rapid transitions
window.DebugMap.printHistory();

// Look for transitions < 10ms apart
```

**Fix:**
Wait for transitions to complete:
```javascript
// Add small delay between mode switches
await new Promise(r => setTimeout(r, 50));
window.mapper.stateMachine.setState(newState);
```

---

### 9. Validation Errors

**Symptom:**
`sm.validate()` returns errors.

**Common Errors:**

**"Invalid state value"**
- State is not in MapperState enum
- Fix: `sm.reset(true)`

**"Flow state without type"**
- In FLOW_CAPTURE_NAME/FIELD but no flowType set
- Fix: Exit flow and restart with type

**"Pending name without flow"**
- pendingName exists but not in flow state
- Fix: Clear pending name or enter flow

**Diagnosis:**
```javascript
const result = window.mapper.stateMachine.validate();
console.log('Valid:', result.valid);
console.log('Errors:', result.errors);
console.log('Warnings:', result.warnings);
```

---

### 10. Events Not Handled

**Symptom:**
Mouse/keyboard events don't trigger expected behavior.

**Likely Causes:**
- Event handler checking wrong state
- `handleEvent()` not routing correctly
- Event prevented by another handler

**Diagnosis:**
```javascript
// Check what handleEvent returns
const result = window.mapper.stateMachine.handleEvent('mousedown', {
    x: 100, y: 100, target: null, event: null
});
console.log('Event result:', result);
```

---

## Debug Commands Reference

### State Inspection

```javascript
// Current state
window.mapper.stateMachine.getState()

// Previous state
window.mapper.stateMachine.previousState

// Full history
window.mapper.stateMachine.getHistory()

// Flow data
window.mapper.stateMachine.flowData
```

### State Checks

```javascript
const sm = window.mapper.stateMachine;
const MS = window.MapperState;

sm.is(MS.IDLE)           // In specific state?
sm.isInFlow()            // In mapping flow?
sm.isInTableFlow()       // In table mapping?
sm.isInCreationMode()    // In creation mode?
sm.isInteracting()       // Drawing/dragging/resizing?
```

### State Modification

```javascript
const sm = window.mapper.stateMachine;
const MS = window.MapperState;

// Set state (validates transition)
sm.setState(MS.IDLE)

// Force state (bypass validation)
sm.setState(MS.IDLE, { force: true })

// Reset to IDLE
sm.reset(true)  // silent
sm.reset(false) // with log
```

### Flow Data

```javascript
const sm = window.mapper.stateMachine;

sm.getFlowType()        // 'text', 'checkbox', 'radio', 'table'
sm.getPendingName()     // { text, key, source }
sm.setPendingName(obj)
sm.clearPendingName()
```

### Validation

```javascript
const result = window.mapper.stateMachine.validate();
// {
//   valid: true/false,
//   errors: [],
//   warnings: [],
//   state: 'IDLE',
//   flowData: {...}
// }
```

---

## Test Suites

### State Machine Tests

```javascript
window.StateTests.runAll()
```

Tests:
- State transitions
- Flow data management
- Helper functions
- Rapid transition protection
- Validation

### No Legacy Tests

```javascript
window.NoLegacyTests.runAll()
```

Tests:
- StateMachine availability
- Single source of truth
- handleEvent routing
- State transition validity
- Escape resets state
- Flow data management
- Action validation
- No conflicting states

---

## Recovery Procedures

### Full Reset

```javascript
// Reset everything
const sm = window.mapper.stateMachine;
sm.reset(true);

// Clear runtime data
window.mapper.currentFieldForNaming = null;
window.mapper.currentTable = null;
window.mapper.currentTableStep = null;
window.mapper.selectedOptionsForGrouping = [];
window.mapper._flowCompletionInProgress = false;

// Reset interaction
window.mapper.interaction = { mode: 'idle', targetFieldId: null };

// Force UI update
window.mapper.updateAllOverlays?.();
```

### Restore to Known State

```javascript
// Step 1: Full reset
window.mapper.stateMachine.reset(true);

// Step 2: Clear all UI states
document.querySelectorAll('.active').forEach(el => {
    el.classList.remove('active');
});

// Step 3: Reset layer
const layer = document.getElementById('mapping-layer');
if (layer) {
    layer.className = 'mapping-layer';
    layer.style.cursor = '';
}

// Step 4: Clear badge
window.mapper.updateMappingBadge?.(null);

// Step 5: Reset status
window.mapper.setStatus?.('מוכן', 'success');
```

---

## Performance Issues

### Slow State Transitions

**Diagnosis:**
```javascript
// Time a transition
const start = performance.now();
window.mapper.stateMachine.setState(window.MapperState.IDLE);
console.log('Transition took:', performance.now() - start, 'ms');
```

**Expected:** < 5ms

### Memory Leaks

**Check history size:**
```javascript
console.log('History size:', window.mapper.stateMachine.getHistory().length);
// Should be capped at 50
```

**Check for event listeners:**
```javascript
// In DevTools, check Elements > Event Listeners
```
