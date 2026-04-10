/**
 * cadastros.js
 *
 * CRUD administrativo para setores, cargos e filiais.
 */

(function bootstrapCadastros() {
    'use strict';

    const state = {
        initialized: false,
        loading: false,
        setores: [],
        cargos: [],
        filiais: [],
    };

    function initCadastros() {
        if (state.initialized) return;

        document.getElementById('cad-setor-form')?.addEventListener('submit', handleSetorSubmit);
        document.getElementById('cad-setor-cancel')?.addEventListener('click', resetSetorForm);
        document.getElementById('cad-setor-tbody')?.addEventListener('click', handleSetorTableClick);

        document.getElementById('cad-cargo-form')?.addEventListener('submit', handleCargoSubmit);
        document.getElementById('cad-cargo-cancel')?.addEventListener('click', resetCargoForm);
        document.getElementById('cad-cargo-tbody')?.addEventListener('click', handleCargoTableClick);

        document.getElementById('cad-filial-form')?.addEventListener('submit', handleFilialSubmit);
        document.getElementById('cad-filial-cancel')?.addEventListener('click', resetFilialForm);
        document.getElementById('cad-filial-tbody')?.addEventListener('click', handleFilialTableClick);

        document.getElementById('cad-refresh-btn')?.addEventListener('click', loadCadastros);

        document.addEventListener('app:catalog-updated', () => {
            if (isCadastrosActive()) {
                loadCadastros();
            }
        });

        state.initialized = true;
    }

    function isCadastrosActive() {
        return document.getElementById('page-cadastros')?.classList.contains('active');
    }

    async function onCadastrosActivate() {
        if (!isAdmin()) {
            renderRestricted();
            return;
        }

        await loadCadastros();
    }

    async function loadCadastros() {
        if (!isAdmin()) {
            renderRestricted();
            return;
        }

        if (state.loading) return;

        const api = window.App?.api?.catalog;
        if (!api) {
            notify('API de catálogo indisponível.', 'error');
            return;
        }

        state.loading = true;
        renderLoadingStates();

        const [setoresRes, cargosRes, filiaisRes] = await Promise.all([
            api.listarSetores({ apenasAtivos: false }),
            api.listarCargos({ apenasAtivos: false }),
            api.listarFiliais({ apenasAtivos: false }),
        ]);

        state.loading = false;

        const firstError = setoresRes.error || cargosRes.error || filiaisRes.error;
        if (firstError) {
            renderErrorStates(firstError.message);
            return;
        }

        state.setores = setoresRes.data || [];
        state.cargos = cargosRes.data || [];
        state.filiais = filiaisRes.data || [];

        renderAll();
    }

    function renderRestricted() {
        ['cad-setor-tbody', 'cad-cargo-tbody', 'cad-filial-tbody'].forEach((id) => {
            const tbody = document.getElementById(id);
            if (!tbody) return;
            const colspan = id === 'cad-filial-tbody' ? 5 : 4;
            tbody.innerHTML = `
                <tr>
                    <td colspan="${colspan}">
                        <div class="table-state">
                            <div class="icon">🔒</div>
                            <div>Acesso restrito a administradores.</div>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    function renderLoadingStates() {
        setLoadingRow('cad-setor-tbody', 4, 'Carregando setores...');
        setLoadingRow('cad-cargo-tbody', 4, 'Carregando cargos...');
        setLoadingRow('cad-filial-tbody', 5, 'Carregando filiais...');
    }

    function renderErrorStates(message) {
        setErrorRow('cad-setor-tbody', 4, message);
        setErrorRow('cad-cargo-tbody', 4, message);
        setErrorRow('cad-filial-tbody', 5, message);
    }

    function setLoadingRow(tbodyId, colspan, text) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}">
                    <div class="table-state">
                        <div class="spinner"></div>
                        <div>${escapeHtml(text)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function setErrorRow(tbodyId, colspan, message) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}">
                    <div class="table-state">
                        <div class="icon">⚠️</div>
                        <div>${escapeHtml(message)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderAll() {
        renderSetoresTable();
        renderCargosTable();
        renderFiliaisTable();
        syncSetorSelects();
        updateSummary();
    }

    function updateSummary() {
        const activeSetores = state.setores.filter((s) => s.ativo).length;
        const activeCargos = state.cargos.filter((c) => c.ativo).length;
        const activeFiliais = state.filiais.filter((f) => f.ativo).length;

        setText('cad-summary', `${activeSetores} setores ativos • ${activeCargos} cargos ativos • ${activeFiliais} filiais ativas`);
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = text;
        }
    }

    function syncSetorSelects() {
        const selects = [document.getElementById('cad-cargo-setor')];
        selects.forEach((select) => {
            if (!select) return;

            const previous = select.value;
            select.innerHTML = '<option value="">Selecione...</option>';

            state.setores
                .slice()
                .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
                .forEach((setor) => {
                    const suffix = setor.ativo ? '' : ' (inativo)';
                    select.add(new Option(`${setor.nome}${suffix}`, String(setor.id)));
                });

            if (previous && Array.from(select.options).some((option) => option.value === previous)) {
                select.value = previous;
            }
        });
    }

    function renderSetoresTable() {
        const tbody = document.getElementById('cad-setor-tbody');
        if (!tbody) return;

        if (!state.setores.length) {
            tbody.innerHTML = emptyRow(4, 'Nenhum setor cadastrado.');
            return;
        }

        const cargoCountBySetor = new Map();
        state.cargos.forEach((cargo) => {
            cargoCountBySetor.set(cargo.setor_id, (cargoCountBySetor.get(cargo.setor_id) || 0) + 1);
        });

        tbody.innerHTML = state.setores
            .slice()
            .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
            .map((setor) => `
                <tr>
                    <td>${escapeHtml(setor.nome)}</td>
                    <td>${renderStatusPill(setor.ativo)}</td>
                    <td>${cargoCountBySetor.get(setor.id) || 0}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-row primary" data-action="edit-setor" data-id="${setor.id}">Editar</button>
                            <button class="btn-row danger" data-action="delete-setor" data-id="${setor.id}" data-nome="${escapeHtmlAttribute(setor.nome)}">Excluir</button>
                        </div>
                    </td>
                </tr>
            `)
            .join('');
    }

    function renderCargosTable() {
        const tbody = document.getElementById('cad-cargo-tbody');
        if (!tbody) return;

        if (!state.cargos.length) {
            tbody.innerHTML = emptyRow(4, 'Nenhum cargo cadastrado.');
            return;
        }

        const setorById = new Map(state.setores.map((setor) => [setor.id, setor.nome]));

        tbody.innerHTML = state.cargos
            .slice()
            .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
            .map((cargo) => `
                <tr>
                    <td>${escapeHtml(cargo.nome)}</td>
                    <td>${escapeHtml(setorById.get(cargo.setor_id) || '—')}</td>
                    <td>${renderStatusPill(cargo.ativo)}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-row primary" data-action="edit-cargo" data-id="${cargo.id}">Editar</button>
                            <button class="btn-row danger" data-action="delete-cargo" data-id="${cargo.id}" data-nome="${escapeHtmlAttribute(cargo.nome)}">Excluir</button>
                        </div>
                    </td>
                </tr>
            `)
            .join('');
    }

    function renderFiliaisTable() {
        const tbody = document.getElementById('cad-filial-tbody');
        if (!tbody) return;

        if (!state.filiais.length) {
            tbody.innerHTML = emptyRow(5, 'Nenhuma filial cadastrada.');
            return;
        }

        tbody.innerHTML = state.filiais
            .slice()
            .sort((a, b) => {
                const aCode = Number.isFinite(a.codigo) ? a.codigo : Number.POSITIVE_INFINITY;
                const bCode = Number.isFinite(b.codigo) ? b.codigo : Number.POSITIVE_INFINITY;
                if (aCode !== bCode) return aCode - bCode;
                return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
            })
            .map((filial) => {
                const codigo = Number.isFinite(filial.codigo) ? filial.codigo : '—';
                const etiqueta = filial.usa_etiqueta ? '✓' : '—';
                return `
                    <tr>
                        <td>
                            <div style="font-weight:600;color:var(--text)">${escapeHtml(codigo)} - ${escapeHtml(filial.nome || '—')}</div>
                            <div style="font-size:0.63rem;color:var(--text-muted)">${escapeHtml(filial.endereco || '—')}, ${escapeHtml(filial.numero || '—')}</div>
                        </td>
                        <td><span class="uf-badge">${escapeHtml(filial.uf || '—')}</span></td>
                        <td>${escapeHtml(filial.cidade || '—')}</td>
                        <td>${escapeHtml(filial.bairro || '—')}</td>
                        <td>
                            <span style="font-size:0.7rem;color:var(--text-soft)">Etiqueta: ${etiqueta}</span><br>
                            ${renderStatusPill(filial.ativo)}
                            <div class="row-actions" style="margin-top:6px">
                                <button class="btn-row primary" data-action="edit-filial" data-id="${filial.id}">Editar</button>
                                <button class="btn-row danger" data-action="delete-filial" data-id="${filial.id}" data-nome="${escapeHtmlAttribute(filial.nome || '')}">Excluir</button>
                            </div>
                        </td>
                    </tr>
                `;
            })
            .join('');
    }

    function renderStatusPill(active) {
        return active
            ? '<span class="status-pill ativo">● Ativo</span>'
            : '<span class="status-pill revogado">✕ Inativo</span>';
    }

    function emptyRow(colspan, text) {
        return `
            <tr>
                <td colspan="${colspan}">
                    <div class="table-state">
                        <div class="icon">🗂️</div>
                        <div>${escapeHtml(text)}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    async function handleSetorSubmit(event) {
        event.preventDefault();
        if (!isAdmin()) return;

        const id = Number(document.getElementById('cad-setor-id')?.value || 0);
        const nome = document.getElementById('cad-setor-nome')?.value || '';
        const ativo = Boolean(document.getElementById('cad-setor-ativo')?.checked);

        const api = window.App?.api?.catalog;
        if (!api) return;

        const op = id > 0
            ? api.atualizarSetor(id, { nome, ativo })
            : api.criarSetor({ nome, ativo });

        const { error } = await op;
        if (error) {
            notify(error.message, 'error');
            return;
        }

        notify(id > 0 ? 'Setor atualizado.' : 'Setor criado.', 'success');
        resetSetorForm();
        await loadCadastros();
        dispatchCatalogUpdated();
    }

    function resetSetorForm() {
        setValue('cad-setor-id', '');
        setValue('cad-setor-nome', '');
        setChecked('cad-setor-ativo', true);
        setText('cad-setor-submit', 'Salvar Setor');
        toggleDisplay('cad-setor-cancel', false);
    }

    async function handleSetorTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        const action = button.dataset.action;

        if (action === 'edit-setor') {
            const setor = state.setores.find((item) => item.id === id);
            if (!setor) return;

            setValue('cad-setor-id', String(setor.id));
            setValue('cad-setor-nome', setor.nome || '');
            setChecked('cad-setor-ativo', Boolean(setor.ativo));
            setText('cad-setor-submit', 'Atualizar Setor');
            toggleDisplay('cad-setor-cancel', true);
            document.getElementById('cad-setor-nome')?.focus();
            return;
        }

        if (action === 'delete-setor') {
            const nome = button.dataset.nome || 'este setor';
            const ok = window.confirm(`Excluir ${nome}? Os cargos vinculados também serão removidos.`);
            if (!ok) return;

            const { error } = await window.App.api.catalog.removerSetor(id);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Setor removido.', 'success');
            resetSetorForm();
            await loadCadastros();
            dispatchCatalogUpdated();
        }
    }

    async function handleCargoSubmit(event) {
        event.preventDefault();
        if (!isAdmin()) return;

        const id = Number(document.getElementById('cad-cargo-id')?.value || 0);
        const setorId = Number(document.getElementById('cad-cargo-setor')?.value || 0);
        const nome = document.getElementById('cad-cargo-nome')?.value || '';
        const ativo = Boolean(document.getElementById('cad-cargo-ativo')?.checked);

        const api = window.App?.api?.catalog;
        if (!api) return;

        const op = id > 0
            ? api.atualizarCargo(id, { setorId, nome, ativo })
            : api.criarCargo({ setorId, nome, ativo });

        const { error } = await op;
        if (error) {
            notify(error.message, 'error');
            return;
        }

        notify(id > 0 ? 'Cargo atualizado.' : 'Cargo criado.', 'success');
        resetCargoForm();
        await loadCadastros();
        dispatchCatalogUpdated();
    }

    function resetCargoForm() {
        setValue('cad-cargo-id', '');
        setValue('cad-cargo-nome', '');
        setValue('cad-cargo-setor', '');
        setChecked('cad-cargo-ativo', true);
        setText('cad-cargo-submit', 'Salvar Cargo');
        toggleDisplay('cad-cargo-cancel', false);
    }

    async function handleCargoTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        const action = button.dataset.action;

        if (action === 'edit-cargo') {
            const cargo = state.cargos.find((item) => item.id === id);
            if (!cargo) return;

            setValue('cad-cargo-id', String(cargo.id));
            setValue('cad-cargo-nome', cargo.nome || '');
            setValue('cad-cargo-setor', String(cargo.setor_id || ''));
            setChecked('cad-cargo-ativo', Boolean(cargo.ativo));
            setText('cad-cargo-submit', 'Atualizar Cargo');
            toggleDisplay('cad-cargo-cancel', true);
            document.getElementById('cad-cargo-nome')?.focus();
            return;
        }

        if (action === 'delete-cargo') {
            const nome = button.dataset.nome || 'este cargo';
            const ok = window.confirm(`Excluir ${nome}?`);
            if (!ok) return;

            const { error } = await window.App.api.catalog.removerCargo(id);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Cargo removido.', 'success');
            resetCargoForm();
            await loadCadastros();
            dispatchCatalogUpdated();
        }
    }

    async function handleFilialSubmit(event) {
        event.preventDefault();
        if (!isAdmin()) return;

        const id = Number(document.getElementById('cad-filial-id')?.value || 0);

        const payload = {
            codigo: document.getElementById('cad-filial-codigo')?.value || '',
            nome: document.getElementById('cad-filial-nome')?.value || '',
            uf: document.getElementById('cad-filial-uf')?.value || '',
            cidade: document.getElementById('cad-filial-cidade')?.value || '',
            bairro: document.getElementById('cad-filial-bairro')?.value || '',
            endereco: document.getElementById('cad-filial-endereco')?.value || '',
            numero: document.getElementById('cad-filial-numero')?.value || '',
            cnpj: document.getElementById('cad-filial-cnpj')?.value || '',
            cep: document.getElementById('cad-filial-cep')?.value || '',
            usaEtiqueta: Boolean(document.getElementById('cad-filial-etiqueta')?.checked),
            ativo: Boolean(document.getElementById('cad-filial-ativo')?.checked),
        };

        const api = window.App?.api?.catalog;
        if (!api) return;

        const op = id > 0
            ? api.atualizarFilial(id, payload)
            : api.criarFilial(payload);

        const { error } = await op;
        if (error) {
            notify(error.message, 'error');
            return;
        }

        notify(id > 0 ? 'Filial atualizada.' : 'Filial criada.', 'success');
        resetFilialForm();
        await loadCadastros();
        dispatchCatalogUpdated();
    }

    function resetFilialForm() {
        [
            'cad-filial-id',
            'cad-filial-codigo',
            'cad-filial-nome',
            'cad-filial-uf',
            'cad-filial-cidade',
            'cad-filial-bairro',
            'cad-filial-endereco',
            'cad-filial-numero',
            'cad-filial-cnpj',
            'cad-filial-cep',
        ].forEach((id) => setValue(id, ''));

        setChecked('cad-filial-etiqueta', true);
        setChecked('cad-filial-ativo', true);
        setText('cad-filial-submit', 'Salvar Filial');
        toggleDisplay('cad-filial-cancel', false);
    }

    async function handleFilialTableClick(event) {
        const button = event.target.closest('[data-action][data-id]');
        if (!button) return;

        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;

        const action = button.dataset.action;

        if (action === 'edit-filial') {
            const filial = state.filiais.find((item) => item.id === id);
            if (!filial) return;

            setValue('cad-filial-id', String(filial.id));
            setValue('cad-filial-codigo', Number.isFinite(filial.codigo) ? String(filial.codigo) : '');
            setValue('cad-filial-nome', filial.nome || '');
            setValue('cad-filial-uf', filial.uf || '');
            setValue('cad-filial-cidade', filial.cidade || '');
            setValue('cad-filial-bairro', filial.bairro || '');
            setValue('cad-filial-endereco', filial.endereco || '');
            setValue('cad-filial-numero', filial.numero || '');
            setValue('cad-filial-cnpj', filial.cnpj || '');
            setValue('cad-filial-cep', filial.cep || '');
            setChecked('cad-filial-etiqueta', Boolean(filial.usa_etiqueta));
            setChecked('cad-filial-ativo', Boolean(filial.ativo));
            setText('cad-filial-submit', 'Atualizar Filial');
            toggleDisplay('cad-filial-cancel', true);
            document.getElementById('cad-filial-nome')?.focus();
            return;
        }

        if (action === 'delete-filial') {
            const nome = button.dataset.nome || 'esta filial';
            const ok = window.confirm(`Excluir ${nome}?`);
            if (!ok) return;

            const { error } = await window.App.api.catalog.removerFilial(id);
            if (error) {
                notify(error.message, 'error');
                return;
            }

            notify('Filial removida.', 'success');
            resetFilialForm();
            await loadCadastros();
            dispatchCatalogUpdated();
        }
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

    function dispatchCatalogUpdated() {
        window.App?.api?.catalog?.invalidateCatalogCache?.();
        document.dispatchEvent(new CustomEvent('app:catalog-updated'));
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

    window.onCadastrosActivate = onCadastrosActivate;
    window.loadCadastros = loadCadastros;

    document.addEventListener('DOMContentLoaded', initCadastros);
})();
