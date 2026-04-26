/* ═══════════════════════════════════════════════
   ElectIQ — Voter Journey (Wizard)
   ─────────────────────────────────────────────
   • Interactive step-by-step guide based on JSON data
   • Progress saved in sessionStorage
   • Keyboard navigation
   • "Ask ElectIQ" pre-fills chat
   ═══════════════════════════════════════════════ */

import { sanitizeOutput } from './sanitize.js';

let journeyData = [];
let currentStep = 0;
const SESSION_KEY = 'electiq_journey_step';

/**
 * Initialize and render the Voter Journey page.
 * @param {string} containerId - DOM ID of the container
 */
export async function initJourney(containerId = 'journey-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const response = await fetch('/assets/data/election-knowledge.json');
    const data = await response.json();
    journeyData = data.voter_journey || [];

    // Load saved progress
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved !== null) {
      currentStep = parseInt(saved, 10);
      if (currentStep < 0 || currentStep >= journeyData.length) currentStep = 0;
    }

    renderJourney(container);
    bindEvents(container);
    updateActiveStep(container);
  } catch (error) {
    console.error('[Journey] Failed to load data:', error);
    container.innerHTML = `<p class="error-text">Failed to load journey data.</p>`;
  }
}

function renderJourney(container) {
  const html = `
    <div class="journey-header">
      <h2 class="journey-header__title">How to Vote in India</h2>
      <p class="journey-header__subtitle">A step-by-step guide for every citizen.</p>
    </div>

    <!-- Stepper Navigation -->
    <div class="journey-stepper" role="tablist" aria-label="Journey steps">
      <div class="journey-stepper__line"></div>
      ${journeyData.map((step, index) => `
        <button class="journey-stepper__btn" 
                role="tab" 
                aria-selected="${index === currentStep}"
                aria-controls="journey-step-${index}"
                id="journey-tab-${index}"
                data-index="${index}">
          <span class="journey-stepper__circle">${index + 1}</span>
          <span class="journey-stepper__label">${sanitizeOutput(step.title)}</span>
        </button>
      `).join('')}
    </div>

    <!-- Step Content Container -->
    <div class="journey-content-area">
      ${journeyData.map((step, index) => renderStepContent(step, index)).join('')}
    </div>

    <!-- Mobile/Bottom Navigation -->
    <div class="journey-nav">
      <button class="journey-nav__btn" id="journey-prev" aria-label="Previous step">
        <span class="material-symbols-outlined">arrow_back</span> Previous
      </button>
      <button class="journey-nav__btn journey-nav__btn--primary" id="journey-next" aria-label="Next step">
        Next <span class="material-symbols-outlined">arrow_forward</span>
      </button>
    </div>
  `;
  container.innerHTML = html;
}

function renderStepContent(step, index) {
  const docsList = (step.documents_needed || []).map(d => `<span class="journey-chip">${sanitizeOutput(d)}</span>`).join('');
  
  return `
    <div class="journey-step" 
         id="journey-step-${index}" 
         role="tabpanel" 
         aria-labelledby="journey-tab-${index}"
         ${index !== currentStep ? 'hidden' : ''}>
      <div class="journey-step__inner">
        <div class="journey-step__header">
          <div class="journey-step__number">${index + 1}</div>
          <h3 class="journey-step__title">${sanitizeOutput(step.title)}</h3>
        </div>
        
        <p class="journey-step__desc">${sanitizeOutput(step.description)}</p>
        
        ${docsList ? `
          <div class="journey-step__section">
            <h4 class="journey-step__section-title">
              <span class="material-symbols-outlined" style="font-size: 18px;">folder_open</span>
              Documents needed
            </h4>
            <div class="journey-chip-group">${docsList}</div>
          </div>
        ` : ''}

        ${step.offline_process ? `
          <div class="journey-step__section">
             <h4 class="journey-step__section-title">
              <span class="material-symbols-outlined" style="font-size: 18px;">location_city</span>
              Offline Process
            </h4>
            <p class="journey-step__offline">${sanitizeOutput(step.offline_process)}</p>
          </div>
        ` : ''}

        <div class="journey-step__actions">
          ${step.online_url ? `
            <a href="${sanitizeOutput(step.online_url)}" target="_blank" rel="noopener noreferrer" class="journey-btn journey-btn--external">
              Do it online <span class="material-symbols-outlined">open_in_new</span>
            </a>
          ` : ''}
          <button class="journey-btn journey-btn--ask" data-ask="${sanitizeOutput(step.title)}">
            Ask ElectIQ about this <span class="material-symbols-outlined">chat_bubble</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindEvents(container) {
  const stepperBtns = container.querySelectorAll('.journey-stepper__btn');
  const prevBtn = container.querySelector('#journey-prev');
  const nextBtn = container.querySelector('#journey-next');

  // Tab clicks
  stepperBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentStep = parseInt(btn.dataset.index, 10);
      updateActiveStep(container);
    });
  });

  // Prev / Next
  prevBtn?.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      updateActiveStep(container);
    }
  });

  nextBtn?.addEventListener('click', () => {
    if (currentStep < journeyData.length - 1) {
      currentStep++;
      updateActiveStep(container);
    }
  });

  // Keyboard navigation
  container.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      if (currentStep > 0) {
        currentStep--;
        updateActiveStep(container);
      }
    } else if (e.key === 'ArrowRight') {
      if (currentStep < journeyData.length - 1) {
        currentStep++;
        updateActiveStep(container);
      }
    }
  });

  // Ask ElectIQ
  container.querySelectorAll('.journey-btn--ask').forEach(btn => {
    btn.addEventListener('click', () => {
      const topic = btn.dataset.ask;
      localStorage.setItem('electiq_chat_prefill', `Tell me more about the step: ${topic}`);
      window.location.hash = '#/chat';
    });
  });
}

function updateActiveStep(container) {
  // Save progress
  try {
    sessionStorage.setItem(SESSION_KEY, currentStep.toString());
  } catch (e) { /* ignore */ }

  const maxStep = journeyData.length - 1;

  // Update tabs
  container.querySelectorAll('.journey-stepper__btn').forEach((btn, idx) => {
    const isActive = idx === currentStep;
    const isCompleted = idx < currentStep;
    btn.setAttribute('aria-selected', isActive);
    btn.classList.toggle('journey-stepper__btn--active', isActive);
    btn.classList.toggle('journey-stepper__btn--completed', isCompleted);
  });

  // Update panels
  container.querySelectorAll('.journey-step').forEach((panel, idx) => {
    if (idx === currentStep) {
      panel.removeAttribute('hidden');
      panel.classList.add('journey-step--active');
    } else {
      panel.setAttribute('hidden', '');
      panel.classList.remove('journey-step--active');
    }
  });

  // Update Prev/Next buttons
  const prevBtn = container.querySelector('#journey-prev');
  const nextBtn = container.querySelector('#journey-next');
  if (prevBtn) prevBtn.disabled = currentStep === 0;
  if (nextBtn) nextBtn.disabled = currentStep === maxStep;
}
