import { Router, Request, Response } from 'express';
import { getPool } from '../../lib/db';

export const v2TasksRouter = Router();

const VALID_API_STATUSES = ['queued', 'in_progress', 'complete'] as const;
type ApiStatus = (typeof VALID_API_STATUSES)[number];

// DB status → API status
function toApiStatus(dbStatus: string): ApiStatus {
  switch (dbStatus) {
    case 'running': return 'in_progress';
    case 'pending':
    case 'failed': return 'queued';
    case 'complete': return 'complete';
    default: return 'queued';
  }
}

// API status → DB status
function toDbStatus(apiStatus: ApiStatus): string {
  switch (apiStatus) {
    case 'queued': return 'pending';
    case 'in_progress': return 'running';
    case 'complete': return 'complete';
  }
}

function mapTask(row: any) {
  return {
    id: row.id,
    title: row.type,
    description: null,
    status: toApiStatus(row.status),
    project_id: row.project_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// GET /api/v2/tasks?project_id={id}
v2TasksRouter.get('/api/v2/tasks', async (req: Request, res: Response) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      res.status(400).json({ error: 'project_id query parameter is required' });
      return;
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, type, status, project_id, created_at, updated_at
       FROM tasks
       WHERE project_id = $1
       ORDER BY created_at ASC`,
      [project_id],
    );

    res.json({ tasks: rows.map(mapTask) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v2/tasks
v2TasksRouter.post('/api/v2/tasks', async (req: Request, res: Response) => {
  try {
    const { project_id, title, description } = req.body;
    if (!project_id || !title) {
      res.status(400).json({ error: 'project_id and title are required' });
      return;
    }

    const pool = getPool();

    // Verify project exists
    const projResult = await pool.query('SELECT id FROM projects WHERE id = $1', [project_id]);
    if (projResult.rows.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO tasks (project_id, type, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, type, status, project_id, created_at, updated_at`,
      [project_id, title],
    );

    res.status(201).json(mapTask(rows[0]));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/v2/tasks/:id
v2TasksRouter.get('/api/v2/tasks/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, type, status, project_id, created_at, updated_at
       FROM tasks WHERE id = $1`,
      [req.params.id],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(mapTask(rows[0]));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/v2/tasks/:id
v2TasksRouter.patch('/api/v2/tasks/:id', async (req: Request, res: Response) => {
  try {
    const { status, title } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (status !== undefined) {
      if (!VALID_API_STATUSES.includes(status)) {
        res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_API_STATUSES.join(', ')}` });
        return;
      }
      updates.push(`status = $${paramIdx++}`);
      values.push(toDbStatus(status));
    }

    if (title !== undefined) {
      updates.push(`type = $${paramIdx++}`);
      values.push(title);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, type, status, project_id, created_at, updated_at`,
      values,
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(mapTask(rows[0]));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
