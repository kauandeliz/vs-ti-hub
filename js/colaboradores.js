/**
 * colaboradores.js
 *
 * CRUD de colaboradores no formato da planilha:
 * STATUS, UF, LOJA, EMPRESA, NOME, SETOR, FUNÇÃO
 */

(function bootstrapColaboradores() {
    'use strict';

    const state = {
        initialized: false,
        loading: false,
        records: [],
        page: 1,
        pageSize: 20,
        search: '',
        statusFilter: '',
    };

    function initColaboradores() {
        if (state.initialized) return;

        document.getElementById('colab-form')?.addEventListener('submit', handleFormSubmit);
        document.getElementById('colab-cancel-btn')?.addEventListener('click', resetForm);
        document.getElementById('colab-refresh-btn')?.addEventListener('click', loadColaboradores);
        document.getElementById('colab-filter-status')?.addEventListener('change', handleStatusChange);
        document.getElementById('colab-search')?.addEventListener('input', debounce(handleSearchInput, 300));
        document.getElementById('colab-tbody')?.addEventListener('click', handleTableClick);
        document.getElementById('colab-pagination')?.addEventListener('click', handlePaginationClick);

        document.addEventListener('app:auth-changed', (event) => {
            if (!event.detail?.isAdmin) {
                renderRestricted();
                setFormDisabled(true);
            }
        });

        state.initialized = true;
        resetForm();
    }

    function hasAdminAccess() {
        return typeof window.isAdmin === 'function' ? window.isAdmin() : false;
    }

    async function onColaboradoresActivate() {
        if (!hasAdminAccess()) {
            renderRestricted();
            setFormDisabled(true);
            return;
        }

        setFormDisabled(false);
        await loadColaboradores();
    }

    function handleSearchInput(event) {
        state.search = event.target.value || '';
        state.page = 1;
        loadColaboradores();
    }

    function handleStatusChange(event) {
        state.statusFilter = event.target.value || '';
        state.page = 1;
        loadColaboradores();
    }

    async function loadColaboradores() {
        if (!hasAdminAccess()) {
            renderRestricted();
            return;
        }

        if (state.loading) return;
        state.loading = true;
        renderTableLoading();

        const { data, error } = await window.App.api.colaboradores.listar({
            search: state.search,
            status: state.statusFilter,
        });

        state.loading = false;

        if (error) {
            renderTableError(error.message);
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
        const ativos = state.records.filter((item) => getStatusLabel(item.status) === 'ATIVO').length;
        const inativos = state.records.filter((item) => getStatusLabel(item.status) === 'INATIVO').length;
        const outros = total - ativos - inativos;

        let summary = `${total} colaboradores • ${ativos} ativos • ${inativos} inativos`;
        if (outros > 0) {
            summary += ` • ${outros} com status diferente`;
        }
        setText('colab-summary', summary);
    }

    function getTotalPages() {
        return Math.max(1, Math.ceil(state.records.length / state.pageSize));
    }

    function renderTable() {
        const tbody = document.getElementById('colab-tbody');
        if (!tbody) return;

        const start = (state.page - 1) * state.pageSize;
        const rows = state.records.slice(start, start + state.pageSize);

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="table-state">
                            <div class="icon">🧑‍💼</div>
                            <div>Nenhum colaborador encontrado.</div>
                        </div>
                    </td>
                </tr>
            `;
            renderPagination();
            return;
        }

        tbody.innerHTML = rows.map((item) => {
            const status = getStatusLabel(item.status);
            let statusPill = '<span class="status-pill ativo">● ATIVO</span>';
            if (status === 'INATIVO') {
                statusPill = '<span class="status-pill revogado">✕ INATIVO</span>';
            } else if (status !== 'ATIVO') {
                statusPill = `<span class="status-pill">${escapeHtml(status || 'SEM STATUS')}</span>`;
            }

            return `
                <tr>
                    <td>${statusPill}</td>
                    <td>${escapeHtml(item.uf || '—')}</td>
                    <td>${escapeHtml(item.loja || '—')}</td>
                    <td>${escapeHtml(item.empresa || '—')}</td>
                    <td>${escapeHtml(item.nome || '—')}</td>
                    <td>${escapeHtml(item.setor || '—')}</td>
                    <td>${escapeHtml(item.funcao || '—')}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-row primary" data-action="edit" data-id="${item.id}">Editar</button>
                            <button class="btn-row danger" data-action="delete" data-id="${item.id}" data-name="${escapeHtmlAttribute(item.nome || '')}">Excluir</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination();
    }

    function renderPagination() {
        const container = document.getElementById('colab-pagination');
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
        const tbody = document.getElementById('colab-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando colaboradores...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderTableError(message) {
        const tbody = document.getElementById('colab-tbody');
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

    function renderRestricted() {
        const tbody = document.getElementById('colab-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="table-state">
                            <div class="icon">🔒</div>
                            <div>Acesso restrito a administradores.</div>
                        </div>
                    </td>
                </tr>
            `;
        }
        setText('colab-summary', 'Acesso restrito a administradores.');
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
        if (!hasAdminAccess()) return;

        const payload = collectFormData();
        const validation = validateFormData(payload);
        if (validation) {
            showToast(validation, 'error');
            return;
        }

        const id = Number(document.getElementById('colab-id')?.value || 0);
        const api = window.App.api.colaboradores;
        const operation = id > 0
            ? api.atualizar(id, payload)
            : api.criar(payload);

        const { error } = await operation;
        if (error) {
            showToast(error.message, 'error');
            return;
        }

        showToast(id > 0 ? 'Colaborador atualizado.' : 'Colaborador criado.', 'success');
        resetForm();
        await loadColaboradores();
        document.dispatchEvent(new CustomEvent('app:colaboradores-updated'));
    }

    function collectFormData() {
        return {
            status: document.getElementById('colab-form-status')?.value || '',
            uf: document.getElementById('colab-form-uf')?.value || '',
            loja: document.getElementById('colab-form-loja')?.value || '',
            empresa: document.getElementById('colab-form-empresa')?.value || '',
            nome: document.getElementById('colab-form-nome')?.value || '',
            setor: document.getElementById('colab-form-setor')?.value || '',
            funcao: document.getElementById('colab-form-funcao')?.value || '',
        };
    }

    function validateFormData(payload) {
        const status = getNormalizedStatusInput(payload.status);
        const uf = String(payload.uf || '').trim().toUpperCase();
        const loja = String(payload.loja || '').trim();
        const empresa = String(payload.empresa || '').trim();
        const nome = String(payload.nome || '').trim();
        const setor = String(payload.setor || '').trim();
        const funcao = String(payload.funcao || '').trim();

        if (!status || !uf || !loja || !empresa || !nome || !setor || !funcao) {
            return 'Preencha STATUS, UF, LOJA, EMPRESA, NOME, SETOR e FUNÇÃO.';
        }

        if (!/^[A-Z]{2}$/.test(uf)) {
            return 'UF inválida. Use duas letras.';
        }

        return null;
    }

    async function handleTableClick(event) {
        const btn = event.target.closest('[data-action][data-id]');
        if (!btn) return;

        const id = Number(btn.dataset.id);
        if (!Number.isFinite(id)) return;

        if (btn.dataset.action === 'edit') {
            fillFormForEdit(id);
            return;
        }

        if (btn.dataset.action === 'delete') {
            const name = btn.dataset.name || 'este colaborador';
            const ok = window.confirm(`Excluir ${name}?`);
            if (!ok) return;

            const { error } = await window.App.api.colaboradores.remover(id);
            if (error) {
                showToast(error.message, 'error');
                return;
            }

            showToast('Colaborador removido.', 'success');
            resetForm();
            await loadColaboradores();
            document.dispatchEvent(new CustomEvent('app:colaboradores-updated'));
        }
    }

    function fillFormForEdit(id) {
        const record = state.records.find((item) => item.id === id);
        if (!record) return;

        setValue('colab-id', String(record.id));
        setValue('colab-form-status', getNormalizedStatusInput(record.status));
        setValue('colab-form-uf', String(record.uf || '').toUpperCase());
        setValue('colab-form-loja', record.loja || '');
        setValue('colab-form-empresa', record.empresa || '');
        setValue('colab-form-nome', record.nome || '');
        setValue('colab-form-setor', record.setor || '');
        setValue('colab-form-funcao', record.funcao || '');

        setText('colab-submit-btn', 'Atualizar Colaborador');
        toggleDisplay('colab-cancel-btn', true);
        document.getElementById('colab-form-nome')?.focus();
    }

    function resetForm() {
        setValue('colab-id', '');
        setValue('colab-form-status', 'ATIVO');
        setValue('colab-form-uf', '');
        setValue('colab-form-loja', '');
        setValue('colab-form-empresa', '');
        setValue('colab-form-nome', '');
        setValue('colab-form-setor', '');
        setValue('colab-form-funcao', '');

        setText('colab-submit-btn', 'Salvar Colaborador');
        toggleDisplay('colab-cancel-btn', false);
    }

    function setFormDisabled(disabled) {
        const form = document.getElementById('colab-form');
        if (!form) return;

        form.querySelectorAll('input, select, button, textarea').forEach((element) => {
            if (element.id === 'colab-cancel-btn' && element.style.display === 'none') return;
            element.disabled = disabled;
        });
    }

    function getStatusLabel(value) {
        return String(value || '').trim().toUpperCase();
    }

    function getNormalizedStatusInput(value) {
        const status = String(value || '').trim().toUpperCase();
        return status === 'INATIVO' ? 'INATIVO' : 'ATIVO';
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    function toggleDisplay(id, visible) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = visible ? '' : 'none';
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.app-toast');
        if (existing) {
            existing.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'app-toast';
        const isError = type === 'error';

        toast.style.cssText = `
            position:fixed;
            bottom:24px;
            right:24px;
            z-index:999;
            padding:10px 16px;
            border-radius:8px;
            font-size:0.78rem;
            font-weight:600;
            font-family:var(--font);
            box-shadow:0 4px 20px rgba(0,0,0,0.4);
            animation:fadeIn 0.2s ease;
            background:${isError ? 'rgba(240,82,82,0.15)' : 'rgba(56,217,169,0.15)'};
            border:1px solid ${isError ? 'rgba(240,82,82,0.3)' : 'rgba(56,217,169,0.3)'};
            color:${isError ? 'var(--danger)' : 'var(--accent2)'};
        `;
        toast.textContent = `${isError ? '⚠ ' : '✓ '}${message}`;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 3200);
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

    function debounce(fn, waitMs) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), waitMs);
        };
    }

    window.onColaboradoresActivate = onColaboradoresActivate;
    window.loadColaboradores = loadColaboradores;
    window.showToast = window.showToast || showToast;

    document.addEventListener('DOMContentLoaded', initColaboradores);
})();
