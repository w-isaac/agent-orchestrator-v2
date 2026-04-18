-- AOV-148: dashboard indexes — supporting indexes for dashboard aggregation query
-- NOTE: This migration must run OUTSIDE a transaction block. CREATE INDEX
-- CONCURRENTLY cannot execute inside a transaction. The migration runner must
-- disable transaction wrapping for this file.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_project_status
  ON runs (project_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_started_at_desc
  ON runs (started_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gates_project_status_pending
  ON gates (project_id, status)
  WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_project_created
  ON stories (project_id, created_at);
