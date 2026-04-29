/* ═══════════════════════════════════════════════
   ElectIQ — Utility Library
   Shared Result pattern and performance wrappers
   ═══════════════════════════════════════════════ */

import { ANALYTICS_EVENTS } from './constants.js';
import { trackEvent } from './analytics.js';

/**
 * @typedef {Object} AppError
 * @property {string} code - Machine-readable error code
 * @property {string} message - User-friendly error message
 * @property {number|null} [retryAfterMs] - ms to wait before retry
 */

/**
 * @template T
 * @typedef {{ ok: true, value: T }} Success
 */

/**
 * @typedef {{ ok: false, error: AppError }} Failure
 */

/**
 * @template T
 * @typedef {Success<T> | Failure} Result
 */

/**
 * @description Creates a successful Result object
 * @param {any} value - The data to return
 * @returns {Success<any>} A success result
 */
export function ok(value) {
  return { ok: true, value };
}

/**
 * @description Creates a failure Result object
 * @param {string} code - Error identifier
 * @param {string} message - Human readable message
 * @param {number|null} [retryAfterMs] - Optional delay suggestion
 * @returns {Failure} A failure result
 */
export function fail(code, message, retryAfterMs = null) {
  return { ok: false, error: { code, message, retryAfterMs } };
}

/**
 * @description Wraps an async function to track execution time and report performance metrics
 * @param {string} label - Identifier for the operation being timed
 * @param {Function} asyncFn - The async function to execute
 * @returns {Promise<any>} The result of the async function
 */
export async function timed(label, asyncFn) {
  const start = performance.now();
  const result = await asyncFn();
  const duration = Math.round(performance.now() - start);

  // Track event via analytics module
  trackEvent(ANALYTICS_EVENTS.PERFORMANCE, { label, duration_ms: duration });

  if (duration > 3000) {
    console.warn(`⚠️ Slow operation: ${label} took ${duration}ms`);
  }

  return result;
}

/**
 * @description Safely gets an element from the DOM with type checking
 * @param {string} id - The element ID
 * @returns {HTMLElement|null} The found element
 */
export function getEl(id) {
  return document.getElementById(id);
}
