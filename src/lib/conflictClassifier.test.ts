import { describe, it, expect } from 'vitest';
import { computeContentHash, classify } from './conflictClassifier';

describe('conflictClassifier', () => {
  describe('computeContentHash', () => {
    it('returns a 64-char SHA-256 hex digest', () => {
      const hash = computeContentHash('hello');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces identical hashes for identical content', () => {
      expect(computeContentHash('abc')).toBe(computeContentHash('abc'));
    });

    it('produces different hashes for different content', () => {
      expect(computeContentHash('abc')).not.toBe(computeContentHash('abcd'));
    });

    it('treats null/undefined content as empty string', () => {
      const empty = computeContentHash('');
      expect(computeContentHash(null)).toBe(empty);
      expect(computeContentHash(undefined)).toBe(empty);
    });
  });

  describe('classify', () => {
    it('returns no_conflict when hashes match', () => {
      expect(
        classify(
          { content: 'same', type: 'code' },
          { content: 'same', type: 'code' },
        ),
      ).toBe('no_conflict');
    });

    it('returns non_overlapping when artifact types differ', () => {
      expect(
        classify(
          { content: 'a', type: 'code' },
          { content: 'b', type: 'doc' },
        ),
      ).toBe('non_overlapping');
    });

    it('returns compatible when current strictly extends snapshot (additive only)', () => {
      expect(
        classify(
          { content: 'foo', type: 'code' },
          { content: 'foo bar', type: 'code' },
        ),
      ).toBe('compatible');
    });

    it('returns incompatible when content diverges and is not additive', () => {
      expect(
        classify(
          { content: 'foo', type: 'code' },
          { content: 'baz', type: 'code' },
        ),
      ).toBe('incompatible');
    });

    it('honors precomputed hashes when provided', () => {
      const same = computeContentHash('x');
      expect(
        classify(
          { content: 'ignored1', hash: same },
          { content: 'ignored2', hash: same },
        ),
      ).toBe('no_conflict');
    });
  });
});
