-- AOV-183: rollback analytics indexes
-- NOTE: Must run OUTSIDE a transaction block (DROP INDEX CONCURRENTLY constraint).

DROP INDEX CONCURRENTLY IF EXISTS idx_runs_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_runs_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_runs_story_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_stories_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_stories_status;
