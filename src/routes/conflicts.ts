import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import {
  acquireLock,
  releaseLock,
  listLocks,
  cleanupExpiredLocks,
} from '../lib/lockManager';
import { listAlerts } from '../lib/contentionMonitor';

export const conflictsRouter = Router();

/** GET /api/conflicts/locks — list locks, optional status filter */
conflictsRouter.get('/api/conflicts/locks', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const status = (req.query.status as string | undefined) as
      | 'active'
      | 'expired'
      | 'all'
      | undefined;
    const locks = await listLocks(pool, { status: status ?? 'all' });
    res.json({ locks });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/conflicts/locks — acquire a lock */
conflictsRouter.post('/api/conflicts/locks', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { node_id, locked_by, task_id, ttl_seconds } = req.body ?? {};
    if (!node_id || !locked_by || !ttl_seconds) {
      res.status(400).json({ error: 'node_id, locked_by, and ttl_seconds are required' });
      return;
    }
    const result = await acquireLock(pool, { node_id, locked_by, task_id, ttl_seconds });
    res.status(result.acquired ? 201 : 409).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** DELETE /api/conflicts/locks/:nodeId — release a lock */
conflictsRouter.delete('/api/conflicts/locks/:nodeId', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { locked_by } = req.query;
    const released = await releaseLock(pool, {
      node_id: req.params.nodeId,
      locked_by: locked_by as string | undefined,
    });
    res.json({ released });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/conflicts/locks/cleanup — sweep expired locks */
conflictsRouter.post('/api/conflicts/locks/cleanup', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const released_count = await cleanupExpiredLocks(pool);
    res.json({ released_count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/conflicts/alerts — list contention alerts */
conflictsRouter.get('/api/conflicts/alerts', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { node_id, limit } = req.query;
    const alerts = await listAlerts(pool, {
      node_id: node_id as string | undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/conflicts/events — unified conflict event log */
conflictsRouter.get('/api/conflicts/events', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { task_id, node_id, event_type, limit } = req.query;
    const params: unknown[] = [];
    const wheres: string[] = [];
    if (task_id) {
      params.push(task_id);
      wheres.push(`task_id = $${params.length}`);
    }
    if (node_id) {
      params.push(node_id);
      wheres.push(`node_id = $${params.length}`);
    }
    if (event_type) {
      params.push(event_type);
      wheres.push(`event_type = $${params.length}`);
    }
    params.push(limit ? Number(limit) : 200);
    const limitIdx = params.length;

    const { rows } = await pool.query(
      `SELECT id, event_type, task_id, node_id, conflict_type, resolution_outcome, metadata, created_at
         FROM conflict_events
         ${wheres.length > 0 ? 'WHERE ' + wheres.join(' AND ') : ''}
         ORDER BY created_at DESC
         LIMIT $${limitIdx}`,
      params,
    );
    res.json({ events: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
