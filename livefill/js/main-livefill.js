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
            lastSavedData = JSON.stringify(liveFillData);

            if (autoSaveData.fieldsMapping) {
                fieldsMapping = autoSaveData.fieldsMapping;
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
    liveFillData = {};
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
        document.querySelectorAll('.field-editor').forEach(el => el.remove());

        // ✅ FIX: Clear old liveFillData when loading new JSON mapping
        // This ensures fields start empty and don't retain values from previous sessions
        liveFillData = {};
        localStorage.removeItem('liveFillData');  // Also clear from localStorage
        debugLog('🧹 Cleared previous liveFillData (memory + localStorage)', 'info');

        const text = await file.text();

        // ✅ Task B: Protected JSON parsing with clear error messages
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (parseError) {
            throw new Error('הקובץ אינו JSON תקין - יש לבדוק את תקינות המבנה');
        }

        // --- FIX: Accept both formats (flat array OR { fields: [] }) ---
        let mappingData = parsed;

        if (Array.isArray(mappingData)) {
            // Mapping is directly an array (mapper output)
            mappingData = { fields: mappingData };
            debugLog('✅ JSON array wrapped into { fields: [...] } format');
        } else if (!Array.isArray(mappingData.fields)) {
            throw new Error("Invalid JSON format: missing fields array");
        }

        // Load pre-filled data if present
        if (mappingData.data) {
            liveFillData = mappingData.data;
            debugLog(`✅ Loaded pre-filled data for ${Object.keys(liveFillData).length} fields`);
        }

        parsed = mappingData;

        // ✅ Normalize all fields before loading
        parsed.fields = parsed.fields.map(field => {
            const normalized = normalizeField(field);
            if (!normalized) {
                debugLog(`⚠️ Skipping invalid field: ${field.id || 'unknown'}`, 'warning');
                return null;
            }
            return normalized;
        }).filter(f => f !== null);

        // ============ V1 → V2 MIGRATION ============
        // Get PDF page dimensions for migration (default to A4 if PDF not loaded yet)
        let pageWidth = 595;  // A4 default
        let pageHeight = 842; // A4 default

        if (pdfJsDoc) {
            try {
                const firstPage = await pdfJsDoc.getPage(1);
                const baseViewport = firstPage.getViewport({ scale: 1.0 });
                pageWidth = baseViewport.width;
                pageHeight = baseViewport.height;
                debugLog(`📏 Using PDF page dimensions: ${pageWidth}x${pageHeight} points`, 'info');
            } catch (error) {
                console.warn('⚠️ Could not get PDF page dimensions, using A4 defaults');
            }
        }

        // Auto-migrate V1 fields (bbox percentages) to V2 (PDF points)
        const migrationResult = migrateV1toV2(parsed.fields, pageWidth, pageHeight);
        if (migrationResult.migrationCount > 0) {
            parsed.fields = migrationResult.fields;
            showStatus(`המרת ${migrationResult.migrationCount} שדות לפורמט V2`, 'success');
        }

        fieldsMapping = parsed;
        debugLog(`✅ JSON loaded: ${fieldsMapping.fields.length} fields`, 'success');

        // ============ TABLES: Copy to liveFillData.tables ============
        if (fieldsMapping.tables && fieldsMapping.tables.length > 0) {
            liveFillData.tables = {};
            fieldsMapping.tables.forEach(table => {
                const tableId = table.tableId || table.id;
                if (tableId) {
                    // Initialize empty rows array for this table
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
            debugLog(`✅ Loaded ${fieldsMapping.tables.length} tables to liveFillData.tables`, 'success');
        }

        fieldsMapping.fields.forEach((field, idx) => {
            const id = field.id || field.fieldId;
            const value = liveFillData[id]?.value || liveFillData[id]?.checked || '';
            debugLog(`Field ${idx + 1}: id=${id}, type=${field.type}, page=${field.page}, value="${value}"`);
        });

        initializeLiveFillData();

        if (pdfJsDoc) {
            debugLog('📞 Calling createFieldOverlays from JSON upload', 'info');
            createFieldOverlays();
            debugLog('✅ Field overlays created', 'success');
        }

        checkExportEnabled();
        showStatus('מיפוי שדות נטען בהצלחה', 'success');
        ToastManager.success(`מיפוי נטען בהצלחה (${fieldsMapping.fields.length} שדות)`);

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

            // Checkbox/Radio: export with anchor + overlay size
            if ((field.type === 'checkbox' || field.type === 'radio') && field.anchor) {
                fieldData.anchor = field.anchor;
                fieldData.overlayWidth = field.overlayWidth || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
                fieldData.overlayHeight = field.overlayHeight || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
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
        // V1 anchor (checkbox/radio) - normalized 0-1 values
        else if ((field.type === 'checkbox' || field.type === 'radio') && field.anchor && Array.isArray(field.anchor) && field.anchor.length === 2) {
            const [anchorX, anchorY] = field.anchor;

            // anchor is stored as [xPercent, yPercentFromBottom]
            const centerX = anchorX * canvasCssWidth;
            const centerY = (1 - anchorY) * canvasCssHeight;

            // Fixed size for checkbox/radio at RENDER_SCALE
            w = field.overlayWidth || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);
            h = field.overlayHeight || (field.type === 'checkbox' ? CHECKBOX_SIZE : RADIO_SIZE);

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

        if (['text','number','date','signature','id_number','phone','email'].includes(field.type)) {
            editor.contentEditable = true;
            editor.addEventListener('input', handleFieldInput);
            editor.addEventListener('click', () => selectField(fieldId));
            editor.textContent = liveFillData[fieldId]?.value || '';
            applyStyleToElement(editor, liveFillData[fieldId]?.style);
            overlay.appendChild(editor);
        }
        else if (field.type === 'digitBoxes') {
            // Digit boxes: direct typing into individual boxes
            editor.contentEditable = true;
            editor.classList.add('digit-boxes-editor');
            editor.addEventListener('input', handleFieldInput);
            editor.addEventListener('click', () => selectField(fieldId));

            // Display current value split into boxes
            const value = (liveFillData[fieldId]?.value || '').toString();
            editor.textContent = value;
            applyStyleToElement(editor, liveFillData[fieldId]?.style);
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
            // Show small ✓ when checked, empty when unchecked (LiveFill only)
            editor.textContent = liveFillData[fieldId]?.checked ? '✓' : '';
            overlay.appendChild(editor);
        }
    });
}

// ========================================
// NumericBoxesRenderer - Display digits in individual boxes (like Export)
// ========================================

/**
 * Check if value is purely numeric (digits only, no dashes/spaces)
 * @param {string} value - Value to check
 * @returns {boolean}
 */
function isNumericOnly(value) {
    return /^[0-9]+$/.test(value);
}

/**
 * Prepare numeric value for display
 * - For 9-digit values (likely ID), pad with zeros
 * - Strip non-digits
 * @param {string} value - Raw value
 * @param {string} englishId - Field identifier for context
 * @returns {string} Prepared digits string
 */
function prepareNumericValue(value, englishId) {
    if (!value) return '';

    // If contains dash, return as-is (phone with format, etc.)
    if (String(value).includes('-')) {
        return String(value);
    }

    const digits = String(value).replace(/\D/g, '');

    // Pad ID numbers to 9 digits
    if (englishId === 'tz' || englishId === 'id_number') {
        return digits.padStart(9, '0').slice(0, 9);
    }

    return digits;
}

/**
 * NumericBoxesRenderer - Renders digits in flex boxes for LiveFill preview
 * Matches Export behavior where each digit appears in its own cell
 *
 * @param {HTMLElement} container - Parent element (the field overlay)
 * @param {string} value - The numeric value to display
 * @param {Object} style - Styling options
 * @param {string} style.fontFamily - Font family
 * @param {number} style.fontSize - Font size in px
 * @param {string} style.color - Text color
 * @param {number} style.height - Container height in px
 * @returns {HTMLElement|null} Hidden input for editing, or null if not numeric
 */
function NumericBoxesRenderer(container, value, style, numBoxes = 9) {
    const strValue = String(value || '');

    // If empty or contains non-digits (like dash), don't use boxes
    if (!strValue || !isNumericOnly(strValue)) {
        return null;
    }

    // Create wrapper div
    const wrapper = document.createElement('div');
    wrapper.className = 'numeric-boxes';
    wrapper.dir = 'ltr'; // Digits are always LTR

    // Append wrapper first so we can measure actual container dimensions
    container.appendChild(wrapper);
    const boxHeight = container.clientHeight;
    const boxWidth = container.clientWidth;

    // Inset to align with printed boxes (bbox is larger than actual printed boxes)
    const insetLeft = Math.round(boxWidth * 0.035);
    const insetRight = Math.round(boxWidth * 0.035);
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.paddingLeft = insetLeft + 'px';
    wrapper.style.paddingRight = insetRight + 'px';

    // Bottom anchor: use flexbox with align-items: flex-end
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'flex-end';
    wrapper.style.height = '100%';

    // Bottom padding: 15% or at least 2px
    const bottomPadding = Math.max(2, boxHeight * 0.15);
    wrapper.style.paddingBottom = bottomPadding + 'px';

    // Helper to create digit spans - always render exactly numBoxes cells
    function createDigitSpans(str) {
        wrapper.innerHTML = '';
        for (let i = 0; i < numBoxes; i++) {
            const digitSpan = document.createElement('span');
            digitSpan.className = 'digit';
            digitSpan.textContent = str[i] || ''; // Empty if no digit at this position
            digitSpan.style.fontFamily = style.fontFamily || "'David Libre', serif";
            digitSpan.style.fontSize = (style.fontSize || 16) + 'px';
            digitSpan.style.color = style.color || '#000';
            // No lineHeight needed - flexbox handles vertical alignment
            wrapper.appendChild(digitSpan);
        }
    }

    // Initial render
    createDigitSpans(strValue);

    // Hidden input for editing
    const input = document.createElement('input');
    input.type = 'text';
    input.value = strValue;
    input.className = 'numeric-boxes-input';
    input.style.position = 'absolute';
    input.style.top = '0';
    input.style.left = '0';
    input.style.width = '100%';
    input.style.height = '100%';
    input.style.opacity = '0';
    input.style.cursor = 'text';
    input.dir = 'ltr';

    // Update display on input
    input.addEventListener('input', (e) => {
        const newValue = e.target.value.replace(/\D/g, '');
        e.target.value = newValue;
        createDigitSpans(newValue);
    });

    container.appendChild(input);
    container.style.cursor = 'text';
    container.addEventListener('click', () => input.focus());

    return input;
}

/**
 * Renders free text (default mode for non-numeric values) - bottom anchored
 */
function renderFreeText(container, value, fontSizePx, containerHeight, paddingPx) {
    container.contentEditable = true;
    container.textContent = value || '';
    container.style.fontFamily = "'David Libre', serif";
    container.style.fontWeight = '400';
    container.style.fontSize = fontSizePx + 'px';
    container.style.lineHeight = fontSizePx + 'px';
    // Bottom anchor: 15% padding from bottom or at least 2px
    const bottomPadding = Math.max(2, containerHeight * 0.15);
    container.style.paddingTop = (containerHeight - fontSizePx - bottomPadding) + 'px';
    container.style.paddingRight = paddingPx + 'px';
    container.style.paddingLeft = paddingPx + 'px';
    container.style.boxSizing = 'border-box';
    container.style.overflow = 'hidden';
    container.style.direction = 'rtl';
    container.style.textAlign = 'right';
    container.style.whiteSpace = 'nowrap';
    container.style.textOverflow = 'clip';
}

/**
 * Main renderer for table cells - decides between NumericBoxes and FreeText
 */
function renderTableCell(container, value, col, screenW, screenH, fontSizePx, paddingPx) {
    const englishId = col.englishId || col.columnId;

    // Prepare value (pad ID numbers, etc.)
    const preparedValue = prepareNumericValue(value, englishId);

    // Determine number of boxes based on field type
    let numBoxes = 9; // Default for ID numbers
    if (englishId === 'phone' || englishId === 'phone_number') {
        numBoxes = 10;
    }

    // Check if should use numeric boxes
    if (isNumericOnly(preparedValue)) {
        const style = {
            fontFamily: "'David Libre', serif",
            fontSize: fontSizePx,
            color: '#000',
            height: screenH
        };
        return NumericBoxesRenderer(container, preparedValue, style, numBoxes);
    } else {
        // Use free text renderer (bottom anchored)
        renderFreeText(container, value, fontSizePx, screenH, paddingPx);
        return null;
    }
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
                    // Text/Number - use preview renderer based on field type
                    // Match export font size (14pt default) for consistency
                    const fontSizePt = col.fontSize || 14;
                    const fontSizePx = fontSizePt * RENDER_SCALE; // Scale 2 = 144 DPI
                    const paddingPx = 2 * RENDER_SCALE; // TEXT_PADDING = 2pt

                    // Use the appropriate renderer based on column type
                    const inputElement = renderTableCell(cellEditor, currentValue, col, screenW, screenH, fontSizePx, paddingPx);

                    // Data binding
                    if (inputElement) {
                        // For digits mode - input element is returned
                        inputElement.addEventListener('input', (e) => {
                            liveFillData.tables[tableId][rowIndex][col.englishId || colId] = e.target.value;
                            triggerAutoSave();
                        });
                    } else {
                        // For freeText mode - cellEditor is contentEditable
                        cellEditor.addEventListener('input', (e) => {
                            liveFillData.tables[tableId][rowIndex][col.englishId || colId] = e.target.textContent;
                            triggerAutoSave();
                        });
                    }
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
    // Show small ✓ when checked, empty when unchecked (LiveFill only)
    editor.textContent = liveFillData[fieldId].checked ? '✓' : '';
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
            } catch (e) {
                console.error('Failed to parse saved fields from localStorage:', e);
                localStorage.removeItem('liveFillFieldsMapping');
            }
        }

        if (savedData) {
            try {
                liveFillData = JSON.parse(savedData);
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
