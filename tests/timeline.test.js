/* ═══════════════════════════════════════════════
   ElectIQ — Timeline Tests
   ═══════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../assets/js/sanitize.js', () => ({
  sanitizeOutput: (text) => text,
}));

const mockTimelineData = {
  timeline: [
    {
      date: 'Jan 1',
      title: 'Test Event',
      description: 'A test event description',
      tag: 'Test',
      completed: false,
    },
    {
      date: 'Feb 1',
      title: 'Second Event',
      description: 'Another event',
      tag: 'Phase 2',
      completed: true,
    },
  ],
};

describe('Timeline', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="timeline-container"></div>';

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockTimelineData),
    });

    // Mock IntersectionObserver
    global.IntersectionObserver = vi.fn().mockImplementation((callback) => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
  });

  it('should render timeline events from JSON data', async () => {
    const { initTimeline } = await import('../assets/js/timeline.js');
    await initTimeline('timeline-container');

    const container = document.getElementById('timeline-container');
    const events = container.querySelectorAll('.timeline__event');

    expect(events.length).toBe(2);
  });

  it('should mark completed events with correct class', async () => {
    const { initTimeline } = await import('../assets/js/timeline.js');
    await initTimeline('timeline-container');

    const events = document.querySelectorAll('.timeline__event');
    expect(events[1].classList.contains('timeline__event--completed')).toBe(true);
  });

  it('should render event titles correctly', async () => {
    const { initTimeline } = await import('../assets/js/timeline.js');
    await initTimeline('timeline-container');

    const titles = document.querySelectorAll('.timeline__title');
    expect(titles[0].textContent).toBe('Test Event');
    expect(titles[1].textContent).toBe('Second Event');
  });

  it('should render tags when present', async () => {
    const { initTimeline } = await import('../assets/js/timeline.js');
    await initTimeline('timeline-container');

    const tags = document.querySelectorAll('.timeline__tag');
    expect(tags.length).toBe(2);
    expect(tags[0].textContent).toBe('Test');
  });

  it('should handle missing container gracefully', async () => {
    const { initTimeline } = await import('../assets/js/timeline.js');
    // Should not throw
    await initTimeline('nonexistent-container');
  });
});
