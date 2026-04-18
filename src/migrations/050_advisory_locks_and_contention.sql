-- AOV-21: Full conflict resolution — advisory locks, contention tracking, unified events

-- Ensure node_locks has a task_id column so lock ownership is tied to a task
ALTER TABLE node_locks ADD COLUMN IF NOT EXISTS task_id UUID;

CREATE INDEX IF NOT EXISTS idx_node_locks_task ON node_locks(task_id);

-- Unified conflict/lock event log: lock_acquired, lock_released, lock_expired,
-- lock_contention, auto_merge, requeue
CREATE TABLE IF NOT EXISTS conflict_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'lock_acquired',
    'lock_released',
    'lock_expired',
    'lock_contention',
    'auto_merge',
    'requeue'
  )),
  task_id UUID,
  node_id UUID,
  conflict_type TEXT,
  resolution_outcome TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conflict_events_task ON conflict_events(task_id);
CREATE INDEX IF NOT EXISTS idx_conflict_events_node ON conflict_events(node_id);
CREATE INDEX IF NOT EXISTS idx_conflict_events_type ON conflict_events(event_type);
CREATE INDEX IF NOT EXISTS idx_conflict_events_created ON conflict_events(created_at);

-- High-contention alerts raised when a node exceeds the contention threshold
CREATE TABLE IF NOT EXISTS contention_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL,
  contention_count INT NOT NULL,
  threshold INT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contention_alerts_node ON contention_alerts(node_id);
CREATE INDEX IF NOT EXISTS idx_contention_alerts_created ON contention_alerts(created_at);
