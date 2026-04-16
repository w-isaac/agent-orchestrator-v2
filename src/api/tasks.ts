import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const tasksRouter = Router();

const VALID_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

// POST /api/tasks
tasksRouter.post('/api/tasks', async (req: Request, res: Response) => {
  try {
    const { project_id, title, description, status, priority, budget, seed_node_ids } = req.body;

    if (!project_id || !title) {
      res.status(400).json({ error: 'project_id and title are required' });
      return;
    }

    if (title.length > 255) {
      res.status(400).json({ error: 'title must be 255 characters or less' });
      return;
    }

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
      return;
    }

    if (budget !== undefined && budget !== null && (typeof budget !== 'number' || budget < 0)) {
      res.status(400).json({ error: 'budget must be a non-negative number' });
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
      `INSERT INTO tasks (project_id, type, title, description, status, priority, budget)
       VALUES ($1, $2, $2, $3, $4, $5, $6)
       RETURNING id, project_id, title, description, status, priority, budget, created_at, updated_at`,
      [project_id, title, description || null, status || 'pending', priority || 'medium', budget ?? null],
    );

    const task = rows[0];

    // Insert seed nodes if provided
    if (Array.isArray(seed_node_ids) && seed_node_ids.length > 0) {
      const seedValues = seed_node_ids
        .map((_: string, i: number) => `($1, $${i + 2})`)
        .join(', ');
      await pool.query(
        `INSERT INTO task_seed_nodes (task_id, context_node_id) VALUES ${seedValues}
         ON CONFLICT DO NOTHING`,
        [task.id, ...seed_node_ids],
      );
    }

    // Fetch seed nodes for the response
    const seedResult = await pool.query(
      'SELECT context_node_id FROM task_seed_nodes WHERE task_id = $1',
      [task.id],
    );

    res.status(201).json({
      ...task,
      seed_nodes: seedResult.rows.map((r: { context_node_id: string }) => r.context_node_id),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/tasks
tasksRouter.get('/api/tasks', async (req: Request, res: Response) => {
  try {
    const { status, priority } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    if (priority) {
      conditions.push(`priority = $${paramIdx++}`);
      params.push(priority);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, project_id, title, description, status, priority, budget, created_at, updated_at
       FROM tasks ${where}
       ORDER BY created_at DESC`,
      params,
    );

    res.json({ tasks: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/tasks/:id
tasksRouter.get('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, project_id, title, description, status, priority, budget, created_at, updated_at
       FROM tasks WHERE id = $1`,
      [req.params.id],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = rows[0];

    // Fetch seed nodes and lifecycle events in parallel
    const [seedResult, eventsResult] = await Promise.all([
      pool.query('SELECT context_node_id FROM task_seed_nodes WHERE task_id = $1', [task.id]),
      pool.query(
        'SELECT id, status, payload, timestamp FROM task_lifecycle_events WHERE task_id = $1 ORDER BY timestamp ASC',
        [task.id],
      ),
    ]);

    res.json({
      ...task,
      seed_nodes: seedResult.rows.map((r: { context_node_id: string }) => r.context_node_id),
      lifecycle_events: eventsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/tasks/:id
tasksRouter.patch('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    const { title, description, status, priority, budget } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (title !== undefined) {
      if (title.length > 255) {
        res.status(400).json({ error: 'title must be 255 characters or less' });
        return;
      }
      updates.push(`title = $${paramIdx}`);
      updates.push(`type = $${paramIdx++}`);
      values.push(title);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIdx++}`);
      values.push(description);
    }

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
        return;
      }
      updates.push(`status = $${paramIdx++}`);
      values.push(status);
    }

    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
        return;
      }
      updates.push(`priority = $${paramIdx++}`);
      values.push(priority);
    }

    if (budget !== undefined) {
      if (budget !== null && (typeof budget !== 'number' || budget < 0)) {
        res.status(400).json({ error: 'budget must be a non-negative number' });
        return;
      }
      updates.push(`budget = $${paramIdx++}`);
      values.push(budget);
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
       RETURNING id, project_id, title, description, status, priority, budget, created_at, updated_at`,
      values,
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
