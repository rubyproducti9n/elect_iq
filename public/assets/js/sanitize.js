/* ═══════════════════════════════════════════════
   ElectIQ — Sanitization Module
   XSS prevention and Markdown-to-HTML conversion
   ═══════════════════════════════════════════════ */

import { INPUT } from './constants.js';

/**
 * @description Retrieves the DOMPurify instance from the global scope
 * @returns {object|null}
 */
function getPurify() {
  return typeof DOMPurify !== 'undefined' ? DOMPurify : null;
}

/**
 * @description Basic character escaping for environments without DOMPurify
 * @param {string} str - Raw string
 * @returns {string}
 */
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

/**
 * @description Sanitizes user input by stripping all HTML tags
 * @param {string} input - Raw user input
 * @returns {string} Sanitized text
 * @throws {Error} If input exceeds length limits
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  if (input.length > INPUT.MAX_CHARS) {
    throw new Error(`Input exceeds limit of ${INPUT.MAX_CHARS} characters.`);
  }

  const purify = getPurify();
  const clean = purify ? purify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) : escapeHtml(input);
  return clean.trim();
}

/**
 * @description Converts markdown to sanitized HTML for safe rendering
 * @param {string} output - Raw AI output (Markdown)
 * @returns {string} Sanitized HTML
 */
export function sanitizeOutput(output) {
  if (typeof output !== 'string') return '';

  let html = output;
  if (typeof marked !== 'undefined') {
    try {
      html = marked.parse(output, { breaks: true });
    } catch (e) {
      console.warn('[Sanitize] Markdown failed.');
    }
  }

  const purify = getPurify();
  if (purify) {
    return purify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'h3', 'code', 'pre', 'a'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ADD_ATTR: ['target'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'form'],
    });
  }

  return escapeHtml(output);
}

/**
 * @description Validates if a string follows email format standards
 * @param {string} email - Input string
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
