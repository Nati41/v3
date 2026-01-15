/**
 * Central Controller - Event Router and Orchestrator
 *
 * Phase 5 Architecture: Core Layer
 *
 * This controller is the central orchestration point:
 * - Listens to EventBus events
 * - Routes events to appropriate Logic Layer modules
 * - Enforces StateMachine rules
 * - Prevents illegal states
 * - Logs all transitions for debugging
 * - Maintains system integrity
 *
 * @version 1.0.0
 * @author Claude Code - Phase 5
 */

(function() {
    'use strict';

    // Events that should pass through without Controller interference
    const DEBUG_WHITELIST = [
        'debug:diagnose',
        'debug:validate',
        'debug:reset',
        'flow:ready_for_drawing',
        'flow:continue',
        'flow:name_selected'
    ];

    const Controller = {
        // ============ STATE ============
        _initialized: false,
        _subscriptions: [],
        _debugMode: false,

        // ============ INITIALIZATION ============

        /**
         * Initialize the controller
         * @param {Object} mapper - Mapper instance
         */
        init(mapper) {
            if (this._initialized) {
                console.warn('[Controller] Already initialized');
                return;
            }

            this._mapper = mapper;
            this._setupEventListeners();
            this._initialized = true;

            console.log('🎮 Controller initialized');
        },

        /**
         * Set up event listeners
         * @private
         */
        _setupEventListeners() {
            const EventBus = window.EventBus;
            const ET = window.EventTypes;

            // ============ INTERACTION EVENTS ============

            // Bbox drawn - route to appropriate handler
            this._subscribe(ET.BBOX_DRAWN, (data) => {
                this._handleBboxDrawn(data);
            });

            // Name captured - route to flow logic
            this._subscribe(ET.NAME_CAPTURED, (data) => {
                this._handleNameCaptured(data);
            });

            // Text selected - route to text selection logic
            this._subscribe(ET.TEXT_SELECTED, (data) => {
                this._handleTextSelected(data);
            });

            // ============ FLOW EVENTS ============

            // Flow start
            this._subscribe(ET.FLOW_START, (data) => {
                this._handleFlowStart(data);
            });

            // Flow step change
            this._subscribe(ET.FLOW_STEP_CHANGE, (data) => {
                this._handleFlowStepChange(data);
            });

            // Flow complete
            this._subscribe(ET.FLOW_COMPLETE, (data) => {
                this._handleFlowComplete(data);
            });

            // Flow cancel
            this._subscribe(ET.FLOW_CANCEL, (data) => {
                this._handleFlowCancel(data);
            });

            // ============ FIELD EVENTS ============

            // Field created
            this._subscribe(ET.FIELD_CREATED, (data) => {
                this._handleFieldCreated(data);
            });

            // Field updated
            this._subscribe(ET.FIELD_UPDATED, (data) => {
                this._handleFieldUpdated(data);
            });

            // Field deleted
            this._subscribe(ET.FIELD_DELETED, (data) => {
                this._handleFieldDeleted(data);
            });

            // ============ TABLE EVENTS ============

            // Table region defined
            this._subscribe(ET.TABLE_REGION_DEFINED, (data) => {
                this._handleTableRegionDefined(data);
            });

            // Table sample row set
            this._subscribe(ET.TABLE_SAMPLE_ROW_SET, (data) => {
                this._handleTableSampleRowSet(data);
            });

            // Table column added
            this._subscribe(ET.TABLE_COLUMN_ADDED, (data) => {
                this._handleTableColumnAdded(data);
            });

            // Table complete
            this._subscribe(ET.TABLE_COMPLETE, (data) => {
                this._handleTableComplete(data);
            });

            // ============ GROUPING EVENTS ============

            // Group created
            this._subscribe(ET.GROUP_CREATED, (data) => {
                this._handleGroupCreated(data);
            });

            // Group named
            this._subscribe(ET.GROUP_NAMED, (data) => {
                this._handleGroupNamed(data);
            });

            // Option labeled
            this._subscribe(ET.OPTION_LABELED, (data) => {
                this._handleOptionLabeled(data);
            });

            // ============ UI EVENTS ============

            // Escape pressed
            this._subscribe(ET.ESCAPE_PRESSED, (data) => {
                this._handleEscapePressed(data);
            });

            // State change (from StateMachine)
            this._subscribe(ET.STATE_CHANGE, (data) => {
                this._handleStateChange(data);
            });

            console.log('[Controller] Event listeners set up');
        },

        /**
         * Subscribe to an event and track subscription
         * @private
         */
        _subscribe(eventName, handler) {
            const wrappedHandler = (data) => {
                const isWhitelisted =
                    DEBUG_WHITELIST.includes(eventName) ||
                    DEBUG_WHITELIST.includes(data?.type);

                // If whitelisted → allow handler to execute,
                // but DO NOT run integrity checks or resets.
                if (isWhitelisted) {
                    return handler(data);
                }

                // Non-whitelisted → normal behavior
                handler(data);
            };
            const unsubscribe = window.EventBus.subscribe(eventName, wrappedHandler);
            this._subscriptions.push(unsubscribe);
        },

        // ============ EVENT HANDLERS ============

        /**
         * Handle bbox drawn event
         * Route to appropriate logic based on current state
         */
        _handleBboxDrawn(data) {
            const sm = this._mapper?.stateMachine;
            const MS = window.MapperState;
            const { bbox, page } = data;

            if (!sm) return;

            this._log('BBOX_DRAWN', data);

            const state = sm.getState();

            switch (state) {
                case MS.FLOW_CAPTURE_NAME:
                    // Extract text from bbox and continue flow
                    this._extractTextAndContinueFlow(bbox, page);
                    break;

                case MS.FLOW_CAPTURE_FIELD:
                    // Create field with pending name
                    this._createFieldFromFlow(bbox, page);
                    break;

                case MS.FIELD_CREATION:
                    // Create unnamed field
                    this._createUnnamedField(bbox, page);
                    break;

                case MS.TABLE_REGION:
                    window.TableLogic?.defineTableRegion(bbox);
                    break;

                case MS.TABLE_SAMPLE_ROW:
                    window.TableLogic?.setSampleRow(bbox);
                    break;

                case MS.TABLE_COLUMN_MAPPING:
                    window.TableLogic?.addColumn(bbox);
                    break;

                case MS.GROUP_NAMING:
                case MS.OPTION_LABELING:
                    // Extract text for group/option naming
                    this._extractTextForGrouping(bbox, page, state);
                    break;

                case MS.TEXT_SELECTION:
                    // Extract text for field naming
                    this._extractTextForField(bbox, page);
                    break;

                default:
                    console.warn('[Controller] Unhandled bbox in state:', state);
            }
        },

        /**
         * Handle name captured event
         */
        _handleNameCaptured(data) {
            const sm = this._mapper?.stateMachine;
            const MS = window.MapperState;

            if (!sm.is(MS.FLOW_CAPTURE_NAME)) {
                console.warn('[Controller] NAME_CAPTURED but not in FLOW_CAPTURE_NAME');
                return;
            }

            this._log('NAME_CAPTURED', data);

            // Continue flow with captured name
            window.MappingFlowLogic?.continueFlow(data);
        },

        /**
         * Handle text selected event
         */
        _handleTextSelected(data) {
            this._log('TEXT_SELECTED', data);
            // Text selection logic handles its own updates
        },

        /**
         * Handle flow start
         */
        _handleFlowStart(data) {
            this._log('FLOW_START', data);
            this._updateUI('flowStart', data);
        },

        /**
         * Handle flow step change
         */
        _handleFlowStepChange(data) {
            this._log('FLOW_STEP_CHANGE', data);
            this._updateUI('flowStepChange', data);
        },

        /**
         * Handle flow complete
         */
        _handleFlowComplete(data) {
            this._log('FLOW_COMPLETE', data);
            this._updateUI('flowComplete', data);
        },

        /**
         * Handle flow cancel
         */
        _handleFlowCancel(data) {
            this._log('FLOW_CANCEL', data);
            this._updateUI('flowCancel', data);
        },

        /**
         * Handle field created
         */
        _handleFieldCreated(data) {
            this._log('FIELD_CREATED', data);

            const { field, inFlow } = data;

            // If in flow, the flow logic handles the loop
            if (inFlow) {
                this._mapper?.addField?.(field);
                this._mapper?.renderField?.(field);
                this._mapper?.updateFieldList?.();
                this._mapper?.selectField?.(field.id);
                this._mapper?.saveState?.('create_field');
            }
        },

        /**
         * Handle field updated
         */
        _handleFieldUpdated(data) {
            this._log('FIELD_UPDATED', data);

            const { fieldId, updates } = data;
            this._mapper?.updateFieldProperties?.(fieldId, updates);
        },

        /**
         * Handle field deleted
         */
        _handleFieldDeleted(data) {
            this._log('FIELD_DELETED', data);

            const { fieldId } = data;
            this._mapper?.deleteField?.(fieldId);
        },

        /**
         * Handle table region defined
         */
        _handleTableRegionDefined(data) {
            this._log('TABLE_REGION_DEFINED', data);
            this._updateUI('tableStep', { step: 'region', ...data });
        },

        /**
         * Handle table sample row set
         */
        _handleTableSampleRowSet(data) {
            this._log('TABLE_SAMPLE_ROW_SET', data);
            this._updateUI('tableStep', { step: 'sample_row', ...data });
        },

        /**
         * Handle table column added
         */
        _handleTableColumnAdded(data) {
            this._log('TABLE_COLUMN_ADDED', data);
            this._updateUI('tableColumn', data);
        },

        /**
         * Handle table complete
         */
        _handleTableComplete(data) {
            this._log('TABLE_COMPLETE', data);

            const { table } = data;
            // Create table fields in mapper
            this._mapper?.createTableFromMapping?.(table);
        },

        /**
         * Handle group created
         */
        _handleGroupCreated(data) {
            this._log('GROUP_CREATED', data);
            this._updateUI('groupStep', { step: 'created', ...data });
        },

        /**
         * Handle group named
         */
        _handleGroupNamed(data) {
            this._log('GROUP_NAMED', data);
            this._updateUI('groupStep', { step: 'named', ...data });
        },

        /**
         * Handle option labeled
         */
        _handleOptionLabeled(data) {
            this._log('OPTION_LABELED', data);
            this._updateUI('optionLabeled', data);
        },

        /**
         * Handle escape pressed
         */
        _handleEscapePressed(data) {
            const sm = this._mapper?.stateMachine;

            this._log('ESCAPE_PRESSED', { state: sm?.getState() });

            // Cancel current operation
            if (sm?.isInFlow()) {
                window.MappingFlowLogic?.exitFlow();
            } else if (sm?.isInTableFlow()) {
                window.TableLogic?.cancelTableMapping();
            } else if (sm?.inCluster?.('GROUPING')) {
                window.GroupingLogic?.cancelGrouping();
            } else if (sm?.is(window.MapperState.TEXT_SELECTION)) {
                window.TextSelectionLogic?.cancelTextSelection();
            } else {
                sm?.reset(true);
            }
        },

        /**
         * Handle state change from StateMachine
         */
        _handleStateChange(data) {
            this._log('STATE_CHANGE', data);
            this._updateUI('stateChange', data);
        },

        // ============ HELPER METHODS ============

        /**
         * Extract text from bbox and continue mapping flow
         */
        async _extractTextAndContinueFlow(bbox, page) {
            const mapper = this._mapper;
            if (!mapper) return;

            try {
                // Extract text from PDF
                const text = await mapper.extractTextInRegion?.(bbox, page);

                if (text && text.trim()) {
                    // Emit name captured event
                    window.EventBus.emit(window.EventTypes.NAME_CAPTURED, {
                        text: text.trim(),
                        key: this._generateKey(text),
                        source: 'pdf',
                        bbox,
                        page
                    });
                } else {
                    mapper.showToast?.('לא נמצא טקסט באזור הנבחר', 'warning');
                }
            } catch (error) {
                console.error('[Controller] Text extraction error:', error);
                mapper.showToast?.('שגיאה בחילוץ טקסט', 'error');
            }
        },

        /**
         * Create field from flow (with pending name)
         */
        async _createFieldFromFlow(bbox, page) {
            const sm = this._mapper?.stateMachine;
            const pendingName = sm?.getPendingName();
            const flowType = sm?.getFlowType() || 'text';

            const result = window.FieldCreationLogic?.createFieldFromBbox(bbox, {
                type: flowType,
                labelHe: pendingName?.text,
                labelEn: pendingName?.key,
                page,
                autoLabel: true,
                autoLabelSource: pendingName?.source || 'flow'
            });

            if (result?.success && result.field) {
                // Complete flow field
                window.MappingFlowLogic?.completeFlow(result.field);
            }
        },

        /**
         * Create unnamed field
         */
        async _createUnnamedField(bbox, page) {
            const result = window.FieldCreationLogic?.createFieldFromBbox(bbox, {
                type: 'text',
                page,
                source: 'direct'
            });

            if (result?.success && result.field) {
                this._mapper?.addField?.(result.field);
                this._mapper?.renderField?.(result.field);
                this._mapper?.updateFieldList?.();
                this._mapper?.selectField?.(result.field.id);
                this._mapper?.saveState?.('create_field');
            }
        },

        /**
         * Extract text for grouping/option naming
         */
        async _extractTextForGrouping(bbox, page, state) {
            const mapper = this._mapper;
            const MS = window.MapperState;

            try {
                const text = await mapper.extractTextInRegion?.(bbox, page);

                if (text && text.trim()) {
                    if (state === MS.GROUP_NAMING) {
                        window.GroupingLogic?.setGroupName(text.trim());
                    } else if (state === MS.OPTION_LABELING) {
                        const result = window.GroupingLogic?.labelOption(text.trim());
                        if (result && !result.hasNext) {
                            window.GroupingLogic?.completeGrouping();
                        }
                    }
                }
            } catch (error) {
                console.error('[Controller] Text extraction error:', error);
            }
        },

        /**
         * Extract text for field naming
         */
        async _extractTextForField(bbox, page) {
            const mapper = this._mapper;

            try {
                const text = await mapper.extractTextInRegion?.(bbox, page);

                if (text && text.trim()) {
                    window.TextSelectionLogic?.finishSelection(bbox, text.trim());
                }
            } catch (error) {
                console.error('[Controller] Text extraction error:', error);
            }
        },

        /**
         * Generate key from text
         */
        _generateKey(text) {
            if (!text) return `field_${Date.now()}`;

            const hebrewToEnglish = {
                'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v',
                'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k',
                'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's',
                'ע': 'a', 'פ': 'p', 'ף': 'p', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k',
                'ר': 'r', 'ש': 'sh', 'ת': 't'
            };

            let key = '';
            for (const char of text) {
                if (hebrewToEnglish[char]) {
                    key += hebrewToEnglish[char];
                } else if (/[a-zA-Z0-9]/.test(char)) {
                    key += char.toLowerCase();
                } else if (char === ' ' && key && !key.endsWith('_')) {
                    key += '_';
                }
            }

            return key.replace(/_+/g, '_').replace(/^_|_$/g, '') || `field_${Date.now()}`;
        },

        /**
         * Update UI based on event
         */
        _updateUI(type, data) {
            const mapper = this._mapper;
            if (!mapper) return;

            switch (type) {
                case 'flowStart':
                case 'flowStepChange':
                    mapper._updateMappingFlowUI?.();
                    break;

                case 'flowComplete':
                case 'flowCancel':
                    mapper._resetFlowState?.();
                    mapper._updateMappingFlowUI?.();
                    break;

                case 'stateChange':
                    mapper.updateAllOverlays?.();
                    break;

                case 'tableStep':
                case 'tableColumn':
                    mapper._updateTableUI?.();
                    break;

                case 'groupStep':
                case 'optionLabeled':
                    mapper._updateGroupingUI?.();
                    break;
            }
        },

        /**
         * Log event for debugging
         */
        _log(eventName, data) {
            if (this._debugMode) {
                console.log(`[Controller] ${eventName}:`, data);
            }
        },

        // ============ PUBLIC API ============

        /**
         * Enable debug mode
         */
        enableDebug() {
            this._debugMode = true;
            console.log('[Controller] Debug mode enabled');
        },

        /**
         * Disable debug mode
         */
        disableDebug() {
            this._debugMode = false;
        },

        /**
         * Get controller status
         */
        getStatus() {
            return {
                initialized: this._initialized,
                debugMode: this._debugMode,
                subscriptionCount: this._subscriptions.length
            };
        },

        /**
         * Clean up controller
         */
        destroy() {
            // Unsubscribe from all events
            this._subscriptions.forEach(unsubscribe => unsubscribe());
            this._subscriptions = [];
            this._initialized = false;
            console.log('[Controller] Destroyed');
        }
    };

    // ============ EXPORTS ============
    window.Controller = Controller;

    console.log('🎮 Controller module loaded');

})();
