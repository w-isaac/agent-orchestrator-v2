import { Router, Request, Response } from 'express';
import { getPool } from '../../lib/db';

export const v2ProjectsRouter = Router();

// GET /api/v2/projects — list all projects with inline task counts
v2ProjectsRouter.get('/api/v2/projects', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.created_at,
        p.updated_at,
        COALESCE(SUM(CASE WHEN t.status IN ('pending', 'failed') THEN 1 ELSE 0 END), 0)::int AS open,
        COALESCE(SUM(CASE WHEN t.status = 'running' THEN 1 ELSE 0 END), 0)::int AS in_progress,
        COALESCE(SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END), 0)::int AS complete,
        COUNT(t.id)::int AS total
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    const projects = rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: 'active',
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
      task_counts: {
        total: r.total,
        open: r.open,
        in_progress: r.in_progress,
        complete: r.complete,
      },
    }));

    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/v2/projects/:id — single project with task counts
v2ProjectsRouter.get('/api/v2/projects/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.created_at,
        p.updated_at,
        COALESCE(SUM(CASE WHEN t.status IN ('pending', 'failed') THEN 1 ELSE 0 END), 0)::int AS open,
        COALESCE(SUM(CASE WHEN t.status = 'running' THEN 1 ELSE 0 END), 0)::int AS in_progress,
        COALESCE(SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END), 0)::int AS complete,
        COUNT(t.id)::int AS total
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
    `, [req.params.id]);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const r = rows[0];
    res.json({
      id: r.id,
      name: r.name,
      status: 'active',
      description: r.description,
      owner: null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      task_counts: {
        total: r.total,
        open: r.open,
        in_progress: r.in_progress,
        complete: r.complete,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/v2/projects/:id/tasks — detailed task breakdown
v2ProjectsRouter.get('/api/v2/projects/:id/tasks', async (req: Request, res: Response) => {
  try {
    const pool = getPool();

    // Verify project exists
    const projResult = await pool.query('SELECT id FROM projects WHERE id = $1', [req.params.id]);
    if (projResult.rows.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const [summaryResult, tasksResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending,
          COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::int AS running,
          COALESCE(SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END), 0)::int AS complete,
          COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)::int AS failed
        FROM tasks
        WHERE project_id = $1
      `, [req.params.id]),
      pool.query(`
        SELECT id, type, status, created_at
        FROM tasks
        WHERE project_id = $1
        ORDER BY created_at DESC
      `, [req.params.id]),
    ]);

    const summary = summaryResult.rows[0];
    res.json({
      project_id: req.params.id,
      summary: {
        total: summary.total,
        pending: summary.pending,
        running: summary.running,
        complete: summary.complete,
        failed: summary.failed,
      },
      tasks: tasksResult.rows.map((t) => ({
        id: t.id,
        title: t.type,
        status: t.status,
        created_at: t.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
