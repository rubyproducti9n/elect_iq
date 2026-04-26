/* ═══════════════════════════════════════════════
   ElectIQ — Glossary
   ─────────────────────────────────────────────
   • Searchable glossary of election terms
   • Live filtering (debounced)
   • Alphabet (A-Z) jump filter
   • Expandable accordion cards
   • Virtual scroll / lazy reveal via IntersectionObserver
   ═══════════════════════════════════════════════ */

import { sanitizeOutput } from './sanitize.js';

let allTerms = [];
let filteredTerms = [];
let debounceTimer = null;

export async function initGlossary(containerId = 'glossary-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const response = await fetch('/assets/data/election-knowledge.json');
    const data = await response.json();
    
    // Sort terms alphabetically
    allTerms = (data.glossary || []).sort((a, b) => a.term.localeCompare(b.term));
    filteredTerms = [...allTerms];

    renderLayout(container);
    renderTerms(container);
    bindEvents(container);
  } catch (error) {
    console.error('[Glossary] Failed to load data:', error);
    container.innerHTML = `<p class="error-text">Failed to load glossary data.</p>`;
  }
}

function renderLayout(container) {
  const letters = Array.from({length: 26}, (_, i) => String.fromCharCode(65 + i));

  container.innerHTML = `
    <div class="glossary-header">
      <h2 class="glossary-header__title">Election Glossary</h2>
      <p class="glossary-header__subtitle">Understand the terminology of Indian elections.</p>
    </div>

    <!-- Search & Filter -->
    <div class="glossary-controls">
      <div class="glossary-search">
        <span class="material-symbols-outlined glossary-search__icon">search</span>
        <input type="text" id="glossary-search-input" class="glossary-search__input" placeholder="Search terms (e.g. EVM, NOTA)..." aria-label="Search glossary">
      </div>
      
      <div class="glossary-alphabet" role="group" aria-label="Filter by letter">
        <button class="glossary-alpha-btn glossary-alpha-btn--active" data-letter="ALL">All</button>
        ${letters.map(l => `<button class="glossary-alpha-btn" data-letter="${l}">${l}</button>`).join('')}
      </div>
    </div>

    <!-- Results count -->
    <div class="glossary-status" id="glossary-status" aria-live="polite">
      Showing ${filteredTerms.length} terms
    </div>

    <!-- Terms List -->
    <div class="glossary-list" id="glossary-list"></div>
  `;
}

function renderTerms(container) {
  const listEl = container.querySelector('#glossary-list');
  const statusEl = container.querySelector('#glossary-status');
  if (!listEl) return;

  if (filteredTerms.length === 0) {
    listEl.innerHTML = `
      <div class="glossary-empty">
        <span class="material-symbols-outlined" aria-hidden="true" style="font-size: 48px; color: var(--clr-text-muted);">search_off</span>
        <p>No terms found matching your criteria.</p>
      </div>`;
    if (statusEl) statusEl.textContent = '0 terms found';
    return;
  }

  // Render all terms, but hide those > 20 using a lazy class
  const html = filteredTerms.map((item, index) => {
    const isLazy = index >= 20;
    return `
      <div class="glossary-card ${isLazy ? 'glossary-card--lazy' : ''}" data-term="${sanitizeOutput(item.term)}">
        <button class="glossary-card__header" aria-expanded="false" aria-controls="term-${index}">
          <span class="glossary-card__term">${sanitizeOutput(item.term)}</span>
          <span class="material-symbols-outlined glossary-card__icon" aria-hidden="true">expand_more</span>
        </button>
        <div class="glossary-card__body" id="term-${index}" hidden>
          <div class="glossary-card__inner">
            <p class="glossary-card__def">${sanitizeOutput(item.definition)}</p>
            <div class="glossary-card__actions">
              <button class="glossary-btn--ask" data-ask="${sanitizeOutput(item.term)}">
                Ask ElectIQ more about this <span class="material-symbols-outlined" aria-hidden="true" style="font-size: 16px;">chat</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = html;
  if (statusEl) statusEl.textContent = `Showing ${filteredTerms.length} terms`;

  observeLazyCards(container);
}

function bindEvents(container) {
  // Search Input (Debounced)
  const searchInput = container.querySelector('#glossary-search-input');
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = e.target.value.trim().toLowerCase();
      applyFilters(container, query, getActiveLetter(container));
    }, 300);
  });

  // Alphabet Filter
  const alphaBtns = container.querySelectorAll('.glossary-alpha-btn');
  alphaBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      alphaBtns.forEach(b => b.classList.remove('glossary-alpha-btn--active'));
      btn.classList.add('glossary-alpha-btn--active');
      const letter = btn.dataset.letter;
      const query = searchInput?.value.trim().toLowerCase() || '';
      applyFilters(container, query, letter);
    });
  });

  // Accordion Expand/Collapse via event delegation
  const listEl = container.querySelector('#glossary-list');
  listEl?.addEventListener('click', (e) => {
    // Handle Accordion Header
    const header = e.target.closest('.glossary-card__header');
    if (header) {
      const card = header.closest('.glossary-card');
      const body = card.querySelector('.glossary-card__body');
      const isExpanded = header.getAttribute('aria-expanded') === 'true';
      
      // Close others (optional, acts like single-open accordion)
      listEl.querySelectorAll('.glossary-card__header').forEach(h => {
        if (h !== header) {
          h.setAttribute('aria-expanded', 'false');
          h.closest('.glossary-card').classList.remove('glossary-card--expanded');
          h.closest('.glossary-card').querySelector('.glossary-card__body').hidden = true;
        }
      });

      // Toggle current
      header.setAttribute('aria-expanded', !isExpanded);
      card.classList.toggle('glossary-card--expanded', !isExpanded);
      body.hidden = isExpanded;
      return;
    }

    // Handle "Ask ElectIQ" button
    const askBtn = e.target.closest('.glossary-btn--ask');
    if (askBtn) {
      const term = askBtn.dataset.ask;
      localStorage.setItem('electiq_chat_prefill', `Explain the election term "${term}" in detail.`);
      window.location.hash = '#/chat';
    }
  });

  // Accordion Keyboard Navigation
  listEl?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const header = e.target.closest('.glossary-card__header');
      if (header) {
        e.preventDefault();
        const headers = Array.from(listEl.querySelectorAll('.glossary-card__header'));
        const index = headers.indexOf(header);
        const nextIndex = e.key === 'ArrowDown' ? index + 1 : index - 1;
        if (headers[nextIndex]) {
          headers[nextIndex].focus();
        }
      }
    }
  });
}

function applyFilters(container, query, letter) {
  filteredTerms = allTerms.filter(item => {
    const matchesQuery = item.term.toLowerCase().includes(query) || 
                         item.definition.toLowerCase().includes(query);
    const matchesLetter = letter === 'ALL' || item.term.toUpperCase().startsWith(letter);
    return matchesQuery && matchesLetter;
  });
  renderTerms(container);
}

function getActiveLetter(container) {
  const activeBtn = container.querySelector('.glossary-alpha-btn--active');
  return activeBtn ? activeBtn.dataset.letter : 'ALL';
}

function observeLazyCards(container) {
  const lazyCards = container.querySelectorAll('.glossary-card--lazy');
  if (!lazyCards.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('glossary-card--lazy');
        obs.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px 200px 0px' });

  lazyCards.forEach(card => observer.observe(card));
}
