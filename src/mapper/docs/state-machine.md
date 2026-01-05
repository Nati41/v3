# StateMachine Documentation

## Overview

The StateMachine is the **Single Source of Truth** for all mapper state management.
All mode flags have been removed and replaced with centralized state management.

**File:** `src/mapper/main/state-machine.js`
**Version:** 2.0.0 (Phase 5 Enhanced)

---

## Phase 5 Enhancements

### State Clusters

States are now grouped into logical clusters:

```javascript
export const StateClusters = Object.freeze({
    FLOW: ['FLOW_CAPTURE_NAME', 'FLOW_CAPTURE_FIELD'],
    TABLE: ['TABLE_REGION', 'TABLE_SAMPLE_ROW', 'TABLE_COLUMN_MAPPING', 'TABLE_COLUMN_NAMING'],
    GROUPING: ['GROUPING_SELECT', 'GROUP_NAMING', 'OPTION_LABELING'],
    CREATION: ['FIELD_CREATION', 'CHECKBOX_CREATION', 'RADIO_CREATION'],
    INTERACTION: ['DRAWING', 'DRAGGING', 'RESIZING'],
    BASE: ['IDLE', 'TEXT_SELECTION', 'PREVIEW']
});
```

### New Helper APIs

| Method | Usage | Description |
|--------|-------|-------------|
| `sm.can(state)` | `sm.can('IDLE')` | Check if transition is allowed |
| `sm.require([states])` | `sm.require(['IDLE', 'FLOW_CAPTURE_NAME'])` | Guard: must be in one of these states |
| `sm.disallow([states])` | `sm.disallow(['DRAWING', 'DRAGGING'])` | Guard: must NOT be in these states |
| `sm.inCluster(name)` | `sm.inCluster('FLOW')` | Check if in a state cluster |
| `sm.debug()` | `sm.debug()` | Print detailed debug info |

### Examples

```javascript
// Check if can transition
if (sm.can('FIELD_CREATION')) {
    sm.setState(MS.FIELD_CREATION);
}

// Guard action with require
if (sm.require(['IDLE', 'FLOW_CAPTURE_NAME'])) {
    // Action is allowed
}

// Guard action with disallow
if (sm.disallow(['DRAWING', 'DRAGGING', 'RESIZING'])) {
    // Not in any interaction state
}

// Check cluster
if (sm.inCluster('FLOW')) {
    // In mapping flow
}

// Debug current state
sm.debug();
```

---

## State Enum (MapperState)

All possible states are defined in the `MapperState` enum:

```javascript
export const MapperState = Object.freeze({
    IDLE: 'IDLE',
    FLOW_CAPTURE_NAME: 'FLOW_CAPTURE_NAME',
    FLOW_CAPTURE_FIELD: 'FLOW_CAPTURE_FIELD',
    FIELD_CREATION: 'FIELD_CREATION',
    CHECKBOX_CREATION: 'CHECKBOX_CREATION',
    RADIO_CREATION: 'RADIO_CREATION',
    GROUPING_SELECT: 'GROUPING_SELECT',
    GROUP_NAMING: 'GROUP_NAMING',
    OPTION_LABELING: 'OPTION_LABELING',
    TEXT_SELECTION: 'TEXT_SELECTION',
    TABLE_REGION: 'TABLE_REGION',
    TABLE_SAMPLE_ROW: 'TABLE_SAMPLE_ROW',
    TABLE_COLUMN_MAPPING: 'TABLE_COLUMN_MAPPING',
    TABLE_COLUMN_NAMING: 'TABLE_COLUMN_NAMING',
    DRAWING: 'DRAWING',
    DRAGGING: 'DRAGGING',
    RESIZING: 'RESIZING',
    PREVIEW: 'PREVIEW'
});
```

---

## State Details

### MS.IDLE

**Description:**
Base state - no active operation. The system is ready for user input.

**Cursor:** `default`
**Layer Class:** (none)
**Status:** "מוכן" (Ready)

**Allowed Actions:**
- `startMappingFlow` - Begin unified mapping flow
- `toggleFieldCreation` - Enter field creation mode
- `toggleCheckboxMode` - Enter checkbox creation mode
- `toggleRadioMode` - Enter radio creation mode
- `toggleGroupingMode` - Enter grouping mode
- `toggleTextSelectionMode` - Enter text selection mode
- `toggleTableMappingMode` - Enter table mapping mode
- `togglePreviewMode` - Enter preview mode
- `selectField` - Select an existing field
- `dragField` - Start dragging a field
- `resizeField` - Start resizing a field

**Allowed Transitions:**
- `FLOW_CAPTURE_NAME`
- `FIELD_CREATION`
- `CHECKBOX_CREATION`
- `RADIO_CREATION`
- `GROUPING_SELECT`
- `TEXT_SELECTION`
- `TABLE_REGION`
- `DRAWING`
- `DRAGGING`
- `RESIZING`
- `PREVIEW`

**Forbidden Transitions:**
- `FLOW_CAPTURE_FIELD` (must go through FLOW_CAPTURE_NAME first)
- `TABLE_SAMPLE_ROW` (must go through TABLE_REGION first)
- `TABLE_COLUMN_MAPPING` (must go through TABLE_SAMPLE_ROW first)
- `GROUP_NAMING` (must go through GROUPING_SELECT first)
- `OPTION_LABELING` (must go through GROUP_NAMING first)

---

### MS.FLOW_CAPTURE_NAME

**Description:**
Step 1 of unified mapping flow - user draws a rectangle to capture text for field name.

**Cursor:** `text`
**Layer Class:** `flow-capture-name-mode`
**Status:** "בחר טקסט - צייר מלבן על טקסט לבחירת שם"

**Entry Hooks:**
- Sets `flowType` in flowData (text/checkbox/radio/table)
- Updates UI badge
- Shows visual guide

**Exit Hooks:**
- Clears pending name if cancelled
- Resets UI

**Allowed Actions:**
- `startDrawing` - Begin drawing rectangle
- `escapePressed` - Cancel and return to IDLE
- `captureText` - Process captured text

**Allowed Transitions:**
- `FLOW_CAPTURE_FIELD` (after text captured)
- `DRAWING` (while drawing)
- `IDLE` (escape/cancel)

**Forbidden Transitions:**
- `FIELD_CREATION`
- `CHECKBOX_CREATION`
- `RADIO_CREATION`
- `TABLE_REGION`
- `GROUPING_SELECT`

**Code Example:**
```javascript
// Start flow
sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });

// Check state
if (sm.is(MS.FLOW_CAPTURE_NAME)) {
    // Handle text capture
}

// Get flow type
const type = sm.getFlowType(); // 'text', 'checkbox', 'radio', 'table'
```

---

### MS.FLOW_CAPTURE_FIELD

**Description:**
Step 2 of unified mapping flow - user draws a rectangle to place the field.

**Cursor:** `crosshair`
**Layer Class:** `flow-capture-field-mode`
**Status:** "צייר שדה - גרור מלבן למיקום השדה"

**Entry Hooks:**
- Preserves pending name from previous step
- Updates UI indicator

**Exit Hooks:**
- Creates field with pending name
- Can loop back to FLOW_CAPTURE_NAME for next field

**Allowed Actions:**
- `startDrawing` - Begin drawing rectangle
- `escapePressed` - Cancel and return to IDLE
- `finishDrawing` - Complete field creation

**Allowed Transitions:**
- `FLOW_CAPTURE_NAME` (loop back for next field)
- `DRAWING` (while drawing)
- `IDLE` (escape/cancel)

**Forbidden Transitions:**
- `FIELD_CREATION`
- `TABLE_REGION`
- `GROUPING_SELECT`

**Code Example:**
```javascript
// After text captured, move to field capture
sm.setState(MS.FLOW_CAPTURE_FIELD);

// Get pending name
const name = sm.getPendingName();
// { text: 'שם השדה', key: 'field_name', source: 'pdf' }
```

---

### MS.FIELD_CREATION

**Description:**
Direct field creation mode - draw rectangles to create unnamed text fields.

**Cursor:** `crosshair`
**Layer Class:** `field-creation-mode`
**Status:** "מצב יצירת שדות - צייר מלבנים"

**Allowed Actions:**
- `startDrawing` - Begin drawing
- `escapePressed` - Exit mode

**Allowed Transitions:**
- `DRAWING`
- `IDLE`

**Forbidden Transitions:**
- `FLOW_CAPTURE_NAME`
- `CHECKBOX_CREATION`
- `RADIO_CREATION`

**Code Example:**
```javascript
// Toggle field creation
if (sm.is(MS.FIELD_CREATION)) {
    sm.reset(true); // Exit to IDLE
} else {
    sm.setState(MS.FIELD_CREATION);
}
```

---

### MS.CHECKBOX_CREATION

**Description:**
Click to place checkbox fields.

**Cursor:** `cell`
**Layer Class:** `checkbox-creation-mode`
**Status:** "מצב Checkbox - לחץ ליצירה"

**Allowed Actions:**
- `createOneClickField` - Place checkbox at click location
- `escapePressed` - Exit mode

**Allowed Transitions:**
- `IDLE`

**Forbidden Transitions:**
- `FIELD_CREATION`
- `RADIO_CREATION`
- `FLOW_CAPTURE_NAME`

---

### MS.RADIO_CREATION

**Description:**
Click to place radio button fields.

**Cursor:** `cell`
**Layer Class:** `radio-creation-mode`
**Status:** "מצב Radio - לחץ ליצירה"

**Allowed Actions:**
- `createOneClickField` - Place radio at click location
- `escapePressed` - Exit mode

**Allowed Transitions:**
- `IDLE`

**Forbidden Transitions:**
- `FIELD_CREATION`
- `CHECKBOX_CREATION`
- `FLOW_CAPTURE_NAME`

---

### MS.GROUPING_SELECT

**Description:**
Select multiple fields to create a radio/checkbox group.

**Cursor:** `pointer`
**Layer Class:** `grouping-mode`
**Status:** "מצב קיבוץ - בחר שדות"

**Allowed Actions:**
- `selectField` - Add/remove field from selection
- `confirmGroup` - Create group from selection
- `escapePressed` - Cancel

**Allowed Transitions:**
- `GROUP_NAMING`
- `IDLE`

**Forbidden Transitions:**
- `FIELD_CREATION`
- `FLOW_CAPTURE_NAME`
- `TABLE_REGION`

---

### MS.GROUP_NAMING

**Description:**
Select text to name an option group.

**Cursor:** `text`
**Layer Class:** `group-naming-mode`
**Status:** "מצב מתן שם לקבוצה"

**Allowed Actions:**
- `startDrawing` - Draw rectangle for text selection
- `escapePressed` - Cancel

**Allowed Transitions:**
- `OPTION_LABELING`
- `GROUPING_SELECT`
- `DRAWING`
- `IDLE`

---

### MS.OPTION_LABELING

**Description:**
Select text to label individual options in a group.

**Cursor:** `text`
**Layer Class:** `option-labeling-mode`
**Status:** "מצב תיוג אפשרות"

**Allowed Actions:**
- `startDrawing` - Draw rectangle for text selection
- `escapePressed` - Cancel

**Allowed Transitions:**
- `GROUP_NAMING`
- `DRAWING`
- `IDLE`

---

### MS.TEXT_SELECTION

**Description:**
Select text from PDF to name an existing field.

**Cursor:** `text`
**Layer Class:** `text-selection-mode`
**Status:** "בחר טקסט לשדה"

**Allowed Actions:**
- `startDrawing` - Draw rectangle for text selection
- `escapePressed` - Cancel

**Allowed Transitions:**
- `DRAWING`
- `IDLE`

**Code Example:**
```javascript
// Activate for a specific field
sm.setState(MS.TEXT_SELECTION);
mapper.currentFieldForNaming = targetField;
```

---

### MS.TABLE_REGION

**Description:**
Step 1 of table mapping - select the table region.

**Cursor:** `crosshair`
**Layer Class:** `table-region-mode`
**Status:** "שלב 1: סמן את אזור הטבלה"

**Allowed Actions:**
- `startDrawing` - Draw rectangle for table region
- `escapePressed` - Cancel

**Allowed Transitions:**
- `TABLE_SAMPLE_ROW`
- `DRAWING`
- `IDLE`

---

### MS.TABLE_SAMPLE_ROW

**Description:**
Step 2 of table mapping - select a sample row.

**Cursor:** `crosshair`
**Layer Class:** `table-sample-row-mode`
**Status:** "שלב 2: סמן שורה לדוגמה"

**Allowed Transitions:**
- `TABLE_COLUMN_MAPPING`
- `DRAWING`
- `IDLE`

---

### MS.TABLE_COLUMN_MAPPING

**Description:**
Step 3 of table mapping - define columns.

**Cursor:** `col-resize`
**Layer Class:** `table-column-mode`
**Status:** "שלב 3: הגדר עמודות"

**Allowed Transitions:**
- `TABLE_COLUMN_NAMING`
- `IDLE`

---

### MS.TABLE_COLUMN_NAMING

**Description:**
Step 4 of table mapping - name columns.

**Cursor:** `text`
**Layer Class:** `table-column-naming-mode`
**Status:** "שלב 4: שמות עמודות"

**Allowed Transitions:**
- `IDLE`

---

### MS.DRAWING

**Description:**
Transient state while actively drawing a rectangle.

**Cursor:** `crosshair`
**Layer Class:** `drawing-active`

**Note:** This is a sub-state that preserves the parent state.

**Allowed Transitions:**
- Return to parent state on complete

---

### MS.DRAGGING

**Description:**
Transient state while dragging a field.

**Cursor:** `move`
**Layer Class:** `dragging-active`

**Allowed Transitions:**
- `IDLE`

---

### MS.RESIZING

**Description:**
Transient state while resizing a field.

**Cursor:** `nwse-resize`
**Layer Class:** `resizing-active`

**Allowed Transitions:**
- `IDLE`

---

### MS.PREVIEW

**Description:**
Live table preview mode - shows fill preview.

**Cursor:** `default`
**Layer Class:** `preview-mode`
**Status:** "מצב תצוגה מקדימה"

**Allowed Transitions:**
- `IDLE`

---

## Helper Methods

### State Checking

```javascript
// Check specific state
sm.is(MS.IDLE)
sm.is(MS.FLOW_CAPTURE_NAME)

// Check state groups
sm.isInFlow()        // FLOW_CAPTURE_NAME or FLOW_CAPTURE_FIELD
sm.isInTableFlow()   // TABLE_REGION, TABLE_SAMPLE_ROW, TABLE_COLUMN_MAPPING, TABLE_COLUMN_NAMING
sm.isInCreationMode() // FIELD_CREATION, CHECKBOX_CREATION, RADIO_CREATION
sm.isInteracting()   // DRAWING, DRAGGING, RESIZING

// Check any of multiple states
sm.isInAnyState([MS.IDLE, MS.PREVIEW])
```

### Flow Data Management

```javascript
// Get flow type
sm.getFlowType() // 'text', 'checkbox', 'radio', 'table', or null

// Get/Set pending name
sm.setPendingName({ text: 'שם', key: 'name', source: 'pdf' })
sm.getPendingName()
sm.clearPendingName()
```

### State Transitions

```javascript
// Set state (validates transition)
const success = sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });

// Force state (bypass validation)
sm.setState(MS.IDLE, { force: true });

// Reset to IDLE
sm.reset(true); // true = silent (no console output)
```

### Validation

```javascript
const result = sm.validate();
// {
//   valid: true/false,
//   errors: [...],
//   warnings: [...],
//   state: 'IDLE',
//   flowData: {...}
// }
```

---

## Transition Rules Matrix

| From State | Allowed Targets |
|------------|-----------------|
| IDLE | FLOW_CAPTURE_NAME, FIELD_CREATION, CHECKBOX_CREATION, RADIO_CREATION, GROUPING_SELECT, TEXT_SELECTION, TABLE_REGION, DRAWING, DRAGGING, RESIZING, PREVIEW |
| FLOW_CAPTURE_NAME | FLOW_CAPTURE_FIELD, DRAWING, IDLE |
| FLOW_CAPTURE_FIELD | FLOW_CAPTURE_NAME, DRAWING, IDLE |
| FIELD_CREATION | DRAWING, IDLE |
| CHECKBOX_CREATION | IDLE |
| RADIO_CREATION | IDLE |
| GROUPING_SELECT | GROUP_NAMING, IDLE |
| GROUP_NAMING | OPTION_LABELING, GROUPING_SELECT, DRAWING, IDLE |
| OPTION_LABELING | GROUP_NAMING, DRAWING, IDLE |
| TEXT_SELECTION | DRAWING, IDLE |
| TABLE_REGION | TABLE_SAMPLE_ROW, DRAWING, IDLE |
| TABLE_SAMPLE_ROW | TABLE_COLUMN_MAPPING, DRAWING, IDLE |
| TABLE_COLUMN_MAPPING | TABLE_COLUMN_NAMING, IDLE |
| TABLE_COLUMN_NAMING | IDLE |
| DRAWING | (returns to parent) |
| DRAGGING | IDLE |
| RESIZING | IDLE |
| PREVIEW | IDLE |

---

## Best Practices

1. **Always use StateMachine for state checks**
   ```javascript
   // Good
   if (sm.is(MS.FLOW_CAPTURE_NAME)) { ... }

   // Bad (legacy)
   if (this.mappingFlowActive) { ... }
   ```

2. **Use helper methods for state groups**
   ```javascript
   // Good
   if (sm.isInFlow()) { ... }

   // Verbose
   if (sm.is(MS.FLOW_CAPTURE_NAME) || sm.is(MS.FLOW_CAPTURE_FIELD)) { ... }
   ```

3. **Reset to IDLE before entering new modes**
   ```javascript
   sm.reset(true);
   sm.setState(MS.TABLE_REGION);
   ```

4. **Check transition success**
   ```javascript
   if (!sm.setState(MS.FLOW_CAPTURE_FIELD)) {
       console.error('Transition failed');
       return;
   }
   ```

5. **Use validate() for debugging**
   ```javascript
   const result = sm.validate();
   if (!result.valid) {
       console.error('Invalid state:', result.errors);
   }
   ```
