/**
 * server/index.js
 * Express backend with Redis-based session management
 *
 * Features:
 *  - Server-side sessions stored in Redis
 *  - Secure cookies with HttpOnly, Secure, SameSite=Lax flags
 *  - Stateless architecture (supports multiple servers)
 *  - Session expiration and cleanup
 *  - CORS configured for client communication
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
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE) || 86400000; // 24h in ms
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:8080';

if (!SESSION_SECRET) {
    console.error('❌ Error: SESSION_SECRET environment variable is not set.');
    console.error('   Set it in .env before starting the server.');
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
    origin: CLIENT_URL,
    credentials: true,
}));

// ─── SESSION UTILITIES ──────────────────────────────

/**
 * Generate a cryptographically secure session ID
 */
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash session ID with secret for verification
 */
function hashSessionId(sessionId) {
    return crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(sessionId)
        .digest('hex');
}

/**
 * Save session data to Redis with expiration
 */
async function saveSession(sessionId, userData) {
    const sessionData = {
        userId: userData.id,
        email: userData.email,
        userMetadata: userData.user_metadata || {},
        createdAt: new Date().toISOString(),
    };

    const key = `session:${sessionId}`;
    const ttl = Math.floor(SESSION_MAX_AGE / 1000); // convert ms to seconds

    await redis.setEx(key, ttl, JSON.stringify(sessionData));
}

/**
 * Retrieve session data from Redis
 */
async function getSession(sessionId) {
    const key = `session:${sessionId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
}

/**
 * Destroy a session in Redis
 */
async function destroySession(sessionId) {
    const key = `session:${sessionId}`;
    await redis.del(key);
}

// ─── MIDDLEWARE ─────────────────────────────────────

/**
 * Middleware to verify and load session from cookie
 */
async function authenticateSession(req, res, next) {
    const sessionId = req.cookies.sessionId;

    if (!sessionId) {
        return next();
    }

    try {
        const session = await getSession(sessionId);
        if (session) {
            req.session = session;
            req.sessionId = sessionId;
        }
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

// ─── ROUTES ─────────────────────────────────────────

/**
 * POST /auth/login
 * 
 * Authenticate user with Supabase and create a session.
 * 
 * Body:
 *   - email: string
 *   - password: string
 * 
 * Returns:
 *   - sessionId (set as HttpOnly cookie)
 *   - user data
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
        // Call Supabase Auth API
        // NOTE: This uses the Supabase REST API. Adjust if you have a different auth backend.
        const supabaseResponse = await fetch(
            `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': process.env.SUPABASE_ANON,
                },
                body: JSON.stringify({
                    email,
                    password,
                }),
            }
        );

        if (!supabaseResponse.ok) {
            const error = await supabaseResponse.json();
            return res.status(401).json({
                error: error.error_description || 'Invalid credentials',
                code: 'AUTH_FAILED'
            });
        }

        const supabaseData = await supabaseResponse.json();

        // Get user metadata from Supabase
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

        // Create session in Redis
        const sessionId = generateSessionId();
        await saveSession(sessionId, userData);

        // Set secure cookie with flags: HttpOnly, Secure, SameSite=Lax
        res.cookie('sessionId', sessionId, {
            httpOnly: true,        // Protects against XSS attacks
            secure: NODE_ENV === 'production', // Only sent over HTTPS in production
            sameSite: 'Lax',       // CSRF protection
            maxAge: SESSION_MAX_AGE, // 24 hours
            path: '/',
        });

        res.json({
            success: true,
            user: {
                id: userData.id,
                email: userData.email,
                userMetadata: userData.user_metadata || {},
            },
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
 * Destroy the session and clear the sessionId cookie.
 */
app.post('/auth/logout', requireAuth, async (req, res) => {
    try {
        if (req.sessionId) {
            await destroySession(req.sessionId);
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
 * Get current user session data.
 * Returns null if not authenticated.
 */
app.get('/auth/me', (req, res) => {
    if (!req.session) {
        return res.json({ user: null });
    }

    res.json({
        user: {
            id: req.session.userId,
            email: req.session.email,
            userMetadata: req.session.userMetadata,
        },
    });
});

/**
 * POST /auth/refresh
 * 
 * Extend the current session (update TTL in Redis).
 * Requires valid session.
 */
app.post('/auth/refresh', requireAuth, async (req, res) => {
    try {
        // Re-save session with fresh TTL
        const userData = {
            id: req.session.userId,
            email: req.session.email,
            user_metadata: req.session.userMetadata,
        };

        await saveSession(req.sessionId, userData);

        // Update cookie expiration
        res.cookie('sessionId', req.sessionId, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: SESSION_MAX_AGE,
            path: '/',
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
 * DELETE /auth/sessions/:sessionId (admin only)
 * 
 * Revoke a specific session (useful for admin logout of other users).
 */
app.delete('/auth/sessions/:sessionId', requireAuth, async (req, res) => {
    // Check if current user is admin
    if (req.session.userMetadata?.role !== 'admin') {
        return res.status(403).json({ 
            error: 'Forbidden - admin role required',
            code: 'FORBIDDEN'
        });
    }

    try {
        await destroySession(req.params.sessionId);
        res.json({ success: true });
    } catch (err) {
        console.error('Session revoke error:', err);
        res.status(500).json({ 
            error: 'Failed to revoke session',
            code: 'REVOKE_FAILED'
        });
    }
});

// ─── HEALTH CHECK ───────────────────────────────────

/**
 * GET /health
 * Health check endpoint for monitoring.
 */
app.get('/health', async (req, res) => {
    try {
        await redis.ping();
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'error', message: err.message });
    }
});

// ─── ERROR HANDLING ─────────────────────────────────

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
});

// ─── SERVER STARTUP ────────────────────────────────

app.listen(PORT, () => {
    console.log(`
    ✅ VS TI Hub Server running on http://localhost:${PORT}
    📍 Environment: ${NODE_ENV}
    🔐 Session TTL: ${SESSION_MAX_AGE / 1000 / 3600}h
    🗄️  Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}
    🌐 CORS: ${CLIENT_URL}
    `);
});

// ─── GRACEFUL SHUTDOWN ─────────────────────────────

process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    await redis.quit();
    process.exit(0);
});
