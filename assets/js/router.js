/* ═══════════════════════════════════════════════
   ElectIQ — Hash-Based SPA Router
   ═══════════════════════════════════════════════ */

/**
 * Simple hash-based router for single-page navigation.
 *
 * Usage:
 *   const router = new Router('#app-view');
 *   router.on('/',         renderHome);
 *   router.on('/chat',     renderChat);
 *   router.on('/timeline', renderTimeline);
 *   router.start();
 */
export class Router {
  constructor(outletSelector) {
    this.outlet = document.querySelector(outletSelector);
    this.routes = new Map();
    this.currentRoute = null;
    this.middleware = [];
  }

  /**
   * Register a route.
   * @param {string} path - Hash path (e.g. '/chat')
   * @param {Function} handler - Receives (outlet, params)
   */
  on(path, handler) {
    this.routes.set(path, handler);
    return this; // Chainable
  }

  /**
   * Add middleware that runs before each route change.
   * @param {Function} fn - Receives (toPath, fromPath)
   */
  use(fn) {
    this.middleware.push(fn);
    return this;
  }

  /**
   * Navigate to a path programmatically.
   */
  navigate(path) {
    window.location.hash = `#${path}`;
  }

  /**
   * Get the current hash path.
   */
  getPath() {
    const hash = window.location.hash.slice(1) || '/';
    return hash.startsWith('/') ? hash : `/${hash}`;
  }

  /**
   * Start listening for hash changes.
   */
  start() {
    const handleRoute = async () => {
      const path = this.getPath();
      const fromPath = this.currentRoute;

      // Run middleware
      for (const mw of this.middleware) {
        const result = await mw(path, fromPath);
        if (result === false) return; // Middleware blocked navigation
      }

      const handler = this.routes.get(path) || this.routes.get('*');

      if (handler && this.outlet) {
        // Page exit animation
        this.outlet.classList.add('page-exit-active');
        await new Promise((r) => setTimeout(r, 150));

        this.outlet.innerHTML = '';
        this.outlet.classList.remove('page-exit-active');
        this.outlet.classList.add('page-enter');

        await handler(this.outlet, { path, from: fromPath });

        // Page enter animation
        requestAnimationFrame(() => {
          this.outlet.classList.remove('page-enter');
          this.outlet.classList.add('page-enter-active');
          setTimeout(() => this.outlet.classList.remove('page-enter-active'), 400);
        });

        this.currentRoute = path;

        // Update active nav links
        document.querySelectorAll('[data-route]').forEach((link) => {
          link.classList.toggle(
            'header__nav-link--active',
            link.dataset.route === path
          );
          link.classList.toggle(
            'sidebar__link--active',
            link.dataset.route === path
          );
        });
      }
    };

    window.addEventListener('hashchange', handleRoute);
    handleRoute(); // Handle initial route

    // Intercept nav link clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-route]');
      if (link) {
        e.preventDefault();
        this.navigate(link.dataset.route);
      }
    });

    return this;
  }
}

export default Router;
