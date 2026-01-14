/**
 * Test Report
 * Collects and formats test results
 *
 * NOTE: This is an ADDITIVE module - does not modify any existing mapper logic
 */

class TestReport {
    constructor() {
        this.results = [];
        this.startTime = null;
        this.endTime = null;
    }

    /**
     * Add a test result
     * @param {string} name - Test name
     * @param {string} status - 'passed' | 'failed' | 'skipped' | 'error'
     * @param {Object} details - Additional details { message, duration, error }
     */
    addResult(name, status, details = {}) {
        this.results.push({
            name,
            status,
            details,
            timestamp: Date.now()
        });
    }

    /**
     * Generate a summary of all results
     * @returns {Object} Summary with counts and pass rate
     */
    generateSummary() {
        const total = this.results.length;
        const passed = this.results.filter(r => r.status === 'passed').length;
        const failed = this.results.filter(r => r.status === 'failed').length;
        const skipped = this.results.filter(r => r.status === 'skipped').length;
        const errors = this.results.filter(r => r.status === 'error').length;

        const totalDuration = this.results.reduce((sum, r) => {
            return sum + (r.details.duration || 0);
        }, 0);

        return {
            total,
            passed,
            failed,
            skipped,
            errors,
            passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0',
            totalDuration,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get results filtered by status
     * @param {string} status - Status to filter by
     * @returns {Array} Filtered results
     */
    getByStatus(status) {
        return this.results.filter(r => r.status === status);
    }

    /**
     * Get failed tests only
     * @returns {Array} Failed test results
     */
    getFailed() {
        return this.getByStatus('failed');
    }

    /**
     * Get passed tests only
     * @returns {Array} Passed test results
     */
    getPassed() {
        return this.getByStatus('passed');
    }

    /**
     * Clear all results
     */
    clear() {
        this.results = [];
        this.startTime = null;
        this.endTime = null;
    }

    /**
     * Export results as JSON
     * @returns {string} JSON string of results
     */
    toJSON() {
        return JSON.stringify({
            summary: this.generateSummary(),
            results: this.results
        }, null, 2);
    }

    /**
     * Export results as HTML report
     * @returns {string} HTML string
     */
    toHTML() {
        const summary = this.generateSummary();

        return `
<!DOCTYPE html>
<html>
<head>
    <title>Test Report - ${summary.timestamp}</title>
    <style>
        body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary h2 { margin-top: 0; }
        .stats { display: flex; gap: 20px; }
        .stat { text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { font-size: 12px; color: #666; }
        .results { margin-top: 20px; }
        .result { padding: 10px; margin-bottom: 8px; border-radius: 6px; }
        .result.passed { background: #e8f5e9; border-left: 3px solid #4CAF50; }
        .result.failed { background: #ffebee; border-left: 3px solid #dc3545; }
        .result-name { font-weight: 500; }
        .result-message { font-size: 12px; color: #666; margin-top: 4px; }
    </style>
</head>
<body>
    <div class="summary">
        <h2>Test Report</h2>
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${summary.total}</div>
                <div class="stat-label">Total</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: #4CAF50;">${summary.passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: #dc3545;">${summary.failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat">
                <div class="stat-value">${summary.passRate}%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
        </div>
    </div>
    <div class="results">
        <h3>Results</h3>
        ${this.results.map(r => `
            <div class="result ${r.status}">
                <div class="result-name">${r.status === 'passed' ? '✓' : '✗'} ${r.name}</div>
                ${r.details.message ? `<div class="result-message">${r.details.message}</div>` : ''}
            </div>
        `).join('')}
    </div>
</body>
</html>
        `;
    }

    /**
     * Print summary to console
     */
    printSummary() {
        const summary = this.generateSummary();
        console.log('\n=== TEST REPORT ===');
        console.log(`Total: ${summary.total}`);
        console.log(`Passed: ${summary.passed}`);
        console.log(`Failed: ${summary.failed}`);
        console.log(`Pass Rate: ${summary.passRate}%`);
        console.log(`Duration: ${summary.totalDuration}ms`);
        console.log('===================\n');
    }
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.TestReport = TestReport;
}
