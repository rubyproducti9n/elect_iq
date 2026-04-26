/* ═══════════════════════════════════════════════
   ElectIQ — Interactive Election Timeline (v2)
   ─────────────────────────────────────────────
   • Horizontal (desktop) / Vertical (mobile) layout
   • Category filter bar with animated transitions
   • Node expand → detail panel + "Did you know?" AI card
   • Current phase badge + countdown timer
   • Full keyboard navigation (arrow keys)
   ═══════════════════════════════════════════════ */

import { sanitizeOutput } from './sanitize.js';
import { logAnalyticsEvent } from './firebase.js';
import { askGemini } from './gemini.js';

/* ── State ── */
let milestones = [];
let activeFilter = 'all';
let expandedNodeId = null;
let countdownInterval = null;

/* ── Category metadata ── */
const CATEGORIES = {
  announcement: { label: 'Announcement', icon: 'campaign',       color: '#6366f1' },
  nomination:   { label: 'Nomination',   icon: 'how_to_reg',     color: '#f59e0b' },
  campaign:     { label: 'Campaign',     icon: 'interpreter_mode', color: '#22c55e' },
  polling:      { label: 'Polling',      icon: 'how_to_vote',    color: '#3b82f6' },
  counting:     { label: 'Counting',     icon: 'calculate',      color: '#a855f7' },
  result:       { label: 'Result',       icon: 'emoji_events',   color: '#ef4444' },
};

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */

/**
 * Load timeline data and render into the container.
 * @param {string} containerId - DOM ID of the timeline mount point
 */
export async function initTimeline(containerId = 'timeline-container') {
  const container = document.getElementById(containerId);
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
    console.error('[Timeline] Failed to load data:', error);
    container.innerHTML = `
      <div class="timeline-error">
        <span class="material-symbols-outlined" style="font-size:48px;color:var(--clr-error,#ef4444);">error</span>
        <p>Unable to load timeline data. Please try again later.</p>
      </div>`;
  }
}

/* ═══════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════ */

function renderFullTimeline(container) {
  const currentPhase = findCurrentPhase();
  const nextMilestone = findNextMilestone();

  container.innerHTML = `
    <!-- Header -->
    <div class="timeline-header">
      <div class="timeline-header__text">
        <h2 class="timeline-header__title">
          <span class="material-symbols-outlined" style="font-size:28px;vertical-align:middle;margin-right:8px;">view_timeline</span>
          Election Process Timeline
        </h2>
        <p class="timeline-header__subtitle">Track every milestone of India's democratic journey</p>
      </div>
      ${nextMilestone ? `
        <div class="timeline-countdown" id="timeline-countdown">
          <span class="material-symbols-outlined" style="font-size:18px;">schedule</span>
          <span class="timeline-countdown__text" id="countdown-text">Calculating…</span>
        </div>
      ` : ''}
    </div>

    <!-- Filter Bar -->
    <div class="timeline-filters" role="tablist" aria-label="Filter by category">
      <button class="timeline-filter timeline-filter--active" data-category="all" role="tab" aria-selected="true">
        <span class="material-symbols-outlined" style="font-size:16px;">grid_view</span> All
      </button>
      ${Object.entries(CATEGORIES).map(([key, cat]) => `
        <button class="timeline-filter" data-category="${key}" role="tab" aria-selected="false">
          <span class="timeline-filter__dot" style="background:${cat.color};"></span>
          ${cat.label}
        </button>
      `).join('')}
    </div>

    <!-- Progress Summary -->
    ${currentPhase ? `
      <div class="timeline-progress-badge">
        <span class="material-symbols-outlined" style="font-size:16px;">location_on</span>
        Current Phase: <strong>${sanitizeOutput(currentPhase.label)}</strong>
      </div>
    ` : ''}

    <!-- Timeline Track -->
    <div class="timeline-track" id="timeline-track" role="list" aria-label="Election timeline milestones">
      <div class="timeline-track__line"></div>
      ${milestones.map((m, i) => renderNode(m, i, currentPhase)).join('')}
    </div>

    <!-- Detail Panel (injected on click) -->
    <div class="timeline-detail" id="timeline-detail" role="region" aria-live="polite" style="display:none;"></div>

    <!-- Screen reader announcements -->
    <div class="sr-only" id="timeline-announce" aria-live="polite"></div>
  `;
}

function renderNode(milestone, index, currentPhase) {
  const cat = CATEGORIES[milestone.category] || {};
  const isCurrent = currentPhase && currentPhase.id === milestone.id;

  return `
    <div class="timeline-node ${isCurrent ? 'timeline-node--current' : ''}"
         role="button"
         tabindex="0"
         aria-label="${sanitizeOutput(milestone.label)} - ${sanitizeOutput(milestone.date)}"
         data-id="${milestone.id}"
         data-category="${milestone.category}"
         data-index="${index}">
      <div class="node__connector"></div>
      <div class="node__dot" style="--cat-color: ${cat.color || '#888'};">
        <span class="material-symbols-outlined node__dot-icon" style="font-size:16px;">${cat.icon || 'circle'}</span>
        ${isCurrent ? '<span class="node__pulse"></span>' : ''}
      </div>
      <div class="node__content node__content--${index % 2 === 0 ? 'above' : 'below'}">
        <div class="node__date">
          <span class="material-symbols-outlined" style="font-size:13px;">calendar_month</span>
          ${sanitizeOutput(milestone.date)}
        </div>
        <div class="node__label">${sanitizeOutput(milestone.label)}</div>
        ${isCurrent ? '<span class="node__badge">Current</span>' : ''}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════
   DETAIL PANEL
   ═══════════════════════════════════════════════ */

function showDetailPanel(milestone, container) {
  const panel = container.querySelector('#timeline-detail');
  if (!panel) return;

  const cat = CATEGORIES[milestone.category] || {};

  panel.innerHTML = `
    <div class="timeline-detail__inner" style="--accent: ${cat.color || '#888'};">
      <button class="timeline-detail__close" aria-label="Close detail panel">
        <span class="material-symbols-outlined">close</span>
      </button>
      <div class="timeline-detail__header">
        <span class="timeline-detail__cat-dot" style="background:${cat.color};"></span>
        <span class="timeline-detail__cat-label">${cat.label || milestone.category}</span>
        <span class="timeline-detail__date">${sanitizeOutput(milestone.date)}</span>
      </div>
      <h3 class="timeline-detail__title">${sanitizeOutput(milestone.label)}</h3>
      <p class="timeline-detail__desc">${sanitizeOutput(milestone.description)}</p>

      <!-- Did You Know card (loaded async from Gemini) -->
      <div class="timeline-detail__dyk" id="dyk-card">
        <div class="timeline-detail__dyk-header">
          <span class="material-symbols-outlined" style="font-size:18px;">lightbulb</span>
          Did you know?
        </div>
        <div class="timeline-detail__dyk-body" id="dyk-body">
          <div class="timeline-detail__dyk-loading">
            <span class="typing-indicator__dot"></span>
            <span class="typing-indicator__dot"></span>
            <span class="typing-indicator__dot"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Close button
  panel.querySelector('.timeline-detail__close')?.addEventListener('click', () => {
    panel.style.display = 'none';
    expandedNodeId = null;
  });

  // Fetch "Did you know?" from Gemini (fire-and-forget)
  fetchDidYouKnow(milestone.label);
}

async function fetchDidYouKnow(label) {
  const body = document.getElementById('dyk-body');
  if (!body) return;

  try {
    const result = await askGemini(
      `Give me 2 interesting and lesser-known facts about "${label}" in Indian elections. Keep each fact to 1-2 sentences. Format as a numbered list.`,
      []
    );

    if (result.error) {
      body.innerHTML = `<p class="timeline-detail__dyk-fallback">Couldn't load facts right now. Try again later!</p>`;
      return;
    }

    body.innerHTML = sanitizeOutput(result.text);
  } catch {
    body.innerHTML = `<p class="timeline-detail__dyk-fallback">Couldn't load facts right now.</p>`;
  }
}

/* ═══════════════════════════════════════════════
   EVENT BINDING
   ═══════════════════════════════════════════════ */

function bindTimelineEvents(container) {
  const track = container.querySelector('#timeline-track');
  if (!track) return;

  // Node click/enter
  track.addEventListener('click', (e) => {
    const node = e.target.closest('.timeline-node');
    if (node) handleNodeActivate(node, container);
  });

  track.addEventListener('keydown', (e) => {
    const node = e.target.closest('.timeline-node');
    if (!node) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNodeActivate(node, container);
      return;
    }

    // Arrow key navigation
    const nodes = [...track.querySelectorAll('.timeline-node:not(.timeline-node--hidden)')];
    const currentIndex = nodes.indexOf(node);

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = nodes[currentIndex + 1];
      if (next) next.focus();
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = nodes[currentIndex - 1];
      if (prev) prev.focus();
    }

    if (e.key === 'Escape') {
      const panel = container.querySelector('#timeline-detail');
      if (panel) panel.style.display = 'none';
      expandedNodeId = null;
    }
  });

  // Filter bar
  const filters = container.querySelector('.timeline-filters');
  filters?.addEventListener('click', (e) => {
    const btn = e.target.closest('.timeline-filter');
    if (!btn) return;

    const category = btn.dataset.category;
    activeFilter = category;

    // Update active state
    filters.querySelectorAll('.timeline-filter').forEach((f) => {
      f.classList.toggle('timeline-filter--active', f === btn);
      f.setAttribute('aria-selected', f === btn ? 'true' : 'false');
    });

    // Filter nodes with animation
    filterNodes(container, category);
  });
}

function handleNodeActivate(node, container) {
  const id = node.dataset.id;
  const milestone = milestones.find((m) => m.id === id);
  if (!milestone) return;

  // Toggle expand
  if (expandedNodeId === id) {
    const panel = container.querySelector('#timeline-detail');
    if (panel) panel.style.display = 'none';
    expandedNodeId = null;
    return;
  }

  expandedNodeId = id;

  // Highlight active node
  container.querySelectorAll('.timeline-node').forEach((n) =>
    n.classList.toggle('timeline-node--active', n.dataset.id === id)
  );

  // Show detail panel
  showDetailPanel(milestone, container);

  // Analytics
  logAnalyticsEvent('timeline_phase_viewed', { phase_name: milestone.label });

  // Announce to screen readers
  const announce = container.querySelector('#timeline-announce');
  if (announce) announce.textContent = `Showing details for ${milestone.label}`;
}

function filterNodes(container, category) {
  const nodes = container.querySelectorAll('.timeline-node');

  nodes.forEach((node) => {
    const nodeCategory = node.dataset.category;
    const show = category === 'all' || nodeCategory === category;
    node.classList.toggle('timeline-node--hidden', !show);
  });

  // Close detail panel when filtering
  const panel = container.querySelector('#timeline-detail');
  if (panel) panel.style.display = 'none';
  expandedNodeId = null;
}

/* ═══════════════════════════════════════════════
   SCROLL-REVEAL OBSERVER
   ═══════════════════════════════════════════════ */

function observeNodes(container) {
  const nodes = container.querySelectorAll('.timeline-node');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('timeline-node--visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  nodes.forEach((n) => observer.observe(n));
}

/* ═══════════════════════════════════════════════
   PROGRESS / COUNTDOWN
   ═══════════════════════════════════════════════ */

function parseDayNumber(dateStr) {
  const match = dateStr.match(/Day\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function findCurrentPhase() {
  // Simulated: pick the milestone nearest "now" based on day numbers
  // In a real election, this would compare against actual dates
  const today = Math.floor((Date.now() / 86400000) % 60); // cycle 0-59
  let closest = milestones[0];
  let minDiff = Infinity;

  for (const m of milestones) {
    const diff = Math.abs(m.dayNum - today);
    if (diff < minDiff) {
      minDiff = diff;
      closest = m;
    }
  }

  return closest;
}

function findNextMilestone() {
  const today = Math.floor((Date.now() / 86400000) % 60);
  return milestones.find((m) => m.dayNum > today) || null;
}

function startCountdown(container) {
  if (countdownInterval) clearInterval(countdownInterval);

  const update = () => {
    const next = findNextMilestone();
    const el = container.querySelector('#countdown-text');
    if (!el || !next) return;

    const today = Math.floor((Date.now() / 86400000) % 60);
    const daysUntil = next.dayNum - today;

    if (daysUntil > 0) {
      el.textContent = `${daysUntil} day${daysUntil !== 1 ? 's' : ''} until: ${next.label}`;
    } else {
      el.textContent = `Next: ${next.label}`;
    }
  };

  update();
  countdownInterval = setInterval(update, 60_000); // update every minute
}

/* ── Exports ── */
export { milestones as timelineData };
