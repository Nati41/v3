# Phase 5 Architecture Documentation

## Overview

The mapper system uses a **Layered Architecture** that separates concerns into distinct layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                       USER INTERFACE                            │
│   (mapper.html, overlays, sidebar, toolbar, debug panel)        │
└────────────────────────────────────┬────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────┐
│                      INTERACTION LAYER                          │
│          (events.js, drag-engine.js, mouse/keyboard)            │
│                              │                                  │
│                        ┌─────▼─────┐                            │
│                        │ EventBus  │                            │
│                        └─────┬─────┘                            │
└────────────────────────────────────┬────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────┐
│                        CONTROLLER                               │
│              (Routes events, enforces rules)                    │
│                              │                                  │
│     ┌───────────────────────┼───────────────────────┐           │
│     │                       │                       │           │
│     ▼                       ▼                       ▼           │
│ ┌───────────┐         ┌───────────┐         ┌───────────┐       │
│ │   Logic   │         │  Logic    │         │   Logic   │       │
│ │  Modules  │         │  Modules  │         │  Modules  │       │
│ └───────────┘         └───────────┘         └───────────┘       │
└────────────────────────────────────┬────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────┐
│                        STATE LAYER                              │
│                    (StateMachine - SSOT)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layers

### Layer A: State Layer

**Location:** `src/mapper/main/state-machine.js`

**Responsibility:** Single Source of Truth for all state management.

**Key Components:**
- `MapperState` - Enum of all possible states
- `StateMachine` - Class managing state transitions
- `StateClusters` - Logical groupings of related states
- `StateConfig` - UI configuration for each state
- `TransitionRules` - Valid state transitions

**Helper APIs:**
```javascript
sm.is(state)           // Check if in specific state
sm.can(state)          // Check if transition is allowed
sm.require([states])   // Guard: must be in one of these states
sm.disallow([states])  // Guard: must NOT be in these states
sm.inCluster(name)     // Check if in a state cluster
sm.debug()             // Print detailed debug info
```

**State Clusters:**
| Cluster | States |
|---------|--------|
| FLOW | FLOW_CAPTURE_NAME, FLOW_CAPTURE_FIELD |
| TABLE | TABLE_REGION, TABLE_SAMPLE_ROW, TABLE_COLUMN_MAPPING, TABLE_COLUMN_NAMING |
| GROUPING | GROUPING_SELECT, GROUP_NAMING, OPTION_LABELING |
| CREATION | FIELD_CREATION, CHECKBOX_CREATION, RADIO_CREATION |
| INTERACTION | DRAWING, DRAGGING, RESIZING |
| BASE | IDLE, TEXT_SELECTION, PREVIEW |

---

### Layer B: Logic Layer

**Location:** `src/mapper/logic/`

**Responsibility:** Pure business logic without DOM manipulation.

**Modules:**

| Module | Responsibility |
|--------|----------------|
| `mapping-flow.js` | Unified mapping flow (name → field → loop) |
| `table-logic.js` | Table mapping flow |
| `grouping-logic.js` | Option grouping flow |
| `field-creation-logic.js` | Field creation modes |
| `text-selection-logic.js` | Text selection mode |

**Key Principles:**
- Contains ONLY logic
- Does NOT touch DOM
- Does NOT modify UI classes
- Communicates via StateMachine + EventBus

**Example API:**
```javascript
// MappingFlowLogic
MappingFlowLogic.startFlow('text')
MappingFlowLogic.continueFlow({ text, key, source })
MappingFlowLogic.completeFlow(field)
MappingFlowLogic.exitFlow()
MappingFlowLogic.validateFlow()
MappingFlowLogic.getFlowStatus()
```

---

### Layer C: UI Layer

**Location:** `src/mapper/main/` and `src/mapper/ui/`

**Responsibility:** DOM manipulation, overlays, visual updates.

**Components:**
- `overlay-engine.js` - Field overlays
- `sidebar-engine.js` - Sidebar panel
- `preview-engine.js` - Preview mode
- `debug-map.js` - Debug panel

**Key Principle:** UI components subscribe to events and update DOM accordingly.

---

### Layer D: Interaction Layer

**Location:** `src/mapper/main/events.js`, `drag-engine.js`

**Responsibility:** Handle user input, emit events.

**Responsibilities:**
- Capture mouse/keyboard events
- Query StateMachine for allowed actions
- Emit events via EventBus
- Never call logic directly

**Example:**
```javascript
// Instead of:
mapper._continueMappingFlow(text);

// Do:
EventBus.emit('nameCaptured', { text, page });
```

---

## Core Infrastructure

### EventBus

**Location:** `src/mapper/core/event-bus.js`

**Purpose:** Central event communication between layers.

**API:**
```javascript
EventBus.subscribe(eventName, handler, options)  // Subscribe
EventBus.once(eventName, handler)                // Subscribe once
EventBus.emit(eventName, payload)                // Emit event
EventBus.emitAsync(eventName, payload)           // Emit and wait
EventBus.unsubscribe(eventName, handler)         // Unsubscribe
EventBus.clear(eventName)                        // Clear listeners
EventBus.getStats()                              // Get statistics
EventBus.getLog(count)                           // Get event log
```

**Event Types:**
- State Events: `stateChange`, `stateTransitionBlocked`
- Flow Events: `flowStart`, `flowStepChange`, `flowComplete`, `flowCancel`
- Field Events: `fieldCreated`, `fieldUpdated`, `fieldDeleted`
- Interaction Events: `bboxDrawn`, `nameCaptured`, `textSelected`
- Table Events: `tableRegionDefined`, `tableColumnAdded`, `tableComplete`
- UI Events: `uiBadgeUpdate`, `uiStatusUpdate`

---

### Controller

**Location:** `src/mapper/core/controller.js`

**Purpose:** Central orchestration point.

**Responsibilities:**
1. Listen to EventBus events
2. Route events to Logic Layer
3. Enforce StateMachine rules
4. Prevent illegal states
5. Log transitions
6. Maintain integrity

**Example Routing:**
```javascript
EventBus.subscribe('nameCaptured', (data) => {
    if (!sm.is(MS.FLOW_CAPTURE_NAME)) return;
    MappingFlowLogic.continueFlow(data);
});

EventBus.subscribe('bboxDrawn', (data) => {
    // Route based on current state
    switch (sm.getState()) {
        case MS.FLOW_CAPTURE_NAME:
            extractTextAndContinueFlow(data.bbox);
            break;
        case MS.FLOW_CAPTURE_FIELD:
            createFieldFromFlow(data.bbox);
            break;
        // ...
    }
});
```

---

## Data Flow

### Example: Mapping Flow

```
1. User clicks "📝 Text" button
   ▼
2. UI emits: EventBus.emit('flowStart', { type: 'text' })
   ▼
3. Controller receives event, calls: MappingFlowLogic.startFlow('text')
   ▼
4. Logic validates and transitions: sm.setState(MS.FLOW_CAPTURE_NAME)
   ▼
5. StateMachine emits: 'stateChange'
   ▼
6. UI Layer updates: cursor, badge, status

7. User draws rectangle on text
   ▼
8. Interaction emits: EventBus.emit('bboxDrawn', { bbox })
   ▼
9. Controller routes to: extractTextAndContinueFlow(bbox)
   ▼
10. Text extracted, emits: EventBus.emit('nameCaptured', { text })
    ▼
11. Controller calls: MappingFlowLogic.continueFlow({ text })
    ▼
12. Logic stores name, transitions: sm.setState(MS.FLOW_CAPTURE_FIELD)
    ▼
13. User draws field rectangle
    ▼
14. Controller creates field, loops back to step 4
```

---

## File Structure

```
src/mapper/
├── core/
│   ├── event-bus.js       # EventBus
│   ├── controller.js      # Central Controller
│   └── mapper-core.js     # Core utilities
│
├── logic/
│   ├── mapping-flow.js    # Flow logic
│   ├── table-logic.js     # Table logic
│   ├── grouping-logic.js  # Grouping logic
│   ├── field-creation-logic.js
│   └── text-selection-logic.js
│
├── main/
│   ├── state-machine.js   # StateMachine (SSOT)
│   ├── mapper.js          # Main mapper class
│   ├── events.js          # Event handlers
│   ├── drag-engine.js     # Drag handling
│   └── ...engines         # Various engines
│
├── ui/
│   └── mapper-ui.js       # UI utilities
│
├── docs/
│   ├── architecture.md    # This file
│   ├── event-bus.md
│   ├── state-machine.md
│   └── debugging-guide.md
│
└── tests/
    └── regression/
        ├── test-flow-basic.js
        ├── test-state-machine.js
        ├── test-event-bus.js
        └── test-runner.js
```

---

## Best Practices

### 1. State Checks First

```javascript
// Always check state before action
if (!sm.require(['IDLE', 'FLOW_CAPTURE_NAME'])) {
    return { success: false, error: 'Invalid state' };
}
```

### 2. Use Events for Communication

```javascript
// Good: Emit event
EventBus.emit(EventTypes.FIELD_CREATED, { field });

// Avoid: Direct call across layers
mapper.addField(field);
```

### 3. Logic Layer is Pure

```javascript
// Good: Return result, let controller handle UI
return { success: true, field };

// Avoid: Touch DOM in logic
document.getElementById('status').textContent = 'Done';
```

### 4. Controller Routes Everything

```javascript
// Controller handles event routing
EventBus.subscribe('fieldCreated', (data) => {
    mapper.addField(data.field);
    mapper.renderField(data.field);
    mapper.updateFieldList();
});
```

---

## Testing

### Regression Tests

```javascript
// Run all tests
RegressionTests.runAll()

// Run specific suite
RegressionTests.runSuite('flow-basic')

// Quick validation
RegressionTests.quick()
```

### Debug Tools

```javascript
// StateMachine debug
sm.debug()

// EventBus stats
EventBus.getStats()
EventBus.printLog()

// DebugMap panel
DebugMap.showPanel()
```
