/**
 * Field Auto-Grouping Module
 * Automatically detects and suggests grouping for checkbox/radio fields
 * that appear in sequence (same column or row, close proximity).
 *
 * IMPORTANT: This is an ADDITIVE module only.
 * Does NOT modify any existing logic - only observes and suggests.
 */

export class FieldAutoGrouping {
    constructor(mapper) {
        this.mapper = mapper;
        this.overlay = null;
        this.isVisible = false;

        // Configuration
        this.MAX_DISTANCE = 200;        // Max distance between field centers (px)
        this.COLUMN_THRESHOLD = 30;     // Max ΔX to be considered same column
        this.ROW_THRESHOLD = 30;        // Max ΔY to be considered same row
        this.TIME_WINDOW_MS = 90000;    // 90 seconds window for recent fields
        this.MIN_FIELDS_FOR_GROUP = 2;  // Minimum fields to suggest grouping

        // Track recent checkbox/radio field creations
        this.recentFields = [];  // { field, timestamp, bbox }
    }

    /**
     * Called when a new field is created
     * Checks if it should be part of a group
     * @param {Object} field - The created field
     * @param {Object} bbox - { x, y, width, height } canvas coordinates
     */
    onFieldCreated(field, bbox) {
        // Only process checkbox and radio types
        if (field.type !== 'checkbox' && field.type !== 'radio') {
            return;
        }

        // Add to recent fields
        this.recentFields.push({
            field,
            bbox,
            timestamp: Date.now()
        });

        // Clean old entries
        this._cleanOldEntries();

        // Check for potential group
        const potentialGroup = this._findPotentialGroup(field, bbox);

        if (potentialGroup.length >= this.MIN_FIELDS_FOR_GROUP) {
            // Show grouping suggestion
            this._showGroupingSuggestion(potentialGroup, bbox);
        }
    }

    /**
     * Clean entries older than TIME_WINDOW_MS
     * @private
     */
    _cleanOldEntries() {
        const cutoff = Date.now() - this.TIME_WINDOW_MS;
        this.recentFields = this.recentFields.filter(entry => entry.timestamp > cutoff);
    }

    /**
     * Find fields that could be grouped with the new field
     * @param {Object} newField - The newly created field
     * @param {Object} newBbox - Bbox of the new field
     * @returns {Array} Array of field entries that form a potential group
     * @private
     */
    _findPotentialGroup(newField, newBbox) {
        const candidates = [];
        const newCenter = this._getCenter(newBbox);

        // Filter to same page and same type
        const sameTypeFields = this.recentFields.filter(entry =>
            entry.field.type === newField.type &&
            entry.field.page === this.mapper.currentPage &&
            entry.field.id !== newField.id &&
            !entry.field.groupId  // Not already in a group
        );

        for (const entry of sameTypeFields) {
            const entryCenter = this._getCenter(entry.bbox);
            const distance = this._distance(newCenter, entryCenter);
            const deltaX = Math.abs(newCenter.x - entryCenter.x);
            const deltaY = Math.abs(newCenter.y - entryCenter.y);

            // Check if this field is close enough
            const isClose = (
                distance < this.MAX_DISTANCE ||
                deltaX < this.COLUMN_THRESHOLD ||
                deltaY < this.ROW_THRESHOLD
            );

            if (isClose) {
                candidates.push(entry);
            }
        }

        // Include the new field itself
        const newEntry = this.recentFields.find(e => e.field.id === newField.id);
        if (newEntry) {
            candidates.push(newEntry);
        }

        // Sort by Y position (top to bottom)
        candidates.sort((a, b) => a.bbox.y - b.bbox.y);

        return candidates;
    }

    /**
     * Get center point of a bbox
     * @private
     */
    _getCenter(bbox) {
        return {
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2
        };
    }

    /**
     * Calculate Euclidean distance between two points
     * @private
     */
    _distance(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }

    /**
     * Show the grouping suggestion UI
     * @param {Array} groupCandidates - Fields that can be grouped
     * @param {Object} anchorBbox - Bbox to position the suggestion near
     * @private
     */
    _showGroupingSuggestion(groupCandidates, anchorBbox) {
        // Hide any existing suggestion
        this.hide();

        this.isVisible = true;
        this.currentCandidates = groupCandidates;

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'field-auto-grouping-suggestion';
        this.overlay.id = 'field-auto-grouping-suggestion';

        // Position near the anchor bbox
        const zoomLevel = this.mapper.zoomLevel || 1;
        const layer = document.getElementById('mapping-layer');
        if (!layer) {
            this.hide();
            return;
        }

        const layerRect = layer.getBoundingClientRect();
        const overlayX = layerRect.left + (anchorBbox.x * zoomLevel) + (anchorBbox.width * zoomLevel) + 10;
        const overlayY = layerRect.top + (anchorBbox.y * zoomLevel);

        this.overlay.style.left = `${overlayX}px`;
        this.overlay.style.top = `${overlayY}px`;

        // Get field type for display
        const fieldType = groupCandidates[0]?.field.type || 'checkbox';
        const typeLabel = fieldType === 'radio' ? 'רדיו' : 'צ\'קבוקס';

        // Build content
        this.overlay.innerHTML = `
            <div class="fag-content">
                <div class="fag-icon">🔗</div>
                <div class="fag-text">
                    <div class="fag-title">נמצאו ${groupCandidates.length} שדות ${typeLabel}</div>
                    <div class="fag-subtitle">לאחד לקבוצה?</div>
                </div>
            </div>
            <div class="fag-buttons">
                <button class="fag-btn fag-btn-confirm" data-action="confirm">לאחד</button>
                <button class="fag-btn fag-btn-dismiss" data-action="dismiss">לא עכשיו</button>
            </div>
        `;

        // Add to body
        document.body.appendChild(this.overlay);

        // Attach handlers
        this._attachHandlers();

        // Auto-dismiss after 8 seconds
        this._dismissTimeout = setTimeout(() => {
            this.hide();
        }, 8000);

        console.log('🔗 Auto-grouping suggestion shown for', groupCandidates.length, 'fields');
    }

    /**
     * Attach click handlers to buttons
     * @private
     */
    _attachHandlers() {
        if (!this.overlay) return;

        const confirmBtn = this.overlay.querySelector('[data-action="confirm"]');
        const dismissBtn = this.overlay.querySelector('[data-action="dismiss"]');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._createGroup();
            });
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
            });
        }
    }

    /**
     * Create a group from the current candidates
     * @private
     */
    _createGroup() {
        if (!this.currentCandidates || this.currentCandidates.length < 2) {
            this.hide();
            return;
        }

        // Generate unique group ID
        const groupId = `group_${Date.now()}`;

        // Sort candidates by Y position
        this.currentCandidates.sort((a, b) => a.bbox.y - b.bbox.y);

        // Apply groupId to all fields in the group
        for (let i = 0; i < this.currentCandidates.length; i++) {
            const entry = this.currentCandidates[i];
            const field = entry.field;

            // Update field with group info
            field.groupId = groupId;
            field.optionIndex = i;
            field.optionLabel = field.labelHe || field.label_he || `אפשרות ${i + 1}`;

            // Also update in mapper.fields array
            const mapperField = this.mapper.fields.find(f => f.id === field.id);
            if (mapperField) {
                mapperField.groupId = groupId;
                mapperField.optionIndex = i;
                mapperField.optionLabel = field.optionLabel;
            }
        }

        // Show success toast
        this.mapper.showToast(`✅ ${this.currentCandidates.length} שדות אוחדו לקבוצה`, 'success');

        console.log('🔗 Group created:', {
            groupId,
            fieldCount: this.currentCandidates.length,
            fieldIds: this.currentCandidates.map(c => c.field.id)
        });

        // Clear candidates from recent fields to prevent re-grouping
        const groupedIds = new Set(this.currentCandidates.map(c => c.field.id));
        this.recentFields = this.recentFields.filter(e => !groupedIds.has(e.field.id));

        this.hide();
    }

    /**
     * Hide the suggestion overlay
     */
    hide() {
        if (this._dismissTimeout) {
            clearTimeout(this._dismissTimeout);
            this._dismissTimeout = null;
        }

        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        this.isVisible = false;
        this.currentCandidates = null;
    }

    /**
     * Full cleanup - call on page change, file upload, etc.
     */
    cleanup() {
        this.hide();
        this.recentFields = [];
        console.log('🧹 FieldAutoGrouping cleaned up');
    }

    /**
     * Check if suggestion is currently visible
     * @returns {boolean}
     */
    isActive() {
        return this.isVisible;
    }
}

// Self-register to window
if (typeof window !== 'undefined') {
    window.FieldAutoGrouping = FieldAutoGrouping;
}

console.log('🔗 Field Auto-Grouping module loaded');
