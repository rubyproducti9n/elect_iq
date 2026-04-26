/* ═══════════════════════════════════════════════
   ElectIQ — Gemini API Wrapper (v2)
   ─────────────────────────────────────────────
   • Dynamic system prompt with knowledge-base injection
   • Token-bucket rate limiting (10 RPM)
   • Exponential backoff retry (429 / 5xx)
   • Streaming via SSE (askGeminiStream)
   • Suggested-question parsing
   • Structured error objects — never naked throws
   ═══════════════════════════════════════════════ */

import Config from './config.js';
import { getKnowledge, buildKnowledgeContext } from './dataLoader.js';

/* ─────────────────────────────────────────────
   1. TOKEN-BUCKET RATE LIMITER  (10 req / 60 s)
   ───────────────────────────────────────────── */
class SessionRateLimiter {
  constructor(maxTokens = 10, windowMs = 60_000) {
    this.max = maxTokens;
    this.windowMs = windowMs;
  }

  getTimestamps() {
    try {
      const stored = sessionStorage.getItem('electiq_api_timestamps');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  saveTimestamps(timestamps) {
    try {
      sessionStorage.setItem('electiq_api_timestamps', JSON.stringify(timestamps));
    } catch {}
  }

  tryConsume() {
    const now = Date.now();
    let timestamps = this.getTimestamps();
    
    // Prune old timestamps
    timestamps = timestamps.filter(t => now - t < this.windowMs);
    
    if (timestamps.length >= this.max) {
      this.saveTimestamps(timestamps); // save pruned
      return false;
    }
    
    timestamps.push(now);
    this.saveTimestamps(timestamps);
    return true;
  }

  waitSeconds() {
    const now = Date.now();
    let timestamps = this.getTimestamps();
    timestamps = timestamps.filter(t => now - t < this.windowMs);
    
    if (timestamps.length < this.max) return 0;
    
    const oldest = timestamps[0];
    const waitMs = this.windowMs - (now - oldest);
    return Math.ceil(waitMs / 1000);
  }
}

const rateLimiter = new SessionRateLimiter(10, 60_000);

/* ─────────────────────────────────────────────
   2. KNOWLEDGE-BASE LOADER
   ───────────────────────────────────────────── */
let knowledgeContext = '';

/**
 * Pre-load the knowledge base so it is ready for the first chat message.
 * Called once from main.js at DOMContentLoaded.
 */
export async function loadKnowledgeBase() {
  const kb = await getKnowledge();
  if (kb) {
    knowledgeContext = buildKnowledgeContext(kb);
    console.info(`[Gemini] Knowledge base loaded (${knowledgeContext.length} chars)`);
  }
}

/* ─────────────────────────────────────────────
   3. SYSTEM PROMPT (built dynamically)
   ───────────────────────────────────────────── */
const BASE_SYSTEM_PROMPT = `You are ElectIQ, an expert election literacy assistant for India.
You only answer questions about elections, voting, candidates, ECI rules,
and democratic processes. For off-topic queries, politely redirect.
Always structure responses with: a direct answer, then numbered steps
if applicable, then a follow-up suggestion question. Keep answers under
200 words unless a detailed explanation is requested.

End every response with exactly 3 follow-up questions formatted as:
SUGGESTIONS: [q1] | [q2] | [q3]`;

function getSystemPrompt() {
  if (!knowledgeContext) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\nUse the following verified reference data to ground your answers:\n\n${knowledgeContext}`;
}

/* ─────────────────────────────────────────────
   4. SUGGESTION PARSER
   ───────────────────────────────────────────── */
/**
 * Splits the raw Gemini text into the visible answer and
 * an array of follow-up questions (max 3).
 * @param {string} raw - Raw model output
 * @returns {{ text: string, suggestedQuestions: string[] }}
 */
function parseSuggestions(raw) {
  const match = raw.match(/SUGGESTIONS:\s*\[([^\]]+)\]\s*\|\s*\[([^\]]+)\]\s*\|\s*\[([^\]]+)\]/i);
  if (match) {
    const text = raw.slice(0, match.index).trim();
    const suggestedQuestions = [match[1].trim(), match[2].trim(), match[3].trim()];
    return { text, suggestedQuestions };
  }

  // Fallback: try pipe-only format  "SUGGESTIONS: q1 | q2 | q3"
  const fallback = raw.match(/SUGGESTIONS:\s*(.+)/i);
  if (fallback) {
    const text = raw.slice(0, fallback.index).trim();
    const parts = fallback[1].split('|').map((s) => s.replace(/^\[|\]$/g, '').trim()).filter(Boolean);
    return { text, suggestedQuestions: parts.slice(0, 3) };
  }

  return { text: raw.trim(), suggestedQuestions: [] };
}

/* ─────────────────────────────────────────────
   5. EXPONENTIAL BACKOFF RETRY (429 / 5xx)
   ───────────────────────────────────────────── */
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retryable status codes: 429 (rate limit) and 5xx (server errors)
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const jitter = Math.random() * 500;
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 16_000) + jitter;
        console.warn(`[Gemini] ${response.status} — retrying in ${Math.round(waitMs)}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          error: true,
          message: `Gemini API error ${response.status}: ${errorBody.slice(0, 200)}`,
          code: response.status,
        };
      }

      return response;
    } catch (networkError) {
      if (attempt === maxRetries) {
        return {
          error: true,
          message: `Network error: ${networkError.message}. Check your connection.`,
          code: 0,
        };
      }
      const jitter = Math.random() * 500;
      const waitMs = Math.min(500 * Math.pow(2, attempt), 8_000) + jitter;
      console.warn(`[Gemini] Network error — retrying in ${Math.round(waitMs)}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/* ─────────────────────────────────────────────
   6. BUILD CONTENTS ARRAY
   ───────────────────────────────────────────── */
function buildContents(userMessage, history = []) {
  const contents = history.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));
  contents.push({ role: 'user', parts: [{ text: userMessage }] });
  return contents;
}

function buildRequestBody(contents) {
  return {
    system_instruction: {
      parts: [{ text: getSystemPrompt() }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };
}

/* ─────────────────────────────────────────────
   7. askGemini  (standard, non-streaming)
   Returns { text, suggestedQuestions } or
           { error, message, code }
   ───────────────────────────────────────────── */
/**
 * Send a message to Gemini and get a complete response.
 * @param {string} userMessage
 * @param {Array}  history  [{role, content}, …]
 * @returns {Promise<{text: string, suggestedQuestions: string[]} | {error: true, message: string, code: number}>}
 */
export async function askGemini(userMessage, history = []) {
  /* ── Pre-flight checks ── */
  if (!Config.GEMINI_API_KEY) {
    return { error: true, message: 'Gemini API key not configured. Check <meta> tags.', code: 401 };
  }

  if (!rateLimiter.tryConsume()) {
    const wait = rateLimiter.waitSeconds();
    return {
      error: true,
      message: `You're sending messages too quickly. Please wait ${wait} second${wait !== 1 ? 's' : ''} before trying again.`,
      code: 429,
    };
  }

  /* ── Build request ── */
  const contents = buildContents(userMessage, history);
  const url = `${Config.GEMINI_ENDPOINT}/${Config.GEMINI_MODEL}:generateContent`;

  const result = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': Config.GEMINI_API_KEY,
    },
    body: JSON.stringify(buildRequestBody(contents)),
  });

  /* ── fetchWithRetry returned a structured error ── */
  if (result?.error) return result;

  /* ── Parse success response ── */
  try {
    const data = await result.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!raw) {
      // Check for a safety block
      const blockReason = data?.candidates?.[0]?.finishReason;
      if (blockReason === 'SAFETY') {
        return { error: true, message: 'Response blocked by safety filters. Please rephrase your question.', code: 400 };
      }
      return { error: true, message: 'Gemini returned an empty response. Please try again.', code: 204 };
    }

    return parseSuggestions(raw);
  } catch (parseError) {
    return { error: true, message: `Failed to parse Gemini response: ${parseError.message}`, code: 500 };
  }
}

/* ─────────────────────────────────────────────
   8. askGeminiStream  (SSE streaming)
   Calls onChunk(text) for each streamed token.
   Returns { suggestedQuestions } or
           { error, message, code }
   ───────────────────────────────────────────── */
/**
 * Stream a Gemini response token-by-token.
 * @param {string}   userMessage
 * @param {Array}    history
 * @param {Function} onChunk - Called with each text delta
 * @returns {Promise<{suggestedQuestions: string[]} | {error: true, message: string, code: number}>}
 */
export async function askGeminiStream(userMessage, history = [], onChunk) {
  /* ── Pre-flight checks ── */
  if (!Config.GEMINI_API_KEY) {
    return { error: true, message: 'Gemini API key not configured. Check <meta> tags.', code: 401 };
  }

  if (!rateLimiter.tryConsume()) {
    const wait = rateLimiter.waitSeconds();
    return {
      error: true,
      message: `You're sending messages too quickly. Please wait ${wait} second${wait !== 1 ? 's' : ''} before trying again.`,
      code: 429,
    };
  }

  /* ── Build request ── */
  const contents = buildContents(userMessage, history);
  const url = `${Config.GEMINI_ENDPOINT}/${Config.GEMINI_MODEL}:streamGenerateContent?alt=sse`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': Config.GEMINI_API_KEY,
      },
      body: JSON.stringify(buildRequestBody(contents)),
    });
  } catch (networkError) {
    return { error: true, message: `Network error: ${networkError.message}`, code: 0 };
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    return {
      error: true,
      message: `Gemini streaming error ${response.status}: ${errorBody.slice(0, 200)}`,
      code: response.status,
    };
  }

  /* ── Read SSE stream ── */
  let fullText = '';

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events in the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(jsonStr);
          const delta = chunk?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (delta) {
            fullText += delta;
            if (typeof onChunk === 'function') onChunk(delta);
          }
        } catch {
          // Malformed JSON chunk — skip
        }
      }
    }
  } catch (streamError) {
    return { error: true, message: `Stream interrupted: ${streamError.message}`, code: 500 };
  }

  if (!fullText) {
    return { error: true, message: 'Gemini returned an empty streamed response.', code: 204 };
  }

  /* ── Parse suggestions from the accumulated text ── */
  const { suggestedQuestions } = parseSuggestions(fullText);
  return { suggestedQuestions };
}

/* ── Exports ── */
export { rateLimiter, parseSuggestions };
