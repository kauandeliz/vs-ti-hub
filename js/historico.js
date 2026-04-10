/**
 * historico.js
 *
 * Página Histórico de Acessos.
 */

(function bootstrapHistorico() {
    'use strict';

    const state = {
        records: [],
        search: '',
        statusFilter: '',
        ufFilter: '',
        page: 1,
        pageSize: 20,
        loading: false,
        initialized: false,
    };

    function initHistorico() {
        if (state.initialized) return;

        const page = document.getElementById('page-historico');
        if (!page) return;

        const searchInput = document.getElementById('hist-search');
        const statusSelect = document.getElementById('hist-filter-status');
        const ufSelect = document.getElementById('hist-filter-uf');

        searchInput?.addEventListener('input', debounce((event) => {
            state.search = event.target.value || '';
            state.page = 1;
            loadHistorico();
        }, 300));

        statusSelect?.addEventListener('change', (event) => {
            state.statusFilter = event.target.value || '';
            state.page = 1;
            loadHistorico();
        });

        ufSelect?.addEventListener('change', (event) => {
            state.ufFilter = event.target.value || '';
            state.page = 1;
            loadHistorico();
        });

        syncUfFilterOptions();

        document.getElementById('hist-refresh-btn')?.addEventListener('click', loadHistorico);
        document.getElementById('hist-tbody')?.addEventListener('click', handleTableActionClick);
        document.getElementById('hist-pagination')?.addEventListener('click', handlePaginationClick);

        document.addEventListener('app:acesso-salvo', () => {
            if (isHistoricoActive()) {
                loadHistorico();
            }
        });

        document.addEventListener('app:catalog-updated', () => {
            syncUfFilterOptions();
        });

        document.addEventListener('app:auth-changed', (event) => {
            if (!event.detail?.user) {
                resetHistoricoState();
            }
        });

        state.initialized = true;
    }

    function isHistoricoActive() {
        return document.getElementById('page-historico')?.classList.contains('active');
    }

    function resetHistoricoState() {
        state.records = [];
        state.page = 1;
        updateStats();
        renderTable();
    }

    async function onHistoricoActivate() {
        if (!getCurrentUser()) return;
        await syncUfFilterOptions();
        await loadHistorico();
    }

    async function syncUfFilterOptions() {
        const ufSelect = document.getElementById('hist-filter-uf');
        if (!ufSelect) return;

        const previousValue = ufSelect.value || state.ufFilter || '';
        const snapshotGetter = window.App?.api?.catalog?.getCatalogSnapshot;

        if (typeof snapshotGetter !== 'function') {
            return;
        }

        const { data, error } = await snapshotGetter({ force: false, apenasAtivos: true });
        if (error) {
            return;
        }

        const ufs = Array.isArray(data?.ufs) ? data.ufs : [];
        ufSelect.innerHTML = '<option value=\"\">Todos os estados</option>';
        ufs.forEach((uf) => {
            ufSelect.add(new Option(uf, uf));
        });

        if (previousValue && ufs.includes(previousValue)) {
            ufSelect.value = previousValue;
            state.ufFilter = previousValue;
        } else {
            ufSelect.value = '';
            state.ufFilter = '';
        }
    }

    async function loadHistorico() {
        if (state.loading) return;

        state.loading = true;
        renderTableLoading();

        const { data, error } = await dbListarAcessos({
            search: state.search,
            status: state.statusFilter,
            uf: state.ufFilter,
            limit: 500,
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

        updateStats();
        renderTable();
    }

    function updateStats() {
        const total = state.records.length;
        const ativos = state.records.filter((record) => record.status === 'ativo').length;
        const revogados = state.records.filter((record) => record.status === 'revogado').length;

        setText('stat-total', String(total));
        setText('stat-ativos', String(ativos));
        setText('stat-revogados', String(revogados));
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function renderTable() {
        const tbody = document.getElementById('hist-tbody');
        if (!tbody) return;

        const start = (state.page - 1) * state.pageSize;
        const rows = state.records.slice(start, start + state.pageSize);

        if (rows.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="table-state">
                            <div class="icon">🗂️</div>
                            <div>Nenhum registro encontrado.</div>
                        </div>
                    </td>
                </tr>
            `;
            renderPagination();
            return;
        }

        tbody.innerHTML = rows.map((record) => buildTableRow(record)).join('');
        renderPagination();
    }

    function buildTableRow(record) {
        const rowStatusLabel = record.status === 'ativo' ? '● Ativo' : '✕ Revogado';
        const loginCell = record.login_email
            ? `<span class="cred-chip" title="Copiar login" data-action="copy-login" data-value="${escapeHtml(record.login_email)}">${escapeHtml(record.login_email)}</span>`
            : '<span style="color:var(--text-muted)">—</span>';

        const actionButtons = record.status === 'ativo'
            ? `<button class="btn-row danger" data-action="revoke" data-id="${record.id}">Revogar</button>`
            : `<button class="btn-row success" data-action="reactivate" data-id="${record.id}">Reativar</button>`;

        return `
            <tr data-id="${record.id}">
                <td style="font-weight:600;color:var(--text)">${escapeHtml(record.nome)}</td>
                <td><span class="uf-badge">${escapeHtml(record.uf || '—')}</span></td>
                <td style="color:var(--text-soft)">${escapeHtml(record.cargo || '—')}</td>
                <td>${loginCell}</td>
                <td><span class="status-pill ${escapeHtml(record.status)}">${rowStatusLabel}</span></td>
                <td style="color:var(--text-muted);font-size:0.68rem">${formatDateBR(record.criado_em)}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn-row primary" data-action="view" data-id="${record.id}">Ver</button>
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
    }

    function renderTableLoading() {
        const tbody = document.getElementById('hist-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando registros...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderTableError(message) {
        const tbody = document.getElementById('hist-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="table-state">
                        <div class="icon">⚠️</div>
                        <div>Erro ao carregar dados.<br><small style="color:var(--danger)">${escapeHtml(message)}</small></div>
                    </div>
                </td>
            </tr>
        `;
    }

    function getTotalPages() {
        return Math.max(1, Math.ceil(state.records.length / state.pageSize));
    }

    function renderPagination() {
        const pagination = document.getElementById('hist-pagination');
        if (!pagination) return;

        const totalPages = getTotalPages();
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        const parts = [];
        parts.push(`<button class="page-btn" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹</button>`);

        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
            const isEdge = pageNumber === 1 || pageNumber === totalPages;
            const isNearCurrent = Math.abs(pageNumber - state.page) <= 2;

            if (isEdge || isNearCurrent) {
                parts.push(`<button class="page-btn ${pageNumber === state.page ? 'active' : ''}" data-page="${pageNumber}">${pageNumber}</button>`);
            } else if (Math.abs(pageNumber - state.page) === 3) {
                parts.push('<span style="color:var(--text-muted);padding:0 4px">…</span>');
            }
        }

        parts.push(`<button class="page-btn" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>›</button>`);
        pagination.innerHTML = parts.join('');
    }

    async function handleTableActionClick(event) {
        const copyTarget = event.target.closest('[data-action="copy-login"]');
        if (copyTarget) {
            await copyValue(copyTarget, copyTarget.dataset.value || '');
            return;
        }

        const actionButton = event.target.closest('[data-action][data-id]');
        if (!actionButton) return;

        const id = Number(actionButton.dataset.id);
        if (!Number.isFinite(id)) return;

        const action = actionButton.dataset.action;

        if (action === 'view') {
            await abrirDetalhe(id);
            return;
        }

        if (action === 'revoke') {
            confirmarRevogacao(id);
            return;
        }

        if (action === 'reactivate') {
            await reativarAcesso(id);
        }
    }

    function handlePaginationClick(event) {
        const button = event.target.closest('[data-page]');
        if (!button) return;

        const nextPage = Number(button.dataset.page);
        if (!Number.isFinite(nextPage)) return;

        const totalPages = getTotalPages();
        if (nextPage < 1 || nextPage > totalPages) return;

        state.page = nextPage;
        renderTable();
        document.getElementById('page-historico')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function abrirDetalhe(id) {
        const { data: record, error } = await dbBuscarAcesso(id);
        if (error || !record) {
            showToast('Erro ao carregar detalhes do registro.', 'error');
            return;
        }

        const modal = buildDetalheModal(record);
        document.body.appendChild(modal);

        modal.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.remove();
            }
        });

        modal.querySelectorAll('[data-action="copy-value"]').forEach((button) => {
            button.addEventListener('click', async () => {
                const value = button.dataset.value || '';
                await copyValue(button, value, true);
            });
        });

        modal.querySelector('[data-action="revoke-detail"]')?.addEventListener('click', () => {
            modal.remove();
            confirmarRevogacao(id);
        });

        modal.querySelector('[data-action="reactivate-detail"]')?.addEventListener('click', async () => {
            modal.remove();
            await reativarAcesso(id);
        });
    }

    function buildDetalheModal(record) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';

        const revocationInfo = record.status === 'revogado'
            ? `
                <div style="background:rgba(240,82,82,0.07);border:1px solid rgba(240,82,82,0.2);border-radius:8px;padding:10px 13px;margin-top:12px;font-size:0.72rem;color:var(--danger)">
                    <strong>Revogado em</strong> ${formatDateTimeBR(record.revogado_em)}<br>
                    ${record.motivo_revogacao ? `<strong>Motivo:</strong> ${escapeHtml(record.motivo_revogacao)}` : ''}
                </div>
            `
            : '';

        const credRows = [
            buildCredentialRows('E-mail', record.login_email, record.senha_email),
            buildCredentialRows('WTS', record.login_wts, record.senha_wts),
            buildCredentialRows('Helpdesk', record.login_helpdesk, record.senha_helpdesk),
            buildCredentialRows('Nyxos', record.login_nyxos, record.senha_nyxos),
        ].join('');

        modal.innerHTML = `
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>👤 ${escapeHtml(record.nome)}</h3>
                    <button class="modal-close" data-action="close-modal">✕</button>
                </div>

                <div class="modal-body">
                    <div class="detail-grid">
                        <div><div class="detail-field-label">CPF</div><div class="detail-field-value">${escapeHtml(record.cpf)}</div></div>
                        <div><div class="detail-field-label">Admissão</div><div class="detail-field-value">${formatDateBR(record.data_admissao)}</div></div>
                        <div><div class="detail-field-label">Setor</div><div class="detail-field-value">${escapeHtml(record.setor || '—')}</div></div>
                        <div><div class="detail-field-label">Cargo</div><div class="detail-field-value">${escapeHtml(record.cargo || '—')}</div></div>
                        <div><div class="detail-field-label">UF / Cidade</div><div class="detail-field-value">${escapeHtml(record.uf || '—')} - ${escapeHtml(record.cidade || '—')}</div></div>
                        <div><div class="detail-field-label">Status</div><div class="detail-field-value"><span class="status-pill ${escapeHtml(record.status)}">${escapeHtml(record.status)}</span></div></div>
                    </div>

                    <div class="section-label" style="margin-top:16px">Credenciais</div>
                    <div class="detail-grid">${credRows}</div>
                    ${revocationInfo}
                </div>

                <div class="modal-footer">
                    <button class="btn-row" data-action="close-modal">Fechar</button>
                    ${record.status === 'ativo'
                        ? '<button class="btn-row danger" data-action="revoke-detail">Revogar acesso</button>'
                        : '<button class="btn-row success" data-action="reactivate-detail">Reativar acesso</button>'}
                </div>
            </div>
        `;

        return modal;
    }

    function buildCredentialRows(label, login, senhaHash) {
        if (!login) return '';

        const hashView = senhaHash
            ? `<span title="${escapeHtml(senhaHash)}" style="font-family:var(--mono);font-size:0.62rem;color:var(--text-muted);background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:3px 8px;display:inline-flex;align-items:center;gap:5px;cursor:default">🔒 bcrypt hash</span>`
            : '<span style="color:var(--text-muted);font-size:0.72rem">—</span>';

        return `
            <div class="detail-field-label">${label} - Login</div>
            <div class="detail-field-value">
                <span class="cred-chip" data-action="copy-value" data-value="${escapeHtml(login)}">${escapeHtml(login)}</span>
            </div>
            <div class="detail-field-label">${label} - Senha</div>
            <div class="detail-field-value">${hashView}</div>
        `;
    }

    function confirmarRevogacao(id) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';

        modal.innerHTML = `
            <div class="modal" style="max-width:420px" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>⚠ Revogar Acesso</h3>
                    <button class="modal-close" data-action="close">✕</button>
                </div>
                <div class="modal-body">
                    <p style="font-size:0.8rem;color:var(--text-soft);margin-bottom:12px">
                        Este acesso será marcado como <strong style="color:var(--danger)">revogado</strong>.
                    </p>
                    <label class="form-group">
                        <span style="font-size:0.7rem;font-weight:600;color:var(--text-soft)">Motivo (opcional)</span>
                        <textarea class="modal-textarea" id="hist-revoke-reason" placeholder="Ex: desligamento, férias, mudança de função..."></textarea>
                    </label>
                </div>
                <div class="modal-footer">
                    <button class="btn-row" data-action="close">Cancelar</button>
                    <button class="btn-row danger" data-action="confirm">Confirmar</button>
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

        modal.querySelector('[data-action="confirm"]')?.addEventListener('click', async () => {
            const reason = modal.querySelector('#hist-revoke-reason')?.value || '';
            close();
            await executarRevogacao(id, reason);
        });
    }

    async function executarRevogacao(id, motivo) {
        const { error } = await dbRevogarAcesso(id, motivo || '');
        if (error) {
            showToast('Erro ao revogar: ' + error.message, 'error');
            return;
        }

        showToast('Acesso revogado com sucesso.', 'success');
        await loadHistorico();
    }

    async function reativarAcesso(id) {
        const { error } = await dbReativarAcesso(id);
        if (error) {
            showToast('Erro ao reativar: ' + error.message, 'error');
            return;
        }

        showToast('Acesso reativado com sucesso.', 'success');
        await loadHistorico();
    }

    async function copyValue(element, value, isModal = false) {
        try {
            await navigator.clipboard.writeText(value);

            const original = element.textContent;
            element.textContent = '✓ Copiado';
            if (!isModal) {
                element.style.borderColor = 'var(--accent2)';
            }

            setTimeout(() => {
                element.textContent = original;
                if (!isModal) {
                    element.style.borderColor = '';
                }
            }, 1200);
        } catch {
            showToast('Não foi possível copiar para a área de transferência.', 'error');
        }
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
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

        setTimeout(() => {
            toast.remove();
        }, 3200);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function debounce(fn, waitMs) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), waitMs);
        };
    }

    window.onHistoricoActivate = onHistoricoActivate;
    window.loadHistorico = loadHistorico;
    window.showToast = showToast;

    document.addEventListener('DOMContentLoaded', initHistorico);
})();
