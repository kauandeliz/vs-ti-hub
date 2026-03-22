/**
 * gerador-ui.js
 * Form event handling, credential rendering, clipboard helpers, and CSV export
 * for the Gerador de Acessos page.
 *
 * Depends on: gerador-data.js
 */

// Holds the last generated payload for CSV download
let generatedDataForSave = null;

// ─── CHECKBOX TOGGLE ─────────────────────────────────

/**
 * Toggle a custom checkbox item's checked state.
 * @param {HTMLElement} labelEl - The .checkbox-item label element
 */
function toggleCheck(labelEl) {
    const cb = labelEl.querySelector('input[type=checkbox]');
    cb.checked = !cb.checked;
    labelEl.classList.toggle('checked', cb.checked);
    labelEl.querySelector('.checkbox-dot').textContent = cb.checked ? '✓' : '';
}

// ─── FORM SUBMIT ──────────────────────────────────────

function initGeradorForm() {
    const form = document.getElementById('admission-form');
    if (!form) return;

    form.addEventListener('submit', handleFormSubmit);
}

function handleFormSubmit(e) {
    e.preventDefault();

    const errEl = document.getElementById('error-message');
    errEl.style.display = 'none';

    const admissionData = collectFormData();

    if (Object.values(admissionData).some(v => !v)) {
        errEl.style.display = 'block';
        return;
    }

    const cEmail    = document.getElementById('criarEmail').checked;
    const cWts      = document.getElementById('criarWts').checked;
    const cHelpdesk = document.getElementById('criarHelpdesk').checked;
    const cNyxos    = document.getElementById('criarNyxos').checked;

    const acessos = gerarDados(
        admissionData['Nome Completo'],
        admissionData['UF'],
        cEmail, cWts, cHelpdesk, cNyxos
    );

    if (!acessos) {
        errEl.style.display = 'block';
        return;
    }

    generatedDataForSave = { admissionData, acessos };
    renderResults(admissionData, acessos);
    document.getElementById('save-button').style.display = 'flex';

    // Notify historico.js to persist to Supabase
    form.dispatchEvent(new CustomEvent('acesso-gerado', {
        detail: { admissionData, acessos },
        bubbles: true,
    }));
}

/** Collect all form field values into a plain object. */
function collectFormData() {
    return {
        'Nome Completo': document.getElementById('nome').value,
        'CPF':           document.getElementById('cpf').value,
        'Data Admissão': document.getElementById('dataAdmissao').value,
        'Setor':         document.getElementById('setor').value,
        'Cargo':         document.getElementById('cargo').value,
        'UF':            document.getElementById('uf').value,
        'Local':         document.getElementById('local').value,
        'Bairro':        document.getElementById('bairro').value,
    };
}

// ─── RESULTS RENDERING ───────────────────────────────

function renderResults(admissionData, acessos) {
    let html = `
        <div style="background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:8px;padding:9px 13px;margin-bottom:14px;font-size:0.7rem;color:var(--accent3);display:flex;gap:8px;align-items:flex-start;line-height:1.5">
            <span>⚠</span>
            <span><strong>Anote as senhas agora.</strong> Elas são exibidas apenas uma vez — após salvar, somente o hash bcrypt é armazenado e não é possível recuperar o valor original.</span>
        </div>
        <div class="person-info">
            <div class="person-info-name">${admissionData['Nome Completo']}</div>
            <div class="person-info-meta">
                <span>📋 ${admissionData['Cargo']}</span>
                <span>🏢 ${admissionData['Setor']}</span>
                <span>📍 ${admissionData['Local']} — ${admissionData['UF']}</span>
            </div>
        </div>
        <div class="credentials-list">`;

    if (acessos['Login E-mail'])   html += buildCredBlock('E-mail',   'email', '📧', acessos['Login E-mail'],   acessos['Senha E-mail']);
    if (acessos['Login WTS'])      html += buildCredBlock('WTS',      'wts',   '💻', acessos['Login WTS'],      acessos['Senha WTS']);
    if (acessos['Login Helpdesk']) html += buildCredBlock('Helpdesk', 'help',  '🎧', acessos['Login Helpdesk'], acessos['Senha Helpdesk']);
    if (acessos['Login Nyxos'])    html += buildCredBlock('Nyxos',    'nyxos', '⚙️', acessos['Login Nyxos'],    acessos['Senha Nyxos']);

    html += '</div>';
    document.getElementById('results-inner').innerHTML = html;
}

/**
 * Build HTML for a single credential block.
 * Using data attributes instead of inline onclick for XSS safety.
 */
function buildCredBlock(label, cls, icon, login, senha) {
    const escLogin = escapeHtml(login);
    const escSenha = escapeHtml(senha);
    return `
        <div class="credential-block">
            <div class="credential-header ${cls}">${icon} ${label}</div>
            <div class="credential-fields">
                <div class="cred-field">
                    <div class="cred-field-label">Login</div>
                    <div class="cred-field-value" data-copy="${escLogin}">
                        <span>${escLogin}</span><span class="cred-copy-icon">⎘</span>
                    </div>
                </div>
                <div class="cred-field">
                    <div class="cred-field-label">Senha</div>
                    <div class="cred-field-value" data-copy="${escSenha}">
                        <span>${escSenha}</span><span class="cred-copy-icon">⎘</span>
                    </div>
                </div>
            </div>
        </div>`;
}

// ─── CLIPBOARD ───────────────────────────────────────

/** Copy a credential value when clicking a .cred-field-value element. */
function handleCredCopy(e) {
    const target = e.target.closest('[data-copy]');
    if (!target) return;

    const val  = target.dataset.copy;
    const span = target.querySelector('span');
    const orig = span.textContent;

    navigator.clipboard.writeText(val).then(() => {
        span.textContent = '✓ Copiado!';
        target.style.borderColor = 'var(--accent2)';
        setTimeout(() => {
            span.textContent = orig;
            target.style.borderColor = '';
        }, 1500);
    });
}

/** Copy a label card's address text. */
function copyLabel(btn, rawText) {
    const text = 'PARA:\nA/c: TI VinilSul\n' + rawText.replace(/\\n/g, '\n');
    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓ Copiado';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'Copiar';
            btn.classList.remove('copied');
        }, 2000);
    });
}

// ─── CSV EXPORT ───────────────────────────────────────

function saveCSV() {
    if (!generatedDataForSave) return;

    const { admissionData, acessos } = generatedDataForSave;
    const now = new Date();

    const headers = [
        'CPF', 'Nome Completo', 'Data Admissão', 'Cargo', 'Setor', 'UF', 'Local', 'Bairro',
        'Data Criacao Acesso', 'Hora Criacao Acesso',
        'Login E-mail', 'Senha E-mail',
        'Login WTS',    'Senha WTS',
        'Login Helpdesk', 'Senha Helpdesk',
        'Login Nyxos',  'Senha Nyxos',
    ];

    const row = [
        admissionData['CPF'],
        admissionData['Nome Completo'],
        admissionData['Data Admissão'],
        admissionData['Cargo'],
        admissionData['Setor'],
        admissionData['UF'],
        admissionData['Local'],
        admissionData['Bairro'],
        now.toISOString().split('T')[0],
        now.toTimeString().split(' ')[0],
        acessos['Login E-mail']    ?? '',
        acessos['Senha E-mail']    ?? '',
        acessos['Login WTS']       ?? '',
        acessos['Senha WTS']       ?? '',
        acessos['Login Helpdesk']  ?? '',
        acessos['Senha Helpdesk']  ?? '',
        acessos['Login Nyxos']     ?? '',
        acessos['Senha Nyxos']     ?? '',
    ];

    const csv = headers.join(';') + '\n' + row.map(v => `"${v}"`).join(';');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const removeDiacritics = str =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const fileName = 'acesso-'
        + removeDiacritics(admissionData['Nome Completo'])
            .toLowerCase()
            .replace(/\s+/g, '-')
        + '.csv';

    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ─── HELPERS ─────────────────────────────────────────

/** Basic HTML entity escaping to prevent XSS in innerHTML. */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#039;');
}

// ─── INIT ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initGeradorSelects();
    initGeradorForm();

    // Delegate click for credential copy (works on dynamically rendered content)
    document.getElementById('results-inner')?.addEventListener('click', handleCredCopy);
});
