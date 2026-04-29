/* ═══════════════════════════════════════════════
   ElectIQ — Configuration Module
   Centralized management of environment variables
   ═══════════════════════════════════════════════ */

/**
 * @description Validates the runtime configuration for missing secrets
 * @param {object} config - The populated config object
 * @param {string[]} required - List of keys that MUST be present
 * @returns {void}
 */
function validateConfig(config, required) {
  const missing = required.filter(k => !config[k] || config[k].startsWith('%VITE_'));
  if (missing.length > 0) {
    console.warn(`[Config] Missing critical keys: ${missing.join(', ')}`);
  }
}

/**
 * @description Internal helper to resolve config values from multiple providers
 * @param {string} metaName - Name in meta tag
 * @param {string} windowVal - Variable name in window object
 * @returns {string} The resolved value or empty string
 */
const resolve = (metaName, windowVal) => {
  const meta = document.querySelector(`meta[name="${metaName}"]`)?.getAttribute('content');
  if (meta && !meta.startsWith('%VITE_')) return meta;
  if (windowVal && !String(windowVal).startsWith('%VITE_')) return windowVal;
  return '';
};

const fb = window.__FIREBASE_CONFIG__ || {};

/**
 * @description Frozen configuration object containing all cloud API credentials
 */
const Config = Object.freeze({
  GEMINI_API_KEY: resolve('gemini-api-key', window.__GEMINI_KEY__),
  GEMINI_MODEL: 'gemini-3.1-flash-lite-preview',
  GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models',
  
  FIREBASE_API_KEY: resolve('firebase-api-key', fb.apiKey),
  FIREBASE_PROJECT_ID: resolve('firebase-project-id', fb.projectId),
  FIREBASE_APP_ID: resolve('firebase-app-id', fb.appId),
  FIREBASE_MEASUREMENT_ID: resolve('firebase-measurement-id', fb.measurementId),

  GOOGLE_TTS_API_KEY: resolve('google-tts-api-key', window.__TTS_KEY__),
  GOOGLE_TTS_ENDPOINT: 'https://texttospeech.googleapis.com/v1/text:synthesize',
  GOOGLE_NLP_API_KEY: resolve('google-tts-api-key', window.__TTS_KEY__),
});

validateConfig(Config, ['GEMINI_API_KEY', 'FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID']);

export default Config;
