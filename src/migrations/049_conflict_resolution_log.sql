-- AOV-47: Auto-merge compatible conflicts and re-queue incompatible tasks

-- Allow 'conflict_requeued' as a task status
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN (
    'pending', 'queued', 'pre_flight', 'preflight',
    'dispatched', 'collecting', 'validated', 'graph_updated',
    'running', 'validating', 'complete', 'completed',
    'invalid', 'failed', 'cancelled', 'pre_flight_failed',
    'conflict_requeued'
  ));

CREATE TABLE IF NOT EXISTS conflict_resolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  artifact_id UUID NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN (
    'non_overlapping', 'compatible', 'incompatible'
  )),
  resolution_action TEXT NOT NULL CHECK (resolution_action IN (
    'auto_merged_non_overlapping', 'auto_merged_compatible', 'requeued_incompatible'
  )),
  conflicting_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conflict_resolution_log_task ON conflict_resolution_log(task_id);
CREATE INDEX IF NOT EXISTS idx_conflict_resolution_log_created ON conflict_resolution_log(created_at);
CREATE INDEX IF NOT EXISTS idx_conflict_resolution_log_action ON conflict_resolution_log(resolution_action);
