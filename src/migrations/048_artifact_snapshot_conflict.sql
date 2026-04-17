-- AOV-46: Artifact snapshot & conflict classification

-- Extend existing task_snapshots with per-artifact columns.
ALTER TABLE task_snapshots ALTER COLUMN data DROP NOT NULL;
ALTER TABLE task_snapshots ADD COLUMN IF NOT EXISTS artifact_id UUID;
ALTER TABLE task_snapshots ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
ALTER TABLE task_snapshots ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_task_snapshots_task_artifact
  ON task_snapshots(task_id, artifact_id);

-- Conflict log: one row per (task, artifact) classification outcome.
CREATE TABLE IF NOT EXISTS conflict_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  artifact_id UUID NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN (
    'no_conflict', 'non_overlapping', 'compatible', 'incompatible'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conflict_log_task ON conflict_log(task_id);
CREATE INDEX IF NOT EXISTS idx_conflict_log_classification ON conflict_log(classification);
CREATE INDEX IF NOT EXISTS idx_conflict_log_task_artifact ON conflict_log(task_id, artifact_id);
