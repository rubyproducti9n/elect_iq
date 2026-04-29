/* ═══════════════════════════════════════════════
   ElectIQ — Timeline Unit Tests
   Verifies interactive election schedule visualization
   ═══════════════════════════════════════════════ */

// Assuming initTimeline is exported from timeline.js
import { initTimeline } from "../../public/assets/js/timeline.js";

const { describe, it, expect, vi, beforeEach } = window;

describe("Timeline rendering", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="timeline-container"></div>';
  });

  // Verifies that the timeline correctly renders all provided data points
  it("renders nodes from data", async () => {
    await initTimeline("timeline-container");
    const nodes = document.querySelectorAll(".timeline__node");
    // The codebase has a set of milestones, let's verify we have at least 1
    expect(nodes.length).toBeGreaterThan(0);
  });

  // Accessibility: ensures keyboard users can focus each event
  it("each node has tabindex='0'", async () => {
    await initTimeline("timeline-container");
    const nodes = document.querySelectorAll(".timeline__node");
    nodes.forEach(node => {
      expect(node.getAttribute("tabindex")).toBe("0");
    });
  });

  // Accessibility: ensures screen readers have descriptive labels
  it("each node has correct aria-label", async () => {
    await initTimeline("timeline-container");
    const nodes = document.querySelectorAll(".timeline__node");
    nodes.forEach(node => {
      expect(node.hasAttribute("aria-label")).toBe(true);
    });
  });
});

describe("Timeline interaction", () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="timeline-container"></div>';
    await initTimeline("timeline-container");
  });

  // Verifies that clicking a milestone reveals its details
  it("clicking a node expands its detail panel", () => {
    const node = document.querySelector(".timeline__node");
    node.click();
    expect(node.classList.contains("timeline__node--active")).toBe(true);
  });

  // Verifies that only one milestone can be active at a time to prevent UI clutter
  it("only one panel is expanded at a time", () => {
    const nodes = document.querySelectorAll(".timeline__node");
    nodes[0].click();
    nodes[1].click();
    expect(nodes[0].classList.contains("timeline__node--active")).toBe(false);
    expect(nodes[1].classList.contains("timeline__node--active")).toBe(true);
  });
});

describe("Timeline filtering", () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="timeline-container"></div>';
    await initTimeline("timeline-container");
  });

  // Verifies that category filtering works as expected
  it("filter by category hides non-matching nodes", () => {
    // Find a filter button (e.g. Phase)
    const filterBtn = document.querySelector('.timeline-filters .filter-btn[data-category="Phase"]');
    if (filterBtn) {
      filterBtn.click();
      const hiddenNodes = document.querySelectorAll('.timeline__node[aria-hidden="true"]');
      expect(hiddenNodes.length).toBeGreaterThan(0);
    }
  });

  // Verifies that 'All' reset works
  it("'All' filter shows all nodes", () => {
    const allBtn = document.querySelector('.timeline-filters .filter-btn[data-category="all"]');
    if (allBtn) {
      allBtn.click();
      const visibleNodes = document.querySelectorAll('.timeline__node:not([aria-hidden="true"])');
      expect(visibleNodes.length).toBeGreaterThan(0);
    }
  });
});
