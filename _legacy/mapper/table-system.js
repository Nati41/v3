/**
 * Table System Module Entry Point
 * Loads all table mapping ES modules and exposes them on window
 */

import { TableModel } from "../shared/tables/tableModel.js";
import { TableStepController, TableSteps } from "../shared/tables/tableStepController.js";
import { TableUIManager } from "../shared/tables/tableUI.js";
import { TableOverlay } from "../shared/tables/tableOverlay.js";
import { tableValidator } from "../shared/tables/tableValidatorWrapper.js";

// Expose to window for mapper.js access
window.TofeslyTableSystem = {
    TableModel,
    TableStepController,
    TableSteps,
    TableUIManager,
    TableOverlay,
    tableValidator
};

// Also expose individually for backwards compatibility
window.TableModel = TableModel;
window.TableStepController = TableStepController;
window.TableSteps = TableSteps;
window.TableUIManager = TableUIManager;
window.TableOverlay = TableOverlay;
window.tableValidator = tableValidator;

console.log("📘 Table System Loaded (Modules OK)");
