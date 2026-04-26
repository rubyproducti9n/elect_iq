/* ═══════════════════════════════════════════════
   ElectIQ — App Entry Point
   ═══════════════════════════════════════════════ */

import { Router } from './router.js';
import { initChat } from './chat.js';
import { initFirebase, logAnalyticsEvent } from './firebase.js';
import { initSkipLink, initKeyboardShortcuts } from './accessibility.js';
import { loadKnowledgeBase } from './gemini.js';
import { showToast } from './ui.js';

/* ── App Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  // Accessibility
  initSkipLink();
  initKeyboardShortcuts();

  // Run Axe-core in dev mode
  if (window.location.search.includes('debug=true')) {
    setTimeout(() => {
      if (typeof axe !== 'undefined') {
        axe.run().then(results => {
          if (results.violations.length) {
            console.warn('[Axe-Core] Accessibility violations found:', results.violations);
          } else {
            console.info('[Axe-Core] No accessibility violations found.');
          }
        });
      }
    }, 1000); // wait for initial render
  }

  // Firebase (non-blocking)
  initFirebase().catch((err) => {
    console.warn('[ElectIQ] Firebase init failed:', err.message);
    showOfflineBanner();
  });

  // Load election data for AI
  await loadKnowledgeBase();

  // UI Setup
  initTheme();

  // PWA registration
  registerServiceWorker();

  // Router
  const router = new Router('#app-view');

  router
    .on('/', renderHomePage)
    .on('/chat', renderChatPage)
    .on('/timeline', renderTimelinePage)
    .on('/voter-journey', renderJourneyPage)
    .on('/glossary', renderGlossaryPage)
    .on('/about', renderAboutPage)
    .on('*', render404Page)
    .use((toPath) => {
      logAnalyticsEvent('page_view', { page: toPath });
      updateActiveLinks(toPath);
      closeSidebar(); // Auto-close sidebar on mobile after navigation
      return true;
    })
    .start();

  initLayout();

  // External link validation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.target === '_blank') {
      try {
        const url = new URL(link.href);
        const allowlist = ['voters.eci.gov.in', 'eci.gov.in', 'nvsp.in'];
        if (!allowlist.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) {
          e.preventDefault();
          alert('Navigating to unverified external sites is disabled for security.');
        }
      } catch {
        e.preventDefault();
      }
    }
  });
});

/* ── Page Renderers ── */

async function renderHomePage(outlet) {
  outlet.innerHTML = `
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero__content">
        <h1 class="hero__title" id="hero-title">
          <span class="hero__title-line">Understand Your</span>
          <span class="hero__title-highlight">Election Process</span>
        </h1>
        <p class="hero__subtitle">
          ElectIQ is your <strong>interactive</strong> AI-powered guide. 
          Understand every <strong>step</strong> of the election process, 
          explore timelines, and ensure your voter registration is ready.
        </p>
        <div class="hero__actions">
          <button class="btn btn--primary" data-route="/chat">
            <span class="material-symbols-outlined" aria-hidden="true">forum</span> Start Chatting
          </button>
          <button class="btn btn--secondary" data-route="/timeline">
            <span class="material-symbols-outlined" aria-hidden="true">view_timeline</span> View Timeline
          </button>
        </div>
      </div>
    </section>

    <section class="features" aria-labelledby="features-title">
      <h2 id="features-title" class="sr-only" style="position:absolute;left:-9999px;">Features</h2>
      <div class="features__grid">
        <div class="card feature-card">
          <div class="feature-card__icon"><span class="material-symbols-outlined" aria-hidden="true" style="font-size: inherit;">smart_toy</span></div>
          <h3 class="feature-card__title">AI-Powered Chat</h3>
          <p class="feature-card__desc">Ask anything about elections and get instant, accurate, non-partisan answers.</p>
        </div>
        <div class="card feature-card">
          <div class="feature-card__icon"><span class="material-symbols-outlined" aria-hidden="true" style="font-size: inherit;">event_note</span></div>
          <h3 class="feature-card__title">Election Timeline</h3>
          <p class="feature-card__desc">Visual step-by-step guide through the entire election process.</p>
        </div>
        <div class="card feature-card">
          <div class="feature-card__icon"><span class="material-symbols-outlined" aria-hidden="true" style="font-size: inherit;">volume_up</span></div>
          <h3 class="feature-card__title">Text-to-Speech</h3>
          <p class="feature-card__desc">Listen to answers read aloud for an accessible experience.</p>
        </div>
        <div class="card feature-card">
          <div class="feature-card__icon"><span class="material-symbols-outlined" aria-hidden="true" style="font-size: inherit;">offline_bolt</span></div>
          <h3 class="feature-card__title">Works Offline</h3>
          <p class="feature-card__desc">Install as a PWA and access key resources without internet.</p>
        </div>
      </div>
    </section>
  `;
}

async function renderChatPage(outlet) {
  outlet.innerHTML = `
    <div class="chat-container" role="region" aria-label="Chat with ElectIQ">

      <!-- Chat Header -->
      <div class="chat-header">
        <div class="chat-header__brand">
          <span class="material-symbols-outlined chat-header__icon" aria-hidden="true">smart_toy</span>
          <span class="chat-header__title">ElectIQ</span>
          <span class="chat-header__status" id="chat-status">Online</span>
        </div>
        <div class="chat-header__actions">
          <button class="chat-header__btn" id="chat-tts" aria-label="Toggle text-to-speech" title="Toggle TTS">
            <span class="material-symbols-outlined" aria-hidden="true">volume_up</span>
          </button>
          <button class="chat-header__btn" id="chat-clear" aria-label="Clear chat" title="Clear chat">
            <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
          </button>
        </div>
      </div>

      <!-- Messages Area -->
      <div class="chat-messages" id="chat-messages" role="log" aria-live="polite" aria-atomic="false" aria-label="Chat messages">

        <!-- Welcome / Empty State -->
        <div class="chat-welcome" id="chat-welcome">
          <div class="chat-welcome__illustration">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="120" height="120" aria-hidden="true">
              <defs>
                <linearGradient id="boxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#1a6fef;stop-opacity:0.9"/>
                  <stop offset="100%" style="stop-color:#6c3cef;stop-opacity:0.9"/>
                </linearGradient>
                <linearGradient id="slotGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#0d47a1;stop-opacity:1"/>
                  <stop offset="100%" style="stop-color:#1565c0;stop-opacity:1"/>
                </linearGradient>
              </defs>
              <!-- Ballot box body -->
              <rect x="40" y="70" width="120" height="100" rx="12" fill="url(#boxGrad)" opacity="0.85"/>
              <!-- Slot -->
              <rect x="70" y="65" width="60" height="8" rx="4" fill="url(#slotGrad)"/>
              <!-- Ballot paper -->
              <g class="chat-welcome__ballot">
                <rect x="80" y="30" width="40" height="50" rx="4" fill="#fff" opacity="0.95"/>
                <line x1="88" y1="45" x2="112" y2="45" stroke="#1a6fef" stroke-width="2" stroke-linecap="round"/>
                <line x1="88" y1="52" x2="105" y2="52" stroke="#6c3cef" stroke-width="2" stroke-linecap="round"/>
                <line x1="88" y1="59" x2="108" y2="59" stroke="#1a6fef" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
                <path d="M90 65 l3 3 l6-6" stroke="#22c55e" stroke-width="2" fill="none" stroke-linecap="round"/>
              </g>
              <!-- Shadow -->
              <ellipse cx="100" cy="180" rx="50" ry="6" fill="#000" opacity="0.08"/>
            </svg>
          </div>
          <h2 class="chat-welcome__title">Ask me anything about elections!</h2>
          <p class="chat-welcome__subtitle">
            I'm your AI-powered guide to India's democratic process — voter registration, ECI rules, EVMs, and more.
          </p>
          <div class="chat-suggestions" id="chat-suggestions"></div>
        </div>
      </div>

      <!-- Suggestions Row (dynamic, shown after AI responses) -->
      <div class="suggestions-row" id="suggestions-row"></div>

      <!-- Typing Indicator -->
      <div class="typing-indicator" id="typing-indicator" aria-live="assertive" aria-label="ElectIQ is typing" style="display:none;">
        <span class="material-symbols-outlined typing-indicator__avatar" aria-hidden="true">smart_toy</span>
        <div class="typing-indicator__dots">
          <span class="typing-indicator__dot"></span>
          <span class="typing-indicator__dot"></span>
          <span class="typing-indicator__dot"></span>
        </div>
      </div>

      <!-- Input Area -->
      <div class="chat-input-area">
        <div class="chat-input-wrapper">
          <textarea class="chat-input" id="chat-input"
            placeholder="Ask about elections…"
            rows="1"
            aria-label="Type your election question"></textarea>
          <button class="chat-input__mic-btn" id="mic-btn" aria-label="Voice input" title="Voice input">
            <span class="material-symbols-outlined" aria-hidden="true">mic</span>
          </button>
          <button class="chat-input__send-btn" id="send-btn" aria-label="Send message" title="Send">
            <span class="material-symbols-outlined" aria-hidden="true">send</span>
          </button>
        </div>
        <p class="chat-disclaimer">ElectIQ provides general information only. Always verify with <a href="https://eci.gov.in" target="_blank" rel="noopener">eci.gov.in</a>.</p>
      </div>
    </div>
  `;

  initChat();
}

async function renderTimelinePage(outlet) {
  outlet.innerHTML = `
    <div class="main__content" id="timeline-container">
      <div class="skeleton" style="height: 400px;"></div>
    </div>
    <button class="fab-scroll-chat" id="fab-chat" aria-label="Ask ElectIQ a question">
      <span class="material-symbols-outlined">chat</span>
    </button>
  `;

  // Lazy load timeline.js
  const { initTimeline } = await import('./timeline.js');
  await initTimeline('timeline-container');

  document.getElementById('fab-chat')?.addEventListener('click', () => {
    window.location.hash = '#/chat';
  });
}

async function renderJourneyPage(outlet) {
  outlet.innerHTML = `
    <div class="main__content" id="journey-container">
      <div class="skeleton" style="height: 400px;"></div>
    </div>
    <button class="fab-scroll-chat" id="fab-chat" aria-label="Ask ElectIQ a question">
      <span class="material-symbols-outlined">chat</span>
    </button>
  `;

  // Lazy load journey.js
  const { initJourney } = await import('./journey.js');
  await initJourney('journey-container');
  
  document.getElementById('fab-chat')?.addEventListener('click', () => {
    window.location.hash = '#/chat';
  });
}

async function renderGlossaryPage(outlet) {
  const { initGlossary } = await import('./glossary.js');
  outlet.innerHTML = `
    <div class="main__content" id="glossary-container">
      <div class="skeleton" style="height: 400px;"></div>
    </div>
  `;
  await initGlossary('glossary-container');
}

function render404Page(outlet) {
  outlet.innerHTML = `
    <section class="error-page" style="text-align:center; padding: 4rem 2rem;">
      <h1 style="font-size: 3rem; color: var(--color-primary);">404</h1>
      <p style="font-size: 1.25rem; margin-bottom: 2rem;">Oops! This page was not found in our election guide.</p>
      <button class="btn btn--primary" onclick="window.location.hash='#/'">
        Go to Home
      </button>
    </section>
  `;
}

async function renderAboutPage(outlet) {
  outlet.innerHTML = `
    <div class="main__content">
      <section class="section" aria-labelledby="about-title">
        <h1 class="section__title" id="about-title">About ElectIQ</h1>
        <p class="section__subtitle">
          ElectIQ is an AI-powered interactive assistant built to help citizens 
          understand the election process. Powered by Google Gemini, it delivers 
          accurate, non-partisan information about voting, registration, and 
          civic engagement.
        </p>
        <div class="card" style="margin-top: var(--space-6);">
          <h3 style="font-weight: var(--fw-semibold); margin-bottom: var(--space-3); color: var(--clr-text-primary);">Tech Stack</h3>
          <ul style="color: var(--clr-text-secondary); display: flex; flex-direction: column; gap: var(--space-2);">
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined" aria-hidden="true">smart_toy</span> Google Gemini Flash — AI responses</li>
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined" aria-hidden="true">database</span> Firebase Firestore — Chat persistence</li>
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined" aria-hidden="true">analytics</span> Firebase Analytics — Usage insights</li>
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined" aria-hidden="true">record_voice_over</span> Google Cloud TTS — Voice output</li>
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined" aria-hidden="true">bolt</span> Vite — Build tooling</li>
          </ul>
        </div>
      </section>
    </div>
  `;
}

/* ── Layout & UI Helpers ── */

function initLayout() {
  const menuBtn = document.getElementById('menu-toggle') || document.querySelector('.mobile-header__brand');
  const sidebar = document.querySelector('.sidebar');
  const themeToggleMobile = document.getElementById('theme-toggle-mobile');

  // Sidebar toggle for mobile (if we add a hamburger, but using brand for now as requested)
  menuBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('sidebar--open');
  });

  // Mobile theme toggle
  themeToggleMobile?.addEventListener('click', () => {
    toggleTheme();
  });
}

function closeSidebar() {
  document.querySelector('.sidebar')?.classList.remove('sidebar--open');
}

function updateActiveLinks(path) {
  // Sidebar links
  document.querySelectorAll('.sidebar__link').forEach(link => {
    const route = link.getAttribute('data-route');
    link.classList.toggle('sidebar__link--active', route === path);
  });

  // Mobile tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const route = btn.getAttribute('data-route');
    btn.classList.toggle('active', route === path);
  });
}

function initTheme() {
  const savedTheme = localStorage.getItem('electiq-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcons(savedTheme);

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('electiq-theme', next);
  updateThemeIcons(next);
}

function updateThemeIcons(theme) {
  const icon = theme === 'dark' ? 'light_mode' : 'dark_mode';
  document.querySelectorAll('#theme-toggle .material-symbols-outlined, #theme-toggle-mobile .material-symbols-outlined').forEach(el => {
    el.textContent = icon;
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (confirm('New version available — reload?')) {
                window.location.reload();
              }
            }
          });
        });
      }).catch(err => {
        console.warn('[PWA] ServiceWorker registration failed:', err);
      });
    });
  }
}

function showOfflineBanner() {
  if (document.querySelector('.offline-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'offline-banner';
  banner.textContent = 'Limited Mode — Offline or Config issues. Chat may still work!';
  document.body.prepend(banner);
}

/* ── Mobile Sidebar ── */
document.addEventListener('click', (e) => {
  const menuBtn = e.target.closest('#menu-toggle');
  if (menuBtn) {
    document.querySelector('.sidebar')?.classList.toggle('sidebar--open');
    document.querySelector('.sidebar-overlay')?.classList.toggle('sidebar-overlay--visible');
  }

  if (e.target.closest('.sidebar-overlay')) {
    document.querySelector('.sidebar')?.classList.remove('sidebar--open');
    document.querySelector('.sidebar-overlay')?.classList.remove('sidebar-overlay--visible');
  }
});
