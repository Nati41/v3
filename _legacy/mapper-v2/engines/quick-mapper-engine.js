/**
 * Quick Mapper Engine - Guided field mapping without JSON
 *
 * Active when no JSON field definitions are loaded.
 * Provides guided flows for creating text fields, radio groups, and checkbox groups.
 *
 * Text Flow: Select label → Draw field
 * Radio Flow: Select title → Click circles → Mark labels → Confirm group
 * Checkbox Flow: Select title → Click squares → Mark labels → Confirm group
 *
 * @version 1.0.0
 */
(function() {
    'use strict';

    const QuickMapperEngine = {
        // ============ STATE ============
        _active: false,
        _currentFlow: null,  // 'text', 'radio', 'checkbox', null

        // Text flow state
        _textFlowState: {
            pendingLabel: null,  // { text, key, source, bbox }
            step: null  // 'select_label' | 'draw_field'
        },

        // Radio flow state (5-step flow)
        _radioFlowState: {
            groupLabel: null,      // { text, key, bbox }
            options: [],           // [{ bbox, label, value, fieldId }]
            currentOptionIndex: 0,
            currentStep: null      // 'select_title' | 'click_circle' | 'mark_label'
        },

        // Checkbox flow state (similar to radio)
        _checkboxFlowState: {
            groupLabel: null,
            options: [],
            currentOptionIndex: 0,
            currentStep: null      // 'select_title' | 'click_square' | 'mark_label'
        },

        // Constants
        RADIO_SIZE: 24,      // Fixed radio button size
        CHECKBOX_SIZE: 24,   // Fixed checkbox size

        // ============ INITIALIZATION ============

        /**
         * Initialize engine
         * @param {Object} mapper - FieldMapper instance
         */
        init(mapper) {
            console.log('[QuickMapperEngine] Initialized');
        },

        /**
         * Activate this engine
         * @param {Object} mapper - FieldMapper instance
         */
        activate(mapper) {
            this._active = true;
            this._resetAllFlows();
            console.log('[QuickMapperEngine] Activated');
        },

        /**
         * Deactivate this engine
         * @param {Object} mapper - FieldMapper instance
         */
        deactivate(mapper) {
            this._active = false;
            this._resetAllFlows();
            console.log('[QuickMapperEngine] Deactivated');
        },

        /**
         * Check if engine is active
         */
        isActive() {
            return this._active;
        },

        /**
         * Reset all flow states
         * @private
         */
        _resetAllFlows() {
            this._currentFlow = null;

            this._textFlowState = {
                pendingLabel: null,
                step: null
            };

            this._radioFlowState = {
                groupLabel: null,
                options: [],
                currentOptionIndex: 0,
                currentStep: null
            };

            this._checkboxFlowState = {
                groupLabel: null,
                options: [],
                currentOptionIndex: 0,
                currentStep: null
            };
        },

        // ============ EVENT HANDLERS ============

        /**
         * Handle mousedown event
         * @param {Object} data - { x, y, target, event }
         * @param {Object} mapper - FieldMapper instance
         * @returns {{ handled: boolean, action?: string }}
         */
        handleMouseDown(data, mapper) {
            if (!this._active || !this._currentFlow) return { handled: false };

            const { x, y, target, event } = data;

            // Handle radio circle click
            if (this._currentFlow === 'radio' &&
                this._radioFlowState.currentStep === 'click_circle') {
                this.clickRadioCircle(x, y, mapper);
                return { handled: true, action: 'clickRadioCircle' };
            }

            // Handle checkbox square click
            if (this._currentFlow === 'checkbox' &&
                this._checkboxFlowState.currentStep === 'click_square') {
                this.clickCheckboxSquare(x, y, mapper);
                return { handled: true, action: 'clickCheckboxSquare' };
            }

            return { handled: false };
        },

        /**
         * Handle mouseup event
         * @param {Object} data - { x, y, event }
         * @param {Object} mapper - FieldMapper instance
         * @returns {{ handled: boolean, action?: string }}
         */
        handleMouseUp(data, mapper) {
            if (!this._active) return { handled: false };

            // Drawing completion handled by StateMachine
            return { handled: false };
        },

        /**
         * Handle mousemove event
         * @param {Object} data - { x, y, event }
         * @param {Object} mapper - FieldMapper instance
         * @returns {{ handled: boolean }}
         */
        handleMouseMove(data, mapper) {
            if (!this._active) return { handled: false };

            return { handled: false };
        },

        /**
         * Handle keydown event
         * @param {Object} data - { key, event }
         * @param {Object} mapper - FieldMapper instance
         * @returns {{ handled: boolean, action?: string }}
         */
        handleKeyDown(data, mapper) {
            if (!this._active) return { handled: false };

            const { key } = data;

            // ESC cancels current flow
            if (key === 'Escape' && this._currentFlow) {
                this.cancelCurrentFlow(mapper);
                return { handled: true, action: 'cancelFlow' };
            }

            // Enter to confirm radio/checkbox group (if ≥2 options)
            if (key === 'Enter') {
                if (this._currentFlow === 'radio' &&
                    this._radioFlowState.options.length >= 2) {
                    this.confirmRadioGroup(mapper);
                    return { handled: true, action: 'confirmRadioGroup' };
                }
                if (this._currentFlow === 'checkbox' &&
                    this._checkboxFlowState.options.length >= 2) {
                    this.confirmCheckboxGroup(mapper);
                    return { handled: true, action: 'confirmCheckboxGroup' };
                }
            }

            return { handled: false };
        },

        /**
         * Cancel current flow
         * @param {Object} mapper - FieldMapper instance
         */
        cancelCurrentFlow(mapper) {
            const flow = this._currentFlow;
            this._resetAllFlows();

            const sm = mapper.stateMachine;
            if (sm) {
                sm.reset(true);
            }

            mapper.showToast('הזרימה בוטלה', 'info');
            mapper.setStatus('מוכן', 'info');

            console.log('[QuickMapperEngine] Flow cancelled:', flow);
        },

        // ============ TEXT FLOW ============

        /**
         * Start text field flow
         * @param {Object} mapper - FieldMapper instance
         */
        startTextFlow(mapper) {
            this._resetAllFlows();
            this._currentFlow = 'text';
            this._textFlowState.step = 'select_label';

            // Use existing mapping flow
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (sm && MS) {
                sm.reset(true);
                sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'text' } });
            }

            mapper.showToast('בחר טקסט לשם השדה', 'info');
            mapper.setStatus('📝 צייר מלבן על טקסט לבחירת שם', 'info');

            console.log('[QuickMapperEngine] Text flow started');
        },

        /**
         * Handle text label captured
         * Called from mapping flow when text is captured
         * @param {Object} labelData - { text, key, source, bbox }
         * @param {Object} mapper - FieldMapper instance
         */
        onTextLabelCaptured(labelData, mapper) {
            if (this._currentFlow !== 'text') return;

            this._textFlowState.pendingLabel = labelData;
            this._textFlowState.step = 'draw_field';

            console.log('[QuickMapperEngine] Text label captured:', labelData.text);
        },

        /**
         * Handle text field drawn
         * Called when field rectangle is drawn in text flow
         * @param {Object} bbox - { x, y, width, height }
         * @param {Object} mapper - FieldMapper instance
         */
        onTextFieldDrawn(bbox, mapper) {
            if (this._currentFlow !== 'text' || !this._textFlowState.pendingLabel) return;

            const label = this._textFlowState.pendingLabel;

            // Create field
            const field = this._createField(bbox, 'text', {
                labelHe: label.text,
                labelEn: label.key,
                pendingReview: true
            }, mapper);

            if (field) {
                mapper.fields.push(field);
                mapper.renderField(field);
                mapper.updateFieldList();
                mapper.selectField(field.id);
                mapper.saveState('quick_create_text_field');
                mapper.showToast(`שדה "${label.text}" נוצר!`, 'success');
            }

            // Reset for next field (stay in text flow)
            this._textFlowState.pendingLabel = null;
            this._textFlowState.step = 'select_label';

            console.log('[QuickMapperEngine] Text field created:', field?.id);
        },

        // ============ RADIO FLOW (5-step) ============

        /**
         * Start radio group flow
         * @param {Object} mapper - FieldMapper instance
         */
        startRadioFlow(mapper) {
            this._resetAllFlows();
            this._currentFlow = 'radio';
            this._radioFlowState.currentStep = 'select_title';

            // Enter state for title selection
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (sm && MS) {
                sm.reset(true);
                sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'radio' } });
            }

            mapper.showToast('שלב 1: בחר את כותרת קבוצת הרדיו', 'info');
            mapper.setStatus('🔘 צייר מלבן על כותרת הקבוצה', 'info');
            mapper.updateMappingBadge('🔘 שלב 1/5: בחר כותרת - Esc לביטול');

            console.log('[QuickMapperEngine] Radio flow started');
        },

        /**
         * Select radio group title (Step 1)
         * @param {Object} bbox - Bounding box of selected title
         * @param {string} text - Extracted text
         * @param {Object} mapper - FieldMapper instance
         */
        selectRadioGroupTitle(bbox, text, mapper) {
            if (this._currentFlow !== 'radio' ||
                this._radioFlowState.currentStep !== 'select_title') return;

            this._radioFlowState.groupLabel = {
                text: text,
                key: this._generateKey(text),
                bbox: bbox
            };
            this._radioFlowState.currentStep = 'click_circle';

            // Update UI for circle clicking
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (sm && MS) {
                sm.reset(true);
                // Use a special state for clicking (not drawing)
                sm.setState(MS.RADIO_CREATION);
            }

            mapper.showToast(`כותרת נבחרה: "${text}". כעת לחץ על כל עיגול רדיו`, 'info');
            mapper.setStatus('🔘 לחץ על עיגול רדיו', 'info');
            mapper.updateMappingBadge('🔘 שלב 2/5: לחץ על עיגול - Esc לביטול');

            console.log('[QuickMapperEngine] Radio title selected:', text);
        },

        /**
         * Click on radio circle (Step 2 - repeated)
         * @param {number} x - Click X coordinate
         * @param {number} y - Click Y coordinate
         * @param {Object} mapper - FieldMapper instance
         */
        clickRadioCircle(x, y, mapper) {
            if (this._currentFlow !== 'radio' ||
                this._radioFlowState.currentStep !== 'click_circle') return;

            const size = this.RADIO_SIZE;

            // Create centered bbox
            const bbox = {
                x: x - size / 2,
                y: y - size / 2,
                width: size,
                height: size
            };

            // Create radio field
            const optionIndex = this._radioFlowState.options.length;
            const field = this._createField(bbox, 'radio', {
                labelHe: '',  // Will be set when label is marked
                labelEn: `radio_option_${optionIndex}`,
                pendingReview: true,
                isGroupOption: true
            }, mapper);

            if (field) {
                // Add to options with empty label
                this._radioFlowState.options.push({
                    bbox: bbox,
                    label: '',
                    value: '',
                    fieldId: field.id
                });

                mapper.fields.push(field);
                mapper.renderField(field);
                mapper.updateFieldList();

                // Move to label selection
                this._radioFlowState.currentOptionIndex = optionIndex;
                this._radioFlowState.currentStep = 'mark_label';

                // Enter text selection mode
                const sm = mapper.stateMachine;
                const MS = window.MapperState;

                if (sm && MS) {
                    sm.reset(true);
                    sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'radio_label' } });
                }

                mapper.showToast(`עיגול ${optionIndex + 1} נוסף. כעת סמן את התווית שלו`, 'info');
                mapper.setStatus('🏷️ צייר מלבן על תווית האפשרות', 'info');
                mapper.updateMappingBadge(`🔘 שלב 3/5: סמן תווית - Esc לביטול`);
            }

            console.log('[QuickMapperEngine] Radio circle clicked at:', x, y);
        },

        /**
         * Mark radio option label (Step 3 - repeated)
         * @param {Object} bbox - Bounding box of selected label
         * @param {string} text - Extracted text
         * @param {Object} mapper - FieldMapper instance
         */
        markRadioOptionLabel(bbox, text, mapper) {
            if (this._currentFlow !== 'radio' ||
                this._radioFlowState.currentStep !== 'mark_label') return;

            const optionIndex = this._radioFlowState.currentOptionIndex;
            const option = this._radioFlowState.options[optionIndex];

            if (option) {
                option.label = text;
                option.value = this._generateValue(text);

                // Update the field
                const field = mapper.fields.find(f => f.id === option.fieldId);
                if (field) {
                    field.label_he = text;
                    field.labelHe = text;
                    field.label_en = option.value;
                    field.labelEn = option.value;
                    mapper.updateFieldList();
                }
            }

            // Go back to circle clicking for more options
            this._radioFlowState.currentStep = 'click_circle';

            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (sm && MS) {
                sm.reset(true);
                sm.setState(MS.RADIO_CREATION);
            }

            const optionCount = this._radioFlowState.options.length;

            if (optionCount >= 2) {
                mapper.showToast(`תווית נוספה: "${text}". לחץ על עיגול נוסף או Enter לסיום`, 'info');
                mapper.setStatus('🔘 לחץ על עיגול נוסף או Enter לסיום', 'info');
                mapper.updateMappingBadge(`🔘 שלב 4/5: ${optionCount} אפשרויות - Enter לאישור`);
            } else {
                mapper.showToast(`תווית נוספה: "${text}". לחץ על עיגול נוסף`, 'info');
                mapper.setStatus('🔘 לחץ על עיגול רדיו נוסף', 'info');
                mapper.updateMappingBadge('🔘 שלב 2/5: לחץ על עיגול - נדרשות עוד אפשרויות');
            }

            console.log('[QuickMapperEngine] Radio label marked:', text);
        },

        /**
         * Confirm and create radio group (Step 5)
         * @param {Object} mapper - FieldMapper instance
         */
        confirmRadioGroup(mapper) {
            if (this._currentFlow !== 'radio') return;

            const options = this._radioFlowState.options;
            if (options.length < 2) {
                mapper.showToast('נדרשות לפחות 2 אפשרויות ליצירת קבוצה', 'warning');
                return;
            }

            const groupLabel = this._radioFlowState.groupLabel;

            // Create radio group
            const groupId = `radio_group_${Date.now()}`;
            const group = {
                id: groupId,
                type: 'radio',
                name: groupLabel.text,
                key: groupLabel.key,
                labelBbox: groupLabel.bbox,
                options: options.map((opt, idx) => ({
                    fieldId: opt.fieldId,
                    index: idx,
                    label: opt.label,
                    value: opt.value,
                    bbox: opt.bbox
                })),
                fieldIds: options.map(opt => opt.fieldId),
                createdAt: Date.now(),
                pendingReview: true
            };

            // Add to mapper's radio groups
            if (!mapper.radioGroups) {
                mapper.radioGroups = [];
            }
            mapper.radioGroups.push(group);

            // Update fields with group reference
            options.forEach(opt => {
                const field = mapper.fields.find(f => f.id === opt.fieldId);
                if (field) {
                    field.radioGroupId = groupId;
                    field.isGroupOption = true;
                }
            });

            mapper.updateFieldList();
            mapper.saveState('quick_create_radio_group');

            // Reset flow
            const sm = mapper.stateMachine;
            if (sm) {
                sm.reset(true);
            }

            this._resetAllFlows();

            mapper.showToast(`קבוצת רדיו "${groupLabel.text}" נוצרה עם ${options.length} אפשרויות!`, 'success');
            mapper.setStatus('מוכן', 'info');
            mapper.updateMappingBadge('');

            console.log('[QuickMapperEngine] Radio group created:', groupId);
        },

        // ============ CHECKBOX FLOW ============

        /**
         * Start checkbox group flow
         * @param {Object} mapper - FieldMapper instance
         */
        startCheckboxFlow(mapper) {
            this._resetAllFlows();
            this._currentFlow = 'checkbox';
            this._checkboxFlowState.currentStep = 'select_title';

            // Enter state for title selection
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (sm && MS) {
                sm.reset(true);
                sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'checkbox' } });
            }

            mapper.showToast('שלב 1: בחר את כותרת קבוצת ה-Checkbox', 'info');
            mapper.setStatus('☑️ צייר מלבן על כותרת הקבוצה', 'info');
            mapper.updateMappingBadge('☑️ שלב 1/5: בחר כותרת - Esc לביטול');

            console.log('[QuickMapperEngine] Checkbox flow started');
        },

        /**
         * Select checkbox group title (Step 1)
         * @param {Object} bbox - Bounding box of selected title
         * @param {string} text - Extracted text
         * @param {Object} mapper - FieldMapper instance
         */
        selectCheckboxGroupTitle(bbox, text, mapper) {
            if (this._currentFlow !== 'checkbox' ||
                this._checkboxFlowState.currentStep !== 'select_title') return;

            this._checkboxFlowState.groupLabel = {
                text: text,
                key: this._generateKey(text),
                bbox: bbox
            };
            this._checkboxFlowState.currentStep = 'click_square';

            // Update UI for square clicking
            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (sm && MS) {
                sm.reset(true);
                sm.setState(MS.CHECKBOX_CREATION);
            }

            mapper.showToast(`כותרת נבחרה: "${text}". כעת לחץ על כל ריבוע checkbox`, 'info');
            mapper.setStatus('☑️ לחץ על ריבוע checkbox', 'info');
            mapper.updateMappingBadge('☑️ שלב 2/5: לחץ על ריבוע - Esc לביטול');

            console.log('[QuickMapperEngine] Checkbox title selected:', text);
        },

        /**
         * Click on checkbox square (Step 2 - repeated)
         * @param {number} x - Click X coordinate
         * @param {number} y - Click Y coordinate
         * @param {Object} mapper - FieldMapper instance
         */
        clickCheckboxSquare(x, y, mapper) {
            if (this._currentFlow !== 'checkbox' ||
                this._checkboxFlowState.currentStep !== 'click_square') return;

            const size = this.CHECKBOX_SIZE;

            // Create centered bbox
            const bbox = {
                x: x - size / 2,
                y: y - size / 2,
                width: size,
                height: size
            };

            // Create checkbox field
            const optionIndex = this._checkboxFlowState.options.length;
            const field = this._createField(bbox, 'checkbox', {
                labelHe: '',
                labelEn: `checkbox_option_${optionIndex}`,
                pendingReview: true,
                isGroupOption: true
            }, mapper);

            if (field) {
                // Add to options with empty label
                this._checkboxFlowState.options.push({
                    bbox: bbox,
                    label: '',
                    value: '',
                    fieldId: field.id
                });

                mapper.fields.push(field);
                mapper.renderField(field);
                mapper.updateFieldList();

                // Move to label selection
                this._checkboxFlowState.currentOptionIndex = optionIndex;
                this._checkboxFlowState.currentStep = 'mark_label';

                // Enter text selection mode
                const sm = mapper.stateMachine;
                const MS = window.MapperState;

                if (sm && MS) {
                    sm.reset(true);
                    sm.setState(MS.FLOW_CAPTURE_NAME, { data: { type: 'checkbox_label' } });
                }

                mapper.showToast(`ריבוע ${optionIndex + 1} נוסף. כעת סמן את התווית שלו`, 'info');
                mapper.setStatus('🏷️ צייר מלבן על תווית האפשרות', 'info');
                mapper.updateMappingBadge(`☑️ שלב 3/5: סמן תווית - Esc לביטול`);
            }

            console.log('[QuickMapperEngine] Checkbox square clicked at:', x, y);
        },

        /**
         * Mark checkbox option label (Step 3 - repeated)
         * @param {Object} bbox - Bounding box of selected label
         * @param {string} text - Extracted text
         * @param {Object} mapper - FieldMapper instance
         */
        markCheckboxOptionLabel(bbox, text, mapper) {
            if (this._currentFlow !== 'checkbox' ||
                this._checkboxFlowState.currentStep !== 'mark_label') return;

            const optionIndex = this._checkboxFlowState.currentOptionIndex;
            const option = this._checkboxFlowState.options[optionIndex];

            if (option) {
                option.label = text;
                option.value = this._generateValue(text);

                // Update the field
                const field = mapper.fields.find(f => f.id === option.fieldId);
                if (field) {
                    field.label_he = text;
                    field.labelHe = text;
                    field.label_en = option.value;
                    field.labelEn = option.value;
                    mapper.updateFieldList();
                }
            }

            // Go back to square clicking for more options
            this._checkboxFlowState.currentStep = 'click_square';

            const sm = mapper.stateMachine;
            const MS = window.MapperState;

            if (sm && MS) {
                sm.reset(true);
                sm.setState(MS.CHECKBOX_CREATION);
            }

            const optionCount = this._checkboxFlowState.options.length;

            if (optionCount >= 2) {
                mapper.showToast(`תווית נוספה: "${text}". לחץ על ריבוע נוסף או Enter לסיום`, 'info');
                mapper.setStatus('☑️ לחץ על ריבוע נוסף או Enter לסיום', 'info');
                mapper.updateMappingBadge(`☑️ שלב 4/5: ${optionCount} אפשרויות - Enter לאישור`);
            } else {
                mapper.showToast(`תווית נוספה: "${text}". לחץ על ריבוע נוסף`, 'info');
                mapper.setStatus('☑️ לחץ על ריבוע checkbox נוסף', 'info');
                mapper.updateMappingBadge('☑️ שלב 2/5: לחץ על ריבוע - נדרשות עוד אפשרויות');
            }

            console.log('[QuickMapperEngine] Checkbox label marked:', text);
        },

        /**
         * Confirm and create checkbox group (Step 5)
         * @param {Object} mapper - FieldMapper instance
         */
        confirmCheckboxGroup(mapper) {
            if (this._currentFlow !== 'checkbox') return;

            const options = this._checkboxFlowState.options;
            if (options.length < 2) {
                mapper.showToast('נדרשות לפחות 2 אפשרויות ליצירת קבוצה', 'warning');
                return;
            }

            const groupLabel = this._checkboxFlowState.groupLabel;

            // Create checkbox group
            const groupId = `checkbox_group_${Date.now()}`;
            const group = {
                id: groupId,
                type: 'checkbox',
                name: groupLabel.text,
                key: groupLabel.key,
                labelBbox: groupLabel.bbox,
                options: options.map((opt, idx) => ({
                    fieldId: opt.fieldId,
                    index: idx,
                    label: opt.label,
                    value: opt.value,
                    bbox: opt.bbox
                })),
                fieldIds: options.map(opt => opt.fieldId),
                createdAt: Date.now(),
                pendingReview: true
            };

            // Add to mapper's option groups (or checkbox groups)
            if (!mapper.optionGroups) {
                mapper.optionGroups = [];
            }
            mapper.optionGroups.push(group);

            // Update fields with group reference
            options.forEach(opt => {
                const field = mapper.fields.find(f => f.id === opt.fieldId);
                if (field) {
                    field.checkboxGroupId = groupId;
                    field.isGroupOption = true;
                }
            });

            mapper.updateFieldList();
            mapper.saveState('quick_create_checkbox_group');

            // Reset flow
            const sm = mapper.stateMachine;
            if (sm) {
                sm.reset(true);
            }

            this._resetAllFlows();

            mapper.showToast(`קבוצת checkbox "${groupLabel.text}" נוצרה עם ${options.length} אפשרויות!`, 'success');
            mapper.setStatus('מוכן', 'info');
            mapper.updateMappingBadge('');

            console.log('[QuickMapperEngine] Checkbox group created:', groupId);
        },

        // ============ HELPER METHODS ============

        /**
         * Create a field object
         * @private
         */
        _createField(bbox, type, options, mapper) {
            const layer = document.getElementById('mapping-layer');
            const layerWidth = layer?.offsetWidth || 1;
            const layerHeight = layer?.offsetHeight || 1;

            const xPercent = bbox.x / layerWidth;
            const yPercent = bbox.y / layerHeight;

            const fieldId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            return {
                id: fieldId,
                type: type,
                page: mapper.currentPage,
                anchor: [xPercent, yPercent],
                overlayWidth: bbox.width,
                overlayHeight: bbox.height,
                label_he: options.labelHe || '',
                label_en: options.labelEn || fieldId,
                labelHe: options.labelHe || '',
                labelEn: options.labelEn || fieldId,
                isMapped: true,
                isComplete: !!options.labelHe,
                isUnnamed: !options.labelHe,
                pendingReview: options.pendingReview || false,
                isGroupOption: options.isGroupOption || false,
                element: null
            };
        },

        /**
         * Generate key from Hebrew/English text
         * @private
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
         * Generate value from label text
         * @private
         */
        _generateValue(text) {
            return this._generateKey(text);
        },

        /**
         * Get current flow type
         * @returns {string|null}
         */
        getCurrentFlow() {
            return this._currentFlow;
        },

        /**
         * Get current flow step
         * @returns {string|null}
         */
        getCurrentStep() {
            if (this._currentFlow === 'text') {
                return this._textFlowState.step;
            }
            if (this._currentFlow === 'radio') {
                return this._radioFlowState.currentStep;
            }
            if (this._currentFlow === 'checkbox') {
                return this._checkboxFlowState.currentStep;
            }
            return null;
        },

        /**
         * Get flow status for debugging
         * @returns {Object}
         */
        getFlowStatus() {
            return {
                active: this._active,
                currentFlow: this._currentFlow,
                textFlow: { ...this._textFlowState },
                radioFlow: {
                    ...this._radioFlowState,
                    optionCount: this._radioFlowState.options.length
                },
                checkboxFlow: {
                    ...this._checkboxFlowState,
                    optionCount: this._checkboxFlowState.options.length
                }
            };
        },

        /**
         * Get flow state for sidebar rendering
         * @returns {Object}
         */
        getFlowState() {
            return {
                currentFlow: this._currentFlow,
                textFlow: { ...this._textFlowState },
                radioFlow: {
                    groupLabel: this._radioFlowState.groupLabel,
                    options: [...this._radioFlowState.options],
                    currentStep: this._radioFlowState.currentStep
                },
                checkboxFlow: {
                    groupLabel: this._checkboxFlowState.groupLabel,
                    options: [...this._checkboxFlowState.options],
                    currentStep: this._checkboxFlowState.currentStep
                }
            };
        }
    };

    // ============ EXPORTS ============
    window.QuickMapperEngine = QuickMapperEngine;

    console.log('[QuickMapperEngine] Module loaded');

})();
