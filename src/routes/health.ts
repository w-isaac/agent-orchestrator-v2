import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

const startTime = Date.now();

export const healthRouter = Router();

healthRouter.get('/api/health', async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const uptime = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));

  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      db: 'connected',
      uptime,
      timestamp,
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      db: 'disconnected',
      error: (err as Error).message,
      uptime,
      timestamp,
    });
  }
});
