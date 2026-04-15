/**
 * Phase 1: Graph Traversal
 * BFS from seed nodes with configurable edge-type scores and depth decay.
 */

export interface TraversalConfig {
  maxDepth: number;
  depthDecayFactor: number;
  edgeTypeScores: Record<string, number>;
}

export interface TraversalCandidate {
  nodeId: string;
  graphProximityScore: number;
  depth: number;
  path: string[];
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: string;
}

export const DEFAULT_TRAVERSAL_CONFIG: TraversalConfig = {
  maxDepth: 3,
  depthDecayFactor: 0.8,
  edgeTypeScores: {
    DEPENDS_ON: 1.0,
    REFERENCES: 0.8,
    IMPLEMENTS: 0.9,
    CONTAINS: 0.7,
    RELATES_TO: 0.5,
  },
};

/**
 * BFS traversal from seed nodes through the graph.
 * Each candidate receives a graph proximity score based on edge type weights
 * and depth decay: score = edgeWeight × decay^depth
 */
export function traverseGraph(
  seedNodeIds: string[],
  edges: GraphEdge[],
  config: TraversalConfig = DEFAULT_TRAVERSAL_CONFIG,
): TraversalCandidate[] {
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.sourceId)) adjacency.set(edge.sourceId, []);
    if (!adjacency.has(edge.targetId)) adjacency.set(edge.targetId, []);
    adjacency.get(edge.sourceId)!.push(edge);
    adjacency.get(edge.targetId)!.push({ ...edge, sourceId: edge.targetId, targetId: edge.sourceId });
  }

  const bestScores = new Map<string, TraversalCandidate>();

  // Initialize seeds with score 1.0 at depth 0
  const queue: Array<{ nodeId: string; depth: number; score: number; path: string[] }> = [];
  for (const seedId of seedNodeIds) {
    const candidate: TraversalCandidate = {
      nodeId: seedId,
      graphProximityScore: 1.0,
      depth: 0,
      path: [seedId],
    };
    bestScores.set(seedId, candidate);
    queue.push({ nodeId: seedId, depth: 0, score: 1.0, path: [seedId] });
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    if (current.depth >= config.maxDepth) continue;

    const neighbors = adjacency.get(current.nodeId) || [];
    for (const edge of neighbors) {
      const neighborId = edge.targetId;
      const edgeWeight = config.edgeTypeScores[edge.type] ?? 0.5;
      const newDepth = current.depth + 1;
      const newScore = current.score * edgeWeight * config.depthDecayFactor;

      if (newScore <= 0) continue;

      // Cycle detection: skip if already in path
      if (current.path.includes(neighborId)) continue;

      const existing = bestScores.get(neighborId);
      if (!existing || newScore > existing.graphProximityScore) {
        const candidate: TraversalCandidate = {
          nodeId: neighborId,
          graphProximityScore: newScore,
          depth: newDepth,
          path: [...current.path, neighborId],
        };
        bestScores.set(neighborId, candidate);
        queue.push({ nodeId: neighborId, depth: newDepth, score: newScore, path: candidate.path });
      }
    }
  }

  return Array.from(bestScores.values()).sort((a, b) => b.graphProximityScore - a.graphProximityScore);
}
