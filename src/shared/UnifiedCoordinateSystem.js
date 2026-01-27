/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - UnifiedCoordinateSystem
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   מערכת קואורדינטות אחידה - המרה בין PDF לקנבס.
 *   מטפל ב-DPI ו-device pixel ratio.
 *
 * איך זה עובד:
 *   - מקבל pageViewport מ-pdf.js ו-renderScale
 *   - ממיר: PDF points ↔ Canvas pixels ↔ CSS pixels
 *   - מתחשב בהיפוך ציר Y (PDF מלמטה, מסך מלמעלה)
 *
 * מי משתמש בקובץ:
 *   - כל מודול שמציב אלמנטים על PDF
 *   - CoordinateService.js - עוטף את המחלקה הזו
 *
 * באיזה מצבים:
 *   תמיד - בכל חישוב מיקום
 *
 * למה הוא קיים:
 *   "ONE SOURCE OF TRUTH" - מקום אחד לכל המרות קואורדינטות.
 * ═══════════════════════════════════════════════════════════════
 */

// ONE SOURCE OF TRUTH – all tools must use this only
class UnifiedCoordinateSystem {
    constructor(pageViewport, renderScale = 2.0) {
        this.viewport = pageViewport;  // Store viewport for transform matrix access
        this.pdfWidth  = pageViewport.width / renderScale;
        this.pdfHeight = pageViewport.height / renderScale;

        this.canvasWidth  = pageViewport.width;
        this.canvasHeight = pageViewport.height;
        this.scale = renderScale;
    }

    pdfToCanvas(xPdf, yPdf) {
        const vp = this.viewport;
        if (!vp) return { x: xPdf, y: yPdf };

        // PDF.js gives a full CTM (Current Transformation Matrix)
        const t = vp.transform;
        // t = [scaleX, skewX, skewY, scaleY, offsetX, offsetY]

        const xCanvas = xPdf * t[0] + t[4];
        const yCanvas = yPdf * t[3] + t[5];

        return { x: xCanvas, y: yCanvas };
    }

    canvasToPdf(xCanvas, yCanvas) {
        return {
            x: xCanvas / this.scale,
            y: (this.canvasHeight - yCanvas) / this.scale
        };
    }

    bboxToOverlay(bbox) {
        const normalized = this._normalizeBbox(bbox);
        const tl = this.pdfToCanvas(normalized.x, normalized.y + normalized.h);
        const br = this.pdfToCanvas(normalized.x + normalized.w, normalized.y);

        // CRITICAL: Convert from device pixels to CSS pixels
        // viewport.transform outputs device pixels, but CSS positioning uses CSS pixels
        // On Retina displays: CSS pixels = device pixels / devicePixelRatio
        const dpr = window.devicePixelRatio || 1;

        return {
            position: 'absolute',
            left:   (tl.x / dpr) + 'px',
            top:    (tl.y / dpr) + 'px',
            width:  ((br.x - tl.x) / dpr) + 'px',
            height: ((br.y - tl.y) / dpr) + 'px'
        };
    }

    anchorToCenter(anchor) {
        const xPdf = anchor[0] * this.pdfWidth;
        const yPdf = anchor[1] * this.pdfHeight;
        return this.pdfToCanvas(xPdf, yPdf);
    }

    sizeToCanvas(pdfSize) {
        return pdfSize * this.scale;
    }

    _normalizeBbox(bbox) {
        if (!Array.isArray(bbox) || bbox.length !== 4) return { x:0, y:0, w:0, h:0 };

        let [x, y, w, h] = bbox;

        if (x <= 1 && y <= 1 && w <= 1 && h <= 1) {
            x *= this.pdfWidth;
            y *= this.pdfHeight;
            w *= this.pdfWidth;
            h *= this.pdfHeight;
        }

        return { x, y, w, h };
    }
}

const instances = new WeakMap();

function getCoordSystem(pageViewport, scale = 2.0) {
    if (!instances.has(pageViewport)) {
        instances.set(pageViewport, new UnifiedCoordinateSystem(pageViewport, scale));
    }
    return instances.get(pageViewport);
}

// UMD-style global export for non-module environments
if (typeof window !== 'undefined') {
    window.UnifiedCoordinateSystem = { getCoordSystem };
}
