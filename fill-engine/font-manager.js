/**
 * Font Manager - Font Loading & Embedding (Step 8)
 *
 * Handles font loading, caching, and embedding for PDF filling:
 * - Hebrew font support (David Libre)
 * - Fallback fonts (Helvetica)
 * - ZapfDingbats for markers
 * - Font caching for performance
 */
(function() {
    'use strict';

    // ============ CONFIGURATION ============

    const FONT_CONFIG = {
        // Font paths (public/static paths for production)
        HEBREW_FONT_PATH: '/assets/fonts/DavidLibre/DavidLibre-Regular.ttf',
        HEBREW_FONT_BOLD_PATH: '/assets/fonts/DavidLibre/DavidLibre-Bold.ttf',

        // Base64 font data URLs (for bundled fonts)
        HEBREW_FONT_BASE64: null, // Will be set if font is bundled

        // Font names
        HEBREW_FONT_NAME: 'DavidLibre',
        FALLBACK_FONT_NAME: 'Helvetica',
        DINGBATS_FONT_NAME: 'ZapfDingbats',

        // Caching
        CACHE_ENABLED: true,
        CACHE_KEY_PREFIX: 'tofesly_font_'
    };

    // Font cache
    const fontCache = new Map();

    // ============ FONT LOADING ============

    /**
     * Load font from URL
     * @param {string} url - Font URL
     * @returns {Promise<ArrayBuffer>} Font data
     */
    async function loadFontFromUrl(url) {
        // Check cache first
        const cacheKey = FONT_CONFIG.CACHE_KEY_PREFIX + url;
        if (fontCache.has(cacheKey)) {
            return fontCache.get(cacheKey);
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load font: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            // Cache the font
            if (FONT_CONFIG.CACHE_ENABLED) {
                fontCache.set(cacheKey, arrayBuffer);
            }

            return arrayBuffer;
        } catch (error) {
            console.warn(`⚠️ Could not load font from ${url}:`, error.message);
            return null;
        }
    }

    /**
     * Load font from base64 string
     * @param {string} base64 - Base64 encoded font data
     * @returns {Uint8Array} Font data
     */
    function loadFontFromBase64(base64) {
        try {
            const binaryString = atob(base64.replace(/^data:[^;]+;base64,/, ''));
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        } catch (error) {
            console.warn('⚠️ Could not decode base64 font:', error.message);
            return null;
        }
    }

    /**
     * Load Hebrew font
     * @returns {Promise<ArrayBuffer|null>} Font data or null
     */
    async function loadHebrewFont() {
        // Try base64 bundled font first
        if (FONT_CONFIG.HEBREW_FONT_BASE64) {
            const fontData = loadFontFromBase64(FONT_CONFIG.HEBREW_FONT_BASE64);
            if (fontData) return fontData;
        }

        // Try window.DAVID_LIBRE_FONT_BASE64 (from bundled script)
        if (window.DAVID_LIBRE_FONT_BASE64) {
            const fontData = loadFontFromBase64(window.DAVID_LIBRE_FONT_BASE64);
            if (fontData) return fontData;
        }

        // Try loading from URL
        const fontData = await loadFontFromUrl(FONT_CONFIG.HEBREW_FONT_PATH);
        if (fontData) return fontData;

        // Try alternate paths (production and development fallbacks)
        const alternatePaths = [
            '/assets/fonts/DavidLibre/DavidLibre-Regular.ttf',
            '/assets/fonts/DavidLibre-Regular.ttf',
            '../assets/fonts/DavidLibre/DavidLibre-Regular.ttf',
            './fonts/DavidLibre-Regular.ttf'
        ];

        for (const path of alternatePaths) {
            const data = await loadFontFromUrl(path);
            if (data) return data;
        }

        console.warn('⚠️ Hebrew font not found. Text rendering may be affected.');
        return null;
    }

    // ============ FONT EMBEDDING ============

    /**
     * Embed all required fonts in a PDF document
     * @param {Object} pdfDoc - PDF-LIB PDFDocument
     * @param {Object} options - Options { hebrewFontBytes, embedDingbats }
     * @returns {Promise<Object>} Embedded fonts { main, fallback, dingbats, bold }
     */
    async function embedFonts(pdfDoc, options = {}) {
        const fonts = {
            main: null,      // Hebrew font
            fallback: null,  // Helvetica
            dingbats: null,  // ZapfDingbats
            bold: null       // Bold variant
        };

        try {
            // Import StandardFonts from pdf-lib
            const { StandardFonts } = await import('pdf-lib');

            // Embed Helvetica as fallback
            fonts.fallback = await pdfDoc.embedFont(StandardFonts.Helvetica);

            // Embed ZapfDingbats for markers
            if (options.embedDingbats !== false) {
                try {
                    fonts.dingbats = await pdfDoc.embedFont(StandardFonts.ZapfDingbats);
                } catch (e) {
                    console.warn('⚠️ Could not embed ZapfDingbats');
                }
            }

            // Embed Hebrew font
            let hebrewFontBytes = options.hebrewFontBytes;

            if (!hebrewFontBytes) {
                hebrewFontBytes = await loadHebrewFont();
            }

            if (hebrewFontBytes) {
                try {
                    fonts.main = await pdfDoc.embedFont(hebrewFontBytes, { subset: true });
                    console.log('✅ Hebrew font embedded successfully');
                } catch (e) {
                    console.warn('⚠️ Could not embed Hebrew font:', e.message);
                    fonts.main = fonts.fallback;
                }
            } else {
                fonts.main = fonts.fallback;
            }

            return fonts;
        } catch (error) {
            console.error('❌ Font embedding error:', error);
            throw error;
        }
    }

    // ============ FONT UTILITIES ============

    /**
     * Get font for text based on content
     * @param {string} text - Text content
     * @param {Object} fonts - Available fonts
     * @returns {Object} Appropriate font
     */
    function getFontForText(text, fonts) {
        if (!text) return fonts.fallback || fonts.main;

        // Check for Hebrew characters
        const hasHebrew = /[\u0590-\u05FF]/.test(text);

        if (hasHebrew && fonts.main) {
            return fonts.main;
        }

        return fonts.fallback || fonts.main;
    }

    /**
     * Check if a font supports a character
     * @param {Object} font - PDF-LIB font
     * @param {string} char - Character to check
     * @returns {boolean} True if supported
     */
    function fontSupportsChar(font, char) {
        try {
            font.encodeText(char);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Get supported text from font
     * @param {string} text - Original text
     * @param {Object} font - PDF-LIB font
     * @returns {string} Text with unsupported chars replaced
     */
    function getSupportedText(text, font) {
        if (!text || !font) return text;

        let result = '';
        for (const char of text) {
            if (fontSupportsChar(font, char)) {
                result += char;
            } else {
                result += '?';
            }
        }
        return result;
    }

    // ============ FONT INFO ============

    /**
     * Get font metrics
     * @param {Object} font - PDF-LIB font
     * @param {number} fontSize - Font size
     * @returns {Object} Font metrics { ascent, descent, lineHeight }
     */
    function getFontMetrics(font, fontSize) {
        try {
            const ascent = font.heightAtSize(fontSize);
            const descent = font.heightAtSize(fontSize) * 0.2; // Approximate
            const lineHeight = ascent + descent;

            return { ascent, descent, lineHeight };
        } catch (e) {
            // Fallback metrics
            return {
                ascent: fontSize * 0.8,
                descent: fontSize * 0.2,
                lineHeight: fontSize * 1.2
            };
        }
    }

    /**
     * Get available font names
     * @returns {Object} Font name configuration
     */
    function getFontNames() {
        return {
            hebrew: FONT_CONFIG.HEBREW_FONT_NAME,
            fallback: FONT_CONFIG.FALLBACK_FONT_NAME,
            dingbats: FONT_CONFIG.DINGBATS_FONT_NAME
        };
    }

    // ============ CACHE MANAGEMENT ============

    /**
     * Clear font cache
     */
    function clearCache() {
        fontCache.clear();
        console.log('🗑️ Font cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    function getCacheStats() {
        return {
            size: fontCache.size,
            enabled: FONT_CONFIG.CACHE_ENABLED
        };
    }

    /**
     * Set bundled Hebrew font data
     * @param {string} base64Data - Base64 encoded font
     */
    function setHebrewFontBase64(base64Data) {
        FONT_CONFIG.HEBREW_FONT_BASE64 = base64Data;
    }

    // ============ EXPORT ============

    window.FontManager = {
        // Configuration
        config: FONT_CONFIG,

        // Font loading
        loadFontFromUrl,
        loadFontFromBase64,
        loadHebrewFont,

        // Font embedding
        embedFonts,

        // Utilities
        getFontForText,
        fontSupportsChar,
        getSupportedText,
        getFontMetrics,
        getFontNames,

        // Cache
        clearCache,
        getCacheStats,
        setHebrewFontBase64
    };

    console.log('%c🔤 Font Manager Module Loaded (Step 8)', 'background: #673AB7; color: white; font-size: 14px; padding: 5px;');
})();
