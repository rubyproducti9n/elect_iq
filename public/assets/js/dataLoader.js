/* ═══════════════════════════════════════════════
   ElectIQ — Data Loader Module
   Handles fetching and caching of election knowledge
   ═══════════════════════════════════════════════ */

import { ok, fail, timed } from './utils.js';
import { STORAGE_KEYS, ERROR_CODES } from './constants.js';

/* ── Module State ── */
let knowledgePromise = null;
const DATA_URL = '/assets/data/election-knowledge.json';

/**
 * @description Fetches the master knowledge JSON with session-level caching
 * @returns {Promise<Result<object>>} The parsed knowledge base
 */
export async function getKnowledge() {
  if (knowledgePromise) return knowledgePromise;

  knowledgePromise = (async () => {
    return await timed("data_load_knowledge", async () => {
      // 1. Check Session Cache
      try {
        const cached = sessionStorage.getItem(STORAGE_KEYS.KNOWLEDGE_CACHE);
        if (cached) return ok(JSON.parse(cached));
      } catch (e) {}

      // 2. Fetch from Network
      try {
        const response = await fetch(DATA_URL);
        if (!response.ok) return fail(ERROR_CODES.HTTP, "Failed to fetch knowledge.");

        const data = await response.json();

        // 3. Persist to Session
        try {
          sessionStorage.setItem(STORAGE_KEYS.KNOWLEDGE_CACHE, JSON.stringify(data));
        } catch (e) {}

        return ok(data);
      } catch (err) {
        knowledgePromise = null;
        return fail(ERROR_CODES.HTTP, err.message);
      }
    });
  })();

  return knowledgePromise;
}

/**
 * @description flattens the knowledge base into a text block for AI grounding
 * @param {object} kb - The knowledge base object
 * @returns {string} Grounding text
 */
export function buildKnowledgeContext(kb) {
  if (!kb) return '';
  const parts = [];

  if (kb.voter_journey) {
    parts.push("VOTER JOURNEY:");
    kb.voter_journey.forEach(s => parts.push(`- ${s.title}: ${s.description}`));
  }

  if (kb.faq) {
    parts.push("\nFAQ:");
    kb.faq.forEach(f => parts.push(`Q: ${f.question}\nA: ${f.answer}`));
  }

  if (kb.glossary) {
    parts.push("\nGLOSSARY:");
    kb.glossary.forEach(g => parts.push(`${g.term}: ${g.definition}`));
  }

  return parts.join('\n');
}

/**
 * @description Force invalidates the local knowledge cache
 * @returns {void}
 */
export function clearKnowledgeCache() {
  sessionStorage.removeItem(STORAGE_KEYS.KNOWLEDGE_CACHE);
  knowledgePromise = null;
}
