describe('Accessibility (axe-core)', () => {
  beforeEach(() => {
    document.getElementById('mock-dom-container').innerHTML = '';
  });

  it('assert zero critical violations on #chat-section', async () => {
    document.getElementById('mock-dom-container').innerHTML = \`
      <div id="chat-section" role="region" aria-label="Chat">
        <input type="text" id="test-input" aria-label="Chat Input" />
        <button id="test-btn" aria-label="Send">Send</button>
      </div>
    \`;
    const results = await axe.run('#chat-section');
    const criticals = results.violations.filter(v => v.impact === 'critical');
    if (criticals.length > 0) {
      console.error('A11y Criticals:', criticals);
    }
    expect(criticals.length).to.equal(0);
  });

  it('assert zero critical violations on #timeline-section', async () => {
    document.getElementById('mock-dom-container').innerHTML = \`
      <div id="timeline-section" role="region" aria-label="Timeline">
        <button class="timeline-node" aria-label="Node 1 - Jan 1"></button>
      </div>
    \`;
    const results = await axe.run('#timeline-section');
    const criticals = results.violations.filter(v => v.impact === 'critical');
    if (criticals.length > 0) {
      console.error('A11y Criticals:', criticals);
    }
    expect(criticals.length).to.equal(0);
  });
});
