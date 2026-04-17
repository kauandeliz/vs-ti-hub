/**
 * documentacao.js
 *
 * Biblioteca documental em cards com árvore de pastas.
 */

(function bootstrapDocumentacao() {
    'use strict';

    const CATEGORY_LABELS = {
        TERMO_RESPONSABILIDADE: 'Termo de Responsabilidade',
        TUTORIAL_TI: 'Tutorial de TI',
        TERMO_ASSINADO: 'Termo Assinado',
        GERAL: 'Documentação Geral',
    };

    const TYPE_LABELS = {
        DOCUMENTO: 'Documento',
        PASTA: 'Pasta',
    };

    const INLINE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'txt', 'csv']);
    const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

    const state = {
        initialized: false,
        loading: false,
        records: [],
        currentFolderId: null,
        search: '',
        category: '',
        byId: new Map(),
        childrenByParent: new Map(),
    };

    function initDocumentacao() {
        if (state.initialized) return;

        document.getElementById('docs-refresh-btn')?.addEventListener('click', loadDocumentacao);
        document.getElementById('docs-search')?.addEventListener('input', debounce(handleSearchInput, 250));
        document.getElementById('docs-filter-categoria')?.addEventListener('change', handleCategoryFilterChange);
        document.getElementById('docs-go-root-btn')?.addEventListener('click', () => setCurrentFolder(null));
        document.getElementById('docs-go-up-btn')?.addEventListener('click', goUpFolder);

        document.getElementById('docs-tree-root')?.addEventListener('click', handleTreeClick);
        document.getElementById('docs-breadcrumb')?.addEventListener('click', handleBreadcrumbClick);
        document.getElementById('docs-cards-grid')?.addEventListener('click', handleCardsClick);

        document.getElementById('docs-form')?.addEventListener('submit', handleFormSubmit);
        document.getElementById('docs-cancel-btn')?.addEventListener('click', resetForm);
        document.getElementById('docs-form-tipo')?.addEventListener('change', syncFormTypeUI);

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

    function normalizeParentId(rawValue) {
        const numeric = Number(rawValue);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }

    function normalizeTipo(rawValue) {
        const tipo = String(rawValue || '').trim().toUpperCase();
        return tipo === 'PASTA' ? 'PASTA' : 'DOCUMENTO';
    }

    function sortRecords(records) {
        return [...records].sort((a, b) => {
            const tipoA = normalizeTipo(a.tipo);
            const tipoB = normalizeTipo(b.tipo);
            if (tipoA !== tipoB) {
                return tipoA === 'PASTA' ? -1 : 1;
            }

            const ordemA = Number.isFinite(Number(a.ordem)) ? Number(a.ordem) : 100;
            const ordemB = Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : 100;
            if (ordemA !== ordemB) return ordemA - ordemB;

            return String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR');
        });
    }

    function rebuildIndexes() {
        const byId = new Map();
        const childrenByParent = new Map();

        state.records.forEach((record) => {
            const id = Number(record.id);
            if (!Number.isFinite(id) || id <= 0) return;

            byId.set(id, record);
            const parentId = normalizeParentId(record.parent_id);
            const key = parentId === null ? 'root' : String(parentId);
            if (!childrenByParent.has(key)) {
                childrenByParent.set(key, []);
            }
            childrenByParent.get(key).push(record);
        });

        childrenByParent.forEach((items, key) => {
            childrenByParent.set(key, sortRecords(items));
        });

        state.byId = byId;
        state.childrenByParent = childrenByParent;
    }

    function getChildren(parentId) {
        const key = parentId === null ? 'root' : String(parentId);
        return state.childrenByParent.get(key) || [];
    }

    async function loadDocumentacao() {
        if (!hasAuthenticatedUser()) {
            renderAuthRequired();
            return;
        }

        const api = window.App?.api?.documentacao;
        if (!api) {
            renderGeneralError('API de documentação indisponível.');
            return;
        }

        if (state.loading) return;
        state.loading = true;
        renderLoadingState();

        const { data, error } = await api.listar();
        state.loading = false;

        if (error) {
            renderGeneralError(error.message);
            return;
        }

        state.records = Array.isArray(data) ? data : [];
        rebuildIndexes();

        if (state.currentFolderId !== null && !state.byId.has(state.currentFolderId)) {
            state.currentFolderId = null;
        }

        renderAll();
        syncParentSelect();
        syncGoUpButton();
    }

    function renderLoadingState() {
        const treeRoot = document.getElementById('docs-tree-root');
        const cardsGrid = document.getElementById('docs-cards-grid');
        if (treeRoot) {
            treeRoot.innerHTML = `
                <div class="table-state">
                    <div class="spinner"></div>
                    <div>Carregando árvore...</div>
                </div>
            `;
        }
        if (cardsGrid) {
            cardsGrid.innerHTML = `
                <div class="table-state">
                    <div class="spinner"></div>
                    <div>Carregando cards...</div>
                </div>
            `;
        }
    }

    function renderGeneralError(message) {
        const html = `
            <div class="table-state">
                <div class="icon">⚠️</div>
                <div>${escapeHtml(message)}</div>
            </div>
        `;

        const treeRoot = document.getElementById('docs-tree-root');
        const cardsGrid = document.getElementById('docs-cards-grid');
        if (treeRoot) treeRoot.innerHTML = html;
        if (cardsGrid) cardsGrid.innerHTML = html;

        setSummaryText('Falha ao carregar a documentação.');
        setBreadcrumbText('/');
        syncGoUpButton();
    }

    function renderAuthRequired() {
        renderGeneralError('Faça login para acessar a documentação.');
    }

    function renderAll() {
        renderTree();
        renderBreadcrumb();
        renderSummary();
        renderCards();
        syncGoUpButton();
    }

    function renderTree() {
        const root = document.getElementById('docs-tree-root');
        if (!root) return;

        const rootFolders = getChildren(null).filter((item) => normalizeTipo(item.tipo) === 'PASTA');
        const activeRootClass = state.currentFolderId === null ? 'active' : '';

        root.innerHTML = `
            <ul class="docs-tree-list root">
                <li class="docs-tree-item">
                    <button class="docs-tree-btn ${activeRootClass}" data-action="tree-open" data-id="">
                        <span>🗂️</span>
                        <span>Raiz</span>
                    </button>
                </li>
                ${rootFolders.map((folder) => renderTreeNode(folder, new Set())).join('')}
            </ul>
        `;
    }

    function renderTreeNode(folder, visited) {
        const folderId = Number(folder.id);
        if (!Number.isFinite(folderId) || visited.has(folderId)) {
            return '';
        }

        const nextVisited = new Set(visited);
        nextVisited.add(folderId);

        const childrenFolders = getChildren(folderId).filter((item) => normalizeTipo(item.tipo) === 'PASTA');
        const activeClass = state.currentFolderId === folderId ? 'active' : '';

        return `
            <li class="docs-tree-item">
                <button class="docs-tree-btn ${activeClass}" data-action="tree-open" data-id="${folderId}">
                    <span>📁</span>
                    <span>${escapeHtml(folder.titulo || 'Pasta')}</span>
                </button>
                ${childrenFolders.length ? `
                    <ul class="docs-tree-list">
                        ${childrenFolders.map((child) => renderTreeNode(child, nextVisited)).join('')}
                    </ul>
                ` : ''}
            </li>
        `;
    }

    function renderBreadcrumb() {
        const breadcrumb = document.getElementById('docs-breadcrumb');
        if (!breadcrumb) return;

        const chain = [];
        const visited = new Set();
        let cursor = state.currentFolderId;

        while (Number.isFinite(cursor) && cursor > 0 && !visited.has(cursor)) {
            visited.add(cursor);
            const record = state.byId.get(cursor);
            if (!record) break;
            chain.unshift({ id: String(record.id), label: record.titulo || 'Pasta' });
            cursor = normalizeParentId(record.parent_id);
        }

        const items = [{ id: '', label: 'Raiz' }, ...chain];
        breadcrumb.innerHTML = items.map((item, index) => `
            <span class="crumb" data-action="crumb-open" data-id="${escapeHtmlAttribute(item.id)}">${escapeHtml(item.label)}</span>${index < items.length - 1 ? ' / ' : ''}
        `).join('');
    }

    function setBreadcrumbText(text) {
        const breadcrumb = document.getElementById('docs-breadcrumb');
        if (breadcrumb) breadcrumb.textContent = text;
    }

    function setSummaryText(text) {
        const summary = document.getElementById('docs-summary');
        if (summary) summary.textContent = text;
    }

    function renderSummary() {
        const currentItems = getVisibleChildren();
        const folders = currentItems.filter((item) => normalizeTipo(item.tipo) === 'PASTA').length;
        const docs = currentItems.length - folders;

        let message = `${currentItems.length} itens visíveis • ${folders} pastas • ${docs} documentos`;
        if (state.search) {
            message += ` • filtro: "${state.search}"`;
        }
        setSummaryText(message);
    }

    function getVisibleChildren() {
        const currentChildren = getChildren(state.currentFolderId);
        return currentChildren.filter((item) => matchesFilters(item));
    }

    function matchesFilters(item) {
        const tipo = normalizeTipo(item.tipo);
        if (state.category && tipo === 'DOCUMENTO') {
            const categoria = String(item.categoria || '').toUpperCase();
            if (categoria !== state.category) return false;
        }

        if (!state.search) return true;
        const term = String(state.search || '').trim().toLowerCase();
        if (!term) return true;

        if (tipo === 'PASTA') {
            return folderHasSearchMatch(item, term, new Map());
        }

        return textContains(item, term);
    }

    function textContains(item, term) {
        const haystack = [
            item.titulo,
            item.descricao,
            item.arquivo_nome,
            getCategoryLabel(item.categoria),
        ].map((value) => String(value || '').toLowerCase()).join(' ');

        return haystack.includes(term);
    }

    function folderHasSearchMatch(folder, term, memo) {
        const folderId = Number(folder.id);
        if (memo.has(folderId)) return memo.get(folderId);

        const selfMatch = textContains(folder, term);
        if (selfMatch) {
            memo.set(folderId, true);
            return true;
        }

        const children = getChildren(folderId);
        for (const child of children) {
            const tipo = normalizeTipo(child.tipo);
            if (tipo === 'PASTA' && folderHasSearchMatch(child, term, memo)) {
                memo.set(folderId, true);
                return true;
            }
            if (tipo === 'DOCUMENTO' && textContains(child, term)) {
                memo.set(folderId, true);
                return true;
            }
        }

        memo.set(folderId, false);
        return false;
    }

    function renderCards() {
        const cardsGrid = document.getElementById('docs-cards-grid');
        if (!cardsGrid) return;

        const items = getVisibleChildren();
        if (!items.length) {
            cardsGrid.innerHTML = `
                <div class="table-state">
                    <div class="icon">📂</div>
                    <div>Nenhum item encontrado nesta pasta.</div>
                </div>
            `;
            return;
        }

        cardsGrid.innerHTML = items.map((item) => {
            const tipo = normalizeTipo(item.tipo);
            return tipo === 'PASTA' ? renderFolderCard(item) : renderDocumentCard(item);
        }).join('');
    }

    function renderFolderCard(item) {
        const folderId = Number(item.id);
        const childCount = getChildren(folderId).length;
        const canManage = hasAdminAccess();

        return `
            <article class="doc-card folder">
                <div class="doc-card-head">
                    <div class="doc-card-icon">📁</div>
                    <div>
                        <div class="doc-card-title">${escapeHtml(item.titulo || 'Pasta')}</div>
                        <span class="doc-category-badge">Pasta</span>
                    </div>
                </div>
                <div class="doc-card-desc">${escapeHtml(item.descricao || 'Pasta para organizar documentos e subpastas.')}</div>
                <div class="doc-card-meta">
                    ${childCount} item(ns) • Atualização ${escapeHtml(formatDateTime(item.atualizado_em || item.criado_em))}
                </div>
                <div class="doc-card-actions">
                    <button class="btn-row primary" data-action="open-folder" data-id="${item.id}">Abrir</button>
                    ${canManage ? `<button class="btn-row" data-action="edit-item" data-id="${item.id}">Editar</button>` : ''}
                    ${canManage ? `<button class="btn-row danger" data-action="delete-item" data-id="${item.id}" data-title="${escapeHtmlAttribute(item.titulo || '')}">Excluir</button>` : ''}
                </div>
            </article>
        `;
    }

    function renderDocumentCard(item) {
        const canManage = hasAdminAccess();
        const category = getCategoryLabel(item.categoria);
        const icon = getDocumentIcon(item);

        return `
            <article class="doc-card">
                <div class="doc-card-head">
                    <div class="doc-card-icon">${escapeHtml(icon)}</div>
                    <div>
                        <div class="doc-card-title">${escapeHtml(item.titulo || 'Documento')}</div>
                        <span class="doc-category-badge">${escapeHtml(category)}</span>
                    </div>
                </div>
                <div class="doc-card-desc">${escapeHtml(item.descricao || 'Documento sem descrição cadastrada.')}</div>
                <div class="doc-card-meta">
                    ${escapeHtml(item.arquivo_nome || 'Arquivo sem nome')} • ${escapeHtml(formatFileSize(item.arquivo_tamanho_bytes))}<br>
                    Atualização ${escapeHtml(formatDateTime(item.atualizado_em || item.criado_em))}
                </div>
                <div class="doc-card-actions">
                    <button class="btn-row primary" data-action="preview-item" data-id="${item.id}">Visualizar</button>
                    <button class="btn-row" data-action="download-item" data-id="${item.id}">Baixar</button>
                    ${canManage ? `<button class="btn-row" data-action="edit-item" data-id="${item.id}">Editar</button>` : ''}
                    ${canManage ? `<button class="btn-row danger" data-action="delete-item" data-id="${item.id}" data-title="${escapeHtmlAttribute(item.titulo || '')}">Excluir</button>` : ''}
                </div>
            </article>
        `;
    }

    function getDocumentIcon(item) {
        const name = String(item.arquivo_nome || '').toLowerCase();
        if (name.endsWith('.pdf')) return '📄';
        if (name.endsWith('.doc') || name.endsWith('.docx')) return '📝';
        if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return '📊';
        if (name.endsWith('.ppt') || name.endsWith('.pptx')) return '📈';
        if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')) return '🖼️';
        return '📎';
    }

    function handleTreeClick(event) {
        const target = event.target.closest('[data-action="tree-open"]');
        if (!target) return;
        setCurrentFolder(normalizeParentId(target.dataset.id));
    }

    function handleBreadcrumbClick(event) {
        const target = event.target.closest('[data-action="crumb-open"]');
        if (!target) return;
        setCurrentFolder(normalizeParentId(target.dataset.id));
    }

    async function handleCardsClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        const action = button.dataset.action;
        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        if (action === 'open-folder') {
            setCurrentFolder(id);
            return;
        }

        if (action === 'preview-item') {
            await visualizarDocumento(id, { forceDownload: false });
            return;
        }

        if (action === 'download-item') {
            await visualizarDocumento(id, { forceDownload: true });
            return;
        }

        if (!hasAdminAccess()) {
            showToast('Apenas administradores podem alterar itens da documentação.', 'error');
            return;
        }

        if (action === 'edit-item') {
            fillFormForEdit(id);
            return;
        }

        if (action === 'delete-item') {
            await handleDeleteItem(id, button.dataset.title || 'este item');
        }
    }

    async function handleDeleteItem(id, title) {
        const descendants = collectDescendantIds(id);
        const extraText = descendants.length > 1
            ? ` Isso também removerá ${descendants.length - 1} item(ns) filho(s).`
            : '';

        const confirmed = window.confirm(`Excluir ${title}?${extraText}`);
        if (!confirmed) return;

        const { data, error } = await window.App.api.documentacao.remover(id);
        if (error) {
            showToast(error.message, 'error');
            return;
        }

        if (data?.warning?.message) {
            showToast(`Item removido, mas houve falha ao excluir alguns arquivos: ${data.warning.message}`, 'error');
        } else {
            showToast('Item removido com sucesso.', 'success');
        }

        resetForm();
        await loadDocumentacao();
    }

    function collectDescendantIds(startId) {
        const ids = [];
        const stack = [startId];
        const visited = new Set();

        while (stack.length) {
            const current = Number(stack.pop());
            if (!Number.isFinite(current) || visited.has(current)) continue;
            visited.add(current);
            ids.push(current);

            const children = getChildren(current);
            children.forEach((child) => {
                const childId = Number(child.id);
                if (Number.isFinite(childId)) stack.push(childId);
            });
        }

        return ids;
    }

    function handleSearchInput(event) {
        state.search = String(event.target.value || '').trim();
        renderSummary();
        renderCards();
    }

    function handleCategoryFilterChange(event) {
        state.category = String(event.target.value || '').trim().toUpperCase();
        renderSummary();
        renderCards();
    }

    function setCurrentFolder(folderId) {
        state.currentFolderId = normalizeParentId(folderId);
        renderAll();
        syncParentSelect();
        syncGoUpButton();
    }

    function syncGoUpButton() {
        const upButton = document.getElementById('docs-go-up-btn');
        if (!upButton) return;
        upButton.disabled = state.currentFolderId === null;
    }

    function goUpFolder() {
        if (state.currentFolderId === null) return;
        const current = state.byId.get(state.currentFolderId);
        setCurrentFolder(normalizeParentId(current?.parent_id));
    }

    async function visualizarDocumento(id, { forceDownload = false } = {}) {
        const record = state.byId.get(Number(id));
        if (!record) {
            showToast('Item não encontrado para visualização.', 'error');
            return;
        }

        if (normalizeTipo(record.tipo) === 'PASTA') {
            setCurrentFolder(Number(record.id));
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

        openPreviewModal(record, data.signedUrl);
    }

    function canRenderInline(mimeType, fileName) {
        const mime = String(mimeType || '').toLowerCase();
        if (mime.startsWith('image/')) return true;
        if (mime.includes('pdf')) return true;
        if (mime.startsWith('text/')) return true;

        const extension = String(fileName || '').split('.').pop()?.toLowerCase() || '';
        return INLINE_EXTENSIONS.has(extension);
    }

    function openPreviewModal(record, signedUrl) {
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
            if (event.target === modal) close();
        });

        modal.querySelectorAll('[data-action="close"]').forEach((btn) => btn.addEventListener('click', close));
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
            showToast('Apenas administradores podem cadastrar ou editar itens.', 'error');
            return;
        }

        const payload = collectFormData();
        const id = Number(document.getElementById('docs-id')?.value || 0);
        const currentRecord = id > 0 ? state.byId.get(id) : null;

        const validationError = validatePayload(payload, {
            requireFile: payload.tipo === 'DOCUMENTO' && (!currentRecord || !currentRecord.arquivo_path),
        });
        if (validationError) {
            showToast(validationError, 'error');
            return;
        }

        setSubmitBusy(true);

        const api = window.App.api.documentacao;
        const response = id > 0
            ? await api.atualizar(id, payload)
            : await api.criar(payload);

        setSubmitBusy(false);

        if (response.error) {
            showToast(response.error.message, 'error');
            return;
        }

        showToast(id > 0 ? 'Item atualizado.' : 'Item cadastrado.', 'success');
        resetForm();
        await loadDocumentacao();
    }

    function collectFormData() {
        const fileInput = document.getElementById('docs-form-arquivo');
        return {
            tipo: document.getElementById('docs-form-tipo')?.value || 'DOCUMENTO',
            parentId: document.getElementById('docs-form-parent')?.value || '',
            categoria: document.getElementById('docs-form-categoria')?.value || '',
            titulo: document.getElementById('docs-form-titulo')?.value || '',
            descricao: document.getElementById('docs-form-descricao')?.value || '',
            file: fileInput?.files?.[0] || null,
        };
    }

    function validatePayload(payload, { requireFile = true } = {}) {
        const tipo = normalizeTipo(payload.tipo);
        const categoria = String(payload.categoria || '').trim().toUpperCase();
        const titulo = String(payload.titulo || '').trim();
        const file = payload.file;

        if (!titulo) {
            return 'Informe o título do item.';
        }

        if (!TYPE_LABELS[tipo]) {
            return 'Tipo inválido para cadastro.';
        }

        if (!CATEGORY_LABELS[categoria]) {
            return 'Selecione uma categoria válida.';
        }

        if (tipo === 'PASTA') {
            return null;
        }

        if (requireFile && !file) {
            return 'Selecione um arquivo para cadastro do documento.';
        }

        if (file && Number(file.size) > MAX_DOCUMENT_BYTES) {
            return 'Arquivo acima de 20 MB. Envie uma versão menor.';
        }

        return null;
    }

    function fillFormForEdit(id) {
        const record = state.byId.get(Number(id));
        if (!record) {
            showToast('Item não encontrado para edição.', 'error');
            return;
        }

        setValue('docs-id', String(record.id));
        setValue('docs-form-tipo', normalizeTipo(record.tipo));
        setValue('docs-form-parent', record.parent_id ? String(record.parent_id) : '');
        setValue('docs-form-categoria', record.categoria || 'GERAL');
        setValue('docs-form-titulo', record.titulo || '');
        setValue('docs-form-descricao', record.descricao || '');
        setValue('docs-form-arquivo', '');

        const currentFile = document.getElementById('docs-current-file');
        if (currentFile) {
            if (normalizeTipo(record.tipo) === 'DOCUMENTO' && record.arquivo_nome) {
                currentFile.textContent = `Arquivo atual: ${record.arquivo_nome}`;
                currentFile.style.display = 'block';
            } else {
                currentFile.textContent = '';
                currentFile.style.display = 'none';
            }
        }

        syncParentSelect(record.id);
        syncFormTypeUI();
        setText('docs-submit-btn', 'Atualizar Item');
        toggleDisplay('docs-cancel-btn', true);
        document.getElementById('docs-form-titulo')?.focus();
    }

    function resetForm() {
        setValue('docs-id', '');
        setValue('docs-form-tipo', 'DOCUMENTO');
        setValue('docs-form-parent', state.currentFolderId ? String(state.currentFolderId) : '');
        setValue('docs-form-categoria', '');
        setValue('docs-form-titulo', '');
        setValue('docs-form-descricao', '');
        setValue('docs-form-arquivo', '');

        const currentFile = document.getElementById('docs-current-file');
        if (currentFile) {
            currentFile.textContent = '';
            currentFile.style.display = 'none';
        }

        setText('docs-submit-btn', 'Salvar Item');
        toggleDisplay('docs-cancel-btn', false);
        syncParentSelect();
        syncFormTypeUI();
        syncFormAccess();
    }

    function syncParentSelect(editingId = null) {
        const select = document.getElementById('docs-form-parent');
        if (!select) return;

        const previousValue = select.value;
        const descendants = editingId ? new Set(collectDescendantIds(editingId)) : new Set();

        select.innerHTML = '<option value="">Raiz</option>';
        appendFolderOptions(select, null, 0, descendants);

        const defaultValue = editingId
            ? (state.byId.get(editingId)?.parent_id ? String(state.byId.get(editingId).parent_id) : '')
            : (state.currentFolderId ? String(state.currentFolderId) : '');

        const candidate = previousValue || defaultValue;
        if (candidate && Array.from(select.options).some((option) => option.value === candidate)) {
            select.value = candidate;
            return;
        }

        select.value = defaultValue && Array.from(select.options).some((option) => option.value === defaultValue)
            ? defaultValue
            : '';
    }

    function appendFolderOptions(select, parentId, depth, excludedIds, visited = new Set()) {
        const folders = getChildren(parentId).filter((item) => normalizeTipo(item.tipo) === 'PASTA');
        folders.forEach((folder) => {
            const folderId = Number(folder.id);
            if (excludedIds.has(folderId)) return;
            if (visited.has(folderId)) return;
            visited.add(folderId);

            const prefix = depth > 0 ? `${'— '.repeat(depth)}` : '';
            select.add(new Option(`${prefix}${folder.titulo}`, String(folderId)));
            appendFolderOptions(select, folderId, depth + 1, excludedIds, visited);
        });
    }

    function syncFormTypeUI() {
        const tipo = normalizeTipo(document.getElementById('docs-form-tipo')?.value);
        const fileGroup = document.getElementById('docs-file-group');
        const categorySelect = document.getElementById('docs-form-categoria');
        const fileInput = document.getElementById('docs-form-arquivo');

        const isFolder = tipo === 'PASTA';
        if (fileGroup) {
            fileGroup.style.display = isFolder ? 'none' : '';
        }

        if (categorySelect) {
            if (isFolder && !categorySelect.value) {
                categorySelect.value = 'GERAL';
            }
            categorySelect.disabled = isFolder || !hasAdminAccess();
        }

        if (fileInput) {
            fileInput.disabled = isFolder || !hasAdminAccess();
        }
    }

    function syncFormAccess() {
        const isAdminUser = hasAdminAccess();
        const form = document.getElementById('docs-form');
        const permissionNote = document.getElementById('docs-form-permission');

        if (permissionNote) {
            permissionNote.textContent = isAdminUser
                ? 'Você possui permissão para criar, editar e excluir pastas e documentos.'
                : 'Modo leitura: você pode navegar em pastas, visualizar e baixar documentos.';
            permissionNote.classList.toggle('restricted', !isAdminUser);
        }

        if (!form) return;

        form.querySelectorAll('input, select, textarea, button').forEach((element) => {
            if (element.id === 'docs-cancel-btn' && element.style.display === 'none') return;
            element.disabled = !isAdminUser;
        });

        syncFormTypeUI();
    }

    function setSubmitBusy(busy) {
        const submit = document.getElementById('docs-submit-btn');
        if (!submit) return;

        submit.disabled = busy;
        if (busy) {
            submit.textContent = 'Salvando...';
            return;
        }

        const id = Number(document.getElementById('docs-id')?.value || 0);
        submit.textContent = id > 0 ? 'Atualizar Item' : 'Salvar Item';
    }

    function getCategoryLabel(value) {
        const key = String(value || '').toUpperCase();
        return CATEGORY_LABELS[key] || 'Categoria';
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
        const el = document.getElementById(id);
        if (el) el.value = value;
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
