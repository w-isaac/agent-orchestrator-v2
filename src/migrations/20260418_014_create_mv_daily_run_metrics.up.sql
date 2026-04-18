-- AOV-183: create mv_daily_run_metrics materialized view
-- Pre-aggregates per-day run statistics to avoid recomputing on each analytics request.
-- Created WITH NO DATA so the migration is fast; the hourly refresh job populates it.
-- A unique index on day is required for REFRESH MATERIALIZED VIEW CONCURRENTLY.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_run_metrics AS
SELECT
  date_trunc('day', r.created_at)::date             AS day,
  COUNT(*)                                          AS total_runs,
  COUNT(*) FILTER (WHERE r.status = 'success')      AS success_runs,
  COUNT(*) FILTER (WHERE r.status = 'failed')       AS failed_runs,
  AVG(EXTRACT(EPOCH FROM (r.completed_at - r.created_at))) AS avg_duration_seconds,
  COUNT(DISTINCT r.story_id)                        AS distinct_stories
FROM runs r
GROUP BY 1
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_run_metrics_day_uidx
  ON mv_daily_run_metrics (day);
