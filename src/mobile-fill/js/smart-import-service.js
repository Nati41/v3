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

            tesseractWorker = await Tesseract.createWorker('heb');

            await tesseractWorker.setParameters({
                tessedit_pageseg_mode: '3',        // FULLY_AUTO — let Tesseract detect layout
                preserve_interword_spaces: '1',     // Keep spaces between words
                tessedit_char_blacklist: '|{}[]~`', // Characters that don't appear on ID cards
            });

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
     * Process image with OCR — returns full Page object with .text and .words
     */
    async function extractTextFromImage(imageFile) {
        const worker = await initTesseract();
        if (!worker) {
            throw new Error('OCR not available');
        }

        try {
            const processedImage = await preprocessImageForOCR(imageFile, 2400);
            console.log('[SmartImport] Running OCR...');
            const { data } = await worker.recognize(processedImage);
            console.log('[SmartImport] OCR words:', data.words?.length);
            console.log('[SmartImport] Raw OCR result:', data.text);
            return data; // Returns full Page object with .text and .words
        } catch (error) {
            console.error('[SmartImport] OCR failed:', error);
            throw error;
        }
    }

    /**
     * Preprocess image for OCR: resize, grayscale, contrast stretch.
     * No binarization — Tesseract's internal thresholding handles complex
     * backgrounds (ID cards, security patterns) better than global Otsu.
     *
     * Two-pass pipeline:
     *   Pass 1: Convert to grayscale + build histogram
     *   Intermediate: Compute min/max from histogram (skip outlier 1%)
     *   Pass 2: Contrast stretch to full 0-255 range
     */
    function preprocessImageForOCR(file, maxSize) {
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

                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;
                const totalPixels = width * height;

                // --- Pass 1: Grayscale + build histogram ---
                const grayValues = new Uint8Array(totalPixels);
                const histogram = new Uint32Array(256);

                for (let i = 0; i < totalPixels; i++) {
                    const offset = i * 4;
                    const gray = Math.round(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]);
                    grayValues[i] = gray;
                    histogram[gray]++;
                }

                // --- Intermediate: Min/Max with 1% outlier clipping ---
                const clipCount = Math.floor(totalPixels * 0.01);
                let minGray = 0;
                let maxGray = 255;
                let cumulative = 0;
                for (let i = 0; i < 256; i++) {
                    cumulative += histogram[i];
                    if (cumulative >= clipCount) { minGray = i; break; }
                }
                cumulative = 0;
                for (let i = 255; i >= 0; i--) {
                    cumulative += histogram[i];
                    if (cumulative >= clipCount) { maxGray = i; break; }
                }
                const grayRange = maxGray - minGray || 1;

                console.log(`[SmartImport] OCR preprocess: min=${minGray}, max=${maxGray}, range=${grayRange}`);

                // --- Pass 2: Contrast stretch (no binarization) ---
                for (let i = 0; i < totalPixels; i++) {
                    const stretched = Math.max(0, Math.min(255,
                        Math.round(((grayValues[i] - minGray) / grayRange) * 255)
                    ));
                    const offset = i * 4;
                    data[offset] = stretched;
                    data[offset + 1] = stretched;
                    data[offset + 2] = stretched;
                }

                ctx.putImageData(imageData, 0, 0);
                resolve(canvas);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Short/ambiguous synonyms that should be excluded during OCR label matching.
     * These words are too generic and cause false positives when matching OCR text.
     */
    const OCR_AMBIGUOUS_SYNONYMS = new Set([
        'מספר', 'בית', 'שם', 'date', 'name', 'number', 'id', 'phone', 'mail', 'bank', 'sign'
    ]);

    /**
     * Known labels on Israeli ID cards — used for spatial matching.
     * Each entry maps a canonical field name to possible label strings.
     */
    const ID_CARD_LABELS = [
        { canonical: 'id_number',   labels: ['מספר זהות', 'מספר הזהות', 'תעודת זהות'] },
        { canonical: 'last_name',   labels: ['שם משפחה', 'שם המשפחה'] },
        { canonical: 'first_name',  labels: ['שם פרטי', 'שם הפרטי'] },
        { canonical: 'father_name', labels: ['שם האב'] },
        { canonical: 'mother_name', labels: ['שם האם'] },
        { canonical: 'birth_date',  labels: ['תאריך הולדה', 'תאריך לידה'] },
        { canonical: 'city',        labels: ['מקום מגורים', 'מען'] },
        { canonical: 'gender',      labels: ['המין'] },
    ];

    /**
     * Parse OCR words spatially: identify known labels by bounding box,
     * then find values to the left (RTL), right, or below each label.
     */
    function parseSpatialLabelValuePairs(words) {
        console.log('[SmartImport] === Spatial parsing start ===');

        // 2A: Filter low-quality words (permissive — OCR on photos is noisy)
        const cleanWords = words.filter(w => {
            if (w.confidence < 15) return false;
            const alphaNum = (w.text || '').match(/[\u0590-\u05FFa-zA-Z0-9]/g);
            return alphaNum && alphaNum.length >= 2;
        });
        console.log('[SmartImport] Spatial: clean words:', cleanWords.length, 'of', words.length);

        if (cleanWords.length === 0) return [];

        // Compute lineHeight as median word height
        const heights = cleanWords.map(w => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
        const lineHeight = heights[Math.floor(heights.length / 2)];

        // Compute image extent from word bounding boxes for adaptive search ranges
        const maxX = Math.max(...cleanWords.map(w => w.bbox.x1));
        const minX = Math.min(...cleanWords.map(w => w.bbox.x0));
        const imageWidth = maxX - minX || 1;
        console.log('[SmartImport] Spatial: lineHeight =', lineHeight, ', imageWidth =', imageWidth);

        // 2B: Build flat label list from ID_CARD_LABELS + SEMANTIC_DICTIONARY
        const labelDefs = [];

        // ID card labels (high priority)
        for (const entry of ID_CARD_LABELS) {
            for (const lbl of entry.labels) {
                labelDefs.push({ text: lbl, canonical: entry.canonical, source: 'id_card' });
            }
        }

        // SEMANTIC_DICTIONARY labels (lower priority, skip short/ambiguous)
        const dictionary = window.SEMANTIC_DICTIONARY || {};
        for (const [canonical, synonyms] of Object.entries(dictionary)) {
            for (const syn of synonyms) {
                if (syn.length >= 4 && !OCR_AMBIGUOUS_SYNONYMS.has(syn.toLowerCase())) {
                    labelDefs.push({ text: syn, canonical, source: 'dictionary' });
                }
            }
        }

        // Sort by text length DESC (longer labels match first)
        labelDefs.sort((a, b) => b.text.length - a.text.length);

        // Build a set of all label strings for value-is-label rejection
        const allLabelStrings = new Set();
        for (const ld of labelDefs) allLabelStrings.add(ld.text.toLowerCase());
        for (const synonyms of Object.values(dictionary)) {
            for (const syn of synonyms) allLabelStrings.add(syn.toLowerCase());
        }

        // Helper: check if two words are on the same line
        function sameRow(a, b) {
            return Math.abs(a.bbox.y0 - b.bbox.y0) < lineHeight * 0.7;
        }

        // Helper: check if two words are adjacent horizontally
        function adjacentHorizontal(a, b) {
            if (!sameRow(a, b)) return false;
            const gap = Math.min(
                Math.abs(a.bbox.x1 - b.bbox.x0),
                Math.abs(b.bbox.x1 - a.bbox.x0)
            );
            return gap < lineHeight * 3;
        }

        // 2B: Find label occurrences in word list
        const foundLabels = []; // { canonical, labelText, words: [word,...], bbox }
        const usedWordIndices = new Set();

        for (const labelDef of labelDefs) {
            // Skip if canonical already found by a higher-priority label
            if (foundLabels.find(fl => fl.canonical === labelDef.canonical)) continue;

            const labelWords = labelDef.text.split(/\s+/);

            if (labelWords.length === 1) {
                // Single-word label
                for (let i = 0; i < cleanWords.length; i++) {
                    if (usedWordIndices.has(i)) continue;
                    if (normalizeHebrew(cleanWords[i].text) === normalizeHebrew(labelWords[0])) {
                        foundLabels.push({
                            canonical: labelDef.canonical,
                            labelText: labelDef.text,
                            wordIndices: [i],
                            bbox: { ...cleanWords[i].bbox }
                        });
                        usedWordIndices.add(i);
                        console.log(`[SmartImport] Spatial: found label "${labelDef.text}" at (${cleanWords[i].bbox.x0}, ${cleanWords[i].bbox.y0})`);
                        break;
                    }
                }
            } else {
                // Multi-word label: find first word, then check adjacent words match
                for (let i = 0; i < cleanWords.length; i++) {
                    if (usedWordIndices.has(i)) continue;
                    if (normalizeHebrew(cleanWords[i].text) !== normalizeHebrew(labelWords[0])) continue;

                    // Try to find remaining label words in adjacent words
                    const matchedIndices = [i];
                    let lastMatchedWord = cleanWords[i];
                    let allMatched = true;

                    for (let lw = 1; lw < labelWords.length; lw++) {
                        let found = false;
                        for (let j = 0; j < cleanWords.length; j++) {
                            if (j === i || usedWordIndices.has(j) || matchedIndices.includes(j)) continue;
                            if (normalizeHebrew(cleanWords[j].text) !== normalizeHebrew(labelWords[lw])) continue;
                            if (adjacentHorizontal(lastMatchedWord, cleanWords[j])) {
                                matchedIndices.push(j);
                                lastMatchedWord = cleanWords[j];
                                found = true;
                                break;
                            }
                        }
                        if (!found) { allMatched = false; break; }
                    }

                    if (allMatched) {
                        // Compute bounding box of all matched words
                        const matchedWords = matchedIndices.map(idx => cleanWords[idx]);
                        const combinedBbox = {
                            x0: Math.min(...matchedWords.map(w => w.bbox.x0)),
                            y0: Math.min(...matchedWords.map(w => w.bbox.y0)),
                            x1: Math.max(...matchedWords.map(w => w.bbox.x1)),
                            y1: Math.max(...matchedWords.map(w => w.bbox.y1))
                        };
                        foundLabels.push({
                            canonical: labelDef.canonical,
                            labelText: labelDef.text,
                            wordIndices: matchedIndices,
                            bbox: combinedBbox
                        });
                        for (const idx of matchedIndices) usedWordIndices.add(idx);
                        console.log(`[SmartImport] Spatial: found label "${labelDef.text}" at (${combinedBbox.x0}, ${combinedBbox.y0})`);
                        break;
                    }
                }
            }
        }

        console.log('[SmartImport] Spatial: found', foundLabels.length, 'labels');

        // 2C + 2D: Find values near each label
        const pairs = [];

        for (const label of foundLabels) {
            const valueWords = findNearbyValueWords(cleanWords, label, usedWordIndices, lineHeight, imageWidth);
            if (valueWords.length === 0) continue;

            const rawValue = valueWords.map(w => w.text).join(' ');

            // 2E: Validate with extractValue()
            if (isValueActuallyALabel(rawValue, allLabelStrings)) {
                console.log(`[SmartImport] Spatial: rejected label-as-value "${rawValue}" for ${label.canonical}`);
                continue;
            }

            const value = extractValue(rawValue, label.canonical);
            if (value) {
                pairs.push({
                    label: label.labelText,
                    canonical: label.canonical,
                    rawValue,
                    value,
                    matchType: 'spatial'
                });
                // Mark value words as used
                for (const vw of valueWords) {
                    const idx = cleanWords.indexOf(vw);
                    if (idx >= 0) usedWordIndices.add(idx);
                }
                console.log(`[SmartImport] Spatial: value "${value}" for ${label.canonical}`);
            }
        }

        console.log('[SmartImport] Spatial: matched', pairs.length, 'pairs');
        console.log('[SmartImport] === Spatial parsing end ===');
        return pairs;
    }

    /**
     * Normalize Hebrew text for label comparison:
     * strip nikud, remove ה' הידיעה prefix, trim.
     */
    function normalizeHebrew(text) {
        return (text || '')
            .replace(/[\u0591-\u05C7]/g, '') // strip nikud
            .replace(/^ה/, '')               // remove leading ה
            .trim()
            .toLowerCase();
    }

    /**
     * Find value words near a label, searching left (RTL), right, then below.
     * Uses imageWidth-proportional search ranges for real-world ID card layouts.
     * Returns array of word objects forming the value.
     */
    function findNearbyValueWords(cleanWords, label, usedWordIndices, lineHeight, imageWidth) {
        // Adaptive search ranges based on actual image dimensions
        const hSearchRange = Math.max(lineHeight * 15, imageWidth * 0.5);
        const vSearchRange = lineHeight * 4;
        const hOverlapRange = Math.max(lineHeight * 5, imageWidth * 0.3);
        const rowTolerance = lineHeight * 0.7;

        const candidates = [];

        for (let i = 0; i < cleanWords.length; i++) {
            if (usedWordIndices.has(i)) continue;
            const w = cleanWords[i];

            const sameRow = Math.abs(w.bbox.y0 - label.bbox.y0) < rowTolerance;

            // Direction 1: Left of label (RTL — value same row, x smaller)
            if (sameRow && w.bbox.x0 < label.bbox.x0) {
                const hDist = label.bbox.x0 - w.bbox.x1;
                // Allow slight overlap (-lineHeight) for imprecise bboxes
                if (hDist >= -lineHeight && hDist < hSearchRange) {
                    candidates.push({ word: w, idx: i, dir: 'left', dist: Math.max(0, hDist), priority: 1 });
                }
            }

            // Direction 2: Right of label (LTR fallback)
            if (sameRow && w.bbox.x0 > label.bbox.x1) {
                const hDist = w.bbox.x0 - label.bbox.x1;
                if (hDist >= -lineHeight && hDist < hSearchRange) {
                    candidates.push({ word: w, idx: i, dir: 'right', dist: Math.max(0, hDist), priority: 2 });
                }
            }

            // Direction 3: Below label
            if (w.bbox.y0 > label.bbox.y1 &&
                w.bbox.y0 < label.bbox.y1 + vSearchRange) {
                const labelCenterX = (label.bbox.x0 + label.bbox.x1) / 2;
                const wordCenterX = (w.bbox.x0 + w.bbox.x1) / 2;
                if (Math.abs(labelCenterX - wordCenterX) < hOverlapRange) {
                    const vDist = w.bbox.y0 - label.bbox.y1;
                    candidates.push({ word: w, idx: i, dir: 'below', dist: vDist, priority: 3 });
                }
            }
        }

        console.log(`[SmartImport] Spatial: "${label.labelText}" candidates: ${candidates.length} (left=${candidates.filter(c=>c.dir==='left').length}, right=${candidates.filter(c=>c.dir==='right').length}, below=${candidates.filter(c=>c.dir==='below').length})`);

        if (candidates.length === 0) return [];

        // Sort by priority first, then distance
        candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);

        // Take the best candidate as seed, then group adjacent words in same direction
        const seed = candidates[0];
        const result = [seed.word];
        const resultDir = seed.dir;

        // Collect additional adjacent words in the same direction
        const usedForValue = new Set([seed.idx]);
        let lastWord = seed.word;

        for (const c of candidates) {
            if (usedForValue.has(c.idx)) continue;
            if (c.dir !== resultDir) continue;

            // Check adjacency to last collected word
            if (resultDir === 'left' || resultDir === 'right') {
                if (Math.abs(c.word.bbox.y0 - lastWord.bbox.y0) < rowTolerance) {
                    const gap = Math.min(
                        Math.abs(c.word.bbox.x1 - lastWord.bbox.x0),
                        Math.abs(lastWord.bbox.x1 - c.word.bbox.x0)
                    );
                    if (gap < lineHeight * 3) {
                        result.push(c.word);
                        usedForValue.add(c.idx);
                        lastWord = c.word;
                    }
                }
            } else { // below
                if (c.word.bbox.y0 >= lastWord.bbox.y0 &&
                    c.word.bbox.y0 < lastWord.bbox.y1 + lineHeight * 2.5) {
                    result.push(c.word);
                    usedForValue.add(c.idx);
                    lastWord = c.word;
                }
            }
        }

        // Sort result words by x position (left-to-right reading order)
        result.sort((a, b) => a.bbox.x0 - b.bbox.x0);

        return result;
    }

    /**
     * Build a regex pattern that tolerates Hebrew ה' הידיעה between words.
     * E.g., "מספר זהות" → pattern that also matches "מספר הזהות"
     */
    function buildHebrewTolerantRegex(label) {
        const words = label.split(/\s+/);
        if (words.length < 2) return escapeRegex(label);
        // Between each pair of words, allow optional ה prefix on the next word
        return words.map(w => escapeRegex(w)).join('\\s+(?:\u05D4)?');
    }

    /**
     * Parse OCR text into label:value pairs
     * Uses SEMANTIC_DICTIONARY to identify known labels
     */
    function parseTextToLabelValuePairs(text) {
        const pairs = [];
        const dictionary = window.SEMANTIC_DICTIONARY || {};

        // Build a flat list of all known labels (synonyms)
        // Filter out short/ambiguous synonyms for OCR context
        const knownLabels = [];
        for (const [canonical, synonyms] of Object.entries(dictionary)) {
            for (const syn of synonyms) {
                if (syn.length >= 4 && !OCR_AMBIGUOUS_SYNONYMS.has(syn.toLowerCase())) {
                    knownLabels.push({
                        label: syn.toLowerCase(),
                        canonical: canonical
                    });
                }
            }
        }
        // Sort by length DESC so longer matches take priority
        knownLabels.sort((a, b) => b.label.length - a.label.length);

        // Collect all first words of known labels for stop-boundary
        const allLabelFirstWords = new Set();
        for (const { label } of knownLabels) {
            const firstWord = label.split(/\s+/)[0];
            if (firstWord.length >= 3) {
                allLabelFirstWords.add(firstWord);
            }
        }
        // Build stop-boundary pattern: stops before any known label start word
        const stopWords = Array.from(allLabelFirstWords).map(w => escapeRegex(w)).join('|');
        const stopBoundary = stopWords ? `(?=\\s*(?:${stopWords})|\\n|$)` : '';

        // Clean text
        const cleanText = text
            .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B]/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+/g, ' ');

        console.log('[SmartImport] Searching for known labels in text...');

        // Build set of all known label strings for label-as-value detection
        const allLabelStrings = new Set();
        for (const { label } of knownLabels) {
            allLabelStrings.add(label);
        }
        // Also add raw synonyms from dictionary
        for (const synonyms of Object.values(dictionary)) {
            for (const syn of synonyms) {
                allLabelStrings.add(syn.toLowerCase());
            }
        }

        // Find each known label in the text and extract the value after it
        for (const { label, canonical } of knownLabels) {
            // Skip if we already have this canonical
            if (pairs.find(p => p.canonical === canonical)) continue;

            // Build regex with Hebrew ה' tolerance and stop-boundary
            const labelPattern = buildHebrewTolerantRegex(label);
            const valuePattern = stopBoundary
                ? `[:\\s]*([^\\n]{1,50}?)${stopBoundary}`
                : '[:\\s]*([^\\n]{1,50})';
            const regex = new RegExp(labelPattern + valuePattern, 'i');
            const match = cleanText.match(regex);

            if (match) {
                // Skip labels inside quotation marks (fine print / legal text)
                const charBefore = match.index > 0 ? cleanText[match.index - 1] : '';
                if (charBefore === '"' || charBefore === '"' || charBefore === '״') {
                    console.log(`[SmartImport] Skipped quoted label: "${label}" for ${canonical}`);
                    continue;
                }

                const rawValue = match[1].trim();

                // Check if the extracted value is actually a label (e.g., "הזהות")
                if (isValueActuallyALabel(rawValue, allLabelStrings)) {
                    console.log(`[SmartImport] Rejected label-as-value: "${rawValue}" for ${canonical}`);
                    continue;
                }

                // Extract the meaningful part (first word/number sequence)
                let value = extractValue(rawValue, canonical);

                // Multi-line fallback: if value is null for name/city, try next line
                if (!value && (canonical.includes('name') || canonical.includes('city'))) {
                    const afterMatchPos = match.index + match[0].length;
                    const remaining = cleanText.substring(afterMatchPos);
                    const nextLineMatch = remaining.match(/\n\s*([^\n]{1,50})/);
                    if (nextLineMatch) {
                        const nextLineValue = nextLineMatch[1].trim();
                        value = extractValue(nextLineValue, canonical);
                        if (value) {
                            console.log(`[SmartImport] Found on next line: ${canonical} = "${value}"`);
                        }
                    }
                }

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
     * Check if extracted value is actually a known label (not real data).
     * E.g., "הזהות" is part of label "תעודת הזהות", not a person's name.
     */
    function isValueActuallyALabel(value, allLabelStrings) {
        if (!value || value.length < 2) return false;
        const lower = value.toLowerCase().trim();

        // Direct match
        if (allLabelStrings.has(lower)) return true;

        // Check if value is a substring that appears as part of any known label
        for (const labelStr of allLabelStrings) {
            // Value is a significant part of a label (not just 1-2 char overlap)
            if (lower.length >= 3 && labelStr.includes(lower) && lower !== labelStr) {
                return true;
            }
        }
        return false;
    }

    /**
     * Escape regex special characters
     */
    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Reject garbage values: less than 30% alphanumeric characters (Hebrew/English/digits)
     */
    function isGarbageValue(value) {
        if (!value || value.length === 0) return true;
        const alphanumeric = value.match(/[\u0590-\u05FFa-zA-Z0-9]/g);
        const ratio = alphanumeric ? alphanumeric.length / value.length : 0;
        return ratio < 0.3;
    }

    /**
     * Extract clean value based on canonical type, with validation per field type.
     */
    function extractValue(rawValue, canonical) {
        if (!rawValue) return null;

        // General garbage rejection
        if (isGarbageValue(rawValue)) {
            console.log(`[SmartImport] Rejected garbage value for ${canonical}: "${rawValue}"`);
            return null;
        }

        // For ID numbers - extract 7-9 digit sequence
        if (canonical.includes('id_number') || canonical === 'id_number') {
            // Try consecutive digits first
            const idMatch = rawValue.match(/\d{7,9}/);
            if (idMatch) return idMatch[0].padStart(9, '0');

            // Fallback: collect all scattered digits, try as ID
            const allDigits = rawValue.replace(/\D/g, '');
            if (allDigits.length >= 7 && allDigits.length <= 9) {
                const paddedId = allDigits.padStart(9, '0');
                if (isValidIsraeliID(paddedId)) {
                    console.log(`[SmartImport] Collected scattered digits for ID: ${paddedId}`);
                    return paddedId;
                }
            }
            console.log(`[SmartImport] Could not extract valid ID from: "${rawValue}"`);
            return null;
        }

        // For phones - extract phone pattern
        if (canonical.includes('phone') || canonical.includes('mobile')) {
            const phoneMatch = rawValue.match(/0\d{8,9}|05\d{8}/);
            return phoneMatch ? phoneMatch[0] : null;
        }

        // For dates - extract date pattern (accept :,./- as separators for OCR)
        if (canonical.includes('date') || canonical === 'birth_date') {
            const dateMatch = rawValue.match(/\d{1,2}[\/\.\-:,]\d{1,2}[\/\.\-:,]\d{2,4}/);
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

        // For house_number — extract first standalone 1-4 digit sequence
        if (canonical === 'house_number') {
            const houseMatch = rawValue.match(/\b(\d{1,4})\b/);
            if (!houseMatch) {
                console.log(`[SmartImport] Rejected non-numeric house_number: "${rawValue}"`);
                return null;
            }
            return houseMatch[1];
        }

        // For names — min 3 Hebrew or English chars, no digits, max 30 chars
        if (canonical.includes('name')) {
            // Extract Hebrew words or English words
            const hebrewMatch = rawValue.match(/[\u0590-\u05FF]{3,}(?:\s+[\u0590-\u05FF]{2,})*/);
            if (hebrewMatch) {
                const name = hebrewMatch[0];
                if (name.length >= 3 && name.length <= 30 && !/\d/.test(name)) return name;
            }
            const englishMatch = rawValue.match(/[a-zA-Z]{3,}(?:\s+[a-zA-Z]{2,})*/);
            if (englishMatch) {
                const name = englishMatch[0];
                if (name.length >= 3 && name.length <= 30 && !/\d/.test(name)) return name;
            }
            console.log(`[SmartImport] Rejected invalid name for ${canonical}: "${rawValue}"`);
            return null;
        }

        // For cities — Hebrew words only, 2-30 chars
        if (canonical === 'city' || canonical.includes('city')) {
            const cityMatch = rawValue.match(/[\u0590-\u05FF]{2,}(?:[\s\-][\u0590-\u05FF]{2,})*/);
            if (cityMatch && cityMatch[0].length >= 2 && cityMatch[0].length <= 30) {
                return cityMatch[0];
            }
            console.log(`[SmartImport] Rejected invalid city: "${rawValue}"`);
            return null;
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
            const dateMatches = text.match(/\b\d{1,2}[\/\.\-:,]\d{1,2}[\/\.\-:,]\d{4}\b/g) || [];
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
        const match = dateStr.match(/(\d{1,2})[\/\.\-:,](\d{1,2})[\/\.\-:,](\d{2,4})/);
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
     * Match extracted pairs to form fields using mapping's canonical names.
     * Two-pass approach:
     *   Pass 1: Direct canonical === canonical match
     *   Pass 2: Suffix-based prefix matching for remaining fields
     * Tracks used canonicals to prevent duplicate assignments.
     */
    function matchToFormFields(pairs) {
        console.log('[SmartImport] ===== MATCHING TO FORM FIELDS =====');

        if (!currentMapping?.fields) {
            console.warn('[SmartImport] No mapping loaded');
            return {};
        }

        const fieldValues = {};
        const usedCanonicals = new Set();

        // Build canonical to pair map
        const pairsByCanonical = {};
        for (const pair of pairs) {
            if (pair.canonical && pair.value) {
                pairsByCanonical[pair.canonical] = pair.value;
            }
        }

        console.log('[SmartImport] Extracted canonicals:', Object.keys(pairsByCanonical));

        // Collect eligible fields (skip checkbox/radio, require canonical + id)
        const eligibleFields = [];
        for (const field of currentMapping.fields) {
            const fieldCanonical = field.canonical?.toLowerCase();
            const fieldId = field.id || field.fieldId;
            if (!fieldCanonical || !fieldId) continue;
            if (field.type === 'checkbox' || field.type === 'radio') continue;
            eligibleFields.push({ fieldCanonical, fieldId });
        }

        // --- Pass 1: Direct match (canonical === canonical) ---
        for (const { fieldCanonical, fieldId } of eligibleFields) {
            if (pairsByCanonical[fieldCanonical] && !usedCanonicals.has(fieldCanonical)) {
                fieldValues[fieldId] = pairsByCanonical[fieldCanonical];
                usedCanonicals.add(fieldCanonical);
                console.log(`[SmartImport] Direct match: ${fieldCanonical} -> ${fieldValues[fieldId]}`);
            }
        }

        // --- Pass 2: Suffix-based prefix match for remaining fields ---
        // e.g., employee_id_number matches id_number (ends with '_' + canonical)
        for (const { fieldCanonical, fieldId } of eligibleFields) {
            if (fieldValues[fieldId]) continue; // Already matched in pass 1

            for (const [canonical, value] of Object.entries(pairsByCanonical)) {
                if (usedCanonicals.has(canonical)) continue;

                const isMatch =
                    fieldCanonical === canonical ||
                    fieldCanonical.endsWith('_' + canonical) ||
                    canonical.endsWith('_' + fieldCanonical);

                if (isMatch) {
                    fieldValues[fieldId] = value;
                    usedCanonicals.add(canonical);
                    console.log(`[SmartImport] Prefix match: ${fieldCanonical} <- ${canonical} -> ${value}`);
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
        let pairs = [];

        // Extract text based on file type
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            extractedText = await extractTextFromPDF(arrayBuffer);
            // PDF: text-based parsing only
            pairs = parseTextToLabelValuePairs(extractedText);
        } else if (file.type.startsWith('image/')) {
            if (window.MobileFillToast) {
                window.MobileFillToast.info('מזהה טקסט בתמונה...');
            }
            const ocrData = await extractTextFromImage(file);
            extractedText = ocrData.text || '';

            // Try spatial parsing first (for structured documents like ID cards)
            if (ocrData.words && ocrData.words.length > 0) {
                pairs = parseSpatialLabelValuePairs(ocrData.words);
            }

            // Fallback to text-based parsing if spatial found fewer than 2 fields
            if (pairs.length < 2) {
                const textPairs = parseTextToLabelValuePairs(extractedText);
                // Merge: keep spatial results, add text-based ones for missing canonicals
                const spatialCanonicals = new Set(pairs.map(p => p.canonical));
                for (const tp of textPairs) {
                    if (!spatialCanonicals.has(tp.canonical)) pairs.push(tp);
                }
                console.log('[SmartImport] After text fallback merge:', pairs.length, 'pairs');
            }
        } else {
            throw new Error('Unsupported file type: ' + file.type);
        }

        console.log('[SmartImport] Extracted text length:', extractedText.length);
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
        parseSpatialLabelValuePairs,
        matchToFormFields,
        applyToForm,
        isValidIsraeliID,
        destroy
    };
})();
