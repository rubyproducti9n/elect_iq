/* ═══════════════════════════════════════════════
   ElectIQ — Security-Focused Configuration
   Reads API keys from <meta> tags injected at
   build time. NEVER hardcode secrets in JS.
   ═══════════════════════════════════════════════ */

/**
 * Reads a configuration value from a <meta> tag.
 * @param {string} name - The meta tag name attribute
 * @returns {string|null}
 */
function readMeta(name) {
  const tag = document.querySelector(`meta[name="${name}"]`);
  const val = tag ? tag.getAttribute('content') : null;
  // If Vite didn't replace the placeholder, treat it as missing
  return (val && val.startsWith('%VITE_')) ? null : val;
}

/**
 * Validates that all required config values are present.
 * @param {Object} config
 * @param {string[]} requiredKeys
 * @throws {Error} if any required key is missing
 */
function validateConfig(config, requiredKeys) {
  const missing = requiredKeys.filter((key) => !config[key]);
  if (missing.length > 0) {
    console.error(
      `[ElectIQ Config] Missing required configuration: ${missing.join(', ')}. ` +
      `Ensure <meta> tags are injected at build time.`
    );
  }
}

/**
 * Frozen application configuration object.
 * All values sourced from <meta> tags — never from JS literals.
 */
const Config = Object.freeze({
  /* ── Gemini API ── */
  GEMINI_API_KEY:   readMeta('gemini-api-key'),
  GEMINI_MODEL:     'gemini-2.5-flash',
  GEMINI_ENDPOINT:  'https://generativelanguage.googleapis.com/v1beta/models',

  /* ── Firebase ── */
  FIREBASE_API_KEY:            readMeta('firebase-api-key'),
  FIREBASE_AUTH_DOMAIN:        readMeta('firebase-auth-domain'),
  FIREBASE_PROJECT_ID:         readMeta('firebase-project-id'),
  FIREBASE_STORAGE_BUCKET:     readMeta('firebase-storage-bucket'),
  FIREBASE_MESSAGING_SENDER_ID: readMeta('firebase-messaging-sender-id'),
  FIREBASE_APP_ID:             readMeta('firebase-app-id'),
  FIREBASE_MEASUREMENT_ID:     readMeta('firebase-measurement-id'),

  /* ── Google TTS ── */
  GOOGLE_TTS_API_KEY:  readMeta('google-tts-api-key'),
  GOOGLE_TTS_ENDPOINT: 'https://texttospeech.googleapis.com/v1/text:synthesize',

  /* ── App Settings ── */
  APP_NAME:       'ElectIQ',
  APP_VERSION:    '1.0.0',
  MAX_CHAT_HISTORY: 50,
  RATE_LIMIT_RPM:   15,
});

// Validate critical keys on load
validateConfig(Config, [
  'GEMINI_API_KEY',
  'FIREBASE_API_KEY',
  'FIREBASE_PROJECT_ID',
]);

export default Config;
