/**
 * ExceptionReviewPanel - UI for resolving template exceptions
 * V3.3: Handles ambiguous fields that need user decision
 *
 * Exception types:
 * - AMBIGUOUS_FIELD: Field has multiple possible interpretations
 * - DUPLICATE_UNCERTAIN: Unclear if fields are duplicates or distinct
 * - MISSING_REQUIRED: Required field not found in template
 */
import { eventBus, Events } from '../core/EventBus.js';
import { templateStore, ExceptionType } from '../core/TemplateStore.js';
import { state } from '../core/StateManager.js';

export class ExceptionReviewPanel {
    constructor() {
        this.panel = null;
        this.isOpen = false;
        this.currentExceptionIndex = 0;
        this.exceptions = [];
    }

    /**
     * Initialize the panel
     */
    init() {
        this._createPanel();
        this._setupEventListeners();
        console.log('[ExceptionReviewPanel] Initialized');
    }

    /**
     * Create the panel DOM structure
     */
    _createPanel() {
        // Check if panel already exists
        if (document.getElementById('exception-review-panel')) {
            this.panel = document.getElementById('exception-review-panel');
            return;
        }

        const panelHtml = `
            <div id="exception-review-panel" class="exception-panel hidden">
                <div class="exception-panel-header">
                    <div class="header-title">
                        <span class="icon">⚠️</span>
                        <span class="title">בדיקת חריגות</span>
                    </div>
                    <div class="header-progress">
                        <span class="current">1</span>
                        <span class="separator">/</span>
                        <span class="total">1</span>
                    </div>
                    <button class="btn-close" title="סגור">×</button>
                </div>
                <div class="exception-panel-body">
                    <div class="exception-description"></div>
                    <div class="exception-choices"></div>
                </div>
                <div class="exception-panel-footer">
                    <button class="btn-skip">דלג</button>
                    <button class="btn-skip-all">דלג על הכל</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', panelHtml);
        this.panel = document.getElementById('exception-review-panel');
    }

    /**
     * Setup event listeners
     */
    _setupEventListeners() {
        if (!this.panel) return;

        // Close button
        this.panel.querySelector('.btn-close').addEventListener('click', () => {
            this.close();
        });

        // Skip button
        this.panel.querySelector('.btn-skip').addEventListener('click', () => {
            this._skipCurrent();
        });

        // Skip all button
        this.panel.querySelector('.btn-skip-all').addEventListener('click', () => {
            this._skipAll();
        });

        // Listen for template loaded to check for exceptions
        eventBus.on(Events.TEMPLATE_LOADED, () => {
            if (templateStore.hasExceptions()) {
                // Delay slightly to let other UI settle
                setTimeout(() => this.open(), 500);
            }
        });

        // Listen for all exceptions resolved
        eventBus.on(Events.ALL_EXCEPTIONS_RESOLVED, () => {
            this.close();
        });
    }

    /**
     * Open the panel and show first exception
     */
    open() {
        if (!this.panel) {
            this._createPanel();
            this._setupEventListeners();
        }

        // Get exceptions from template store
        this.exceptions = templateStore.getExceptions() || [];
        if (this.exceptions.length === 0) {
            console.log('[ExceptionReviewPanel] No exceptions to review');
            return;
        }

        this.currentExceptionIndex = 0;
        this._renderCurrentException();

        this.panel.classList.remove('hidden');
        this.isOpen = true;

        console.log('[ExceptionReviewPanel] Opened with', this.exceptions.length, 'exceptions');
    }

    /**
     * Close the panel
     */
    close() {
        if (this.panel) {
            this.panel.classList.add('hidden');
        }
        this.isOpen = false;
        console.log('[ExceptionReviewPanel] Closed');
    }

    /**
     * Render the current exception
     */
    _renderCurrentException() {
        if (!this.panel || this.exceptions.length === 0) return;

        const exception = this.exceptions[this.currentExceptionIndex];
        if (!exception) return;

        // Update progress
        this.panel.querySelector('.current').textContent = this.currentExceptionIndex + 1;
        this.panel.querySelector('.total').textContent = this.exceptions.length;

        // Render description based on exception type
        const descEl = this.panel.querySelector('.exception-description');
        descEl.innerHTML = this._getExceptionDescription(exception);

        // Render choices
        const choicesEl = this.panel.querySelector('.exception-choices');
        choicesEl.innerHTML = this._renderChoices(exception);

        // Attach choice handlers
        choicesEl.querySelectorAll('.choice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const choice = btn.dataset.choice;
                this._resolveException(exception, choice);
            });
        });
    }

    /**
     * Get description HTML for exception
     */
    _getExceptionDescription(exception) {
        // V3.4: Better field name extraction
        const fieldName = exception.field?.label_he || exception.field?.name ||
                          exception.field?.label_en || exception.fieldName || 'שדה';
        const fieldEnglish = exception.field?.name || exception.field?.label_en || '';

        switch (exception.type) {
            case ExceptionType.AMBIGUOUS_FIELD:
                // Show the actual interpretations if available
                const interp1 = exception.interpretations?.[0]?.label_he || exception.interpretations?.[0]?.name || 'פרשנות 1';
                const interp2 = exception.interpretations?.[1]?.label_he || exception.interpretations?.[1]?.name || 'פרשנות 2';

                return `
                    <div class="exception-type ambiguous">
                        <span class="type-icon">🤔</span>
                        <span class="type-label">שדה דו-משמעי</span>
                    </div>
                    <div class="exception-message">
                        <div class="exception-field-name">
                            <strong>"${this._escapeHtml(fieldName)}"</strong>
                            ${fieldEnglish ? `<span class="field-english">(${this._escapeHtml(fieldEnglish)})</span>` : ''}
                        </div>
                        <div class="exception-explanation">
                            זיהינו שהשדה הזה יכול להתייחס לכמה דברים שונים בטופס.
                            <br>בחר איזו משמעות נכונה:
                        </div>
                        ${exception.interpretations?.length > 0 ? `
                            <div class="interpretations-preview">
                                <div class="interp-item">• ${this._escapeHtml(interp1)}</div>
                                <div class="interp-item">• ${this._escapeHtml(interp2)}</div>
                            </div>
                        ` : ''}
                    </div>
                `;

            case ExceptionType.DUPLICATE_UNCERTAIN:
                // Show which fields might be duplicates
                const dupCount = exception.duplicates?.length || 2;
                const dupNames = exception.duplicates?.slice(0, 3).map(d =>
                    d.label_he || d.name || d.template_field_id
                ).join(', ') || '';

                return `
                    <div class="exception-type duplicate">
                        <span class="type-icon">👥</span>
                        <span class="type-label">שדות דומים (${dupCount})</span>
                    </div>
                    <div class="exception-message">
                        <div class="exception-field-name">
                            <strong>"${this._escapeHtml(fieldName)}"</strong>
                            ${fieldEnglish ? `<span class="field-english">(${this._escapeHtml(fieldEnglish)})</span>` : ''}
                        </div>
                        <div class="exception-explanation">
                            מצאנו ${dupCount} שדות עם שם דומה בטופס.
                            <br><strong>כפילויות</strong> = אותו נתון חוזר כמה פעמים (למשל: ילד 1, ילד 2...)
                            <br><strong>שדות נפרדים</strong> = נתונים שונים עם שמות דומים
                        </div>
                        ${dupNames ? `<div class="dup-preview">שדות: ${this._escapeHtml(dupNames)}</div>` : ''}
                    </div>
                `;

            case ExceptionType.MISSING_REQUIRED:
                return `
                    <div class="exception-type missing">
                        <span class="type-icon">❗</span>
                        <span class="type-label">שדה חובה חסר</span>
                    </div>
                    <div class="exception-message">
                        <div class="exception-field-name">
                            <strong>"${this._escapeHtml(fieldName)}"</strong>
                            ${fieldEnglish ? `<span class="field-english">(${this._escapeHtml(fieldEnglish)})</span>` : ''}
                        </div>
                        <div class="exception-explanation">
                            שדה זה מסומן כחובה בתבנית, אבל לא מצאנו אותו בטופס.
                            <br>מה תרצה לעשות?
                        </div>
                    </div>
                `;

            default:
                return `
                    <div class="exception-type unknown">
                        <span class="type-icon">❓</span>
                        <span class="type-label">נדרשת החלטה</span>
                    </div>
                    <div class="exception-message">
                        <div class="exception-field-name">
                            <strong>"${this._escapeHtml(fieldName)}"</strong>
                            ${fieldEnglish ? `<span class="field-english">(${this._escapeHtml(fieldEnglish)})</span>` : ''}
                        </div>
                        <div class="exception-explanation">
                            נדרשת החלטה שלך לגבי שדה זה.
                        </div>
                    </div>
                `;
        }
    }

    /**
     * Render choice buttons for exception
     */
    _renderChoices(exception) {
        const choices = exception.choices || [];

        if (choices.length === 0) {
            // Default choices based on type
            return this._getDefaultChoices(exception);
        }

        return choices.map((choice, index) => `
            <button class="choice-btn" data-choice="${choice.value || index}">
                <span class="choice-icon">${choice.icon || '○'}</span>
                <div class="choice-content">
                    <span class="choice-label">${this._escapeHtml(choice.label)}</span>
                    ${choice.description ? `<span class="choice-desc">${this._escapeHtml(choice.description)}</span>` : ''}
                </div>
            </button>
        `).join('');
    }

    /**
     * Get default choices based on exception type
     * V3.4: Improved with clearer explanations and actual field names
     */
    _getDefaultChoices(exception) {
        switch (exception.type) {
            case ExceptionType.AMBIGUOUS_FIELD:
                // Use actual interpretation names if available
                const interp1Name = exception.interpretations?.[0]?.label_he ||
                                   exception.interpretations?.[0]?.name || 'אפשרות ראשונה';
                const interp2Name = exception.interpretations?.[1]?.label_he ||
                                   exception.interpretations?.[1]?.name || 'אפשרות שנייה';

                return `
                    <button class="choice-btn choice-primary" data-choice="keep_first">
                        <span class="choice-icon">1️⃣</span>
                        <div class="choice-content">
                            <span class="choice-label">${this._escapeHtml(interp1Name)}</span>
                            <span class="choice-desc">בחר פרשנות זו</span>
                        </div>
                    </button>
                    <button class="choice-btn" data-choice="keep_second">
                        <span class="choice-icon">2️⃣</span>
                        <div class="choice-content">
                            <span class="choice-label">${this._escapeHtml(interp2Name)}</span>
                            <span class="choice-desc">בחר פרשנות זו</span>
                        </div>
                    </button>
                    <button class="choice-btn choice-secondary" data-choice="keep_both">
                        <span class="choice-icon">📋</span>
                        <div class="choice-content">
                            <span class="choice-label">שמור את שניהם</span>
                            <span class="choice-desc">ייווצרו 2 שדות נפרדים לכל פרשנות</span>
                        </div>
                    </button>
                `;

            case ExceptionType.DUPLICATE_UNCERTAIN:
                const dupCount = exception.duplicates?.length || 2;
                return `
                    <button class="choice-btn choice-primary" data-choice="are_duplicates">
                        <span class="choice-icon">🔄</span>
                        <div class="choice-content">
                            <span class="choice-label">כן, זה אותו שדה שחוזר ${dupCount} פעמים</span>
                            <span class="choice-desc">מיפוי אחד יחול על כל ${dupCount} המופעים אוטומטית</span>
                        </div>
                    </button>
                    <button class="choice-btn" data-choice="are_distinct">
                        <span class="choice-icon">🔸</span>
                        <div class="choice-content">
                            <span class="choice-label">לא, אלו שדות שונים</span>
                            <span class="choice-desc">כל שדה יימפה בנפרד במיקום שלו</span>
                        </div>
                    </button>
                `;

            case ExceptionType.MISSING_REQUIRED:
                return `
                    <button class="choice-btn choice-primary" data-choice="add_field">
                        <span class="choice-icon">➕</span>
                        <div class="choice-content">
                            <span class="choice-label">הוסף שדה ריק</span>
                            <span class="choice-desc">אמפה את השדה ידנית אחר כך</span>
                        </div>
                    </button>
                    <button class="choice-btn" data-choice="mark_optional">
                        <span class="choice-icon">⏭️</span>
                        <div class="choice-content">
                            <span class="choice-label">דלג על השדה</span>
                            <span class="choice-desc">השדה לא קיים בטופס הזה</span>
                        </div>
                    </button>
                `;

            default:
                return `
                    <button class="choice-btn choice-primary" data-choice="accept">
                        <span class="choice-icon">✅</span>
                        <div class="choice-content">
                            <span class="choice-label">אשר</span>
                        </div>
                    </button>
                    <button class="choice-btn" data-choice="reject">
                        <span class="choice-icon">⏭️</span>
                        <div class="choice-content">
                            <span class="choice-label">דלג</span>
                        </div>
                    </button>
                `;
        }
    }

    /**
     * Resolve exception with chosen option
     */
    _resolveException(exception, choice) {
        console.log('[ExceptionReviewPanel] Resolving exception:', exception.id, 'with choice:', choice);

        // Call template store to resolve
        const resultFieldId = templateStore.resolveException(exception.id, choice);

        // Emit event
        eventBus.emit(Events.EXCEPTION_RESOLVED, {
            exceptionId: exception.id,
            choice: choice,
            resultFieldId: resultFieldId
        });

        // Move to next exception or close
        this._moveToNext();
    }

    /**
     * Skip current exception
     */
    _skipCurrent() {
        const exception = this.exceptions[this.currentExceptionIndex];
        if (exception) {
            console.log('[ExceptionReviewPanel] Skipping exception:', exception.id);
            templateStore.skipException(exception.id);

            eventBus.emit(Events.EXCEPTION_SKIPPED, {
                exceptionId: exception.id
            });
        }

        this._moveToNext();
    }

    /**
     * Skip all remaining exceptions
     */
    _skipAll() {
        console.log('[ExceptionReviewPanel] Skipping all remaining exceptions');
        templateStore.skipAllExceptions();
        this.close();

        eventBus.emit(Events.ALL_EXCEPTIONS_RESOLVED, {});
    }

    /**
     * Move to next exception or close if done
     */
    _moveToNext() {
        // Remove current from array
        this.exceptions.splice(this.currentExceptionIndex, 1);

        if (this.exceptions.length === 0) {
            // All done
            this.close();
            eventBus.emit(Events.ALL_EXCEPTIONS_RESOLVED, {});

            eventBus.emit(Events.TOAST_SHOW, {
                message: 'כל החריגות טופלו',
                type: 'success'
            });
        } else {
            // Show next (index stays same since we removed current)
            if (this.currentExceptionIndex >= this.exceptions.length) {
                this.currentExceptionIndex = 0;
            }
            this._renderCurrentException();
        }
    }

    /**
     * Escape HTML
     */
    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Singleton instance
export const exceptionReviewPanel = new ExceptionReviewPanel();
