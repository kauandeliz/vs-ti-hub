/**
 * unidades.js
 *
 * Página de Unidades/Filiais com dados dinâmicos do catálogo.
 */

(function bootstrapUnidades() {
    'use strict';

    const state = {
        initialized: false,
        records: [],
        loading: false,
    };

    function initUnidades() {
        if (state.initialized) return;

        document.getElementById('unidades-refresh-btn')?.addEventListener('click', loadUnidades);

        document.addEventListener('app:catalog-updated', () => {
            if (isUnidadesActive()) {
                loadUnidades();
            }
        });

        state.initialized = true;
    }

    function isUnidadesActive() {
        return document.getElementById('page-unidades')?.classList.contains('active');
    }

    async function onUnidadesActivate() {
        if (!getCurrentUser()) return;
        await loadUnidades();
    }

    async function loadUnidades() {
        if (state.loading) return;

        const tbody = document.getElementById('unidades-tbody');
        if (!tbody) return;

        const listFn = window.App?.api?.catalog?.listarFiliais;
        if (typeof listFn !== 'function') {
            renderError('API de filiais indisponível.');
            return;
        }

        state.loading = true;
        renderLoading();

        const { data, error } = await listFn({ apenasAtivos: true });
        state.loading = false;

        if (error) {
            renderError(error.message);
            return;
        }

        state.records = data || [];
        renderRows();
    }

    function renderLoading() {
        const tbody = document.getElementById('unidades-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando unidades...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderError(message) {
        const tbody = document.getElementById('unidades-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="table-state">
                        <div class="icon">⚠️</div>
                        <div>Erro ao carregar unidades.<br><small style="color:var(--danger)">${escapeHtml(message)}</small></div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderRows() {
        const tbody = document.getElementById('unidades-tbody');
        if (!tbody) return;

        if (!state.records.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="table-state">
                            <div class="icon">🏙️</div>
                            <div>Nenhuma filial cadastrada.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = state.records.map((item) => {
            const codigo = Number.isFinite(item.codigo) ? item.codigo : '—';
            const cnpj = item.cnpj ? escapeHtml(item.cnpj) : '—';

            return `
                <tr>
                    <td>${escapeHtml(codigo)}</td>
                    <td><span class="uf-badge">${escapeHtml(item.uf || '—')}</span></td>
                    <td>${escapeHtml(item.cidade || '—')}</td>
                    <td>${escapeHtml(item.bairro || '—')}</td>
                    <td>${escapeHtml(item.endereco || '—')}</td>
                    <td>${escapeHtml(item.numero || '—')}</td>
                    <td>${cnpj}</td>
                </tr>
            `;
        }).join('');
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    window.onUnidadesActivate = onUnidadesActivate;
    window.loadUnidades = loadUnidades;

    document.addEventListener('DOMContentLoaded', initUnidades);
})();
