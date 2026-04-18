/**
 * linhas.js
 *
 * CRUD de linhas telefônicas corporativas:
 * LOJA, USUÁRIO, DPTO, CARGO, DDD, LINHA, TIPO.
 */

(function bootstrapLinhas() {
    'use strict';

    const state = {
        initialized: false,
        loading: false,
        records: [],
        page: 1,
        pageSize: 20,
        search: '',
    };

    function initLinhas() {
        if (state.initialized) return;

        document.getElementById('linhas-new-btn')?.addEventListener('click', () => {
            if (!hasAdminAccess()) {
                notify('Acesso restrito a administradores.', 'error');
                return;
            }
            resetForm();
            openLinhasModal();
        });
        bindLinhasModal();

        document.getElementById('linhas-form')?.addEventListener('submit', handleFormSubmit);
        document.getElementById('linhas-cancel-btn')?.addEventListener('click', resetForm);
        document.getElementById('linhas-refresh-btn')?.addEventListener('click', loadLinhas);
        document.getElementById('linhas-search')?.addEventListener('input', debounce(handleSearchInput, 300));
        document.getElementById('linhas-tbody')?.addEventListener('click', handleTableClick);
        document.getElementById('linhas-pagination')?.addEventListener('click', handlePaginationClick);

        document.addEventListener('app:auth-changed', () => {
            syncAdminControls();
            if (isLinhasActive()) {
                loadLinhas();
            }
        });

        state.initialized = true;
        resetForm();
        syncAdminControls();
    }

    function hasAdminAccess() {
        return typeof window.isAdmin === 'function' ? window.isAdmin() : false;
    }

    function isLinhasActive() {
        return document.getElementById('page-linhas')?.classList.contains('active');
    }

    async function onLinhasActivate() {
        if (!getCurrentUser()) return;
        syncAdminControls();
        await loadLinhas();
    }

    function handleSearchInput(event) {
        state.search = event.target.value || '';
        state.page = 1;
        loadLinhas();
    }

    async function loadLinhas() {
        if (state.loading) return;

        const api = window.App?.api?.linhas;
        if (!api || typeof api.listar !== 'function') {
            renderTableError('API de linhas indisponível.');
            return;
        }

        state.loading = true;
        renderTableLoading();

        const { data, error } = await api.listar({ search: state.search });
        state.loading = false;

        if (error) {
            renderTableError(error.message);
            setText('linhas-summary', 'Erro ao carregar as linhas.');
            return;
        }

        state.records = data || [];
        const totalPages = getTotalPages();
        if (state.page > totalPages) {
            state.page = totalPages;
        }

        renderSummary();
        renderTable();
    }

    function renderSummary() {
        const total = state.records.length;
        const simCard = state.records.filter((item) => String(item.tipo || '').toLowerCase() === 'simcard').length;
        const eSim = state.records.filter((item) => String(item.tipo || '').toUpperCase() === 'E-SIM').length;
        setText('linhas-summary', `${total} linhas cadastradas • ${simCard} simCard • ${eSim} E-SIM`);
    }

    function getTotalPages() {
        return Math.max(1, Math.ceil(state.records.length / state.pageSize));
    }

    function renderTable() {
        const tbody = document.getElementById('linhas-tbody');
        if (!tbody) return;

        const start = (state.page - 1) * state.pageSize;
        const rows = state.records.slice(start, start + state.pageSize);
        const admin = hasAdminAccess();

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="table-state">
                            <div class="icon">📱</div>
                            <div>Nenhuma linha encontrada.</div>
                        </div>
                    </td>
                </tr>
            `;
            renderPagination();
            return;
        }

        tbody.innerHTML = rows.map((item) => `
            <tr>
                <td>${escapeHtml(item.loja || '—')}</td>
                <td>${escapeHtml(item.usuario || '—')}</td>
                <td>${escapeHtml(item.dpto || '—')}</td>
                <td>${escapeHtml(item.cargo || '—')}</td>
                <td>${escapeHtml(item.ddd || '—')}</td>
                <td>${escapeHtml(item.linha || '—')}</td>
                <td>${escapeHtml(item.tipo || '—')}</td>
                <td>
                    ${admin
            ? `<div class="row-actions">
                            <button class="btn-row primary" data-action="edit" data-id="${item.id}">Editar</button>
                            <button class="btn-row danger" data-action="delete" data-id="${item.id}" data-nome="${escapeHtmlAttribute(item.usuario || item.linha || '')}">Excluir</button>
                        </div>`
            : '<span style="font-size:0.68rem;color:var(--text-muted)">Somente leitura</span>'
}
                </td>
            </tr>
        `).join('');

        renderPagination();
    }

    function renderPagination() {
        const container = document.getElementById('linhas-pagination');
        if (!container) return;

        const totalPages = getTotalPages();
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        const parts = [];
        parts.push(`<button class="page-btn" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹</button>`);
        for (let i = 1; i <= totalPages; i += 1) {
            const edge = i === 1 || i === totalPages;
            const nearby = Math.abs(i - state.page) <= 2;
            if (edge || nearby) {
                parts.push(`<button class="page-btn ${i === state.page ? 'active' : ''}" data-page="${i}">${i}</button>`);
            } else if (Math.abs(i - state.page) === 3) {
                parts.push('<span style="color:var(--text-muted);padding:0 4px">…</span>');
            }
        }
        parts.push(`<button class="page-btn" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>›</button>`);
        container.innerHTML = parts.join('');
    }

    function renderTableLoading() {
        const tbody = document.getElementById('linhas-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando linhas...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderTableError(message) {
        const tbody = document.getElementById('linhas-tbody');
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

    function handlePaginationClick(event) {
        const button = event.target.closest('[data-page]');
        if (!button) return;

        const next = Number(button.dataset.page);
        if (!Number.isFinite(next)) return;
        if (next < 1 || next > getTotalPages()) return;

        state.page = next;
        renderTable();
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!hasAdminAccess()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const api = window.App?.api?.linhas;
        if (!api) {
            notify('API de linhas indisponível.', 'error');
            return;
        }

        const payload = collectFormData();
        const validationError = validateFormData(payload);
        if (validationError) {
            notify(validationError, 'error');
            return;
        }

        const id = Number(document.getElementById('linhas-id')?.value || 0);
        const operation = id > 0
            ? api.atualizar(id, payload)
            : api.criar(payload);

        const { error } = await operation;
        if (error) {
            notify(error.message, 'error');
            return;
        }

        notify(id > 0 ? 'Linha atualizada.' : 'Linha criada.', 'success');
        resetForm();
        closeLinhasModal();
        await loadLinhas();
        document.dispatchEvent(new CustomEvent('app:linhas-updated'));
    }

    function collectFormData() {
        return {
            loja: document.getElementById('linhas-form-loja')?.value || '',
            usuario: document.getElementById('linhas-form-usuario')?.value || '',
            dpto: document.getElementById('linhas-form-dpto')?.value || '',
            cargo: document.getElementById('linhas-form-cargo')?.value || '',
            ddd: (document.getElementById('linhas-form-ddd')?.value || '').replace(/\D+/g, ''),
            linha: document.getElementById('linhas-form-linha')?.value || '',
            tipo: document.getElementById('linhas-form-tipo')?.value || '',
        };
    }

    function validateFormData(payload) {
        const loja = String(payload.loja || '').trim();
        const usuario = String(payload.usuario || '').trim();
        const dpto = String(payload.dpto || '').trim();
        const cargo = String(payload.cargo || '').trim();
        const ddd = String(payload.ddd || '').trim();
        const linha = String(payload.linha || '').trim();
        const tipo = String(payload.tipo || '').trim();

        if (!loja || !usuario || !dpto || !cargo || !ddd || !linha || !tipo) {
            return 'Preencha LOJA, USUÁRIO, DPTO, CARGO, DDD, LINHA e TIPO.';
        }

        if (!/^\d{2}$/.test(ddd)) {
            return 'DDD inválido. Use 2 dígitos.';
        }

        const linhaDigits = linha.replace(/\D+/g, '');
        if (!/^\d{8,}$/.test(linhaDigits)) {
            return 'Linha inválida. Informe apenas números.';
        }

        return null;
    }

    async function handleTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;
        if (!hasAdminAccess()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        if (button.dataset.action === 'edit') {
            fillFormForEdit(id);
            return;
        }

        if (button.dataset.action === 'delete') {
            const nome = button.dataset.nome || 'esta linha';
            const ok = await askConfirmation({
                title: 'Excluir linha',
                message: `Excluir ${nome}?`,
                confirmText: 'Excluir',
            });
            if (!ok) return;

            const { error } = await window.App.api.linhas.remover(id);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Linha removida.', 'success');
            resetForm();
            await loadLinhas();
            document.dispatchEvent(new CustomEvent('app:linhas-updated'));
        }
    }

    function fillFormForEdit(id) {
        const record = state.records.find((item) => item.id === id);
        if (!record) return;

        setValue('linhas-id', String(record.id));
        setValue('linhas-form-loja', record.loja || '');
        setValue('linhas-form-usuario', record.usuario || '');
        setValue('linhas-form-dpto', record.dpto || '');
        setValue('linhas-form-cargo', record.cargo || '');
        setValue('linhas-form-ddd', record.ddd || '');
        setValue('linhas-form-linha', record.linha || '');
        setValue('linhas-form-tipo', record.tipo || 'simCard');

        setText('linhas-submit-btn', 'Atualizar Linha');
        toggleDisplay('linhas-cancel-btn', true);
        openLinhasModal();
        setTimeout(() => document.getElementById('linhas-form-usuario')?.focus(), 30);
    }

    function resetForm() {
        setValue('linhas-id', '');
        setValue('linhas-form-loja', '');
        setValue('linhas-form-usuario', '');
        setValue('linhas-form-dpto', '');
        setValue('linhas-form-cargo', '');
        setValue('linhas-form-ddd', '');
        setValue('linhas-form-linha', '');
        setValue('linhas-form-tipo', 'simCard');

        setText('linhas-submit-btn', 'Salvar Linha');
        toggleDisplay('linhas-cancel-btn', false);
    }

    function syncAdminControls() {
        const createBtn = document.getElementById('linhas-new-btn');
        if (!createBtn) return;

        const admin = hasAdminAccess();
        createBtn.style.display = admin ? '' : 'none';
        createBtn.disabled = !admin;

        if (!admin) {
            closeLinhasModal();
            resetForm();
        }
    }

    function bindLinhasModal() {
        const modal = document.getElementById('linhas-modal');
        if (!modal) return;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                resetForm();
                closeLinhasModal();
            }
        });

        modal.querySelectorAll('[data-action="close-linhas-modal"]').forEach((button) => {
            button.addEventListener('click', () => {
                resetForm();
                closeLinhasModal();
            });
        });
    }

    function openLinhasModal() {
        const modal = document.getElementById('linhas-modal');
        if (!modal) return;
        modal.hidden = false;
    }

    function closeLinhasModal() {
        const modal = document.getElementById('linhas-modal');
        if (!modal) return;
        modal.hidden = true;
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
        const element = document.getElementById(id);
        if (element) element.value = value;
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    function toggleDisplay(id, visible) {
        const element = document.getElementById(id);
        if (!element) return;
        element.style.display = visible ? '' : 'none';
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

    window.onLinhasActivate = onLinhasActivate;
    window.loadLinhas = loadLinhas;

    document.addEventListener('DOMContentLoaded', initLinhas);
})();
