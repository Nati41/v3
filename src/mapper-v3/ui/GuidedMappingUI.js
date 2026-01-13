/**
 * GuidedMappingUI - Sequential Field Mapping Interface
 * Version 1.0
 *
 * Provides a guided mapping experience where:
 * - One field is shown at a time
 * - User draws a bounding box for each field
 * - Automatically advances to next field after mapping
 * - Shows progress and section transitions
 *
 * Uses Field Intelligence data from FieldIntelligenceStore
 * Does NOT modify any existing mapping functionality
 */

import { eventBus, Events } from '../core/EventBus.js';
import { fieldIntelligenceStore } from '../core/FieldIntelligenceStore.js';
import { state } from '../core/StateManager.js';
import { TableEvents } from '../tables/TableFlowController.js';
import { mapper } from '../core/MapperCore.js';

// Guided mapping states
export const GuidedMappingState = {
    INACTIVE: 'inactive',
    READY: 'ready',
    MAPPING: 'mapping',      // Waiting for user to draw box
    COMPLETED: 'completed',
    PAUSED: 'paused'
};

// Events emitted by GuidedMappingUI
export const GuidedMappingEvents = {
    ACTIVATED: 'guidedMapping:activated',
    DEACTIVATED: 'guidedMapping:deactivated',
    FIELD_ACTIVATED: 'guidedMapping:fieldActivated',
    FIELD_MAPPED: 'guidedMapping:fieldMapped',
    FIELD_SKIPPED: 'guidedMapping:fieldSkipped',
    SECTION_CHANGED: 'guidedMapping:sectionChanged',
    COMPLETED: 'guidedMapping:completed'
};

export class GuidedMappingUI {
    constructor() {
        this._container = null;
        this._state = GuidedMappingState.INACTIVE;
        this._currentOrder = 0;
        this._mappedCount = 0;
        this._skippedCount = 0;
        this._currentSectionId = null;
        this._isInitialized = false;
        this._autoAdvanceTimeout = null;  // V3.5: Track auto-advance timeout
    }

    /**
     * Initialize the UI component
     * @param {HTMLElement} parentContainer - Container to attach UI to
     */
    init(parentContainer = null) {
        if (this._isInitialized) return;

        // Create UI container
        this._container = document.createElement('div');
        this._container.id = 'guided-mapping-panel';
        this._container.className = 'guided-mapping-panel';
        this._container.innerHTML = this._getTemplate();
        this._container.style.display = 'none';

        // Add styles
        this._addStyles();

        // Add to DOM - append to sidebar or specified parent
        const parent = parentContainer || document.querySelector('.sidebar') || document.body;
        parent.appendChild(this._container);

        // Setup event listeners
        this._setupListeners();

        this._isInitialized = true;
        console.log('[GuidedMappingUI] Initialized');
    }

    /**
     * Get HTML template
     */
    _getTemplate() {
        return `
            <div class="guided-panel-header">
                <div class="guided-title">
                    <span class="guided-icon">🎯</span>
                    <span>מיפוי מודרך</span>
                </div>
                <button class="guided-close" title="סגור מצב מודרך">&times;</button>
            </div>

            <div class="guided-progress-section">
                <div class="progress-stats">
                    <span class="progress-text">שדה <span id="guided-current">0</span> מתוך <span id="guided-total">0</span></span>
                    <span class="progress-percent" id="guided-percent">0%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" id="guided-progress-bar"></div>
                </div>
            </div>

            <div class="guided-section-indicator" id="guided-section-indicator">
                <span class="section-icon">📂</span>
                <span class="section-name" id="guided-section-name">-</span>
            </div>

            <div class="guided-field-card" id="guided-field-card">
                <div class="field-order" id="guided-field-order">#1</div>
                <div class="field-name" id="guided-field-name">שם השדה</div>
                <div class="field-instruction">צייר מלבן על הטופס לסימון השדה</div>
            </div>

            <div class="guided-actions">
                <button class="guided-btn guided-btn-secondary" id="btn-guided-prev" disabled>
                    <span>◀</span> הקודם
                </button>
                <button class="guided-btn guided-btn-skip" id="btn-guided-skip">
                    דלג
                </button>
                <button class="guided-btn guided-btn-secondary" id="btn-guided-next" disabled>
                    הבא <span>▶</span>
                </button>
            </div>

            <div class="guided-status" id="guided-status">
                <span class="status-dot waiting"></span>
                <span class="status-text">ממתין לציור מלבן...</span>
            </div>

            <div class="guided-footer">
                <button class="guided-btn-link" id="btn-guided-exit">
                    יציאה ממצב מודרך
                </button>
            </div>

            <!-- Completion screen -->
            <div class="guided-completion hidden" id="guided-completion">
                <div class="completion-icon">🎉</div>
                <div class="completion-title">המיפוי הושלם!</div>
                <div class="completion-stats">
                    <div class="stat-item">
                        <span class="stat-value" id="completion-mapped">0</span>
                        <span class="stat-label">שדות מופו</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="completion-skipped">0</span>
                        <span class="stat-label">שדות דולגו</span>
                    </div>
                </div>
                <button class="guided-btn guided-btn-primary" id="btn-completion-close">
                    סיום
                </button>
            </div>
        `;
    }

    /**
     * Add component styles
     */
    _addStyles() {
        if (document.getElementById('guided-mapping-styles')) return;

        const style = document.createElement('style');
        style.id = 'guided-mapping-styles';
        style.textContent = `
            .guided-mapping-panel {
                position: fixed;
                top: 100px;
                right: 20px;
                width: 300px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                z-index: 1000;
                direction: rtl;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                cursor: default;
            }

            .guided-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 14px 16px;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                cursor: grab;
                user-select: none;
            }

            .guided-panel-header:active {
                cursor: grabbing;
            }

            .guided-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                font-size: 15px;
            }

            .guided-icon {
                font-size: 18px;
            }

            .guided-close {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 28px;
                height: 28px;
                border-radius: 6px;
                font-size: 18px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .guided-close:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            .guided-progress-section {
                padding: 16px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
            }

            .progress-stats {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 13px;
                color: #4b5563;
            }

            .progress-percent {
                font-weight: 600;
                color: #059669;
            }

            .progress-bar-container {
                height: 8px;
                background: #e5e7eb;
                border-radius: 4px;
                overflow: hidden;
            }

            .progress-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #10b981, #059669);
                width: 0%;
                transition: width 0.3s ease;
                border-radius: 4px;
            }

            .guided-section-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                background: #ecfdf5;
                border-bottom: 1px solid #d1fae5;
                font-size: 13px;
                color: #047857;
            }

            .section-icon {
                font-size: 14px;
            }

            .section-name {
                font-weight: 500;
            }

            .guided-field-card {
                padding: 20px 16px;
                text-align: center;
            }

            .field-order {
                display: inline-block;
                background: #10b981;
                color: white;
                font-size: 12px;
                font-weight: 600;
                padding: 4px 10px;
                border-radius: 12px;
                margin-bottom: 12px;
            }

            .field-name {
                font-size: 20px;
                font-weight: 600;
                color: #111827;
                margin-bottom: 8px;
                line-height: 1.3;
            }

            .field-instruction {
                font-size: 13px;
                color: #6b7280;
            }

            .guided-actions {
                display: flex;
                gap: 8px;
                padding: 0 16px 16px;
            }

            .guided-btn {
                flex: 1;
                padding: 10px 12px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                border: none;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
            }

            .guided-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }

            .guided-btn-primary {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
            }

            .guided-btn-primary:hover:not(:disabled) {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
            }

            .guided-btn-secondary {
                background: #f3f4f6;
                color: #374151;
                border: 1px solid #d1d5db;
            }

            .guided-btn-secondary:hover:not(:disabled) {
                background: #e5e7eb;
            }

            .guided-btn-skip {
                background: #fef3c7;
                color: #92400e;
                border: 1px solid #fcd34d;
            }

            .guided-btn-skip:hover {
                background: #fde68a;
            }

            .guided-status {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 12px 16px;
                background: #f9fafb;
                border-top: 1px solid #e5e7eb;
                font-size: 13px;
                color: #6b7280;
            }

            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
            }

            .status-dot.waiting {
                background: #fbbf24;
                animation: pulse 1.5s infinite;
            }

            .status-dot.mapped {
                background: #10b981;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            .guided-footer {
                padding: 12px 16px;
                text-align: center;
                border-top: 1px solid #e5e7eb;
            }

            .guided-btn-link {
                background: none;
                border: none;
                color: #6b7280;
                font-size: 13px;
                cursor: pointer;
                text-decoration: underline;
            }

            .guided-btn-link:hover {
                color: #374151;
            }

            /* Completion screen */
            .guided-completion {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: white;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 30px;
                text-align: center;
            }

            .completion-icon {
                font-size: 64px;
                margin-bottom: 16px;
            }

            .completion-title {
                font-size: 24px;
                font-weight: 600;
                color: #111827;
                margin-bottom: 20px;
            }

            .completion-stats {
                display: flex;
                gap: 30px;
                margin-bottom: 24px;
            }

            .stat-item {
                text-align: center;
            }

            .stat-value {
                display: block;
                font-size: 32px;
                font-weight: 700;
                color: #10b981;
            }

            .stat-label {
                font-size: 13px;
                color: #6b7280;
            }

            .hidden {
                display: none !important;
            }

            /* Table group prompt styles */
            .table-group-prompt {
                text-align: center;
                padding: 10px 0;
            }

            .table-group-prompt .table-icon {
                font-size: 48px;
                margin-bottom: 12px;
            }

            .table-group-prompt .table-info {
                margin-bottom: 16px;
            }

            .table-group-prompt .table-name {
                font-size: 18px;
                font-weight: 600;
                color: #111827;
                margin-bottom: 4px;
            }

            .table-group-prompt .table-details {
                font-size: 13px;
                color: #6b7280;
            }

            .table-group-prompt .table-actions {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .table-group-prompt .btn-table-flow {
                width: 100%;
                padding: 12px 16px;
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }

            .table-group-prompt .btn-table-flow:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
            }

            .table-group-prompt .btn-skip-table {
                width: 100%;
                padding: 10px 16px;
                background: #fef3c7;
                color: #92400e;
                border: 1px solid #fcd34d;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }

            .table-group-prompt .btn-skip-table:hover {
                background: #fde68a;
            }

            .table-group-prompt .btn-map-individually {
                width: 100%;
                padding: 10px 16px;
                background: #f3f4f6;
                color: #374151;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }

            .table-group-prompt .btn-map-individually:hover {
                background: #e5e7eb;
            }

            /* Table status dot */
            .status-dot.table {
                background: #3b82f6;
                animation: pulse 1.5s infinite;
            }

            .status-dot.paused {
                background: #8b5cf6;
            }

            /* Animation for new field */
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            .field-animate {
                animation: slideIn 0.3s ease;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Setup event listeners
     */
    _setupListeners() {
        // Close button
        this._container.querySelector('.guided-close').addEventListener('click', () => {
            this.deactivate();
        });

        // Exit link
        this._container.querySelector('#btn-guided-exit').addEventListener('click', () => {
            this.deactivate();
        });

        // Drag functionality
        this._setupDrag();

        // Navigation buttons
        this._container.querySelector('#btn-guided-prev').addEventListener('click', () => {
            this._goToPrevious();
        });

        this._container.querySelector('#btn-guided-next').addEventListener('click', () => {
            this._goToNext();
        });

        // Skip button
        this._container.querySelector('#btn-guided-skip').addEventListener('click', () => {
            this._skipCurrent();
        });

        // Completion close
        this._container.querySelector('#btn-completion-close').addEventListener('click', () => {
            this.deactivate();
        });

        // Listen for field mapping events from DrawController
        eventBus.on(Events.FIELD_CREATED, (data) => {
            if (this._state === GuidedMappingState.MAPPING) {
                this._onFieldMapped(data);
            }
        });

        // Also listen for box drawn events
        eventBus.on('overlay:boxDrawn', (data) => {
            if (this._state === GuidedMappingState.MAPPING) {
                // Box was drawn, field will be created
                this._updateStatus('mapped', 'מלבן נוצר, ממתין לשמירה...');
            }
        });

        // V3.5: Listen for TableFlowUI completion to resume guided mapping
        eventBus.on(TableEvents.TABLE_FLOW_FINISHED, ({ tableData }) => {
            if (this._state === GuidedMappingState.PAUSED && this._pendingTableGroupId) {
                console.log('[GuidedMappingUI] TableFlowUI finished, resuming guided mapping');
                this._onTableFlowCompleted(true);
            }
        });

        // V3.5: Listen for TableFlowUI cancellation
        eventBus.on(TableEvents.TABLE_FLOW_CANCELLED, () => {
            if (this._state === GuidedMappingState.PAUSED && this._pendingTableGroupId) {
                console.log('[GuidedMappingUI] TableFlowUI cancelled, resuming guided mapping');
                this._onTableFlowCompleted(false);
            }
        });

        // V3.6: Listen for TableToolbarMode STARTED - pause guided mapping
        eventBus.on('tableToolbar:started', ({ tableId, tableName }) => {
            // Only pause if we're actively in MAPPING state
            if (this._state === GuidedMappingState.MAPPING) {
                console.log('[GuidedMappingUI] TableToolbarMode started externally, pausing guided mapping');
                this._state = GuidedMappingState.PAUSED;
                this._pendingTableGroupId = tableId || 'external_table';
                this._updateStatus('paused', `מיפוי טבלה: ${tableName || 'טבלה חדשה'}...`);
            }
        });

        // V3.6: Listen for TableToolbarMode completion
        eventBus.on('tableToolbar:completed', ({ tableId, fields }) => {
            if (this._state === GuidedMappingState.PAUSED) {
                console.log('[GuidedMappingUI] TableToolbarMode finished, resuming guided mapping');
                this._onTableFlowCompleted(true);
            }
        });

        // V3.6: Listen for TableToolbarMode cancellation
        eventBus.on('tableToolbar:cancelled', () => {
            if (this._state === GuidedMappingState.PAUSED) {
                console.log('[GuidedMappingUI] TableToolbarMode cancelled, resuming guided mapping');
                this._onTableFlowCompleted(false);
            }
        });

        // V3.5: Sync with undo/redo - recalculate mapped count when history changes
        eventBus.on(Events.HISTORY_UNDO, () => {
            if (this._state === GuidedMappingState.MAPPING) {
                this._syncMappedCountWithState();
            }
        });

        eventBus.on(Events.HISTORY_REDO, () => {
            if (this._state === GuidedMappingState.MAPPING) {
                this._syncMappedCountWithState();
            }
        });
    }

    /**
     * V3.5: Sync mapped count with actual state after undo/redo
     * Recounts how many fields have been mapped based on actual field count
     */
    _syncMappedCountWithState() {
        // Count mapped fields in current state
        const allFields = state.get('fields') || [];
        const mappedCount = allFields.filter(f => f.isMapped).length;

        const oldMappedCount = this._mappedCount;
        this._mappedCount = mappedCount;

        // Refresh current field display to show correct mapped status
        this._updateProgress();
        this._showCurrentField();

        console.log(`[GuidedMappingUI] Synced after undo/redo: mappedCount ${oldMappedCount} → ${mappedCount}`);
    }

    /**
     * Setup drag functionality for the panel
     */
    _setupDrag() {
        const header = this._container.querySelector('.guided-panel-header');
        let isDragging = false;
        let startX, startY, initialX, initialY;

        header.addEventListener('mousedown', (e) => {
            // Don't drag if clicking on close button
            if (e.target.closest('.guided-close')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = this._container.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;

            // Prevent text selection while dragging
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newX = initialX + deltaX;
            let newY = initialY + deltaY;

            // Keep within viewport bounds
            const maxX = window.innerWidth - this._container.offsetWidth;
            const maxY = window.innerHeight - this._container.offsetHeight;

            newX = Math.max(0, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));

            this._container.style.left = `${newX}px`;
            this._container.style.top = `${newY}px`;
            this._container.style.right = 'auto'; // Clear right positioning
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    /**
     * Activate guided mapping mode
     * @returns {boolean} Success
     */
    activate() {
        if (!fieldIntelligenceStore.hasCurrent()) {
            console.error('[GuidedMappingUI] No Field Intelligence loaded');
            return false;
        }

        const totalFields = fieldIntelligenceStore.getFieldCount();
        if (totalFields === 0) {
            console.error('[GuidedMappingUI] No fields to map');
            return false;
        }

        // Reset state
        this._currentOrder = 1;
        this._mappedCount = 0;
        this._skippedCount = 0;
        this._currentSectionId = null;
        this._state = GuidedMappingState.MAPPING;

        // V3.5: Hide draft indicator during guided mapping
        if (mapper && mapper.setGuidedMappingActive) {
            mapper.setGuidedMappingActive(true);
        }

        // Update UI
        this._container.querySelector('#guided-total').textContent = totalFields;
        this._container.querySelector('#guided-completion').classList.add('hidden');
        this._container.style.display = 'block';

        // Show first field
        this._showCurrentField();

        // Emit activation event
        eventBus.emit(GuidedMappingEvents.ACTIVATED, { totalFields });

        console.log(`[GuidedMappingUI] Activated with ${totalFields} fields`);
        return true;
    }

    /**
     * Deactivate guided mapping mode
     * V3.5: Clean up any pending timeouts
     */
    deactivate() {
        this._state = GuidedMappingState.INACTIVE;
        this._container.style.display = 'none';

        // V3.5: Clear auto-advance timeout to prevent orphaned callbacks
        if (this._autoAdvanceTimeout) {
            clearTimeout(this._autoAdvanceTimeout);
            this._autoAdvanceTimeout = null;
        }

        // V3.5: Restore draft indicator visibility
        if (mapper && mapper.setGuidedMappingActive) {
            mapper.setGuidedMappingActive(false);
        }

        eventBus.emit(GuidedMappingEvents.DEACTIVATED, {
            mappedCount: this._mappedCount,
            skippedCount: this._skippedCount
        });

        console.log('[GuidedMappingUI] Deactivated');
    }

    /**
     * Show the current field to map
     * V3.5: Enhanced with mapped field detection and better button states
     * V3.6: Added guard against double table prompts
     */
    _showCurrentField() {
        // V3.6: Don't show anything if we're PAUSED (table flow in progress)
        if (this._state === GuidedMappingState.PAUSED) {
            console.log('[GuidedMappingUI] _showCurrentField called while PAUSED, ignoring');
            return;
        }

        // V3.6: Don't show anything if table toolbar is still active
        if (window.tableToolbarMode?.isActive?.()) {
            console.log('[GuidedMappingUI] _showCurrentField called while table mode active, ignoring');
            return;
        }

        const field = fieldIntelligenceStore.getFieldAtOrder(this._currentOrder);
        if (!field) {
            // No more fields - show completion
            this._showCompletion();
            return;
        }

        const totalFields = fieldIntelligenceStore.getFieldCount();

        // V3.5: Check if this field is part of a table group
        const fullField = fieldIntelligenceStore.getFieldFull(field.id);
        const groupId = fullField?.rules?.part_of_group;

        if (groupId && this._isTableGroup(groupId)) {
            // This is a table field - show table handling options
            this._showTableGroupPrompt(groupId, field);
            return;
        }

        // V3.5: Check if this field was already mapped (for when going back)
        const isAlreadyMapped = this._isFieldAlreadyMapped(field);

        // Update progress
        const percent = Math.round(((this._currentOrder - 1) / totalFields) * 100);
        this._container.querySelector('#guided-current').textContent = this._currentOrder;
        this._container.querySelector('#guided-percent').textContent = `${percent}%`;
        this._container.querySelector('#guided-progress-bar').style.width = `${percent}%`;

        // Update section indicator
        const section = fieldIntelligenceStore.getFieldSection(field.id);
        if (section && section.id !== this._currentSectionId) {
            this._currentSectionId = section.id;
            this._container.querySelector('#guided-section-name').textContent = section.name_he || section.id;

            // Emit section change event
            eventBus.emit(GuidedMappingEvents.SECTION_CHANGED, { section });
        }

        // Update field card
        const fieldCard = this._container.querySelector('#guided-field-card');
        fieldCard.classList.remove('field-animate');
        void fieldCard.offsetWidth; // Trigger reflow
        fieldCard.classList.add('field-animate');

        this._container.querySelector('#guided-field-order').textContent = `#${this._currentOrder}`;
        this._container.querySelector('#guided-field-name').textContent = field.name_he;

        // V3.5: Update navigation buttons - Next is ALWAYS enabled (acts as skip)
        const prevBtn = this._container.querySelector('#btn-guided-prev');
        const nextBtn = this._container.querySelector('#btn-guided-next');
        const skipBtn = this._container.querySelector('#btn-guided-skip');

        prevBtn.disabled = this._currentOrder <= 1;
        nextBtn.disabled = this._currentOrder >= totalFields; // Only disable at end

        // V3.5: Hide skip button since Next now acts as skip
        if (skipBtn) {
            skipBtn.style.display = 'none';
        }

        // V3.5: Update status based on whether field is already mapped
        if (isAlreadyMapped) {
            this._updateStatus('mapped', '✓ שדה זה כבר מופה - ניתן להמשיך או לצייר מחדש');
            nextBtn.textContent = 'הבא ←';
        } else {
            this._updateStatus('waiting', 'ממתין לציור מלבן...');
            nextBtn.textContent = 'דלג ←';
        }

        // Emit field activation event
        eventBus.emit(GuidedMappingEvents.FIELD_ACTIVATED, {
            field,
            order: this._currentOrder,
            total: totalFields
        });
    }

    /**
     * V3.5: Check if a field from intelligence was already mapped in StateManager
     * @param {Object} intelligenceField - Field from FieldIntelligenceStore
     * @returns {boolean}
     */
    _isFieldAlreadyMapped(intelligenceField) {
        const allFields = state.get('fields') || [];

        // Look for a mapped field with matching name
        return allFields.some(f =>
            f.isMapped &&
            (f.label_he === intelligenceField.name_he ||
             f.label_en === intelligenceField.name_en)
        );
    }

    /**
     * Handle field mapped
     * V3.5: Enhanced with better UX - shows success, updates buttons, auto-advances
     */
    _onFieldMapped(data) {
        const currentField = fieldIntelligenceStore.getFieldAtOrder(this._currentOrder);
        if (!currentField) return;

        this._mappedCount++;
        this._updateStatus('mapped', '✓ שדה מופה בהצלחה!');
        this._updateProgress();

        // V3.5: Update next button to show it's ready
        const nextBtn = this._container.querySelector('#btn-guided-next');
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.textContent = 'הבא ←';
        }

        // Emit event
        eventBus.emit(GuidedMappingEvents.FIELD_MAPPED, {
            fieldId: currentField.id,
            internalFieldId: data.id,
            order: this._currentOrder
        });

        // V3.5: Clear any existing timeout to prevent race conditions
        if (this._autoAdvanceTimeout) {
            clearTimeout(this._autoAdvanceTimeout);
            this._autoAdvanceTimeout = null;
        }

        // V3.5: Auto-advance after delay - but longer delay to let user see success
        this._autoAdvanceTimeout = setTimeout(() => {
            this._autoAdvanceTimeout = null;
            if (this._state === GuidedMappingState.MAPPING) {
                this._goToNext();
            }
        }, 800); // Increased from 500ms to 800ms for better UX
    }

    /**
     * Skip current field (legacy - now redirects to _goToNext)
     */
    _skipCurrent() {
        this._goToNext();
    }

    /**
     * Go to next field
     * V3.5: Also acts as "skip" - if field wasn't mapped, count as skipped
     */
    _goToNext() {
        const totalFields = fieldIntelligenceStore.getFieldCount();
        if (this._currentOrder >= totalFields) {
            this._showCompletion();
            return;
        }

        // V3.5: If current field wasn't mapped, count as skipped
        const currentField = fieldIntelligenceStore.getFieldAtOrder(this._currentOrder);
        if (currentField && !this._isFieldAlreadyMapped(currentField)) {
            this._skippedCount++;
            eventBus.emit(GuidedMappingEvents.FIELD_SKIPPED, {
                fieldId: currentField.id,
                order: this._currentOrder
            });
        }

        this._currentOrder++;
        this._showCurrentField();
    }

    /**
     * Go to previous field
     * V3.5: Now properly shows mapped status when going back
     */
    _goToPrevious() {
        if (this._currentOrder <= 1) return;

        // V3.5: If we're going back from a skipped field, decrement skip count
        const currentField = fieldIntelligenceStore.getFieldAtOrder(this._currentOrder);
        if (currentField && !this._isFieldAlreadyMapped(currentField)) {
            // Don't decrement skip count - user is just navigating
        }

        this._currentOrder--;
        this._showCurrentField();
    }

    /**
     * Update status indicator
     */
    _updateStatus(status, message) {
        const statusDot = this._container.querySelector('.status-dot');
        const statusText = this._container.querySelector('.status-text');

        if (statusDot) statusDot.className = `status-dot ${status}`;
        if (statusText) statusText.textContent = message;
    }

    /**
     * V3.5: Update progress display
     */
    _updateProgress() {
        const totalFields = fieldIntelligenceStore.getFieldCount();
        if (totalFields === 0) return;

        const percent = Math.round((this._mappedCount / totalFields) * 100);

        const currentEl = this._container.querySelector('#guided-current');
        const percentEl = this._container.querySelector('#guided-percent');
        const progressBar = this._container.querySelector('#guided-progress-bar');

        if (currentEl) currentEl.textContent = this._currentOrder;
        if (percentEl) percentEl.textContent = `${percent}%`;
        if (progressBar) progressBar.style.width = `${percent}%`;
    }

    /**
     * Show completion screen
     */
    _showCompletion() {
        this._state = GuidedMappingState.COMPLETED;

        // Update completion stats
        this._container.querySelector('#completion-mapped').textContent = this._mappedCount;
        this._container.querySelector('#completion-skipped').textContent = this._skippedCount;

        // Show completion overlay
        this._container.querySelector('#guided-completion').classList.remove('hidden');

        // Emit completion event
        eventBus.emit(GuidedMappingEvents.COMPLETED, {
            mappedCount: this._mappedCount,
            skippedCount: this._skippedCount,
            totalFields: fieldIntelligenceStore.getFieldCount()
        });

        console.log(`[GuidedMappingUI] Completed: ${this._mappedCount} mapped, ${this._skippedCount} skipped`);
    }

    // ═══════════════════════════════════════════════════════════════
    // V3.5: TABLE GROUP HANDLING
    // ═══════════════════════════════════════════════════════════════

    /**
     * Check if a group ID represents a table
     * V3.5: Simply trust the AI's is_table flag - no magic numbers, no guessing
     *
     * The AI decides what's a table based on semantic criteria:
     * 1. Semantic repetition (same purpose repeating)
     * 2. Explicit multiplicity (form indicates "for each...", "row 1,2,3...")
     * 3. Identical structure (same properties in each instance)
     * 4. Open-ended logic (variable number of instances)
     *
     * @param {string} groupId - Group identifier
     * @returns {boolean}
     */
    _isTableGroup(groupId) {
        const intelligence = fieldIntelligenceStore.getCurrent();
        if (!intelligence?.field_groups) return false;

        const group = intelligence.field_groups.find(g => g.id === groupId);
        if (!group) return false;

        // Trust the AI's decision - it uses semantic understanding
        const isTable = group.is_table === true;

        if (isTable) {
            console.log(`[GuidedMappingUI] Group "${groupId}" IS a table (AI decision)`, {
                justification: group.table_justification || 'No justification provided',
                instances: group.instances,
                properties: group.properties
            });
        }

        return isTable;
    }

    /**
     * Get info about a table group
     * @param {string} groupId - Group identifier
     * @returns {Object|null}
     */
    _getTableGroupInfo(groupId) {
        const intelligence = fieldIntelligenceStore.getCurrent();
        if (!intelligence?.field_groups) return null;

        const group = intelligence.field_groups.find(g => g.id === groupId);
        if (!group) return null;

        // Count how many fields belong to this group
        const groupFields = intelligence.fields.filter(f =>
            f.rules?.part_of_group === groupId
        );

        return {
            ...group,
            fieldCount: groupFields.length,
            fieldsPerRow: group.properties?.length || Math.ceil(groupFields.length / (group.instances || 1))
        };
    }

    /**
     * Show table group handling prompt
     * @param {string} groupId - Group identifier
     * @param {Object} firstField - First field of the group
     */
    _showTableGroupPrompt(groupId, firstField) {
        const groupInfo = this._getTableGroupInfo(groupId);
        if (!groupInfo) {
            // Fallback to normal field display
            return;
        }

        const fieldCard = this._container.querySelector('#guided-field-card');

        // Update card with table info
        fieldCard.innerHTML = `
            <div class="table-group-prompt">
                <div class="table-icon">📊</div>
                <div class="table-info">
                    <div class="table-name">${groupInfo.name_he || groupId}</div>
                    <div class="table-details">
                        ${groupInfo.instances} שורות × ${groupInfo.fieldsPerRow} עמודות
                        = ${groupInfo.fieldCount} שדות
                    </div>
                </div>
                <div class="table-actions">
                    <button class="btn-table-flow" id="btn-use-table-flow">
                        🎯 מפה כטבלה (מומלץ)
                    </button>
                    <button class="btn-skip-table" id="btn-skip-table">
                        ⏭️ דלג על הטבלה
                    </button>
                    <button class="btn-map-individually" id="btn-map-individually">
                        📝 מפה שדה-שדה
                    </button>
                </div>
            </div>
        `;

        // Add event listeners for table actions
        fieldCard.querySelector('#btn-use-table-flow').addEventListener('click', () => {
            this._startTableFlowForGroup(groupId, groupInfo);
        });

        fieldCard.querySelector('#btn-skip-table').addEventListener('click', () => {
            this._skipTableGroup(groupId);
        });

        fieldCard.querySelector('#btn-map-individually').addEventListener('click', () => {
            this._mapTableFieldsIndividually(groupId, firstField);
        });

        // Update status
        this._updateStatus('table', 'נמצאה טבלה - בחר אופן מיפוי');

        console.log(`[GuidedMappingUI] Showing table group prompt: ${groupId}`, groupInfo);
    }

    /**
     * Start TableToolbarMode for this table group
     * @param {string} groupId - Group identifier
     * @param {Object} groupInfo - Group info
     */
    _startTableFlowForGroup(groupId, groupInfo) {
        // Pause guided mapping
        this._state = GuidedMappingState.PAUSED;
        this._updateStatus('paused', 'מיפוי טבלה...');

        // Store the group ID so we can skip its fields after table is done
        this._pendingTableGroupId = groupId;

        // Use new TableToolbarMode
        if (window.tableToolbarMode) {
            console.log(`[GuidedMappingUI] Using TableToolbarMode for group: ${groupId}`);
            window.tableToolbarMode.start({
                aiGroupInfo: groupInfo,
                tableName: groupInfo.name_he || groupId,
                rowCount: groupInfo.instances || 0
            });
        } else if (window.tableFlowUI) {
            // Fallback to old V1
            window.tableFlowUI.startWithFieldIntelligenceGroup(groupInfo);
        }

        console.log(`[GuidedMappingUI] Started table flow for group: ${groupId}`);
    }

    /**
     * Handle TableFlowUI completion (finished or cancelled)
     * @param {boolean} completed - True if table was created, false if cancelled
     */
    _onTableFlowCompleted(completed) {
        const groupId = this._pendingTableGroupId;
        this._pendingTableGroupId = null;

        if (completed && groupId) {
            // Table was created - skip all fields in this group
            this._skipTableGroup(groupId);
        } else {
            // Table was cancelled - resume at current field (let user choose again)
            this._state = GuidedMappingState.MAPPING;

            // Restore normal field card
            const field = fieldIntelligenceStore.getFieldAtOrder(this._currentOrder);
            if (field) {
                this._restoreFieldCard();
                this._showCurrentField();
            }
        }
    }

    /**
     * Restore the field card to normal state (after table prompt)
     */
    _restoreFieldCard() {
        const fieldCard = this._container.querySelector('#guided-field-card');
        fieldCard.innerHTML = `
            <div class="field-order" id="guided-field-order">#1</div>
            <div class="field-name" id="guided-field-name">שם השדה</div>
            <div class="field-instruction">צייר מלבן על הטופס לסימון השדה</div>
        `;
    }

    /**
     * Skip all fields in a table group
     * @param {string} groupId - Group identifier
     */
    _skipTableGroup(groupId) {
        const intelligence = fieldIntelligenceStore.getCurrent();

        // V3.6: Handle case where table was started externally (not from guided mapping)
        // In this case, groupId might be 'external_table' or a tableId that doesn't match any field group
        if (!intelligence?.fields || groupId === 'external_table' || groupId?.startsWith('table_')) {
            console.log(`[GuidedMappingUI] External table completed, resuming at current position`);
            this._state = GuidedMappingState.MAPPING;
            this._restoreFieldCard();
            this._showCurrentField();
            return;
        }

        // Find all fields in this group and count them
        const groupFields = intelligence.fields.filter(f =>
            f.rules?.part_of_group === groupId
        );

        // V3.6: If no fields found in group, just resume (don't skip anything)
        if (groupFields.length === 0) {
            console.log(`[GuidedMappingUI] No fields found for group ${groupId}, resuming normally`);
            this._state = GuidedMappingState.MAPPING;
            this._restoreFieldCard();
            this._showCurrentField();
            return;
        }

        // Skip to the first field after this group
        const lastGroupFieldOrder = Math.max(...groupFields.map(f => f.order));

        // Update mapped count (table was mapped via TableFlowUI) or skipped
        // If we came from table flow completion, count as mapped
        if (this._state === GuidedMappingState.PAUSED) {
            this._mappedCount += groupFields.length;
        } else {
            this._skippedCount += groupFields.length;
        }

        // Restore mapping state
        this._state = GuidedMappingState.MAPPING;

        // Move to next field after the table
        this._currentOrder = lastGroupFieldOrder + 1;

        // Restore normal field card
        this._restoreFieldCard();

        console.log(`[GuidedMappingUI] Skipped table group: ${groupId} (${groupFields.length} fields)`);

        // Show next field
        this._showCurrentField();
    }

    /**
     * Map table fields individually (restore normal field card)
     * @param {string} groupId - Group identifier
     * @param {Object} firstField - First field to show
     */
    _mapTableFieldsIndividually(groupId, firstField) {
        // Restore normal field card template
        const fieldCard = this._container.querySelector('#guided-field-card');
        fieldCard.innerHTML = `
            <div class="field-order" id="guided-field-order">#${this._currentOrder}</div>
            <div class="field-name" id="guided-field-name">${firstField.name_he}</div>
            <div class="field-hint" id="guided-field-hint"></div>
        `;

        // Continue with normal field display
        this._continueWithNormalField(firstField);

        console.log(`[GuidedMappingUI] Mapping table fields individually: ${groupId}`);
    }

    /**
     * Continue showing current field normally (after choosing individual mapping)
     * V3.5: Updated to match new button behavior
     * @param {Object} field - The field to show
     */
    _continueWithNormalField(field) {
        const totalFields = fieldIntelligenceStore.getFieldCount();

        // V3.5: Check if already mapped
        const isAlreadyMapped = this._isFieldAlreadyMapped(field);

        // Update progress
        const percent = Math.round(((this._currentOrder - 1) / totalFields) * 100);
        this._container.querySelector('#guided-current').textContent = this._currentOrder;
        this._container.querySelector('#guided-percent').textContent = `${percent}%`;
        this._container.querySelector('#guided-progress-bar').style.width = `${percent}%`;

        // Update section indicator
        const section = fieldIntelligenceStore.getFieldSection(field.id);
        if (section && section.id !== this._currentSectionId) {
            this._currentSectionId = section.id;
            this._container.querySelector('#guided-section-name').textContent = section.name_he || section.id;
            eventBus.emit(GuidedMappingEvents.SECTION_CHANGED, { section });
        }

        // Get field hint
        const fullField = fieldIntelligenceStore.getFieldFull(field.id);
        const hint = fullField?.semantics?.purpose_short || '';
        const hintEl = this._container.querySelector('#guided-field-hint');
        if (hintEl) hintEl.textContent = hint;

        // V3.5: Update navigation buttons - Next always enabled
        const prevBtn = this._container.querySelector('#btn-guided-prev');
        const nextBtn = this._container.querySelector('#btn-guided-next');

        if (prevBtn) prevBtn.disabled = this._currentOrder <= 1;
        if (nextBtn) {
            nextBtn.disabled = this._currentOrder >= totalFields;
            nextBtn.textContent = isAlreadyMapped ? 'הבא ←' : 'דלג ←';
        }

        // Update status based on mapped state
        if (isAlreadyMapped) {
            this._updateStatus('mapped', '✓ שדה זה כבר מופה');
        } else {
            this._updateStatus('waiting', 'ממתין לציור מלבן...');
        }

        // Emit field activation event
        eventBus.emit(GuidedMappingEvents.FIELD_ACTIVATED, {
            field,
            order: this._currentOrder,
            total: totalFields
        });
    }

    /**
     * Check if guided mapping is active
     * @returns {boolean}
     */
    isActive() {
        return this._state === GuidedMappingState.MAPPING;
    }

    /**
     * Get current state
     * @returns {string}
     */
    getState() {
        return this._state;
    }

    /**
     * Get current field being mapped
     * @returns {Object|null}
     */
    getCurrentField() {
        if (!this.isActive()) return null;
        return fieldIntelligenceStore.getFieldAtOrder(this._currentOrder);
    }

    /**
     * Get mapping progress
     * @returns {Object}
     */
    getProgress() {
        return {
            current: this._currentOrder,
            total: fieldIntelligenceStore.getFieldCount(),
            mapped: this._mappedCount,
            skipped: this._skippedCount
        };
    }
}

// Singleton instance
export const guidedMappingUI = new GuidedMappingUI();
