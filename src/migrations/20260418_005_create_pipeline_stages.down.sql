-- Migration 20260418_005 down: remove stories.current_stage_id and drop pipeline_stages
DROP INDEX IF EXISTS idx_stories_current_stage_id;
ALTER TABLE stories DROP COLUMN IF EXISTS current_stage_id;

DROP INDEX IF EXISTS uniq_pipeline_stages_project_name;
DROP INDEX IF EXISTS uniq_pipeline_stages_project_order;
DROP INDEX IF EXISTS idx_pipeline_stages_project_id;
DROP TABLE IF EXISTS pipeline_stages;
