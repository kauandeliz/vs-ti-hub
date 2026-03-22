/**
 * usuarios.js
 * Admin-only page: list users, create new users (Supabase sends invite e-mail),
 * and deactivate existing users.
 *
 * Depends on: supabase.js, auth.js
 *
 * NOTE: Creating users requires the Supabase Service Role key, which must
 * NEVER be exposed client-side. This page calls a Supabase Edge Function
 * (`invite-user`) that runs server-side with the service role.
 *
 * The Edge Function code is in: supabase/functions/invite-user/index.ts
 */

// ─── INIT ─────────────────────────────────────────────

function initUsuarios() {
    const form = document.getElementById('new-user-form');
    if (form) form.addEventListener('submit', handleCreateUser);
}

function onUsuariosActivate() {
    if (!isAdmin()) return;
    loadUsuarios();
}

// ─── LOAD USERS LIST ──────────────────────────────────

async function loadUsuarios() {
    renderUsuariosLoading();

    // Call our Edge Function to list users (requires admin)
    const { data: { session } } = await _supabase.auth.getSession();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'list' }),
    });

    const json = await res.json();

    if (!res.ok) {
        renderUsuariosError(json.error ?? 'Erro ao carregar usuários.');
        return;
    }

    renderUsuariosTable(json.users ?? []);
}

// ─── CREATE USER ──────────────────────────────────────

async function handleCreateUser(e) {
    e.preventDefault();

    const nameEl  = document.getElementById('new-user-name');
    const emailEl = document.getElementById('new-user-email');
    const errEl   = document.getElementById('new-user-error');
    const okEl    = document.getElementById('new-user-ok');
    const btn     = document.getElementById('new-user-btn');

    errEl.style.display = 'none';
    okEl.style.display  = 'none';

    const name  = nameEl.value.trim();
    const email = emailEl.value.trim();

    if (!name || !email) {
        showFormMsg(errEl, 'Preencha nome e e-mail.');
        return;
    }

    btn.disabled    = true;
    btn.textContent = 'Enviando...';

    const { data: { session } } = await _supabase.auth.getSession();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'invite', name, email }),
    });

    const json = await res.json();
    btn.disabled    = false;
    btn.textContent = '✉ Enviar convite';

    if (!res.ok) {
        showFormMsg(errEl, json.error ?? 'Erro ao criar usuário.');
        return;
    }

    showFormMsg(okEl, `Convite enviado para ${email} ✓`);
    nameEl.value  = '';
    emailEl.value = '';
    loadUsuarios(); // Refresh list
}

// ─── DEACTIVATE / REACTIVATE USER ────────────────────

async function desativarUsuario(userId, email) {
    if (!confirm(`Desativar o acesso de ${email}?\nO usuário não conseguirá mais fazer login.`)) return;
    await callAdminAction('deactivate', { userId }, `Usuário ${email} desativado.`);
}

async function reativarUsuario(userId, email) {
    if (!confirm(`Reativar o acesso de ${email}?`)) return;
    await callAdminAction('reactivate', { userId }, `Usuário ${email} reativado.`);
}

// ─── CHANGE PASSWORD MODAL ────────────────────────────

/**
 * Open the change-password modal.
 * @param {string} userId
 * @param {string} name    - Display name for the modal title
 * @param {boolean} isSelf - True when admin is changing their own password
 */
function abrirTrocaSenha(userId, name, isSelf = false) {
    // If changing own password, use Supabase Auth directly (no admin API needed)
    const handler = isSelf ? 'executarTrocaSenhaPropria()' : `executarTrocaSenhaAdmin('${userId}')`;

    const html = `
        <div class="modal-backdrop" id="senha-modal" onclick="fecharSenhaModal(event)">
            <div class="modal" style="max-width:420px" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>🔑 Alterar senha — ${escHtmlU(name)}</h3>
                    <button class="modal-close" onclick="fecharSenhaModal()">✕</button>
                </div>
                <div class="modal-body">
                    ${isSelf ? `
                    <div class="form-group">
                        <label style="font-size:0.7rem;font-weight:600;color:var(--text-soft);display:block;margin-bottom:5px">Senha atual</label>
                        <input type="password" id="senha-atual" class="login-field input" placeholder="••••••••"
                            style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:9px 11px;color:var(--text);font-family:var(--font);font-size:0.78rem;outline:none;">
                    </div>` : `
                    <div style="background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:7px;padding:9px 13px;font-size:0.7rem;color:var(--accent3);margin-bottom:14px">
                        ⚠ A nova senha será definida imediatamente. O usuário precisará usá-la no próximo login.
                    </div>`}
                    <div class="form-group" style="margin-bottom:14px">
                        <label style="font-size:0.7rem;font-weight:600;color:var(--text-soft);display:block;margin-bottom:5px">Nova senha</label>
                        <input type="password" id="senha-nova" placeholder="mínimo 8 caracteres"
                            style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:9px 11px;color:var(--text);font-family:var(--font);font-size:0.78rem;outline:none;transition:border-color 0.2s;"
                            oninput="validarForcaSenha(this.value)">
                        <div id="senha-forca" style="margin-top:6px;height:3px;border-radius:2px;background:var(--border);overflow:hidden">
                            <div id="senha-forca-bar" style="height:100%;width:0;transition:width 0.3s,background 0.3s;border-radius:2px"></div>
                        </div>
                        <div id="senha-forca-label" style="font-size:0.62rem;color:var(--text-muted);margin-top:4px"></div>
                    </div>
                    <div class="form-group">
                        <label style="font-size:0.7rem;font-weight:600;color:var(--text-soft);display:block;margin-bottom:5px">Confirmar nova senha</label>
                        <input type="password" id="senha-confirma" placeholder="••••••••"
                            style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:9px 11px;color:var(--text);font-family:var(--font);font-size:0.78rem;outline:none;">
                    </div>
                    <div class="error-msg" id="senha-modal-error" style="margin-top:8px"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-row" onclick="fecharSenhaModal()">Cancelar</button>
                    <button class="btn-row primary" onclick="${handler}">Salvar senha</button>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    setTimeout(() => document.getElementById(isSelf ? 'senha-atual' : 'senha-nova')?.focus(), 100);
}

function fecharSenhaModal(event) {
    if (event && event.target !== document.getElementById('senha-modal')) return;
    document.getElementById('senha-modal')?.remove();
}

/** Password strength indicator */
function validarForcaSenha(val) {
    const bar   = document.getElementById('senha-forca-bar');
    const label = document.getElementById('senha-forca-label');
    if (!bar || !label) return;

    let score = 0;
    if (val.length >= 8)              score++;
    if (val.length >= 12)             score++;
    if (/[A-Z]/.test(val))            score++;
    if (/[0-9]/.test(val))            score++;
    if (/[^A-Za-z0-9]/.test(val))     score++;

    const levels = [
        { label: '',          color: 'var(--border)',   width: '0%'   },
        { label: 'Fraca',     color: 'var(--danger)',   width: '25%'  },
        { label: 'Razoável',  color: 'var(--accent3)',  width: '50%'  },
        { label: 'Boa',       color: 'var(--accent3)',  width: '75%'  },
        { label: 'Forte',     color: 'var(--accent2)',  width: '90%'  },
        { label: 'Muito forte', color: 'var(--accent2)', width: '100%' },
    ];

    const lvl = levels[Math.min(score, 5)];
    bar.style.width      = lvl.width;
    bar.style.background = lvl.color;
    label.textContent    = lvl.label;
    label.style.color    = lvl.color;
}

// ─── EXECUTE PASSWORD CHANGE ──────────────────────────

/** Admin changes another user's password via Edge Function */
async function executarTrocaSenhaAdmin(targetUserId) {
    const newPassword = document.getElementById('senha-nova')?.value ?? '';
    const confirma    = document.getElementById('senha-confirma')?.value ?? '';
    const errEl       = document.getElementById('senha-modal-error');

    errEl.style.display = 'none';

    if (newPassword.length < 8) {
        errEl.textContent = 'A senha deve ter no mínimo 8 caracteres.';
        errEl.style.display = 'block'; return;
    }
    if (newPassword !== confirma) {
        errEl.textContent = 'As senhas não coincidem.';
        errEl.style.display = 'block'; return;
    }

    const { data: { session } } = await _supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'change-password', targetUserId, newPassword }),
    });

    const json = await res.json();
    if (!res.ok) {
        errEl.textContent = json.error ?? 'Erro ao alterar senha.';
        errEl.style.display = 'block'; return;
    }

    fecharSenhaModal();
    showToast('Senha alterada com sucesso.', 'success');
}

/** User changes their own password via Supabase Auth (no admin API needed) */
async function executarTrocaSenhaPropria() {
    const senhaAtual  = document.getElementById('senha-atual')?.value ?? '';
    const newPassword = document.getElementById('senha-nova')?.value ?? '';
    const confirma    = document.getElementById('senha-confirma')?.value ?? '';
    const errEl       = document.getElementById('senha-modal-error');

    errEl.style.display = 'none';

    if (!senhaAtual) {
        errEl.textContent = 'Digite sua senha atual.';
        errEl.style.display = 'block'; return;
    }
    if (newPassword.length < 8) {
        errEl.textContent = 'A nova senha deve ter no mínimo 8 caracteres.';
        errEl.style.display = 'block'; return;
    }
    if (newPassword !== confirma) {
        errEl.textContent = 'As senhas não coincidem.';
        errEl.style.display = 'block'; return;
    }

    // Re-authenticate to confirm current password, then update
    const user = getCurrentUser();
    const { error: signInError } = await _supabase.auth.signInWithPassword({
        email: user.email,
        password: senhaAtual,
    });

    if (signInError) {
        errEl.textContent = 'Senha atual incorreta.';
        errEl.style.display = 'block'; return;
    }

    const { error } = await _supabase.auth.updateUser({ password: newPassword });
    if (error) {
        errEl.textContent = error.message;
        errEl.style.display = 'block'; return;
    }

    fecharSenhaModal();
    showToast('Sua senha foi alterada com sucesso.', 'success');
}

// ─── SHARED ADMIN CALL HELPER ─────────────────────────

async function callAdminAction(action, payload, successMsg) {
    const { data: { session } } = await _supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? 'Erro na operação.', 'error'); return; }
    showToast(successMsg, 'success');
    loadUsuarios();
}

// ─── RENDER ───────────────────────────────────────────

function renderUsuariosTable(users) {
    const tbody = document.getElementById('usuarios-tbody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="table-state"><div class="icon">👥</div><div>Nenhum usuário cadastrado ainda.</div></div></td></tr>`;
        return;
    }

    const me = getCurrentUser()?.id;

    tbody.innerHTML = users.map(u => {
        const name     = u.user_metadata?.name || u.email.split('@')[0];
        const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const role     = u.user_metadata?.role ?? 'operador';
        const status   = u.banned_until ? 'inativo' : (u.confirmed_at ? 'ativo' : 'pendente');

        const statusPill = {
            ativo:    `<span class="status-pill ativo">● Ativo</span>`,
            pendente: `<span class="status-pill" style="background:rgba(245,166,35,0.1);color:var(--accent3);border:1px solid rgba(245,166,35,0.2)">⏳ Pendente</span>`,
            inativo:  `<span class="status-pill revogado">✕ Inativo</span>`,
        }[status] ?? '';

        const isSelf    = u.id === me;
        const safeName  = escHtmlU(name).replace(/'/g, "\\'");

        const actionBtns = isSelf
            ? `
                <button class="btn-row primary" onclick="abrirTrocaSenha('${u.id}','${safeName}',true)">🔑 Minha senha</button>
              `
            : `
                <button class="btn-row primary" onclick="abrirTrocaSenha('${u.id}','${safeName}',false)">🔑 Senha</button>
                ${status !== 'inativo'
                    ? `<button class="btn-row danger" onclick="desativarUsuario('${u.id}','${escHtmlU(u.email)}')">Desativar</button>`
                    : `<button class="btn-row success" onclick="reativarUsuario('${u.id}','${escHtmlU(u.email)}')">Reativar</button>`
                }
              `;

        return `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:8px">
                    <div class="user-row-avatar">${initials}</div>
                    <div>
                        <div style="font-size:0.76rem;font-weight:600;color:var(--text)">${escHtmlU(name)}</div>
                        <div style="font-size:0.62rem;color:var(--text-muted)">${escHtmlU(u.email)}</div>
                    </div>
                </div>
            </td>
            <td><span class="role-badge ${role}">${role}</span></td>
            <td>${statusPill}</td>
            <td><div class="row-actions">${actionBtns}</div></td>
        </tr>`;
    }).join('');
}

function renderUsuariosLoading() {
    const tbody = document.getElementById('usuarios-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4"><div class="table-state"><div class="spinner"></div><div>Carregando...</div></div></td></tr>`;
}

function renderUsuariosError(msg) {
    const tbody = document.getElementById('usuarios-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4"><div class="table-state"><div class="icon">⚠️</div><div>${escHtmlU(msg)}</div></div></td></tr>`;
}

function showFormMsg(el, msg) {
    el.textContent  = msg;
    el.style.display = 'block';
}

// ─── HELPERS ──────────────────────────────────────────

function escHtmlU(str) {
    return String(str ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ─── INIT ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initUsuarios);
