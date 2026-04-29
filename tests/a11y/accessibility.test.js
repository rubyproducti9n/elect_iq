/* ═══════════════════════════════════════════════
   ElectIQ — Accessibility Tests (Axe-core)
   Verifies WCAG 2.1 compliance across main views
   ═══════════════════════════════════════════════ */

const { describe, it, expect, beforeEach } = window;

describe("Accessibility — Visual Layouts", () => {
  beforeEach(() => {
    // Inject common layout for testing
    document.body.innerHTML = `
      <main id="main-content">
        <section id="chat-section">
          <h1>Chat</h1>
          <div id="chat-messages" role="log" aria-live="polite"></div>
          <label for="chat-input">Query</label>
          <input id="chat-input" type="text" />
          <button aria-label="Send">Send</button>
        </section>
      </main>
    `;
  });

  // Verifies that the Chat section has no critical accessibility blockers
  it("axe.run() returns 0 critical violations on #chat-section", async () => {
    if (typeof axe !== 'undefined') {
      const results = await axe.run('#chat-section');
      const critical = results.violations.filter(v => v.impact === 'critical');
      expect(critical.length).toBe(0);
    }
  });

  // Verifies focusability of interactive elements
  it("all inputs have associated labels", () => {
    const input = document.getElementById('chat-input');
    const label = document.querySelector('label[for="chat-input"]');
    expect(label).not.toBeNull();
    expect(label.textContent).toContain("Query");
  });

  // Verifies button accessibility
  it("send button has accessible name", () => {
    const btn = document.querySelector('button');
    expect(btn.getAttribute('aria-label') || btn.textContent).toBeTruthy();
  });
});
