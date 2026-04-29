/* ═══════════════════════════════════════════════
   ElectIQ — Service Status Module
   Tracks the health of cloud integrations
   ═══════════════════════════════════════════════ */

import { getEl } from './utils.js';

/**
 * @description Master registry of application dependencies
 */
const services = {
  gemini:       { name: 'AI Engine',   ok: null },
  firestore:    { name: 'Database',    ok: null },
  analytics:    { name: 'Analytics',   ok: null },
  remoteConfig: { name: 'Config',      ok: null },
  nlp:          { name: 'Language',    ok: null },
  tts:          { name: 'Voice',       ok: null },
};

/**
 * @description Manager for system-wide service health monitoring
 */
export const serviceStatus = {
  /**
   * @description Updates the health state of a specific service
   * @param {string} key - Service identifier
   * @param {boolean} isOk - Health status
   * @returns {void}
   */
  update(key, isOk) {
    if (services[key]) {
      services[key].ok = isOk;
      this.render();
    }
  },

  /**
   * @description Returns the full map of tracked services
   * @returns {object}
   */
  getAll() {
    return { ...services };
  },

  /**
   * @description Synchronizes the health dashboard in the UI
   * @returns {void}
   */
  render() {
    // Disabled to remove UI labels as per user request
  }
};
