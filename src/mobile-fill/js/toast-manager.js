/**
 * toast-manager.js
 * Lightweight toast notifications for mobile
 * No modals - just subtle, auto-dismissing messages
 */
(function() {
    'use strict';

    let toastContainer = null;
    let activeToast = null;
    let hideTimeout = null;

    function init() {
        createContainer();
        console.log('[MobileFill] Toast manager initialized');
    }

    function createContainer() {
        if (toastContainer) return;

        toastContainer = document.createElement('div');
        toastContainer.id = 'mobilefill-toast-container';
        toastContainer.className = 'toast-container';

        document.body.appendChild(toastContainer);
    }

    /**
     * Show a toast message
     * @param {string} message - The message to display
     * @param {string} type - 'success' | 'error' | 'warning' | 'info'
     * @param {number} duration - Auto-hide duration in ms (0 = manual dismiss)
     */
    function show(message, type = 'info', duration = 3000) {
        if (!toastContainer) createContainer();

        // Clear existing toast
        if (activeToast) {
            activeToast.remove();
            activeToast = null;
        }

        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `mobilefill-toast ${type}`;

        // Icon based on type
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
        `;

        // Tap to dismiss
        toast.addEventListener('click', () => hide());

        toastContainer.appendChild(toast);
        activeToast = toast;

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        // Auto-hide
        if (duration > 0) {
            hideTimeout = setTimeout(() => hide(), duration);
        }
    }

    function hide() {
        if (!activeToast) return;

        activeToast.classList.remove('visible');

        setTimeout(() => {
            if (activeToast) {
                activeToast.remove();
                activeToast = null;
            }
        }, 300); // Match CSS transition

        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
    }

    // Convenience methods
    function success(message, duration = 3000) {
        show(message, 'success', duration);
    }

    function error(message, duration = 4000) {
        show(message, 'error', duration);
    }

    function warning(message, duration = 3500) {
        show(message, 'warning', duration);
    }

    function info(message, duration = 3000) {
        show(message, 'info', duration);
    }

    // Public API
    window.MobileFillToast = {
        init,
        show,
        hide,
        success,
        error,
        warning,
        info
    };
})();
