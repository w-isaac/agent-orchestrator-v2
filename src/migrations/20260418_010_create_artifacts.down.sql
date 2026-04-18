-- AOV-145: revert artifacts table
DROP INDEX IF EXISTS idx_artifacts_story_superseded;
DROP TABLE IF EXISTS artifacts;
