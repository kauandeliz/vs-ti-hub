/**
 * gerador-ui.js
 *
 * UI do Gerador de Acessos:
 * - coleta e valida dados
 * - gera credenciais
 * - persiste no banco
 * - renderiza resultado
 */

(function bootstrapGeradorUI() {
    'use strict';

    let generatedDataForSave = null;

    const ACCESS_ORDER = ['email', 'wts', 'helpdesk', 'nyxos'];
    const ACCESS_META = {
        email: { label: 'E-mail', icon: '📧', className: 'email' },
        wts: { label: 'WTS', icon: '💻', className: 'wts' },
        helpdesk: { label: 'Helpdesk', icon: '🎧', className: 'help' },
        nyxos: { label: 'Nyxos', icon: '⚙️', className: 'nyxos' },
    };

    function toggleCheck(labelEl) {
        const checkbox = labelEl?.querySelector('input[type="checkbox"]');
        if (!checkbox) return;

        checkbox.checked = !checkbox.checked;
        labelEl.classList.toggle('checked', checkbox.checked);

        const dot = labelEl.querySelector('.checkbox-dot');
        if (dot) {
            dot.textContent = checkbox.checked ? '✓' : '';
        }
    }

    function initGeradorForm() {
        const form = document.getElementById('admission-form');
        if (!form) return;

        form.addEventListener('submit', handleFormSubmit);
        document.getElementById('results-inner')?.addEventListener('click', handleCredCopy);
        document.getElementById('save-button')?.addEventListener('click', saveCSV);

        document.querySelectorAll('.checkbox-item').forEach((label) => {
            label.addEventListener('click', (event) => {
                event.preventDefault();
                toggleCheck(label);
            });

            const checkbox = label.querySelector('input[type="checkbox"]');
            const dot = label.querySelector('.checkbox-dot');
            if (dot) {
                dot.textContent = checkbox?.checked ? '✓' : '';
            }
        });
    }

    function normalizeCpf(rawCpf) {
        return String(rawCpf || '').replace(/\D/g, '');
    }

    function isValidDateBR(value) {
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value || '')) return false;

        const [day, month, year] = value.split('/').map(Number);
        const date = new Date(year, month - 1, day);

        return (
            date.getFullYear() === year
            && date.getMonth() === month - 1
            && date.getDate() === day
        );
    }

    function getAccessFlags() {
        return {
            email: Boolean(document.getElementById('criarEmail')?.checked),
            wts: Boolean(document.getElementById('criarWts')?.checked),
            helpdesk: Boolean(document.getElementById('criarHelpdesk')?.checked),
            nyxos: Boolean(document.getElementById('criarNyxos')?.checked),
        };
    }

    function collectFormData() {
        return {
            nomeCompleto: document.getElementById('nome')?.value?.trim() || '',
            cpf: normalizeCpf(document.getElementById('cpf')?.value || ''),
            dataAdmissao: document.getElementById('dataAdmissao')?.value?.trim() || '',
            setor: document.getElementById('setor')?.value || '',
            cargo: document.getElementById('cargo')?.value || '',
            uf: document.getElementById('uf')?.value || '',
            cidade: document.getElementById('local')?.value || '',
            bairro: document.getElementById('bairro')?.value || '',
        };
    }

    function validateAdmissionData(admissionData, flags) {
        const requiredFields = [
            admissionData.nomeCompleto,
            admissionData.cpf,
            admissionData.dataAdmissao,
            admissionData.setor,
            admissionData.cargo,
            admissionData.uf,
            admissionData.cidade,
            admissionData.bairro,
        ];

        if (requiredFields.some((value) => !value)) {
            return 'Preencha todos os campos obrigatórios.';
        }

        if (admissionData.nomeCompleto.trim().split(/\s+/).length < 2) {
            return 'Informe nome e sobrenome do colaborador.';
        }

        if (admissionData.cpf.length !== 11) {
            return 'CPF inválido. Informe os 11 dígitos.';
        }

        if (!isValidDateBR(admissionData.dataAdmissao)) {
            return 'Data de admissão inválida. Use o formato dd/mm/aaaa.';
        }

        if (!Object.values(flags).some(Boolean)) {
            return 'Selecione pelo menos um acesso para criar.';
        }

        return null;
    }

    async function handleFormSubmit(event) {
        event.preventDefault();

        const errorEl = document.getElementById('error-message');
        const saveButton = document.getElementById('save-button');

        if (errorEl) errorEl.style.display = 'none';

        const admissionData = collectFormData();
        const flags = getAccessFlags();

        const validationError = validateAdmissionData(admissionData, flags);
        if (validationError) {
            if (errorEl) {
                errorEl.textContent = validationError;
                errorEl.style.display = 'block';
            }
            return;
        }

        const acessos = gerarDados(admissionData.nomeCompleto, admissionData.uf, flags);
        if (!acessos) {
            if (errorEl) {
                errorEl.textContent = 'Não foi possível gerar os acessos com os dados informados.';
                errorEl.style.display = 'block';
            }
            return;
        }

        generatedDataForSave = { admissionData, acessos };
        renderResults(admissionData, acessos);
        if (saveButton) saveButton.style.display = 'flex';

        const { error } = await dbSalvarAcesso(admissionData, acessos);
        if (error) {
            notify('Acesso gerado, mas não salvo no histórico: ' + error.message, 'error');
            return;
        }

        notify('Acesso gerado e salvo no histórico com sucesso.', 'success');
        document.dispatchEvent(new CustomEvent('app:acesso-salvo'));
    }

    function renderResults(admissionData, acessos) {
        const blocks = ACCESS_ORDER
            .map((accessKey) => {
                const data = acessos[accessKey];
                if (!data) return '';

                const meta = ACCESS_META[accessKey];
                return buildCredBlock(meta, data.login, data.senha);
            })
            .join('');

        const html = `
            <div style="background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:8px;padding:9px 13px;margin-bottom:14px;font-size:0.7rem;color:var(--accent3);display:flex;gap:8px;align-items:flex-start;line-height:1.5">
                <span>⚠</span>
                <span><strong>Anote as senhas agora.</strong> Elas são exibidas apenas uma vez. No histórico, apenas o hash é armazenado.</span>
            </div>

            <div class="person-info">
                <div class="person-info-name">${escapeHtml(admissionData.nomeCompleto)}</div>
                <div class="person-info-meta">
                    <span>📋 ${escapeHtml(admissionData.cargo)}</span>
                    <span>🏢 ${escapeHtml(admissionData.setor)}</span>
                    <span>📍 ${escapeHtml(admissionData.cidade)} - ${escapeHtml(admissionData.uf)}</span>
                </div>
            </div>

            <div class="credentials-list">${blocks}</div>
        `;

        const resultRoot = document.getElementById('results-inner');
        if (resultRoot) {
            resultRoot.innerHTML = html;
        }
    }

    function buildCredBlock(meta, login, senha) {
        const safeLogin = escapeHtml(login);
        const safeSenha = escapeHtml(senha);

        return `
            <div class="credential-block">
                <div class="credential-header ${meta.className}">${meta.icon} ${meta.label}</div>
                <div class="credential-fields">
                    <div class="cred-field">
                        <div class="cred-field-label">Login</div>
                        <div class="cred-field-value" data-copy="${safeLogin}">
                            <span>${safeLogin}</span>
                            <span class="cred-copy-icon">⎘</span>
                        </div>
                    </div>
                    <div class="cred-field">
                        <div class="cred-field-label">Senha</div>
                        <div class="cred-field-value" data-copy="${safeSenha}">
                            <span>${safeSenha}</span>
                            <span class="cred-copy-icon">⎘</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async function handleCredCopy(event) {
        const target = event.target?.closest?.('[data-copy]');
        if (!target) return;

        const valueToCopy = target.dataset.copy || '';
        const textSpan = target.querySelector('span');
        const originalText = textSpan?.textContent || '';

        try {
            await navigator.clipboard.writeText(valueToCopy);
            if (textSpan) textSpan.textContent = '✓ Copiado';
            target.style.borderColor = 'var(--accent2)';

            setTimeout(() => {
                if (textSpan) textSpan.textContent = originalText;
                target.style.borderColor = '';
            }, 1300);
        } catch {
            notify('Não foi possível copiar para a área de transferência.', 'error');
        }
    }

    function saveCSV() {
        if (!generatedDataForSave) return;

        const { admissionData, acessos } = generatedDataForSave;
        const now = new Date();

        const headers = [
            'CPF',
            'Nome Completo',
            'Data Admissão',
            'Cargo',
            'Setor',
            'UF',
            'Cidade',
            'Bairro',
            'Data Criacao Acesso',
            'Hora Criacao Acesso',
            'Login E-mail',
            'Senha E-mail',
            'Login WTS',
            'Senha WTS',
            'Login Helpdesk',
            'Senha Helpdesk',
            'Login Nyxos',
            'Senha Nyxos',
        ];

        const row = [
            admissionData.cpf,
            admissionData.nomeCompleto,
            admissionData.dataAdmissao,
            admissionData.cargo,
            admissionData.setor,
            admissionData.uf,
            admissionData.cidade,
            admissionData.bairro,
            now.toISOString().split('T')[0],
            now.toTimeString().split(' ')[0],
            acessos.email?.login || '',
            acessos.email?.senha || '',
            acessos.wts?.login || '',
            acessos.wts?.senha || '',
            acessos.helpdesk?.login || '',
            acessos.helpdesk?.senha || '',
            acessos.nyxos?.login || '',
            acessos.nyxos?.senha || '',
        ];

        const csv = `${headers.join(';')}\n${row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';')}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

        const fileNameBase = admissionData.nomeCompleto
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `acesso-${fileNameBase || 'colaborador'}.csv`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(link.href);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function notify(message, type = 'success') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }

        // fallback silencioso sem depender do historico.js
        if (type === 'error') {
            console.error(message);
        } else {
            console.log(message);
        }
    }

    window.toggleCheck = toggleCheck;
    window.saveCSV = saveCSV;

    document.addEventListener('DOMContentLoaded', () => {
        initGeradorSelects();
        initGeradorForm();
    });
})();
