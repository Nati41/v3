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
    let cameraBtn = null;
    let importBtn = null;

    let currentFieldId = null;
    let currentField = null;
    let currentFieldLabel = null;
    let originalValue = '';
    let validationHintEl = null;

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; input panel disabled');
            return;
        }

        createPanel();
        bindEvents();

        // Listen for field tap from hotspot overlay
        window.MobileFillEventBus.on('FIELD_TAP', handleFieldTap);

        // Counter zoom to keep panel stable
        setupZoomCompensation();

        console.log('[MobileFill] Input panel initialized');
    }

    function setupZoomCompensation() {
        if (!window.visualViewport) return;

        const updatePanelPosition = () => {
            if (!panelEl) return;

            const vv = window.visualViewport;
            const scale = vv.scale;

            // Calculate the bottom position to stick to keyboard
            const keyboardOffset = window.innerHeight - (vv.height + vv.offsetTop);

            // Counter zoom and position above keyboard
            if (scale !== 1) {
                panelEl.style.transform = `scale(${1/scale})`;
                panelEl.style.transformOrigin = 'bottom left';
                panelEl.style.width = `${100 * scale}%`;
            } else {
                panelEl.style.transform = '';
                panelEl.style.width = '';
            }

            // Always position at bottom of visual viewport (above keyboard)
            panelEl.style.bottom = `${Math.max(0, keyboardOffset)}px`;
        };

        window.visualViewport.addEventListener('resize', updatePanelPosition);
        window.visualViewport.addEventListener('scroll', updatePanelPosition);

        // Initial position
        updatePanelPosition();
    }

    function createPanel() {
        // Create panel container
        panelEl = document.createElement('div');
        panelEl.id = 'mobilefill-input-panel';
        panelEl.className = 'mobilefill-input-panel is-hidden';

        // Single row layout
        const row = document.createElement('div');
        row.className = 'input-panel-row';

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
        inputEl.placeholder = 'הקלד...';
        inputEl.autocomplete = 'off';
        inputEl.autocapitalize = 'off';
        inputEl.spellcheck = false;

        inputContainer.appendChild(inputEl);

        // Validation hint (shows errors in real-time)
        validationHintEl = document.createElement('div');
        validationHintEl.className = 'input-panel-validation-hint';
        inputContainer.appendChild(validationHintEl);

        // Action buttons
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'input-panel-actions';

        // Camera/OCR button (single field)
        cameraBtn = document.createElement('button');
        cameraBtn.type = 'button';
        cameraBtn.className = 'input-panel-btn camera';
        cameraBtn.innerHTML = '<span class="btn-icon">📷</span>';
        cameraBtn.title = 'צלם וזהה טקסט';

        // Smart import button (auto-fill from document)
        importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'input-panel-btn import';
        importBtn.innerHTML = '<span class="btn-icon">📄</span>';
        importBtn.title = 'ייבוא חכם ממסמך';

        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'input-panel-btn cancel';
        cancelBtn.innerHTML = '<span class="btn-icon">✕</span>';
        cancelBtn.title = 'ביטול';

        confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'input-panel-btn confirm';
        confirmBtn.innerHTML = '<span class="btn-icon">✓</span>';
        confirmBtn.title = 'אישור';

        actionsContainer.appendChild(cameraBtn);
        actionsContainer.appendChild(importBtn);
        actionsContainer.appendChild(cancelBtn);
        actionsContainer.appendChild(confirmBtn);

        // Assemble row: label | input | actions
        row.appendChild(labelEl);
        row.appendChild(inputContainer);
        row.appendChild(actionsContainer);

        panelEl.appendChild(row);

        // Append to body - fixed position at bottom of viewport
        document.body.appendChild(panelEl);
    }

    function bindEvents() {
        // Input changes - emit live updates + validate
        inputEl.addEventListener('input', () => {
            if (!currentFieldId) return;

            const value = inputEl.value;

            // Emit update
            window.MobileFillEventBus.emit('FIELD_UPDATED', {
                fieldId: currentFieldId,
                value: value,
                checked: null,
                tableContext: null
            });

            // Real-time validation feedback
            validateCurrentInput(value);
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

        // Button clicks
        confirmBtn.addEventListener('click', confirmEdit);
        cancelBtn.addEventListener('click', cancelEdit);

        // Camera/OCR button
        cameraBtn.addEventListener('click', handleCameraClick);

        // Smart import button
        importBtn.addEventListener('click', handleImportClick);

        // Prevent panel touch from propagating to PDF
        // Using passive: false because we need to call stopPropagation
        panelEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        panelEl.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
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
        currentField = field;
        currentFieldLabel = field?.label_he || field?.label_en || field?.canonical || fieldId;

        // Get current value from state
        const state = window.MobileFillStateStore?.state;
        const entry = state?.liveFillState?.liveFillData?.[fieldId];
        originalValue = entry?.value || '';

        // Update panel UI
        labelEl.textContent = currentFieldLabel;
        inputEl.value = originalValue;

        // Show panel
        panelEl.classList.remove('is-hidden');

        // Hide export bar while panel is open
        const exportBar = document.getElementById('mobilefill-export-bar');
        if (exportBar) exportBar.classList.add('panel-open');

        // Highlight field on PDF
        window.MobileFillEventBus.emit('FIELD_HIGHLIGHT', { fieldId, active: true });

        // Focus input after small delay (let panel animate in)
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
            // Trigger position update for keyboard
            if (window.visualViewport) {
                window.visualViewport.dispatchEvent(new Event('resize'));
            }
        }, 50);
    }

    function closePanel() {
        if (!currentFieldId) return;

        // Remove highlight
        window.MobileFillEventBus.emit('FIELD_HIGHLIGHT', { fieldId: currentFieldId, active: false });

        // Hide panel
        panelEl.classList.add('is-hidden');

        // Show export bar again
        const exportBar = document.getElementById('mobilefill-export-bar');
        if (exportBar) exportBar.classList.remove('panel-open');

        // Blur input
        inputEl.blur();

        // Clear state
        currentFieldId = null;
        currentField = null;
        currentFieldLabel = null;
        originalValue = '';

        // Clear validation hint
        clearValidationHint();
    }

    function confirmEdit() {
        if (!currentFieldId) return;

        // Clear error highlight from this field
        const hotspot = document.querySelector(`.mobilefill-hotspot[data-field-id="${currentFieldId}"]`);
        if (hotspot) {
            hotspot.classList.remove('has-error');
        }

        // Remove validation error list if exists and clear all error highlights
        const errorList = document.querySelector('.validation-error-list');
        if (errorList) {
            errorList.remove();
            document.querySelectorAll('.mobilefill-hotspot.has-error').forEach(el => {
                el.classList.remove('has-error');
            });
        }

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

    function validateCurrentInput(value) {
        if (!validationHintEl || !currentField) return;

        // Use validation engine if available
        if (window.MobileFillValidation && typeof window.MobileFillValidation.validateField === 'function') {
            const error = window.MobileFillValidation.validateField(currentField, value);

            if (error) {
                validationHintEl.textContent = error;
                validationHintEl.classList.add('visible', 'error');
                inputEl.classList.add('has-error');
            } else {
                validationHintEl.textContent = '';
                validationHintEl.classList.remove('visible', 'error');
                inputEl.classList.remove('has-error');
            }
        }
    }

    function clearValidationHint() {
        if (validationHintEl) {
            validationHintEl.textContent = '';
            validationHintEl.classList.remove('visible', 'error');
        }
        if (inputEl) {
            inputEl.classList.remove('has-error');
        }
    }

    function handleCameraClick() {
        if (!window.MobileFillOCR) {
            console.warn('[MobileFill] OCR service not available');
            if (window.MobileFillToast) {
                window.MobileFillToast.error('OCR לא זמין');
            }
            return;
        }

        // Launch OCR capture
        window.MobileFillOCR.captureAndExtract((extractedText) => {
            if (!extractedText || !currentFieldId) return;

            // Set the extracted text in the input
            inputEl.value = extractedText;

            // Emit update
            window.MobileFillEventBus.emit('FIELD_UPDATED', {
                fieldId: currentFieldId,
                value: extractedText,
                checked: null,
                tableContext: null
            });

            // Validate
            validateCurrentInput(extractedText);

            // Focus input for user to review/edit
            inputEl.focus();
        });
    }

    function handleImportClick() {
        if (!window.MobileFillSmartImport) {
            console.warn('[MobileFill] Smart import service not available');
            if (window.MobileFillToast) {
                window.MobileFillToast.error('ייבוא חכם לא זמין');
            }
            return;
        }

        // Launch smart import - will auto-fill matching fields
        window.MobileFillSmartImport.openFilePicker()
            .then((result) => {
                if (result.success && result.appliedCount > 0) {
                    // Update current field value if it was filled
                    if (currentFieldId && result.fieldValues[currentFieldId]) {
                        inputEl.value = result.fieldValues[currentFieldId];
                        validateCurrentInput(inputEl.value);
                    }
                    inputEl.focus();
                }
            })
            .catch((error) => {
                console.error('[MobileFill] Smart import failed:', error);
            });
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
