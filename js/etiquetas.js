/**
 * etiquetas.js
 *
 * Página de etiquetas com base no cadastro dinâmico de filiais.
 */

(function bootstrapEtiquetas() {
    'use strict';

    const state = {
        initialized: false,
        filiais: [],
    };

    function initEtiquetas() {
        if (state.initialized) return;

        document.getElementById('labelGrid')?.addEventListener('click', handleLabelCopy);

        document.addEventListener('app:catalog-updated', () => {
            if (isEtiquetasActive()) {
                loadEtiquetas();
            }
        });

        state.initialized = true;
    }

    function isEtiquetasActive() {
        return document.getElementById('page-etiquetas')?.classList.contains('active');
    }

    async function onEtiquetasActivate() {
        if (!getCurrentUser()) return;
        await loadEtiquetas();
    }

    async function loadEtiquetas() {
        const grid = document.getElementById('labelGrid');
        if (!grid) return;

        const listFn = window.App?.api?.catalog?.listarFiliais;
        if (typeof listFn !== 'function') {
            renderError('API de filiais indisponível.');
            return;
        }

        renderLoading();

        const { data, error } = await listFn({ apenasAtivos: true, apenasEtiqueta: true });
        if (error) {
            renderError(error.message);
            return;
        }

        state.filiais = data || [];
        renderEtiquetas();
    }

    function renderLoading() {
        const grid = document.getElementById('labelGrid');
        if (!grid) return;

        grid.innerHTML = `
            <div class="table-state" style="grid-column:1/-1;min-height:180px">
                <div class="spinner"></div>
                <div>Carregando etiquetas...</div>
            </div>
        `;
    }

    function renderError(message) {
        const grid = document.getElementById('labelGrid');
        if (!grid) return;

        grid.innerHTML = `
            <div class="table-state" style="grid-column:1/-1;min-height:180px">
                <div class="icon">⚠️</div>
                <div>Erro ao carregar etiquetas.<br><small style="color:var(--danger)">${escapeHtml(message)}</small></div>
            </div>
        `;
    }

    function buildEtiquetaText(filial) {
        const linhas = [
            'VS Suprimentos para Comunicação Visual Ltda',
            `${filial.endereco}, nº ${filial.numero}`,
            `${filial.bairro}, ${filial.cidade}-${filial.uf}`,
        ];

        if (filial.cep) {
            linhas.push(`CEP: ${filial.cep}`);
        }

        return linhas.join('\n');
    }

    function renderEtiquetas() {
        const grid = document.getElementById('labelGrid');
        if (!grid) return;

        if (!state.filiais.length) {
            grid.innerHTML = `
                <div class="table-state" style="grid-column:1/-1;min-height:180px">
                    <div class="icon">🏷️</div>
                    <div>Nenhuma filial marcada para etiqueta.</div>
                </div>
            `;
            return;
        }

        grid.innerHTML = state.filiais.map((filial) => {
            const titulo = filial.nome || `${filial.cidade}-${filial.uf}`;
            const enderecoRaw = buildEtiquetaText(filial);
            const enderecoHtml = escapeHtml(enderecoRaw).replace(/\n/g, '<br>');

            return `
                <div class="label-card">
                    <button class="copy-btn" data-label-text="${escapeHtmlAttribute(enderecoRaw)}">Copiar</button>
                    <div class="label-title">${escapeHtml(titulo)}</div>
                    <div class="label-body">PARA:<br>A/c: TI VinilSul<br>${enderecoHtml}</div>
                </div>
            `;
        }).join('');
    }

    function handleLabelCopy(event) {
        const btn = event.target.closest('.copy-btn');
        if (!btn) return;

        const rawText = btn.dataset.labelText || '';
        const fullText = `PARA:\nA/c: TI VinilSul\n${rawText}`;

        navigator.clipboard.writeText(fullText).then(() => {
            btn.textContent = '✓ Copiado';
            btn.classList.add('copied');

            setTimeout(() => {
                btn.textContent = 'Copiar';
                btn.classList.remove('copied');
            }, 2000);
        });
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
        return escapeHtml(value)
            .replace(/\n/g, '&#10;');
    }

    window.onEtiquetasActivate = onEtiquetasActivate;
    window.loadEtiquetas = loadEtiquetas;

    document.addEventListener('DOMContentLoaded', initEtiquetas);
})();
