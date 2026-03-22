/**
 * historico.js
 * Renders and manages the Histórico de Acessos page.
 * Depends on: supabase.js
 */

// ─── STATE ───────────────────────────────────────────
const _state = {
    records:     [],
    search:      '',
    statusFilter: '',
    ufFilter:    '',
    page:        1,
    pageSize:    20,
    loading:     false,
    stats:       { total: 0, ativos: 0, revogados: 0 },
};

// ─── INIT ─────────────────────────────────────────────

function initHistorico() {
    const page = document.getElementById('page-historico');
    if (!page) return;

    // Wire toolbar inputs
    const searchEl = document.getElementById('hist-search');
    const statusEl = document.getElementById('hist-filter-status');
    const ufEl     = document.getElementById('hist-filter-uf');

    if (searchEl) searchEl.addEventListener('input',  debounce(e => { _state.search = e.target.value; _state.page = 1; loadHistorico(); }, 350));
    if (statusEl) statusEl.addEventListener('change', e => { _state.statusFilter = e.target.value; _state.page = 1; loadHistorico(); });
    if (ufEl)     ufEl.addEventListener('change',     e => { _state.ufFilter = e.target.value;     _state.page = 1; loadHistorico(); });

    document.getElementById('hist-refresh-btn')?.addEventListener('click', loadHistorico);
}

/** Called from nav.js whenever the historico page becomes active. */
function onHistoricoActivate() {
    loadHistorico();
}

// ─── LOAD ─────────────────────────────────────────────

async function loadHistorico() {
    if (_state.loading) return;
    _state.loading = true;
    renderTableLoading();

    const { data, error } = await dbListarAcessos({
        search: _state.search,
        status: _state.statusFilter,
        uf:     _state.ufFilter,
        limit:  500, // load up to 500, paginate client-side
    });

    _state.loading = false;

    if (error) {
        renderTableError(error.message);
        return;
    }

    _state.records = data ?? [];
    _state.page    = 1;
    updateStats();
    renderTable();
}

// ─── STATS ────────────────────────────────────────────

function updateStats() {
    const r = _state.records;
    _state.stats = {
        total:     r.length,
        ativos:    r.filter(x => x.status === 'ativo').length,
        revogados: r.filter(x => x.status === 'revogado').length,
    };
    document.getElementById('stat-total')?.setAttribute('data-val', _state.stats.total);
    document.getElementById('stat-ativos')?.setAttribute('data-val', _state.stats.ativos);
    document.getElementById('stat-revogados')?.setAttribute('data-val', _state.stats.revogados);

    // Animate numbers
    ['stat-total','stat-ativos','stat-revogados'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = el.getAttribute('data-val');
    });
}

// ─── TABLE RENDER ─────────────────────────────────────

function renderTable() {
    const tbody = document.getElementById('hist-tbody');
    if (!tbody) return;

    const start = (_state.page - 1) * _state.pageSize;
    const slice = _state.records.slice(start, start + _state.pageSize);

    if (slice.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="table-state">
                    <div class="icon">🗂️</div>
                    <div>Nenhum registro encontrado.</div>
                </div>
            </td></tr>`;
        renderPagination();
        return;
    }

    tbody.innerHTML = slice.map(row => buildTableRow(row)).join('');
    renderPagination();
}

function buildTableRow(r) {
    const pill   = `<span class="status-pill ${r.status}">${r.status === 'ativo' ? '● Ativo' : '✕ Revogado'}</span>`;
    const login  = r.login_email ? `<span class="cred-chip" title="Clique para copiar" onclick="copiarTexto(this,'${escHtml(r.login_email)}')">${escHtml(r.login_email)}</span>` : '<span style="color:var(--text-muted)">—</span>';
    const data   = formatDateBR(r.criado_em);

    return `
    <tr data-id="${r.id}">
        <td style="font-weight:600;color:var(--text)">${escHtml(r.nome)}</td>
        <td><span class="uf-badge">${r.uf}</span></td>
        <td style="color:var(--text-soft)">${escHtml(r.cargo)}</td>
        <td>${login}</td>
        <td>${pill}</td>
        <td style="color:var(--text-muted);font-size:0.68rem">${data}</td>
        <td>
            <div class="row-actions">
                <button class="btn-row primary" onclick="abrirDetalhe(${r.id})">Ver</button>
                ${r.status === 'ativo'
                    ? `<button class="btn-row danger" onclick="confirmarRevogacao(${r.id})">Revogar</button>`
                    : `<button class="btn-row success" onclick="reativarAcesso(${r.id})">Reativar</button>`
                }
            </div>
        </td>
    </tr>`;
}

function renderTableLoading() {
    const tbody = document.getElementById('hist-tbody');
    if (!tbody) return;
    tbody.innerHTML = `
        <tr><td colspan="8">
            <div class="table-state">
                <div class="spinner"></div>
                <div>Carregando registros...</div>
            </div>
        </td></tr>`;
}

function renderTableError(msg) {
    const tbody = document.getElementById('hist-tbody');
    if (!tbody) return;
    tbody.innerHTML = `
        <tr><td colspan="8">
            <div class="table-state">
                <div class="icon">⚠️</div>
                <div>Erro ao carregar dados.<br><small style="color:var(--danger)">${escHtml(msg)}</small></div>
            </div>
        </td></tr>`;
}

// ─── PAGINATION ───────────────────────────────────────

function renderPagination() {
    const container = document.getElementById('hist-pagination');
    if (!container) return;

    const total = _state.records.length;
    const pages = Math.ceil(total / _state.pageSize);

    if (pages <= 1) { container.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="setPage(${_state.page - 1})" ${_state.page === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - _state.page) <= 2) {
            html += `<button class="page-btn ${i === _state.page ? 'active' : ''}" onclick="setPage(${i})">${i}</button>`;
        } else if (Math.abs(i - _state.page) === 3) {
            html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
        }
    }
    html += `<button class="page-btn" onclick="setPage(${_state.page + 1})" ${_state.page === pages ? 'disabled' : ''}>›</button>`;
    container.innerHTML = html;
}

function setPage(n) {
    const pages = Math.ceil(_state.records.length / _state.pageSize);
    if (n < 1 || n > pages) return;
    _state.page = n;
    renderTable();
    document.getElementById('page-historico')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── DETAIL MODAL ─────────────────────────────────────

async function abrirDetalhe(id) {
    const { data: r, error } = await dbBuscarAcesso(id);
    if (error || !r) { alert('Erro ao carregar registro.'); return; }

    const credRow = (label, login, senhaHash) => {
        if (!login) return '';
        const hashDisplay = senhaHash
            ? `<span title="${escHtml(senhaHash)}" style="font-family:var(--mono);font-size:0.62rem;color:var(--text-muted);background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:3px 8px;display:inline-flex;align-items:center;gap:5px;cursor:default">
                   🔒 bcrypt hash
               </span>`
            : `<span style="color:var(--text-muted);font-size:0.72rem">—</span>`;

        return `
        <div class="detail-field-label">${label} — Login</div>
        <div class="detail-field-value">
            <span class="cred-chip" onclick="copiarTexto(this,'${escHtml(login)}')">${escHtml(login)}</span>
        </div>
        <div class="detail-field-label">${label} — Senha</div>
        <div class="detail-field-value">${hashDisplay}</div>`;
    };

    const revInfo = r.status === 'revogado' ? `
        <div style="background:rgba(240,82,82,0.07);border:1px solid rgba(240,82,82,0.2);border-radius:8px;padding:10px 13px;margin-top:12px;font-size:0.72rem;color:var(--danger)">
            <strong>Revogado em</strong> ${formatDateTimeBR(r.revogado_em)}<br>
            ${r.motivo_revogacao ? `<strong>Motivo:</strong> ${escHtml(r.motivo_revogacao)}` : ''}
        </div>` : '';

    const html = `
        <div class="modal-backdrop" id="detalhe-modal" onclick="fecharModalDetalhe(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>👤 ${escHtml(r.nome)}</h3>
                    <button class="modal-close" onclick="fecharModalDetalhe()">✕</button>
                </div>
                <div class="modal-body">
                    <div id="detalhe-notify"></div>
                    <div class="detail-grid">
                        <div><div class="detail-field-label">CPF</div><div class="detail-field-value">${escHtml(r.cpf)}</div></div>
                        <div><div class="detail-field-label">Admissão</div><div class="detail-field-value">${formatDateBR(r.data_admissao)}</div></div>
                        <div><div class="detail-field-label">Setor</div><div class="detail-field-value">${escHtml(r.setor)}</div></div>
                        <div><div class="detail-field-label">Cargo</div><div class="detail-field-value">${escHtml(r.cargo)}</div></div>
                        <div><div class="detail-field-label">UF / Cidade</div><div class="detail-field-value">${r.uf} — ${escHtml(r.cidade)}</div></div>
                        <div><div class="detail-field-label">Status</div><div class="detail-field-value"><span class="status-pill ${r.status}">${r.status}</span></div></div>
                    </div>

                    <div class="section-label" style="margin-top:16px">Credenciais</div>
                    <div class="detail-grid">
                        ${credRow('E-mail',   r.login_email,    r.senha_email)}
                        ${credRow('WTS',      r.login_wts,      r.senha_wts)}
                        ${credRow('Helpdesk', r.login_helpdesk, r.senha_helpdesk)}
                        ${credRow('Nyxos',    r.login_nyxos,    r.senha_nyxos)}
                    </div>
                    ${revInfo}
                </div>
                <div class="modal-footer">
                    <button class="btn-row" onclick="fecharModalDetalhe()">Fechar</button>
                    ${r.status === 'ativo'
                        ? `<button class="btn-row danger" onclick="confirmarRevogacao(${r.id}, true)">Revogar acesso</button>`
                        : `<button class="btn-row success" onclick="reativarAcesso(${r.id}, true)">Reativar acesso</button>`}
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
}

function fecharModalDetalhe(event) {
    if (event && event.target !== document.getElementById('detalhe-modal')) return;
    document.getElementById('detalhe-modal')?.remove();
}

// ─── REVOKE MODAL ─────────────────────────────────────

function confirmarRevogacao(id, fromDetalhe = false) {
    const html = `
        <div class="modal-backdrop" id="revoke-modal" onclick="fecharRevokeModal(event)">
            <div class="modal" style="max-width:420px" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>⚠ Revogar Acesso</h3>
                    <button class="modal-close" onclick="fecharRevokeModal()">✕</button>
                </div>
                <div class="modal-body">
                    <p style="font-size:0.8rem;color:var(--text-soft);margin-bottom:12px">
                        Os acessos deste colaborador serão marcados como <strong style="color:var(--danger)">revogados</strong>. Esta ação pode ser desfeita.
                    </p>
                    <label class="form-group">
                        <span style="font-size:0.7rem;font-weight:600;color:var(--text-soft)">Motivo (opcional)</span>
                        <textarea class="modal-textarea" id="revoke-motivo" placeholder="Ex: desligamento, férias, mudança de função..."></textarea>
                    </label>
                </div>
                <div class="modal-footer">
                    <button class="btn-row" onclick="fecharRevokeModal()">Cancelar</button>
                    <button class="btn-row danger" onclick="executarRevogacao(${id}, ${fromDetalhe})">Confirmar revogação</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function fecharRevokeModal(event) {
    if (event && event.target !== document.getElementById('revoke-modal')) return;
    document.getElementById('revoke-modal')?.remove();
}

async function executarRevogacao(id, fromDetalhe = false) {
    const motivo = document.getElementById('revoke-motivo')?.value ?? '';
    fecharRevokeModal();
    if (fromDetalhe) fecharModalDetalhe();

    const { error } = await dbRevogarAcesso(id, motivo);
    if (error) { showToast('Erro ao revogar: ' + error.message, 'error'); return; }

    showToast('Acesso revogado com sucesso.', 'success');
    await loadHistorico();
}

async function reativarAcesso(id, fromDetalhe = false) {
    if (fromDetalhe) fecharModalDetalhe();

    const { error } = await dbReativarAcesso(id);
    if (error) { showToast('Erro ao reativar: ' + error.message, 'error'); return; }

    showToast('Acesso reativado com sucesso.', 'success');
    await loadHistorico();
}

// ─── TOAST NOTIFICATION ───────────────────────────────

function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:999;
        padding:10px 16px;border-radius:8px;font-size:0.78rem;font-weight:600;
        font-family:var(--font);box-shadow:0 4px 20px rgba(0,0,0,0.4);
        animation:fadeIn 0.2s ease;
        background:${type === 'success' ? 'rgba(56,217,169,0.15)' : 'rgba(240,82,82,0.15)'};
        border:1px solid ${type === 'success' ? 'rgba(56,217,169,0.3)' : 'rgba(240,82,82,0.3)'};
        color:${type === 'success' ? 'var(--accent2)' : 'var(--danger)'};
    `;
    toast.textContent = (type === 'success' ? '✓ ' : '⚠ ') + msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ─── CLIPBOARD HELPER ─────────────────────────────────

function copiarTexto(el, text) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = el.textContent;
        el.textContent = '✓ Copiado';
        el.style.borderColor = 'var(--accent2)';
        setTimeout(() => { el.textContent = orig; el.style.borderColor = ''; }, 1500);
    });
}

// ─── UTILS ────────────────────────────────────────────

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── INTEGRATION: hook into gerador save ─────────────
// After a successful generation, also persist to Supabase.
// This wraps the original handleFormSubmit defined in gerador-ui.js.

document.addEventListener('DOMContentLoaded', () => {
    initHistorico();

    // Patch the form submit to also call dbSalvarAcesso
    const form = document.getElementById('admission-form');
    if (!form) return;

    form.addEventListener('acesso-gerado', async (e) => {
        const { admissionData, acessos } = e.detail;
        const { error } = await dbSalvarAcesso(admissionData, acessos);
        if (error) {
            console.error('[Supabase] Erro ao salvar acesso:', error.message);
            showToast('Acesso gerado mas não salvo no banco: ' + error.message, 'error');
        } else {
            showToast('Acesso salvo no histórico ✓', 'success');
        }
    });
});
