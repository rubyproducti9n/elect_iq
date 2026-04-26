/* ═══════════════════════════════════════════════
   ElectIQ — Election Timeline Renderer
   ═══════════════════════════════════════════════ */

import { sanitizeOutput } from './sanitize.js';

let timelineData = [];

/**
 * Load and render the election timeline.
 * @param {string} containerId - DOM ID of timeline container
 */
export async function initTimeline(containerId = 'timeline-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const response = await fetch('/assets/data/election-knowledge.json');
    const data = await response.json();
    // Map timeline_milestones to renderer format
    timelineData = (data.timeline_milestones || []).map((m) => ({
      date: m.date,
      title: m.label,
      description: m.description,
      tag: m.category,
      completed: false,
    }));
    renderTimeline(container, timelineData);
    observeTimelineEvents();
  } catch (error) {
    console.error('[Timeline] Failed to load data:', error);
    container.innerHTML = `<p class="timeline__error">Unable to load timeline data.</p>`;
  }
}

/**
 * Render timeline HTML into container.
 */
function renderTimeline(container, events) {
  const html = `
    <div class="timeline__phase">
      <h2 class="timeline__phase-title">Election Process Timeline</h2>
      <p class="timeline__phase-subtitle">Key milestones in the democratic process</p>
    </div>
    <div class="timeline" role="list" aria-label="Election timeline">
      <div class="timeline__line">
        <div class="timeline__progress" id="timeline-progress"></div>
      </div>
      ${events.map((event, i) => `
        <div class="timeline__event ${event.completed ? 'timeline__event--completed' : ''}"
             role="listitem"
             data-index="${i}"
             aria-label="${sanitizeOutput(event.title)}">
          <div class="timeline__dot"></div>
          <div class="timeline__card">
            <span class="timeline__date"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">calendar_month</span>${sanitizeOutput(event.date)}</span>
            <h3 class="timeline__title">${sanitizeOutput(event.title)}</h3>
            <p class="timeline__description">${sanitizeOutput(event.description)}</p>
            ${event.tag ? `<span class="timeline__tag">${sanitizeOutput(event.tag)}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Intersection Observer for scroll-reveal animation.
 */
function observeTimelineEvents() {
  const events = document.querySelectorAll('.timeline__event');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('timeline__event--visible');
          updateProgress(entry.target.dataset.index);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2, rootMargin: '0px 0px -50px 0px' }
  );

  events.forEach((event) => observer.observe(event));
}

/**
 * Update the progress line height.
 */
function updateProgress(index) {
  const progressEl = document.getElementById('timeline-progress');
  if (!progressEl || !timelineData.length) return;
  const percent = ((parseInt(index) + 1) / timelineData.length) * 100;
  progressEl.style.height = `${percent}%`;
}

export { timelineData };
