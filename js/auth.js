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
const LOGIN_MIN_PASSWORD_LENGTH = 8;

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
    showLoginScreen();

    try {
        const { data: { session }, error } = await _supabase.auth.getSession();

        if (error) {
            console.warn('Supabase getSession error:', error);
            showLoginError('Não foi possível verificar sessão. Atualize a página e tente novamente.');
            return;
        }

        if (session?.user) {
            await onSignedIn(session.user);
        }
    } catch (err) {
        console.error('Erro ao obter sessão:', err);
        showLoginError('Erro de conexão. Verifique sua internet e tente novamente.');
    }

    const { data: { subscription }, error: subError } = _supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state change:', event, session?.user?.id, session?.user?.user_metadata);

        if (session?.user) {
            await onSignedIn(session.user);
        } else {
            onSignedOut();
        }
    });

    if (subError) {
        console.warn('Supabase onAuthStateChange error:', subError);
    }

    // keep a reference so the listener can be unsubscribed if needed
    initAuth.subscription = subscription;
}

// ─── SIGN IN ──────────────────────────────────────────

function setLoginFieldsEnabled(enabled) {
    const loginElements = [
        document.getElementById('login-email'),
        document.getElementById('login-password'),
        document.getElementById('login-submit'),
    ];
    loginElements.forEach(el => { if (el) el.disabled = !enabled; });
}

async function handleLogin(e) {
    e?.preventDefault();

    const emailEl = document.getElementById('login-email');
    const passEl  = document.getElementById('login-password');
    const errEl   = document.getElementById('login-error');
    const btn     = document.getElementById('login-submit');

    const email = emailEl?.value.trim().toLowerCase() ?? '';
    const password = passEl?.value ?? '';

    errEl?.classList.remove('visible');

    if (!email || !password) {
        showLoginError('Preencha e-mail e senha.');
        return;
    }

    if (password.length < LOGIN_MIN_PASSWORD_LENGTH) {
        showLoginError(`A senha deve ter pelo menos ${LOGIN_MIN_PASSWORD_LENGTH} caracteres.`);
        return;
    }

    setLoginFieldsEnabled(false);
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Entrando...';

    try {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });

        if (error) {
            const lowerMsg = (error.message || '').toLowerCase();
            if (lowerMsg.includes('invalid login') || lowerMsg.includes('invalid email') || lowerMsg.includes('invalid password') || lowerMsg.includes('unauthorized')) {
                showLoginError('E-mail ou senha incorretos.');
            } else if (lowerMsg.includes('invalid input value') || lowerMsg.includes('invalid credentials')) {
                showLoginError('E-mail ou senha incorretos. Verifique e tente novamente.');
            } else if (lowerMsg.includes('email not confirmed') || lowerMsg.includes('unverified')) {
                showLoginError('E-mail não verificado. Confira seu e-mail para confirmação.');
            } else if (lowerMsg.includes('user is disabled') || lowerMsg.includes('account is blocked') || lowerMsg.includes('user is blocked') || lowerMsg.includes('banned')) {
                showLoginError('Conta inativa ou bloqueada. Contate o administrador.');
            } else if (lowerMsg.includes('password should be at least')) {
                showLoginError(`A senha deve ter pelo menos ${LOGIN_MIN_PASSWORD_LENGTH} caracteres.`);
            } else {
                showLoginError('Erro ao efetuar login. Verifique credenciais e tente novamente.');
            }
            console.warn('SignIn error:', error);
            return;
        }

        if (data?.user) {
            await onSignedIn(data.user);
            return;
        }

        showLoginError('Login efetuado, mas não foi possível obter dados do usuário. Recarregue a página.');
    } catch (err) {
        console.error('Erro no signInWithPassword:', err);
        showLoginError('Erro de conexão ao tentar fazer login. Tente novamente.');
    } finally {
        setLoginFieldsEnabled(true);
        if (btn) btn.innerHTML = '→ Entrar';
    }
}

// ─── SIGN OUT ─────────────────────────────────────────

async function handleLogout() {
    try {
        const { error } = await _supabase.auth.signOut();
        if (error) {
            console.warn('Erro no signOut:', error);
        }
    } catch (err) {
        console.error('Falha ao efetuar logout:', err);
    }
    onSignedOut();
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