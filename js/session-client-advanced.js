/**
 * js/session-client-advanced.js
 * Advanced client-side session management
 *
 * Features:
 *  - Auto-refresh on activity (prevents idle timeout)
 *  - Session timeout warnings
 *  - Multiple active sessions management
 *  - Audit log access
 *  - Automatic logout on absolute timeout
 */

const SERVER_API = process.env.SERVER_API || 'http://localhost:3000';

let _currentUser = null;
let _sessionInfo = null;
let _refreshInterval = null;
let _warningInterval = null;
let _idleTimer = null;
let _onSessionExpiredCallback = null;

// ─── PUBLIC API ──────────────────────────────────────

function getCurrentUser() {
    return _currentUser;
}

function isAdmin() {
    return _currentUser?.userMetadata?.role === 'admin';
}

function getSessionInfo() {
    return _sessionInfo;
}

/**
 * Initialize session and start auto-management.
 */
async function initSession() {
    try {
        const response = await fetch(`${SERVER_API}/auth/me`, {
            credentials: 'include',
        });

        if (!response.ok) return false;

        const { user, session } = await response.json();
        
        if (user) {
            _currentUser = user;
            _sessionInfo = session;
            _startAutoManagement();
            return true;
        }
    } catch (err) {
        console.warn('Session check failed:', err);
    }

    return false;
}

/**
 * Login with email and password.
 */
async function login(email, password) {
    try {
        const response = await fetch(`${SERVER_API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.error || 'Login failed' };
        }

        _currentUser = data.user;
        
        // Get full session info
        const meResponse = await fetch(`${SERVER_API}/auth/me`, {
            credentials: 'include',
        });
        const { session } = await meResponse.json();
        _sessionInfo = session;

        _startAutoManagement();

        return { success: true, user: data.user };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Logout current user.
 */
async function logout() {
    try {
        const response = await fetch(`${SERVER_API}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        });

        if (response.ok) {
            _currentUser = null;
            _sessionInfo = null;
            _stopAutoManagement();
            return true;
        }
    } catch (err) {
        console.error('Logout failed:', err);
    }

    return false;
}

/**
 * Manually refresh session (extend idle timeout).
 */
async function refreshSession() {
    try {
        const response = await fetch(`${SERVER_API}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        if (response.ok) {
            // Update session info
            const meResponse = await fetch(`${SERVER_API}/auth/me`, {
                credentials: 'include',
            });
            const { session } = await meResponse.json();
            _sessionInfo = session;
            return true;
        }
    } catch (err) {
        console.error('Session refresh failed:', err);
    }

    return false;
}

/**
 * Force session rotation (logout all sessions).
 * Used after privilege changes or password reset.
 */
async function rotateSession(reason = 'manual') {
    try {
        const response = await fetch(`${SERVER_API}/auth/rotate-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ reason }),
        });

        if (response.ok) {
            _currentUser = null;
            _sessionInfo = null;
            _stopAutoManagement();
            return true;
        }
    } catch (err) {
        console.error('Session rotation failed:', err);
    }

    return false;
}

/**
 * Get list of all active sessions for current user.
 */
async function getActiveSessions() {
    try {
        const response = await fetch(`${SERVER_API}/auth/sessions/active`, {
            credentials: 'include',
        });

        if (response.ok) {
            const { sessions } = await response.json();
            return sessions;
        }
    } catch (err) {
        console.error('Failed to get active sessions:', err);
    }

    return [];
}

/**
 * Logout a specific session (other device).
 */
async function logoutSession(sessionId) {
    try {
        const response = await fetch(
            `${SERVER_API}/auth/sessions/${sessionId}`,
            {
                method: 'DELETE',
                credentials: 'include',
            }
        );

        if (response.ok) {
            return true;
        }
    } catch (err) {
        console.error('Failed to logout session:', err);
    }

    return false;
}

/**
 * Get audit log for current user.
 */
async function getAuditLog() {
    try {
        const response = await fetch(`${SERVER_API}/auth/audit-log`, {
            credentials: 'include',
        });

        if (response.ok) {
            const { entries } = await response.json();
            return entries;
        }
    } catch (err) {
        console.error('Failed to get audit log:', err);
    }

    return [];
}

/**
 * Register callback for when session expires.
 */
function onSessionExpired(callback) {
    _onSessionExpiredCallback = callback;
}

// ─── PRIVATE HELPERS ────────────────────────────────

/**
 * Start auto-management: periodic refresh, idle detection, timeout warnings.
 */
function _startAutoManagement() {
    _stopAutoManagement();

    // Refresh session every 10 minutes (before idle timeout of 30 min)
    _refreshInterval = setInterval(async () => {
        const success = await refreshSession();
        if (!success) {
            console.warn('Session refresh failed');
            _stopAutoManagement();
            _currentUser = null;
            _sessionInfo = null;
            if (_onSessionExpiredCallback) {
                _onSessionExpiredCallback('refresh_failed');
            }
        }
    }, 600000); // 10 minutes

    // Check timeouts every minute
    _warningInterval = setInterval(() => {
        _checkSessionTimeouts();
    }, 60000); // 1 minute

    // Reset idle timer on user activity
    _resetIdleTimer();
    document.addEventListener('click', _resetIdleTimer);
    document.addEventListener('keypress', _resetIdleTimer);
}

/**
 * Stop auto-management.
 */
function _stopAutoManagement() {
    if (_refreshInterval) {
        clearInterval(_refreshInterval);
        _refreshInterval = null;
    }
    if (_warningInterval) {
        clearInterval(_warningInterval);
        _warningInterval = null;
    }
    if (_idleTimer) {
        clearTimeout(_idleTimer);
        _idleTimer = null;
    }
    document.removeEventListener('click', _resetIdleTimer);
    document.removeEventListener('keypress', _resetIdleTimer);
}

/**
 * Reset idle countdown.
 */
function _resetIdleTimer() {
    if (_idleTimer) {
        clearTimeout(_idleTimer);
    }

    // Set timeout for 25 minutes (5 min before 30 min idle timeout)
    _idleTimer = setTimeout(() => {
        console.warn('⚠️  Session idle timeout approaching');
        if (_onSessionExpiredCallback) {
            _onSessionExpiredCallback('idle_approaching');
        }
    }, 1500000); // 25 minutes
}

/**
 * Check if session is approaching timeout and warn user.
 */
function _checkSessionTimeouts() {
    if (!_sessionInfo) return;

    const idleMs = _sessionInfo.idleTimeoutMs || 0;
    const absoluteMs = _sessionInfo.absoluteTimeoutMs || 0;

    // Warn if less than 5 minutes remaining
    if (idleMs > 0 && idleMs < 300000) {
        console.warn(`⏱️  Idle timeout in ${Math.round(idleMs / 1000 / 60)}m`);
        if (_onSessionExpiredCallback) {
            _onSessionExpiredCallback('idle_warning', {
                remainingMs: idleMs,
            });
        }
    }

    // Warn if less than 1 hour remaining (absolute timeout)
    if (absoluteMs > 0 && absoluteMs < 3600000) {
        console.warn(`⚠️  Session expires in ${Math.round(absoluteMs / 1000 / 3600)}h`);
        if (_onSessionExpiredCallback) {
            _onSessionExpiredCallback('absolute_warning', {
                remainingMs: absoluteMs,
            });
        }
    }

    // Logout if expired
    if ((idleMs <= 0 || absoluteMs <= 0) && _currentUser) {
        console.error('❌ Session expired');
        _currentUser = null;
        _sessionInfo = null;
        _stopAutoManagement();
        if (_onSessionExpiredCallback) {
            _onSessionExpiredCallback('expired');
        }
    }
}

// ─── GLOBAL EXPORTS ─────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getCurrentUser,
        isAdmin,
        getSessionInfo,
        initSession,
        login,
        logout,
        refreshSession,
        rotateSession,
        getActiveSessions,
        logoutSession,
        getAuditLog,
        onSessionExpired,
    };
}

window.SessionClient = {
    getCurrentUser,
    isAdmin,
    getSessionInfo,
    initSession,
    login,
    logout,
    refreshSession,
    rotateSession,
    getActiveSessions,
    logoutSession,
    getAuditLog,
    onSessionExpired,
};

console.log('✅ Advanced Session Client loaded');
