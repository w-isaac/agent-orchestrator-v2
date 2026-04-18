-- AOV-151: rollback architect agent schema

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_runs') THEN
    EXECUTE 'DROP INDEX IF EXISTS idx_agent_runs_story_status';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_artifacts_story_type;

ALTER TABLE stories DROP COLUMN IF EXISTS file_count;
ALTER TABLE stories DROP COLUMN IF EXISTS complexity;

-- NOTE: PostgreSQL does not support removing a value from an ENUM type
-- directly. If artifact_type/agent_type are pg ENUMs (not present in the
-- default schema, which uses CHECK constraints), a full rebuild via
-- rename/recreate/swap would be required here:
--
--   ALTER TYPE artifact_type RENAME TO artifact_type__old;
--   CREATE TYPE artifact_type AS ENUM (/* original values */);
--   ALTER TABLE artifacts
--     ALTER COLUMN type TYPE artifact_type
--     USING type::text::artifact_type;
--   DROP TYPE artifact_type__old;
--
-- Same pattern for agent_type. Left as documented no-op for the current
-- CHECK-based schema.
