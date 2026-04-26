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

const cleanVal = (val) => (typeof val === 'string' && val.startsWith('%VITE_')) ? '' : val;

const firebaseConfig = window.__FIREBASE_CONFIG__ || {};
const geminiKey = cleanVal(window.__GEMINI_KEY__);
const ttsKey = cleanVal(window.__TTS_KEY__);

const Config = Object.freeze({
  /* ── Gemini API ── */
  GEMINI_API_KEY: geminiKey,
  GEMINI_MODEL: 'gemini-1.5-flash',
  GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models',
  
  /* ── Firebase ── */
  FIREBASE_API_KEY: cleanVal(firebaseConfig.apiKey),
  FIREBASE_AUTH_DOMAIN: cleanVal(firebaseConfig.authDomain),
  FIREBASE_PROJECT_ID: cleanVal(firebaseConfig.projectId),
  FIREBASE_STORAGE_BUCKET: cleanVal(firebaseConfig.storageBucket),
  FIREBASE_MESSAGING_SENDER_ID: cleanVal(firebaseConfig.messagingSenderId),
  FIREBASE_APP_ID: cleanVal(firebaseConfig.appId),
  FIREBASE_MEASUREMENT_ID: cleanVal(firebaseConfig.measurementId),

  /* ── Google TTS ── */
  GOOGLE_TTS_API_KEY: ttsKey,
  GOOGLE_TTS_ENDPOINT: 'https://texttospeech.googleapis.com/v1/text:synthesize'
});

validateConfig(Config, [
  'GEMINI_API_KEY',
  'FIREBASE_API_KEY',
  'FIREBASE_PROJECT_ID'
]);

export default Config;
