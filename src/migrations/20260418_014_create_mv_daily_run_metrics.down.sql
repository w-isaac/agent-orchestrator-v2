-- AOV-183: rollback mv_daily_run_metrics materialized view
-- Dropping the MV also removes its unique index; no table data is affected.

DROP MATERIALIZED VIEW IF EXISTS mv_daily_run_metrics;
