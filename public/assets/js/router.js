/* ═══════════════════════════════════════════════
   ElectIQ — Hash Router Module
   Handles client-side navigation and view transitions
   ═══════════════════════════════════════════════ */

import { getEl } from './utils.js';

/**
 * @description Hash-based Single Page Application (SPA) Router
 */
export class Router {
  /**
   * @description Creates a new router instance
   * @param {string} outletSelector - CSS selector for the main view container
   */
  constructor(outletSelector) {
    this.outlet = getEl(outletSelector.replace('#','')); // Compatibility with getEl
    this.routes = new Map();
    this.middleware = [];
    this.currentPath = null;
  }

  /**
   * @description Maps a path to a render function
   * @param {string} path - The hash path
   * @param {Function} handler - The function that renders the view
   * @returns {Router}
   */
  on(path, handler) {
    this.routes.set(path, handler);
    return this;
  }

  /**
   * @description Adds a hook that executes before every route change
   * @param {Function} fn - Hook function
   * @returns {Router}
   */
  use(fn) {
    this.middleware.push(fn);
    return this;
  }

  /**
   * @description Navigates to a specific hash path
   * @param {string} path - Destination
   * @returns {void}
   */
  navigate(path) {
    window.location.hash = `#${path}`;
  }

  /**
   * @description Starts the routing engine and binds listeners
   * @returns {Router}
   */
  start() {
    const handle = async () => {
      const path = window.location.hash.slice(1) || '/';
      const from = this.currentPath;

      // Run guard middleware
      for (const mw of this.middleware) {
        try {
          if (await mw(path, from) === false) return;
        } catch (e) {
          console.error('[Router] Middleware failed:', e);
        }
      }

      const handler = this.routes.get(path) || this.routes.get('*');
      if (handler && this.outlet) {
        // Exit animation
        this.outlet.style.opacity = '0';
        this.outlet.style.transform = 'translateY(10px)';
        
        await new Promise(r => setTimeout(r, 150));
        
        this.outlet.innerHTML = '';
        this.currentPath = path;
        
        await handler(this.outlet);
        
        // Enter animation
        requestAnimationFrame(() => {
          this.outlet.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          this.outlet.style.opacity = '1';
          this.outlet.style.transform = 'translateY(0)';
        });
      }
    };

    window.addEventListener('hashchange', handle);
    handle(); // Initial load

    // Global link interceptor for data-route elements
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-route]');
      if (el) {
        // If it's a link, let the browser update the hash natively.
        // If it's a button, we update the hash programmatically.
        if (el.tagName !== 'A') {
          e.preventDefault();
          this.navigate(el.dataset.route);
        }
      }
    });

    return this;
  }
}
