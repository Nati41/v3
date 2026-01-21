// ========================================
// Global State Management
// ========================================

// Import core functions
const { calculateBBoxPosition, getDefaultStyle, buildExportFieldData, initializeFieldData, hasValidCoordinates } = window.LiveFillCore;

// Import UI functions from livefill-ui.js
const {
    debugLog, updateDebugConsole, toggleDebugConsole,
    ToastManager, ProgressModal, ValidationModal,
    showProgressModal, hideProgressModal, updateProgress,
    showLoading, showStatus,
    applyStyleToElement
} = window.LiveFillUI;
let pdfJsDoc = null;
let pdfBytesSafe = null;
let fieldsMapping = null;
let liveFillData = {};
let selectedFieldId = null;
let undoStack = [];
let redoStack = [];
let customFontBytes = null;
let customFontName = null;
const MAX_UNDO_STACK = 50;

// ===== NEW ARCHITECTURE: Render Once + CSS Zoom =====
const RENDER_SCALE = 2.0;  // Fixed render scale (144 DPI) - NEVER CHANGES
let currentZoom = 1.0;     // Visual zoom via CSS transform (1.0 = 100%)
const MIN_ZOOM = 0.25;     // 25%
const MAX_ZOOM = 4.0;      // 400%

// Legacy compatibility
let currentScale = RENDER_SCALE; // Keep for backward compatibility with export

// Auto-save system
let autoSaveTimeout = null;
let lastSavedData = null;
const AUTO_SAVE_DELAY = 3000; // 3 seconds after last change

// Initialize toast system on page load
window.addEventListener('DOMContentLoaded', () => {
    ToastManager.init();

    // Check for pending mapping from Mapper (Session Bridge)
    readPendingMapperMapping();
});

// ========================================
// Auto-save System
// ========================================
function scheduleAutoSave() {
    // Clear existing timeout
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }

    // Schedule new save
    autoSaveTimeout = setTimeout(() => {
        performAutoSave();
    }, AUTO_SAVE_DELAY);
}

function performAutoSave() {
    // Check if data actually changed
    const currentDataString = JSON.stringify(liveFillData);
    if (currentDataString === lastSavedData) {
        return; // No changes, skip save
    }

    try {
        const autoSaveData = {
            liveFillData: liveFillData,
            fieldsMapping: fieldsMapping,
            timestamp: Date.now(),
            version: '1.0'
        };

        localStorage.setItem('liveFill_autoSave', JSON.stringify(autoSaveData));
        lastSavedData = currentDataString;

        debugLog('💾 Auto-save completed', 'success');

        // Show subtle toast (only if not saving manually)
        if (typeof ToastManager !== 'undefined') {
            ToastManager.info('נשמר אוטומטית', 1500);
        }
    } catch (err) {
        console.error('Auto-save failed:', err);
        debugLog('❌ Auto-save failed: ' + err.message, 'error');
    }
}

function tryRestoreAutoSave() {
    try {
        const saved = localStorage.getItem('liveFill_autoSave');
        if (!saved) return;

        const autoSaveData = JSON.parse(saved);

        // Check if auto-save is recent (within 7 days)
        const ageInDays = (Date.now() - autoSaveData.timestamp) / (1000 * 60 * 60 * 24);
        if (ageInDays > 7) {
            // Too old, clear it
            localStorage.removeItem('liveFill_autoSave');
            return;
        }

        // Ask user if they want to restore
        const timestamp = new Date(autoSaveData.timestamp).toLocaleString('he-IL');
        const confirmed = confirm(`נמצאה שמירה אוטומטית מ-${timestamp}.\n\nלשחזר את הנתונים?`);

        if (confirmed) {
            liveFillData = autoSaveData.liveFillData;
            window.liveFillData = liveFillData;  // Update window reference
            lastSavedData = JSON.stringify(liveFillData);

            if (autoSaveData.fieldsMapping) {
                fieldsMapping = autoSaveData.fieldsMapping;
                window.fieldsMapping = fieldsMapping;  // Expose to window for Excel import
            }

            debugLog('✅ Auto-save restored', 'success');
            ToastManager.success('נתונים שוחזרו מהשמירה האוטומטית');

            // Re-render fields if PDF is loaded
            if (pdfJsDoc && fieldsMapping) {
                createFieldOverlays();
            }
        } else {
            // User declined, clear the auto-save
            localStorage.removeItem('liveFill_autoSave');
        }
    } catch (err) {
        console.error('Auto-restore failed:', err);
        debugLog('❌ Auto-restore failed: ' + err.message, 'error');
        // Clear corrupted data
        localStorage.removeItem('liveFill_autoSave');
    }
}

// Call auto-save when data changes
function triggerAutoSave() {
    scheduleAutoSave();
}

// toggleDebugConsole moved to livefill-ui.js

// ========================================
// Field Normalization
// ========================================

// Use shared debounce from window.Debounce (loaded from shared/debounce.js)
const debounce = window.Debounce;

// ===============================
// Task 3.2 – Essential constants only
// ===============================
const CHECKBOX_SIZE = 20;
const RADIO_SIZE = 16;
const CIRCLE_SIZE = 24;
const DEBOUNCE_INPUT = 150;

// Use shared normalizeField from window.normalizeField (loaded from shared/normalizeField.js)
const normalizeField = window.normalizeField;

// Use shared migrateV1toV2 from window.migrateV1toV2 (loaded from shared/migrateV1toV2.js)
const migrateV1toV2 = window.migrateV1toV2;

// ========================================
// Debounced Function Wrappers (100-150ms)
// ========================================

// Create debounced versions at initialization time
const debouncedUpdateFieldStyle = debounce(function() {
    console.log("⚡ Debounced: updateFieldStyle");
    _updateFieldStyleImmediate();
}, DEBOUNCE_INPUT);

const debouncedHandleFieldInput = debounce(function(event) {
    console.log("⚡ Debounced: handleFieldInput");
    _handleFieldInputImmediate(event);
}, DEBOUNCE_INPUT);

// ========================================
// Popover Integration for Field Input
// ========================================

/**
 * Open popover for field input (for perGlyphBoxes fields like ID, date, phone)
 */
function openFieldPopover(anchorElement, fieldMeta, fieldId) {
    if (!window.FieldInputPopover) {
        console.warn('[openFieldPopover] FieldInputPopover not loaded');
        return;
    }

    const currentValue = liveFillData[fieldId]?.value || '';

    window.FieldInputPopover.open({
        anchorElement: anchorElement,
        fieldMeta: {
            id: fieldId,
            type: fieldMeta.type || 'text',
            label_he: fieldMeta.label_he || fieldMeta.hebrewName || fieldId
        },
        currentValue: currentValue,
        intent: 'perGlyphBoxes',
        onConfirm: (value, context) => {
            console.log('[openFieldPopover] Confirmed:', value);

            // Update liveFillData
            if (!liveFillData[fieldId]) {
                liveFillData[fieldId] = { value: '', style: getDefaultStyle() };
            }
            liveFillData[fieldId].value = value;

            // Re-render using Export-matching renderer (pass fieldMeta for structured segment caching)
            const fieldPt = JSON.parse(anchorElement.dataset.fieldPt || '{"width":100,"height":20}');
            const ptToPxScale = parseFloat(anchorElement.dataset.ptToPxScale || '1');
            const fieldStyle = liveFillData[fieldId]?.style || {};
            renderPreviewText(anchorElement, value, fieldPt, ptToPxScale, fieldStyle, fieldMeta);

            // Trigger auto-save
            triggerAutoSave();

            // Use DataStoreManager if available
            if (window.DataStoreManager) {
                window.DataStoreManager.setFieldValue(fieldId, value);
            }
        },
        onCancel: () => {
            console.log('[openFieldPopover] Cancelled');
        }
    });
}

/**
 * Open popover for table cell input
 */
function openTableCellPopover(anchorElement, col, tableId, rowIndex) {
    if (!window.FieldInputPopover) {
        console.warn('[openTableCellPopover] FieldInputPopover not loaded');
        return;
    }

    const colId = col.englishId || col.columnId;
    const currentValue = liveFillData.tables?.[tableId]?.[rowIndex]?.[colId] || '';

    window.FieldInputPopover.open({
        anchorElement: anchorElement,
        fieldMeta: {
            id: colId,
            type: col.type || 'text',
            label_he: col.hebrewName || colId,
            columnId: col.columnId
        },
        currentValue: currentValue,
        intent: 'perGlyphBoxes',
        tableContext: { tableId, rowIndex, columnKey: colId },
        onConfirm: (value, context) => {
            console.log('[openTableCellPopover] Confirmed:', value, 'for cell:', tableId, rowIndex, colId);

            // Ensure table data structure exists
            if (!liveFillData.tables) liveFillData.tables = {};
            if (!liveFillData.tables[tableId]) liveFillData.tables[tableId] = [];
            if (!liveFillData.tables[tableId][rowIndex]) liveFillData.tables[tableId][rowIndex] = {};

            // Update value
            liveFillData.tables[tableId][rowIndex][colId] = value;

            // Re-render using Export-matching renderer
            const fieldPt = JSON.parse(anchorElement.dataset.fieldPt || '{"width":100,"height":20}');
            const ptToPxScale = parseFloat(anchorElement.dataset.ptToPxScale || '1');
            renderPreviewText(anchorElement, value, fieldPt, ptToPxScale, {});

            // Trigger auto-save
            triggerAutoSave();

            // Use DataStoreManager if available
            if (window.DataStoreManager) {
                window.DataStoreManager.setTableCellValue(tableId, rowIndex, colId, value);
            }
        },
        onCancel: () => {
            console.log('[openTableCellPopover] Cancelled');
        }
    });
}

// State Management Functions
function cleanAllState() {
    debugLog('🧹 Cleaning all state', 'warning');

    if (pdfJsDoc) {
        try {
            pdfJsDoc.destroy();
            debugLog('PDF.js document destroyed');
        } catch (e) {
            debugLog(`Error destroying PDF.js doc: ${e.message}`, 'error');
        }
        pdfJsDoc = null;
    }

    pdfBytesSafe = null;
    fieldsMapping = null;
    window.fieldsMapping = null;  // Clear window reference
    liveFillData = {};
    window.liveFillData = liveFillData;  // Update window reference
    selectedFieldId = null;
    undoStack = [];
    redoStack = [];

    cleanDOMElements();
    resetControls();

    debugLog('✨ State cleaned successfully', 'success');
}

function cleanDOMElements() {
    const container = document.getElementById('pdf-container');
    if (!container) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    document.querySelectorAll('.field-editor').forEach(el => el.remove());

    document.querySelectorAll('canvas').forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    debugLog('DOM elements cleaned');
}

function resetControls() {
    document.getElementById('export-btn').disabled = true;
    document.getElementById('export-json-btn').disabled = true;
    document.getElementById('field-controls').style.display = 'none';
    document.getElementById('no-field-selected').style.display = 'block';
    document.getElementById('zoom-slider').value = 100;
    document.getElementById('zoom-value').textContent = '100%';
    currentScale = 1.0;
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    debugLog('🚀 Application initialized', 'success');
    initializeEventListeners();
    initializeKeyboardShortcuts();

    // Try to restore auto-saved data
    setTimeout(() => {
        tryRestoreAutoSave();
    }, 500); // Small delay to let UI initialize


});

// Keyboard Shortcuts
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z or Cmd+Z - Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (undoStack.length > 0) {
                undoLastChange();
                ToastManager.info('בוטל', 1500);
            } else {
                ToastManager.warning('אין מה לבטל', 1500);
            }
        }
        // Ctrl+Y or Cmd+Y or Ctrl+Shift+Z or Cmd+Shift+Z - Redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            if (redoStack.length > 0) {
                redoChange();
                ToastManager.info('שוחזר', 1500);
            } else {
                ToastManager.warning('אין מה לשחזר', 1500);
            }
        }
        // Ctrl+S or Cmd+S - Save (manual save, not auto-save)
        else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveProgress();
        }
    });

    debugLog('⌨️ Keyboard shortcuts initialized (Ctrl+Z/Ctrl+Y/Ctrl+S)', 'success');
}

// Event Listeners
function initializeEventListeners() {
    document.getElementById('pdf-upload').addEventListener('change', handlePDFUpload);
    document.getElementById('json-upload').addEventListener('change', handleJSONUpload);
    document.getElementById('font-upload').addEventListener('change', handleFontUpload);

    const zoomSlider = document.getElementById('zoom-slider');
    zoomSlider.addEventListener('input', (e) => {
        const zoomValue = parseInt(e.target.value);
        document.getElementById('zoom-value').textContent = zoomValue + '%';

        // ===== NEW ARCHITECTURE: CSS Transform Zoom =====
        // Convert slider value (50-200) to zoom factor
        // Slider 100 = zoom 1.0 (100%)
        // Slider 200 = zoom 2.0 (200%)
        // Slider 50 = zoom 0.5 (50%)
        currentZoom = zoomValue / 100;

        // Apply zoom via CSS transform - NO re-rendering!
        applyZoom(currentZoom);

        console.log(`🔍 Zoom changed to ${zoomValue}% (CSS transform only, no re-render)`);
    });

    document.getElementById('font-family').addEventListener('change', updateFieldStyle);

    document.getElementById('font-size').addEventListener('input', (e) => {
        document.getElementById('font-size-number').value = e.target.value;
        updateFieldStyle();
    });

    document.getElementById('font-size-number').addEventListener('input', (e) => {
        document.getElementById('font-size').value = e.target.value;
        updateFieldStyle();
    });

    document.getElementById('font-color').addEventListener('input', updateFieldStyle);

    document.getElementById('letter-spacing').addEventListener('input', (e) => {
        document.getElementById('letter-spacing-number').value = e.target.value;
        updateFieldStyle();
    });

    document.getElementById('letter-spacing-number').addEventListener('input', (e) => {
        document.getElementById('letter-spacing').value = e.target.value;
        updateFieldStyle();
    });

    document.getElementById('word-spacing').addEventListener('input', (e) => {
        document.getElementById('word-spacing-number').value = e.target.value;
        updateFieldStyle();
    });

    document.getElementById('word-spacing-number').addEventListener('input', (e) => {
        document.getElementById('word-spacing').value = e.target.value;
        updateFieldStyle();
    });

    document.getElementById('opacity').addEventListener('input', (e) => {
        document.getElementById('opacity-value').textContent = e.target.value + '%';
        updateFieldStyle();
    });

    document.querySelectorAll('.alignment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.alignment-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            updateFieldStyle();
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            deselectField();
        } else if (e.key === 'Tab' && selectedFieldId) {
            e.preventDefault();
            navigateToNextField(e.shiftKey);
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undoLastChange();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            redoChange();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveProgress();
        }
    });
}

// Font Handling
async function loadFontFromFile(fileName) {
    try {
        debugLog(`Attempting to load font from: ${fileName}`);
        const response = await fetch(`./${fileName}`);
        if (response.ok) {
            const fontBuffer = await response.arrayBuffer();
            customFontBytes = new Uint8Array(fontBuffer);
            customFontName = fileName.replace(/\.[^/.]+$/, "");
            document.getElementById('font-status').style.display = 'inline-block';
            debugLog(`✅ Font loaded: ${customFontName} (${(customFontBytes.byteLength / 1024).toFixed(1)}KB)`, 'success');
        } else {
            throw new Error(`Font file not found: ${fileName}`);
        }
    } catch (err) {
        console.warn('Font load failed, using Google Fonts fallback');
        debugLog(`Font auto-load failed (CORS or file not found): ${err.message}`, 'warning');
        // Fallback to Google Fonts - no custom font will be used
        customFontBytes = null;
        customFontName = null;
        document.getElementById('font-status').style.display = 'none';
    }
}

async function handleFontUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    debugLog(`📤 Loading font: ${file.name}`);

    try {
        const arrayBuffer = await file.arrayBuffer();
        customFontBytes = new Uint8Array(arrayBuffer);
        customFontName = file.name.replace(/\.[^/.]+$/, "");

        document.getElementById('font-status').style.display = 'inline-block';
        document.getElementById('font-status').textContent = `✓ ${customFontName}`;

        debugLog(`✅ Custom font loaded: ${customFontName} (${(customFontBytes.byteLength / 1024).toFixed(1)}KB)`, 'success');
        showStatus(`פונט ${customFontName} נטען בהצלחה`, 'success');
    } catch (err) {
        debugLog(`❌ Font upload failed: ${err.message}`, 'error');
        showStatus('שגיאה בטעינת פונט', 'error');
    } finally {
        event.target.value = '';
    }
}

// PDF Upload Handler
async function handlePDFUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // ✅ Task B: File size validation (20MB max)
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_FILE_SIZE) {
        showStatus(`הקובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(1)}MB). מקסימום: 20MB`, 'error');
        debugLog(`❌ File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 20MB)`, 'error');
        ToastManager.error(`הקובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(1)}MB). מקסימום: 20MB`);
        event.target.value = '';
        return;
    }

    showLoading(true);
    debugLog(`📄 Starting PDF upload: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`, 'info');

    try {


        const arrayBuffer = await file.arrayBuffer();
        pdfBytesSafe = new Uint8Array(arrayBuffer);
        debugLog(`✅ PDF bytes stored safely: ${(pdfBytesSafe.byteLength / 1024).toFixed(1)}KB`, 'success');

        const blob = new Blob([pdfBytesSafe], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const loadingTask = pdfjsLib.getDocument({
            url: url,
            cacheKey: `${Date.now()}_${Math.random()}`,
            disableAutoFetch: true,
            disableStream: true
        });

        pdfJsDoc = await loadingTask.promise;
        debugLog(`✅ PDF loaded with PDF.js: ${pdfJsDoc.numPages} pages`, 'success');

        URL.revokeObjectURL(url);

        await renderAllPages();
        checkExportEnabled();

        showStatus('PDF נטען בהצלחה', 'success');
        debugLog('✅ PDF upload completed successfully', 'success');
        ToastManager.success(`PDF נטען בהצלחה (${pdfJsDoc.numPages} עמודים)`);

        // ============ AUTO-LOAD PENDING MAPPING FROM MAPPER ============
        if (window.__PENDING_MAPPING_FROM_MAPPER__) {
            const pendingMapping = window.__PENDING_MAPPING_FROM_MAPPER__;
            const pendingPdfName = window.__PENDING_PDF_NAME_FROM_MAPPER__;

            // Clear globals
            window.__PENDING_MAPPING_FROM_MAPPER__ = null;
            window.__PENDING_PDF_NAME_FROM_MAPPER__ = null;

            console.log('[LiveFill] Auto-loading pending mapping from Mapper');

            // Warning if PDF name doesn't match (but don't block)
            const uploadedName = file?.name?.replace(/\.pdf$/i, '') || '';
            if (pendingPdfName && uploadedName &&
                uploadedName.toLowerCase() !== pendingPdfName.toLowerCase()) {
                ToastManager.warning(`שם הקובץ (${uploadedName}) שונה מהמיפוי (${pendingPdfName})`);
            }

            // Small delay to ensure PDF is fully ready
            setTimeout(async () => {
                try {
                    const success = await applyMappingObject(pendingMapping);
                    if (success) {
                        ToastManager.success(`מיפוי נטען אוטומטית (${fieldsMapping.fields.length} שדות)`);
                    } else {
                        ToastManager.error('שגיאה בטעינת המיפוי האוטומטית');
                    }
                } catch (e) {
                    console.error('[LiveFill] Auto-load mapping error:', e);
                    ToastManager.error('שגיאה בטעינת המיפוי האוטומטית');
                }
            }, 300);
        }

    } catch (err) {
        // ✅ Task B: Improved PDF loading error messages
        console.error('PDF loading error:', err);
        debugLog(`❌ PDF upload failed: ${err.message}`, 'error');

        let errorMsg = 'שגיאה בטעינת PDF';
        if (err.message.includes('Invalid PDF') || err.message.includes('PDF header')) {
            errorMsg = 'הקובץ אינו PDF תקין או שהוא פגום';
        } else if (err.message.includes('password') || err.message.includes('encrypted')) {
            errorMsg = 'PDF מוגן בסיסמה - אנא הסר את ההגנה תחילה';
        }
        showStatus(errorMsg, 'error');
        ToastManager.error(errorMsg);
    } finally {
        showLoading(false);
        event.target.value = '';
    }
}

// ============ MAPPER → LIVEFILL SESSION BRIDGE ============

/**
 * Read pending mapping from Mapper (via sessionStorage)
 * Called on page load, stores in globals for later use
 */
function readPendingMapperMapping() {
    const STORAGE_KEY = 'tofesly.mapperToLiveFill.v1';
    const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);

        // Check version
        if (parsed.v !== 1) {
            console.warn('[LiveFill] Unknown pending mapping version:', parsed.v);
            sessionStorage.removeItem(STORAGE_KEY);
            return;
        }

        // Check age
        const age = Date.now() - (parsed.createdAt || 0);
        if (age > MAX_AGE_MS) {
            console.log('[LiveFill] Pending mapping expired (age:', Math.round(age / 1000), 'sec)');
            sessionStorage.removeItem(STORAGE_KEY);
            return;
        }

        // Clear immediately (one-shot)
        sessionStorage.removeItem(STORAGE_KEY);

        // Store in globals
        window.__PENDING_MAPPING_FROM_MAPPER__ = parsed.mapping;
        window.__PENDING_PDF_NAME_FROM_MAPPER__ = parsed.fileName;

        console.log('[LiveFill] Found pending mapping from Mapper:', parsed.fileName);
        ToastManager.info(`מיפוי מוכן לטעינה: ${parsed.fileName || 'document'}`);

    } catch (e) {
        console.error('[LiveFill] Error reading pending mapping:', e);
        sessionStorage.removeItem(STORAGE_KEY);
    }
}

/**
 * Apply mapping data to LiveFill
 * Used by both handleJSONUpload and auto-load from Mapper
 * @param {Object} rawData - The mapping data (fill-engine-v2.0 format or legacy)
 * @returns {Promise<boolean>} Success
 */
async function applyMappingObject(rawData) {
    try {
        let mappingData = rawData;

        // Normalize format (legacy support)
        if (Array.isArray(mappingData)) {
            mappingData = { fields: mappingData };
            debugLog('✅ JSON array wrapped into { fields: [...] } format');
        } else if (!Array.isArray(mappingData.fields)) {
            throw new Error("Invalid JSON format: missing fields array");
        }

        // Load pre-filled data if present
        if (mappingData.data) {
            liveFillData = mappingData.data;
            window.liveFillData = liveFillData;  // Update window reference
            debugLog(`✅ Loaded pre-filled data for ${Object.keys(liveFillData).length} fields`);
        }

        // Normalize fields
        mappingData.fields = (mappingData.fields || []).map(field => {
            const normalized = normalizeField(field);
            if (!normalized) {
                debugLog(`⚠️ Skipping invalid field: ${field.id || 'unknown'}`, 'warning');
                return null;
            }
            return normalized;
        }).filter(f => f !== null);

        // V1→V2 migration if needed
        if (pdfJsDoc) {
            try {
                const firstPage = await pdfJsDoc.getPage(1);
                const baseViewport = firstPage.getViewport({ scale: 1.0 });
                const pageWidth = baseViewport.width;
                const pageHeight = baseViewport.height;
                debugLog(`📏 Using PDF page dimensions: ${pageWidth}x${pageHeight} points`, 'info');

                const migrationResult = migrateV1toV2(mappingData.fields, pageWidth, pageHeight);
                if (migrationResult.migrationCount > 0) {
                    mappingData.fields = migrationResult.fields;
                    showStatus(`המרת ${migrationResult.migrationCount} שדות לפורמט V2`, 'success');
                }
            } catch (error) {
                console.warn('⚠️ Could not get PDF page dimensions, using A4 defaults');
                const migrationResult = migrateV1toV2(mappingData.fields, 595, 842);
                mappingData.fields = migrationResult.fields;
            }
        }

        // Set global state
        fieldsMapping = mappingData;
        window.fieldsMapping = mappingData;  // Expose to window for Excel import
        debugLog(`✅ Mapping loaded: ${fieldsMapping.fields.length} fields`, 'success');

        // Initialize tables if present
        if (mappingData.tables && mappingData.tables.length > 0) {
            liveFillData.tables = {};
            mappingData.tables.forEach(table => {
                const tableId = table.tableId || table.id;
                if (tableId) {
                    liveFillData.tables[tableId] = [];
                    const rowCount = table.rowCount || 0;
                    for (let i = 0; i < rowCount; i++) {
                        const row = {};
                        (table.columns || []).forEach(col => {
                            const colId = col.englishId || col.columnId;
                            row[colId] = col.type === 'checkbox' ? false : '';
                        });
                        liveFillData.tables[tableId].push(row);
                    }
                }
            });
            debugLog(`✅ Loaded ${mappingData.tables.length} tables to liveFillData.tables`, 'success');
        }

        // Log field info
        fieldsMapping.fields.forEach((field, idx) => {
            const id = field.id || field.fieldId;
            const value = liveFillData[id]?.value || liveFillData[id]?.checked || '';
            debugLog(`Field ${idx + 1}: id=${id}, type=${field.type}, page=${field.page}, value="${value}"`);
        });

        // Create overlays and update UI
        initializeLiveFillData();

        if (pdfJsDoc) {
            debugLog('📞 Calling createFieldOverlays from applyMappingObject', 'info');
            createFieldOverlays();
            debugLog('✅ Field overlays created', 'success');
        }

        checkExportEnabled();

        return true;

    } catch (e) {
        console.error('[LiveFill] applyMappingObject error:', e);
        debugLog(`❌ applyMappingObject failed: ${e.message}`, 'error');
        return false;
    }
}

// JSON Upload Handler
/**
 * Loads field mapping from JSON file and initializes field overlays
 * @param {Event} event - File input change event
 */
async function handleJSONUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    debugLog(`📋 Starting JSON upload: ${file.name}`, 'info');

    try {
        // Clear old data
        document.querySelectorAll('.field-editor').forEach(el => el.remove());
        liveFillData = {};
        window.liveFillData = liveFillData;  // Update window reference
        localStorage.removeItem('liveFillData');
        debugLog('🧹 Cleared previous liveFillData (memory + localStorage)', 'info');

        // Parse JSON
        const text = await file.text();
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (parseError) {
            throw new Error('הקובץ אינו JSON תקין - יש לבדוק את תקינות המבנה');
        }

        // Apply mapping using shared function
        const success = await applyMappingObject(parsed);
        if (success) {
            showStatus('מיפוי שדות נטען בהצלחה', 'success');
            ToastManager.success(`מיפוי נטען בהצלחה (${fieldsMapping.fields.length} שדות)`);
        } else {
            throw new Error('שגיאה בטעינת המיפוי');
        }

    } catch (err) {
        debugLog(`❌ JSON upload failed: ${err.message}`, 'error');
        showStatus('שגיאה בטעינת JSON', 'error');
        ToastManager.error(err.message || 'שגיאה בטעינת JSON');
    } finally {
        event.target.value = '';
    }
}

async function exportFilledPDF() {
    try {
        // Validate before export
        const canProceed = await ValidationModal.validate(fieldsMapping, liveFillData);

        if (!canProceed) {
            ToastManager.info('הייצוא בוטל');
            return;
        }

        ToastManager.info('מייצא PDF...');
        ExportEngine.export({
            pdfBytesSafe: pdfBytesSafe,
            fieldsMapping: fieldsMapping,
            liveFillData: liveFillData,
            customFontBytes: customFontBytes,
            customFontName: customFontName
        });
    } catch (err) {
        console.error("❌ Export error:", err);
        showToast("שגיאה בייצוא PDF", "error");
    }
}

function exportJSON() {
    const hasFields = fieldsMapping && fieldsMapping.fields && fieldsMapping.fields.length > 0;
    const hasTables = fieldsMapping && fieldsMapping.tables && fieldsMapping.tables.length > 0;

    if (!hasFields && !hasTables) {
        showStatus('אין שדות או טבלאות לייצוא', 'error');
        return;
    }

    // Build export data with proper anchor/bbox handling
    const exportData = {
        fields: (fieldsMapping.fields || []).map(field => {
            const fieldData = {
                id: field.id || field.fieldId,
                type: field.type,
                page: field.page || 1
            };

            // Checkbox/Radio/Circle: export with anchor + overlay size
            if ((field.type === 'checkbox' || field.type === 'radio' || field.type === 'circle') && field.anchor) {
                fieldData.anchor = field.anchor;
                const defaultSize = field.type === 'checkbox' ? CHECKBOX_SIZE : (field.type === 'circle' ? CIRCLE_SIZE : RADIO_SIZE);
                fieldData.overlayWidth = field.overlayWidth || defaultSize;
                fieldData.overlayHeight = field.overlayHeight || defaultSize;
            }
            // Regular fields: export with bbox
            else if (field.bbox) {
                fieldData.bbox = field.bbox;
            }

            return fieldData;
        }),
        tables: fieldsMapping.tables || [],
        data: liveFillData
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `livefill_data_${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showStatus('JSON יוצא בהצלחה', 'success');
}

function initializeLiveFillData() {
    if (!fieldsMapping?.fields) return;

    fieldsMapping.fields.forEach(field => {
        const fieldId = field.id || field.fieldId;
        if (!fieldId || liveFillData[fieldId]) return;

        if (['text', 'signature', 'number', 'date'].includes(field.type)) {
            liveFillData[fieldId] = {
                value: '',
                style: {
                    fontFamily: 'David Libre',
                    fontSize: 14,
                    color: '#000000',
                    alignment: 'right',
                    letterSpacing: 0,
                    wordSpacing: 0,
                    opacity: 1
                }
            };
        } else if (['checkbox', 'radio'].includes(field.type)) {
            liveFillData[fieldId] = { checked: false };
        }
    });
}

/**
 * Update field data from Excel import
 * Called by livefill.html Excel import flow
 * @param {string} fieldId - The field ID to update
 * @param {*} value - The value to set
 * @param {string} fieldType - The field type (text, checkbox, radio, date, etc.)
 */
function updateFieldDataFromExcel(fieldId, value, fieldType) {
    if (!fieldId) return;

    console.log(`[updateFieldDataFromExcel] ${fieldId} = ${value} (${fieldType})`);

    if (fieldType === 'checkbox' || fieldType === 'radio') {
        // Boolean value for checkbox/radio
        if (!liveFillData[fieldId]) {
            liveFillData[fieldId] = { checked: false };
        }
        liveFillData[fieldId].checked = Boolean(value);
    } else {
        // Text/number/date value
        if (!liveFillData[fieldId]) {
            liveFillData[fieldId] = {
                value: '',
                style: {
                    fontFamily: 'David Libre',
                    fontSize: 14,
                    color: '#000000',
                    alignment: 'right',
                    letterSpacing: 0,
                    wordSpacing: 0,
                    opacity: 1
                }
            };
        }
        liveFillData[fieldId].value = String(value ?? '');
    }
}

// Expose to window for Excel import
window.updateFieldDataFromExcel = updateFieldDataFromExcel;
window.createFieldOverlays = createFieldOverlays;
window.liveFillData = liveFillData;

// ===== NEW ARCHITECTURE: CSS Transform Zoom =====

/**
 * Applies zoom via CSS transform on the transform-container
 * This is the ONLY way zoom should be applied - no canvas re-rendering!
 * @param {number} zoom - Zoom factor (1.0 = 100%, 2.0 = 200%, etc.)
 */
function applyZoom(zoom) {
    const transformContainer = document.getElementById('transform-container');
    if (!transformContainer) return;

    // Clamp zoom to valid range
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

    // Apply CSS transform - this affects canvas AND overlays together
    transformContainer.style.transform = `scale(${zoom})`;

    console.log(`🔍 Applied CSS zoom: scale(${zoom})`);
}

/**
 * Renders all PDF pages to canvas elements in the UI
 * Creates one canvas per page and displays them sequentially
 * NOTE: This is called ONCE on PDF load, NOT on zoom changes!
 */
async function renderAllPages() {
    if (!pdfJsDoc) return;

    const container = document.getElementById('pdf-container');
    if (!container) return;

    container.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdfJsDoc.numPages; pageNum++) {
        await renderPage(pageNum);
    }

    if (fieldsMapping) {
        debugLog('📞 Calling createFieldOverlays from renderAllPages', 'info');
        createFieldOverlays();
    }

    // Apply initial zoom after rendering
    applyZoom(currentZoom);
}

async function renderPage(pageNum) {
    const page = await pdfJsDoc.getPage(pageNum);

    // ===== NEW ARCHITECTURE: RENDER ONCE at fixed scale =====
    // Use RENDER_SCALE * devicePixelRatio for crisp rendering
    // This NEVER changes - zoom is handled by CSS transform
    const renderScale = RENDER_SCALE * window.devicePixelRatio;
    const viewport = page.getViewport({ scale: renderScale });

    // Store base viewport (scale 1.0) for PDF coordinate calculations
    const baseViewport = page.getViewport({ scale: 1.0 });

    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'page-wrapper';
    pageWrapper.dataset.pageNum = pageNum;

    const canvas = document.createElement('canvas');
    canvas.className = 'page-canvas';
    const context = canvas.getContext('2d');

    // Canvas internal size (device pixels for crisp rendering)
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Canvas CSS size (logical pixels) - FIXED, never changes with zoom
    canvas.style.width = (viewport.width / window.devicePixelRatio) + 'px';
    canvas.style.height = (viewport.height / window.devicePixelRatio) + 'px';

    // Store viewports for coordinate calculations
    canvas._viewport = viewport;
    canvas._baseViewport = baseViewport;
    canvas._renderScale = RENDER_SCALE; // Store the render scale used

    // Create a PDFPageView-like object for compatibility
    canvas._pdfPageView = {
        viewport: viewport
    };

    // Render PDF to canvas (ONCE - never re-rendered on zoom)
    await page.render({ canvasContext: context, viewport }).promise;

    // Store viewport globally
    if (!window._pageViewports) window._pageViewports = {};
    window._pageViewports[pageNum] = viewport;
    window._baseViewports = window._baseViewports || {};
    window._baseViewports[pageNum] = baseViewport;

    console.log(`📄 Page ${pageNum} rendered ONCE at scale ${RENDER_SCALE}x (${viewport.width}x${viewport.height})`);

    const overlay = document.createElement('div');
    overlay.className = 'fields-overlay';
    overlay.dataset.pageNum = pageNum;

    pageWrapper.appendChild(canvas);
    pageWrapper.appendChild(overlay);

    const container = document.getElementById('pdf-container');
    if (container) {
        container.appendChild(pageWrapper);
    }
}

// calculateBBoxPosition moved to livefill-core.js

/**
 * Ensures PDF.js viewport is ready before executing callback
 * Waits up to 1 second (20 attempts × 50ms) for viewport to be available
 * @param {number} pageNum - Page number to check
 * @param {Function} callback - Function to execute once viewport is ready
 */
function ensurePDFViewportReady(pageNum, callback) {
    const overlay = document.querySelector(`.fields-overlay[data-page-num="${pageNum}"]`);
    if (!overlay) {
        console.error(`❌ No overlay for page ${pageNum}`);
        return;
    }

    const canvas = overlay.previousElementSibling;
    if (!canvas || canvas.tagName !== "CANVAS") {
        console.error(`❌ No canvas found for page ${pageNum}`);
        return;
    }

    let attempts = 0;
    const maxAttempts = 20;

    const iv = setInterval(() => {
        const viewport = window._pageViewports?.[pageNum];

        if (viewport) {
            clearInterval(iv);
            console.log(`✅ PDF viewport ready for page ${pageNum} (attempt ${attempts + 1})`);
            callback(viewport, canvas);
        }
        else if (++attempts >= maxAttempts) {
            clearInterval(iv);
            console.error(`❌ PDF viewport NOT READY for page ${pageNum} after ${maxAttempts} attempts`);
        }
    }, 50);
}

/**
 * Creates interactive HTML overlays for all fields on the PDF
 * Positions text inputs, checkboxes, and radio buttons over the PDF canvas
 */
function createFieldOverlays() {
    debugLog(`🔧 createFieldOverlays starting with ${fieldsMapping?.fields?.length || 0} fields`);

    document.querySelectorAll('.field-editor').forEach(el => el.remove());
    document.querySelectorAll('.table-cell-editor').forEach(el => el.remove());

    // Group fields by page
    const fieldsByPage = {};
    if (fieldsMapping?.fields) {
        fieldsMapping.fields.forEach(field => {
            const pageNum = field.page || 1;
            if (!fieldsByPage[pageNum]) fieldsByPage[pageNum] = [];
            fieldsByPage[pageNum].push(field);
        });
    }

    // Group tables by page
    const tablesByPage = {};
    if (fieldsMapping?.tables && fieldsMapping.tables.length > 0) {
        debugLog(`📊 Found ${fieldsMapping.tables.length} tables`);
        fieldsMapping.tables.forEach(table => {
            const pageNum = table.page || 1;
            if (!tablesByPage[pageNum]) tablesByPage[pageNum] = [];
            tablesByPage[pageNum].push(table);
        });
    }

    debugLog(`🗂️ Fields grouped by pages: ${JSON.stringify(Object.keys(fieldsByPage))}`);
    debugLog(`🗂️ Tables grouped by pages: ${JSON.stringify(Object.keys(tablesByPage))}`);

    // Get all unique pages
    const allPages = new Set([
        ...Object.keys(fieldsByPage).map(Number),
        ...Object.keys(tablesByPage).map(Number)
    ]);

    // Process each page (wait for viewport to be ready first)
    allPages.forEach(pageNum => {
        ensurePDFViewportReady(pageNum, () => {
            const fields = fieldsByPage[pageNum] || [];
            if (fields.length > 0) {
                createFieldOverlaysForPage(pageNum, fields);
            }
            const tables = tablesByPage[pageNum] || [];
            if (tables.length > 0) {
                createTableOverlaysForPage(pageNum, tables);
            }
        });
    });
}

function createFieldOverlaysForPage(pageNum, pageFields) {
    if (!pageFields || pageFields.length === 0) {
        console.log(`⚠️ createFieldOverlaysForPage: no fields for page ${pageNum}`);
        return;
    }

    debugLog(`🚀 createFieldOverlaysForPage called for page ${pageNum} with ${pageFields.length} fields`);

    const overlay = document.querySelector(`.fields-overlay[data-page-num="${pageNum}"]`);
    if (!overlay) {
        debugLog(`❌ No overlay found for page ${pageNum}`, 'error');
        return;
    }

    const canvas = overlay.previousElementSibling;
    if (!canvas || canvas.tagName !== "CANVAS") {
        debugLog(`❌ No canvas found for page ${pageNum}`, 'error');
        return;
    }

    debugLog(`✅ Found overlay and canvas for page ${pageNum}`);

    // Use CSS display size for overlay positioning (NOT device pixels)
    const pageWidth = canvas.clientWidth;
    const pageHeight = canvas.clientHeight;

    debugLog(`📏 Page ${pageNum} CSS display size: ${pageWidth}x${pageHeight}`);

    pageFields.forEach(field => {
        const fieldId = field.id || field.fieldId;
        if (!fieldId) return;

        debugLog(`🔄 Processing field: ${fieldId}`);

        // Remove existing field if any
        const existingField = overlay.querySelector(`[data-field-id="${fieldId}"]`);
        if (existingField) existingField.remove();

        const editor = document.createElement('div');
        editor.className = `field-editor ${field.type}`;
        editor.dataset.fieldId = fieldId;
        editor.dataset.fieldType = field.type;

        let x, y, w, h;

        // ===== NEW ARCHITECTURE: Fixed positioning at RENDER_SCALE =====
        // Overlays are positioned ONCE and never change - zoom is handled by CSS transform
        // Use canvas CSS size (which is viewport / devicePixelRatio)
        const canvasCssWidth = canvas.clientWidth;
        const canvasCssHeight = canvas.clientHeight;

        // Get base viewport (scale 1.0) for PDF coordinate conversion
        const baseViewport = window._baseViewports?.[pageNum] || canvas._baseViewport;
        if (!baseViewport) {
            console.error(`❌ Field ${fieldId}: Missing baseViewport`);
            return;
        }

        const basePdfWidth = baseViewport.width;
        const basePdfHeight = baseViewport.height;

        // Scale factor: PDF points → Canvas CSS pixels
        const scaleX = canvasCssWidth / basePdfWidth;
        const scaleY = canvasCssHeight / basePdfHeight;

        // V2 coordinates (pdfX, pdfY, pdfWidth, pdfHeight) - absolute PDF points
        if (field.pdfX !== undefined && field.pdfY !== undefined && field.pdfWidth !== undefined && field.pdfHeight !== undefined) {
            // PDF Y is from bottom, CSS Y is from top
            x = field.pdfX * scaleX;
            y = (basePdfHeight - field.pdfY - field.pdfHeight) * scaleY;
            w = field.pdfWidth * scaleX;
            h = field.pdfHeight * scaleY;

            console.log(`✅ V2 positioning: ${fieldId}, PDF(${field.pdfX.toFixed(1)}, ${field.pdfY.toFixed(1)}) → CSS(${x.toFixed(1)}, ${y.toFixed(1)}, ${w.toFixed(1)}, ${h.toFixed(1)})`);
        }
        // V1 anchor (checkbox/radio/circle) - normalized 0-1 values
        else if ((field.type === 'checkbox' || field.type === 'radio' || field.type === 'circle') && field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
            const [anchorX, anchorY] = field.anchor;

            // anchor is stored as [xPercent, yPercentFromBottom]
            const centerX = anchorX * canvasCssWidth;
            const centerY = (1 - anchorY) * canvasCssHeight;

            // Fixed size for checkbox/radio at RENDER_SCALE
            // Handle unit conversion: if overlayWidth <= 1, it's percentage (from normalizeField), convert to pixels
            const defaultW = field.type === 'checkbox' ? CHECKBOX_SIZE : (field.type === 'circle' ? CIRCLE_SIZE : RADIO_SIZE);
            const defaultH = field.type === 'checkbox' ? CHECKBOX_SIZE : (field.type === 'circle' ? CIRCLE_SIZE : RADIO_SIZE);

            if (field.overlayWidth && field.overlayWidth <= 1) {
                // Percentage value - convert to pixels
                w = field.overlayWidth * canvasCssWidth;
                h = field.overlayHeight ? field.overlayHeight * canvasCssHeight : w;
            } else {
                // Already pixels or not set - use as-is or default
                w = field.overlayWidth || defaultW;
                h = field.overlayHeight || defaultH;
            }

            x = Math.round(centerX - w / 2);
            y = Math.round(centerY - h / 2);

            console.log(`📍 V1 Checkbox/Radio: ${fieldId}, anchor=(${anchorX.toFixed(3)}, ${anchorY.toFixed(3)}) → CSS(${x}, ${y}, ${w}x${h})`);
        }
        // V1 bbox (regular fields) - normalized 0-1 or absolute PDF points
        else if (field.bbox && Array.isArray(field.bbox) && field.bbox.length === 4) {
            let [bboxX, bboxY, bboxW, bboxH] = field.bbox;

            // Check if normalized (0-1) or absolute PDF points
            if (bboxX <= 1 && bboxY <= 1 && bboxW <= 1 && bboxH <= 1) {
                // Normalized coordinates
                x = bboxX * canvasCssWidth;
                y = (1 - bboxY - bboxH) * canvasCssHeight;
                w = bboxW * canvasCssWidth;
                h = bboxH * canvasCssHeight;
            } else {
                // Absolute PDF points
                x = bboxX * scaleX;
                y = (basePdfHeight - bboxY - bboxH) * scaleY;
                w = bboxW * scaleX;
                h = bboxH * scaleY;
            }

            console.log(`📍 V1 bbox: ${fieldId}, bbox=[${field.bbox.map(v => v.toFixed(3)).join(',')}] → CSS(${x.toFixed(1)}, ${y.toFixed(1)}, ${w.toFixed(1)}, ${h.toFixed(1)})`);
        }
        else {
            console.error(`❌ Field ${fieldId}: Missing coordinates (no V2 pdfX/pdfY/pdfWidth/pdfHeight, and no V1 anchor/bbox)`);
            debugLog(`❌ Field ${fieldId}: Missing coordinates`, 'error');
            return;
        }

        editor.style.left = x + "px";
        editor.style.top = y + "px";
        editor.style.width = w + "px";
        editor.style.height = h + "px";

        // Debug log (different for anchor vs bbox)
        if (field.anchor) {
            console.log(`📐 Overlay debug → id=${fieldId}, page=${pageNum}, `
              + `anchor=${JSON.stringify(field.anchor)}, `
              + `x=${x.toFixed(2)}, y=${y.toFixed(2)}, w=${w.toFixed(2)}, h=${h.toFixed(2)}, `
              + `canvasCSS=${canvas.clientWidth}x${canvas.clientHeight}`);
        } else {
            console.log(`📐 Overlay debug → id=${fieldId}, page=${pageNum}, `
              + `bbox=${JSON.stringify(field.bbox)}, `
              + `x=${x.toFixed(2)}, y=${y.toFixed(2)}, w=${w.toFixed(2)}, h=${h.toFixed(2)}, `
              + `canvasCSS=${canvas.clientWidth}x${canvas.clientHeight}`);
        }

        debugLog(
            `📐 Overlay debug → id=${fieldId}, page=${pageNum}, `
            + `x=${x.toFixed(2)}, y=${y.toFixed(2)}, w=${w.toFixed(2)}, h=${h.toFixed(2)}, `
            + `canvasCSS=${canvas.clientWidth}x${canvas.clientHeight}`
        );

        if (['text','number','date','id_number','phone','email'].includes(field.type)) {
            // All text-like fields use hidden input for direct typing (like QuickFill)
            const currentValue = liveFillData[fieldId]?.value || '';
            const fieldStyle = liveFillData[fieldId]?.style || {};

            // Calculate field dimensions in PDF points for Export-matching render
            let fieldPt;
            if (field.pdfWidth !== undefined && field.pdfHeight !== undefined) {
                // V2: already in PDF points
                fieldPt = { width: field.pdfWidth, height: field.pdfHeight };
            } else if (field.bbox) {
                // V1: convert from normalized bbox
                fieldPt = getFieldPtFromBbox(field.bbox, basePdfWidth, basePdfHeight);
            } else {
                fieldPt = { width: 100, height: 20 };
            }

            // Scale factor: pt → px (use average for consistency)
            const ptToPxScale = (scaleX + scaleY) / 2;

            // Render using Export-matching renderer (pass field for structured segment caching)
            renderPreviewText(editor, currentValue, fieldPt, ptToPxScale, fieldStyle, field);

            // Store render info for input callback
            editor.dataset.fieldPt = JSON.stringify(fieldPt);
            editor.dataset.ptToPxScale = ptToPxScale;

            {
                // Use hidden input + rendered output for Export-matching display
                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'text';
                hiddenInput.value = currentValue;
                hiddenInput.className = 'livefill-hidden-input';
                hiddenInput.style.cssText = `
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    opacity: 0;
                    cursor: text;
                    direction: rtl;
                    font-size: 16px;
                `;

                hiddenInput.addEventListener('input', (e) => {
                    const newValue = e.target.value;
                    // Update data
                    if (!liveFillData[fieldId]) {
                        liveFillData[fieldId] = { value: '', style: getDefaultStyle() };
                    }
                    liveFillData[fieldId].value = newValue;

                    // Re-render with Export-matching renderer (pass field for structured segment caching)
                    const fp = JSON.parse(editor.dataset.fieldPt || '{"width":100,"height":20}');
                    const sc = parseFloat(editor.dataset.ptToPxScale || '1');
                    renderPreviewText(editor, newValue, fp, sc, liveFillData[fieldId]?.style || {}, field);

                    // Re-add hidden input (renderPreviewText clears innerHTML)
                    editor.appendChild(hiddenInput);
                    hiddenInput.focus();

                    triggerAutoSave();
                });

                editor.addEventListener('click', () => {
                    selectField(fieldId);
                    hiddenInput.focus();
                });

                editor.appendChild(hiddenInput);
            }
            overlay.appendChild(editor);
        }
        else if (field.type === 'digitBoxes') {
            // Digit boxes: use popover for input
            editor.classList.add('digit-boxes-editor');
            const value = (liveFillData[fieldId]?.value || '').toString();
            const fieldStyle = liveFillData[fieldId]?.style || {};

            // Calculate field dimensions in PDF points
            let fieldPt;
            if (field.pdfWidth !== undefined && field.pdfHeight !== undefined) {
                fieldPt = { width: field.pdfWidth, height: field.pdfHeight };
            } else if (field.bbox) {
                fieldPt = getFieldPtFromBbox(field.bbox, basePdfWidth, basePdfHeight);
            } else {
                fieldPt = { width: 100, height: 20 };
            }

            const ptToPxScale = (scaleX + scaleY) / 2;

            // Render using Export-matching renderer (pass field for structured segment caching)
            renderPreviewText(editor, value, fieldPt, ptToPxScale, fieldStyle, field);

            // Store render info for popover callback
            editor.dataset.fieldPt = JSON.stringify(fieldPt);
            editor.dataset.ptToPxScale = ptToPxScale;

            editor.style.cursor = 'pointer';
            if (window.FieldInputPopover) {
                editor.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectField(fieldId);
                    openFieldPopover(editor, field, fieldId);
                });
            } else {
                editor.contentEditable = true;
                editor.addEventListener('input', handleFieldInput);
                editor.addEventListener('click', () => selectField(fieldId));
            }
            overlay.appendChild(editor);
        }
        // ===== SIGNATURE FIELD =====
        else if (field.type === 'signature') {
            console.log(`✍️ Creating signature field: ${fieldId}`);
            editor.classList.add('signature-editor');

            // Get current signature data if any
            const sigData = liveFillData[fieldId];

            // Render existing signature or placeholder
            // Check both 'mode' and 'signatureMode' for compatibility
            const sigMode = sigData?.mode || sigData?.signatureMode;
            const sigValue = sigData?.signatureData || sigData?.value;
            if (sigValue && sigMode) {
                if (sigMode === 'draw') {
                    const img = document.createElement('img');
                    img.src = sigValue;
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
                    editor.appendChild(img);
                } else {
                    // Typed signature
                    const textEl = document.createElement('div');
                    textEl.className = `signature-text signature-font-${sigData?.signatureFont || 'cursive1'}`;
                    textEl.textContent = sigValue;
                    textEl.style.cssText = `
                        width: 100%;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: ${Math.min(h * 0.6, 24)}px;
                        color: #000;
                    `;
                    editor.appendChild(textEl);
                }
            } else {
                // Show placeholder
                editor.innerHTML = '<span class="signature-placeholder">לחץ להוספת חתימה</span>';
            }

            editor.style.cursor = 'pointer';
            editor.addEventListener('click', (e) => {
                console.log(`✍️ Signature field clicked: ${fieldId}`);
                e.stopPropagation();
                selectField(fieldId);
                openSignatureModal(fieldId, editor, w, h);
            });
            console.log(`✍️ Signature field click handler attached: ${fieldId}`);

            overlay.appendChild(editor);
        }
        // NOTE: Tables are handled separately by createTableOverlaysForPage()
        // Do NOT draw tables here - single source of truth
        else if (field.type === 'checkbox') {
            editor.classList.add('checkbox-editor');

            // Add reliable click event listener
            editor.addEventListener('click', (e) => {
                e.stopPropagation();

                const fieldId = field.id || field.fieldId;
                if (!fieldId) {
                    console.error("❌ Checkbox clicked but has no fieldId");
                    return;
                }

                // Toggle local state
                const current = liveFillData[fieldId]?.checked === true;
                const newValue = !current;

                liveFillData[fieldId] = { checked: newValue };
                triggerAutoSave(); // Auto-save on change

                console.log(`🟩 Checkbox toggled: ${fieldId} → ${newValue}`);

                // Update UI
                editor.classList.toggle("checked", newValue);
            });

            // Initialize checked state from liveFillData
            if (liveFillData[fieldId]?.checked === true) {
                editor.classList.add('checked');
            }

            overlay.appendChild(editor);
        }
        else if (field.type === 'radio') {
            editor.addEventListener('click', () => toggleRadio(fieldId));
            // Show filled circle ● when checked (matches Export engine drawCircle)
            const isChecked = liveFillData[fieldId]?.checked === true;
            editor.textContent = isChecked ? '●' : '';
            if (isChecked) {
                editor.classList.add('checked');
            }
            overlay.appendChild(editor);
        }
        else if (field.type === 'circle') {
            editor.classList.add('circle-editor');

            // Add click event listener to toggle circle
            editor.addEventListener('click', (e) => {
                e.stopPropagation();

                const fieldId = field.id || field.fieldId;
                if (!fieldId) {
                    console.error("❌ Circle clicked but has no fieldId");
                    return;
                }

                // Toggle local state
                const current = liveFillData[fieldId]?.checked === true;
                const newValue = !current;

                liveFillData[fieldId] = { checked: newValue };
                triggerAutoSave();

                console.log(`⭕ Circle toggled: ${fieldId} → ${newValue}`);

                // Update UI
                editor.classList.toggle("circled", newValue);
            });

            // Initialize circled state from liveFillData
            if (liveFillData[fieldId]?.checked === true) {
                editor.classList.add('circled');
            }

            overlay.appendChild(editor);
        }
    });
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  🔒 LOCKED SECTION - Preview Text Renderer Integration                     ║
// ║  STATUS: WORKING & TESTED (2026-01-08)                                     ║
// ║                                                                            ║
// ║  This function delegates to PreviewTextRenderer module.                    ║
// ║  DO NOT modify this function or the PreviewTextRenderer module.            ║
// ║  Any changes may break the visual match between Preview and Export.        ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║                    🔒 LOCKED FUNCTION - DO NOT MODIFY 🔒                    ║
 * ╠════════════════════════════════════════════════════════════════════════════╣
 * ║  renderPreviewText - Export-matching text rendering for LiveFill           ║
 * ║                                                                            ║
 * ║  STATUS: WORKING & TESTED (2026-01-20)                                     ║
 * ║  INCLUDES: ScaffoldAvoidance structured placement for dates with slashes   ║
 * ║                                                                            ║
 * ║  CRITICAL: Caches structuredSegments on field object for export            ║
 * ║  CRITICAL: Uses same positioning as PreviewTextRenderer (bottom: 0 +       ║
 * ║            translateY(15%) + line-height: 0.8)                             ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * @param {HTMLElement} container - The field overlay element (positioned, sized)
 * @param {string} value - The text value to display
 * @param {Object} fieldPt - Field dimensions in PDF points {width, height}
 * @param {number} scale - Scale factor: pt → px (from viewport)
 * @param {Object} style - Style from liveFillData {fontSize, color, alignment}
 * @param {Object} field - Optional field object to cache structuredSegments for export
 */
function renderPreviewText(container, value, fieldPt, scale, style = {}, field = null) {
    if (!window.PreviewTextRenderer) {
        console.error('[renderPreviewText] PreviewTextRenderer not loaded');
        container.textContent = value || '';
        return;
    }

    // ══════════════════════════════════════════════════════════════════
    // STRUCTURED PLACEMENT (V2.1) - Try segment-based rendering first
    // For date fields with printed separators: DD / MM / YYYY
    // Same logic as QuickFillOverlay for visual consistency
    // ══════════════════════════════════════════════════════════════════
    if (window.FEATURES?.SCAFFOLD_AVOIDANCE && window.ScaffoldAvoidance?.computeStructuredPlacement) {
        try {
            // Get screen rect from container's pixel position
            // The container is positioned inside .fields-overlay which overlaps the canvas
            const screenRect = {
                x: container.offsetLeft,
                y: container.offsetTop,
                width: container.offsetWidth,
                height: container.offsetHeight
            };

            if (screenRect.width > 0 && screenRect.height > 0) {
                const fontSize = fieldPt.height * 0.65 * scale;

                console.log('[LiveFill] Checking structured placement:', {
                    text: value,
                    screenRect: screenRect,
                    fontSize: fontSize
                });

                // Find the correct canvas for this field's page
                // The container is inside fields-overlay -> page-wrapper -> contains page-canvas
                const pageWrapper = container.closest('.page-wrapper');
                const pageCanvas = pageWrapper?.querySelector('.page-canvas');

                // Temporarily store the canvas reference for ScaffoldAvoidance to use
                // This ensures multi-page PDFs use the correct page's canvas
                if (pageCanvas) {
                    window.__LIVEFILL_CURRENT_CANVAS__ = pageCanvas;
                }

                const structured = window.ScaffoldAvoidance.computeStructuredPlacement({
                    screenRect: screenRect,
                    fontSize: fontSize,
                    text: value
                });

                // Clear temporary reference
                window.__LIVEFILL_CURRENT_CANVAS__ = null;

                console.log('[LiveFill] Structured result: mode=' + structured.mode +
                    ', reason=' + structured.reason +
                    ', segments=' + (structured.segments ? structured.segments.length : 0));

                if (structured.mode === 'structured' && structured.segments) {
                    // Cache segments on field object for export (same as QuickFill)
                    if (field) {
                        field.structuredSegments = structured.segments;
                        field.screenRect = screenRect;
                        field.isQuickFill = true;  // Enable structured export path
                        console.log('[LiveFill] Cached structuredSegments on field for export');
                    }

                    // Add CSS class for overflow:visible
                    container.classList.add('structured-placement');

                    console.log('[LiveFill] Rendering structured segments:', structured.segments);

                    // Render structured segments
                    _renderStructuredSegmentsLiveFill(container, structured.segments, fontSize, fieldPt.height * scale, screenRect.width);
                    return;
                }
            }
        } catch (err) {
            console.error('[renderPreviewText] ERROR in structured placement:', err);
        }
    }

    // Remove structured class if fallback
    container.classList.remove('structured-placement');

    // Clear any previously cached structured data (to prevent stale export)
    if (field) {
        field.structuredSegments = null;
        field.screenRect = null;
        field.isQuickFill = false;
    }

    // 🔒 Use the Export-matching renderer - DO NOT MODIFY
    window.PreviewTextRenderer.render(container, value, {
        fieldPt,
        scale,
        style
    });
}

/**
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║              🔒 LOCKED FUNCTION - DO NOT MODIFY 🔒                          ║
 * ╠════════════════════════════════════════════════════════════════════════════╣
 * ║  _renderStructuredSegmentsLiveFill - Renders date segments (DD/MM/YYYY)    ║
 * ║                                                                            ║
 * ║  STATUS: WORKING & TESTED (2026-01-20)                                     ║
 * ║  MUST MATCH: QuickFillOverlay._renderStructuredSegments                    ║
 * ║  MUST MATCH: export-engine.js structured placement output                  ║
 * ║                                                                            ║
 * ║  CRITICAL POSITIONING (same as PreviewTextRenderer):                       ║
 * ║  • bottom: 0 (anchor to container bottom)                                  ║
 * ║  • transform: translateY(15%) (push down for baseline alignment)           ║
 * ║  • line-height: 0.8 (reduce text box height)                               ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * @param {HTMLElement} container - Field element
 * @param {Array} segments - Array of { text, x, width }
 * @param {number} fontSize - Font size in pixels
 * @param {number} containerHeight - Container height in pixels
 * @param {number} bboxWidth - Original bbox width
 */
function _renderStructuredSegmentsLiveFill(container, segments, fontSize, containerHeight, bboxWidth) {
    // Clear container but keep reference to hidden input
    const hiddenInput = container.querySelector('.livefill-hidden-input');
    container.innerHTML = '';

    // Use bboxWidth for percentage calculations
    const refWidth = bboxWidth || container.offsetWidth;

    // Create each segment span positioned relative to container
    // Use same positioning formula as PreviewTextRenderer for consistency
    for (const segment of segments) {
        const span = document.createElement('span');
        span.textContent = segment.text;
        // Use bottom: 0 + translateY(15%) like PreviewTextRenderer
        // This anchors text to bottom with small gap (same as export-engine)
        span.style.cssText = `
            position: absolute;
            left: ${segment.x}px;
            bottom: 0;
            transform: translateY(15%);
            font-size: ${fontSize}px;
            font-family: 'David Libre', 'David', 'Arial Hebrew', serif;
            line-height: 0.8;
            white-space: nowrap;
            pointer-events: none;
            color: black;
        `;
        container.appendChild(span);
    }

    // Re-add hidden input if it existed
    if (hiddenInput) {
        container.appendChild(hiddenInput);
    }
}

/**
 * Calculate field dimensions in PDF points from bbox and PDF page size
 * @param {Array} bbox - [x, y, width, height] normalized 0-1
 * @param {number} pdfWidth - PDF page width in points
 * @param {number} pdfHeight - PDF page height in points
 * @returns {Object} {width, height} in PDF points
 */
function getFieldPtFromBbox(bbox, pdfWidth, pdfHeight) {
    if (!bbox || bbox.length < 4) return { width: 100, height: 20 };

    const [x, y, w, h] = bbox;

    // Detect normalized vs absolute
    const isNormalized = x <= 1 && y <= 1 && w <= 1 && h <= 1;

    if (isNormalized) {
        return {
            width: w * pdfWidth,
            height: h * pdfHeight
        };
    } else {
        return {
            width: w,
            height: h
        };
    }
}

/**
 * Get scale factor from PDF points to CSS pixels
 * @param {number} pdfWidth - PDF page width in points
 * @param {number} canvasCssWidth - Canvas CSS width in pixels
 * @returns {number} Scale factor
 */
function getPtToPixelScale(pdfWidth, canvasCssWidth) {
    return canvasCssWidth / pdfWidth;
}

/**
 * Creates interactive HTML overlays for table cells on a specific page
 *
 * CRITICAL: Uses UnifiedCoordinateSystem.bboxToOverlay() for all coordinate translation.
 * No manual math (pageDisplayWidth/Height multiplication) is allowed here.
 *
 * Data lives in PDF space → Rendering lives through UCS → No math in between.
 */
function createTableOverlaysForPage(pageNum, pageTables) {
    // ===== SIMPLE RULE: Preview draws bbox. Nothing else. =====
    // - No "table" logic
    // - No rowCount, no sampleRowBBox, no tableBBox
    // - Each cell has a bbox in the JSON → draw it
    // - Same Y formula as Export

    if (!pageTables || pageTables.length === 0) return;
    if (!liveFillData.tables || Object.keys(liveFillData.tables).length === 0) return;

    debugLog(`📊 createTableOverlaysForPage: ${pageTables.length} tables for page ${pageNum}`);

    const overlay = document.querySelector(`.fields-overlay[data-page-num="${pageNum}"]`);
    if (!overlay) {
        debugLog(`❌ No overlay found for page ${pageNum}`, 'error');
        return;
    }

    // Get the canvas - this is what the PDF is actually drawn on
    const canvas = overlay.previousElementSibling;
    if (!canvas || canvas.tagName !== 'CANVAS') {
        debugLog(`❌ No canvas found for page ${pageNum}`, 'error');
        return;
    }

    // ===== Use OVERLAY dimensions for positioning =====
    // Elements are added to overlay, so use overlay's coordinate system
    const overlayRect = overlay.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    // Use overlay dimensions (where elements are placed)
    const pageWidth = overlayRect.width;
    const pageHeight = overlayRect.height;

    // Get PDF dimensions for Export-matching text rendering
    const baseViewport = window._baseViewports?.[pageNum];
    const basePdfWidth = baseViewport?.width || 595.28;  // A4 default
    const basePdfHeight = baseViewport?.height || 841.89;
    const ptToPxScale = pageWidth / basePdfWidth;

    // Debug: check if overlay matches canvas
    console.log(`[Table Debug] Page ${pageNum}:`, {
        overlayW: overlayRect.width.toFixed(1),
        overlayH: overlayRect.height.toFixed(1),
        canvasW: canvasRect.width.toFixed(1),
        canvasH: canvasRect.height.toFixed(1),
        match: Math.abs(overlayRect.height - canvasRect.height) < 1 ? '✓' : '✗ MISMATCH!'
    });

    pageTables.forEach(table => {
        const tableId = table.tableId || table.id;
        if (!tableId || !liveFillData.tables[tableId]) return;

        const columns = table.columns || [];
        const rows = table.rows || [];

        if (rows.length === 0) {
            debugLog(`⚠️ Table ${tableId} has no rows`, 'warning');
            return;
        }

        debugLog(`📊 Drawing table ${tableId}: ${rows.length} rows (dumb renderer - bbox from JSON)`);

        // ===== DUMB RENDERER: Just draw bbox from JSON, no calculations =====
        rows.forEach((row, rowIndex) => {
            columns.forEach(col => {
                const colId = col.columnId || col.englishId;
                const cellBBox = row[colId]; // Get EXACT bbox from JSON

                if (!cellBBox) return;

                // Direct conversion: normalized (0-1) → screen pixels
                const screenX = cellBBox.x * pageWidth;
                const screenY = cellBBox.y * pageHeight;
                const screenW = cellBBox.width * pageWidth;
                const screenH = cellBBox.height * pageHeight;

                const cellEditor = document.createElement('div');
                cellEditor.className = `table-cell-editor ${col.type || 'text'}`;
                cellEditor.dataset.tableId = tableId;
                cellEditor.dataset.rowIndex = rowIndex;
                cellEditor.dataset.colId = col.englishId || colId;

                // Apply position directly from bbox
                cellEditor.style.position = 'absolute';
                cellEditor.style.left = screenX + 'px';
                cellEditor.style.top = screenY + 'px';
                cellEditor.style.width = screenW + 'px';
                cellEditor.style.height = screenH + 'px';

                const currentValue = liveFillData.tables[tableId][rowIndex]?.[col.englishId || colId];

                if (col.type === 'checkbox') {
                    // Checkbox - simple centered
                    cellEditor.classList.add('checkbox-editor');
                    if (currentValue === true) {
                        cellEditor.classList.add('checked');
                    }
                    cellEditor.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const current = liveFillData.tables[tableId][rowIndex][col.englishId || colId] === true;
                        liveFillData.tables[tableId][rowIndex][col.englishId || colId] = !current;
                        cellEditor.classList.toggle('checked', !current);
                        triggerAutoSave();
                    });
                } else {
                    // Text/Number - use Export-matching renderer with hidden input (like regular fields)
                    // Calculate cell dimensions in PDF points
                    const cellPt = {
                        width: cellBBox.width * basePdfWidth,
                        height: cellBBox.height * basePdfHeight
                    };

                    // Render using Export-matching renderer
                    renderPreviewText(cellEditor, currentValue, cellPt, ptToPxScale, {});

                    // Store render info for input callback
                    cellEditor.dataset.fieldPt = JSON.stringify(cellPt);
                    cellEditor.dataset.ptToPxScale = ptToPxScale;

                    // Use hidden input + rendered output (same as regular fields)
                    const hiddenInput = document.createElement('input');
                    hiddenInput.type = 'text';
                    hiddenInput.value = currentValue || '';
                    hiddenInput.className = 'livefill-hidden-input';
                    hiddenInput.style.cssText = `
                        position: absolute;
                        top: 0; left: 0;
                        width: 100%; height: 100%;
                        opacity: 0;
                        cursor: text;
                        direction: rtl;
                        font-size: 16px;
                    `;

                    hiddenInput.addEventListener('input', (e) => {
                        const newValue = e.target.value;
                        liveFillData.tables[tableId][rowIndex][col.englishId || colId] = newValue;

                        // Re-render with Export-matching renderer
                        const fp = JSON.parse(cellEditor.dataset.fieldPt || '{"width":100,"height":20}');
                        const sc = parseFloat(cellEditor.dataset.ptToPxScale || '1');
                        renderPreviewText(cellEditor, newValue, fp, sc, {});

                        // Re-add hidden input
                        cellEditor.appendChild(hiddenInput);
                        hiddenInput.focus();

                        triggerAutoSave();
                    });

                    cellEditor.addEventListener('click', () => hiddenInput.focus());
                    cellEditor.appendChild(hiddenInput);
                }

                overlay.appendChild(cellEditor);
            });
        });

        debugLog(`✅ Table ${tableId}: drew ${rows.length} rows`);
    });
}

// ⚡ Debounced wrapper for field input handling
/**
 * Handles user input in field editors (text, checkbox, radio)
 * Updates liveFillData and saves undo state
 * @param {Event} event - Input event from field editor
 */
function handleFieldInput(event) {
    debouncedHandleFieldInput(event);
}

// Internal immediate version
function _handleFieldInputImmediate(event) {
    const fieldId = event.target.dataset.fieldId;
    saveUndoState();

    if (!liveFillData[fieldId]) {
        liveFillData[fieldId] = { value: '', style: getDefaultStyle() };
    }

    liveFillData[fieldId].value = event.target.textContent;
    triggerAutoSave(); // Auto-save on text change
}

/**
 * Handles input in table cell editors
 * Updates liveFillData.rows array for table fields
 */
function handleTableCellInput(event) {
    const cellEditor = event.target;
    const tableId = cellEditor.dataset.tableId;
    const rowIndex = parseInt(cellEditor.dataset.rowIndex);
    const colKey = cellEditor.dataset.colKey;

    saveUndoState();

    // Initialize table data structure if needed
    if (!liveFillData[tableId]) {
        liveFillData[tableId] = { rows: [] };
    }
    if (!Array.isArray(liveFillData[tableId].rows)) {
        liveFillData[tableId].rows = [];
    }

    // Ensure row exists
    if (!liveFillData[tableId].rows[rowIndex]) {
        liveFillData[tableId].rows[rowIndex] = {};
    }

    // Update cell value
    liveFillData[tableId].rows[rowIndex][colKey] = cellEditor.textContent;
    triggerAutoSave(); // Auto-save on change

    console.log(`📊 Table cell updated: ${tableId}[${rowIndex}][${colKey}] = "${cellEditor.textContent}"`);
}

/**
 * Handles checkbox clicks in table cells
 */
function handleTableCheckboxClick(event) {
    const cellEditor = event.target;
    const tableId = cellEditor.dataset.tableId;
    const rowIndex = parseInt(cellEditor.dataset.rowIndex);
    const colKey = cellEditor.dataset.colKey;

    saveUndoState();

    // Initialize table data structure if needed
    if (!liveFillData[tableId]) {
        liveFillData[tableId] = { rows: [] };
    }
    if (!Array.isArray(liveFillData[tableId].rows)) {
        liveFillData[tableId].rows = [];
    }

    // Ensure row exists
    if (!liveFillData[tableId].rows[rowIndex]) {
        liveFillData[tableId].rows[rowIndex] = {};
    }

    // Toggle checkbox
    const current = liveFillData[tableId].rows[rowIndex][colKey] === true;
    liveFillData[tableId].rows[rowIndex][colKey] = !current;
    triggerAutoSave(); // Auto-save on change

    // Update UI
    cellEditor.classList.toggle('checked', !current);

    console.log(`📊 Table checkbox toggled: ${tableId}[${rowIndex}][${colKey}] = ${!current}`);
}

function toggleCheckbox(fieldId) {
    saveUndoState();

    // Initialize if doesn't exist
    if (!liveFillData[fieldId]) {
        liveFillData[fieldId] = { checked: false };
    }

    // Toggle the checked state
    liveFillData[fieldId].checked = !liveFillData[fieldId].checked;

    // Log to verify data is being written
    console.log(`✓ Checkbox ${fieldId} toggled to: ${liveFillData[fieldId].checked}`);

    // Update UI to show checkmark
    const editor = document.querySelector(`[data-field-id="${fieldId}"]`);
    if (editor) {
        editor.textContent = liveFillData[fieldId].checked ? '✓' : '';
    }

    // Verify data persists in global object
    console.log(`✓ liveFillData[${fieldId}]:`, liveFillData[fieldId]);
}

function toggleRadio(fieldId) {
    saveUndoState();
    if (!liveFillData[fieldId]) liveFillData[fieldId] = { checked: false };
    liveFillData[fieldId].checked = !liveFillData[fieldId].checked;
    triggerAutoSave(); // Auto-save on change

    const editor = document.querySelector(`[data-field-id="${fieldId}"]`);
    // Show filled circle ● when checked (matches Export engine drawCircle)
    editor.textContent = liveFillData[fieldId].checked ? '●' : '';
    // Add checked class for styling
    editor.classList.toggle('checked', liveFillData[fieldId].checked);
}

function selectField(fieldId) {
    document.querySelectorAll('.field-editor').forEach(el => el.classList.remove('selected'));

    const editor = document.querySelector(`[data-field-id="${fieldId}"]`);
    if (!editor) return;

    editor.classList.add('selected');
    selectedFieldId = fieldId;

    document.getElementById('field-controls').style.display = 'block';
    document.getElementById('no-field-selected').style.display = 'none';

    if (liveFillData[fieldId]?.style) {
        const style = liveFillData[fieldId].style;
        document.getElementById('font-family').value = style.fontFamily || 'David Libre';
        document.getElementById('font-size').value = style.fontSize || 14;
        document.getElementById('font-size-number').value = style.fontSize || 14;
        document.getElementById('font-color').value = style.color || '#000000';
        document.getElementById('letter-spacing').value = style.letterSpacing || 0;
        document.getElementById('letter-spacing-number').value = style.letterSpacing || 0;
        document.getElementById('word-spacing').value = style.wordSpacing || 0;
        document.getElementById('word-spacing-number').value = style.wordSpacing || 0;
        document.getElementById('opacity').value = (style.opacity || 1) * 100;
        document.getElementById('opacity-value').textContent = ((style.opacity || 1) * 100) + '%';

        document.querySelectorAll('.alignment-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.align === (style.alignment || 'right')) {
                btn.classList.add('active');
            }
        });
    }
}

function deselectField() {
    document.querySelectorAll('.field-editor').forEach(el => el.classList.remove('selected'));
    selectedFieldId = null;
    document.getElementById('field-controls').style.display = 'none';
    document.getElementById('no-field-selected').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE MODAL (ported from QuickFill)
// ═══════════════════════════════════════════════════════════════════════════

let _signatureFieldId = null;
let _signatureEditorEl = null;
let _clearSignatureCanvas = null;
let _getSignatureCanvasData = null;

/**
 * Open signature modal for a field
 * @param {string} fieldId - The field ID
 * @param {HTMLElement} editorEl - The editor element (for updating)
 * @param {number} fieldWidth - Field width in px
 * @param {number} fieldHeight - Field height in px
 */
function openSignatureModal(fieldId, editorEl, fieldWidth, fieldHeight) {
    console.log(`✍️ openSignatureModal called for ${fieldId}`);
    _signatureFieldId = fieldId;
    _signatureEditorEl = editorEl;

    // Remove existing modal if any
    const existing = document.getElementById('signature-modal');
    if (existing) existing.remove();

    // Create modal with inline styles to ensure visibility
    const modal = document.createElement('div');
    modal.id = 'signature-modal';
    modal.className = 'signature-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
    `;
    modal.innerHTML = `
        <div class="signature-modal-content" style="background: white; border-radius: 12px; width: 450px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); direction: rtl; padding: 0;">
            <div class="signature-modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">הוספת חתימה</h3>
                <button class="signature-modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; padding: 4px; line-height: 1;">×</button>
            </div>
            <div class="signature-tabs" style="display: flex; border-bottom: 1px solid #e5e7eb;">
                <button class="signature-tab active" data-tab="draw" style="flex: 1; padding: 12px; border: none; background: white; cursor: pointer; font-size: 14px; font-weight: 600; color: #2563eb; border-bottom: 2px solid #2563eb;">✍️ ציור</button>
                <button class="signature-tab" data-tab="type" style="flex: 1; padding: 12px; border: none; background: #f9fafb; cursor: pointer; font-size: 14px;">⌨️ הקלדה</button>
            </div>
            <div class="signature-tab-content" style="padding: 20px;">
                <div class="signature-panel active" data-panel="draw" style="display: block;">
                    <canvas id="signature-canvas" width="400" height="150" style="width: 100%; height: 150px; border: 2px dashed #e5e7eb; border-radius: 8px; cursor: crosshair; touch-action: none;"></canvas>
                    <div class="signature-draw-actions" style="margin-top: 12px; text-align: center;">
                        <button class="signature-clear-btn" style="padding: 8px 16px; border: 1px solid #e5e7eb; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">🗑️ נקה</button>
                    </div>
                </div>
                <div class="signature-panel" data-panel="type" style="display: none;">
                    <input type="text" id="signature-text-input" placeholder="הקלד את שמך..." dir="rtl" style="width: 100%; padding: 12px; font-size: 16px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; box-sizing: border-box;">
                    <div class="signature-preview" id="signature-type-preview" style="height: 60px; display: flex; align-items: center; justify-content: center; font-size: 32px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; background: #f9fafb;"></div>
                    <div class="signature-font-options" style="display: flex; gap: 8px;">
                        <button class="signature-font-btn active" data-font="cursive1" style="flex: 1; padding: 8px; border: 1px solid #2563eb; background: rgba(37, 99, 235, 0.1); border-radius: 6px; cursor: pointer; font-size: 14px; color: #2563eb;">כתב יד 1</button>
                        <button class="signature-font-btn" data-font="cursive2" style="flex: 1; padding: 8px; border: 1px solid #e5e7eb; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">כתב יד 2</button>
                        <button class="signature-font-btn" data-font="cursive3" style="flex: 1; padding: 8px; border: 1px solid #e5e7eb; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">כתב יד 3</button>
                    </div>
                </div>
            </div>
            <div class="signature-modal-footer" style="display: flex; justify-content: flex-end; gap: 12px; padding: 16px 20px; border-top: 1px solid #e5e7eb;">
                <button class="signature-cancel-btn" style="padding: 10px 20px; border: 1px solid #e5e7eb; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">ביטול</button>
                <button class="signature-confirm-btn" style="padding: 10px 20px; border: none; background: #2563eb; color: white; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">הוסף חתימה</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    console.log(`✍️ Modal appended to body, modal visible:`, modal, getComputedStyle(modal).display, getComputedStyle(modal).visibility);

    // Initialize signature pad
    initSignaturePad();

    // Attach modal event handlers
    attachSignatureModalHandlers(modal);
    console.log(`✍️ Signature modal setup complete`);
}

/**
 * Initialize the signature drawing canvas
 */
function initSignaturePad() {
    const canvas = document.getElementById('signature-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // Set drawing style
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear canvas with white background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const startDrawing = (e) => {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();

        lastX = x;
        lastY = y;
    };

    const stopDrawing = () => {
        isDrawing = false;
    };

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        startDrawing({ clientX: touch.clientX, clientY: touch.clientY });
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        draw({ clientX: touch.clientX, clientY: touch.clientY });
    });
    canvas.addEventListener('touchend', stopDrawing);

    // Store reference to clear function
    _clearSignatureCanvas = () => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    // Store reference to get image data
    _getSignatureCanvasData = () => {
        return canvas.toDataURL('image/png');
    };
}

/**
 * Attach event handlers to signature modal
 */
function attachSignatureModalHandlers(modal) {
    // Helper to clear pending and close
    const cancelAndClose = () => {
        _signatureFieldId = null;
        _signatureEditorEl = null;
        modal.remove();
    };

    // Close button
    modal.querySelector('.signature-modal-close').addEventListener('click', cancelAndClose);

    // Cancel button
    modal.querySelector('.signature-cancel-btn').addEventListener('click', cancelAndClose);

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cancelAndClose();
    });

    // Tab switching
    modal.querySelectorAll('.signature-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            modal.querySelectorAll('.signature-tab').forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.signature-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            modal.querySelector(`[data-panel="${tabName}"]`).classList.add('active');
        });
    });

    // Clear canvas button
    modal.querySelector('.signature-clear-btn').addEventListener('click', () => {
        if (_clearSignatureCanvas) _clearSignatureCanvas();
    });

    // Text input for typed signature
    const textInput = modal.querySelector('#signature-text-input');
    const preview = modal.querySelector('#signature-type-preview');
    let selectedFont = 'cursive1';

    const updatePreview = () => {
        const text = textInput.value || 'חתימה';
        preview.textContent = text;
        preview.className = `signature-preview signature-font-${selectedFont}`;
    };

    textInput.addEventListener('input', updatePreview);
    updatePreview();

    // Font selection
    modal.querySelectorAll('.signature-font-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.signature-font-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedFont = btn.dataset.font;
            updatePreview();
        });
    });

    // Confirm button
    modal.querySelector('.signature-confirm-btn').addEventListener('click', () => {
        const activeTab = modal.querySelector('.signature-tab.active').dataset.tab;

        if (activeTab === 'draw') {
            // Get canvas data
            const imageData = _getSignatureCanvasData();
            applySignatureToField(imageData, 'draw');
        } else {
            // Get typed signature
            const text = textInput.value;
            if (!text) {
                alert('יש להקליד חתימה');
                return;
            }
            applySignatureToField(text, 'type', selectedFont);
        }

        modal.remove();
    });
}

/**
 * Apply signature data to the field
 * @param {string} data - Image data URL or text
 * @param {string} mode - 'draw' or 'type'
 * @param {string} font - Font name for typed signatures
 */
function applySignatureToField(data, mode, font = 'cursive1') {
    if (!_signatureFieldId || !_signatureEditorEl) return;

    const fieldId = _signatureFieldId;
    const editorEl = _signatureEditorEl;

    // Store signature data in liveFillData
    // Export engine expects: data.value (base64 for draw, text for type), data.mode
    if (!liveFillData[fieldId]) {
        liveFillData[fieldId] = { value: '', style: getDefaultStyle() };
    }
    // For export engine compatibility:
    // - value: the actual signature data (base64 URL for draw, text for type)
    // - mode: 'draw' or 'type'
    // - signatureFont: font name for typed signatures (for preview only)
    liveFillData[fieldId].value = data;
    liveFillData[fieldId].mode = mode;
    liveFillData[fieldId].signatureData = data;  // Keep for preview
    liveFillData[fieldId].signatureMode = mode;  // Keep for preview
    liveFillData[fieldId].signatureFont = font;

    // Update the editor element
    editorEl.innerHTML = '';

    if (mode === 'draw') {
        const img = document.createElement('img');
        img.src = data;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
        editorEl.appendChild(img);
    } else {
        const h = editorEl.clientHeight || 30;
        const textEl = document.createElement('div');
        textEl.className = `signature-text signature-font-${font}`;
        textEl.textContent = data;
        textEl.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${Math.min(h * 0.6, 24)}px;
            color: #000;
        `;
        editorEl.appendChild(textEl);
    }

    triggerAutoSave();
    console.log(`[LiveFill] Signature applied to field ${fieldId}, mode: ${mode}`);

    // Clear references
    _signatureFieldId = null;
    _signatureEditorEl = null;
}

// ⚡ Debounced wrapper for field style updates
function updateFieldStyle() {
    debouncedUpdateFieldStyle();
}

// Internal immediate version
function _updateFieldStyleImmediate() {
    if (!selectedFieldId) return;

    saveUndoState();

    const style = {
        fontFamily: document.getElementById('font-family').value,
        fontSize: parseInt(document.getElementById('font-size').value),
        color: document.getElementById('font-color').value,
        alignment: document.querySelector('.alignment-btn.active')?.dataset.align || 'right',
        letterSpacing: parseFloat(document.getElementById('letter-spacing').value),
        wordSpacing: parseFloat(document.getElementById('word-spacing').value),
        opacity: parseInt(document.getElementById('opacity').value) / 100
    };

    if (!liveFillData[selectedFieldId]) {
        liveFillData[selectedFieldId] = { value: '', style: {} };
    }

    liveFillData[selectedFieldId].style = style;
    triggerAutoSave(); // Auto-save on style change

    const editor = document.querySelector(`[data-field-id="${selectedFieldId}"]`);
    if (editor) applyStyleToElement(editor, style);
}

// applyStyleToElement moved to livefill-ui.js

function navigateToNextField(reverse = false) {
    if (!fieldsMapping?.fields || !selectedFieldId) return;

    const currentIndex = fieldsMapping.fields.findIndex(f => (f.id || f.fieldId) === selectedFieldId);
    if (currentIndex === -1) return;

    let nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0) nextIndex = fieldsMapping.fields.length - 1;
    if (nextIndex >= fieldsMapping.fields.length) nextIndex = 0;

    const nextField = fieldsMapping.fields[nextIndex];
    const nextFieldId = nextField.id || nextField.fieldId;
    const nextEditor = document.querySelector(`[data-field-id="${nextFieldId}"]`);

    if (nextEditor) {
        if (['text', 'signature', 'number', 'date'].includes(nextField.type)) {
            nextEditor.focus();
        } else {
            selectField(nextFieldId);
        }
    }
}

function saveUndoState() {
    undoStack.push(JSON.stringify(liveFillData));
    if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    redoStack = [];
}

function undoLastChange() {
    if (undoStack.length === 0) return;

    // ✅ Task B: Protected undo/redo JSON parsing
    try {
        redoStack.push(JSON.stringify(liveFillData));
        liveFillData = JSON.parse(undoStack.pop());
        window.liveFillData = liveFillData;  // Update window reference
        createFieldOverlays();
        showStatus('פעולה בוטלה', 'success');
    } catch (e) {
        console.error('Undo failed - corrupted state:', e);
        showStatus('שגיאה בביטול פעולה', 'error');
    }
}

function redoChange() {
    if (redoStack.length === 0) return;

    // ✅ Task B: Protected undo/redo JSON parsing
    try {
        undoStack.push(JSON.stringify(liveFillData));
        liveFillData = JSON.parse(redoStack.pop());
        window.liveFillData = liveFillData;  // Update window reference
        createFieldOverlays();
        showStatus('פעולה שוחזרה', 'success');
    } catch (e) {
        console.error('Redo failed - corrupted state:', e);
        showStatus('שגיאה בשחזור פעולה', 'error');
    }
}

function saveProgress() {
    if (!fieldsMapping && !Object.keys(liveFillData).length) {
        showStatus('אין נתונים לשמירה', 'error');
        ToastManager.warning('אין נתונים לשמירה');
        return;
    }

    localStorage.setItem('liveFillData', JSON.stringify(liveFillData));
    localStorage.setItem('liveFillFields', JSON.stringify(fieldsMapping));

    if (pdfBytesSafe) {
        localStorage.setItem('liveFillPDF', btoa(String.fromCharCode(...pdfBytesSafe)));
    }

    if (customFontBytes) {
        localStorage.setItem('liveFillFont', btoa(String.fromCharCode(...customFontBytes)));
        localStorage.setItem('liveFillFontName', customFontName);
    }

    showStatus('הטיוטה נשמרה', 'success');
    ToastManager.success('הטיוטה נשמרה בהצלחה');
}

async function loadProgress() {
    const savedData = localStorage.getItem('liveFillData');
    const savedFields = localStorage.getItem('liveFillFields');
    const savedPDF = localStorage.getItem('liveFillPDF');
    const savedFont = localStorage.getItem('liveFillFont');
    const savedFontName = localStorage.getItem('liveFillFontName');

    if (!savedData && !savedFields && !savedPDF) {
        showStatus('אין טיוטה שמורה', 'error');
        ToastManager.warning('אין טיוטה שמורה');
        return;
    }

    showLoading(true);

    try {
        cleanAllState();

        if (savedFont && savedFontName) {
            const binaryString = atob(savedFont);
            customFontBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                customFontBytes[i] = binaryString.charCodeAt(i);
            }
            customFontName = savedFontName;
            document.getElementById('font-status').style.display = 'inline-block';
            document.getElementById('font-status').textContent = `✓ ${customFontName}`;
        }

        if (savedPDF) {
            const binaryString = atob(savedPDF);
            pdfBytesSafe = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                pdfBytesSafe[i] = binaryString.charCodeAt(i);
            }

            const blob = new Blob([pdfBytesSafe], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const loadingTask = pdfjsLib.getDocument({
                url, cacheKey: `${Date.now()}_${Math.random()}`,
                disableAutoFetch: true, disableStream: true
            });

            pdfJsDoc = await loadingTask.promise;
            URL.revokeObjectURL(url);
            await renderAllPages();
        }

        // ✅ Task B: Protected localStorage JSON parsing
        if (savedFields) {
            try {
                fieldsMapping = JSON.parse(savedFields);
                window.fieldsMapping = fieldsMapping;  // Expose to window for Excel import
            } catch (e) {
                console.error('Failed to parse saved fields from localStorage:', e);
                localStorage.removeItem('liveFillFieldsMapping');
            }
        }

        if (savedData) {
            try {
                liveFillData = JSON.parse(savedData);
                window.liveFillData = liveFillData;  // Update window reference
            } catch (e) {
                console.error('Failed to parse saved data from localStorage:', e);
                localStorage.removeItem('liveFillData');
            }
        }

        if (pdfJsDoc && fieldsMapping) createFieldOverlays();
        checkExportEnabled();
        showStatus('הטיוטה נטענה בהצלחה', 'success');
        ToastManager.success('הטיוטה נטענה בהצלחה');

    } catch (err) {
        showStatus('שגיאה בטעינת הטיוטה', 'error');
        ToastManager.error('שגיאה בטעינת הטיוטה');
        cleanAllState();
    } finally {
        showLoading(false);
    }
}

// getDefaultStyle moved to livefill-core.js
// showLoading moved to livefill-ui.js
// showStatus moved to livefill-ui.js

function checkExportEnabled() {
    const exportBtn = document.getElementById('export-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');

    const pdfLoaded = !!pdfBytesSafe;
    const fieldsLoaded = !!(fieldsMapping && fieldsMapping.fields && fieldsMapping.fields.length > 0);
    const tablesLoaded = !!(fieldsMapping && fieldsMapping.tables && fieldsMapping.tables.length > 0);

    if (pdfLoaded && (fieldsLoaded || tablesLoaded)) {
        exportBtn.disabled = false;
        exportJsonBtn.disabled = false;
        debugLog(`🚀 Export enabled (fields: ${fieldsLoaded}, tables: ${tablesLoaded})`);
    } else {
        exportBtn.disabled = true;
        exportJsonBtn.disabled = true;
        debugLog(`⏸ Export disabled (pdf: ${pdfLoaded}, fields: ${fieldsLoaded}, tables: ${tablesLoaded})`);
    }
}
