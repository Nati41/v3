/**
 * Table System v2 - Stub file
 * Legacy table system moved to .backup files
 * New TableRegion system will be in core/TableRegionManager.js
 */

// Export empty stubs for backward compatibility
export const TableEvents = {
    FLOW_STARTED: 'table:flowStarted',
    STEP_CHANGED: 'table:stepChanged',
    FLOW_FINISHED: 'table:flowFinished',
    FLOW_CANCELLED: 'table:flowCancelled'
};

export const TableSteps = {};
export const TableModel = null;
export const TableFlowController = null;

console.log('[Tables] Legacy table system disabled. Using new TableRegion system.');
