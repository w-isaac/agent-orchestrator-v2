import { describe, it, expect } from 'vitest';
import { cosineSimilarity, findSimilarArtifacts } from './embeddingSimilarity';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it('handles zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('handles empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('handles mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });

  it('computes correct similarity for non-trivial vectors', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // dot = 4+10+18 = 32, normA = sqrt(14), normB = sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
  });
});

describe('findSimilarArtifacts', () => {
  it('returns candidates above threshold', () => {
    const source = [1, 0, 0];
    const candidates = [
      { artifactId: 'a', embedding: [1, 0, 0] },    // similarity 1.0
      { artifactId: 'b', embedding: [0, 1, 0] },    // similarity 0.0
      { artifactId: 'c', embedding: [0.9, 0.1, 0] }, // high similarity
    ];
    const result = findSimilarArtifacts(source, candidates, 0.7);
    expect(result.length).toBe(2);
    expect(result[0].artifactId).toBe('a');
    expect(result[0].similarity).toBe(1);
  });

  it('returns empty when no candidates exceed threshold', () => {
    const source = [1, 0];
    const candidates = [
      { artifactId: 'a', embedding: [0, 1] },
    ];
    expect(findSimilarArtifacts(source, candidates, 0.7)).toEqual([]);
  });

  it('rounds similarity to 2 decimal places', () => {
    const source = [1, 2, 3];
    const candidates = [
      { artifactId: 'a', embedding: [1, 2, 3.01] },
    ];
    const result = findSimilarArtifacts(source, candidates, 0.5);
    expect(result[0].similarity).toBe(1); // rounds to 1.00
  });
});
