/* ═══════════════════════════════════════════════
   ElectIQ — Sanitizer Tests
   ═══════════════════════════════════════════════ */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  sanitizeInput,
  sanitizeOutput,
  isValidEmail,
  sanitizeUrl,
} from '../assets/js/sanitize.js';

// Mock DOMPurify in jsdom
beforeAll(() => {
  // Provide a simple DOMPurify mock
  globalThis.DOMPurify = {
    sanitize: (str, opts) => {
      if (opts?.ALLOWED_TAGS?.length === 0) {
        return str.replace(/<[^>]*>/g, '');
      }
      // Strip script/style tags
      return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    },
  };
});

describe('sanitizeInput', () => {
  it('should strip all HTML tags from input', () => {
    const result = sanitizeInput('<script>alert("xss")</script>Hello');
    expect(result).not.toContain('<script>');
    expect(result).toContain('Hello');
  });

  it('should trim whitespace', () => {
    expect(sanitizeInput('  hello world  ')).toBe('hello world');
  });

  it('should truncate long input to 4000 chars', () => {
    const longInput = 'a'.repeat(5000);
    expect(sanitizeInput(longInput).length).toBe(4000);
  });

  it('should return empty string for non-string input', () => {
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
    expect(sanitizeInput(42)).toBe('');
  });
});

describe('sanitizeOutput', () => {
  it('should remove script tags from output', () => {
    const result = sanitizeOutput('<p>Safe</p><script>evil()</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('Safe');
  });

  it('should return empty string for non-string input', () => {
    expect(sanitizeOutput(null)).toBe('');
  });
});

describe('isValidEmail', () => {
  it('should validate correct emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('test.user@domain.org')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('@missing.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
  });
});

describe('sanitizeUrl', () => {
  it('should allow http/https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
    expect(sanitizeUrl('http://test.org/page')).toBe('http://test.org/page');
  });

  it('should reject javascript: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
  });

  it('should reject invalid URLs', () => {
    expect(sanitizeUrl('not a url')).toBeNull();
  });
});
