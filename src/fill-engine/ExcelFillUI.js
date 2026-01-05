/**
 * ExcelFillUI - Excel Upload UI Extension
 *
 * Adds Excel/CSV upload capability to the Fill Engine UI.
 * This is 100% additive - does not modify existing UI flows.
 *
 * Features:
 * - Excel file upload button
 * - Column matching preview with confidence indicators
 * - Manual override for ambiguous matches
 * - Confirmation before fill
 */
(function() {
    'use strict';

    // ============ CONFIGURATION ============

    const UI_CONFIG = {
        DIALOG_WIDTH: '850px',
        PREVIEW_ROWS: 3,
        CONFIDENCE_COLORS: {
            high: '#4CAF50',    // Green: 0.8+
            medium: '#FF9800',  // Orange: 0.5-0.8
            low: '#F44336'      // Red: <0.5
        }
    };

    // ============ STATE ============

    let currentResolverResult = null;
    let currentTableMapping = null;
    let currentManualOverrides = {};

    // ============ MAIN FLOW ============

    /**
     * Open Excel upload dialog for a specific table
     * @param {Object} tableMapping - Table mapping from mapper
     * @param {Function} onComplete - Callback with filled data
     */
    function openExcelUploadDialog(tableMapping, onComplete) {
        console.log('📊 [ExcelFillUI] openExcelUploadDialog called');
        console.log('📊 [ExcelFillUI] tableMapping:', tableMapping);

        if (!window.ExcelDataResolver || !window.TableDataAdapter) {
            console.error('📊 [ExcelFillUI] Missing modules!');
            showToast('Excel modules not loaded', 'error');
            return;
        }

        currentTableMapping = tableMapping;
        currentResolverResult = null;
        currentManualOverrides = {};
        // Reset merge config for new upload
        mergeColumnsConfig = {
            enabled: false,
            targetColumnId: null,
            widthColumn: null,
            heightColumn: null,
            depthColumn: null
        };
        console.log('📊 [ExcelFillUI] State initialized, creating dialog...');

        // Remove existing dialog
        const existingDialog = document.getElementById('excel-upload-dialog');
        if (existingDialog) existingDialog.remove();

        // Create dialog
        const dialog = document.createElement('div');
        dialog.id = 'excel-upload-dialog';
        dialog.className = 'fill-dialog-overlay';
        dialog.innerHTML = `
            <div class="fill-dialog" style="max-width: ${UI_CONFIG.DIALOG_WIDTH}; direction: rtl;">
                <div class="fill-dialog-header">
                    <h3>📊 ייבוא נתונים מ-Excel</h3>
                    <button class="dialog-close" onclick="document.getElementById('excel-upload-dialog').remove()">✕</button>
                </div>
                <div class="fill-dialog-body">
                    <!-- Step 1: File Upload -->
                    <div id="excel-step-upload" class="excel-step active">
                        <div class="upload-zone" id="excel-drop-zone">
                            <div class="upload-icon">📁</div>
                            <p>גרור קובץ Excel/CSV לכאן</p>
                            <p class="upload-hint">או לחץ לבחירת קובץ</p>
                            <input type="file" id="excel-file-input" accept=".xlsx,.xls,.csv" style="display:none;">
                        </div>
                        <div class="upload-info">
                            <p><strong>טבלה:</strong> ${tableMapping.tableId}</p>
                            <p><strong>עמודות:</strong> ${tableMapping.columns.length}</p>
                            <p><strong>שורות מקסימום:</strong> ${tableMapping.rowCount}</p>
                        </div>
                    </div>

                    <!-- Step 2: Column Matching Preview -->
                    <div id="excel-step-preview" class="excel-step" style="display:none;">
                        <div class="preview-header">
                            <h4>התאמת עמודות</h4>
                            <div class="preview-stats" id="preview-stats"></div>
                        </div>
                        <div class="column-matching-table" id="column-matching-container"></div>
                        <div class="preview-data" id="preview-data-container"></div>
                    </div>

                    <!-- Step 3: Confirmation -->
                    <div id="excel-step-confirm" class="excel-step" style="display:none;">
                        <div class="confirm-summary" id="confirm-summary"></div>
                    </div>
                </div>
                <div class="fill-dialog-footer">
                    <button class="btn-cancel" onclick="document.getElementById('excel-upload-dialog').remove()">ביטול</button>
                    <button class="btn-secondary" id="btn-back-step" style="display:none;">חזרה</button>
                    <button class="btn-primary" id="btn-next-step" disabled>המשך</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Setup event handlers
        setupUploadHandlers(onComplete);
        setupNavigationHandlers(onComplete);

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    /**
     * Setup file upload handlers
     */
    function setupUploadHandlers(onComplete) {
        const dropZone = document.getElementById('excel-drop-zone');
        const fileInput = document.getElementById('excel-file-input');

        // Click to upload
        dropZone.addEventListener('click', () => fileInput.click());

        // File selected
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
            }
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files[0]);
            }
        });
    }

    /**
     * Setup navigation button handlers
     */
    function setupNavigationHandlers(onComplete) {
        const btnNext = document.getElementById('btn-next-step');
        const btnBack = document.getElementById('btn-back-step');

        let currentStep = 1;

        btnNext.addEventListener('click', () => {
            if (currentStep === 1 && currentResolverResult) {
                // Move to preview
                showStep(2);
                currentStep = 2;
            } else if (currentStep === 2) {
                // Move to confirm
                showConfirmStep();
                showStep(3);
                currentStep = 3;
            } else if (currentStep === 3) {
                // Execute fill
                executeFill(onComplete);
            }
        });

        btnBack.addEventListener('click', () => {
            if (currentStep === 2) {
                showStep(1);
                currentStep = 1;
            } else if (currentStep === 3) {
                showStep(2);
                currentStep = 2;
            }
        });
    }

    /**
     * Show specific step
     */
    function showStep(stepNum) {
        document.querySelectorAll('.excel-step').forEach(s => s.style.display = 'none');
        document.getElementById(`excel-step-${stepNum === 1 ? 'upload' : stepNum === 2 ? 'preview' : 'confirm'}`).style.display = 'block';

        const btnBack = document.getElementById('btn-back-step');
        const btnNext = document.getElementById('btn-next-step');

        btnBack.style.display = stepNum > 1 ? 'inline-block' : 'none';
        btnNext.textContent = stepNum === 3 ? '✓ אישור ומילוי' : 'המשך';
    }

    // ============ FILE HANDLING ============

    /**
     * Handle uploaded file
     */
    async function handleFileUpload(file) {
        const dropZone = document.getElementById('excel-drop-zone');
        const btnNext = document.getElementById('btn-next-step');

        try {
            dropZone.innerHTML = '<div class="upload-loading">⏳ מעבד קובץ...</div>';

            const fileBytes = await file.arrayBuffer();

            // Resolve Excel data
            currentResolverResult = window.ExcelDataResolver.resolve(
                fileBytes,
                file.name,
                currentTableMapping
            );

            // Show success
            dropZone.innerHTML = `
                <div class="upload-success">
                    <div class="success-icon">✓</div>
                    <p><strong>${file.name}</strong></p>
                    <p>${currentResolverResult.totalRows} שורות נמצאו</p>
                    ${currentResolverResult.truncated ? `<p class="warning">⚠️ רק ${currentTableMapping.rowCount} שורות ייובאו</p>` : ''}
                </div>
            `;

            // Enable next button
            btnNext.disabled = false;

            // Render preview
            renderColumnMatching();

        } catch (error) {
            console.error('Excel upload error:', error);
            dropZone.innerHTML = `
                <div class="upload-error">
                    <div class="error-icon">❌</div>
                    <p>שגיאה בקריאת הקובץ</p>
                    <p class="error-detail">${error.message}</p>
                </div>
            `;
            btnNext.disabled = true;
        }
    }

    // ============ PREVIEW RENDERING ============

    /**
     * Get sample values for a specific Excel column
     */
    function getSampleValues(columnIndex, maxSamples = 3) {
        const rawRows = currentResolverResult.rawSampleRows || [];
        const samples = [];

        for (const row of rawRows) {
            const val = row[columnIndex];
            if (val !== null && val !== undefined && val !== '') {
                const strVal = String(val).trim();
                if (strVal && samples.length < maxSamples) {
                    // Truncate long values
                    samples.push(strVal.length > 15 ? strVal.substring(0, 15) + '...' : strVal);
                }
            }
        }

        return samples.length > 0 ? samples.join(', ') : '(ריק)';
    }

    /**
     * Render column matching table
     */
    function renderColumnMatching() {
        const container = document.getElementById('column-matching-container');
        const statsContainer = document.getElementById('preview-stats');

        const { matches, unmatched, headers } = currentResolverResult;

        // Stats - improved UX with clearer messaging
        const matchedCount = Object.keys(matches).length;
        const unmappedCount = unmatched.length;
        const totalColumns = headers.length;

        // Build stats display with better Hebrew text
        let statsHtml = `<span class="stat matched">✓ ${matchedCount} התאמות אוטומטיות</span>`;
        if (unmappedCount > 0) {
            statsHtml += ` <span class="stat-separator">•</span> `;
            statsHtml += `<span class="stat unmapped-info">${unmappedCount} ${unmappedCount === 1 ? 'שדה לא מופה' : 'שדות לא מופים'}</span>`;
        }
        statsContainer.innerHTML = statsHtml;

        // Column matching table - NEW: added sample column
        let html = `
            <table class="matching-table">
                <thead>
                    <tr>
                        <th>עמודת Excel</th>
                        <th class="sample-col-header">דוגמאות</th>
                        <th>→</th>
                        <th>עמודת טבלה</th>
                        <th>סטטוס</th>
                    </tr>
                </thead>
                <tbody>
        `;

        headers.forEach((header, idx) => {
            const match = matches[idx];
            const isManualOverride = currentManualOverrides[idx] !== undefined;
            const sampleValues = getSampleValues(idx);

            if (match) {
                const confidenceColor = getConfidenceColor(match.confidence);
                const statusIcon = match.confidence >= 0.8 ? '✅' : match.confidence >= 0.5 ? '🔶' : '⚪';

                html += `
                    <tr class="match-row ${isManualOverride ? 'manual-override' : ''}">
                        <td class="excel-col"><strong>${escapeHtml(header)}</strong></td>
                        <td class="sample-col">${escapeHtml(sampleValues)}</td>
                        <td class="arrow">→</td>
                        <td class="table-col">
                            <select class="column-select" data-excel-idx="${idx}">
                                ${renderColumnOptions(match.columnId)}
                            </select>
                        </td>
                        <td class="status-col">${statusIcon}</td>
                    </tr>
                `;
            } else {
                // Unmatched column - show clear informative status with CSS tooltip
                html += `
                    <tr class="match-row unmatched-row">
                        <td class="excel-col"><strong>${escapeHtml(header)}</strong></td>
                        <td class="sample-col">${escapeHtml(sampleValues)}</td>
                        <td class="arrow">→</td>
                        <td class="table-col">
                            <select class="column-select" data-excel-idx="${idx}">
                                <option value="">-- לא לייבא --</option>
                                ${renderColumnOptions(null)}
                            </select>
                        </td>
                        <td class="status-col unmapped-status">
                            <span class="status-text">לא ימולא</span>
                            <span class="info-icon-wrapper">
                                <span class="info-icon">ℹ️</span>
                                <span class="info-tooltip">שדה זה זוהה בקובץ Excel,<br>אך אין לו שדה יעד במסמך זה.<br>כדי למלא אותו – יש להוסיף שדה במיפוי.</span>
                            </span>
                        </td>
                    </tr>
                `;
            }
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Add change handlers for manual override
        container.querySelectorAll('.column-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const excelIdx = e.target.dataset.excelIdx;
                const newColumnId = e.target.value;
                handleManualOverride(excelIdx, newColumnId);
            });
        });

        // Check for dimensions column and render merge UI if needed
        renderMergeColumnsUI();

        // Render data preview
        renderDataPreview();
    }

    // ============ MERGE COLUMNS UI ============

    // State for merged columns
    let mergeColumnsConfig = {
        enabled: false,
        targetColumnId: null,
        widthColumn: null,
        heightColumn: null,
        depthColumn: null
    };

    /**
     * Render merge columns UI for dimensions
     */
    function renderMergeColumnsUI() {
        // Find dimensions column in table mapping
        const dimensionsColumn = currentTableMapping.columns.find(col =>
            col.hebrewName && col.hebrewName.includes('מידות')
        );

        if (!dimensionsColumn) return;

        // Find potential dimension columns in Excel (רוחב, גובה, עובי, width, height, depth)
        const headers = currentResolverResult.headers;
        const dimensionKeywords = {
            width: ['רוחב', 'width', 'w', 'ר'],
            height: ['גובה', 'height', 'h', 'ג'],
            depth: ['עובי', 'עומק', 'depth', 'd', 'ע']
        };

        const findColumn = (keywords) => {
            return headers.findIndex(h => {
                const normalized = h.toLowerCase().trim();
                return keywords.some(k => normalized.includes(k));
            });
        };

        const widthIdx = findColumn(dimensionKeywords.width);
        const heightIdx = findColumn(dimensionKeywords.height);
        const depthIdx = findColumn(dimensionKeywords.depth);

        // Only show if we found at least 2 dimension columns
        if ([widthIdx, heightIdx, depthIdx].filter(x => x >= 0).length < 2) return;

        // Initialize merge config
        if (!mergeColumnsConfig.enabled) {
            mergeColumnsConfig = {
                enabled: true,
                targetColumnId: dimensionsColumn.columnId,
                widthColumn: widthIdx >= 0 ? widthIdx : null,
                heightColumn: heightIdx >= 0 ? heightIdx : null,
                depthColumn: depthIdx >= 0 ? depthIdx : null
            };
        }

        // Create merge UI HTML
        const mergeHtml = `
            <div class="merge-columns-section">
                <div class="merge-header">
                    <label>
                        <input type="checkbox" id="merge-enabled" ${mergeColumnsConfig.enabled ? 'checked' : ''}>
                        🔗 שלב עמודות לעמודת "${dimensionsColumn.hebrewName}"
                    </label>
                </div>
                <div class="merge-config" id="merge-config" style="${mergeColumnsConfig.enabled ? '' : 'display:none'}">
                    <div class="merge-formula">
                        <select id="merge-width" class="merge-select">
                            <option value="">רוחב</option>
                            ${renderExcelColumnsOptions(mergeColumnsConfig.widthColumn)}
                        </select>
                        <span class="merge-separator">×</span>
                        <select id="merge-height" class="merge-select">
                            <option value="">גובה</option>
                            ${renderExcelColumnsOptions(mergeColumnsConfig.heightColumn)}
                        </select>
                        <span class="merge-separator">×</span>
                        <select id="merge-depth" class="merge-select">
                            <option value="">עומק</option>
                            ${renderExcelColumnsOptions(mergeColumnsConfig.depthColumn)}
                        </select>
                    </div>
                    <div class="merge-preview" id="merge-preview">
                        ${getMergePreview()}
                    </div>
                </div>
            </div>
        `;

        // Insert after the matching table
        const container = document.getElementById('column-matching-container');
        container.insertAdjacentHTML('afterend', mergeHtml);

        // Add event listeners
        document.getElementById('merge-enabled')?.addEventListener('change', (e) => {
            mergeColumnsConfig.enabled = e.target.checked;
            document.getElementById('merge-config').style.display = e.target.checked ? '' : 'none';
            if (e.target.checked) applyMergeColumns();
        });

        ['merge-width', 'merge-height', 'merge-depth'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', (e) => {
                const type = id.replace('merge-', '');
                mergeColumnsConfig[type + 'Column'] = e.target.value ? parseInt(e.target.value) : null;
                document.getElementById('merge-preview').innerHTML = getMergePreview();
                applyMergeColumns();
            });
        });
    }

    /**
     * Render Excel columns as options
     */
    function renderExcelColumnsOptions(selectedIdx) {
        const headers = currentResolverResult.headers;
        let options = '';

        headers.forEach((header, idx) => {
            const selected = idx === selectedIdx ? 'selected' : '';
            const sample = getSampleValues(idx, 1);
            options += `<option value="${idx}" ${selected}>${header} (${sample})</option>`;
        });

        return options;
    }

    /**
     * Get merge preview text
     */
    function getMergePreview() {
        const rawRows = currentResolverResult.rawSampleRows || [];
        if (rawRows.length === 0) return 'אין תצוגה מקדימה';

        const row = rawRows[0];
        const w = mergeColumnsConfig.widthColumn !== null ? row[mergeColumnsConfig.widthColumn] : '?';
        const h = mergeColumnsConfig.heightColumn !== null ? row[mergeColumnsConfig.heightColumn] : '?';
        const d = mergeColumnsConfig.depthColumn !== null ? row[mergeColumnsConfig.depthColumn] : '?';

        return `<strong>תצוגה מקדימה:</strong> ${w}×${h}×${d}`;
    }

    /**
     * Round number for display (remove floating point artifacts)
     */
    function roundForDisplay(val) {
        if (val === null || val === undefined || val === '') return '';
        if (typeof val === 'number') {
            // Check if effectively whole number
            if (Math.abs(val - Math.round(val)) < 0.0001) {
                return String(Math.round(val));
            }
            return String(Math.round(val * 100) / 100);
        }
        return String(val);
    }

    /**
     * Apply merge columns to data
     */
    function applyMergeColumns() {
        if (!mergeColumnsConfig.enabled || !mergeColumnsConfig.targetColumnId) return;

        const { widthColumn, heightColumn, depthColumn, targetColumnId } = mergeColumnsConfig;

        // Find the englishId for the target column
        const targetCol = currentTableMapping.columns.find(c => c.columnId === targetColumnId);
        const targetKey = targetCol?.englishId || targetColumnId;

        // Update each row in the data using full raw rows
        const rawRows = currentResolverResult.rawRows || currentResolverResult.rawSampleRows || [];

        currentResolverResult.data.forEach((row, idx) => {
            const rawRow = rawRows[idx] || [];

            const w = widthColumn !== null ? roundForDisplay(rawRow[widthColumn]) : '';
            const h = heightColumn !== null ? roundForDisplay(rawRow[heightColumn]) : '';
            const d = depthColumn !== null ? roundForDisplay(rawRow[depthColumn]) : '';

            if (w || h || d) {
                // Use LTR mark (\u200E) to prevent RTL reversal in PDF
                row[targetKey] = `\u200E${w}×${h}×${d}`;
            }
        });

        // Re-render preview
        renderDataPreview();
    }

    /**
     * Get format hint for column type
     */
    function getFormatHint(col) {
        const typeHints = {
            'number': 'מספר',
            'text': 'טקסט',
            'date': 'תאריך',
            'checkbox': 'כן/לא'
        };

        // Special case for dimensions column
        if (col.hebrewName && col.hebrewName.includes('מידות')) {
            return 'ר×ג×ע';
        }

        return typeHints[col.type] || 'טקסט';
    }

    /**
     * Render column options for select
     */
    function renderColumnOptions(selectedId) {
        let options = '<option value="">-- לא לייבא --</option>';

        currentTableMapping.columns.forEach(col => {
            const selected = col.columnId === selectedId ? 'selected' : '';
            const label = col.hebrewName || col.englishId || col.columnId;
            const hint = getFormatHint(col);
            options += `<option value="${col.columnId}" ${selected}>${label} (${hint})</option>`;
        });

        return options;
    }

    /**
     * Get confidence color
     */
    function getConfidenceColor(confidence) {
        if (confidence >= 0.8) return UI_CONFIG.CONFIDENCE_COLORS.high;
        if (confidence >= 0.5) return UI_CONFIG.CONFIDENCE_COLORS.medium;
        return UI_CONFIG.CONFIDENCE_COLORS.low;
    }

    /**
     * Get confidence label
     */
    function getConfidenceLabel(confidence, tier) {
        const pct = Math.round(confidence * 100);
        const tierLabels = { 1: 'מדויק', 2: 'נורמלי', 3: 'לפי סוג' };
        return `${pct}% (${tierLabels[tier] || 'ידני'})`;
    }

    /**
     * Handle manual column override
     */
    function handleManualOverride(excelIdx, newColumnId) {
        currentManualOverrides[excelIdx] = newColumnId || null;

        // Re-apply overrides and re-transform
        const updatedMatches = window.ExcelDataResolver.applyOverrides(
            currentResolverResult,
            currentManualOverrides
        );

        currentResolverResult.matches = updatedMatches.matches;

        // Re-render preview
        renderColumnMatching();
    }

    /**
     * Render data preview table
     */
    function renderDataPreview() {
        const container = document.getElementById('preview-data-container');
        const { data, matches } = currentResolverResult;

        const previewRows = data.slice(0, UI_CONFIG.PREVIEW_ROWS);

        // Get column order from matches
        const columnOrder = Object.entries(matches)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([_, match]) => match);

        let html = `
            <h4>תצוגה מקדימה (${Math.min(data.length, UI_CONFIG.PREVIEW_ROWS)} שורות ראשונות)</h4>
            <table class="preview-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${columnOrder.map(m => `<th>${m.hebrewName || m.columnId}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        previewRows.forEach((row, idx) => {
            html += `<tr><td>${idx + 1}</td>`;
            columnOrder.forEach(match => {
                const value = row[match.columnId] ?? '';
                html += `<td>${escapeHtml(String(value).substring(0, 30))}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';

        if (data.length > UI_CONFIG.PREVIEW_ROWS) {
            html += `<p class="preview-more">... ועוד ${data.length - UI_CONFIG.PREVIEW_ROWS} שורות</p>`;
        }

        container.innerHTML = html;
    }

    /**
     * Show confirmation step
     */
    function showConfirmStep() {
        const container = document.getElementById('confirm-summary');
        const { data, matches, unmatched, truncated, totalRows, headers } = currentResolverResult;

        const matchedColumns = Object.keys(matches).length;
        const unmappedColumns = unmatched || [];

        // Build unmapped fields list if any
        let unmappedHtml = '';
        if (unmappedColumns.length > 0) {
            const unmappedNames = unmappedColumns.map(u => headers[u.index] || u.header).slice(0, 5);
            const hasMore = unmappedColumns.length > 5;

            unmappedHtml = `
                <div class="confirm-unmapped-section">
                    <div class="unmapped-header">
                        <span class="unmapped-icon">ℹ️</span>
                        <span class="unmapped-title">שדות שלא ימולאו:</span>
                    </div>
                    <ul class="unmapped-list">
                        ${unmappedNames.map(name => `<li><strong>${escapeHtml(name)}</strong> – לא מופה במסמך</li>`).join('')}
                        ${hasMore ? `<li class="unmapped-more">... ועוד ${unmappedColumns.length - 5} שדות</li>` : ''}
                    </ul>
                    <p class="unmapped-note">
                        <a href="#" class="mapper-link" onclick="event.preventDefault(); window.ExcelFillUI._showMapperHint();">
                            רוצה למלא גם שדות שלא מופו? עבור לכלי המיפוי
                        </a>
                    </p>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="confirm-box">
                <h4>✓ מוכן למילוי</h4>
                <div class="confirm-stats">
                    <div class="stat-item">
                        <span class="stat-value">${data.length}</span>
                        <span class="stat-label">שורות לייבוא</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${matchedColumns}</span>
                        <span class="stat-label">עמודות מותאמות</span>
                    </div>
                </div>
                ${truncated ? `<p class="warning">⚠️ ${totalRows - data.length} שורות לא ייובאו (מעבר למגבלת הטבלה)</p>` : ''}
                ${unmappedHtml}
                <p class="confirm-note">לחץ "אישור ומילוי" להמשך</p>
            </div>
        `;
    }

    /**
     * Show hint about mapper (called from confirmation screen link)
     */
    function showMapperHint() {
        showToast('פתח את כלי המיפוי והוסף את השדות החסרים', 'info');
    }

    // ============ FILL EXECUTION ============

    /**
     * Execute fill with resolved data
     */
    function executeFill(onComplete) {
        if (!currentResolverResult || !currentTableMapping) {
            showToast('No data to fill', 'error');
            return;
        }

        // Use the already transformed data from resolver
        // Note: data is already transformed and truncated in resolve()
        const finalData = currentResolverResult.data || [];

        console.log('[ExcelFillUI] Final data for fill:', finalData.length, 'rows');

        // Validate
        const validation = window.TableDataAdapter.validate(finalData, currentTableMapping);

        if (!validation.valid) {
            showToast(`Validation failed: ${validation.errors.join(', ')}`, 'error');
            return;
        }

        if (validation.warnings.length > 0) {
            console.warn('[ExcelFillUI] Warnings:', validation.warnings);
        }

        // Convert to fill format
        const fillData = window.TableDataAdapter.toFillFormat(
            currentTableMapping.tableId,
            finalData
        );

        // Close dialog
        document.getElementById('excel-upload-dialog').remove();

        // Call completion handler
        if (onComplete) {
            onComplete(fillData, currentResolverResult);
        }

        showToast(`✓ ${finalData.length} שורות מוכנות למילוי`, 'success');
    }

    // ============ UTILITIES ============

    /**
     * Escape HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show toast (use existing or fallback)
     */
    function showToast(message, type = 'info') {
        if (window.FillEngineUI && window.FillEngineUI.showToast) {
            window.FillEngineUI.showToast(message, type);
        } else if (window.Toast && window.Toast.show) {
            window.Toast.show(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    // ============ CSS INJECTION ============

    function injectStyles() {
        if (document.getElementById('excel-fill-ui-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'excel-fill-ui-styles';
        styles.textContent = `
            /* Dialog Overlay */
            .fill-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            .fill-dialog {
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                max-height: 90vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            .fill-dialog-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid #eee;
                background: #f9f9f9;
            }
            .fill-dialog-header h3 {
                margin: 0;
                font-size: 18px;
            }
            .fill-dialog-header .dialog-close {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: #666;
                padding: 4px 8px;
            }
            .fill-dialog-header .dialog-close:hover {
                color: #333;
            }
            .fill-dialog-body {
                padding: 20px;
                overflow-y: auto;
                flex: 1;
            }
            .fill-dialog-footer {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                padding: 16px 20px;
                border-top: 1px solid #eee;
                background: #f9f9f9;
            }
            .fill-dialog-footer .btn-cancel {
                padding: 8px 20px;
                border: 1px solid #ddd;
                background: white;
                border-radius: 6px;
                cursor: pointer;
            }
            .fill-dialog-footer .btn-cancel:hover {
                background: #f5f5f5;
            }
            .fill-dialog-footer .btn-primary {
                padding: 8px 20px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
            }
            .fill-dialog-footer .btn-primary:hover:not(:disabled) {
                background: #1976D2;
            }
            .fill-dialog-footer .btn-primary:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            .fill-dialog-footer .btn-secondary {
                padding: 8px 20px;
                background: #f5f5f5;
                border: 1px solid #ddd;
                border-radius: 6px;
                cursor: pointer;
            }
            .fill-dialog-footer .btn-secondary:hover {
                background: #eee;
            }

            /* Upload Zone */
            .upload-zone {
                border: 2px dashed #ccc;
                border-radius: 8px;
                padding: 40px;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s ease;
                background: #f9f9f9;
            }
            .upload-zone:hover, .upload-zone.drag-over {
                border-color: #2196F3;
                background: #e3f2fd;
            }
            .upload-zone .upload-icon {
                font-size: 48px;
                margin-bottom: 16px;
            }
            .upload-zone .upload-hint {
                color: #666;
                font-size: 12px;
            }
            .upload-loading, .upload-success, .upload-error {
                padding: 20px;
            }
            .upload-success .success-icon {
                font-size: 48px;
                color: #4CAF50;
            }
            .upload-error .error-icon {
                font-size: 48px;
                color: #F44336;
            }
            .upload-error .error-detail {
                color: #F44336;
                font-size: 12px;
            }
            .upload-success .warning {
                color: #FF9800;
                font-size: 12px;
            }
            .upload-info {
                margin-top: 20px;
                padding: 12px;
                background: #f5f5f5;
                border-radius: 4px;
                font-size: 13px;
            }
            .upload-info p {
                margin: 4px 0;
            }

            /* Column Matching Table */
            .preview-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }
            .preview-stats .stat {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                margin-left: 8px;
            }
            .preview-stats .stat.matched {
                background: #E8F5E9;
                color: #2E7D32;
            }
            .preview-stats .stat.unmatched {
                background: #FFEBEE;
                color: #C62828;
            }
            .preview-stats .stat-separator {
                color: #999;
                margin: 0 4px;
            }
            .preview-stats .stat.unmapped-info {
                background: #FFF3E0;
                color: #E65100;
            }
            .matching-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
                margin-bottom: 16px;
            }
            .matching-table th {
                background: #f5f5f5;
                padding: 8px;
                text-align: right;
                border-bottom: 2px solid #ddd;
            }
            .matching-table td {
                padding: 8px;
                border-bottom: 1px solid #eee;
            }
            .matching-table .arrow {
                text-align: center;
                color: #666;
            }
            .matching-table .column-select {
                width: 100%;
                padding: 4px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            .matching-table .tier-badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 10px;
                font-size: 10px;
                background: #E3F2FD;
                color: #1976D2;
            }
            .matching-table .tier-badge.manual {
                background: #FFF3E0;
                color: #E65100;
            }
            .match-row.unmatched-row {
                background: #FFF8E1;
            }
            .match-row.manual-override {
                background: #E8F5E9;
            }
            /* Sample column styles */
            .sample-col-header {
                min-width: 150px;
            }
            .sample-col {
                color: #666;
                font-size: 11px;
                max-width: 180px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                direction: ltr;
                text-align: left;
            }
            .status-col {
                text-align: center;
                font-size: 14px;
            }
            .status-col.unmapped-status {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
            }
            .status-col .status-text {
                font-size: 11px;
                color: #E65100;
                white-space: nowrap;
            }
            /* Info icon with CSS tooltip */
            .info-icon-wrapper {
                position: relative;
                display: inline-block;
            }
            .status-col .info-icon {
                cursor: help;
                font-size: 14px;
            }
            .info-tooltip {
                display: none;
                position: absolute;
                bottom: 100%;
                right: 50%;
                transform: translateX(50%);
                background: #333;
                color: white;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 12px;
                line-height: 1.5;
                white-space: nowrap;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                text-align: right;
                direction: rtl;
                margin-bottom: 8px;
            }
            .info-tooltip::after {
                content: '';
                position: absolute;
                top: 100%;
                right: 50%;
                transform: translateX(50%);
                border: 8px solid transparent;
                border-top-color: #333;
            }
            .info-icon-wrapper:hover .info-tooltip {
                display: block;
            }
            .excel-col {
                min-width: 100px;
            }

            /* Merge Columns UI */
            .merge-columns-section {
                margin-top: 16px;
                padding: 12px;
                background: #E3F2FD;
                border-radius: 8px;
                border: 1px solid #90CAF9;
            }
            .merge-header label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 500;
                cursor: pointer;
            }
            .merge-header input[type="checkbox"] {
                width: 16px;
                height: 16px;
            }
            .merge-config {
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid #90CAF9;
            }
            .merge-formula {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .merge-select {
                padding: 6px 10px;
                border: 1px solid #64B5F6;
                border-radius: 4px;
                background: white;
                min-width: 120px;
            }
            .merge-separator {
                font-size: 18px;
                font-weight: bold;
                color: #1976D2;
            }
            .merge-preview {
                margin-top: 10px;
                padding: 8px;
                background: white;
                border-radius: 4px;
                font-size: 13px;
                color: #333;
            }

            /* Preview Table */
            .preview-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            .preview-table th, .preview-table td {
                padding: 6px 8px;
                border: 1px solid #ddd;
                text-align: right;
            }
            .preview-table th {
                background: #f5f5f5;
            }
            .preview-more {
                color: #666;
                font-size: 12px;
                text-align: center;
                margin-top: 8px;
            }

            /* Confirm Box */
            .confirm-box {
                text-align: center;
                padding: 20px;
            }
            .confirm-stats {
                display: flex;
                justify-content: center;
                gap: 40px;
                margin: 20px 0;
            }
            .confirm-stats .stat-item {
                text-align: center;
            }
            .confirm-stats .stat-value {
                display: block;
                font-size: 36px;
                font-weight: bold;
                color: #2196F3;
            }
            .confirm-stats .stat-label {
                font-size: 12px;
                color: #666;
            }
            .confirm-note {
                color: #666;
                font-size: 12px;
            }

            /* Unmapped fields section in confirmation */
            .confirm-unmapped-section {
                margin: 20px 0;
                padding: 12px 16px;
                background: #FFF8E1;
                border: 1px solid #FFE082;
                border-radius: 8px;
                text-align: right;
            }
            .unmapped-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            .unmapped-icon {
                font-size: 16px;
            }
            .unmapped-title {
                font-weight: 500;
                color: #E65100;
            }
            .unmapped-list {
                margin: 0;
                padding: 0 20px;
                list-style: disc;
            }
            .unmapped-list li {
                font-size: 13px;
                margin: 4px 0;
                color: #5D4037;
            }
            .unmapped-list .unmapped-more {
                color: #999;
                font-style: italic;
            }
            .unmapped-note {
                margin-top: 12px;
                font-size: 12px;
            }
            .mapper-link {
                color: #1976D2;
                text-decoration: none;
            }
            .mapper-link:hover {
                text-decoration: underline;
            }

            /* Excel Step */
            .excel-step {
                min-height: 200px;
            }
        `;

        document.head.appendChild(styles);
    }

    // ============ INTEGRATION ============

    /**
     * Add Excel button to existing form data dialog
     * Called after FillEngineUI initializes
     */
    function extendFormDataDialog() {
        // Hook into existing dialog if it opens
        const originalShowDialog = window.FillEngineUI?.showFormDataDialog;

        if (originalShowDialog) {
            window.FillEngineUI.showFormDataDialog = function(mapping, onSubmit) {
                // Call original
                originalShowDialog(mapping, onSubmit);

                // Add Excel tab after a brief delay (wait for DOM)
                setTimeout(() => addExcelTabToDialog(mapping, onSubmit), 100);
            };
        }
    }

    /**
     * Add Excel tab to existing dialog
     */
    function addExcelTabToDialog(mapping, onSubmit) {
        const tabsContainer = document.querySelector('.fill-dialog-tabs');
        if (!tabsContainer || document.getElementById('excel-tab-btn')) return;

        // Add Excel tab button
        const excelTabBtn = document.createElement('button');
        excelTabBtn.id = 'excel-tab-btn';
        excelTabBtn.className = 'tab-btn';
        excelTabBtn.textContent = '📊 Excel';
        excelTabBtn.onclick = () => switchToExcelTab(mapping, onSubmit);
        tabsContainer.appendChild(excelTabBtn);
    }

    /**
     * Switch to Excel import mode
     */
    function switchToExcelTab(mapping, onSubmit) {
        // Close current dialog
        const currentDialog = document.getElementById('form-data-dialog');
        if (currentDialog) currentDialog.remove();

        // Get first table from mapping
        const table = mapping.tables?.[0];
        if (!table) {
            showToast('No table found in mapping', 'warning');
            return;
        }

        // Open Excel upload dialog
        openExcelUploadDialog(table, (fillData, resolverResult) => {
            // Merge with empty form data and call original submit
            const formData = {
                ...fillData,
                tables: fillData
            };
            onSubmit(formData);
        });
    }

    // ============ INITIALIZATION ============

    function initialize() {
        injectStyles();

        // Wait for FillEngineUI to be available
        if (window.FillEngineUI) {
            extendFormDataDialog();
        } else {
            window.addEventListener('load', () => {
                setTimeout(extendFormDataDialog, 500);
            });
        }
    }

    // ============ EXPORT ============

    window.ExcelFillUI = {
        // Configuration
        config: UI_CONFIG,

        // Main API
        openExcelUploadDialog,

        // Utilities
        initialize,

        // Internal (used by inline onclick)
        _showMapperHint: showMapperHint
    };

    // Auto-initialize
    initialize();

    console.log('%c📊 ExcelFillUI Module Loaded', 'background: #FF9800; color: white; font-size: 12px; padding: 3px;');
})();
