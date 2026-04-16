import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import { TaskDispatcher, defaultValidator } from '../services/taskDispatcher';
import { ClaudeCodeAdapter } from '../agents/claude-code-adapter';
import { runPreflight, estimateBudget } from '../services/preflightService';

export const tasksRouter = Router();

let dispatcher: TaskDispatcher | null = null;

function getDispatcher(): TaskDispatcher {
  if (!dispatcher) {
    const pool = getPool();
    const adapter = new ClaudeCodeAdapter();
    dispatcher = new TaskDispatcher(pool, adapter, { validator: defaultValidator });
  }
  return dispatcher;
}

/** POST /api/tasks — submit a new task */
tasksRouter.post('/api/tasks', async (req: Request, res: Response) => {
  try {
    const { type, payload, priority, timeout_seconds, submitted_by } = req.body;
    if (!type || !payload) {
      res.status(400).json({ error: 'type and payload are required' });
      return;
    }
    const task = await getDispatcher().submit({ type, payload, priority, timeout_seconds, submitted_by });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/tasks/estimate-budget — estimate token budget for seed nodes */
tasksRouter.post('/api/tasks/estimate-budget', async (req: Request, res: Response) => {
  try {
    const { seed_node_ids } = req.body;
    if (!seed_node_ids || !Array.isArray(seed_node_ids)) {
      res.status(400).json({ error: 'seed_node_ids array is required' });
      return;
    }
    const pool = getPool();
    const result = await estimateBudget(pool, seed_node_ids);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/tasks — list tasks */
tasksRouter.get('/api/tasks', async (req: Request, res: Response) => {
  try {
    const { status, type, limit, offset } = req.query;
    const tasks = await getDispatcher().listTasks({
      status: status as string | undefined,
      type: type as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/tasks/:id — get task detail */
tasksRouter.get('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    const task = await getDispatcher().getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/tasks/:id/retry — retry a failed task */
tasksRouter.post('/api/tasks/:id/retry', async (req: Request, res: Response) => {
  try {
    const task = await getDispatcher().retry(req.params.id);
    res.status(201).json(task);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else if (message.includes('Cannot retry')) {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

/** POST /api/tasks/:id/preflight — run pre-flight validation */
tasksRouter.post('/api/tasks/:id/preflight', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await runPreflight(pool, req.params.id);
    res.json(result);
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message });
    } else if (err.code === 'CONFLICT') {
      res.status(409).json({ error: err.message });
    } else {
      res.status(500).json({ error: (err as Error).message });
    }
  }
});
