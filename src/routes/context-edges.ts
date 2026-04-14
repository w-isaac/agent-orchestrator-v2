import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const contextEdgesRouter = Router();

contextEdgesRouter.get('/api/projects/:id/edges', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = (page - 1) * limit;

    const conditions = ['cn.project_id = $1'];
    const params: any[] = [req.params.id];
    let paramIdx = 2;

    if (req.query.type) {
      conditions.push(`ce.type = $${paramIdx++}`);
      params.push(req.query.type);
    }

    const where = conditions.join(' AND ');

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM context_edges ce
       JOIN context_nodes cn ON ce.source_id = cn.id
       WHERE ${where}`,
      params,
    );
    const total = parseInt(countRows[0].total, 10);

    const { rows } = await pool.query(
      `SELECT ce.id, ce.source_id, ce.target_id, ce.type, ce.metadata, ce.created_at
       FROM context_edges ce
       JOIN context_nodes cn ON ce.source_id = cn.id
       WHERE ${where}
       ORDER BY ce.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    res.json({ data: rows, total, page });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
