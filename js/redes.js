/**
 * redes.js
 *
 * CRUDs do modulo de Infraestrutura de Rede:
 * - Usuarios de Rede (base Gestor-Usuarios_REDE)
 * - Topologia de Rede (base Diagrama_Rede + tabela de unidades)
 * - Politicas de Infraestrutura (base Politica_Infraestrutura)
 */

(function bootstrapRedesModule() {
    'use strict';

    const POLICY_CATEGORY_LABELS = Object.freeze({
        OBJETIVO: 'Objetivo',
        ESCOPO: 'Escopo',
        TOPOLOGIA: 'Topologia',
        RESPONSABILIDADE: 'Responsabilidade',
        ACESSO_SEGURANCA: 'Acesso e Seguranca',
        SISTEMA_CRITICO: 'Sistema Critico',
        MANUTENCAO: 'Manutencao',
        LGPD: 'LGPD',
        VIGENCIA: 'Vigencia',
    });

    const USER_PERMISSION_FIELDS = Object.freeze([
        { key: 'assinaturas', label: 'Assinaturas', checkboxId: 'rede-usuarios-perm-assinaturas' },
        { key: 'bancos', label: 'Bancos', checkboxId: 'rede-usuarios-perm-bancos' },
        { key: 'contab', label: 'Contab', checkboxId: 'rede-usuarios-perm-contab' },
        { key: 'comercial', label: 'Comercial', checkboxId: 'rede-usuarios-perm-comercial' },
        { key: 'dir', label: 'Dir', checkboxId: 'rede-usuarios-perm-dir' },
        { key: 'dsk', label: 'Dsk', checkboxId: 'rede-usuarios-perm-dsk' },
        { key: 'filiais', label: 'Filiais', checkboxId: 'rede-usuarios-perm-filiais' },
        { key: 'fisc', label: 'Fisc', checkboxId: 'rede-usuarios-perm-fisc' },
        { key: 'ger', label: 'Ger', checkboxId: 'rede-usuarios-perm-ger' },
        { key: 'importacao_trading', label: 'Importacao-Trading', checkboxId: 'rede-usuarios-perm-importacao-trading' },
        { key: 'logistica', label: 'Logistica', checkboxId: 'rede-usuarios-perm-logistica' },
        { key: 'm_fat', label: 'M_FAT', checkboxId: 'rede-usuarios-perm-m-fat' },
        { key: 'mkt', label: 'Mkt', checkboxId: 'rede-usuarios-perm-mkt' },
        { key: 'oper', label: 'Oper', checkboxId: 'rede-usuarios-perm-oper' },
        { key: 'rh', label: 'RH', checkboxId: 'rede-usuarios-perm-rh' },
        { key: 'rh_filiais', label: 'RH_FILIAIS', checkboxId: 'rede-usuarios-perm-rh-filiais' },
        { key: 'salesforce', label: 'SalesForce', checkboxId: 'rede-usuarios-perm-salesforce' },
        { key: 'sistemas', label: 'Sistemas', checkboxId: 'rede-usuarios-perm-sistemas' },
    ]);

    const state = {
        initialized: false,
        usuarios: {
            loading: false,
            records: [],
            page: 1,
            pageSize: 20,
            search: '',
        },
        topologia: {
            loading: false,
            records: [],
            search: '',
        },
        politicas: {
            loading: false,
            records: [],
            search: '',
        },
    };

    function initRedesModule() {
        if (state.initialized) return;

        mountRedesModalsToBody();

        // Usuarios
        document.getElementById('rede-usuarios-new-btn')?.addEventListener('click', () => {
            if (!hasAdminAccess()) {
                notify('Acesso restrito a administradores.', 'error');
                return;
            }
            resetUsuarioForm();
            openModal('rede-usuarios-modal');
        });
        document.getElementById('rede-usuarios-refresh-btn')?.addEventListener('click', loadRedeUsuarios);
        document.getElementById('rede-usuarios-search')?.addEventListener('input', debounce((event) => {
            state.usuarios.search = event.target.value || '';
            state.usuarios.page = 1;
            loadRedeUsuarios();
        }, 300));
        document.getElementById('rede-usuarios-tbody')?.addEventListener('click', handleUsuariosTableClick);
        document.getElementById('rede-usuarios-pagination')?.addEventListener('click', handleUsuariosPaginationClick);
        document.getElementById('rede-usuarios-form')?.addEventListener('submit', handleUsuarioFormSubmit);
        document.getElementById('rede-usuarios-cancel-btn')?.addEventListener('click', resetUsuarioForm);

        // Topologia
        document.getElementById('rede-topologia-new-btn')?.addEventListener('click', () => {
            if (!hasAdminAccess()) {
                notify('Acesso restrito a administradores.', 'error');
                return;
            }
            resetTopologiaForm();
            openModal('rede-topologia-modal');
        });
        document.getElementById('rede-topologia-refresh-btn')?.addEventListener('click', loadRedeTopologia);
        document.getElementById('rede-topologia-search')?.addEventListener('input', debounce((event) => {
            state.topologia.search = event.target.value || '';
            loadRedeTopologia();
        }, 300));
        document.getElementById('rede-topologia-tbody')?.addEventListener('click', handleTopologiaTableClick);
        document.getElementById('rede-topologia-form')?.addEventListener('submit', handleTopologiaFormSubmit);
        document.getElementById('rede-topologia-cancel-btn')?.addEventListener('click', resetTopologiaForm);

        // Politicas
        document.getElementById('rede-politicas-new-btn')?.addEventListener('click', () => {
            if (!hasAdminAccess()) {
                notify('Acesso restrito a administradores.', 'error');
                return;
            }
            resetPoliticaForm();
            openModal('rede-politicas-modal');
        });
        document.getElementById('rede-politicas-refresh-btn')?.addEventListener('click', loadRedePoliticas);
        document.getElementById('rede-politicas-search')?.addEventListener('input', debounce((event) => {
            state.politicas.search = event.target.value || '';
            loadRedePoliticas();
        }, 300));
        document.getElementById('rede-politicas-tbody')?.addEventListener('click', handlePoliticasTableClick);
        document.getElementById('rede-politicas-form')?.addEventListener('submit', handlePoliticaFormSubmit);
        document.getElementById('rede-politicas-cancel-btn')?.addEventListener('click', resetPoliticaForm);

        bindModal('rede-usuarios-modal', 'close-rede-usuarios-modal', () => {
            resetUsuarioForm();
            closeModal('rede-usuarios-modal');
        });
        bindModal('rede-topologia-modal', 'close-rede-topologia-modal', () => {
            resetTopologiaForm();
            closeModal('rede-topologia-modal');
        });
        bindModal('rede-politicas-modal', 'close-rede-politicas-modal', () => {
            resetPoliticaForm();
            closeModal('rede-politicas-modal');
        });

        document.addEventListener('app:auth-changed', () => {
            syncAdminControls();

            if (isPageActive('rede-usuarios')) {
                loadRedeUsuarios();
            }
            if (isPageActive('rede-topologia')) {
                loadRedeTopologia();
            }
            if (isPageActive('rede-politicas')) {
                loadRedePoliticas();
            }
        });

        state.initialized = true;
        syncAdminControls();
        resetUsuarioForm();
        resetTopologiaForm();
        resetPoliticaForm();
    }

    function mountRedesModalsToBody() {
        ['rede-usuarios-modal', 'rede-topologia-modal', 'rede-politicas-modal'].forEach((modalId) => {
            const modal = document.getElementById(modalId);
            if (!modal || modal.parentElement === document.body) return;
            document.body.appendChild(modal);
        });
    }

    function bindModal(modalId, actionName, onClose) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.addEventListener('click', (event) => {
            if (event.target === modal && typeof onClose === 'function') {
                onClose();
            }
        });

        modal.querySelectorAll(`[data-action="${actionName}"]`).forEach((button) => {
            button.addEventListener('click', () => {
                if (typeof onClose === 'function') {
                    onClose();
                }
            });
        });
    }

    function hasAdminAccess() {
        return typeof window.isAdmin === 'function' ? window.isAdmin() : false;
    }

    function getCurrentUser() {
        return typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
    }

    function isPageActive(pageKey) {
        return document.getElementById(`page-${pageKey}`)?.classList.contains('active');
    }

    function syncAdminControls() {
        const admin = hasAdminAccess();
        ['rede-usuarios-new-btn', 'rede-topologia-new-btn', 'rede-politicas-new-btn'].forEach((id) => {
            const button = document.getElementById(id);
            if (!button) return;
            button.style.display = admin ? '' : 'none';
            button.disabled = !admin;
        });

        if (!admin) {
            closeModal('rede-usuarios-modal');
            closeModal('rede-topologia-modal');
            closeModal('rede-politicas-modal');
            resetUsuarioForm();
            resetTopologiaForm();
            resetPoliticaForm();
        }
    }

    function onRedesActivate() {
        syncAdminControls();
    }

    async function onRedeUsuariosActivate() {
        if (!getCurrentUser()) return;
        syncAdminControls();
        await loadRedeUsuarios();
    }

    async function onRedeTopologiaActivate() {
        if (!getCurrentUser()) return;
        syncAdminControls();
        await loadRedeTopologia();
    }

    async function onRedePoliticasActivate() {
        if (!getCurrentUser()) return;
        syncAdminControls();
        await loadRedePoliticas();
    }

    // -------------------------------------------------
    // USUARIOS DE REDE
    // -------------------------------------------------

    async function loadRedeUsuarios() {
        if (state.usuarios.loading) return;

        const api = window.App?.api?.rede;
        if (!api?.listarUsuarios) {
            renderUsuariosError('API de usuarios de rede indisponivel.');
            setText('rede-usuarios-summary', 'API indisponivel para carregar usuarios.');
            return;
        }

        state.usuarios.loading = true;
        renderUsuariosLoading();

        const { data, error } = await api.listarUsuarios({ search: state.usuarios.search });
        state.usuarios.loading = false;

        if (error) {
            renderUsuariosError(error.message);
            setText('rede-usuarios-summary', 'Erro ao carregar usuarios de rede.');
            return;
        }

        state.usuarios.records = data || [];
        const totalPages = getUsuariosTotalPages();
        if (state.usuarios.page > totalPages) {
            state.usuarios.page = totalPages;
        }

        renderUsuariosSummary();
        renderUsuariosTable();
        renderUsuariosPagination();
    }

    function renderUsuariosLoading() {
        const tbody = document.getElementById('rede-usuarios-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando usuarios de rede...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderUsuariosError(message) {
        const tbody = document.getElementById('rede-usuarios-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="table-state">
                        <div class="icon">⚠️</div>
                        <div>${escapeHtml(message)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderUsuariosSummary() {
        const total = state.usuarios.records.length;
        const ativos = state.usuarios.records.filter((item) => normalizeUserStatus(item.status) === 'ATIVO').length;
        const inativos = total - ativos;
        const totalPermissoes = state.usuarios.records
            .reduce((sum, item) => sum + countEnabledPermissions(item), 0);

        setText(
            'rede-usuarios-summary',
            `${total} usuarios • ${ativos} ativos • ${inativos} inativos • ${totalPermissoes} permissoes habilitadas`,
        );
    }

    function getUsuariosTotalPages() {
        return Math.max(1, Math.ceil(state.usuarios.records.length / state.usuarios.pageSize));
    }

    function renderUsuariosTable() {
        const tbody = document.getElementById('rede-usuarios-tbody');
        if (!tbody) return;

        const start = (state.usuarios.page - 1) * state.usuarios.pageSize;
        const rows = state.usuarios.records.slice(start, start + state.usuarios.pageSize);
        const admin = hasAdminAccess();

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="table-state">
                            <div class="icon">👥</div>
                            <div>Nenhum usuario de rede encontrado.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = rows.map((item) => `
            <tr>
                <td><span class="uf-badge">${escapeHtml(item.unidade || '—')}</span></td>
                <td>
                    <div style="font-family:var(--mono);font-size:0.66rem;color:var(--text)">${escapeHtml(item.usuario || '—')}</div>
                </td>
                <td>${escapeHtml(item.nome_completo || '—')}</td>
                <td>${renderStatusPill(normalizeUserStatus(item.status) === 'ATIVO')}</td>
                <td><span class="rede-perm-count">${countEnabledPermissions(item)} perfis</span></td>
                <td>
                    ${admin
            ? `<div class="row-actions">
                            <button class="btn-row primary" data-action="edit" data-id="${item.id}">Editar</button>
                            <button class="btn-row danger" data-action="delete" data-id="${item.id}" data-nome="${escapeHtmlAttribute(item.nome_completo || '')}">Excluir</button>
                        </div>`
            : '<span style="font-size:0.68rem;color:var(--text-muted)">Somente leitura</span>'
}
                </td>
            </tr>
        `).join('');
    }

    function renderUsuariosPagination() {
        const container = document.getElementById('rede-usuarios-pagination');
        if (!container) return;

        const totalPages = getUsuariosTotalPages();
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        const parts = [];
        parts.push(`<button class="page-btn" data-page="${state.usuarios.page - 1}" ${state.usuarios.page === 1 ? 'disabled' : ''}>‹</button>`);

        for (let i = 1; i <= totalPages; i += 1) {
            const edge = i === 1 || i === totalPages;
            const nearby = Math.abs(i - state.usuarios.page) <= 2;
            if (edge || nearby) {
                parts.push(`<button class="page-btn ${i === state.usuarios.page ? 'active' : ''}" data-page="${i}">${i}</button>`);
            } else if (Math.abs(i - state.usuarios.page) === 3) {
                parts.push('<span style="color:var(--text-muted);padding:0 4px">…</span>');
            }
        }

        parts.push(`<button class="page-btn" data-page="${state.usuarios.page + 1}" ${state.usuarios.page === totalPages ? 'disabled' : ''}>›</button>`);
        container.innerHTML = parts.join('');
    }

    function handleUsuariosPaginationClick(event) {
        const button = event.target.closest('[data-page]');
        if (!button) return;

        const next = Number(button.dataset.page);
        if (!Number.isFinite(next)) return;
        if (next < 1 || next > getUsuariosTotalPages()) return;

        state.usuarios.page = next;
        renderUsuariosTable();
        renderUsuariosPagination();
    }

    async function handleUsuarioFormSubmit(event) {
        event.preventDefault();
        if (!hasAdminAccess()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const api = window.App?.api?.rede;
        if (!api) {
            notify('API de rede indisponivel.', 'error');
            return;
        }

        const payload = collectUsuarioPayload();
        const validationError = validateUsuarioPayload(payload);
        if (validationError) {
            notify(validationError, 'error');
            return;
        }

        const id = Number(document.getElementById('rede-usuarios-id')?.value || 0);
        const operation = id > 0
            ? api.atualizarUsuario(id, payload)
            : api.criarUsuario(payload);

        const { error } = await operation;
        if (error) {
            notify(error.message, 'error');
            return;
        }

        notify(id > 0 ? 'Usuario de rede atualizado.' : 'Usuario de rede criado.', 'success');
        resetUsuarioForm();
        closeModal('rede-usuarios-modal');
        await loadRedeUsuarios();
    }

    function collectUsuarioPayload() {
        const payload = {
            nome_completo: document.getElementById('rede-usuarios-form-nome')?.value || '',
            unidade: document.getElementById('rede-usuarios-form-unidade')?.value || '',
            usuario: document.getElementById('rede-usuarios-form-usuario')?.value || '',
            status: document.getElementById('rede-usuarios-form-status')?.value || 'ATIVO',
        };

        USER_PERMISSION_FIELDS.forEach((field) => {
            payload[field.key] = Boolean(document.getElementById(field.checkboxId)?.checked);
        });

        return payload;
    }

    function validateUsuarioPayload(payload) {
        const nome = sanitizeText(payload.nome_completo);
        const unidade = sanitizeText(payload.unidade).toUpperCase();
        const usuario = sanitizeText(payload.usuario);
        const status = normalizeUserStatus(payload.status);

        if (!nome) return 'Informe o nome completo do usuario.';
        if (!unidade) return 'Informe a unidade.';
        if (!usuario) return 'Informe o usuario de rede.';
        if (!/^[a-zA-Z0-9._-]+$/.test(usuario)) return 'Usuario invalido. Use letras, numeros, ponto, underline ou hifen.';
        if (!status) return 'Status invalido. Use ATIVO ou INATIVO.';

        return null;
    }

    async function handleUsuariosTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        if (!hasAdminAccess()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        if (button.dataset.action === 'edit') {
            const record = state.usuarios.records.find((item) => Number(item.id) === id);
            if (!record) return;
            fillUsuarioForm(record);
            openModal('rede-usuarios-modal');
            setTimeout(() => document.getElementById('rede-usuarios-form-nome')?.focus(), 30);
            return;
        }

        if (button.dataset.action === 'delete') {
            const nome = button.dataset.nome || 'este usuario';
            const confirmed = await askConfirmation({
                title: 'Excluir usuario de rede',
                message: `Excluir ${nome}?`,
                confirmText: 'Excluir',
            });
            if (!confirmed) return;

            const { error } = await window.App.api.rede.removerUsuario(id);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Usuario de rede removido.', 'success');
            resetUsuarioForm();
            await loadRedeUsuarios();
        }
    }

    function fillUsuarioForm(record) {
        setValue('rede-usuarios-id', String(record.id));
        setValue('rede-usuarios-form-nome', record.nome_completo || '');
        setValue('rede-usuarios-form-unidade', record.unidade || '');
        setValue('rede-usuarios-form-usuario', record.usuario || '');
        setValue('rede-usuarios-form-status', normalizeUserStatus(record.status) || 'ATIVO');

        USER_PERMISSION_FIELDS.forEach((field) => {
            setChecked(field.checkboxId, Boolean(record[field.key]));
        });

        setText('rede-usuarios-modal-title', 'Edicao de Usuario de Rede');
        setText('rede-usuarios-submit-btn', 'Atualizar Usuario');
        toggleDisplay('rede-usuarios-cancel-btn', true);
    }

    function resetUsuarioForm() {
        setValue('rede-usuarios-id', '');
        setValue('rede-usuarios-form-nome', '');
        setValue('rede-usuarios-form-unidade', '');
        setValue('rede-usuarios-form-usuario', '');
        setValue('rede-usuarios-form-status', 'ATIVO');

        USER_PERMISSION_FIELDS.forEach((field) => {
            setChecked(field.checkboxId, false);
        });

        setText('rede-usuarios-modal-title', 'Cadastro de Usuario de Rede');
        setText('rede-usuarios-submit-btn', 'Salvar Usuario');
        toggleDisplay('rede-usuarios-cancel-btn', false);
    }

    function normalizeUserStatus(value) {
        const raw = sanitizeText(value).toUpperCase();
        if (raw === 'ATIVO') return 'ATIVO';
        if (raw === 'INATIVO') return 'INATIVO';
        return '';
    }

    function countEnabledPermissions(record) {
        return USER_PERMISSION_FIELDS.reduce((count, field) => {
            return count + (record?.[field.key] ? 1 : 0);
        }, 0);
    }

    // -------------------------------------------------
    // TOPOLOGIA
    // -------------------------------------------------

    async function loadRedeTopologia() {
        if (state.topologia.loading) return;

        const api = window.App?.api?.rede;
        if (!api?.listarTopologia) {
            renderTopologiaError('API de topologia de rede indisponivel.');
            setText('rede-topologia-summary', 'API indisponivel para carregar topologia.');
            setText('rede-topologia-kpi-unidades', '—');
            setText('rede-topologia-kpi-vpn', '—');
            return;
        }

        state.topologia.loading = true;
        renderTopologiaLoading();

        const { data, error } = await api.listarTopologia({ search: state.topologia.search });
        state.topologia.loading = false;

        if (error) {
            renderTopologiaError(error.message);
            setText('rede-topologia-summary', 'Erro ao carregar topologia.');
            setText('rede-topologia-kpi-unidades', '—');
            setText('rede-topologia-kpi-vpn', '—');
            return;
        }

        state.topologia.records = data || [];
        renderTopologiaSummary();
        renderTopologiaTable();
    }

    function renderTopologiaLoading() {
        const tbody = document.getElementById('rede-topologia-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando topologia de rede...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderTopologiaError(message) {
        const tbody = document.getElementById('rede-topologia-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="table-state">
                        <div class="icon">⚠️</div>
                        <div>${escapeHtml(message)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderTopologiaSummary() {
        const total = state.topologia.records.length;
        const ativos = state.topologia.records.filter((item) => Boolean(item.ativo)).length;
        const vpnAtiva = state.topologia.records.filter((item) => Boolean(item.conecta_vpn)).length;

        setText('rede-topologia-summary', `${total} unidades cadastradas • ${ativos} ativas`);
        setText('rede-topologia-kpi-unidades', String(ativos));
        setText('rede-topologia-kpi-vpn', String(vpnAtiva));
    }

    function renderTopologiaTable() {
        const tbody = document.getElementById('rede-topologia-tbody');
        if (!tbody) return;

        const admin = hasAdminAccess();
        const rows = state.topologia.records;

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="table-state">
                            <div class="icon">🌐</div>
                            <div>Nenhum item de topologia encontrado.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = rows.map((item) => `
            <tr>
                <td><span class="uf-badge">${escapeHtml(item.codigo || '—')}</span></td>
                <td>${escapeHtml(item.localidade || '—')}</td>
                <td>${escapeHtml(item.tipo_unidade || '—')}</td>
                <td>${escapeHtml(item.hardware_critico || '—')}</td>
                <td>${renderVpnPill(Boolean(item.conecta_vpn))}</td>
                <td>${escapeHtml(item.modelo_firewall || '—')}</td>
                <td>${renderStatusPill(Boolean(item.ativo))}</td>
                <td>
                    ${admin
            ? `<div class="row-actions">
                            <button class="btn-row primary" data-action="edit" data-id="${item.id}">Editar</button>
                            <button class="btn-row danger" data-action="delete" data-id="${item.id}" data-nome="${escapeHtmlAttribute(item.codigo || '')}">Excluir</button>
                        </div>`
            : '<span style="font-size:0.68rem;color:var(--text-muted)">Somente leitura</span>'
}
                </td>
            </tr>
        `).join('');
    }

    async function handleTopologiaFormSubmit(event) {
        event.preventDefault();
        if (!hasAdminAccess()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const api = window.App?.api?.rede;
        if (!api) {
            notify('API de rede indisponivel.', 'error');
            return;
        }

        const payload = collectTopologiaPayload();
        const validationError = validateTopologiaPayload(payload);
        if (validationError) {
            notify(validationError, 'error');
            return;
        }

        const id = Number(document.getElementById('rede-topologia-id')?.value || 0);
        const operation = id > 0
            ? api.atualizarTopologia(id, payload)
            : api.criarTopologia(payload);

        const { error } = await operation;
        if (error) {
            notify(error.message, 'error');
            return;
        }

        notify(id > 0 ? 'Unidade de rede atualizada.' : 'Unidade de rede criada.', 'success');
        resetTopologiaForm();
        closeModal('rede-topologia-modal');
        await loadRedeTopologia();
    }

    function collectTopologiaPayload() {
        return {
            codigo: document.getElementById('rede-topologia-form-codigo')?.value || '',
            localidade: document.getElementById('rede-topologia-form-localidade')?.value || '',
            tipo_unidade: document.getElementById('rede-topologia-form-tipo')?.value || 'FILIAL',
            hardware_critico: document.getElementById('rede-topologia-form-hardware')?.value || '',
            conecta_vpn: Boolean(document.getElementById('rede-topologia-form-vpn')?.checked),
            modelo_firewall: document.getElementById('rede-topologia-form-firewall')?.value || '',
            ordem: Number(document.getElementById('rede-topologia-form-ordem')?.value || 100),
            ativo: Boolean(document.getElementById('rede-topologia-form-ativo')?.checked),
        };
    }

    function validateTopologiaPayload(payload) {
        const codigo = sanitizeText(payload.codigo);
        const localidade = sanitizeText(payload.localidade);
        const tipo = sanitizeText(payload.tipo_unidade).toUpperCase();
        const hardware = sanitizeText(payload.hardware_critico);
        const firewall = sanitizeText(payload.modelo_firewall);

        if (!codigo) return 'Informe o codigo da unidade.';
        if (!localidade) return 'Informe a localidade da unidade.';
        if (!['MATRIZ', 'FILIAL'].includes(tipo)) return 'Tipo de unidade invalido. Use MATRIZ ou FILIAL.';
        if (!hardware) return 'Informe o hardware critico.';
        if (!firewall) return 'Informe o modelo de firewall.';

        return null;
    }

    async function handleTopologiaTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        if (!hasAdminAccess()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        if (button.dataset.action === 'edit') {
            const record = state.topologia.records.find((item) => Number(item.id) === id);
            if (!record) return;
            fillTopologiaForm(record);
            openModal('rede-topologia-modal');
            setTimeout(() => document.getElementById('rede-topologia-form-codigo')?.focus(), 30);
            return;
        }

        if (button.dataset.action === 'delete') {
            const nome = button.dataset.nome || 'esta unidade';
            const confirmed = await askConfirmation({
                title: 'Excluir unidade de rede',
                message: `Excluir ${nome}?`,
                confirmText: 'Excluir',
            });
            if (!confirmed) return;

            const { error } = await window.App.api.rede.removerTopologia(id);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Unidade de rede removida.', 'success');
            resetTopologiaForm();
            await loadRedeTopologia();
        }
    }

    function fillTopologiaForm(record) {
        setValue('rede-topologia-id', String(record.id));
        setValue('rede-topologia-form-codigo', record.codigo || '');
        setValue('rede-topologia-form-localidade', record.localidade || '');
        setValue('rede-topologia-form-tipo', record.tipo_unidade || 'FILIAL');
        setValue('rede-topologia-form-hardware', record.hardware_critico || '');
        setChecked('rede-topologia-form-vpn', Boolean(record.conecta_vpn));
        setValue('rede-topologia-form-firewall', record.modelo_firewall || 'pfSense');
        setValue('rede-topologia-form-ordem', String(Number.isFinite(record.ordem) ? record.ordem : 100));
        setChecked('rede-topologia-form-ativo', Boolean(record.ativo));

        setText('rede-topologia-modal-title', 'Edicao de Unidade de Rede');
        setText('rede-topologia-submit-btn', 'Atualizar Unidade');
        toggleDisplay('rede-topologia-cancel-btn', true);
    }

    function resetTopologiaForm() {
        setValue('rede-topologia-id', '');
        setValue('rede-topologia-form-codigo', '');
        setValue('rede-topologia-form-localidade', '');
        setValue('rede-topologia-form-tipo', 'FILIAL');
        setValue('rede-topologia-form-hardware', '');
        setChecked('rede-topologia-form-vpn', true);
        setValue('rede-topologia-form-firewall', 'pfSense');
        setValue('rede-topologia-form-ordem', '100');
        setChecked('rede-topologia-form-ativo', true);

        setText('rede-topologia-modal-title', 'Cadastro de Unidade de Rede');
        setText('rede-topologia-submit-btn', 'Salvar Unidade');
        toggleDisplay('rede-topologia-cancel-btn', false);
    }

    // -------------------------------------------------
    // POLITICAS
    // -------------------------------------------------

    async function loadRedePoliticas() {
        if (state.politicas.loading) return;

        const api = window.App?.api?.rede;
        if (!api?.listarPoliticas) {
            renderPoliticasError('API de politicas de rede indisponivel.');
            setText('rede-politicas-summary', 'API indisponivel para carregar politicas.');
            setText('rede-politicas-kpi-ativos', '—');
            setText('rede-politicas-kpi-manutencao', '—');
            return;
        }

        state.politicas.loading = true;
        renderPoliticasLoading();

        const { data, error } = await api.listarPoliticas({ search: state.politicas.search });
        state.politicas.loading = false;

        if (error) {
            renderPoliticasError(error.message);
            setText('rede-politicas-summary', 'Erro ao carregar politicas.');
            setText('rede-politicas-kpi-ativos', '—');
            setText('rede-politicas-kpi-manutencao', '—');
            return;
        }

        state.politicas.records = data || [];
        renderPoliticasSummary();
        renderPoliticasTable();
    }

    function renderPoliticasLoading() {
        const tbody = document.getElementById('rede-politicas-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando politicas de rede...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderPoliticasError(message) {
        const tbody = document.getElementById('rede-politicas-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="table-state">
                        <div class="icon">⚠️</div>
                        <div>${escapeHtml(message)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderPoliticasSummary() {
        const total = state.politicas.records.length;
        const ativos = state.politicas.records.filter((item) => Boolean(item.ativo)).length;
        const manutencoes = state.politicas.records.filter((item) => sanitizeText(item.categoria).toUpperCase() === 'MANUTENCAO').length;

        setText('rede-politicas-summary', `${total} itens cadastrados • ${ativos} ativos`);
        setText('rede-politicas-kpi-ativos', String(ativos));
        setText('rede-politicas-kpi-manutencao', String(manutencoes));
    }

    function renderPoliticasTable() {
        const tbody = document.getElementById('rede-politicas-tbody');
        if (!tbody) return;

        const admin = hasAdminAccess();
        const rows = state.politicas.records;

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="table-state">
                            <div class="icon">📘</div>
                            <div>Nenhuma politica encontrada.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = rows.map((item) => {
            const categoria = sanitizeText(item.categoria).toUpperCase();
            const categoriaLabel = POLICY_CATEGORY_LABELS[categoria] || categoria || 'Categoria';

            return `
                <tr>
                    <td><span class="rede-category-pill">${escapeHtml(categoriaLabel)}</span></td>
                    <td>${escapeHtml(item.topico || '—')}</td>
                    <td>${escapeHtml(item.descricao || '—')}</td>
                    <td>${escapeHtml(item.responsavel || '—')}</td>
                    <td>${escapeHtml(item.periodicidade || '—')}</td>
                    <td>${renderStatusPill(Boolean(item.ativo))}</td>
                    <td>
                        ${admin
            ? `<div class="row-actions">
                                <button class="btn-row primary" data-action="edit" data-id="${item.id}">Editar</button>
                                <button class="btn-row danger" data-action="delete" data-id="${item.id}" data-nome="${escapeHtmlAttribute(item.topico || '')}">Excluir</button>
                            </div>`
            : '<span style="font-size:0.68rem;color:var(--text-muted)">Somente leitura</span>'
}
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function handlePoliticaFormSubmit(event) {
        event.preventDefault();
        if (!hasAdminAccess()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const api = window.App?.api?.rede;
        if (!api) {
            notify('API de rede indisponivel.', 'error');
            return;
        }

        const payload = collectPoliticaPayload();
        const validationError = validatePoliticaPayload(payload);
        if (validationError) {
            notify(validationError, 'error');
            return;
        }

        const id = Number(document.getElementById('rede-politicas-id')?.value || 0);
        const operation = id > 0
            ? api.atualizarPolitica(id, payload)
            : api.criarPolitica(payload);

        const { error } = await operation;
        if (error) {
            notify(error.message, 'error');
            return;
        }

        notify(id > 0 ? 'Politica atualizada.' : 'Politica criada.', 'success');
        resetPoliticaForm();
        closeModal('rede-politicas-modal');
        await loadRedePoliticas();
    }

    function collectPoliticaPayload() {
        return {
            categoria: document.getElementById('rede-politicas-form-categoria')?.value || 'OBJETIVO',
            topico: document.getElementById('rede-politicas-form-topico')?.value || '',
            descricao: document.getElementById('rede-politicas-form-descricao')?.value || '',
            responsavel: document.getElementById('rede-politicas-form-responsavel')?.value || '',
            periodicidade: document.getElementById('rede-politicas-form-periodicidade')?.value || '',
            ordem: Number(document.getElementById('rede-politicas-form-ordem')?.value || 100),
            ativo: Boolean(document.getElementById('rede-politicas-form-ativo')?.checked),
        };
    }

    function validatePoliticaPayload(payload) {
        const categoria = sanitizeText(payload.categoria).toUpperCase();
        const topico = sanitizeText(payload.topico);
        const descricao = sanitizeText(payload.descricao);

        if (!Object.prototype.hasOwnProperty.call(POLICY_CATEGORY_LABELS, categoria)) {
            return 'Categoria invalida para politica de rede.';
        }
        if (!topico) return 'Informe o topico da politica.';
        if (!descricao) return 'Informe a descricao da politica.';

        return null;
    }

    async function handlePoliticasTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        if (!hasAdminAccess()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        if (button.dataset.action === 'edit') {
            const record = state.politicas.records.find((item) => Number(item.id) === id);
            if (!record) return;
            fillPoliticaForm(record);
            openModal('rede-politicas-modal');
            setTimeout(() => document.getElementById('rede-politicas-form-topico')?.focus(), 30);
            return;
        }

        if (button.dataset.action === 'delete') {
            const nome = button.dataset.nome || 'este item';
            const confirmed = await askConfirmation({
                title: 'Excluir politica',
                message: `Excluir ${nome}?`,
                confirmText: 'Excluir',
            });
            if (!confirmed) return;

            const { error } = await window.App.api.rede.removerPolitica(id);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Politica removida.', 'success');
            resetPoliticaForm();
            await loadRedePoliticas();
        }
    }

    function fillPoliticaForm(record) {
        setValue('rede-politicas-id', String(record.id));
        setValue('rede-politicas-form-categoria', sanitizeText(record.categoria).toUpperCase() || 'OBJETIVO');
        setValue('rede-politicas-form-topico', record.topico || '');
        setValue('rede-politicas-form-descricao', record.descricao || '');
        setValue('rede-politicas-form-responsavel', record.responsavel || '');
        setValue('rede-politicas-form-periodicidade', record.periodicidade || '');
        setValue('rede-politicas-form-ordem', String(Number.isFinite(record.ordem) ? record.ordem : 100));
        setChecked('rede-politicas-form-ativo', Boolean(record.ativo));

        setText('rede-politicas-modal-title', 'Edicao de Politica');
        setText('rede-politicas-submit-btn', 'Atualizar Politica');
        toggleDisplay('rede-politicas-cancel-btn', true);
    }

    function resetPoliticaForm() {
        setValue('rede-politicas-id', '');
        setValue('rede-politicas-form-categoria', 'OBJETIVO');
        setValue('rede-politicas-form-topico', '');
        setValue('rede-politicas-form-descricao', '');
        setValue('rede-politicas-form-responsavel', '');
        setValue('rede-politicas-form-periodicidade', '');
        setValue('rede-politicas-form-ordem', '100');
        setChecked('rede-politicas-form-ativo', true);

        setText('rede-politicas-modal-title', 'Cadastro de Politica');
        setText('rede-politicas-submit-btn', 'Salvar Politica');
        toggleDisplay('rede-politicas-cancel-btn', false);
    }

    // -------------------------------------------------
    // HELPERS
    // -------------------------------------------------

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.hidden = false;
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.hidden = true;
    }

    function renderStatusPill(active) {
        return active
            ? '<span class="status-pill ativo">● Ativo</span>'
            : '<span class="status-pill revogado">✕ Inativo</span>';
    }

    function renderVpnPill(active) {
        return active
            ? '<span class="rede-vpn-pill ativo">● IPSec</span>'
            : '<span class="rede-vpn-pill inativo">✕ Sem VPN</span>';
    }

    async function askConfirmation({ title, message, confirmText }) {
        if (typeof window.showConfirmDialog === 'function') {
            return window.showConfirmDialog({
                title,
                message,
                confirmText: confirmText || 'Confirmar',
                cancelText: 'Cancelar',
                danger: true,
            });
        }

        return window.confirm(message);
    }

    function notify(message, type = 'success') {
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

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    function setChecked(id, checked) {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(checked);
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function toggleDisplay(id, visible) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = visible ? '' : 'none';
    }

    function sanitizeText(value) {
        return String(value || '').trim();
    }

    function debounce(fn, waitMs) {
        let timer = null;
        return (...args) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn(...args), waitMs);
        };
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

    window.onRedesActivate = onRedesActivate;
    window.onRedeUsuariosActivate = onRedeUsuariosActivate;
    window.onRedeTopologiaActivate = onRedeTopologiaActivate;
    window.onRedePoliticasActivate = onRedePoliticasActivate;

    window.loadRedeUsuarios = loadRedeUsuarios;
    window.loadRedeTopologia = loadRedeTopologia;
    window.loadRedePoliticas = loadRedePoliticas;

    document.addEventListener('DOMContentLoaded', initRedesModule);
})();
