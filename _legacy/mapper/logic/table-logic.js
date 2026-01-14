/**
 * Table Logic - Pure Logic for Table Mapping Flow
 *
 * Phase 5 Architecture: Logic Layer
 *
 * This module contains ONLY logic for table mapping.
 * It does NOT touch DOM, UI classes, or overlays.
 * All communication is through StateMachine + EventBus.
 *
 * Flow: TABLE_REGION → TABLE_SAMPLE_ROW → TABLE_COLUMN_MAPPING → TABLE_COLUMN_NAMING → IDLE
 *
 * @version 1.0.0
 * @author Claude Code - Phase 5
 */

(function() {
    'use strict';

    const TableLogic = {
        // Current table being mapped
        _currentTable: null,
        _currentStep: null,
        _columns: [],

        // ============ FLOW CONTROL ============

        /**
         * Check if table mapping can start
         * @param {StateMachine} sm - StateMachine instance
         * @returns {{ safe: boolean, reason: string }}
         */
        canStartTableMapping(sm) {
            if (!sm) {
                return { safe: false, reason: 'StateMachine not available' };
            }

            if (sm.isInFlow()) {
                return { safe: false, reason: 'Mapping flow in progress' };
            }

            if (sm.isInTableFlow()) {
                return { safe: false, reason: 'Table mapping already in progress' };
            }

            if (sm.isInteracting()) {
                return { safe: false, reason: 'Interaction in progress' };
            }

            return { safe: true, reason: null };
        },

        /**
         * Start table mapping
         * @returns {{ success: boolean, error?: string }}
         */
        startTableMapping() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            const canStart = this.canStartTableMapping(sm);
            if (!canStart.safe) {
                console.warn('[TableLogic] Cannot start:', canStart.reason);
                return { success: false, error: canStart.reason };
            }

            // Reset state
            this._currentTable = null;
            this._currentStep = 'region';
            this._columns = [];

            // Reset state machine and enter table mode
            sm.reset(true);
            const success = sm.setState(MS.TABLE_REGION, {
                data: { type: 'table' }
            });

            if (!success) {
                return { success: false, error: 'State transition failed' };
            }

            EventBus.emit(window.EventTypes.FLOW_START, {
                type: 'table',
                step: 'region'
            });

            console.log('[TableLogic] Table mapping started');
            return { success: true };
        },

        /**
         * Define table region
         * @param {Object} bbox - { x, y, width, height }
         * @returns {{ success: boolean, error?: string }}
         */
        defineTableRegion(bbox) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm.is(MS.TABLE_REGION)) {
                return { success: false, error: 'Not in TABLE_REGION state' };
            }

            // Validate bbox
            if (!this._validateBbox(bbox)) {
                return { success: false, error: 'Invalid bounding box' };
            }

            // Create table object
            this._currentTable = {
                id: `table_${Date.now()}`,
                region: { ...bbox },
                sampleRow: null,
                columns: [],
                createdAt: Date.now()
            };

            this._currentStep = 'sample';

            // Transition to sample row selection
            sm.setState(MS.TABLE_SAMPLE_ROW);

            EventBus.emit(window.EventTypes.TABLE_REGION_DEFINED, {
                table: this._currentTable,
                bbox
            });

            EventBus.emit(window.EventTypes.FLOW_STEP_CHANGE, {
                from: 'region',
                to: 'sample_row'
            });

            console.log('[TableLogic] Table region defined:', bbox);
            return { success: true, table: this._currentTable };
        },

        /**
         * Set sample row
         * @param {Object} bbox - { x, y, width, height }
         * @returns {{ success: boolean, error?: string }}
         */
        setSampleRow(bbox) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm.is(MS.TABLE_SAMPLE_ROW)) {
                return { success: false, error: 'Not in TABLE_SAMPLE_ROW state' };
            }

            if (!this._currentTable) {
                return { success: false, error: 'No table defined' };
            }

            // Calculate row height
            const rowHeight = bbox.height;

            this._currentTable.sampleRow = {
                ...bbox,
                rowHeight
            };

            this._currentStep = 'columns';

            // Transition to column mapping
            sm.setState(MS.TABLE_COLUMN_MAPPING);

            EventBus.emit(window.EventTypes.TABLE_SAMPLE_ROW_SET, {
                table: this._currentTable,
                sampleRow: this._currentTable.sampleRow
            });

            EventBus.emit(window.EventTypes.FLOW_STEP_CHANGE, {
                from: 'sample_row',
                to: 'columns'
            });

            console.log('[TableLogic] Sample row set:', rowHeight, 'px');
            return { success: true };
        },

        /**
         * Add a column
         * @param {Object} bbox - { x, y, width, height }
         * @param {string} name - Optional column name
         * @returns {{ success: boolean, error?: string, column?: Object }}
         */
        addColumn(bbox, name = null) {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm.is(MS.TABLE_COLUMN_MAPPING) && !sm.is(MS.TABLE_COLUMN_NAMING)) {
                return { success: false, error: 'Not in column mapping state' };
            }

            if (!this._currentTable) {
                return { success: false, error: 'No table defined' };
            }

            const column = {
                id: `col_${Date.now()}_${this._columns.length}`,
                index: this._columns.length,
                x: bbox.x,
                width: bbox.width,
                name: name || `Column ${this._columns.length + 1}`,
                key: this._generateColumnKey(name, this._columns.length)
            };

            this._columns.push(column);
            this._currentTable.columns.push(column);

            EventBus.emit(window.EventTypes.TABLE_COLUMN_ADDED, {
                column,
                table: this._currentTable,
                columnCount: this._columns.length
            });

            console.log('[TableLogic] Column added:', column.name);
            return { success: true, column };
        },

        /**
         * Finish column mapping and start naming
         * @returns {{ success: boolean, error?: string }}
         */
        finishColumnMapping() {
            const sm = window.mapper?.stateMachine;
            const MS = window.MapperState;
            const EventBus = window.EventBus;

            if (!sm.is(MS.TABLE_COLUMN_MAPPING)) {
                return { success: false, error: 'Not in TABLE_COLUMN_MAPPING state' };
            }

            if (this._columns.length === 0) {
                return { success: false, error: 'No columns defined' };
            }

            this._currentStep = 'naming';

            // Transition to column naming
            sm.setState(MS.TABLE_COLUMN_NAMING);

            EventBus.emit(window.EventTypes.FLOW_STEP_CHANGE, {
                from: 'columns',
                to: 'naming',
                columnCount: this._columns.length
            });

            console.log('[TableLogic] Column mapping finished, starting naming');
            return { success: true, columnsToName: this._columns.length };
        },

        /**
         * Name a column
         * @param {number} columnIndex - Column index
         * @param {string} name - Column name
         * @returns {{ success: boolean, error?: string }}
         */
        nameColumn(columnIndex, name) {
            const EventBus = window.EventBus;

            if (columnIndex >= this._columns.length) {
                return { success: false, error: 'Invalid column index' };
            }

            const column = this._columns[columnIndex];
            column.name = name;
            column.key = this._generateColumnKey(name, columnIndex);

            // Update table column
            if (this._currentTable && this._currentTable.columns[columnIndex]) {
                this._currentTable.columns[columnIndex].name = name;
                this._currentTable.columns[columnIndex].key = column.key;
            }

            EventBus.emit(window.EventTypes.TABLE_COLUMN_NAMED, {
                column,
                columnIndex,
                name
            });

            console.log(`[TableLogic] Column ${columnIndex} named: "${name}"`);
            return { success: true };
        },

        /**
         * Complete table mapping
         * @returns {{ success: boolean, table?: Object, error?: string }}
         */
        completeTableMapping() {
            const sm = window.mapper?.stateMachine;
            const EventBus = window.EventBus;

            if (!this._currentTable) {
                return { success: false, error: 'No table defined' };
            }

            const table = { ...this._currentTable };

            // Reset state
            sm.reset(true);

            EventBus.emit(window.EventTypes.TABLE_COMPLETE, {
                table
            });

            EventBus.emit(window.EventTypes.FLOW_COMPLETE, {
                type: 'table',
                result: table
            });

            // Clean up
            this._currentTable = null;
            this._currentStep = null;
            this._columns = [];

            console.log('[TableLogic] Table mapping completed');
            return { success: true, table };
        },

        /**
         * Cancel table mapping
         * @returns {{ success: boolean }}
         */
        cancelTableMapping() {
            const sm = window.mapper?.stateMachine;
            const EventBus = window.EventBus;

            sm.reset(true);

            EventBus.emit(window.EventTypes.FLOW_CANCEL, {
                type: 'table'
            });

            // Clean up
            this._currentTable = null;
            this._currentStep = null;
            this._columns = [];

            console.log('[TableLogic] Table mapping cancelled');
            return { success: true };
        },

        // ============ GETTERS ============

        /**
         * Get current table mapping status
         * @returns {Object}
         */
        getStatus() {
            const sm = window.mapper?.stateMachine;

            return {
                inTableFlow: sm?.isInTableFlow() || false,
                currentStep: this._currentStep,
                currentTable: this._currentTable ? { ...this._currentTable } : null,
                columnCount: this._columns.length,
                currentState: sm?.getState() || null
            };
        },

        /**
         * Get current table
         * @returns {Object|null}
         */
        getCurrentTable() {
            return this._currentTable ? { ...this._currentTable } : null;
        },

        /**
         * Get columns
         * @returns {Array}
         */
        getColumns() {
            return [...this._columns];
        },

        // ============ HELPERS ============

        /**
         * Validate bounding box
         * @private
         */
        _validateBbox(bbox) {
            if (!bbox) return false;
            if (typeof bbox.x !== 'number' || typeof bbox.y !== 'number') return false;
            if (typeof bbox.width !== 'number' || typeof bbox.height !== 'number') return false;
            if (bbox.width < 10 || bbox.height < 10) return false;
            return true;
        },

        /**
         * Generate column key
         * @private
         */
        _generateColumnKey(name, index) {
            if (!name) {
                return `column_${index}`;
            }

            let key = name.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');

            return key || `column_${index}`;
        }
    };

    // ============ EXPORTS ============
    window.TableLogic = TableLogic;

    console.log('📊 TableLogic loaded');

})();
