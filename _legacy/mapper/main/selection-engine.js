/**
 * Mapper Selection Engine - Field selection logic
 * These functions handle field selection, mapping mode, and field expansion.
 *
 * NOTE: All functions receive mapper state as parameters.
 * No internal "this" references - all state passed in.
 */
(function() {
    'use strict';

    // ============ FIELD SELECTION ============

    /**
     * Select a field by ID
     * @param {string} fieldId - Field ID to select
     * @param {Object} opts - Options { scroll: boolean }
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function selectField(fieldId, opts = { scroll: false }, mapper) {
        // Deselect without triggering updateFieldList (we'll do it once at the end)
        _deselectAllQuiet(mapper);

        const field = mapper.fields.find(f => f.id === fieldId);
        if (!field) return;

        mapper.selectedField = field;

        if (field.element) {
            field.element.classList.add('selected');

            // SINGLE ACTIVE OVERLAY: Set active overlay to z-index 9999, show resize handles
            field.element.style.zIndex = '9999';
            const resizeHandles = field.element.querySelectorAll('.resize-handle');
            resizeHandles.forEach(handle => {
                handle.style.display = 'block';
            });
        }

        // Set all OTHER overlays to z-index 1 and hide their resize handles
        mapper.fields.forEach(f => {
            if (f.id !== fieldId && f.element) {
                f.element.style.zIndex = '1';
                const handles = f.element.querySelectorAll('.resize-handle');
                handles.forEach(handle => {
                    handle.style.display = 'none';
                });
            }
        });

        // Single updateFieldList call at the end
        mapper.updateFieldList();

        if (opts.scroll) {
            mapper.SidebarEngine.scrollFieldIntoView(fieldId);
        }
    }

    /**
     * Internal quiet deselect - doesn't trigger updateFieldList
     * @param {Object} mapper - FieldMapper instance
     */
    function _deselectAllQuiet(mapper) {
        mapper.selectedField = null;
        document.querySelectorAll('.field-overlay.selected').forEach(el => {
            el.classList.remove('selected');
            el.style.zIndex = '1';
            const handles = el.querySelectorAll('.resize-handle');
            handles.forEach(handle => {
                handle.style.display = 'none';
            });
        });
    }

    /**
     * Deselect all fields
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function deselectAll(mapper) {
        mapper.selectedField = null;
        document.querySelectorAll('.field-overlay.selected').forEach(el => {
            el.classList.remove('selected');
            // Reset z-index to default (1) and hide resize handles
            el.style.zIndex = '1';
            const handles = el.querySelectorAll('.resize-handle');
            handles.forEach(handle => {
                handle.style.display = 'none';
            });
        });
        mapper.updateFieldList();
    }

    // ============ FIELD EXPANSION ============

    /**
     * Toggle field expansion in sidebar
     * @param {string} fieldId - Field ID to toggle
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function toggleFieldExpansion(fieldId, mapper) {
        if (mapper.expandedFieldId === fieldId) {
            mapper.expandedFieldId = null;
        } else {
            mapper.expandedFieldId = fieldId;
        }
        mapper.updateFieldList();
    }

    // ============ MAPPING MODE ============

    /**
     * Select a field for mapping (drawing mode)
     * @param {string} fieldId - Field ID to map
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function selectFieldForMapping(fieldId, mapper) {
        const field = mapper.fields.find(f => f.id === fieldId);
        if (!field) return;

        mapper.interaction.mode = 'mapping';
        mapper.interaction.targetFieldId = field.id;

        mapper.selectField(field.id, { scroll: true });
        mapper.expandedFieldId = field.id;

        const statusText = field.isMapped ?
            `📌 עורך: ${field.label_he || field.id} - צייר מלבן חדש לעדכון מיקום` :
            `📌 ממפה: ${field.label_he || field.id} - צייר מלבן למיפוי ראשוני`;

        mapper.setStatus(statusText, 'info');
        mapper.updateMappingBadge(statusText + ' - Esc לביטול');

        if (mapper.mode === 'preview') {
            mapper.setMode('mapping');
        }

        mapper.updateFieldList();

        const actionText = field.isMapped ? 'נבחר לעריכה' : 'נבחר למיפוי';
        mapper.showToast(`${field.label_he || field.id} ${actionText} - עכשיו צייר מלבן על המסמך`, 'success');
    }

    /**
     * Cancel mapping mode
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function cancelMappingMode(mapper) {
        mapper.interaction.mode = 'idle';
        mapper.interaction.targetFieldId = null;
        mapper.interaction.tableConfig = null;
        mapper.setStatus('מוכן', 'success');
        mapper.updateMappingBadge(null);
        mapper.showToast('מצב מיפוי בוטל', 'info');
    }

    // ============ FIELD MOVEMENT ============

    /**
     * Move the selected field with arrow keys
     * @param {string} direction - Arrow key direction
     * @param {boolean} shiftKey - Whether shift is pressed (10px step)
     * @param {Object} mapper - FieldMapper instance for state access
     */
    function moveSelectedField(direction, shiftKey, mapper) {
        if (!mapper.selectedField || !mapper.selectedField.element) return;

        const step = shiftKey ? 10 : 1;
        const container = document.getElementById('mapping-layer');
        if (!container) return;

        let newX = mapper.selectedField.element.offsetLeft;
        let newY = mapper.selectedField.element.offsetTop;

        switch(direction) {
            case 'ArrowLeft':
                newX -= step;
                break;
            case 'ArrowRight':
                newX += step;
                break;
            case 'ArrowUp':
                newY -= step;
                break;
            case 'ArrowDown':
                newY += step;
                break;
        }

        newX = Math.max(0, Math.min(container.offsetWidth - mapper.selectedField.element.offsetWidth, newX));
        newY = Math.max(0, Math.min(container.offsetHeight - mapper.selectedField.element.offsetHeight, newY));

        mapper.selectedField.element.style.left = newX + 'px';
        mapper.selectedField.element.style.top = newY + 'px';

        mapper.selectedField.xPct = (newX / container.offsetWidth) * 100;
        mapper.selectedField.yPct = (newY / container.offsetHeight) * 100;

        mapper.checkFieldOverlaps();
        mapper.saveState('move_field');
    }

    // ============ EXPORT ============

    window.MapperSelectionEngine = {
        selectField,
        selectFieldForMapping,
        deselectAll,
        toggleFieldExpansion,
        cancelMappingMode,
        moveSelectedField
    };
})();
