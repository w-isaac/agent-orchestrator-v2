import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { Classification } from './conflictClassifier';

export type ResolutionAction =
  | 'auto_merged_non_overlapping'
  | 'auto_merged_compatible'
  | 'requeued_incompatible';

export interface ResolveInput {
  task_id: string;
  artifact_id: string;
  classification: Classification;
  conflicting_task_id?: string | null;
}

export interface ResolutionLogEntry {
  id: string;
  task_id: string;
  artifact_id: string;
  classification: Classification;
  resolution_action: ResolutionAction;
  conflicting_task_id: string | null;
  created_at: string;
}

export interface ResolveResult {
  resolution_action: ResolutionAction | null;
  log_entry: ResolutionLogEntry | null;
  requeued: boolean;
}

function actionFor(classification: Classification): ResolutionAction | null {
  switch (classification) {
    case 'non_overlapping':
      return 'auto_merged_non_overlapping';
    case 'compatible':
      return 'auto_merged_compatible';
    case 'incompatible':
      return 'requeued_incompatible';
    default:
      return null;
  }
}

/**
 * Resolve a classified conflict:
 *  - non_overlapping / compatible → auto-merge (record log only)
 *  - incompatible → flip task status to 'conflict_requeued' and record log
 *  - no_conflict → no-op
 */
export async function resolveConflict(
  pool: Pool,
  input: ResolveInput,
): Promise<ResolveResult> {
  const action = actionFor(input.classification);
  if (!action) {
    return { resolution_action: null, log_entry: null, requeued: false };
  }

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO conflict_resolution_log
       (id, task_id, artifact_id, classification, resolution_action, conflicting_task_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id, task_id, artifact_id, classification, resolution_action, conflicting_task_id, created_at`,
    [
      id,
      input.task_id,
      input.artifact_id,
      input.classification,
      action,
      input.conflicting_task_id ?? null,
    ],
  );

  let requeued = false;
  if (action === 'requeued_incompatible') {
    await pool.query(
      `UPDATE tasks SET status = 'conflict_requeued', updated_at = NOW() WHERE id = $1`,
      [input.task_id],
    );
    requeued = true;
  }

  return {
    resolution_action: action,
    log_entry: rows[0] as ResolutionLogEntry,
    requeued,
  };
}
