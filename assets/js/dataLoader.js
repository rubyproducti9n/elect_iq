/* ═══════════════════════════════════════════════
   ElectIQ — Knowledge Base Data Loader
   Fetches election-knowledge.json, caches in
   sessionStorage, and exposes getKnowledge().
   ═══════════════════════════════════════════════ */

const CACHE_KEY = 'electiq_kb';
const DATA_URL = '/assets/data/election-knowledge.json';

let knowledgePromise = null;

/**
 * Fetch the election knowledge base.
 * Uses sessionStorage as a cache layer so the JSON
 * is only fetched once per browser session.
 * @returns {Promise<Object>} The parsed knowledge base
 */
export async function getKnowledge() {
  // Return in-flight promise if already loading
  if (knowledgePromise) return knowledgePromise;

  knowledgePromise = (async () => {
    // 1. Try sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.meta) {
          console.info('[DataLoader] Loaded knowledge base from sessionStorage cache');
          return parsed;
        }
      }
    } catch {
      // sessionStorage unavailable or corrupt — continue to fetch
    }

    // 2. Fetch from network
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch knowledge base: ${response.status}`);
      }

      const data = await response.json();

      // 3. Cache in sessionStorage
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        console.info('[DataLoader] Knowledge base fetched and cached');
      } catch {
        console.warn('[DataLoader] sessionStorage write failed (quota exceeded?)');
      }

      return data;
    } catch (error) {
      console.error('[DataLoader] Failed to load knowledge base:', error);
      knowledgePromise = null; // Allow retry on next call
      return null;
    }
  })();

  return knowledgePromise;
}

/**
 * Build a compact text summary of the knowledge base
 * suitable for injecting into a system prompt.
 * @param {Object} kb - The knowledge base object
 * @returns {string} Formatted grounding context
 */
export function buildKnowledgeContext(kb) {
  if (!kb) return '';

  const sections = [];

  // Phases
  if (kb.phases) {
    sections.push('## ELECTION PHASES');
    kb.phases.forEach((p) => {
      sections.push(`Phase ${p.phase}: ${p.name} — ${p.description}`);
      sections.push(`Steps: ${p.steps.join('; ')}`);
    });
  }

  // Voter journey
  if (kb.voter_journey) {
    sections.push('\n## VOTER JOURNEY');
    kb.voter_journey.forEach((v) => {
      sections.push(`${v.step}. ${v.title}: ${v.description}`);
      if (v.online_url) sections.push(`   Online: ${v.online_url}`);
    });
  }

  // Key bodies
  if (kb.key_bodies) {
    sections.push('\n## KEY ELECTION BODIES');
    kb.key_bodies.forEach((b) => {
      sections.push(`${b.name}: ${b.role} Contact: ${b.contact}`);
    });
  }

  // FAQ
  if (kb.faq) {
    sections.push('\n## FREQUENTLY ASKED QUESTIONS');
    kb.faq.forEach((f) => {
      sections.push(`Q: ${f.question}\nA: ${f.answer}`);
    });
  }

  // Glossary (compact)
  if (kb.glossary) {
    sections.push('\n## GLOSSARY');
    kb.glossary.forEach((g) => {
      sections.push(`${g.term}: ${g.definition}`);
    });
  }

  return sections.join('\n');
}

/**
 * Clear the cached knowledge base.
 */
export function clearKnowledgeCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    knowledgePromise = null;
  } catch { /* ignore */ }
}
