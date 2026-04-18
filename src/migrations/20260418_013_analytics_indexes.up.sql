-- AOV-183: analytics indexes on runs and stories tables
-- NOTE: This migration must run OUTSIDE a transaction block. CREATE INDEX
-- CONCURRENTLY cannot execute inside a transaction. The migration runner must
-- disable transaction wrapping for this file.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_created_at
  ON runs (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_status
  ON runs (status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_story_id
  ON runs (story_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_created_at
  ON stories (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_status
  ON stories (status);
