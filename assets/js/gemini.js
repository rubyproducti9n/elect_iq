/* ═══════════════════════════════════════════════
   ElectIQ — Gemini API Wrapper
   With retry logic + sliding-window rate limiting
   ═══════════════════════════════════════════════ */

import Config from './config.js';
import { sanitizeOutput } from './sanitize.js';
import { getKnowledge, buildKnowledgeContext } from './dataLoader.js';

/* ── Rate Limiter ── */
class RateLimiter {
  constructor(maxRequests = 30, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  canProceed() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return this.timestamps.length < this.maxRequests;
  }

  record() {
    this.timestamps.push(Date.now());
  }

  msUntilNext() {
    if (this.canProceed()) return 0;
    return this.timestamps[0] + this.windowMs - Date.now();
  }
}

const rateLimiter = new RateLimiter(Config.RATE_LIMIT_RPM);

/* ── Retry with Exponential Backoff ── */
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        if (attempt === maxRetries) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        const jitter = Math.random() * 500;
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 16_000) + jitter;
        console.warn(`[Gemini] Rate limited. Retrying in ${Math.round(waitMs)}ms…`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const jitter = Math.random() * 500;
      const waitMs = Math.min(500 * Math.pow(2, attempt), 8_000) + jitter;
      console.warn(`[Gemini] Attempt ${attempt + 1} failed. Retrying in ${Math.round(waitMs)}ms…`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/* ── System Prompt ── */
const BASE_SYSTEM_PROMPT = `You are ElectIQ, a friendly and knowledgeable AI assistant 
that helps Indian citizens understand the election process. You specialize in the 
Indian General Election (Lok Sabha) process, voter registration, ECI guidelines, 
EVMs, VVPATs, and civic participation. Keep answers concise, factual, and 
non-partisan. Always cite official ECI resources when relevant. If unsure about 
jurisdiction-specific details, say so and suggest visiting https://eci.gov.in or 
calling the voter helpline 1950.`;

/* ── Knowledge Base Context (loaded once at startup) ── */
let knowledgeContext = '';

/**
 * Pre-load the knowledge base so it is ready for the first chat message.
 */
export async function loadKnowledgeBase() {
  const kb = await getKnowledge();
  if (kb) {
    knowledgeContext = buildKnowledgeContext(kb);
    console.info(`[Gemini] Knowledge base loaded (${knowledgeContext.length} chars)`);
  }
}

/**
 * Build the full system prompt with grounding context.
 */
function getSystemPrompt() {
  if (!knowledgeContext) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\nUse the following verified reference data to ground your answers:\n\n${knowledgeContext}`;
}

/**
 * Send a message to Gemini and get a response.
 * @param {string} userMessage - The user's question
 * @param {Array} history - Chat history [{role, content}]
 * @returns {Promise<string>} AI response text
 */
export async function askGemini(userMessage, history = []) {
  if (!Config.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured. Check <meta> tags.');
  }

  // Rate limit check
  if (!rateLimiter.canProceed()) {
    const waitMs = rateLimiter.msUntilNext();
    throw new Error(
      `Rate limit reached. Please wait ${Math.ceil(waitMs / 1000)} seconds.`
    );
  }

  // Record immediately to prevent race conditions with concurrent requests
  rateLimiter.record();

  // Build conversation contents
  const contents = [
    ...history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const url = `${Config.GEMINI_ENDPOINT}/${Config.GEMINI_MODEL}:generateContent`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-goog-api-key': Config.GEMINI_API_KEY
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: getSystemPrompt() }]
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  });

  const data = await response.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    'I apologize, but I was unable to generate a response. Please try again.';

  return sanitizeOutput(text);
}

export { rateLimiter };
