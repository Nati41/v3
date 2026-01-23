/**
 * Font Paths Configuration
 *
 * Centralized font path definitions for consistent loading across all modules.
 * All font loading should reference this configuration rather than hardcoding paths.
 *
 * @version 1.0.0
 * @since 2025-01-23
 */

(function() {
    'use strict';

    /**
     * Canonical font paths - ordered by preference
     * The first path that successfully loads will be used.
     */
    const FONT_PATHS = {
        // Hebrew font (DavidLibre) - primary font for form filling
        HEBREW_REGULAR: [
            '/assets/fonts/DavidLibre/DavidLibre-Regular.ttf',  // Canonical (production)
            '/assets/fonts/DavidLibre-Regular.ttf',              // Flat structure fallback
            '../assets/fonts/DavidLibre/DavidLibre-Regular.ttf', // Relative fallback
            './fonts/DavidLibre-Regular.ttf'                     // Local dev fallback
        ],

        HEBREW_BOLD: [
            '/assets/fonts/DavidLibre/DavidLibre-Bold.ttf',
            '/assets/fonts/DavidLibre-Bold.ttf',
            '../assets/fonts/DavidLibre/DavidLibre-Bold.ttf',
            './fonts/DavidLibre-Bold.ttf'
        ],

        HEBREW_MEDIUM: [
            '/assets/fonts/DavidLibre/DavidLibre-Medium.ttf',
            '/assets/fonts/DavidLibre-Medium.ttf',
            '../assets/fonts/DavidLibre/DavidLibre-Medium.ttf',
            './fonts/DavidLibre-Medium.ttf'
        ]
    };

    /**
     * Font configuration
     */
    const FONT_CONFIG = {
        HEBREW_FONT_NAME: 'DavidLibre',
        FALLBACK_FONT_NAME: 'Helvetica',
        DINGBATS_FONT_NAME: 'ZapfDingbats'
    };

    /**
     * Load a font by trying paths in order
     * @param {string[]} paths - Array of paths to try
     * @returns {Promise<ArrayBuffer|null>} Font data or null if all paths fail
     */
    async function loadFontWithFallback(paths) {
        for (const path of paths) {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    console.log(`[FontPaths] Loaded font from: ${path}`);
                    return await response.arrayBuffer();
                }
            } catch (e) {
                // Continue to next path
            }
        }
        console.error('[FontPaths] Failed to load font from any path:', paths);
        return null;
    }

    /**
     * Get the first working font path (for CSS @font-face or other uses)
     * @param {string[]} paths - Array of paths to try
     * @returns {Promise<string|null>} First working path or null
     */
    async function getWorkingFontPath(paths) {
        for (const path of paths) {
            try {
                const response = await fetch(path, { method: 'HEAD' });
                if (response.ok) {
                    return path;
                }
            } catch (e) {
                // Continue to next path
            }
        }
        return null;
    }

    // Export to window for global access
    window.FontPaths = {
        PATHS: FONT_PATHS,
        CONFIG: FONT_CONFIG,
        loadFontWithFallback,
        getWorkingFontPath,

        // Convenience methods
        loadHebrewRegular: () => loadFontWithFallback(FONT_PATHS.HEBREW_REGULAR),
        loadHebrewBold: () => loadFontWithFallback(FONT_PATHS.HEBREW_BOLD),
        loadHebrewMedium: () => loadFontWithFallback(FONT_PATHS.HEBREW_MEDIUM)
    };

    console.log('[FontPaths] Module loaded - Centralized font path configuration ready');
})();
