/**
 * smart-import-service.js
 * Smart document import service for MobileFill
 *
 * APPROACH: Uses existing semantic infrastructure instead of custom parsing
 * 1. Extract text from document (OCR or PDF)
 * 2. Parse text into label:value pairs
 * 3. Use SEMANTIC_DICTIONARY to match labels to canonical names
 * 4. Use mapping's canonical fields to apply values
 */
(function() {
    'use strict';

    let tesseractWorker = null;
    let tesseractLoading = false;
    let currentMapping = null;

    /**
     * Initialize the service
     */
    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[SmartImport] EventBus missing');
            return;
        }

        // Listen for mapping ready to know what fields we need
        window.MobileFillEventBus.on('MAPPING_READY', (payload) => {
            currentMapping = payload?.fieldsMapping || null;
            console.log('[SmartImport] Mapping loaded with',
                currentMapping?.fields?.length || 0, 'fields');
        });

        console.log('[SmartImport] Service initialized');
    }

    /**
     * Initialize Tesseract worker (lazy loading)
     */
    async function initTesseract() {
        if (tesseractWorker) return tesseractWorker;
        if (tesseractLoading) {
            while (tesseractLoading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return tesseractWorker;
        }

        tesseractLoading = true;

        try {
            if (typeof Tesseract === 'undefined') {
                console.error('[SmartImport] Tesseract.js not loaded');
                tesseractLoading = false;
                return null;
            }

            console.log('[SmartImport] Initializing Tesseract...');

            if (window.MobileFillToast) {
                window.MobileFillToast.info('טוען מנוע זיהוי...');
            }

            tesseractWorker = await Tesseract.createWorker('heb+eng');
            console.log('[SmartImport] Tesseract ready');

            tesseractLoading = false;
            return tesseractWorker;
        } catch (error) {
            console.error('[SmartImport] Tesseract init failed:', error);
            tesseractLoading = false;
            return null;
        }
    }

    /**
     * Extract text from PDF using pdf.js
     */
    async function extractTextFromPDF(pdfData) {
        if (typeof pdfjsLib === 'undefined') {
            console.error('[SmartImport] pdf.js not loaded');
            return '';
        }

        try {
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            const pdfDoc = await loadingTask.promise;
            let fullText = '';

            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }

            return fullText;
        } catch (error) {
            console.error('[SmartImport] PDF text extraction failed:', error);
            return '';
        }
    }

    /**
     * Process image with OCR
     */
    async function extractTextFromImage(imageFile) {
        const worker = await initTesseract();
        if (!worker) {
            throw new Error('OCR not available');
        }

        try {
            const processedImage = await resizeImage(imageFile, 1800);
            console.log('[SmartImport] Running OCR...');
            const { data: { text } } = await worker.recognize(processedImage);
            console.log('[SmartImport] Raw OCR result:', text);
            return text;
        } catch (error) {
            console.error('[SmartImport] OCR failed:', error);
            throw error;
        }
    }

    /**
     * Resize image for OCR
     */
    function resizeImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Parse OCR text into label:value pairs
     * Uses SEMANTIC_DICTIONARY to identify known labels
     */
    function parseTextToLabelValuePairs(text) {
        const pairs = [];
        const dictionary = window.SEMANTIC_DICTIONARY || {};

        // Build a flat list of all known labels (synonyms)
        const knownLabels = [];
        for (const [canonical, synonyms] of Object.entries(dictionary)) {
            for (const syn of synonyms) {
                if (syn.length >= 2) {
                    knownLabels.push({
                        label: syn.toLowerCase(),
                        canonical: canonical
                    });
                }
            }
        }
        // Sort by length DESC so longer matches take priority
        knownLabels.sort((a, b) => b.label.length - a.label.length);

        // Clean text
        const cleanText = text
            .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B]/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+/g, ' ');

        console.log('[SmartImport] Searching for known labels in text...');

        // Find each known label in the text and extract the value after it
        for (const { label, canonical } of knownLabels) {
            // Skip if we already have this canonical
            if (pairs.find(p => p.canonical === canonical)) continue;

            // Search for label in text (case-insensitive)
            const regex = new RegExp(escapeRegex(label) + '[:\\s]*([^\\n]{1,50})', 'i');
            const match = cleanText.match(regex);

            if (match) {
                const rawValue = match[1].trim();
                // Extract the meaningful part (first word/number sequence)
                const value = extractValue(rawValue, canonical);
                if (value) {
                    pairs.push({
                        label: label,
                        canonical: canonical,
                        rawValue: rawValue,
                        value: value
                    });
                    console.log(`[SmartImport] Found: ${canonical} = "${value}" (label: "${label}")`);
                }
            }
        }

        // Also extract values by format detection (ID numbers, dates, phones, emails)
        const formatPairs = extractByFormat(cleanText, pairs);
        pairs.push(...formatPairs);

        return pairs;
    }

    /**
     * Escape regex special characters
     */
    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Extract clean value based on canonical type
     */
    function extractValue(rawValue, canonical) {
        if (!rawValue) return null;

        // For ID numbers - extract 8-9 digit sequence
        if (canonical.includes('id_number') || canonical === 'id_number') {
            const idMatch = rawValue.match(/\d{7,9}/);
            return idMatch ? idMatch[0].padStart(9, '0') : null;
        }

        // For phones - extract phone pattern
        if (canonical.includes('phone') || canonical.includes('mobile')) {
            const phoneMatch = rawValue.match(/0\d{8,9}|05\d{8}/);
            return phoneMatch ? phoneMatch[0] : null;
        }

        // For dates - extract date pattern
        if (canonical.includes('date') || canonical === 'birth_date') {
            const dateMatch = rawValue.match(/\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/);
            if (dateMatch) {
                return normalizeDate(dateMatch[0]);
            }
            return null;
        }

        // For email
        if (canonical === 'email') {
            const emailMatch = rawValue.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
            return emailMatch ? emailMatch[0].toLowerCase() : null;
        }

        // For names - take Hebrew/English word(s)
        if (canonical.includes('name')) {
            // Extract Hebrew words or English words
            const hebrewMatch = rawValue.match(/[\u0590-\u05FF]{2,}(?:\s+[\u0590-\u05FF]{2,})*/);
            if (hebrewMatch) return hebrewMatch[0];
            const englishMatch = rawValue.match(/[a-zA-Z]{2,}(?:\s+[a-zA-Z]{2,})*/);
            if (englishMatch) return englishMatch[0];
            return rawValue.split(/\s+/)[0];
        }

        // For cities
        if (canonical === 'city' || canonical.includes('city')) {
            // Extract Hebrew word(s)
            const cityMatch = rawValue.match(/[\u0590-\u05FF]{2,}(?:[\s\-][\u0590-\u05FF]{2,})*/);
            return cityMatch ? cityMatch[0] : null;
        }

        // Default: first word
        return rawValue.split(/\s+/)[0];
    }

    /**
     * Extract values by format detection (fallback for values not near labels)
     */
    function extractByFormat(text, existingPairs) {
        const pairs = [];
        const existingCanonicals = new Set(existingPairs.map(p => p.canonical));

        // Israeli ID (9 digits with valid checksum)
        if (!existingCanonicals.has('id_number')) {
            const idMatches = text.match(/\b\d{8,9}\b/g) || [];
            for (const id of idMatches) {
                const paddedId = id.padStart(9, '0');
                if (isValidIsraeliID(paddedId)) {
                    pairs.push({
                        canonical: 'id_number',
                        value: paddedId,
                        matchType: 'format'
                    });
                    console.log('[SmartImport] Format-detected valid ID:', paddedId);
                    break;
                }
            }
        }

        // Mobile phone
        if (!existingCanonicals.has('phone_mobile') && !existingCanonicals.has('phone')) {
            const mobileMatch = text.match(/\b05\d{8}\b/);
            if (mobileMatch) {
                pairs.push({
                    canonical: 'phone_mobile',
                    value: mobileMatch[0],
                    matchType: 'format'
                });
                console.log('[SmartImport] Format-detected mobile:', mobileMatch[0]);
            }
        }

        // Email
        if (!existingCanonicals.has('email')) {
            const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
            if (emailMatch) {
                pairs.push({
                    canonical: 'email',
                    value: emailMatch[0].toLowerCase(),
                    matchType: 'format'
                });
                console.log('[SmartImport] Format-detected email:', emailMatch[0]);
            }
        }

        // Date (for birth_date) - only if looks like birth date (year 1940-2010)
        if (!existingCanonicals.has('birth_date')) {
            const dateMatches = text.match(/\b\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{4}\b/g) || [];
            for (const dateStr of dateMatches) {
                const normalized = normalizeDate(dateStr);
                if (normalized) {
                    const year = parseInt(normalized.split('/')[2]);
                    if (year >= 1940 && year <= 2010) {
                        pairs.push({
                            canonical: 'birth_date',
                            value: normalized,
                            matchType: 'format'
                        });
                        console.log('[SmartImport] Format-detected birth date:', normalized);
                        break;
                    }
                }
            }
        }

        return pairs;
    }

    /**
     * Normalize date to DD/MM/YYYY format
     */
    function normalizeDate(dateStr) {
        const match = dateStr.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
        if (!match) return null;

        let [, day, month, year] = match;
        day = day.padStart(2, '0');
        month = month.padStart(2, '0');
        if (year.length === 2) {
            year = (parseInt(year) > 50 ? '19' : '20') + year;
        }

        return `${day}/${month}/${year}`;
    }

    /**
     * Validate Israeli ID number (Luhn-like algorithm)
     */
    function isValidIsraeliID(id) {
        if (window.MobileFillValidation?.isValidIsraeliId) {
            return window.MobileFillValidation.isValidIsraeliId(id);
        }

        const cleaned = String(id).replace(/\D/g, '').padStart(9, '0');
        if (cleaned.length !== 9) return false;

        let sum = 0;
        for (let i = 0; i < 9; i++) {
            let digit = parseInt(cleaned[i]) * ((i % 2) + 1);
            if (digit > 9) digit -= 9;
            sum += digit;
        }
        return sum % 10 === 0;
    }

    /**
     * Match extracted pairs to form fields using mapping's canonical names
     */
    function matchToFormFields(pairs) {
        console.log('[SmartImport] ===== MATCHING TO FORM FIELDS =====');

        if (!currentMapping?.fields) {
            console.warn('[SmartImport] No mapping loaded');
            return {};
        }

        const fieldValues = {};

        // Build canonical to pair map
        const pairsByCanonical = {};
        for (const pair of pairs) {
            if (pair.canonical && pair.value) {
                pairsByCanonical[pair.canonical] = pair.value;
            }
        }

        console.log('[SmartImport] Extracted canonicals:', Object.keys(pairsByCanonical));

        // Match to form fields
        for (const field of currentMapping.fields) {
            const fieldCanonical = field.canonical?.toLowerCase();
            const fieldId = field.id || field.fieldId;

            if (!fieldCanonical || !fieldId) continue;
            if (field.type === 'checkbox' || field.type === 'radio') continue;

            // Direct canonical match
            if (pairsByCanonical[fieldCanonical]) {
                fieldValues[fieldId] = pairsByCanonical[fieldCanonical];
                console.log(`[SmartImport] Matched ${fieldCanonical} -> ${fieldValues[fieldId]}`);
                continue;
            }

            // Try prefix match (e.g., employee_id_number matches id_number)
            for (const [canonical, value] of Object.entries(pairsByCanonical)) {
                if (fieldCanonical.includes(canonical) || canonical.includes(fieldCanonical)) {
                    fieldValues[fieldId] = value;
                    console.log(`[SmartImport] Prefix matched ${fieldCanonical} <- ${canonical} -> ${value}`);
                    break;
                }
            }
        }

        console.log('[SmartImport] Final matched:', Object.keys(fieldValues).length, 'fields');
        console.log('[SmartImport] ====================================');

        return fieldValues;
    }

    /**
     * Apply matched values to form fields
     */
    function applyToForm(fieldValues) {
        if (!window.MobileFillEventBus) return 0;

        let appliedCount = 0;

        for (const [fieldId, value] of Object.entries(fieldValues)) {
            window.MobileFillEventBus.emit('FIELD_UPDATED', {
                fieldId,
                value,
                checked: null,
                tableContext: null
            });
            appliedCount++;
        }

        if (appliedCount > 0 && window.MobileFillToast) {
            window.MobileFillToast.success(`${appliedCount} שדות מולאו אוטומטית`);
        }

        console.log(`[SmartImport] Applied ${appliedCount} field values`);
        return appliedCount;
    }

    /**
     * Main import function
     */
    async function importDocument(file) {
        if (!file) {
            throw new Error('No file provided');
        }

        console.log('[SmartImport] ========== STARTING IMPORT ==========');
        console.log('[SmartImport] Processing file:', file.name, file.type);

        if (!currentMapping) {
            console.error('[SmartImport] No mapping loaded!');
            if (window.MobileFillToast) {
                window.MobileFillToast.error('לא נטען מיפוי - בחר טופס תחילה');
            }
            return { success: false, reason: 'No mapping' };
        }

        if (window.MobileFillToast) {
            window.MobileFillToast.info('מעבד מסמך...');
        }

        let extractedText = '';

        // Extract text based on file type
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            extractedText = await extractTextFromPDF(arrayBuffer);
        } else if (file.type.startsWith('image/')) {
            if (window.MobileFillToast) {
                window.MobileFillToast.info('מזהה טקסט בתמונה...');
            }
            extractedText = await extractTextFromImage(file);
        } else {
            throw new Error('Unsupported file type: ' + file.type);
        }

        console.log('[SmartImport] Extracted text length:', extractedText.length);

        // Parse text to label:value pairs using SEMANTIC_DICTIONARY
        const pairs = parseTextToLabelValuePairs(extractedText);
        console.log('[SmartImport] Found', pairs.length, 'label:value pairs');

        // Match to form fields
        const fieldValues = matchToFormFields(pairs);

        // Show what was found
        const foundItems = [];
        for (const pair of pairs) {
            if (pair.canonical === 'id_number') foundItems.push('ת.ז.');
            if (pair.canonical === 'first_name') foundItems.push('שם פרטי');
            if (pair.canonical === 'last_name') foundItems.push('שם משפחה');
            if (pair.canonical === 'birth_date') foundItems.push('תאריך לידה');
            if (pair.canonical === 'phone_mobile') foundItems.push('טלפון');
            if (pair.canonical === 'email') foundItems.push('אימייל');
        }

        if (foundItems.length > 0) {
            console.log('[SmartImport] Found:', foundItems.join(', '));
            if (window.MobileFillToast) {
                window.MobileFillToast.info('נמצא: ' + foundItems.join(', '));
            }
        } else {
            console.log('[SmartImport] No structured data found');
            if (window.MobileFillToast) {
                window.MobileFillToast.warning('לא זוהו נתונים מובנים');
            }
        }

        // Apply to form
        const appliedCount = applyToForm(fieldValues);

        console.log('[SmartImport] ========== IMPORT COMPLETE ==========');

        return {
            success: true,
            extractedText,
            pairs,
            fieldValues,
            appliedCount
        };
    }

    /**
     * Open file picker and process
     */
    function openFilePicker() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,application/pdf';

            input.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                    resolve({ success: false, reason: 'No file selected' });
                    return;
                }

                try {
                    const result = await importDocument(file);
                    resolve(result);
                } catch (error) {
                    console.error('[SmartImport] Import failed:', error);
                    if (window.MobileFillToast) {
                        window.MobileFillToast.error('שגיאה בייבוא המסמך');
                    }
                    reject(error);
                }
            });

            input.click();
        });
    }

    /**
     * Cleanup resources
     */
    async function destroy() {
        if (tesseractWorker) {
            await tesseractWorker.terminate();
            tesseractWorker = null;
        }
    }

    // Public API
    window.MobileFillSmartImport = {
        init,
        importDocument,
        openFilePicker,
        extractTextFromImage,
        extractTextFromPDF,
        parseTextToLabelValuePairs,
        matchToFormFields,
        applyToForm,
        isValidIsraeliID,
        destroy
    };
})();
