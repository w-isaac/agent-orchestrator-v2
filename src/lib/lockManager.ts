import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { broadcast } from '../ws/broadcaster';

export interface AdvisoryLock {
  id: string;
  node_id: string;
  locked_by: string;
  task_id: string | null;
  locked_at: string;
  expires_at: string | null;
}

export interface AcquireResult {
  acquired: boolean;
  lock: AdvisoryLock | null;
  contended: boolean;
  existing_lock?: AdvisoryLock | null;
}

function logEvent(
  pool: Pool,
  eventType: 'lock_acquired' | 'lock_released' | 'lock_expired' | 'lock_contention',
  opts: { task_id?: string | null; node_id?: string | null; metadata?: Record<string, unknown> },
): Promise<unknown> {
  const metadata = opts.metadata ?? {};
  return pool.query(
    `INSERT INTO conflict_events (id, event_type, task_id, node_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [randomUUID(), eventType, opts.task_id ?? null, opts.node_id ?? null, JSON.stringify(metadata)],
  );
}

/**
 * Acquire a TTL-based advisory lock on a node.
 * If an existing lock has expired it is replaced atomically.
 * If an active lock is held by someone else, returns contended=true.
 */
export async function acquireLock(
  pool: Pool,
  input: { node_id: string; locked_by: string; task_id?: string | null; ttl_seconds: number },
): Promise<AcquireResult> {
  const { node_id, locked_by, task_id = null, ttl_seconds } = input;

  // Delete any expired lock on this node (self-releasing on expiry)
  const { rowCount: expiredCount } = await pool.query(
    `DELETE FROM node_locks
     WHERE node_id = $1 AND expires_at IS NOT NULL AND expires_at < NOW()`,
    [node_id],
  );
  if (expiredCount && expiredCount > 0) {
    await logEvent(pool, 'lock_expired', { node_id, metadata: { released_count: expiredCount } });
    broadcast({ type: 'lock_expired', node_id });
  }

  const id = randomUUID();
  try {
    const { rows } = await pool.query(
      `INSERT INTO node_locks (id, node_id, locked_by, task_id, locked_at, expires_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW() + ($5 || ' seconds')::INTERVAL)
       RETURNING id, node_id, locked_by, task_id, locked_at, expires_at`,
      [id, node_id, locked_by, task_id, String(ttl_seconds)],
    );
    const lock = rows[0] as AdvisoryLock;
    await logEvent(pool, 'lock_acquired', {
      task_id,
      node_id,
      metadata: { locked_by, ttl_seconds, expires_at: lock.expires_at },
    });
    broadcast({ type: 'lock_acquired', node_id, task_id, locked_by });
    return { acquired: true, lock, contended: false };
  } catch (err) {
    // unique_violation on node_id → contended
    const { rows } = await pool.query(
      `SELECT id, node_id, locked_by, task_id, locked_at, expires_at
         FROM node_locks WHERE node_id = $1`,
      [node_id],
    );
    const existing = (rows[0] as AdvisoryLock | undefined) ?? null;
    await logEvent(pool, 'lock_contention', {
      task_id,
      node_id,
      metadata: { attempted_by: locked_by, held_by: existing?.locked_by ?? null },
    });
    broadcast({ type: 'lock_contention', node_id, task_id, attempted_by: locked_by });
    return { acquired: false, lock: null, contended: true, existing_lock: existing };
  }
}

export async function releaseLock(
  pool: Pool,
  input: { node_id: string; locked_by?: string },
): Promise<boolean> {
  const { node_id, locked_by } = input;
  const params: unknown[] = [node_id];
  let where = `node_id = $1`;
  if (locked_by) {
    params.push(locked_by);
    where += ` AND locked_by = $2`;
  }
  const { rowCount, rows } = await pool.query(
    `DELETE FROM node_locks WHERE ${where}
     RETURNING id, node_id, locked_by, task_id, locked_at, expires_at`,
    params,
  );
  const released = (rowCount ?? 0) > 0;
  if (released) {
    const row = rows[0] as AdvisoryLock;
    await logEvent(pool, 'lock_released', {
      task_id: row.task_id,
      node_id,
      metadata: { locked_by: row.locked_by },
    });
    broadcast({ type: 'lock_released', node_id, task_id: row.task_id });
  }
  return released;
}

export async function getActiveLock(
  pool: Pool,
  node_id: string,
): Promise<AdvisoryLock | null> {
  const { rows } = await pool.query(
    `SELECT id, node_id, locked_by, task_id, locked_at, expires_at
       FROM node_locks
       WHERE node_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())`,
    [node_id],
  );
  return (rows[0] as AdvisoryLock | undefined) ?? null;
}

export async function cleanupExpiredLocks(pool: Pool): Promise<number> {
  const { rowCount, rows } = await pool.query(
    `DELETE FROM node_locks
       WHERE expires_at IS NOT NULL AND expires_at < NOW()
     RETURNING node_id`,
  );
  const count = rowCount ?? 0;
  if (count > 0) {
    for (const row of rows as Array<{ node_id: string }>) {
      await logEvent(pool, 'lock_expired', { node_id: row.node_id });
    }
    broadcast({ type: 'lock_expired_sweep', count });
  }
  return count;
}

export async function listLocks(
  pool: Pool,
  opts: { status?: 'active' | 'expired' | 'all' } = {},
): Promise<AdvisoryLock[]> {
  const status = opts.status ?? 'all';
  let where = '';
  if (status === 'active') where = `WHERE expires_at IS NULL OR expires_at > NOW()`;
  else if (status === 'expired') where = `WHERE expires_at IS NOT NULL AND expires_at <= NOW()`;
  const { rows } = await pool.query(
    `SELECT id, node_id, locked_by, task_id, locked_at, expires_at
       FROM node_locks ${where}
       ORDER BY locked_at DESC`,
  );
  return rows as AdvisoryLock[];
}
