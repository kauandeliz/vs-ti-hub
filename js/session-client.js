/**
 * js/session-client.js
 * Client-side session management with server-side Redis backend
 *
 * This module:
 *  - Calls the Express server at /auth/* endpoints
 *  - Manages session cookie (HttpOnly, handled by browser automatically)
 *  - Provides methods to check auth status and get current user
 *  - Handles login, logout, and session refresh
 *
 * IMPORTANT: The sessionId cookie is HttpOnly, so JavaScript CANNOT access it.
 * This is by design (security). The server checks the cookie automatically
 * on every request.
 */

// ─── CONFIG ──────────────────────────────────────────
const SERVER_API = process.env.SERVER_API || 'http://localhost:3000';

// ─── STATE ───────────────────────────────────────────
let _currentUser = null;
let _sessionRefreshInterval = null;

// ─── PUBLIC API ───────────────────────────────────────

/**
 * Get the currently authenticated user.
 * @returns {Object|null} User object or null if not authenticated
 */
function getCurrentUser() {
    return _currentUser;
}

/**
 * Check if the logged-in user is an admin.
 * @returns {boolean}
 */
function isAdmin() {
    return _currentUser?.userMetadata?.role === 'admin';
}

/**
 * Initialize session management.
 * Call this once on DOMContentLoaded to check for existing session.
 */
async function initSession() {
    try {
        const response = await fetch(`${SERVER_API}/auth/me`, {
            credentials: 'include', // Include cookies
        });

        if (!response.ok) throw new Error('Failed to fetch session');

        const { user } = await response.json();
        if (user) {
            _currentUser = user;
            _startSessionRefresh();
            return true;
        }
    } catch (err) {
        console.warn('Session check failed:', err);
    }

    return false;
}

/**
 * Attempt to login with email and password.
 * Sets the sessionId cookie automatically (HttpOnly, secure).
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
async function login(email, password) {
    try {
        const response = await fetch(`${SERVER_API}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // Allow cookie to be set
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.error || 'Login failed',
            };
        }

        _currentUser = data.user;
        _startSessionRefresh();

        return {
            success: true,
            user: data.user,
        };
    } catch (err) {
        return {
            success: false,
            error: err.message,
        };
    }
}

/**
 * Logout the current user.
 * Clears the sessionId cookie on the server side.
 * @returns {Promise<boolean>}
 */
async function logout() {
    try {
        const response = await fetch(`${SERVER_API}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        });

        if (response.ok) {
            _currentUser = null;
            _stopSessionRefresh();
            return true;
        }
    } catch (err) {
        console.error('Logout failed:', err);
    }

    return false;
}

/**
 * Refresh the session (extend TTL in Redis).
 * Useful for implementing a "keep me logged in" feature.
 * @returns {Promise<boolean>}
 */
async function refreshSession() {
    try {
        const response = await fetch(`${SERVER_API}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        return response.ok;
    } catch (err) {
        console.error('Session refresh failed:', err);
        return false;
    }
}

// ─── PRIVATE HELPERS ────────────────────────────────

/**
 * Start automatic session refresh (every 1 hour).
 * Prevents session expiration during active use.
 */
function _startSessionRefresh() {
    _stopSessionRefresh(); // Clear any existing interval

    _sessionRefreshInterval = setInterval(async () => {
        const success = await refreshSession();
        if (!success) {
            console.warn('Session refresh failed, user may be logged out');
            _currentUser = null;
            _stopSessionRefresh();
        }
    }, 3600000); // 1 hour
}

/**
 * Stop automatic session refresh.
 */
function _stopSessionRefresh() {
    if (_sessionRefreshInterval) {
        clearInterval(_sessionRefreshInterval);
        _sessionRefreshInterval = null;
    }
}

// ─── EXPORTS ────────────────────────────────────────

// For use in browser or module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getCurrentUser,
        isAdmin,
        initSession,
        login,
        logout,
        refreshSession,
    };
}

// Make available globally in browser
window.SessionClient = {
    getCurrentUser,
    isAdmin,
    initSession,
    login,
    logout,
    refreshSession,
};
