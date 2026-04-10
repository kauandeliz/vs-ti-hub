/**
 * usuarios.js
 *
 * Administração de usuários (somente admin).
 */

(function bootstrapUsuarios() {
    'use strict';

    const MIN_PASSWORD_LENGTH = 8;
    const state = {
        users: [],
        inviteCatalog: null,
        initialized: false,
    };

    function initUsuarios() {
        if (state.initialized) return;

        document.getElementById('new-user-form')?.addEventListener('submit', handleCreateUser);
        document.getElementById('usuarios-tbody')?.addEventListener('click', handleTableActionClick);
        document.getElementById('usuarios-refresh-btn')?.addEventListener('click', loadUsuarios);
        document.getElementById('new-user-setor')?.addEventListener('change', handleInviteSetorChange);

        document.addEventListener('app:auth-changed', (event) => {
            if (!event.detail?.isAdmin) {
                renderUsuariosEmpty('Acesso restrito a administradores.');
                clearInviteSelects();
            }
        });

        document.addEventListener('app:catalog-updated', () => {
            if (isAdmin()) {
                loadInviteCatalog(true);
            }
        });

        state.initialized = true;
    }

    async function onUsuariosActivate() {
        if (!isAdmin()) {
            renderUsuariosEmpty('Acesso restrito a administradores.');
            return;
        }

        await loadInviteCatalog(false);
        await loadUsuarios();
    }

    async function loadUsuarios() {
        if (!isAdmin()) {
            renderUsuariosEmpty('Acesso restrito a administradores.');
            return;
        }

        renderUsuariosLoading();

        const [usersRes] = await Promise.all([
            window.App.api.admin.listUsers(),
            loadInviteCatalog(false),
        ]);

        const { data, error } = usersRes;
        if (error) {
            renderUsuariosError(error.message);
            return;
        }

        state.users = data || [];
        renderUsuariosTable(state.users);
    }

    async function handleCreateUser(event) {
        event.preventDefault();

        const nameInput = document.getElementById('new-user-name');
        const emailInput = document.getElementById('new-user-email');
        const typeInput = document.getElementById('new-user-type');
        const setorInput = document.getElementById('new-user-setor');
        const cargoInput = document.getElementById('new-user-cargo');
        const passwordInput = document.getElementById('new-user-password');
        const button = document.getElementById('new-user-btn');
        const errorBox = document.getElementById('new-user-error');
        const successBox = document.getElementById('new-user-ok');

        hideMessage(errorBox);
        hideMessage(successBox);

        const name = nameInput?.value?.trim() || '';
        const email = emailInput?.value?.trim().toLowerCase() || '';
        const type = typeInput?.value || '';
        const setor = setorInput?.value || '';
        const cargo = cargoInput?.value || '';
        const password = passwordInput?.value || '';

        const validation = validateInviteInput({ name, email, type, setor, cargo, password });
        if (validation) {
            showMessage(errorBox, validation);
            return;
        }

        setInviteBusy(button, true);

        const { error } = await window.App.api.admin.inviteUser({
            name,
            email,
            password,
            type,
            setor,
            cargo,
        });

        setInviteBusy(button, false);

        if (error) {
            showMessage(errorBox, error.message);
            return;
        }

        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        if (typeInput) typeInput.value = 'comum';
        if (setorInput) setorInput.value = '';
        resetInviteCargoSelect('Setor primeiro');
        if (passwordInput) passwordInput.value = '';

        showMessage(successBox, `Usuário ${name} criado com sucesso.`);
        await loadUsuarios();
    }

    function validateInviteInput({ name, email, type, setor, cargo, password }) {
        if (!name || !email || !type || !setor || !cargo || !password) {
            return 'Preencha nome, tipo, setor, cargo, e-mail e senha.';
        }

        if (name.split(/\s+/).length < 2) {
            return 'Informe nome e sobrenome.';
        }

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return 'E-mail inválido.';
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            return `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
        }

        if (!['adm', 'comum'].includes(type)) {
            return 'Tipo inválido. Use adm ou usuário comum.';
        }

        return null;
    }

    function setInviteBusy(button, busy) {
        if (!button) return;

        button.disabled = busy;
        button.textContent = busy ? 'Criando...' : 'Criar usuário';
    }

    function clearInviteSelects() {
        const setorSelect = document.getElementById('new-user-setor');
        const cargoSelect = document.getElementById('new-user-cargo');

        if (setorSelect) {
            setorSelect.innerHTML = '<option value=\"\" selected disabled>Selecione...</option>';
        }

        if (cargoSelect) {
            cargoSelect.innerHTML = '<option value=\"\" selected disabled>Setor primeiro</option>';
            cargoSelect.disabled = true;
        }
    }

    function resetInviteCargoSelect(placeholder = 'Setor primeiro') {
        const cargoSelect = document.getElementById('new-user-cargo');
        if (!cargoSelect) return;

        cargoSelect.innerHTML = `<option value=\"\" selected disabled>${placeholder}</option>`;
        cargoSelect.disabled = true;
    }

    function renderInviteSetorOptions(setores) {
        const setorSelect = document.getElementById('new-user-setor');
        if (!setorSelect) return;

        const previous = setorSelect.value;
        const activeSetores = (setores || [])
            .map((setor) => String(setor.nome || '').trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        setorSelect.innerHTML = '<option value=\"\" selected disabled>Selecione...</option>';
        activeSetores.forEach((setorNome) => {
            setorSelect.add(new Option(setorNome, setorNome));
        });

        if (previous && activeSetores.includes(previous)) {
            setorSelect.value = previous;
        }
    }

    function handleInviteSetorChange() {
        const setorSelect = document.getElementById('new-user-setor');
        const cargoSelect = document.getElementById('new-user-cargo');
        if (!setorSelect || !cargoSelect) return;

        const selectedSetor = setorSelect.value || '';
        const cargos = state.inviteCatalog?.cargosPorSetor?.[selectedSetor] || [];
        const sortedCargos = [...cargos].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));

        cargoSelect.innerHTML = '<option value=\"\" selected disabled>Selecione...</option>';
        sortedCargos.forEach((cargoNome) => {
            cargoSelect.add(new Option(cargoNome, cargoNome));
        });

        if (!sortedCargos.length) {
            cargoSelect.innerHTML = '<option value=\"\" selected disabled>Sem cargos neste setor</option>';
            cargoSelect.disabled = true;
            return;
        }

        cargoSelect.disabled = false;
    }

    async function loadInviteCatalog(force = false) {
        if (!isAdmin()) {
            clearInviteSelects();
            return;
        }

        const getSnapshot = window.App?.api?.catalog?.getCatalogSnapshot;
        if (typeof getSnapshot !== 'function') {
            clearInviteSelects();
            return;
        }

        const { data, error } = await getSnapshot({ force, apenasAtivos: true });
        if (error || !data) {
            clearInviteSelects();
            return;
        }

        state.inviteCatalog = data;
        renderInviteSetorOptions(data.raw?.setores || []);

        const setorSelect = document.getElementById('new-user-setor');
        const cargoSelect = document.getElementById('new-user-cargo');

        if (setorSelect?.value) {
            const previousCargo = cargoSelect?.value || '';
            handleInviteSetorChange();
            if (cargoSelect && previousCargo && Array.from(cargoSelect.options).some((option) => option.value === previousCargo)) {
                cargoSelect.value = previousCargo;
            }
            return;
        }

        resetInviteCargoSelect('Setor primeiro');
    }

    function handleTableActionClick(event) {
        const actionBtn = event.target.closest('[data-action]');
        if (!actionBtn) return;

        const action = actionBtn.dataset.action;
        const userId = actionBtn.dataset.userId;
        const email = actionBtn.dataset.email || '';
        const name = actionBtn.dataset.name || '';

        if (action === 'change-password' && userId) {
            abrirTrocaSenha(userId, name || email, false);
            return;
        }

        if (action === 'change-password-self' && userId) {
            abrirTrocaSenha(userId, name || email, true);
            return;
        }

        if (action === 'deactivate' && userId) {
            desativarUsuario(userId, email);
            return;
        }

        if (action === 'reactivate' && userId) {
            reativarUsuario(userId, email);
        }
    }

    async function desativarUsuario(userId, email) {
        const me = getCurrentUser();
        if (me?.id === userId) {
            showToast('Não é possível desativar seu próprio usuário.', 'error');
            return;
        }

        const confirmed = window.confirm(`Desativar o acesso de ${email}?`);
        if (!confirmed) return;

        const { error } = await window.App.api.admin.deactivateUser(userId);
        if (error) {
            showToast(error.message, 'error');
            return;
        }

        showToast(`Usuário ${email} desativado.`, 'success');
        await loadUsuarios();
    }

    async function reativarUsuario(userId, email) {
        const confirmed = window.confirm(`Reativar o acesso de ${email}?`);
        if (!confirmed) return;

        const { error } = await window.App.api.admin.reactivateUser(userId);
        if (error) {
            showToast(error.message, 'error');
            return;
        }

        showToast(`Usuário ${email} reativado.`, 'success');
        await loadUsuarios();
    }

    function abrirTrocaSenha(userId, name, isSelf = false) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.id = 'senha-modal';

        modal.innerHTML = `
            <div class="modal" style="max-width:420px" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>🔑 Alterar senha - ${escapeHtml(name)}</h3>
                    <button class="modal-close" data-action="close">✕</button>
                </div>
                <div class="modal-body">
                    ${isSelf ? `
                        <div class="form-group">
                            <label style="font-size:0.7rem;font-weight:600;color:var(--text-soft);display:block;margin-bottom:5px">Senha atual</label>
                            <input type="password" id="senha-atual" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:9px 11px;color:var(--text);font-family:var(--font);font-size:0.78rem;outline:none;">
                        </div>
                    ` : `
                        <div style="background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:7px;padding:9px 13px;font-size:0.7rem;color:var(--accent3);margin-bottom:14px">
                            A nova senha será aplicada imediatamente.
                        </div>
                    `}

                    <div class="form-group" style="margin-bottom:14px">
                        <label style="font-size:0.7rem;font-weight:600;color:var(--text-soft);display:block;margin-bottom:5px">Nova senha</label>
                        <input type="password" id="senha-nova" placeholder="mínimo 8 caracteres" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:9px 11px;color:var(--text);font-family:var(--font);font-size:0.78rem;outline:none;">
                    </div>

                    <div class="form-group">
                        <label style="font-size:0.7rem;font-weight:600;color:var(--text-soft);display:block;margin-bottom:5px">Confirmar nova senha</label>
                        <input type="password" id="senha-confirma" placeholder="••••••••" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:9px 11px;color:var(--text);font-family:var(--font);font-size:0.78rem;outline:none;">
                    </div>

                    <div class="error-msg" id="senha-modal-error" style="margin-top:8px"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-row" data-action="close">Cancelar</button>
                    <button class="btn-row primary" data-action="save">Salvar senha</button>
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

        modal.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
            if (isSelf) {
                await executarTrocaSenhaPropria(modal);
            } else {
                await executarTrocaSenhaAdmin(modal, userId);
            }
        });

        setTimeout(() => {
            const firstInput = modal.querySelector(isSelf ? '#senha-atual' : '#senha-nova');
            firstInput?.focus();
        }, 60);
    }

    async function executarTrocaSenhaAdmin(modal, targetUserId) {
        const newPassword = modal.querySelector('#senha-nova')?.value || '';
        const confirmPassword = modal.querySelector('#senha-confirma')?.value || '';
        const errorBox = modal.querySelector('#senha-modal-error');

        hideMessage(errorBox);

        const validation = validatePasswordChange(newPassword, confirmPassword);
        if (validation) {
            showMessage(errorBox, validation);
            return;
        }

        const { error } = await window.App.api.admin.changeUserPassword(targetUserId, newPassword);
        if (error) {
            showMessage(errorBox, error.message);
            return;
        }

        modal.remove();
        showToast('Senha alterada com sucesso.', 'success');
    }

    async function executarTrocaSenhaPropria(modal) {
        const currentPassword = modal.querySelector('#senha-atual')?.value || '';
        const newPassword = modal.querySelector('#senha-nova')?.value || '';
        const confirmPassword = modal.querySelector('#senha-confirma')?.value || '';
        const errorBox = modal.querySelector('#senha-modal-error');

        hideMessage(errorBox);

        if (!currentPassword) {
            showMessage(errorBox, 'Digite sua senha atual.');
            return;
        }

        const validation = validatePasswordChange(newPassword, confirmPassword);
        if (validation) {
            showMessage(errorBox, validation);
            return;
        }

        const user = getCurrentUser();
        const { error: signInError } = await _supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
        });

        if (signInError) {
            showMessage(errorBox, 'Senha atual incorreta.');
            return;
        }

        const { error } = await _supabase.auth.updateUser({ password: newPassword });
        if (error) {
            showMessage(errorBox, error.message);
            return;
        }

        modal.remove();
        showToast('Sua senha foi alterada com sucesso.', 'success');
    }

    function validatePasswordChange(newPassword, confirmPassword) {
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            return `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
        }

        if (newPassword !== confirmPassword) {
            return 'As senhas não coincidem.';
        }

        return null;
    }

    function renderUsuariosTable(users) {
        const tbody = document.getElementById('usuarios-tbody');
        if (!tbody) return;

        if (!users.length) {
            renderUsuariosEmpty('Nenhum usuário cadastrado.');
            return;
        }

        const currentUserId = getCurrentUser()?.id;

        tbody.innerHTML = users.map((user) => {
            const email = user.email || '';
            const displayName = user.user_metadata?.name || email.split('@')[0] || 'Usuário';
            const userType = resolveUserType(user.user_metadata);
            const userTypeLabel = userType === 'adm' ? 'ADM' : 'Usuário comum';
            const roleClass = userType === 'adm' ? 'admin' : 'comum';
            const setor = user.user_metadata?.setor || '—';
            const cargo = user.user_metadata?.cargo || '—';
            const initials = displayName
                .split(' ')
                .filter(Boolean)
                .map((part) => part[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

            const status = user.banned_until ? 'inativo' : (user.confirmed_at ? 'ativo' : 'pendente');

            const statusPill = status === 'ativo'
                ? '<span class="status-pill ativo">● Ativo</span>'
                : status === 'pendente'
                    ? '<span class="status-pill" style="background:rgba(245,166,35,0.1);color:var(--accent3);border:1px solid rgba(245,166,35,0.2)">⏳ Pendente</span>'
                    : '<span class="status-pill revogado">✕ Inativo</span>';

            const isSelf = user.id === currentUserId;
            const safeName = escapeHtml(displayName);
            const safeEmail = escapeHtml(email);

            const actions = isSelf
                ? `<button class="btn-row primary" data-action="change-password-self" data-user-id="${user.id}" data-name="${safeName}" data-email="${safeEmail}">🔑 Minha senha</button>`
                : `
                    <button class="btn-row primary" data-action="change-password" data-user-id="${user.id}" data-name="${safeName}" data-email="${safeEmail}">🔑 Senha</button>
                    ${status !== 'inativo'
                        ? `<button class="btn-row danger" data-action="deactivate" data-user-id="${user.id}" data-email="${safeEmail}">Desativar</button>`
                        : `<button class="btn-row success" data-action="reactivate" data-user-id="${user.id}" data-email="${safeEmail}">Reativar</button>`}
                `;

            return `
                <tr>
                    <td>
                        <div style="display:flex;align-items:center;gap:8px">
                            <div class="user-row-avatar">${escapeHtml(initials)}</div>
                            <div>
                                <div style="font-size:0.76rem;font-weight:600;color:var(--text)">${safeName}</div>
                                <div style="font-size:0.62rem;color:var(--text-muted)">${safeEmail}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="user-structure">
                            <span class="role-badge ${escapeHtml(roleClass)}">${escapeHtml(userTypeLabel)}</span>
                            <span class="user-structure-meta">${escapeHtml(setor)} • ${escapeHtml(cargo)}</span>
                        </div>
                    </td>
                    <td>${statusPill}</td>
                    <td><div class="row-actions">${actions}</div></td>
                </tr>
            `;
        }).join('');
    }

    function resolveUserType(metadata) {
        const rawType = String(metadata?.type || '').trim().toLowerCase();
        if (['adm', 'admin', 'administrador'].includes(rawType)) return 'adm';
        if (['comum', 'operador', 'usuario', 'usuário', 'user'].includes(rawType)) return 'comum';

        const role = String(metadata?.role || '').trim().toLowerCase();
        if (role === 'admin') return 'adm';
        return 'comum';
    }

    function renderUsuariosLoading() {
        const tbody = document.getElementById('usuarios-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="4">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando usuários...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderUsuariosEmpty(message) {
        const tbody = document.getElementById('usuarios-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="4">
                    <div class="table-state">
                        <div class="icon">👥</div>
                        <div>${escapeHtml(message)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderUsuariosError(message) {
        const tbody = document.getElementById('usuarios-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="4">
                    <div class="table-state">
                        <div class="icon">⚠️</div>
                        <div>${escapeHtml(message)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function showMessage(element, message) {
        if (!element) return;
        element.textContent = message;
        element.style.display = 'block';
    }

    function hideMessage(element) {
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

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    window.initUsuarios = initUsuarios;
    window.onUsuariosActivate = onUsuariosActivate;
    window.loadUsuarios = loadUsuarios;
    window.abrirTrocaSenha = abrirTrocaSenha;
    window.desativarUsuario = desativarUsuario;
    window.reativarUsuario = reativarUsuario;

    document.addEventListener('DOMContentLoaded', initUsuarios);
})();
