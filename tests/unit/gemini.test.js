/* ═══════════════════════════════════════════════
   ElectIQ — Gemini API Unit Tests
   Verifies request construction, parsing, and retries
   ═══════════════════════════════════════════════ */

import { askGemini, askGeminiStream, rateLimiter } from "../../public/assets/js/gemini.js";

const { describe, it, expect, vi, beforeEach } = window;

// Mock global fetch
globalThis.fetch = vi.fn();

describe("askGemini", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Verifies that the correct API endpoint and model are targeted
  it("sends POST to correct Gemini endpoint URL", async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }) });
    await askGemini("test");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("gemini-2.0-flash:generateContent"), expect.any(Object));
  });

  // Verifies that grounding tools (Google Search) are enabled
  it("includes googleSearch tool in request body", async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }) });
    await askGemini("test");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.tools).toContainEqual({ googleSearch: {} });
  });

  // Verifies parsing of SUGGESTIONS block into a clean array
  it("parses SUGGESTIONS: block and returns as array of strings", async () => {
    const raw = "Here is info.\nSUGGESTIONS: What is ECI? | How to vote? | Dates?";
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: raw }] } }] }) });
    const res = await askGemini("test");
    expect(res.suggestedQuestions).toEqual(["What is ECI?", "How to vote?", "Dates?"]);
  });

  // Verifies fallback when suggestions are missing
  it("returns empty suggestions array if SUGGESTIONS: not present", async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "Just text" }] } }] }) });
    const res = await askGemini("test");
    expect(res.suggestedQuestions).toEqual([]);
  });

  // Verifies rate limit handling
  it("returns error object (not throw) on HTTP 429", async () => {
    fetch.mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests" });
    const res = await askGemini("test");
    expect(res.error).toBe(true);
    expect(res.code).toBe(429);
  });

  // Verifies retry logic for 500 errors
  it("retries exactly 3 times on HTTP 500 then returns error", async () => {
    fetch.mockResolvedValue({ ok: false, status: 500 });
    await askGemini("test");
    // Initial + 3 retries = 4 calls
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  // Verifies that client errors (401) do NOT retry to avoid wasting quota
  it("does NOT retry on HTTP 401 (unauthorized)", async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 });
    await askGemini("test");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("rate limiter", () => {
  // Verifies that the session-based rate limiter (10 req / 60s) works
  it("allows exactly 10 requests in window and blocks 11th", async () => {
    // Reset limiter manually for test
    sessionStorage.clear();
    
    // Mock fetch to succeed
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }) });

    // Send 10
    for(let i=0; i<10; i++) {
      await askGemini("test " + i);
    }
    expect(fetch).toHaveBeenCalledTimes(10);

    // 11th should be blocked before fetch
    const res = await askGemini("blocked");
    expect(res.error).toBe(true);
    expect(res.code).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(10);
  });
});
