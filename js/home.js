/**
 * home.js
 *
 * Comportamento da landing page do index (home).
 */

(function bootstrapHomeLanding() {
    'use strict';

    let clockInterval = null;

    function getGreetingLabel() {
        const hour = new Date().getHours();
        if (hour >= 18) return 'Boa noite';
        if (hour >= 12) return 'Boa tarde';
        return 'Bom dia';
    }

    function getFirstNameFromUser(user) {
        if (!user) return 'usuário';

        const rawName = String(user.user_metadata?.name || '').trim();
        if (rawName) {
            const first = rawName.split(/\s+/).find(Boolean);
            if (first) return first;
        }

        const emailName = String(user.email || '').split('@')[0].trim();
        if (emailName) {
            const first = emailName.split(/[._\-\s]+/).find(Boolean);
            if (first) return first;
        }

        return 'usuário';
    }

    function updateLandingGreeting() {
        const el = document.getElementById('landingGreeting');
        if (!el) return;

        const user = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
        const firstName = getFirstNameFromUser(user);
        el.textContent = `${getGreetingLabel()}, ${firstName}`;
    }

    function updateLandingCurrentTime() {
        const el = document.getElementById('landingCurrentTime');
        if (!el) return;

        const now = new Date();
        const formatted = now.toLocaleString('pt-BR', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

        el.textContent = formatted;
    }

    function updateLandingCurrentUser() {
        const el = document.getElementById('landingCurrentUser');
        if (!el) return;

        const user = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
        if (!user) {
            el.textContent = 'Conectado no hub';
            return;
        }

        const name = user.user_metadata?.name || user.email || 'Usuário';
        const setor = user.user_metadata?.setor ? ` • ${user.user_metadata.setor}` : '';
        el.textContent = `${name}${setor}`;
    }

    function updateHomeAdminVisibility() {
        const isAdminUser = typeof window.isAdmin === 'function' ? window.isAdmin() : false;
        document.querySelectorAll('[data-home-admin]').forEach((node) => {
            node.style.display = isAdminUser ? '' : 'none';
        });
    }

    function initHomeOnActivate() {
        updateLandingGreeting();
        updateLandingCurrentTime();
        updateLandingCurrentUser();
        updateHomeAdminVisibility();
    }

    function initHomeLanding() {
        initHomeOnActivate();

        if (clockInterval) {
            clearInterval(clockInterval);
        }

        clockInterval = setInterval(() => {
            updateLandingCurrentTime();
        }, 60_000);

        document.addEventListener('app:auth-changed', () => {
            initHomeOnActivate();
        });
    }

    window.initHomeOnActivate = initHomeOnActivate;
    document.addEventListener('DOMContentLoaded', initHomeLanding);
})();
