import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  Classification,
  ClassifiedArtifact,
  computeContentHash,
  classify,
} from './conflictClassifier';

export interface ArtifactInput {
  artifact_id: string;
  content: string;
  type?: string | null;
}

export interface SnapshotRow {
  id: string;
  task_id: string;
  artifact_id: string;
  content_hash: string;
  snapshot_at: string;
}

/**
 * Insert one task_snapshots row per artifact at task start.
 * Returns the rows created (with computed hashes).
 */
export async function snapshotArtifacts(
  pool: Pool,
  taskId: string,
  artifacts: ArtifactInput[],
): Promise<SnapshotRow[]> {
  const rows: SnapshotRow[] = [];
  for (const artifact of artifacts) {
    const hash = computeContentHash(artifact.content);
    const id = randomUUID();
    const { rows: inserted } = await pool.query(
      `INSERT INTO task_snapshots (id, task_id, artifact_id, content_hash, snapshot_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, task_id, artifact_id, content_hash, snapshot_at`,
      [id, taskId, artifact.artifact_id, hash],
    );
    rows.push(inserted[0] as SnapshotRow);
  }
  return rows;
}

/**
 * Compare current artifact hashes against snapshots taken at task start.
 * Writes one conflict_log row per artifact (including no_conflict) and
 * returns a structured array of classifications.
 */
export async function classifyArtifactConflicts(
  pool: Pool,
  taskId: string,
  currentArtifacts: ArtifactInput[],
): Promise<ClassifiedArtifact[]> {
  const { rows: snapshotRows } = await pool.query(
    `SELECT artifact_id, content_hash
     FROM task_snapshots
     WHERE task_id = $1 AND artifact_id IS NOT NULL`,
    [taskId],
  );

  const snapshotByArtifact = new Map<string, string>();
  for (const row of snapshotRows as Array<{ artifact_id: string; content_hash: string }>) {
    snapshotByArtifact.set(row.artifact_id, row.content_hash);
  }

  const results: ClassifiedArtifact[] = [];
  for (const current of currentArtifacts) {
    const snapHash = snapshotByArtifact.get(current.artifact_id);
    if (!snapHash) continue;

    const curHash = computeContentHash(current.content);
    const classification: Classification = classify(
      { content: '', hash: snapHash, type: current.type ?? null },
      { content: current.content, hash: curHash, type: current.type ?? null },
    );

    results.push({
      artifact_id: current.artifact_id,
      snapshot_hash: snapHash,
      current_hash: curHash,
      classification,
    });

    await pool.query(
      `INSERT INTO conflict_log (id, task_id, artifact_id, classification, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [randomUUID(), taskId, current.artifact_id, classification],
    );
  }

  return results;
}

/**
 * Re-classify using full snapshot+current content (not just hashes), enabling
 * non_overlapping/compatible heuristics. Use when callers can supply the
 * original content (e.g. a separate snapshot store).
 */
export async function classifyWithContent(
  pool: Pool,
  taskId: string,
  pairs: Array<{
    artifact_id: string;
    snapshot_content: string;
    current_content: string;
    snapshot_type?: string | null;
    current_type?: string | null;
  }>,
): Promise<ClassifiedArtifact[]> {
  const results: ClassifiedArtifact[] = [];
  for (const pair of pairs) {
    const snapHash = computeContentHash(pair.snapshot_content);
    const curHash = computeContentHash(pair.current_content);
    const classification = classify(
      { content: pair.snapshot_content, hash: snapHash, type: pair.snapshot_type ?? null },
      { content: pair.current_content, hash: curHash, type: pair.current_type ?? null },
    );
    results.push({
      artifact_id: pair.artifact_id,
      snapshot_hash: snapHash,
      current_hash: curHash,
      classification,
    });
    await pool.query(
      `INSERT INTO conflict_log (id, task_id, artifact_id, classification, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [randomUUID(), taskId, pair.artifact_id, classification],
    );
  }
  return results;
}
