import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import { insertDefaultStages, listByProjectId } from '../repositories/pipelineStagesRepository';

export const projectsRouter = Router();

projectsRouter.get('/api/projects', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, name, description, auto_approve, created_at, updated_at FROM projects ORDER BY created_at DESC',
    );

    const projectsWithStages = await Promise.all(
      rows.map(async (p) => ({
        ...p,
        pipeline_stages: await listByProjectId(pool, p.id),
      })),
    );

    res.json({ data: projectsWithStages });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

projectsRouter.post('/api/projects', async (req: Request, res: Response) => {
  const { name, description } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO projects (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, auto_approve, created_at, updated_at`,
      [name, description ?? null],
    );
    const project = rows[0];
    const stages = await insertDefaultStages(client, project.id);
    await client.query('COMMIT');
    res.status(201).json({ data: { ...project, pipeline_stages: stages } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

projectsRouter.get('/api/projects/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, name, description, auto_approve, created_at, updated_at FROM projects WHERE id = $1',
      [req.params.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = rows[0];

    const [nodeCount, edgeCount, taskCount, lockCount, pipelineStages] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM context_nodes WHERE project_id = $1', [req.params.id]),
      pool.query(
        `SELECT COUNT(*) AS count FROM context_edges ce
         JOIN context_nodes cn ON ce.source_id = cn.id
         WHERE cn.project_id = $1`,
        [req.params.id],
      ),
      pool.query(
        "SELECT COUNT(*) AS count FROM tasks WHERE project_id = $1 AND status IN ('pending', 'running')",
        [req.params.id],
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM node_locks nl
         JOIN context_nodes cn ON nl.node_id = cn.id
         WHERE cn.project_id = $1`,
        [req.params.id],
      ),
      listByProjectId(pool, req.params.id),
    ]);

    res.json({
      data: {
        ...project,
        node_count: parseInt(nodeCount.rows[0].count, 10),
        edge_count: parseInt(edgeCount.rows[0].count, 10),
        active_task_count: parseInt(taskCount.rows[0].count, 10),
        locked_node_count: parseInt(lockCount.rows[0].count, 10),
        pipeline_stages: pipelineStages,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const PATCH_ALLOWED_FIELDS = ['name', 'description', 'auto_approve'] as const;
const ADMIN_ONLY_FIELDS = new Set(['auto_approve']);

projectsRouter.patch('/api/projects/:id', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const role = String(req.headers['x-user-role'] ?? '').toLowerCase();
    const isAdmin = role === 'admin';

    const updates: string[] = [];
    const params: unknown[] = [];

    for (const field of PATCH_ALLOWED_FIELDS) {
      if (!(field in body)) continue;
      const value = body[field];

      if (ADMIN_ONLY_FIELDS.has(field) && !isAdmin) {
        res.status(403).json({ error: `Admin role required to modify ${field}` });
        return;
      }

      if (field === 'auto_approve') {
        if (typeof value !== 'boolean') {
          res.status(400).json({ error: 'auto_approve must be a boolean' });
          return;
        }
      } else if (field === 'name') {
        if (typeof value !== 'string' || value.trim().length === 0) {
          res.status(400).json({ error: 'name cannot be empty' });
          return;
        }
      } else if (field === 'description') {
        if (value !== null && typeof value !== 'string') {
          res.status(400).json({ error: 'description must be a string or null' });
          return;
        }
      }

      params.push(value);
      updates.push(`${field} = $${params.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'no valid fields to update' });
      return;
    }

    updates.push(`updated_at = now()`);
    params.push(req.params.id);

    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, description, auto_approve, created_at, updated_at`,
      params,
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
