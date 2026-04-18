import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { broadcast } from '../ws/broadcaster';

export interface ContentionAlert {
  id: string;
  node_id: string;
  contention_count: number;
  threshold: number;
  window_start: string;
  window_end: string;
  created_at: string;
}

export interface ContentionOptions {
  threshold?: number;
  window_seconds?: number;
}

const DEFAULT_THRESHOLD = 5;
const DEFAULT_WINDOW_SECONDS = 300; // 5 min

/**
 * Check the number of lock_contention events for a node within the recent
 * time window. If above threshold, emit a high-contention alert and record it.
 *
 * Idempotent within a single window: only the first crossing raises an alert.
 */
export async function checkContention(
  pool: Pool,
  node_id: string,
  opts: ContentionOptions = {},
): Promise<ContentionAlert | null> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const windowSeconds = opts.window_seconds ?? DEFAULT_WINDOW_SECONDS;

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS contention_count,
            MIN(created_at) AS window_start,
            MAX(created_at) AS window_end
       FROM conflict_events
       WHERE node_id = $1
         AND event_type = 'lock_contention'
         AND created_at > NOW() - ($2 || ' seconds')::INTERVAL`,
    [node_id, String(windowSeconds)],
  );

  const count: number = countRows[0]?.contention_count ?? 0;
  if (count < threshold) return null;

  // Avoid duplicate alerts in the same window
  const { rows: dupRows } = await pool.query(
    `SELECT id FROM contention_alerts
       WHERE node_id = $1
         AND created_at > NOW() - ($2 || ' seconds')::INTERVAL
       LIMIT 1`,
    [node_id, String(windowSeconds)],
  );
  if (dupRows.length > 0) return null;

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO contention_alerts
       (id, node_id, contention_count, threshold, window_start, window_end, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id, node_id, contention_count, threshold, window_start, window_end, created_at`,
    [
      id,
      node_id,
      count,
      threshold,
      countRows[0].window_start,
      countRows[0].window_end,
    ],
  );

  const alert = rows[0] as ContentionAlert;
  broadcast({
    type: 'high_contention_alert',
    node_id,
    contention_count: count,
    threshold,
  });
  return alert;
}

export async function listAlerts(
  pool: Pool,
  opts: { node_id?: string; limit?: number } = {},
): Promise<ContentionAlert[]> {
  const params: unknown[] = [];
  let where = '';
  if (opts.node_id) {
    params.push(opts.node_id);
    where = `WHERE node_id = $1`;
  }
  params.push(opts.limit ?? 100);
  const limitIdx = params.length;
  const { rows } = await pool.query(
    `SELECT id, node_id, contention_count, threshold, window_start, window_end, created_at
       FROM contention_alerts
       ${where}
       ORDER BY created_at DESC
       LIMIT $${limitIdx}`,
    params,
  );
  return rows as ContentionAlert[];
}
