/* ═══════════════════════════════════════════════
   ElectIQ — Analytics Module
   Centralized event tracking and telemetry
   ═══════════════════════════════════════════════ */

import { ANALYTICS_EVENTS } from './constants.js';

let analyticsInstance = null;
let fbAnalytics = null;

/**
 * @description Initializes the analytics service
 * @param {object} instance - Firebase Analytics instance
 * @returns {void}
 */
export async function initAnalytics(instance) {
  analyticsInstance = instance;
  try {
    const FB_VER = '10.12.0';
    const CDN = `https://www.gstatic.com/firebasejs/${FB_VER}`;
    fbAnalytics = await import(`${CDN}/firebase-analytics.js`);
  } catch (e) {
    console.warn('[Analytics] SDK failed to load');
  }
}

/**
 * @description Tracks a custom event in Firebase Analytics
 * @param {string} eventName - Name of the event from ANALYTICS_EVENTS
 * @param {object} [params] - Optional metadata to attach to the event
 * @returns {void}
 */
export function trackEvent(eventName, params = {}) {
  if (analyticsInstance && fbAnalytics?.logEvent) {
    fbAnalytics.logEvent(analyticsInstance, eventName, params);
  }
}

/**
 * @description Reports an application error to analytics
 * @param {object} error - The error object containing code and message
 * @returns {void}
 */
export function trackError(error) {
  trackEvent(ANALYTICS_EVENTS.APP_ERROR, {
    error_code: error.code,
    error_message: error.message
  });
}

/**
 * @description Tracks how long a user spends on a specific screen
 * @param {string} screenName - Name of the screen/route
 * @param {number} durationMs - Duration in milliseconds
 * @returns {void}
 */
export function trackScreenTime(screenName, durationMs) {
  trackEvent(ANALYTICS_EVENTS.SCREEN_TIME, {
    screen: screenName,
    duration_sec: Math.round(durationMs / 1000)
  });
}

/**
 * @description Sets persistent user properties for audience segmentation
 * @param {object} props - Key-value pairs of properties
 * @returns {void}
 */
export function setUserProps(props) {
  if (analyticsInstance && fbAnalytics?.setUserProperties) {
    fbAnalytics.setUserProperties(analyticsInstance, props);
  }
}
