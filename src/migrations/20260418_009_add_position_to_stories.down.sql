DROP INDEX IF EXISTS idx_stories_stage_position;
ALTER TABLE stories DROP COLUMN IF EXISTS position;
