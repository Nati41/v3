/**
 * Visual Test Report
 * UI widget for displaying test results on screen
 *
 * Features:
 * - Floating summary panel at bottom-right
 * - Expandable detail view
 * - Auto-update on new results
 * - Minimal footprint in soft mode
 */
(function() {
    'use strict';

    // Report state
    let container = null;
    let isExpanded = false;
    let isVisible = false;
    let unsubscribe = null;

    // Configuration
    const config = {
        position: 'bottom-right', // bottom-right, bottom-left, top-right, top-left
        autoHide: false,          // Hide when clean
        autoHideDelay: 5000,      // ms to wait before auto-hide
        showTimestamp: true,
        maxDetailsShown: 10
    };

    /**
     * Initialize report UI
     */
    function init() {
        if (container) {
            return; // Already initialized
        }

        createContainer();
        subscribeToResults();

        console.log('[VisualTestReport] Initialized');
    }

    /**
     * Create the report container
     */
    function createContainer() {
        container = document.createElement('div');
        container.id = 'visual-test-report';
        container.className = 'visual-test-report collapsed';
        container.innerHTML = getReportHTML();

        // Position based on config
        applyPosition();

        // Add to body
        document.body.appendChild(container);

        // Setup event listeners
        setupEventListeners();
    }

    /**
     * Get initial HTML structure
     */
    function getReportHTML() {
        return `
            <div class="vtr-header" title="Click to expand/collapse">
                <span class="vtr-icon">🧪</span>
                <span class="vtr-title">Visual Tests</span>
                <span class="vtr-status"></span>
                <button class="vtr-toggle" aria-label="Toggle details">▼</button>
            </div>
            <div class="vtr-summary">
                <div class="vtr-counts">
                    <span class="vtr-count vtr-passed" title="Passed">✓ <span class="count">0</span></span>
                    <span class="vtr-count vtr-warnings" title="Warnings">⚠️ <span class="count">0</span></span>
                    <span class="vtr-count vtr-errors" title="Errors">❌ <span class="count">0</span></span>
                </div>
                <div class="vtr-timing">
                    <span class="vtr-runtime"></span>
                    <span class="vtr-trigger"></span>
                </div>
            </div>
            <div class="vtr-details">
                <div class="vtr-details-header">
                    <span>Details</span>
                    <button class="vtr-clear" title="Clear logs">Clear</button>
                </div>
                <div class="vtr-details-list"></div>
            </div>
            <div class="vtr-actions">
                <button class="vtr-run-now" title="Run tests now">▶ Run</button>
                <button class="vtr-export" title="Export logs">📥 Export</button>
            </div>
        `;
    }

    /**
     * Apply position based on config
     */
    function applyPosition() {
        container.classList.remove('pos-bottom-right', 'pos-bottom-left', 'pos-top-right', 'pos-top-left');
        container.classList.add(`pos-${config.position}`);
    }

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        // Header click to toggle
        const header = container.querySelector('.vtr-header');
        header.addEventListener('click', toggle);

        // Clear button
        const clearBtn = container.querySelector('.vtr-clear');
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearDetails();
        });

        // Run now button
        const runBtn = container.querySelector('.vtr-run-now');
        runBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            runNow();
        });

        // Export button
        const exportBtn = container.querySelector('.vtr-export');
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportLogs();
        });
    }

    /**
     * Subscribe to test results
     */
    function subscribeToResults() {
        if (window.VisualTestEngine) {
            unsubscribe = window.VisualTestEngine.addListener(onResult);
        }
    }

    /**
     * Handle new test result
     */
    function onResult(result) {
        if (!container) return;

        updateSummary(result);
        updateDetails(result);
        updateStatus(result);

        // Show if hidden and has issues
        if (!isVisible && (result.warnings > 0 || result.errors > 0)) {
            show();
        }

        // Auto-hide if clean
        if (config.autoHide && result.summary?.clean) {
            setTimeout(() => {
                if (window.VisualTestEngine?.getLastResult()?.summary?.clean) {
                    hide();
                }
            }, config.autoHideDelay);
        }
    }

    /**
     * Update summary section
     */
    function updateSummary(result) {
        // Update counts
        container.querySelector('.vtr-passed .count').textContent = result.passed || 0;
        container.querySelector('.vtr-warnings .count').textContent = result.warnings || 0;
        container.querySelector('.vtr-errors .count').textContent = result.errors || 0;

        // Update timing
        const runtimeEl = container.querySelector('.vtr-runtime');
        runtimeEl.textContent = `${result.runTimeMs}ms`;

        // Update trigger
        const triggerEl = container.querySelector('.vtr-trigger');
        triggerEl.textContent = result.trigger || '';

        // Update header status
        const statusEl = container.querySelector('.vtr-status');
        if (result.errors > 0) {
            statusEl.textContent = '❌';
            statusEl.title = `${result.errors} error(s)`;
        } else if (result.warnings > 0) {
            statusEl.textContent = '⚠️';
            statusEl.title = `${result.warnings} warning(s)`;
        } else {
            statusEl.textContent = '✓';
            statusEl.title = 'All clean';
        }
    }

    /**
     * Update details section
     */
    function updateDetails(result) {
        const list = container.querySelector('.vtr-details-list');

        if (!result.results || result.results.length === 0) {
            list.innerHTML = '<div class="vtr-detail-empty">No issues detected</div>';
            return;
        }

        // Show most recent issues (up to max)
        const issues = result.results.slice(0, config.maxDetailsShown);

        list.innerHTML = issues.map(issue => `
            <div class="vtr-detail-item vtr-severity-${issue.severity}">
                <span class="vtr-detail-icon">${getSeverityIcon(issue.severity)}</span>
                <span class="vtr-detail-category">[${issue.category}]</span>
                <span class="vtr-detail-message">${escapeHtml(issue.message)}</span>
                ${issue.element ? `<span class="vtr-detail-element" title="${escapeHtml(JSON.stringify(issue.element))}">📍</span>` : ''}
            </div>
        `).join('');

        // Add "more" indicator if truncated
        if (result.results.length > config.maxDetailsShown) {
            list.innerHTML += `<div class="vtr-detail-more">+ ${result.results.length - config.maxDetailsShown} more</div>`;
        }
    }

    /**
     * Update status indicator
     */
    function updateStatus(result) {
        container.classList.remove('status-clean', 'status-warn', 'status-error');

        if (result.errors > 0) {
            container.classList.add('status-error');
        } else if (result.warnings > 0) {
            container.classList.add('status-warn');
        } else {
            container.classList.add('status-clean');
        }
    }

    /**
     * Get icon for severity
     */
    function getSeverityIcon(severity) {
        const icons = {
            'critical': '🔴',
            'error': '❌',
            'warn': '⚠️',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        return icons[severity] || '•';
    }

    /**
     * Escape HTML
     */
    function escapeHtml(str) {
        if (typeof str !== 'string') return str;
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Toggle expanded state
     */
    function toggle() {
        isExpanded = !isExpanded;
        container.classList.toggle('expanded', isExpanded);
        container.classList.toggle('collapsed', !isExpanded);

        const toggleBtn = container.querySelector('.vtr-toggle');
        toggleBtn.textContent = isExpanded ? '▲' : '▼';
    }

    /**
     * Expand the report
     */
    function expand() {
        if (!isExpanded) {
            toggle();
        }
    }

    /**
     * Collapse the report
     */
    function collapse() {
        if (isExpanded) {
            toggle();
        }
    }

    /**
     * Show the report
     */
    function show() {
        if (container) {
            container.classList.remove('hidden');
            isVisible = true;
        }
    }

    /**
     * Hide the report
     */
    function hide() {
        if (container) {
            container.classList.add('hidden');
            isVisible = false;
        }
    }

    /**
     * Clear details list
     */
    function clearDetails() {
        const list = container.querySelector('.vtr-details-list');
        list.innerHTML = '<div class="vtr-detail-empty">Cleared</div>';
        window.VisualTestLogger?.clear();
    }

    /**
     * Run tests now
     */
    function runNow() {
        const runner = window.VisualTestRunner;
        if (runner) {
            const result = runner.runNow('manual-ui');
            if (result) {
                onResult(result);
            }
        }
    }

    /**
     * Export logs
     */
    function exportLogs() {
        const Logger = window.VisualTestLogger;
        if (!Logger) return;

        const data = Logger.exportLogs();
        const json = JSON.stringify(data, null, 2);

        // Create download
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `visual-test-logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Configure the report
     */
    function configure(newConfig) {
        Object.assign(config, newConfig);
        if (container) {
            applyPosition();
        }
    }

    /**
     * Destroy the report
     */
    function destroy() {
        if (unsubscribe) {
            unsubscribe();
        }
        if (container) {
            container.remove();
            container = null;
        }
        isExpanded = false;
        isVisible = false;
    }

    /**
     * Get report status
     */
    function getStatus() {
        return {
            initialized: !!container,
            visible: isVisible,
            expanded: isExpanded
        };
    }

    // Export
    window.VisualTestReport = {
        init,
        show,
        hide,
        toggle,
        expand,
        collapse,
        configure,
        destroy,
        getStatus,
        onResult
    };

})();
