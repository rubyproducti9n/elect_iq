import { sanitizeInput, sanitizeOutput } from '../assets/js/sanitize.js';

describe('sanitize.js Module', () => {
  it('strips <script> tags from user input', () => {
    const input = '<script>alert("hack")</script>hello';
    const result = sanitizeInput(input);
    expect(result).to.equal('hello');
  });

  it('strips onclick attributes', () => {
    const input = '<button onclick="steal()">Click</button>';
    const result = sanitizeInput(input);
    expect(result).to.not.include('onclick');
  });

  it('allows plain text through unchanged', () => {
    const input = 'What is an EVM?';
    expect(sanitizeInput(input)).to.equal(input);
  });

  it('truncates input over 500 characters', () => {
    const input = 'A'.repeat(501);
    expect(() => sanitizeInput(input)).to.throw('Input exceeds maximum length of 500 characters.');
  });

  it('handles empty string input', () => {
    expect(sanitizeInput('')).to.equal('');
  });

  it('handles null/undefined input gracefully', () => {
    expect(sanitizeInput(null)).to.equal('');
    expect(sanitizeInput(undefined)).to.equal('');
  });
});
