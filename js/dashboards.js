/**
 * dashboards.js
 *
 * Dashboards visuais + CRUD de relatorios dinamicos.
 */

(function bootstrapDashboards() {
    'use strict';

    const ORIGIN_OPTIONS = Object.freeze([
        { value: 'colaboradores', label: 'Colaboradores internos' },
        { value: 'filiais', label: 'Filiais' },
        { value: 'linhas', label: 'Linhas telefonicas' },
        { value: 'documentacao', label: 'Documentacao' },
        { value: 'direcionadores', label: 'Cards direcionadores' },
        { value: 'usuarios', label: 'Contas de acesso' },
    ]);

    const DIMENSION_OPTIONS_BY_ORIGIN = Object.freeze({
        colaboradores: [
            { value: 'status', label: 'Status' },
            { value: 'uf', label: 'UF' },
            { value: 'setor', label: 'Setor' },
            { value: 'funcao', label: 'Funcao' },
            { value: 'empresa', label: 'Empresa' },
            { value: 'loja', label: 'Loja' },
        ],
        filiais: [
            { value: 'status', label: 'Status da filial' },
            { value: 'uf', label: 'UF' },
            { value: 'cidade', label: 'Cidade' },
            { value: 'bairro', label: 'Bairro' },
            { value: 'codigo', label: 'Codigo' },
        ],
        linhas: [
            { value: 'tipo', label: 'Tipo (simCard/E-SIM)' },
            { value: 'loja', label: 'Loja' },
            { value: 'dpto', label: 'Departamento' },
            { value: 'cargo', label: 'Cargo' },
            { value: 'ddd', label: 'DDD' },
        ],
        documentacao: [
            { value: 'categoria', label: 'Categoria' },
            { value: 'tipo', label: 'Tipo (pasta/documento)' },
            { value: 'localizacao', label: 'Localizacao (raiz/subitem)' },
            { value: 'extensao', label: 'Extensao do arquivo' },
        ],
        direcionadores: [
            { value: 'area', label: 'Area' },
            { value: 'status', label: 'Status do card' },
        ],
        usuarios: [
            { value: 'status', label: 'Status da conta' },
            { value: 'tipo', label: 'Tipo da conta' },
            { value: 'setor', label: 'Setor' },
            { value: 'cargo', label: 'Cargo' },
        ],
    });

    const VISUAL_OPTIONS = Object.freeze([
        { value: 'bar', label: 'Barra' },
        { value: 'line', label: 'Linha' },
        { value: 'doughnut', label: 'Rosca' },
        { value: 'polarArea', label: 'Area polar' },
    ]);

    const DIRECIONADOR_AREA_LABELS = Object.freeze({
        home: 'Home',
        helpdesk: 'Helpdesk',
        corporativo: 'Corporativo',
        telecom: 'Telecom',
    });

    const DOCUMENT_CATEGORY_LABELS = Object.freeze({
        TERMO_RESPONSABILIDADE: 'Termo de responsabilidade',
        TUTORIAL_TI: 'Tutorial de TI',
        TERMO_ASSINADO: 'Termo assinado',
        GERAL: 'Geral',
    });

    const CHART_PALETTE = Object.freeze([
        '#4f8ef7',
        '#38d9a9',
        '#f5a623',
        '#f05252',
        '#8c7cf7',
        '#00b4d8',
        '#ff7f50',
        '#a1c181',
        '#7bdff2',
        '#f15bb5',
        '#ffa94d',
        '#4dd599',
    ]);

    const AUTO_CHART_KEYS = Object.freeze([
        'colab-status',
        'colab-setor',
        'colab-uf',
        'filiais-uf',
        'linhas-tipo',
        'linhas-dpto',
        'docs-categoria',
        'cards-area',
        'users-status',
    ]);

    const state = {
        initialized: false,
        loading: false,
        records: {
            colaboradores: [],
            filiais: [],
            linhas: [],
            documentacao: [],
            direcionadores: [],
            usuarios: [],
        },
        reports: [],
        autoCharts: new Map(),
        reportCharts: new Map(),
    };

    function initDashboards() {
        if (state.initialized) return;

        document.getElementById('dashboards-refresh-btn')?.addEventListener('click', loadDashboards);
        document.getElementById('dashboards-new-report-btn')?.addEventListener('click', () => {
            if (!hasAdminAccess()) {
                notify('Acesso restrito a administradores.', 'error');
                return;
            }
            openCreateReportModal();
        });

        document.getElementById('dashboards-report-grid')?.addEventListener('click', handleReportGridClick);
        document.getElementById('dashboards-report-form')?.addEventListener('submit', handleReportSubmit);
        document.getElementById('dash-report-cancel-btn')?.addEventListener('click', resetReportForm);
        document.getElementById('dash-report-origem')?.addEventListener('change', handleOrigemChange);

        bindReportModal();
        renderReportFormSelects();
        resetReportForm();
        syncAdminActions();

        document.addEventListener('app:auth-changed', () => {
            syncAdminActions();
            if (isDashboardsActive()) {
                loadDashboards();
            }
        });

        document.addEventListener('app:catalog-updated', () => {
            if (isDashboardsActive()) {
                loadDashboards();
            }
        });

        document.addEventListener('app:colaboradores-updated', () => {
            if (isDashboardsActive()) {
                loadDashboards();
            }
        });

        document.addEventListener('app:linhas-updated', () => {
            if (isDashboardsActive()) {
                loadDashboards();
            }
        });

        state.initialized = true;
    }

    function hasAdminAccess() {
        return typeof window.isAdmin === 'function' ? window.isAdmin() : false;
    }

    function getCurrentUser() {
        return typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
    }

    function isDashboardsActive() {
        return document.getElementById('page-dashboards')?.classList.contains('active');
    }

    async function onDashboardsActivate() {
        if (!getCurrentUser()) return;
        syncAdminActions();
        await loadDashboards();
    }

    function syncAdminActions() {
        const createButton = document.getElementById('dashboards-new-report-btn');
        if (createButton) {
            const admin = hasAdminAccess();
            createButton.style.display = admin ? '' : 'none';
            createButton.disabled = !admin;
        }

        if (!hasAdminAccess()) {
            closeReportModal();
            resetReportForm();
        }
    }

    async function loadDashboards() {
        if (state.loading) return;

        const api = window.App?.api;
        if (!api) {
            setSummary('API indisponivel para carregar relatorios customizados.');
            renderReportsError('API indisponivel para carregar relatorios.');
            return;
        }

        if (!window.Chart) {
            setSummary('Biblioteca de graficos nao foi carregada.');
            renderReportsError('Biblioteca de graficos indisponivel (Chart.js).');
            return;
        }

        state.loading = true;
        setSummary('Atualizando relatorios customizados...');

        const isAdminUser = hasAdminAccess();
        const usersPromise = isAdminUser && api.admin?.listUsers
            ? api.admin.listUsers()
            : Promise.resolve({ data: [], error: null });

        const [colabRes, filiaisRes, linhasRes, docsRes, cardsRes, reportsRes, usersRes] = await Promise.all([
            api.colaboradores?.listar ? api.colaboradores.listar({ search: '', status: '' }) : Promise.resolve({ data: [], error: normalizeLocalError('API de colaboradores indisponivel.') }),
            api.catalog?.listarFiliais ? api.catalog.listarFiliais({ apenasAtivos: false }) : Promise.resolve({ data: [], error: normalizeLocalError('API de filiais indisponivel.') }),
            api.linhas?.listar ? api.linhas.listar({ search: '' }) : Promise.resolve({ data: [], error: normalizeLocalError('API de linhas indisponivel.') }),
            api.documentacao?.listar ? api.documentacao.listar({ search: '', categoria: '' }) : Promise.resolve({ data: [], error: normalizeLocalError('API de documentacao indisponivel.') }),
            api.catalog?.listarDirecionadores ? api.catalog.listarDirecionadores({ apenasAtivos: false }) : Promise.resolve({ data: [], error: normalizeLocalError('API de direcionadores indisponivel.') }),
            api.dashboards?.listarRelatorios ? api.dashboards.listarRelatorios({ apenasAtivos: !isAdminUser }) : Promise.resolve({ data: [], error: normalizeLocalError('API de relatorios indisponivel.') }),
            usersPromise,
        ]);

        state.loading = false;

        state.records.colaboradores = colabRes.data || [];
        state.records.filiais = filiaisRes.data || [];
        state.records.linhas = linhasRes.data || [];
        state.records.documentacao = docsRes.data || [];
        state.records.direcionadores = cardsRes.data || [];
        state.records.usuarios = usersRes.data || [];
        state.reports = reportsRes.data || [];

        renderCustomReports();

        const errors = [colabRes.error, filiaisRes.error, linhasRes.error, docsRes.error, cardsRes.error, reportsRes.error, usersRes.error]
            .filter(Boolean)
            .map((error) => String(error.message || 'Erro desconhecido.'));

        if (errors.length) {
            setSummary(`Dashboards atualizados com avisos (${errors.length}).`);
            notify(`Alguns dados nao puderam ser carregados: ${errors[0]}`, 'warning');
            return;
        }

        setSummary(buildSummaryText());
    }

    function buildSummaryText() {
        const colabCount = state.records.colaboradores.length;
        const filiaisCount = state.records.filiais.length;
        const linhasCount = state.records.linhas.length;
        const docsCount = state.records.documentacao.length;
        const reportCount = state.reports.length;
        return `${colabCount} colaboradores, ${filiaisCount} filiais, ${linhasCount} linhas, ${docsCount} itens de documentacao e ${reportCount} relatorios customizados.`;
    }

    function renderKpis() {
        const container = document.getElementById('dashboards-kpi-grid');
        if (!container) return;

        const colaboradoresAtivos = state.records.colaboradores.filter((item) => normalizeColaboradorStatus(item.status) === 'Ativo').length;
        const filiaisAtivas = state.records.filiais.filter((item) => Boolean(item.ativo)).length;
        const linhasEsim = state.records.linhas.filter((item) => sanitizeText(item.tipo).toUpperCase() === 'E-SIM').length;
        const docsPastas = state.records.documentacao.filter((item) => sanitizeText(item.tipo).toUpperCase() === 'PASTA').length;
        const cardsAtivos = state.records.direcionadores.filter((item) => Boolean(item.ativo)).length;
        const usuariosAtivos = state.records.usuarios.filter((item) => getUserStatus(item) === 'Ativo').length;

        const kpis = [
            {
                title: 'Colaboradores ativos',
                value: String(colaboradoresAtivos),
                detail: `${state.records.colaboradores.length} registros no total`,
            },
            {
                title: 'Filiais ativas',
                value: String(filiaisAtivas),
                detail: `${state.records.filiais.length} filiais cadastradas`,
            },
            {
                title: 'Linhas E-SIM',
                value: String(linhasEsim),
                detail: `${state.records.linhas.length} linhas monitoradas`,
            },
            {
                title: 'Documentacao em pastas',
                value: String(docsPastas),
                detail: `${state.records.documentacao.length} itens catalogados`,
            },
            {
                title: 'Cards ativos',
                value: String(cardsAtivos),
                detail: `${state.records.direcionadores.length} cards cadastrados`,
            },
            {
                title: 'Relatorios customizados',
                value: String(state.reports.length),
                detail: `${state.reports.filter((item) => item.ativo).length} relatorios ativos`,
            },
            {
                title: 'Contas de acesso ativas',
                value: hasAdminAccess() ? String(usuariosAtivos) : '---',
                detail: hasAdminAccess()
                    ? `${state.records.usuarios.length} contas monitoradas`
                    : 'Indicador disponivel apenas para admin',
            },
        ];

        container.innerHTML = kpis.map((kpi) => `
            <div class="dash-kpi-card">
                <span>${escapeHtml(kpi.title)}</span>
                <strong>${escapeHtml(kpi.value)}</strong>
                <small>${escapeHtml(kpi.detail)}</small>
            </div>
        `).join('');
    }

    function renderAutoDashboards() {
        destroyCharts(state.autoCharts);

        renderAutoColaboradorStatusChart();
        renderAutoColaboradorSetorChart();
        renderAutoColaboradorUfChart();
        renderAutoFiliaisUfChart();
        renderAutoLinhasTipoChart();
        renderAutoLinhasDptoChart();
        renderAutoDocumentacaoCategoriaChart();
        renderAutoDirecionadoresAreaChart();
        renderAutoUsersStatusChart();
    }

    function renderAutoColaboradorStatusChart() {
        const statusCounts = aggregateBy(state.records.colaboradores, (item) => normalizeColaboradorStatus(item.status), { limit: 5 });
        renderChart({
            chartMap: state.autoCharts,
            key: 'colab-status',
            canvasId: 'dash-auto-colab-status',
            type: 'doughnut',
            labels: statusCounts.labels,
            values: statusCounts.values,
            datasetLabel: 'Colaboradores',
        });
    }

    function renderAutoColaboradorSetorChart() {
        const grouped = aggregateBy(state.records.colaboradores, (item) => sanitizeText(item.setor) || 'Sem setor', { limit: 8 });
        renderChart({
            chartMap: state.autoCharts,
            key: 'colab-setor',
            canvasId: 'dash-auto-colab-setor',
            type: 'bar',
            labels: grouped.labels,
            values: grouped.values,
            datasetLabel: 'Colaboradores',
            indexAxis: 'y',
        });
    }

    function renderAutoColaboradorUfChart() {
        const grouped = aggregateBy(state.records.colaboradores, (item) => sanitizeText(item.uf).toUpperCase() || 'Sem UF', { limit: 10 });
        renderChart({
            chartMap: state.autoCharts,
            key: 'colab-uf',
            canvasId: 'dash-auto-colab-uf',
            type: 'bar',
            labels: grouped.labels,
            values: grouped.values,
            datasetLabel: 'Colaboradores',
        });
    }

    function renderAutoFiliaisUfChart() {
        const grouped = aggregateBy(state.records.filiais, (item) => sanitizeText(item.uf).toUpperCase() || 'Sem UF', { limit: 12 });
        renderChart({
            chartMap: state.autoCharts,
            key: 'filiais-uf',
            canvasId: 'dash-auto-filiais-uf',
            type: 'bar',
            labels: grouped.labels,
            values: grouped.values,
            datasetLabel: 'Filiais',
        });
    }

    function renderAutoLinhasTipoChart() {
        const grouped = aggregateBy(state.records.linhas, (item) => normalizeLinhaTipo(item.tipo), { limit: 5 });
        renderChart({
            chartMap: state.autoCharts,
            key: 'linhas-tipo',
            canvasId: 'dash-auto-linhas-tipo',
            type: 'doughnut',
            labels: grouped.labels,
            values: grouped.values,
            datasetLabel: 'Linhas',
        });
    }

    function renderAutoLinhasDptoChart() {
        const grouped = aggregateBy(state.records.linhas, (item) => sanitizeText(item.dpto).toUpperCase() || 'Sem dpto', { limit: 8 });
        renderChart({
            chartMap: state.autoCharts,
            key: 'linhas-dpto',
            canvasId: 'dash-auto-linhas-dpto',
            type: 'bar',
            labels: grouped.labels,
            values: grouped.values,
            datasetLabel: 'Linhas',
        });
    }

    function renderAutoDocumentacaoCategoriaChart() {
        const grouped = aggregateBy(
            state.records.documentacao,
            (item) => DOCUMENT_CATEGORY_LABELS[sanitizeText(item.categoria).toUpperCase()] || 'Geral',
            { limit: 8 },
        );

        renderChart({
            chartMap: state.autoCharts,
            key: 'docs-categoria',
            canvasId: 'dash-auto-docs-categoria',
            type: 'polarArea',
            labels: grouped.labels,
            values: grouped.values,
            datasetLabel: 'Documentos',
        });
    }

    function renderAutoDirecionadoresAreaChart() {
        const grouped = aggregateBy(
            state.records.direcionadores,
            (item) => DIRECIONADOR_AREA_LABELS[sanitizeText(item.area).toLowerCase()] || 'Outra area',
            { limit: 10 },
        );

        renderChart({
            chartMap: state.autoCharts,
            key: 'cards-area',
            canvasId: 'dash-auto-cards-area',
            type: 'bar',
            labels: grouped.labels,
            values: grouped.values,
            datasetLabel: 'Cards',
            indexAxis: 'y',
        });
    }

    function renderAutoUsersStatusChart() {
        const note = document.getElementById('dash-auto-users-note');
        if (!hasAdminAccess()) {
            if (note) {
                note.textContent = 'Para dados de contas de acesso, use um perfil administrador.';
            }
            renderChart({
                chartMap: state.autoCharts,
                key: 'users-status',
                canvasId: 'dash-auto-users-status',
                type: 'doughnut',
                labels: ['Sem permissao'],
                values: [1],
                datasetLabel: 'Usuarios',
            });
            return;
        }

        if (note) note.textContent = '';
        const grouped = aggregateBy(state.records.usuarios, (item) => getUserStatus(item), { limit: 6 });
        renderChart({
            chartMap: state.autoCharts,
            key: 'users-status',
            canvasId: 'dash-auto-users-status',
            type: 'doughnut',
            labels: grouped.labels,
            values: grouped.values,
            datasetLabel: 'Usuarios',
        });
    }

    function renderCustomReports() {
        const grid = document.getElementById('dashboards-report-grid');
        if (!grid) return;

        destroyCharts(state.reportCharts);

        if (!state.reports.length) {
            grid.innerHTML = `
                <div class="table-state" style="grid-column:1 / -1">
                    <div class="icon">📊</div>
                    <div>Nenhum relatorio customizado cadastrado.</div>
                </div>
            `;
            return;
        }

        const isAdminUser = hasAdminAccess();
        grid.innerHTML = state.reports.map((report) => {
            const reportId = Number(report.id);
            const statusPill = report.ativo
                ? '<span class="status-pill ativo">● Ativo</span>'
                : '<span class="status-pill revogado">✕ Inativo</span>';

            const originLabel = getOriginLabel(report.origem);
            const dimensionLabel = getDimensionLabel(report.origem, report.dimensao);
            const visualLabel = getVisualLabel(report.visualizacao);
            const description = sanitizeText(report.descricao) || 'Relatorio sem descricao.';
            const actions = isAdminUser
                ? `
                    <div class="dash-report-actions">
                        <button class="btn-row primary" data-action="edit-report" data-id="${reportId}">Editar</button>
                        <button class="btn-row danger" data-action="delete-report" data-id="${reportId}" data-nome="${escapeHtmlAttribute(report.nome || '')}">Excluir</button>
                    </div>
                `
                : '';

            return `
                <article class="dash-report-card" data-report-id="${reportId}">
                    <div class="dash-report-head">
                        <div>
                            <h4>${escapeHtml(report.nome || 'Relatorio')}</h4>
                            <div class="dash-report-desc">${escapeHtml(description)}</div>
                        </div>
                        ${statusPill}
                    </div>
                    <div class="dash-report-meta">
                        Fonte: <strong>${escapeHtml(originLabel)}</strong> •
                        Dimensao: <strong>${escapeHtml(dimensionLabel)}</strong> •
                        Visual: <strong>${escapeHtml(visualLabel)}</strong>
                    </div>
                    <div class="dash-report-chart-wrap">
                        <canvas id="dash-report-chart-${reportId}"></canvas>
                    </div>
                    ${actions}
                </article>
            `;
        }).join('');

        state.reports.forEach((report) => {
            renderCustomReportChart(report);
        });
    }

    function renderCustomReportChart(report) {
        const reportId = Number(report.id);
        if (!Number.isFinite(reportId) || reportId <= 0) return;

        const sourceKey = sanitizeText(report.origem).toLowerCase();
        const dimensionKey = sanitizeText(report.dimensao).toLowerCase();
        const visualType = normalizeVisualType(report.visualizacao) || 'bar';
        const limit = clampNumber(report.limite, 3, 20, 8);
        const records = getRecordsBySource(sourceKey);

        if (sourceKey === 'usuarios' && !hasAdminAccess()) {
            renderChart({
                chartMap: state.reportCharts,
                key: `report-${reportId}`,
                canvasId: `dash-report-chart-${reportId}`,
                type: visualType,
                labels: ['Sem permissao'],
                values: [1],
                datasetLabel: report.nome || 'Relatorio',
            });
            return;
        }

        const extractor = getDimensionExtractor(sourceKey, dimensionKey);
        if (typeof extractor !== 'function') {
            renderChart({
                chartMap: state.reportCharts,
                key: `report-${reportId}`,
                canvasId: `dash-report-chart-${reportId}`,
                type: visualType,
                labels: ['Configuracao invalida'],
                values: [1],
                datasetLabel: report.nome || 'Relatorio',
            });
            return;
        }

        const grouped = aggregateBy(records, extractor, { limit });
        renderChart({
            chartMap: state.reportCharts,
            key: `report-${reportId}`,
            canvasId: `dash-report-chart-${reportId}`,
            type: visualType,
            labels: grouped.labels,
            values: grouped.values,
            datasetLabel: report.nome || 'Relatorio',
        });
    }

    async function handleReportSubmit(event) {
        event.preventDefault();

        if (!hasAdminAccess()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const api = window.App?.api?.dashboards;
        if (!api) {
            notify('API de relatorios indisponivel.', 'error');
            return;
        }

        const payload = {
            nome: document.getElementById('dash-report-nome')?.value || '',
            descricao: document.getElementById('dash-report-descricao')?.value || '',
            origem: document.getElementById('dash-report-origem')?.value || '',
            dimensao: document.getElementById('dash-report-dimensao')?.value || '',
            visualizacao: document.getElementById('dash-report-visualizacao')?.value || '',
            limite: document.getElementById('dash-report-limite')?.value || '8',
            ordem: document.getElementById('dash-report-ordem')?.value || '100',
            ativo: Boolean(document.getElementById('dash-report-ativo')?.checked),
        };

        const validationError = validateReportPayload(payload);
        if (validationError) {
            notify(validationError, 'error');
            return;
        }

        const reportId = Number(document.getElementById('dash-report-id')?.value || 0);
        const operation = reportId > 0
            ? api.atualizarRelatorio(reportId, payload)
            : api.criarRelatorio(payload);

        const { error } = await operation;
        if (error) {
            notify(error.message, 'error');
            return;
        }

        notify(reportId > 0 ? 'Relatorio atualizado.' : 'Relatorio criado.', 'success');
        resetReportForm();
        closeReportModal();
        await loadDashboards();
    }

    function validateReportPayload(payload) {
        const nome = sanitizeText(payload.nome);
        if (!nome) return 'Informe o nome do relatorio.';

        const origem = sanitizeText(payload.origem).toLowerCase();
        if (!getOriginOption(origem)) return 'Selecione uma fonte de dados valida.';

        const dimensao = sanitizeText(payload.dimensao).toLowerCase();
        if (!isValidDimensionForOrigin(origem, dimensao)) return 'Selecione uma dimensao valida para a fonte escolhida.';

        const visualizacao = normalizeVisualType(payload.visualizacao);
        if (!visualizacao) return 'Selecione uma visualizacao valida.';

        const limite = Number(payload.limite);
        if (!Number.isFinite(limite) || limite < 3 || limite > 20 || !Number.isInteger(limite)) {
            return 'Limite invalido. Use valor inteiro entre 3 e 20.';
        }

        const ordem = Number(payload.ordem);
        if (!Number.isFinite(ordem) || ordem < 0 || !Number.isInteger(ordem)) {
            return 'Ordem invalida. Use valor inteiro maior ou igual a zero.';
        }

        return null;
    }

    async function handleReportGridClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        const reportId = Number(button.dataset.id);
        if (!Number.isFinite(reportId) || reportId <= 0) return;

        if (button.dataset.action === 'edit-report') {
            if (!hasAdminAccess()) {
                notify('Acesso restrito a administradores.', 'error');
                return;
            }
            const report = state.reports.find((item) => item.id === reportId);
            if (!report) return;
            openEditReportModal(report);
            return;
        }

        if (button.dataset.action === 'delete-report') {
            if (!hasAdminAccess()) {
                notify('Acesso restrito a administradores.', 'error');
                return;
            }

            const nome = button.dataset.nome || 'este relatorio';
            const ok = await askConfirmation({
                title: 'Excluir relatorio',
                message: `Excluir ${nome}?`,
                confirmText: 'Excluir',
            });
            if (!ok) return;

            const { error } = await window.App.api.dashboards.removerRelatorio(reportId);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Relatorio removido.', 'success');
            await loadDashboards();
        }
    }

    function renderReportFormSelects() {
        const origemSelect = document.getElementById('dash-report-origem');
        const visualSelect = document.getElementById('dash-report-visualizacao');
        if (origemSelect) {
            origemSelect.innerHTML = ORIGIN_OPTIONS.map((option) => `
                <option value="${escapeHtmlAttribute(option.value)}">${escapeHtml(option.label)}</option>
            `).join('');
        }

        if (visualSelect) {
            visualSelect.innerHTML = VISUAL_OPTIONS.map((option) => `
                <option value="${escapeHtmlAttribute(option.value)}">${escapeHtml(option.label)}</option>
            `).join('');
        }
    }

    function handleOrigemChange() {
        const origemSelect = document.getElementById('dash-report-origem');
        const origem = sanitizeText(origemSelect?.value).toLowerCase();
        renderDimensionOptions(origem, '');
    }

    function renderDimensionOptions(origin, selectedDimension = '') {
        const dimensionSelect = document.getElementById('dash-report-dimensao');
        if (!dimensionSelect) return;

        const options = DIMENSION_OPTIONS_BY_ORIGIN[origin] || [];
        dimensionSelect.innerHTML = options.map((option) => `
            <option value="${escapeHtmlAttribute(option.value)}">${escapeHtml(option.label)}</option>
        `).join('');

        const selected = sanitizeText(selectedDimension).toLowerCase();
        if (selected && options.some((option) => option.value === selected)) {
            dimensionSelect.value = selected;
        }
    }

    function openCreateReportModal() {
        resetReportForm();
        setText('dashboards-report-modal-title', 'Novo relatorio');
        openReportModal();
        setTimeout(() => document.getElementById('dash-report-nome')?.focus(), 30);
    }

    function openEditReportModal(report) {
        if (!report) return;
        resetReportForm();

        setText('dashboards-report-modal-title', 'Editar relatorio');
        setValue('dash-report-id', String(report.id));
        setValue('dash-report-nome', report.nome || '');
        setValue('dash-report-descricao', report.descricao || '');
        setValue('dash-report-origem', sanitizeText(report.origem).toLowerCase());
        renderDimensionOptions(sanitizeText(report.origem).toLowerCase(), sanitizeText(report.dimensao).toLowerCase());
        setValue('dash-report-visualizacao', normalizeVisualType(report.visualizacao) || 'bar');
        setValue('dash-report-limite', String(clampNumber(report.limite, 3, 20, 8)));
        setValue('dash-report-ordem', String(clampNumber(report.ordem, 0, 100000, 100)));
        setChecked('dash-report-ativo', Boolean(report.ativo));
        setText('dash-report-submit-btn', 'Atualizar relatorio');
        toggleDisplay('dash-report-cancel-btn', true);
        openReportModal();
        setTimeout(() => document.getElementById('dash-report-nome')?.focus(), 30);
    }

    function resetReportForm() {
        setValue('dash-report-id', '');
        setValue('dash-report-nome', '');
        setValue('dash-report-descricao', '');
        setValue('dash-report-origem', 'colaboradores');
        renderDimensionOptions('colaboradores', 'setor');
        setValue('dash-report-visualizacao', 'bar');
        setValue('dash-report-limite', '8');
        setValue('dash-report-ordem', '100');
        setChecked('dash-report-ativo', true);
        setText('dash-report-submit-btn', 'Salvar relatorio');
        setText('dashboards-report-modal-title', 'Novo relatorio');
        toggleDisplay('dash-report-cancel-btn', false);
    }

    function bindReportModal() {
        const modal = document.getElementById('dashboards-report-modal');
        if (!modal) return;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                resetReportForm();
                closeReportModal();
            }
        });

        modal.querySelectorAll('[data-action="close-dash-report-modal"]').forEach((button) => {
            button.addEventListener('click', () => {
                resetReportForm();
                closeReportModal();
            });
        });
    }

    function openReportModal() {
        const modal = document.getElementById('dashboards-report-modal');
        if (!modal) return;
        modal.hidden = false;
    }

    function closeReportModal() {
        const modal = document.getElementById('dashboards-report-modal');
        if (!modal) return;
        modal.hidden = true;
    }

    function renderChart({
        chartMap,
        key,
        canvasId,
        type,
        labels,
        values,
        datasetLabel,
        indexAxis = 'x',
    }) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !window.Chart) return;

        const previous = chartMap.get(key);
        if (previous) {
            previous.destroy();
        }

        const fallback = normalizeChartDataset(labels, values);
        const palette = getPalette(fallback.labels.length);
        const normalizedType = normalizeVisualType(type) || 'bar';
        const isPieLike = normalizedType === 'doughnut' || normalizedType === 'polarArea';
        const isLine = normalizedType === 'line';

        const chart = new window.Chart(canvas.getContext('2d'), {
            type: normalizedType,
            data: {
                labels: fallback.labels,
                datasets: [{
                    label: datasetLabel || 'Volume',
                    data: fallback.values,
                    backgroundColor: isLine ? 'rgba(79, 142, 247, 0.18)' : palette,
                    borderColor: isPieLike ? palette : '#4f8ef7',
                    borderWidth: 1.5,
                    borderRadius: normalizedType === 'bar' ? 8 : 0,
                    tension: normalizedType === 'line' ? 0.32 : 0,
                    fill: normalizedType === 'line',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 520,
                    easing: 'easeOutQuart',
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            color: '#8a95a8',
                            boxWidth: 11,
                            boxHeight: 11,
                            font: {
                                family: "'DM Sans', sans-serif",
                                size: 11,
                            },
                        },
                    },
                    tooltip: {
                        backgroundColor: 'rgba(13, 16, 22, 0.95)',
                        borderColor: 'rgba(79, 142, 247, 0.22)',
                        borderWidth: 1,
                        titleColor: '#dce3f0',
                        bodyColor: '#b7c0d1',
                        displayColors: true,
                    },
                },
                scales: isPieLike
                    ? {}
                    : {
                        x: {
                            ticks: {
                                color: '#8a95a8',
                                font: {
                                    family: "'DM Sans', sans-serif",
                                    size: 10,
                                },
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)',
                            },
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#8a95a8',
                                precision: 0,
                                font: {
                                    family: "'DM Sans', sans-serif",
                                    size: 10,
                                },
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)',
                            },
                        },
                    },
                indexAxis: isPieLike ? undefined : indexAxis,
            },
        });

        chartMap.set(key, chart);
    }

    function normalizeChartDataset(labels, values) {
        const normalizedLabels = Array.isArray(labels) ? labels.filter((item) => sanitizeText(item)) : [];
        const normalizedValues = Array.isArray(values) ? values : [];

        if (!normalizedLabels.length || !normalizedValues.length) {
            return {
                labels: ['Sem dados'],
                values: [1],
            };
        }

        return {
            labels: normalizedLabels,
            values: normalizedValues,
        };
    }

    function getPalette(count) {
        const total = Number.isFinite(count) ? Math.max(1, count) : 1;
        const colors = [];
        for (let i = 0; i < total; i += 1) {
            colors.push(CHART_PALETTE[i % CHART_PALETTE.length]);
        }
        return colors;
    }

    function aggregateBy(records, labelResolver, { limit = 8 } = {}) {
        const counter = new Map();
        (records || []).forEach((record) => {
            const rawLabel = typeof labelResolver === 'function' ? labelResolver(record) : null;
            const label = sanitizeText(rawLabel) || 'Sem informacao';
            counter.set(label, (counter.get(label) || 0) + 1);
        });

        const ordered = [...counter.entries()]
            .sort((a, b) => {
                if (b[1] !== a[1]) return b[1] - a[1];
                return String(a[0]).localeCompare(String(b[0]), 'pt-BR');
            })
            .slice(0, Math.max(1, Number(limit) || 8));

        return {
            labels: ordered.map((entry) => entry[0]),
            values: ordered.map((entry) => entry[1]),
        };
    }

    function getRecordsBySource(source) {
        switch (source) {
        case 'colaboradores':
            return state.records.colaboradores;
        case 'filiais':
            return state.records.filiais;
        case 'linhas':
            return state.records.linhas;
        case 'documentacao':
            return state.records.documentacao;
        case 'direcionadores':
            return state.records.direcionadores;
        case 'usuarios':
            return state.records.usuarios;
        default:
            return [];
        }
    }

    function getDimensionExtractor(source, dimension) {
        const map = {
            colaboradores: {
                status: (item) => normalizeColaboradorStatus(item.status),
                uf: (item) => sanitizeText(item.uf).toUpperCase() || 'Sem UF',
                setor: (item) => sanitizeText(item.setor) || 'Sem setor',
                funcao: (item) => sanitizeText(item.funcao) || 'Sem funcao',
                empresa: (item) => sanitizeText(item.empresa) || 'Sem empresa',
                loja: (item) => sanitizeText(item.loja) || 'Sem loja',
            },
            filiais: {
                status: (item) => item.ativo ? 'Ativa' : 'Inativa',
                uf: (item) => sanitizeText(item.uf).toUpperCase() || 'Sem UF',
                cidade: (item) => sanitizeText(item.cidade) || 'Sem cidade',
                bairro: (item) => sanitizeText(item.bairro) || 'Sem bairro',
                codigo: (item) => Number.isFinite(item.codigo) ? String(item.codigo) : 'Sem codigo',
            },
            linhas: {
                tipo: (item) => normalizeLinhaTipo(item.tipo),
                loja: (item) => sanitizeText(item.loja) || 'Sem loja',
                dpto: (item) => sanitizeText(item.dpto).toUpperCase() || 'Sem dpto',
                cargo: (item) => sanitizeText(item.cargo) || 'Sem cargo',
                ddd: (item) => sanitizeText(item.ddd) || 'Sem DDD',
            },
            documentacao: {
                categoria: (item) => DOCUMENT_CATEGORY_LABELS[sanitizeText(item.categoria).toUpperCase()] || 'Geral',
                tipo: (item) => sanitizeText(item.tipo).toUpperCase() === 'PASTA' ? 'Pasta' : 'Documento',
                localizacao: (item) => Number.isFinite(Number(item.parent_id)) ? 'Subitem' : 'Raiz',
                extensao: (item) => getFileExtension(item.arquivo_nome),
            },
            direcionadores: {
                area: (item) => DIRECIONADOR_AREA_LABELS[sanitizeText(item.area).toLowerCase()] || 'Outra area',
                status: (item) => item.ativo ? 'Ativo' : 'Inativo',
            },
            usuarios: {
                status: (item) => getUserStatus(item),
                tipo: (item) => resolveUserType(item.user_metadata) === 'adm' ? 'ADM' : 'Conta comum',
                setor: (item) => sanitizeText(item.user_metadata?.setor) || 'Sem setor',
                cargo: (item) => sanitizeText(item.user_metadata?.cargo) || 'Sem cargo',
            },
        };

        return map[source]?.[dimension] || null;
    }

    function normalizeColaboradorStatus(status) {
        const normalized = sanitizeText(status).toUpperCase();
        if (normalized === 'ATIVO') return 'Ativo';
        if (normalized === 'INATIVO') return 'Inativo';
        return normalized ? normalized : 'Sem status';
    }

    function normalizeLinhaTipo(tipo) {
        const normalized = sanitizeText(tipo).toUpperCase();
        if (normalized === 'SIMCARD') return 'simCard';
        if (normalized === 'E-SIM' || normalized === 'ESIM') return 'E-SIM';
        return normalized ? normalized : 'Sem tipo';
    }

    function getUserStatus(user) {
        if (!user) return 'Sem status';
        if (user.banned_until) return 'Inativo';
        if (user.confirmed_at) return 'Ativo';
        return 'Pendente';
    }

    function resolveUserType(metadata) {
        const rawType = sanitizeText(metadata?.type).toLowerCase();
        if (['adm', 'admin', 'administrador'].includes(rawType)) return 'adm';
        if (['comum', 'operador', 'usuario', 'usuário', 'user'].includes(rawType)) return 'comum';

        const role = sanitizeText(metadata?.role).toLowerCase();
        if (role === 'admin') return 'adm';
        return 'comum';
    }

    function getFileExtension(fileName) {
        const raw = sanitizeText(fileName).toLowerCase();
        if (!raw) return 'Sem extensao';
        const parts = raw.split('.');
        if (parts.length < 2) return 'Sem extensao';
        const ext = sanitizeText(parts.pop());
        return ext ? `.${ext}` : 'Sem extensao';
    }

    function getOriginOption(origin) {
        return ORIGIN_OPTIONS.find((option) => option.value === origin) || null;
    }

    function getVisualOption(visual) {
        const normalized = sanitizeText(visual).toLowerCase();
        return VISUAL_OPTIONS.find((option) => option.value.toLowerCase() === normalized) || null;
    }

    function normalizeVisualType(value) {
        return getVisualOption(value)?.value || '';
    }

    function getOriginLabel(origin) {
        return getOriginOption(sanitizeText(origin).toLowerCase())?.label || sanitizeText(origin) || 'Origem';
    }

    function getVisualLabel(visual) {
        return getVisualOption(sanitizeText(visual).toLowerCase())?.label || sanitizeText(visual) || 'Visual';
    }

    function getDimensionLabel(origin, dimension) {
        const options = DIMENSION_OPTIONS_BY_ORIGIN[sanitizeText(origin).toLowerCase()] || [];
        const found = options.find((option) => option.value === sanitizeText(dimension).toLowerCase());
        return found?.label || sanitizeText(dimension) || 'Dimensao';
    }

    function isValidDimensionForOrigin(origin, dimension) {
        const options = DIMENSION_OPTIONS_BY_ORIGIN[origin] || [];
        return options.some((option) => option.value === dimension);
    }

    function clampNumber(value, min, max, fallback) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        if (num < min) return min;
        if (num > max) return max;
        return Math.floor(num);
    }

    function normalizeLocalError(message) {
        return {
            message: sanitizeText(message) || 'Erro desconhecido.',
            code: 'LOCAL_ERROR',
        };
    }

    function setSummary(text) {
        const summary = document.getElementById('dashboards-summary');
        if (!summary) return;
        summary.textContent = text;
    }

    function renderAutoError(message) {
        destroyCharts(state.autoCharts);
        AUTO_CHART_KEYS.forEach((key) => {
            const canvasByKey = {
                'colab-status': 'dash-auto-colab-status',
                'colab-setor': 'dash-auto-colab-setor',
                'colab-uf': 'dash-auto-colab-uf',
                'filiais-uf': 'dash-auto-filiais-uf',
                'linhas-tipo': 'dash-auto-linhas-tipo',
                'linhas-dpto': 'dash-auto-linhas-dpto',
                'docs-categoria': 'dash-auto-docs-categoria',
                'cards-area': 'dash-auto-cards-area',
                'users-status': 'dash-auto-users-status',
            }[key];

            renderChart({
                chartMap: state.autoCharts,
                key,
                canvasId: canvasByKey,
                type: 'bar',
                labels: ['Erro'],
                values: [1],
                datasetLabel: message || 'Erro',
            });
        });
    }

    function renderReportsError(message) {
        const grid = document.getElementById('dashboards-report-grid');
        if (!grid) return;
        grid.innerHTML = `
            <div class="table-state" style="grid-column:1 / -1">
                <div class="icon">⚠️</div>
                <div>${escapeHtml(message || 'Falha ao carregar relatorios.')}</div>
            </div>
        `;
    }

    function destroyCharts(map) {
        map.forEach((chart) => {
            chart?.destroy?.();
        });
        map.clear();
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

    function sanitizeText(value) {
        return String(value || '').trim();
    }

    function setValue(id, value) {
        const element = document.getElementById(id);
        if (element) element.value = value;
    }

    function setText(id, text) {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    }

    function setChecked(id, checked) {
        const element = document.getElementById(id);
        if (element) element.checked = Boolean(checked);
    }

    function toggleDisplay(id, visible) {
        const element = document.getElementById(id);
        if (!element) return;
        element.style.display = visible ? '' : 'none';
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

    window.onDashboardsActivate = onDashboardsActivate;
    document.addEventListener('DOMContentLoaded', initDashboards);
})();
