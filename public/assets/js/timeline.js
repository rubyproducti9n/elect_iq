/* ═══════════════════════════════════════════════
   ElectIQ — Timeline Module
   Interactive visualization of the election process
   ═══════════════════════════════════════════════ */

import { sanitizeOutput } from './sanitize.js';
import { trackEvent } from './analytics.js';
import { askGemini } from './gemini.js';
import { ok, timed, getEl } from './utils.js';
import { ANALYTICS_EVENTS, ERROR_CODES } from './constants.js';

/* ── Module State ── */
let milestones = [];
let activeFilter = 'all';
let expandedNodeId = null;
let countdownInterval = null;

/* ── Category Configuration ── */
const CATEGORIES = {
  announcement: { label: 'Announcement', icon: 'campaign',       color: '#6366f1' },
  nomination:   { label: 'Nomination',   icon: 'how_to_reg',     color: '#f59e0b' },
  campaign:     { label: 'Campaign',     icon: 'interpreter_mode', color: '#22c55e' },
  polling:      { label: 'Polling',      icon: 'how_to_vote',    color: '#3b82f6' },
  counting:     { label: 'Counting',     icon: 'calculate',      color: '#a855f7' },
  result:       { label: 'Result',       icon: 'emoji_events',   color: '#ef4444' },
};

/**
 * @description Bootstraps the timeline view and loads data
 * @param {string} [containerId] - DOM mount point
 * @returns {Promise<void>}
 */
export async function initTimeline(containerId = 'timeline-container') {
  const container = getEl(containerId);
  if (!container) return;

  try {
    const response = await fetch('/assets/data/election-knowledge.json');
    const data = await response.json();
    
    milestones = (data.timeline_milestones || []).map((m, i) => ({
      ...m,
      index: i,
      dayNum: parseDayNumber(m.date),
    }));

    renderFullTimeline(container);
    bindTimelineEvents(container);
    startCountdown(container);
    observeNodes(container);
  } catch (error) {
    container.innerHTML = `<div class="timeline-error"><p>Failed to load timeline data.</p></div>`;
  }
}

/**
 * @description Builds the skeleton of the timeline view
 * @param {HTMLElement} container - The mount point
 * @returns {void}
 */
function renderFullTimeline(container) {
  const currentPhase = findCurrentPhase();
  const nextMilestone = findNextMilestone();

  container.innerHTML = `
    <div class="timeline-header">
      <h2 class="timeline-header__title">Election Journey</h2>
      ${nextMilestone ? `<div class="timeline-countdown" id="countdown-text">...</div>` : ''}
    </div>
    <div class="timeline-filters">
      <button class="timeline-filter active" data-category="all">All</button>
      ${Object.entries(CATEGORIES).map(([key, cat]) => `
        <button class="timeline-filter" data-category="${key}">${cat.label}</button>
      `).join('')}
    </div>
    <div class="timeline-track" id="timeline-track">
      <div class="timeline-track__line"></div>
      ${milestones.map((m, i) => renderNode(m, i, currentPhase)).join('')}
    </div>
    <div class="timeline-detail" id="timeline-detail" style="display:none;"></div>
  `;
}

/**
 * @description Renders a single milestone node
 * @param {object} m - Milestone data
 * @param {number} i - Index
 * @param {object} current - The active phase
 * @returns {string} HTML string
 */
function renderNode(m, i, current) {
  const cat = CATEGORIES[m.category] || {};
  const isCurrent = current && current.id === m.id;
  const positionClass = i % 2 === 0 ? 'node__content--above' : 'node__content--below';

  return `
    <div class="timeline-node ${isCurrent ? 'timeline-node--active' : ''}" data-id="${m.id}" data-category="${m.category}" tabindex="0">
      <div class="node__connector"></div>
      <div class="node__dot" style="--cat-color: ${cat.color}; background: ${cat.color};">
        <span class="material-symbols-outlined node__dot-icon" style="font-size: 16px; color: #fff;">${cat.icon}</span>
        ${isCurrent ? '<div class="node__pulse" style="--cat-color: ' + cat.color + '"></div>' : ''}
      </div>
      <div class="node__content ${positionClass}">
        <div class="node__date">${sanitizeOutput(m.date)}</div>
        <div class="node__label">${sanitizeOutput(m.label)}</div>
        ${isCurrent ? '<div class="node__badge">Current Phase</div>' : ''}
      </div>
    </div>
  `;
}

/**
 * @description Wires up timeline interactions
 * @param {HTMLElement} container - Mount point
 * @returns {void}
 */
function bindTimelineEvents(container) {
  const track = container.querySelector('#timeline-track');
  
  track?.addEventListener('click', (e) => {
    const node = e.target.closest('.timeline-node');
    if (node) activateNode(node, container);
  });

  container.querySelector('.timeline-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.timeline-filter');
    if (btn) applyFilter(btn.dataset.category, container);
  });
}

/**
 * @description Expands a node and fetches AI insights
 * @param {HTMLElement} node - The clicked node
 * @param {HTMLElement} container - View container
 * @returns {void}
 * @fires Analytics#timeline_phase_viewed
 */
function activateNode(node, container) {
  const milestone = milestones.find(m => m.id === node.dataset.id);
  if (!milestone) return;

  const panel = container.querySelector('#timeline-detail');
  panel.style.display = 'block';
  panel.innerHTML = `<h3>${milestone.label}</h3><p>${milestone.description}</p><div id="dyk-body">Loading facts...</div>`;
  
  trackEvent(ANALYTICS_EVENTS.TIMELINE_PHASE_VIEWED, { phase: milestone.label });
  fetchFacts(milestone.label);
}

/**
 * @description Fetches "Did you know" facts using Gemini
 * @param {string} label - Milestone name
 * @returns {Promise<void>}
 */
async function fetchFacts(label) {
  const body = getEl('dyk-body');
  const res = await askGemini(`2 fun facts about ${label} in Indian elections.`);
  if (body) body.innerHTML = res.ok ? sanitizeOutput(res.value.text) : 'Facts unavailable.';
}

/**
 * @description Filters visible nodes by category
 * @param {string} cat - Category key
 * @param {HTMLElement} container - View container
 * @returns {void}
 */
function applyFilter(cat, container) {
  container.querySelectorAll('.timeline-node').forEach(node => {
    const match = cat === 'all' || node.dataset.category === cat;
    node.style.display = match ? 'flex' : 'none';
  });
}

/**
 * @description Internal logic for progress tracking
 * @returns {object} The milestone closest to current simulated time
 */
function findCurrentPhase() {
  const today = Math.floor((Date.now() / 86400000) % 60);
  return milestones.reduce((prev, curr) => 
    Math.abs(curr.dayNum - today) < Math.abs(prev.dayNum - today) ? curr : prev
  , milestones[0]);
}

/**
 * @description Logic for the next upcoming milestone
 * @returns {object|null}
 */
function findNextMilestone() {
  const today = Math.floor((Date.now() / 86400000) % 60);
  return milestones.find(m => m.dayNum > today) || null;
}

/**
 * @description Starts the tick for the UI countdown timer
 * @param {HTMLElement} container - View container
 * @returns {void}
 */
function startCountdown(container) {
  const el = container.querySelector('#countdown-text');
  const update = () => {
    const next = findNextMilestone();
    if (el && next) {
      const today = Math.floor((Date.now() / 86400000) % 60);
      el.textContent = `${next.dayNum - today} days until ${next.label}`;
    }
  };
  update();
  countdownInterval = setInterval(update, 60000);
}

/**
 * @description Extracts relative day sequence from data strings
 * @param {string} s - Date string
 * @returns {number}
 */
function parseDayNumber(s) {
  return parseInt(s.match(/Day\s+(\d+)/i)?.[1] || '0', 10);
}

/**
 * @description Intersection observer for entrance animations
 * @param {HTMLElement} container - View container
 * @returns {void}
 */
function observeNodes(container) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    });
  }, { threshold: 0.1 });
  container.querySelectorAll('.timeline-node').forEach(n => observer.observe(n));
}
