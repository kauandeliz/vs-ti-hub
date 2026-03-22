/**
 * auth.js
 * Authentication layer for VS TI Hub.
 *
 * Responsibilities:
 *  - Show login screen before the app loads
 *  - Handle sign-in / sign-out
 *  - Maintain session state and expose the current user
 *  - Inject user widget into the sidebar
 *  - Guard: hide the app until a valid session exists
 *  - Handle invite flow: show set-password screen for new users
 *
 * Depends on: supabase.js (must load first)
 */

// ─── STATE ───────────────────────────────────────────
let _currentUser = null;

/** Returns the currently authenticated user object, or null. */
function getCurrentUser() { return _currentUser; }

/** Returns true if the logged-in user is an admin. */
function isAdmin() {
    return _currentUser?.user_metadata?.role === 'admin';
}

// ─── BOOTSTRAP ───────────────────────────────────────

/**
 * Called once on DOMContentLoaded.
 * Checks for an existing session; shows login screen if none.
 */
async function initAuth() {
    // Show the login screen immediately (hidden via CSS when app loads)
    showLoginScreen();

    // Check for existing session (e.g. user refreshed the page)
    const { data: { session } } = await _supabase.auth.getSession();

    if (session?.user) {
        await onSignedIn(session.user);
    }

    // Listen for auth state changes (sign in / sign out)
    _supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state change:', event, session?.user?.id, session?.user?.user_metadata);
        
        if (session?.user) {
            await onSignedIn(session.user);
        } else {
            onSignedOut();
        }
    });
}

// ─── SIGN IN ──────────────────────────────────────────

async function handleLogin(e) {
    e?.preventDefault();

    const emailEl = document.getElementById('login-email');
    const passEl  = document.getElementById('login-password');
    const errEl   = document.getElementById('login-error');
    const btn     = document.getElementById('login-submit');

    const email    = emailEl?.value.trim() ?? '';
    const password = passEl?.value ?? '';

    errEl?.classList.remove('visible');

    if (!email || !password) {
        showLoginError('Preencha e-mail e senha.');
        return;
    }

    // Loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Entrando...';

    const { error } = await _supabase.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.innerHTML = '→ Entrar';

    if (error) {
        showLoginError(
            error.message.includes('Invalid login')
                ? 'E-mail ou senha incorretos.'
                : error.message
        );
    }
    // Success is handled by onAuthStateChange → onSignedIn
}

// ─── SIGN OUT ─────────────────────────────────────────

async function handleLogout() {
    await _supabase.auth.signOut();
    // onAuthStateChange will call onSignedOut()
}

// ─── SESSION HANDLERS ─────────────────────────────────

async function onSignedIn(user) {
    _currentUser = user;
    hideLoginScreen();
    renderUserWidget(user);
    showAdminNav(isAdmin());
}

function onSignedOut() {
    _currentUser = null;
    hideApp();
    showLoginScreen();
    clearUserWidget();
    showAdminNav(false);
}

// ─── LOGIN SCREEN DOM ─────────────────────────────────

function showLoginScreen() {
    let screen = document.getElementById('login-screen');
    if (!screen) {
        screen = buildLoginScreen();
        document.body.appendChild(screen);
    }
    screen.style.display = 'flex';
    hideApp();
}

function hideLoginScreen() {
    const screen = document.getElementById('login-screen');
    if (screen) {
        screen.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => screen.remove(), 200);
    }
    showApp();
}

function buildLoginScreen() {
    const div = document.createElement('div');
    div.id = 'login-screen';
    div.innerHTML = `
        <div class="login-card">
            <div class="login-logo">
                <img src="https://yt3.googleusercontent.com/TY_CfaW7OV4aqGfiUZP56C_5GTpUcc10Rmyud2qkF9L1ojYiTADJmuQfXnUURvrKDx364quSbjU=s900-c-k-c0x00ffffff-no-rj" alt="VS">
                <div class="login-logo-text">
                    <strong>VS TI Hub</strong>
                    <span>VinilSul Sistemas</span>
                </div>
            </div>
            <div class="login-title">Bem-vindo de volta</div>
            <div class="login-subtitle">Faça login para acessar o sistema</div>
            <form id="login-form" onsubmit="handleLogin(event)">
                <div class="login-field">
                    <label>E-mail</label>
                    <input type="email" id="login-email" placeholder="seu@email.com" autocomplete="email" required>
                </div>
                <div class="login-field">
                    <label>Senha</label>
                    <input type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" required>
                </div>
                <button type="submit" class="login-btn" id="login-submit">→ Entrar</button>
                <div class="login-error" id="login-error"></div>
            </form>
        </div>`;

    // Add fadeOut keyframe if not present
    if (!document.getElementById('auth-keyframes')) {
        const style = document.createElement('style');
        style.id = 'auth-keyframes';
        style.textContent = `@keyframes fadeOut { to { opacity: 0; transform: scale(0.97); } }`;
        document.head.appendChild(style);
    }

    return div;
}

function showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (el) { el.textContent = msg; el.classList.add('visible'); }
}

// ─── APP VISIBILITY ───────────────────────────────────

function showApp() {
    document.querySelector('.sidebar')?.removeAttribute('style');
    document.querySelector('.main')?.removeAttribute('style');
    document.querySelector('.mobile-toggle')?.removeAttribute('style');
}

function hideApp() {
    const hide = el => el && (el.style.display = 'none');
    hide(document.querySelector('.sidebar'));
    hide(document.querySelector('.main'));
    hide(document.querySelector('.mobile-toggle'));
}

// ─── USER WIDGET ──────────────────────────────────────

function renderUserWidget(user) {
    clearUserWidget();

    const name     = user.user_metadata?.name || user.email.split('@')[0];
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const role     = user.user_metadata?.role ?? 'operador';

    const widget = document.createElement('div');
    widget.id = 'sidebar-user-widget';
    widget.className = 'sidebar-user';
    widget.innerHTML = `
        <div class="user-avatar">${initials}</div>
        <div class="user-info">
            <div class="user-name">${escapeHtmlAuth(name)}</div>
            <div class="user-role">${role}</div>
        </div>
        <button class="logout-btn" onclick="abrirTrocaSenhaPropria()" title="Alterar senha" style="margin-right:2px">🔑</button>
        <button class="logout-btn" onclick="handleLogout()" title="Sair">⏻</button>`;

    // Insert after logo
    const logo = document.querySelector('.sidebar-logo');
    logo?.insertAdjacentElement('afterend', widget);
}

function clearUserWidget() {
    document.getElementById('sidebar-user-widget')?.remove();
}

// ─── ADMIN NAV VISIBILITY ─────────────────────────────

function showAdminNav(show) {
    const item = document.getElementById('nav-usuarios');
    if (item) item.style.display = show ? '' : 'none';
}

// ─── HELPERS ──────────────────────────────────────────

/** Shortcut called from the sidebar 🔑 button — opens the change-password modal for self. */
function abrirTrocaSenhaPropria() {
    const user = getCurrentUser();
    if (!user) return;
    const name = user.user_metadata?.name || user.email.split('@')[0];
    // abrirTrocaSenha is defined in usuarios.js
    if (typeof abrirTrocaSenha === 'function') {
        abrirTrocaSenha(user.id, name, true);
    }
}

function escapeHtmlAuth(str) {
    return String(str ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── INIT ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initAuth);