/* ═══════════════════════════════════════════════
   ElectIQ — Voter Journey Module
   Step-by-step interactive voting guide
   ═══════════════════════════════════════════════ */

import { sanitizeOutput } from './sanitize.js';
import { trackEvent } from './analytics.js';
import { ok, fail, timed, getEl } from './utils.js';
import { ANALYTICS_EVENTS, ERROR_CODES } from './constants.js';

/* ── Module State ── */
let journeyData = [];
let currentStep = 0;
const SESSION_KEY = 'electiq_journey_step';

/**
 * @description Initializes the Voter Journey wizard
 * @param {string} [containerId] - DOM mount point
 * @returns {Promise<void>}
 */
export async function initJourney(containerId = 'journey-container') {
  const container = getEl(containerId);
  if (!container) return;

  try {
    const response = await fetch('/assets/data/election-knowledge.json');
    const data = await response.json();
    journeyData = data.voter_journey || [];

    // Restore previous progress for a seamless experience
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved !== null) {
      currentStep = parseInt(saved, 10);
      if (currentStep < 0 || currentStep >= journeyData.length) currentStep = 0;
    }

    renderJourney(container);
    bindJourneyEvents(container);
    updateJourneyUI(container);
  } catch (error) {
    container.innerHTML = `<div class="journey-error"><p>Journey data unavailable.</p></div>`;
  }
}

/**
 * @description Renders the base HTML structure of the wizard
 * @param {HTMLElement} container - Mount point
 * @returns {void}
 */
function renderJourney(container) {
  container.innerHTML = `
    <div class="journey-header">
      <h2 class="journey-header__title">Citizen's Voting Path</h2>
    </div>
    <div class="journey-stepper" role="tablist">
      ${journeyData.map((step, idx) => `
        <button class="journey-stepper__btn" data-index="${idx}">
          <span class="journey-stepper__circle">${idx + 1}</span>
          <span class="journey-stepper__label">${sanitizeOutput(step.title)}</span>
        </button>
      `).join('')}
    </div>
    <div class="journey-content">
      ${journeyData.map((step, idx) => renderStepContent(step, idx)).join('')}
    </div>
    <div class="journey-nav">
      <button id="journey-prev" class="btn btn--secondary">Back</button>
      <button id="journey-next" class="btn btn--primary">Continue</button>
    </div>
  `;
}

/**
 * @description Renders the content panel for a specific step
 * @param {object} step - Step data
 * @param {number} idx - Index
 * @returns {string} HTML string
 */
function renderStepContent(step, idx) {
  return `
    <div class="journey-step" id="step-${idx}" style="display:none;">
      <h3>${sanitizeOutput(step.title)}</h3>
      <p>${sanitizeOutput(step.description)}</p>
      <div class="journey-actions">
        <button class="journey-btn--ask" data-topic="${step.title}">Ask ElectIQ about this</button>
      </div>
    </div>
  `;
}

/**
 * @description Binds navigation and interactive events
 * @param {HTMLElement} container - Mount point
 * @returns {void}
 */
function bindJourneyEvents(container) {
  container.querySelector('#journey-prev').onclick = () => {
    if (currentStep > 0) {
      currentStep--;
      updateJourneyUI(container);
    }
  };

  container.querySelector('#journey-next').onclick = () => {
    if (currentStep < journeyData.length - 1) {
      currentStep++;
      updateJourneyUI(container);
    }
  };

  container.querySelectorAll('.journey-stepper__btn').forEach(btn => {
    btn.onclick = () => {
      currentStep = parseInt(btn.dataset.index, 10);
      updateJourneyUI(container);
    };
  });

  container.querySelectorAll('.journey-btn--ask').forEach(btn => {
    btn.onclick = () => {
      localStorage.setItem('electiq_chat_prefill', `Tell me more about: ${btn.dataset.topic}`);
      window.location.hash = '#/chat';
    };
  });
}

/**
 * @description Updates the visual state of the wizard
 * @param {HTMLElement} container - Mount point
 * @returns {void}
 */
function updateJourneyUI(container) {
  sessionStorage.setItem(SESSION_KEY, currentStep.toString());

  container.querySelectorAll('.journey-step').forEach((el, idx) => {
    el.style.display = idx === currentStep ? 'block' : 'none';
  });

  container.querySelectorAll('.journey-stepper__btn').forEach((el, idx) => {
    el.classList.toggle('active', idx === currentStep);
    el.classList.toggle('completed', idx < currentStep);
  });

  getEl('journey-prev').disabled = currentStep === 0;
  getEl('journey-next').disabled = currentStep === journeyData.length - 1;
}
