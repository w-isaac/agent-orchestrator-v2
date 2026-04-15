const STATUS_MAP: Record<string, string> = {
  queued: 'queued',
  in_progress: 'running',
  gate: 'pending_review',
  done: 'completed',
  failed: 'failed',
};

export function mapStoryStatus(v1Status: string): string {
  const mapped = STATUS_MAP[v1Status];
  if (!mapped) {
    console.warn(`[migrate-v1] Unknown v1 story status "${v1Status}" — passing through unchanged`);
    return v1Status;
  }
  return mapped;
}
