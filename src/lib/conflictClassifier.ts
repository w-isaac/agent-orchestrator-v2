import { createHash } from 'crypto';

export type Classification =
  | 'no_conflict'
  | 'non_overlapping'
  | 'compatible'
  | 'incompatible';

export interface ArtifactSnapshotInput {
  artifact_id: string;
  content: string;
  type?: string | null;
}

export interface ClassifiedArtifact {
  artifact_id: string;
  snapshot_hash: string;
  current_hash: string;
  classification: Classification;
}

export function computeContentHash(content: string | null | undefined): string {
  return createHash('sha256').update(content ?? '').digest('hex');
}

/**
 * Classify the change from a snapshotted artifact to its current state.
 *
 * Heuristic:
 *   - identical hashes → no_conflict
 *   - artifact type changed → non_overlapping
 *   - current content strictly contains snapshot content (additive only) → compatible
 *   - any other divergence → incompatible
 */
export function classify(
  snapshot: { content: string; hash?: string; type?: string | null },
  current: { content: string; hash?: string; type?: string | null },
): Classification {
  const snapHash = snapshot.hash ?? computeContentHash(snapshot.content);
  const curHash = current.hash ?? computeContentHash(current.content);

  if (snapHash === curHash) return 'no_conflict';

  const snapType = snapshot.type ?? null;
  const curType = current.type ?? null;
  if (snapType !== null && curType !== null && snapType !== curType) {
    return 'non_overlapping';
  }

  const snapText = snapshot.content ?? '';
  const curText = current.content ?? '';
  if (snapText.length > 0 && curText.includes(snapText) && curText.length > snapText.length) {
    return 'compatible';
  }

  return 'incompatible';
}
