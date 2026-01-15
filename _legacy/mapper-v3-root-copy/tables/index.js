/**
 * Table Module - Index file for clean exports
 *
 * Migrated from old mapper's table system:
 * - /src/shared/tables/tableModel.js → TableModel.js
 * - /src/shared/tables/tableStepController.js → TableFlowController.js (adapted)
 * - /src/shared/tables/tableValidatorWrapper.js → TableValidator.js
 *
 * Usage:
 * import { TableModel, TableFlowController, TableSteps, tableValidator } from './tables/index.js';
 *
 * Or individual imports:
 * import { TableModel } from './tables/TableModel.js';
 * import { TableFlowController, TableSteps, TableEvents } from './tables/TableFlowController.js';
 * import { tableValidator, validateHeader, validateColumn } from './tables/TableValidator.js';
 */

// Core model
export { TableModel } from './TableModel.js';

// Flow controller and enums
export {
    TableFlowController,
    TableSteps,
    TableEvents
} from './TableFlowController.js';

// Validators
export {
    tableValidator,
    validateHeader,
    validateSampleRow,
    validateColumn,
    validateRowCount,
    validateComplete,
    validateStep,
    calculateOverlap
} from './TableValidator.js';
