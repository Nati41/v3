/**
 * Debug Map - Live debugging tools for the Mapper StateMachine
 *
 * Usage:
 *   window.DebugMap.printState()     - Print current state
 *   window.DebugMap.printHistory()   - Print state history
 *   window.DebugMap.validate()       - Validate current state
 *   window.DebugMap.diagnose()       - Full diagnostic report
 *   window.DebugMap.showPanel()      - Show debug panel
 *   window.DebugMap.hidePanel()      - Hide debug panel
 *
 * @version 1.0.0
 */
(function() {
    'use strict';

    const DebugMap = {
        // ============ STATE INSPECTION ============

        /**
         * Print current state information
         */
        printState() {
            const mapper = window.mapper;
            const sm = mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) {
                console.error('❌ StateMachine not available');
                return null;
            }

            const stateInfo = {
                current: sm.getState(),
                previous: sm.previousState,
                parent: sm.parentState,
                flowType: sm.getFlowType(),
                pendingName: sm.getPendingName(),
                inFlow: sm.isInFlow(),
                inTableFlow: sm.isInTableFlow(),
                inCreationMode: sm.isInCreationMode(),
                isInteracting: sm.isInteracting()
            };

            console.log('═══════════════════════════════════════════');
            console.log('📊 CURRENT STATE');
            console.log('═══════════════════════════════════════════');
            console.table(stateInfo);

            return stateInfo;
        },

        /**
         * Print state history (last 20 transitions)
         */
        printHistory() {
            const sm = window.mapper?.stateMachine;

            if (!sm) {
                console.error('❌ StateMachine not available');
                return null;
            }

            const history = sm.getHistory ? sm.getHistory() : [];
            const last20 = history.slice(-20);

            console.log('═══════════════════════════════════════════');
            console.log('📜 STATE HISTORY (Last 20)');
            console.log('═══════════════════════════════════════════');

            if (last20.length === 0) {
                console.log('No history recorded');
                return [];
            }

            last20.forEach((entry, i) => {
                const time = new Date(entry.timestamp).toLocaleTimeString();
                console.log(`${i + 1}. [${time}] ${entry.from} → ${entry.to}`);
            });

            return last20;
        },

        /**
         * Validate current state
         * @returns {Object} Validation result
         */
        validate() {
            const sm = window.mapper?.stateMachine;

            if (!sm) {
                console.error('❌ StateMachine not available');
                return { valid: false, error: 'StateMachine not available' };
            }

            const result = sm.validate();

            console.log('═══════════════════════════════════════════');
            console.log('🔍 STATE VALIDATION');
            console.log('═══════════════════════════════════════════');

            if (result.valid) {
                console.log('✅ State is VALID');
            } else {
                console.error('❌ State is INVALID');
            }

            if (result.errors && result.errors.length > 0) {
                console.error('Errors:', result.errors);
            }

            if (result.warnings && result.warnings.length > 0) {
                console.warn('Warnings:', result.warnings);
            }

            console.table({
                valid: result.valid,
                state: result.state,
                errorCount: result.errors?.length || 0,
                warningCount: result.warnings?.length || 0
            });

            return result;
        },

        // ============ DIAGNOSTIC TOOLS ============

        /**
         * Run full diagnostic check
         */
        diagnose() {
            console.log('═══════════════════════════════════════════');
            console.log('🏥 FULL DIAGNOSTIC REPORT');
            console.log('═══════════════════════════════════════════');

            const issues = [];
            const mapper = window.mapper;
            const sm = mapper?.stateMachine;
            const MS = window.MapperState;

            // Check 1: StateMachine availability
            if (!sm) {
                issues.push({ severity: 'ERROR', issue: 'StateMachine not available' });
            }
            if (!MS) {
                issues.push({ severity: 'ERROR', issue: 'MapperState enum not available' });
            }

            if (!sm || !MS) {
                console.error('Cannot proceed with diagnostics');
                return { issues };
            }

            // Check 2: State validity
            const validation = sm.validate();
            if (!validation.valid) {
                validation.errors?.forEach(err => {
                    issues.push({ severity: 'ERROR', issue: err });
                });
            }
            validation.warnings?.forEach(warn => {
                issues.push({ severity: 'WARN', issue: warn });
            });

            // Check 3: UI consistency
            const state = sm.getState();
            const uiChecks = this._checkUIConsistency(state);
            issues.push(...uiChecks);

            // Check 4: Runtime data consistency
            const dataChecks = this._checkRuntimeData(state);
            issues.push(...dataChecks);

            // Check 5: Guard states
            if (mapper._flowCompletionInProgress) {
                issues.push({
                    severity: 'WARN',
                    issue: '_flowCompletionInProgress is true (may cause stuck flow)'
                });
            }

            // Report
            console.log('\n📋 ISSUES FOUND:');
            if (issues.length === 0) {
                console.log('✅ No issues detected');
            } else {
                issues.forEach((item, i) => {
                    const icon = item.severity === 'ERROR' ? '❌' : '⚠️';
                    console.log(`${i + 1}. ${icon} [${item.severity}] ${item.issue}`);
                });
            }

            // Current state summary
            console.log('\n📊 CURRENT STATE SUMMARY:');
            this.printState();

            return { issues, validation, state };
        },

        /**
         * Check UI consistency with state
         * @private
         */
        _checkUIConsistency(state) {
            const issues = [];
            const MS = window.MapperState;

            // Check button states
            const buttonChecks = [
                { state: MS.FIELD_CREATION, buttonId: 'btn-field-mode' },
                { state: MS.CHECKBOX_CREATION, buttonId: 'btn-checkbox-mode' },
                { state: MS.RADIO_CREATION, buttonId: 'btn-radio-mode' },
                { state: MS.GROUPING_SELECT, buttonId: 'btn-grouping-mode' }
            ];

            buttonChecks.forEach(check => {
                const btn = document.getElementById(check.buttonId);
                if (!btn) return;

                const isActive = btn.classList.contains('active');
                const shouldBeActive = state === check.state;

                if (isActive !== shouldBeActive) {
                    issues.push({
                        severity: 'WARN',
                        issue: `Button ${check.buttonId} active=${isActive} but state is ${state}`
                    });
                }
            });

            // Check layer classes
            const layer = document.getElementById('mapping-layer');
            if (layer) {
                const expectedClasses = {
                    [MS.FIELD_CREATION]: 'field-creation-mode',
                    [MS.CHECKBOX_CREATION]: 'checkbox-creation-mode',
                    [MS.RADIO_CREATION]: 'radio-creation-mode',
                    [MS.TEXT_SELECTION]: 'text-selection-mode',
                    [MS.FLOW_CAPTURE_NAME]: 'flow-capture-name-mode',
                    [MS.FLOW_CAPTURE_FIELD]: 'flow-capture-field-mode',
                    [MS.TABLE_REGION]: 'table-region-mode'
                };

                const expected = expectedClasses[state];
                if (expected && !layer.classList.contains(expected)) {
                    issues.push({
                        severity: 'WARN',
                        issue: `Layer missing expected class '${expected}' for state ${state}`
                    });
                }
            }

            return issues;
        },

        /**
         * Check runtime data consistency
         * @private
         */
        _checkRuntimeData(state) {
            const issues = [];
            const mapper = window.mapper;
            const sm = mapper?.stateMachine;
            const MS = window.MapperState;

            // In flow should have flow type
            if (sm.isInFlow() && !sm.getFlowType()) {
                issues.push({
                    severity: 'ERROR',
                    issue: 'In flow state but flowType is null'
                });
            }

            // In FLOW_CAPTURE_FIELD should have pending name (usually)
            if (state === MS.FLOW_CAPTURE_FIELD && !sm.getPendingName()) {
                issues.push({
                    severity: 'WARN',
                    issue: 'In FLOW_CAPTURE_FIELD but no pending name'
                });
            }

            // TEXT_SELECTION should have currentFieldForNaming
            if (state === MS.TEXT_SELECTION && !mapper.currentFieldForNaming) {
                issues.push({
                    severity: 'WARN',
                    issue: 'In TEXT_SELECTION but no currentFieldForNaming'
                });
            }

            // Table flow should have currentTable
            if (sm.isInTableFlow() && state !== MS.TABLE_REGION && !mapper.currentTable) {
                issues.push({
                    severity: 'WARN',
                    issue: `In ${state} but no currentTable`
                });
            }

            return issues;
        },

        // ============ QUICK ACTIONS ============

        /**
         * Force reset to IDLE
         */
        forceReset() {
            const mapper = window.mapper;
            const sm = mapper?.stateMachine;

            if (!sm) {
                console.error('❌ StateMachine not available');
                return;
            }

            console.log('🔄 Forcing reset to IDLE...');

            // Reset StateMachine
            sm.reset(true);

            // Clear runtime data
            mapper.currentFieldForNaming = null;
            mapper.currentTable = null;
            mapper.currentTableStep = null;
            mapper.selectedOptionsForGrouping = [];
            mapper._flowCompletionInProgress = false;

            // Reset interaction
            mapper.interaction = { mode: 'idle', targetFieldId: null };

            console.log('✅ Reset complete');
            this.printState();
        },

        /**
         * Check if specific transition is allowed
         */
        canTransition(targetState) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) {
                console.error('❌ StateMachine not available');
                return false;
            }

            // Resolve state name to enum value
            const target = MS[targetState] || targetState;

            const allowed = sm.isTransitionAllowed?.(target) ??
                           sm._isTransitionAllowed?.(sm.getState(), target);

            console.log(`Transition to ${targetState}: ${allowed ? '✅ Allowed' : '❌ Not allowed'}`);
            return allowed;
        },

        // ============ DEBUG PANEL UI ============

        /**
         * Show debug panel overlay
         */
        showPanel() {
            // Remove existing panel
            this.hidePanel();

            const panel = document.createElement('div');
            panel.id = 'debug-map-panel';
            panel.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                width: 350px;
                max-height: 80vh;
                background: #1a1a2e;
                color: #eee;
                font-family: 'Consolas', monospace;
                font-size: 12px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                z-index: 99999;
                overflow: hidden;
            `;

            panel.innerHTML = `
                <div style="background: #16213e; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; font-size: 14px;">🔧 Debug Panel</span>
                    <button id="debug-panel-close" style="background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 18px;">×</button>
                </div>
                <div id="debug-panel-content" style="padding: 15px; overflow-y: auto; max-height: calc(80vh - 50px);">
                    <div id="debug-state-section"></div>
                    <div id="debug-history-section" style="margin-top: 15px;"></div>
                    <div id="debug-actions-section" style="margin-top: 15px;"></div>
                </div>
            `;

            document.body.appendChild(panel);

            // Close button
            document.getElementById('debug-panel-close').onclick = () => this.hidePanel();

            // Initial update
            this._updatePanel();

            // Auto-refresh every 500ms
            this._panelInterval = setInterval(() => this._updatePanel(), 500);
        },

        /**
         * Hide debug panel
         */
        hidePanel() {
            const panel = document.getElementById('debug-map-panel');
            if (panel) panel.remove();

            if (this._panelInterval) {
                clearInterval(this._panelInterval);
                this._panelInterval = null;
            }
        },

        /**
         * Update panel content
         * @private
         */
        _updatePanel() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm || !MS) return;

            // State section
            const stateSection = document.getElementById('debug-state-section');
            if (stateSection) {
                const state = sm.getState();
                const flowType = sm.getFlowType();
                const pendingName = sm.getPendingName();

                stateSection.innerHTML = `
                    <div style="color: #4ecdc4; font-weight: bold; margin-bottom: 8px;">📊 Current State</div>
                    <table style="width: 100%; font-size: 11px;">
                        <tr><td style="color: #888;">State:</td><td style="color: #ffd93d;">${state}</td></tr>
                        <tr><td style="color: #888;">In Flow:</td><td>${sm.isInFlow() ? '✅' : '❌'}</td></tr>
                        <tr><td style="color: #888;">In Table Flow:</td><td>${sm.isInTableFlow() ? '✅' : '❌'}</td></tr>
                        <tr><td style="color: #888;">Flow Type:</td><td>${flowType || '-'}</td></tr>
                        <tr><td style="color: #888;">Pending Name:</td><td>${pendingName?.text?.substring(0, 20) || '-'}</td></tr>
                    </table>
                `;
            }

            // History section
            const historySection = document.getElementById('debug-history-section');
            if (historySection) {
                const history = sm.getHistory ? sm.getHistory().slice(-5) : [];

                let historyHtml = '<div style="color: #4ecdc4; font-weight: bold; margin-bottom: 8px;">📜 Recent History</div>';

                if (history.length === 0) {
                    historyHtml += '<div style="color: #888;">No history</div>';
                } else {
                    history.reverse().forEach(entry => {
                        const time = new Date(entry.timestamp).toLocaleTimeString();
                        historyHtml += `<div style="font-size: 10px; margin: 2px 0;">
                            <span style="color: #888;">${time}</span>
                            <span style="color: #ff6b6b;">${entry.from}</span> →
                            <span style="color: #6bcb77;">${entry.to}</span>
                        </div>`;
                    });
                }

                historySection.innerHTML = historyHtml;
            }

            // Actions section
            const actionsSection = document.getElementById('debug-actions-section');
            if (actionsSection) {
                actionsSection.innerHTML = `
                    <div style="color: #4ecdc4; font-weight: bold; margin-bottom: 8px;">⚡ Quick Actions</div>
                    <button id="debug-btn-reset" style="background: #ff6b6b; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin: 2px;">Reset</button>
                    <button id="debug-btn-validate" style="background: #4ecdc4; color: black; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin: 2px;">Validate</button>
                    <button id="debug-btn-diagnose" style="background: #ffd93d; color: black; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin: 2px;">Diagnose</button>
                `;

                document.getElementById('debug-btn-reset').onclick = () => this.forceReset();
                document.getElementById('debug-btn-validate').onclick = () => this.validate();
                document.getElementById('debug-btn-diagnose').onclick = () => this.diagnose();
            }
        },

        /**
         * Toggle panel visibility
         */
        togglePanel() {
            const panel = document.getElementById('debug-map-panel');
            if (panel) {
                this.hidePanel();
            } else {
                this.showPanel();
            }
        },

        // ============ PHASE 5 ADDITIONS ============

        /**
         * Print EventBus status
         */
        printEventBus() {
            const EventBus = window.EventBus;

            if (!EventBus) {
                console.error('❌ EventBus not available');
                return null;
            }

            console.log('═══════════════════════════════════════════');
            console.log('📡 EVENT BUS STATUS');
            console.log('═══════════════════════════════════════════');

            const stats = EventBus.getStats();
            console.table(stats);

            console.log('\n📜 Recent Events:');
            EventBus.printLog();

            return stats;
        },

        /**
         * Print Logic Layer status
         */
        printLogicStatus() {
            console.log('═══════════════════════════════════════════');
            console.log('🧠 LOGIC LAYER STATUS');
            console.log('═══════════════════════════════════════════');

            const statuses = {};

            if (window.MappingFlowLogic) {
                statuses.MappingFlow = window.MappingFlowLogic.getFlowStatus();
            }

            if (window.TableLogic) {
                statuses.Table = window.TableLogic.getStatus();
            }

            if (window.GroupingLogic) {
                statuses.Grouping = window.GroupingLogic.getStatus();
            }

            if (window.FieldCreationLogic) {
                statuses.FieldCreation = window.FieldCreationLogic.getStatus();
            }

            if (window.TextSelectionLogic) {
                statuses.TextSelection = window.TextSelectionLogic.getStatus();
            }

            Object.entries(statuses).forEach(([name, status]) => {
                console.log(`\n📦 ${name}:`);
                console.table(status);
            });

            return statuses;
        },

        /**
         * Print Controller status
         */
        printController() {
            const Controller = window.Controller;

            if (!Controller) {
                console.error('❌ Controller not available');
                return null;
            }

            console.log('═══════════════════════════════════════════');
            console.log('🎮 CONTROLLER STATUS');
            console.log('═══════════════════════════════════════════');

            const status = Controller.getStatus();
            console.table(status);

            return status;
        },

        /**
         * Full Phase 5 diagnostic
         */
        diagnosePhase5() {
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║           PHASE 5 ARCHITECTURE DIAGNOSTIC                 ║');
            console.log('╚═══════════════════════════════════════════════════════════╝');

            const checks = {
                stateMachine: !!window.mapper?.stateMachine,
                mapperState: !!window.MapperState,
                stateClusters: !!window.StateClusters,
                eventBus: !!window.EventBus,
                eventTypes: !!window.EventTypes,
                controller: !!window.Controller,
                mappingFlowLogic: !!window.MappingFlowLogic,
                tableLogic: !!window.TableLogic,
                groupingLogic: !!window.GroupingLogic,
                fieldCreationLogic: !!window.FieldCreationLogic,
                textSelectionLogic: !!window.TextSelectionLogic
            };

            console.log('\n🔍 Component Availability:');
            let allPassed = true;
            Object.entries(checks).forEach(([name, passed]) => {
                console.log(`  ${passed ? '✅' : '❌'} ${name}`);
                if (!passed) allPassed = false;
            });

            console.log('\n📊 StateMachine:');
            this.printState();

            console.log('\n📡 EventBus:');
            this.printEventBus();

            console.log('\n🧠 Logic Layer:');
            this.printLogicStatus();

            console.log('\n───────────────────────────────────────────');
            console.log(allPassed ? '✅ All Phase 5 components loaded' : '❌ Some components missing');
            console.log('───────────────────────────────────────────');

            return { allPassed, checks };
        },

        /**
         * Run regression tests
         */
        runTests() {
            if (window.RegressionTests) {
                return window.RegressionTests.runAll();
            } else {
                console.error('❌ RegressionTests not available');
                return null;
            }
        },

        /**
         * Quick validation
         */
        quickCheck() {
            if (window.RegressionTests) {
                return window.RegressionTests.quick();
            } else {
                console.error('❌ RegressionTests not available');
                return null;
            }
        }
    };

    // Expose globally
    window.DebugMap = DebugMap;

    console.log('🔧 DebugMap loaded (Phase 5 Enhanced). Commands:');
    console.log('   DebugMap.printState()      - Print current state');
    console.log('   DebugMap.validate()        - Validate state');
    console.log('   DebugMap.diagnose()        - Full diagnostics');
    console.log('   DebugMap.showPanel()       - Show debug panel');
    console.log('   DebugMap.forceReset()      - Force reset to IDLE');
    console.log('   DebugMap.diagnosePhase5()  - Phase 5 diagnostic');
    console.log('   DebugMap.printEventBus()   - EventBus status');
    console.log('   DebugMap.printLogicStatus()- Logic Layer status');
    console.log('   DebugMap.runTests()        - Run regression tests');

})();
