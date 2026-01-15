/**
 * LiveFill UI - All DOM-dependent functions
 * These functions have DOM dependencies and handle UI interactions.
 *
 * NOTE: Functions that depend on global state (liveFillData, fieldsMapping, etc.)
 * remain in the inline script. Only truly self-contained UI functions are here.
 */
(function() {
    'use strict';

    // Import from LiveFillCore
    const { getDefaultStyle } = window.LiveFillCore;

    // ========================================
    // Debug System
    // ========================================
    const debugLogs = [];
    const MAX_DEBUG_LOGS = 100;

    function debugLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('he-IL', {
            hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
        });

        const logEntry = `[${timestamp}] ${message}`;

        if (type === 'error') console.error(logEntry);
        else if (type === 'warning') console.warn(logEntry);
        else if (type === 'success') console.log(`✅ ${logEntry}`);
        else console.log(logEntry);

        debugLogs.push({ timestamp, message, type });
        if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs.shift();
        updateDebugConsole();
    }

    function updateDebugConsole() {
        const consoleEl = document.getElementById('debug-console');
        if (!consoleEl || !consoleEl.classList.contains('show')) return;

        const html = debugLogs.slice(-20).reverse().map(log => {
            const className = log.type === 'error' ? 'debug-error' :
                             log.type === 'success' ? 'debug-success' :
                             log.type === 'warning' ? 'debug-warning' : '';
            return `<div class="debug-line ${className}">[${log.timestamp}] ${log.message}</div>`;
        }).join('');

        consoleEl.innerHTML = html;
    }

    function toggleDebugConsole() {
        const consoleEl = document.getElementById('debug-console');
        consoleEl.classList.toggle('show');
        if (consoleEl.classList.contains('show')) updateDebugConsole();
    }

    // ========================================
    // Toast Notification System (LiveFill-specific)
    // ========================================
    class ToastManager {
        static container = null;
        static activeToasts = [];

        static init() {
            this.container = document.getElementById('toast-container');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'toast-container';
                this.container.className = 'toast-container';
                document.body.appendChild(this.container);
            }
        }

        static show(message, type = 'info', duration = 3000) {
            if (!this.container) this.init();

            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
                <span class="toast-icon">${icons[type] || icons.info}</span>
                <span>${message}</span>
            `;

            this.container.appendChild(toast);
            this.activeToasts.push(toast);

            if (duration > 0) {
                setTimeout(() => this.remove(toast), duration);
            }

            return toast;
        }

        static remove(toast) {
            if (!toast || !toast.parentElement) return;

            toast.classList.add('removing');
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.parentElement.removeChild(toast);
                }
                const index = this.activeToasts.indexOf(toast);
                if (index > -1) {
                    this.activeToasts.splice(index, 1);
                }
            }, 300);
        }

        static success(message, duration = 3000) {
            return this.show(message, 'success', duration);
        }

        static error(message, duration = 4000) {
            return this.show(message, 'error', duration);
        }

        static warning(message, duration = 3500) {
            return this.show(message, 'warning', duration);
        }

        static info(message, duration = 3000) {
            return this.show(message, 'info', duration);
        }

        static clearAll() {
            this.activeToasts.forEach(toast => this.remove(toast));
            this.activeToasts = [];
        }
    }

    // ========================================
    // Progress Modal System
    // ========================================
    const ProgressModal = {
        modal: null,
        fill: null,
        text: null,
        percentage: null,

        init() {
            this.modal = document.getElementById('progress-modal');
            this.fill = document.getElementById('progress-bar-fill');
            this.text = document.getElementById('progress-text');
            this.percentage = document.getElementById('progress-percentage');
        },

        show() {
            if (!this.modal) this.init();
            this.modal.classList.add('show');
            this.update(0, 'מתחיל...');
        },

        hide() {
            if (!this.modal) this.init();
            setTimeout(() => {
                this.modal.classList.remove('show');
            }, 500);
        },

        update(percent, message = '') {
            if (!this.modal) this.init();

            if (this.fill) {
                this.fill.style.width = percent + '%';
            }

            if (this.percentage) {
                this.percentage.textContent = Math.round(percent) + '%';
            }

            if (message && this.text) {
                this.text.textContent = message;
            }
        }
    };

    function showProgressModal() {
        ProgressModal.show();
    }

    function hideProgressModal() {
        ProgressModal.hide();
    }

    function updateProgress(percent, message) {
        ProgressModal.update(percent, message);
    }

    // ========================================
    // Validation Modal System
    // ========================================
    const ValidationModal = {
        modal: null,
        bodyEl: null,
        proceedBtn: null,
        callback: null,

        init() {
            this.modal = document.getElementById('validation-modal');
            this.bodyEl = document.getElementById('validation-body');
            this.proceedBtn = document.getElementById('validation-proceed-btn');
        },

        async validate(fieldsMapping, liveFillData) {
            if (!this.modal) this.init();

            const errors = [];
            const warnings = [];

            fieldsMapping.fields.forEach(field => {
                const fid = field.id || field.fieldId;
                const data = liveFillData[fid];
                const label = field.label || fid;

                if (field.required) {
                    if (!data || (data.value === undefined && data.checked === undefined)) {
                        errors.push(`${label} - שדה חובה ריק`);
                    } else if (data.value === '' || (data.checked !== undefined && !data.checked)) {
                        errors.push(`${label} - שדה חובה ריק`);
                    }
                }

                if (field.type === 'id_number' && data && data.value) {
                    if (!this.validateIsraeliID(data.value)) {
                        warnings.push(`${label} - תעודת זהות לא תקינה`);
                    }
                }

                if (field.type === 'phone' && data && data.value) {
                    if (!this.validatePhone(data.value)) {
                        warnings.push(`${label} - מספר טלפון לא תקין`);
                    }
                }

                if (field.type === 'email' && data && data.value) {
                    if (!this.validateEmail(data.value)) {
                        warnings.push(`${label} - כתובת אימייל לא תקינה`);
                    }
                }
            });

            if (errors.length === 0 && warnings.length === 0) {
                return true;
            }

            return new Promise((resolve) => {
                this.show(errors, warnings, resolve);
            });
        },

        show(errors, warnings, callback) {
            if (!this.modal) this.init();

            this.callback = callback;

            let html = '';

            if (errors.length > 0) {
                html += `
                    <div class="validation-section">
                        <h4>❌ שגיאות (${errors.length})</h4>
                        <ul class="validation-list">
                            ${errors.map(err => `<li class="validation-error">${err}</li>`).join('')}
                        </ul>
                    </div>
                `;
                this.proceedBtn.disabled = true;
                this.proceedBtn.textContent = 'לא ניתן להמשיך';
            } else {
                this.proceedBtn.disabled = false;
                this.proceedBtn.textContent = 'המשך בכל זאת';
            }

            if (warnings.length > 0) {
                html += `
                    <div class="validation-section">
                        <h4>⚠️ אזהרות (${warnings.length})</h4>
                        <ul class="validation-list">
                            ${warnings.map(warn => `<li class="validation-warning">${warn}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }

            this.bodyEl.innerHTML = html;
            this.modal.classList.add('show');
        },

        hide() {
            if (!this.modal) this.init();
            this.modal.classList.remove('show');
            if (this.callback) {
                this.callback(false);
                this.callback = null;
            }
        },

        proceed() {
            if (!this.modal) this.init();
            if (this.proceedBtn.disabled) return;

            this.modal.classList.remove('show');
            if (this.callback) {
                this.callback(true);
                this.callback = null;
            }
        },

        validateIsraeliID(id) {
            id = String(id).trim();
            if (id.length !== 9 || !/^\d+$/.test(id)) return false;

            let sum = 0;
            for (let i = 0; i < 9; i++) {
                let digit = Number(id[i]);
                if (i % 2 === 0) {
                    digit *= 1;
                } else {
                    digit *= 2;
                    if (digit > 9) digit -= 9;
                }
                sum += digit;
            }
            return sum % 10 === 0;
        },

        validatePhone(phone) {
            phone = String(phone).replace(/[\s-]/g, '');
            return /^0\d{9}$/.test(phone) || /^0\d{8}$/.test(phone);
        },

        validateEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }
    };

    // ========================================
    // UI Helper Functions (self-contained)
    // ========================================
    function showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (show) overlay.classList.add('active');
        else overlay.classList.remove('active');
    }

    function showStatus(message, type = 'info') {
        const statusEl = document.getElementById('status-message');
        statusEl.textContent = message;
        statusEl.className = `status-message ${type} show`;

        setTimeout(() => statusEl.classList.remove('show'), 3000);
    }

    // ========================================
    // Style Application (self-contained)
    // ========================================
    function applyStyleToElement(element, style) {
        if (!style) return;

        element.style.fontFamily = style.fontFamily || 'David Libre';
        element.style.fontSize = (style.fontSize || 14) + 'px';
        element.style.color = style.color || '#000000';
        element.style.textAlign = style.alignment || 'right';
        element.style.letterSpacing = (style.letterSpacing || 0) + 'px';
        element.style.wordSpacing = (style.wordSpacing || 0) + 'px';
        element.style.opacity = style.opacity !== undefined ? style.opacity : 1;
    }

    // Export all UI functions
    window.LiveFillUI = {
        // Debug
        debugLog,
        updateDebugConsole,
        toggleDebugConsole,

        // Toast
        ToastManager,

        // Progress Modal
        ProgressModal,
        showProgressModal,
        hideProgressModal,
        updateProgress,

        // Validation Modal
        ValidationModal,

        // UI Helpers
        showLoading,
        showStatus,

        // Style
        applyStyleToElement
    };
})();
