# EventBus Documentation

## Overview

The EventBus is the central communication system for the Phase 5 layered architecture. All inter-layer communication goes through EventBus, creating full decoupling between layers.

---

## Basic Usage

### Subscribe to Event

```javascript
// Subscribe with handler
const unsubscribe = EventBus.subscribe('fieldCreated', (data) => {
    console.log('Field created:', data.field);
});

// Later, unsubscribe
unsubscribe();
```

### Emit Event

```javascript
EventBus.emit('fieldCreated', {
    field: { id: 'field_1', type: 'text', ... },
    source: 'flow'
});
```

### Subscribe Once

```javascript
// Handler will only be called once
EventBus.once('flowComplete', (data) => {
    console.log('Flow completed!');
});
```

---

## Event Types

All event types are defined in `EventTypes`:

### State Events

| Event | Payload | When |
|-------|---------|------|
| `stateChange` | `{ from, to, flowData }` | State transitions |
| `stateTransitionBlocked` | `{ from, to, reason }` | Blocked transition |
| `stateError` | `{ message }` | State error |

### Flow Events

| Event | Payload | When |
|-------|---------|------|
| `flowStart` | `{ type, step }` | Flow starts |
| `flowStepChange` | `{ from, to, pendingName? }` | Step changes |
| `flowComplete` | `{ type, result }` | Flow completes |
| `flowCancel` | `{ type }` | Flow cancelled |

### Field Events

| Event | Payload | When |
|-------|---------|------|
| `bboxDrawn` | `{ bbox, page }` | Rectangle drawn |
| `fieldCreated` | `{ field, flowType?, inFlow? }` | Field created |
| `fieldUpdated` | `{ fieldId, updates }` | Field updated |
| `fieldDeleted` | `{ fieldId }` | Field deleted |
| `fieldSelected` | `{ fieldId }` | Field selected |

### Name/Text Events

| Event | Payload | When |
|-------|---------|------|
| `nameCaptured` | `{ text, key, source, bbox }` | Name captured |
| `textSelected` | `{ text, targetFieldId, bbox }` | Text selected |

### Table Events

| Event | Payload | When |
|-------|---------|------|
| `tableRegionDefined` | `{ table, bbox }` | Table region set |
| `tableSampleRowSet` | `{ table, sampleRow }` | Sample row set |
| `tableColumnAdded` | `{ column, columnCount }` | Column added |
| `tableColumnNamed` | `{ column, name }` | Column named |
| `tableComplete` | `{ table }` | Table complete |

### Grouping Events

| Event | Payload | When |
|-------|---------|------|
| `groupSelectionStart` | `{}` | Grouping starts |
| `groupFieldToggled` | `{ fieldId, selected, selectedCount }` | Field toggled |
| `groupCreated` | `{ group, fieldCount }` | Group created |
| `groupNamed` | `{ group, name }` | Group named |
| `optionLabeled` | `{ option, label }` | Option labeled |

### Interaction Events

| Event | Payload | When |
|-------|---------|------|
| `drawingStart` | `{ x, y }` | Drawing starts |
| `drawingUpdate` | `{ x, y, width, height }` | Drawing updates |
| `drawingFinish` | `{ bbox }` | Drawing finished |
| `dragStart` | `{ fieldId, x, y }` | Drag starts |
| `dragFinish` | `{ fieldId, newPosition }` | Drag finished |
| `resizeStart` | `{ fieldId, handle }` | Resize starts |
| `resizeFinish` | `{ fieldId, newSize }` | Resize finished |

### UI Events

| Event | Payload | When |
|-------|---------|------|
| `uiBadgeUpdate` | `{ text }` | Badge should update |
| `uiStatusUpdate` | `{ text, type }` | Status should update |
| `uiCursorUpdate` | `{ cursor }` | Cursor should change |
| `escapePressed` | `{}` | ESC key pressed |

---

## Advanced Features

### Priority

Handlers with higher priority are called first:

```javascript
EventBus.subscribe('event', handler1, { priority: 0 });  // Called third
EventBus.subscribe('event', handler2, { priority: 10 }); // Called first
EventBus.subscribe('event', handler3, { priority: 5 });  // Called second
```

### Context Binding

Pass a context object:

```javascript
EventBus.subscribe('event', this.handleEvent, { context: this });
```

### Async Emit

Wait for all async handlers:

```javascript
const { handled, results } = await EventBus.emitAsync('event', data);
```

### Pause/Resume

Pause event emission (events will be queued):

```javascript
EventBus.pause();
// ... events are queued ...
EventBus.resume(); // Queued events are emitted
```

---

## Debugging

### Debug Mode

```javascript
EventBus.enableDebug();  // Log all events
EventBus.disableDebug(); // Stop logging
```

### Event Log

```javascript
// Get last 20 events
const log = EventBus.getLog(20);

// Print log to console
EventBus.printLog();
```

### Statistics

```javascript
const stats = EventBus.getStats();
// {
//   totalListeners: 15,
//   totalOnceListeners: 2,
//   eventsWithListeners: 8,
//   logSize: 45,
//   queuedEvents: 0,
//   isPaused: false,
//   debugMode: false
// }
```

---

## Best Practices

### 1. Always Unsubscribe

```javascript
// Store unsubscribe function
const unsubscribe = EventBus.subscribe('event', handler);

// Unsubscribe when done
unsubscribe();
```

### 2. Use EventTypes Constants

```javascript
// Good
EventBus.emit(EventTypes.FIELD_CREATED, data);

// Avoid
EventBus.emit('fieldCreated', data);
```

### 3. Include Necessary Data

```javascript
// Good: Include all relevant data
EventBus.emit(EventTypes.FIELD_CREATED, {
    field,
    flowType: sm.getFlowType(),
    page: currentPage,
    source: 'flow'
});

// Avoid: Missing context
EventBus.emit(EventTypes.FIELD_CREATED, { field });
```

### 4. Handle Errors

```javascript
EventBus.subscribe('event', (data) => {
    try {
        processData(data);
    } catch (error) {
        console.error('Handler error:', error);
    }
});
```

---

## Global Shortcuts

For convenience:

```javascript
// Subscribe
window.on('event', handler);

// Emit
window.emit('event', data);
```

---

## Integration with Controller

The Controller subscribes to events and routes them to Logic Layer:

```javascript
// In controller.js
EventBus.subscribe(EventTypes.NAME_CAPTURED, (data) => {
    if (!sm.is(MS.FLOW_CAPTURE_NAME)) return;
    MappingFlowLogic.continueFlow(data);
});

EventBus.subscribe(EventTypes.BBOX_DRAWN, (data) => {
    this._handleBboxDrawn(data);
});
```

This ensures:
1. Events are validated against current state
2. Logic is only called when appropriate
3. All routing is centralized
