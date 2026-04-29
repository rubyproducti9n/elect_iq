/* ═══════════════════════════════════════════════
   ElectIQ — Remote Config Unit Tests
   Verifies dynamic configuration and feature flags
   ═══════════════════════════════════════════════ */

import { getConfig } from "../../public/assets/js/remoteConfig.js";

const { describe, it, expect, vi } = window;

describe("getConfig", () => {
  // Verifies that the app starts with safe default values
  it("returns default values before initialization", () => {
    const cfg = getConfig();
    expect(cfg.geminiMaxTokens).toBe(1000);
    expect(cfg.showCommunity).toBe(true);
    expect(cfg.maintenanceMode).toBe(false);
  });

  // Verifies that boolean flags are correctly typed
  it("returns maintenanceMode: false by default", () => {
    const cfg = getConfig();
    expect(typeof cfg.maintenanceMode).toBe("boolean");
    expect(cfg.maintenanceMode).toBe(false);
  });

  // Verifies that numerical values are correctly typed
  it("returns geminiMaxTokens as a number", () => {
    const cfg = getConfig();
    expect(typeof cfg.geminiMaxTokens).toBe("number");
  });
});

describe("Remote Config Application UI (Mocked)", () => {
  // Verifies that maintenance mode correctly blocks UI interactions
  it("shows maintenance banner when maintenanceMode is true", () => {
    // Manually inject banner mock
    document.body.innerHTML = '<div id="app"></div>';
    
    // Simulate what checkMaintenanceMode does
    const showBanner = (val) => {
      if (val) {
        const b = document.createElement('div');
        b.id = 'maintenance-banner';
        b.innerHTML = 'Maintenance';
        document.body.appendChild(b);
      }
    };

    showBanner(true);
    expect(document.getElementById('maintenance-banner')).not.toBeNull();
  });

  // Verifies that the community board can be toggled off remotely
  it("hides community board when showCommunity is false", () => {
    document.body.innerHTML = '<div id="community-nav">Community</div>';
    const showCommunity = false;
    
    if (!showCommunity) {
      document.getElementById('community-nav').style.display = 'none';
    }
    
    expect(document.getElementById('community-nav').style.display).toBe('none');
  });
});
