// ===============================
//   Tofesly Export Engine – Clean Stable Build
//   Hebrew, Checkboxes, Digits-in-Boxes
// ===============================

// Note: CHECKBOX_SIZE, RADIO_SIZE are defined in the main HTML file
// Export-specific constants:
const CHECKMARK_OFFSET_X = 2.5;
const CHECKMARK_OFFSET_Y = 3;

// normalizeField is available from window.normalizeField (loaded from shared/normalizeField.js)
// Note: Do not redeclare - it's already declared in the main HTML inline script

// ===============================
//   Validation Functions
// ===============================

/**
 * Validates export data before PDF generation
 * @param {Object} fieldsMapping - Fields mapping with .fields and .tables arrays
 * @param {Object} liveFillData - Live fill data object
 * @returns {Array<string>} - Array of error messages (empty if valid)
 */
function validateExportData(fieldsMapping, liveFillData) {
    const errors = [];

    // Check fields OR tables exist
    const hasFields = fieldsMapping && fieldsMapping.fields && fieldsMapping.fields.length > 0;
    const hasTables = fieldsMapping && fieldsMapping.tables && fieldsMapping.tables.length > 0;

    if (!hasFields && !hasTables) {
        errors.push("לא נמצאו שדות או טבלאות למילוי");
    }

    // Check each field has valid coordinates
    fieldsMapping?.fields?.forEach((field, index) => {
        const fid = field.id || field.fieldId;
        if (!fid) {
            errors.push(`שדה ${index + 1}: חסר ID`);
            return;
        }

        // Checkbox/Radio/Cell - check anchor (cell is like checkbox but full size)
        if (field.type === 'checkbox' || field.type === 'radio' || field.type === 'cell') {
            if (!field.anchor || field.anchor.length !== 2) {
                errors.push(`${fid}: חסר anchor לסוג ${field.type}`);
            } else {
                const [xPct, yPct] = field.anchor;
                if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) {
                    errors.push(`${fid}: anchor מחוץ לטווח (0-1): [${xPct}, ${yPct}]`);
                }
            }
        }
        // Text fields - check bbox
        else if (field.type !== 'checkbox' && field.type !== 'radio' && field.type !== 'cell') {
            if (!field.bbox || field.bbox.length !== 4) {
                errors.push(`${fid}: חסר bbox או bbox לא תקין`);
            } else {
                const [x, y, w, h] = field.bbox;
                if (w <= 0 || h <= 0) {
                    errors.push(`${fid}: גודל שדה לא תקין [w=${w}, h=${h}]`);
                }
            }
        }
    });

    return errors;
}

/**
 * Main PDF export engine - fills PDF form fields and generates downloadable file
 * @param {Object} params - Export parameters
 * @param {Uint8Array} params.pdfBytesSafe - Original PDF bytes
 * @param {Object} params.fieldsMapping - Fields mapping with positions
 * @param {Object} params.liveFillData - User-entered field values
 * @param {ArrayBuffer} [params.customFontBytes] - Optional custom font bytes
 * @param {string} [params.customFontName] - Optional custom font name
 */
window.ExportEngine = {
    async export({ pdfBytesSafe, fieldsMapping, liveFillData, customFontBytes, customFontName }) {
        try {
            // Show progress modal
            if (typeof showProgressModal !== 'undefined') {
                showProgressModal();
            }

            if (!pdfBytesSafe || !fieldsMapping?.fields || !liveFillData) {
                if (typeof showToast !== 'undefined') showToast("חסרים נתונים לייצוא", "error");
                if (typeof hideProgressModal !== 'undefined') hideProgressModal();
                return;
            }

            if (typeof updateProgress !== 'undefined') {
                updateProgress(5, 'מתחיל ייצוא...');
            }

            // ✅ DEBUG: Log liveFillData state at export start
            console.log('📦 Export started with liveFillData:', JSON.stringify(liveFillData, null, 2));
            const checkedFields = Object.entries(liveFillData).filter(([_, data]) => data.checked === true);
            console.log(`📊 Found ${checkedFields.length} checked fields:`, checkedFields.map(([id]) => id));

            // Validate data
            const validationErrors = validateExportData(fieldsMapping, liveFillData);
            if (validationErrors.length > 0) {
                const errorMsg = "שגיאות בנתונים:\n" + validationErrors.join("\n");
                console.error("Validation errors:", validationErrors);
                if (typeof showToast !== 'undefined') showToast("שגיאות בנתוני הייצוא", "error");
                if (typeof hideProgressModal !== 'undefined') hideProgressModal();
                return;
            }

            if (typeof updateProgress !== 'undefined') {
                updateProgress(10, 'טוען PDF...');
            }

            // ✅ Task B: Protected PDF loading with clear error messages
            let pdfDoc;
            try {
                pdfDoc = await PDFLib.PDFDocument.load(pdfBytesSafe);
            } catch (pdfError) {
                console.error("❌ Failed to load PDF for export:", pdfError);
                if (typeof showToast !== 'undefined') showToast("שגיאה בטעינת PDF לייצוא", "error");
                if (typeof hideProgressModal !== 'undefined') hideProgressModal();
                return;
            }

            if (typeof updateProgress !== 'undefined') {
                updateProgress(15, 'PDF נטען בהצלחה');
            }

            // תמיכה בפונטים עבריים
            if (pdfDoc.registerFontkit && window.fontkit) {
                pdfDoc.registerFontkit(window.fontkit);
            }

            // הטמעת פונט - Hebrew support with DavidLibre
            let hebrewFont;
            try {
                if (customFontBytes) {
                    hebrewFont = await pdfDoc.embedFont(customFontBytes, { subset: true });
                } else {
                    // Load Hebrew font (DavidLibre-Regular.ttf)
                    try {
                        const hebrewFontBytes = await fetch("./fonts/DavidLibre-Regular.ttf").then(r => r.arrayBuffer());
                        hebrewFont = await pdfDoc.embedFont(hebrewFontBytes);
                    } catch (fontError) {
                        console.error("❌ Failed to load Hebrew font:", fontError);
                        if (typeof showToast !== 'undefined') showToast("שגיאה בטעינת פונט עברי", "error");
                        throw new Error("Hebrew font loading failed - cannot continue export");
                    }
                }
            } catch (e) {
                console.error("❌ Font embedding error:", e);
                if (typeof showToast !== 'undefined') showToast("שגיאה קריטית בטעינת פונט", "error");
                if (typeof hideProgressModal !== 'undefined') hideProgressModal();
                throw e;
            }

            if (typeof updateProgress !== 'undefined') {
                updateProgress(25, 'פונט עברי נטען בהצלחה');
            }

            const pages = pdfDoc.getPages();

            // ✅ Embed ZapfDingbats font for universal checkbox/radio rendering
            const zapfFont = await pdfDoc.embedFont(PDFLib.StandardFonts.ZapfDingbats);

            if (typeof updateProgress !== 'undefined') {
                updateProgress(30, 'מעבד שדות...');
            }

            /**
             * NEW UNIVERSAL CHECKMARK ENGINE
             * Draws checkmarks and radio buttons using ZapfDingbats font
             * Perfect centering and consistent sizing across all forms
             */
            async function drawCheckmark(page, box, type = "checkbox", zapfFont) {
                const centerX = box.x + box.width / 2;
                const centerY = box.y + box.height / 2;

                // Universal formula: works for all PDF files and all box sizes
                const size = Math.min(box.width, box.height) * 0.70;  // 70% of box

                if (type === "checkbox" || type === "V") {
                    // ✔ ZapfDingbats checkmark - optimized centering
                    const glyph = "✔";
                    const checkX = centerX - size / 2.0;
                    const checkY = centerY - size / 2.25;

                    // Draw twice for darker, stronger appearance
                    page.drawText(glyph, {
                        x: checkX,
                        y: checkY,
                        size: size,
                        font: zapfFont,
                        color: PDFLib.rgb(0, 0, 0)
                    });
                    page.drawText(glyph, {
                        x: checkX + 0.1,  // Slight offset for boldness
                        y: checkY,
                        size: size,
                        font: zapfFont,
                        color: PDFLib.rgb(0, 0, 0)
                    });
                }

                if (type === "radio") {
                    // Radio circle - smaller, shifted right for better centering
                    const radioSize = Math.min(box.width, box.height) * 0.18;
                    page.drawCircle({
                        x: centerX + radioSize * 0.15,  // Shift right slightly
                        y: centerY,
                        size: radioSize,
                        color: PDFLib.rgb(0, 0, 0)
                    });
                }
            }

            /**
             * NEW UNIVERSAL DIGIT-BOXES ENGINE
             * Renders text split into individual boxes (bottom anchored)
             */
            async function drawDigitBoxes(page, pdfFont, text, boxes) {
                if (!text) return;
                const digits = text.toString().split("");
                const count = Math.min(digits.length, boxes.length);

                for (let i = 0; i < count; i++) {
                    const d = digits[i];
                    const box = boxes[i];

                    const boxX = box.x;
                    const boxY = box.y;
                    const boxW = box.width;
                    const boxH = box.height;

                    const fontSize = Math.min(boxH * 0.75, boxW * 0.75);
                    const textWidth = pdfFont.widthOfTextAtSize(d, fontSize);

                    const xCentered = boxX + (boxW - textWidth) / 2;
                    // Bottom anchor: 15% padding from bottom or at least 2pt
                    const bottomPadding = Math.max(2, boxH * 0.15);
                    const yBottom = boxY + bottomPadding;

                    page.drawText(d, {
                        x: xCentered,
                        y: yBottom,
                        size: fontSize,
                        font: pdfFont,
                        color: PDFLib.rgb(0, 0, 0)
                    });
                }
            }

            /**
             * TABLE ROW MAPPING HELPER
             * Generates field mappings for table rows with offset positioning
             */
            function getTableRowMapping(tableDef, rowIndex) {
                const row = {};
                const offset = rowIndex * tableDef.rowHeight;

                for (const key in tableDef.template) {
                    const f = tableDef.template[key];

                    if (f.type === "digitBoxes") {
                        row[key] = {
                            type: "digitBoxes",
                            boxes: f.boxes.map(b => ({
                                x: b.x,
                                y: b.y - offset,
                                width: b.width,
                                height: b.height
                            }))
                        };
                    } else {
                        row[key] = {
                            ...f,
                            y: f.y - offset
                        };
                    }
                }

                return row;
            }

            const totalFields = fieldsMapping.fields.length;
            let processedFields = 0;

            for (let field of fieldsMapping.fields) {
                // ✅ Normalize field structure
                field = window.normalizeField(field);
                if (!field) continue;

                // Update progress (30% to 80% range for field processing)
                processedFields++;
                const fieldProgress = 30 + (processedFields / totalFields) * 50;
                if (typeof updateProgress !== 'undefined' && processedFields % 5 === 0) {
                    updateProgress(fieldProgress, `מעבד שדה ${processedFields}/${totalFields}...`);
                }

                const fid = field.id || field.fieldId;
                if (!fid) {
                    console.warn(`⚠️ Export: Field at index ${fieldsMapping.fields.indexOf(field)} has no ID, skipping`);
                    continue;
                }

                const type = field.type || "text";

                // Get field data with validation
                let data = liveFillData[fid];

                // ✅ DEBUG: Log data for checkbox/radio/cell fields
                if (type === 'checkbox' || type === 'radio' || type === 'cell') {
                    console.log(`🔍 Export ${type} ${fid}: data =`, JSON.stringify(data), `checked =`, data?.checked);
                }

                if (!data) {
                    // Initialize missing data for checkboxes/radios/cells
                    if (type === 'checkbox' || type === 'radio' || type === 'cell') {
                        console.warn(`⚠️ Export: No data for ${type} ${fid}, initializing as unchecked`);
                        liveFillData[fid] = { checked: false };
                        data = liveFillData[fid];
                        // Skip drawing (don't draw anything for missing data)
                        continue;
                    } else {
                        console.warn(`⚠️ Export: No data for text field ${fid}, skipping`);
                        continue;
                    }
                }

                const pageIndex = (field.page || 1) - 1;
                const page = pages[pageIndex];
                if (!page) continue;

                const { width: pw, height: ph } = page.getSize();

                // ============================
                // CHECKBOX & RADIO & CELL – DIRECT PDF POINTS (NO COORDINATE CONVERSION)
                // V3.10: Cell type uses full drawn rectangle size (no constraints)
                // ============================
                if (field.type === 'checkbox' || field.type === 'radio' || field.type === 'cell') {
                    if (data.checked === true) {
                        let boxX, boxY, boxW, boxH;

                        // V2 coordinates (already in PDF points)
                        if (field.pdfX !== undefined && field.pdfY !== undefined &&
                            field.pdfWidth !== undefined && field.pdfHeight !== undefined) {
                            boxX = field.pdfX;
                            boxY = field.pdfY;
                            boxW = field.pdfWidth;
                            boxH = field.pdfHeight;
                        }
                        // V1 anchor (center point in percentages)
                        else if (field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
                            const centerXPdf = field.anchor[0] * pw;
                            const centerYPdf = field.anchor[1] * ph;

                            // Get size from bbox if available, otherwise use small default for PDF points
                            if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
                                // Normalize bbox: convert percentages to PDF points
                                let [x, y, w, h] = field.bbox;
                                if (x <= 1 && y <= 1 && w <= 1 && h <= 1) {
                                    w *= pw;
                                    h *= ph;
                                }
                                boxW = w;
                                boxH = h;
                            } else {
                                // Default size in PDF points (NOT pixels!)
                                boxW = 10;
                                boxH = 10;
                            }

                            // Anchor is center, so offset by half the size
                            boxX = centerXPdf - boxW / 2;
                            boxY = centerYPdf - boxH / 2;
                        }
                        else {
                            console.warn(`⚠️ Export: Checkbox/Radio/Cell ${fid} missing coordinates, skipping`);
                            continue;
                        }

                        console.log(`✅ Export ${field.type} ${fid}: PDF box=(${boxX.toFixed(1)}, ${boxY.toFixed(1)}, ${boxW.toFixed(1)}, ${boxH.toFixed(1)})`);

                        // Cell type uses 'checkbox' style (checkmark V)
                        const drawType = field.type === 'cell' ? 'checkbox' : field.type;
                        await drawCheckmark(page, {
                            x: boxX,
                            y: boxY,
                            width: boxW,
                            height: boxH
                        }, drawType, zapfFont);
                    }
                    continue;
                }

                // ============================
                // SIGNATURE – DRAW IMAGE OR STYLED TEXT
                // ============================
                console.log(`🔍 Export check field ${fid}: type="${field.type}"`);
                if (field.type === 'signature') {
                    console.log(`✅ Signature field detected: ${fid}`);
                    if (!data.value) continue;

                    let boxX, boxY, boxW, boxH;

                    // V2 coordinates (already in PDF points)
                    if (field.pdfX !== undefined && field.pdfY !== undefined &&
                        field.pdfWidth !== undefined && field.pdfHeight !== undefined) {
                        boxX = field.pdfX;
                        boxY = field.pdfY;
                        boxW = field.pdfWidth;
                        boxH = field.pdfHeight;
                    }
                    // V1 bbox (percentages)
                    else if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
                        const normalized = coord._normalizeBbox(field.bbox);
                        boxX = normalized.x;
                        boxY = normalized.y;
                        boxW = normalized.w;
                        boxH = normalized.h;
                    } else {
                        console.warn(`⚠️ Export: Signature ${fid} missing coordinates, skipping`);
                        continue;
                    }

                    if (data.mode === 'draw') {
                        // Drawn signature - embed as image
                        try {
                            // data.value is a base64 data URL
                            const base64Data = data.value.split(',')[1];
                            const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                            const pngImage = await pdfDoc.embedPng(imageBytes);

                            page.drawImage(pngImage, {
                                x: boxX,
                                y: boxY,
                                width: boxW,
                                height: boxH
                            });

                            console.log(`✅ Export signature (draw) ${fid}: embedded image at (${boxX.toFixed(1)}, ${boxY.toFixed(1)}, ${boxW.toFixed(1)}, ${boxH.toFixed(1)})`);
                        } catch (imgErr) {
                            console.error(`❌ Failed to embed signature image ${fid}:`, imgErr);
                        }
                    } else {
                        // Typed signature - draw as text
                        const signatureText = data.value;
                        if (!signatureText.trim()) continue;

                        // Use larger font for signature, fitting the box
                        const sigFontSize = Math.min(boxH * 0.7, 24);
                        const textWidth = hebrewFont.widthOfTextAtSize(signatureText, sigFontSize);

                        // Center text in box
                        const tx = boxX + (boxW - textWidth) / 2;
                        const ty = boxY + (boxH - sigFontSize) / 2;

                        page.drawText(signatureText, {
                            x: tx,
                            y: ty,
                            size: sigFontSize,
                            font: hebrewFont,
                            color: PDFLib.rgb(0, 0, 0)
                        });

                        console.log(`✅ Export signature (type) ${fid}: "${signatureText}" at (${tx.toFixed(1)}, ${ty.toFixed(1)})`);
                    }
                    continue;
                }

                // ============================
                // DIGIT BOXES – NEW FIELD TYPE
                // ============================
                if (field.type === 'digitBoxes') {
                    if (field.boxes && Array.isArray(field.boxes) && data.value) {
                        await drawDigitBoxes(page, hebrewFont, data.value, field.boxes);
                    }
                    continue;
                }

                // ============================
                // TABLE FIELDS – REPEATING ROWS
                // ============================
                if (field.type === 'table') {
                    if (field.template && data.rows && Array.isArray(data.rows)) {
                        const maxRows = field.maxRows || 10;
                        const rowCount = Math.min(data.rows.length, maxRows);

                        for (let i = 0; i < rowCount; i++) {
                            const rowData = data.rows[i];
                            const rowMapping = getTableRowMapping(field, i);

                            for (const colKey in rowMapping) {
                                const colField = rowMapping[colKey];
                                const colValue = rowData[colKey];

                                if (!colValue) continue;

                                if (colField.type === 'digitBoxes' && colField.boxes) {
                                    await drawDigitBoxes(page, hebrewFont, colValue, colField.boxes);
                                } else if (colField.type === 'checkbox' && colValue === true) {
                                    await drawCheckmark(page, {
                                        x: colField.x,
                                        y: colField.y,
                                        width: colField.width || 20,
                                        height: colField.height || 20
                                    }, 'checkbox', zapfFont);
                                } else if (colField.type === 'text') {
                                    let colFontSize = colField.fontSize || 12;
                                    const colPadding = 4;
                                    const colAvailableWidth = (colField.width || 20) - colPadding;
                                    const colText = colValue.toString();

                                    // Keep shrinking font until text fits
                                    let textWidth = hebrewFont.widthOfTextAtSize(colText, colFontSize);
                                    while (textWidth > colAvailableWidth && colFontSize > 1) {
                                        colFontSize -= 0.5;
                                        textWidth = hebrewFont.widthOfTextAtSize(colText, colFontSize);
                                    }

                                    // Right-align for RTL
                                    const tx = colField.x + ((colField.width || 20) - textWidth);
                                    // Bottom anchor: 15% padding from bottom or at least 2pt
                                    const bottomPad = Math.max(2, (colField.height || 20) * 0.15);
                                    const ty = colField.y + bottomPad;

                                    page.drawText(colText, {
                                        x: tx,
                                        y: ty,
                                        size: colFontSize,
                                        font: hebrewFont,
                                        color: PDFLib.rgb(0, 0, 0)
                                    });
                                }
                            }
                        }
                    }
                    continue;
                }

                // ============================
                // TEXT FIELD EXPORT (V2 + V1 BACKWARDS COMPATIBILITY)
                // ============================
                let xPDF, yBottomPDF, wPDF, hPDF;

                // ============ V2 COORDINATE SYSTEM: PDF POINTS ============
                if (typeof field.pdfX === 'number' && typeof field.pdfY === 'number' &&
                    typeof field.pdfWidth === 'number' && typeof field.pdfHeight === 'number') {

                    // Use V2 coordinates directly (already in PDF points)
                    xPDF = field.pdfX;
                    yBottomPDF = field.pdfY;
                    wPDF = field.pdfWidth;
                    hPDF = field.pdfHeight;

                    console.log(`✅ V2 text export: ${fid}, pdfBox=(${xPDF.toFixed(1)}, ${yBottomPDF.toFixed(1)}, ${wPDF.toFixed(1)}, ${hPDF.toFixed(1)})`);
                }
                // ============ V1 COORDINATE SYSTEM: PERCENTAGES (BACKWARDS COMPATIBILITY) ============
                else if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
                    const normalized = coord._normalizeBbox(field.bbox);
                    xPDF = normalized.x;
                    yBottomPDF = normalized.y;
                    wPDF = normalized.w;
                    hPDF = normalized.h;

                    console.log(`📍 V1 text export: ${fid}, bbox%=(${field.bbox[0]}, ${field.bbox[1]}, ${field.bbox[2]}, ${field.bbox[3]}), pdfBox=(${xPDF.toFixed(1)}, ${yBottomPDF.toFixed(1)}, ${wPDF.toFixed(1)}, ${hPDF.toFixed(1)})`);
                } else {
                    console.warn(`⚠️ Export: Text field ${fid} missing coordinates (no V2 pdfX/pdfY/pdfWidth/pdfHeight and no V1 bbox), skipping`);
                    continue;
                }

                // -------------------------------------
                // ✔ TEXT + NUMBERS
                // -------------------------------------
                const rawValue = (data.value ?? "").toString();
                if (!rawValue.trim()) continue;

                const style = data.style || {};
                let fontSize = style.fontSize || 14;
                const colorHex = style.color || "#000000";
                const align = style.alignment || "right";
                const baseline = 1.2;

                const color = hexToRgb(colorHex);

                const isNumeric = /^[0-9]+$/.test(rawValue);

                // -----------------------------
                // ✔ DIGITS — כל ספרה בתיבה
                // V3.10: Smart spacing - only for long numbers or narrow cells
                // -----------------------------
                // V3.10: Short numbers (1-3 digits) render as regular text, centered
                // Long numbers (4+) get spaced digits for ID/phone fields
                if (isNumeric && rawValue.length >= 4) {
                    drawNumericInBoxes(
                        page,
                        rawValue,
                        xPDF,
                        yBottomPDF,
                        wPDF,
                        hPDF,
                        hebrewFont,
                        fontSize,
                        PDFLib.rgb(color.r, color.g, color.b)
                    );
                    continue;
                }

                // V3.10: Short numbers (1-3 digits) should be centered
                const effectiveAlign = (isNumeric && rawValue.length < 4) ? "center" : align;

                // -----------------------------
                // ✔ TEXT רגיל (flow text - bottom anchored)
                // -----------------------------
                const padding = 4; // 2pt padding on each side
                const availableWidth = wPDF - padding;

                // Keep shrinking font until text fits
                let textWidth = hebrewFont.widthOfTextAtSize(rawValue, fontSize);
                while (textWidth > availableWidth && fontSize > 1) {
                    fontSize -= 0.5;
                    textWidth = hebrewFont.widthOfTextAtSize(rawValue, fontSize);
                }

                let tx = xPDF;
                if (effectiveAlign === "center") {
                    tx = xPDF + (wPDF - textWidth) / 2;
                } else if (effectiveAlign === "right") {
                    tx = xPDF + (wPDF - textWidth);
                }

                // Bottom anchor: 15% padding from bottom or at least 2pt
                const bottomPadding = Math.max(2, hPDF * 0.15);
                const ty = yBottomPDF + bottomPadding;

                page.drawText(rawValue, {
                    x: tx,
                    y: ty,
                    size: fontSize,
                    font: hebrewFont,
                    color: PDFLib.rgb(color.r, color.g, color.b),
                });
            }

            // ============================
            // TABLE EXPORT
            // Formula: cellTop = colBBox.y + (rowIndex * rowHeight)
            //          pdfCellY = pageHeight - ((cellTop + rowHeight) * pageHeight)
            // ============================
            if (fieldsMapping.tables && fieldsMapping.tables.length > 0 && liveFillData.tables) {
                console.log(`📊 Exporting ${fieldsMapping.tables.length} tables`);

                for (const table of fieldsMapping.tables) {
                    const tableId = table.tableId || table.id;
                    const tableData = liveFillData.tables[tableId];
                    if (!tableId || !tableData || tableData.length === 0) continue;

                    const pageIndex = (table.page || 1) - 1;
                    const page = pages[pageIndex];
                    if (!page) continue;

                    const { width: pw, height: ph } = page.getSize();
                    const rowHeightNorm = table.rowHeight;
                    const rowCount = table.rowCount || tableData.length;
                    const columns = table.columns || [];
                    const rowsData = table.rows || [];

                    if (!rowHeightNorm) continue;

                    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
                        const rowData = tableData[rowIndex];
                        if (!rowData) continue;

                        for (const col of columns) {
                            const colId = col.englishId || col.columnId;
                            const colKey = col.columnId;
                            const cellValue = rowData[colId];
                            if (cellValue === undefined || cellValue === null || cellValue === '') continue;

                            const colBBox = col.bbox;
                            if (!colBBox) continue;

                            // Y from rows array, height ONLY from rowHeightNorm
                            const rowCellData = rowsData[rowIndex] && rowsData[rowIndex][colKey];
                            const cellYNorm = rowCellData ? rowCellData.y : (colBBox.y + (rowIndex * rowHeightNorm));

                            // Convert to PDF points (Y flip)
                            const pdfCellY = ph - ((cellYNorm + rowHeightNorm) * ph);
                            const pdfCellH = rowHeightNorm * ph;

                            const cellX = colBBox.x * pw;
                            const cellW = colBBox.width * pw;

                            if (col.type === 'checkbox') {
                                if (cellValue === true) {
                                    await drawCheckmark(page, {
                                        x: cellX,
                                        y: pdfCellY,
                                        width: cellW,
                                        height: pdfCellH
                                    }, 'checkbox', zapfFont);
                                }
                            } else {
                                const textValue = cellValue.toString();
                                if (!textValue.trim()) continue;

                                const isNumeric = /^[0-9]+$/.test(textValue);
                                let fontSize = 14;

                                // V3.10: Short numbers (1-3 digits) render as regular text
                                // Long numbers (4+) get spaced digits
                                if (isNumeric && textValue.length >= 4) {
                                    // Numbers: use drawNumericInBoxes (same as regular fields)
                                    drawNumericInBoxes(
                                        page,
                                        textValue,
                                        cellX,
                                        pdfCellY,
                                        cellW,
                                        pdfCellH,
                                        hebrewFont,
                                        fontSize,
                                        PDFLib.rgb(0, 0, 0)
                                    );
                                } else {
                                    // Text: same logic as regular fields (bottom-anchored)
                                    const cellPadding = 4;
                                    const cellAvailableWidth = cellW - cellPadding;

                                    // Keep shrinking font until text fits
                                    let textWidth = hebrewFont.widthOfTextAtSize(textValue, fontSize);
                                    while (textWidth > cellAvailableWidth && fontSize > 1) {
                                        fontSize -= 0.5;
                                        textWidth = hebrewFont.widthOfTextAtSize(textValue, fontSize);
                                    }

                                    // V3.10: Short numbers (1-3 digits) centered, others right-aligned
                                    let tx;
                                    if (isNumeric && textValue.length < 4) {
                                        tx = cellX + (cellW - textWidth) / 2; // Center
                                    } else {
                                        tx = cellX + (cellW - textWidth); // Right-align
                                    }

                                    // Bottom anchor: 15% padding from bottom or at least 2pt
                                    const cellBottomPadding = Math.max(2, pdfCellH * 0.15);
                                    const ty = pdfCellY + cellBottomPadding;

                                    page.drawText(textValue, {
                                        x: tx,
                                        y: ty,
                                        size: fontSize,
                                        font: hebrewFont,
                                        color: PDFLib.rgb(0, 0, 0)
                                    });
                                }
                            }
                        }
                    }
                    console.log(`✅ Table ${tableId} exported`);
                }
            }

            // שמירה
            if (typeof updateProgress !== 'undefined') {
                updateProgress(85, 'שומר PDF...');
            }

            const pdfBytes = await pdfDoc.save();

            if (typeof updateProgress !== 'undefined') {
                updateProgress(95, 'מכין להורדה...');
            }

            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = `filled_form_${Date.now()}.pdf`;
            a.click();

            URL.revokeObjectURL(url);

            if (typeof updateProgress !== 'undefined') {
                updateProgress(100, 'הושלם!');
            }

            // Success toast
            if (typeof ToastManager !== 'undefined') {
                ToastManager.success('PDF יוצא בהצלחה!');
            }

            // Hide progress modal after short delay
            if (typeof hideProgressModal !== 'undefined') {
                hideProgressModal();
            }

        } catch (err) {
            console.error("❌ ExportEngine error", err);
            if (typeof showToast !== 'undefined') {
                showToast("תקלה ביצוא PDF — בדוק קונסול", "error");
            }
            if (typeof hideProgressModal !== 'undefined') {
                hideProgressModal();
            }
        }
    }
};

// -------------------------------------
// פונקציה: מספרים — כל ספרה בתיבה
// -------------------------------------
/**
 * Draws numeric text with each digit in a separate box (bottom-anchored)
 * @param {PDFPage} page - pdf-lib page object
 * @param {string} text - The numeric text to draw
 * @param {number} xField - X position in PDF points
 * @param {number} yBottom - Y position in PDF points (bottom-left)
 * @param {number} fieldWidth - Field width in PDF points
 * @param {number} fieldHeight - Field height in PDF points
 * @param {PDFFont} font - pdf-lib font object
 * @param {number} fontSize - Font size
 * @param {RGB} color - pdf-lib RGB color object
 */
function drawNumericInBoxes(page, text, xField, yBottom, fieldWidth, fieldHeight, font, fontSize, color) {
    const digits = text.length;
    if (digits <= 0) return;

    const cellWidth = fieldWidth / digits;

    // Bottom anchor: 15% padding from bottom or at least 2pt
    const bottomPadding = Math.max(2, fieldHeight * 0.15);

    for (let i = 0; i < digits; i++) {
        const ch = text[i];
        const cellX = xField + i * cellWidth;
        const cellMidX = cellX + cellWidth / 2;

        const glyphWidth = font.widthOfTextAtSize(ch, fontSize);

        const tx = cellMidX - glyphWidth / 2;
        // Bottom anchor: text baseline sits near the bottom line
        const ty = yBottom + bottomPadding;

        page.drawText(ch, {
            x: tx,
            y: ty,
            size: fontSize,
            font,
            color
        });
    }
}

// -------------------------------------
// המרת HEX → RGB
// -------------------------------------
/**
 * Converts HEX color to RGB object for pdf-lib
 * @param {string} hex - Hex color string (e.g. "#FF0000")
 * @returns {Object} - {r, g, b} with values 0-1
 */
function hexToRgb(hex) {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return res
        ? {
              r: parseInt(res[1], 16) / 255,
              g: parseInt(res[2], 16) / 255,
              b: parseInt(res[3], 16) / 255,
          }
        : { r: 0, g: 0, b: 0 };
}
