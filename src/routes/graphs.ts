import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const graphsRouter = Router();

interface ImportNode {
  ref_id: string;
  type: string;
  metadata?: Record<string, unknown>;
}

interface ImportEdge {
  source_ref_id: string;
  target_ref_id: string;
  type: string;
  metadata?: Record<string, unknown>;
}

interface ImportPayload {
  nodes: ImportNode[];
  edges: ImportEdge[];
}

function validateImportPayload(body: unknown): { valid: true; data: ImportPayload } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const payload = body as Record<string, unknown>;

  if (!Array.isArray(payload.nodes)) {
    return { valid: false, error: '"nodes" must be an array' };
  }

  if (!Array.isArray(payload.edges)) {
    return { valid: false, error: '"edges" must be an array' };
  }

  if (payload.nodes.length === 0 && payload.edges.length === 0) {
    return { valid: false, error: 'Import payload is empty: no nodes or edges provided' };
  }

  const refIds = new Set<string>();

  for (let i = 0; i < payload.nodes.length; i++) {
    const node = payload.nodes[i] as Record<string, unknown>;
    if (!node.ref_id || typeof node.ref_id !== 'string') {
      return { valid: false, error: `nodes[${i}]: "ref_id" is required and must be a string` };
    }
    if (!node.type || typeof node.type !== 'string') {
      return { valid: false, error: `nodes[${i}]: "type" is required and must be a string` };
    }
    if (refIds.has(node.ref_id)) {
      return { valid: false, error: `nodes[${i}]: duplicate ref_id "${node.ref_id}"` };
    }
    refIds.add(node.ref_id);
  }

  for (let i = 0; i < payload.edges.length; i++) {
    const edge = payload.edges[i] as Record<string, unknown>;
    if (!edge.source_ref_id || typeof edge.source_ref_id !== 'string') {
      return { valid: false, error: `edges[${i}]: "source_ref_id" is required and must be a string` };
    }
    if (!edge.target_ref_id || typeof edge.target_ref_id !== 'string') {
      return { valid: false, error: `edges[${i}]: "target_ref_id" is required and must be a string` };
    }
    if (!edge.type || typeof edge.type !== 'string') {
      return { valid: false, error: `edges[${i}]: "type" is required and must be a string` };
    }
    if (!refIds.has(edge.source_ref_id)) {
      return { valid: false, error: `edges[${i}]: source_ref_id "${edge.source_ref_id}" does not match any node in the payload` };
    }
    if (!refIds.has(edge.target_ref_id)) {
      return { valid: false, error: `edges[${i}]: target_ref_id "${edge.target_ref_id}" does not match any node in the payload` };
    }
  }

  return { valid: true, data: payload as unknown as ImportPayload };
}

// POST /api/graphs/:projectId/import
graphsRouter.post('/api/graphs/:projectId/import', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const pool = getPool();

    // Verify project exists
    const { rows: projectRows } = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (projectRows.length === 0) {
      res.status(404).json({ error: `Project "${projectId}" not found` });
      return;
    }

    const validation = validateImportPayload(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { nodes, edges } = validation.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert nodes, mapping ref_id -> generated UUID
      const refToId = new Map<string, string>();

      for (const node of nodes) {
        const { rows } = await client.query(
          `INSERT INTO context_nodes (project_id, type, metadata)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [projectId, node.type, JSON.stringify(node.metadata || {})],
        );
        refToId.set(node.ref_id, rows[0].id);
      }

      // Insert edges using mapped IDs
      for (const edge of edges) {
        const sourceId = refToId.get(edge.source_ref_id)!;
        const targetId = refToId.get(edge.target_ref_id)!;

        await client.query(
          `INSERT INTO context_edges (source_id, target_id, type, metadata)
           VALUES ($1, $2, $3, $4)`,
          [sourceId, targetId, edge.type, JSON.stringify(edge.metadata || {})],
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Import complete',
        nodes_created: nodes.length,
        edges_created: edges.length,
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graphs/:projectId/export
graphsRouter.get('/api/graphs/:projectId/export', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const pool = getPool();

    // Verify project exists
    const { rows: projectRows } = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (projectRows.length === 0) {
      res.status(404).json({ error: `Project "${projectId}" not found` });
      return;
    }

    const { rows: nodes } = await pool.query(
      `SELECT id, type, metadata, created_at, updated_at
       FROM context_nodes WHERE project_id = $1
       ORDER BY created_at`,
      [projectId],
    );

    const nodeIds = nodes.map((n) => n.id);

    let edges: any[] = [];
    if (nodeIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT ce.id, ce.source_id, ce.target_id, ce.type, ce.metadata, ce.created_at
         FROM context_edges ce
         WHERE ce.source_id = ANY($1)`,
        [nodeIds],
      );
      edges = rows;
    }

    // Build id -> ref_id mapping (using the node's own id as ref_id for round-trip)
    const idToRef = new Map<string, string>();
    const exportNodes = nodes.map((n) => {
      const refId = n.id;
      idToRef.set(n.id, refId);
      return {
        ref_id: refId,
        type: n.type,
        metadata: n.metadata,
        created_at: n.created_at,
        updated_at: n.updated_at,
      };
    });

    const exportEdges = edges.map((e) => ({
      source_ref_id: idToRef.get(e.source_id) || e.source_id,
      target_ref_id: idToRef.get(e.target_id) || e.target_id,
      type: e.type,
      metadata: e.metadata,
      created_at: e.created_at,
    }));

    res.json({
      project_id: projectId,
      exported_at: new Date().toISOString(),
      nodes: exportNodes,
      edges: exportEdges,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graphs/:projectId/counts
graphsRouter.get('/api/graphs/:projectId/counts', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const pool = getPool();

    const { rows: projectRows } = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (projectRows.length === 0) {
      res.status(404).json({ error: `Project "${projectId}" not found` });
      return;
    }

    const { rows: nodeCount } = await pool.query(
      'SELECT COUNT(*) AS count FROM context_nodes WHERE project_id = $1',
      [projectId],
    );

    const { rows: edgeCount } = await pool.query(
      `SELECT COUNT(*) AS count FROM context_edges ce
       JOIN context_nodes cn ON ce.source_id = cn.id
       WHERE cn.project_id = $1`,
      [projectId],
    );

    res.json({
      project_id: projectId,
      nodes: parseInt(nodeCount[0].count, 10),
      edges: parseInt(edgeCount[0].count, 10),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
