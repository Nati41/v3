(function() {
    /**
     * Show a small toast notification in the top-left corner
     * @param {string} message - The message to display
     * @param {string} type - Type: "success", "error", or "info"
     * @param {number} duration - Duration in ms (default: 2500)
     */
    function showToast(message, type = 'info', duration = 2500) {
        const container = document.getElementById('toast-container');
        if (!container) {
            console.warn('Toast container not found');
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Trigger fade-in
        requestAnimationFrame(() => {
            toast.classList.add('toast-visible');
        });

        // Auto-remove after duration
        setTimeout(() => {
            toast.classList.remove('toast-visible');
            toast.classList.add('toast-hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }

    window.showToast = showToast;
})();
