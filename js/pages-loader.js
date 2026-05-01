/**
 * pages-loader.js
 *
 * Monta o conteúdo do SPA a partir de páginas parciais em /pages.
 * A carga é síncrona para garantir que os módulos atuais (init em DOMContentLoaded)
 * encontrem os elementos já presentes no DOM.
 */

(function bootstrapPagesLoader() {
    'use strict';

    const PAGE_PARTIALS = [
        'pages/home.html',
        'pages/dashboards.html',
        'pages/gerador.html',
        'pages/helpdesk.html',
        'pages/corporativo.html',
        'pages/telecom.html',
        'pages/unidades.html',
        'pages/linhas.html',
        'pages/redes.html',
        'pages/rede-usuarios.html',
        'pages/rede-topologia.html',
        'pages/rede-politicas.html',
        'pages/colaboradores.html',
        'pages/usuarios.html',
        'pages/cadastros.html',
        'pages/cad-estrutura.html',
        'pages/cad-filiais.html',
        'pages/cad-direcionadores.html',
    ];

    function loadPartialSync(path) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', path, false);
            xhr.send(null);

            const okStatus = xhr.status >= 200 && xhr.status < 300;
            const fileProtocolSuccess = xhr.status === 0 && String(xhr.responseText || '').trim();
            if (!okStatus && !fileProtocolSuccess) {
                return { html: '', error: `Falha ao carregar "${path}" (status ${xhr.status}).` };
            }

            return { html: xhr.responseText || '', error: null };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || 'erro desconhecido');
            return { html: '', error: `Erro ao carregar "${path}": ${message}` };
        }
    }

    function renderError(container, errors) {
        container.innerHTML = `
            <div class="table-state">
                <div class="icon">⚠️</div>
                <div>Não foi possível montar as páginas modulares.</div>
                <div style="font-size:0.68rem;color:var(--text-muted);max-width:580px;line-height:1.5;">
                    ${errors.map((item) => escapeHtml(item)).join('<br>')}
                </div>
            </div>
        `;
    }

    function renderFileProtocolHint(container) {
        container.innerHTML = `
            <div class="table-state">
                <div class="icon">🌐</div>
                <div>O app foi aberto via <code>file://</code> e o navegador bloqueou o carregamento modular.</div>
                <div style="font-size:0.68rem;color:var(--text-muted);max-width:620px;line-height:1.6;">
                    Inicie um servidor local nesta pasta e abra por HTTP:<br>
                    <code>py -m http.server 5500</code><br>
                    ou<br>
                    <code>python -m http.server 5500</code><br><br>
                    Depois acesse:<br>
                    <code>http://localhost:5500/</code>
                </div>
            </div>
        `;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const container = document.getElementById('pages-container');
    if (!container) return;

    if (window.location.protocol === 'file:') {
        renderFileProtocolHint(container);
        return;
    }

    const fragments = [];
    const errors = [];

    PAGE_PARTIALS.forEach((path) => {
        const { html, error } = loadPartialSync(path);
        if (error) {
            errors.push(error);
            return;
        }
        fragments.push(html);
    });

    if (errors.length) {
        console.error('[pages-loader] Falha ao carregar páginas:', errors);
        renderError(container, errors);
        return;
    }

    container.innerHTML = fragments.join('\n\n');
    document.dispatchEvent(new CustomEvent('app:pages-loaded', {
        detail: {
            pages: PAGE_PARTIALS.slice(),
        },
    }));
})();
