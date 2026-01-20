/**
 * Core Module - Unified Foundation for Desktop Modules
 * Phase 1 - Foundation
 *
 * This module provides shared infrastructure for:
 * - Mapper-v3
 * - LiveFill
 * - Excel integration
 * - Export Engine
 *
 * Usage:
 *   // Import everything
 *   import * as Core from '../core/index.js';
 *
 *   // Import specific modules
 *   import { state, eventBus, Events } from '../core/index.js';
 *   import { getCoordinateService, createPDFService } from '../core/index.js';
 *
 *   // Or import directly from individual files
 *   import { state } from '../core/UnifiedStateManager.js';
 *   import { eventBus, Events } from '../core/UnifiedEventBus.js';
 */

'use strict';

// ============ EVENT BUS ============
export {
    UnifiedEventBus,
    eventBus,
    Events
} from './UnifiedEventBus.js';

// ============ STATE MANAGER ============
export {
    UnifiedStateManager,
    state,
    Tools,
    Modes,
    FlowModes,
    ExportStatus
} from './UnifiedStateManager.js';

// ============ COORDINATE SERVICE ============
export {
    CoordinateService,
    getCoordinateService,
    createCoordinateService,
    canvasToPdfPoint,
    pdfToCanvasPoint,
    CoordinateFormats
} from './CoordinateService.js';

// ============ PDF SERVICE ============
export {
    PDFService,
    createPDFService,
    createMapperPDFService,
    createLiveFillPDFService,
    RenderStrategy,
    PDF_DPI,
    DEFAULT_RENDER_DPI,
    DEFAULT_RENDER_SCALE
} from './PDFService.js';

// ============ VERSION ============
export const CORE_VERSION = '1.0.0';
export const CORE_BUILD_DATE = '2026-01-20';

// ============ QUICK ACCESS OBJECT ============
/**
 * Quick access to commonly used singletons
 */
export const Core = {
    // Singletons
    get state() {
        const { state } = require('./UnifiedStateManager.js');
        return state;
    },
    get eventBus() {
        const { eventBus } = require('./UnifiedEventBus.js');
        return eventBus;
    },
    get Events() {
        const { Events } = require('./UnifiedEventBus.js');
        return Events;
    },

    // Factories
    createPDFService: (options) => {
        const { createPDFService } = require('./PDFService.js');
        return createPDFService(options);
    },
    getCoordinateService: (viewport, scale) => {
        const { getCoordinateService } = require('./CoordinateService.js');
        return getCoordinateService(viewport, scale);
    },

    // Version
    version: CORE_VERSION
};

// ============ DEBUG / GLOBAL EXPORT ============
if (typeof window !== 'undefined') {
    // Make Core available globally for debugging
    window.Core = Core;

    // Log module loaded
    console.log(`[Core] Unified Core Module v${CORE_VERSION} loaded`);
}
