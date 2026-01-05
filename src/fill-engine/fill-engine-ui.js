/**
 * Fill Engine UI - Mapper Integration (Step 8)
 *
 * Provides UI integration for the Fill Engine:
 * - Export filled PDF button
 * - Full live fill simulation
 * - Form data input dialog
 * - Diagnostics display
 */
(function() {
    'use strict';

    // ============ CONFIGURATION ============

    const UI_CONFIG = {
        DIALOG_WIDTH: '600px',
        MAX_DIAGNOSTICS_DISPLAY: 50
    };

    // ============ SAMPLE DATA GENERATION ============

    /**
     * Generate sample form data from mapping
     * @param {Object} mapping - Mapping { fields, groups, tables }
     * @returns {Object} Sample form data
     */
    function generateSampleFormData(mapping) {
        const formData = {};
        const { fields = [], groups = [], tables = [] } = mapping;

        // Generate field data
        fields.forEach(field => {
            if (field.isTableField) return;

            const value = generateSampleValue(field.type, field.id);
            formData[field.id] = value;
            if (field.englishId) {
                formData[field.englishId] = value;
            }
        });

        // Generate group data
        groups.forEach(group => {
            if (group.options && group.options.length > 0) {
                // Select first option for radio, multiple for checkbox
                if (group.type === 'radio') {
                    formData[group.groupId] = group.options[0].englishId || group.options[0].fieldId;
                } else {
                    // Select first two options for checkbox
                    formData[group.groupId] = group.options.slice(0, 2).map(o => o.englishId || o.fieldId);
                }
            }
        });

        // Generate table data
        tables.forEach(table => {
            const tableData = [];
            const rowCount = Math.min(table.rowCount || 5, 10);

            for (let i = 0; i < rowCount; i++) {
                const rowData = {};
                (table.columns || []).forEach(col => {
                    rowData[col.columnId] = generateSampleValue(col.type, col.columnId, i);
                });
                tableData.push(rowData);
            }

            formData[table.tableId] = tableData;
        });

        return formData;
    }

    /**
     * Generate sample value based on field type
     * @param {string} type - Field type
     * @param {string} fieldId - Field ID for variation
     * @param {number} index - Row index for tables
     * @returns {any} Sample value
     */
    function generateSampleValue(type, fieldId, index = 0) {
        switch (type) {
            case 'text':
                return `טקסט לדוגמה ${index + 1}`;
            case 'number':
                return String(1000 + index * 100);
            case 'date':
                const day = String((index % 28) + 1).padStart(2, '0');
                const month = String((index % 12) + 1).padStart(2, '0');
                return `${day}/${month}/2024`;
            case 'id_number':
                return String(123456780 + index).padStart(9, '0');
            case 'phone':
                return `050-${String(1234567 + index).slice(-7)}`;
            case 'email':
                return `user${index + 1}@example.com`;
            case 'address':
                return `רחוב הדוגמה ${index + 1}, תל אביב`;
            case 'checkbox':
                return index % 2 === 0;
            case 'radio':
                return index === 0;
            case 'signature':
                return null; // No sample signature
            default:
                return `ערך ${index + 1}`;
        }
    }

    // ============ EXPORT FUNCTIONS ============

    /**
     * Export filled PDF using current mapping and sample data
     * @param {Object} mapper - Mapper instance
     */
    async function exportFilledPDF(mapper) {
        if (!mapper || !window.FillEngine) {
            showToast('מנוע המילוי לא נטען', 'error');
            return;
        }

        // Check if PDF is loaded
        if (!mapper.pdfDoc || !mapper.pdfBytes) {
            showToast('יש לטעון PDF לפני הייצוא', 'warning');
            return;
        }

        // Get mapping
        const mapping = mapper.getStep5ExportJSON ? mapper.getStep5ExportJSON() : {
            fields: mapper.fields || [],
            groups: mapper.optionGroups || [],
            tables: mapper.mappedTables || []
        };

        if (mapping.fields.length === 0 && mapping.groups.length === 0 && mapping.tables.length === 0) {
            showToast('אין שדות ממופים לייצוא', 'warning');
            return;
        }

        // Show form data dialog
        showFormDataDialog(mapping, async (formData) => {
            try {
                showToast('מייצר PDF ממולא...', 'info');

                // Load Hebrew font if available
                let hebrewFontBytes = null;
                if (window.FontManager) {
                    hebrewFontBytes = await window.FontManager.loadHebrewFont();
                }

                // Fill PDF
                const result = await window.FillEngine.fillPDF(
                    mapper.pdfBytes,
                    mapping,
                    formData,
                    {
                        hebrewFontBytes,
                        renderDpi: mapper.renderDpi || 300
                    }
                );

                // Show diagnostics if any issues
                const errorCount = result.diagnostics.filter(d =>
                    d.type === 'validation_error' || d.type === 'missing_value'
                ).length;

                if (errorCount > 0) {
                    showDiagnosticsDialog(result.diagnostics);
                }

                // Download PDF
                downloadPDF(result.pdfBytes, 'filled-form.pdf');

                showToast(`PDF ממולא נוצר בהצלחה (${errorCount} אזהרות)`, errorCount > 0 ? 'warning' : 'success');
            } catch (error) {
                console.error('❌ Fill error:', error);
                showToast(`שגיאה במילוי: ${error.message}`, 'error');
            }
        });
    }

    /**
     * Export filled PDF with custom form data
     * @param {Object} mapper - Mapper instance
     * @param {Object} formData - Custom form data
     */
    async function exportFilledPDFWithData(mapper, formData) {
        if (!mapper || !window.FillEngine) {
            throw new Error('Fill engine not loaded');
        }

        if (!mapper.pdfBytes) {
            throw new Error('No PDF loaded');
        }

        const mapping = mapper.getStep5ExportJSON ? mapper.getStep5ExportJSON() : {
            fields: mapper.fields || [],
            groups: mapper.optionGroups || [],
            tables: mapper.mappedTables || []
        };

        let hebrewFontBytes = null;
        if (window.FontManager) {
            hebrewFontBytes = await window.FontManager.loadHebrewFont();
        }

        const result = await window.FillEngine.fillPDF(
            mapper.pdfBytes,
            mapping,
            formData,
            {
                hebrewFontBytes,
                renderDpi: mapper.renderDpi || 300
            }
        );

        return result;
    }

    /**
     * Download PDF bytes as file
     * @param {Uint8Array} pdfBytes - PDF data
     * @param {string} filename - Output filename
     */
    function downloadPDF(pdfBytes, filename) {
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    }

    // ============ LIVE FILL SIMULATION ============

    /**
     * Run full live fill simulation
     * @param {Object} mapper - Mapper instance
     */
    function runFullLiveFillSimulation(mapper) {
        if (!mapper || !window.FillEngine || !window.PreviewEngine) {
            showToast('מנועי התצוגה לא נטענו', 'error');
            return;
        }

        const mapping = mapper.getStep5ExportJSON ? mapper.getStep5ExportJSON() : {
            fields: mapper.fields || [],
            groups: mapper.optionGroups || [],
            tables: mapper.mappedTables || []
        };

        // Generate sample data
        const formData = generateSampleFormData(mapping);

        // Activate preview mode if not already active
        if (!mapper.liveTablePreviewMode) {
            mapper.toggleLiveTablePreviewMode();
        }

        // Simulate fill for each table
        mapping.tables.forEach(table => {
            const tableData = formData[table.tableId] || [];
            const simulation = window.FillEngine.simulateFill(table, { [table.tableId]: tableData });

            // Update preview with real form data
            if (window.PreviewEngine && table._previewEnabled) {
                // Preview engine will use the mock data generation
                window.PreviewEngine.renderTablePreview(table, {
                    ...mapper.previewSettings,
                    formData: tableData
                });
            }
        });

        showToast('סימולציית מילוי פעילה', 'success');
    }

    // ============ DIALOGS ============

    /**
     * Show form data input dialog
     * @param {Object} mapping - Current mapping
     * @param {Function} onSubmit - Callback with form data
     */
    function showFormDataDialog(mapping, onSubmit) {
        // Remove existing dialog
        const existingDialog = document.getElementById('form-data-dialog');
        if (existingDialog) existingDialog.remove();

        // Generate sample data
        const sampleData = generateSampleFormData(mapping);

        // Create dialog
        const dialog = document.createElement('div');
        dialog.id = 'form-data-dialog';
        dialog.className = 'fill-dialog-overlay';
        dialog.innerHTML = `
            <div class="fill-dialog" style="max-width: ${UI_CONFIG.DIALOG_WIDTH};">
                <div class="fill-dialog-header">
                    <h3>💾 ייצוא PDF ממולא</h3>
                    <button class="dialog-close" onclick="document.getElementById('form-data-dialog').remove()">✕</button>
                </div>
                <div class="fill-dialog-body">
                    <div class="fill-dialog-tabs">
                        <button class="tab-btn active" onclick="switchFormDataTab('sample')">נתוני דוגמה</button>
                        <button class="tab-btn" onclick="switchFormDataTab('json')">JSON מותאם</button>
                    </div>

                    <div id="sample-tab" class="tab-content active">
                        <p class="tab-description">המערכת תמלא את הטופס עם נתונים לדוגמה אוטומטיים.</p>
                        <div class="sample-summary">
                            <div class="summary-item">
                                <span class="summary-label">שדות:</span>
                                <span class="summary-value">${mapping.fields?.length || 0}</span>
                            </div>
                            <div class="summary-item">
                                <span class="summary-label">קבוצות:</span>
                                <span class="summary-value">${mapping.groups?.length || 0}</span>
                            </div>
                            <div class="summary-item">
                                <span class="summary-label">טבלאות:</span>
                                <span class="summary-value">${mapping.tables?.length || 0}</span>
                            </div>
                        </div>
                    </div>

                    <div id="json-tab" class="tab-content" style="display: none;">
                        <p class="tab-description">הזן נתוני טופס בפורמט JSON:</p>
                        <textarea id="custom-json-input" class="json-input" rows="15">${JSON.stringify(sampleData, null, 2)}</textarea>
                        <div class="json-actions">
                            <button class="btn-small" onclick="formatJsonInput()">עיצוב JSON</button>
                            <button class="btn-small" onclick="validateJsonInput()">אמת JSON</button>
                        </div>
                    </div>
                </div>
                <div class="fill-dialog-footer">
                    <button class="btn-cancel" onclick="document.getElementById('form-data-dialog').remove()">ביטול</button>
                    <button class="btn-primary" id="export-filled-btn">💾 ייצא PDF</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Add tab switching function
        window.switchFormDataTab = function(tab) {
            document.querySelectorAll('.fill-dialog-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');

            if (tab === 'sample') {
                document.querySelector('.fill-dialog-tabs .tab-btn:first-child').classList.add('active');
                document.getElementById('sample-tab').style.display = 'block';
            } else {
                document.querySelector('.fill-dialog-tabs .tab-btn:last-child').classList.add('active');
                document.getElementById('json-tab').style.display = 'block';
            }
        };

        // JSON helpers
        window.formatJsonInput = function() {
            const input = document.getElementById('custom-json-input');
            try {
                const parsed = JSON.parse(input.value);
                input.value = JSON.stringify(parsed, null, 2);
                showToast('JSON מעוצב', 'success');
            } catch (e) {
                showToast('JSON לא תקין', 'error');
            }
        };

        window.validateJsonInput = function() {
            const input = document.getElementById('custom-json-input');
            try {
                JSON.parse(input.value);
                showToast('JSON תקין ✓', 'success');
            } catch (e) {
                showToast(`שגיאת JSON: ${e.message}`, 'error');
            }
        };

        // Export button handler
        document.getElementById('export-filled-btn').addEventListener('click', () => {
            const jsonTab = document.getElementById('json-tab');
            let formData;

            if (jsonTab.style.display !== 'none') {
                // Use custom JSON
                try {
                    formData = JSON.parse(document.getElementById('custom-json-input').value);
                } catch (e) {
                    showToast('JSON לא תקין', 'error');
                    return;
                }
            } else {
                // Use sample data
                formData = sampleData;
            }

            dialog.remove();
            onSubmit(formData);
        });

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    /**
     * Show diagnostics dialog
     * @param {Array} diagnostics - Diagnostics array
     */
    function showDiagnosticsDialog(diagnostics) {
        const existingDialog = document.getElementById('diagnostics-dialog');
        if (existingDialog) existingDialog.remove();

        const errors = diagnostics.filter(d => d.type === 'validation_error');
        const warnings = diagnostics.filter(d => d.type !== 'success' && d.type !== 'validation_error');
        const successes = diagnostics.filter(d => d.type === 'success');

        const dialog = document.createElement('div');
        dialog.id = 'diagnostics-dialog';
        dialog.className = 'fill-dialog-overlay';
        dialog.innerHTML = `
            <div class="fill-dialog">
                <div class="fill-dialog-header">
                    <h3>📊 דוח מילוי</h3>
                    <button class="dialog-close" onclick="document.getElementById('diagnostics-dialog').remove()">✕</button>
                </div>
                <div class="fill-dialog-body">
                    <div class="diagnostics-summary">
                        <div class="diag-stat success">
                            <span class="stat-value">${successes.length}</span>
                            <span class="stat-label">הצליחו</span>
                        </div>
                        <div class="diag-stat warning">
                            <span class="stat-value">${warnings.length}</span>
                            <span class="stat-label">אזהרות</span>
                        </div>
                        <div class="diag-stat error">
                            <span class="stat-value">${errors.length}</span>
                            <span class="stat-label">שגיאות</span>
                        </div>
                    </div>

                    ${errors.length > 0 ? `
                    <div class="diagnostics-section errors">
                        <h4>❌ שגיאות</h4>
                        <ul class="diagnostics-list">
                            ${errors.slice(0, UI_CONFIG.MAX_DIAGNOSTICS_DISPLAY).map(d => `
                                <li class="diag-item error">
                                    <span class="diag-field">${d.fieldId}</span>
                                    <span class="diag-message">${d.message}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                    ` : ''}

                    ${warnings.length > 0 ? `
                    <div class="diagnostics-section warnings">
                        <h4>⚠️ אזהרות</h4>
                        <ul class="diagnostics-list">
                            ${warnings.slice(0, UI_CONFIG.MAX_DIAGNOSTICS_DISPLAY).map(d => `
                                <li class="diag-item warning">
                                    <span class="diag-field">${d.fieldId}</span>
                                    <span class="diag-message">${d.message}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                    ` : ''}
                </div>
                <div class="fill-dialog-footer">
                    <button class="btn-primary" onclick="document.getElementById('diagnostics-dialog').remove()">סגור</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    // ============ TOAST HELPER ============

    /**
     * Show toast notification
     * @param {string} message - Message to show
     * @param {string} type - Toast type (success, warning, error, info)
     */
    function showToast(message, type = 'info') {
        // Use existing toast system if available
        if (window.Toast && window.Toast.show) {
            window.Toast.show(message, type);
            return;
        }

        if (window.mapper && window.mapper.showToast) {
            window.mapper.showToast(message, type);
            return;
        }

        // Fallback toast
        const container = document.getElementById('toast-container') || document.body;
        const toast = document.createElement('div');
        toast.className = `fill-toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ============ MAPPER INTEGRATION ============

    /**
     * Add fill engine buttons to mapper toolbar
     */
    function addToolbarButtons() {
        const toolbarGroup = document.querySelector('.toolbar-group:last-of-type');
        if (!toolbarGroup) return;

        // Check if buttons already exist
        if (document.getElementById('btn-export-filled')) return;

        const divider = document.createElement('div');
        divider.className = 'toolbar-divider';

        const exportBtn = document.createElement('button');
        exportBtn.id = 'btn-export-filled';
        exportBtn.className = 'btn-fill-export';
        exportBtn.title = 'ייצא PDF ממולא';
        exportBtn.textContent = '💾 ייצא PDF';
        exportBtn.onclick = () => exportFilledPDF(window.mapper);

        const simBtn = document.createElement('button');
        simBtn.id = 'btn-full-simulation';
        simBtn.className = 'btn-fill-simulation';
        simBtn.title = 'סימולציית מילוי מלאה';
        simBtn.textContent = '🧪 סימולציה';
        simBtn.onclick = () => runFullLiveFillSimulation(window.mapper);

        toolbarGroup.after(divider);
        divider.after(exportBtn);
        exportBtn.after(simBtn);
    }

    /**
     * Initialize fill engine UI
     */
    function initialize() {
        // Add toolbar buttons when DOM is ready
        if (document.readyState === 'complete') {
            addToolbarButtons();
        } else {
            window.addEventListener('load', addToolbarButtons);
        }
    }

    // ============ EXPORT ============

    window.FillEngineUI = {
        // Configuration
        config: UI_CONFIG,

        // Main functions
        exportFilledPDF,
        exportFilledPDFWithData,
        runFullLiveFillSimulation,

        // Sample data
        generateSampleFormData,
        generateSampleValue,

        // Dialogs
        showFormDataDialog,
        showDiagnosticsDialog,

        // Utilities
        downloadPDF,
        showToast,

        // Integration
        addToolbarButtons,
        initialize
    };

    // Auto-initialize
    initialize();

    console.log('%c🖥️ Fill Engine UI Module Loaded (Step 8)', 'background: #673AB7; color: white; font-size: 14px; padding: 5px;');
})();
