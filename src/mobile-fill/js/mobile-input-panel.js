/**
 * mobile-input-panel.js
 * Dedicated input panel that appears above the keyboard.
 * PDF remains visual only - typing happens here.
 */
(function() {
    'use strict';

    let panelEl = null;
    let labelEl = null;
    let inputEl = null;
    let confirmBtn = null;
    let cancelBtn = null;
    let prevBtn = null;
    let nextBtn = null;

    let currentFieldId = null;
    let currentFieldLabel = null;
    let originalValue = '';
    let mappingFields = [];
    let currentFieldIndex = -1;

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; input panel disabled');
            return;
        }

        createPanel();
        bindEvents();

        // Cache mapping fields when ready
        window.MobileFillEventBus.on('MAPPING_READY', (payload) => {
            mappingFields = payload?.fieldsMapping?.fields || [];
        });

        // Listen for field tap from hotspot overlay
        window.MobileFillEventBus.on('FIELD_TAP', handleFieldTap);

        // Listen for navigation requests
        window.MobileFillEventBus.on('FIELD_NAVIGATE_PREV', () => navigateField(-1));
        window.MobileFillEventBus.on('FIELD_NAVIGATE_NEXT', () => navigateField(1));

        console.log('[MobileFill] Input panel initialized');
    }

    function createPanel() {
        // Create panel container
        panelEl = document.createElement('div');
        panelEl.id = 'mobilefill-input-panel';
        panelEl.className = 'mobilefill-input-panel is-hidden';

        // Field label
        labelEl = document.createElement('div');
        labelEl.className = 'input-panel-label';
        labelEl.textContent = '';

        // Input container
        const inputContainer = document.createElement('div');
        inputContainer.className = 'input-panel-input-container';

        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = 'input-panel-input';
        inputEl.placeholder = 'הקלד כאן...';
        inputEl.autocomplete = 'off';
        inputEl.autocapitalize = 'off';
        inputEl.spellcheck = false;

        inputContainer.appendChild(inputEl);

        // Action buttons container
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'input-panel-actions';

        // Navigation buttons
        const navGroup = document.createElement('div');
        navGroup.className = 'input-panel-nav-group';

        prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'input-panel-btn nav';
        prevBtn.innerHTML = '<span class="btn-icon">▶</span><span class="btn-text">הקודם</span>';

        nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'input-panel-btn nav';
        nextBtn.innerHTML = '<span class="btn-text">הבא</span><span class="btn-icon">◀</span>';

        navGroup.appendChild(prevBtn);
        navGroup.appendChild(nextBtn);

        // Confirm/Cancel buttons
        const actionGroup = document.createElement('div');
        actionGroup.className = 'input-panel-action-group';

        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'input-panel-btn cancel';
        cancelBtn.innerHTML = '<span class="btn-icon">✕</span><span class="btn-text">ביטול</span>';

        confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'input-panel-btn confirm';
        confirmBtn.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">אישור</span>';

        actionGroup.appendChild(cancelBtn);
        actionGroup.appendChild(confirmBtn);

        actionsContainer.appendChild(navGroup);
        actionsContainer.appendChild(actionGroup);

        // Assemble panel
        panelEl.appendChild(labelEl);
        panelEl.appendChild(inputContainer);
        panelEl.appendChild(actionsContainer);

        // Append to PDF container so it scrolls with content
        const pdfContainer = document.getElementById('mobilefill-pdf-container');
        if (pdfContainer) {
            pdfContainer.appendChild(panelEl);
        } else {
            document.body.appendChild(panelEl);
        }
    }

    function bindEvents() {
        // Input changes - emit live updates
        inputEl.addEventListener('input', () => {
            if (!currentFieldId) return;
            window.MobileFillEventBus.emit('FIELD_UPDATED', {
                fieldId: currentFieldId,
                value: inputEl.value,
                checked: null,
                tableContext: null
            });
        });

        // Keyboard shortcuts
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        // Button clicks - use touchend for mobile responsiveness
        confirmBtn.addEventListener('click', confirmEdit);
        cancelBtn.addEventListener('click', cancelEdit);
        prevBtn.addEventListener('click', () => navigateField(-1));
        nextBtn.addEventListener('click', () => navigateField(1));

        // Prevent panel touch from propagating to PDF
        panelEl.addEventListener('touchstart', (e) => e.stopPropagation());
        panelEl.addEventListener('touchmove', (e) => e.stopPropagation());
    }

    function handleFieldTap(payload) {
        const { fieldId, field } = payload || {};
        if (!fieldId) return;

        // If same field, just focus input
        if (currentFieldId === fieldId && !panelEl.classList.contains('is-hidden')) {
            inputEl.focus();
            return;
        }

        // Save current before switching
        if (currentFieldId && currentFieldId !== fieldId) {
            commitCurrentValue();
        }

        openForField(fieldId, field);
    }

    function openForField(fieldId, field) {
        currentFieldId = fieldId;
        currentFieldLabel = field?.label_he || field?.label_en || field?.canonical || fieldId;

        // Find field index in mapping
        currentFieldIndex = mappingFields.findIndex(f => (f.id || f.fieldId) === fieldId);

        // Get current value from state
        const state = window.MobileFillStateStore?.state;
        const entry = state?.liveFillState?.liveFillData?.[fieldId];
        originalValue = entry?.value || '';

        // Update panel UI
        labelEl.textContent = currentFieldLabel;
        inputEl.value = originalValue;

        // Update nav button states
        updateNavButtons();

        // Show panel
        panelEl.classList.remove('is-hidden');

        // Hide nav bar and export bar while panel is open
        const navBar = document.getElementById('mobilefill-nav-bar');
        const exportBar = document.getElementById('mobilefill-export-bar');
        if (navBar) navBar.classList.add('panel-open');
        if (exportBar) exportBar.classList.add('panel-open');

        // Highlight field on PDF
        window.MobileFillEventBus.emit('FIELD_HIGHLIGHT', { fieldId, active: true });

        // Focus input after small delay (let panel animate in)
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 50);
    }

    function closePanel() {
        if (!currentFieldId) return;

        // Remove highlight
        window.MobileFillEventBus.emit('FIELD_HIGHLIGHT', { fieldId: currentFieldId, active: false });

        // Hide panel
        panelEl.classList.add('is-hidden');

        // Show nav bar and export bar again
        const navBar = document.getElementById('mobilefill-nav-bar');
        const exportBar = document.getElementById('mobilefill-export-bar');
        if (navBar) navBar.classList.remove('panel-open');
        if (exportBar) exportBar.classList.remove('panel-open');

        // Blur input
        inputEl.blur();

        // Clear state
        currentFieldId = null;
        currentFieldLabel = null;
        originalValue = '';
        currentFieldIndex = -1;
    }

    function confirmEdit() {
        if (!currentFieldId) return;

        // Emit final value
        window.MobileFillEventBus.emit('FIELD_UPDATED', {
            fieldId: currentFieldId,
            value: inputEl.value,
            checked: null,
            tableContext: null
        });

        closePanel();
    }

    function cancelEdit() {
        if (!currentFieldId) return;

        // Restore original value
        window.MobileFillEventBus.emit('FIELD_UPDATED', {
            fieldId: currentFieldId,
            value: originalValue,
            checked: null,
            tableContext: null
        });

        closePanel();
    }

    function commitCurrentValue() {
        if (!currentFieldId) return;

        // Just emit current value - don't close
        window.MobileFillEventBus.emit('FIELD_UPDATED', {
            fieldId: currentFieldId,
            value: inputEl.value,
            checked: null,
            tableContext: null
        });
    }

    function navigateField(direction) {
        if (mappingFields.length === 0) return;

        // Commit current value before navigating
        commitCurrentValue();

        // Filter to navigable fields (text/number/date, skip checkboxes)
        const navigableFields = mappingFields.filter(f => {
            const type = (f.type || 'text').toLowerCase();
            return type === 'text' || type === 'number' || type === 'date';
        });

        if (navigableFields.length === 0) return;

        // Find current position in navigable fields
        let navIndex = navigableFields.findIndex(f => (f.id || f.fieldId) === currentFieldId);

        // Calculate next index with wrap-around
        navIndex += direction;
        if (navIndex < 0) navIndex = navigableFields.length - 1;
        if (navIndex >= navigableFields.length) navIndex = 0;

        const nextField = navigableFields[navIndex];
        const nextFieldId = nextField.id || nextField.fieldId;

        // Scroll to field on PDF
        const hotspot = document.querySelector(`.mobilefill-hotspot[data-field-id="${nextFieldId}"]`);
        if (hotspot) {
            hotspot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Open panel for new field
        openForField(nextFieldId, nextField);

        // Emit FIELD_FOCUSED so field navigator stays in sync
        window.MobileFillEventBus.emit('FIELD_FOCUSED', { fieldId: nextFieldId, index: navIndex });
    }

    function updateNavButtons() {
        const navigableFields = mappingFields.filter(f => {
            const type = (f.type || 'text').toLowerCase();
            return type === 'text' || type === 'number' || type === 'date';
        });

        const hasMultipleFields = navigableFields.length > 1;
        prevBtn.disabled = !hasMultipleFields;
        nextBtn.disabled = !hasMultipleFields;
    }

    // Public API
    window.MobileFillInputPanel = {
        init,
        open: openForField,
        close: closePanel,
        confirm: confirmEdit,
        cancel: cancelEdit,
        isOpen: () => !panelEl?.classList.contains('is-hidden')
    };
})();
