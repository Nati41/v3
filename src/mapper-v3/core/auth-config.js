/**
 * auth-config.js - Authentication Configuration
 *
 * SECURITY NOTE: In production, these should be moved to:
 * - Environment variables
 * - Server-side validation
 * - Secure token system
 *
 * This file separates configuration from logic for easier maintenance.
 *
 * @version 1.0.0
 * @since 2025-01-25
 */

const AuthConfig = (function() {
    'use strict';

    // Valid access codes
    // TODO: Move to server-side validation in production
    const VALID_CODES = [
        'נתנאל3028',
        'admin2024'
    ];

    // Session configuration
    const SESSION_MAX_AGE_HOURS = 4;
    const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_HOURS * 60 * 60 * 1000;

    // Storage key
    const STORAGE_KEY = 'tofespdf_auth';

    return {
        /**
         * Check if a code is valid
         * @param {string} code - Code to validate
         * @returns {boolean}
         */
        isValidCode: function(code) {
            if (!code || typeof code !== 'string') return false;
            return VALID_CODES.includes(code.trim());
        },

        /**
         * Get session max age in milliseconds
         * @returns {number}
         */
        getSessionMaxAge: function() {
            return SESSION_MAX_AGE_MS;
        },

        /**
         * Get storage key
         * @returns {string}
         */
        getStorageKey: function() {
            return STORAGE_KEY;
        }
    };
})();

console.log('[AuthConfig] Module loaded');
