/* ═══════════════════════════════════════════════
   ElectIQ — Google Cloud Text-to-Speech (v2)
   ─────────────────────────────────────────────
   • POST to Google Cloud TTS REST API
   • Voice: en-IN-Standard-A (Indian English, female)
   • Strips markdown before sending
   • Decodes base64 audioContent → Web Audio API
   • toggleTTS() to enable/disable, persisted in localStorage
   • Falls back to browser SpeechSynthesis API
   ═══════════════════════════════════════════════ */

import Config from './config.js';

/* ── State ── */
const TTS_PREF_KEY = 'electiq_tts_enabled';
let ttsEnabled  = true;
let audioCtx    = null;
let currentSource = null;
let isSpeaking  = false;

/* ── Load persisted preference ── */
try {
  const saved = localStorage.getItem(TTS_PREF_KEY);
  if (saved !== null) ttsEnabled = saved === 'true';
} catch { /* localStorage unavailable */ }

/* ─────────────────────────────────────────────
   MARKDOWN STRIPPER
   Removes **, *, #, [], (), ```, etc.
   ───────────────────────────────────────────── */
function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')       // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')          // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')      // images
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')// links → keep label
    .replace(/#{1,6}\s?/g, '')            // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2')   // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')      // italic
    .replace(/~~(.*?)~~/g, '$1')          // strikethrough
    .replace(/^\s*[-*+]\s/gm, '')         // unordered list markers
    .replace(/^\s*\d+\.\s/gm, '')         // ordered list markers
    .replace(/^\s*>\s?/gm, '')            // blockquotes
    .replace(/---+/g, '')                 // horizontal rules
    .replace(/SUGGESTIONS:.*$/im, '')     // strip suggestion line
    .replace(/\n{3,}/g, '\n\n')           // collapse blank lines
    .trim();
}

/* ─────────────────────────────────────────────
   LAZY Web Audio CONTEXT
   ───────────────────────────────────────────── */
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume suspended context (required after user gesture)
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/* ─────────────────────────────────────────────
   SPEAK TEXT  (main public API)
   ───────────────────────────────────────────── */

/**
 * Synthesize speech from text using Google Cloud TTS.
 * Falls back to Web Speech API if the key is missing.
 * @param {string} text - Raw text (may contain markdown)
 */
export async function speakText(text) {
  if (!ttsEnabled) return;

  // Stop any current playback first
  stopSpeaking();

  const cleanText = stripMarkdown(text);
  if (!cleanText) return;

  // Prefer Google Cloud TTS, fall back to browser
  if (!Config.GOOGLE_TTS_API_KEY) {
    return speakWithWebSpeech(cleanText);
  }

  try {
    const response = await fetch(Config.GOOGLE_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': Config.GOOGLE_TTS_API_KEY,
      },
      body: JSON.stringify({
        input: { text: cleanText.slice(0, 5000) },
        voice: {
          languageCode: 'en-IN',
          name: 'en-IN-Standard-A',
          ssmlGender: 'FEMALE',
        },
        audioConfig: {
          audioEncoding: 'LINEAR16',
          speakingRate: 1.0,
          pitch: 0,
          sampleRateHertz: 24000,
        },
      }),
    });

    if (!response.ok) throw new Error(`TTS API ${response.status}`);

    const data = await response.json();
    await playBase64Audio(data.audioContent);
  } catch (error) {
    console.warn('[TTS] Cloud TTS failed, falling back to Web Speech:', error.message);
    speakWithWebSpeech(cleanText);
  }
}

/* ─────────────────────────────────────────────
   PLAY BASE64 AUDIO via Web Audio API
   ───────────────────────────────────────────── */
async function playBase64Audio(base64) {
  const ctx = getAudioContext();

  // Decode base64 → ArrayBuffer
  const binaryStr = atob(base64);
  const bytes     = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
  const source      = ctx.createBufferSource();
  source.buffer     = audioBuffer;
  source.connect(ctx.destination);

  isSpeaking    = true;
  currentSource = source;

  source.onended = () => {
    isSpeaking    = false;
    currentSource = null;
  };

  source.start(0);
}

/* ─────────────────────────────────────────────
   FALLBACK: Web Speech API
   ───────────────────────────────────────────── */
function speakWithWebSpeech(text) {
  if (!window.speechSynthesis) {
    console.warn('[TTS] Speech synthesis not supported in this browser');
    return;
  }

  const utterance  = new SpeechSynthesisUtterance(text.slice(0, 3000));
  utterance.lang   = 'en-IN';
  utterance.rate   = 1.0;
  utterance.pitch  = 1.0;

  utterance.onstart = () => { isSpeaking = true; };
  utterance.onend   = () => { isSpeaking = false; };
  utterance.onerror = () => { isSpeaking = false; };

  window.speechSynthesis.speak(utterance);
}

/* ─────────────────────────────────────────────
   STOP SPEAKING
   ───────────────────────────────────────────── */
export function stopSpeaking() {
  // Stop Web Audio source
  if (currentSource) {
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource = null;
  }
  // Stop Web Speech
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
}

/* ─────────────────────────────────────────────
   TOGGLE TTS (persisted in localStorage)
   ───────────────────────────────────────────── */

/**
 * Toggle TTS on/off globally.
 * @returns {boolean} The new enabled state
 */
export function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  try {
    localStorage.setItem(TTS_PREF_KEY, String(ttsEnabled));
  } catch { /* ignore */ }

  // If turning off while speaking, stop immediately
  if (!ttsEnabled) stopSpeaking();

  console.info(`[TTS] ${ttsEnabled ? 'Enabled' : 'Disabled'}`);
  return ttsEnabled;
}

/**
 * Check if TTS is currently enabled.
 * @returns {boolean}
 */
export function isTTSEnabled() {
  return ttsEnabled;
}

/**
 * Check if audio is currently playing.
 * @returns {boolean}
 */
export function getIsSpeaking() {
  return isSpeaking;
}
