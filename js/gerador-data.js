/**
 * gerador-data.js
 *
 * Catálogo dinâmico (setor/cargo/localidade) + regras de geração de credenciais.
 */

(function bootstrapGeradorData() {
    'use strict';

    const FALLBACK_SETOR_MAP = Object.freeze({
        COM: 'Comercial',
        FIN: 'Financeiro',
        LOG: 'Logística',
        RH: 'Recursos Humanos',
        MKT: 'Marketing',
        MOT: 'Motoristas',
        SIS: 'Sistemas (TI)',
        TEC: 'Técnico',
        DIR: 'Diretoria',
        CONTAB: 'Contabilidade',
        CONTR: 'Controladoria',
        TER: 'Terceiros',
        VEND: 'Vendas',
        LABEL: 'Labels',
    });

    const FALLBACK_CARGOS_POR_SETOR = Object.freeze({
        Comercial: [
            'Analista Comercial Sul',
            'Assistente de Vendas',
            'Assistente de Vendas de JR',
            'Coordenadora de Vendas',
            'Coordenadora de Vendas PL',
            'Executivo de Contas JR',
            'Executivo de Contas PL',
            'Executivo de Contas SE',
            'Executivo de Vendas de Equipamentos',
            'Gerente Adm de Vendas',
            'Gerente de Mercado',
            'Vendedor Interno',
        ],
        Financeiro: [
            'Assistente de Contas a Pagar',
            'Assistente de Compras a Receber JR',
            'Assistente de Crédito e Cobrança',
            'Gerente Financeiro',
            'Supervisor de Crédito e Cobrança',
        ],
        Logística: [
            'Assistente de Compras Pleno',
            'Auxiliar Administrativo',
            'Auxiliar de Documentação Fiscal',
            'Auxiliar de Logística',
            'Líder de Expedição',
            'Supervisor de Logística',
            'Gerente de Logística Central',
        ],
        'Recursos Humanos': [
            'Auxiliar de Departamento Pessoal',
            'Assistente de Recursos Humanos',
            'Coordenador de Recursos Humanos',
        ],
        Marketing: ['Analista de Inteligência de Mercado', 'Menor Aprendiz'],
        Motoristas: ['Motorista', 'Motorista JR'],
        'Sistemas (TI)': ['Assistente de TI', 'Estagiário', 'Gerente de Sistemas'],
        Técnico: ['Técnico de Manutenção de Máquinas', 'Gerente de Máquinas'],
        Diretoria: [],
        Contabilidade: ['Contadora'],
        Controladoria: ['Gerente de Controladoria'],
        Terceiros: ['Representante de Vendas'],
        Vendas: ['Gerente Adm de Vendas'],
        Labels: ['Assistente de Vendas Labels PL'],
    });

    const FALLBACK_LOCALIDADE_DATA = Object.freeze({
        PR: { Curitiba: ['Jardim Botânico', 'Rebouças', 'Cidade Industrial'] },
        SP: { 'São Paulo': ['Vila Monumento'] },
        RS: { 'Porto Alegre': ['Navegantes'] },
        RJ: { 'Rio de Janeiro': ['Bonsucesso'] },
        GO: { 'Aparecida de Goiânia': ['Vila Maria'], Goiânia: ['Setor Bueno'] },
        SC: { 'São José': ['Serraria'] },
        DF: { Brasília: ['Guará'] },
        MG: { Uberlândia: ['Brasil'] },
    });

    const state = {
        initialized: false,
        snapshot: buildFallbackSnapshot(),
    };

    function buildFallbackSnapshot() {
        return {
            setores: Object.values(FALLBACK_SETOR_MAP),
            cargosPorSetor: cloneNestedObject(FALLBACK_CARGOS_POR_SETOR),
            localidadeData: cloneNestedObject(FALLBACK_LOCALIDADE_DATA),
            ufs: Object.keys(FALLBACK_LOCALIDADE_DATA),
            filiais: [],
        };
    }

    function cloneNestedObject(obj) {
        return JSON.parse(JSON.stringify(obj || {}));
    }

    function resetSelect(selectEl, placeholder, disabled = true) {
        selectEl.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
        selectEl.disabled = disabled;
    }

    function populateSelect(selectEl, options) {
        options.forEach((optionValue) => {
            selectEl.add(new Option(optionValue, optionValue));
        });
    }

    function sortLocale(values) {
        return [...values].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    }

    function setCatalogGlobals(snapshot) {
        const setorMap = {};
        snapshot.setores.forEach((setor, index) => {
            setorMap[`SETOR_${index + 1}`] = setor;
        });

        window.SETOR_MAP = Object.freeze(setorMap);
        window.CARGOS_POR_SETOR = cloneNestedObject(snapshot.cargosPorSetor);
        window.LOCALIDADE_DATA = cloneNestedObject(snapshot.localidadeData);
    }

    function getFormSelects() {
        const setorSelect = document.getElementById('setor');
        const cargoSelect = document.getElementById('cargo');
        const ufSelect = document.getElementById('uf');
        const cidadeSelect = document.getElementById('local');
        const bairroSelect = document.getElementById('bairro');

        if (!setorSelect || !cargoSelect || !ufSelect || !cidadeSelect || !bairroSelect) {
            return null;
        }

        return { setorSelect, cargoSelect, ufSelect, cidadeSelect, bairroSelect };
    }

    function renderSetoresAndUfs(selects, preserveSelection = true) {
        const { setorSelect, ufSelect } = selects;
        const prevSetor = preserveSelection ? setorSelect.value : '';
        const prevUf = preserveSelection ? ufSelect.value : '';

        resetSelect(setorSelect, 'Selecione...', false);
        resetSelect(ufSelect, 'Selecione...', false);

        populateSelect(setorSelect, sortLocale(state.snapshot.setores || []));
        populateSelect(ufSelect, sortLocale(state.snapshot.ufs || Object.keys(state.snapshot.localidadeData || {})));

        if (prevSetor && (state.snapshot.setores || []).includes(prevSetor)) {
            setorSelect.value = prevSetor;
        }

        if (prevUf && (state.snapshot.ufs || []).includes(prevUf)) {
            ufSelect.value = prevUf;
        }
    }

    function handleSetorChange(selects, preserveCargo = false) {
        const { setorSelect, cargoSelect } = selects;
        const previousCargo = preserveCargo ? cargoSelect.value : '';

        resetSelect(cargoSelect, 'Selecione um cargo', false);

        const cargos = sortLocale(state.snapshot.cargosPorSetor?.[setorSelect.value] || []);
        populateSelect(cargoSelect, cargos);

        if (!cargos.length) {
            cargoSelect.disabled = true;
            cargoSelect.options[0].textContent = 'Sem cargos cadastrados';
            return;
        }

        if (previousCargo && cargos.includes(previousCargo)) {
            cargoSelect.value = previousCargo;
        }
    }

    function handleUfChange(selects, preserveCidade = false, preserveBairro = false) {
        const { ufSelect, cidadeSelect, bairroSelect } = selects;
        const previousCidade = preserveCidade ? cidadeSelect.value : '';

        resetSelect(cidadeSelect, 'Selecione uma cidade', false);
        resetSelect(bairroSelect, 'Cidade primeiro', true);

        const cidades = sortLocale(Object.keys(state.snapshot.localidadeData?.[ufSelect.value] || {}));
        populateSelect(cidadeSelect, cidades);

        if (!cidades.length) {
            cidadeSelect.disabled = true;
            cidadeSelect.options[0].textContent = 'Sem cidades cadastradas';
            return;
        }

        if (previousCidade && cidades.includes(previousCidade)) {
            cidadeSelect.value = previousCidade;
            handleCidadeChange(selects, preserveBairro);
            return;
        }

        if (cidades.length === 1) {
            cidadeSelect.value = cidades[0];
            handleCidadeChange(selects, false);
        }
    }

    function handleCidadeChange(selects, preserveBairro = false) {
        const { ufSelect, cidadeSelect, bairroSelect } = selects;
        const previousBairro = preserveBairro ? bairroSelect.value : '';

        resetSelect(bairroSelect, 'Selecione um bairro', false);

        const bairros = sortLocale((state.snapshot.localidadeData?.[ufSelect.value] || {})[cidadeSelect.value] || []);
        populateSelect(bairroSelect, bairros);

        if (!bairros.length) {
            bairroSelect.disabled = true;
            bairroSelect.options[0].textContent = 'Sem bairros cadastrados';
            return;
        }

        if (previousBairro && bairros.includes(previousBairro)) {
            bairroSelect.value = previousBairro;
            return;
        }

        if (bairros.length === 1) {
            bairroSelect.value = bairros[0];
        }
    }

    function renderAllSelects({ preserveSelection = true } = {}) {
        const selects = getFormSelects();
        if (!selects) return;

        const previous = preserveSelection
            ? {
                cargo: selects.cargoSelect.value,
                cidade: selects.cidadeSelect.value,
                bairro: selects.bairroSelect.value,
            }
            : { cargo: '', cidade: '', bairro: '' };

        renderSetoresAndUfs(selects, preserveSelection);

        if (selects.setorSelect.value) {
            handleSetorChange(selects, preserveSelection && Boolean(previous.cargo));
        } else {
            resetSelect(selects.cargoSelect, 'Setor primeiro', true);
        }

        if (selects.ufSelect.value) {
            handleUfChange(selects, preserveSelection && Boolean(previous.cidade), preserveSelection && Boolean(previous.bairro));
        } else {
            resetSelect(selects.cidadeSelect, 'UF primeiro', true);
            resetSelect(selects.bairroSelect, 'Cidade primeiro', true);
        }
    }

    function hasUsableCatalogData(snapshot) {
        return Boolean(
            snapshot
            && Array.isArray(snapshot.setores)
            && snapshot.setores.length
            && snapshot.cargosPorSetor
            && snapshot.localidadeData
        );
    }

    async function carregarCatalogoRemoto({ force = false } = {}) {
        const getter = window.App?.api?.catalog?.getCatalogSnapshot;
        if (typeof getter !== 'function') {
            return { data: null, error: null };
        }

        return getter({ force, apenasAtivos: true });
    }

    async function atualizarCatalogo({ force = false } = {}) {
        const { data, error } = await carregarCatalogoRemoto({ force });

        if (!error && hasUsableCatalogData(data)) {
            state.snapshot = {
                setores: data.setores || [],
                cargosPorSetor: cloneNestedObject(data.cargosPorSetor || {}),
                localidadeData: cloneNestedObject(data.localidadeData || {}),
                ufs: data.ufs || Object.keys(data.localidadeData || {}),
                filiais: data.filiais || [],
            };
        } else {
            state.snapshot = buildFallbackSnapshot();
        }

        setCatalogGlobals(state.snapshot);
        renderAllSelects({ preserveSelection: true });
    }

    async function initGeradorSelects() {
        const selects = getFormSelects();
        if (!selects) return;

        if (!state.initialized) {
            selects.setorSelect.addEventListener('change', () => handleSetorChange(selects, false));
            selects.ufSelect.addEventListener('change', () => handleUfChange(selects, false, false));
            selects.cidadeSelect.addEventListener('change', () => handleCidadeChange(selects, false));

            document.addEventListener('app:catalog-updated', () => {
                atualizarCatalogo({ force: true });
            });

            document.addEventListener('app:auth-changed', (event) => {
                if (event.detail?.user) {
                    atualizarCatalogo({ force: true });
                }
            });

            state.initialized = true;
        }

        renderAllSelects({ preserveSelection: false });
        await atualizarCatalogo({ force: false });
    }

    function removeDiacritics(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function normalizePersonName(value) {
        return removeDiacritics(value)
            .toLowerCase()
            .replace(/[^a-z\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function buildEmailLogin(name) {
        const tokens = normalizePersonName(name).split(' ').filter(Boolean);
        if (tokens.length < 2) return null;

        const first = tokens[0];
        const last = tokens[tokens.length - 1];
        return `${first}.${last}@vinilsul.com.br`;
    }

    function buildWtsLogin(name, uf) {
        const tokens = normalizePersonName(name).split(' ').filter(Boolean);
        if (tokens.length < 2) return null;

        const first = tokens[0];
        const last = tokens[tokens.length - 1];
        return `${String(uf || '').toLowerCase()}-${first}.${last}`;
    }

    function buildNyxosLogin(name) {
        const tokens = normalizePersonName(name).split(' ').filter(Boolean);
        if (tokens.length < 2) return null;

        return `${tokens[0]}.${tokens[tokens.length - 1]}`;
    }

    function randomSuffix(length = 4) {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let out = '';

        if (window.crypto?.getRandomValues) {
            const buffer = new Uint8Array(length);
            window.crypto.getRandomValues(buffer);
            for (let i = 0; i < length; i += 1) {
                out += alphabet[buffer[i] % alphabet.length];
            }
            return out;
        }

        for (let i = 0; i < length; i += 1) {
            out += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        return out;
    }

    function buildPassword(name, systemTag) {
        const normalized = normalizePersonName(name).replace(/\s+/g, '');
        const prefix = (normalized.slice(0, 4) || 'user').padEnd(4, 'x');
        return `${prefix}@${randomSuffix(4)}#${systemTag}`;
    }

    function normalizeFlags(emailFlag, wtsFlag, helpdeskFlag, nyxosFlag) {
        if (emailFlag && typeof emailFlag === 'object' && !Array.isArray(emailFlag)) {
            return {
                email: Boolean(emailFlag.email),
                wts: Boolean(emailFlag.wts),
                helpdesk: Boolean(emailFlag.helpdesk),
                nyxos: Boolean(emailFlag.nyxos),
            };
        }

        return {
            email: Boolean(emailFlag),
            wts: Boolean(wtsFlag),
            helpdesk: Boolean(helpdeskFlag),
            nyxos: Boolean(nyxosFlag),
        };
    }

    function gerarDados(nome, uf, emailFlag, wtsFlag, helpdeskFlag, nyxosFlag) {
        const flags = normalizeFlags(emailFlag, wtsFlag, helpdeskFlag, nyxosFlag);

        if (!flags.email && !flags.wts && !flags.helpdesk && !flags.nyxos) {
            return null;
        }

        if (!nome || !uf) {
            return null;
        }

        const emailLogin = buildEmailLogin(nome);
        const wtsLogin = buildWtsLogin(nome, uf);
        const nyxosLogin = buildNyxosLogin(nome);

        if (!emailLogin || !wtsLogin || !nyxosLogin) {
            return null;
        }

        return {
            email: flags.email
                ? { login: emailLogin, senha: buildPassword(nome, 'MAIL') }
                : null,
            wts: flags.wts
                ? { login: wtsLogin, senha: buildPassword(nome, 'WTS') }
                : null,
            helpdesk: flags.helpdesk
                ? { login: emailLogin, senha: buildPassword(nome, 'HELP') }
                : null,
            nyxos: flags.nyxos
                ? { login: nyxosLogin, senha: buildPassword(nome, 'NYX') }
                : null,
        };
    }

    setCatalogGlobals(state.snapshot);
    window.initGeradorSelects = initGeradorSelects;
    window.gerarDados = gerarDados;

    document.addEventListener('DOMContentLoaded', () => {
        initGeradorSelects();
    });
})();
