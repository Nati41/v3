/**
 * Mapper Events - Event handling logic
 * These functions handle mouse, keyboard, and window events.
 *
 * NOTE: All event handlers receive the mapper instance as a parameter
 * to access state and call mapper methods.
 */
(function() {
    'use strict';

    // ============ RAPID KEY PRESS PROTECTION ============
    // Prevents issues from rapid repeated key presses
    let _lastEscTime = 0;
    const ESC_DEBOUNCE_MS = 150;

    // ============ GLOBAL FREEZE DETECTOR (ENHANCED) ============
    // Detects event loops, mode oscillations, and re-entry that could cause UI freezes
    const FreezeDetector = {
        _eventCounts: {
            pointermove: 0,
            mousemove: 0,
            resize: 0,
            mutation: 0,
            modeToggle: 0,          // Track mode switches
            flowTransition: 0,      // Track flow state changes
            renderOverlay: 0,       // Track overlay re-renders
            functionReentry: 0      // Track guarded function re-entry attempts
        },
        _lastResetTime: Date.now(),
        _isEnabled: true,
        _threshold: 500,  // events per second threshold
        _warningThreshold: 120,  // warning threshold for pointermove
        _modeToggleThreshold: 10,  // max mode toggles per second
        _intervalId: null,

        // Track mode oscillation (rapid toggle between modes)
        _modeHistory: [],
        _maxModeHistorySize: 20,

        // Track async re-entry
        _asyncCallStack: new Map(),  // funcName -> { count, lastCall }

        init() {
            if (this._intervalId) return;  // Already initialized

            // Reset counts every second
            this._intervalId = setInterval(() => {
                const now = Date.now();
                const elapsed = (now - this._lastResetTime) / 1000;

                if (elapsed >= 1) {
                    // Check for freeze conditions
                    const totalEvents = Object.values(this._eventCounts).reduce((a, b) => a + b, 0);
                    const eventsPerSecond = totalEvents / elapsed;

                    // CRITICAL: Freeze detection
                    if (eventsPerSecond > this._threshold) {
                        console.error('🔥 FREEZE DETECTED! Events/sec:', Math.round(eventsPerSecond), this._eventCounts);
                        console.trace('🔥 Freeze stack trace:');
                        this._triggerEmergencyStop();
                    }
                    // WARNING: High event rate
                    else if (this._eventCounts.pointermove > this._warningThreshold ||
                               this._eventCounts.mousemove > this._warningThreshold) {
                        console.warn('⚠️ High pointer event rate:', this._eventCounts);
                    }

                    // WARNING: Mode oscillation
                    if (this._eventCounts.modeToggle > this._modeToggleThreshold) {
                        console.error('🔥 MODE OSCILLATION DETECTED! Toggles/sec:', this._eventCounts.modeToggle);
                        this._logModeHistory();
                    }

                    // WARNING: Excessive re-render
                    if (this._eventCounts.renderOverlay > 30) {
                        console.warn('⚠️ Excessive overlay re-renders:', this._eventCounts.renderOverlay);
                    }

                    // WARNING: Function re-entry attempts
                    if (this._eventCounts.functionReentry > 5) {
                        console.error('🔥 RECURSION ATTEMPTS DETECTED:', this._eventCounts.functionReentry);
                    }

                    // Reset counters
                    this._eventCounts = {
                        pointermove: 0,
                        mousemove: 0,
                        resize: 0,
                        mutation: 0,
                        modeToggle: 0,
                        flowTransition: 0,
                        renderOverlay: 0,
                        functionReentry: 0
                    };
                    this._lastResetTime = now;

                    // Clean up old async call tracking
                    this._cleanupAsyncTracking();
                }
            }, 1000);

            console.log('🛡️ Enhanced Freeze Detector initialized');
        },

        track(eventType) {
            if (!this._isEnabled) return;
            if (this._eventCounts[eventType] !== undefined) {
                this._eventCounts[eventType]++;
            }
        },

        // Track mode changes for oscillation detection
        trackModeChange(modeName, newValue) {
            if (!this._isEnabled) return;

            this._eventCounts.modeToggle++;

            const entry = {
                mode: modeName,
                value: newValue,
                time: Date.now()
            };

            this._modeHistory.push(entry);

            // Keep history bounded
            if (this._modeHistory.length > this._maxModeHistorySize) {
                this._modeHistory.shift();
            }

            // Check for rapid oscillation (same mode toggled 4+ times in 500ms)
            this._checkOscillation(modeName);
        },

        // Track async function calls for re-entry detection
        trackAsyncCall(funcName, entering) {
            if (!this._isEnabled) return;

            const now = Date.now();

            if (entering) {
                let entry = this._asyncCallStack.get(funcName);
                if (!entry) {
                    entry = { count: 0, lastCall: 0, maxConcurrent: 0 };
                    this._asyncCallStack.set(funcName, entry);
                }

                entry.count++;
                entry.lastCall = now;

                if (entry.count > entry.maxConcurrent) {
                    entry.maxConcurrent = entry.count;
                }

                // Warn if same async function called multiple times concurrently
                if (entry.count > 1) {
                    console.warn(`⚠️ Concurrent async calls to ${funcName}:`, entry.count);
                    this._eventCounts.functionReentry++;
                }
            } else {
                const entry = this._asyncCallStack.get(funcName);
                if (entry && entry.count > 0) {
                    entry.count--;
                }
            }
        },

        _checkOscillation(modeName) {
            const now = Date.now();
            const recentChanges = this._modeHistory.filter(
                e => e.mode === modeName && (now - e.time) < 500
            );

            if (recentChanges.length >= 4) {
                console.error(`🔥 OSCILLATION: ${modeName} changed ${recentChanges.length} times in 500ms!`);
                // Log the oscillation pattern
                const pattern = recentChanges.map(e => e.value ? 'ON' : 'OFF').join(' → ');
                console.error(`   Pattern: ${pattern}`);
            }
        },

        _logModeHistory() {
            console.log('📊 Mode change history (last 20):');
            const now = Date.now();
            this._modeHistory.slice(-10).forEach(entry => {
                const age = now - entry.time;
                console.log(`   ${entry.mode} = ${entry.value} (${age}ms ago)`);
            });
        },

        _cleanupAsyncTracking() {
            const now = Date.now();
            for (const [funcName, entry] of this._asyncCallStack.entries()) {
                // Remove entries older than 10 seconds with no active calls
                if (entry.count === 0 && (now - entry.lastCall) > 10000) {
                    this._asyncCallStack.delete(funcName);
                }
            }
        },

        _triggerEmergencyStop() {
            // Emergency: try to reset mapper state
            if (window.mapper) {
                console.error('🚨 EMERGENCY STOP: Attempting to reset mapper state');
                try {
                    if (window.mapper.isDrawing) window.mapper.isDrawing = false;
                    if (window.mapper.isDragging) window.mapper.isDragging = false;
                    if (window.mapper.isResizing) window.mapper.isResizing = false;
                    if (window.mapper._flowCompletionInProgress) {
                        window.mapper._flowCompletionInProgress = false;
                    }
                    if (window.mapper._recursionGuard) {
                        window.mapper._recursionGuard.clear();
                    }
                } catch (e) {
                    console.error('🚨 Emergency stop failed:', e);
                }
            }
        },

        getStats() {
            return {
                ...this._eventCounts,
                modeHistory: this._modeHistory.slice(-5),
                asyncCalls: Object.fromEntries(this._asyncCallStack)
            };
        },

        disable() {
            this._isEnabled = false;
            if (this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }
        },

        // Manual integrity check - STATE MACHINE DRIVEN
        checkIntegrity(mapper) {
            if (!mapper) return { valid: false, errors: ['No mapper instance'] };

            const errors = [];
            const warnings = [];
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            // ============ STATE MACHINE CHECKS (Primary) ============
            if (sm && MS) {
                const smValidation = sm.validate();
                if (!smValidation.valid) {
                    errors.push(...smValidation.errors);
                }
                warnings.push(...smValidation.warnings);

                // Check stuck guard flags
                if (mapper._flowCompletionInProgress) {
                    warnings.push('_flowCompletionInProgress is stuck true');
                }
                if (mapper._recursionGuard && mapper._recursionGuard.size > 0) {
                    warnings.push(`_recursionGuard has stuck entries: ${[...mapper._recursionGuard].join(', ')}`);
                }

                const result = {
                    valid: errors.length === 0,
                    errors,
                    warnings,
                    currentState: sm.getState(),
                    flowData: sm.flowData,
                    stateHistory: sm.getHistory(5)
                };

                if (errors.length > 0) {
                    console.error('❌ STATE MACHINE INTEGRITY CHECK FAILED:', errors);
                }
                if (warnings.length > 0) {
                    console.warn('⚠️ State Machine integrity warnings:', warnings);
                }

                return result;
            }

            // ============ LEGACY CHECKS (Fallback) ============
            // Check for conflicting modes
            const activeModes = [];
            if (mapper.selectFieldNameMode) activeModes.push('selectFieldNameMode');
            if (mapper.drawFieldAfterName) activeModes.push('drawFieldAfterName');
            if (mapper.fieldCreationMode) activeModes.push('fieldCreationMode');
            if (mapper.textSelectionMode) activeModes.push('textSelectionMode');
            if (mapper.tableMappingMode) activeModes.push('tableMappingMode');
            if (mapper.groupingMode) activeModes.push('groupingMode');
            if (mapper.checkboxCreationMode) activeModes.push('checkboxCreationMode');
            if (mapper.radioCreationMode) activeModes.push('radioCreationMode');

            // CRITICAL: More than one exclusive mode active
            const exclusiveModes = ['selectFieldNameMode', 'drawFieldAfterName', 'fieldCreationMode', 'textSelectionMode'];
            const activeExclusive = activeModes.filter(m => exclusiveModes.includes(m));
            if (activeExclusive.length > 1) {
                errors.push(`Multiple exclusive modes active: ${activeExclusive.join(', ')}`);
            }

            // Check stuck guard flags
            if (mapper._flowCompletionInProgress) {
                warnings.push('_flowCompletionInProgress is stuck true');
            }
            if (mapper._recursionGuard && mapper._recursionGuard.size > 0) {
                warnings.push(`_recursionGuard has stuck entries: ${[...mapper._recursionGuard].join(', ')}`);
            }

            // Check flow state consistency
            if (mapper.mappingFlowActive) {
                if (!['capture_name', 'capture_field'].includes(mapper.mappingFlowStep)) {
                    errors.push(`Invalid flow step: ${mapper.mappingFlowStep}`);
                }
                if (mapper.mappingFlowStep === 'capture_name' && mapper.drawFieldAfterName) {
                    errors.push('capture_name step but drawFieldAfterName is true');
                }
                if (mapper.mappingFlowStep === 'capture_field' && !mapper.drawFieldAfterName && !mapper.pendingFieldName) {
                    warnings.push('capture_field step but no pending field data');
                }
            } else {
                // Flow not active, but flow-related flags set
                if (mapper.mappingFlowStep) {
                    errors.push(`Flow not active but step is: ${mapper.mappingFlowStep}`);
                }
            }

            // Check pendingFieldName leftover
            if (mapper.pendingFieldName && !mapper.drawFieldAfterName && !mapper.mappingFlowActive) {
                warnings.push('pendingFieldName set but no active flow');
            }

            // Check suggestion popup state
            if (mapper.fieldTypeSuggestion && mapper.fieldTypeSuggestion.isVisible) {
                if (!mapper.mappingFlowActive) {
                    warnings.push('Type suggestion visible but flow not active');
                }
            }

            const result = {
                valid: errors.length === 0,
                errors,
                warnings,
                activeModes,
                flowState: {
                    active: mapper.mappingFlowActive,
                    step: mapper.mappingFlowStep,
                    type: mapper.mappingFlowFieldType
                }
            };

            if (errors.length > 0) {
                console.error('❌ LEGACY INTEGRITY CHECK FAILED:', errors);
            }
            if (warnings.length > 0) {
                console.warn('⚠️ Legacy integrity warnings:', warnings);
            }

            return result;
        }
    };

    // Initialize freeze detector
    FreezeDetector.init();

    // Expose globally for debugging
    window.FreezeDetector = FreezeDetector;

    // ============ MOUSE EVENTS ============
    // These are THIN EVENT ROUTERS that delegate to StateMachine.handleEvent()

    /**
     * Handle mouse down on mapping layer
     * THIN ROUTER - Delegates to StateMachine.handleEvent()
     * @param {MouseEvent} e - Mouse event
     * @param {Object} mapper - FieldMapper instance
     */
    function onMouseDown(e, mapper) {
        if (!mapper.documentLoaded || mapper.mode === 'preview') return;

        const sm = mapper.stateMachine;
        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        const rect = layer.getBoundingClientRect();
        const x = (e.clientX - rect.left) / mapper.zoomLevel;
        const y = (e.clientY - rect.top) / mapper.zoomLevel;

        // Special: Table Controller has priority
        if (mapper.tableController && mapper.tableController.isActive()) {
            const handled = mapper.tableController.handlePointerDown(e, x, y);
            if (handled === false) {
                // Table controller wants drawing
                if (sm) {
                    sm.setParentState(sm.getState());
                    sm.setState(window.MapperState.DRAWING, { force: true });
                }
                mapper.startDrawing(x, y, e);
                return;
            }
            if (handled) return;
        }

        // Dispatch to mapping engine based on mode
        if (mapper.mappingMode === 'regular' && window.RegularMapperEngine) {
            const result = window.RegularMapperEngine.handleMouseDown(
                { x, y, target: e.target, event: e }, mapper
            );
            if (result?.handled) {
                e.stopPropagation();
                return;
            }
        } else if (mapper.mappingMode === 'quick' && window.QuickMapperEngine) {
            const result = window.QuickMapperEngine.handleMouseDown(
                { x, y, target: e.target, event: e }, mapper
            );
            if (result?.handled) {
                e.stopPropagation();
                return;
            }
        }

        // Delegate to StateMachine
        if (sm) {
            const result = sm.handleEvent('mousedown', {
                x, y,
                target: e.target,
                event: e
            });

            if (result.handled) {
                e.stopPropagation();
                return;
            }
        }

        // If no field selected and not in any mode, show hint
        if (!mapper.selectedField && !mapper.mappingTargetField) {
            if (e.target === layer && !mapper.isSpacePressed) {
                mapper.showToast('בחר שדה מהרשימה או לחץ "➕ הוסף שדה חדש"', 'info');
            }
        }
    }

    /**
     * Handle mouse move
     * THIN ROUTER - Delegates to StateMachine.handleEvent()
     * @param {MouseEvent} e - Mouse event
     * @param {Object} mapper - FieldMapper instance
     */
    function onMouseMove(e, mapper) {
        // Track for freeze detection
        FreezeDetector.track('mousemove');

        if (!mapper.documentLoaded) return;

        const sm = mapper.stateMachine;
        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        const rect = layer.getBoundingClientRect();
        const x = (e.clientX - rect.left) / mapper.zoomLevel;
        const y = (e.clientY - rect.top) / mapper.zoomLevel;

        // Dispatch to mapping engine based on mode
        if (mapper.mappingMode === 'regular' && window.RegularMapperEngine) {
            const result = window.RegularMapperEngine.handleMouseMove(
                { x, y, event: e }, mapper
            );
            if (result?.handled) return;
        } else if (mapper.mappingMode === 'quick' && window.QuickMapperEngine) {
            const result = window.QuickMapperEngine.handleMouseMove(
                { x, y, event: e }, mapper
            );
            if (result?.handled) return;
        }

        // Delegate to StateMachine
        if (sm) {
            const result = sm.handleEvent('mousemove', { x, y });
            if (result.handled) {
                e.stopPropagation();
                return;
            }
        }

        // Panning (Space+Drag) - not managed by StateMachine
        if (mapper.isPanning) {
            mapper.updatePan(e.clientX, e.clientY);
        }
    }

    /**
     * Handle mouse up
     * THIN ROUTER - Delegates to StateMachine.handleEvent()
     * @param {MouseEvent} e - Mouse event
     * @param {Object} mapper - FieldMapper instance
     */
    function onMouseUp(e, mapper) {
        const sm = mapper.stateMachine;
        const layer = document.getElementById('mapping-layer');

        // Get coordinates
        let x = 0, y = 0;
        if (layer) {
            const rect = layer.getBoundingClientRect();
            x = (e.clientX - rect.left) / mapper.zoomLevel;
            y = (e.clientY - rect.top) / mapper.zoomLevel;
        }

        // Dispatch to mapping engine based on mode
        if (mapper.mappingMode === 'regular' && window.RegularMapperEngine) {
            const result = window.RegularMapperEngine.handleMouseUp(
                { x, y, event: e }, mapper
            );
            if (result?.handled) {
                e.stopPropagation();
                mapper.updatePreviewRealTime?.();
                return;
            }
        } else if (mapper.mappingMode === 'quick' && window.QuickMapperEngine) {
            const result = window.QuickMapperEngine.handleMouseUp(
                { x, y, event: e }, mapper
            );
            if (result?.handled) {
                e.stopPropagation();
                mapper.updatePreviewRealTime?.();
                return;
            }
        }

        // Delegate to StateMachine
        if (sm) {
            const result = sm.handleEvent('mouseup', { x, y, event: e });
            if (result.handled) {
                e.stopPropagation();
                // Update preview if we were moving/resizing
                mapper.updatePreviewRealTime?.();
                return;
            }
        }

        // Clean up interaction flags (these are still needed for low-level drawing)
        mapper.isDrawing = false;
        mapper.isDragging = false;
        mapper.isResizing = false;
        mapper.isPanning = false;
        mapper.dragStart = null;

        const viewport = document.getElementById('canvas-viewport');
        if (viewport) viewport.classList.remove('panning');
    }

    /**
     * Handle viewport mouse down for panning
     * @param {MouseEvent} e - Mouse event
     * @param {Object} mapper - FieldMapper instance
     */
    function onViewportMouseDown(e, mapper) {
        if (mapper.isSpacePressed || e.target.id === 'canvas-viewport') {
            mapper.isPanning = true;
            mapper.dragStart = {
                x: e.clientX - mapper.panX,
                y: e.clientY - mapper.panY
            };

            const viewport = document.getElementById('canvas-viewport');
            if (viewport) viewport.classList.add('panning');

            e.preventDefault();
        }
    }

    /**
     * Handle wheel events for zoom and pan
     * @param {WheelEvent} e - Wheel event
     * @param {Object} mapper - FieldMapper instance
     */
    function onWheel(e, mapper) {
        const viewport = document.getElementById('canvas-viewport');
        if (!viewport) return;

        if (e.ctrlKey) {
            // Zoom with Ctrl+Wheel
            e.preventDefault();

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.1, Math.min(5, mapper.zoomLevel * delta));

            const rect = viewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const pointX = (mouseX - mapper.panX) / mapper.zoomLevel;
            const pointY = (mouseY - mapper.panY) / mapper.zoomLevel;

            mapper.zoomLevel = newZoom;

            mapper.panX = mouseX - pointX * mapper.zoomLevel;
            mapper.panY = mouseY - pointY * mapper.zoomLevel;
        } else {
            // Regular scrolling - pan the canvas
            e.preventDefault();

            const scrollSpeed = 30;
            mapper.panX -= e.deltaX * scrollSpeed / 100;
            mapper.panY -= e.deltaY * scrollSpeed / 100;
        }

        mapper.updateZoomDisplay();
    }

    // ============ KEYBOARD EVENTS ============

    /**
     * Handle key down events
     * @param {KeyboardEvent} e - Keyboard event
     * @param {Object} mapper - FieldMapper instance
     */
    function onKeyDown(e, mapper) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Undo/Redo
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            mapper.undo();
            return;
        }

        if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            mapper.redo();
            return;
        }

        if (e.code === 'Space' && !mapper.isSpacePressed) {
            e.preventDefault();
            mapper.isSpacePressed = true;
            const viewport = document.getElementById('canvas-viewport');
            const layer = document.getElementById('mapping-layer');
            if (viewport) viewport.style.cursor = 'grab';
            if (layer) layer.style.cursor = 'grab';
            return;
        }

        if (e.key === 'PageUp') {
            e.preventDefault();
            mapper.previousPage();
            return;
        }

        if (e.key === 'PageDown') {
            e.preventDefault();
            mapper.nextPage();
            return;
        }

        // Live text keyboard shortcuts
        if (mapper.liveTextEnabled && mapper.selectedTextPreview) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                mapper.nudgeText(0, -1);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                mapper.nudgeText(0, 1);
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                mapper.nudgeText(-1, 0);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                mapper.nudgeText(1, 0);
                return;
            }
            if (e.key === '=') {
                e.preventDefault();
                mapper.changeFontSize(1);
                return;
            }
            if (e.key === '-') {
                e.preventDefault();
                mapper.changeFontSize(-1);
                return;
            }
        }

        switch(e.key) {
            case 'Delete':
                if (mapper.selectedField) {
                    mapper.removeField(mapper.selectedField.id);
                }
                break;

            case 'Enter':
                // New Table Step System: Finish column step when Enter is pressed
                if (mapper.tableController && mapper.tableController.isActive()) {
                    const currentStep = mapper.tableController.getCurrentStep();
                    // TableSteps.COLUMNS = 3
                    if (currentStep === 3) {
                        e.preventDefault();
                        mapper.tableController.next();
                        return;
                    }
                }
                // Table Mapping Mode (Step 5D): Finish column mapping
                if (mapper.columnMappingMode && mapper.currentTable && mapper.currentTable.columns.length > 0) {
                    e.preventDefault();
                    mapper.finishTableMapping();
                    return;
                }
                // Option Grouping Mode (Step 3): Create group from selected options
                if (mapper.optionGroupingMode && mapper.selectedOptionsForGrouping && mapper.selectedOptionsForGrouping.length >= 2) {
                    e.preventDefault();
                    mapper.createOptionGroup('radio'); // Default to radio, can be changed later
                    return;
                }
                break;

            case 'Escape':
                // ============ RAPID ESC PROTECTION ============
                const now = Date.now();
                if (now - _lastEscTime < ESC_DEBOUNCE_MS) {
                    e.preventDefault();
                    return;
                }
                _lastEscTime = now;

                // ============ MAPPING ENGINE ESCAPE ============
                if (mapper.mappingMode === 'regular' && window.RegularMapperEngine) {
                    const result = window.RegularMapperEngine.handleKeyDown(
                        { key: 'Escape', event: e }, mapper
                    );
                    if (result?.handled) {
                        e.preventDefault();
                        return;
                    }
                } else if (mapper.mappingMode === 'quick' && window.QuickMapperEngine) {
                    const result = window.QuickMapperEngine.handleKeyDown(
                        { key: 'Escape', event: e }, mapper
                    );
                    if (result?.handled) {
                        e.preventDefault();
                        return;
                    }
                }

                // ============ STATE MACHINE ESCAPE ============
                const sm = mapper.stateMachine;
                if (sm) {
                    const result = sm.handleEvent('keydown', { key: 'Escape', event: e });
                    if (result.handled) {
                        e.preventDefault();
                        return;
                    }
                }

                // Table Controller has its own cancel
                if (mapper.tableController && mapper.tableController.isActive()) {
                    e.preventDefault();
                    mapper.tableController.cancel();
                    return;
                }
                // SAFE: Handle SelectFieldName Mode escape
                if (mapper.selectFieldNameMode) {
                    mapper.deactivateSelectFieldNameMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                // Handle Draw Field After Name Mode escape
                if (mapper.drawFieldAfterName) {
                    mapper.deactivateDrawFieldAfterNameMode();
                    mapper.showToast('❎ מצב יצירת שדה בוטל', 'info');
                    mapper.interaction.mode = 'idle';
                    return;
                }
                // FIX PACKAGE 2: Handle Checkbox/Radio Mode escape
                if (mapper.checkboxCreationMode) {
                    mapper.deactivateCheckboxMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                if (mapper.radioCreationMode) {
                    mapper.deactivateRadioMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                // Radio Grouping Feature: Handle Grouping Mode escape
                if (mapper.groupingMode) {
                    mapper.cancelGroupingMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                // Handle Table Mapping Mode escape (Step 5)
                if (mapper.tableMappingMode) {
                    mapper.deactivateTableMappingMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                // Handle Option Grouping Mode escape (Step 3)
                if (mapper.optionGroupingMode) {
                    mapper.deactivateOptionGroupingMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                // Handle Group Naming Mode escape (Step 3)
                if (mapper.groupNamingMode) {
                    mapper.cleanupTextSelection();
                    mapper.deactivateGroupNamingMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                // Handle Option Labeling Mode escape (Step 3)
                if (mapper.optionLabelingMode) {
                    mapper.cleanupTextSelection();
                    mapper.deactivateOptionLabelingMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                // Handle Text Selection Mode escape (Step 2)
                if (mapper.textSelectionMode) {
                    mapper.cleanupTextSelection();
                    mapper.deactivateTextSelectionMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                // Handle Field Creation Mode escape
                if (mapper.fieldCreationMode) {
                    mapper.deactivateFieldCreationMode();
                    mapper.interaction.mode = 'idle';
                    return;
                }
                if (mapper.interaction.mode === 'mapping' || mapper.interaction.mode === 'drawing_table') {
                    const targetField = mapper.fields.find(f => f.id === mapper.interaction.targetFieldId);
                    if (targetField && !targetField.isMapped) {
                        mapper.removeField(targetField.id);
                        mapper.showToast('השדה החדש בוטל', 'info');
                    } else {
                        mapper.showToast('מצב מיפוי בוטל', 'info');
                    }

                    mapper.interaction.mode = 'idle';
                    mapper.interaction.targetFieldId = null;
                    mapper.interaction.tableConfig = null;
                    mapper.setStatus('מוכן', 'success');
                    mapper.updateMappingBadge(null);
                    return;
                }
                mapper.deselectAll();
                break;

            case 'a':
                if (e.ctrlKey) {
                    e.preventDefault();
                    mapper.selectAll();
                }
                break;

            case 'd':
                if (e.ctrlKey) {
                    e.preventDefault();
                    mapper.showToast('השתמש בכפתור "➕ הוסף שדה" ליצירת שדה חדש', 'info');
                }
                break;

            case 'ArrowLeft':
            case 'ArrowRight':
            case 'ArrowUp':
            case 'ArrowDown':
                if (mapper.selectedField) {
                    e.preventDefault();
                    mapper.moveSelectedField(e.key, e.shiftKey);
                }
                break;
        }
    }

    /**
     * Handle key up events
     * @param {KeyboardEvent} e - Keyboard event
     * @param {Object} mapper - FieldMapper instance
     */
    function onKeyUp(e, mapper) {
        if (e.code === 'Space') {
            mapper.isSpacePressed = false;
            const viewport = document.getElementById('canvas-viewport');
            const layer = document.getElementById('mapping-layer');
            if (viewport) viewport.style.cursor = '';
            if (layer) layer.style.cursor = 'crosshair';
        }
    }

    // ============ GLOBAL EVENT ATTACHMENT ============

    /**
     * Attach all global event listeners
     * @param {Object} mapper - FieldMapper instance
     */
    function attachGlobalEvents(mapper) {
        // File input
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => mapper.handleFileUpload(e.target.files[0]));
        }

        // Canvas layer events
        const layer = document.getElementById('mapping-layer');
        if (layer) {
            layer.addEventListener('mousedown', (e) => onMouseDown(e, mapper));
        }

        // Global document events
        document.addEventListener('mousemove', (e) => onMouseMove(e, mapper));
        document.addEventListener('mouseup', (e) => onMouseUp(e, mapper));
        document.addEventListener('keydown', (e) => onKeyDown(e, mapper));
        document.addEventListener('keyup', (e) => onKeyUp(e, mapper));

        // Viewport events for panning
        const viewport = document.getElementById('canvas-viewport');
        if (viewport) {
            viewport.addEventListener('mousedown', (e) => onViewportMouseDown(e, mapper));
        }

        // Window resize event with debouncing - IMAGE VIEW ONLY
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                mapper.resizeHandler(); // Handles image view overlay repositioning
            }, 150);
        });

        // Fullscreen change events - IMAGE VIEW ONLY
        document.addEventListener('fullscreenchange', () => {
            setTimeout(() => mapper.resizeHandler(), 300); // Use resizeHandler to include table re-rendering
        });
        document.addEventListener('webkitfullscreenchange', () => {
            setTimeout(() => mapper.resizeHandler(), 300);
        });
        document.addEventListener('mozfullscreenchange', () => {
            setTimeout(() => mapper.resizeHandler(), 300);
        });
        document.addEventListener('MSFullscreenChange', () => {
            setTimeout(() => mapper.resizeHandler(), 300);
        });

        // Orientation change for mobile
        window.addEventListener('orientationchange', () => {
            setTimeout(() => mapper.resizeHandler(), 500);
        });

        // Setup ResizeObserver
        mapper.setupResizeObserver();
    }

    // ============ EXPORT ============

    window.MapperEvents = {
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onViewportMouseDown,
        onWheel,
        onKeyDown,
        onKeyUp,
        attachGlobalEvents
    };
})();
