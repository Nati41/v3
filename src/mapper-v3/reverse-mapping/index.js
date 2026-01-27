/**
 * Reverse Mapping Module - Index
 * Exports all components for the experimental Reverse Mapping mode
 */

export { reverseMappingMode, ReverseTypes } from './ReverseMappingMode.js';
export { ReverseMappingOverlay } from './ReverseMappingOverlay.js';
export { ReverseMappingPanel } from './ReverseMappingPanel.js';
export { ReverseMappingAI } from './ReverseMappingAI.js';

// Auto-initialize when imported
import { reverseMappingMode } from './ReverseMappingMode.js';

// Initialize the mode controller
if (typeof window !== 'undefined') {
    // Wait for DOM and other modules
    const initReverseMapping = () => {
        if (document.readyState === 'complete') {
            reverseMappingMode.init();
        } else {
            window.addEventListener('load', () => {
                reverseMappingMode.init();
            });
        }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(initReverseMapping);
}
