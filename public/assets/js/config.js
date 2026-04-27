/* ═══════════════════════════════════════════════
   ElectIQ — Security-Focused Configuration
   Reads API keys from injected window variables.
   ═══════════════════════════════════════════════ */

/**
 * Validates that all required config values are present.
 */
function validateConfig(config, requiredKeys) {
  const missing = requiredKeys.filter((key) => !config[key] || (typeof config[key] === 'string' && config[key].startsWith('%VITE_')));
  if (missing.length > 0) {
    console.warn(`[ElectIQ Config] Missing or unreplaced configuration for: ${missing.join(', ')}.`);
  }
}

/**
 * Helper to fetch config from meta tags or window variables.
 */
const getVal = (metaName, windowVal) => {
  const meta = document.querySelector(`meta[name="${metaName}"]`)?.getAttribute('content');
  if (meta && !meta.startsWith('%VITE_')) return meta;
  if (windowVal && !String(windowVal).startsWith('%VITE_')) return windowVal;
  return '';
};

const firebaseConfig = window.__FIREBASE_CONFIG__ || {};

const Config = Object.freeze({
  /* ── Gemini API ── */
  GEMINI_API_KEY: getVal('gemini-api-key', window.__GEMINI_KEY__),
  GEMINI_MODEL: 'gemini-2.5-flash-lite',
  GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models',
  
  /* ── Firebase ── */
  FIREBASE_API_KEY: getVal('firebase-api-key', firebaseConfig.apiKey),
  FIREBASE_AUTH_DOMAIN: getVal('firebase-auth-domain', firebaseConfig.authDomain),
  FIREBASE_PROJECT_ID: getVal('firebase-project-id', firebaseConfig.projectId),
  FIREBASE_STORAGE_BUCKET: getVal('firebase-storage-bucket', firebaseConfig.storageBucket),
  FIREBASE_MESSAGING_SENDER_ID: getVal('firebase-messaging-sender-id', firebaseConfig.messagingSenderId),
  FIREBASE_APP_ID: getVal('firebase-app-id', firebaseConfig.appId),
  FIREBASE_MEASUREMENT_ID: getVal('firebase-measurement-id', firebaseConfig.measurementId),

  /* ── Google TTS ── */
  GOOGLE_TTS_API_KEY: getVal('google-tts-api-key', window.__TTS_KEY__),
  GOOGLE_TTS_ENDPOINT: 'https://texttospeech.googleapis.com/v1/text:synthesize'
});

validateConfig(Config, [
  'GEMINI_API_KEY',
  'FIREBASE_API_KEY',
  'FIREBASE_PROJECT_ID'
]);

export default Config;
