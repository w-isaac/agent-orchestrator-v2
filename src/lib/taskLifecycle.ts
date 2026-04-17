import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { normalizeResult, NormalizedResult } from './resultNormalizer';
import { validateOutput, ValidationResult } from './outputValidator';
import { broadcast } from '../ws/broadcaster';

// In-memory lock set (keyed by taskId)
const activeLocks = new Set<string>();

export interface LifecycleResult {
  task: Record<string, unknown>;
  event: string;
}

export interface CollectResult extends LifecycleResult {
  normalized: NormalizedResult;
  validation: ValidationResult;
}

export interface ApplyResult extends LifecycleResult {
  nodes_created: number;
  edges_created: number;
}

async function transitionStatus(
  pool: Pool,
  taskId: string,
  expectedStatus: string | string[],
  newStatus: string,
  payload?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const placeholders = expected.map((_, i) => `$${i + 2}`).join(', ');

  const { rows } = await pool.query(
    `UPDATE tasks SET status = $1, updated_at = NOW()
     WHERE id = $${expected.length + 2} AND status IN (${placeholders})
     RETURNING id, project_id, title, status, created_at, updated_at`,
    [newStatus, ...expected, taskId],
  );

  if (rows.length === 0) {
    throw new Error(`Task ${taskId} not found or not in expected status (${expected.join(', ')})`);
  }

  // Write lifecycle event
  await pool.query(
    `INSERT INTO task_lifecycle_events (id, task_id, status, payload, timestamp)
     VALUES ($1, $2, $3, $4, NOW())`,
    [randomUUID(), taskId, newStatus, payload ? JSON.stringify(payload) : null],
  );

  return rows[0];
}

function emitEvent(type: string, data: Record<string, unknown>): void {
  broadcast({ type, ...data });
}

/**
 * Acquire in-memory lock for a task. Also writes to task_locks table.
 */
async function acquireLock(pool: Pool, taskId: string): Promise<void> {
  if (activeLocks.has(taskId)) {
    throw new Error(`Task ${taskId} is already locked`);
  }
  activeLocks.add(taskId);
  await pool.query(
    `INSERT INTO task_locks (id, task_id, resource_key, acquired_at)
     VALUES ($1, $2, 'dispatch', NOW())`,
    [randomUUID(), taskId],
  );
}

/**
 * Release in-memory lock for a task. Also marks task_locks as released.
 */
async function releaseLock(pool: Pool, taskId: string): Promise<void> {
  activeLocks.delete(taskId);
  await pool.query(
    `UPDATE task_locks SET released_at = NOW()
     WHERE task_id = $1 AND released_at IS NULL`,
    [taskId],
  );
}

/**
 * Dispatch: acquire lock, transition preflight → dispatched, emit WS event.
 */
export async function dispatch(pool: Pool, taskId: string): Promise<LifecycleResult> {
  try {
    await acquireLock(pool, taskId);
    const task = await transitionStatus(pool, taskId, ['preflight', 'pre_flight'], 'dispatched');

    emitEvent('task_dispatched', { task_id: taskId, status: 'dispatched' });
    emitEvent('task_status_changed', { task_id: taskId, from: 'preflight', to: 'dispatched' });

    return { task, event: 'task_dispatched' };
  } catch (err) {
    await handleFailure(pool, taskId, 'dispatch', err as Error);
    throw err;
  }
}

/**
 * Collect: receive raw result, normalize, validate, transition dispatched → collecting → validated.
 */
export async function collect(
  pool: Pool,
  taskId: string,
  rawResult: Record<string, unknown>,
): Promise<CollectResult> {
  try {
    // Transition to collecting
    await transitionStatus(pool, taskId, 'dispatched', 'collecting');
    emitEvent('task_status_changed', { task_id: taskId, from: 'dispatched', to: 'collecting' });

    // Normalize
    const normalized = normalizeResult(rawResult);
    emitEvent('task_collected', { task_id: taskId, artifact_count: normalized.artifacts.length });

    // Validate
    const validation = validateOutput(normalized);
    if (!validation.pass) {
      throw new Error(`Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`);
    }

    // Transition to validated
    const task = await transitionStatus(pool, taskId, 'collecting', 'validated', {
      artifact_count: normalized.artifacts.length,
      relationship_count: normalized.relationships.length,
    });
    emitEvent('task_validated', { task_id: taskId, status: 'validated', pass: true });
    emitEvent('task_status_changed', { task_id: taskId, from: 'collecting', to: 'validated' });

    // Store normalized result in task_results
    await pool.query(
      `INSERT INTO task_results (id, task_id, payload, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [randomUUID(), taskId, JSON.stringify(normalized)],
    );

    return { task, event: 'task_validated', normalized, validation };
  } catch (err) {
    await handleFailure(pool, taskId, 'collect', err as Error);
    throw err;
  }
}

/**
 * ApplyResults: write nodes/edges to context graph, transition validated → graph_updated.
 */
export async function applyResults(pool: Pool, taskId: string): Promise<ApplyResult> {
  try {
    // Get task to find project_id
    const { rows: taskRows } = await pool.query(
      'SELECT id, project_id FROM tasks WHERE id = $1 AND status = $2',
      [taskId, 'validated'],
    );
    if (taskRows.length === 0) {
      throw new Error(`Task ${taskId} not found or not in validated status`);
    }
    const projectId = taskRows[0].project_id;

    // Get latest result
    const { rows: resultRows } = await pool.query(
      'SELECT payload FROM task_results WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1',
      [taskId],
    );
    if (resultRows.length === 0) {
      throw new Error(`No results found for task ${taskId}`);
    }

    const normalized: NormalizedResult =
      typeof resultRows[0].payload === 'string'
        ? JSON.parse(resultRows[0].payload)
        : resultRows[0].payload;

    let nodesCreated = 0;
    let edgesCreated = 0;

    // Write artifacts as context nodes
    for (const artifact of normalized.artifacts) {
      const nodeId = randomUUID();
      await pool.query(
        `INSERT INTO context_nodes (id, project_id, type, label, content, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [nodeId, projectId, artifact.type, artifact.id, artifact.content],
      );
      nodesCreated++;
    }

    // Write relationships as context edges
    for (const rel of normalized.relationships) {
      await pool.query(
        `INSERT INTO context_edges (id, source_id, target_id, type, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [randomUUID(), rel.source_id, rel.target_id, rel.type, JSON.stringify({})],
      );
      edgesCreated++;
    }

    // Transition to graph_updated
    const task = await transitionStatus(pool, taskId, 'validated', 'graph_updated', {
      nodes_created: nodesCreated,
      edges_created: edgesCreated,
    });

    emitEvent('task_graph_updated', {
      task_id: taskId,
      nodes_created: nodesCreated,
      edges_created: edgesCreated,
    });
    emitEvent('task_status_changed', { task_id: taskId, from: 'validated', to: 'graph_updated' });

    // Release lock after successful completion
    await releaseLock(pool, taskId);

    return { task, event: 'task_graph_updated', nodes_created: nodesCreated, edges_created: edgesCreated };
  } catch (err) {
    await handleFailure(pool, taskId, 'applyResults', err as Error);
    throw err;
  }
}

/**
 * Handle failure: transition to failed, log event, release lock.
 */
async function handleFailure(pool: Pool, taskId: string, stage: string, error: Error): Promise<void> {
  try {
    // Try to transition to failed regardless of current status
    await pool.query(
      `UPDATE tasks SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [taskId],
    );

    await pool.query(
      `INSERT INTO task_lifecycle_events (id, task_id, status, payload, timestamp)
       VALUES ($1, $2, 'failed', $3, NOW())`,
      [randomUUID(), taskId, JSON.stringify({ stage, error: error.message })],
    );

    emitEvent('task_status_changed', { task_id: taskId, to: 'failed', stage, error: error.message });

    await releaseLock(pool, taskId);
  } catch {
    // Best-effort failure handling; don't mask the original error
    activeLocks.delete(taskId);
  }
}

// For testing: clear all in-memory locks
export function _clearLocks(): void {
  activeLocks.clear();
}
