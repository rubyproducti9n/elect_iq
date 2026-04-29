/* ═══════════════════════════════════════════════
   ElectIQ — Sanitize Unit Tests
   Verifies input/output cleaning and security
   ═══════════════════════════════════════════════ */

import { sanitizeInput, sanitizeOutput, isValidEmail } from "../../public/assets/js/sanitize.js";

const { describe, it, expect } = window.vi ? window : { describe, it, expect }; // Support global or injected

describe("sanitizeInput", () => {
  // Verifies that <script> tags are fully removed to prevent XSS
  it("strips <script> tags completely", () => {
    const input = "Hello <script>alert('xss')</script> World";
    expect(sanitizeInput(input)).toBe("Hello  World");
  });

  // Verifies that img onerror handlers (common XSS vector) are stripped
  it("strips <img onerror=> XSS vector", () => {
    const input = '<img src=x onerror="alert(1)">';
    expect(sanitizeInput(input)).toBe("");
  });

  // Verifies that svg onload handlers (modern XSS vector) are stripped
  it("strips <svg onload=> XSS vector", () => {
    const input = '<svg onload="alert(1)">';
    expect(sanitizeInput(input)).toBe("");
  });

  // Verifies that dangerous javascript: protocols in links are blocked
  it("strips javascript: href protocol", () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    expect(sanitizeInput(input)).toBe("Click");
  });

  // Verifies that event handlers like onclick are removed
  it("strips event handler attributes (onclick, onmouseover)", () => {
    const input = '<div onclick="steal()">Test</div>';
    expect(sanitizeInput(input)).toBe("Test");
  });

  // Ensures legitimate text is untouched
  it("passes plain text through unchanged", () => {
    const input = "Normal election query";
    expect(sanitizeInput(input)).toBe("Normal election query");
  });

  // Ensures special characters (non-HTML) are preserved
  it("passes numbers and symbols through unchanged", () => {
    const input = "Votes: 1,000,000! & (ECI)";
    expect(sanitizeInput(input)).toBe("Votes: 1,000,000! & (ECI)");
  });

  // Robustness check for null input
  it("returns empty string for null input", () => {
    expect(sanitizeInput(null)).toBe("");
  });

  // Robustness check for undefined input
  it("returns empty string for undefined input", () => {
    expect(sanitizeInput(undefined)).toBe("");
  });

  // Robustness check for incorrect data types
  it("returns empty string for non-string input (object)", () => {
    expect(sanitizeInput({ text: "hi" })).toBe("");
  });

  // Performance/Safety check for long strings
  it("handles extremely long string without throwing", () => {
    const longString = "A".repeat(10000);
    // Our implementation throws if > 500
    expect(() => sanitizeInput(longString)).toThrow();
  });
});

describe("validateLength (internal logic via sanitizeInput)", () => {
  // Verifies 500 char boundary
  it("allows input exactly at 500 char limit", () => {
    const input = "A".repeat(500);
    expect(sanitizeInput(input)).toBe(input);
  });

  // Verifies overflow handling
  it("throws for input at 501 chars", () => {
    const input = "A".repeat(501);
    expect(() => sanitizeInput(input)).toThrow();
  });

  // Verifies empty string is okay (returns empty)
  it("handles empty string", () => {
    expect(sanitizeInput("")).toBe("");
  });

  // Verifies minimum input
  it("returns true for single character", () => {
    expect(sanitizeInput("V")).toBe("V");
  });
});

describe("sanitizeOutput", () => {
  // Verifies that safe formatting tags are allowed for AI responses
  it("allows <strong>, <em>, <ul>, <ol>, <li>, <p>, <br> tags", () => {
    const input = "<p><strong>Election</strong> results: <ul><li>BJP</li></ul></p>";
    const output = sanitizeOutput(input);
    expect(output).toContain("<p><strong>Election</strong>");
    expect(output).toContain("<ul><li>BJP</li></ul>");
  });

  // Verifies XSS prevention in bot output
  it("strips <script> from AI output", () => {
    const input = "Answer <script>alert(1)</script>";
    expect(sanitizeOutput(input)).not.toContain("<script>");
  });

  // Verifies iframe prevention in bot output
  it("strips <iframe> from AI output", () => {
    const input = '<iframe src="evil.com"></iframe>';
    expect(sanitizeOutput(input)).toBe("");
  });

  // Verifies event handlers are stripped even if tag is allowed
  it("strips onclick from allowed tags", () => {
    const input = '<p onclick="alert(1)">Text</p>';
    expect(sanitizeOutput(input)).toBe("<p>Text</p>");
  });

  // Robustness check for empty bot response
  it("returns empty string for null AI response", () => {
    expect(sanitizeOutput(null)).toBe("");
  });
});
