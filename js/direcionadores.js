/**
 * direcionadores.js
 *
 * CRUD e renderização dos cards direcionadores (links externos).
 */

(function bootstrapDirecionadores() {
    'use strict';

    const AREA_LABELS = {
        home: 'Home',
        helpdesk: 'Helpdesk',
        corporativo: 'Corporativo',
        telecom: 'Telecom',
    };

    const PUBLIC_CONTAINER_BY_AREA = {
        home: 'home-links-grid',
        helpdesk: 'helpdesk-links-grid',
        corporativo: 'corporativo-links-grid',
        telecom: 'telecom-links-grid',
    };

    const state = {
        initialized: false,
        loadingPublic: false,
        loadingAdmin: false,
        publicCards: [],
        adminCards: [],
    };

    function initDirecionadores() {
        if (state.initialized) return;

        mountLinkModalToBody();

        document.getElementById('cad-open-link-modal')?.addEventListener('click', () => {
            openCardCreateModal();
        });
        document.addEventListener('click', handleCardCreateClick);
        bindLinkModal();

        document.getElementById('cad-link-form')?.addEventListener('submit', handleLinkSubmit);
        document.getElementById('cad-link-cancel')?.addEventListener('click', resetLinkForm);
        document.getElementById('cad-link-tbody')?.addEventListener('click', handleLinkTableClick);
        document.getElementById('cad-dir-refresh-btn')?.addEventListener('click', () => {
            if (isAdmin()) {
                loadAdminCards();
            }
            loadPublicCards();
        });

        document.addEventListener('app:auth-changed', () => {
            syncAdminCardCreateActions();
            if (isCadDirecionadoresActive()) {
                if (isAdmin()) {
                    loadAdminCards();
                } else {
                    renderAdminRestricted();
                }
            }
            loadPublicCards();
        });

        syncAdminCardCreateActions();
        state.initialized = true;
        loadPublicCards();
    }

    function mountLinkModalToBody() {
        const modal = document.getElementById('cad-link-modal');
        if (!modal || modal.parentElement === document.body) return;
        document.body.appendChild(modal);
    }

    function isCadDirecionadoresActive() {
        return document.getElementById('page-cad-direcionadores')?.classList.contains('active');
    }

    function hasAuthenticatedUser() {
        return typeof window.getCurrentUser === 'function' && Boolean(window.getCurrentUser());
    }

    function sortCards(cards) {
        return [...cards].sort((a, b) => {
            const orderA = Number.isFinite(a.ordem) ? a.ordem : 100;
            const orderB = Number.isFinite(b.ordem) ? b.ordem : 100;
            if (orderA !== orderB) return orderA - orderB;
            return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
        });
    }

    async function loadPublicCards() {
        if (!hasAuthenticatedUser()) return;
        if (state.loadingPublic) return;

        const api = window.App?.api?.catalog;
        if (!api) {
            renderPublicError('API de cards indisponível.');
            return;
        }

        state.loadingPublic = true;
        const { data, error } = await api.listarDirecionadores({ apenasAtivos: true });
        state.loadingPublic = false;

        if (error) {
            renderPublicError(error.message);
            return;
        }

        state.publicCards = sortCards(data || []);
        renderPublicCards();
    }

    function renderPublicCards() {
        Object.keys(PUBLIC_CONTAINER_BY_AREA).forEach((area) => {
            const container = document.getElementById(PUBLIC_CONTAINER_BY_AREA[area]);
            if (!container) return;

            const cards = state.publicCards.filter((item) => item.area === area && item.ativo);
            if (!cards.length) {
                container.innerHTML = `
                    <div class="table-state cards-empty-state">
                        <div class="icon">🗂️</div>
                        <div>Nenhum card cadastrado para ${escapeHtml(AREA_LABELS[area] || area)}.</div>
                    </div>
                `;
                return;
            }

            container.innerHTML = cards.map(renderExternalCard).join('');
        });
    }

    function renderExternalCard(card) {
        return `
            <a href="${escapeHtmlAttribute(card.link)}" target="_blank" rel="noopener noreferrer" class="external-card">
                <div class="external-card-image">
                    <img src="${escapeHtmlAttribute(card.imagem_url)}" alt="${escapeHtmlAttribute(card.nome)}" loading="lazy">
                </div>
                <div class="external-card-content">
                    <div class="external-card-title">${escapeHtml(card.nome)}</div>
                    <div class="external-card-desc">${escapeHtml(card.descricao || '')}</div>
                </div>
            </a>
        `;
    }

    function renderPublicError(message) {
        Object.values(PUBLIC_CONTAINER_BY_AREA).forEach((containerId) => {
            const container = document.getElementById(containerId);
            if (!container) return;

            container.innerHTML = `
                <div class="table-state cards-empty-state">
                    <div class="icon">⚠️</div>
                    <div>${escapeHtml(message)}</div>
                </div>
            `;
        });
    }

    async function loadAdminCards() {
        if (!isAdmin()) {
            renderAdminRestricted();
            return;
        }

        if (state.loadingAdmin) return;

        const api = window.App?.api?.catalog;
        if (!api) {
            renderAdminError('API de cards indisponível.');
            return;
        }

        setCreateButtonState(false);
        state.loadingAdmin = true;
        renderAdminLoading();
        const { data, error } = await api.listarDirecionadores({ apenasAtivos: false });
        state.loadingAdmin = false;

        if (error) {
            renderAdminError(error.message);
            return;
        }

        state.adminCards = sortCards(data || []);
        renderAdminTable();
    }

    function renderAdminLoading() {
        const tbody = document.getElementById('cad-link-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando cards direcionadores...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderAdminError(message) {
        const tbody = document.getElementById('cad-link-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="table-state">
                        <div class="icon">⚠️</div>
                        <div>${escapeHtml(message)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderAdminRestricted() {
        const tbody = document.getElementById('cad-link-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="table-state">
                        <div class="icon">🔒</div>
                        <div>Acesso restrito a administradores.</div>
                    </div>
                </td>
            </tr>
        `;
        closeLinkModal();
        setCreateButtonState(true);
    }

    function renderAdminTable() {
        const tbody = document.getElementById('cad-link-tbody');
        if (!tbody) return;

        setCreateButtonState(false);

        if (!state.adminCards.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="table-state">
                            <div class="icon">🗂️</div>
                            <div>Nenhum card direcionador cadastrado.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = state.adminCards.map((card) => `
            <tr>
                <td><span class="cad-area-tag">${escapeHtml(getAreaLabel(card.area))}</span></td>
                <td>
                    <div class="cad-link-main">
                        <strong>${escapeHtml(card.nome)}</strong>
                        <span>${escapeHtml(card.descricao || '')}</span>
                    </div>
                </td>
                <td><span class="cad-link-url">${escapeHtml(formatShortUrl(card.link))}</span></td>
                <td>${renderStatusPill(card.ativo)}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn-row primary" data-action="edit-link" data-id="${card.id}">Editar</button>
                        <button class="btn-row danger" data-action="delete-link" data-id="${card.id}" data-nome="${escapeHtmlAttribute(card.nome)}">Excluir</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function formatShortUrl(value) {
        try {
            const parsed = new URL(String(value || ''));
            return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
        } catch {
            return String(value || '—');
        }
    }

    function renderStatusPill(active) {
        return active
            ? '<span class="status-pill ativo">● Ativo</span>'
            : '<span class="status-pill revogado">✕ Inativo</span>';
    }

    async function handleLinkSubmit(event) {
        event.preventDefault();
        if (!isAdmin()) return;

        const id = Number(document.getElementById('cad-link-id')?.value || 0);
        const payload = {
            area: document.getElementById('cad-link-area')?.value || '',
            nome: document.getElementById('cad-link-nome')?.value || '',
            descricao: document.getElementById('cad-link-descricao')?.value || '',
            link: document.getElementById('cad-link-url')?.value || '',
            imagemUrl: document.getElementById('cad-link-imagem')?.value || '',
            ordem: document.getElementById('cad-link-ordem')?.value || '100',
            ativo: Boolean(document.getElementById('cad-link-ativo')?.checked),
        };

        const api = window.App?.api?.catalog;
        if (!api) {
            notify('API de cards indisponível.', 'error');
            return;
        }

        const op = id > 0
            ? api.atualizarDirecionador(id, payload)
            : api.criarDirecionador(payload);

        const { error } = await op;
        if (error) {
            notify(error.message, 'error');
            return;
        }

        notify(id > 0 ? 'Card atualizado.' : 'Card criado.', 'success');
        resetLinkForm();
        closeLinkModal();
        await Promise.all([loadAdminCards(), loadPublicCards()]);
    }

    function resetLinkForm() {
        setValue('cad-link-id', '');
        setValue('cad-link-area', '');
        setValue('cad-link-nome', '');
        setValue('cad-link-descricao', '');
        setValue('cad-link-url', '');
        setValue('cad-link-imagem', '');
        setValue('cad-link-ordem', '100');
        setChecked('cad-link-ativo', true);
        setText('cad-link-submit', 'Salvar Card');
        toggleDisplay('cad-link-cancel', false);
    }

    async function handleLinkTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        if (button.dataset.action === 'edit-link') {
            const card = state.adminCards.find((item) => item.id === id);
            if (!card) return;

            setValue('cad-link-id', String(card.id));
            setValue('cad-link-area', card.area || '');
            setValue('cad-link-nome', card.nome || '');
            setValue('cad-link-descricao', card.descricao || '');
            setValue('cad-link-url', card.link || '');
            setValue('cad-link-imagem', card.imagem_url || '');
            setValue('cad-link-ordem', Number.isFinite(card.ordem) ? String(card.ordem) : '100');
            setChecked('cad-link-ativo', Boolean(card.ativo));
            setText('cad-link-submit', 'Atualizar Card');
            toggleDisplay('cad-link-cancel', true);
            openLinkModal();
            setTimeout(() => document.getElementById('cad-link-nome')?.focus(), 30);
            return;
        }

        if (button.dataset.action === 'delete-link') {
            const nome = button.dataset.nome || 'este card';
            const ok = await askConfirmation({
                title: 'Excluir card direcionador',
                message: `Excluir ${nome}?`,
                confirmText: 'Excluir',
            });
            if (!ok) return;

            const { error } = await window.App.api.catalog.removerDirecionador(id);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Card removido.', 'success');
            resetLinkForm();
            await Promise.all([loadAdminCards(), loadPublicCards()]);
        }
    }

    function bindLinkModal() {
        const modal = document.getElementById('cad-link-modal');
        if (!modal) return;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                resetLinkForm();
                closeLinkModal();
            }
        });

        modal.querySelectorAll('[data-action="close-cad-modal"]').forEach((button) => {
            button.addEventListener('click', () => {
                resetLinkForm();
                closeLinkModal();
            });
        });
    }

    function openLinkModal() {
        const modal = document.getElementById('cad-link-modal');
        if (!modal) return;
        modal.hidden = false;
    }

    function closeLinkModal() {
        const modal = document.getElementById('cad-link-modal');
        if (!modal) return;
        modal.hidden = true;
    }

    function setCreateButtonState(disabled) {
        const button = document.getElementById('cad-open-link-modal');
        if (!button) return;
        button.disabled = Boolean(disabled);
        button.style.display = disabled ? 'none' : '';
    }

    function syncAdminCardCreateActions() {
        const visible = isAdmin();
        document.querySelectorAll('[data-admin-card-action]').forEach((node) => {
            node.style.display = visible ? '' : 'none';
        });
    }

    function handleCardCreateClick(event) {
        const button = event.target.closest('[data-open-card-create]');
        if (!button) return;

        event.preventDefault();
        const area = String(button.dataset.cardArea || '').trim().toLowerCase();
        openCardCreateModal(area);
    }

    function openCardCreateModal(area = '') {
        if (!isAdmin()) {
            notify('Acesso restrito a administradores.', 'error');
            return false;
        }

        resetLinkForm();
        if (Object.prototype.hasOwnProperty.call(AREA_LABELS, area)) {
            setValue('cad-link-area', area);
        }

        openLinkModal();
        setTimeout(() => document.getElementById('cad-link-nome')?.focus(), 30);
        return true;
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

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    function setChecked(id, checked) {
        const el = document.getElementById(id);
        if (el) el.checked = checked;
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function toggleDisplay(id, visible) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = visible ? '' : 'none';
    }

    function getAreaLabel(area) {
        return AREA_LABELS[String(area || '').toLowerCase()] || String(area || '—');
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

    function onDirecionadoresPageActivate(page) {
        if (['home', 'helpdesk', 'corporativo', 'telecom'].includes(page)) {
            if (state.publicCards.length) {
                renderPublicCards();
            } else {
                loadPublicCards();
            }
            return;
        }

        if (page === 'cad-direcionadores') {
            if (isAdmin()) {
                loadAdminCards();
            } else {
                renderAdminRestricted();
            }
        }
    }

    window.onDirecionadoresPageActivate = onDirecionadoresPageActivate;
    window.openCardCreateModal = openCardCreateModal;

    document.addEventListener('DOMContentLoaded', initDirecionadores);
})();
