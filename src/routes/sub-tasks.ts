import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import {
  decomposeTask,
  listSubTasks,
  updateSubTaskStatus,
  retrySubTask,
  getSubTask,
} from '../lib/subTaskDecomposer';

export const subTasksRouter = Router();

subTasksRouter.post('/api/tasks/:id/decompose', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await decomposeTask(pool, req.params.id);
    res.status(201).json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith('Task not found')) {
      res.status(404).json({ error: msg });
    } else if (msg.startsWith('Task already decomposed')) {
      res.status(409).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

subTasksRouter.get('/api/tasks/:id/sub-tasks', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const rows = await listSubTasks(pool, req.params.id);
    res.json({ sub_tasks: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

subTasksRouter.get('/api/sub-tasks/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const row = await getSubTask(pool, req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Sub-task not found' });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

subTasksRouter.patch('/api/sub-tasks/:id/status', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { status, tokens_used, output, error_code, error_message } = req.body ?? {};
    if (!['running', 'done', 'failed'].includes(status)) {
      res.status(400).json({ error: 'status must be one of: running, done, failed' });
      return;
    }
    const result = await updateSubTaskStatus(pool, req.params.id, status, {
      tokens_used,
      output,
      error_code,
      error_message,
    });
    res.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith('Sub-task not found')) {
      res.status(404).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

subTasksRouter.post('/api/sub-tasks/:id/retry', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const strategy = (req.body?.strategy as 'manual' | 'llm' | undefined) ?? 'manual';
    const result = await retrySubTask(pool, req.params.id, { strategy });
    res.status(201).json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith('Sub-task not found')) {
      res.status(404).json({ error: msg });
    } else if (msg.startsWith('Cannot retry')) {
      res.status(409).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});
