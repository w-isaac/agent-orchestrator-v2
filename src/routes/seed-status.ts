import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const seedStatusRouter = Router();

seedStatusRouter.get('/api/projects/:id/seed-status', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const projectId = req.params.id;

    const [projectRes, nodesRes, edgesRes, tasksRes] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM projects WHERE id = $1', [projectId]),
      pool.query('SELECT COUNT(*) AS count FROM context_nodes WHERE project_id = $1', [projectId]),
      pool.query(
        `SELECT COUNT(*) AS count FROM context_edges ce
         JOIN context_nodes cn ON ce.source_id = cn.id
         WHERE cn.project_id = $1`,
        [projectId],
      ),
      pool.query('SELECT COUNT(*) AS count FROM tasks WHERE project_id = $1', [projectId]),
    ]);

    const counts = {
      projects: parseInt(projectRes.rows[0].count, 10),
      context_nodes: parseInt(nodesRes.rows[0].count, 10),
      context_edges: parseInt(edgesRes.rows[0].count, 10),
      tasks: parseInt(tasksRes.rows[0].count, 10),
    };

    const seeded = counts.projects > 0 && counts.context_nodes > 0 && counts.context_edges > 0;

    res.json({ seeded, counts });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
