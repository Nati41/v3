# 🔒 LOCKED DISPLAY CODE - DO NOT MODIFY

## Status: WORKING & TESTED
**Last Verified:** 2026-01-08

---

## Overview

The Preview text rendering system has been calibrated to match the Export engine output exactly. Any modifications to the locked components below may break this match.

---

## 🔒 LOCKED FILES

### 1. `js/preview-text-renderer.js`
**Purpose:** Renders text in Preview to match Export output exactly.

**Critical Constants (DO NOT CHANGE):**
```javascript
FONT_SIZE_RATIO = 0.65    // Font size = 65% of field height
MAX_FONT_SIZE = 14        // pt - cap for very tall fields
MIN_FONT_SIZE = 8         // pt - floor for very short fields
BOTTOM_OFFSET_RATIO = 0.08 // Bottom offset = 8% of field height
```

**Critical CSS-in-JS Settings:**
- `line-height: 0.8` - Reduces text box height
- `translateY(15%)` - Pushes text down to anchor at bottom
- `position: absolute; bottom: 0` - Anchors to container bottom

---

### 2. `livefill.html` - CSS Styles

**`.field-editor` (lines ~240-260)**
```css
padding: 0;           /* CRITICAL - Must be 0 for text anchoring */
box-sizing: border-box; /* CRITICAL - Required for proper sizing */
```

**`.table-cell-editor` (lines ~315-330)**
```css
padding: 0;           /* CRITICAL - Must be 0 for text anchoring */
box-sizing: border-box; /* CRITICAL - Required for proper sizing */
```

---

### 3. `js/main-livefill.js` - renderPreviewText function

**Location:** Lines ~1331-1363

This function delegates to `PreviewTextRenderer.render()`. Do not modify.

---

## How It Works

1. **Field dimensions** are calculated in PDF points (pt)
2. **Scale factor** converts pt to screen pixels (px)
3. **Font size** is calculated as 65% of field height (capped at 8-14pt)
4. **Text is anchored** to bottom using:
   - `position: absolute; bottom: 0`
   - `line-height: 0.8` (reduces internal spacing)
   - `translateY(15%)` (compensates for baseline offset)

---

## If Something Breaks

1. **DO NOT modify `export-engine.js`** - It is the source of truth
2. **Check CSS padding** - Must be `0` on `.field-editor` and `.table-cell-editor`
3. **Check PreviewTextRenderer constants** - Must match values above
4. **Test with Export** - Preview must match PDF export exactly

---

## Testing Checklist

Before any changes to display code:

- [ ] Text is anchored to bottom of field
- [ ] Numbers are centered in their cells
- [ ] Hebrew text aligns to the right
- [ ] Font size is proportional to field height
- [ ] Export PDF matches Preview exactly

---

## Contact

If changes are absolutely necessary, document them here:

| Date | Change | Reason | Verified By |
|------|--------|--------|-------------|
| 2026-01-08 | Initial lock | System working | Dev Team |

