# Modes and Tools Documentation

## Overview

The mapper supports several specialized modes for different field types and operations.
All modes are managed by the StateMachine as the Single Source of Truth.

---

## Mode vs. Runtime Data

### What is a Mode?

A **Mode** is a state managed by StateMachine that:
- Changes user interaction behavior
- Updates UI (cursor, classes, badges)
- Controls which actions are allowed
- Has defined entry/exit transitions

**Example Modes:**
- `MS.FIELD_CREATION` - Drawing text fields
- `MS.CHECKBOX_CREATION` - Clicking to place checkboxes
- `MS.TABLE_REGION` - Selecting table area

### What is Runtime Data?

**Runtime Data** is temporary information stored during operations:
- NOT a state/mode
- Does NOT change interaction behavior
- Simply holds values for processing

**Example Runtime Data:**
- `currentFieldForNaming` - Field being named
- `selectedOptionsForGrouping` - Fields selected for grouping
- `currentTable` - Table being mapped
- `textSelectionStart` - Start point of selection

### Key Difference

```javascript
// MODE - Check StateMachine
if (sm.is(MS.TEXT_SELECTION)) {
    // Interaction behavior is text selection
}

// RUNTIME DATA - Check mapper property
if (this.currentFieldForNaming) {
    // We have a target field to name
}
```

---

## Creation Modes

### Field Creation Mode

**State:** `MS.FIELD_CREATION`
**Purpose:** Draw rectangles to create unnamed text fields
**Interaction:** Draw rectangle → Create field

```javascript
// Toggle
toggleFieldCreationMode() {
    if (sm.is(MS.FIELD_CREATION)) {
        sm.reset(true); // Exit
    } else {
        sm.setState(MS.FIELD_CREATION); // Enter
    }
}

// Check
if (sm.isInCreationMode()) {
    // In FIELD_CREATION, CHECKBOX_CREATION, or RADIO_CREATION
}
```

**UI:**
- Cursor: crosshair
- Layer class: `field-creation-mode`
- Button: `btn-field-mode` has `active` class

---

### Checkbox Creation Mode

**State:** `MS.CHECKBOX_CREATION`
**Purpose:** Click to place checkbox fields
**Interaction:** Click → Create 20x20 checkbox at position

```javascript
// Toggle
toggleCheckboxMode() {
    if (sm.is(MS.CHECKBOX_CREATION)) {
        sm.reset(true);
    } else {
        sm.setState(MS.CHECKBOX_CREATION);
    }
}
```

**UI:**
- Cursor: cell
- Layer class: `checkbox-creation-mode`
- Button: `btn-checkbox-mode` has `active` class

---

### Radio Creation Mode

**State:** `MS.RADIO_CREATION`
**Purpose:** Click to place radio button fields
**Interaction:** Click → Create 20x20 radio at position

```javascript
// Toggle
toggleRadioMode() {
    if (sm.is(MS.RADIO_CREATION)) {
        sm.reset(true);
    } else {
        sm.setState(MS.RADIO_CREATION);
    }
}
```

**UI:**
- Cursor: cell
- Layer class: `radio-creation-mode`
- Button: `btn-radio-mode` has `active` class

---

## Table Mapping Modes

Table mapping is a multi-step flow with dedicated states:

```
TABLE_REGION → TABLE_SAMPLE_ROW → TABLE_COLUMN_MAPPING → TABLE_COLUMN_NAMING → IDLE
```

### Table Region Selection

**State:** `MS.TABLE_REGION`
**Purpose:** Draw rectangle around entire table area

```javascript
activateTableMappingMode() {
    sm.reset(true);
    sm.setState(MS.TABLE_REGION);
    this.currentTableStep = 'region';
    this.currentTable = null;
}
```

**Runtime Data:**
- `currentTable` - Table object being created
- `currentTableStep` - Current step: 'region', 'sample', 'columns', 'complete'

---

### Sample Row Selection

**State:** `MS.TABLE_SAMPLE_ROW`
**Purpose:** Click to select a sample row for height calculation

```javascript
// Transition after region is drawn
proceedToSampleRow() {
    sm.setState(MS.TABLE_SAMPLE_ROW);
    this.currentTableStep = 'sample';
}
```

---

### Column Mapping

**State:** `MS.TABLE_COLUMN_MAPPING`
**Purpose:** Draw rectangles to define column boundaries

```javascript
proceedToColumnMapping() {
    sm.setState(MS.TABLE_COLUMN_MAPPING);
    this.currentTableStep = 'columns';
}

// Check before adding column
addTableColumn(x, y, width, height) {
    if (!sm.is(MS.TABLE_COLUMN_MAPPING)) return;
    // ... add column logic
}
```

---

### Column Naming

**State:** `MS.TABLE_COLUMN_NAMING`
**Purpose:** Select text to name each column

```javascript
activateColumnNamingMode(column) {
    sm.setState(MS.TABLE_COLUMN_NAMING);
    this.currentFieldForNaming = { ...column, isTableColumn: true };
}
```

---

### Table Flow Helper

```javascript
// Check if in any table state
if (sm.isInTableFlow()) {
    // In TABLE_REGION, TABLE_SAMPLE_ROW, TABLE_COLUMN_MAPPING, or TABLE_COLUMN_NAMING
}
```

---

## Text Selection Mode

**State:** `MS.TEXT_SELECTION`
**Purpose:** Select text from PDF to name an existing field

```javascript
activateTextSelectionMode(field) {
    sm.reset(true);
    sm.setState(MS.TEXT_SELECTION);
    this.currentFieldForNaming = field; // Runtime data
}

toggleTextSelectionMode() {
    if (sm.is(MS.TEXT_SELECTION)) {
        deactivateTextSelectionMode();
    } else {
        activateTextSelectionMode();
    }
}
```

**Runtime Data:**
- `currentFieldForNaming` - The field to receive the selected text
- `textSelectionStart` - Start point of selection rectangle
- `currentTextSelection` - DOM element for selection rectangle

**UI:**
- Cursor: text
- Layer class: `text-selection-mode`
- Target field has `awaiting-name` class

---

## Option Grouping Modes

Option grouping has three related states:

### Grouping Select

**State:** `MS.GROUPING_SELECT`
**Purpose:** Select multiple checkbox/radio fields for grouping

```javascript
activateOptionGroupingMode() {
    sm.reset(true);
    sm.setState(MS.GROUPING_SELECT);
    this.selectedOptionsForGrouping = [];
}

toggleOptionSelection(fieldId) {
    if (!sm.is(MS.GROUPING_SELECT)) return;
    // Toggle field in selection
}
```

**Runtime Data:**
- `selectedOptionsForGrouping` - Array of selected field IDs

---

### Group Naming

**State:** `MS.GROUP_NAMING`
**Purpose:** Select text to name the entire group

```javascript
activateGroupNamingMode(group) {
    sm.reset(true);
    sm.setState(MS.GROUP_NAMING);
    this.currentGroupForNaming = group;
}
```

**Runtime Data:**
- `currentGroupForNaming` - The group being named

---

### Option Labeling

**State:** `MS.OPTION_LABELING`
**Purpose:** Select text to label individual options in a group

```javascript
activateOptionLabelingMode(option, group) {
    sm.reset(true);
    sm.setState(MS.OPTION_LABELING);
    this.currentOptionForLabeling = option;
    this.currentGroupForNaming = group;
}
```

**Runtime Data:**
- `currentOptionForLabeling` - The option being labeled
- `currentGroupForNaming` - Parent group

---

## Preview Mode

**State:** `MS.PREVIEW`
**Purpose:** Show live table fill preview

```javascript
toggleLiveTablePreviewMode() {
    if (sm.is(MS.PREVIEW)) {
        sm.reset(true);
        deactivateLiveTablePreviewMode();
    } else {
        sm.setState(MS.PREVIEW);
        activateLiveTablePreviewMode();
    }
}

isPreviewModeActive() {
    return sm.is(MS.PREVIEW);
}
```

**UI:**
- Container has `preview-mode` class
- Shows preview indicator
- Table cells show sample data

---

## Interaction States

These are transient sub-states during user interactions:

### Drawing

**State:** `MS.DRAWING`
**Purpose:** Actively drawing a rectangle
**Note:** Preserves parent state context

### Dragging

**State:** `MS.DRAGGING`
**Purpose:** Actively moving a field

### Resizing

**State:** `MS.RESIZING`
**Purpose:** Actively resizing a field

```javascript
// Check if user is interacting
if (sm.isInteracting()) {
    // In DRAWING, DRAGGING, or RESIZING
}
```

---

## StateMachine Control Patterns

### Pattern: Toggle Mode

```javascript
toggleSomeMode() {
    if (sm.is(MS.SOME_MODE)) {
        // Exit: reset to IDLE
        sm.reset(true);
        // Cleanup UI
        updateUI(false);
    } else {
        // Enter: set state
        sm.setState(MS.SOME_MODE);
        // Setup UI
        updateUI(true);
    }
}
```

### Pattern: Activate with Reset

```javascript
activateSomeMode() {
    // Always reset first
    sm.reset(true);

    // Then enter new state
    sm.setState(MS.SOME_MODE);

    // Setup
    updateUI(true);
}
```

### Pattern: Deactivate

```javascript
deactivateSomeMode() {
    // Reset to IDLE
    sm.reset(true);

    // Clear runtime data
    this.someRuntimeData = null;

    // Cleanup UI
    updateUI(false);
}
```

### Pattern: Conditional Action

```javascript
performAction() {
    // Only if in correct state
    if (!sm.is(MS.REQUIRED_STATE)) {
        return;
    }

    // Proceed with action
    doSomething();
}
```

---

## Runtime Data Reference

| Property | Type | Used In | Purpose |
|----------|------|---------|---------|
| `currentFieldForNaming` | Object | TEXT_SELECTION, TABLE_COLUMN_NAMING | Field to receive name |
| `textSelectionStart` | {x, y} | Text selection modes | Selection start point |
| `currentTextSelection` | DOM Element | Text selection modes | Selection rectangle |
| `selectedOptionsForGrouping` | Array | GROUPING_SELECT | Fields for group |
| `currentGroupForNaming` | Object | GROUP_NAMING, OPTION_LABELING | Group being named |
| `currentOptionForLabeling` | Object | OPTION_LABELING | Option being labeled |
| `currentTable` | Object | Table modes | Table being mapped |
| `currentTableStep` | String | Table modes | Current step |
| `pendingFieldName` | Object | Non-flow path | Name for next field |
| `drawFieldAfterName` | Boolean | Non-flow path | Flag for draw mode |

---

## Mode Exclusivity

**Rule:** Only ONE mode can be active at a time.

The StateMachine enforces this by:
1. Validating transitions
2. Resetting before entering new modes
3. Allowing only one state at a time

```javascript
// This is automatic - StateMachine ensures single state
sm.reset(true);  // Go to IDLE
sm.setState(MS.NEW_MODE);  // Enter new mode

// Never possible:
// sm.is(MS.FIELD_CREATION) && sm.is(MS.CHECKBOX_CREATION)
// ^ Always false - only one state active
```
