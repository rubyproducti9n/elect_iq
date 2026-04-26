/* ═══════════════════════════════════════════════
   ElectIQ — Accessibility Utilities
   Focus traps, ARIA live region, skip links
   ═══════════════════════════════════════════════ */

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Create a focus trap within an element.
 * @param {HTMLElement} container
 * @returns {{ activate: Function, deactivate: Function }}
 */
export function createFocusTrap(container) {
  let previousFocus = null;

  function handleKeyDown(e) {
    if (e.key !== 'Tab') return;

    const focusable = container.querySelectorAll(FOCUSABLE_SELECTORS);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return {
    activate() {
      previousFocus = document.activeElement;
      container.addEventListener('keydown', handleKeyDown);
      const firstFocusable = container.querySelector(FOCUSABLE_SELECTORS);
      firstFocusable?.focus();
    },
    deactivate() {
      container.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    },
  };
}

/**
 * Announce a message to screen readers via ARIA live region.
 * @param {string} message
 * @param {'polite'|'assertive'} priority
 */
export function announceToScreenReader(message, priority = 'polite') {
  let region = document.getElementById('aria-live-region');

  if (!region) {
    region = document.createElement('div');
    region.id = 'aria-live-region';
    region.setAttribute('aria-live', priority);
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', 'status');
    document.body.appendChild(region);
  }

  region.setAttribute('aria-live', priority);
  region.textContent = '';
  // Force re-announcement by deferring
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

/**
 * Initialize skip-to-content link behavior.
 */
export function initSkipLink() {
  const skipLink = document.getElementById('skip-to-content');
  if (!skipLink) return;

  skipLink.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(skipLink.getAttribute('href'));
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus();
      target.removeAttribute('tabindex');
    }
  });
}

/**
 * Set up keyboard shortcuts.
 */
export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Alt + C = focus chat input
    if (e.altKey && e.key === 'c') {
      e.preventDefault();
      document.getElementById('chat-input')?.focus();
    }

    // Escape = close modals / stop TTS
    if (e.key === 'Escape') {
      const openOverlay = document.querySelector('.sidebar-overlay--visible');
      if (openOverlay) openOverlay.click();
    }
  });
}
