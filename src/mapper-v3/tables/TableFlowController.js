/**
 * TableFlowController.js - STUB
 * Legacy table flow controller has been disabled.
 * Full backup available at: TableFlowController.js.backup
 *
 * New system: core/TableRegionManager.js
 */

// Export empty events for backward compatibility
export const TableEvents = {
    FLOW_STARTED: 'table:flowStarted',
    STEP_CHANGED: 'table:stepChanged',
    FLOW_FINISHED: 'table:flowFinished',
    FLOW_CANCELLED: 'table:flowCancelled',
    UI_MESSAGE: 'table:ui:message',
    UI_LOCK_NEXT: 'table:ui:lockNext',
    UI_UNLOCK_NEXT: 'table:ui:unlockNext'
};

export const TableSteps = {
    IDLE: 0,
    SELECT_TABLE_BBOX: 1,
    SELECT_TITLE: 2,
    SAMPLE_ROW: 3,
    COLUMNS: 4,
    ROW_COUNT: 5,
    GENERATE: 6,
    REVIEW: 7
};

// Stub controller that does nothing
class TableFlowControllerStub {
    constructor() {
        this._active = false;
    }

    isActive() { return false; }
    start() { console.warn('[TableFlowController] Legacy system disabled'); }
    cancel() {}
    next() {}
    back() {}
}

export const tableFlowController = new TableFlowControllerStub();
