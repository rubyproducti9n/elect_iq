/* ═══════════════════════════════════════════════
   ElectIQ — Gemini API Tests
   ═══════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config
vi.mock('../assets/js/config.js', () => ({
  default: {
    GEMINI_API_KEY: 'test-key-123',
    GEMINI_MODEL: 'gemini-2.0-flash',
    GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models',
    RATE_LIMIT_RPM: 30,
  },
}));

// Mock sanitize
vi.mock('../assets/js/sanitize.js', () => ({
  sanitizeOutput: (text) => text,
}));

describe('Gemini API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('should send correctly formatted request to Gemini endpoint', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [
            { content: { parts: [{ text: 'Test response' }] } },
          ],
        }),
    });

    const { askGemini } = await import('../assets/js/gemini.js');
    const response = await askGemini('How do I vote?');

    expect(response).toBe('Test response');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('gemini-2.0-flash');
    expect(url).toContain('test-key-123');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.contents).toBeDefined();
    expect(body.generationConfig).toBeDefined();
    expect(body.safetySettings).toBeDefined();
  });

  it('should return fallback message when no candidates', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ candidates: [] }),
    });

    const { askGemini } = await import('../assets/js/gemini.js');
    const response = await askGemini('Test');

    expect(response).toContain('unable to generate');
  });

  it('should include chat history in request', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        }),
    });

    const { askGemini } = await import('../assets/js/gemini.js');
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    await askGemini('Follow up', history);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    // System prompt + system ack + 2 history + current message = 5
    expect(body.contents.length).toBeGreaterThanOrEqual(5);
  });
});

describe('RateLimiter', () => {
  it('should allow requests under the limit', async () => {
    const { rateLimiter } = await import('../assets/js/gemini.js');
    expect(rateLimiter.canProceed()).toBe(true);
  });
});
