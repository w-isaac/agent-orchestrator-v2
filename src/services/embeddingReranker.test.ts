import { describe, it, expect } from 'vitest';
import { cosineSimilarity, rerankCandidates, RerankConfig } from './embeddingReranker';
import { TraversalCandidate } from './graphTraversal';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('returns 0 for mismatched dimensions', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('rerankCandidates', () => {
  const candidates: TraversalCandidate[] = [
    { nodeId: 'A', graphProximityScore: 1.0, depth: 0, path: ['A'] },
    { nodeId: 'B', graphProximityScore: 0.8, depth: 1, path: ['A', 'B'] },
    { nodeId: 'C', graphProximityScore: 0.5, depth: 2, path: ['A', 'B', 'C'] },
  ];

  const queryEmbedding = [1, 0, 0];

  it('combines graph and embedding scores with default weights', () => {
    const embeddings = new Map<string, number[]>();
    embeddings.set('A', [0, 1, 0]); // orthogonal to query, similarity = 0
    embeddings.set('B', [1, 0, 0]); // identical to query, similarity = 1
    embeddings.set('C', [0.7, 0.7, 0]); // partial similarity

    const result = rerankCandidates(candidates, queryEmbedding, embeddings);

    // A: 0.6*1.0 + 0.4*0 = 0.6
    const nodeA = result.find((c) => c.nodeId === 'A')!;
    expect(nodeA.combinedScore).toBeCloseTo(0.6);

    // B: 0.6*0.8 + 0.4*1.0 = 0.88
    const nodeB = result.find((c) => c.nodeId === 'B')!;
    expect(nodeB.combinedScore).toBeCloseTo(0.88);

    // B should rank higher than A due to embedding boost
    expect(result[0].nodeId).toBe('B');
  });

  it('handles missing embeddings with score 0', () => {
    const embeddings = new Map<string, number[]>();
    // No embeddings at all

    const result = rerankCandidates(candidates, queryEmbedding, embeddings);

    // All embedding scores should be 0, so combined = 0.6 * graph
    const nodeA = result.find((c) => c.nodeId === 'A')!;
    expect(nodeA.embeddingScore).toBe(0);
    expect(nodeA.combinedScore).toBeCloseTo(0.6);
  });

  it('returns results sorted by combined score descending', () => {
    const embeddings = new Map<string, number[]>();
    embeddings.set('C', [1, 0, 0]); // High embedding match for low graph score

    const result = rerankCandidates(candidates, queryEmbedding, embeddings);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].combinedScore).toBeGreaterThanOrEqual(result[i].combinedScore);
    }
  });

  it('respects custom weight config', () => {
    const config: RerankConfig = { graphWeight: 0.3, embeddingWeight: 0.7 };
    const embeddings = new Map<string, number[]>();
    embeddings.set('A', [1, 0, 0]); // perfect match

    const result = rerankCandidates(candidates, queryEmbedding, embeddings, config);
    const nodeA = result.find((c) => c.nodeId === 'A')!;
    // 0.3*1.0 + 0.7*1.0 = 1.0
    expect(nodeA.combinedScore).toBeCloseTo(1.0);
  });
});
