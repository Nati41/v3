/**
 * ReverseMappingAI.js
 * AI integration for field identification in Reverse Mapping mode
 *
 * Takes an image with [number | type] badges and asks AI to identify:
 * - label (Hebrew)
 * - canonical (English)
 * - radio_group (for R type)
 * - table and column (for T type)
 */

// AI Provider configuration
const AI_CONFIG = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096
};

// The prompt sent to AI
const IDENTIFICATION_PROMPT = `אתה מומחה בזיהוי שדות טפסים.

בתמונה יש אלמנטים מסומנים בפורמט [number | type].

סוגי האלמנטים (type):
- F = שדה טקסט רגיל
- C = Checkbox
- R = Radio button
- T = תא בטבלה
- S = אזור חתימה

לכל מספר (number) החזר:
- label: תווית בעברית (מה כתוב ליד השדה או מה מייצג האלמנט)
- canonical: שם טכני באנגלית בפורמט snake_case

עבור אלמנטים מסוג R (Radio):
- הוסף radio_group: שם הקבוצה שאליה שייך הרדיו (כל הרדיו באותה קבוצה צריכים אותו שם)

עבור אלמנטים מסוג T (Table):
- הוסף table: שם הטבלה
- הוסף column: מספר העמודה (1, 2, 3...)

חשוב:
- אל תנסה לנחש את סוג האלמנט - הוא כבר נתון בתגית
- התבסס על הטקסט הסמוך לאלמנט כדי לזהות את התווית
- השתמש בשמות canonical סטנדרטיים (first_name, last_name, id_number, birth_date וכו')
- אם יש מספר רדיו buttons באותו אזור - הם כנראה שייכים לאותה קבוצה

החזר JSON בפורמט:
{
  "1": { "label": "שם פרטי", "canonical": "first_name" },
  "2": { "label": "זכר", "canonical": "gender_male", "radio_group": "gender" },
  "3": { "label": "נקבה", "canonical": "gender_female", "radio_group": "gender" },
  "4": { "label": "שם הילד", "canonical": "child_name", "table": "children", "column": 1 },
  "5": { "label": "ת.ז.", "canonical": "child_id", "table": "children", "column": 2 }
}`;

export class ReverseMappingAI {
    constructor() {
        this.apiKey = null;
        this.provider = AI_CONFIG.provider;
        this.model = AI_CONFIG.model;
    }

    /**
     * Initialize with API key
     */
    init(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Get API key from auth manager or storage
     */
    async _getApiKey() {
        // Try to get from AuthManager
        if (window.AuthManager?.getApiKey) {
            const key = await window.AuthManager.getApiKey();
            if (key) return key;
        }

        // Try localStorage
        const stored = localStorage.getItem('anthropic_api_key') ||
                      localStorage.getItem('ai_api_key');
        if (stored) return stored;

        // Prompt user
        const key = prompt('הזן מפתח API של Anthropic:');
        if (key) {
            localStorage.setItem('anthropic_api_key', key);
            return key;
        }

        throw new Error('No API key available');
    }

    /**
     * Identify fields from image
     * @param {string} imageBase64 - Base64 encoded image with badges
     * @param {Array} elements - Array of elements for context
     * @returns {Object} - AI results keyed by element number
     */
    async identifyFields(imageBase64, elements) {
        console.log('[ReverseMappingAI] Starting identification...');
        console.log('[ReverseMappingAI] Elements count:', elements.length);

        // Get API key
        const apiKey = await this._getApiKey();

        // Build context about elements
        const elementsSummary = elements.map(e =>
            `#${e.number}: type=${e.type}, page=${e.page}`
        ).join('\n');

        // Build the request
        const requestBody = {
            model: this.model,
            max_tokens: AI_CONFIG.maxTokens,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: imageBase64.replace(/^data:image\/\w+;base64,/, '')
                            }
                        },
                        {
                            type: 'text',
                            text: `${IDENTIFICATION_PROMPT}\n\nאלמנטים לזיהוי:\n${elementsSummary}\n\nהחזר JSON בלבד, ללא הסברים נוספים.`
                        }
                    ]
                }
            ]
        };

        try {
            // Show loading indicator
            this._showLoading(true);

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('[ReverseMappingAI] Raw response:', data);

            // Extract JSON from response
            const content = data.content?.[0]?.text || '';
            const results = this._parseResults(content);

            console.log('[ReverseMappingAI] Parsed results:', results);

            return results;

        } catch (error) {
            console.error('[ReverseMappingAI] Error:', error);
            throw error;
        } finally {
            this._showLoading(false);
        }
    }

    /**
     * Parse AI response to extract JSON
     */
    _parseResults(content) {
        // Try to extract JSON from the content
        let jsonStr = content;

        // Check if wrapped in markdown code block
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }

        // Try to find JSON object
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            jsonStr = objectMatch[0];
        }

        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error('[ReverseMappingAI] Failed to parse JSON:', e);
            console.log('[ReverseMappingAI] Raw content:', content);

            // Return empty object if parsing fails
            return {};
        }
    }

    /**
     * Show/hide loading indicator
     */
    _showLoading(show) {
        let loader = document.getElementById('reverse-ai-loader');

        if (show) {
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'reverse-ai-loader';
                loader.className = 'reverse-ai-loader';
                loader.innerHTML = `
                    <div class="loader-content">
                        <div class="loader-spinner"></div>
                        <div class="loader-text">🧠 מזהה שדות...</div>
                    </div>
                `;
                document.body.appendChild(loader);
            }
            loader.style.display = 'flex';
        } else if (loader) {
            loader.style.display = 'none';
        }
    }

    /**
     * Fallback identification without AI (pattern-based)
     * Used when AI is not available
     */
    fallbackIdentify(elements) {
        console.log('[ReverseMappingAI] Using fallback identification...');

        const results = {};

        for (const element of elements) {
            results[String(element.number)] = {
                label: `שדה ${element.number}`,
                canonical: `field_${element.number}`
            };

            // For radio buttons, try to group by proximity
            if (element.type === 'R') {
                // Find nearby radios (within 100px vertically)
                const nearbyRadios = elements.filter(e =>
                    e.type === 'R' &&
                    e.id !== element.id &&
                    Math.abs(e.bbox.y - element.bbox.y) < 100
                );

                if (nearbyRadios.length > 0) {
                    // Create a group name based on the first radio in the group
                    const minNumber = Math.min(element.number, ...nearbyRadios.map(r => r.number));
                    results[String(element.number)].radio_group = `group_${minNumber}`;
                }
            }

            // For table cells, try to group by column position
            if (element.type === 'T') {
                const nearbyCells = elements.filter(e =>
                    e.type === 'T' &&
                    e.id !== element.id &&
                    Math.abs(e.bbox.x - element.bbox.x) < 50  // Same column
                );

                if (nearbyCells.length > 0) {
                    const minNumber = Math.min(element.number, ...nearbyCells.map(c => c.number));
                    results[String(element.number)].table = `table_${minNumber}`;

                    // Calculate column based on X position
                    const allXs = [element.bbox.x, ...nearbyCells.map(c => c.bbox.x)];
                    const sortedXs = [...new Set(allXs)].sort((a, b) => a - b);
                    results[String(element.number)].column = sortedXs.indexOf(element.bbox.x) + 1;
                }
            }
        }

        return results;
    }
}
