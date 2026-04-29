/* ═══════════════════════════════════════════════
   ElectIQ — NLP Module
   Handles sentiment analysis and intent detection
   ═══════════════════════════════════════════════ */

import Config from './config.js';
import { serviceStatus } from './serviceStatus.js';
import { ok, fail, timed } from './utils.js';
import { ERROR_CODES } from './constants.js';

const getNlpKey = () => Config.GOOGLE_NLP_API_KEY || Config.GOOGLE_TTS_API_KEY;

/**
 * @description Analyzes the emotional tone of a user's message
 * @param {string} text - The input text to analyze
 * @returns {Promise<Result<{score: number, magnitude: number}>>}
 * @fires Analytics#message_sentiment
 */
export async function analyzeUserSentiment(text) {
  return await timed("nlp_analyze_sentiment", async () => {
    const key = getNlpKey();
    if (!key) return ok({ score: 0, magnitude: 0 });

    try {
      const response = await fetch(
        `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document: { type: 'PLAIN_TEXT', content: text },
            encodingType: 'UTF-8'
          })
        }
      );
      
      if (!response.ok) return fail(ERROR_CODES.HTTP, `NLP Error: ${response.status}`);
      
      const data = await response.json();
      serviceStatus.update('nlp', true);
      
      return ok({
        score: data.documentSentiment?.score ?? 0,
        magnitude: data.documentSentiment?.magnitude ?? 0
      });
    } catch (err) {
      serviceStatus.update('nlp', false);
      return ok({ score: 0, magnitude: 0 }); // Fallback to neutral
    }
  });
}

/**
 * @description Classifies user intent using Google NLP or local keyword fallback
 * @param {string} text - User query
 * @returns {Promise<Result<string>>}
 */
export async function classifyUserIntent(text) {
  const key = getNlpKey();
  
  // classifyText requires minimum tokens, otherwise fallback immediately
  if (!key || text.split(/\s+/).length < 10) {
    return ok(inferIntentLocally(text));
  }

  try {
    const response = await fetch(
      `https://language.googleapis.com/v1/documents:classifyText?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: { type: 'PLAIN_TEXT', content: text }
        })
      }
    );
    
    if (!response.ok) return ok(inferIntentLocally(text));
    
    const data = await response.json();
    serviceStatus.update('nlp', true);
    
    const category = data.categories?.[0]?.name || inferIntentLocally(text);
    return ok(category);
  } catch (err) {
    serviceStatus.update('nlp', false);
    return ok(inferIntentLocally(text));
  }
}

/**
 * @description Local pattern matching fallback for short queries
 * @param {string} text - User message
 * @returns {string} Classified label
 */
function inferIntentLocally(text) {
  const lower = text.toLowerCase();
  const patterns = [
    { keywords: ['register', 'voter id', 'enrollment', 'enroll', 'epic'], label: '🗳️ Voter Registration' },
    { keywords: ['evm', 'machine', 'vvpat', 'electronic'], label: '🖥️ EVM & Technology' },
    { keywords: ['candidate', 'party', 'contest', 'nomination'], label: '🏛️ Candidates & Parties' },
    { keywords: ['date', 'schedule', 'when', 'phase', 'timeline'], label: '📅 Election Schedule' },
    { keywords: ['result', 'count', 'winner', 'tally', 'declare'], label: '📊 Results & Counting' },
    { keywords: ['booth', 'polling', 'station', 'where to vote'], label: '📍 Polling Stations' },
    { keywords: ['nota', 'right', 'law', 'act', 'constitution'], label: '📋 Election Law' },
    { keywords: ['eci', 'commission', 'commissioner'], label: '🏗️ Election Commission' },
  ];
  
  for (const p of patterns) {
    if (p.keywords.some(k => lower.includes(k))) return p.label;
  }
  return '💬 General Query';
}

/**
 * @description Translates sentiment score into AI behavioral instructions
 * @param {number} score - Sentiment score (-1.0 to 1.0)
 * @returns {string} System prompt prefix
 */
export function getSentimentPromptPrefix(score) {
  if (score < -0.5) {
    return 'The user seems frustrated. Be extra patient and break down your answer into very simple numbered steps.';
  }
  if (score > 0.5) {
    return 'The user is engaged. You can offer more detailed information and proactively suggest related topics.';
  }
  return '';
}
