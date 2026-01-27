/**
 * ═══════════════════════════════════════════════════════════════
 * תיעוד בעברית - AIService
 * ═══════════════════════════════════════════════════════════════
 *
 * מה הקובץ עושה:
 *   מנהל תקשורת עם שירותי AI (Claude / OpenAI) לניתוח טפסים.
 *   שולח תמונת PDF + פרומפט → מקבל מבנה שדות מזוהה.
 *
 * מי משתמש בקובץ:
 *   - MapperCore.js - הפעלת ניתוח AI
 *   - FieldIntelligenceStore.js - שמירת תוצאות
 *
 * באיזה מצבים:
 *   מצב AI - כשהמשתמש מפעיל ניתוח (דורש API key)
 *
 * למה הוא קיים:
 *   מרכז את כל התקשורת עם AI במקום אחד.
 *   Singleton: export const aiService
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * AIService - AI Integration Service for Template Analysis
 * V3.4: Handles communication with AI APIs (Claude/OpenAI)
 *
 * Supports:
 * - Claude API (Anthropic)
 * - OpenAI API (GPT-4)
 * - Local/Custom endpoints
 */

import {
    TEMPLATE_ANALYZER_PROMPT,
    SYSTEM_MESSAGE,
    validateTemplateJson,
    strictValidateTemplateJson,
    convertToInternalFormat,
    getAnalyzerPrompt
} from './prompts/template-analyzer.js';

// V3.5: Field Intelligence imports
import {
    FIELD_INTELLIGENCE_SYSTEM,
    getFieldIntelligencePrompt,
    postProcessFieldIntelligence,
    validateFieldIntelligenceResponse
} from './prompts/field-intelligence-prompt.js';

import { validateFieldIntelligence } from './schemas/field-intelligence-schema.js';

// AI Provider types
export const AIProvider = {
    CLAUDE: 'claude',
    OPENAI: 'openai',
    CUSTOM: 'custom'
};

class AIService {
    constructor() {
        this._config = {
            provider: AIProvider.CLAUDE,
            apiKey: null,
            endpoint: null,
            model: 'claude-sonnet-4-20250514'
        };

        this._isAnalyzing = false;

        // Load saved config from localStorage
        this._loadConfig();
    }

    /**
     * Load configuration from localStorage
     */
    _loadConfig() {
        try {
            const saved = localStorage.getItem('mapper_ai_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                this._config = { ...this._config, ...parsed };
            }
        } catch (e) {
            console.warn('[AIService] Failed to load config:', e);
        }
    }

    /**
     * Save configuration to localStorage
     */
    _saveConfig() {
        try {
            // Don't save API key to localStorage for security
            const toSave = { ...this._config };
            delete toSave.apiKey;
            localStorage.setItem('mapper_ai_config', JSON.stringify(toSave));
        } catch (e) {
            console.warn('[AIService] Failed to save config:', e);
        }
    }

    /**
     * Configure the AI service
     * @param {Object} config - Configuration options
     * @param {string} config.provider - AI provider (claude/openai/custom)
     * @param {string} config.apiKey - API key
     * @param {string} config.endpoint - Custom endpoint URL (optional)
     * @param {string} config.model - Model name (optional)
     */
    configure(config) {
        this._config = { ...this._config, ...config };
        this._saveConfig();
        console.log('[AIService] Configured:', { provider: this._config.provider, model: this._config.model });
    }

    /**
     * Check if service is configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!this._config.apiKey;
    }

    /**
     * Get current configuration (without API key)
     * @returns {Object}
     */
    getConfig() {
        return {
            provider: this._config.provider,
            model: this._config.model,
            endpoint: this._config.endpoint,
            isConfigured: this.isConfigured()
        };
    }

    /**
     * Check if currently analyzing
     * @returns {boolean}
     */
    isAnalyzing() {
        return this._isAnalyzing;
    }

    /**
     * Analyze a PDF and extract template
     * @param {ArrayBuffer|Blob|string} pdfData - PDF data or base64 string
     * @param {Object} options - Analysis options
     * @param {string} options.formName - Optional form name hint
     * @param {number} options.pageCount - Number of pages
     * @param {Function} options.onProgress - Progress callback
     * @returns {Promise<Object>} Template JSON
     */
    async analyzeForm(pdfData, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('AI service not configured. Please set API key.');
        }

        if (this._isAnalyzing) {
            throw new Error('Analysis already in progress.');
        }

        this._isAnalyzing = true;

        try {
            options.onProgress?.({ stage: 'preparing', message: 'מכין את הקובץ לניתוח...' });

            // Convert PDF to base64 if needed
            let pdfBase64;
            if (typeof pdfData === 'string') {
                pdfBase64 = pdfData;
            } else if (pdfData instanceof Blob) {
                pdfBase64 = await this._blobToBase64(pdfData);
            } else if (pdfData instanceof ArrayBuffer) {
                pdfBase64 = this._arrayBufferToBase64(pdfData);
            } else {
                throw new Error('Invalid PDF data format');
            }

            options.onProgress?.({ stage: 'analyzing', message: 'שולח ל-AI לניתוח...' });

            // Call AI API based on provider
            let response;
            switch (this._config.provider) {
                case AIProvider.CLAUDE:
                    response = await this._callClaude(pdfBase64, options);
                    break;
                case AIProvider.OPENAI:
                    response = await this._callOpenAI(pdfBase64, options);
                    break;
                case AIProvider.CUSTOM:
                    response = await this._callCustom(pdfBase64, options);
                    break;
                default:
                    throw new Error(`Unknown provider: ${this._config.provider}`);
            }

            options.onProgress?.({ stage: 'parsing', message: 'מעבד את התשובה...' });

            // Parse JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('תגובת AI לא מכילה JSON תקין');
            }

            let aiJson;
            let jsonString = jsonMatch[0];

            try {
                aiJson = JSON.parse(jsonString);
            } catch (parseError) {
                // Try to fix truncated JSON
                console.warn('[AIService] JSON parse failed, attempting auto-fix...');
                jsonString = this._tryFixTruncatedJson(jsonString);
                try {
                    aiJson = JSON.parse(jsonString);
                    console.log('[AIService] JSON auto-fix successful');
                } catch (retryError) {
                    throw new Error(`שגיאת JSON: ${parseError.message}`);
                }
            }

            options.onProgress?.({ stage: 'validating', message: 'מאמת תגובה...' });

            // STRICT validation - reject on any deviation
            const strictResult = strictValidateTemplateJson(aiJson);
            if (!strictResult.valid) {
                throw new Error(strictResult.error);
            }

            // Soft validation - collect warnings (don't reject)
            const validation = validateTemplateJson(aiJson);
            if (validation.warnings.length > 0) {
                console.warn('[AIService] Warnings:', validation.warnings);
            }

            options.onProgress?.({ stage: 'converting', message: 'ממיר לפורמט פנימי...' });

            // Convert to internal format
            const template = convertToInternalFormat(aiJson);

            options.onProgress?.({ stage: 'complete', message: 'הניתוח הושלם!' });

            console.log('[AIService] Analysis complete:', template);
            return {
                success: true,
                template,
                rawResponse: aiJson,
                validation,
                confidence: aiJson.meta?.confidence || null,
                warnings: validation.warnings
            };

        } catch (error) {
            console.error('[AIService] Analysis failed:', error);
            throw error;
        } finally {
            this._isAnalyzing = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // V3.5: FIELD INTELLIGENCE GENERATION
    // New comprehensive analysis mode that generates full field guide
    // ═══════════════════════════════════════════════════════════════

    /**
     * Generate Field Intelligence JSON for a PDF form
     * This is the NEW comprehensive analysis that produces full field guide
     *
     * @param {ArrayBuffer|Blob|string} pdfData - PDF data or base64 string
     * @param {Object} options - Analysis options
     * @param {string} options.fileName - File name for context
     * @param {number} options.pageCount - Number of pages
     * @param {Function} options.onProgress - Progress callback
     * @returns {Promise<Object>} Field Intelligence JSON
     */
    async generateFieldIntelligence(pdfData, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('AI service not configured. Please set API key.');
        }

        if (this._isAnalyzing) {
            throw new Error('Analysis already in progress.');
        }

        this._isAnalyzing = true;

        try {
            options.onProgress?.({
                stage: 'preparing',
                message: 'מכין את הקובץ לניתוח מקיף...',
                percent: 5
            });

            // Convert PDF to base64 if needed
            let pdfBase64;
            if (typeof pdfData === 'string') {
                pdfBase64 = pdfData;
            } else if (pdfData instanceof Blob) {
                pdfBase64 = await this._blobToBase64(pdfData);
            } else if (pdfData instanceof ArrayBuffer) {
                pdfBase64 = this._arrayBufferToBase64(pdfData);
            } else {
                throw new Error('Invalid PDF data format');
            }

            options.onProgress?.({
                stage: 'analyzing',
                message: 'מנתח את הטופס עם AI (ניתוח מקיף)...',
                percent: 20
            });

            // Call AI with Field Intelligence prompt
            const response = await this._callClaudeFieldIntelligence(pdfBase64, options);

            options.onProgress?.({
                stage: 'parsing',
                message: 'מעבד את מדריך השדות...',
                percent: 70
            });

            // Parse JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('תגובת AI לא מכילה JSON תקין');
            }

            let intelligence;
            let jsonString = jsonMatch[0];

            try {
                intelligence = JSON.parse(jsonString);
            } catch (parseError) {
                console.warn('[AIService] JSON parse failed, attempting auto-fix...');
                jsonString = this._tryFixTruncatedJson(jsonString);
                try {
                    intelligence = JSON.parse(jsonString);
                    console.log('[AIService] JSON auto-fix successful');
                } catch (retryError) {
                    throw new Error(`שגיאת JSON: ${parseError.message}`);
                }
            }

            options.onProgress?.({
                stage: 'validating',
                message: 'מאמת מדריך שדות...',
                percent: 85
            });

            // Validate response structure
            const responseValidation = validateFieldIntelligenceResponse(intelligence);
            if (!responseValidation.valid) {
                console.warn('[AIService] Response validation warnings:', responseValidation.errors);
            }

            // Post-process to ensure schema compliance
            intelligence = postProcessFieldIntelligence(intelligence);

            // Full schema validation
            const schemaValidation = validateFieldIntelligence(intelligence);
            if (!schemaValidation.valid) {
                console.error('[AIService] Schema validation failed:', schemaValidation.errors);
                throw new Error(`שגיאת סכמה: ${schemaValidation.errors.join(', ')}`);
            }

            options.onProgress?.({
                stage: 'complete',
                message: 'מדריך השדות נוצר בהצלחה!',
                percent: 100
            });

            console.log('[AIService] Field Intelligence generated:', {
                formId: intelligence.form?.id,
                sections: intelligence.sections?.length,
                fields: intelligence.fields?.length,
                dependencies: intelligence.dependencies?.length,
                attachments: intelligence.attachments?.length
            });

            return {
                success: true,
                intelligence,
                confidence: intelligence.$confidence || 0,
                fieldCount: intelligence.fields?.length || 0,
                sectionCount: intelligence.sections?.length || 0,
                warnings: responseValidation.errors
            };

        } catch (error) {
            console.error('[AIService] Field Intelligence generation failed:', error);
            throw error;
        } finally {
            this._isAnalyzing = false;
        }
    }

    /**
     * Call Claude API with Field Intelligence prompt
     * @private
     */
    async _callClaudeFieldIntelligence(pdfBase64, options) {
        const endpoint = this._config.endpoint || 'https://api.anthropic.com/v1/messages';

        // Get Field Intelligence prompt
        const prompt = getFieldIntelligencePrompt({
            pageCount: options.pageCount,
            fileName: options.fileName
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this._config.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: this._config.model || 'claude-sonnet-4-20250514',
                max_tokens: 64000,  // Maximum for comprehensive analysis
                system: FIELD_INTELLIGENCE_SYSTEM,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'document',
                                source: {
                                    type: 'base64',
                                    media_type: 'application/pdf',
                                    data: pdfBase64
                                }
                            },
                            {
                                type: 'text',
                                text: prompt
                            }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Claude API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    /**
     * Call Claude API
     */
    async _callClaude(pdfBase64, options) {
        const endpoint = this._config.endpoint || 'https://api.anthropic.com/v1/messages';

        // Get prompt with page count info
        const prompt = getAnalyzerPrompt({
            pageCount: options.pageCount,
            formName: options.formName
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this._config.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: this._config.model || 'claude-sonnet-4-20250514',
                max_tokens: 64000,  // Maximum allowed for Claude Sonnet - supports large forms (6+ pages)
                system: SYSTEM_MESSAGE,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'document',
                                source: {
                                    type: 'base64',
                                    media_type: 'application/pdf',
                                    data: pdfBase64
                                }
                            },
                            {
                                type: 'text',
                                text: prompt
                            }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Claude API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    /**
     * Call OpenAI API
     */
    async _callOpenAI(pdfBase64, options) {
        const endpoint = this._config.endpoint || 'https://api.openai.com/v1/chat/completions';

        // Note: OpenAI doesn't support PDF directly, would need to convert to images
        // For now, this is a placeholder
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this._config.apiKey}`
            },
            body: JSON.stringify({
                model: this._config.model || 'gpt-4-vision-preview',
                max_tokens: 8192,
                messages: [
                    {
                        role: 'system',
                        content: SYSTEM_MESSAGE
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: TEMPLATE_ANALYZER_PROMPT
                            }
                            // Note: Would need PDF-to-image conversion for OpenAI
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Call custom endpoint
     */
    async _callCustom(pdfBase64, options) {
        if (!this._config.endpoint) {
            throw new Error('Custom endpoint URL not configured');
        }

        const response = await fetch(this._config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this._config.apiKey}`
            },
            body: JSON.stringify({
                pdf: pdfBase64,
                prompt: TEMPLATE_ANALYZER_PROMPT,
                options
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Custom API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.response || data.content || data.text;
    }

    /**
     * Convert Blob to base64
     */
    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Convert ArrayBuffer to base64
     */
    _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Try to fix truncated JSON by closing open brackets
     */
    _tryFixTruncatedJson(jsonString) {
        let fixed = jsonString.trim();

        // Remove trailing incomplete content after last complete element
        // Find the last complete field object
        const lastCompleteField = fixed.lastIndexOf('}');
        if (lastCompleteField > 0) {
            // Check if there's incomplete content after it
            const afterField = fixed.substring(lastCompleteField + 1).trim();
            if (afterField && !afterField.startsWith(']') && !afterField.startsWith(',]') && !afterField.startsWith(']}')) {
                // Truncate to last complete field
                fixed = fixed.substring(0, lastCompleteField + 1);
            }
        }

        // Count open brackets
        let openBraces = 0;
        let openBrackets = 0;

        for (const char of fixed) {
            if (char === '{') openBraces++;
            if (char === '}') openBraces--;
            if (char === '[') openBrackets++;
            if (char === ']') openBrackets--;
        }

        // Remove trailing comma if present
        fixed = fixed.replace(/,\s*$/, '');

        // Close open brackets
        while (openBrackets > 0) {
            fixed += ']';
            openBrackets--;
        }
        while (openBraces > 0) {
            fixed += '}';
            openBraces--;
        }

        return fixed;
    }
}

// Singleton instance
export const aiService = new AIService();
