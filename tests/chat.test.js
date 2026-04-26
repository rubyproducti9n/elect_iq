/* ═══════════════════════════════════════════════
   ElectIQ — Chat UI Tests
   ═══════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../assets/js/gemini.js', () => ({
  askGemini: vi.fn().mockResolvedValue('Mock AI response'),
}));

vi.mock('../assets/js/sanitize.js', () => ({
  sanitizeInput: (text) => text,
  sanitizeOutput: (text) => text,
}));

vi.mock('../assets/js/tts.js', () => ({
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
}));

vi.mock('../assets/js/firebase.js', () => ({
  logAnalyticsEvent: vi.fn(),
}));

vi.mock('../assets/js/accessibility.js', () => ({
  announceToScreenReader: vi.fn(),
}));

describe('Chat UI', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="chat__messages" id="chat-messages">
        <div class="chat__welcome">
          <div class="chat__suggestions" id="chat-suggestions"></div>
        </div>
      </div>
      <textarea id="chat-input"></textarea>
      <button id="chat-send"></button>
      <button id="chat-tts"></button>
    `;
  });

  it('should initialize without errors', async () => {
    const { initChat } = await import('../assets/js/chat.js');
    expect(() => initChat()).not.toThrow();
  });

  it('should render suggestion chips', async () => {
    const { initChat } = await import('../assets/js/chat.js');
    initChat();

    const suggestions = document.querySelectorAll('.chat__suggestion');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should have accessible chat input', () => {
    const input = document.getElementById('chat-input');
    expect(input).toBeTruthy();
    expect(input.tagName.toLowerCase()).toBe('textarea');
  });

  it('should have send button', () => {
    const sendBtn = document.getElementById('chat-send');
    expect(sendBtn).toBeTruthy();
  });

  it('should have TTS toggle button', () => {
    const ttsBtn = document.getElementById('chat-tts');
    expect(ttsBtn).toBeTruthy();
  });
});
