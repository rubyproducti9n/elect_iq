/* ═══════════════════════════════════════════════
   ElectIQ — Glossary Module
   Searchable dictionary of election terminology
   ═══════════════════════════════════════════════ */

import { sanitizeOutput } from './sanitize.js';
import { trackEvent } from './analytics.js';
import { ok, timed, getEl } from './utils.js';
import { ANALYTICS_EVENTS } from './constants.js';

/* ── Module State ── */
let allTerms = [];
let filteredTerms = [];
let debounceTimer = null;

/**
 * @description Initializes the glossary and loads definitions
 * @param {string} [containerId] - DOM mount point
 * @returns {Promise<void>}
 */
export async function initGlossary(containerId = 'glossary-container') {
  const container = getEl(containerId);
  if (!container) return;

  try {
    const response = await fetch('/assets/data/election-knowledge.json');
    const data = await response.json();
    
    // Maintain strict alphabetical ordering
    allTerms = (data.glossary || []).sort((a, b) => a.term.localeCompare(b.term));
    filteredTerms = [...allTerms];

    renderGlossaryLayout(container);
    renderGlossaryTerms(container);
    bindGlossaryEvents(container);
  } catch (error) {
    container.innerHTML = `<div class="glossary-error"><p>Glossary unavailable.</p></div>`;
  }
}

/**
 * @description Renders the search bar and alphabet filter UI
 * @param {HTMLElement} container - Mount point
 * @returns {void}
 */
function renderGlossaryLayout(container) {
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

  container.innerHTML = `
    <div class="glossary-header">
      <h2 class="glossary-header__title">Term Definitions</h2>
    </div>
    <div class="glossary-controls">
      <input type="text" id="glossary-search" placeholder="Search terms..." class="glossary-search__input">
      <div class="glossary-alphabet">
        <button class="alpha-btn active" data-letter="ALL">All</button>
        ${letters.map(l => `<button class="alpha-btn" data-letter="${l}">${l}</button>`).join('')}
      </div>
    </div>
    <div id="glossary-list" class="glossary-list"></div>
  `;
}

/**
 * @description Renders the list of terms based on current filters
 * @param {HTMLElement} container - Mount point
 * @returns {void}
 */
function renderGlossaryTerms(container) {
  const list = container.querySelector('#glossary-list');
  if (!list) return;

  if (filteredTerms.length === 0) {
    list.innerHTML = `<p class="glossary-empty">No terms found.</p>`;
    return;
  }

  list.innerHTML = filteredTerms.map((item, idx) => `
    <div class="glossary-card">
      <div class="glossary-card__header">
        <strong>${sanitizeOutput(item.term)}</strong>
      </div>
      <div class="glossary-card__body">
        <p>${sanitizeOutput(item.definition)}</p>
        <button class="glossary-btn--ask" data-term="${item.term}">Explain further</button>
      </div>
    </div>
  `).join('');
}

/**
 * @description Binds search, jump-to-letter, and AI-prefill events
 * @param {HTMLElement} container - Mount point
 * @returns {void}
 */
function bindGlossaryEvents(container) {
  const search = container.querySelector('#glossary-search');
  
  search?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filterGlossary(container, e.target.value.toLowerCase(), getActiveLetter(container));
    }, 250);
  });

  container.querySelector('.glossary-alphabet')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.alpha-btn');
    if (!btn) return;

    container.querySelectorAll('.alpha-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterGlossary(container, search.value.toLowerCase(), btn.dataset.letter);
  });

  container.querySelector('#glossary-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.glossary-btn--ask');
    if (btn) {
      localStorage.setItem('electiq_chat_prefill', `Tell me more about "${btn.dataset.term}"`);
      window.location.hash = '#/chat';
    }
  });
}

/**
 * @description Applies text and letter filters to the master term list
 * @param {HTMLElement} container - View container
 * @param {string} query - Search text
 * @param {string} letter - Alpha filter
 * @returns {void}
 */
function filterGlossary(container, query, letter) {
  filteredTerms = allTerms.filter(item => {
    const matchesQuery = item.term.toLowerCase().includes(query);
    const matchesLetter = letter === 'ALL' || item.term.toUpperCase().startsWith(letter);
    return matchesQuery && matchesLetter;
  });
  renderGlossaryTerms(container);
}

/**
 * @description Helper to find the currently active letter button
 * @param {HTMLElement} container - View container
 * @returns {string}
 */
function getActiveLetter(container) {
  return container.querySelector('.alpha-btn.active')?.dataset.letter || 'ALL';
}
