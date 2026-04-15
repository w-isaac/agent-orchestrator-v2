import { describe, it, expect } from 'vitest';
import { estimateTokens } from './tokenCounter';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(estimateTokens(null as any)).toBe(0);
    expect(estimateTokens(undefined as any)).toBe(0);
  });

  it('estimates tokens using chars/4 heuristic', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBe(100);
  });

  it('handles unicode text', () => {
    const text = '你好世界'.repeat(100);
    // Each CJK char is 3 bytes in UTF-8, but chars/4 counts JS string length
    expect(estimateTokens(text)).toBe(Math.ceil(400 / 4));
  });

  it('correctly identifies >100K token contexts', () => {
    const largeText = 'x'.repeat(400001); // 400001/4 = 100001 tokens
    expect(estimateTokens(largeText)).toBeGreaterThan(100000);
  });

  it('correctly identifies <100K token contexts', () => {
    const smallText = 'x'.repeat(399996); // 399996/4 = 99999 tokens
    expect(estimateTokens(smallText)).toBeLessThanOrEqual(100000);
  });
});
