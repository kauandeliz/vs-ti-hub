/**
 * ui-feedback.js
 *
 * Toasts globais + dialogo de confirmacao reutilizavel.
 */

(function bootstrapUiFeedback() {
    'use strict';

    const TOAST_DURATION_MS = 3200;
    const CONFIRM_MODAL_ID = 'app-confirm-modal';

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function ensureToastStack() {
        let stack = document.getElementById('app-toast-stack');
        if (stack) return stack;

        stack = document.createElement('div');
        stack.id = 'app-toast-stack';
        stack.className = 'app-toast-stack';
        document.body.appendChild(stack);
        return stack;
    }

    function removeToast(toast) {
        if (!toast) return;
        toast.classList.add('is-exit');
        window.setTimeout(() => toast.remove(), 220);
    }

    function showToast(message, type = 'success', options = {}) {
        const text = String(message || '').trim();
        if (!text) return;

        const stack = ensureToastStack();
        const toast = document.createElement('div');
        const normalizedType = type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success';
        const icon = normalizedType === 'error' ? '⚠' : normalizedType === 'warning' ? '!' : '✓';

        toast.className = `app-toast app-toast--${normalizedType}`;
        toast.innerHTML = `
            <span class="app-toast__icon">${icon}</span>
            <span class="app-toast__text">${escapeHtml(text)}</span>
        `;

        stack.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));

        const duration = Number.isFinite(Number(options.duration))
            ? Math.max(1000, Number(options.duration))
            : TOAST_DURATION_MS;

        window.setTimeout(() => removeToast(toast), duration);
        return toast;
    }

    function closeConfirmModal(result) {
        const modal = document.getElementById(CONFIRM_MODAL_ID);
        if (!modal) return;

        modal.remove();
        if (typeof modal._resolver === 'function') {
            modal._resolver(Boolean(result));
        }
    }

    function showConfirmDialog({
        title = 'Confirmar acao',
        message = 'Deseja continuar?',
        confirmText = 'Confirmar',
        cancelText = 'Cancelar',
        danger = false,
    } = {}) {
        const previous = document.getElementById(CONFIRM_MODAL_ID);
        if (previous) {
            if (typeof previous._resolver === 'function') {
                previous._resolver(false);
            }
            previous.remove();
        }

        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-backdrop app-confirm-backdrop';
            modal.id = CONFIRM_MODAL_ID;
            modal._resolver = resolve;

            modal.innerHTML = `
                <div class="modal app-confirm-modal" style="max-width:420px" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>${escapeHtml(title)}</h3>
                        <button class="modal-close" data-action="close" aria-label="Fechar">✕</button>
                    </div>
                    <div class="modal-body">
                        <p class="app-confirm-message">${escapeHtml(message)}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-row" data-action="cancel">${escapeHtml(cancelText)}</button>
                        <button class="btn-row ${danger ? 'danger' : 'primary'}" data-action="confirm">${escapeHtml(confirmText)}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const cleanup = () => {
                document.removeEventListener('keydown', onEscape);
            };
            const cancel = () => {
                cleanup();
                closeConfirmModal(false);
            };
            const confirm = () => {
                cleanup();
                closeConfirmModal(true);
            };

            modal.addEventListener('click', (event) => {
                if (event.target === modal) cancel();
            });

            modal.querySelectorAll('[data-action="close"], [data-action="cancel"]').forEach((button) => {
                button.addEventListener('click', cancel);
            });
            modal.querySelector('[data-action="confirm"]')?.addEventListener('click', confirm);

            const onEscape = (event) => {
                if (event.key === 'Escape') {
                    cancel();
                }
            };
            document.addEventListener('keydown', onEscape);
        });
    }

    window.showToast = showToast;
    window.showConfirmDialog = showConfirmDialog;
})();
