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

  describe('nested and overlapping tags', () => {
    const assertNoTagSurvives = (result: string | false): void => {
      expect(typeof result).toBe('string');
      expect(result).not.toMatch(/<[a-zA-Z!/][^<>]*>/);
    };

    it('does not reassemble a tag hidden inside another tag', () => {
      const result = sanitizeInput('<scr<script>ipt>');
      assertNoTagSurvives(result);
      expect(result).toBe('ipt>');
    });

    it('does not reassemble a full nested script element', () => {
      const result = sanitizeInput("<scr<script>ipt>alert('xss')</scr</script>ipt>");
      assertNoTagSurvives(result);
      expect(result).toBe("ipt>alert('xss')ipt>");
    });

    it('does not reassemble doubly-nested tags', () => {
      const result = sanitizeInput('<<script>script>alert(1)<</script>/script>');
      assertNoTagSurvives(result);
      expect(result).toBe('script>alert(1)/script>');
    });

    it('strips a tag whose content itself looks like a tag boundary', () => {
      const result = sanitizeInput('<img src=x onerror=alert(1)>');
      assertNoTagSurvives(result);
      expect(result).toBe('');
    });
  });
});
