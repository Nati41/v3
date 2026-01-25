(function() {
    /**
     * Migrate V1 fields (bbox percentages) to V2 (PDF points)
     * This runs automatically when loading old mappings
     * @param {Array} fields - Array of field objects to migrate
     * @param {number} pageWidth - PDF page width in points
     * @param {number} pageHeight - PDF page height in points
     * @returns {Object} Migration result with migrated fields and count
     */
    function migrateV1toV2(fields, pageWidth = 595, pageHeight = 842) {
        if (!Array.isArray(fields)) {
            console.warn('⚠️ migrateV1toV2: fields is not an array');
            return { fields, migrationCount: 0 };
        }

        let migrationCount = 0;

        const migratedFields = fields.map(field => {
            // Check if field needs migration (has bbox but no pdfX/pdfY/pdfWidth/pdfHeight)
            const needsMigration = (
                field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4 &&
                typeof field.pdfX !== 'number'
            );

            if (!needsMigration) {
                return field; // Already V2 or invalid
            }

            try {
                const [xPct, yPct, wPct, hPct] = field.bbox;

                // Convert percentages to PDF points
                // bbox format: [x%, y%, width%, height%] where % is 0-1
                const pdfX = xPct * pageWidth;
                const pdfY = yPct * pageHeight;
                const pdfWidth = wPct * pageWidth;
                const pdfHeight = hPct * pageHeight;

                // Create V2 field with PDF points
                const migratedField = {
                    ...field,
                    pdfX,
                    pdfY,
                    pdfWidth,
                    pdfHeight,
                    // Keep bbox for backwards compatibility during transition
                    _v1_bbox: field.bbox
                };

                migrationCount++;
                // Removed verbose per-field logging to improve performance

                return migratedField;
            } catch (error) {
                console.error(`❌ Failed to migrate field ${field.id}:`, error);
                return field; // Return original on error
            }
        });

        if (migrationCount > 0) {
            console.log(`📦 V1→V2 Migration: Converted ${migrationCount} fields to PDF points format`);
            if (typeof debugLog !== 'undefined') {
                debugLog(`📦 Migrated ${migrationCount} fields from V1 to V2 format`, 'success');
            }
        }

        return { fields: migratedFields, migrationCount };
    }

    window.migrateV1toV2 = migrateV1toV2;
})();
