-- AOV-190 down: revert iterations table
DROP TRIGGER IF EXISTS trg_iterations_updated_at ON iterations;
DROP INDEX IF EXISTS uniq_iterations_story_number;
DROP INDEX IF EXISTS idx_iterations_story_id_created_at;
DROP TABLE IF EXISTS iterations;
