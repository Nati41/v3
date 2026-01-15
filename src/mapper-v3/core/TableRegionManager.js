/**
 * TableRegionManager.js
 * V3.10: New table system - human-declared regions
 *
 * Core principle: Tables are created when the user declares them,
 * not guessed by the system.
 *
 * Workflow:
 * 1. User draws rectangle around table area
 * 2. System detects AI fields inside (position + pattern)
 * 3. User confirms the table
 * 4. User maps ONE text field to define row physics
 * 5. User specifies row count
 * 6. System auto-replicates all columns
 */

import { eventBus, Events } from './EventBus.js';
import { state } from './StateManager.js';

/**
 * TableRegion entity structure
 */
export class TableRegion {
    constructor(id, bbox, page = 1) {
        this.id = id;
        this.bbox = bbox;              // [x, y, w, h] normalized coords
        this.page = page;              // Page number this region belongs to
        this.columns = [];             // { fieldId, name_he, name_en, type, x }
        this.rowStep = null;           // Calculated from first mapped field
        this.rowCount = null;          // User-specified
        this.isStructureLocked = false;
        this.firstMappedFieldId = null;
        this.name = null;              // Auto-generated table name
        this.createdAt = Date.now();
    }

    toJSON() {
        return {
            id: this.id,
            bbox: this.bbox,
            page: this.page,
            columns: this.columns,
            rowStep: this.rowStep,
            rowCount: this.rowCount,
            isStructureLocked: this.isStructureLocked,
            firstMappedFieldId: this.firstMappedFieldId,
            name: this.name
        };
    }

    static fromJSON(json) {
        const region = new TableRegion(json.id, json.bbox, json.page || 1);
        region.columns = json.columns || [];
        region.rowStep = json.rowStep;
        region.rowCount = json.rowCount;
        region.isStructureLocked = json.isStructureLocked || false;
        region.firstMappedFieldId = json.firstMappedFieldId;
        region.name = json.name || null;
        return region;
    }
}

/**
 * TableRegionManager - manages all table regions
 */
class TableRegionManager {
    constructor() {
        this._regions = new Map(); // id -> TableRegion
        this._activeRegionId = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Listen for field mappings to detect table row physics
        eventBus.on('field:mapped', ({ fieldId }) => {
            this._onFieldMapped(fieldId);
        });

        console.log('[TableRegionManager] Initialized');
    }

    /**
     * Handle field mapped event - check if inside a table region
     * @param {string} fieldId
     */
    _onFieldMapped(fieldId) {
        const field = state.getField(fieldId);
        if (!field || !field.bbox) return;

        // Skip if already part of a table (replicated field)
        if (field.tableRegionId) return;

        // Check if field is inside any table region
        const region = this._findRegionContainingField(field);
        if (!region) return;

        console.log(`[TableRegionManager] Field ${fieldId} mapped inside region ${region.id}`);

        // If this is the first mapped field, set up row physics
        if (!region.firstMappedFieldId && !region.isStructureLocked) {
            this._setupRowPhysics(region, field);
        } else if (region.isStructureLocked) {
            // Structure is locked, offer to replicate this column too
            this._offerColumnReplication(region, field);
        }
    }

    /**
     * Offer to replicate a column (for fields mapped after first one)
     * @param {TableRegion} region
     * @param {Object} field
     */
    _offerColumnReplication(region, field) {
        // Mark field as row 0 of this table
        state.updateField(field.id, {
            tableRegionId: region.id,
            tableRow: 0
        });

        // Show replication dialog
        this._showReplicationDialog(region, field);
    }

    /**
     * Find which region contains a field (if any)
     * @param {Object} field
     * @returns {TableRegion|null}
     */
    _findRegionContainingField(field) {
        const center = this._getFieldCenter(field);
        if (!center) return null;

        for (const region of this._regions.values()) {
            const [rx, ry, rw, rh] = region.bbox;
            if (center.x >= rx && center.x <= rx + rw &&
                center.y >= ry && center.y <= ry + rh) {
                return region;
            }
        }
        return null;
    }

    /**
     * Setup row physics from the first mapped field
     * @param {TableRegion} region
     * @param {Object} field
     */
    _setupRowPhysics(region, field) {
        region.firstMappedFieldId = field.id;

        // Calculate rowStep from field height
        // bbox is [x, y, w, h] in normalized coordinates
        const fieldHeight = field.bbox[3];
        region.rowStep = fieldHeight * 1.2; // Add 20% padding between rows

        region.isStructureLocked = true;

        console.log(`[TableRegionManager] Row physics set from field ${field.id}: rowStep=${region.rowStep}`);

        // Update field to mark it as part of this table, row 0
        state.updateField(field.id, {
            tableRegionId: region.id,
            tableRow: 0
        });

        eventBus.emit(Events.TABLE_REGION_UPDATED, { region });

        // Show replication dialog
        this._showReplicationDialog(region, field);
    }

    /**
     * Show dialog to replicate column
     * @param {TableRegion} region
     * @param {Object} field
     */
    _showReplicationDialog(region, field) {
        const existingDialog = document.querySelector('.table-replicate-dialog');
        if (existingDialog) existingDialog.remove();

        const fieldName = field.label_he || field.label_en || field.name || 'שדה';

        const dialog = document.createElement('div');
        dialog.className = 'table-replicate-dialog';
        dialog.innerHTML = `
            <div class="table-replicate-content">
                <h4>שכפל עמודה בטבלה</h4>
                <p class="field-name">${fieldName}</p>
                <div class="replicate-settings">
                    <div class="setting-row">
                        <label>מספר שורות בטבלה:</label>
                        <input type="number" class="row-count-input" value="${region.rowCount || 10}" min="2" max="50" />
                    </div>
                </div>
                <p class="auto-calc-note">גובה שורה יחושב אוטומטית לפי גבולות הטבלה</p>
                <div class="table-replicate-buttons">
                    <button class="btn-replicate">✓ שכפל</button>
                    <button class="btn-skip">דלג</button>
                </div>
            </div>
        `;

        dialog.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            direction: rtl;
            min-width: 280px;
        `;

        const rowCountInput = dialog.querySelector('.row-count-input');
        const replicateBtn = dialog.querySelector('.btn-replicate');
        const skipBtn = dialog.querySelector('.btn-skip');

        replicateBtn.addEventListener('click', () => {
            const rowCount = parseInt(rowCountInput.value) || 10;

            // Calculate row step from table region height and row count
            // This ensures fields fit exactly within the table boundaries
            const tableHeight = region.bbox[3]; // height of table region
            const calculatedRowStep = tableHeight / rowCount;

            // Update region settings
            region.rowCount = rowCount;
            region.rowStep = calculatedRowStep;

            console.log(`[TableRegionManager] Auto-calculated rowStep: ${calculatedRowStep} (tableHeight=${tableHeight}, rowCount=${rowCount})`);

            const created = this.replicateColumn(region.id, field.id);
            dialog.remove();
            eventBus.emit('toast:show', {
                message: `נוצרו ${created.length} שדות`,
                type: 'success',
                duration: 3000
            });
        });

        skipBtn.addEventListener('click', () => {
            dialog.remove();
        });

        document.body.appendChild(dialog);

        // Auto-remove after 30 seconds
        setTimeout(() => {
            if (dialog.parentNode) dialog.remove();
        }, 30000);
    }

    /**
     * Try to detect row height from other mapped fields in the table
     * @param {TableRegion} region
     * @param {Object} currentField
     * @returns {number|null}
     */
    _detectRowHeight(region, currentField) {
        const fields = state.get('fields') || [];
        const tableFields = fields.filter(f =>
            f.tableRegionId === region.id &&
            f.bbox &&
            f.id !== currentField.id
        );

        if (tableFields.length === 0) return null;

        // Find a field in a different column (different X) with multiple rows
        const currentX = currentField.bbox[0];
        for (const otherField of tableFields) {
            const otherX = otherField.bbox[0];
            // If X positions are different enough, it's a different column
            if (Math.abs(otherX - currentX) > 0.01) {
                // Use this field's row step if available
                if (otherField.tableRow === 0) {
                    // Find row 1 of this column
                    const row1 = tableFields.find(f =>
                        Math.abs(f.bbox[0] - otherX) < 0.01 &&
                        f.tableRow === 1
                    );
                    if (row1) {
                        return row1.bbox[1] - otherField.bbox[1];
                    }
                }
            }
        }

        return null;
    }

    /**
     * Create a new table region from user-drawn bbox
     * @param {Array} bbox - [x, y, w, h] normalized coordinates
     * @returns {TableRegion}
     */
    createRegion(bbox) {
        const id = `table_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const currentPage = state.get('document.currentPage') || 1;
        const region = new TableRegion(id, bbox, currentPage);

        // Detect fields inside the region
        const detectedFields = this._detectFieldsInRegion(bbox);
        region.columns = detectedFields;

        this._regions.set(id, region);
        this._activeRegionId = id;

        console.log(`[TableRegionManager] Created region ${id} on page ${currentPage} with ${detectedFields.length} columns`);

        eventBus.emit(Events.TABLE_REGION_CREATED, { region });
        return region;
    }

    /**
     * Detect fields for table region
     * 1. First try: fields with positions inside the drawn region
     * 2. Fallback: fields with repeating name patterns (unmapped fields)
     * @param {Array} regionBbox - [x, y, w, h]
     * @returns {Array} detected columns
     */
    _detectFieldsInRegion(regionBbox) {
        const [rx, ry, rw, rh] = regionBbox;
        const fields = state.get('fields') || [];
        const detectedMap = new Map(); // baseName -> { count, fields, type }

        // Method 1: Try to find fields with positions inside the region
        for (const field of fields) {
            const center = this._getFieldCenter(field);
            const isInside = center &&
                center.x >= rx && center.x <= rx + rw &&
                center.y >= ry && center.y <= ry + rh;

            if (!isInside) continue;

            const baseName = this._getBaseName(field.label_en || field.name || '');
            const key = baseName || field.id;

            if (!detectedMap.has(key)) {
                detectedMap.set(key, {
                    baseName: key,
                    name_he: field.label_he || field.name,
                    name_en: field.label_en || field.name,
                    type: field.type || 'text',
                    count: 0,
                    fieldIds: [],
                    x: center.x
                });
            }
            const entry = detectedMap.get(key);
            entry.count++;
            entry.fieldIds.push(field.id);
            if (center.x < entry.x) {
                entry.x = center.x;
            }
        }

        // Method 2: If no positioned fields found, look for table-like field patterns
        if (detectedMap.size === 0) {
            console.log('[TableRegionManager] No positioned fields found, looking for table patterns');

            // Debug: Show all field names
            const allNames = fields.map(f => f.label_en || f.name || 'NO_NAME').slice(0, 30);
            console.log('[TableRegionManager] Field names sample:', allNames);

            // Common table column prefixes (fields that were collapsed from child1_X, child2_X, etc.)
            const tablePatterns = [
                /^child_/i,           // child_name, child_id, child_birthdate
                /^otherIncome_/i,     // otherIncome_type, otherIncome_employer
                /^change_/i,          // change_date, change_details
                /^row\d*_/i,          // row1_col1, row_data
                /^item\d*_/i,         // item_name, item_qty
                /^line\d*_/i,         // line_description
            ];

            // Find fields that match table patterns
            const tableFields = fields.filter(field => {
                const fieldName = field.label_en || field.name || '';
                return tablePatterns.some(pattern => pattern.test(fieldName));
            });

            console.log(`[TableRegionManager] Found ${tableFields.length} fields matching table patterns`);

            // Group by prefix (child_, otherIncome_, etc.)
            const prefixGroups = new Map();
            for (const field of tableFields) {
                const fieldName = field.label_en || field.name || '';
                const prefix = fieldName.split('_')[0] + '_';

                if (!prefixGroups.has(prefix)) {
                    prefixGroups.set(prefix, []);
                }
                prefixGroups.get(prefix).push(field);
            }

            // Use the largest prefix group (most likely the main table)
            let bestPrefix = null;
            let maxCount = 0;
            for (const [prefix, prefixFields] of prefixGroups) {
                console.log(`[TableRegionManager] Prefix "${prefix}": ${prefixFields.length} fields`);
                if (prefixFields.length > maxCount) {
                    maxCount = prefixFields.length;
                    bestPrefix = prefix;
                }
            }

            if (bestPrefix && prefixGroups.has(bestPrefix)) {
                const selectedFields = prefixGroups.get(bestPrefix);
                console.log(`[TableRegionManager] Using prefix "${bestPrefix}" with ${selectedFields.length} columns`);

                for (const field of selectedFields) {
                    const key = field.label_en || field.name || field.id;
                    detectedMap.set(key, {
                        baseName: key,
                        name_he: field.label_he || field.name,
                        name_en: field.label_en || field.name,
                        type: field.type || 'text',
                        count: 10, // Default for collapsed fields
                        fieldIds: [field.id],
                        x: null
                    });
                }
            }
        }

        // Convert to columns array, sorted by x position (or alphabetically if no position)
        const columns = Array.from(detectedMap.values())
            .sort((a, b) => {
                if (a.x !== null && b.x !== null) return a.x - b.x;
                return (a.name_en || '').localeCompare(b.name_en || '');
            })
            .map((c, index) => ({
                id: `col_${index}`,
                name_he: c.name_he,
                name_en: c.name_en,
                type: c.type,
                x: c.x,
                fieldIds: c.fieldIds,
                baseName: c.baseName
            }));

        return columns;
    }

    /**
     * Get the center point of a field (from anchor or bbox)
     * @param {Object} field
     * @returns {Object|null} { x, y } or null
     */
    _getFieldCenter(field) {
        // Anchor format: [xPercent, yPercent]
        if (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
            return { x: field.anchor[0], y: field.anchor[1] };
        }

        // BBox format: [x, y, w, h]
        if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            const [x, y, w, h] = field.bbox;
            return { x: x + w / 2, y: y + h / 2 };
        }

        return null;
    }

    /**
     * Extract base name from repeating field names
     * child1_name → child_name
     * employee_2_salary → employee_salary
     * @param {string} name
     * @returns {string|null}
     */
    _getBaseName(name) {
        if (!name) return null;

        // Pattern: name with number suffix like child1_name, child_1_name, child1name
        const patterns = [
            /^(.+?)_?(\d+)_?(.*)$/,  // child_1_name, child1_name
            /^(.+?)(\d+)$/            // child1
        ];

        for (const pattern of patterns) {
            const match = name.match(pattern);
            if (match) {
                // Reconstruct without the number
                if (match[3]) {
                    return `${match[1]}_${match[3]}`.replace(/__+/g, '_').replace(/_$/, '');
                }
                return match[1].replace(/_$/, '');
            }
        }

        return null;
    }

    /**
     * Set row physics for a region (after first field mapped)
     * @param {string} regionId
     * @param {string} fieldId - First mapped field
     * @param {number} rowCount - User-specified row count
     */
    setRowPhysics(regionId, fieldId, rowCount) {
        const region = this._regions.get(regionId);
        if (!region) return;

        const field = state.getField(fieldId);
        if (!field || !field.bbox) {
            console.warn('[TableRegionManager] Field not found or not mapped:', fieldId);
            return;
        }

        region.firstMappedFieldId = fieldId;
        region.rowCount = rowCount;

        // Calculate rowStep from field position
        // rowStep = height of one row in normalized coordinates
        // For now, estimate from bbox height or use a default
        const fieldHeight = field.bbox[3]; // Height in normalized coords
        region.rowStep = fieldHeight * 1.2; // Add some padding

        region.isStructureLocked = true;

        console.log(`[TableRegionManager] Row physics set: rowStep=${region.rowStep}, rowCount=${rowCount}`);

        eventBus.emit(Events.TABLE_REGION_UPDATED, { region });
    }

    /**
     * Auto-replicate a column to all rows
     * @param {string} regionId
     * @param {string} fieldId - The mapped field (row 0)
     */
    replicateColumn(regionId, fieldId) {
        const region = this._regions.get(regionId);
        if (!region || !region.isStructureLocked) {
            console.warn('[TableRegionManager] Region not found or structure not locked');
            return [];
        }

        const sourceField = state.getField(fieldId);
        if (!sourceField || !sourceField.bbox) {
            console.warn('[TableRegionManager] Source field not found:', fieldId);
            return [];
        }

        const createdFields = [];
        const [sx, sy, sw, sh] = sourceField.bbox;

        console.log('[TableRegionManager] Replication DEBUG:', {
            sourceFieldId: fieldId,
            sourceBbox: sourceField.bbox,
            regionBbox: region.bbox,
            rowStep: region.rowStep,
            rowCount: region.rowCount
        });

        // Create copies for rows 1 to rowCount-1
        // Row 0 = source field (first/top row), rows 1+ go downward
        // Note: bbox uses PDF coords where Y=0 is bottom, Y=1 is top
        // So to go DOWN on screen, we SUBTRACT from Y
        for (let row = 1; row < region.rowCount; row++) {
            const newY = sy - (region.rowStep * row);
            console.log(`[TableRegionManager] Row ${row}: sourceY=${sy}, newY=${newY}, step=${region.rowStep}`);

            const newBbox = [
                sx,
                newY, // PDF Y: subtract to go down on screen
                sw,
                sh
            ];

            const newField = state.addField({
                label_he: `${sourceField.label_he || sourceField.name} ${row + 1}`,
                label_en: sourceField.label_en ? `${sourceField.label_en}_${row + 1}` : null,
                type: sourceField.type,
                bbox: newBbox,
                page: sourceField.page,
                isMapped: true,
                status: 'mapped',
                tableRegionId: regionId,
                tableRow: row,
                overlayWidth: sourceField.overlayWidth,
                overlayHeight: sourceField.overlayHeight,
                placementMode: sourceField.placementMode
            }, true);

            if (newField) {
                createdFields.push(newField);
            }
        }

        // Mark source field as row 0
        state.updateField(fieldId, {
            tableRegionId: regionId,
            tableRow: 0
        });

        console.log(`[TableRegionManager] Replicated column: ${createdFields.length} rows created`);

        eventBus.emit(Events.FIELDS_CHANGED);
        return createdFields;
    }

    /**
     * Get a region by ID
     */
    getRegion(id) {
        return this._regions.get(id);
    }

    /**
     * Get active region
     */
    getActiveRegion() {
        return this._activeRegionId ? this._regions.get(this._activeRegionId) : null;
    }

    /**
     * Set active region
     */
    setActiveRegion(id) {
        this._activeRegionId = id;
    }

    /**
     * Get all regions
     */
    getAllRegions() {
        return Array.from(this._regions.values());
    }

    /**
     * Delete a region
     */
    deleteRegion(id) {
        const region = this._regions.get(id);
        if (!region) return;

        this._regions.delete(id);
        if (this._activeRegionId === id) {
            this._activeRegionId = null;
        }

        eventBus.emit(Events.TABLE_REGION_DELETED, { regionId: id });
    }

    /**
     * Export all regions to JSON
     */
    toJSON() {
        return Array.from(this._regions.values()).map(r => r.toJSON());
    }

    /**
     * Import regions from JSON
     */
    fromJSON(json) {
        if (!Array.isArray(json)) return;
        this._regions.clear();
        for (const data of json) {
            const region = TableRegion.fromJSON(data);
            this._regions.set(region.id, region);
        }
    }
}

// Singleton export
export const tableRegionManager = new TableRegionManager();
