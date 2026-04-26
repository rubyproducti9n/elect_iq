/* ═══════════════════════════════════════════════
   ElectIQ — Chat UI Controller
   ═══════════════════════════════════════════════ */

import { askGemini } from './gemini.js';
import { sanitizeInput, sanitizeOutput } from './sanitize.js';
import { speakText, stopSpeaking } from './tts.js';
import { logAnalyticsEvent } from './firebase.js';
import { announceToScreenReader } from './accessibility.js';

/* ── State ── */
let chatHistory = [];
let isProcessing = false;

/* ── DOM References ── */
const $ = (sel) => document.querySelector(sel);

function getElements() {
  return {
    messagesContainer: $('#chat-messages'),
    inputField: $('#chat-input'),
    sendButton: $('#chat-send'),
    ttsButton: $('#chat-tts'),
    suggestionsWrap: $('#chat-suggestions'),
  };
}

/* ── Suggestion Chips ── */
const SUGGESTIONS = [
  'How do I register to vote?',
  'What are the steps in an election?',
  'When is the next election?',
  'Explain the Electoral College',
  'What ID do I need to vote?',
  'How do absentee ballots work?',
];

/**
 * Initialize the chat interface.
 */
export function initChat() {
  const els = getElements();
  if (!els.messagesContainer) return;

  renderSuggestions(els);
  bindEvents(els);
  els.inputField?.focus();
}

function renderSuggestions(els) {
  if (!els.suggestionsWrap) return;
  els.suggestionsWrap.innerHTML = SUGGESTIONS.map(
    (text) =>
      `<button class="chat__suggestion" data-suggestion="${text}">${text}</button>`
  ).join('');
}

function bindEvents(els) {
  // Send on click
  els.sendButton?.addEventListener('click', () => handleSend(els));

  // Send on Enter (Shift+Enter for newline)
  els.inputField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(els);
    }
  });

  // Auto-resize textarea
  els.inputField?.addEventListener('input', () => {
    els.inputField.style.height = 'auto';
    els.inputField.style.height = `${Math.min(els.inputField.scrollHeight, 120)}px`;
  });

  // Suggestion chips
  els.suggestionsWrap?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-suggestion]');
    if (btn) {
      els.inputField.value = btn.dataset.suggestion;
      handleSend(els);
    }
  });

  // TTS toggle
  els.ttsButton?.addEventListener('click', () => {
    const lastAiMessage = [...document.querySelectorAll('.message--ai .message__bubble')]
      .pop()?.textContent;
    if (lastAiMessage) speakText(lastAiMessage);
  });
}

/* ── Send Message ── */
async function handleSend(els) {
  if (isProcessing) return;

  const rawInput = els.inputField.value.trim();
  if (!rawInput) return;

  const userMessage = sanitizeInput(rawInput);
  els.inputField.value = '';
  els.inputField.style.height = 'auto';

  // Hide welcome/suggestions on first message
  const welcome = $('.chat__welcome');
  if (welcome) welcome.style.display = 'none';

  // Append user bubble
  appendMessage('user', userMessage, els);
  chatHistory.push({ role: 'user', content: userMessage });

  // Show typing indicator
  const typingEl = showTypingIndicator(els);
  isProcessing = true;
  els.sendButton.disabled = true;

  try {
    const response = await askGemini(userMessage, chatHistory.slice(-20));
    removeTypingIndicator(typingEl);

    appendMessage('ai', response, els);
    chatHistory.push({ role: 'assistant', content: response });

    announceToScreenReader('ElectIQ responded');
    logAnalyticsEvent('chat_message_sent', { questionLength: userMessage.length });
  } catch (error) {
    removeTypingIndicator(typingEl);
    appendMessage('ai', `<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">warning</span> ${error.message}`, els);
    console.error('[Chat]', error);
  } finally {
    isProcessing = false;
    els.sendButton.disabled = false;
    els.inputField.focus();
  }
}

/* ── Message Rendering ── */
function appendMessage(role, text, els) {
  const isUser = role === 'user';
  const messageEl = document.createElement('div');
  messageEl.className = `message message--${isUser ? 'user' : 'ai'}`;
  messageEl.setAttribute('role', 'listitem');

  const sanitizedText = sanitizeOutput(text);

  messageEl.innerHTML = `
    <div class="message__avatar">${isUser ? '<span class="material-symbols-outlined" style="font-size: 20px;">person</span>' : '<span class="material-symbols-outlined" style="font-size: 20px;">how_to_vote</span>'}</div>
    <div>
      <div class="message__bubble">${sanitizedText}</div>
      ${!isUser ? `
        <div class="message__actions">
          <button class="message__action-btn" title="Read aloud" aria-label="Read this response aloud"><span class="material-symbols-outlined" style="font-size: 16px;">volume_up</span></button>
          <button class="message__action-btn" title="Copy" aria-label="Copy response"><span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span></button>
        </div>
      ` : ''}
    </div>
  `;

  // Bind action buttons
  if (!isUser) {
    const [ttsBtn, copyBtn] = messageEl.querySelectorAll('.message__action-btn');
    ttsBtn?.addEventListener('click', () => speakText(text));
    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(text);
      copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">check</span>';
      setTimeout(() => (copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>'), 1500);
    });
  }

  els.messagesContainer.appendChild(messageEl);
  els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
}

function showTypingIndicator(els) {
  const el = document.createElement('div');
  el.className = 'message message--ai';
  el.id = 'typing-indicator';
  el.innerHTML = `
    <div class="message__avatar"><span class="material-symbols-outlined" style="font-size: 20px;">how_to_vote</span></div>
    <div class="typing-indicator">
      <span class="typing-indicator__dot"></span>
      <span class="typing-indicator__dot"></span>
      <span class="typing-indicator__dot"></span>
    </div>
  `;
  els.messagesContainer.appendChild(el);
  els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
  return el;
}

function removeTypingIndicator(el) {
  el?.remove();
}

export { chatHistory };
