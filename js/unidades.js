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
        document.getElementById('unidades-open-filial-create-btn')?.addEventListener('click', handleOpenFilialCreate);
        document.getElementById('unidades-tbody')?.addEventListener('click', handleUnidadesTableClick);

        document.addEventListener('app:catalog-updated', () => {
            if (isUnidadesActive()) {
                loadUnidades();
            }
        });

        document.addEventListener('app:auth-changed', () => {
            syncAdminActions();
            if (isUnidadesActive()) {
                loadUnidades();
            }
        });

        syncAdminActions();
        state.initialized = true;
    }

    function isUnidadesActive() {
        return document.getElementById('page-unidades')?.classList.contains('active');
    }

    async function onUnidadesActivate() {
        if (!getCurrentUser()) return;
        syncAdminActions();
        await loadUnidades();
    }

    function syncAdminActions() {
        const createBtn = document.getElementById('unidades-open-filial-create-btn');
        const actionsHead = document.getElementById('unidades-gestao-head');
        const admin = isAdminUser();

        if (createBtn) createBtn.style.display = admin ? '' : 'none';
        if (actionsHead) actionsHead.style.display = admin ? '' : 'none';
    }

    function handleOpenFilialCreate() {
        if (typeof window.openFilialCreateModal === 'function') {
            window.openFilialCreateModal();
            return;
        }

        if (typeof window.navTo === 'function') {
            window.navTo('cad-filiais', null, { badgeLabel: 'Cadastros • Filiais' });
        }
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
                <td colspan="${getTableColspan()}">
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
                <td colspan="${getTableColspan()}">
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
        const admin = isAdminUser();

        if (!state.records.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${getTableColspan()}">
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
                    ${admin ? `
                        <td>
                            <div class="row-actions">
                                <button class="btn-row primary" data-action="edit-filial" data-id="${item.id}">Editar</button>
                                <button class="btn-row danger" data-action="delete-filial" data-id="${item.id}" data-nome="${escapeHtmlAttribute(item.nome || '')}">Excluir</button>
                            </div>
                        </td>
                    ` : ''}
                </tr>
            `;
        }).join('');
    }

    async function handleUnidadesTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        if (!isAdminUser()) {
            notify('Acesso restrito a administradores.', 'error');
            return;
        }

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        if (button.dataset.action === 'edit-filial') {
            const record = state.records.find((item) => item.id === id) || null;
            if (typeof window.openFilialEditModal === 'function') {
                window.openFilialEditModal(record || id);
                return;
            }

            notify('Edição de filiais indisponível no momento.', 'error');
            return;
        }

        if (button.dataset.action === 'delete-filial') {
            const nome = button.dataset.nome || 'esta filial';
            const confirmed = await askConfirmation({
                title: 'Excluir filial',
                message: `Excluir ${nome}?`,
                confirmText: 'Excluir',
            });

            if (!confirmed) return;

            const api = window.App?.api?.catalog;
            if (!api?.removerFilial) {
                notify('API de filiais indisponível.', 'error');
                return;
            }

            const { error } = await api.removerFilial(id);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Filial removida.', 'success');
            dispatchCatalogUpdated();
            await loadUnidades();
        }
    }

    function getTableColspan() {
        return isAdminUser() ? 8 : 7;
    }

    function isAdminUser() {
        return typeof window.isAdmin === 'function' && window.isAdmin();
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

    function dispatchCatalogUpdated() {
        window.App?.api?.catalog?.invalidateCatalogCache?.();
        document.dispatchEvent(new CustomEvent('app:catalog-updated'));
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

    window.onUnidadesActivate = onUnidadesActivate;
    window.loadUnidades = loadUnidades;

    document.addEventListener('DOMContentLoaded', initUnidades);
})();
