/* ═══════════════════════════════════════════════
   ElectIQ — UI Components Module
   Common interface elements like Toasts and Modals
   ═══════════════════════════════════════════════ */

import { getEl } from './utils.js';

/**
 * @description Renders a temporary notification toast
 * @param {string} message - Content to display
 * @param {string} [type='info'] - 'success' | 'error' | 'info'
 * @param {number} [duration=3000] - Lifespan in ms
 * @returns {void}
 */
export function showToast(message, type = 'info', duration = 3000) {
  let container = getEl('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__msg">${message}</span>
    <button class="toast__close" aria-label="Dismiss">&times;</button>
  `;

  container.appendChild(toast);

  const dismiss = () => {
    toast.classList.add('toast--exit');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.toast__close').onclick = dismiss;
  if (duration > 0) setTimeout(dismiss, duration);
}

/**
 * @description Singleton manager for accessible modal dialogs
 */
export const Modal = {
  activeModal: null,
  previousFocus: null,

  /**
   * @description Opens a new modal, closing any existing ones
   * @param {object} options - Config: { title, content, primaryText, onPrimary }
   * @returns {void}
   */
  show(options) {
    this.close();
    this.previousFocus = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__header">
          <h2>${options.title || 'Alert'}</h2>
          <button class="modal__close">&times;</button>
        </div>
        <div class="modal__body">${options.content || ''}</div>
        <div class="modal__footer">
          <button class="modal__btn--primary">${options.primaryText || 'OK'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.activeModal = overlay;

    overlay.querySelector('.modal__close').onclick = () => this.close();
    overlay.querySelector('.modal__btn--primary').onclick = () => {
      if (options.onPrimary) options.onPrimary();
      this.close();
    };

    this.trapFocus(overlay.querySelector('.modal'));
  },

  /**
   * @description Destroys the active modal and restores focus
   * @returns {void}
   */
  close() {
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
      if (this.previousFocus) this.previousFocus.focus();
    }
  },

  /**
   * @description Ensures tab navigation stays within the modal
   * @param {HTMLElement} el - Modal container
   * @returns {void}
   */
  trapFocus(el) {
    const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) focusable[0].focus();
  }
};
