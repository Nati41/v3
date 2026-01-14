/**
 * Smart Auto-Save Module
 * Automatically saves mapping state to localStorage with debouncing.
 * Provides draft recovery when the same PDF is reopened.
 *
 * IMPORTANT: This is an ADDITIVE module only.
 * Does NOT modify any existing logic - only observes and saves.
 */

export class SmartAutoSave {
    constructor(mapper) {
        this.mapper = mapper;
        this.saveTimeout = null;
        this.isEnabled = true;
        this.lastSaveTime = null;
        this.pendingDraft = null;

        // Configuration
        this.DEBOUNCE_MS = 800;           // Save after 800ms of inactivity
        this.STORAGE_KEY_PREFIX = 'tofesly_draft_';
        this.MAX_DRAFTS = 10;             // Keep max 10 drafts in localStorage
        this.DRAFT_EXPIRY_DAYS = 7;       // Drafts expire after 7 days

        // Indicator element
        this.indicator = null;
    }

    /**
     * Initialize the auto-save system
     * Call this after mapper is ready
     */
    init() {
        this._createIndicator();
        this._cleanupOldDrafts();
        console.log('💾 SmartAutoSave initialized');
    }

    /**
     * Generate storage key for a PDF file
     * Uses file name + size as unique identifier
     * @param {string} fileName - Name of the PDF file
     * @param {number} fileSize - Size of the file in bytes
     * @returns {string} Storage key
     */
    _getStorageKey(fileName, fileSize) {
        // Create a simple hash from filename + size
        const identifier = `${fileName}_${fileSize}`;
        return this.STORAGE_KEY_PREFIX + btoa(identifier).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
    }

    /**
     * Schedule a save operation (debounced)
     * Call this whenever mapping state changes
     */
    scheduleSave() {
        if (!this.isEnabled) return;

        // Clear any pending save
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        // Show "saving..." indicator
        this._showIndicator('saving');

        // Schedule new save
        this.saveTimeout = setTimeout(() => {
            this._performSave();
        }, this.DEBOUNCE_MS);
    }

    /**
     * Perform the actual save operation
     * @private
     */
    _performSave() {
        try {
            const draft = this._createDraftData();
            if (!draft) {
                this._hideIndicator();
                return;
            }

            const key = this._getStorageKey(draft.fileName, draft.fileSize);
            localStorage.setItem(key, JSON.stringify(draft));

            this.lastSaveTime = Date.now();
            this._showIndicator('saved');

            // Hide indicator after 2 seconds
            setTimeout(() => {
                this._hideIndicator();
            }, 2000);

            console.log('💾 Draft saved:', {
                key: key.slice(0, 20) + '...',
                fieldsCount: draft.fields?.length || 0,
                timestamp: new Date(draft.timestamp).toLocaleTimeString()
            });

        } catch (err) {
            console.warn('💾 Auto-save failed:', err.message);
            this._showIndicator('error');
            setTimeout(() => this._hideIndicator(), 3000);
        }
    }

    /**
     * Create draft data object from current mapper state
     * @returns {Object|null} Draft data or null if not saveable
     * @private
     */
    _createDraftData() {
        // Must have a loaded file
        if (!this.mapper.currentFile) {
            return null;
        }

        // Must have at least one field OR table
        const hasFields = this.mapper.fields && this.mapper.fields.length > 0;
        const hasTables = this.mapper.mappedTables && this.mapper.mappedTables.length > 0;

        if (!hasFields && !hasTables) {
            return null;
        }

        return {
            version: 1,
            timestamp: Date.now(),
            fileName: this.mapper.currentFile.name,
            fileSize: this.mapper.currentFile.size,
            currentPage: this.mapper.currentPage,
            totalPages: this.mapper.totalPages,
            fields: (this.mapper.fields || []).map(f => ({
                ...f,
                // Exclude any DOM references or non-serializable data
                element: undefined
            })),
            tables: this.mapper.mappedTables || [],
            formName: this.mapper.formNameInput?.value || '',
            zoomLevel: this.mapper.zoomLevel
        };
    }

    /**
     * Check if a draft exists for the given file
     * @param {string} fileName - Name of the PDF file
     * @param {number} fileSize - Size of the file in bytes
     * @returns {Object|null} Draft data or null
     */
    checkForDraft(fileName, fileSize) {
        try {
            const key = this._getStorageKey(fileName, fileSize);
            const stored = localStorage.getItem(key);

            if (!stored) return null;

            const draft = JSON.parse(stored);

            // Check if draft is expired
            const ageMs = Date.now() - draft.timestamp;
            const maxAgeMs = this.DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

            if (ageMs > maxAgeMs) {
                localStorage.removeItem(key);
                return null;
            }

            // Store as pending for potential recovery
            this.pendingDraft = { key, draft };

            return draft;

        } catch (err) {
            console.warn('💾 Failed to check for draft:', err.message);
            return null;
        }
    }

    /**
     * Load a draft into the mapper
     * @param {Object} draft - The draft data to load
     * @returns {boolean} Success status
     */
    loadDraft(draft) {
        try {
            if (!draft || !draft.fields) {
                return false;
            }

            // Restore fields
            this.mapper.fields = draft.fields;

            // Restore current page if valid
            if (draft.currentPage && draft.currentPage <= draft.totalPages) {
                this.mapper.currentPage = draft.currentPage;
            }

            // Restore form name
            if (draft.formName && this.mapper.formNameInput) {
                this.mapper.formNameInput.value = draft.formName;
            }

            // Restore zoom level
            if (draft.zoomLevel) {
                this.mapper.zoomLevel = draft.zoomLevel;
            }

            console.log('💾 Draft loaded:', {
                fieldsCount: draft.fields.length,
                savedAt: new Date(draft.timestamp).toLocaleString()
            });

            return true;

        } catch (err) {
            console.warn('💾 Failed to load draft:', err.message);
            return false;
        }
    }

    /**
     * Clear the draft for current file
     */
    clearCurrentDraft() {
        if (!this.mapper.currentFile) return;

        try {
            const key = this._getStorageKey(
                this.mapper.currentFile.name,
                this.mapper.currentFile.size
            );
            localStorage.removeItem(key);
            this.pendingDraft = null;

            console.log('💾 Draft cleared for:', this.mapper.currentFile.name);

        } catch (err) {
            console.warn('💾 Failed to clear draft:', err.message);
        }
    }

    /**
     * Clear the pending draft without loading it
     */
    dismissPendingDraft() {
        if (this.pendingDraft) {
            localStorage.removeItem(this.pendingDraft.key);
            this.pendingDraft = null;
        }
    }

    /**
     * Clean up old drafts to prevent localStorage bloat
     * @private
     */
    _cleanupOldDrafts() {
        try {
            const drafts = [];

            // Find all draft keys
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        drafts.push({ key, timestamp: data.timestamp || 0 });
                    } catch {
                        // Invalid draft, remove it
                        localStorage.removeItem(key);
                    }
                }
            }

            // Sort by timestamp (newest first)
            drafts.sort((a, b) => b.timestamp - a.timestamp);

            // Remove excess drafts
            if (drafts.length > this.MAX_DRAFTS) {
                const toRemove = drafts.slice(this.MAX_DRAFTS);
                toRemove.forEach(d => localStorage.removeItem(d.key));
                console.log(`💾 Cleaned up ${toRemove.length} old drafts`);
            }

            // Remove expired drafts
            const maxAgeMs = this.DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
            const now = Date.now();
            drafts.forEach(d => {
                if (now - d.timestamp > maxAgeMs) {
                    localStorage.removeItem(d.key);
                }
            });

        } catch (err) {
            console.warn('💾 Draft cleanup failed:', err.message);
        }
    }

    /**
     * Create the save indicator element
     * @private
     */
    _createIndicator() {
        this.indicator = document.createElement('div');
        this.indicator.className = 'auto-save-indicator';
        this.indicator.id = 'auto-save-indicator';
        this.indicator.style.display = 'none';
        document.body.appendChild(this.indicator);
    }

    /**
     * Show the save indicator with a status
     * @param {string} status - 'saving', 'saved', or 'error'
     * @private
     */
    _showIndicator(status) {
        if (!this.indicator) return;

        this.indicator.className = `auto-save-indicator ${status}`;

        switch (status) {
            case 'saving':
                this.indicator.innerHTML = '<span class="asi-icon">💾</span><span class="asi-text">שומר...</span>';
                break;
            case 'saved':
                this.indicator.innerHTML = '<span class="asi-icon">✅</span><span class="asi-text">נשמר</span>';
                break;
            case 'error':
                this.indicator.innerHTML = '<span class="asi-icon">⚠️</span><span class="asi-text">שגיאה</span>';
                break;
        }

        this.indicator.style.display = 'flex';
    }

    /**
     * Hide the save indicator
     * @private
     */
    _hideIndicator() {
        if (this.indicator) {
            this.indicator.style.display = 'none';
        }
    }

    /**
     * Enable auto-save
     */
    enable() {
        this.isEnabled = true;
        console.log('💾 Auto-save enabled');
    }

    /**
     * Disable auto-save
     */
    disable() {
        this.isEnabled = false;
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        console.log('💾 Auto-save disabled');
    }

    /**
     * Full cleanup - call on mapper destroy
     */
    cleanup() {
        this.disable();
        if (this.indicator) {
            this.indicator.remove();
            this.indicator = null;
        }
        this.pendingDraft = null;
        console.log('🧹 SmartAutoSave cleaned up');
    }

    /**
     * Get info about pending draft for UI display
     * @returns {Object|null} Draft info or null
     */
    getPendingDraftInfo() {
        if (!this.pendingDraft) return null;

        const draft = this.pendingDraft.draft;
        const ageMs = Date.now() - draft.timestamp;
        const ageMinutes = Math.floor(ageMs / 60000);
        const ageHours = Math.floor(ageMinutes / 60);

        let ageText;
        if (ageHours > 24) {
            ageText = `לפני ${Math.floor(ageHours / 24)} ימים`;
        } else if (ageHours > 0) {
            ageText = `לפני ${ageHours} שעות`;
        } else if (ageMinutes > 0) {
            ageText = `לפני ${ageMinutes} דקות`;
        } else {
            ageText = 'לפני פחות מדקה';
        }

        return {
            fieldsCount: draft.fields?.length || 0,
            savedAt: new Date(draft.timestamp).toLocaleString('he-IL'),
            ageText,
            page: draft.currentPage,
            totalPages: draft.totalPages
        };
    }
}

// Self-register to window
if (typeof window !== 'undefined') {
    window.SmartAutoSave = SmartAutoSave;
}

console.log('💾 Smart Auto-Save module loaded');
