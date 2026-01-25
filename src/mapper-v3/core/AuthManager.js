/**
 * AuthManager - Centralized Authorization System
 *
 * Manages access levels for the unified tofesPDF tool.
 * Replaces hardcoded password checks with a clean, event-driven system.
 *
 * V3.14: Auth codes moved to auth-config.js for separation of concerns
 *
 * @version 1.1.0
 * @since 2025-01-23
 */

const AuthManager = (function() {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────

    const LEVELS = {
        PUBLIC: 'public',         // Default - form filling only
        AUTHORIZED: 'authorized'  // Full access - mapping, AI, export
    };

    const AUTH_EVENTS = {
        LEVEL_CHANGED: 'auth:level_changed',
        LOGIN_SUCCESS: 'auth:login_success',
        LOGIN_FAILED: 'auth:login_failed',
        LOGOUT: 'auth:logout',
        SHOW_LOGIN_DIALOG: 'auth:show_login_dialog'
    };

    // V3.14: Use AuthConfig for configuration (if available)
    const STORAGE_KEY = (typeof AuthConfig !== 'undefined')
        ? AuthConfig.getStorageKey()
        : 'tofespdf_auth';
    const SESSION_MAX_AGE = (typeof AuthConfig !== 'undefined')
        ? AuthConfig.getSessionMaxAge()
        : 4 * 60 * 60 * 1000;

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────

    let _currentLevel = LEVELS.PUBLIC;
    let _sessionStart = null;
    let _initialized = false;

    // ─────────────────────────────────────────────────────────────
    // Private Methods
    // ─────────────────────────────────────────────────────────────

    /**
     * Emit event via EventBus if available
     */
    function _emit(event, data) {
        if (typeof eventBus !== 'undefined' && eventBus.emit) {
            eventBus.emit(event, data);
        }

        // Also dispatch DOM event for components that don't use EventBus
        document.dispatchEvent(new CustomEvent(event, { detail: data }));
    }

    /**
     * Set level and emit change event
     */
    function _setLevel(level) {
        const previousLevel = _currentLevel;
        _currentLevel = level;

        _emit(AUTH_EVENTS.LEVEL_CHANGED, {
            level,
            previousLevel,
            isAuthorized: level === LEVELS.AUTHORIZED
        });
    }

    /**
     * Save session to sessionStorage
     */
    function _saveSession() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                level: _currentLevel,
                timestamp: _sessionStart
            }));
        } catch (e) {
            console.warn('[AuthManager] Failed to save session:', e);
        }
    }

    /**
     * Restore session from sessionStorage
     */
    function _restoreSession() {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (!saved) return;

            const data = JSON.parse(saved);

            // Check if session is still valid
            if (data.timestamp && (Date.now() - data.timestamp) < SESSION_MAX_AGE) {
                if (data.level === LEVELS.AUTHORIZED) {
                    _currentLevel = LEVELS.AUTHORIZED;
                    _sessionStart = data.timestamp;
                    console.log('[AuthManager] Session restored');
                }
            } else {
                _clearSession();
            }
        } catch (e) {
            console.warn('[AuthManager] Failed to restore session:', e);
            _clearSession();
        }
    }

    /**
     * Clear saved session
     */
    function _clearSession() {
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            // Ignore
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────

    return {
        // Expose constants
        LEVELS: LEVELS,
        EVENTS: AUTH_EVENTS,

        /**
         * Initialize and restore session if exists
         */
        init: function() {
            if (_initialized) {
                console.log('[AuthManager] Already initialized');
                return;
            }

            _restoreSession();
            _initialized = true;

            console.log('[AuthManager] Initialized, level:', _currentLevel);
        },

        /**
         * Get current access level
         * @returns {string}
         */
        getLevel: function() {
            return _currentLevel;
        },

        /**
         * Check if user has authorized access
         * @returns {boolean}
         */
        isAuthorized: function() {
            return _currentLevel === LEVELS.AUTHORIZED;
        },

        /**
         * Check if user is in public mode
         * @returns {boolean}
         */
        isPublic: function() {
            return _currentLevel === LEVELS.PUBLIC;
        },

        /**
         * Attempt to authorize with a code
         * @param {string} code - Access code
         * @returns {boolean} Success status
         */
        authorize: function(code) {
            if (!code || typeof code !== 'string') {
                _emit(AUTH_EVENTS.LOGIN_FAILED, { reason: 'קוד ריק' });
                return false;
            }

            // V3.14: Use AuthConfig for code validation
            const isValid = (typeof AuthConfig !== 'undefined')
                ? AuthConfig.isValidCode(code)
                : false; // Fail-safe if config not loaded

            if (isValid) {
                _setLevel(LEVELS.AUTHORIZED);
                _sessionStart = Date.now();
                _saveSession();

                console.log('[AuthManager] Authorization successful');
                _emit(AUTH_EVENTS.LOGIN_SUCCESS, { level: LEVELS.AUTHORIZED });

                return true;
            }

            console.log('[AuthManager] Authorization failed - invalid code');
            _emit(AUTH_EVENTS.LOGIN_FAILED, { reason: 'קוד שגוי' });
            return false;
        },

        /**
         * Logout and return to public mode
         */
        logout: function() {
            if (_currentLevel === LEVELS.PUBLIC) {
                return;
            }

            _setLevel(LEVELS.PUBLIC);
            _sessionStart = null;
            _clearSession();

            console.log('[AuthManager] Logged out');
            _emit(AUTH_EVENTS.LOGOUT, {});
        },

        /**
         * Toggle auth state
         * If public - emits event to show login dialog
         * If authorized - logs out
         */
        toggle: function() {
            if (this.isAuthorized()) {
                this.logout();
            } else {
                _emit(AUTH_EVENTS.SHOW_LOGIN_DIALOG, {});
            }
        },

        /**
         * Show login dialog (convenience method)
         */
        showLoginDialog: function() {
            _emit(AUTH_EVENTS.SHOW_LOGIN_DIALOG, {});
        }
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AuthManager.init());
} else {
    AuthManager.init();
}

console.log('[AuthManager] Module loaded');
