/* ═══════════════════════════════════════════════
   ElectIQ — TTS Module
   Handles audio synthesis and playback controls
   ═══════════════════════════════════════════════ */

import Config from './config.js';
import { serviceStatus } from './serviceStatus.js';
import { ok, fail, timed } from './utils.js';
import { STORAGE_KEYS, ERROR_CODES } from './constants.js';

/* ── Module State ── */
let ttsEnabled = true;
let audioCtx = null;
let currentSource = null;
let isSpeaking = false;
let stopRequested = false;

// Configurable parameters
export let ttsVoice = 'en-IN-Standard-A';
export let ttsSpeakingRate = 1.0;
export let ttsPitch = 0;

/**
 * @description Loads the initial TTS configuration from persistent storage
 * @returns {void}
 */
function loadInitialState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.TTS_ENABLED);
    if (saved !== null) ttsEnabled = saved === 'true';
    
    const voice = localStorage.getItem(STORAGE_KEYS.TTS_VOICE);
    if (voice) ttsVoice = voice;
    
    const rate = localStorage.getItem(STORAGE_KEYS.TTS_RATE);
    if (rate) ttsSpeakingRate = parseFloat(rate);

    const pitch = localStorage.getItem(STORAGE_KEYS.TTS_PITCH);
    if (pitch) ttsPitch = parseFloat(pitch);
  } catch {}
}

loadInitialState();

/**
 * @description Sets the active voice ID
 * @param {string} v - Voice identifier
 * @returns {void}
 */
export function setTTSVoice(v) { 
  ttsVoice = v; 
}

/**
 * @description Adjusts the speech playback rate
 * @param {number} r - Rate (0.25 to 4.0)
 * @returns {void}
 */
export function setTTSSpeakingRate(r) { 
  ttsSpeakingRate = r; 
}

/**
 * @description Adjusts the voice pitch
 * @param {number} p - Pitch (-20.0 to 20.0)
 * @returns {void}
 */
export function setTTSPitch(p) { 
  ttsPitch = p; 
}

/**
 * @description Removes markdown formatting to ensure clean speech synthesis
 * @param {string} text - Input text with markdown
 * @returns {string} Plain text
 */
function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/#{1,6}\s?/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^\s*[-*+]\s/gm, '')
    .replace(/^\s*\d+\.\s/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/---+/g, '')
    .replace(/SUGGESTIONS:.*$/im, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @description Gets or creates a singleton Web Audio Context
 * @returns {AudioContext}
 */
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/**
 * @description Synthesizes speech using Google Cloud TTS API
 * @param {string} text - Text to speak
 * @returns {Promise<Result<void>>}
 */
export async function speakText(text) {
  return await timed("tts_speak_text", async () => {
    if (!ttsEnabled) return ok();
    
    stopSpeaking();
    const cleanText = stripMarkdown(text);
    if (!cleanText) return ok();

    if (!Config.GOOGLE_TTS_API_KEY) {
      speakWithWebSpeech(cleanText);
      return ok();
    }

    try {
      const response = await fetch(Config.GOOGLE_TTS_ENDPOINT, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'X-Goog-Api-Key': Config.GOOGLE_TTS_API_KEY 
        },
        body: JSON.stringify({
          input: { text: cleanText.slice(0, 5000) },
          voice: { 
            languageCode: 'en-IN', 
            name: ttsVoice, 
            ssmlGender: ttsVoice.includes('-B') ? 'MALE' : 'FEMALE' 
          },
          audioConfig: {
            audioEncoding: 'LINEAR16',
            speakingRate: ttsSpeakingRate,
            pitch: ttsPitch,
            sampleRateHertz: 24000,
          },
        }),
      });

      if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
      
      const data = await response.json();
      serviceStatus.update('tts', true);
      await playBase64Audio(data.audioContent);
      return ok();
    } catch (err) {
      serviceStatus.update('tts', false);
      speakWithWebSpeech(cleanText); // Fallback
      return ok();
    }
  });
}

/**
 * @description Decodes and plays base64-encoded audio data
 * @param {string} base64 - Audio content
 * @returns {Promise<void>}
 */
async function playBase64Audio(base64) {
  const ctx = getAudioContext();
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  try {
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    isSpeaking = true;
    currentSource = source;

    source.onended = () => {
      isSpeaking = false;
      currentSource = null;
    };

    source.start(0);
  } catch (e) {
    isSpeaking = false;
  }
}

/**
 * @description Browser-native speech synthesis fallback
 * @param {string} text - Clean text
 * @returns {void}
 */
function speakWithWebSpeech(text) {
  if (!window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(text.slice(0, 3000));
  utterance.lang = 'en-IN';
  utterance.rate = ttsSpeakingRate;
  
  utterance.onstart = () => { isSpeaking = true; };
  utterance.onend = () => { isSpeaking = false; };
  utterance.onerror = () => { isSpeaking = false; };

  window.speechSynthesis.speak(utterance);
}

/**
 * @description Immediately halts all active audio playback
 * @returns {void}
 */
export function stopSpeaking() {
  if (currentSource) {
    try { currentSource.stop(); } catch {}
    currentSource = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
}

/**
 * @description Toggles the global TTS setting
 * @returns {boolean} New state
 */
export function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  try {
    localStorage.setItem(STORAGE_KEYS.TTS_ENABLED, String(ttsEnabled));
  } catch {}

  if (!ttsEnabled) stopSpeaking();
  return ttsEnabled;
}

/**
 * @description Checks if TTS is active
 * @returns {boolean}
 */
export function isTTSEnabled() { 
  return ttsEnabled; 
}

/**
 * @description Reads all text content within a DOM container using chunking
 * @param {string} containerSelector - CSS selector
 * @returns {Promise<void>}
 */
export async function speakPage(containerSelector) {
  if (!ttsEnabled) return;
  stopSpeaking();
  stopRequested = false;

  const container = document.querySelector(containerSelector);
  if (!container) return;

  const fullText = stripMarkdown(container.innerText || '');
  if (!fullText) return;

  const CHUNK_SIZE = 4000;
  const chunks = [];
  for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
    chunks.push(fullText.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    if (stopRequested) break;
    await speakText(chunk);
    
    // Polling loop to wait for chunk playback before starting next
    await new Promise(r => {
      const check = setInterval(() => {
        if (!isSpeaking || stopRequested) {
          clearInterval(check);
          r();
        }
      }, 100);
    });
  }
}

/**
 * @description Auto-triggers speech for bot messages if setting is enabled
 * @param {string} text - Bot response
 * @returns {Promise<void>}
 */
export async function autoSpeak(text) {
  if (ttsEnabled) await speakText(text);
}
