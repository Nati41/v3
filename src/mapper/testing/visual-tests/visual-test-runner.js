/**
 * Visual Test Runner
 * Automatic test execution on various triggers
 *
 * Hooks into mapper lifecycle events and runs tests automatically
 */
(function() {
    'use strict';

    // Runner state
    let mapper = null;
    let isActive = false;
    let hooks = [];

    // Trigger tracking (to prevent duplicate runs)
    let lastTriggers = {};
    const TRIGGER_COOLDOWN = 100; // ms

    /**
     * Initialize runner with mapper instance
     */
    function init(mapperInstance) {
        mapper = mapperInstance;

        if (!mapper) {
            console.warn('[VisualTestRunner] No mapper instance provided');
            return false;
        }

        console.log('[VisualTestRunner] Initialized');
        return true;
    }

    /**
     * Start automatic test execution
     */
    function start() {
        if (!mapper) {
            console.warn('[VisualTestRunner] Cannot start - no mapper instance');
            return false;
        }

        if (isActive) {
            console.log('[VisualTestRunner] Already active');
            return true;
        }

        isActive = true;
        setupHooks();
        console.log('[VisualTestRunner] Started automatic testing');

        // Run initial test
        trigger('init');

        return true;
    }

    /**
     * Stop automatic test execution
     */
    function stop() {
        isActive = false;
        removeHooks();
        console.log('[VisualTestRunner] Stopped');
    }

    /**
     * Setup lifecycle hooks
     */
    function setupHooks() {
        // Window resize
        const resizeHandler = debounce(() => trigger('resize'), 200);
        window.addEventListener('resize', resizeHandler);
        hooks.push({ event: 'resize', handler: resizeHandler, target: window });

        // Mutation observer for DOM changes
        const observer = new MutationObserver(debounce((mutations) => {
            // ========== ORPHAN OVERLAY CLEANUP — SAFETY NET ==========
            // Remove any orphaned table cell overlays with undefined or missing table IDs
            // This catches edge cases where cleanup might have been missed
            const orphanOverlays = document.querySelectorAll(
                '.table-cell-overlay[data-table-id="undefined"], ' +
                '.table-cell-overlay:not([data-table-id])'
            );
            if (orphanOverlays.length > 0) {
                orphanOverlays.forEach(el => el.remove());
                console.log(`📐 [VisualTestRunner] Cleaned ${orphanOverlays.length} orphan overlays`);
            }

            // Only trigger if relevant elements changed
            const hasRelevantChanges = mutations.some(m => {
                const target = m.target;
                return target.classList?.contains('field-overlay') ||
                       target.classList?.contains('table-cell-overlay') ||
                       target.classList?.contains('table-hint') ||
                       target.id === 'mapping-layer' ||
                       target.id === 'visual-guide-overlay';
            });

            if (hasRelevantChanges) {
                trigger('dom-change');
            }
        }, 100));

        const mappingLayer = document.getElementById('mapping-layer');
        if (mappingLayer) {
            observer.observe(mappingLayer, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style']
            });
            hooks.push({ observer, target: mappingLayer });
        }

        // Visual guide overlay
        const visualGuide = document.getElementById('visual-guide-overlay');
        if (visualGuide) {
            observer.observe(visualGuide, {
                childList: true,
                subtree: true,
                attributes: true
            });
        }
    }

    /**
     * Remove all hooks
     */
    function removeHooks() {
        hooks.forEach(hook => {
            if (hook.observer) {
                hook.observer.disconnect();
            } else if (hook.event && hook.target) {
                hook.target.removeEventListener(hook.event, hook.handler);
            }
        });
        hooks = [];
    }

    /**
     * Trigger test run
     */
    function trigger(triggerName, context = {}) {
        if (!isActive) return;

        // Check cooldown
        const now = Date.now();
        if (lastTriggers[triggerName] && now - lastTriggers[triggerName] < TRIGGER_COOLDOWN) {
            return; // Skip - too soon
        }
        lastTriggers[triggerName] = now;

        // Run test
        window.VisualTestEngine?.runDebounced(mapper, {
            trigger: triggerName,
            context
        });
    }

    /**
     * Manual trigger for specific events
     */
    function onZoomChange() {
        trigger('zoom-change', { zoom: mapper?.zoomLevel });
    }

    function onPageChange(pageNum) {
        trigger('page-change', { page: pageNum });
    }

    function onModeChange(mode) {
        trigger('mode-change', { mode });
    }

    function onRenderFields() {
        trigger('render-fields');
    }

    function onRenderTableCells(tableId) {
        trigger('render-table-cells', { tableId });
    }

    function onLoadMappingJSON() {
        trigger('load-mapping-json');
    }

    function onTableWizardFinish(tableId) {
        trigger('table-wizard-finish', { tableId });
    }

    function onTableWizardCancel() {
        trigger('table-wizard-cancel');
    }

    /**
     * Debounce helper
     */
    function debounce(fn, delay) {
        let timer = null;
        return function(...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                fn.apply(this, args);
                timer = null;
            }, delay);
        };
    }

    /**
     * Run test immediately (bypass debounce)
     */
    function runNow(triggerName = 'manual') {
        if (!mapper) {
            console.warn('[VisualTestRunner] No mapper instance');
            return null;
        }

        return window.VisualTestEngine?.run(mapper, {
            trigger: triggerName,
            context: { immediate: true }
        });
    }

    /**
     * Get runner status
     */
    function getStatus() {
        return {
            active: isActive,
            hasMapper: !!mapper,
            hooksCount: hooks.length,
            lastTriggers: { ...lastTriggers }
        };
    }

    // Export
    window.VisualTestRunner = {
        init,
        start,
        stop,
        trigger,
        runNow,
        getStatus,

        // Event handlers for manual integration
        onZoomChange,
        onPageChange,
        onModeChange,
        onRenderFields,
        onRenderTableCells,
        onLoadMappingJSON,
        onTableWizardFinish,
        onTableWizardCancel
    };

})();
