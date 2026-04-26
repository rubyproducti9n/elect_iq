/* ═══════════════════════════════════════════════
   ElectIQ — Google Cloud Text-to-Speech
   ═══════════════════════════════════════════════ */

import Config from './config.js';

let currentAudio = null;
let isSpeaking = false;

/**
 * Synthesize speech from text using Google Cloud TTS.
 * Falls back to Web Speech API if TTS key is unavailable.
 * @param {string} text - Text to speak
 * @param {string} languageCode - BCP-47 language code
 */
export async function speakText(text, languageCode = 'en-US') {
  // Stop any current playback
  stopSpeaking();

  // Fallback to Web Speech API if no TTS key
  if (!Config.GOOGLE_TTS_API_KEY) {
    return speakWithWebSpeech(text, languageCode);
  }

  try {
    const url = Config.GOOGLE_TTS_ENDPOINT;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': Config.GOOGLE_TTS_API_KEY
      },
      body: JSON.stringify({
        input: { text: text.slice(0, 5000) },
        voice: {
          languageCode,
          name: 'en-US-Neural2-C',
          ssmlGender: 'FEMALE',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0,
        },
      }),
    });

    if (!response.ok) throw new Error(`TTS API error: ${response.status}`);

    const data = await response.json();
    const audioSrc = `data:audio/mp3;base64,${data.audioContent}`;

    currentAudio = new Audio(audioSrc);
    isSpeaking = true;

    currentAudio.addEventListener('ended', () => { isSpeaking = false; });
    currentAudio.addEventListener('error', () => { isSpeaking = false; });
    currentAudio.play();
  } catch (error) {
    console.warn('[TTS] Cloud TTS failed, falling back to Web Speech:', error);
    speakWithWebSpeech(text, languageCode);
  }
}

/**
 * Fallback: Web Speech API.
 */
function speakWithWebSpeech(text, lang = 'en-US') {
  if (!window.speechSynthesis) {
    console.warn('[TTS] Speech synthesis not supported');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text.slice(0, 3000));
  utterance.lang = lang;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  utterance.onstart = () => { isSpeaking = true; };
  utterance.onend = () => { isSpeaking = false; };
  utterance.onerror = () => { isSpeaking = false; };

  window.speechSynthesis.speak(utterance);
}

/**
 * Stop any current speech.
 */
export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
}

/**
 * Check if currently speaking.
 */
export function getIsSpeaking() {
  return isSpeaking;
}
