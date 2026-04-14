import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const contextNodesRouter = Router();

contextNodesRouter.get('/api/projects/:id/nodes', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = (page - 1) * limit;

    const conditions = ['project_id = $1'];
    const params: any[] = [req.params.id];
    let paramIdx = 2;

    if (req.query.type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(req.query.type);
    }

    const where = conditions.join(' AND ');

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM context_nodes WHERE ${where}`,
      params,
    );
    const total = parseInt(countRows[0].total, 10);

    const { rows } = await pool.query(
      `SELECT id, project_id, type, metadata,
              CASE WHEN embedding IS NOT NULL THEN 1536 ELSE NULL END AS embedding_dimensions,
              created_at, updated_at
       FROM context_nodes WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    res.json({ data: rows, total, page });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextNodesRouter.get('/api/nodes/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, project_id, type, metadata, embedding, created_at, updated_at
       FROM context_nodes WHERE id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    const node = rows[0];

    const [edgesOut, edgesIn, lock] = await Promise.all([
      pool.query(
        'SELECT id, source_id, target_id, type, metadata, created_at FROM context_edges WHERE source_id = $1',
        [req.params.id],
      ),
      pool.query(
        'SELECT id, source_id, target_id, type, metadata, created_at FROM context_edges WHERE target_id = $1',
        [req.params.id],
      ),
      pool.query(
        'SELECT id, node_id, locked_by, locked_at, expires_at FROM node_locks WHERE node_id = $1',
        [req.params.id],
      ),
    ]);

    res.json({
      data: {
        ...node,
        edges_out: edgesOut.rows,
        edges_in: edgesIn.rows,
        lock: lock.rows[0] || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextNodesRouter.post('/api/nodes/similar', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { embedding, project_id, limit: queryLimit } = req.body;

    if (!embedding || !project_id) {
      res.status(400).json({ error: 'embedding and project_id are required' });
      return;
    }

    const limit = Math.min(queryLimit || 10, 100);
    const embeddingStr = `[${embedding.join(',')}]`;

    const { rows } = await pool.query(
      `SELECT id, project_id, type, metadata, created_at, updated_at,
              embedding <=> $1 AS distance
       FROM context_nodes
       WHERE project_id = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1
       LIMIT $3`,
      [embeddingStr, project_id, limit],
    );

    res.json({ nodes: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextNodesRouter.get('/api/nodes/:id/lock', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, node_id, locked_by, locked_at, expires_at FROM node_locks WHERE node_id = $1',
      [req.params.id],
    );
    res.json({ data: rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextNodesRouter.delete('/api/nodes/:id/lock', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM node_locks WHERE node_id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
