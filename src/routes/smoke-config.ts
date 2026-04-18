import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../lib/db';

export const smokeConfigRouter = Router();

const SMOKE_CONFIG_COLUMNS =
  'id, project_id, base_url, routes, created_at, updated_at';

const routeSchema = z.object({
  name: z.string().min(1).max(64),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  path: z.string().startsWith('/', 'path must start with "/"').min(1),
  timeout_ms: z.number().int().min(1).max(60000).optional(),
});

const upsertSchema = z.object({
  base_url: z
    .string()
    .url()
    .refine((v) => /^https?:\/\//i.test(v), 'base_url must be http(s)'),
  routes: z.array(routeSchema).max(50),
});

export type SmokeRoute = z.infer<typeof routeSchema>;
export type SmokeConfigInput = z.infer<typeof upsertSchema>;

export interface ProbeResult {
  reachable: boolean;
  status: number | null;
  latency_ms: number;
  error: string | null;
}

export async function probeBaseUrl(
  url: string,
  timeoutMs = 10000,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });
    const latency_ms = Date.now() - start;
    return {
      reachable: res.status < 500,
      status: res.status,
      latency_ms,
      error: null,
    };
  } catch (err) {
    const latency_ms = Date.now() - start;
    const e = err as Error & { code?: string; cause?: { code?: string } };
    const code = e.code ?? e.cause?.code;
    let error = e.message || 'unknown_error';
    if (e.name === 'TimeoutError' || e.name === 'AbortError') error = 'timeout';
    else if (code === 'ECONNREFUSED') error = 'connection_refused';
    else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') error = 'dns_error';
    else if (code && code.startsWith('ERR_TLS') || /certificate|tls/i.test(error)) error = 'tls_error';
    return { reachable: false, status: null, latency_ms, error };
  }
}

/** GET /api/projects/:id/smoke-config */
smokeConfigRouter.get(
  '/api/projects/:id/smoke-config',
  async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT ${SMOKE_CONFIG_COLUMNS} FROM smoke_configs WHERE project_id = $1`,
        [req.params.id],
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'smoke_config_not_found' });
        return;
      }
      res.status(200).json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

/** POST /api/projects/:id/smoke-config */
smokeConfigRouter.post(
  '/api/projects/:id/smoke-config',
  async (req: Request, res: Response) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(422)
        .json({ error: 'validation_failed', issues: parsed.error.issues });
      return;
    }
    try {
      const pool = getPool();
      const projectCheck = await pool.query(
        'SELECT 1 FROM projects WHERE id = $1',
        [req.params.id],
      );
      if (projectCheck.rows.length === 0) {
        res.status(404).json({ error: 'project_not_found' });
        return;
      }
      const { rows } = await pool.query(
        `INSERT INTO smoke_configs (project_id, base_url, routes)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (project_id) DO UPDATE
           SET base_url = EXCLUDED.base_url,
               routes = EXCLUDED.routes,
               updated_at = now()
         RETURNING ${SMOKE_CONFIG_COLUMNS}`,
        [req.params.id, parsed.data.base_url, JSON.stringify(parsed.data.routes)],
      );
      res.status(200).json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

/** POST /api/projects/:id/smoke-config/test */
smokeConfigRouter.post(
  '/api/projects/:id/smoke-config/test',
  async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT base_url FROM smoke_configs WHERE project_id = $1',
        [req.params.id],
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'smoke_config_not_found' });
        return;
      }
      const result = await probeBaseUrl(rows[0].base_url);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);
