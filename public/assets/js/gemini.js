/* ═══════════════════════════════════════════════
   ElectIQ — Gemini API Module
   Handles AI generation, news retrieval, and doc decoding
   ═══════════════════════════════════════════════ */

import Config from './config.js';
import { getKnowledge, buildKnowledgeContext } from './dataLoader.js';
import { serviceStatus } from './serviceStatus.js';
import { ok, fail, timed } from './utils.js';
import { RATE_LIMIT, GEMINI, STORAGE_KEYS, ERROR_CODES } from './constants.js';

/* ── Module State ── */
let knowledgeContext = '';
const memoCache = new Map();

/**
 * @description Lazy-loaded configuration getter (overridden by main.js)
 * @returns {{ geminiMaxTokens: number }}
 */
let _getConfig = () => ({ geminiMaxTokens: GEMINI.MAX_TOKENS });

/**
 * @description Injects a config getter function into the module
 * @param {Function} fn - Function that returns the current config
 * @returns {void}
 */
export function setConfigGetter(fn) { 
  _getConfig = fn; 
}

/* ─────────────────────────────────────────────
   1. TOKEN-BUCKET RATE LIMITER
   ───────────────────────────────────────────── */

/**
 * @description Manages API request limits using a sliding window in sessionStorage
 * @class SessionRateLimiter
 */
class SessionRateLimiter {
  constructor(maxTokens = RATE_LIMIT.MAX_REQUESTS, windowMs = RATE_LIMIT.WINDOW_MS) {
    this.max = maxTokens;
    this.windowMs = windowMs;
  }

  /**
   * @description Retrieves stored request timestamps
   * @returns {number[]} Array of timestamps
   */
  getTimestamps() {
    try {
      const stored = sessionStorage.getItem('electiq_api_timestamps');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * @description Persists request timestamps
   * @param {number[]} timestamps - Array of timestamps
   * @returns {void}
   */
  saveTimestamps(timestamps) {
    try {
      sessionStorage.setItem('electiq_api_timestamps', JSON.stringify(timestamps));
    } catch {}
  }

  /**
   * @description Attempts to consume a token from the bucket
   * @returns {boolean} True if request is allowed
   */
  tryConsume() {
    const now = Date.now();
    let timestamps = this.getTimestamps();
    
    // Prune timestamps older than the window to free up tokens
    timestamps = timestamps.filter(t => now - t < this.windowMs);
    
    if (timestamps.length >= this.max) {
      this.saveTimestamps(timestamps);
      return false;
    }
    
    timestamps.push(now);
    this.saveTimestamps(timestamps);
    return true;
  }

  /**
   * @description Calculates seconds remaining until a token becomes available
   * @returns {number} Wait time in seconds
   */
  waitSeconds() {
    const now = Date.now();
    let timestamps = this.getTimestamps();
    timestamps = timestamps.filter(t => now - t < this.windowMs);
    
    if (timestamps.length < this.max) return 0;
    
    const oldest = timestamps[0];
    const waitMs = this.windowMs - (now - oldest);
    return Math.ceil(waitMs / 1000);
  }

  /**
   * @description Resets the rate limiter for testing purposes
   * @returns {void}
   */
  reset() {
    sessionStorage.removeItem('electiq_api_timestamps');
  }
}

const rateLimiter = new SessionRateLimiter();

/* ─────────────────────────────────────────────
   2. KNOWLEDGE-BASE LOADER
   ───────────────────────────────────────────── */

/**
 * @description Loads and processes the election knowledge base into a context string
 * @returns {Promise<Result<string>>} The processed context or failure
 */
export async function loadKnowledgeBase() {
  return await timed("knowledge_base_load", async () => {
    // Check sessionStorage cache first to prevent redundant network calls
    const cached = sessionStorage.getItem(STORAGE_KEYS.KNOWLEDGE_BASE);
    if (cached) {
      knowledgeContext = cached;
      return ok(knowledgeContext);
    }

    const kbRes = await getKnowledge();
    if (kbRes.ok) {
      knowledgeContext = buildKnowledgeContext(kbRes.value);
      sessionStorage.setItem(STORAGE_KEYS.KNOWLEDGE_BASE, knowledgeContext);
      console.info(`[Gemini] Knowledge base loaded (${knowledgeContext.length} chars)`);
      return ok(knowledgeContext);
    }
    return fail(ERROR_CODES.NOT_FOUND, "Could not load knowledge base.");
  });
}

/* ─────────────────────────────────────────────
   3. SYSTEM PROMPT
   ───────────────────────────────────────────── */

const BASE_SYSTEM_PROMPT = `You are ElectIQ, an expert election literacy assistant for India.
You only answer questions about elections, voting, candidates, ECI rules,
and democratic processes. For off-topic queries, politely redirect.
Always structure responses with: a direct answer, then numbered steps
if applicable, then a follow-up suggestion question. Keep answers under
200 words unless a detailed explanation is requested.

End every response with exactly 3 follow-up questions formatted as:
SUGGESTIONS: [q1] | [q2] | [q3]`;

/**
 * @description Builds the final system prompt including injected knowledge context
 * @returns {string} The complete system prompt
 */
function getSystemPrompt() {
  if (!knowledgeContext) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\nUse the following verified reference data to ground your answers:\n\n${knowledgeContext}`;
}

/* ─────────────────────────────────────────────
   4. SUGGESTION PARSER
   ───────────────────────────────────────────── */

/**
 * @description Extracts suggested follow-up questions from model output
 * @param {string} raw - The raw text from Gemini
 * @returns {{ text: string, suggestedQuestions: string[] }} Parsed content
 */
function parseSuggestions(raw) {
  const match = raw.match(/SUGGESTIONS:\s*\[([^\]]+)\]\s*\|\s*\[([^\]]+)\]\s*\|\s*\[([^\]]+)\]/i);
  if (match) {
    const text = raw.slice(0, match.index).trim();
    const suggestedQuestions = [match[1].trim(), match[2].trim(), match[3].trim()];
    return { text, suggestedQuestions };
  }

  const fallback = raw.match(/SUGGESTIONS:\s*(.+)/i);
  if (fallback) {
    const text = raw.slice(0, fallback.index).trim();
    const parts = fallback[1].split('|').map((s) => s.replace(/^\[|\]$/g, '').trim()).filter(Boolean);
    return { text, suggestedQuestions: parts.slice(0, 3) };
  }

  return { text: raw.trim(), suggestedQuestions: [] };
}

/* ─────────────────────────────────────────────
   5. FETCH WITH RETRY
   ───────────────────────────────────────────── */

/**
 * @description Performs a fetch with exponential backoff for retryable errors
 * @param {string} url - Target URL
 * @param {object} options - Fetch options
 * @param {number} [maxRetries] - Max number of attempts (default: 3)
 * @returns {Promise<Result<Response>>} The response or failure
 */
async function fetchWithRetry(url, options, maxRetries = RATE_LIMIT.RETRY_ATTEMPTS) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on rate limit (429) or server errors (5xx)
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const jitter = Math.random() * 500;
        const waitMs = Math.min(RATE_LIMIT.RETRY_BASE_DELAY_MS * Math.pow(2, attempt), 16_000) + jitter;
        console.warn(`[Gemini] ${response.status} — retrying in ${Math.round(waitMs)}ms (${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        return fail(`${ERROR_CODES.HTTP}_${response.status}`, `API error: ${response.status}`);
      }

      return ok(response);
    } catch (err) {
      if (attempt === maxRetries) return fail(ERROR_CODES.NETWORK, "Network connection failure.");
      await new Promise((r) => setTimeout(r, RATE_LIMIT.RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
    }
  }
}

/* ─────────────────────────────────────────────
   6. REQUEST BUILDERS
   ───────────────────────────────────────────── */

/**
 * @description Builds the contents array for the Gemini API
 * @param {string} userMessage - The current user input
 * @param {Array} history - Previous messages [{role, content}]
 * @returns {Array} Formatted contents array
 */
function buildContents(userMessage, history = []) {
  const contents = history.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));
  contents.push({ role: 'user', parts: [{ text: userMessage }] });
  return contents;
}

/**
 * @description Constructs the full request body for Gemini
 * @param {Array} contents - The contents array
 * @param {string} [extraSystemPrefix] - Optional sentiment-based instructions
 * @returns {object} The request payload
 */
function buildRequestBody(contents, extraSystemPrefix = '') {
  const cfg = _getConfig();
  const systemText = extraSystemPrefix
    ? `${extraSystemPrefix}\n\n${getSystemPrompt()}`
    : getSystemPrompt();
    
  return {
    system_instruction: { parts: [{ text: systemText }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: cfg.geminiMaxTokens,
    },
    tools: [{ googleSearch: {} }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };
}

/* ─────────────────────────────────────────────
   7. EXPORTED API FUNCTIONS
   ───────────────────────────────────────────── */

/**
 * @description Sends a non-streaming request to Gemini
 * @param {string} userMessage - User input
 * @param {Array} [history] - Conversation history
 * @param {object} [options] - Sentiment prefixes, etc.
 * @returns {Promise<Result<{text: string, suggestedQuestions: string[]}>>} The response or failure
 * @fires Analytics#gemini_response
 */
export async function askGemini(userMessage, history = [], options = {}) {
  return await timed("gemini_response", async () => {
    // 1. Pre-flight checks
    if (!Config.GEMINI_API_KEY) return fail(ERROR_CODES.AUTH, "API key not configured.");
    
    // 2. Memoization Cache
    const cacheKey = `${userMessage.trim().toLowerCase()}_${history.length}`;
    if (memoCache.has(cacheKey)) return ok(memoCache.get(cacheKey));

    // 3. Rate Limiting
    if (!rateLimiter.tryConsume()) {
      return fail(ERROR_CODES.RATE_LIMIT, "Too many requests.", rateLimiter.waitSeconds() * 1000);
    }

    const contents = buildContents(userMessage, history);
    const url = `${GEMINI.ENDPOINT}/${GEMINI.MODEL}:generateContent`;

    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': Config.GEMINI_API_KEY,
      },
      body: JSON.stringify(buildRequestBody(contents, options?.sentimentPrefix || '')),
    });

    if (!res.ok) return res;

    try {
      const data = await res.value.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!raw) {
        const finishReason = data?.candidates?.[0]?.finishReason;
        return fail(ERROR_CODES.HTTP, finishReason === 'SAFETY' ? "Blocked by safety filters." : "Empty response.");
      }

      serviceStatus.update('gemini', true);
      const parsed = parseSuggestions(raw);
      
      // Store in memo cache
      memoCache.set(cacheKey, parsed);
      return ok(parsed);
    } catch (e) {
      serviceStatus.update('gemini', false);
      return fail(ERROR_CODES.HTTP, "Failed to parse API response.");
    }
  });
}

/**
 * @description Sends a streaming request to Gemini via SSE
 * @param {string} userMessage - User input
 * @param {Array} [history] - Conversation history
 * @param {Function} onChunk - Callback for each text delta
 * @returns {Promise<Result<{suggestedQuestions: string[]}>>} The final metadata or failure
 */
export async function askGeminiStream(userMessage, history = [], onChunk) {
  if (!Config.GEMINI_API_KEY) return fail(ERROR_CODES.AUTH, "API key not configured.");
  
  if (!rateLimiter.tryConsume()) {
    return fail(ERROR_CODES.RATE_LIMIT, "Too many requests.", rateLimiter.waitSeconds() * 1000);
  }

  const contents = buildContents(userMessage, history);
  const url = `${GEMINI.ENDPOINT}/${GEMINI.MODEL}${GEMINI.STREAM_SUFFIX}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': Config.GEMINI_API_KEY,
      },
      body: JSON.stringify(buildRequestBody(contents)),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData?.error?.message || `Streaming failed: ${response.status}`;
      return fail(ERROR_CODES.HTTP, msg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Hold incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(jsonStr);
          const delta = chunk?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {}
      }
    }

    if (!fullText) return fail(ERROR_CODES.HTTP, "Empty stream response.");
    
    serviceStatus.update('gemini', true);
    return ok(parseSuggestions(fullText));
  } catch (e) {
    serviceStatus.update('gemini', false);
    return fail(ERROR_CODES.NETWORK, "Stream interrupted.");
  }
}

/**
 * @description Fetches the latest election news using Google Search grounding
 * @returns {Promise<Result<Array<{title: string, summary: string, source: string}>>>}
 */
export async function fetchElectionNews() {
  if (!Config.GEMINI_API_KEY) return ok([]);
  
  const prompt = `Using Google Search, find the 3 most recent Indian election news headlines from today. Format as:
TITLE: {title}
SUMMARY: {2 sentence summary}
SOURCE: {publication name}
--- (separator)`;

  const url = `${GEMINI.ENDPOINT}/${GEMINI.MODEL}:generateContent`;
  
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Config.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      tools: [{ googleSearch: {} }],
    }),
  });

  if (!res.ok) return res;

  try {
    const data = await res.value.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const news = raw.split('---').map(block => ({
      title: block.match(/TITLE:\s*(.+)/i)?.[1]?.trim() || 'Election News',
      summary: block.match(/SUMMARY:\s*([\s\S]+?)(?=SOURCE:|$)/i)?.[1]?.trim() || '',
      source: block.match(/SOURCE:\s*(.+)/i)?.[1]?.trim() || 'News'
    })).filter(n => n.summary);
    
    return ok(news);
  } catch {
    return ok([]);
  }
}

/**
 * @description Analyzes a pasted election document and explains it simply
 * @param {string} pastedText - Raw document text
 * @returns {Promise<Result<{text: string}>>}
 */
export async function analyzeElectionDocument(pastedText) {
  if (!Config.GEMINI_API_KEY) return fail(ERROR_CODES.AUTH, "Key missing.");
  
  const prompt = `The user pasted this official election document: ${pastedText}. Explain it in plain language for a first-time voter. List deadlines as bullet points.`;
  const url = `${GEMINI.ENDPOINT}/${GEMINI.MODEL}:generateContent`;

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Config.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
      tools: [{ googleSearch: {} }],
    }),
  });

  if (!res.ok) return res;

  try {
    const data = await res.value.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text ? ok({ text }) : fail(ERROR_CODES.HTTP, "Empty analysis.");
  } catch {
    return fail(ERROR_CODES.HTTP, "Parsing failed.");
  }
}

/**
 * @description Resets the rate limiter (primarily for unit tests)
 * @returns {void}
 */
export function resetRateLimiter() {
  rateLimiter.reset();
}

export { parseSuggestions };
