/**
 * nav.js
 *
 * Navegação principal da SPA (sem build).
 */

(function bootstrapNavigation() {
    'use strict';

    const PAGE_LABELS = {
        home: 'Home',
        gerador: 'Gerador de Acessos VS',
        helpdesk: 'Helpdesk',
        corporativo: 'Corporativo',
        telecom: 'Telecom',
        unidades: 'Unidades',
        etiquetas: 'Etiquetas',
        colaboradores: 'Colaboradores',
        usuarios: 'Usuários',
        cadastros: 'Cadastros',
    };

    let currentPage = 'home';

    function initNavigation() {
        document.getElementById('sidebar')?.addEventListener('click', handleNavClick);
        document.getElementById('pages-container')?.addEventListener('click', handleNavClick);
        document.querySelector('.mobile-toggle')?.addEventListener('click', toggleSidebar);
        document.getElementById('searchInput')?.addEventListener('input', (event) => {
            globalSearch(event.target.value || '');
        });

        document.addEventListener('app:auth-changed', (event) => {
            if (!event.detail?.isAdmin && (currentPage === 'usuarios' || currentPage === 'cadastros' || currentPage === 'colaboradores')) {
                const homeBtn = document.querySelector('.nav-item[data-nav="home"]');
                navTo('home', homeBtn || null);
            }
        });
    }

    function handleNavClick(event) {
        const target = event.target.closest('[data-nav]');
        if (!target) return;

        const page = target.dataset.nav;
        if (!page) return;

        event.preventDefault();
        navTo(page, resolveNavButton(target, page));
    }

    function resolveNavButton(clickedElement, page) {
        if (clickedElement.classList.contains('nav-item')) {
            return clickedElement;
        }

        return document.querySelector(`.nav-item[data-nav="${page}"]`) || null;
    }

    function navTo(page, element) {
        const pageElement = document.getElementById(`page-${page}`);
        if (!pageElement) return;

        document.querySelectorAll('.page').forEach((node) => node.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach((node) => node.classList.remove('active'));

        pageElement.classList.add('active');
        if (element) {
            element.classList.add('active');
        }

        currentPage = page;
        updatePageBadge(page);
        runPageHook(page);

        if (window.innerWidth < 900) {
            document.getElementById('sidebar')?.classList.remove('open');
        }
    }

    function updatePageBadge(page) {
        const badge = document.getElementById('currentPageBadge');
        if (badge) {
            badge.textContent = PAGE_LABELS[page] || page;
        }
    }

    function runPageHook(page) {
        if (typeof window.onDirecionadoresPageActivate === 'function') {
            window.onDirecionadoresPageActivate(page);
        }

        if (page === 'home' && typeof window.initHomeOnActivate === 'function') {
            window.initHomeOnActivate();
        }

        if (page === 'colaboradores' && typeof window.onColaboradoresActivate === 'function') {
            window.onColaboradoresActivate();
        }

        if (page === 'usuarios' && typeof window.onUsuariosActivate === 'function') {
            window.onUsuariosActivate();
        }

        if (page === 'cadastros' && typeof window.onCadastrosActivate === 'function') {
            window.onCadastrosActivate();
        }

        if (page === 'unidades' && typeof window.onUnidadesActivate === 'function') {
            window.onUnidadesActivate();
        }

        if (page === 'etiquetas' && typeof window.onEtiquetasActivate === 'function') {
            window.onEtiquetasActivate();
        }
    }

    function toggleSidebar() {
        document.getElementById('sidebar')?.classList.toggle('open');
    }

    function globalSearch(query) {
        const term = String(query || '').trim().toLowerCase();

        const activePage = document.querySelector('.page.active');
        if (!activePage) return;

        const cards = activePage.querySelectorAll('.tool-card, .external-card, .shortcut-card, .label-card');
        const rows = activePage.querySelectorAll('tbody tr');

        if (!term) {
            cards.forEach((card) => card.classList.remove('hidden'));
            rows.forEach((row) => row.classList.remove('hidden'));
            return;
        }

        cards.forEach((card) => {
            const text = card.textContent?.toLowerCase() || '';
            card.classList.toggle('hidden', !text.includes(term));
        });

        rows.forEach((row) => {
            const text = row.textContent?.toLowerCase() || '';
            row.classList.toggle('hidden', !text.includes(term));
        });
    }

    window.navTo = navTo;
    window.toggleSidebar = toggleSidebar;
    window.globalSearch = globalSearch;

    document.addEventListener('DOMContentLoaded', initNavigation);
})();
