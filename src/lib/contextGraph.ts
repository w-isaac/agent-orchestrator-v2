import { Pool } from 'pg';

export interface SubgraphNode {
  id: string;
  project_id: string;
  type: string;
  label: string | null;
  content: string | null;
  staleness_ttl_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface SubgraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  metadata: any;
  created_at: string;
}

export interface Subgraph {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
}

/**
 * BFS expansion from seed nodes up to the given depth.
 * depth=0 returns only the seed nodes (no edges).
 * Hard cap at depth 5.
 */
export async function expandFromSeeds(
  pool: Pool,
  seedNodeIds: string[],
  depth: number,
): Promise<Subgraph> {
  const effectiveDepth = Math.min(Math.max(depth, 0), 5);

  if (seedNodeIds.length === 0) {
    return { nodes: [], edges: [] };
  }

  const visitedNodeIds = new Set<string>(seedNodeIds);
  const collectedEdges: SubgraphEdge[] = [];

  for (let d = 0; d < effectiveDepth; d++) {
    const currentIds = Array.from(visitedNodeIds);
    const placeholders = currentIds.map((_, i) => `$${i + 1}`).join(',');

    const { rows: edges } = await pool.query(
      `SELECT id, source_id, target_id, type, metadata, created_at
       FROM context_edges
       WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
      currentIds,
    );

    for (const edge of edges) {
      // Avoid duplicate edges
      if (!collectedEdges.some((e) => e.id === edge.id)) {
        collectedEdges.push(edge);
      }
      for (const neighborId of [edge.source_id, edge.target_id]) {
        if (!visitedNodeIds.has(neighborId)) {
          visitedNodeIds.add(neighborId);
        }
      }
    }
  }

  // Fetch all visited nodes
  const nodeIds = Array.from(visitedNodeIds);
  const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(',');
  const { rows: nodes } = await pool.query(
    `SELECT id, project_id, type, label, content, staleness_ttl_ms, created_at, updated_at
     FROM context_nodes WHERE id IN (${placeholders})`,
    nodeIds,
  );

  return { nodes, edges: collectedEdges };
}
