/* ═══════════════════════════════════════════════
   ElectIQ — App Entry Point
   ═══════════════════════════════════════════════ */

import { Router } from './router.js';
import { initChat } from './chat.js';
import { initTimeline } from './timeline.js';
import { initFirebase, logAnalyticsEvent } from './firebase.js';
import { initSkipLink, initKeyboardShortcuts } from './accessibility.js';
import { loadKnowledgeBase } from './gemini.js';

/* ── App Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  // Accessibility
  initSkipLink();
  initKeyboardShortcuts();

  // Firebase (non-blocking)
  initFirebase().catch((err) =>
    console.warn('[ElectIQ] Firebase init skipped:', err.message)
  );

  // Pre-load election knowledge base (non-blocking)
  loadKnowledgeBase().catch((err) =>
    console.warn('[ElectIQ] Knowledge base load skipped:', err.message)
  );

  // Theme management
  initTheme();

  // PWA registration
  registerServiceWorker();

  // Router
  const router = new Router('#app-view');

  router
    .on('/', renderHomePage)
    .on('/chat', renderChatPage)
    .on('/timeline', renderTimelinePage)
    .on('/about', renderAboutPage)
    .on('*', renderHomePage)
    .use((toPath) => {
      logAnalyticsEvent('page_view', { page: toPath });
      return true;
    })
    .start();
});

/* ── Page Renderers ── */

async function renderHomePage(outlet) {
  outlet.innerHTML = `
    <section class="hero">
      <div class="hero__content">
        <h1 class="hero__title">
          <span class="hero__title-line">Understand Your</span>
          <span class="hero__title-highlight">Election Process</span>
        </h1>
        <p class="hero__subtitle">
          ElectIQ is your AI-powered guide to elections, voter registration, 
          and civic engagement. Ask questions, explore timelines, and make 
          your voice count.
        </p>
        <div class="hero__actions">
          <button class="btn btn--primary" data-route="/chat">
            <span class="material-symbols-outlined">forum</span> Start Chatting
          </button>
          <button class="btn btn--secondary" data-route="/timeline">
            <span class="material-symbols-outlined">view_timeline</span> View Timeline
          </button>
        </div>
      </div>
    </section>

    <section class="features">
      <div class="features__grid">
        <div class="card feature-card">
          <div class="feature-card__icon"><span class="material-symbols-outlined" style="font-size: inherit;">smart_toy</span></div>
          <h3 class="feature-card__title">AI-Powered Chat</h3>
          <p class="feature-card__desc">Ask anything about elections and get instant, accurate, non-partisan answers.</p>
        </div>
        <div class="card feature-card">
          <div class="feature-card__icon"><span class="material-symbols-outlined" style="font-size: inherit;">event_note</span></div>
          <h3 class="feature-card__title">Election Timeline</h3>
          <p class="feature-card__desc">Visual step-by-step guide through the entire election process.</p>
        </div>
        <div class="card feature-card">
          <div class="feature-card__icon"><span class="material-symbols-outlined" style="font-size: inherit;">volume_up</span></div>
          <h3 class="feature-card__title">Text-to-Speech</h3>
          <p class="feature-card__desc">Listen to answers read aloud for an accessible experience.</p>
        </div>
        <div class="card feature-card">
          <div class="feature-card__icon"><span class="material-symbols-outlined" style="font-size: inherit;">offline_bolt</span></div>
          <h3 class="feature-card__title">Works Offline</h3>
          <p class="feature-card__desc">Install as a PWA and access key resources without internet.</p>
        </div>
      </div>
    </section>
  `;
}

async function renderChatPage(outlet) {
  outlet.innerHTML = `
    <div class="chat" role="region" aria-label="Chat with ElectIQ">
      <div class="chat__messages" id="chat-messages" role="list">
        <div class="chat__welcome">
          <div class="chat__welcome-icon"><span class="material-symbols-outlined" style="font-size: inherit;">how_to_vote</span></div>
          <h2 class="chat__welcome-title">Welcome to ElectIQ</h2>
          <p class="chat__welcome-subtitle">
            Ask me anything about the election process, voter registration, or civic engagement.
          </p>
          <div class="chat__suggestions" id="chat-suggestions"></div>
        </div>
      </div>
      <div class="chat__input-area">
        <div class="chat__input-wrapper">
          <button class="chat__tts-btn" id="chat-tts" aria-label="Text-to-speech toggle" title="Read aloud"><span class="material-symbols-outlined">volume_up</span></button>
          <textarea class="chat__input" id="chat-input"
            placeholder="Ask about elections…"
            rows="1"
            aria-label="Type your question"></textarea>
          <button class="chat__send-btn" id="chat-send" aria-label="Send message" title="Send">
            <span class="material-symbols-outlined">send</span>
          </button>
        </div>
        <p class="chat__disclaimer">ElectIQ provides general information. Always verify with official sources.</p>
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
  `;

  await initTimeline('timeline-container');
}

async function renderAboutPage(outlet) {
  outlet.innerHTML = `
    <div class="main__content">
      <section class="section">
        <h1 class="section__title">About ElectIQ</h1>
        <p class="section__subtitle">
          ElectIQ is an AI-powered interactive assistant built to help citizens 
          understand the election process. Powered by Google Gemini, it delivers 
          accurate, non-partisan information about voting, registration, and 
          civic engagement.
        </p>
        <div class="card" style="margin-top: var(--space-6);">
          <h3 style="font-weight: var(--fw-semibold); margin-bottom: var(--space-3); color: var(--clr-text-primary);">Tech Stack</h3>
          <ul style="color: var(--clr-text-secondary); display: flex; flex-direction: column; gap: var(--space-2);">
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined">smart_toy</span> Google Gemini Flash — AI responses</li>
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined">database</span> Firebase Firestore — Chat persistence</li>
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined">analytics</span> Firebase Analytics — Usage insights</li>
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined">record_voice_over</span> Google Cloud TTS — Voice output</li>
            <li style="display: flex; gap: var(--space-2); align-items: center;"><span class="material-symbols-outlined">bolt</span> Vite — Build tooling</li>
          </ul>
        </div>
      </section>
    </div>
  `;
}

/* ── Theme Toggle ── */
function initTheme() {
  const saved = localStorage.getItem('electiq-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    updateThemeIcon(toggle, saved);
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('electiq-theme', next);
      updateThemeIcon(toggle, next);
    });
  }
}

function updateThemeIcon(btn, theme) {
  btn.innerHTML = theme === 'dark' ? '<span class="material-symbols-outlined">light_mode</span>' : '<span class="material-symbols-outlined">dark_mode</span>';
  btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
}

/* ── Service Worker ── */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
      console.info('[ElectIQ] Service worker registered');
    } catch (err) {
      console.warn('[ElectIQ] Service worker registration failed:', err);
    }
  }
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
