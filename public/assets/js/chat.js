/* ═══════════════════════════════════════════════
   ElectIQ — Chat UI Controller (v3)
   ─────────────────────────────────────────────
   • Streaming responses via askGeminiStream
   • Voice input (Web Speech API, en-IN)
   • Message ratings (👍👎 → Firestore)
   • Auto-scroll with pause detection
   • Markdown rendering + DOMPurify
   • Dynamic follow-up suggestion chips
   ═══════════════════════════════════════════════ */

import { askGemini, askGeminiStream } from './gemini.js';
import { sanitizeInput, sanitizeOutput } from './sanitize.js';
import { logAnalyticsEvent, saveMessage, initSession, rateMessage } from './firebase.js';
import { announceToScreenReader } from './accessibility.js';

/* ── State ── */
let chatHistory = [];
let isProcessing = false;
let userHasScrolledUp = false;
let recognition = null; // Web Speech API instance

/* ── DOM References ── */
const $ = (sel) => document.querySelector(sel);

function getElements() {
  return {
    messagesContainer: $('#chat-messages'),
    inputField:        $('#chat-input'),
    sendButton:        $('#send-btn'),
    micButton:         $('#mic-btn'),
    ttsButton:         $('#chat-tts'),
    clearButton:       $('#chat-clear'),
    welcomeSection:    $('#chat-welcome'),
    suggestionsWrap:   $('#chat-suggestions'),
    suggestionsRow:    $('#suggestions-row'),
    typingIndicator:   $('#typing-indicator'),
    statusLabel:       $('#chat-status'),
  };
}

/* ── Quick-Start Suggestions ── */
const WELCOME_SUGGESTIONS = [
  'How do I register to vote?',
  'What is ECI?',
  'Election phases explained',
  'How is a winner declared?',
  'What is NOTA?',
];

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
export function initChat() {
  const els = getElements();
  if (!els.messagesContainer) return;

  // Initialize Firestore session (non-blocking)
  initSession().catch((err) =>
    console.warn('[Chat] Session init skipped:', err.message)
  );

  renderWelcomeSuggestions(els);
  bindEvents(els);
  updateTTSButtonState(els);
  initVoiceInput(els);
  els.inputField?.focus();

  // Check for pre-filled chat query from other pages
  const prefill = localStorage.getItem('electiq_chat_prefill');
  if (prefill && els.inputField) {
    els.inputField.value = prefill;
    els.inputField.style.height = 'auto';
    els.inputField.style.height = `${Math.min(els.inputField.scrollHeight, 120)}px`;
    localStorage.removeItem('electiq_chat_prefill');
  }
}

/* ═══════════════════════════════════════════════
   SUGGESTION CHIPS
   ═══════════════════════════════════════════════ */

function renderWelcomeSuggestions(els) {
  if (!els.suggestionsWrap) return;
  els.suggestionsWrap.innerHTML = WELCOME_SUGGESTIONS.map(
    (text) =>
      `<button class="chat-suggestion" data-suggestion="${text}">
        <span class="material-symbols-outlined" style="font-size:16px;">chat_bubble_outline</span>
        ${text}
      </button>`
  ).join('');
}

function renderFollowUpSuggestions(questions, els) {
  if (!questions?.length || !els.suggestionsRow) return;

  els.suggestionsRow.innerHTML = questions.map(
    (q) =>
      `<button class="chat-suggestion chat-suggestion--follow" data-suggestion="${q}">${q}</button>`
  ).join('');

  els.suggestionsRow.style.display = 'flex';

  // Bind clicks
  els.suggestionsRow.querySelectorAll('[data-suggestion]').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.inputField.value = btn.dataset.suggestion;
      logAnalyticsEvent('suggested_question_clicked', { question_text: btn.dataset.suggestion });
      els.suggestionsRow.innerHTML = '';
      els.suggestionsRow.style.display = 'none';
      handleSend(els);
    }, { once: true });
  });
}

function clearFollowUpSuggestions(els) {
  if (els.suggestionsRow) {
    els.suggestionsRow.innerHTML = '';
    els.suggestionsRow.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════
   EVENT BINDING
   ═══════════════════════════════════════════════ */

function bindEvents(els) {
  // Send
  els.sendButton?.addEventListener('click', () => handleSend(els));

  // Keyboard: Enter sends, Shift+Enter newline, Escape clears
  els.inputField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(els);
    }
    if (e.key === 'Escape') {
      els.inputField.value = '';
      els.inputField.style.height = 'auto';
    }
  });

  // Auto-resize textarea
  els.inputField?.addEventListener('input', () => {
    els.inputField.style.height = 'auto';
    els.inputField.style.height = `${Math.min(els.inputField.scrollHeight, 120)}px`;
  });

  // Welcome suggestion chips
  els.suggestionsWrap?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-suggestion]');
    if (btn) {
      els.inputField.value = btn.dataset.suggestion;
      logAnalyticsEvent('suggested_question_clicked', { question_text: btn.dataset.suggestion });
      handleSend(els);
    }
  });

  // TTS button: click = speak last message
  els.ttsButton?.addEventListener('click', () => {
    const lastAiMessage = [...document.querySelectorAll('.message--bot .message__text')]
      .pop()?.textContent;
    if (lastAiMessage) speakText(lastAiMessage);
  });

  // TTS long-press: toggle on/off
  let ttsLongPress = null;
  els.ttsButton?.addEventListener('pointerdown', () => {
    ttsLongPress = setTimeout(async () => {
      const { toggleTTS, isTTSEnabled } = await import('./tts.js');
      toggleTTS();
      updateTTSButtonState(els);
      announceToScreenReader(isTTSEnabled() ? 'Text to speech enabled' : 'Text to speech disabled');
      ttsLongPress = null;
    }, 600);
  });
  els.ttsButton?.addEventListener('pointerup', () => {
    if (ttsLongPress) clearTimeout(ttsLongPress);
  });

  // Clear chat
  els.clearButton?.addEventListener('click', () => {
    chatHistory = [];
    els.messagesContainer.innerHTML = '';
    clearFollowUpSuggestions(els);
    // Re-inject welcome
    els.messagesContainer.innerHTML = buildWelcomeHTML();
    renderWelcomeSuggestions(els);
    // Re-bind welcome suggestions
    const newSuggWrap = $('#chat-suggestions');
    newSuggWrap?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-suggestion]');
      if (btn) {
        els.inputField.value = btn.dataset.suggestion;
        handleSend(els);
      }
    });
  });

  // Auto-scroll detection
  els.messagesContainer?.addEventListener('scroll', () => {
    const el = els.messagesContainer;
    const threshold = 80;
    userHasScrolledUp = (el.scrollHeight - el.scrollTop - el.clientHeight) > threshold;
  });
}

/* ═══════════════════════════════════════════════
   VOICE INPUT (Web Speech API)
   ═══════════════════════════════════════════════ */

function initVoiceInput(els) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    // Hide mic button if not supported
    if (els.micButton) els.micButton.style.display = 'none';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    els.inputField.value = transcript;
    els.inputField.dispatchEvent(new Event('input')); // trigger resize
    logAnalyticsEvent('voice_input_used', {});
  };

  recognition.onstart = () => {
    els.micButton?.classList.add('chat-input__mic-btn--recording');
    if (els.statusLabel) els.statusLabel.textContent = 'Listening…';
  };

  recognition.onend = () => {
    els.micButton?.classList.remove('chat-input__mic-btn--recording');
    if (els.statusLabel) els.statusLabel.textContent = 'Online';
  };

  recognition.onerror = (e) => {
    console.warn('[Voice] Recognition error:', e.error);
    els.micButton?.classList.remove('chat-input__mic-btn--recording');
    if (els.statusLabel) els.statusLabel.textContent = 'Online';
  };

  els.micButton?.addEventListener('click', () => {
    if (els.micButton.classList.contains('chat-input__mic-btn--recording')) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });
}

/* ═══════════════════════════════════════════════
   SEND MESSAGE
   ═══════════════════════════════════════════════ */

async function handleSend(els) {
  if (isProcessing) return;

  const rawInput = els.inputField.value.trim();
  if (!rawInput) return;

  // Max input length validation
  if (rawInput.length > 500) {
    if (window.showToast) {
      window.showToast('Message exceeds 500 characters limit.', 'error');
    } else {
      alert('Message exceeds 500 characters limit.');
    }
    return;
  }

  let userMessage;
  try {
    userMessage = sanitizeInput(rawInput);
  } catch (err) {
    console.error(err);
    return;
  }

  els.inputField.value = '';
  els.inputField.style.height = 'auto';

  // Hide welcome on first message
  const welcome = els.welcomeSection || $('#chat-welcome');
  if (welcome) welcome.style.display = 'none';

  // Clear previous follow-up chips
  clearFollowUpSuggestions(els);

  // Append user bubble
  appendUserMessage(userMessage, els);
  chatHistory.push({ role: 'user', content: userMessage });
  
  try {
    await saveMessage('user', userMessage);
  } catch (err) {
    console.error('[Firebase] Save failed:', err.message);
  }

  // Show typing indicator
  showTypingIndicator(els);
  isProcessing = true;
  els.sendButton.disabled = true;

  try {
    // Stream response
    await handleStreamingSend(userMessage, els);
  } catch (error) {
    logAnalyticsEvent('app_error', { message: error.message, location: 'handleSend' });
    const { textEl } = createBotBubble(els);
    textEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;color:var(--clr-error,#ef4444);">error</span> Something went wrong. Please try again later.`;
  } finally {
    hideTypingIndicator(els);
    
    // Debounce: Keep button disabled for 500ms
    setTimeout(() => {
      isProcessing = false;
      els.sendButton.disabled = false;
      els.inputField.focus();
    }, 500);
  }
}

/* ── Streaming send ── */
async function handleStreamingSend(userMessage, els) {
  // Wait 500ms before switching from typing dots to streaming bubble
  await new Promise((r) => setTimeout(r, 500));

  // Create streaming bubble
  hideTypingIndicator(els);
  const { messageEl, textEl } = createBotBubble(els);

  let fullText = '';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const result = await askGeminiStream(userMessage, chatHistory.slice(-20), (chunk) => {
    fullText += chunk;
    if (!prefersReducedMotion) {
      textEl.innerHTML = sanitizeOutput(fullText);
      autoScroll(els);
    }
  });

  if (result.error) {
    if (result.code === 429 && window.showToast) {
      window.showToast(result.message, 'error');
      messageEl.remove();
      return;
    }
    textEl.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;vertical-align:middle;color:var(--clr-error,#ef4444);">error</span> ${result.message}`;
    console.error('[Chat]', result.message);
    return;
  }

  // Clean text (strip SUGGESTIONS line)
  const cleanText = stripSuggestionsLine(fullText);
  textEl.innerHTML = sanitizeOutput(cleanText);

  chatHistory.push({ role: 'assistant', content: cleanText });
  saveMessage('assistant', cleanText).catch(() => {});

  // Bind action buttons (rate, TTS, copy)
  bindMessageActions(messageEl, cleanText);

  // Show follow-up suggestion chips
  if (result.suggestedQuestions?.length) {
    renderFollowUpSuggestions(result.suggestedQuestions, els);
  }

  autoScroll(els);
  announceToScreenReader('ElectIQ responded');
  logAnalyticsEvent('chat_message_sent', { question_length: userMessage.length });
}

function stripSuggestionsLine(raw) {
  return raw.replace(/SUGGESTIONS:\s*.+/i, '').trim();
}

/* ═══════════════════════════════════════════════
   MESSAGE RENDERING
   ═══════════════════════════════════════════════ */

function appendUserMessage(text, els) {
  const initial = (text.charAt(0) || 'U').toUpperCase();
  const messageEl = document.createElement('div');
  messageEl.className = 'message message--user';
  messageEl.setAttribute('role', 'listitem');

  messageEl.innerHTML = `
    <div class="message__avatar message__avatar--user">${initial}</div>
    <div class="message__bubble">
      <div class="message__text">${sanitizeOutput(text)}</div>
      <div class="message__timestamp">${formatTime()}</div>
    </div>
  `;

  els.messagesContainer.appendChild(messageEl);
  autoScroll(els);
}

function createBotBubble(els) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message message--bot';
  messageEl.setAttribute('role', 'listitem');

  messageEl.innerHTML = `
    <div class="message__avatar message__avatar--bot">
      <span class="material-symbols-outlined" style="font-size:20px;">smart_toy</span>
    </div>
    <div class="message__bubble">
      <div class="message__text"></div>
      <div class="message__actions">
        <button class="message__action-btn message__action-btn--rate-up" title="Helpful" aria-label="Rate as helpful">
          <span class="material-symbols-outlined" style="font-size:16px;">thumb_up</span>
        </button>
        <button class="message__action-btn message__action-btn--rate-down" title="Not helpful" aria-label="Rate as not helpful">
          <span class="material-symbols-outlined" style="font-size:16px;">thumb_down</span>
        </button>
        <button class="message__action-btn message__action-btn--tts" title="Read aloud" aria-label="Read this response aloud">
          <span class="material-symbols-outlined" style="font-size:16px;">volume_up</span>
        </button>
        <button class="message__action-btn message__action-btn--copy" title="Copy" aria-label="Copy response">
          <span class="material-symbols-outlined" style="font-size:16px;">content_copy</span>
        </button>
      </div>
      <div class="message__timestamp">${formatTime()}</div>
    </div>
  `;

  const textEl = messageEl.querySelector('.message__text');
  els.messagesContainer.appendChild(messageEl);
  autoScroll(els);

  return { messageEl, textEl };
}

/* ── Bind action buttons on a bot message ── */
function bindMessageActions(messageEl, plainText) {
  const rateUpBtn   = messageEl.querySelector('.message__action-btn--rate-up');
  const rateDownBtn = messageEl.querySelector('.message__action-btn--rate-down');
  const ttsBtn      = messageEl.querySelector('.message__action-btn--tts');
  const copyBtn     = messageEl.querySelector('.message__action-btn--copy');

  // Rating
  const handleRate = async (rating) => {
    const msgId = await saveMessage('assistant', plainText).catch(() => null);
    if (msgId) rateMessage(msgId, rating).catch(() => {});

    // Replace rating buttons with feedback text
    const actionsEl = messageEl.querySelector('.message__actions');
    if (rateUpBtn) rateUpBtn.remove();
    if (rateDownBtn) rateDownBtn.remove();

    const feedbackEl = document.createElement('span');
    feedbackEl.className = 'message__feedback';
    feedbackEl.textContent = 'Thanks for your feedback!';
    actionsEl?.prepend(feedbackEl);
  };

  rateUpBtn?.addEventListener('click', () => handleRate(1), { once: true });
  rateDownBtn?.addEventListener('click', () => handleRate(-1), { once: true });

  // TTS
  ttsBtn?.addEventListener('click', async () => {
    const { speakText } = await import('./tts.js');
    speakText(plainText);
  });

  // Copy
  copyBtn?.addEventListener('click', () => {
    navigator.clipboard.writeText(plainText);
    copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">check</span>';
    setTimeout(() => {
      copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">content_copy</span>';
    }, 1500);
  });
}

/* ═══════════════════════════════════════════════
   TYPING INDICATOR
   ═══════════════════════════════════════════════ */

function showTypingIndicator(els) {
  const indicator = els.typingIndicator || $('#typing-indicator');
  if (indicator) indicator.style.display = 'flex';
  autoScroll(els);
}

function hideTypingIndicator(els) {
  const indicator = els.typingIndicator || $('#typing-indicator');
  if (indicator) indicator.style.display = 'none';
}

/* ═══════════════════════════════════════════════
   AUTO-SCROLL
   ═══════════════════════════════════════════════ */

function autoScroll(els) {
  if (userHasScrolledUp) return;
  const container = els.messagesContainer;
  if (container) {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }
}

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

function formatTime() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function updateTTSButtonState(els) {
  if (!els.ttsButton) return;
  updateTTSUI(els.ttsButton);
}

async function updateTTSUI(btn) {
  if (!btn) return;
  const { isTTSEnabled } = await import('./tts.js');
  const enabled = isTTSEnabled();
  btn.classList.toggle('chat-header__btn--active', enabled);
  btn.setAttribute('title', enabled ? 'TTS on (long-press to disable)' : 'TTS off (long-press to enable)');
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = enabled ? 'volume_up' : 'volume_off';
}

function buildWelcomeHTML() {
  return `
    <div class="chat-welcome" id="chat-welcome">
      <div class="chat-welcome__illustration">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="120" height="120" aria-hidden="true">
          <defs>
            <linearGradient id="boxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#1a6fef;stop-opacity:0.9"/>
              <stop offset="100%" style="stop-color:#6c3cef;stop-opacity:0.9"/>
            </linearGradient>
          </defs>
          <rect x="40" y="70" width="120" height="100" rx="12" fill="url(#boxGrad)" opacity="0.85"/>
          <rect x="70" y="65" width="60" height="8" rx="4" fill="#0d47a1"/>
          <g class="chat-welcome__ballot">
            <rect x="80" y="30" width="40" height="50" rx="4" fill="#fff" opacity="0.95"/>
            <line x1="88" y1="45" x2="112" y2="45" stroke="#1a6fef" stroke-width="2" stroke-linecap="round"/>
            <line x1="88" y1="52" x2="105" y2="52" stroke="#6c3cef" stroke-width="2" stroke-linecap="round"/>
            <path d="M90 65 l3 3 l6-6" stroke="#22c55e" stroke-width="2" fill="none" stroke-linecap="round"/>
          </g>
          <ellipse cx="100" cy="180" rx="50" ry="6" fill="#000" opacity="0.08"/>
        </svg>
      </div>
      <h2 class="chat-welcome__title">Ask me anything about elections!</h2>
      <p class="chat-welcome__subtitle">I'm your AI-powered guide to India's democratic process.</p>
      <div class="chat-suggestions" id="chat-suggestions"></div>
    </div>
  `;
}

export { chatHistory };
