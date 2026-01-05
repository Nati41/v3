/**
 * Semantic Engine - Module Loader
 *
 * This file serves as the entry point for the semantic matching engine.
 * Include this script AFTER ExcelDataResolver.js to enable enhanced matching.
 *
 * Modules loaded:
 * 1. dictionaries/synonyms.js - Hebrew/English synonyms for canonical fields
 * 2. dictionaries/formats.js - Regex patterns for Israeli data formats
 * 3. dictionaries/entities.js - Entity grouping for disambiguation
 * 4. Preprocessor.js - Data cleaning and normalization
 * 5. SemanticMatcher.js - Multi-tier matching logic
 * 6. SemanticIntegration.js - Hooks into ExcelDataResolver
 *
 * Usage:
 * The integration is automatic. Once loaded, ExcelDataResolver.matchColumns
 * will use enhanced semantic matching for unmatched columns.
 *
 * To check status: SemanticIntegration.getStatus()
 * To disable: SemanticIntegration.disable()
 */
(function() {
    'use strict';

    console.log('%c🧠 Semantic Engine Loading...', 'background: #7c3aed; color: white; font-size: 12px; padding: 3px;');

    // Track loading status
    window.SemanticEngineStatus = {
        loaded: false,
        modules: {},
        errors: []
    };

    /**
     * Dynamically load a script
     * @param {string} src - Script path relative to semantic folder
     * @returns {Promise}
     */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            // Determine base path
            const currentScript = document.currentScript;
            let basePath = '';

            if (currentScript && currentScript.src) {
                basePath = currentScript.src.substring(0, currentScript.src.lastIndexOf('/') + 1);
            } else {
                // Fallback: try to detect from other loaded scripts
                const scripts = document.querySelectorAll('script[src*="semantic"]');
                if (scripts.length > 0) {
                    const lastScript = scripts[scripts.length - 1];
                    basePath = lastScript.src.substring(0, lastScript.src.lastIndexOf('/') + 1);
                }
            }

            const fullPath = basePath + src;
            const script = document.createElement('script');
            script.src = fullPath;
            script.async = false; // Load in order

            script.onload = () => {
                console.log(`  ✓ Loaded: ${src}`);
                window.SemanticEngineStatus.modules[src] = true;
                resolve();
            };

            script.onerror = (error) => {
                console.error(`  ✗ Failed: ${src}`, error);
                window.SemanticEngineStatus.modules[src] = false;
                window.SemanticEngineStatus.errors.push({ src, error });
                reject(error);
            };

            document.head.appendChild(script);
        });
    }

    /**
     * Load all modules in sequence
     */
    async function loadModules() {
        const modules = [
            'dictionaries/synonyms.js',
            'dictionaries/formats.js',
            'dictionaries/entities.js',
            'Preprocessor.js',
            'SemanticMatcher.js',
            'SemanticIntegration.js'
        ];

        for (const module of modules) {
            try {
                await loadScript(module);
            } catch (e) {
                // Continue loading other modules even if one fails
                console.warn(`Skipping failed module: ${module}`);
            }
        }

        // Mark as loaded
        window.SemanticEngineStatus.loaded = true;

        // Trigger integration init if not already done
        if (window.SemanticIntegration && !window.SemanticIntegration.enabled) {
            const initSuccess = window.SemanticIntegration.init();
            if (initSuccess) {
                console.log('%c🧠 Semantic Engine Ready', 'background: #22c55e; color: white; font-size: 12px; padding: 3px;');
            }
        }
    }

    // Start loading
    loadModules().catch(err => {
        console.error('Semantic Engine failed to load:', err);
    });

})();
