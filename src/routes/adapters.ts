import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getPool } from '../lib/db';

export const adaptersRouter = Router();

/** List all adapter configs */
adaptersRouter.get('/api/adapters', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, adapter_type, status, model, max_context_tokens, config, created_at, updated_at
       FROM adapter_configs ORDER BY adapter_type`,
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Get adapter config by type */
adaptersRouter.get('/api/adapters/:type', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, adapter_type, status, model,
              CASE WHEN api_key IS NOT NULL THEN CONCAT('****', RIGHT(api_key, 4)) ELSE NULL END AS api_key_masked,
              max_context_tokens, config, created_at, updated_at
       FROM adapter_configs WHERE adapter_type = $1`,
      [req.params.type],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Adapter not found' });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Create or update adapter config */
adaptersRouter.put('/api/adapters/:type', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const adapterType = req.params.type;
    const { model, api_key, status, config: adapterConfig, max_context_tokens } = req.body;

    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    const { rows } = await pool.query(
      `INSERT INTO adapter_configs (id, adapter_type, status, model, api_key, max_context_tokens, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (adapter_type) DO UPDATE SET
         status = EXCLUDED.status,
         model = EXCLUDED.model,
         api_key = COALESCE(EXCLUDED.api_key, adapter_configs.api_key),
         max_context_tokens = EXCLUDED.max_context_tokens,
         config = EXCLUDED.config,
         updated_at = EXCLUDED.updated_at
       RETURNING id, adapter_type, status, model, max_context_tokens, config, created_at, updated_at`,
      [
        id,
        adapterType,
        status ?? 'inactive',
        model,
        api_key ?? null,
        max_context_tokens ?? 1048576,
        JSON.stringify(adapterConfig ?? {}),
        now,
        now,
      ],
    );

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Test adapter connection */
adaptersRouter.post('/api/adapters/:type/test', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM adapter_configs WHERE adapter_type = $1`,
      [req.params.type],
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, error: 'Adapter not configured' });
      return;
    }

    const config = rows[0];
    if (!config.api_key) {
      res.status(400).json({ success: false, error: 'API key not set' });
      return;
    }

    const start = Date.now();

    // Validate by listing models
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}?key=${config.api_key}`;
    const apiRes = await fetch(url);

    if (!apiRes.ok) {
      const body = await apiRes.json().catch(() => ({}));
      res.json({
        success: false,
        error: (body as any)?.error?.message ?? 'API key invalid or quota exceeded',
      });
      return;
    }

    const modelInfo = await apiRes.json();
    const latencyMs = Date.now() - start;

    res.json({
      success: true,
      model: config.model,
      max_context_tokens: config.max_context_tokens,
      latency_ms: latencyMs,
      model_info: {
        displayName: (modelInfo as any).displayName,
        inputTokenLimit: (modelInfo as any).inputTokenLimit,
        outputTokenLimit: (modelInfo as any).outputTokenLimit,
      },
    });
  } catch (err) {
    res.json({ success: false, error: (err as Error).message });
  }
});

/** Get routing decision for a story */
adaptersRouter.get('/api/stories/:id/routing', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM adapter_routing_decisions WHERE story_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'No routing decision found for this story' });
      return;
    }
    const row = rows[0];
    res.json({
      id: row.id,
      story_id: row.story_id,
      context_tokens: row.context_tokens,
      evaluated: JSON.parse(row.evaluated),
      selected_adapter: row.selected_adapter,
      selection_reason: row.selection_reason,
      override: row.override === 1,
      created_at: row.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Get Gemini job status for a run */
adaptersRouter.get('/api/runs/:id/gemini-job', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM gemini_jobs WHERE run_id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'No Gemini job found for this run' });
      return;
    }
    const job = rows[0];
    res.json({
      id: job.id,
      run_id: job.run_id,
      status: job.status,
      attempts: job.attempts,
      backoff_ms: job.backoff_ms,
      last_poll_at: job.last_poll_at,
      next_poll_at: job.next_poll_at,
      error_code: job.error_code,
      created_at: job.created_at,
      completed_at: job.completed_at,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Cancel active Gemini polling */
adaptersRouter.post('/api/runs/:id/cancel-poll', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rowCount } = await pool.query(
      `UPDATE gemini_jobs SET status = 'failed', error_message = 'Cancelled by user', completed_at = NOW()
       WHERE run_id = $1 AND status IN ('submitted', 'polling')`,
      [req.params.id],
    );
    if (rowCount === 0) {
      res.status(404).json({ error: 'No active Gemini job found for this run' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
