import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const contextTasksRouter = Router();

contextTasksRouter.get('/api/projects/:id/tasks', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;

    const conditions = ['project_id = $1'];
    const params: any[] = [req.params.id];
    let paramIdx = 2;

    if (req.query.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(req.query.status);
    }

    const where = conditions.join(' AND ');

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM tasks WHERE ${where}`,
      params,
    );
    const total = parseInt(countRows[0].total, 10);

    const { rows } = await pool.query(
      `SELECT id, project_id, type, status, created_at, updated_at
       FROM tasks WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    res.json({ data: rows, total, page });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextTasksRouter.get('/api/tasks/:id/results', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, task_id, payload, stdout, stderr, created_at FROM task_results WHERE task_id = $1 ORDER BY created_at DESC',
      [req.params.id],
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextTasksRouter.get('/api/tasks/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, task_id, data, created_at FROM task_snapshots WHERE task_id = $1 ORDER BY created_at ASC',
      [req.params.id],
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
