/**
 * EntityResolutionScreen - Patch 5: Generic Semantic Resolution
 *
 * Handles cases where the same label_he appears multiple times.
 * Asks user to clarify if fields belong to same entity or different entities.
 *
 * Key principles:
 * - No hardcoded roles (employee/employer etc.)
 * - No domain-specific assumptions
 * - User decides entity grouping via drag & drop
 * - Suggests existing entities for reuse
 */

import { state } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';

class EntityResolutionScreen {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.isVisible = false;
        this.duplicateGroups = [];  // Groups of fields with same label_he
        this.entityGroups = new Map();  // groupId -> { entityId, entityLabel, fieldIds[] }
        this.existingEntities = [];  // Previously defined entities
        this.resolvePromise = null;
        this.rejectPromise = null;

        // Drag state
        this.draggedCard = null;
        this.draggedFieldId = null;
    }

    /**
     * Initialize the screen (create DOM if needed)
     */
    init() {
        if (this.overlay) return;

        this._createDOM();
        this._bindEvents();

        console.log('[EntityResolutionScreen] Initialized');
    }

    /**
     * Check if there are duplicate labels that need resolution
     * @param {Array} fields - Fields to check (reviewed/complete)
     * @returns {boolean}
     */
    hasDuplicates(fields) {
        const labelCounts = new Map();

        for (const field of fields) {
            if (!field.label_he) continue;
            const count = labelCounts.get(field.label_he) || 0;
            labelCounts.set(field.label_he, count + 1);
        }

        // Check if any label appears more than once
        for (const count of labelCounts.values()) {
            if (count > 1) return true;
        }

        return false;
    }

    /**
     * Show the entity resolution screen
     * @param {Array} fields - Fields to resolve
     * @returns {Promise<Object>} Result with resolved fields
     */
    async show(fields) {
        if (this.isVisible) {
            console.warn('[EntityResolutionScreen] Already visible');
            return null;
        }

        this.init();

        // Find duplicates
        this.duplicateGroups = this._findDuplicates(fields);

        if (this.duplicateGroups.length === 0) {
            console.log('[EntityResolutionScreen] No duplicates to resolve');
            return { resolved: true, fields: fields };
        }

        // Load existing entities from other fields
        this.existingEntities = this._getExistingEntities();

        // Initialize entity groups (each field starts in its own group)
        this._initEntityGroups();

        // Render the UI
        this._render();

        // Show overlay
        this.overlay.classList.add('visible');
        this.isVisible = true;
        document.body.style.overflow = 'hidden';

        // Return promise that resolves when user confirms
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    }

    /**
     * Hide the screen
     */
    hide() {
        if (!this.isVisible) return;

        this.overlay.classList.remove('visible');
        this.isVisible = false;
        document.body.style.overflow = '';

        // Clear state
        this.duplicateGroups = [];
        this.entityGroups.clear();
    }

    /**
     * Find duplicate label_he groups
     */
    _findDuplicates(fields) {
        const labelMap = new Map();

        for (const field of fields) {
            if (!field.label_he) continue;

            if (!labelMap.has(field.label_he)) {
                labelMap.set(field.label_he, []);
            }
            labelMap.get(field.label_he).push(field);
        }

        // Return only groups with 2+ fields
        const duplicates = [];
        for (const [label, fieldGroup] of labelMap) {
            if (fieldGroup.length > 1) {
                duplicates.push({
                    label_he: label,
                    fields: fieldGroup
                });
            }
        }

        return duplicates;
    }

    /**
     * Get existing entities from already-resolved fields
     */
    _getExistingEntities() {
        const entities = new Map();
        const allFields = state.get('fields') || [];

        for (const field of allFields) {
            if (field.entityId && field.entityLabel) {
                entities.set(field.entityId, field.entityLabel);
            }
        }

        return Array.from(entities.entries()).map(([id, label]) => ({
            entityId: id,
            entityLabel: label
        }));
    }

    /**
     * Initialize entity groups - each field starts in its own group
     */
    _initEntityGroups() {
        this.entityGroups.clear();
        let groupIndex = 0;

        for (const dupGroup of this.duplicateGroups) {
            for (const field of dupGroup.fields) {
                const groupId = `group_${groupIndex++}`;
                this.entityGroups.set(groupId, {
                    entityId: null,
                    entityLabel: '',
                    fieldIds: [field.id]
                });
            }
        }
    }

    /**
     * Create DOM structure
     */
    _createDOM() {
        // Overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'entity-resolution-overlay';

        // Container
        this.container = document.createElement('div');
        this.container.className = 'entity-resolution-container';

        this.overlay.appendChild(this.container);
        document.body.appendChild(this.overlay);
    }

    /**
     * Render the UI
     */
    _render() {
        const totalDuplicates = this.duplicateGroups.reduce((sum, g) => sum + g.fields.length, 0);

        this.container.innerHTML = `
            <div class="entity-resolution-header">
                <h2>זיהוי ישויות</h2>
                <p class="entity-resolution-subtitle">
                    נמצאו ${this.duplicateGroups.length} שדות כפולים (${totalDuplicates} שדות סה"כ).
                    <br>קבץ שדות השייכים לאותה ישות.
                </p>
            </div>

            <div class="entity-resolution-body">
                ${this._renderDuplicateGroups()}
            </div>

            <div class="entity-resolution-footer">
                <button class="btn-secondary" id="entity-cancel-btn">ביטול</button>
                <button class="btn-primary" id="entity-confirm-btn">אישור</button>
            </div>
        `;

        // Bind footer buttons
        this.container.querySelector('#entity-cancel-btn').addEventListener('click', () => this._onCancel());
        this.container.querySelector('#entity-confirm-btn').addEventListener('click', () => this._onConfirm());

        // Setup drag & drop
        this._setupDragAndDrop();
    }

    /**
     * Render duplicate groups
     */
    _renderDuplicateGroups() {
        return this.duplicateGroups.map(dupGroup => `
            <div class="duplicate-group">
                <div class="duplicate-group-header">
                    <span class="duplicate-label">"${dupGroup.label_he}"</span>
                    <span class="duplicate-count">מופיע ${dupGroup.fields.length} פעמים</span>
                </div>

                <div class="duplicate-group-content">
                    <div class="entity-groups-container" data-label="${dupGroup.label_he}">
                        ${this._renderEntityGroupsForLabel(dupGroup)}
                    </div>

                    <button class="btn-add-group" data-label="${dupGroup.label_he}">
                        + קבוצה חדשה
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render entity groups for a specific label
     */
    _renderEntityGroupsForLabel(dupGroup) {
        // Find all groups that contain fields from this duplicate group
        const relevantGroups = [];
        const fieldIds = new Set(dupGroup.fields.map(f => f.id));

        for (const [groupId, group] of this.entityGroups) {
            if (group.fieldIds.some(fid => fieldIds.has(fid))) {
                relevantGroups.push({ groupId, ...group });
            }
        }

        return relevantGroups.map((group, idx) => `
            <div class="entity-group" data-group-id="${group.groupId}">
                <div class="entity-group-header">
                    <span class="entity-group-title">קבוצה ${idx + 1}</span>
                    ${relevantGroups.length > 1 ? `
                        <button class="btn-remove-group" data-group-id="${group.groupId}" title="מחק קבוצה">×</button>
                    ` : ''}
                </div>

                <div class="entity-group-dropzone" data-group-id="${group.groupId}">
                    ${this._renderFieldCards(group.fieldIds, dupGroup)}
                </div>

                <div class="entity-group-naming">
                    ${this._renderEntitySelector(group)}
                </div>
            </div>
        `).join('');
    }

    /**
     * Render field cards
     */
    _renderFieldCards(fieldIds, dupGroup) {
        return fieldIds.map(fieldId => {
            const field = dupGroup.fields.find(f => f.id === fieldId);
            if (!field) return '';

            return `
                <div class="field-card" draggable="true" data-field-id="${field.id}">
                    <div class="field-card-label">${field.label_he}</div>
                    <div class="field-card-info">
                        ${field.canonical ? `<span class="field-card-canonical">${field.canonical}</span>` : ''}
                        <span class="field-card-page">עמוד ${field.page || 1}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Render entity selector (dropdown with existing + new option)
     */
    _renderEntitySelector(group) {
        const options = this.existingEntities.map(e =>
            `<option value="${e.entityId}" ${group.entityId === e.entityId ? 'selected' : ''}>${e.entityLabel}</option>`
        ).join('');

        return `
            <label>שם הישות:</label>
            <div class="entity-selector-wrapper">
                ${this.existingEntities.length > 0 ? `
                    <select class="entity-select" data-group-id="${group.groupId}">
                        <option value="">-- בחר או צור חדש --</option>
                        ${options}
                        <option value="__new__">+ ישות חדשה...</option>
                    </select>
                ` : ''}
                <input type="text"
                       class="entity-input"
                       data-group-id="${group.groupId}"
                       placeholder="הקלד שם ישות..."
                       value="${group.entityLabel || ''}"
                       ${this.existingEntities.length > 0 && group.entityId ? 'style="display:none"' : ''}>
            </div>
        `;
    }

    /**
     * Setup drag and drop functionality
     */
    _setupDragAndDrop() {
        // Draggable cards
        this.container.querySelectorAll('.field-card').forEach(card => {
            card.addEventListener('dragstart', (e) => this._onDragStart(e));
            card.addEventListener('dragend', (e) => this._onDragEnd(e));
        });

        // Dropzones
        this.container.querySelectorAll('.entity-group-dropzone').forEach(zone => {
            zone.addEventListener('dragover', (e) => this._onDragOver(e));
            zone.addEventListener('dragleave', (e) => this._onDragLeave(e));
            zone.addEventListener('drop', (e) => this._onDrop(e));
        });

        // Add group buttons
        this.container.querySelectorAll('.btn-add-group').forEach(btn => {
            btn.addEventListener('click', (e) => this._onAddGroup(e));
        });

        // Remove group buttons
        this.container.querySelectorAll('.btn-remove-group').forEach(btn => {
            btn.addEventListener('click', (e) => this._onRemoveGroup(e));
        });

        // Entity selectors
        this.container.querySelectorAll('.entity-select').forEach(select => {
            select.addEventListener('change', (e) => this._onEntitySelect(e));
        });

        // Entity inputs
        this.container.querySelectorAll('.entity-input').forEach(input => {
            input.addEventListener('input', (e) => this._onEntityInput(e));
        });
    }

    /**
     * Bind global events
     */
    _bindEvents() {
        // ESC to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this._onCancel();
            }
        });
    }

    // ============ Drag & Drop Handlers ============

    _onDragStart(e) {
        this.draggedCard = e.target;
        this.draggedFieldId = e.target.dataset.fieldId;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    _onDragEnd(e) {
        e.target.classList.remove('dragging');
        this.draggedCard = null;
        this.draggedFieldId = null;

        // Remove all drag-over states
        this.container.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
    }

    _onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    }

    _onDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    _onDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');

        if (!this.draggedFieldId) return;

        const targetGroupId = e.currentTarget.dataset.groupId;

        // Find source group and remove field from it
        for (const [groupId, group] of this.entityGroups) {
            const idx = group.fieldIds.indexOf(this.draggedFieldId);
            if (idx !== -1) {
                group.fieldIds.splice(idx, 1);

                // Remove empty groups
                if (group.fieldIds.length === 0) {
                    this.entityGroups.delete(groupId);
                }
                break;
            }
        }

        // Add field to target group
        const targetGroup = this.entityGroups.get(targetGroupId);
        if (targetGroup) {
            targetGroup.fieldIds.push(this.draggedFieldId);
        }

        // Re-render
        this._render();
    }

    // ============ Group Management ============

    _onAddGroup(e) {
        const label = e.target.dataset.label;
        const groupId = `group_${Date.now()}`;

        this.entityGroups.set(groupId, {
            entityId: null,
            entityLabel: '',
            fieldIds: []
        });

        // Re-render
        this._render();
    }

    _onRemoveGroup(e) {
        e.stopPropagation();
        const groupId = e.target.dataset.groupId;
        const group = this.entityGroups.get(groupId);

        if (!group) return;

        // Move fields to another group
        if (group.fieldIds.length > 0) {
            // Find another group with same label fields
            for (const [otherGroupId, otherGroup] of this.entityGroups) {
                if (otherGroupId !== groupId && otherGroup.fieldIds.length > 0) {
                    otherGroup.fieldIds.push(...group.fieldIds);
                    break;
                }
            }
        }

        this.entityGroups.delete(groupId);
        this._render();
    }

    // ============ Entity Selection ============

    _onEntitySelect(e) {
        const groupId = e.target.dataset.groupId;
        const value = e.target.value;
        const group = this.entityGroups.get(groupId);

        if (!group) return;

        if (value === '__new__') {
            // Show input field
            const input = this.container.querySelector(`.entity-input[data-group-id="${groupId}"]`);
            if (input) {
                input.style.display = '';
                input.focus();
            }
            group.entityId = null;
            group.entityLabel = '';
        } else if (value) {
            // Use existing entity
            const existing = this.existingEntities.find(e => e.entityId === value);
            if (existing) {
                group.entityId = existing.entityId;
                group.entityLabel = existing.entityLabel;

                // Hide input
                const input = this.container.querySelector(`.entity-input[data-group-id="${groupId}"]`);
                if (input) input.style.display = 'none';
            }
        }
    }

    _onEntityInput(e) {
        const groupId = e.target.dataset.groupId;
        const value = e.target.value.trim();
        const group = this.entityGroups.get(groupId);

        if (!group) return;

        group.entityLabel = value;
        group.entityId = value ? `entity_${this._hashString(value)}` : null;
    }

    // ============ Actions ============

    _onCancel() {
        this.hide();
        if (this.rejectPromise) {
            this.rejectPromise({ cancelled: true });
        }
    }

    _onConfirm() {
        // Validate: all groups with fields must have entity name
        const errors = [];

        for (const [groupId, group] of this.entityGroups) {
            if (group.fieldIds.length > 0 && !group.entityLabel) {
                errors.push(`קבוצה עם ${group.fieldIds.length} שדות חסרה שם ישות`);
            }
        }

        if (errors.length > 0) {
            alert('שגיאות:\n' + errors.join('\n'));
            return;
        }

        // Apply entity assignments to fields
        const updatedFields = [];

        for (const [groupId, group] of this.entityGroups) {
            if (group.fieldIds.length === 0) continue;

            for (const fieldId of group.fieldIds) {
                state.updateField(fieldId, {
                    entityId: group.entityId,
                    entityLabel: group.entityLabel,
                    status: 'complete'
                });

                updatedFields.push(fieldId);
            }
        }

        console.log('[EntityResolutionScreen] Resolved', updatedFields.length, 'fields');

        this.hide();

        if (this.resolvePromise) {
            this.resolvePromise({
                resolved: true,
                fieldCount: updatedFields.length,
                entityGroups: Array.from(this.entityGroups.values())
            });
        }
    }

    // ============ Utilities ============

    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
}

// Singleton
export const entityResolutionScreen = new EntityResolutionScreen();
