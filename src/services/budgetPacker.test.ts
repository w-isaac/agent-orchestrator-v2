import { describe, it, expect } from 'vitest';
import { packBudget, NodeContent } from './budgetPacker';
import { RerankCandidate } from './embeddingReranker';

function makeCandidate(nodeId: string, score: number): RerankCandidate {
  return { nodeId, graphProximityScore: score, embeddingScore: 0, combinedScore: score, depth: 0 };
}

function makeContent(nodeId: string, fullTokens: number, summaryTokens: number): NodeContent {
  return {
    nodeId,
    fullContent: 'x'.repeat(fullTokens * 4),
    summary: 'y'.repeat(summaryTokens * 4),
    fullTokenCount: fullTokens,
    summaryTokenCount: summaryTokens,
  };
}

describe('budgetPacker', () => {
  it('packs full content when budget allows', () => {
    const candidates = [makeCandidate('A', 0.9), makeCandidate('B', 0.7)];
    const contents = new Map<string, NodeContent>();
    contents.set('A', makeContent('A', 100, 20));
    contents.set('B', makeContent('B', 100, 20));

    const result = packBudget(candidates, contents, 300);

    expect(result.packed.length).toBe(2);
    expect(result.packed[0].resolution).toBe('full');
    expect(result.packed[1].resolution).toBe('full');
    expect(result.totalTokens).toBe(200);
    expect(result.skipped.length).toBe(0);
  });

  it('falls back to summary when full does not fit', () => {
    const candidates = [makeCandidate('A', 0.9), makeCandidate('B', 0.7)];
    const contents = new Map<string, NodeContent>();
    contents.set('A', makeContent('A', 100, 20));
    contents.set('B', makeContent('B', 100, 20));

    const result = packBudget(candidates, contents, 120);

    expect(result.packed[0].nodeId).toBe('A');
    expect(result.packed[0].resolution).toBe('full');
    expect(result.packed[1].nodeId).toBe('B');
    expect(result.packed[1].resolution).toBe('summary');
    expect(result.totalTokens).toBe(120);
  });

  it('skips nodes when neither full nor summary fits', () => {
    const candidates = [makeCandidate('A', 0.9), makeCandidate('B', 0.7)];
    const contents = new Map<string, NodeContent>();
    contents.set('A', makeContent('A', 100, 50));
    contents.set('B', makeContent('B', 100, 50));

    const result = packBudget(candidates, contents, 100);

    expect(result.packed.length).toBe(1);
    expect(result.packed[0].nodeId).toBe('A');
    expect(result.skipped).toContain('B');
  });

  it('preserves ranking order - higher ranked nodes get priority', () => {
    const candidates = [
      makeCandidate('A', 0.9),
      makeCandidate('B', 0.8),
      makeCandidate('C', 0.7),
    ];
    const contents = new Map<string, NodeContent>();
    contents.set('A', makeContent('A', 50, 10));
    contents.set('B', makeContent('B', 50, 10));
    contents.set('C', makeContent('C', 50, 10));

    const result = packBudget(candidates, contents, 110);

    // A and B fit as full, C falls back to summary
    expect(result.packed[0].nodeId).toBe('A');
    expect(result.packed[0].resolution).toBe('full');
    expect(result.packed[1].nodeId).toBe('B');
    expect(result.packed[1].resolution).toBe('full');
    expect(result.packed[2].nodeId).toBe('C');
    expect(result.packed[2].resolution).toBe('summary');
  });

  it('skips nodes with no content entry', () => {
    const candidates = [makeCandidate('A', 0.9), makeCandidate('MISSING', 0.8)];
    const contents = new Map<string, NodeContent>();
    contents.set('A', makeContent('A', 50, 10));

    const result = packBudget(candidates, contents, 1000);

    expect(result.packed.length).toBe(1);
    expect(result.skipped).toContain('MISSING');
  });

  it('returns empty when budget is zero', () => {
    const candidates = [makeCandidate('A', 0.9)];
    const contents = new Map<string, NodeContent>();
    contents.set('A', makeContent('A', 50, 10));

    const result = packBudget(candidates, contents, 0);

    expect(result.packed.length).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it('handles nodes with zero token counts', () => {
    const candidates = [makeCandidate('A', 0.9)];
    const contents = new Map<string, NodeContent>();
    contents.set('A', makeContent('A', 0, 0));

    const result = packBudget(candidates, contents, 100);

    // 0-token content should be skipped (not useful)
    expect(result.skipped).toContain('A');
  });
});
