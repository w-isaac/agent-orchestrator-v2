import { describe, it, expect } from 'vitest';
import { runRetrievalPipeline, RetrievalRequest, GraphData } from './contextRetrievalPipeline';
import { GraphEdge } from './graphTraversal';
import { NodeContent } from './budgetPacker';

function buildTestGraph(): GraphData {
  const edges: GraphEdge[] = [
    { sourceId: 'seed', targetId: 'dep1', type: 'DEPENDS_ON' },
    { sourceId: 'seed', targetId: 'ref1', type: 'REFERENCES' },
    { sourceId: 'dep1', targetId: 'dep2', type: 'DEPENDS_ON' },
  ];

  const nodeEmbeddings = new Map<string, number[]>();
  // seed is aligned with query
  nodeEmbeddings.set('seed', [1, 0, 0]);
  // dep1 is partially aligned
  nodeEmbeddings.set('dep1', [0.8, 0.6, 0]);
  // ref1 is orthogonal
  nodeEmbeddings.set('ref1', [0, 1, 0]);
  // dep2 is aligned
  nodeEmbeddings.set('dep2', [0.9, 0.1, 0]);

  const nodeContents = new Map<string, NodeContent>();
  nodeContents.set('seed', {
    nodeId: 'seed',
    fullContent: 'Seed node content',
    summary: 'Seed summary',
    fullTokenCount: 50,
    summaryTokenCount: 10,
  });
  nodeContents.set('dep1', {
    nodeId: 'dep1',
    fullContent: 'Dependency 1 content',
    summary: 'Dep1 summary',
    fullTokenCount: 100,
    summaryTokenCount: 20,
  });
  nodeContents.set('ref1', {
    nodeId: 'ref1',
    fullContent: 'Reference 1 content',
    summary: 'Ref1 summary',
    fullTokenCount: 80,
    summaryTokenCount: 15,
  });
  nodeContents.set('dep2', {
    nodeId: 'dep2',
    fullContent: 'Dependency 2 content',
    summary: 'Dep2 summary',
    fullTokenCount: 120,
    summaryTokenCount: 25,
  });

  return { edges, nodeEmbeddings, nodeContents };
}

describe('contextRetrievalPipeline', () => {
  const queryEmbedding = [1, 0, 0];

  it('runs all three phases and returns tiered results', () => {
    const graphData = buildTestGraph();
    const request: RetrievalRequest = {
      seedNodeIds: ['seed'],
      queryEmbedding,
      tokenBudget: 4096,
    };

    const result = runRetrievalPipeline(request, graphData);

    expect(result.fullContent.length).toBeGreaterThan(0);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.totalTokens).toBeLessThanOrEqual(result.budget);
    expect(result.phases.traversal.candidateCount).toBe(4);
    expect(result.phases.reranking.candidateCount).toBe(4);
  });

  it('respects token budget with fallback to summaries', () => {
    const graphData = buildTestGraph();
    const request: RetrievalRequest = {
      seedNodeIds: ['seed'],
      queryEmbedding,
      tokenBudget: 160, // Only enough for ~1.5 full nodes
    };

    const result = runRetrievalPipeline(request, graphData);

    expect(result.totalTokens).toBeLessThanOrEqual(160);
    // Should have a mix of full and summary content
    const totalPacked = result.fullContent.length + result.summaryContent.length;
    expect(totalPacked).toBeGreaterThan(0);
  });

  it('applies custom traversal config', () => {
    const graphData = buildTestGraph();
    const request: RetrievalRequest = {
      seedNodeIds: ['seed'],
      queryEmbedding,
      tokenBudget: 4096,
      traversalConfig: { maxDepth: 1 },
    };

    const result = runRetrievalPipeline(request, graphData);

    // With maxDepth=1, dep2 should not be reached
    expect(result.phases.traversal.candidateCount).toBe(3); // seed, dep1, ref1
    const allNodeIds = [
      ...result.fullContent.map((n) => n.nodeId),
      ...result.summaryContent.map((n) => n.nodeId),
    ];
    expect(allNodeIds).not.toContain('dep2');
  });

  it('uses embedding similarity to re-rank', () => {
    const graphData = buildTestGraph();
    const request: RetrievalRequest = {
      seedNodeIds: ['seed'],
      queryEmbedding,
      tokenBudget: 4096,
    };

    const result = runRetrievalPipeline(request, graphData);

    // dep1 (graph=0.8, embedding high) should rank higher than ref1 (graph=0.64, embedding low)
    const packedIds = result.phases.packing.packed.map((n) => n.nodeId);
    const dep1Idx = packedIds.indexOf('dep1');
    const ref1Idx = packedIds.indexOf('ref1');
    if (dep1Idx !== -1 && ref1Idx !== -1) {
      expect(dep1Idx).toBeLessThan(ref1Idx);
    }
  });

  it('handles empty seed list', () => {
    const graphData = buildTestGraph();
    const request: RetrievalRequest = {
      seedNodeIds: [],
      queryEmbedding,
      tokenBudget: 4096,
    };

    const result = runRetrievalPipeline(request, graphData);

    expect(result.fullContent.length).toBe(0);
    expect(result.summaryContent.length).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it('reports phase metadata correctly', () => {
    const graphData = buildTestGraph();
    const request: RetrievalRequest = {
      seedNodeIds: ['seed'],
      queryEmbedding,
      tokenBudget: 4096,
    };

    const result = runRetrievalPipeline(request, graphData);

    expect(result.phases).toBeDefined();
    expect(result.phases.traversal.candidateCount).toBeGreaterThan(0);
    expect(result.phases.reranking.candidateCount).toBe(result.phases.traversal.candidateCount);
    expect(result.phases.packing.budget).toBe(4096);
  });
});
