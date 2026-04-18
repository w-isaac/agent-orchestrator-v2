-- AOV-148: rollback dashboard indexes
-- NOTE: Must run OUTSIDE a transaction block (DROP INDEX CONCURRENTLY constraint).

DROP INDEX CONCURRENTLY IF EXISTS idx_runs_project_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_runs_started_at_desc;
DROP INDEX CONCURRENTLY IF EXISTS idx_gates_project_status_pending;
DROP INDEX CONCURRENTLY IF EXISTS idx_stories_project_created;
