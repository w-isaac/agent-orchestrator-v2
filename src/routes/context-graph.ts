import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import { broadcast } from '../ws/broadcaster';

export const contextGraphRouter = Router();

const ALLOWED_FIELDS = ['label', 'type', 'properties', 'x', 'y', 'pinned'] as const;

// ─── Full graph load ─────────────────────────────────────────────────────────

contextGraphRouter.get('/api/context-graph/:projectId', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { projectId } = req.params;

    const [nodesRes, edgesRes] = await Promise.all([
      pool.query(
        `SELECT id, project_id, label, type, x, y, pinned, properties, created_at, updated_at
         FROM context_graph_nodes WHERE project_id = $1
         ORDER BY created_at`,
        [projectId],
      ),
      pool.query(
        `SELECT id, project_id, source_node_id, target_node_id, label, type, properties, created_at, updated_at
         FROM graph_node_edges WHERE project_id = $1
         ORDER BY created_at`,
        [projectId],
      ),
    ]);

    res.json({ nodes: nodesRes.rows, edges: edgesRes.rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Node create ─────────────────────────────────────────────────────────────

contextGraphRouter.post('/api/context-graph/:projectId/nodes', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { projectId } = req.params;
    const { label, type, x, y, properties } = req.body;

    if (!label || typeof label !== 'string') {
      res.status(400).json({ error: 'label is required and must be a string' });
      return;
    }

    if (properties !== undefined && (typeof properties !== 'object' || properties === null || Array.isArray(properties))) {
      res.status(400).json({ error: 'properties must be a valid JSON object' });
      return;
    }

    const props = properties ? JSON.stringify(properties) : '{}';
    const nodeType = typeof type === 'string' && type.length > 0 ? type : 'concept';
    const nodeX = Number.isFinite(x) ? x : 0;
    const nodeY = Number.isFinite(y) ? y : 0;

    const { rows } = await pool.query(
      `INSERT INTO context_graph_nodes (project_id, label, type, x, y, properties)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [projectId, label, nodeType, nodeX, nodeY, props],
    );

    const node = rows[0];
    broadcast({ type: 'graph_node_created', projectId, node });
    res.status(201).json(node);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Edge CRUD ───────────────────────────────────────────────────────────────

contextGraphRouter.post('/api/context-graph/:projectId/edges', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { projectId } = req.params;
    const { source_node_id, target_node_id, label, type, properties } = req.body;

    // Required fields
    if (!source_node_id || !target_node_id || !label || !type) {
      res.status(400).json({ error: 'source_node_id, target_node_id, label, and type are required' });
      return;
    }

    // Self-loop check
    if (source_node_id === target_node_id) {
      res.status(422).json({ error: 'Source and target must be different nodes' });
      return;
    }

    // Source node exists in project
    const { rows: sourceRows } = await pool.query(
      'SELECT id FROM context_graph_nodes WHERE id = $1 AND project_id = $2',
      [source_node_id, projectId],
    );
    if (sourceRows.length === 0) {
      res.status(422).json({ error: 'Source node not found in this project' });
      return;
    }

    // Target node exists in project
    const { rows: targetRows } = await pool.query(
      'SELECT id FROM context_graph_nodes WHERE id = $1 AND project_id = $2',
      [target_node_id, projectId],
    );
    if (targetRows.length === 0) {
      res.status(422).json({ error: 'Target node not found in this project' });
      return;
    }

    // Duplicate check
    const { rows: dupeRows } = await pool.query(
      'SELECT id FROM graph_node_edges WHERE source_node_id = $1 AND target_node_id = $2',
      [source_node_id, target_node_id],
    );
    if (dupeRows.length > 0) {
      res.status(422).json({ error: 'An edge already exists between these two nodes' });
      return;
    }

    const props = properties && typeof properties === 'object' && !Array.isArray(properties)
      ? JSON.stringify(properties)
      : '{}';

    const { rows } = await pool.query(
      `INSERT INTO graph_node_edges (project_id, source_node_id, target_node_id, label, type, properties)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [projectId, source_node_id, target_node_id, label, type, props],
    );

    const edge = rows[0];
    broadcast({ type: 'graph_edge_created', project_id: projectId, edge });
    res.status(201).json(edge);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const EDGE_ALLOWED_FIELDS = ['label', 'type', 'properties'] as const;

contextGraphRouter.patch('/api/context-graph/edges/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    for (const field of EDGE_ALLOWED_FIELDS) {
      if (req.body[field] === undefined) continue;

      if (field === 'properties') {
        const val = req.body.properties;
        if (typeof val !== 'object' || val === null || Array.isArray(val)) {
          res.status(400).json({ error: 'properties must be a valid JSON object' });
          return;
        }
        setClauses.push(`properties = $${paramIdx++}`);
        params.push(JSON.stringify(val));
      } else {
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(req.body[field]);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `UPDATE graph_node_edges SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    const { rows } = await pool.query(sql, params);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Edge not found' });
      return;
    }

    const edge = rows[0];
    broadcast({ type: 'graph_edge_updated', project_id: edge.project_id, edge });
    res.json(edge);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextGraphRouter.delete('/api/context-graph/edges/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    const { rows } = await pool.query(
      'DELETE FROM graph_node_edges WHERE id = $1 RETURNING id, project_id',
      [id],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Edge not found' });
      return;
    }

    broadcast({ type: 'graph_edge_deleted', project_id: rows[0].project_id, edgeId: id });
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextGraphRouter.patch('/api/context-graph/nodes/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    // Build SET clause from allowed fields present in body
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] === undefined) continue;

      if (field === 'properties') {
        const val = req.body.properties;
        if (typeof val !== 'object' || val === null || Array.isArray(val)) {
          res.status(400).json({ error: 'properties must be a valid JSON object' });
          return;
        }
        setClauses.push(`properties = $${paramIdx++}`);
        params.push(JSON.stringify(val));
      } else {
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(req.body[field]);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `UPDATE context_graph_nodes SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    const { rows } = await pool.query(sql, params);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    const node = rows[0];
    broadcast({ type: 'graph_node_updated', projectId: node.project_id, node });
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextGraphRouter.delete('/api/context-graph/nodes/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Delete edges first to capture count
      const edgeResult = await client.query(
        `DELETE FROM context_graph_edges WHERE source_id = $1 OR target_id = $1`,
        [id],
      );
      const cascadedEdges = edgeResult.rowCount ?? 0;

      // Delete the node
      const { rows } = await client.query(
        `DELETE FROM context_graph_nodes WHERE id = $1 RETURNING project_id`,
        [id],
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Node not found' });
        return;
      }

      await client.query('COMMIT');

      broadcast({
        type: 'graph_node_deleted',
        projectId: rows[0].project_id,
        nodeId: id,
        cascaded_edges: cascadedEdges,
      });

      res.json({ id, cascaded_edges: cascadedEdges });
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
