import { describe, expect, it } from 'vitest';

import { sanitizeInput } from './sanitizeInput.js';

describe('sanitizeInput', () => {
  it('returns false for non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeInput(123 as any)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeInput(null as any)).toBe(false);
  });

  it('removes HTML tags but preserves inner text', () => {
    expect(sanitizeInput('<b>bold</b> text')).toBe('bold text');
    expect(sanitizeInput("<script>alert('xss')</script>Hello")).toBe("alert('xss')Hello");
  });

  it('removes HTML entities', () => {
    expect(sanitizeInput('Hello &amp; World')).toBe('Hello World');
  });

  it('preserves URLs', () => {
    const input = 'Visit https://example.com/page?q=1 for info';
    expect(sanitizeInput(input)).toBe(input);
  });

  it('normalizes whitespace', () => {
    expect(sanitizeInput('  hello    world  ')).toBe('hello world');
  });

  it('preserves line breaks', () => {
    expect(sanitizeInput('line1\nline2')).toBe('line1\nline2');
  });
});
