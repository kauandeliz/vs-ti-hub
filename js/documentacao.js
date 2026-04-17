/**
 * documentacao.js
 *
 * CRUD e visualização de documentos internos.
 */

(function bootstrapDocumentacao() {
    'use strict';

    const CATEGORY_LABELS = {
        TERMO_RESPONSABILIDADE: 'Termo de Responsabilidade',
        TUTORIAL_TI: 'Tutorial de TI',
        TERMO_ASSINADO: 'Termo Assinado',
        GERAL: 'Documentação Geral',
    };

    const INLINE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'txt', 'csv']);
    const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

    const state = {
        initialized: false,
        loading: false,
        records: [],
        page: 1,
        pageSize: 12,
        search: '',
        category: '',
    };

    function initDocumentacao() {
        if (state.initialized) return;

        document.getElementById('docs-refresh-btn')?.addEventListener('click', loadDocumentacao);
        document.getElementById('docs-search')?.addEventListener('input', debounce(handleSearchInput, 300));
        document.getElementById('docs-filter-categoria')?.addEventListener('change', handleCategoryFilterChange);
        document.getElementById('docs-form')?.addEventListener('submit', handleFormSubmit);
        document.getElementById('docs-cancel-btn')?.addEventListener('click', resetForm);
        document.getElementById('docs-tbody')?.addEventListener('click', handleTableClick);
        document.getElementById('docs-pagination')?.addEventListener('click', handlePaginationClick);

        document.addEventListener('app:auth-changed', () => {
            syncFormAccess();
            if (isDocumentacaoActive()) {
                loadDocumentacao();
            }
        });

        state.initialized = true;
        syncFormAccess();
        resetForm();
    }

    function isDocumentacaoActive() {
        return document.getElementById('page-documentacao')?.classList.contains('active');
    }

    function hasAuthenticatedUser() {
        return typeof window.getCurrentUser === 'function' && Boolean(window.getCurrentUser());
    }

    function hasAdminAccess() {
        return typeof window.isAdmin === 'function' ? window.isAdmin() : false;
    }

    async function onDocumentacaoActivate() {
        syncFormAccess();
        await loadDocumentacao();
    }

    function handleSearchInput(event) {
        state.search = event.target.value || '';
        state.page = 1;
        loadDocumentacao();
    }

    function handleCategoryFilterChange(event) {
        state.category = event.target.value || '';
        state.page = 1;
        loadDocumentacao();
    }

    async function loadDocumentacao() {
        if (!hasAuthenticatedUser()) {
            renderAuthRequired();
            return;
        }

        const api = window.App?.api?.documentacao;
        if (!api) {
            renderTableError('API de documentação indisponível.');
            setSummaryText('API de documentação indisponível.');
            return;
        }

        if (state.loading) return;
        state.loading = true;
        renderTableLoading();

        const { data, error } = await api.listar({
            search: state.search,
            categoria: state.category,
        });

        state.loading = false;

        if (error) {
            renderTableError(error.message);
            setSummaryText('Falha ao carregar documentos.');
            return;
        }

        state.records = data || [];
        const totalPages = getTotalPages();
        if (state.page > totalPages) {
            state.page = totalPages;
        }

        renderSummary();
        renderTable();
    }

    function renderSummary() {
        const total = state.records.length;
        const termosResponsabilidade = state.records.filter((item) => item.categoria === 'TERMO_RESPONSABILIDADE').length;
        const tutoriais = state.records.filter((item) => item.categoria === 'TUTORIAL_TI').length;
        const termosAssinados = state.records.filter((item) => item.categoria === 'TERMO_ASSINADO').length;

        let summary = `${total} documentos • ${termosResponsabilidade} termos de responsabilidade • ${tutoriais} tutoriais`;
        if (termosAssinados > 0) {
            summary += ` • ${termosAssinados} termos assinados`;
        }

        setSummaryText(summary);
    }

    function setSummaryText(text) {
        const summary = document.getElementById('docs-summary');
        if (summary) summary.textContent = text;
    }

    function getTotalPages() {
        return Math.max(1, Math.ceil(state.records.length / state.pageSize));
    }

    function renderTable() {
        const tbody = document.getElementById('docs-tbody');
        if (!tbody) return;

        const start = (state.page - 1) * state.pageSize;
        const rows = state.records.slice(start, start + state.pageSize);
        const canManage = hasAdminAccess();

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="table-state">
                            <div class="icon">📄</div>
                            <div>Nenhum documento encontrado.</div>
                        </div>
                    </td>
                </tr>
            `;
            renderPagination();
            return;
        }

        tbody.innerHTML = rows.map((item) => `
            <tr>
                <td>
                    <span class="doc-category-badge">${escapeHtml(getCategoryLabel(item.categoria))}</span>
                </td>
                <td>
                    <div class="doc-title-cell">
                        <strong>${escapeHtml(item.titulo || 'Sem título')}</strong>
                        <span>${escapeHtml(item.descricao || 'Sem descrição')}</span>
                    </div>
                </td>
                <td>
                    <div class="doc-file-cell">
                        <strong>${escapeHtml(item.arquivo_nome || '—')}</strong>
                        <span>${escapeHtml(formatFileSize(item.arquivo_tamanho_bytes))}</span>
                    </div>
                </td>
                <td>${escapeHtml(formatDateTime(item.atualizado_em || item.criado_em))}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn-row primary" data-action="preview" data-id="${item.id}">Visualizar</button>
                        <button class="btn-row" data-action="download" data-id="${item.id}">Baixar</button>
                        ${canManage ? `<button class="btn-row" data-action="edit" data-id="${item.id}">Editar</button>` : ''}
                        ${canManage ? `<button class="btn-row danger" data-action="delete" data-id="${item.id}" data-title="${escapeHtmlAttribute(item.titulo || '')}">Excluir</button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');

        renderPagination();
    }

    function renderPagination() {
        const container = document.getElementById('docs-pagination');
        if (!container) return;

        const totalPages = getTotalPages();
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        const parts = [];
        parts.push(`<button class="page-btn" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹</button>`);
        for (let i = 1; i <= totalPages; i += 1) {
            const edge = i === 1 || i === totalPages;
            const nearby = Math.abs(i - state.page) <= 2;
            if (edge || nearby) {
                parts.push(`<button class="page-btn ${i === state.page ? 'active' : ''}" data-page="${i}">${i}</button>`);
            } else if (Math.abs(i - state.page) === 3) {
                parts.push('<span style="color:var(--text-muted);padding:0 4px">…</span>');
            }
        }
        parts.push(`<button class="page-btn" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>›</button>`);
        container.innerHTML = parts.join('');
    }

    function renderTableLoading() {
        const tbody = document.getElementById('docs-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando documentos...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderTableError(message) {
        const tbody = document.getElementById('docs-tbody');
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

    function renderAuthRequired() {
        renderTableError('Faça login para acessar os documentos.');
        setSummaryText('Faça login para acessar os documentos.');
    }

    async function handleTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        if (button.dataset.action === 'preview') {
            await visualizarDocumento(id, { forceDownload: false });
            return;
        }

        if (button.dataset.action === 'download') {
            await visualizarDocumento(id, { forceDownload: true });
            return;
        }

        if (!hasAdminAccess()) {
            showToast('Apenas administradores podem editar ou excluir documentos.', 'error');
            return;
        }

        if (button.dataset.action === 'edit') {
            fillFormForEdit(id);
            return;
        }

        if (button.dataset.action === 'delete') {
            const title = button.dataset.title || 'este documento';
            const ok = window.confirm(`Excluir ${title}?`);
            if (!ok) return;

            const { data, error } = await window.App.api.documentacao.remover(id);
            if (error) {
                showToast(error.message, 'error');
                return;
            }

            if (data?.warning?.message) {
                showToast(`Documento removido, mas houve falha ao excluir o arquivo: ${data.warning.message}`, 'error');
            } else {
                showToast('Documento removido.', 'success');
            }

            resetForm();
            await loadDocumentacao();
        }
    }

    async function visualizarDocumento(id, { forceDownload = false } = {}) {
        const record = state.records.find((item) => item.id === id);
        if (!record) {
            showToast('Documento não encontrado para visualização.', 'error');
            return;
        }

        const { data, error } = await window.App.api.documentacao.gerarUrl(record.arquivo_path, {
            download: forceDownload,
            expiresIn: 3600,
        });

        if (error || !data?.signedUrl) {
            showToast(error?.message || 'Falha ao abrir o documento.', 'error');
            return;
        }

        if (forceDownload) {
            window.open(data.signedUrl, '_blank', 'noopener');
            return;
        }

        if (!canRenderInline(record.arquivo_mime_type, record.arquivo_nome)) {
            window.open(data.signedUrl, '_blank', 'noopener');
            showToast('Formato sem preview embutido. Documento aberto em nova guia.', 'success');
            return;
        }

        abrirModalPreview(record, data.signedUrl);
    }

    function canRenderInline(mimeType, fileName) {
        const mime = String(mimeType || '').toLowerCase();
        if (mime.startsWith('image/')) return true;
        if (mime.includes('pdf')) return true;
        if (mime.startsWith('text/')) return true;

        const extension = String(fileName || '').split('.').pop()?.toLowerCase() || '';
        return INLINE_EXTENSIONS.has(extension);
    }

    function abrirModalPreview(record, signedUrl) {
        const existing = document.getElementById('docs-preview-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.id = 'docs-preview-modal';

        modal.innerHTML = `
            <div class="modal docs-preview-modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Visualização: ${escapeHtml(record.titulo || 'Documento')}</h3>
                    <button class="modal-close" data-action="close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="docs-preview-meta">
                        <span>${escapeHtml(getCategoryLabel(record.categoria))}</span>
                        <span>${escapeHtml(record.arquivo_nome || 'Arquivo')}</span>
                    </div>
                    <div class="docs-preview-frame-wrap">
                        <iframe src="${escapeHtmlAttribute(signedUrl)}" title="${escapeHtmlAttribute(record.titulo || 'Documento')}"></iframe>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-row" data-action="download">Baixar</button>
                    <button class="btn-row primary" data-action="open-tab">Abrir em nova guia</button>
                    <button class="btn-row" data-action="close">Fechar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => modal.remove();

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                close();
            }
        });

        modal.querySelectorAll('[data-action="close"]').forEach((button) => {
            button.addEventListener('click', close);
        });

        modal.querySelector('[data-action="open-tab"]')?.addEventListener('click', () => {
            window.open(signedUrl, '_blank', 'noopener');
        });

        modal.querySelector('[data-action="download"]')?.addEventListener('click', async () => {
            await visualizarDocumento(record.id, { forceDownload: true });
        });
    }

    async function handleFormSubmit(event) {
        event.preventDefault();

        if (!hasAdminAccess()) {
            showToast('Apenas administradores podem cadastrar documentos.', 'error');
            return;
        }

        const payload = collectFormData();
        const id = Number(document.getElementById('docs-id')?.value || 0);
        const validation = validatePayload(payload, { requireFile: !(id > 0) });
        if (validation) {
            showToast(validation, 'error');
            return;
        }

        setSubmitBusy(true);

        const api = window.App.api.documentacao;
        const { data, error } = id > 0
            ? await api.atualizar(id, payload)
            : await api.criar(payload);

        setSubmitBusy(false);

        if (error) {
            showToast(error.message, 'error');
            return;
        }

        showToast(id > 0 ? 'Documento atualizado.' : 'Documento cadastrado.', 'success');
        resetForm();
        await loadDocumentacao();

        if (data?.id) {
            const refreshedRecord = state.records.find((item) => item.id === data.id);
            if (refreshedRecord && isDocumentacaoActive()) {
                const rowButton = document.querySelector(`[data-action="preview"][data-id="${refreshedRecord.id}"]`);
                rowButton?.focus();
            }
        }
    }

    function collectFormData() {
        const fileInput = document.getElementById('docs-form-arquivo');
        return {
            categoria: document.getElementById('docs-form-categoria')?.value || '',
            titulo: document.getElementById('docs-form-titulo')?.value || '',
            descricao: document.getElementById('docs-form-descricao')?.value || '',
            file: fileInput?.files?.[0] || null,
        };
    }

    function validatePayload(payload, { requireFile = true } = {}) {
        const categoria = String(payload.categoria || '').trim().toUpperCase();
        const titulo = String(payload.titulo || '').trim();
        const file = payload.file;

        if (!CATEGORY_LABELS[categoria]) {
            return 'Selecione uma categoria válida para o documento.';
        }

        if (!titulo) {
            return 'Informe o título do documento.';
        }

        if (requireFile && !file) {
            return 'Selecione um arquivo para cadastro.';
        }

        if (file && Number(file.size) > MAX_DOCUMENT_BYTES) {
            return 'Arquivo acima de 20 MB. Envie uma versão menor.';
        }

        return null;
    }

    function fillFormForEdit(id) {
        const record = state.records.find((item) => item.id === id);
        if (!record) {
            showToast('Documento não encontrado para edição.', 'error');
            return;
        }

        setValue('docs-id', String(record.id));
        setValue('docs-form-categoria', record.categoria || '');
        setValue('docs-form-titulo', record.titulo || '');
        setValue('docs-form-descricao', record.descricao || '');
        setValue('docs-form-arquivo', '');

        const currentFile = document.getElementById('docs-current-file');
        if (currentFile) {
            currentFile.textContent = `Arquivo atual: ${record.arquivo_nome || 'sem nome'}`;
            currentFile.style.display = 'block';
        }

        setText('docs-submit-btn', 'Atualizar Documento');
        toggleDisplay('docs-cancel-btn', true);
        document.getElementById('docs-form-titulo')?.focus();
    }

    function resetForm() {
        setValue('docs-id', '');
        setValue('docs-form-categoria', '');
        setValue('docs-form-titulo', '');
        setValue('docs-form-descricao', '');
        setValue('docs-form-arquivo', '');

        const currentFile = document.getElementById('docs-current-file');
        if (currentFile) {
            currentFile.textContent = '';
            currentFile.style.display = 'none';
        }

        setText('docs-submit-btn', 'Salvar Documento');
        toggleDisplay('docs-cancel-btn', false);
        syncFormAccess();
    }

    function syncFormAccess() {
        const isAdminUser = hasAdminAccess();
        const form = document.getElementById('docs-form');
        const permissionNote = document.getElementById('docs-form-permission');

        if (permissionNote) {
            permissionNote.textContent = isAdminUser
                ? 'Você possui permissão para criar, editar e excluir documentos.'
                : 'Somente administradores podem alterar documentos. Visualização e download seguem disponíveis.';
            permissionNote.classList.toggle('restricted', !isAdminUser);
        }

        if (!form) return;

        form.querySelectorAll('input, select, textarea, button').forEach((element) => {
            if (element.id === 'docs-cancel-btn' && element.style.display === 'none') return;
            element.disabled = !isAdminUser;
        });
    }

    function setSubmitBusy(busy) {
        const submitButton = document.getElementById('docs-submit-btn');
        if (!submitButton) return;

        submitButton.disabled = busy;
        if (busy) {
            submitButton.textContent = 'Salvando...';
            return;
        }

        const id = Number(document.getElementById('docs-id')?.value || 0);
        submitButton.textContent = id > 0 ? 'Atualizar Documento' : 'Salvar Documento';
    }

    function handlePaginationClick(event) {
        const button = event.target.closest('[data-page]');
        if (!button) return;

        const next = Number(button.dataset.page);
        if (!Number.isFinite(next)) return;
        if (next < 1 || next > getTotalPages()) return;

        state.page = next;
        renderTable();
    }

    function getCategoryLabel(value) {
        return CATEGORY_LABELS[String(value || '').toUpperCase()] || 'Categoria';
    }

    function formatFileSize(rawValue) {
        const bytes = Number(rawValue);
        if (!Number.isFinite(bytes) || bytes <= 0) return 'Tamanho não informado';

        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }
        const rounded = unitIndex === 0 ? String(Math.round(value)) : value.toFixed(1).replace('.', ',');
        return `${rounded} ${units[unitIndex]}`;
    }

    function formatDateTime(value) {
        if (window.App?.utils?.formatDateTimeBR) {
            return window.App.utils.formatDateTimeBR(value);
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }

    function setValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    }

    function setText(id, text) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    }

    function toggleDisplay(id, visible) {
        const element = document.getElementById(id);
        if (!element) return;
        element.style.display = visible ? '' : 'none';
    }

    function showToast(message, type = 'success') {
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

    function debounce(fn, waitMs) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), waitMs);
        };
    }

    window.onDocumentacaoActivate = onDocumentacaoActivate;
    window.loadDocumentacao = loadDocumentacao;

    document.addEventListener('DOMContentLoaded', initDocumentacao);
})();

