/**
 * Regular Mapper Engine - JSON-driven field mapping
 *
 * Active when JSON field definitions are loaded.
 * User selects unmapped field from sidebar, then draws rectangle to map it.
 *
 * @version 1.0.0
 */
(function() {
    'use strict';

    const RegularMapperEngine = {
        // ============ STATE ============
        _active: false,
        _selectedFieldId: null,  // Field selected from sidebar for mapping

        // ============ INITIALIZATION ============

        /**
         * Initialize engine
         * @param {Object} mapper - FieldMapper instance
         */
        init(mapper) {
            console.log('[RegularMapperEngine] Initialized');
        },

        /**
         * Activate this engine
         * @param {Object} mapper - FieldMapper instance
         */
        activate(mapper) {
            this._active = true;
            this._selectedFieldId = null;
            console.log('[RegularMapperEngine] Activated');
        },

        /**
         * Deactivate this engine
         * @param {Object} mapper - FieldMapper instance
         */
        deactivate(mapper) {
            this._active = false;
            this._selectedFieldId = null;
            console.log('[RegularMapperEngine] Deactivated');
        },

        /**
         * Check if engine is active
         */
        isActive() {
            return this._active;
        },

        // ============ EVENT HANDLERS ============

        /**
         * Handle mousedown event
         * @param {Object} data - { x, y, target, event }
         * @param {Object} mapper - FieldMapper instance
         * @returns {{ handled: boolean, action?: string }}
         */
        handleMouseDown(data, mapper) {
            if (!this._active) return { handled: false };

            const { x, y, target, event } = data;
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            // If we have a field selected and are in drawing mode
            if (this._selectedFieldId && sm && sm.is(MS.FIELD_CREATION)) {
                // Start drawing for the selected field
                return { handled: false };  // Let normal drawing handler take over
            }

            return { handled: false };
        },

        /**
         * Handle mouseup event
         * @param {Object} data - { x, y, event }
         * @param {Object} mapper - FieldMapper instance
         * @returns {{ handled: boolean, action?: string }}
         */
        handleMouseUp(data, mapper) {
            if (!this._active) return { handled: false };

            // Drawing completion is handled by StateMachine
            return { handled: false };
        },

        /**
         * Handle mousemove event
         * @param {Object} data - { x, y, event }
         * @param {Object} mapper - FieldMapper instance
         * @returns {{ handled: boolean }}
         */
        handleMouseMove(data, mapper) {
            if (!this._active) return { handled: false };

            // Mouse move during drawing handled by StateMachine
            return { handled: false };
        },

        /**
         * Handle keydown event
         * @param {Object} data - { key, event }
         * @param {Object} mapper - FieldMapper instance
         * @returns {{ handled: boolean, action?: string }}
         */
        handleKeyDown(data, mapper) {
            if (!this._active) return { handled: false };

            const { key } = data;

            // ESC cancels current selection
            if (key === 'Escape' && this._selectedFieldId) {
                this.clearSelection(mapper);
                return { handled: true, action: 'clearSelection' };
            }

            return { handled: false };
        },

        // ============ FIELD OPERATIONS ============

        /**
         * Select a field from sidebar for mapping
         * @param {string} fieldId - Field ID to select
         * @param {Object} mapper - FieldMapper instance
         */
        selectFieldFromSidebar(fieldId, mapper) {
            const field = mapper.fields.find(f => f.id === fieldId);

            if (!field) {
                console.warn('[RegularMapperEngine] Field not found:', fieldId);
                return;
            }

            if (field.isMapped) {
                mapper.showToast('השדה כבר ממופה', 'warning');
                return;
            }

            this._selectedFieldId = fieldId;

            // Enter field creation mode
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (sm && MS) {
                sm.reset(true);
                sm.setState(MS.FIELD_CREATION);
            }

            // Update UI
            mapper.showToast(`נבחר: "${field.label_he || field.id}" - צייר מלבן למיקום השדה`, 'info');
            mapper.setStatus(`📍 צייר מלבן למיקום: ${field.label_he || field.id}`, 'info');

            // Highlight selected field in sidebar
            this._highlightSelectedField(fieldId, mapper);

            console.log('[RegularMapperEngine] Field selected:', fieldId);
        },

        /**
         * Clear current field selection
         * @param {Object} mapper - FieldMapper instance
         */
        clearSelection(mapper) {
            const previousId = this._selectedFieldId;
            this._selectedFieldId = null;

            // Exit field creation mode
            const sm = mapper.stateMachine;
            if (sm) {
                sm.reset(true);
            }

            // Update UI
            mapper.setStatus('מוכן', 'info');

            // Remove highlight
            if (previousId) {
                this._unhighlightField(previousId, mapper);
            }

            console.log('[RegularMapperEngine] Selection cleared');
        },

        /**
         * Map the selected field to a drawn rectangle
         * Called when drawing finishes in FIELD_CREATION mode
         * @param {Object} bbox - { x, y, width, height }
         * @param {Object} mapper - FieldMapper instance
         * @returns {{ success: boolean, field?: Object }}
         */
        mapSelectedField(bbox, mapper) {
            if (!this._selectedFieldId) {
                console.warn('[RegularMapperEngine] No field selected to map');
                return { success: false };
            }

            const field = mapper.fields.find(f => f.id === this._selectedFieldId);
            if (!field) {
                console.warn('[RegularMapperEngine] Selected field not found');
                return { success: false };
            }

            // Update field with bbox
            const layer = document.getElementById('mapping-layer');
            const layerWidth = layer?.offsetWidth || 1;
            const layerHeight = layer?.offsetHeight || 1;

            // Convert to percentage anchors
            const xPercent = bbox.x / layerWidth;
            const yPercent = bbox.y / layerHeight;

            field.anchor = [xPercent, yPercent];
            field.overlayWidth = bbox.width;
            field.overlayHeight = bbox.height;
            field.page = mapper.currentPage;
            field.isMapped = true;
            field.isComplete = true;

            // Render the field
            mapper.renderField(field);
            mapper.updateFieldList();
            mapper.selectField(field.id);
            mapper.saveState('map_field');

            // Show success
            mapper.showToast(`שדה "${field.label_he || field.id}" מופה בהצלחה!`, 'success');

            // Clear selection and stay in mode for next field
            const previousId = this._selectedFieldId;
            this._selectedFieldId = null;
            this._unhighlightField(previousId, mapper);

            // Return to IDLE
            const sm = mapper.stateMachine;
            if (sm) {
                sm.reset(true);
            }

            console.log('[RegularMapperEngine] Field mapped:', field.id);

            return { success: true, field };
        },

        /**
         * Get the currently selected field ID
         * @returns {string|null}
         */
        getSelectedFieldId() {
            return this._selectedFieldId;
        },

        /**
         * Check if a field is currently selected
         * @returns {boolean}
         */
        hasSelection() {
            return this._selectedFieldId !== null;
        },

        // ============ UI HELPERS ============

        /**
         * Highlight selected field in sidebar
         * @private
         */
        _highlightSelectedField(fieldId, mapper) {
            // Remove previous highlights
            document.querySelectorAll('.field-item.selected-for-mapping').forEach(el => {
                el.classList.remove('selected-for-mapping');
            });

            // Add highlight to selected field
            const fieldEl = document.querySelector(`[data-field-id="${fieldId}"]`);
            if (fieldEl) {
                fieldEl.classList.add('selected-for-mapping');
            }
        },

        /**
         * Remove highlight from field
         * @private
         */
        _unhighlightField(fieldId, mapper) {
            const fieldEl = document.querySelector(`[data-field-id="${fieldId}"]`);
            if (fieldEl) {
                fieldEl.classList.remove('selected-for-mapping');
            }
        }
    };

    // ============ EXPORTS ============
    window.RegularMapperEngine = RegularMapperEngine;

    console.log('[RegularMapperEngine] Module loaded');

})();
