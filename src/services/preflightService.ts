import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface CheckResult {
  check_name: string;
  status: 'pass' | 'fail' | 'skipped';
  detail: string | null;
}

export interface PreflightResult {
  run_id: string;
  task_id: string;
  status: 'pass' | 'fail';
  checks: CheckResult[];
}

export type CheckFn = (pool: Pool, task: any) => Promise<{ status: 'pass' | 'fail'; detail: string }>;

const FRESHNESS_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function checkFreshness(_pool: Pool, task: any): Promise<{ status: 'pass' | 'fail'; detail: string }> {
  const updatedAt = new Date(task.updated_at).getTime();
  const age = Date.now() - updatedAt;
  if (age > FRESHNESS_THRESHOLD_MS) {
    return { status: 'fail', detail: `Task last updated ${Math.round(age / 60000)}m ago, exceeds 24h threshold` };
  }
  return { status: 'pass', detail: `Task updated ${Math.round(age / 60000)}m ago` };
}

export async function checkLocks(pool: Pool, task: any): Promise<{ status: 'pass' | 'fail'; detail: string }> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM task_locks WHERE task_id = $1 AND released_at IS NULL`,
    [task.id],
  );
  const count = parseInt(rows[0].count, 10);
  if (count > 0) {
    return { status: 'fail', detail: `${count} active lock(s) found` };
  }
  return { status: 'pass', detail: 'No active locks' };
}

export async function checkBudget(pool: Pool, task: any): Promise<{ status: 'pass' | 'fail'; detail: string }> {
  const budgetLimit = task.budget ?? 100000;

  const { rows } = await pool.query(
    `SELECT cn.metadata FROM task_seed_nodes tsn
     JOIN context_nodes cn ON cn.id = tsn.context_node_id
     WHERE tsn.task_id = $1`,
    [task.id],
  );

  let totalSize = 0;
  for (const row of rows) {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    totalSize += meta?.content_size ?? meta?.size ?? 0;
  }

  const estimatedTokens = Math.ceil(totalSize / 4);

  if (estimatedTokens > budgetLimit) {
    return { status: 'fail', detail: `Estimated ${estimatedTokens} tokens exceeds ${budgetLimit} limit` };
  }
  return { status: 'pass', detail: `Estimated ${estimatedTokens} tokens within ${budgetLimit} limit` };
}

export async function checkFailurePattern(pool: Pool, task: any): Promise<{ status: 'pass' | 'fail'; detail: string }> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM task_lifecycle_events tle
     JOIN tasks t ON t.id = tle.task_id
     WHERE t.project_id = $1 AND t.type = $2 AND tle.status = 'failed'
     AND tle.timestamp > NOW() - INTERVAL '1 hour'`,
    [task.project_id, task.type],
  );
  const count = parseInt(rows[0].count, 10);
  if (count >= 3) {
    return { status: 'fail', detail: `${count} failures in last hour for type "${task.type}"` };
  }
  return { status: 'pass', detail: count === 0 ? 'No recent failures' : `${count} recent failure(s), below threshold` };
}

export const CHECK_SEQUENCE: { name: string; fn: CheckFn; order: number }[] = [
  { name: 'freshness', fn: checkFreshness, order: 1 },
  { name: 'locks', fn: checkLocks, order: 2 },
  { name: 'budget', fn: checkBudget, order: 3 },
  { name: 'failure_pattern', fn: checkFailurePattern, order: 4 },
];

export async function runPreflight(pool: Pool, taskId: string): Promise<PreflightResult> {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (rows.length === 0) {
    throw Object.assign(new Error('Task not found'), { code: 'NOT_FOUND' });
  }
  const task = rows[0];

  if (task.status === 'pre_flight' || task.status === 'dispatched') {
    throw Object.assign(new Error(`Task already in ${task.status} status`), { code: 'CONFLICT' });
  }

  await pool.query("UPDATE tasks SET status = 'pre_flight', updated_at = NOW() WHERE id = $1", [taskId]);

  const runId = randomUUID();
  const checks: CheckResult[] = [];
  let overallStatus: 'pass' | 'fail' = 'pass';

  for (const check of CHECK_SEQUENCE) {
    if (overallStatus === 'fail') {
      checks.push({ check_name: check.name, status: 'skipped', detail: null });
      await pool.query(
        `INSERT INTO preflight_checks (task_id, run_id, check_type, check_order, status, detail)
         VALUES ($1, $2, $3, $4, 'skipped', NULL)`,
        [taskId, runId, check.name, check.order],
      );
      continue;
    }

    const result = await check.fn(pool, task);
    checks.push({ check_name: check.name, status: result.status, detail: result.detail });

    await pool.query(
      `INSERT INTO preflight_checks (task_id, run_id, check_type, check_order, status, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [taskId, runId, check.name, check.order, result.status, result.detail],
    );

    if (result.status === 'fail') {
      overallStatus = 'fail';
    }
  }

  const newStatus = overallStatus === 'pass' ? 'dispatched' : 'pre_flight_failed';
  await pool.query('UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, taskId]);

  return { run_id: runId, task_id: taskId, status: overallStatus, checks };
}

export async function estimateBudget(pool: Pool, seedNodeIds: string[]): Promise<{ estimated_tokens: number }> {
  if (!seedNodeIds || seedNodeIds.length === 0) {
    return { estimated_tokens: 0 };
  }

  const placeholders = seedNodeIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `SELECT metadata FROM context_nodes WHERE id IN (${placeholders})`,
    seedNodeIds,
  );

  let totalSize = 0;
  for (const row of rows) {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    totalSize += meta?.content_size ?? meta?.size ?? 0;
  }

  return { estimated_tokens: Math.ceil(totalSize / 4) };
}
