/**
 * FieldInputPopover - Hybrid Input Component
 *
 * Provides controlled input via popover instead of inline canvas typing.
 * This ensures perfect rendering by separating input (popover) from output (canvas).
 *
 * Design Principle:
 * - Canvas = perfect display (output)
 * - Popover = controlled input (input)
 * - Typing is input. Canvas is output.
 *
 * Usage:
 * - For perGlyphBoxes fields (ID, date, phone, numeric in tables)
 * - NOT for flowText fields (names, addresses) which can remain inline
 */
(function() {
    'use strict';

    // ============ STATE ============

    let activePopover = null;
    let currentContext = null;

    // ============ CONFIGURATION ============

    const POPOVER_CONFIG = {
        // Field type labels (Hebrew)
        labels: {
            'id_number': 'מספר זהות',
            'date': 'תאריך',
            'phone': 'טלפון',
            'number': 'מספר',
            'text': 'טקסט'
        },
        // Placeholders
        placeholders: {
            'id_number': '123456789',
            'date': 'DD/MM/YYYY',
            'phone': '05X-XXXXXXX',
            'number': '0',
            'text': ''
        },
        // Input patterns (for validation hints)
        patterns: {
            'id_number': '[0-9]{5,9}',
            'date': '[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}',
            'phone': '[0-9\\-]{7,12}',
            'number': '[0-9\\.\\-]+'
        }
    };

    // ============ POPOVER CREATION ============

    /**
     * Open input popover for a field
     * @param {Object} options
     * @param {HTMLElement} options.anchorElement - The field overlay element
     * @param {Object} options.fieldMeta - Field metadata (id, type, label_he, etc.)
     * @param {string} options.currentValue - Current value (if any)
     * @param {string} options.intent - Resolved intent (perGlyphBoxes/flowText)
     * @param {Function} options.onConfirm - Callback with confirmed value
     * @param {Function} options.onCancel - Callback on cancel
     * @param {Object} options.tableContext - For table cells: { tableId, rowIndex, columnKey }
     */
    function open(options) {
        // Close any existing popover
        close();

        const {
            anchorElement,
            fieldMeta = {},
            currentValue = '',
            intent = 'perGlyphBoxes',
            onConfirm,
            onCancel,
            tableContext = null
        } = options;

        // Store context
        currentContext = {
            fieldMeta,
            tableContext,
            onConfirm,
            onCancel
        };

        // Determine field type for UI
        const fieldType = fieldMeta.type || fieldMeta.subtype || 'text';
        const fieldLabel = fieldMeta.label_he || fieldMeta.hebrewName || POPOVER_CONFIG.labels[fieldType] || 'שדה';

        // Get anchor position
        const anchorRect = anchorElement.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        // Create popover element
        const popover = document.createElement('div');
        popover.id = 'field-input-popover';
        popover.className = 'field-input-popover';
        popover.innerHTML = `
            <div class="popover-header">
                <span class="popover-title">${escapeHtml(fieldLabel)}</span>
                <button class="popover-close" title="ביטול">✕</button>
            </div>
            <div class="popover-body">
                <input
                    type="text"
                    class="popover-input"
                    value="${escapeHtml(currentValue)}"
                    placeholder="${POPOVER_CONFIG.placeholders[fieldType] || ''}"
                    pattern="${POPOVER_CONFIG.patterns[fieldType] || ''}"
                    dir="ltr"
                    autocomplete="off"
                    spellcheck="false"
                >
                ${fieldType === 'date' ? '<span class="input-hint">DD/MM/YYYY</span>' : ''}
            </div>
            <div class="popover-footer">
                <button class="popover-btn cancel">ביטול</button>
                <button class="popover-btn confirm">✓ אישור</button>
            </div>
        `;

        // Position popover (below and aligned to field)
        const popoverTop = anchorRect.bottom + scrollTop + 8;
        const popoverLeft = anchorRect.left + scrollLeft;

        popover.style.position = 'absolute';
        popover.style.top = popoverTop + 'px';
        popover.style.left = popoverLeft + 'px';
        popover.style.zIndex = '10001';

        // Add to document
        document.body.appendChild(popover);
        activePopover = popover;

        // Get references
        const input = popover.querySelector('.popover-input');
        const confirmBtn = popover.querySelector('.popover-btn.confirm');
        const cancelBtn = popover.querySelector('.popover-btn.cancel');
        const closeBtn = popover.querySelector('.popover-close');

        // Focus input and select all
        setTimeout(() => {
            input.focus();
            input.select();
        }, 50);

        // ============ EVENT HANDLERS ============

        // Confirm on button click
        confirmBtn.addEventListener('click', () => {
            confirmValue(input.value);
        });

        // Cancel on button click
        cancelBtn.addEventListener('click', () => {
            close();
            if (currentContext?.onCancel) {
                currentContext.onCancel();
            }
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            close();
            if (currentContext?.onCancel) {
                currentContext.onCancel();
            }
        });

        // Enter to confirm, Escape to cancel
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmValue(input.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
                if (currentContext?.onCancel) {
                    currentContext.onCancel();
                }
            }
        });

        // Click outside to close
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 100);

        console.log('[FieldInputPopover] Opened for:', fieldLabel, 'value:', currentValue);
    }

    /**
     * Handle click outside popover
     */
    function handleOutsideClick(e) {
        if (activePopover && !activePopover.contains(e.target)) {
            close();
            if (currentContext?.onCancel) {
                currentContext.onCancel();
            }
        }
    }

    /**
     * Confirm the entered value
     */
    function confirmValue(value) {
        if (!currentContext) return;

        const { onConfirm, fieldMeta, tableContext } = currentContext;

        // Clean value based on field type
        let cleanedValue = value.trim();
        const fieldType = fieldMeta.type || fieldMeta.subtype || 'text';

        // For numeric fields, strip non-digits (except for dates)
        if (['id_number', 'phone', 'number'].includes(fieldType)) {
            cleanedValue = cleanedValue.replace(/[^\d]/g, '');
        }

        console.log('[FieldInputPopover] Confirmed:', cleanedValue, 'for field:', fieldMeta.id || fieldMeta.columnId);

        // Close popover
        close();

        // Call confirm callback
        if (onConfirm) {
            onConfirm(cleanedValue, {
                fieldMeta,
                tableContext,
                originalValue: value
            });
        }
    }

    /**
     * Close the popover
     */
    function close() {
        if (activePopover) {
            activePopover.remove();
            activePopover = null;
        }
        currentContext = null;
        document.removeEventListener('click', handleOutsideClick);
    }

    /**
     * Check if popover is currently open
     */
    function isOpen() {
        return activePopover !== null;
    }

    /**
     * Escape HTML for safe insertion
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // ============ CSS INJECTION ============

    function injectStyles() {
        if (document.getElementById('field-input-popover-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'field-input-popover-styles';
        styles.textContent = `
            .field-input-popover {
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
                min-width: 220px;
                max-width: 320px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                direction: rtl;
                overflow: hidden;
            }

            .popover-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 14px;
                background: #f5f5f5;
                border-bottom: 1px solid #e0e0e0;
            }

            .popover-title {
                font-size: 13px;
                font-weight: 600;
                color: #333;
            }

            .popover-close {
                background: none;
                border: none;
                font-size: 16px;
                color: #999;
                cursor: pointer;
                padding: 2px 6px;
                line-height: 1;
            }

            .popover-close:hover {
                color: #333;
            }

            .popover-body {
                padding: 14px;
            }

            .popover-input {
                width: 100%;
                padding: 10px 12px;
                font-size: 16px;
                border: 2px solid #2196F3;
                border-radius: 6px;
                outline: none;
                box-sizing: border-box;
                direction: ltr;
                text-align: left;
                font-family: 'Courier New', monospace;
                letter-spacing: 1px;
            }

            .popover-input:focus {
                border-color: #1976D2;
                box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.2);
            }

            .input-hint {
                display: block;
                font-size: 11px;
                color: #999;
                margin-top: 6px;
                text-align: left;
                direction: ltr;
            }

            .popover-footer {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                padding: 10px 14px;
                background: #fafafa;
                border-top: 1px solid #e0e0e0;
            }

            .popover-btn {
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }

            .popover-btn.cancel {
                background: white;
                border: 1px solid #ddd;
                color: #666;
            }

            .popover-btn.cancel:hover {
                background: #f5f5f5;
            }

            .popover-btn.confirm {
                background: #4CAF50;
                border: none;
                color: white;
            }

            .popover-btn.confirm:hover {
                background: #43A047;
            }

            /* Animation */
            .field-input-popover {
                animation: popoverFadeIn 0.15s ease-out;
            }

            @keyframes popoverFadeIn {
                from {
                    opacity: 0;
                    transform: translateY(-8px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `;

        document.head.appendChild(styles);
    }

    // ============ INITIALIZATION ============

    function init() {
        injectStyles();
        console.log('%c[FieldInputPopover] Module loaded', 'background: #4CAF50; color: white; padding: 3px 8px; border-radius: 3px;');
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============ EXPORT ============

    window.FieldInputPopover = {
        open,
        close,
        isOpen,
        config: POPOVER_CONFIG
    };

})();
