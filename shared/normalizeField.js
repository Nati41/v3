(function() {
    // Default sizes for overlay elements (in percentage of page width/height)
    const CHECKBOX_SIZE = 0.02;  // 2% of page
    const RADIO_SIZE = 0.018;    // 1.8% of page
    const DEFAULT_TEXT_WIDTH = 0.1;  // 10% of page
    const DEFAULT_TEXT_HEIGHT = 0.05; // 5% of page

    /**
     * Normalizes a field object to ensure consistent structure across all tools
     * Auto-fixes old fields, fills defaults, converts legacy formats
     * @param {Object} field - The field object to normalize
     * @returns {Object} - Normalized field object
     */
    function normalizeField(field) {
        if (!field || typeof field !== 'object') {
            console.warn('⚠️ normalizeField: Invalid field object', field);
            return null;
        }

        // Clone to avoid mutations
        const normalized = { ...field };

        // 1. Set defaults
        normalized.type = normalized.type || 'text';
        normalized.page = normalized.page || 1;
        normalized.isMapped = normalized.isMapped !== undefined ? normalized.isMapped : false;

        // 2. Ensure ID exists
        if (!normalized.id || !normalized.id.trim()) {
            normalized.id = normalized.fieldId || `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        // 3. Handle legacy xPct/yPct (convert to bbox if not checkbox/radio)
        if ((normalized.xPct !== undefined || normalized.yPct !== undefined) &&
            normalized.type !== 'checkbox' &&
            normalized.type !== 'radio' &&
            !normalized.bbox) {

            const xPct = normalized.xPct || 0;
            const yPct = normalized.yPct || 0;
            const wPct = normalized.wPct || 0.1;
            const hPct = normalized.hPct || 0.05;

            normalized.bbox = [xPct, yPct, wPct, hPct];

            // Mark as legacy but don't delete (for backwards compatibility)
            normalized._legacyConverted = true;
        }

        // 4. Normalize anchor for checkbox/radio
        if (normalized.type === 'checkbox' || normalized.type === 'radio') {
            if (normalized.anchor && Array.isArray(normalized.anchor) && normalized.anchor.length === 2) {
                // Validate anchor range (0-1)
                let [xPct, yPct] = normalized.anchor;

                if (xPct < 0) xPct = 0;
                if (xPct > 1) xPct = 1;
                if (yPct < 0) yPct = 0;
                if (yPct > 1) yPct = 1;

                normalized.anchor = [xPct, yPct];
            } else if (normalized.xPct !== undefined && normalized.yPct !== undefined) {
                // Convert legacy xPct/yPct to anchor
                let xPct = normalized.xPct;
                let yPct = normalized.yPct;

                if (xPct < 0) xPct = 0;
                if (xPct > 1) xPct = 1;
                if (yPct < 0) yPct = 0;
                if (yPct > 1) yPct = 1;

                normalized.anchor = [xPct, yPct];
                normalized._legacyConverted = true;
            } else if (normalized.bbox && Array.isArray(normalized.bbox) && normalized.bbox.length === 4) {
                // Convert bbox to anchor (center point of bbox)
                const [x, y, w, h] = normalized.bbox;
                normalized.anchor = [x + (w / 2), y + (h / 2)];
                normalized._legacyConverted = true;
            }

            // Set default overlay sizes if missing
            if (!normalized.overlayWidth) {
                normalized.overlayWidth = normalized.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE;
            }
            if (!normalized.overlayHeight) {
                normalized.overlayHeight = normalized.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE;
            }
        }

        // 5. Normalize bbox for text fields
        // FIX PACKAGE 1: Ensure bbox is ALWAYS [x,y,w,h] array format
        if (normalized.type !== 'checkbox' && normalized.type !== 'radio') {
            if (normalized.bbox && Array.isArray(normalized.bbox) && normalized.bbox.length === 4) {
                let [x, y, w, h] = normalized.bbox;

                // Validate range (0-1 for percentages)
                if (x < 0) x = 0;
                if (x > 1) x = 1;
                if (y < 0) y = 0;
                if (y > 1) y = 1;

                // Ensure positive dimensions
                if (w <= 0) w = DEFAULT_TEXT_WIDTH;
                if (h <= 0) h = DEFAULT_TEXT_HEIGHT;

                // Ensure doesn't overflow page
                if (x + w > 1) w = 1 - x;
                if (y + h > 1) h = 1 - y;

                normalized.bbox = [x, y, w, h];
            } else if (normalized.bbox) {
                // FIX PACKAGE 1: Convert object format {x,y,w,h} to array [x,y,w,h]
                console.warn(`⚠️ normalizeField: Converting bbox to array format for field ${normalized.id}`, normalized.bbox);

                // Try to salvage x/y from partial data
                let x = 0, y = 0, w = DEFAULT_TEXT_WIDTH, h = DEFAULT_TEXT_HEIGHT;

                if (Array.isArray(normalized.bbox)) {
                    // Partial array - extract what we can
                    x = typeof normalized.bbox[0] === 'number' ? Math.max(0, Math.min(1, normalized.bbox[0])) : 0;
                    y = typeof normalized.bbox[1] === 'number' ? Math.max(0, Math.min(1, normalized.bbox[1])) : 0;
                    w = typeof normalized.bbox[2] === 'number' && normalized.bbox[2] > 0 ? normalized.bbox[2] : DEFAULT_TEXT_WIDTH;
                    h = typeof normalized.bbox[3] === 'number' && normalized.bbox[3] > 0 ? normalized.bbox[3] : DEFAULT_TEXT_HEIGHT;
                } else if (typeof normalized.bbox === 'object' && normalized.bbox !== null) {
                    // FIX PACKAGE 1: Object format {x, y, w, h} or {x, y, width, height}
                    x = typeof normalized.bbox.x === 'number' ? Math.max(0, Math.min(1, normalized.bbox.x)) : 0;
                    y = typeof normalized.bbox.y === 'number' ? Math.max(0, Math.min(1, normalized.bbox.y)) : 0;
                    w = typeof normalized.bbox.w === 'number' && normalized.bbox.w > 0 ? normalized.bbox.w :
                        typeof normalized.bbox.width === 'number' && normalized.bbox.width > 0 ? normalized.bbox.width : DEFAULT_TEXT_WIDTH;
                    h = typeof normalized.bbox.h === 'number' && normalized.bbox.h > 0 ? normalized.bbox.h :
                        typeof normalized.bbox.height === 'number' && normalized.bbox.height > 0 ? normalized.bbox.height : DEFAULT_TEXT_HEIGHT;

                    console.log(`📦 normalizeField: Converted object bbox to array [${x}, ${y}, ${w}, ${h}]`);
                }

                normalized.bbox = [x, y, w, h];
                normalized._bboxFixed = true;
            }
            // If no bbox at all, don't create one - let the caller handle it
        }

        // 6. Validate page number
        if (normalized.page < 1) {
            normalized.page = 1;
        }

        return normalized;
    }

    window.normalizeField = normalizeField;
})();
