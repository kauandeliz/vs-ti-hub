/**
 * theme.js
 *
 * Alternancia de tema dark/light com persistencia local.
 */

(function bootstrapThemeMode() {
    'use strict';

    const THEME_STORAGE_KEY = 'vs-ti-hub-theme';
    const THEME_DARK = 'dark';
    const THEME_LIGHT = 'light';
    const THEME_VALUES = new Set([THEME_DARK, THEME_LIGHT]);

    let currentTheme = THEME_DARK;

    function normalizeTheme(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return THEME_VALUES.has(normalized) ? normalized : '';
    }

    function readStoredTheme() {
        try {
            return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
        } catch (error) {
            return '';
        }
    }

    function writeStoredTheme(theme) {
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch (error) {
            // no-op
        }
    }

    function getInitialTheme() {
        const fromMarkup = normalizeTheme(document.documentElement.getAttribute('data-theme'));
        if (fromMarkup) return fromMarkup;

        const fromStorage = readStoredTheme();
        if (fromStorage) return fromStorage;

        return THEME_DARK;
    }

    function getButtonElements() {
        return {
            button: document.getElementById('theme-toggle-btn'),
            icon: document.getElementById('theme-toggle-icon'),
            label: document.getElementById('theme-toggle-label'),
        };
    }

    function syncToggleButton() {
        const { button, icon, label } = getButtonElements();
        if (!button || !icon || !label) return;

        const switchToLight = currentTheme !== THEME_LIGHT;
        const targetThemeLabel = switchToLight ? 'modo claro' : 'modo escuro';

        icon.className = switchToLight
            ? 'fas fa-sun topbar-theme-icon'
            : 'fas fa-moon topbar-theme-icon';

        label.textContent = switchToLight ? 'Modo claro' : 'Modo escuro';
        button.setAttribute('title', `Ativar ${targetThemeLabel}`);
        button.setAttribute('aria-label', `Ativar ${targetThemeLabel}`);
    }

    function applyTheme(theme, { persist = true } = {}) {
        const normalized = normalizeTheme(theme) || THEME_DARK;
        currentTheme = normalized;
        document.documentElement.setAttribute('data-theme', normalized);
        syncToggleButton();
        if (persist) {
            writeStoredTheme(normalized);
        }

        document.dispatchEvent(new CustomEvent('app:theme-changed', {
            detail: {
                theme: normalized,
            },
        }));
    }

    function toggleTheme() {
        applyTheme(currentTheme === THEME_LIGHT ? THEME_DARK : THEME_LIGHT);
    }

    function initTheme() {
        applyTheme(getInitialTheme(), { persist: false });

        const { button } = getButtonElements();
        if (button) {
            button.addEventListener('click', toggleTheme);
        }
    }

    window.getAppTheme = function getAppTheme() {
        return currentTheme;
    };

    window.setAppTheme = function setAppTheme(theme) {
        applyTheme(theme);
    };

    window.toggleAppTheme = toggleTheme;

    document.addEventListener('DOMContentLoaded', initTheme);
})();
