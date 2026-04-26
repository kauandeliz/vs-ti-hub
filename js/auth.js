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
    const USER_AVATAR_PLACEHOLDER = 'assets/images/user-placeholder.svg';
    const INACTIVITY_TIMEOUT_MS = 40 * 60 * 1000;
    const INACTIVITY_ACTIVITY_THROTTLE_MS = 5000;
    const INACTIVITY_LOGOUT_MESSAGE = 'Sessão encerrada por inatividade após 40 minutos.';

    let currentUser = null;
    let authSubscription = null;
    let inactivityTimer = null;
    let lastActivityAt = 0;
    let inactivityListenersBound = false;
    let pendingSignOutReason = null;

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

    function bindInactivityListeners() {
        if (inactivityListenersBound) return;

        const passiveOpts = { passive: true };
        window.addEventListener('pointerdown', handleUserActivity, passiveOpts);
        window.addEventListener('mousemove', handleUserActivity, passiveOpts);
        window.addEventListener('keydown', handleUserActivity);
        window.addEventListener('scroll', handleUserActivity, passiveOpts);
        window.addEventListener('touchstart', handleUserActivity, passiveOpts);
        window.addEventListener('focus', handleUserActivity);
        document.addEventListener('visibilitychange', handleUserActivity);
        inactivityListenersBound = true;
    }

    function startInactivityMonitor({ reset = false } = {}) {
        bindInactivityListeners();
        if (reset || !lastActivityAt) {
            lastActivityAt = Date.now();
        }
        scheduleInactivityLogout();
    }

    function stopInactivityMonitor() {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
        lastActivityAt = 0;
    }

    function scheduleInactivityLogout() {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }

        if (!currentUser) return;

        const elapsedMs = Date.now() - lastActivityAt;
        const remainingMs = INACTIVITY_TIMEOUT_MS - elapsedMs;

        if (remainingMs <= 0) {
            void handleInactivityTimeout();
            return;
        }

        inactivityTimer = setTimeout(() => {
            void handleInactivityTimeout();
        }, remainingMs);
    }

    function handleUserActivity(event) {
        if (!currentUser) return;

        if (event?.type === 'visibilitychange' && document.visibilityState !== 'visible') {
            return;
        }

        const now = Date.now();
        if (now - lastActivityAt < INACTIVITY_ACTIVITY_THROTTLE_MS) {
            return;
        }

        lastActivityAt = now;
        scheduleInactivityLogout();
    }

    async function handleInactivityTimeout() {
        if (!currentUser) return;
        await handleLogout({ reason: 'inactivity' });
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

        const { data, error } = _supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                await onSignedIn(session.user);
            } else {
                onSignedOut(pendingSignOutReason || event || 'auth-state');
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

    async function handleLogout(options = {}) {
        const reason = typeof options?.reason === 'string' && options.reason
            ? options.reason
            : 'manual';
        pendingSignOutReason = reason;

        try {
            await _supabase.auth.signOut();
        } catch {
            // no-op: o fluxo abaixo garante reset local
        }

        onSignedOut(reason);
    }

    async function onSignedIn(user) {
        const previousUserId = currentUser?.id || '';
        const isSameUser = previousUserId && previousUserId === user?.id;

        currentUser = user;
        pendingSignOutReason = null;
        hideLoginScreen();
        showApp();
        renderUserWidget(user);
        showAdminNav(isAdmin());
        startInactivityMonitor({ reset: !isSameUser });
        dispatchAuthChanged();
    }

    function onSignedOut(reason = 'manual') {
        const effectiveReason = pendingSignOutReason || reason || 'manual';
        pendingSignOutReason = null;
        currentUser = null;
        stopInactivityMonitor();
        hideApp();
        clearUserWidget();
        showAdminNav(false);
        showLoginScreen();
        if (effectiveReason === 'inactivity') {
            showLoginError(INACTIVITY_LOGOUT_MESSAGE);
        }
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
                        <img src="assets/images/vs-logo.svg" alt="VS">
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
        const avatarUrl = resolveUserAvatarUrl(user.user_metadata || {});
        const avatarInnerMarkup = avatarUrl
            ? `<div class="user-avatar user-avatar-image"><img src="${escapeHtmlAttribute(avatarUrl)}" alt="Foto de perfil" loading="lazy" onerror="this.onerror=null;this.src='${USER_AVATAR_PLACEHOLDER}';"></div>`
            : `<div class="user-avatar">${escapeHtml(initials)}</div>`;
        const avatarMarkup = `
            <button class="user-avatar-trigger" id="sidebar-avatar-trigger" title="Alterar foto de perfil" aria-label="Alterar foto de perfil">
                ${avatarInnerMarkup}
            </button>
        `;
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
            ${avatarMarkup}
            <div class="user-info">
                <div class="user-name">${escapeHtml(displayName)}</div>
                <div class="user-role">${escapeHtml(roleLabel + setor)}</div>
            </div>
            <button class="logout-btn" id="sidebar-change-password" title="Redefinir senha">🔑</button>
            ${userManagementButton}
            <button class="logout-btn" id="sidebar-logout" title="Sair">⏻</button>
        `;

        widget.querySelector('#sidebar-change-password')?.addEventListener('click', abrirTrocaSenhaPropria);
        widget.querySelector('#sidebar-avatar-trigger')?.addEventListener('click', abrirModalFotoPerfil);
        widget.querySelector('#sidebar-user-management')?.addEventListener('click', abrirGestaoUsuarios);
        widget.querySelector('#sidebar-logout')?.addEventListener('click', handleLogout);

        document.querySelector('.sidebar-logo')?.insertAdjacentElement('afterend', widget);
    }

    function clearUserWidget() {
        document.getElementById('sidebar-user-widget')?.remove();
    }

    function showAdminNav(visible) {
        ['nav-colaboradores'].forEach((id) => {
            const adminNav = document.getElementById(id);
            if (adminNav) {
                adminNav.style.display = visible ? '' : 'none';
            }
        });
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

    function abrirModalFotoPerfil() {
        const user = getCurrentUser();
        if (!user) return;

        document.getElementById('profile-avatar-modal')?.remove();

        const avatar = resolveUserAvatarData(user.user_metadata || {});
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.id = 'profile-avatar-modal';
        modal.dataset.currentAvatarPath = avatar.path || '';
        modal.dataset.currentAvatarUrl = avatar.url || '';

        modal.innerHTML = `
            <div class="modal" style="max-width:460px" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Foto de perfil</h3>
                    <button class="modal-close" data-action="close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Selecionar nova foto</label>
                        <input type="file" id="profile-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:0.74rem;min-height:34px;padding:6px 8px;outline:none;">
                        <div style="margin-top:6px;font-size:0.64rem;color:var(--text-muted)">Formatos aceitos: PNG, JPG, WEBP, GIF ou SVG (máx. 3 MB).</div>
                    </div>
                    <div id="profile-avatar-preview" style="display:flex;margin-top:8px;align-items:center;gap:10px">
                        <img id="profile-avatar-preview-img" src="${escapeHtmlAttribute(avatar.url || USER_AVATAR_PLACEHOLDER)}" alt="Preview da foto" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:1px solid var(--border)">
                        <span id="profile-avatar-preview-name" style="font-size:0.68rem;color:var(--text-soft)">${escapeHtml(avatar.url ? 'Foto atual' : 'Sem foto cadastrada')}</span>
                    </div>
                    <label class="cad-checkbox" style="margin-top:10px;margin-bottom:0">
                        <input type="checkbox" id="profile-avatar-remove"${avatar.url ? '' : ' disabled'}>
                        <span>Remover foto atual</span>
                    </label>
                    <div class="error-msg" id="profile-avatar-error" style="margin-top:8px"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-row" data-action="close">Cancelar</button>
                    <button class="btn-row primary" data-action="save-avatar">Salvar foto</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });
        modal.querySelectorAll('[data-action="close"]').forEach((button) => {
            button.addEventListener('click', close);
        });

        modal.querySelector('#profile-avatar-file')?.addEventListener('change', () => {
            syncProfileAvatarPreview(modal);
        });
        modal.querySelector('#profile-avatar-remove')?.addEventListener('change', () => {
            syncProfileAvatarPreview(modal);
        });

        modal.querySelector('[data-action="save-avatar"]')?.addEventListener('click', async () => {
            await salvarFotoPerfil(modal);
        });

        setTimeout(() => {
            modal.querySelector('#profile-avatar-file')?.focus();
        }, 60);
    }

    function resolveUserAvatarData(metadata) {
        const directPath = String(metadata?.avatar_path || '').trim();
        const url = resolveUserAvatarUrl(metadata);
        const pathFromUrl = directPath ? '' : extractStoragePathFromPublicUrl(url);
        const path = directPath || pathFromUrl;
        return { path, url };
    }

    function extractStoragePathFromPublicUrl(url) {
        const trustedUrl = getTrustedAvatarUrl(url);
        if (!trustedUrl) return '';

        const baseUrl = String(window.App?.config?.supabaseUrl || window.SUPABASE_URL || '').replace(/\/+$/, '');
        if (!baseUrl) return '';
        const prefix = `${baseUrl}/storage/v1/object/public/app-imagens/`;
        if (!trustedUrl.startsWith(prefix)) return '';

        const encodedPath = trustedUrl.slice(prefix.length);
        if (!encodedPath) return '';

        return encodedPath
            .split('/')
            .map((segment) => {
                try {
                    return decodeURIComponent(segment);
                } catch {
                    return segment;
                }
            })
            .join('/');
    }

    function syncProfileAvatarPreview(modal) {
        if (!modal) return;

        const previewImg = modal.querySelector('#profile-avatar-preview-img');
        const previewName = modal.querySelector('#profile-avatar-preview-name');
        const fileInput = modal.querySelector('#profile-avatar-file');
        const removeToggle = modal.querySelector('#profile-avatar-remove');
        if (!previewImg || !previewName || !fileInput) return;

        const file = fileInput.files?.[0] || null;
        const shouldRemove = Boolean(removeToggle?.checked);
        const currentAvatarUrl = String(modal.dataset.currentAvatarUrl || '');

        if (shouldRemove) {
            previewImg.src = USER_AVATAR_PLACEHOLDER;
            previewName.textContent = 'Foto será removida';
            return;
        }

        if (file) {
            previewImg.src = URL.createObjectURL(file);
            previewName.textContent = `${file.name} (${formatBytes(file.size)})`;
            return;
        }

        if (currentAvatarUrl) {
            previewImg.src = currentAvatarUrl;
            previewName.textContent = 'Foto atual';
            return;
        }

        previewImg.src = USER_AVATAR_PLACEHOLDER;
        previewName.textContent = 'Sem foto cadastrada';
    }

    async function salvarFotoPerfil(modal) {
        const errorBox = modal.querySelector('#profile-avatar-error');
        hideErrorMessage(errorBox);

        const profileApi = window.App?.api?.profile;
        if (!profileApi) {
            showErrorMessage(errorBox, 'API de perfil indisponível.');
            return;
        }

        const saveButton = modal.querySelector('[data-action="save-avatar"]');
        const fileInput = modal.querySelector('#profile-avatar-file');
        const removeToggle = modal.querySelector('#profile-avatar-remove');
        const removeAvatar = Boolean(removeToggle?.checked);
        const currentAvatarPath = String(modal.dataset.currentAvatarPath || '');
        const currentAvatarUrl = String(modal.dataset.currentAvatarUrl || '');

        let avatarPath = currentAvatarPath;
        let avatarUrl = currentAvatarUrl;
        let uploadedAvatarPath = '';
        let uploadedAvatarUrl = '';

        if (removeAvatar) {
            avatarPath = '';
            avatarUrl = '';
        }

        const avatarFile = fileInput?.files?.[0] || null;
        if (avatarFile && !removeAvatar) {
            const uploadResult = await profileApi.uploadAvatar(avatarFile);
            if (uploadResult.error) {
                showErrorMessage(errorBox, uploadResult.error.message);
                return;
            }

            uploadedAvatarPath = String(uploadResult.data?.path || '');
            uploadedAvatarUrl = String(uploadResult.data?.url || '');
            avatarPath = uploadedAvatarPath;
            avatarUrl = uploadedAvatarUrl;
        }

        setButtonBusy(saveButton, true, 'Salvando...');
        const { error } = await profileApi.updateOwnAvatar({
            avatarPath,
            avatarUrl,
            removeAvatar,
        });
        setButtonBusy(saveButton, false, 'Salvar foto');

        if (error) {
            if (uploadedAvatarPath) {
                await profileApi.removeAvatar(uploadedAvatarPath);
            }
            showErrorMessage(errorBox, error.message);
            return;
        }

        if (currentAvatarPath && isStoragePath(currentAvatarPath)) {
            const avatarChanged = removeAvatar || (uploadedAvatarPath && uploadedAvatarPath !== currentAvatarPath);
            if (avatarChanged) {
                await profileApi.removeAvatar(currentAvatarPath);
            }
        }

        modal.remove();
        await refreshCurrentUserFromSession();
        showToast('Foto de perfil atualizada com sucesso.', 'success');
    }

    async function refreshCurrentUserFromSession() {
        try {
            const { data, error } = await _supabase.auth.getUser();
            if (error || !data?.user) return false;
            await onSignedIn(data.user);
            return true;
        } catch {
            return false;
        }
    }

    function setButtonBusy(button, busy, busyLabel) {
        if (!button) return;
        button.disabled = Boolean(busy);
        button.textContent = busy ? String(busyLabel || 'Processando...') : 'Salvar foto';
    }

    function showErrorMessage(element, message) {
        if (!element) return;
        element.textContent = String(message || '');
        element.style.display = 'block';
    }

    function hideErrorMessage(element) {
        if (!element) return;
        element.textContent = '';
        element.style.display = 'none';
    }

    function showToast(message, type = 'success') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }

        if (type === 'error') {
            console.error(message);
        } else {
            console.log(message);
        }
    }

    function formatBytes(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value <= 0) return '0 KB';
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeHtmlAttribute(value) {
        return escapeHtml(value).replace(/\n/g, '&#10;');
    }

    function getTrustedAvatarUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';

        const baseUrl = String(window.App?.config?.supabaseUrl || window.SUPABASE_URL || '').replace(/\/+$/, '');
        if (!baseUrl) return '';

        const prefix = `${baseUrl}/storage/v1/object/public/app-imagens/`;
        if (!raw.startsWith(prefix)) return '';
        return raw;
    }

    function resolveUserAvatarUrl(metadata) {
        const trustedUrl = getTrustedAvatarUrl(metadata?.avatar_url);
        if (trustedUrl) return trustedUrl;

        const path = String(metadata?.avatar_path || '').trim();
        if (!isStoragePath(path)) return '';
        return buildPublicAvatarUrl(path);
    }

    function isStoragePath(value) {
        const raw = String(value || '').trim();
        if (!raw) return false;
        if (/^https?:\/\//i.test(raw)) return false;
        if (raw.startsWith('data:')) return false;
        if (raw.startsWith('blob:')) return false;
        return true;
    }

    function buildPublicAvatarUrl(path) {
        const baseUrl = String(window.App?.config?.supabaseUrl || window.SUPABASE_URL || '').replace(/\/+$/, '');
        const cleanPath = String(path || '').trim();
        if (!baseUrl || !cleanPath) return '';

        const encodedPath = cleanPath
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/');

        return `${baseUrl}/storage/v1/object/public/app-imagens/${encodedPath}`;
    }

    window.getCurrentUser = getCurrentUser;
    window.isAdmin = isAdmin;
    window.handleLogin = handleLogin;
    window.handleLogout = handleLogout;
    window.abrirTrocaSenhaPropria = abrirTrocaSenhaPropria;

    document.addEventListener('DOMContentLoaded', initAuth);
    window.addEventListener('beforeunload', () => {
        stopInactivityMonitor();
        authSubscription?.unsubscribe?.();
    });
})();
