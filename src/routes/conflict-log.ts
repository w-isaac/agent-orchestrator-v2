import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const conflictLogRouter = Router();

/** GET /api/conflict-log — list conflict resolution events, optional task_id filter */
conflictLogRouter.get('/api/conflict-log', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { task_id } = req.query;

    const params: unknown[] = [];
    let where = '';
    if (task_id) {
      params.push(task_id);
      where = `WHERE task_id = $1`;
    }

    const { rows } = await pool.query(
      `SELECT id, task_id, artifact_id, classification, resolution_action,
              conflicting_task_id, created_at
         FROM conflict_resolution_log
         ${where}
         ORDER BY created_at DESC`,
      params,
    );

    res.json({ entries: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
