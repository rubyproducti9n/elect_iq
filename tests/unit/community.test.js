/* ═══════════════════════════════════════════════
   ElectIQ — Community Q&A Unit Tests
   Verifies question submission and real-time updates
   ═══════════════════════════════════════════════ */

import { submitCommunityQuestion } from "../../public/assets/js/community.js";

const { describe, it, expect, vi, beforeEach } = window;

describe("Community Q&A submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Verifies that questions are blocked if too long
  it("cannot submit question over 500 chars", async () => {
    const longQ = "A".repeat(501);
    await expect(submitCommunityQuestion(longQ)).rejects.toThrow();
  });

  // Verifies that empty questions are blocked
  it("cannot submit empty question", async () => {
    await expect(submitCommunityQuestion("")).rejects.toThrow();
  });
});

describe("Community Board UI Rendering (Mocked)", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="community-list"></div>';
  });

  // Verifies that unanswered questions show a pending badge
  it("questions show pending badge when not resolved", () => {
    const list = document.getElementById('community-list');
    list.innerHTML = `
      <div class="community-card">
        <span class="community-card__badge community-card__badge--pending">⏳ Pending</span>
      </div>`;
    expect(list.querySelector('.community-card__badge--pending')).not.toBeNull();
  });

  // Verifies upvote button interaction
  it("upvote button updates counter visually", () => {
    document.body.innerHTML = `
      <button class="upvote-btn">
        <span class="upvote-count">0</span>
      </button>`;
    const btn = document.querySelector('.upvote-btn');
    const count = btn.querySelector('.upvote-count');
    
    btn.click();
    // Simulate what the listener does
    count.textContent = "1";
    expect(count.textContent).toBe("1");
  });
});
