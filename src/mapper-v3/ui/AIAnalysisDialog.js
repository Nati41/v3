/**
 * AIAnalysisDialog - UI for AI-powered form analysis
 * V3.4: Allows users to configure AI and analyze PDF forms
 */

import { eventBus, Events } from '../core/EventBus.js';
import { aiService, AIProvider } from '../ai/AIService.js';
import { pdfEngine } from '../engines/PDFEngine.js';
import { templateStore } from '../core/TemplateStore.js';
import { state } from '../core/StateManager.js';
import { enhanceDialog, addDialogStyles } from './DialogUtils.js';

// V3.5: Field Intelligence imports
import { fieldIntelligenceStore } from '../core/FieldIntelligenceStore.js';
import { guidedMappingUI } from './GuidedMappingUI.js';

// Analysis modes
export const AnalysisMode = {
    QUICK: 'quick',           // Existing template analysis
    FULL: 'full'              // New Field Intelligence analysis
};

export class AIAnalysisDialog {
    constructor() {
        this.dialog = null;
        this.overlay = null;
        this.isOpen = false;
        this._currentPdfData = null;
        this._analysisMode = AnalysisMode.FULL;  // V3.5: Default to full analysis
        this._fieldIntelligenceResult = null;     // V3.5: Store Field Intelligence result
        this._existingAnalysis = null;            // V3.5: Cached existing analysis
    }

    /**
     * Initialize the dialog
     */
    init() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'ai-analysis-overlay';
        this.overlay.style.display = 'none';

        // Create dialog
        this.dialog = document.createElement('div');
        this.dialog.className = 'ai-analysis-dialog';
        this.dialog.innerHTML = `
            <div class="dialog-header">
                <h3>🤖 ניתוח טופס עם AI</h3>
                <button class="dialog-close" title="סגור">&times;</button>
            </div>
            <div class="dialog-body">
                <!-- Config Section -->
                <div class="ai-config-section" id="ai-config-section">
                    <div class="section-title">הגדרות API</div>

                    <div class="form-group">
                        <label>ספק AI</label>
                        <select id="ai-provider" class="ai-select">
                            <option value="claude">Claude (Anthropic)</option>
                            <option value="openai">OpenAI (GPT-4)</option>
                            <option value="custom">Custom Endpoint</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>API Key</label>
                        <input type="password" id="ai-api-key" class="ai-input" placeholder="sk-...">
                        <span class="field-hint">המפתח נשמר רק בזיכרון, לא בשרת</span>
                    </div>

                    <div class="form-group" id="ai-model-group">
                        <label>Model</label>
                        <select id="ai-model" class="ai-select">
                            <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                            <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                        </select>
                    </div>

                    <div class="form-group hidden" id="ai-endpoint-group">
                        <label>Custom Endpoint</label>
                        <input type="text" id="ai-endpoint" class="ai-input" placeholder="https://...">
                    </div>

                    <button id="btn-save-config" class="btn-primary">💾 שמור הגדרות</button>
                </div>

                <!-- Analysis Section -->
                <div class="ai-analysis-section" id="ai-analysis-section">
                    <div class="section-title">ניתוח הטופס</div>

                    <div class="pdf-info" id="pdf-info">
                        <span class="pdf-icon">📄</span>
                        <span class="pdf-name" id="pdf-name">לא נטען קובץ</span>
                        <span class="pdf-pages" id="pdf-pages"></span>
                    </div>

                    <!-- V3.5: Existing Analysis Found -->
                    <div class="existing-analysis-section hidden" id="existing-analysis-section">
                        <div class="existing-analysis-card">
                            <div class="existing-icon">✨</div>
                            <div class="existing-content">
                                <div class="existing-title">נמצא ניתוח קיים!</div>
                                <div class="existing-info">
                                    <span id="existing-form-name">-</span>
                                    <span class="existing-separator">•</span>
                                    <span id="existing-field-count">0</span> שדות
                                    <span class="existing-separator">•</span>
                                    <span id="existing-date">-</span>
                                </div>
                            </div>
                        </div>
                        <div class="existing-actions">
                            <button id="btn-use-existing" class="btn-primary btn-large">
                                🎯 השתמש בניתוח הקיים
                            </button>
                            <button id="btn-reanalyze" class="btn-secondary">
                                🔄 נתח מחדש
                            </button>
                        </div>
                    </div>

                    <!-- V3.5: Analysis Mode Selection -->
                    <div class="analysis-mode-section" id="analysis-mode-section">
                        <div class="mode-option selected" data-mode="full">
                            <div class="mode-radio"></div>
                            <div class="mode-content">
                                <div class="mode-title">🎯 ניתוח מקיף (מומלץ)</div>
                                <div class="mode-desc">מדריך שדות מלא עם הסברים, תלויות וצ'קליסט מסמכים. כולל מיפוי מודרך.</div>
                            </div>
                        </div>
                        <div class="mode-option" data-mode="quick">
                            <div class="mode-radio"></div>
                            <div class="mode-content">
                                <div class="mode-title">⚡ ניתוח מהיר</div>
                                <div class="mode-desc">רק מבנה שדות בסיסי למיפוי ידני. מהיר יותר אך בלי הנחיות.</div>
                            </div>
                        </div>
                    </div>

                    <div class="analysis-status" id="analysis-status">
                        <div class="status-icon" id="status-icon">⏳</div>
                        <div class="status-message" id="status-message">ממתין להתחלה...</div>
                        <div class="progress-bar" id="progress-bar">
                            <div class="progress-fill" id="progress-fill"></div>
                        </div>
                    </div>

                    <button id="btn-analyze" class="btn-primary btn-large" disabled>
                        🎯 ניתוח מקיף עם AI
                    </button>
                </div>

                <!-- Results Section -->
                <div class="ai-results-section hidden" id="ai-results-section">
                    <div class="section-title">תוצאות הניתוח</div>

                    <div class="results-summary" id="results-summary">
                        <div class="summary-item">
                            <span class="summary-label">שם הטופס:</span>
                            <span class="summary-value" id="result-form-name">-</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-label">ישויות:</span>
                            <span class="summary-value" id="result-entities">-</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-label">שדות:</span>
                            <span class="summary-value" id="result-fields">-</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-label">רמת ביטחון:</span>
                            <span class="summary-value" id="result-confidence">-</span>
                        </div>
                    </div>

                    <div class="warnings-section hidden" id="warnings-section">
                        <div class="warnings-header">
                            <span class="warning-icon">⚠️</span>
                            <span>אזהרות AI</span>
                        </div>
                        <ul class="warnings-list" id="warnings-list"></ul>
                    </div>

                    <div class="results-preview" id="results-preview">
                        <div class="preview-header">
                            <span>תצוגה מקדימה של JSON</span>
                            <button id="btn-copy-json" class="btn-small">📋 העתק</button>
                        </div>
                        <pre id="json-preview"></pre>
                    </div>

                    <!-- V3.5: Actions for Quick mode -->
                    <div class="results-actions" id="quick-mode-actions">
                        <button id="btn-import-result" class="btn-primary btn-large">
                            ✅ ייבא תבנית
                        </button>
                        <button id="btn-retry-analysis" class="btn-secondary">
                            🔄 נתח שוב
                        </button>
                    </div>

                    <!-- V3.5: Actions for Full mode (Guided Mapping) -->
                    <div class="guided-mapping-section hidden" id="guided-mapping-section">
                        <button id="btn-start-guided" class="btn-guided btn-large">
                            🎯 התחל מיפוי מודרך
                        </button>
                        <div class="guided-hint">
                            השדות יוצגו אחד-אחד והמערכת תדריך אותך במיפוי
                        </div>
                        <button id="btn-retry-analysis-full" class="btn-secondary" style="margin-top: 12px; width: 100%;">
                            🔄 נתח שוב
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        this._addStyles();

        // Add to DOM
        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);

        // Setup listeners
        this._setupListeners();

        // Add drag functionality
        addDialogStyles();
        this._dialogEnhancer = enhanceDialog(this.dialog);

        console.log('[AIAnalysisDialog] Initialized');
    }

    /**
     * Setup event listeners
     */
    _setupListeners() {
        // Close button
        this.dialog.querySelector('.dialog-close').addEventListener('click', () => this.hide());

        // Overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });

        // ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.hide();
        });

        // Provider change
        this.dialog.querySelector('#ai-provider').addEventListener('change', (e) => {
            this._onProviderChange(e.target.value);
        });

        // Save config
        this.dialog.querySelector('#btn-save-config').addEventListener('click', () => {
            this._saveConfig();
        });

        // Analyze button
        this.dialog.querySelector('#btn-analyze').addEventListener('click', () => {
            this._startAnalysis();
        });

        // Copy JSON
        this.dialog.querySelector('#btn-copy-json').addEventListener('click', () => {
            this._copyJsonToClipboard();
        });

        // Import result
        this.dialog.querySelector('#btn-import-result').addEventListener('click', () => {
            this._importResult();
        });

        // Retry analysis
        this.dialog.querySelector('#btn-retry-analysis').addEventListener('click', () => {
            this._showAnalysisSection();
        });

        // V3.5: Mode selection
        this.dialog.querySelectorAll('.mode-option').forEach(option => {
            option.addEventListener('click', () => {
                this._selectMode(option.dataset.mode);
            });
        });

        // V3.5: Start guided mapping
        this.dialog.querySelector('#btn-start-guided').addEventListener('click', () => {
            this._startGuidedMapping();
        });

        // V3.5: Retry analysis for full mode
        this.dialog.querySelector('#btn-retry-analysis-full').addEventListener('click', () => {
            this._showAnalysisSection();
        });

        // V3.5: Use existing analysis
        this.dialog.querySelector('#btn-use-existing').addEventListener('click', () => {
            this._useExistingAnalysis();
        });

        // V3.5: Re-analyze (ignore existing)
        this.dialog.querySelector('#btn-reanalyze').addEventListener('click', () => {
            this._showNewAnalysisOptions();
        });
    }

    /**
     * Add component styles
     */
    _addStyles() {
        if (document.getElementById('ai-analysis-dialog-styles')) return;

        const style = document.createElement('style');
        style.id = 'ai-analysis-dialog-styles';
        style.textContent = `
            .ai-analysis-overlay {
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
                backdrop-filter: blur(2px);
            }

            .ai-analysis-dialog {
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                width: 500px;
                max-width: 90vw;
                max-height: 90vh;
                overflow: hidden;
                direction: rtl;
            }

            .ai-analysis-dialog .dialog-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                color: white;
            }

            .ai-analysis-dialog .dialog-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }

            .ai-analysis-dialog .dialog-close {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                opacity: 0.8;
            }

            .ai-analysis-dialog .dialog-close:hover {
                opacity: 1;
            }

            .ai-analysis-dialog .dialog-body {
                padding: 20px;
                max-height: calc(90vh - 60px);
                overflow-y: auto;
            }

            .section-title {
                font-size: 14px;
                font-weight: 600;
                color: #374151;
                margin-bottom: 16px;
                padding-bottom: 8px;
                border-bottom: 1px solid #e5e7eb;
            }

            .ai-analysis-dialog .form-group {
                margin-bottom: 16px;
            }

            .ai-analysis-dialog .form-group label {
                display: block;
                font-size: 13px;
                font-weight: 500;
                color: #374151;
                margin-bottom: 6px;
            }

            .ai-input, .ai-select {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font-size: 14px;
                direction: ltr;
            }

            .ai-input:focus, .ai-select:focus {
                outline: none;
                border-color: #6366f1;
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
            }

            .field-hint {
                display: block;
                font-size: 11px;
                color: #9ca3af;
                margin-top: 4px;
            }

            .btn-primary {
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }

            .btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            }

            .btn-primary:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }

            .btn-secondary {
                background: #f3f4f6;
                color: #374151;
                border: 1px solid #d1d5db;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
            }

            .btn-large {
                width: 100%;
                padding: 14px 20px;
                font-size: 16px;
            }

            .btn-small {
                padding: 4px 8px;
                font-size: 12px;
                background: #f3f4f6;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                cursor: pointer;
            }

            /* PDF Info */
            .pdf-info {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                background: #f9fafb;
                border-radius: 8px;
                margin-bottom: 16px;
            }

            .pdf-icon {
                font-size: 24px;
            }

            .pdf-name {
                flex: 1;
                font-weight: 500;
                color: #374151;
            }

            .pdf-pages {
                font-size: 12px;
                color: #6b7280;
                background: #e5e7eb;
                padding: 2px 8px;
                border-radius: 10px;
            }

            /* Analysis Status */
            .analysis-status {
                text-align: center;
                padding: 20px;
                margin-bottom: 16px;
            }

            .status-icon {
                font-size: 48px;
                margin-bottom: 12px;
            }

            .status-message {
                font-size: 14px;
                color: #6b7280;
                margin-bottom: 16px;
            }

            .progress-bar {
                height: 6px;
                background: #e5e7eb;
                border-radius: 3px;
                overflow: hidden;
            }

            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #6366f1, #8b5cf6);
                width: 0%;
                transition: width 0.3s ease;
            }

            /* Results */
            .ai-results-section {
                margin-top: 20px;
            }

            .results-summary {
                background: #f0fdf4;
                border: 1px solid #86efac;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
            }

            .summary-item {
                display: flex;
                justify-content: space-between;
                padding: 4px 0;
            }

            .summary-label {
                color: #166534;
                font-weight: 500;
            }

            .summary-value {
                color: #15803d;
            }

            .results-preview {
                background: #1f2937;
                border-radius: 8px;
                overflow: hidden;
                margin-bottom: 16px;
            }

            .preview-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: #374151;
                color: #d1d5db;
                font-size: 12px;
            }

            #json-preview {
                margin: 0;
                padding: 12px;
                color: #a5f3fc;
                font-size: 11px;
                max-height: 200px;
                overflow-y: auto;
                direction: ltr;
                text-align: left;
            }

            .results-actions {
                display: flex;
                gap: 12px;
            }

            .results-actions .btn-primary {
                flex: 2;
            }

            .results-actions .btn-secondary {
                flex: 1;
            }

            .hidden {
                display: none !important;
            }

            .ai-config-section,
            .ai-analysis-section {
                margin-bottom: 20px;
            }

            /* Confidence indicator */
            .confidence-high {
                color: #059669;
                font-weight: 600;
            }

            .confidence-medium {
                color: #d97706;
                font-weight: 600;
            }

            .confidence-low {
                color: #dc2626;
                font-weight: 600;
            }

            /* Warnings section */
            .warnings-section {
                background: #fef3c7;
                border: 1px solid #fbbf24;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 16px;
            }

            .warnings-header {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                color: #92400e;
                margin-bottom: 8px;
            }

            .warning-icon {
                font-size: 16px;
            }

            .warnings-list {
                margin: 0;
                padding-right: 20px;
                font-size: 13px;
                color: #78350f;
            }

            .warnings-list li {
                margin-bottom: 4px;
            }

            .warning-tag {
                display: inline-block;
                background: #fef3c7;
                border: 1px solid #fbbf24;
                color: #92400e;
                font-size: 11px;
                padding: 2px 6px;
                border-radius: 4px;
                margin-left: 4px;
            }

            /* V3.5: Analysis Mode Selection */
            .analysis-mode-section {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-bottom: 16px;
            }

            .mode-option {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 12px 14px;
                background: #f9fafb;
                border: 2px solid #e5e7eb;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .mode-option:hover {
                background: #f3f4f6;
                border-color: #d1d5db;
            }

            .mode-option.selected {
                background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%);
                border-color: #6366f1;
            }

            .mode-radio {
                width: 18px;
                height: 18px;
                border: 2px solid #d1d5db;
                border-radius: 50%;
                flex-shrink: 0;
                margin-top: 2px;
                position: relative;
                transition: all 0.2s ease;
            }

            .mode-option.selected .mode-radio {
                border-color: #6366f1;
            }

            .mode-option.selected .mode-radio::after {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 10px;
                height: 10px;
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                border-radius: 50%;
            }

            .mode-content {
                flex: 1;
            }

            .mode-title {
                font-weight: 600;
                color: #374151;
                font-size: 14px;
                margin-bottom: 4px;
            }

            .mode-option.selected .mode-title {
                color: #4f46e5;
            }

            .mode-desc {
                font-size: 12px;
                color: #6b7280;
                line-height: 1.4;
            }

            /* V3.5: Guided Mapping Section */
            .guided-mapping-section {
                margin-top: 16px;
                padding-top: 16px;
            }

            .guided-divider {
                display: flex;
                align-items: center;
                margin-bottom: 16px;
            }

            .guided-divider::before,
            .guided-divider::after {
                content: '';
                flex: 1;
                height: 1px;
                background: #e5e7eb;
            }

            .guided-divider span {
                padding: 0 12px;
                color: #9ca3af;
                font-size: 13px;
            }

            .btn-guided {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                border: none;
                padding: 14px 20px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                width: 100%;
            }

            .btn-guided:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
            }

            .guided-hint {
                margin-top: 10px;
                text-align: center;
                font-size: 12px;
                color: #6b7280;
            }

            /* Full analysis result styling */
            .full-analysis-badge {
                display: inline-block;
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                color: white;
                font-size: 10px;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 10px;
                margin-right: 8px;
            }

            /* V3.5: Existing Analysis Section */
            .existing-analysis-section {
                margin-bottom: 16px;
            }

            .existing-analysis-card {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 16px;
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%);
                border: 2px solid #10b981;
                border-radius: 12px;
                margin-bottom: 12px;
            }

            .existing-icon {
                font-size: 32px;
            }

            .existing-content {
                flex: 1;
            }

            .existing-title {
                font-size: 16px;
                font-weight: 600;
                color: #047857;
                margin-bottom: 4px;
            }

            .existing-info {
                font-size: 13px;
                color: #065f46;
            }

            .existing-separator {
                margin: 0 6px;
                opacity: 0.5;
            }

            .existing-actions {
                display: flex;
                gap: 10px;
            }

            .existing-actions .btn-primary {
                flex: 2;
            }

            .existing-actions .btn-secondary {
                flex: 1;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Handle provider change
     */
    _onProviderChange(provider) {
        const modelGroup = this.dialog.querySelector('#ai-model-group');
        const endpointGroup = this.dialog.querySelector('#ai-endpoint-group');
        const modelSelect = this.dialog.querySelector('#ai-model');

        // Update model options based on provider
        if (provider === 'claude') {
            modelSelect.innerHTML = `
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
            `;
            modelGroup.classList.remove('hidden');
            endpointGroup.classList.add('hidden');
        } else if (provider === 'openai') {
            modelSelect.innerHTML = `
                <option value="gpt-4-vision-preview">GPT-4 Vision</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
            `;
            modelGroup.classList.remove('hidden');
            endpointGroup.classList.add('hidden');
        } else {
            modelGroup.classList.add('hidden');
            endpointGroup.classList.remove('hidden');
        }
    }

    /**
     * Save AI configuration
     */
    _saveConfig() {
        const provider = this.dialog.querySelector('#ai-provider').value;
        const apiKey = this.dialog.querySelector('#ai-api-key').value;
        const model = this.dialog.querySelector('#ai-model').value;
        const endpoint = this.dialog.querySelector('#ai-endpoint').value;

        if (!apiKey) {
            this._showToast('יש להזין API Key', 'warning');
            return;
        }

        aiService.configure({
            provider,
            apiKey,
            model,
            endpoint: endpoint || null
        });

        this._showToast('ההגדרות נשמרו', 'success');
        this._updateAnalyzeButton();
    }

    /**
     * Update analyze button state
     */
    _updateAnalyzeButton() {
        const btn = this.dialog.querySelector('#btn-analyze');
        const hasPdf = pdfEngine.isLoaded();
        const hasConfig = aiService.isConfigured();

        btn.disabled = !hasPdf || !hasConfig;

        // V3.5: Use mode-aware button text
        this._updateAnalyzeButtonText();
    }

    /**
     * Start analysis
     */
    async _startAnalysis() {
        const btn = this.dialog.querySelector('#btn-analyze');
        btn.disabled = true;

        try {
            // Get PDF data
            const pdfData = pdfEngine.getPdfData();
            if (!pdfData) {
                throw new Error('לא נמצא קובץ PDF');
            }

            // Update UI
            this._updateProgress('preparing', 10);

            // V3.5: Choose analysis method based on mode
            if (this._analysisMode === AnalysisMode.FULL) {
                await this._runFullAnalysis(pdfData);
            } else {
                await this._runQuickAnalysis(pdfData);
            }

        } catch (error) {
            console.error('[AIAnalysisDialog] Analysis failed:', error);
            this._showError(error.message);
        } finally {
            btn.disabled = false;
            this._updateAnalyzeButton();
        }
    }

    /**
     * V3.5: Run full Field Intelligence analysis
     */
    async _runFullAnalysis(pdfData) {
        const result = await aiService.generateFieldIntelligence(pdfData, {
            pageCount: pdfEngine.getPageCount(),
            fileName: pdfEngine.getFileName(),
            onProgress: (progress) => {
                const stages = {
                    preparing: 20,
                    analyzing: 50,
                    parsing: 80,
                    validating: 90,
                    complete: 100
                };
                this._updateProgress(progress.stage, stages[progress.stage] || 50);
                this.dialog.querySelector('#status-message').textContent = progress.message;
            }
        });

        if (!result.success) {
            throw new Error(result.error || 'ניתוח מקיף נכשל');
        }

        // Store Field Intelligence result
        this._fieldIntelligenceResult = result.intelligence;
        this._analysisResult = null;

        // V3.5: Ensure form ID is set based on filename for caching
        const fileName = pdfEngine.getFileName();
        if (fileName && result.intelligence) {
            const formId = this._generateFormId(fileName);
            console.log(`[AIAnalysisDialog] Preparing to save with form ID: "${formId}"`);

            // Update the form.id in the intelligence if not already set correctly
            if (result.intelligence.form) {
                result.intelligence.form.id = formId;
            }
            // Save to IndexedDB for future use
            const saveResult = await fieldIntelligenceStore.save(result.intelligence);
            if (saveResult.success) {
                console.log(`[AIAnalysisDialog] ✅ Saved Field Intelligence with ID: ${formId}`);
            } else {
                console.error(`[AIAnalysisDialog] ❌ Failed to save Field Intelligence: ${saveResult.error}`);
            }
        } else {
            console.warn('[AIAnalysisDialog] Could not save - missing fileName or intelligence');
        }

        // Show full analysis results
        this._showFullAnalysisResults(result);
    }

    /**
     * V3.5: Run quick template analysis (existing method)
     */
    async _runQuickAnalysis(pdfData) {
        const result = await aiService.analyzeForm(pdfData, {
            pageCount: pdfEngine.getPageCount(),
            onProgress: (progress) => {
                const stages = {
                    preparing: 20,
                    analyzing: 50,
                    parsing: 80,
                    converting: 90,
                    complete: 100
                };
                this._updateProgress(progress.stage, stages[progress.stage] || 50);
                this.dialog.querySelector('#status-message').textContent = progress.message;
            }
        });

        // Store result
        this._analysisResult = result;
        this._fieldIntelligenceResult = null;

        // Show quick analysis results
        this._showResults(result);
    }

    /**
     * V3.5: Show full Field Intelligence analysis results
     */
    _showFullAnalysisResults(result) {
        const resultsSection = this.dialog.querySelector('#ai-results-section');
        const analysisSection = this.dialog.querySelector('#ai-analysis-section');
        const guidedSection = this.dialog.querySelector('#guided-mapping-section');
        const quickModeActions = this.dialog.querySelector('#quick-mode-actions');

        const intelligence = result.intelligence;

        // V3.5: Hide quick mode actions, show guided mapping section
        quickModeActions.classList.add('hidden');

        // Update summary
        this.dialog.querySelector('#result-form-name').textContent =
            intelligence.form?.name_he || intelligence.form?.name_en || '-';
        this.dialog.querySelector('#result-entities').textContent =
            `${intelligence.sections?.length || 0} מקטעים`;
        this.dialog.querySelector('#result-fields').textContent =
            result.fieldCount || intelligence.fields?.length || 0;

        // Update confidence display
        const confidenceEl = this.dialog.querySelector('#result-confidence');
        const confidence = result.confidence;
        if (confidence !== null && confidence !== undefined) {
            const percent = Math.round(confidence * 100);
            confidenceEl.textContent = `${percent}%`;
            confidenceEl.className = 'summary-value';
            if (confidence >= 0.85) {
                confidenceEl.classList.add('confidence-high');
            } else if (confidence >= 0.7) {
                confidenceEl.classList.add('confidence-medium');
            } else {
                confidenceEl.classList.add('confidence-low');
            }
        } else {
            confidenceEl.textContent = '-';
            confidenceEl.className = 'summary-value';
        }

        // Hide warnings for full analysis (no warnings structure in Field Intelligence)
        const warningsSection = this.dialog.querySelector('#warnings-section');
        warningsSection.classList.add('hidden');

        // Update JSON preview
        const preview = this.dialog.querySelector('#json-preview');
        preview.textContent = JSON.stringify(intelligence, null, 2);

        // Show guided mapping section (only for full analysis)
        guidedSection.classList.remove('hidden');

        // Show results section
        analysisSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');

        console.log(`[AIAnalysisDialog] Full analysis complete: ${result.fieldCount} fields`);
    }

    /**
     * Update progress display
     */
    _updateProgress(stage, percent) {
        const fill = this.dialog.querySelector('#progress-fill');
        const icon = this.dialog.querySelector('#status-icon');

        fill.style.width = `${percent}%`;

        if (percent < 100) {
            icon.textContent = '⏳';
        } else {
            icon.textContent = '✅';
        }
    }

    /**
     * Show analysis results (quick mode)
     */
    _showResults(result) {
        const resultsSection = this.dialog.querySelector('#ai-results-section');
        const analysisSection = this.dialog.querySelector('#ai-analysis-section');
        const guidedSection = this.dialog.querySelector('#guided-mapping-section');
        const quickModeActions = this.dialog.querySelector('#quick-mode-actions');

        // Update summary
        this.dialog.querySelector('#result-form-name').textContent =
            result.template.meta?.form_name_he || result.template.meta?.form_name || '-';
        this.dialog.querySelector('#result-entities').textContent =
            result.template.entities?.length || 0;
        this.dialog.querySelector('#result-fields').textContent =
            result.template.fields?.length || 0;

        // V3.5: Show quick mode actions, hide guided mapping section
        quickModeActions.classList.remove('hidden');
        guidedSection.classList.add('hidden');

        // Update confidence display
        const confidenceEl = this.dialog.querySelector('#result-confidence');
        const confidence = result.confidence;
        if (confidence !== null && confidence !== undefined) {
            const percent = Math.round(confidence * 100);
            confidenceEl.textContent = `${percent}%`;
            // Add color class based on confidence level
            confidenceEl.className = 'summary-value';
            if (confidence >= 0.85) {
                confidenceEl.classList.add('confidence-high');
            } else if (confidence >= 0.7) {
                confidenceEl.classList.add('confidence-medium');
            } else {
                confidenceEl.classList.add('confidence-low');
            }
        } else {
            confidenceEl.textContent = '-';
            confidenceEl.className = 'summary-value';
        }

        // Update warnings display
        const warningsSection = this.dialog.querySelector('#warnings-section');
        const warningsList = this.dialog.querySelector('#warnings-list');
        const warnings = result.warnings || [];

        if (warnings.length > 0) {
            warningsList.innerHTML = warnings.map(w => {
                const warningText = this._translateWarning(w);
                return `<li>${warningText}</li>`;
            }).join('');
            warningsSection.classList.remove('hidden');
        } else {
            warningsSection.classList.add('hidden');
        }

        // Update JSON preview
        const preview = this.dialog.querySelector('#json-preview');
        preview.textContent = JSON.stringify(result.rawResponse, null, 2);

        // Show results section
        analysisSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
    }

    /**
     * Translate warning codes to Hebrew
     */
    _translateWarning(warning) {
        const translations = {
            'ambiguous_duplicate': 'זוהו שדות שלא ברור אם הם כפילויות או שדות נפרדים',
            'possible_table': 'זוהה מבנה שעשוי להיות טבלה',
            'unclear_type': 'סוג שדה מסוים לא היה ברור',
            'missing_hebrew': 'חלק מהתוויות בעברית לא נקראו',
            'unusual_structure': 'לטופס מבנה לא סטנדרטי'
        };

        // Check for low confidence warning
        if (warning.startsWith('low_confidence:')) {
            const conf = warning.split(':')[1].trim();
            return `רמת ביטחון נמוכה: ${Math.round(parseFloat(conf) * 100)}%`;
        }

        // Check for field-specific warnings
        if (warning.startsWith('Field "')) {
            return warning; // Keep as-is for now
        }

        return translations[warning] || warning;
    }

    /**
     * Show analysis section (hide results)
     */
    _showAnalysisSection() {
        const resultsSection = this.dialog.querySelector('#ai-results-section');
        const analysisSection = this.dialog.querySelector('#ai-analysis-section');
        const warningsSection = this.dialog.querySelector('#warnings-section');
        const guidedSection = this.dialog.querySelector('#guided-mapping-section');
        const quickModeActions = this.dialog.querySelector('#quick-mode-actions');
        const existingSection = this.dialog.querySelector('#existing-analysis-section');
        const modeSection = this.dialog.querySelector('#analysis-mode-section');
        const statusSection = this.dialog.querySelector('#analysis-status');
        const analyzeBtn = this.dialog.querySelector('#btn-analyze');

        resultsSection.classList.add('hidden');
        analysisSection.classList.remove('hidden');
        warningsSection?.classList.add('hidden');
        guidedSection?.classList.add('hidden');
        quickModeActions?.classList.add('hidden');

        // V3.5: Hide existing analysis section, show mode selection
        existingSection?.classList.add('hidden');
        modeSection?.classList.remove('hidden');
        statusSection?.classList.remove('hidden');
        analyzeBtn?.classList.remove('hidden');

        // Reset progress
        this._updateProgress('idle', 0);
        this.dialog.querySelector('#status-message').textContent = 'ממתין להתחלה...';
        this.dialog.querySelector('#status-icon').textContent = '⏳';
    }

    /**
     * Show error message
     */
    _showError(message) {
        this.dialog.querySelector('#status-icon').textContent = '❌';
        this.dialog.querySelector('#status-message').textContent = `שגיאה: ${message}`;
        this._updateProgress('error', 0);
    }

    /**
     * Copy JSON to clipboard
     */
    async _copyJsonToClipboard() {
        const json = this.dialog.querySelector('#json-preview').textContent;
        try {
            await navigator.clipboard.writeText(json);
            this._showToast('JSON הועתק ללוח', 'success');
        } catch (e) {
            this._showToast('שגיאה בהעתקה', 'error');
        }
    }

    /**
     * Import result as template
     */
    _importResult() {
        if (!this._analysisResult?.template) {
            this._showToast('אין תוצאות לייבוא', 'warning');
            return;
        }

        try {
            // Load template into store
            templateStore.loadTemplate(this._analysisResult.template);

            // Import fields to state from templateStore
            const fieldCount = this._analysisResult.template.fields?.length || 0;
            state.importTemplateFields(templateStore);

            this._showToast(`יובאו ${fieldCount} שדות בהצלחה!`, 'success');
            this.hide();

            // Emit event
            eventBus.emit('template:imported', {
                templateId: this._analysisResult?.template?.templateId || 'unknown',
                fieldCount: fieldCount
            });

        } catch (error) {
            console.error('[AIAnalysisDialog] Import failed:', error);
            this._showToast('שגיאה בייבוא: ' + error.message, 'error');
        }
    }

    /**
     * Show toast message
     */
    _showToast(message, type = 'info') {
        eventBus.emit(Events.TOAST_SHOW, { message, type });
    }

    // ═══════════════════════════════════════════════════════════════
    // V3.5: MODE SELECTION AND GUIDED MAPPING
    // ═══════════════════════════════════════════════════════════════

    /**
     * Select analysis mode
     * @param {string} mode - 'full' or 'quick'
     */
    _selectMode(mode) {
        this._analysisMode = mode;

        // Update UI
        this.dialog.querySelectorAll('.mode-option').forEach(option => {
            if (option.dataset.mode === mode) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });

        // Update button text
        this._updateAnalyzeButtonText();

        console.log(`[AIAnalysisDialog] Mode selected: ${mode}`);
    }

    /**
     * Update analyze button text based on mode
     */
    _updateAnalyzeButtonText() {
        const btn = this.dialog.querySelector('#btn-analyze');
        const hasPdf = pdfEngine.isLoaded();
        const hasConfig = aiService.isConfigured();

        if (!hasPdf) {
            btn.textContent = '📄 יש לטעון PDF קודם';
        } else if (!hasConfig) {
            btn.textContent = '🔑 יש להגדיר API Key';
        } else if (this._analysisMode === AnalysisMode.FULL) {
            btn.textContent = '🎯 ניתוח מקיף עם AI';
        } else {
            btn.textContent = '⚡ ניתוח מהיר עם AI';
        }
    }

    /**
     * Start guided mapping mode
     */
    _startGuidedMapping() {
        if (!this._fieldIntelligenceResult) {
            this._showToast('אין נתוני ניתוח מקיף', 'warning');
            return;
        }

        // Set field intelligence as current
        fieldIntelligenceStore.setCurrent(this._fieldIntelligenceResult);

        // Close dialog
        this.hide();

        // Activate guided mapping UI
        guidedMappingUI.activate();

        this._showToast('מיפוי מודרך הופעל - צייר את השדה הראשון', 'success');

        console.log('[AIAnalysisDialog] Started guided mapping');
    }

    /**
     * Show the dialog
     */
    async show() {
        // Update PDF info
        if (pdfEngine.isLoaded()) {
            this.dialog.querySelector('#pdf-name').textContent = pdfEngine.getFileName() || 'קובץ PDF';
            this.dialog.querySelector('#pdf-pages').textContent = `${pdfEngine.getPageCount()} עמודים`;
        } else {
            this.dialog.querySelector('#pdf-name').textContent = 'לא נטען קובץ';
            this.dialog.querySelector('#pdf-pages').textContent = '';
        }

        // Load current config
        const config = aiService.getConfig();
        this.dialog.querySelector('#ai-provider').value = config.provider || 'claude';
        this._onProviderChange(config.provider || 'claude');
        if (config.model) {
            this.dialog.querySelector('#ai-model').value = config.model;
        }

        // V3.5: Initialize mode selection (default to full)
        this._selectMode(AnalysisMode.FULL);

        // Update button state
        this._updateAnalyzeButton();

        // V3.5: Check for existing analysis before showing options
        const existingAnalysis = await this._checkForExistingAnalysis();
        if (existingAnalysis) {
            this._showExistingAnalysisOption(existingAnalysis);
        } else {
            // Show analysis section (reset state)
            this._showAnalysisSection();
        }

        // Show dialog
        this.overlay.style.display = 'flex';
        this.isOpen = true;

        console.log('[AIAnalysisDialog] Opened');
    }

    /**
     * V3.5: Check if we have existing Field Intelligence for this PDF
     * @returns {Promise<Object|null>} Existing analysis or null
     */
    async _checkForExistingAnalysis() {
        if (!pdfEngine.isLoaded()) {
            console.log('[AIAnalysisDialog] No PDF loaded, skipping existing analysis check');
            return null;
        }

        // Generate form ID from filename
        const fileName = pdfEngine.getFileName();
        if (!fileName) {
            console.log('[AIAnalysisDialog] No filename, skipping existing analysis check');
            return null;
        }

        // Create a form ID from the filename (remove extension, normalize)
        const formId = this._generateFormId(fileName);
        console.log(`[AIAnalysisDialog] Looking for existing analysis with ID: "${formId}"`);

        try {
            const existing = await fieldIntelligenceStore.load(formId);
            if (existing) {
                console.log(`[AIAnalysisDialog] ✅ Found existing analysis for: ${formId}`, {
                    fields: existing.fields?.length || 0,
                    generated: existing.$generated
                });
                return existing;
            } else {
                console.log(`[AIAnalysisDialog] No existing analysis found for: ${formId}`);
            }
        } catch (error) {
            console.error('[AIAnalysisDialog] Error checking for existing analysis:', error);
        }

        return null;
    }

    /**
     * V3.5: Generate a form ID from filename
     * @param {string} fileName - PDF filename
     * @returns {string} Form ID
     */
    _generateFormId(fileName) {
        // Remove extension and normalize
        return fileName
            .replace(/\.pdf$/i, '')
            .replace(/[^a-zA-Z0-9א-ת_-]/g, '_')
            .toLowerCase();
    }

    /**
     * V3.5: Show existing analysis option
     * @param {Object} existingAnalysis - Existing Field Intelligence data
     */
    _showExistingAnalysisOption(existingAnalysis) {
        this._existingAnalysis = existingAnalysis;

        const existingSection = this.dialog.querySelector('#existing-analysis-section');
        const modeSection = this.dialog.querySelector('#analysis-mode-section');
        const statusSection = this.dialog.querySelector('#analysis-status');
        const analyzeBtn = this.dialog.querySelector('#btn-analyze');
        const resultsSection = this.dialog.querySelector('#ai-results-section');

        // Update existing analysis info
        this.dialog.querySelector('#existing-form-name').textContent =
            existingAnalysis.form?.name_he || existingAnalysis.form?.name_en || 'טופס';
        this.dialog.querySelector('#existing-field-count').textContent =
            existingAnalysis.fields?.length || 0;

        // Format date
        const generatedDate = existingAnalysis.$generated ?
            new Date(existingAnalysis.$generated).toLocaleDateString('he-IL') : '-';
        this.dialog.querySelector('#existing-date').textContent = generatedDate;

        // Show existing analysis section, hide others
        existingSection.classList.remove('hidden');
        modeSection.classList.add('hidden');
        statusSection.classList.add('hidden');
        analyzeBtn.classList.add('hidden');
        resultsSection.classList.add('hidden');

        console.log('[AIAnalysisDialog] Showing existing analysis option');
    }

    /**
     * V3.5: Use existing analysis (skip to guided mapping)
     */
    _useExistingAnalysis() {
        if (!this._existingAnalysis) {
            this._showToast('אין ניתוח קיים', 'warning');
            return;
        }

        // Set as current Field Intelligence
        this._fieldIntelligenceResult = this._existingAnalysis;
        fieldIntelligenceStore.setCurrent(this._existingAnalysis);

        // Close dialog and start guided mapping
        this.hide();
        guidedMappingUI.activate();

        this._showToast('מיפוי מודרך הופעל עם הניתוח הקיים', 'success');
        console.log('[AIAnalysisDialog] Using existing analysis for guided mapping');
    }

    /**
     * V3.5: Show new analysis options (hide existing analysis prompt)
     */
    _showNewAnalysisOptions() {
        this._existingAnalysis = null;

        const existingSection = this.dialog.querySelector('#existing-analysis-section');
        const modeSection = this.dialog.querySelector('#analysis-mode-section');
        const statusSection = this.dialog.querySelector('#analysis-status');
        const analyzeBtn = this.dialog.querySelector('#btn-analyze');

        // Hide existing, show new analysis options
        existingSection.classList.add('hidden');
        modeSection.classList.remove('hidden');
        statusSection.classList.remove('hidden');
        analyzeBtn.classList.remove('hidden');

        // Reset progress
        this._updateProgress('idle', 0);
        this.dialog.querySelector('#status-message').textContent = 'ממתין להתחלה...';
        this.dialog.querySelector('#status-icon').textContent = '⏳';

        console.log('[AIAnalysisDialog] Showing new analysis options');
    }

    /**
     * Hide the dialog
     */
    hide() {
        this.overlay.style.display = 'none';
        this.isOpen = false;
        this._analysisResult = null;
        // Note: Keep _fieldIntelligenceResult until guided mapping is complete
    }
}

// Singleton instance
export const aiAnalysisDialog = new AIAnalysisDialog();
