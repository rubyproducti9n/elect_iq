/* ═══════════════════════════════════════════════
   ElectIQ — Shared UI Components
   ─────────────────────────────────────────────
   • Accessible Modal (Focus trap, ESC close)
   • Toast Notification System (Success/Error)
   ═══════════════════════════════════════════════ */

/**
 * Show a Toast notification.
 * @param {string} message - The text to display.
 * @param {string} type - 'success' | 'error' | 'info'
 * @param {number} duration - Auto-dismiss after ms.
 */
export function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  if (type !== 'error') {
    toast.setAttribute('aria-live', 'polite');
  }

  const icons = {
    success: 'check_circle',
    error: 'error',
    info: 'info'
  };

  toast.innerHTML = `
    <span class="material-symbols-outlined toast__icon" aria-hidden="true">${icons[type] || 'info'}</span>
    <span class="toast__msg">${message}</span>
    <button class="toast__close" aria-label="Close notification">
      <span class="material-symbols-outlined" aria-hidden="true" style="font-size: 16px;">close</span>
    </button>
  `;

  container.appendChild(toast);

  // Force reflow for enter animation
  requestAnimationFrame(() => {
    toast.classList.add('toast--enter');
  });

  const dismiss = () => {
    toast.classList.remove('toast--enter');
    toast.classList.add('toast--exit');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.toast__close').addEventListener('click', dismiss);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

/**
 * Modal Manager
 */
export const Modal = {
  activeModal: null,
  previousFocus: null,

  /**
   * Create and show a modal.
   * @param {Object} options 
   * @param {string} options.title
   * @param {string} options.content (HTML)
   * @param {string} options.primaryText
   * @param {Function} options.onPrimary
   * @param {boolean} options.showCancel
   */
  show(options) {
    this.close(); // Close any existing
    this.previousFocus = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'modal-title');

    modal.innerHTML = `
      <div class="modal__header">
        <h2 class="modal__title" id="modal-title">${options.title || 'Alert'}</h2>
        <button class="modal__close" aria-label="Close dialog">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="modal__body">
        ${options.content || ''}
      </div>
      <div class="modal__footer">
        ${options.showCancel ? `<button class="modal__btn modal__btn--cancel">Cancel</button>` : ''}
        ${options.primaryText ? `<button class="modal__btn modal__btn--primary">${options.primaryText}</button>` : ''}
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.activeModal = overlay;

    // Animation
    requestAnimationFrame(() => {
      overlay.classList.add('modal-overlay--enter');
      modal.classList.add('modal--enter');
    });

    // Event Bindings
    const closeBtn = modal.querySelector('.modal__close');
    const cancelBtn = modal.querySelector('.modal__btn--cancel');
    const primaryBtn = modal.querySelector('.modal__btn--primary');

    const handleClose = () => this.close();

    closeBtn?.addEventListener('click', handleClose);
    cancelBtn?.addEventListener('click', handleClose);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) handleClose();
    });

    if (primaryBtn && options.onPrimary) {
      primaryBtn.addEventListener('click', () => {
        options.onPrimary();
        handleClose();
      });
    }

    // Trap Focus
    this.trapFocus(modal);

    // ESC to close
    this.escHandler = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', this.escHandler);
  },

  close() {
    if (!this.activeModal) return;

    const overlay = this.activeModal;
    const modal = overlay.querySelector('.modal');

    overlay.classList.remove('modal-overlay--enter');
    modal.classList.remove('modal--enter');

    overlay.addEventListener('transitionend', () => {
      overlay.remove();
    }, { once: true });

    document.removeEventListener('keydown', this.escHandler);

    if (this.previousFocus) {
      this.previousFocus.focus();
    }
    this.activeModal = null;
  },

  trapFocus(element) {
    const focusableEls = element.querySelectorAll('a[href]:not([disabled]), button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), input[type="radio"]:not([disabled]), input[type="checkbox"]:not([disabled]), select:not([disabled])');
    const firstFocusableEl = focusableEls[0];  
    const lastFocusableEl = focusableEls[focusableEls.length - 1];

    element.addEventListener('keydown', function(e) {
      const isTabPressed = (e.key === 'Tab');
      if (!isTabPressed) return;

      if (e.shiftKey) { /* shift + tab */
        if (document.activeElement === firstFocusableEl) {
          lastFocusableEl.focus();
          e.preventDefault();
        }
      } else { /* tab */
        if (document.activeElement === lastFocusableEl) {
          firstFocusableEl.focus();
          e.preventDefault();
        }
      }
    });

    if (firstFocusableEl) {
      firstFocusableEl.focus();
    } else {
      element.setAttribute('tabindex', '-1');
      element.focus();
    }
  }
};
