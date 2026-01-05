/**
 * DialogUtils - Utilities for making dialogs draggable and minimizable
 */

/**
 * Make an element draggable by its header
 * @param {HTMLElement} dialog - The dialog element to make draggable
 * @param {HTMLElement} handle - The header/handle element to drag from
 */
export function makeDraggable(dialog, handle) {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    // Add drag cursor to handle
    handle.style.cursor = 'move';

    const onMouseDown = (e) => {
        // Don't drag if clicking on buttons or inputs
        if (e.target.tagName === 'BUTTON' ||
            e.target.tagName === 'INPUT' ||
            e.target.classList.contains('dialog-close') ||
            e.target.classList.contains('btn-minimize')) {
            return;
        }

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        // Get current position
        const rect = dialog.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;

        // Prevent text selection while dragging
        e.preventDefault();
        document.body.style.userSelect = 'none';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        let newX = initialX + deltaX;
        let newY = initialY + deltaY;

        // Keep dialog within viewport bounds
        const dialogRect = dialog.getBoundingClientRect();
        const maxX = window.innerWidth - dialogRect.width;
        const maxY = window.innerHeight - dialogRect.height;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        // Apply position
        dialog.style.position = 'fixed';
        dialog.style.left = `${newX}px`;
        dialog.style.top = `${newY}px`;
        dialog.style.right = 'auto';
        dialog.style.bottom = 'auto';
        dialog.style.transform = 'none';
        dialog.style.margin = '0';
    };

    const onMouseUp = () => {
        isDragging = false;
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', onMouseDown);

    // Touch support
    handle.addEventListener('touchstart', (e) => {
        if (e.target.tagName === 'BUTTON' ||
            e.target.tagName === 'INPUT' ||
            e.target.classList.contains('dialog-close') ||
            e.target.classList.contains('btn-minimize')) {
            return;
        }

        const touch = e.touches[0];
        isDragging = true;
        startX = touch.clientX;
        startY = touch.clientY;

        const rect = dialog.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (isDragging) {
            isDragging = false;
        }
    });

    return {
        destroy: () => {
            handle.removeEventListener('mousedown', onMouseDown);
        }
    };
}

/**
 * Add minimize button and functionality to a dialog
 * @param {HTMLElement} dialog - The dialog element
 * @param {HTMLElement} header - The header element to add button to
 * @param {HTMLElement} body - The body element to hide/show
 * @param {HTMLElement} footer - The footer element to hide/show (optional)
 */
export function makeMinimizable(dialog, header, body, footer = null) {
    let isMinimized = false;
    let originalHeight = null;
    let originalWidth = null;

    // Create minimize button
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'btn-minimize';
    minimizeBtn.innerHTML = '−';
    minimizeBtn.title = 'מזער / הרחב';
    minimizeBtn.style.cssText = `
        background: none;
        border: none;
        color: inherit;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        margin-left: 8px;
        line-height: 1;
        opacity: 0.8;
    `;

    // Insert before close button if exists, or append to header
    const closeBtn = header.querySelector('.dialog-close');
    if (closeBtn) {
        closeBtn.parentNode.insertBefore(minimizeBtn, closeBtn);
    } else {
        header.appendChild(minimizeBtn);
    }

    minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        if (isMinimized) {
            // Expand
            body.style.display = '';
            if (footer) footer.style.display = '';
            dialog.style.height = originalHeight;
            dialog.style.width = originalWidth;
            dialog.style.minHeight = '';
            minimizeBtn.innerHTML = '−';
            minimizeBtn.title = 'מזער';
            isMinimized = false;
        } else {
            // Minimize
            originalHeight = dialog.style.height || 'auto';
            originalWidth = dialog.style.width || 'auto';
            body.style.display = 'none';
            if (footer) footer.style.display = 'none';
            dialog.style.height = 'auto';
            dialog.style.minHeight = '0';
            minimizeBtn.innerHTML = '+';
            minimizeBtn.title = 'הרחב';
            isMinimized = true;
        }
    });

    return {
        minimize: () => minimizeBtn.click(),
        isMinimized: () => isMinimized,
        destroy: () => minimizeBtn.remove()
    };
}

/**
 * Add both drag and minimize to a dialog
 * @param {HTMLElement} dialog - The dialog element
 * @param {Object} options - Configuration options
 * @returns {Object} Controllers for drag and minimize
 */
export function enhanceDialog(dialog, options = {}) {
    const header = options.header || dialog.querySelector('.dialog-header');
    const body = options.body || dialog.querySelector('.dialog-body');
    const footer = options.footer || dialog.querySelector('.dialog-footer');

    if (!header) {
        console.warn('[DialogUtils] No header found for dialog');
        return null;
    }

    const dragController = makeDraggable(dialog, header);
    const minimizeController = makeMinimizable(dialog, header, body, footer);

    // Add visual indicator that header is draggable
    header.style.cursor = 'move';

    return {
        drag: dragController,
        minimize: minimizeController,
        destroy: () => {
            dragController.destroy();
            minimizeController.destroy();
        }
    };
}

/**
 * Add styles for dialog enhancements
 */
export function addDialogStyles() {
    const styleId = 'dialog-utils-styles';
    if (document.getElementById(styleId)) return;

    const styles = document.createElement('style');
    styles.id = styleId;
    styles.textContent = `
        /* Minimize button hover */
        .btn-minimize:hover {
            opacity: 1 !important;
        }

        /* Draggable header indicator */
        .dialog-header[style*="cursor: move"] {
            user-select: none;
        }

        /* Transition for minimize animation */
        .dialog-body,
        .dialog-footer {
            transition: height 0.2s ease-out;
        }

        /* Make sure minimized dialogs stay visible */
        .name-confirm-dialog,
        .radio-group-dialog {
            min-width: 200px;
        }
    `;
    document.head.appendChild(styles);
}
