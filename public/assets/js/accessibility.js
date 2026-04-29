/* ═══════════════════════════════════════════════
   ElectIQ — Accessibility Module
   WCAG compliance helpers and focus management
   ═══════════════════════════════════════════════ */

/**
 * @description Selectors for elements that can receive keyboard focus
 */
const FOCUSABLE_SELECTORS = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @description Creates a focus trap within a specific container for accessibility
 * @param {HTMLElement} container - The element to trap focus inside
 * @returns {object} { activate: Function, deactivate: Function }
 */
export function createFocusTrap(container) {
  let previousFocus = null;

  const handleKeyDown = (e) => {
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
  };

  return {
    activate() {
      previousFocus = document.activeElement;
      container.addEventListener('keydown', handleKeyDown);
      container.querySelector(FOCUSABLE_SELECTORS)?.focus();
    },
    deactivate() {
      container.removeEventListener('keydown', handleKeyDown);
      if (previousFocus) previousFocus.focus();
    }
  };
}

/**
 * @description Injects and uses an ARIA live region to announce status updates
 * @param {string} message - Text to announce
 * @param {'polite'|'assertive'} [priority='polite'] - Interruption priority
 * @returns {void}
 */
export function announceToScreenReader(message, priority = 'polite') {
  let region = document.getElementById('aria-live-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'aria-live-region';
    region.setAttribute('aria-live', priority);
    region.style.position = 'absolute';
    region.style.left = '-9999px';
    document.body.appendChild(region);
  }

  region.textContent = '';
  setTimeout(() => { region.textContent = message; }, 100);
}

/**
 * @description Initializes the skip-to-content accessibility link behavior
 * @returns {void}
 */
export function initSkipLink() {
  const link = document.getElementById('skip-to-content');
  if (link) {
    link.onclick = (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus();
      }
    };
  }
}

/**
 * @description Registers global hotkeys for enhanced power-user navigation
 * @returns {void}
 */
export function initKeyboardShortcuts() {
  document.onkeydown = (e) => {
    if (e.altKey && e.key === 'c') {
      e.preventDefault();
      document.getElementById('chat-input')?.focus();
    }
  };
}
