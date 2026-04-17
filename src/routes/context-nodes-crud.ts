import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getPool } from '../lib/db';

export const contextNodesCrudRouter = Router();

/** GET /api/context-nodes — list nodes with optional type and label filters */
contextNodesCrudRouter.get('/api/context-nodes', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (req.query.type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(req.query.type);
    }
    if (req.query.label) {
      conditions.push(`label ILIKE $${paramIdx++}`);
      params.push(`%${req.query.label}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT id, project_id, type, label, content, staleness_ttl_ms, created_at, updated_at
       FROM context_nodes ${where}
       ORDER BY created_at DESC`,
      params,
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/context-nodes/:id — single node with connected edges */
contextNodesCrudRouter.get('/api/context-nodes/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT id, project_id, type, label, content, staleness_ttl_ms, created_at, updated_at
       FROM context_nodes WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    const [edgesOut, edgesIn] = await Promise.all([
      pool.query(
        'SELECT id, source_id, target_id, type, metadata, created_at FROM context_edges WHERE source_id = $1',
        [id],
      ),
      pool.query(
        'SELECT id, source_id, target_id, type, metadata, created_at FROM context_edges WHERE target_id = $1',
        [id],
      ),
    ]);

    res.json({
      data: {
        ...rows[0],
        edges: [...edgesOut.rows, ...edgesIn.rows],
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/context-nodes — create a new context node */
contextNodesCrudRouter.post('/api/context-nodes', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { type, label, content, staleness_ttl_ms, project_id } = req.body;

    if (!type || !label || !project_id) {
      res.status(400).json({ error: 'type, label, and project_id are required' });
      return;
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const { rows } = await pool.query(
      `INSERT INTO context_nodes (id, project_id, type, label, content, staleness_ttl_ms, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, project_id, type, label, content, staleness_ttl_ms, created_at, updated_at`,
      [id, project_id, type, label, content || null, staleness_ttl_ms || null, now, now],
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
