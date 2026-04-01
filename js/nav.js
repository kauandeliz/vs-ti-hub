/**
 * nav.js
 * Handles sidebar navigation, page switching, mobile toggle, and global search.
 */

const PAGE_LABELS = {
    home:           'Home',
    gerador:        'Gerador de Acessos VS',
    helpdesk:       'Helpdesk',
    corporativo:    'Corporativo',
    telecom:        'Telecom',
    unidades:       'Unidades',
    etiquetas:      'Etiquetas',
    historico:      'Histórico de Acessos',
    usuarios:       'Usuários',
};

/**
 * Switch the visible page and highlight the active nav item.
 * @param {string} page - Page key matching `page-{key}` element IDs
 * @param {HTMLElement|null} el - The nav button that was clicked
 */
function navTo(page, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');
    if (el)     el.classList.add('active');

    const badge = document.getElementById('currentPageBadge');
    if (badge) badge.textContent = PAGE_LABELS[page] ?? page;

    // Trigger page-specific lifecycle hooks
    if (page === 'home' && typeof updateGreeting === 'function') {
        updateGreeting();
    }
    if (page === 'historico' && typeof onHistoricoActivate === 'function') {
        onHistoricoActivate();
    }
    if (page === 'usuarios' && typeof onUsuariosActivate === 'function') {
        onUsuariosActivate();
    }

    // Auto-close sidebar on mobile after navigation
    if (window.innerWidth < 900) {
        document.getElementById('sidebar')?.classList.remove('open');
    }
}

/** Toggle sidebar visibility on mobile. */
function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
}

/**
 * Filter visible cards, label cards, and table rows by search term.
 * @param {string} q - Raw search input value
 */
function globalSearch(q) {
    const term = q.toLowerCase().trim();

    const allCards = document.querySelectorAll('.tool-card, .label-card');
    const allRows  = document.querySelectorAll('tbody tr');

    if (!term) {
        allCards.forEach(c => c.classList.remove('hidden'));
        allRows.forEach(r  => r.classList.remove('hidden'));
        return;
    }

    allCards.forEach(c => {
        c.classList.toggle('hidden', !c.innerText.toLowerCase().includes(term));
    });

    allRows.forEach(r => {
        r.classList.toggle('hidden', !r.innerText.toLowerCase().includes(term));
    });
}

// ─── MONITOR DE INATIVIDADE (30 MINUTOS) ─────────────

let inactivityTimer;

/**
 * Reinicia o temporizador de inatividade. 
 * Se o usuário ficar 30 minutos sem interagir, a sessão é derrubada.
 */
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        console.warn('Sessão encerrada por inatividade (30 min).');
        // Tenta chamar a função logout() definida no js/auth.js
        if (typeof logout === 'function') {
            logout();
        } else {
            window.location.reload();
        }
    }, 30 * 60 * 1000); // 30 minutos em milissegundos
}

// Monitora eventos de interação para resetar o timer
['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer, true);
});

// Inicia a contagem assim que o script é carregado
resetInactivityTimer();
