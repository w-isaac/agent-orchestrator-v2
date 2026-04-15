import { describe, it, expect } from 'vitest';
import { traverseGraph, GraphEdge, TraversalConfig, DEFAULT_TRAVERSAL_CONFIG } from './graphTraversal';

describe('graphTraversal', () => {
  const edges: GraphEdge[] = [
    { sourceId: 'A', targetId: 'B', type: 'DEPENDS_ON' },
    { sourceId: 'B', targetId: 'C', type: 'REFERENCES' },
    { sourceId: 'C', targetId: 'D', type: 'IMPLEMENTS' },
    { sourceId: 'A', targetId: 'E', type: 'RELATES_TO' },
  ];

  it('returns seed nodes with score 1.0 at depth 0', () => {
    const result = traverseGraph(['A'], edges);
    const seedNode = result.find((c) => c.nodeId === 'A');
    expect(seedNode).toBeDefined();
    expect(seedNode!.graphProximityScore).toBe(1.0);
    expect(seedNode!.depth).toBe(0);
  });

  it('traverses to neighbors with decay applied', () => {
    const config: TraversalConfig = {
      maxDepth: 1,
      depthDecayFactor: 0.8,
      edgeTypeScores: { DEPENDS_ON: 1.0, RELATES_TO: 0.5 },
    };
    const result = traverseGraph(['A'], edges, config);

    const nodeB = result.find((c) => c.nodeId === 'B');
    expect(nodeB).toBeDefined();
    // score = 1.0 * 1.0 (DEPENDS_ON) * 0.8 (decay) = 0.8
    expect(nodeB!.graphProximityScore).toBeCloseTo(0.8);
    expect(nodeB!.depth).toBe(1);

    const nodeE = result.find((c) => c.nodeId === 'E');
    expect(nodeE).toBeDefined();
    // score = 1.0 * 0.5 (RELATES_TO) * 0.8 (decay) = 0.4
    expect(nodeE!.graphProximityScore).toBeCloseTo(0.4);
  });

  it('respects maxDepth', () => {
    const config: TraversalConfig = {
      maxDepth: 1,
      depthDecayFactor: 0.8,
      edgeTypeScores: { DEPENDS_ON: 1.0, REFERENCES: 0.8 },
    };
    const result = traverseGraph(['A'], edges, config);
    const nodeC = result.find((c) => c.nodeId === 'C');
    expect(nodeC).toBeUndefined();
  });

  it('applies multi-hop decay correctly', () => {
    const config: TraversalConfig = {
      maxDepth: 3,
      depthDecayFactor: 0.8,
      edgeTypeScores: { DEPENDS_ON: 1.0, REFERENCES: 0.8, IMPLEMENTS: 0.9 },
    };
    const result = traverseGraph(['A'], edges, config);

    const nodeC = result.find((c) => c.nodeId === 'C');
    expect(nodeC).toBeDefined();
    // A->B (1.0*0.8) = 0.8, B->C (0.8*0.8*0.8) = 0.512
    expect(nodeC!.graphProximityScore).toBeCloseTo(0.512);
    expect(nodeC!.depth).toBe(2);

    const nodeD = result.find((c) => c.nodeId === 'D');
    expect(nodeD).toBeDefined();
    // C->D: 0.512 * 0.9 * 0.8 = 0.36864
    expect(nodeD!.graphProximityScore).toBeCloseTo(0.36864);
  });

  it('handles cycles without infinite loop', () => {
    const cyclicEdges: GraphEdge[] = [
      { sourceId: 'A', targetId: 'B', type: 'DEPENDS_ON' },
      { sourceId: 'B', targetId: 'C', type: 'DEPENDS_ON' },
      { sourceId: 'C', targetId: 'A', type: 'DEPENDS_ON' },
    ];
    const result = traverseGraph(['A'], cyclicEdges);
    // Should complete without hanging
    expect(result.length).toBe(3);
  });

  it('handles multiple seed nodes', () => {
    const result = traverseGraph(['A', 'D'], edges);
    const seedA = result.find((c) => c.nodeId === 'A');
    const seedD = result.find((c) => c.nodeId === 'D');
    expect(seedA!.graphProximityScore).toBe(1.0);
    expect(seedD!.graphProximityScore).toBe(1.0);
  });

  it('returns results sorted by score descending', () => {
    const result = traverseGraph(['A'], edges);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].graphProximityScore).toBeGreaterThanOrEqual(result[i].graphProximityScore);
    }
  });

  it('uses default score 0.5 for unknown edge types', () => {
    const unknownEdges: GraphEdge[] = [
      { sourceId: 'X', targetId: 'Y', type: 'UNKNOWN_TYPE' },
    ];
    const config: TraversalConfig = {
      maxDepth: 1,
      depthDecayFactor: 0.8,
      edgeTypeScores: {},
    };
    const result = traverseGraph(['X'], unknownEdges, config);
    const nodeY = result.find((c) => c.nodeId === 'Y');
    expect(nodeY).toBeDefined();
    // Default 0.5 * 0.8 decay = 0.4
    expect(nodeY!.graphProximityScore).toBeCloseTo(0.4);
  });

  it('returns empty array for empty seed list', () => {
    const result = traverseGraph([], edges);
    expect(result).toEqual([]);
  });
});
