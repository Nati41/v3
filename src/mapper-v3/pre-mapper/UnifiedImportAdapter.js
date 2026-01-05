/**
 * UnifiedImportAdapter.js
 *
 * Parses and normalizes Unified Import JSON Schema v1
 * Converts external AI/OCR outputs into internal mapper state format
 *
 * Key responsibilities:
 * - Generate new internal IDs (preserve originals in _source)
 * - Normalize bbox formats to [x, y, w, h] array
 * - Sync group-field relationships with new IDs
 * - Preserve unknown _ prefixed properties
 */

export class UnifiedImportAdapter {

    /**
     * Import Unified JSON directly into normalized state format
     * @param {Object} unifiedJson - Unified Import JSON Schema v1
     * @returns {{ fields: Array, groups: Array, tables: Array, stats: Object }}
     */
    static import(unifiedJson) {
        console.log('[UnifiedImportAdapter] Starting import...');

        // Validate schema version
        const version = unifiedJson.meta?.version || unifiedJson.version;
        if (version && !version.startsWith('1.')) {
            console.warn(`[UnifiedImportAdapter] Unknown schema version: ${version}`);
        }

        // ID mapping: original ID → new internal ID
        const idMap = { fields: {}, groups: {}, tables: {} };

        // 1. Process fields first - generate new IDs
        const fields = (unifiedJson.fields || []).map(f => {
            const newId = this._generateId('fld');
            idMap.fields[f.id] = newId;
            return this._normalizeField(f, newId);
        });

        // 2. Process groups - generate new IDs, update fieldId references
        const groups = (unifiedJson.groups || []).map(g => {
            const newId = this._generateId('rg');
            idMap.groups[g.groupId] = newId;
            return this._normalizeGroup(g, newId, idMap.fields);
        });

        // 3. Update groupId in fields to match new group IDs
        fields.forEach(f => {
            if (f._originalGroupId && idMap.groups[f._originalGroupId]) {
                f.groupId = idMap.groups[f._originalGroupId];
            }
            delete f._originalGroupId; // Clean up temp property
        });

        // 4. Process tables - generate new IDs
        const tables = (unifiedJson.tables || []).map(t => {
            const newId = this._generateId('tbl');
            idMap.tables[t.tableId] = newId;
            return this._normalizeTable(t, newId);
        });

        const stats = {
            fieldsImported: fields.length,
            groupsImported: groups.length,
            tablesImported: tables.length,
            mappedFields: fields.filter(f => f.isMapped).length,
            unmappedFields: fields.filter(f => !f.isMapped).length,
            source: unifiedJson.meta?.source || 'unknown',
            documentName: unifiedJson.meta?.documentName || null
        };

        console.log('[UnifiedImportAdapter] Import complete:', stats);

        return { fields, groups, tables, stats };
    }

    /**
     * Normalize a field from unified schema to internal format
     */
    static _normalizeField(f, newId) {
        // Preserve any _ prefixed properties (future compatibility)
        const preserved = {};
        Object.keys(f).forEach(key => {
            if (key.startsWith('_')) {
                preserved[key] = f[key];
            }
        });

        const hasBbox = f.bbox && (Array.isArray(f.bbox) ? f.bbox.length === 4 : true);
        const hasAnchor = f.anchor && Array.isArray(f.anchor) && f.anchor.length === 2;

        return {
            id: newId,
            type: f.type || 'text',
            page: f.page || 1,
            label_he: f.label_he || '',
            label_en: f.label_en || this._hebrewToEnglishId(f.label_he),
            canonical: f.canonical || null,
            context: f.context || 'employee',
            format: f.format || null,
            category: f.category || null,
            bbox: this._normalizeBboxToArray(f.bbox),
            anchor: hasAnchor ? f.anchor : null,
            isMapped: !!(hasBbox || hasAnchor),
            groupId: null,  // Will be set after groups are processed
            _originalGroupId: f.groupId || null,  // Temp storage for linking
            _source: {
                ...preserved._source,
                originalId: f.id,
                confidence: f.confidence || null,
                value: f.value || null
            }
        };
    }

    /**
     * Normalize a group from unified schema to internal format
     */
    static _normalizeGroup(g, newId, fieldIdMap) {
        // Preserve any _ prefixed properties
        const preserved = {};
        Object.keys(g).forEach(key => {
            if (key.startsWith('_')) {
                preserved[key] = g[key];
            }
        });

        return {
            groupId: newId,
            groupName: g.groupName || '',
            groupNameEn: g.groupNameEn || this._hebrewToEnglishId(g.groupName),
            type: g.type || 'radio',
            page: g.page || 1,
            category: g.category || null,
            context: g.context || 'employee',
            canonical: g.canonical || (g.category ? `${g.context || 'employee'}.${g.category}` : null),
            options: (g.options || []).map(opt => ({
                fieldId: fieldIdMap[opt.fieldId] || opt.fieldId, // Map to new field ID
                label_he: opt.label_he || '',
                label_en: opt.label_en || opt.value || '',
                value: opt.value || '',
                anchor: opt.anchor || null,
                bbox: this._normalizeBboxToArray(opt.bbox)
            })),
            _source: {
                ...preserved._source,
                originalGroupId: g.groupId,
                confidence: g.confidence || null
            }
        };
    }

    /**
     * Normalize a table from unified schema to internal format
     */
    static _normalizeTable(t, newId) {
        // Preserve any _ prefixed properties
        const preserved = {};
        Object.keys(t).forEach(key => {
            if (key.startsWith('_')) {
                preserved[key] = t[key];
            }
        });

        return {
            tableId: newId,
            page: t.page || 1,
            tableTitle: t.tableTitle ? {
                text: t.tableTitle.text || '',
                englishId: t.tableTitle.englishId || this._hebrewToEnglishId(t.tableTitle.text)
            } : null,
            rowCount: Math.min(Math.max(t.rowCount || 1, 1), 100), // Clamp 1-100
            columns: (t.columns || []).map((c, idx) => ({
                columnId: c.columnId || `col_${idx + 1}`,
                hebrewName: c.hebrewName || '',
                englishId: c.englishId || this._hebrewToEnglishId(c.hebrewName),
                type: c.type || 'text',
                bbox: this._normalizeBboxToObject(c.bbox),
                linked: false
            })),
            tableBBox: this._normalizeBboxToObject(t.tableBBox),
            headerRowBBox: this._normalizeBboxToObject(t.headerRowBBox),
            sampleRowBBox: this._normalizeBboxToObject(t.sampleRowBBox),
            rows: [], // Will be generated when user confirms table
            isComplete: false,
            createdAt: new Date().toISOString(),
            _source: {
                ...preserved._source,
                originalTableId: t.tableId,
                confidence: t.confidence || null
            }
        };
    }

    /**
     * Normalize bbox to [x, y, w, h] array format (internal standard for fields)
     */
    static _normalizeBboxToArray(bbox) {
        if (!bbox) return null;

        if (Array.isArray(bbox)) {
            // Already array format: [x, y, w, h]
            if (bbox.length >= 4) {
                return [bbox[0], bbox[1], bbox[2], bbox[3]];
            }
            return null;
        }

        if (typeof bbox === 'object') {
            // Object format: {x, y, width, height}
            if (bbox.x !== undefined && bbox.y !== undefined) {
                return [
                    bbox.x,
                    bbox.y,
                    bbox.width || bbox.w || 0,
                    bbox.height || bbox.h || 0
                ];
            }
        }

        return null;
    }

    /**
     * Normalize bbox to {x, y, width, height} object format (internal standard for tables)
     */
    static _normalizeBboxToObject(bbox) {
        if (!bbox) return null;

        if (Array.isArray(bbox)) {
            // Convert array [x, y, w, h] to object
            if (bbox.length >= 4) {
                return {
                    x: bbox[0],
                    y: bbox[1],
                    width: bbox[2],
                    height: bbox[3]
                };
            }
            return null;
        }

        if (typeof bbox === 'object') {
            // Already object format, ensure correct property names
            return {
                x: bbox.x || 0,
                y: bbox.y || 0,
                width: bbox.width || bbox.w || 0,
                height: bbox.height || bbox.h || 0
            };
        }

        return null;
    }

    /**
     * Generate unique internal ID with prefix
     */
    static _generateId(prefix) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 5);
        return `${prefix}_${timestamp}_${random}`;
    }

    /**
     * Convert Hebrew text to English ID (basic transliteration)
     */
    static _hebrewToEnglishId(hebrew) {
        if (!hebrew) return '';

        // Remove Hebrew characters and special chars, keep alphanumeric
        return hebrew
            .replace(/[\u0590-\u05FF]/g, '') // Remove Hebrew
            .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
            .trim()
            .replace(/\s+/g, '_') // Spaces to underscores
            .toLowerCase() || 'field';
    }

    /**
     * Validate unified JSON structure
     * @returns {{ valid: boolean, errors: string[] }}
     */
    static validate(unifiedJson) {
        const errors = [];

        // Check meta
        if (!unifiedJson.meta) {
            errors.push('Missing meta object');
        } else {
            if (!unifiedJson.meta.version) errors.push('Missing meta.version');
            if (!unifiedJson.meta.source) errors.push('Missing meta.source');
        }

        // Check fields
        if (unifiedJson.fields) {
            unifiedJson.fields.forEach((f, idx) => {
                if (!f.id) errors.push(`Field ${idx}: missing id`);
                if (!f.type) errors.push(`Field ${idx}: missing type`);
                if (!f.page) errors.push(`Field ${idx}: missing page`);
                if (!f.label_he) errors.push(`Field ${idx}: missing label_he`);
            });
        }

        // Check groups
        if (unifiedJson.groups) {
            unifiedJson.groups.forEach((g, idx) => {
                if (!g.groupId) errors.push(`Group ${idx}: missing groupId`);
                if (!g.groupName) errors.push(`Group ${idx}: missing groupName`);
                if (!g.type) errors.push(`Group ${idx}: missing type`);
                if (!g.category) errors.push(`Group ${idx}: missing category`);
                if (!g.options || g.options.length < 2) {
                    errors.push(`Group ${idx}: must have at least 2 options`);
                }
            });
        }

        // Check tables
        if (unifiedJson.tables) {
            unifiedJson.tables.forEach((t, idx) => {
                if (!t.tableId) errors.push(`Table ${idx}: missing tableId`);
                if (!t.page) errors.push(`Table ${idx}: missing page`);
                if (!t.rowCount) errors.push(`Table ${idx}: missing rowCount`);
                if (!t.columns || t.columns.length < 1) {
                    errors.push(`Table ${idx}: must have at least 1 column`);
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export default UnifiedImportAdapter;
