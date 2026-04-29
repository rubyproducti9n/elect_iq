/* ═══════════════════════════════════════════════
   ElectIQ — Main Entry Point
   Orchestrates module initialization and routing
   ═══════════════════════════════════════════════ */

import { Router } from './router.js';
import { initChat } from './chat.js';
import { initFirebase } from './firebase.js';
import { trackEvent } from './analytics.js';
import { initSkipLink, initKeyboardShortcuts } from './accessibility.js';
import { loadKnowledgeBase, setConfigGetter } from './gemini.js';
import { showToast } from './ui.js';
import { initRemoteConfig, getConfig, checkMaintenanceMode } from './remoteConfig.js';

import { setTTSVoice } from './tts.js';
import { ANALYTICS_EVENTS, ROUTES, EXTERNAL_DOMAINS_ALLOWLIST } from './constants.js';

/**
 * @description Main application bootstrap
 * @returns {Promise<void>}
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Accessibility First
  initSkipLink();
  initKeyboardShortcuts();

  // 2. Dev-mode Accessibility Audits
  if (window.location.search.includes('debug=true')) {
    runAccessibilityAudit();
  }

  // 3. Infrastructure Initialization (Parallel)
  await Promise.all([
    initFirebase().catch(() => showOfflineBanner()),
    initRemoteConfig().catch(() => getConfig())
  ]);

  // 4. Configuration Guard
  setConfigGetter(getConfig);
  if (checkMaintenanceMode()) return;

  const cfg = getConfig();
  setTTSVoice(cfg.ttsVoice || 'en-IN-Standard-A');

  // 5. Pre-load Election Knowledge
  await loadKnowledgeBase();

  // 6. Track Initial Interaction
  trackEvent(ANALYTICS_EVENTS.FUNNEL_APP_OPENED);

  // 7. UI / Layout Setup
  initTheme();
  registerServiceWorker();
  initLayout();


  // 8. Security: External Link Validation
  bindSecurityListeners();

  // 9. Routing Engine
  const router = new Router('#app-view');

  router
    .on('/', renderHomePage)
    .on(ROUTES.CHAT, renderChatPage)
    .on(ROUTES.TIMELINE, renderTimelinePage)
    .on(ROUTES.JOURNEY, renderJourneyPage)
    .on(ROUTES.GLOSSARY, renderGlossaryPage)
    .on('/about', renderAboutPage)
    .on('*', render404Page)
    .use((toPath) => {
      trackEvent('page_view', { page: toPath });
      // setCurrentScreen(toPath); // Deprecated in favor of generic trackEvent for simplicity in refactor
      updateActiveLinks(toPath);
      closeSidebar();
      return true;
    })
    .start();
  
  console.info('[ElectIQ] Application initialized and Router started.');
});

/**
 * @description Audits the DOM for WCAG violations in development mode
 * @returns {void}
 */
function runAccessibilityAudit() {
  setTimeout(() => {
    if (typeof axe !== 'undefined') {
      axe.run().then(results => {
        if (results.violations.length) {
          console.warn('[Axe] Violations:', results.violations);
        }
      });
    }
  }, 1500);
}

/**
 * @description Blocks navigation to domains not in the secure allowlist
 * @returns {void}
 */
function bindSecurityListeners() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.target === '_blank') {
      try {
        const url = new URL(link.href);
        const isAllowed = EXTERNAL_DOMAINS_ALLOWLIST.some(domain => 
          url.hostname === domain || url.hostname.endsWith('.' + domain)
        );
        if (!isAllowed) {
          e.preventDefault();
          showToast('Domain blocked for security.', 'error');
        }
      } catch {
        e.preventDefault();
      }
    }
  });
}

/* ─────────────────────────────────────────────
   PAGE RENDERERS
   ───────────────────────────────────────────── */

async function renderHomePage(outlet) {
  outlet.innerHTML = `
    <section class="hero">
      <div class="hero__content">
        <h1 class="hero__title">Understand Your <span class="hero__title-highlight">Election Process</span></h1>
        <p class="hero__subtitle">ElectIQ is your AI-powered companion for democratic literacy.</p>
        <div class="hero__actions">
          <button class="btn btn--primary" data-route="${ROUTES.CHAT}"><span class="material-symbols-outlined">forum</span> Start Chatting</button>
          <button class="btn btn--secondary" data-route="${ROUTES.TIMELINE}"><span class="material-symbols-outlined">view_timeline</span> Timeline</button>
        </div>
      </div>
    </section>
    <section class="features">
      <div class="features__grid">
        <div class="card feature-card"><h3>AI-Powered Chat</h3><p>Instant answers to election queries.</p></div>
        <div class="card feature-card"><h3>Timeline</h3><p>Visual guide to voting phases.</p></div>
        <div class="card feature-card"><h3>Voice Enabled</h3><p>Accessible TTS and Mic input.</p></div>
      </div>
    </section>
  `;
}

async function renderChatPage(outlet) {
  outlet.innerHTML = `
    <div class="chat-container">
      <div class="chat-header">
        <span class="chat-header__title">ElectIQ Assistant</span>
        <div class="chat-header__actions">
          <button class="chat-header__btn" id="chat-tts"><span class="material-symbols-outlined">volume_up</span></button>
          <button class="chat-header__btn" id="chat-clear"><span class="material-symbols-outlined">delete_sweep</span></button>
        </div>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="chat-welcome" id="chat-welcome">
          <div class="chat-welcome__illustration">
            <span class="material-symbols-outlined" style="font-size: 64px; color: var(--color-primary);">how_to_vote</span>
          </div>
          <h2 class="chat-welcome__title">How can I help you today?</h2>
          <p class="chat-welcome__subtitle">Expert guidance on India's election process.</p>
          <div class="chat-suggestions" id="chat-suggestions"></div>
        </div>
      </div>
      <div class="suggestions-row" id="suggestions-row"></div>
      <div class="typing-indicator" id="typing-indicator" style="display:none;"><span>ElectIQ is typing...</span></div>
      <div class="chat-input-area">
        <div class="chat-input-wrapper">
          <textarea class="chat-input" id="chat-input" placeholder="Ask about elections..." rows="1"></textarea>
          <button class="chat-input__mic-btn" id="mic-btn"><span class="material-symbols-outlined">mic</span></button>
          <button class="chat-input__send-btn" id="send-btn"><span class="material-symbols-outlined">send</span></button>
        </div>
      </div>
    </div>
  `;
  initChat();
}

async function renderTimelinePage(outlet) {
  outlet.innerHTML = `<div class="main__content" id="timeline-container"></div>`;
  const { initTimeline } = await import('./timeline.js');
  await initTimeline('timeline-container');
}

async function renderJourneyPage(outlet) {
  outlet.innerHTML = `<div class="main__content" id="journey-container"></div>`;
  const { initJourney } = await import('./journey.js');
  await initJourney('journey-container');
}

async function renderGlossaryPage(outlet) {
  outlet.innerHTML = `<div class="main__content" id="glossary-container"></div>`;
  const { initGlossary } = await import('./glossary.js');
  await initGlossary('glossary-container');
}


async function renderAboutPage(outlet) {
  outlet.innerHTML = `<h1>About</h1><p>ElectIQ — AI-powered Election Literacy Assistant.</p>`;
}

function render404Page(outlet) {
  outlet.innerHTML = `<h1>404</h1><p>Page Not Found</p>`;
}

/* ─────────────────────────────────────────────
   LAYOUT HELPERS
   ───────────────────────────────────────────── */

function initLayout() {
  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('sidebar--open');
  });
}



function closeSidebar() {
  document.querySelector('.sidebar')?.classList.remove('sidebar--open');
}

function updateActiveLinks(path) {
  document.querySelectorAll('.sidebar__link').forEach(link => {
    link.classList.toggle('sidebar__link--active', link.getAttribute('data-route') === path);
  });
}

function initTheme() {
  const theme = localStorage.getItem('electiq-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
}

function showOfflineBanner() {
  const b = document.createElement('div');
  b.className = 'offline-banner';
  b.textContent = 'Limited Mode: Some features may be unavailable.';
  document.body.prepend(b);
}
