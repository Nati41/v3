/**
 * StateManager - Single source of truth for all Mapper state
 * Immutable updates, history tracking, persistence
 */
import { eventBus, Events } from './EventBus.js';
import { canonicalSelector } from '../helpers/CanonicalSelector.js';
import { UnifiedImportAdapter } from '../pre-mapper/UnifiedImportAdapter.js';
import { SmartTableDetector } from '../pre-mapper/SmartTableDetector.js';

// Tool types
export const Tools = {
    SELECT: 'select',
    DRAW_TEXT: 'draw_text',
    DRAW_CHECKBOX: 'draw_checkbox',
    DRAW_RADIO: 'draw_radio',
    DRAW_TABLE: 'draw_table',
    PAN: 'pan',
    CAPTURE_NAME: 'capture_name'  // Field name capture tool
};

// App modes
export const Modes = {
    IDLE: 'idle',
    DRAWING: 'drawing',
    DRAGGING: 'dragging',
    RESIZING: 'resizing',
    PANNING: 'panning',
    TEXT_SELECTION: 'text_selection',
    CAPTURE_NAME: 'capture_name',  // Field name capture mode
    RADIO_GROUP_BUILDING: 'radio_group_building'  // Building a radio group
};

// Radio group building steps (NEW FLOW)
export const RadioGroupSteps = {
    MARK_TITLE: 'mark_title',        // Step 1: User draws rectangle on group title
    CLICK_CIRCLES: 'click_circles',  // Step 2: User clicks on radio circles (numbered ①②③)
    AUTO_DETECT: 'auto_detect',      // Step 3: System auto-detects labels near circles
    CONFIRM: 'confirm'               // Step 4: User reviews and confirms in dialog
};

/**
 * Create initial state
 */
function createInitialState() {
    return {
        // Document
        document: {
            loaded: false,
            fileName: null,
            totalPages: 1,
            currentPage: 1
        },

        // Fields - the core data
        fields: [],

        // Selection
        selection: {
            fieldId: null,
            expandedFieldId: null
        },

        // Current tool and mode
        tool: Tools.SELECT,
        mode: Modes.IDLE,

        // View state
        view: {
            zoom: 1.0,
            panX: 0,
            panY: 0
        },

        // PDF dimensions (set when PDF loads)
        pdfDimensions: {
            width: 595,  // A4 default
            height: 842,
            scale: 1.0
        },

        // Settings
        settings: {
            dpi: 300,
            snapToGrid: false,
            gridSize: 20,
            autoSave: true
        },

        // Radio groups
        radioGroups: [],

        // Radio/Checkbox group builder (for building new groups) - UNIFIED FLOW
        radioGroupBuilder: {
            active: false,
            step: null,  // 'mark_title' | 'click_circles' | 'auto_detect' | 'confirm'
            groupType: 'radio',  // 'radio' or 'checkbox' - type of group being built
            groupName: '',       // Hebrew group name (extracted from title)
            groupNameEn: '',     // English group name
            circles: [],         // Array of { fieldId, number } - positions of options
            detectedLabels: [],  // Array of { circleIndex, label_he, label_en, labelBbox }
            options: []          // Final options after confirmation
        },

        // Tables (V2 compatibility)
        tables: [],

        // Counters
        counters: {
            field: 0,
            radioGroup: 0,
            table: 0
        }
    };
}

/**
 * Normalize field name aliases to standard format
 * V2 uses: label_he, labelHe, hebrewName, label_en, labelEn, englishId
 * V3 standard: label_he, label_en
 * @param {Object} field - Field object to normalize
 * @returns {Object} Normalized field
 */
function normalizeFieldNames(field) {
    // Normalize Hebrew name
    if (!field.label_he) {
        field.label_he = field.labelHe || field.hebrewName || '';
    }

    // Normalize English name
    if (!field.label_en) {
        field.label_en = field.labelEn || field.englishId || field.name || field.id || '';
    }

    return field;
}

/**
 * Remove transient UI flags that shouldn't be persisted
 * @param {Object} field - Field object to clean
 * @returns {Object} Cleaned field
 */
function removeTransientFlags(field) {
    const transientFlags = [
        '_selectedForGroup',
        '_userEditedName',
        '_englishManuallyEdited',
        'element',
        'isComplete'  // V2 flag, use isMapped in V3
    ];

    const cleaned = { ...field };
    transientFlags.forEach(flag => {
        delete cleaned[flag];
    });

    return cleaned;
}

/**
 * Determine if field is mapped based on coordinates
 * @param {Object} field - Field object
 * @returns {boolean}
 */
function isFieldMapped(field) {
    // Has valid bbox
    if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
        const [x, y, w, h] = field.bbox;
        // Exclude default unmapped bbox [0, 0, 0.1, 0.05]
        if (!(x === 0 && y === 0 && w === 0.1 && h === 0.05)) {
            return true;
        }
    }

    // Has valid anchor (checkbox/radio)
    if (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
        return true;
    }

    // Has V2 PDF points
    if (typeof field.pdfX === 'number' && typeof field.pdfY === 'number') {
        return true;
    }

    // Has legacy percentage coordinates
    if (field.xPct != null && field.yPct != null) {
        return true;
    }

    return false;
}

export class StateManager {
    constructor() {
        this.state = createInitialState();
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        this._undoStack = [];  // Stack of states for redo
        this.subscribers = new Set();
    }

    /**
     * Get current state (read-only copy)
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Get a specific part of state
     */
    get(path) {
        const parts = path.split('.');
        let value = this.state;
        for (const part of parts) {
            if (value === undefined) return undefined;
            value = value[part];
        }
        return value;
    }

    /**
     * Update state (immutable)
     * @param {string} path - Dot-notation path (e.g., 'selection.fieldId')
     * @param {*} value - New value
     * @param {boolean} addToHistory - Whether to add to undo history
     */
    set(path, value, addToHistory = false) {
        const oldState = this.state;

        // Use efficient shallow clone instead of deep clone
        const newState = this._shallowCloneWithPath(this.state, path);

        // Set value at path
        const parts = path.split('.');
        let target = newState;
        for (let i = 0; i < parts.length - 1; i++) {
            target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;

        // Update state
        this.state = newState;

        // Add to history if needed (only history uses deep clone)
        if (addToHistory) {
            this._pushHistory(oldState);
        }

        // Notify subscribers
        this._notify(path, value, oldState);
    }

    /**
     * Batch update multiple paths
     */
    batch(updates, addToHistory = false) {
        const oldState = this.state;
        const newState = this._deepClone(this.state);

        for (const [path, value] of Object.entries(updates)) {
            const parts = path.split('.');
            let target = newState;
            for (let i = 0; i < parts.length - 1; i++) {
                target = target[parts[i]];
            }
            target[parts[parts.length - 1]] = value;
        }

        this.state = newState;

        if (addToHistory) {
            this._pushHistory(oldState);
        }

        eventBus.emit(Events.STATE_CHANGED, { updates, oldState, newState });
    }

    // ============ FIELD OPERATIONS ============

    /**
     * Add a new field
     *
     * Field Schema (V3 with Semantic):
     * - id: Unique field ID
     * - type: 'text' | 'number' | 'date' | 'checkbox' | 'radio' | 'signature'
     * - page: Page number
     * - bbox: [x, y, w, h] normalized coordinates
     * - label_he: Hebrew label
     * - label_en: English label/ID
     * - isMapped: Whether field has position on PDF
     * - canonical: Semantic canonical name (e.g., 'first_name', 'birth_date')
     * - context: Context hint (e.g., 'employee', 'employer', 'spouse')
     * - category: Category for enum fields (e.g., 'marital_status', 'gender')
     * - format: Format hint for validation (e.g., 'DD/MM/YYYY', 'phone_il')
     */
    addField(fieldData) {
        const id = `fld_${++this.state.counters.field}_${Date.now()}`;

        // Default context to 'employee' if not specified (V3 requirement)
        const context = fieldData.context || 'employee';

        const field = {
            id,
            type: 'text',
            page: this.state.document.currentPage,
            bbox: null,
            label_he: '',
            label_en: '',
            isMapped: false,
            // Semantic fields (V3)
            canonical: fieldData.canonical || null,
            context: context,  // Always set, defaults to 'employee'
            category: fieldData.category || null,
            format: fieldData.format || null,
            ...fieldData,
            context: context  // Ensure context is always set even if spread overwrites
        };

        const newFields = [...this.state.fields, field];
        this.set('fields', newFields, true);

        eventBus.emit(Events.FIELD_CREATED, field);
        return field;
    }

    /**
     * Add an unmapped field (from name capture flow)
     * Field has name but no position yet (isMapped = false)
     * @param {Object} data - Field data with label_he, label_en, type
     * @returns {Object} Created field
     */
    addUnmappedField(data) {
        const id = `fld_${++this.state.counters.field}_${Date.now()}`;

        // Ensure unique label_en
        const existingIds = this.state.fields.map(f => f.label_en).filter(Boolean);
        let uniqueEnglish = data.label_en || '';
        if (uniqueEnglish && existingIds.includes(uniqueEnglish)) {
            let counter = 2;
            while (existingIds.includes(`${data.label_en}_${counter}`)) {
                counter++;
            }
            uniqueEnglish = `${data.label_en}_${counter}`;
        }

        // Default context to 'employee' if not specified (V3 requirement)
        const context = data.context || 'employee';
        if (!data.context) {
            console.warn(`⚠️ Field "${data.label_he || uniqueEnglish}" missing context, defaulting to employee`);
        }

        const field = {
            id,
            type: data.type || 'text',
            page: this.state.document.currentPage,
            bbox: null,
            label_he: data.label_he || '',
            label_en: uniqueEnglish,
            isMapped: false,  // Not mapped until user draws position
            source: data.source || 'capture',  // Track where field came from
            // Semantic fields (V3)
            canonical: data.canonical || null,
            context: context,  // Always set, defaults to 'employee'
            category: data.category || null,
            format: data.format || null
        };

        const newFields = [...this.state.fields, field];
        this.set('fields', newFields, true);

        eventBus.emit(Events.FIELD_CREATED, field);
        console.log('[StateManager] Added unmapped field:', field.id, field.label_he);

        return field;
    }

    /**
     * Update a field
     * @param {string} fieldId - Field ID
     * @param {Object} updates - Updates to apply
     * @param {boolean} addToHistory - Whether to add to history (default: true)
     *        Set to false for two-phase mapping to keep operations as single undo
     */
    updateField(fieldId, updates, addToHistory = true) {
        const index = this.state.fields.findIndex(f => f.id === fieldId);
        if (index === -1) return null;

        const updatedField = { ...this.state.fields[index], ...updates };
        const newFields = [...this.state.fields];
        newFields[index] = updatedField;

        this.set('fields', newFields, addToHistory);
        eventBus.emit(Events.FIELD_UPDATED, updatedField);
        return updatedField;
    }

    /**
     * Delete a field
     * Uses batch() to ensure both fields AND selection are saved together in history
     * This allows undo to restore both the field AND the selection state
     */
    deleteField(fieldId) {
        const field = this.state.fields.find(f => f.id === fieldId);
        if (!field) return false;

        const newFields = this.state.fields.filter(f => f.id !== fieldId);

        // Build batch update - always include fields, conditionally include selection
        const updates = {
            'fields': newFields
        };

        // Clear selection if deleted field was selected
        if (this.state.selection.fieldId === fieldId) {
            updates['selection.fieldId'] = null;
        }

        // Update radioGroups - remove field from any group it belongs to
        const groupWithField = this.state.radioGroups.find(g =>
            g.options && g.options.some(opt => opt.fieldId === fieldId)
        );
        if (groupWithField) {
            const newGroups = this.state.radioGroups.map(g => {
                if (g.groupId === groupWithField.groupId) {
                    return {
                        ...g,
                        options: g.options.filter(opt => opt.fieldId !== fieldId)
                    };
                }
                return g;
            });
            updates['radioGroups'] = newGroups;
        }

        // Update radioGroupBuilder if field is part of current building session
        const builder = this.state.radioGroupBuilder;
        if (builder.active && builder.circles.some(c => c.fieldId === fieldId)) {
            const newCircles = builder.circles.filter(c => c.fieldId !== fieldId);
            updates['radioGroupBuilder.circles'] = newCircles;
        }

        // Use batch to save everything together in one history entry
        this.batch(updates, true);

        eventBus.emit(Events.FIELD_DELETED, field);
        return true;
    }

    /**
     * Get field by ID
     */
    getField(fieldId) {
        return this.state.fields.find(f => f.id === fieldId);
    }

    /**
     * Get fields for current page
     */
    getCurrentPageFields() {
        return this.state.fields.filter(f => f.page === this.state.document.currentPage);
    }

    /**
     * Get mapped fields for current page
     */
    getMappedFields() {
        return this.getCurrentPageFields().filter(f => f.isMapped && f.bbox);
    }

    // ============ SELECTION ============

    selectField(fieldId) {
        const oldId = this.state.selection.fieldId;
        if (oldId === fieldId) return;

        this.set('selection.fieldId', fieldId);

        if (oldId) {
            eventBus.emit(Events.FIELD_DESELECTED, { fieldId: oldId });
        }
        if (fieldId) {
            eventBus.emit(Events.FIELD_SELECTED, { fieldId });
        }
    }

    deselectAll() {
        this.selectField(null);
    }

    getSelectedField() {
        if (!this.state.selection.fieldId) return null;
        return this.getField(this.state.selection.fieldId);
    }

    // ============ RADIO GROUP OPERATIONS ============

    /**
     * Add a new radio group
     * @param {Object} groupData - Radio group data
     * @returns {Object} Created radio group
     */
    addRadioGroup(groupData) {
        const groupId = groupData.groupId || `rg_${++this.state.counters.radioGroup}_${Date.now()}`;
        const group = {
            groupId,
            groupName: groupData.groupName || '',
            page: groupData.page || this.state.document.currentPage,
            type: 'radio',
            options: groupData.options || [],
            ...groupData
        };

        const newGroups = [...this.state.radioGroups, group];
        this.set('radioGroups', newGroups, true);

        eventBus.emit(Events.RADIO_GROUP_CREATED, group);
        return group;
    }

    /**
     * Update a radio group
     * @param {string} groupId - Group ID
     * @param {Object} updates - Updates to apply
     * @returns {Object|null} Updated group or null
     */
    updateRadioGroup(groupId, updates) {
        const index = this.state.radioGroups.findIndex(g => g.groupId === groupId);
        if (index === -1) return null;

        const updatedGroup = { ...this.state.radioGroups[index], ...updates };
        const newGroups = [...this.state.radioGroups];
        newGroups[index] = updatedGroup;

        this.set('radioGroups', newGroups, true);
        eventBus.emit(Events.RADIO_GROUP_UPDATED, updatedGroup);
        return updatedGroup;
    }

    /**
     * Delete a radio group
     * @param {string} groupId - Group ID
     * @returns {boolean} Success
     */
    deleteRadioGroup(groupId) {
        const group = this.state.radioGroups.find(g => g.groupId === groupId);
        if (!group) return false;

        const newGroups = this.state.radioGroups.filter(g => g.groupId !== groupId);
        this.set('radioGroups', newGroups, true);

        eventBus.emit(Events.RADIO_GROUP_DELETED, group);
        return true;
    }

    /**
     * Get radio group by ID
     * @param {string} groupId - Group ID
     * @returns {Object|undefined}
     */
    getRadioGroup(groupId) {
        return this.state.radioGroups.find(g => g.groupId === groupId);
    }

    /**
     * Get radio groups for current page
     * @returns {Array}
     */
    getCurrentPageRadioGroups() {
        return this.state.radioGroups.filter(g => g.page === this.state.document.currentPage);
    }

    // ============ RADIO GROUP BUILDER (NEW FLOW) ============

    /**
     * Start building a new radio/checkbox group (UNIFIED FLOW)
     * Step 1: User will mark the group title
     * Saves to history so user can undo starting the builder
     * @param {string} type - 'radio' or 'checkbox'
     */
    startRadioGroupBuilder(type = 'radio') {
        this.set('radioGroupBuilder', {
            active: true,
            step: RadioGroupSteps.MARK_TITLE,
            groupType: type,  // Track if this is radio or checkbox group
            groupName: '',
            groupNameEn: '',
            circles: [],
            detectedLabels: [],
            options: []
        }, true);  // Save to history - can undo starting the builder
        this.setMode(Modes.RADIO_GROUP_BUILDING);
        eventBus.emit(Events.RADIO_GROUP_BUILDING_STARTED, { step: RadioGroupSteps.MARK_TITLE, type });
        console.log(`[StateManager] ${type} group builder started - waiting for title`);
    }

    /**
     * Set the group title (Step 1 complete)
     * Uses batch to save all changes together in one history entry
     * @param {string} groupName - Hebrew group name
     * @param {string} groupNameEn - English group name
     */
    setRadioGroupTitle(groupName, groupNameEn) {
        const builder = this.state.radioGroupBuilder;
        if (!builder.active || builder.step !== RadioGroupSteps.MARK_TITLE) return;

        // Use batch to save all changes together
        this.batch({
            'radioGroupBuilder.groupName': groupName,
            'radioGroupBuilder.groupNameEn': groupNameEn,
            'radioGroupBuilder.step': RadioGroupSteps.CLICK_CIRCLES
        }, true);  // Save to history - can undo title selection

        eventBus.emit(Events.RADIO_GROUP_BUILDING_STEP, {
            step: RadioGroupSteps.CLICK_CIRCLES,
            groupName
        });
        console.log('[StateManager] Radio group title set:', groupName, '- waiting for circles');
    }

    /**
     * Add a radio/checkbox option as a REAL FIELD with anchor
     * NEW FLOW: Creates Field immediately, Overlay renders immediately
     * @param {Array} anchor - [x, y] normalized center point (0-1)
     * @param {string} type - 'radio' or 'checkbox'
     * @returns {Object} Created field
     */
    addGroupOption(anchor, type = 'radio') {
        const builder = this.state.radioGroupBuilder;
        if (!builder.active || builder.step !== RadioGroupSteps.CLICK_CIRCLES) return null;

        const optionNumber = builder.circles.length + 1;
        const currentPage = this.state.document.currentPage;

        // Create a REAL Field with anchor
        const field = this.addField({
            type: type,
            page: currentPage,
            anchor: anchor,
            label_he: `אפשרות ${optionNumber}`,
            label_en: `${builder.groupNameEn || 'option'}_${optionNumber}`,
            isMapped: true,
            _groupBuilding: true,  // Mark as part of group building
            overlayWidth: 24,
            overlayHeight: 24
        });

        // Track in builder for group creation
        const newCircles = [...builder.circles, { fieldId: field.id, number: optionNumber }];
        this.set('radioGroupBuilder.circles', newCircles, false);  // Don't add to history separately

        eventBus.emit(Events.RADIO_GROUP_OPTION_ADDED, {
            field: field,
            count: newCircles.length
        });

        console.log('[StateManager] Group option added as Field:', field.id, 'anchor:', anchor, 'Total:', newCircles.length);

        return field;
    }

    /**
     * Legacy alias - redirects to addGroupOption
     * @deprecated Use addGroupOption instead
     */
    addRadioCircle(bbox) {
        console.warn('[StateManager] addRadioCircle is deprecated - use addGroupOption with anchor');
        // Convert bbox center to anchor
        if (Array.isArray(bbox) && bbox.length === 4) {
            const anchor = [bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2];
            return this.addGroupOption(anchor, 'radio');
        }
        return null;
    }

    /**
     * Remove the last added option (undo last click)
     * NEW FLOW: Also deletes the Field that was created
     * @returns {boolean} Success
     */
    removeLastRadioCircle() {
        const builder = this.state.radioGroupBuilder;
        if (!builder.active || builder.circles.length === 0) return false;

        // Get the last option and delete its Field
        const lastOption = builder.circles[builder.circles.length - 1];
        if (lastOption.fieldId) {
            this.deleteField(lastOption.fieldId);
        }

        const newCircles = builder.circles.slice(0, -1);
        this.set('radioGroupBuilder.circles', newCircles, false);  // Don't add to history separately

        console.log('[StateManager] Last option removed. Remaining:', newCircles.length);
        return true;
    }

    /**
     * Trigger auto-detection of labels (Step 3)
     * Called when user presses Enter after marking circles
     */
    startLabelDetection() {
        const builder = this.state.radioGroupBuilder;
        if (!builder.active || builder.step !== RadioGroupSteps.CLICK_CIRCLES) return;

        if (builder.circles.length < 2) {
            console.log('[StateManager] Need at least 2 circles');
            return false;
        }

        this.set('radioGroupBuilder.step', RadioGroupSteps.AUTO_DETECT);
        eventBus.emit(Events.RADIO_GROUP_BUILDING_STEP, {
            step: RadioGroupSteps.AUTO_DETECT,
            circleCount: builder.circles.length
        });
        console.log('[StateManager] Starting label detection for', builder.circles.length, 'circles');
        return true;
    }

    /**
     * Set detected labels (after auto-detection completes)
     * @param {Array} labels - Array of { circleIndex, label_he, label_en, labelBbox }
     */
    setDetectedLabels(labels) {
        const builder = this.state.radioGroupBuilder;
        if (!builder.active) return;

        this.set('radioGroupBuilder.detectedLabels', labels);
        this.set('radioGroupBuilder.step', RadioGroupSteps.CONFIRM);

        eventBus.emit(Events.RADIO_GROUP_BUILDING_STEP, {
            step: RadioGroupSteps.CONFIRM,
            labels
        });
        console.log('[StateManager] Labels detected:', labels.length);
    }

    /**
     * Update a detected label (user edit in dialog)
     * @param {number} circleIndex - Circle index (0-based)
     * @param {string} label_he - New Hebrew label
     * @param {string} label_en - New English label
     */
    updateDetectedLabel(circleIndex, label_he, label_en) {
        const builder = this.state.radioGroupBuilder;
        if (!builder.active) return;

        const newLabels = [...builder.detectedLabels];
        const labelIndex = newLabels.findIndex(l => l.circleIndex === circleIndex);

        if (labelIndex >= 0) {
            newLabels[labelIndex] = {
                ...newLabels[labelIndex],
                label_he,
                label_en
            };
        } else {
            newLabels.push({ circleIndex, label_he, label_en, labelBbox: null });
        }

        this.set('radioGroupBuilder.detectedLabels', newLabels);
        console.log('[StateManager] Label updated for circle', circleIndex);
    }

    /**
     * Finish building radio group and create it (Step 4 complete)
     * NEW FLOW: Fields already exist with anchors, just create Group and update labels
     * @returns {Object|null} Created radio group or null if cancelled
     */
    finishRadioGroupBuilder() {
        const builder = this.state.radioGroupBuilder;
        if (!builder.active) return null;

        // Must have at least 2 options
        if (builder.circles.length < 2) {
            console.log('[StateManager] Radio group cancelled - not enough options');
            // Delete any Fields that were created
            builder.circles.forEach(opt => {
                if (opt.fieldId) this.deleteField(opt.fieldId);
            });
            this._resetRadioGroupBuilder();
            eventBus.emit(Events.RADIO_GROUP_BUILDING_CANCELLED);
            return null;
        }

        // Update Field labels - prefer existing labels (from WordSelector), fallback to detected or default
        builder.circles.forEach((opt, index) => {
            if (opt.fieldId) {
                const field = this.getField(opt.fieldId);
                const labelData = builder.detectedLabels.find(l => l.circleIndex === index) || {};

                // Only update if field doesn't already have a label (from unified flow)
                const fieldUpdate = {
                    _groupBuilding: undefined  // Remove temp flag
                };

                // Only set label if not already set by WordSelector
                if (!field?.label_he || field.label_he.startsWith('אפשרות ')) {
                    fieldUpdate.label_he = labelData.label_he || `אפשרות ${opt.number}`;
                    fieldUpdate.label_en = labelData.label_en || `${builder.groupNameEn || 'option'}_${opt.number}`;

                    // Add labelSelection if available (from old auto-detection flow)
                    if (labelData.labelSelection) {
                        fieldUpdate.labelSelection = labelData.labelSelection;
                    }
                }

                this.updateField(opt.fieldId, fieldUpdate, false);
            }
        });

        // Build options array with fieldIds
        const options = builder.circles.map(opt => ({
            fieldId: opt.fieldId,
            label_he: this.getField(opt.fieldId)?.label_he,
            label_en: this.getField(opt.fieldId)?.label_en
        }));

        // Create the RadioGroup (supports both radio and checkbox types)
        const group = this.addRadioGroup({
            groupName: builder.groupName,
            groupNameEn: builder.groupNameEn,
            type: builder.groupType || 'radio',  // Pass the correct type
            options: options
        });

        // Update Fields with groupId
        builder.circles.forEach(opt => {
            if (opt.fieldId) {
                this.updateField(opt.fieldId, { groupId: group.groupId }, false);
            }
        });

        console.log('[StateManager] Radio group created:', group.groupId, 'with', options.length, 'Fields');

        // Reset builder
        this._resetRadioGroupBuilder();

        eventBus.emit(Events.RADIO_GROUP_BUILDING_FINISHED, { group });
        return group;
    }

    /**
     * Cancel radio group building
     * NEW FLOW: Also deletes all Fields that were created
     */
    cancelRadioGroupBuilder() {
        const builder = this.state.radioGroupBuilder;

        // Delete all Fields that were created during group building
        if (builder.circles && builder.circles.length > 0) {
            builder.circles.forEach(opt => {
                if (opt.fieldId) {
                    this.deleteField(opt.fieldId);
                }
            });
        }

        this._resetRadioGroupBuilder();
        eventBus.emit(Events.RADIO_GROUP_BUILDING_CANCELLED);
        console.log('[StateManager] Radio group builder cancelled - Fields deleted');
    }

    /**
     * Reset radio group builder to initial state
     */
    _resetRadioGroupBuilder() {
        this.set('radioGroupBuilder', {
            active: false,
            step: null,
            groupType: 'radio',
            groupName: '',
            groupNameEn: '',
            circles: [],
            detectedLabels: [],
            options: []
        });
        this.setMode(Modes.IDLE);
    }

    /**
     * Get current radio group builder state
     * @returns {Object}
     */
    getRadioGroupBuilder() {
        return this.state.radioGroupBuilder;
    }

    // ============ TABLE OPERATIONS ============

    /**
     * Add a new table
     * @param {Object} tableData - Table data
     * @returns {Object} Created table
     */
    addTable(tableData) {
        const tableId = tableData.tableId || `tbl_${++this.state.counters.table}_${Date.now()}`;
        const table = {
            tableId,
            page: tableData.page || this.state.document.currentPage,
            bbox: tableData.bbox || null,
            headerBBox: tableData.headerBBox || null,
            sampleRowBBox: tableData.sampleRowBBox || null,
            rowCount: tableData.rowCount || 0,
            rowHeight: tableData.rowHeight || 0,
            repeatDirection: tableData.repeatDirection || 'vertical',
            columns: tableData.columns || [],
            rows: tableData.rows || [],
            isComplete: tableData.isComplete !== false,
            ...tableData
        };

        const newTables = [...this.state.tables, table];
        this.set('tables', newTables, true);

        eventBus.emit(Events.TABLE_CREATED, table);
        return table;
    }

    /**
     * Update a table
     * @param {string} tableId - Table ID
     * @param {Object} updates - Updates to apply
     * @returns {Object|null} Updated table or null
     */
    updateTable(tableId, updates) {
        const index = this.state.tables.findIndex(t => t.tableId === tableId);
        if (index === -1) return null;

        const updatedTable = { ...this.state.tables[index], ...updates };
        const newTables = [...this.state.tables];
        newTables[index] = updatedTable;

        this.set('tables', newTables, true);
        eventBus.emit(Events.TABLE_UPDATED, updatedTable);
        return updatedTable;
    }

    /**
     * Delete a table
     * @param {string} tableId - Table ID
     * @returns {boolean} Success
     */
    deleteTable(tableId) {
        const table = this.state.tables.find(t => t.tableId === tableId);
        if (!table) return false;

        const newTables = this.state.tables.filter(t => t.tableId !== tableId);
        this.set('tables', newTables, true);

        eventBus.emit(Events.TABLE_DELETED, table);
        return true;
    }

    /**
     * Get table by ID
     * @param {string} tableId - Table ID
     * @returns {Object|undefined}
     */
    getTable(tableId) {
        return this.state.tables.find(t => t.tableId === tableId);
    }

    /**
     * Get tables for current page
     * @returns {Array}
     */
    getCurrentPageTables() {
        return this.state.tables.filter(t => t.page === this.state.document.currentPage);
    }

    // ============ TOOL & MODE ============

    setTool(tool) {
        if (this.state.tool === tool) return;
        this.set('tool', tool);
        eventBus.emit(Events.TOOL_CHANGED, { tool });
    }

    setMode(mode) {
        if (this.state.mode === mode) return;
        const oldMode = this.state.mode;
        this.set('mode', mode);
        eventBus.emit(Events.MODE_CHANGED, { mode, oldMode });
    }

    // ============ HISTORY (UNDO/REDO) ============
    //
    // SIMPLE MODEL:
    // - history[] stores state snapshots
    // - historyIndex points to current position (-1 = before first snapshot)
    // - history[i] = state BEFORE action i was applied
    // - undoStack = states saved for redo when undoing
    //

    _pushHistory(oldState) {
        // Clear any redo states since we're doing a new action
        this._undoStack = [];

        // If we're not at the end, truncate future history
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // Push the old state (state before this change)
        this.history.push(this._deepClone(oldState));

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }

        eventBus.emit(Events.HISTORY_PUSH, { index: this.historyIndex });
    }

    undo() {
        if (this.historyIndex < 0) {
            return false;
        }

        // Initialize undo stack if needed
        if (!this._undoStack) this._undoStack = [];

        // Save current state to undo stack (for redo)
        this._undoStack.push(this._deepClone(this.state));

        // Restore previous state from history
        const previousState = this.history[this.historyIndex];
        this.state = this._deepClone(previousState);
        this.historyIndex--;

        eventBus.emit(Events.HISTORY_UNDO, { index: this.historyIndex });
        eventBus.emit(Events.STATE_CHANGED, { action: 'undo' });
        return true;
    }

    redo() {
        if (!this._undoStack || this._undoStack.length === 0) {
            return false;
        }

        // Restore state from undo stack
        const nextState = this._undoStack.pop();
        this.state = this._deepClone(nextState);
        this.historyIndex++;

        eventBus.emit(Events.HISTORY_REDO, { index: this.historyIndex });
        eventBus.emit(Events.STATE_CHANGED, { action: 'redo' });
        return true;
    }

    canUndo() {
        return this.historyIndex >= 0;
    }

    canRedo() {
        return this._undoStack && this._undoStack.length > 0;
    }

    // ============ PERSISTENCE ============

    /**
     * Export state for saving (full project including unmapped)
     * Includes fields, radioGroups, tables with transient flags removed
     */
    exportState() {
        // Clean fields - remove transient UI flags
        const cleanedFields = this.state.fields.map(f => removeTransientFlags(f));

        return {
            version: '3.0',
            exportedAt: new Date().toISOString(),
            document: this.state.document,
            fields: cleanedFields,
            radioGroups: this.state.radioGroups,
            tables: this.state.tables,
            settings: this.state.settings
        };
    }

    /**
     * Export only mapped fields (for V2 compatibility / production export)
     * Only includes fields that have been mapped (have coordinates)
     */
    exportMappedFields() {
        // Filter only mapped fields
        const mappedFields = this.state.fields.filter(f => f.isMapped);

        // Clean fields - remove transient UI flags
        // Also add renderHint for fields that may need per-glyph boxes
        const cleanedFields = mappedFields.map(f => {
            const cleaned = removeTransientFlags(f);

            // Add renderHint if FieldIntentResolver is available and field is text type
            if (typeof window !== 'undefined' && window.FieldIntentResolver && cleaned.bbox) {
                const fieldType = (cleaned.type || 'text').toLowerCase();

                // Only add hints for text/number fields (not checkbox/radio)
                if (fieldType === 'text' || fieldType === 'number' || fieldType === 'digitboxes') {
                    try {
                        // Normalize bbox for resolver
                        const bbox = Array.isArray(cleaned.bbox) ? {
                            x: cleaned.bbox[0],
                            y: cleaned.bbox[1],
                            width: cleaned.bbox[2],
                            height: cleaned.bbox[3]
                        } : cleaned.bbox;

                        const intent = window.FieldIntentResolver.resolveRenderIntent({
                            value: null, // No value at mapping time
                            fieldMeta: {
                                englishId: cleaned.id,
                                hebrewName: cleaned.label_he,
                                type: cleaned.type,
                                canonical: cleaned.canonical
                            },
                            bbox: bbox,
                            context: 'standalone'
                        });

                        // Only add hint if confidence for perGlyphBoxes
                        if (intent.intent === 'perGlyphBoxes' && intent.confidence >= 0.5) {
                            cleaned.renderHint = {
                                intent: intent.intent,
                                expectedLength: intent.expectedLength,
                                subtype: intent.subtype,
                                confidence: intent.confidence
                            };
                        }
                    } catch (e) {
                        console.warn('[StateManager] renderHint generation failed for field', cleaned.id, e);
                    }
                }
            }

            return cleaned;
        });

        // Also add renderHint to table columns
        const tablesWithHints = this.state.tables.map(table => {
            const tableCopy = { ...table };
            if (tableCopy.columns && typeof window !== 'undefined' && window.FieldIntentResolver) {
                tableCopy.columns = tableCopy.columns.map(col => {
                    const colCopy = { ...col };
                    const colType = (col.type || 'text').toLowerCase();

                    // Only add hints for text/number columns (not checkbox/radio)
                    if ((colType === 'text' || colType === 'number' || colType === 'digitboxes') && col.bbox) {
                        try {
                            const bbox = typeof col.bbox === 'object' ? col.bbox : null;
                            if (bbox) {
                                const intent = window.FieldIntentResolver.resolveRenderIntent({
                                    value: null,
                                    fieldMeta: {
                                        englishId: col.englishId || col.columnId,
                                        hebrewName: col.hebrewName,
                                        type: col.type,
                                        canonical: col.canonical
                                    },
                                    bbox: bbox,
                                    context: 'table'
                                });

                                if (intent.intent === 'perGlyphBoxes' && intent.confidence >= 0.5) {
                                    colCopy.renderHint = {
                                        intent: intent.intent,
                                        expectedLength: intent.expectedLength,
                                        subtype: intent.subtype,
                                        confidence: intent.confidence
                                    };
                                }
                            }
                        } catch (e) {
                            console.warn('[StateManager] renderHint generation failed for column', col.columnId, e);
                        }
                    }
                    return colCopy;
                });
            }
            return tableCopy;
        });

        return {
            version: '3.0',
            exportedAt: new Date().toISOString(),
            document: this.state.document,
            fields: cleanedFields,
            radioGroups: this.state.radioGroups,
            tables: tablesWithHints,
            mappingSummary: {
                totalFields: this.state.fields.length,
                mappedFields: mappedFields.length,
                unmappedFields: this.state.fields.length - mappedFields.length
            }
        };
    }

    /**
     * Import state from saved data
     * Supports multiple formats:
     * - V3 format: { fields, radioGroups, tables, settings }
     * - V2 mapper format: { fields (with fieldId), radioGroups, tables }
     * - V2 export format: fields array with fieldId instead of id
     * - Field template format: array with name + label_he
     * - Direct array format: [{ id, bbox, ... }]
     */
    importState(data) {
        if (!data) {
            throw new Error('Invalid state data');
        }

        let fieldsToImport = [];
        let radioGroupsToImport = [];
        let tablesToImport = [];

        // ============ DETECT AND PARSE FORMAT ============

        // Format 1: Field template array (name + label_he)
        if (Array.isArray(data) && data.length > 0 && data[0].name && data[0].label_he) {
            console.log('[StateManager] Detected field template format');
            fieldsToImport = data.map(f => this._normalizeField({
                id: f.name,
                label_he: f.label_he,
                label_en: f.name,
                type: f.type || 'text',
                page: 1,
                isMapped: false  // Templates are unmapped
            }));
        }
        // Format 2: Direct field array
        else if (Array.isArray(data)) {
            console.log('[StateManager] Detected direct array format');
            fieldsToImport = data.map(f => this._normalizeField(f));
        }
        // Format 3: Object with fields property
        else if (data.fields && Array.isArray(data.fields)) {
            console.log('[StateManager] Detected object format with fields');
            fieldsToImport = data.fields.map(f => this._normalizeField(f));

            // Import radioGroups if present
            if (data.radioGroups && Array.isArray(data.radioGroups)) {
                radioGroupsToImport = this._normalizeRadioGroups(data.radioGroups);
            }

            // Import tables if present
            if (data.tables && Array.isArray(data.tables)) {
                tablesToImport = this._normalizeTables(data.tables);
            }
        }
        else {
            throw new Error('Invalid state data: unrecognized format');
        }

        // ============ APPLY IMPORT ============

        this.batch({
            'fields': fieldsToImport,
            'radioGroups': radioGroupsToImport,
            'tables': tablesToImport,
            'settings': { ...this.state.settings, ...(data.settings || {}) }
        }, false);

        console.log(`[StateManager] Imported: ${fieldsToImport.length} fields, ${radioGroupsToImport.length} radioGroups, ${tablesToImport.length} tables`);
        console.log(`[StateManager] After import - state.tables:`, this.state.tables);
        eventBus.emit(Events.PROJECT_LOAD, data);

        // Smart Table Detection: Scan imported fields for repeating patterns
        // Run after a short delay to let UI update first
        setTimeout(() => {
            this._detectSmartTablesFromFields(fieldsToImport);
        }, 100);
    }

    /**
     * Import Unified JSON Schema v1 (from AI/OCR sources)
     * Direct import - no draft/approval stage
     * Fields are imported as normal unmapped/mapped fields based on bbox presence
     *
     * @param {Object} unifiedJson - Unified Import JSON Schema v1
     * @returns {Object} Import statistics
     */
    importUnifiedJson(unifiedJson) {
        console.log('[StateManager] Importing Unified JSON...');

        // Validate schema
        const validation = UnifiedImportAdapter.validate(unifiedJson);
        if (!validation.valid) {
            console.warn('[StateManager] Unified JSON validation warnings:', validation.errors);
            // Continue anyway - be lenient with imports
        }

        // Parse and normalize using the adapter
        const { fields, groups, tables, stats } = UnifiedImportAdapter.import(unifiedJson);

        // Merge with existing state (append, don't replace)
        const newFields = [...this.state.fields, ...fields];
        const newGroups = [...this.state.radioGroups, ...groups];
        const newTables = [...this.state.tables, ...tables];

        // Apply import using batch for atomic update
        this.batch({
            'fields': newFields,
            'radioGroups': newGroups,
            'tables': newTables
        }, true);  // Add to history for undo support

        console.log(`[StateManager] ✅ Unified import complete:`, stats);
        console.log(`[StateManager] Total state: ${newFields.length} fields, ${newGroups.length} groups, ${newTables.length} tables`);

        // Emit events for UI updates
        eventBus.emit(Events.STATE_CHANGED, { action: 'unified_import', stats });
        eventBus.emit(Events.TOAST_SHOW, {
            message: `יובאו ${stats.fieldsImported} שדות, ${stats.groupsImported} קבוצות, ${stats.tablesImported} טבלאות`,
            type: 'success'
        });

        // Smart Table Detection: Scan imported fields for repeating patterns
        // Run after a short delay to let UI update first
        setTimeout(() => {
            this._detectSmartTablesFromFields(fields);
        }, 100);

        return stats;
    }

    /**
     * Normalize a single field from V2 to V3 format
     * @param {Object} f - Raw field data
     * @returns {Object} Normalized field
     */
    _normalizeField(f) {
        // Generate ID if missing
        const id = f.id || f.fieldId || `fld_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        // Build normalized field
        let field = {
            id,
            type: f.type || 'text',
            page: f.page || 1,
            ...f
        };

        // Remove V2 fieldId if we converted it
        if (field.fieldId && field.id !== field.fieldId) {
            delete field.fieldId;
        }

        // Normalize name aliases (label_he, labelHe, hebrewName → label_he)
        field = normalizeFieldNames(field);

        // Ensure semantic fields exist (V3)
        // V3.1: Auto-suggest canonical if missing based on label_he
        if (!field.canonical && field.label_he) {
            // Try to suggest canonical from dictionary
            const suggestion = canonicalSelector.getBestMatch(field.label_he);
            if (suggestion) {
                field.canonical = suggestion;
                // Also suggest context based on canonical
                const suggestedContext = canonicalSelector.suggestContext(suggestion);
                if (suggestedContext && !field.context) {
                    field.context = suggestedContext;
                }
                // Get format hint
                const formatHint = canonicalSelector.getFormatHint(suggestion);
                if (formatHint && !field.format) {
                    field.format = formatHint.format;
                }
                console.log(`[StateManager] ✅ Auto-suggested on import: "${field.label_he}" → canonical=${suggestion}, context=${field.context || 'employee'}`);
            } else {
                console.warn(`[StateManager] ⚠️ No canonical match found for: "${field.label_he}"`);
            }
        }

        // CRITICAL: context ALWAYS defaults to 'employee' for deterministic matching
        if (!field.context) {
            field.context = 'employee';  // Default for backwards compatibility
            if (field.label_he) {
                // Try to detect context from label text
                const detectedContext = canonicalSelector.detectContextFromLabel(field.label_he);
                if (detectedContext && detectedContext !== 'employee') {
                    field.context = detectedContext;
                    console.log(`[StateManager] Detected context from label: "${field.label_he}" → context=${detectedContext}`);
                }
            }
        }
        field.category = field.category || null;
        field.format = field.format || null;

        // Determine isMapped status
        field.isMapped = isFieldMapped(field);

        // Remove transient UI flags
        field = removeTransientFlags(field);

        return field;
    }

    /**
     * Normalize radio groups from V2 format
     * V2 format: { groupId, groupName, page, options: [{ fieldId, label, value, ... }] }
     * V3 adds: category for enum groups (e.g., 'marital_status', 'gender')
     * V3.1 adds: context, canonical (context.category) for deterministic matching
     * @param {Array} groups - Raw radio groups
     * @returns {Array} Normalized radio groups
     */
    _normalizeRadioGroups(groups) {
        return groups.map(g => {
            const category = g.category || null;
            const context = g.context || 'employee';  // Default to employee

            // V3.1: Build group canonical as context.category
            let canonical = g.canonical || null;
            if (!canonical && category) {
                canonical = `${context}.${category}`;
                console.log(`[StateManager] Auto-generated group canonical: "${g.groupName}" → ${canonical}`);
            }

            return {
                groupId: g.groupId || `rg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                groupName: g.groupName || g.hebrewName || '',
                groupNameEn: g.groupNameEn || g.englishId || '',
                page: g.page || 1,
                type: g.type || 'radio',
                // Semantic fields (V3.1)
                category: category,
                context: context,
                canonical: canonical,
                options: (g.options || []).map(opt => ({
                    fieldId: opt.fieldId,
                    label: opt.label || opt.hebrewLabel || '',
                    label_he: opt.label_he || opt.label || opt.hebrewLabel || '',
                    label_en: opt.label_en || opt.value || opt.englishId || opt.fieldId,
                    value: opt.value || opt.englishId || opt.fieldId,
                    // Canonical value for this option (V3)
                    canonical: opt.canonical || null,
                    // Copy coordinates if present
                    ...(opt.anchor ? { anchor: opt.anchor } : {}),
                    ...(opt.bbox ? { bbox: opt.bbox } : {}),
                    ...(opt.overlayWidth ? { overlayWidth: opt.overlayWidth } : {}),
                    ...(opt.overlayHeight ? { overlayHeight: opt.overlayHeight } : {})
                }))
            };
        });
    }

    /**
     * Normalize tables from V2 format
     * @param {Array} tables - Raw tables
     * @returns {Array} Normalized tables
     */
    _normalizeTables(tables) {
        return tables.map(t => ({
            tableId: t.tableId || `tbl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            page: t.page || 1,
            bbox: t.bbox || null,
            headerBBox: t.headerBBox || null,
            sampleRowBBox: t.sampleRowBBox || null,
            rowCount: t.rowCount || 0,
            rowHeight: t.rowHeight || 0,
            repeatDirection: t.repeatDirection || 'vertical',
            columns: (t.columns || []).map(col => ({
                columnId: col.columnId || col.id,
                hebrewName: col.hebrewName || '',
                englishId: col.englishId || col.columnId || col.id,
                bbox: col.bbox || null,
                type: col.type || 'text'
            })),
            rows: t.rows || [],
            isComplete: t.isComplete !== false
        }));
    }

    /**
     * Detect repeating field patterns that look like tables
     * Called automatically after Unified Import
     * @param {Array} fields - Array of fields to scan
     */
    _detectSmartTablesFromFields(fields) {
        try {
            const candidates = SmartTableDetector.detect(fields);

            if (candidates.length > 0) {
                console.log(`[StateManager] Smart Table Detection found ${candidates.length} table candidates`);

                // Emit event for UI to show prompt
                eventBus.emit(Events.SMART_TABLE_DETECTED, {
                    candidates,
                    fieldCount: fields.length
                });
            } else {
                console.log('[StateManager] No table patterns detected in imported fields');
            }
        } catch (error) {
            console.error('[StateManager] Error in Smart Table Detection:', error);
        }
    }

    /**
     * Convert detected table candidate to real table
     * Called when user confirms table conversion in the prompt
     * @param {Object} candidate - Table candidate from SmartTableDetector
     * @returns {Object} Created table
     */
    convertSmartTableToTable(candidate) {
        const tableId = `tbl_${++this.state.counters.table}_${Date.now()}`;

        // Build column definitions from the candidate
        const columns = SmartTableDetector.buildColumnDefinitions(candidate);

        // Use Hebrew base name for display (baseHe), fallback to base
        const tableTitle = candidate.baseHe || candidate.base;
        const englishId = candidate.base;  // English/key for ID

        // Create the table
        const table = this.addTable({
            tableId,
            page: 1,  // Default to page 1, user can change later
            tableTitle: {
                text: tableTitle,  // Hebrew name for display
                englishId: englishId
            },
            rowCount: candidate.rowCount,
            columns: columns,
            isComplete: false,  // Not yet positioned
            _source: {
                detectionMethod: 'smart_table',
                originalFields: candidate.fieldIds
            }
        });

        // Remove the original flat fields that were converted to table
        const remainingFields = this.state.fields.filter(
            f => !candidate.fieldIds.includes(f.id)
        );
        this.set('fields', remainingFields, true);

        console.log(`[StateManager] Converted ${candidate.fieldIds.length} fields to table: ${tableId}`);
        console.log(`[StateManager] Table "${tableTitle}": ${candidate.columnCount} columns x ${candidate.rowCount} rows`);

        eventBus.emit(Events.TOAST_SHOW, {
            message: `הומרו ${candidate.fieldIds.length} שדות לטבלה "${tableTitle}"`,
            type: 'success'
        });

        return table;
    }

    /**
     * Reset to initial state
     */
    reset() {
        this.state = createInitialState();
        this.history = [];
        this.historyIndex = -1;
        this._undoStack = [];
        eventBus.emit(Events.STATE_CHANGED, { action: 'reset' });
    }

    // ============ INTERNAL ============

    _deepClone(obj) {
        // Use structuredClone if available (faster than JSON), otherwise fallback
        if (typeof structuredClone === 'function') {
            return structuredClone(obj);
        }
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Efficient shallow clone for simple state updates
     * Only clones necessary paths, not entire state
     */
    _shallowCloneWithPath(state, path) {
        const parts = path.split('.');
        const newState = { ...state };

        let current = newState;
        let parent = null;
        let key = null;

        for (let i = 0; i < parts.length - 1; i++) {
            key = parts[i];
            // Only clone the object at this level
            current[key] = Array.isArray(current[key])
                ? [...current[key]]
                : { ...current[key] };
            parent = current;
            current = current[key];
        }

        return newState;
    }

    _notify(path, value, oldState) {
        eventBus.emit(Events.STATE_CHANGED, { path, value, oldState });
    }
}

// Singleton instance
export const state = new StateManager();
