import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import { dispatch, collect, applyResults } from '../lib/taskLifecycle';

export const taskLifecycleRouter = Router();

/** POST /api/tasks/:id/dispatch — dispatch a preflight task */
taskLifecycleRouter.post('/api/tasks/:id/dispatch', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await dispatch(pool, req.params.id);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found') || message.includes('not in expected status')) {
      res.status(409).json({ error: message });
    } else if (message.includes('already locked')) {
      res.status(423).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

/** POST /api/tasks/:id/collect — collect raw result for a dispatched task */
taskLifecycleRouter.post('/api/tasks/:id/collect', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const rawResult = req.body;

    if (!rawResult || typeof rawResult !== 'object' || Object.keys(rawResult).length === 0) {
      res.status(400).json({ error: 'Request body must be a non-empty object' });
      return;
    }

    const result = await collect(pool, req.params.id, rawResult);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found') || message.includes('not in expected status')) {
      res.status(409).json({ error: message });
    } else if (message.includes('Validation failed')) {
      res.status(422).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

/** POST /api/tasks/:id/apply-results — write validated results to context graph */
taskLifecycleRouter.post('/api/tasks/:id/apply-results', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await applyResults(pool, req.params.id);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found') || message.includes('not in validated status')) {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});
