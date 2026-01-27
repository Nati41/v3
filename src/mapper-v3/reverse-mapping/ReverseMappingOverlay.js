/**
 * ReverseMappingOverlay.js
 * Handles rendering [number | type] badges for reverse mapping elements
 *
 * Each drawn element gets a small overlay badge in the corner showing:
 * [ 1 | F ] for text field
 * [ 2 | C ] for checkbox
 * [ 3 | R ] for radio
 * [ 4 | T ] for table cell
 * [ 5 | S ] for signature
 */
// Badge colors per type (using string literals to avoid circular dependency)
const TYPE_COLORS = {
    'F': { bg: '#3b82f6', text: '#ffffff' },      // Field - Blue
    'C': { bg: '#10b981', text: '#ffffff' },      // Checkbox - Green
    'R': { bg: '#8b5cf6', text: '#ffffff' },      // Radio - Purple
    'T': { bg: '#f59e0b', text: '#000000' },      // Table - Orange
    'S': { bg: '#ef4444', text: '#ffffff' }       // Signature - Red
};

export class ReverseMappingOverlay {
    constructor() {
        this.container = null;
        this.badges = new Map();  // elementId -> badge DOM element
        this.canvas = null;       // For capturing with badges
    }

    /**
     * Initialize the overlay
     */
    init() {
        // Create container for badges
        this.container = document.createElement('div');
        this.container.id = 'reverse-mapping-badges';
        this.container.className = 'reverse-mapping-badges-container';

        // Find the viewer area and append as sibling to overlay-layer (not inside it)
        const overlayLayer = document.querySelector('#overlay-layer');
        if (overlayLayer && overlayLayer.parentElement) {
            overlayLayer.parentElement.appendChild(this.container);
            console.log('[ReverseMappingOverlay] Container appended as sibling to overlay-layer');
        } else {
            const pdfContainer = document.querySelector('#pdf-container');
            if (pdfContainer) {
                pdfContainer.appendChild(this.container);
                console.log('[ReverseMappingOverlay] Container appended to pdf-container');
            } else {
                document.body.appendChild(this.container);
                console.log('[ReverseMappingOverlay] Container appended to body (fallback)');
            }
        }

        console.log('[ReverseMappingOverlay] Initialized');
    }

    /**
     * Destroy the overlay
     */
    destroy() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.badges.clear();
    }

    /**
     * Add a badge for an element
     * @param {Object} element - {id, number, type, bbox, page}
     */
    addBadge(element) {
        if (!this.container) return;

        const badge = this._createBadge(element);
        this.container.appendChild(badge);
        this.badges.set(element.id, badge);

        // Position the badge
        this._positionBadge(badge, element.bbox);
    }

    /**
     * Remove a badge
     * @param {string} elementId - Element ID
     */
    removeBadge(elementId) {
        const badge = this.badges.get(elementId);
        if (badge) {
            badge.remove();
            this.badges.delete(elementId);
        }
    }

    /**
     * Update badge position
     * @param {string} elementId - Element ID
     * @param {Object} bbox - New bounding box
     */
    updateBadgePosition(elementId, bbox) {
        const badge = this.badges.get(elementId);
        if (badge) {
            this._positionBadge(badge, bbox);
        }
    }

    /**
     * Clear all badges
     */
    clearAll() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.badges.clear();
    }

    /**
     * Create badge DOM element
     */
    _createBadge(element) {
        const { number, type, id } = element;
        const colors = TYPE_COLORS[type] || TYPE_COLORS['F'];

        const badge = document.createElement('div');
        badge.className = 'reverse-badge-item';
        badge.dataset.elementId = id;
        badge.dataset.type = type;

        badge.innerHTML = `
            <span class="badge-content" style="background: ${colors.bg}; color: ${colors.text};">
                <span class="badge-number">${number}</span>
                <span class="badge-divider">|</span>
                <span class="badge-type">${type}</span>
            </span>
        `;

        // Add hover/click handlers
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            this._onBadgeClick(element);
        });

        badge.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._onBadgeRightClick(element);
        });

        return badge;
    }

    /**
     * Position badge at top-left corner of element
     */
    _positionBadge(badge, bbox) {
        // No coordinate conversion needed - bbox is already in overlay layer coordinates
        if (!bbox || typeof bbox.x !== 'number') return;

        // Calculate position (INSIDE the field, top-left corner with small padding)
        const x = bbox.x + 2;
        const y = bbox.y + 2;

        badge.style.left = `${x}px`;
        badge.style.top = `${y}px`;

        console.log('[ReverseMappingOverlay] Badge positioned at:', x, y, 'bbox:', bbox);
    }

    /**
     * Reposition all badges (call after zoom/pan)
     * @param {Array} elements - Current elements array
     */
    repositionAll(elements) {
        for (const element of elements) {
            this.updateBadgePosition(element.id, element.bbox);
        }
    }

    /**
     * Handle badge click
     */
    _onBadgeClick(element) {
        console.log('[ReverseMappingOverlay] Badge clicked:', element.number);
        // Could emit event for selection
        import('../core/EventBus.js').then(({ eventBus }) => {
            eventBus.emit('REVERSE_ELEMENT_SELECT', { element });
        });
    }

    /**
     * Handle badge right-click (delete)
     */
    _onBadgeRightClick(element) {
        console.log('[ReverseMappingOverlay] Badge right-clicked:', element.number);
        import('../core/EventBus.js').then(({ eventBus }) => {
            eventBus.emit('REVERSE_ELEMENT_DELETE', { elementId: element.id });
        });
    }

    /**
     * Capture the PDF page with all badges rendered.
     * PDFEngine renders to <img> (not <canvas>), so we load the img into a
     * temporary canvas, composite badges on top, and export as PNG.
     *
     * @returns {{ ok: boolean, data?: string, reason?: string }}
     *   ok=true  → data contains base64 PNG
     *   ok=false → reason explains why capture failed
     */
    async captureWithBadges() {
        try {
            // PDFEngine puts an <img> inside #pdf-container (there is NO canvas in the DOM)
            const pdfContainer = document.getElementById('pdf-container');
            const pdfImg = pdfContainer?.querySelector('img');

            if (!pdfImg) {
                console.warn('[ReverseMappingOverlay] captureWithBadges: no <img> in #pdf-container');
                return { ok: false, reason: 'NO_PDF_IMAGE' };
            }

            if (!pdfImg.naturalWidth || !pdfImg.naturalHeight) {
                console.warn('[ReverseMappingOverlay] captureWithBadges: img not loaded yet');
                return { ok: false, reason: 'IMG_NOT_LOADED' };
            }

            // Load the <img> into a temporary canvas for compositing
            const compositeCanvas = document.createElement('canvas');
            const ctx = compositeCanvas.getContext('2d');

            compositeCanvas.width = pdfImg.naturalWidth;
            compositeCanvas.height = pdfImg.naturalHeight;

            ctx.drawImage(pdfImg, 0, 0, pdfImg.naturalWidth, pdfImg.naturalHeight);

            // Scale factor: natural (pixel) size vs CSS display size
            const displayedWidth = pdfImg.offsetWidth || pdfImg.clientWidth || 1;
            const displayedHeight = pdfImg.offsetHeight || pdfImg.clientHeight || 1;
            const scaleX = pdfImg.naturalWidth / displayedWidth;
            const scaleY = pdfImg.naturalHeight / displayedHeight;

            // Draw each badge on the canvas
            for (const [elementId, badgeEl] of this.badges) {
                await this._drawBadgeOnCanvas(ctx, badgeEl, scaleX, scaleY);
            }

            return { ok: true, data: compositeCanvas.toDataURL('image/png') };
        } catch (err) {
            console.error('[ReverseMappingOverlay] captureWithBadges error:', err);
            return { ok: false, reason: err.message || 'CAPTURE_ERROR' };
        }
    }

    /**
     * Draw a badge on canvas
     */
    async _drawBadgeOnCanvas(ctx, badgeEl, scaleX, scaleY) {
        // Get badge position from its style
        const left = parseFloat(badgeEl.style.left) || 0;
        const top = parseFloat(badgeEl.style.top) || 0;

        // Get badge content
        const content = badgeEl.querySelector('.badge-content');
        if (!content) return;

        const number = badgeEl.querySelector('.badge-number')?.textContent || '?';
        const type = badgeEl.dataset.type || 'F';
        const colors = TYPE_COLORS[type] || TYPE_COLORS['F'];

        // Scale coordinates
        const x = left * scaleX;
        const y = top * scaleY;

        // Draw badge background
        const badgeWidth = 50 * scaleX;
        const badgeHeight = 18 * scaleY;
        const radius = 4 * scaleX;

        ctx.save();

        // Rounded rectangle
        ctx.beginPath();
        ctx.roundRect(x, y, badgeWidth, badgeHeight, radius);
        ctx.fillStyle = colors.bg;
        ctx.fill();

        // Border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Text
        ctx.fillStyle = colors.text;
        ctx.font = `bold ${12 * scaleX}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${number} | ${type}`, x + badgeWidth / 2, y + badgeHeight / 2);

        ctx.restore();
    }

    /**
     * Show visual feedback when element is being drawn
     */
    showDrawingPreview(bbox, type) {
        let preview = document.getElementById('reverse-drawing-preview');

        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'reverse-drawing-preview';
            preview.className = 'reverse-drawing-preview';
            this.container?.appendChild(preview);
        }

        const colors = TYPE_COLORS[type] || TYPE_COLORS['F'];

        preview.style.display = 'block';
        preview.style.left = `${bbox.x}px`;
        preview.style.top = `${bbox.y}px`;
        preview.style.width = `${bbox.width}px`;
        preview.style.height = `${bbox.height}px`;
        preview.style.borderColor = colors.bg;
    }

    /**
     * Hide drawing preview
     */
    hideDrawingPreview() {
        const preview = document.getElementById('reverse-drawing-preview');
        if (preview) {
            preview.style.display = 'none';
        }
    }
}
