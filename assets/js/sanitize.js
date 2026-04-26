/* ═══════════════════════════════════════════════
   ElectIQ — DOMPurify-Based Sanitizer
   Input validation & output sanitization
   ═══════════════════════════════════════════════ */

/**
 * Get the DOMPurify instance (loaded via CDN in index.html).
 */
function getPurify() {
  if (typeof DOMPurify !== 'undefined') return DOMPurify;
  console.warn('[Sanitize] DOMPurify not loaded. Falling back to basic escaping.');
  return null;
}

/**
 * Basic HTML entity escaping fallback.
 */
function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * Sanitize user input before sending to API.
 * Strips HTML and trims whitespace.
 * @param {string} input
 * @returns {string}
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';

  const purify = getPurify();
  const cleaned = purify
    ? purify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    : escapeHtml(input);

  return cleaned.trim().slice(0, 4000); // Max input length
}

/**
 * Sanitize AI output before rendering into DOM.
 * Allows safe formatting tags.
 * @param {string} output
 * @returns {string}
 */
export function sanitizeOutput(output) {
  if (typeof output !== 'string') return '';

  // Parse Markdown to HTML if marked is available
  let rawHtml = output;
  if (typeof marked !== 'undefined') {
    try {
      rawHtml = marked.parse(output, { async: false, breaks: true });
    } catch (e) {
      console.warn('[Sanitize] Markdown parsing failed:', e);
    }
  }

  const purify = getPurify();
  if (purify) {
    const cleanHtml = purify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'code', 'pre', 'blockquote', 'a', 'span',
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
      ADD_ATTR: ['target'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    });
    
    // Add target="_blank" securely to all links post-sanitization
    if (typeof document !== 'undefined') {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cleanHtml;
      tempDiv.querySelectorAll('a').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
      return tempDiv.innerHTML;
    }
    return cleanHtml;
  }

  return escapeHtml(output);
}

/**
 * Validate an email address format.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Strip potential XSS from URL strings.
 * @param {string} url
 * @returns {string|null}
 */
export function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}
