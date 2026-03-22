/**
 * gerador.js
 * Data definitions and credential generation logic for the Gerador de Acessos page.
 */

// ─── DATA ────────────────────────────────────────────

const SETOR_MAP = {
    'COM':    'Comercial',
    'FIN':    'Financeiro',
    'LOG':    'Logística',
    'RH':     'Recursos Humanos',
    'MKT':    'Marketing',
    'MOT':    'Motoristas',
    'SIS':    'Sistemas (TI)',
    'TEC':    'Técnico',
    'DIR':    'Diretoria',
    'CONTAB': 'Contabilidade',
    'CONTR':  'Controladoria',
    'TER':    'Terceiros',
    'VEND':   'Vendas',
    'LABEL':  'Labels',
};

const CARGOS_POR_SETOR = {
    'Comercial': [
        'Analista Comercial Sul', 'Assistente de Vendas', 'Assistente de Vendas de JR',
        'Coordenadora de Vendas', 'Coordenadora de Vendas PL', 'Executivo de Contas JR',
        'Executivo de Contas PL', 'Executivo de Contas SE', 'Executivo de Vendas de Equipamentos',
        'Gerente Adm de Vendas', 'Gerente de Mercado', 'Vendedor Interno',
    ],
    'Financeiro': [
        'Assistente de Contas a Pagar', 'Assistente de Compras a Receber JR',
        'Assistente de Crédito e Cobrança', 'Gerente Financeiro', 'Supervisor de Crédito e Cobrança',
    ],
    'Logística': [
        'Assistente de Compras Pleno', 'Auxiliar Administrativo', 'Auxiliar de Documentação Fiscal',
        'Auxiliar de Logística', 'Líder de Expedição', 'Supervisor de Logística',
        'Gerente de Logística Central',
    ],
    'Recursos Humanos': [
        'Auxiliar de Departamento Pessoal', 'Assistente de Recursos Humanos',
        'Coordenador de Recursos Humanos',
    ],
    'Marketing':      ['Analista de Inteligência de Mercado', 'Menor Aprendiz'],
    'Motoristas':     ['Motorista', 'Motorista JR'],
    'Sistemas (TI)':  ['Assistente de TI', 'Estagiário', 'Gerente de Sistemas'],
    'Técnico':        ['Técnico de Manutenção de Máquinas', 'Gerente de Máquinas'],
    'Diretoria':      [],
    'Contabilidade':  ['Contadora'],
    'Controladoria':  ['Gerente de Controladoria'],
    'Terceiros':      ['Representante de Vendas'],
    'Vendas':         ['Gerente Adm de Vendas'],
    'Labels':         ['Assistente de Vendas Labels PL'],
};

const LOCALIDADE_DATA = {
    'PR': { 'Curitiba': ['Jardim Botânico', 'Rebouças', 'Cidade Industrial'] },
    'SP': { 'São Paulo': ['Vila Monumento'] },
    'RS': { 'Porto Alegre': ['Navegantes'] },
    'RJ': { 'Rio de Janeiro': ['Bonsucesso'] },
    'GO': { 'Aparecida de Goiânia': ['Vila Maria'], 'Goiânia': ['Setor Bueno'] },
    'SC': { 'São José': ['Serraria'] },
    'DF': { 'Brasília': ['Guara'] },
    'MG': { 'Uberlândia': ['Brasil'] },
};

// ─── SELECT POPULATION ───────────────────────────────

/**
 * Populate all <select> elements with data and wire change listeners.
 * Call once on DOMContentLoaded.
 */
function initGeradorSelects() {
    const setorSelect  = document.getElementById('setor');
    const cargoSelect  = document.getElementById('cargo');
    const ufSelect     = document.getElementById('uf');
    const localSelect  = document.getElementById('local');
    const bairroSelect = document.getElementById('bairro');

    if (!setorSelect) return; // Guard: page may not be present

    /** Helper: reset a select to disabled placeholder state */
    const resetSelect = (sel, msg) => {
        sel.innerHTML = `<option value="" disabled selected>${msg}</option>`;
        sel.disabled = true;
    };

    // Populate sectors
    Object.values(SETOR_MAP).sort().forEach(s => setorSelect.add(new Option(s, s)));

    // Populate UFs
    Object.keys(LOCALIDADE_DATA).sort().forEach(uf => ufSelect.add(new Option(uf, uf)));

    // Setor → Cargo cascade
    setorSelect.addEventListener('change', () => {
        resetSelect(cargoSelect, 'Selecione um cargo');
        cargoSelect.disabled = false;
        (CARGOS_POR_SETOR[setorSelect.value] ?? []).sort().forEach(c => cargoSelect.add(new Option(c, c)));
    });

    // UF → Cidade cascade
    ufSelect.addEventListener('change', () => {
        resetSelect(localSelect,  'Selecione uma cidade');
        resetSelect(bairroSelect, 'Cidade primeiro');
        localSelect.disabled = false;

        const cidades = Object.keys(LOCALIDADE_DATA[ufSelect.value] ?? {}).sort();
        cidades.forEach(c => localSelect.add(new Option(c, c)));

        // Auto-select if only one option
        if (cidades.length === 1) {
            localSelect.value = cidades[0];
            localSelect.dispatchEvent(new Event('change'));
        }
    });

    // Cidade → Bairro cascade
    localSelect.addEventListener('change', () => {
        resetSelect(bairroSelect, 'Selecione um bairro');
        bairroSelect.disabled = false;

        const bairros = (LOCALIDADE_DATA[ufSelect.value] ?? {})[localSelect.value] ?? [];
        bairros.sort().forEach(b => bairroSelect.add(new Option(b, b)));

        // Auto-select if only one option
        if (bairros.length === 1) bairroSelect.value = bairros[0];
    });
}

// ─── CREDENTIAL GENERATION ───────────────────────────

/**
 * Generate credential data for a new employee.
 *
 * @param {string}  nome       - Full name
 * @param {string}  uf         - State abbreviation (e.g. "PR")
 * @param {boolean} cEmail     - Create e-mail account
 * @param {boolean} cWts       - Create WTS user
 * @param {boolean} cHelpdesk  - Create Helpdesk account
 * @param {boolean} cNyxos     - Create Nyxos account
 * @returns {Object|null} Credential map, or null on invalid input
 */
function gerarDados(nome, uf, cEmail, cWts, cHelpdesk, cNyxos) {
    if (!cEmail && !cWts && !cHelpdesk && !cNyxos) return null;

    const parts = nome.toLowerCase().trim().split(' ');
    if (parts.length < 2) return null;

    const removeDiacritics = str =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const primeiroNome = removeDiacritics(parts[0]);
    const ultimoNome   = removeDiacritics(parts[parts.length - 1]);
    const prefixo      = primeiroNome.slice(0, 4);

    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0')
               + now.getMinutes().toString().padStart(2, '0');

    const credentials = {
        'Login E-mail':    '',
        'Senha E-mail':    '',
        'Login WTS':       '',
        'Senha WTS':       '',
        'Login Helpdesk':  '',
        'Senha Helpdesk':  '',
        'Login Nyxos':     '',
        'Senha Nyxos':     '',
    };

    if (cEmail) {
        credentials['Login E-mail'] = `${primeiroNome}.${ultimoNome}@vinilsul.com.br`;
        credentials['Senha E-mail'] = `${prefixo}@${hhmm}#MAIL`;
    }
    if (cWts) {
        credentials['Login WTS'] = `${uf.toLowerCase()}-${primeiroNome}.${ultimoNome}`;
        credentials['Senha WTS'] = `${prefixo}@${hhmm}#WTS`;
    }
    if (cHelpdesk) {
        credentials['Login Helpdesk'] = `${primeiroNome}.${ultimoNome}@vinilsul.com.br`;
        credentials['Senha Helpdesk'] = `${prefixo}@${hhmm}#HELP`;
    }
    if (cNyxos) {
        credentials['Login Nyxos'] = `${primeiroNome}.${ultimoNome}`;
        credentials['Senha Nyxos'] = '1234';
    }

    return credentials;
}
