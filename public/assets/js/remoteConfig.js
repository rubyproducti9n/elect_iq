/* ═══════════════════════════════════════════════
   ElectIQ — Remote Config Module
   Dynamic feature flags and runtime configuration
   ═══════════════════════════════════════════════ */

import { initFirebase } from './firebase.js';
import { serviceStatus } from './serviceStatus.js';
import { ok, timed, getEl } from './utils.js';
import { ERROR_CODES } from './constants.js';

/* ── Firebase SDK Version ── */
const FB_VER = '10.12.0';
const CDN = `https://www.gstatic.com/firebasejs/${FB_VER}`;

/* ── Module State ── */
let rcInstance = null;
let configValues = null;

const DEFAULTS = {
  gemini_max_tokens: 1000,
  show_community_board: true,
  election_news_enabled: true,
  max_chat_messages: 50,
  welcome_message: 'Welcome to ElectIQ! Ask me anything about elections.',
  featured_question: 'How do I register to vote?',
  maintenance_mode: false,
  tts_voice: 'en-IN-Standard-A'
};

/**
 * @description Initializes Remote Config and fetches values from the server
 * @returns {Promise<Result<object>>} The active configuration
 */
export async function initRemoteConfig() {
  return await timed("remote_config_init", async () => {
    try {
      const initRes = await initFirebase();
      if (!initRes.ok) return ok(applyDefaults());

      const { getRemoteConfig, fetchAndActivate, getValue } = await import(`${CDN}/firebase-remote-config.js`);

      rcInstance = getRemoteConfig(initRes.value.app);
      rcInstance.defaultConfig = { ...DEFAULTS };
      rcInstance.settings.minimumFetchIntervalMillis = 3600000; // 1 hour window

      await fetchAndActivate(rcInstance);

      configValues = {
        geminiMaxTokens:  getValue(rcInstance, 'gemini_max_tokens').asNumber(),
        showCommunity:    getValue(rcInstance, 'show_community_board').asBoolean(),
        newsEnabled:      getValue(rcInstance, 'election_news_enabled').asBoolean(),
        maxMessages:      getValue(rcInstance, 'max_chat_messages').asNumber(),
        welcomeMessage:   getValue(rcInstance, 'welcome_message').asString(),
        featuredQuestion: getValue(rcInstance, 'featured_question').asString(),
        maintenanceMode:  getValue(rcInstance, 'maintenance_mode').asBoolean(),
        ttsVoice:         getValue(rcInstance, 'tts_voice').asString(),
      };

      serviceStatus.update('remoteConfig', true);
      return ok(configValues);
    } catch (err) {
      serviceStatus.update('remoteConfig', false);
      return ok(applyDefaults());
    }
  });
}

/**
 * @description Applies fallback values if the remote server is unreachable
 * @returns {object} Default configuration
 */
function applyDefaults() {
  configValues = {
    geminiMaxTokens:  DEFAULTS.gemini_max_tokens,
    showCommunity:    DEFAULTS.show_community_board,
    newsEnabled:      DEFAULTS.election_news_enabled,
    maxMessages:      DEFAULTS.max_chat_messages,
    welcomeMessage:   DEFAULTS.welcome_message,
    featuredQuestion: DEFAULTS.featured_question,
    maintenanceMode:  DEFAULTS.maintenance_mode,
    ttsVoice:         DEFAULTS.tts_voice,
  };
  return configValues;
}

/**
 * @description Synchronous getter for current config (uses defaults if not init)
 * @returns {object}
 */
export function getConfig() {
  return configValues || applyDefaults();
}

/**
 * @description Checks if the application is locked for maintenance
 * @returns {boolean} True if in maintenance mode
 */
export function checkMaintenanceMode() {
  const cfg = getConfig();
  if (cfg.maintenanceMode) {
    showMaintenanceBanner();
    return true;
  }
  return false;
}

/**
 * @description Renders the maintenance overlay and disables interaction
 * @returns {void}
 */
function showMaintenanceBanner() {
  if (getEl('maintenance-banner')) return;
  
  const banner = document.createElement('div');
  banner.id = 'maintenance-banner';
  banner.className = 'maintenance-banner';
  banner.innerHTML = `
    <div class="maintenance-banner__content">
      <span class="material-symbols-outlined" style="font-size:48px;">engineering</span>
      <h2>System Maintenance</h2>
      <p>We are currently updating ElectIQ to serve you better. Please return shortly.</p>
    </div>`;
  
  document.body.appendChild(banner);
  
  // Disable core interaction points
  const chatInput = getEl('chat-input');
  if (chatInput) chatInput.disabled = true;
  
  const sendBtn = getEl('send-btn');
  if (sendBtn) sendBtn.disabled = true;
}
