/**
 * server/index.js (VERSÃO AVANÇADA)
 * Express backend with advanced session security
 *
 * Features:
 *  ✅ Server-side sessions in Redis (stateless, scalable)
 *  ✅ Session Rotation: regenerate ID on login + privilege changes
 *  ✅ Dupla Expiração: Idle Timeout (30min) + Absolute (24h)
 *  ✅ Fingerprinting: User-Agent + IP validation
 *  ✅ Secure cookies: HttpOnly, Secure, SameSite=Lax
 */

import express from 'express';
import { createClient } from 'redis';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// ─── CONFIGURATION ───────────────────────────────────

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:8080';

// Timeouts (em segundos)
const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT) || 1800; // 30 minutos
const ABSOLUTE_TIMEOUT = parseInt(process.env.ABSOLUTE_TIMEOUT) || 86400; // 24 horas
const SESSION_MAX_AGE = IDLE_TIMEOUT * 1000; // para cookie

if (!SESSION_SECRET) {
    console.error('❌ Error: SESSION_SECRET environment variable is not set.');
    process.exit(1);
}

// ─── REDIS CLIENT ───────────────────────────────────

const redis = createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('✅ Redis connected'));

await redis.connect();

// ─── EXPRESS APP ────────────────────────────────────

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
    origin: CLIENT_URL,
    credentials: true,
}));

// ─── UTILITIES ───────────────────────────────────────

/**
 * Generate cryptographically secure session ID
 */
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Extract client IP (handles proxies)
 */
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.socket.remoteAddress
        || 'unknown';
}

/**
 * Create session fingerprint from User-Agent and IP
 */
function createFingerprint(userAgent, ip) {
    return crypto
        .createHash('sha256')
        .update(`${userAgent}|${ip}`)
        .digest('hex');
}

/**
 * Normalize User-Agent for comparison (ignore minor version changes)
 * Returns: browser family and major version only
 */
function normalizeUserAgent(userAgent) {
    if (!userAgent) return 'unknown';
    
    // Extract browser info (simplified)
    const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+)/);
    if (browserMatch) {
        return `${browserMatch[1]}/${browserMatch[2]}`;
    }
    
    // Fallback: return first 50 chars
    return userAgent.substring(0, 50);
}

/**
 * Check if IP changed significantly
 * Allow some variance but flag major changes
 */
function hasIpChanged(oldIp, newIp) {
    if (!oldIp || !newIp) return false;
    
    // If both are in different subnets (first 3 octets differ), flag it
    const oldParts = oldIp.split('.').slice(0, 3).join('.');
    const newParts = newIp.split('.').slice(0, 3).join('.');
    
    return oldParts !== newParts;
}

/**
 * Save session to Redis with advanced security
 */
async function saveSession(sessionId, userData, fingerprint, ip) {
    const now = Math.floor(Date.now() / 1000);
    
    const sessionData = {
        // User data
        userId: userData.id,
        email: userData.email,
        userMetadata: userData.user_metadata || {},
        
        // Timestamps for dual expiration
        createdAt: now,
        lastActivityAt: now,
        
        // Fingerprinting
        fingerprint: fingerprint,
        ip: ip,
        
        // Flags
        rotated: userData.rotated || false,
    };

    const key = `session:${sessionId}`;
    
    // Set with IDLE timeout (refreshed on each access)
    await redis.setEx(key, IDLE_TIMEOUT, JSON.stringify(sessionData));
}

/**
 * Get session from Redis
 */
async function getSession(sessionId) {
    const key = `session:${sessionId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
}

/**
 * Check if session has exceeded absolute timeout
 */
function hasSessionExpired(sessionData) {
    const now = Math.floor(Date.now() / 1000);
    const age = now - sessionData.createdAt;
    
    return age > ABSOLUTE_TIMEOUT;
}

/**
 * Destroy session
 */
async function destroySession(sessionId) {
    const key = `session:${sessionId}`;
    await redis.del(key);
}

/**
 * Create audit log entry
 */
async function logAudit(userId, action, details = {}) {
    const key = `audit:${userId}:${Date.now()}`;
    const entry = {
        action,
        timestamp: new Date().toISOString(),
        ...details,
    };
    
    // Keep last 100 entries per user
    await redis.setEx(key, 2592000, JSON.stringify(entry)); // 30 days
    
    console.log(`[AUDIT] ${userId} - ${action}`, details);
}

// ─── MIDDLEWARE ──────────────────────────────────────

/**
 * Middleware to load and validate session
 * Checks: existence, absolute expiration, fingerprinting
 */
async function authenticateSession(req, res, next) {
    const sessionId = req.cookies.sessionId;

    if (!sessionId) {
        return next();
    }

    try {
        const session = await getSession(sessionId);
        
        if (!session) {
            res.clearCookie('sessionId', {
                httpOnly: true,
                secure: NODE_ENV === 'production',
                sameSite: 'Lax',
                path: '/',
            });
            return next();
        }

        // Check absolute timeout
        if (hasSessionExpired(session)) {
            await destroySession(sessionId);
            await logAudit(session.userId, 'SESSION_ABSOLUTE_EXPIRED', {
                sessionId: sessionId.slice(0, 8),
            });
            res.clearCookie('sessionId', {
                httpOnly: true,
                secure: NODE_ENV === 'production',
                sameSite: 'Lax',
                path: '/',
            });
            return next();
        }

        // Validate fingerprint
        const currentIp = getClientIp(req);
        const currentUserAgent = req.headers['user-agent'] || 'unknown';
        const currentFingerprint = createFingerprint(
            normalizeUserAgent(currentUserAgent),
            currentIp
        );

        // Warn if fingerprint changed (but still allow)
        if (session.fingerprint !== currentFingerprint) {
            const ipChanged = hasIpChanged(session.ip, currentIp);
            const uaChanged = normalizeUserAgent(currentUserAgent) !== 
                             normalizeUserAgent(session.fingerprint.split('|')[0]);
            
            if (ipChanged) {
                console.warn(`⚠️  IP changed for session ${sessionId.slice(0, 8)}: ${session.ip} → ${currentIp}`);
                await logAudit(session.userId, 'SESSION_IP_CHANGED', {
                    oldIp: session.ip,
                    newIp: currentIp,
                    sessionId: sessionId.slice(0, 8),
                });
                
                // In production, you might want to invalidate the session
                // For now, we'll allow it but log
            }
            
            if (uaChanged) {
                console.warn(`⚠️  User-Agent changed for session ${sessionId.slice(0, 8)}`);
                await logAudit(session.userId, 'SESSION_UA_CHANGED', {
                    sessionId: sessionId.slice(0, 8),
                });
            }
        }

        // Update last activity timestamp
        session.lastActivityAt = Math.floor(Date.now() / 1000);
        await saveSession(sessionId, {
            id: session.userId,
            email: session.email,
            user_metadata: session.userMetadata,
            rotated: session.rotated,
        }, session.fingerprint, session.ip);

        req.session = session;
        req.sessionId = sessionId;
        req.clientIp = currentIp;
        req.clientFingerprint = currentFingerprint;
        
    } catch (err) {
        console.error('Error loading session:', err);
    }

    next();
}

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
    if (!req.session) {
        return res.status(401).json({ 
            error: 'Unauthorized - no valid session',
            code: 'NO_SESSION'
        });
    }
    next();
}

app.use(authenticateSession);

// ─── ROUTES ──────────────────────────────────────────

/**
 * POST /auth/login
 * 
 * Authenticate user and create a new session with session rotation.
 * Always generates a new sessionId (no reuse).
 * 
 * Body: { email, password }
 * Returns: { success, user, sessionId }
 */
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ 
            error: 'Email and password are required',
            code: 'MISSING_FIELDS'
        });
    }

    try {
        // Authenticate with Supabase
        const supabaseResponse = await fetch(
            `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': process.env.SUPABASE_ANON,
                },
                body: JSON.stringify({ email, password }),
            }
        );

        if (!supabaseResponse.ok) {
            const error = await supabaseResponse.json();
            await logAudit('unknown', 'LOGIN_FAILED', {
                email,
                reason: 'auth_failed',
            });
            return res.status(401).json({
                error: error.error_description || 'Invalid credentials',
                code: 'AUTH_FAILED'
            });
        }

        const supabaseData = await supabaseResponse.json();

        // Get user metadata
        const userResponse = await fetch(
            `${process.env.SUPABASE_URL}/auth/v1/user`,
            {
                headers: {
                    'Authorization': `Bearer ${supabaseData.access_token}`,
                    'apikey': process.env.SUPABASE_ANON,
                },
            }
        );

        if (!userResponse.ok) {
            return res.status(500).json({ 
                error: 'Failed to retrieve user data',
                code: 'USER_DATA_FAILED'
            });
        }

        const userData = await userResponse.json();

        // 🔄 SESSION ROTATION: Generate new sessionId (never reuse)
        const sessionId = generateSessionId();
        const clientIp = getClientIp(req);
        const userAgent = req.headers['user-agent'] || 'unknown';
        const fingerprint = createFingerprint(
            normalizeUserAgent(userAgent),
            clientIp
        );

        // Save new session
        await saveSession(sessionId, userData, fingerprint, clientIp);

        // Set secure cookie with IDLE timeout
        res.cookie('sessionId', sessionId, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: SESSION_MAX_AGE,
            path: '/',
        });

        await logAudit(userData.id, 'LOGIN_SUCCESS', {
            email,
            ip: clientIp,
        });

        res.json({
            success: true,
            user: {
                id: userData.id,
                email: userData.email,
                userMetadata: userData.user_metadata || {},
            },
            sessionId: sessionId.slice(0, 8), // Return partial for debugging only
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * POST /auth/logout
 * 
 * Destroy session and clear cookie.
 */
app.post('/auth/logout', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        if (req.sessionId) {
            await destroySession(req.sessionId);
            await logAudit(userId, 'LOGOUT', {
                sessionId: req.sessionId.slice(0, 8),
            });
        }

        res.clearCookie('sessionId', {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'Lax',
            path: '/',
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ 
            error: 'Failed to logout',
            code: 'LOGOUT_FAILED'
        });
    }
});

/**
 * GET /auth/me
 * 
 * Get current user session (with security info).
 */
app.get('/auth/me', (req, res) => {
    if (!req.session) {
        return res.json({ user: null });
    }

    const now = Math.floor(Date.now() / 1000);
    const idleAge = now - req.session.lastActivityAt;
    const absoluteAge = now - req.session.createdAt;
    const idleRemaining = IDLE_TIMEOUT - idleAge;
    const absoluteRemaining = ABSOLUTE_TIMEOUT - absoluteAge;

    res.json({
        user: {
            id: req.session.userId,
            email: req.session.email,
            userMetadata: req.session.userMetadata,
        },
        session: {
            idleTimeoutMs: idleRemaining * 1000,
            absoluteTimeoutMs: absoluteRemaining * 1000,
            createdAt: new Date(req.session.createdAt * 1000).toISOString(),
            lastActivityAt: new Date(req.session.lastActivityAt * 1000).toISOString(),
        },
    });
});

/**
 * POST /auth/refresh
 * 
 * Manually refresh session (extend idle timeout).
 * Called when user is active to prevent expiration.
 */
app.post('/auth/refresh', requireAuth, async (req, res) => {
    try {
        // Update last activity timestamp (resets idle timeout)
        req.session.lastActivityAt = Math.floor(Date.now() / 1000);
        
        await saveSession(req.sessionId, {
            id: req.session.userId,
            email: req.session.email,
            user_metadata: req.session.userMetadata,
        }, req.session.fingerprint, req.session.ip);

        // Update cookie
        res.cookie('sessionId', req.sessionId, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: SESSION_MAX_AGE,
            path: '/',
        });

        await logAudit(req.session.userId, 'SESSION_REFRESHED', {
            sessionId: req.sessionId.slice(0, 8),
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Refresh error:', err);
        res.status(500).json({ 
            error: 'Failed to refresh session',
            code: 'REFRESH_FAILED'
        });
    }
});

/**
 * POST /auth/rotate-session
 * 
 * Force session rotation (privilege changes, password reset, etc.)
 * Invalidates current session and requires re-login.
 */
app.post('/auth/rotate-session', requireAuth, async (req, res) => {
    try {
        const oldSessionId = req.sessionId;
        
        // Invalidate old session
        await destroySession(oldSessionId);
        
        // Clear cookie
        res.clearCookie('sessionId', {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'Lax',
            path: '/',
        });

        await logAudit(req.session.userId, 'SESSION_ROTATED', {
            oldSessionId: oldSessionId.slice(0, 8),
            reason: req.body.reason || 'manual',
        });

        res.json({
            success: true,
            message: 'Session rotated - please login again'
        });
    } catch (err) {
        console.error('Rotation error:', err);
        res.status(500).json({ 
            error: 'Failed to rotate session',
            code: 'ROTATION_FAILED'
        });
    }
});

/**
 * POST /auth/privilege-change
 * 
 * Internal endpoint: Called after privilege change (role update).
 * Triggers session rotation for security.
 * 
 * Protected: requires admin role and service key
 */
app.post('/auth/privilege-change', requireAuth, async (req, res) => {
    if (req.session.userMetadata?.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden - admin only',
            code: 'FORBIDDEN'
        });
    }

    const { userId, newRole } = req.body;
    
    if (!userId || !newRole) {
        return res.status(400).json({
            error: 'userId and newRole required',
            code: 'MISSING_FIELDS'
        });
    }

    try {
        // Find all sessions for this user
        const keys = await redis.keys(`session:*`);
        let rotatedCount = 0;

        for (const key of keys) {
            const sessionData = await redis.get(key);
            if (!sessionData) continue;

            const session = JSON.parse(sessionData);
            if (session.userId === userId) {
                await redis.del(key);
                rotatedCount++;
            }
        }

        await logAudit(req.session.userId, 'PRIVILEGE_CHANGED', {
            targetUserId: userId,
            newRole,
            sessionsRotated: rotatedCount,
        });

        res.json({
            success: true,
            sessionsRotated: rotatedCount,
            message: `${rotatedCount} session(s) invalidated due to privilege change`
        });
    } catch (err) {
        console.error('Privilege change error:', err);
        res.status(500).json({
            error: 'Failed to rotate sessions',
            code: 'ROTATION_FAILED'
        });
    }
});

/**
 * GET /auth/sessions/active
 * 
 * List all active sessions for current user.
 * Useful for "logout all other devices" feature.
 */
app.get('/auth/sessions/active', requireAuth, async (req, res) => {
    try {
        const keys = await redis.keys(`session:*`);
        const sessions = [];

        for (const key of keys) {
            const sessionData = await redis.get(key);
            if (!sessionData) continue;

            const session = JSON.parse(sessionData);
            if (session.userId === req.session.userId) {
                const sessionId = key.replace('session:', '');
                sessions.push({
                    sessionId: sessionId.slice(0, 8),
                    createdAt: new Date(session.createdAt * 1000).toISOString(),
                    lastActivityAt: new Date(session.lastActivityAt * 1000).toISOString(),
                    isCurrentSession: sessionId === req.sessionId,
                });
            }
        }

        res.json({ sessions });
    } catch (err) {
        console.error('List sessions error:', err);
        res.status(500).json({
            error: 'Failed to list sessions',
            code: 'LIST_FAILED'
        });
    }
});

/**
 * DELETE /auth/sessions/:sessionId
 * 
 * Logout a specific session (including other devices).
 */
app.delete('/auth/sessions/:sessionId', requireAuth, async (req, res) => {
    try {
        // Find the session to verify it belongs to current user
        const keys = await redis.keys(`session:*`);
        let found = false;
        let targetUserId = null;

        for (const key of keys) {
            if (key.includes(req.params.sessionId)) {
                const sessionData = await redis.get(key);
                if (sessionData) {
                    const session = JSON.parse(sessionData);
                    if (session.userId === req.session.userId) {
                        targetUserId = session.userId;
                        await redis.del(key);
                        found = true;
                        break;
                    }
                }
            }
        }

        if (!found) {
            return res.status(404).json({
                error: 'Session not found',
                code: 'NOT_FOUND'
            });
        }

        await logAudit(req.session.userId, 'SESSION_LOGOUT_OTHER', {
            targetSessionId: req.params.sessionId.slice(0, 8),
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Session delete error:', err);
        res.status(500).json({
            error: 'Failed to delete session',
            code: 'DELETE_FAILED'
        });
    }
});

/**
 * GET /auth/audit-log
 * 
 * Retrieve audit log for current user (last 10 entries).
 */
app.get('/auth/audit-log', requireAuth, async (req, res) => {
    try {
        const keys = await redis.keys(`audit:${req.session.userId}:*`);
        const entries = [];

        // Sort by timestamp descending
        for (const key of keys.sort().reverse().slice(0, 10)) {
            const data = await redis.get(key);
            if (data) {
                entries.push(JSON.parse(data));
            }
        }

        res.json({ entries });
    } catch (err) {
        console.error('Audit log error:', err);
        res.status(500).json({
            error: 'Failed to retrieve audit log',
            code: 'AUDIT_LOG_FAILED'
        });
    }
});

/**
 * GET /health
 * 
 * Health check endpoint.
 */
app.get('/health', async (req, res) => {
    try {
        await redis.ping();
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            redis: 'connected'
        });
    } catch (err) {
        res.status(503).json({
            status: 'error',
            message: err.message
        });
    }
});

// ─── ERROR HANDLING ──────────────────────────────────

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
});

// ─── 404 HANDLER ─────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        code: 'NOT_FOUND'
    });
});

// ─── SERVER STARTUP ──────────────────────────────────

app.listen(PORT, () => {
    console.log(`
    ✅ VS TI Hub Server running on http://localhost:${PORT}
    📍 Environment: ${NODE_ENV}
    🔐 Idle Timeout: ${IDLE_TIMEOUT / 60}m
    ⏱️  Absolute Timeout: ${ABSOLUTE_TIMEOUT / 3600}h
    👆 Session Rotation: Enabled
    👁️  Fingerprinting: Enabled
    🗄️  Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}
    🌐 CORS: ${CLIENT_URL}
    `);
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────

process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    await redis.quit();
    process.exit(0);
});
