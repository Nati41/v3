/**
 * Visual Test Logger
 * Lightweight logging system for visual tests (Soft Mode)
 *
 * Features:
 * - Console logging with prefixes
 * - Structured log storage
 * - Performance tracking
 * - No UI blocking
 */
(function() {
    'use strict';

    // Log levels
    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        CRITICAL: 4
    };

    // Log storage (circular buffer to prevent memory bloat)
    const MAX_LOGS = 500;
    let logs = [];
    let logIndex = 0;

    // Current log level filter
    let currentLevel = LOG_LEVELS.WARN;

    // Timestamps
    let lastRunTime = null;
    let totalRunTime = 0;
    let runCount = 0;

    /**
     * Create a log entry
     * @param {string} level - Log level
     * @param {string} category - Category (e.g., 'boundary', 'mode', 'zoom')
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {HTMLElement} element - Related DOM element
     */
    function log(level, category, message, data = null, element = null) {
        const entry = {
            id: logIndex++,
            timestamp: Date.now(),
            level,
            category,
            message,
            data,
            elementInfo: element ? getElementInfo(element) : null
        };

        // Add to circular buffer
        if (logs.length >= MAX_LOGS) {
            logs.shift();
        }
        logs.push(entry);

        // Console output based on level
        if (LOG_LEVELS[level] >= currentLevel) {
            const prefix = `[VisualTest:${category}]`;
            const style = getLogStyle(level);

            if (level === 'ERROR' || level === 'CRITICAL') {
                console.error(`%c${prefix} ${message}`, style, data || '');
            } else if (level === 'WARN') {
                console.warn(`%c${prefix} ${message}`, style, data || '');
            } else {
                console.log(`%c${prefix} ${message}`, style, data || '');
            }

            // Highlight element if debug mode
            if (element && window.VisualTests?.debugHighlight) {
                highlightElement(element, level);
            }
        }

        return entry;
    }

    /**
     * Get element info for logging
     */
    function getElementInfo(element) {
        if (!element || !element.getBoundingClientRect) return null;

        const rect = element.getBoundingClientRect();
        return {
            tagName: element.tagName,
            id: element.id || null,
            className: element.className || null,
            dataFieldId: element.dataset?.fieldId || null,
            dataTableId: element.dataset?.tableId || null,
            rect: {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                right: Math.round(rect.right),
                bottom: Math.round(rect.bottom),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            }
        };
    }

    /**
     * Get console style for log level
     */
    function getLogStyle(level) {
        const styles = {
            DEBUG: 'color: #888',
            INFO: 'color: #0066cc',
            WARN: 'color: #cc6600; font-weight: bold',
            ERROR: 'color: #cc0000; font-weight: bold',
            CRITICAL: 'color: #ff0000; font-weight: bold; background: #ffeeee'
        };
        return styles[level] || styles.INFO;
    }

    /**
     * Highlight element visually (debug mode only)
     */
    function highlightElement(element, level) {
        if (!element || !element.style) return;

        const colors = {
            WARN: 'rgba(255, 200, 0, 0.5)',
            ERROR: 'rgba(255, 100, 100, 0.5)',
            CRITICAL: 'rgba(255, 0, 0, 0.7)'
        };

        const originalOutline = element.style.outline;
        const originalBoxShadow = element.style.boxShadow;

        element.style.outline = `3px solid ${colors[level] || colors.WARN}`;
        element.style.boxShadow = `0 0 10px ${colors[level] || colors.WARN}`;

        // Remove highlight after 3 seconds
        setTimeout(() => {
            element.style.outline = originalOutline;
            element.style.boxShadow = originalBoxShadow;
        }, 3000);
    }

    /**
     * Convenience methods
     */
    function debug(category, message, data, element) {
        return log('DEBUG', category, message, data, element);
    }

    function info(category, message, data, element) {
        return log('INFO', category, message, data, element);
    }

    function warn(category, message, data, element) {
        return log('WARN', category, message, data, element);
    }

    function error(category, message, data, element) {
        return log('ERROR', category, message, data, element);
    }

    function critical(category, message, data, element) {
        return log('CRITICAL', category, message, data, element);
    }

    /**
     * Start timing a test run
     */
    function startRun() {
        lastRunTime = performance.now();
    }

    /**
     * End timing a test run
     */
    function endRun() {
        if (lastRunTime) {
            const elapsed = performance.now() - lastRunTime;
            totalRunTime += elapsed;
            runCount++;
            lastRunTime = null;
            return elapsed;
        }
        return 0;
    }

    /**
     * Get statistics
     */
    function getStats() {
        const warnings = logs.filter(l => l.level === 'WARN').length;
        const errors = logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length;

        return {
            totalLogs: logs.length,
            warnings,
            errors,
            runCount,
            avgRunTime: runCount > 0 ? (totalRunTime / runCount).toFixed(2) : 0,
            lastRunMs: lastRunTime ? (performance.now() - lastRunTime).toFixed(2) : null
        };
    }

    /**
     * Get recent logs
     */
    function getRecentLogs(count = 50, levelFilter = null) {
        let filtered = logs;
        if (levelFilter) {
            filtered = logs.filter(l => l.level === levelFilter);
        }
        return filtered.slice(-count);
    }

    /**
     * Get logs by category
     */
    function getLogsByCategory(category, count = 50) {
        return logs.filter(l => l.category === category).slice(-count);
    }

    /**
     * Clear all logs
     */
    function clear() {
        logs = [];
        logIndex = 0;
        totalRunTime = 0;
        runCount = 0;
    }

    /**
     * Set log level
     */
    function setLevel(level) {
        if (LOG_LEVELS[level] !== undefined) {
            currentLevel = LOG_LEVELS[level];
        }
    }

    /**
     * Export logs as JSON
     */
    function exportLogs() {
        return {
            exportTime: new Date().toISOString(),
            stats: getStats(),
            logs: logs
        };
    }

    // Export
    window.VisualTestLogger = {
        LOG_LEVELS,
        log,
        debug,
        info,
        warn,
        error,
        critical,
        startRun,
        endRun,
        getStats,
        getRecentLogs,
        getLogsByCategory,
        clear,
        setLevel,
        exportLogs,
        highlightElement
    };

})();
