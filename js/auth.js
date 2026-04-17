/**
 * auth.js
 *
 * Camada de autenticação do frontend.
 * Responsabilidades:
 * - Guard de sessão
 * - Login/logout
 * - Exposição do usuário atual para os demais módulos
 * - Renderização do widget do usuário na sidebar
 */

(function bootstrapAuthLayer() {
    'use strict';

    const MIN_PASSWORD_LENGTH = 8;
    let currentUser = null;
    let authSubscription = null;

    function getCurrentUser() {
        return currentUser;
    }

    function isAdmin() {
        return currentUser?.user_metadata?.role === 'admin';
    }

    function dispatchAuthChanged() {
        document.dispatchEvent(new CustomEvent('app:auth-changed', {
            detail: {
                user: currentUser,
                isAdmin: isAdmin(),
            },
        }));
    }

    async function initAuth() {
        showLoginScreen();

        try {
            const { data, error } = await _supabase.auth.getSession();
            if (error) {
                showLoginError('Não foi possível validar sua sessão. Faça login novamente.');
            } else if (data?.session?.user) {
                await onSignedIn(data.session.user);
            }
        } catch {
            showLoginError('Falha de conexão ao validar sessão.');
        }

        const { data, error } = _supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                await onSignedIn(session.user);
            } else {
                onSignedOut();
            }
        });

        if (!error) {
            authSubscription = data?.subscription || null;
        }
    }

    function setLoginBusy(isBusy) {
        const fields = [
            document.getElementById('login-email'),
            document.getElementById('login-password'),
            document.getElementById('login-submit'),
        ];

        fields.forEach((field) => {
            if (field) field.disabled = isBusy;
        });

        const submit = document.getElementById('login-submit');
        if (submit) {
            submit.innerHTML = isBusy
                ? '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Entrando...'
                : 'Entrar';
        }
    }

    function normalizeLoginError(message) {
        const lower = String(message || '').toLowerCase();

        if (lower.includes('invalid login') || lower.includes('invalid credentials') || lower.includes('invalid email') || lower.includes('invalid password')) {
            return 'E-mail ou senha incorretos.';
        }

        if (lower.includes('email not confirmed') || lower.includes('unverified')) {
            return 'E-mail ainda não verificado.';
        }

        if (lower.includes('user is disabled') || lower.includes('account is blocked') || lower.includes('banned')) {
            return 'Conta inativa ou bloqueada. Contate o administrador.';
        }

        return 'Não foi possível concluir o login. Tente novamente.';
    }

    async function handleLogin(event) {
        event?.preventDefault();

        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const email = emailInput?.value?.trim().toLowerCase() || '';
        const password = passwordInput?.value || '';

        hideLoginError();

        if (!email || !password) {
            showLoginError('Preencha e-mail e senha.');
            return;
        }

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            showLoginError('Informe um e-mail válido.');
            return;
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            showLoginError(`A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`);
            return;
        }

        setLoginBusy(true);

        try {
            const { data, error } = await _supabase.auth.signInWithPassword({ email, password });

            if (error) {
                showLoginError(normalizeLoginError(error.message));
                return;
            }

            if (!data?.user) {
                showLoginError('Sessão criada sem dados de usuário. Recarregue a página.');
                return;
            }

            await onSignedIn(data.user);
        } catch {
            showLoginError('Erro de rede durante o login.');
        } finally {
            setLoginBusy(false);
        }
    }

    async function handleLogout() {
        try {
            await _supabase.auth.signOut();
        } catch {
            // no-op: o fluxo abaixo garante reset local
        }

        onSignedOut();
    }

    async function onSignedIn(user) {
        currentUser = user;
        hideLoginScreen();
        showApp();
        renderUserWidget(user);
        showAdminNav(isAdmin());
        showDocumentationNav(true);
        dispatchAuthChanged();
    }

    function onSignedOut() {
        currentUser = null;
        hideApp();
        clearUserWidget();
        showAdminNav(false);
        showDocumentationNav(false);
        showLoginScreen();
        dispatchAuthChanged();
    }

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
        if (!screen) return;

        screen.style.animation = 'fadeOutAuth 0.18s ease forwards';
        setTimeout(() => {
            screen.remove();
        }, 180);
    }

    function getLandingGreeting() {
        const hour = new Date().getHours();
        if (hour >= 18) return 'Boa noite';
        if (hour >= 12) return 'Boa tarde';
        return 'Bom dia';
    }

    function buildLoginScreen() {
        const root = document.createElement('div');
        root.id = 'login-screen';
        const greeting = getLandingGreeting();

        root.innerHTML = `
            <div class="public-landing-grid">
                <section class="public-hero">
                    <span class="public-hero-pill">${escapeHtml(greeting)} • Plataforma pública</span>
                    <h1 class="public-hero-title">VS TI Hub</h1>
                    <p class="public-hero-subtitle">
                        Hub central para gestão de acessos, catálogo organizacional e operação diária de TI da VinilSul.
                    </p>

                    <div class="public-hero-actions">
                        <button type="button" class="public-hero-btn primary" id="public-focus-login">Entrar na plataforma</button>
                        <span class="public-hero-note">Acesso restrito por autenticação.</span>
                    </div>

                    <div class="public-feature-grid">
                        <article class="public-feature-card">
                            <strong>Onboarding completo</strong>
                            <span>Gerador de acessos padronizado e auditável.</span>
                        </article>
                        <article class="public-feature-card">
                            <strong>Controle de usuários</strong>
                            <span>Perfis ADM e comum com setor e cargo.</span>
                        </article>
                        <article class="public-feature-card">
                            <strong>Catálogo dinâmico</strong>
                            <span>Setores, cargos e filiais mantidos por CRUD.</span>
                        </article>
                    </div>
                </section>

                <div class="login-card public-login-card">
                    <div class="login-logo">
                        <img src="https://yt3.googleusercontent.com/TY_CfaW7OV4aqGfiUZP56C_5GTpUcc10Rmyud2qkF9L1ojYiTADJmuQfXnUURvrKDx364quSbjU=s900-c-k-c0x00ffffff-no-rj" alt="VS">
                        <div class="login-logo-text">
                            <strong>VS TI Hub</strong>
                            <span>VinilSul Sistemas</span>
                        </div>
                    </div>

                    <div class="login-title">Acesso ao sistema</div>
                    <div class="login-subtitle">Entre com sua conta corporativa</div>

                    <form id="login-form" novalidate>
                        <div class="login-field">
                            <label for="login-email">E-mail</label>
                            <input type="email" id="login-email" placeholder="nome@vinilsul.com.br" autocomplete="email" required>
                        </div>

                        <div class="login-field">
                            <label for="login-password">Senha</label>
                            <input type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" required>
                        </div>

                        <button type="submit" class="login-btn" id="login-submit">Entrar</button>
                        <div class="login-error" id="login-error"></div>
                    </form>
                </div>
            </div>
        `;

        root.querySelector('#login-form')?.addEventListener('submit', handleLogin);
        root.querySelector('#public-focus-login')?.addEventListener('click', () => {
            root.querySelector('#login-email')?.focus();
        });
        ensureAuthAnimation();

        return root;
    }

    function ensureAuthAnimation() {
        if (document.getElementById('auth-keyframes')) return;

        const style = document.createElement('style');
        style.id = 'auth-keyframes';
        style.textContent = '@keyframes fadeOutAuth { to { opacity: 0; transform: translateY(6px) scale(0.98); } }';
        document.head.appendChild(style);
    }

    function showLoginError(message) {
        const errorEl = document.getElementById('login-error');
        if (!errorEl) return;

        errorEl.textContent = message;
        errorEl.classList.add('visible');
    }

    function hideLoginError() {
        const errorEl = document.getElementById('login-error');
        if (!errorEl) return;

        errorEl.textContent = '';
        errorEl.classList.remove('visible');
    }

    function showApp() {
        document.querySelector('.sidebar')?.removeAttribute('style');
        document.querySelector('.main')?.removeAttribute('style');
        document.querySelector('.mobile-toggle')?.removeAttribute('style');
    }

    function hideApp() {
        const hide = (element) => {
            if (element) element.style.display = 'none';
        };

        hide(document.querySelector('.sidebar'));
        hide(document.querySelector('.main'));
        hide(document.querySelector('.mobile-toggle'));
    }

    function renderUserWidget(user) {
        clearUserWidget();

        const displayName = user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário';
        const initials = displayName
            .split(' ')
            .filter(Boolean)
            .map((word) => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
        const rawType = String(user.user_metadata?.type || user.user_metadata?.role || '').toLowerCase();
        const roleLabel = ['adm', 'admin', 'administrador'].includes(rawType) ? 'ADM' : 'Usuário comum';
        const setor = user.user_metadata?.setor ? ` • ${user.user_metadata.setor}` : '';
        const userManagementButton = isAdmin()
            ? '<button class="logout-btn" id="sidebar-user-management" title="Gestão de usuários">👥</button>'
            : '';

        const widget = document.createElement('div');
        widget.id = 'sidebar-user-widget';
        widget.className = 'sidebar-user';
        widget.innerHTML = `
            <div class="user-avatar">${escapeHtml(initials)}</div>
            <div class="user-info">
                <div class="user-name">${escapeHtml(displayName)}</div>
                <div class="user-role">${escapeHtml(roleLabel + setor)}</div>
            </div>
            <button class="logout-btn" id="sidebar-change-password" title="Redefinir senha">🔑</button>
            ${userManagementButton}
            <button class="logout-btn" id="sidebar-logout" title="Sair">⏻</button>
        `;

        widget.querySelector('#sidebar-change-password')?.addEventListener('click', abrirTrocaSenhaPropria);
        widget.querySelector('#sidebar-user-management')?.addEventListener('click', abrirGestaoUsuarios);
        widget.querySelector('#sidebar-logout')?.addEventListener('click', handleLogout);

        document.querySelector('.sidebar-logo')?.insertAdjacentElement('afterend', widget);
    }

    function clearUserWidget() {
        document.getElementById('sidebar-user-widget')?.remove();
    }

    function showAdminNav(visible) {
        ['nav-usuarios', 'nav-cadastros', 'nav-colaboradores'].forEach((id) => {
            const adminNav = document.getElementById(id);
            if (adminNav) {
                adminNav.style.display = visible ? '' : 'none';
            }
        });
    }

    function showDocumentationNav(visible) {
        const docsNav = document.getElementById('nav-documentacao');
        if (docsNav) {
            docsNav.style.display = visible ? '' : 'none';
        }
    }

    function abrirTrocaSenhaPropria() {
        const user = getCurrentUser();
        if (!user) return;

        const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário';
        if (typeof window.abrirTrocaSenha === 'function') {
            window.abrirTrocaSenha(user.id, name, true);
        }
    }

    function abrirGestaoUsuarios() {
        if (!isAdmin()) return;

        const navButton = document.querySelector('.nav-item[data-nav="usuarios"]');
        if (typeof window.navTo === 'function') {
            window.navTo('usuarios', navButton || null);
            return;
        }

        navButton?.click();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    window.getCurrentUser = getCurrentUser;
    window.isAdmin = isAdmin;
    window.handleLogin = handleLogin;
    window.handleLogout = handleLogout;
    window.abrirTrocaSenhaPropria = abrirTrocaSenhaPropria;

    document.addEventListener('DOMContentLoaded', initAuth);
    window.addEventListener('beforeunload', () => {
        authSubscription?.unsubscribe?.();
    });
})();
