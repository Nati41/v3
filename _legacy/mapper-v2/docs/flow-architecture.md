# Flow Architecture Documentation

## Overview

The Unified Mapping Flow is a two-step process for creating named fields:
1. **Capture Name** - Select text from PDF to use as field name
2. **Capture Field** - Draw rectangle to place the field

The flow loops automatically, allowing continuous field creation until the user exits.

---

## Flow Types

The flow supports four field types:

| Type | Icon | Description |
|------|------|-------------|
| `text` | 📝 | Standard text input field |
| `checkbox` | ☑️ | Checkbox field |
| `radio` | 🔘 | Radio button field |
| `table` | 📊 | Table structure |

---

## Flow Tree Diagram

```
                    ┌─────────────────────┐
                    │       IDLE          │
                    │   (Ready state)     │
                    └──────────┬──────────┘
                               │
                    startMappingFlow(type)
                               │
                               ▼
         ┌─────────────────────────────────────────────┐
         │           FLOW_CAPTURE_NAME                 │
         │                                             │
         │  • User draws rectangle on text             │
         │  • System extracts text from PDF            │
         │  • Pending name stored in StateMachine      │
         │                                             │
         │  Actions:                                   │
         │  - Draw rectangle → extract text            │
         │  - ESC → exit to IDLE                       │
         └──────────────────┬──────────────────────────┘
                            │
              Text captured successfully
              sm.setPendingName({ text, key, source })
                            │
                            ▼
         ┌─────────────────────────────────────────────┐
         │           FLOW_CAPTURE_FIELD                │
         │                                             │
         │  • User draws rectangle for field           │
         │  • Field created with pending name          │
         │  • Field type from flowType                 │
         │                                             │
         │  Actions:                                   │
         │  - Draw rectangle → create field            │
         │  - ESC → exit to IDLE                       │
         └──────────────────┬──────────────────────────┘
                            │
              Field created successfully
              _completeMappingFlowField()
                            │
                            ▼
         ┌─────────────────────────────────────────────┐
         │         Loop Decision                       │
         │                                             │
         │  • Clear pending name                       │
         │  • Return to FLOW_CAPTURE_NAME              │
         │  • Ready for next field                     │
         └──────────────────┬──────────────────────────┘
                            │
                            │ (loop back)
                            ▼
                    FLOW_CAPTURE_NAME
                    (repeat cycle)
```

---

## State Transitions

```
IDLE ──────────────► FLOW_CAPTURE_NAME
                           │
                           │ (text captured)
                           ▼
                     FLOW_CAPTURE_FIELD
                           │
                           │ (field created)
                           ▼
                     FLOW_CAPTURE_NAME ◄──┐
                           │              │
                           │ (loop)       │
                           └──────────────┘

At any point:
  ESC key → IDLE
  exitMappingFlow() → IDLE
```

---

## Function Call Map

### Entry Point

```
startMappingFlow(type)
    │
    ├── Validate: _isSafeToStartFlow()
    │       └── Check no other mode active
    │
    ├── Reset: sm.reset(true)
    │       └── Return to IDLE first
    │
    ├── Set State: sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type } })
    │
    ├── Update UI: _updateMappingFlowUI()
    │       ├── Update badge
    │       ├── Update status
    │       └── Show visual guide
    │
    └── Show Indicator: showMappingFlowIndicator('capture_name')
```

### Text Capture (Step 1)

```
finishSelectFieldNameMode()
    │
    ├── Check: sm.is(MS.FLOW_CAPTURE_NAME)
    │
    ├── Extract Text: extractTextInRegion()
    │       └── PDF.js text extraction
    │
    └── _continueMappingFlow(capturedText, sourceType)
            │
            ├── Store Name: sm.setPendingName({ text, key, source })
            │
            ├── Transition: sm.setState(MS.FLOW_CAPTURE_FIELD)
            │
            ├── Update UI: _updateMappingFlowUI()
            │
            └── Show Indicator: showMappingFlowIndicator('capture_field')
```

### Field Creation (Step 2)

```
createUnnamedField(x, y, width, height, options)
    │
    ├── Check: sm.is(MS.FLOW_CAPTURE_FIELD)
    │
    ├── Get Flow Type: sm.getFlowType()
    │
    ├── Apply Pending Name: sm.getPendingName()
    │
    ├── Create Field Object
    │
    └── _completeMappingFlowField(field)
            │
            ├── Guard: Check _flowCompletionInProgress
            │
            ├── Clear Name: sm.clearPendingName()
            │
            ├── Transition: sm.setState(MS.FLOW_CAPTURE_NAME)
            │       └── Loop back for next field
            │
            ├── Update UI: _updateMappingFlowUI()
            │
            └── Show Indicator: showMappingFlowIndicator('capture_name')
```

### Exit Flow

```
exitMappingFlow()
    │
    ├── Reset State: sm.reset(true)
    │
    ├── Clear Data: _resetFlowState()
    │       ├── sm.clearPendingName()
    │       └── Clear UI elements
    │
    ├── Remove Indicator: removeMappingFlowIndicator()
    │
    └── Update UI: _updateMappingFlowUI()
```

---

## Pseudo-Code

```javascript
// ============ START FLOW ============
function startMappingFlow(type) {
    // Safety check
    if (!_isSafeToStartFlow()) {
        showToast('Cannot start flow - another mode is active');
        return false;
    }

    // Reset any existing state
    sm.reset(true);

    // Enter flow with type
    if (!sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type } })) {
        showToast('Failed to start flow');
        return false;
    }

    // Update UI
    _updateMappingFlowUI();
    showMappingFlowIndicator('capture_name');

    return true;
}

// ============ CONTINUE FLOW (after text capture) ============
function _continueMappingFlow(text, source) {
    // Store the captured name
    sm.setPendingName({
        text: normalizeHebrewLabel(text),
        key: generateFieldKey(text),
        source: source
    });

    // Move to field capture step
    sm.setState(MS.FLOW_CAPTURE_FIELD);

    // Update UI
    _updateMappingFlowUI();
    showMappingFlowIndicator('capture_field');
}

// ============ COMPLETE FLOW FIELD ============
function _completeMappingFlowField(field) {
    // Guard against double calls
    if (_flowCompletionInProgress) return;
    _flowCompletionInProgress = true;

    try {
        // Apply pending name to field
        const pendingName = sm.getPendingName();
        if (pendingName) {
            field.labelHe = pendingName.text;
            field.labelEn = pendingName.key;
        }

        // Clear for next iteration
        sm.clearPendingName();

        // Loop back to name capture
        sm.setState(MS.FLOW_CAPTURE_NAME);

        // Update UI
        _updateMappingFlowUI();
        showMappingFlowIndicator('capture_name');

    } finally {
        _flowCompletionInProgress = false;
    }
}

// ============ EXIT FLOW ============
function exitMappingFlow() {
    // Reset everything
    sm.reset(true);
    _resetFlowState();

    // Clear UI
    removeMappingFlowIndicator();
    _updateMappingFlowUI();
}
```

---

## Flow Data Structure

The StateMachine maintains flow-specific data:

```javascript
flowData = {
    type: 'text' | 'checkbox' | 'radio' | 'table',
    pendingName: {
        text: 'שם השדה',      // Hebrew text
        key: 'field_name',    // English key
        source: 'pdf'         // 'pdf' | 'user' | 'ocr'
    }
}
```

### Accessing Flow Data

```javascript
// Get flow type
const type = sm.getFlowType();

// Get pending name
const name = sm.getPendingName();

// Set pending name
sm.setPendingName({ text, key, source });

// Clear pending name
sm.clearPendingName();

// Check if in flow
if (sm.isInFlow()) {
    // In FLOW_CAPTURE_NAME or FLOW_CAPTURE_FIELD
}
```

---

## UI Components

### Mapping Flow Indicator

A floating indicator showing current flow step:

```
┌────────────────────────────────────────┐
│  ESC ליציאה  │ 📝 Text │ 1/2 │ צייר... │
└────────────────────────────────────────┘
```

### Badge

Shows in the toolbar:
```
📝 בחר טקסט לשם שדה - Esc לביטול
📐 צייר שדה - Esc לביטול
```

### Visual Guide

Shows instruction overlay during each step.

---

## Error Handling

### Double-Trigger Protection

```javascript
// Guard in _completeMappingFlowField
if (_flowCompletionInProgress) return;
_flowCompletionInProgress = true;
try {
    // ... completion logic
} finally {
    _flowCompletionInProgress = false;
}
```

### Rapid Transition Protection

```javascript
// StateMachine blocks transitions within 10ms
if (Date.now() - _lastTransitionTime < 10) {
    return false;
}
```

### Safe Flow Start

```javascript
function _isSafeToStartFlow() {
    const sm = this.stateMachine;
    const MS = MapperStateEnum;

    // Cannot start if in another mode
    if (sm.isInCreationMode()) return false;
    if (sm.isInTableFlow()) return false;
    if (sm.isInteracting()) return false;

    return true;
}
```

---

## Common Issues

### Issue: Flow doesn't start

**Check:**
- Is another mode active? (`sm.isInCreationMode()`)
- Is table mode active? (`sm.isInTableFlow()`)
- Is user interacting? (`sm.isInteracting()`)

**Fix:**
```javascript
sm.reset(true);
startMappingFlow('text');
```

### Issue: Field not created with name

**Check:**
- Is pending name set? (`sm.getPendingName()`)
- Is flow in correct step? (`sm.is(MS.FLOW_CAPTURE_FIELD)`)

**Fix:**
```javascript
const name = sm.getPendingName();
if (!name) {
    console.error('No pending name!');
}
```

### Issue: Flow stuck after field creation

**Check:**
- Was `_completeMappingFlowField` called?
- Check `_flowCompletionInProgress` guard

**Fix:**
```javascript
_flowCompletionInProgress = false;
sm.setState(MS.FLOW_CAPTURE_NAME);
```
