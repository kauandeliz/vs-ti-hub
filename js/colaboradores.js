/**
 * colaboradores.js
 *
 * CRUD de colaboradores (sem armazenamento de credenciais).
 */

(function bootstrapColaboradores() {
    'use strict';

    const state = {
        initialized: false,
        loading: false,
        records: [],
        page: 1,
        pageSize: 20,
        search: '',
        statusFilter: '',
        catalog: null,
    };

    function initColaboradores() {
        if (state.initialized) return;

        document.getElementById('colab-form')?.addEventListener('submit', handleFormSubmit);
        document.getElementById('colab-cancel-btn')?.addEventListener('click', resetForm);
        document.getElementById('colab-refresh-btn')?.addEventListener('click', loadColaboradores);
        document.getElementById('colab-filter-status')?.addEventListener('change', handleStatusChange);
        document.getElementById('colab-search')?.addEventListener('input', debounce(handleSearchInput, 300));
        document.getElementById('colab-tbody')?.addEventListener('click', handleTableClick);
        document.getElementById('colab-pagination')?.addEventListener('click', handlePaginationClick);

        document.getElementById('colab-form-setor')?.addEventListener('change', handleSetorChange);
        document.getElementById('colab-form-uf')?.addEventListener('change', handleUfChange);
        document.getElementById('colab-form-cidade')?.addEventListener('change', handleCidadeChange);

        document.addEventListener('app:catalog-updated', () => {
            if (!isAdmin()) return;
            loadCatalog(true);
        });

        document.addEventListener('app:auth-changed', (event) => {
            if (!event.detail?.isAdmin) {
                renderRestricted();
                setFormDisabled(true);
            }
        });

        state.initialized = true;
    }

    function isActive() {
        return document.getElementById('page-colaboradores')?.classList.contains('active');
    }

    async function onColaboradoresActivate() {
        if (!isAdmin()) {
            renderRestricted();
            setFormDisabled(true);
            return;
        }

        setFormDisabled(false);
        await Promise.all([loadCatalog(false), loadColaboradores()]);
    }

    async function loadCatalog(force = false) {
        const api = window.App?.api?.catalog;
        if (!api?.getCatalogSnapshot) return;

        const { data, error } = await api.getCatalogSnapshot({ force, apenasAtivos: true });
        if (error || !data) return;

        state.catalog = data;
        renderSetorOptions();
        renderUfOptions();
    }

    function renderSetorOptions() {
        const select = document.getElementById('colab-form-setor');
        if (!select) return;

        const previous = select.value || '';
        const setores = [...(state.catalog?.setores || [])];

        select.innerHTML = '<option value="" selected disabled>Selecione...</option>';
        setores.forEach((setor) => select.add(new Option(setor, setor)));

        if (previous && setores.includes(previous)) {
            select.value = previous;
            renderCargoOptions(previous);
        } else {
            renderCargoOptions('');
        }
    }

    function renderCargoOptions(setorNome, selectedCargo = '') {
        const select = document.getElementById('colab-form-cargo');
        if (!select) return;

        const setor = String(setorNome || '').trim();
        const cargos = [...(state.catalog?.cargosPorSetor?.[setor] || [])]
            .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
        const selected = String(selectedCargo || '').trim();

        if (selected && !cargos.includes(selected)) {
            cargos.unshift(selected);
        }

        select.innerHTML = '<option value="" selected disabled>Selecione...</option>';
        if (!setor) {
            select.innerHTML = '<option value="" selected disabled>Setor primeiro</option>';
            select.disabled = true;
            return;
        }

        cargos.forEach((cargo) => select.add(new Option(cargo, cargo)));

        if (!cargos.length) {
            select.innerHTML = '<option value="" selected disabled>Sem cargos neste setor</option>';
            select.disabled = true;
            return;
        }

        if (selected && cargos.includes(selected)) {
            select.value = selected;
        }

        select.disabled = false;
    }

    function renderUfOptions() {
        const select = document.getElementById('colab-form-uf');
        if (!select) return;

        const previous = String(select.value || '').trim();
        const ufs = [...(state.catalog?.ufs || [])];
        if (previous && !ufs.includes(previous)) {
            ufs.unshift(previous);
        }

        select.innerHTML = '<option value="" selected disabled>Selecione...</option>';
        ufs.forEach((uf) => select.add(new Option(uf, uf)));

        if (previous && ufs.includes(previous)) {
            select.value = previous;
            renderCidadeOptions(previous);
        } else {
            renderCidadeOptions('');
        }
    }

    function renderCidadeOptions(uf, selectedCidade = '') {
        const select = document.getElementById('colab-form-cidade');
        if (!select) return;

        const cidades = Object.keys(state.catalog?.localidadeData?.[uf] || {})
            .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
        const selected = String(selectedCidade || '').trim();
        if (selected && !cidades.includes(selected)) {
            cidades.unshift(selected);
        }

        if (!uf) {
            select.innerHTML = '<option value="" selected disabled>UF primeiro</option>';
            select.disabled = true;
            return;
        }

        select.innerHTML = '<option value="" selected disabled>Selecione...</option>';
        cidades.forEach((cidade) => select.add(new Option(cidade, cidade)));

        if (!cidades.length) {
            select.innerHTML = '<option value="" selected disabled>Sem cidades nesta UF</option>';
            select.disabled = true;
            return;
        }

        if (selected && cidades.includes(selected)) {
            select.value = selected;
        }

        select.disabled = false;
    }

    function renderBairroSuggestion(uf, cidade) {
        const input = document.getElementById('colab-form-bairro');
        if (!input) return;

        const bairros = state.catalog?.localidadeData?.[uf]?.[cidade] || [];
        if (!bairros.length) {
            input.placeholder = 'Ex: Jardim Botânico';
            return;
        }

        input.placeholder = `Sugestão: ${bairros[0]}`;
    }

    function handleSetorChange(event) {
        renderCargoOptions(event.target.value || '');
    }

    function handleUfChange(event) {
        renderCidadeOptions(event.target.value || '');
        renderBairroSuggestion('', '');
    }

    function handleCidadeChange(event) {
        const uf = document.getElementById('colab-form-uf')?.value || '';
        renderBairroSuggestion(uf, event.target.value || '');
    }

    function handleSearchInput(event) {
        state.search = event.target.value || '';
        state.page = 1;
        loadColaboradores();
    }

    function handleStatusChange(event) {
        state.statusFilter = event.target.value || '';
        state.page = 1;
        loadColaboradores();
    }

    async function loadColaboradores() {
        if (!isAdmin()) {
            renderRestricted();
            return;
        }

        if (state.loading) return;
        state.loading = true;
        renderTableLoading();

        const { data, error } = await window.App.api.colaboradores.listar({
            search: state.search,
            status: state.statusFilter,
        });

        state.loading = false;

        if (error) {
            renderTableError(error.message);
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
        const ativos = state.records.filter((item) => item.ativo).length;
        const inativos = total - ativos;
        const summary = `${total} colaboradores • ${ativos} ativos • ${inativos} inativos`;
        setText('colab-summary', summary);
    }

    function getTotalPages() {
        return Math.max(1, Math.ceil(state.records.length / state.pageSize));
    }

    function renderTable() {
        const tbody = document.getElementById('colab-tbody');
        if (!tbody) return;

        const start = (state.page - 1) * state.pageSize;
        const rows = state.records.slice(start, start + state.pageSize);

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="table-state">
                            <div class="icon">🧑‍💼</div>
                            <div>Nenhum colaborador encontrado.</div>
                        </div>
                    </td>
                </tr>
            `;
            renderPagination();
            return;
        }

        tbody.innerHTML = rows.map((item) => {
            const statusPill = item.ativo
                ? '<span class="status-pill ativo">● Ativo</span>'
                : '<span class="status-pill revogado">✕ Inativo</span>';

            return `
                <tr>
                    <td>
                        <div class="colab-row-main">
                            <strong>${escapeHtml(item.nome)}</strong>
                            <small>CPF ${formatCpf(item.cpf)}</small>
                        </div>
                    </td>
                    <td>${escapeHtml(item.setor)} • ${escapeHtml(item.cargo)}</td>
                    <td>${escapeHtml(item.cidade)} - ${escapeHtml(item.uf)}${item.bairro ? ` <span style="color:var(--text-muted)">(${escapeHtml(item.bairro)})</span>` : ''}</td>
                    <td>${window.App?.utils?.formatDateBR?.(item.data_admissao) || '—'}</td>
                    <td>${statusPill}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-row primary" data-action="edit" data-id="${item.id}">Editar</button>
                            <button class="btn-row danger" data-action="delete" data-id="${item.id}" data-name="${escapeHtmlAttribute(item.nome)}">Excluir</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination();
    }

    function renderPagination() {
        const container = document.getElementById('colab-pagination');
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
        const tbody = document.getElementById('colab-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>Carregando colaboradores...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderTableError(message) {
        const tbody = document.getElementById('colab-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="table-state">
                        <div class="icon">⚠️</div>
                        <div>${escapeHtml(message)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderRestricted() {
        const tbody = document.getElementById('colab-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="table-state">
                            <div class="icon">🔒</div>
                            <div>Acesso restrito a administradores.</div>
                        </div>
                    </td>
                </tr>
            `;
        }
        setText('colab-summary', 'Acesso restrito a administradores.');
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

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!isAdmin()) return;

        const payload = collectFormData();
        const validation = validateFormData(payload);
        if (validation) {
            showToast(validation, 'error');
            return;
        }

        const id = Number(document.getElementById('colab-id')?.value || 0);
        const api = window.App.api.colaboradores;

        const op = id > 0
            ? api.atualizar(id, payload)
            : api.criar(payload);

        const { error } = await op;
        if (error) {
            showToast(error.message, 'error');
            return;
        }

        showToast(id > 0 ? 'Colaborador atualizado.' : 'Colaborador criado.', 'success');
        resetForm();
        await loadColaboradores();
        document.dispatchEvent(new CustomEvent('app:colaboradores-updated'));
    }

    function collectFormData() {
        return {
            nome: document.getElementById('colab-form-nome')?.value || '',
            cpf: document.getElementById('colab-form-cpf')?.value || '',
            dataAdmissao: document.getElementById('colab-form-data')?.value || '',
            setor: document.getElementById('colab-form-setor')?.value || '',
            cargo: document.getElementById('colab-form-cargo')?.value || '',
            uf: document.getElementById('colab-form-uf')?.value || '',
            cidade: document.getElementById('colab-form-cidade')?.value || '',
            bairro: document.getElementById('colab-form-bairro')?.value || '',
            ativo: Boolean(document.getElementById('colab-form-ativo')?.checked),
        };
    }

    function validateFormData(payload) {
        const nome = String(payload.nome || '').trim();
        const cpf = String(payload.cpf || '').replace(/\D/g, '');
        const setor = String(payload.setor || '').trim();
        const cargo = String(payload.cargo || '').trim();
        const uf = String(payload.uf || '').trim();
        const cidade = String(payload.cidade || '').trim();

        if (!nome || !cpf || !setor || !cargo || !uf || !cidade) {
            return 'Preencha nome, CPF, setor, cargo, UF e cidade.';
        }

        if (nome.split(/\s+/).length < 2) {
            return 'Informe nome e sobrenome.';
        }

        if (!/^\d{11}$/.test(cpf)) {
            return 'CPF inválido. Informe 11 dígitos.';
        }

        if (payload.dataAdmissao && !window.App?.utils?.parseDateBR?.(payload.dataAdmissao)) {
            return 'Data de admissão inválida. Use dd/mm/aaaa.';
        }

        return null;
    }

    async function handleTableClick(event) {
        const btn = event.target.closest('[data-action][data-id]');
        if (!btn) return;

        const id = Number(btn.dataset.id);
        if (!Number.isFinite(id)) return;

        if (btn.dataset.action === 'edit') {
            fillFormForEdit(id);
            return;
        }

        if (btn.dataset.action === 'delete') {
            const name = btn.dataset.name || 'este colaborador';
            const ok = window.confirm(`Excluir ${name}?`);
            if (!ok) return;

            const { error } = await window.App.api.colaboradores.remover(id);
            if (error) {
                showToast(error.message, 'error');
                return;
            }

            showToast('Colaborador removido.', 'success');
            resetForm();
            await loadColaboradores();
            document.dispatchEvent(new CustomEvent('app:colaboradores-updated'));
        }
    }

    function fillFormForEdit(id) {
        const record = state.records.find((item) => item.id === id);
        if (!record) return;

        setValue('colab-id', String(record.id));
        setValue('colab-form-nome', record.nome || '');
        setValue('colab-form-cpf', formatCpf(record.cpf));
        setValue('colab-form-data', window.App?.utils?.formatDateBR?.(record.data_admissao) || '');

        setValue('colab-form-setor', record.setor || '');
        renderCargoOptions(record.setor || '', record.cargo || '');

        setValue('colab-form-uf', record.uf || '');
        renderCidadeOptions(record.uf || '', record.cidade || '');
        renderBairroSuggestion(record.uf || '', record.cidade || '');

        setValue('colab-form-bairro', record.bairro || '');
        setChecked('colab-form-ativo', Boolean(record.ativo));

        setText('colab-submit-btn', 'Atualizar Colaborador');
        toggleDisplay('colab-cancel-btn', true);
        document.getElementById('colab-form-nome')?.focus();
    }

    function resetForm() {
        setValue('colab-id', '');
        setValue('colab-form-nome', '');
        setValue('colab-form-cpf', '');
        setValue('colab-form-data', '');
        setValue('colab-form-setor', '');
        renderCargoOptions('', '');
        setValue('colab-form-uf', '');
        renderCidadeOptions('', '');
        setValue('colab-form-bairro', '');
        setChecked('colab-form-ativo', true);
        setText('colab-submit-btn', 'Salvar Colaborador');
        toggleDisplay('colab-cancel-btn', false);
    }

    function setFormDisabled(disabled) {
        const form = document.getElementById('colab-form');
        if (!form) return;

        form.querySelectorAll('input, select, button, textarea').forEach((element) => {
            if (element.id === 'colab-cancel-btn' && element.style.display === 'none') return;
            element.disabled = disabled;
        });
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    function setChecked(id, checked) {
        const el = document.getElementById(id);
        if (el) el.checked = checked;
    }

    function toggleDisplay(id, visible) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = visible ? '' : 'none';
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function formatCpf(value) {
        const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
        if (digits.length !== 11) return digits;
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.app-toast');
        if (existing) {
            existing.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'app-toast';
        const isError = type === 'error';

        toast.style.cssText = `
            position:fixed;
            bottom:24px;
            right:24px;
            z-index:999;
            padding:10px 16px;
            border-radius:8px;
            font-size:0.78rem;
            font-weight:600;
            font-family:var(--font);
            box-shadow:0 4px 20px rgba(0,0,0,0.4);
            animation:fadeIn 0.2s ease;
            background:${isError ? 'rgba(240,82,82,0.15)' : 'rgba(56,217,169,0.15)'};
            border:1px solid ${isError ? 'rgba(240,82,82,0.3)' : 'rgba(56,217,169,0.3)'};
            color:${isError ? 'var(--danger)' : 'var(--accent2)'};
        `;
        toast.textContent = `${isError ? '⚠ ' : '✓ '}${message}`;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 3200);
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

    window.onColaboradoresActivate = onColaboradoresActivate;
    window.loadColaboradores = loadColaboradores;
    window.showToast = window.showToast || showToast;

    document.addEventListener('DOMContentLoaded', initColaboradores);
})();
