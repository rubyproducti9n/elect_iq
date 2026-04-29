/* ═══════════════════════════════════════════════
   ElectIQ — NLP Service Unit Tests
   Verifies sentiment analysis and intent classification
   ═══════════════════════════════════════════════ */

import { analyzeUserSentiment, classifyUserIntent, getSentimentPromptPrefix } from "../../public/assets/js/nlp.js";

const { describe, it, expect, vi, beforeEach } = window;

globalThis.fetch = vi.fn();

describe("analyzeUserSentiment", () => {
  beforeEach(() => vi.clearAllMocks());

  // Verifies that the API response is correctly mapped to our internal format
  it("returns score and magnitude from API response", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documentSentiment: { score: 0.8, magnitude: 0.9 } })
    });
    const res = await analyzeUserSentiment("Great job!");
    expect(res).toEqual({ score: 0.8, magnitude: 0.9 });
  });

  // Verifies fallback values when the API fails
  it("returns { score: 0, magnitude: 0 } on API error", async () => {
    fetch.mockResolvedValue({ ok: false, status: 500 });
    const res = await analyzeUserSentiment("test");
    expect(res).toEqual({ score: 0, magnitude: 0 });
  });

  // Verifies that the request body matches Google Cloud NLP requirements
  it("sends correct request body format to NLP API", async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await analyzeUserSentiment("election info");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.document.content).toBe("election info");
    expect(body.document.type).toBe("PLAIN_TEXT");
  });
});

describe("sentiment-based prompt modification", () => {
  // Verifies that negative sentiment triggers a patience-focused prompt
  it("prepends patience instruction for score < -0.5", () => {
    const prefix = getSentimentPromptPrefix(-0.6);
    expect(prefix).toContain("user seems frustrated");
    expect(prefix).toContain("extra patient");
  });

  // Verifies that positive sentiment triggers an engagement-focused prompt
  it("prepends engagement instruction for score > 0.5", () => {
    const prefix = getSentimentPromptPrefix(0.7);
    expect(prefix).toContain("user is engaged");
    expect(prefix).toContain("offer more detailed information");
  });

  // Verifies that neutral sentiment results in no extra instructions
  it("makes no modification for neutral score (-0.5 to 0.5)", () => {
    expect(getSentimentPromptPrefix(0)).toBe("");
    expect(getSentimentPromptPrefix(-0.3)).toBe("");
    expect(getSentimentPromptPrefix(0.4)).toBe("");
  });
});

describe("classifyUserIntent (Local Fallback)", () => {
  // Verifies keyword-based intent detection when API is skipped
  it("detects Voter Registration intent from keywords", async () => {
    const intent = await classifyUserIntent("How do I register to vote?");
    expect(intent).toBe("🗳️ Voter Registration");
  });

  it("detects EVM intent from keywords", async () => {
    const intent = await classifyUserIntent("Is the machine safe?");
    expect(intent).toBe("🖥️ EVM & Technology");
  });

  it("detects Schedule intent from keywords", async () => {
    const intent = await classifyUserIntent("When is the election date?");
    expect(intent).toBe("📅 Election Schedule");
  });

  it("returns General Query for unknown topics", async () => {
    const intent = await classifyUserIntent("Hello there");
    expect(intent).toBe("💬 General Query");
  });
});
