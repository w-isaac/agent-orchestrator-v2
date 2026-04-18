-- AOV-151: architect agent schema
-- Adds stories.complexity and stories.file_count columns, extends artifact
-- and agent type enums with 'architecture' and 'architect' (when those types
-- exist as Postgres ENUMs), and creates the two supporting indexes.

-- 1) stories: complexity + file_count
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS complexity TEXT
    CHECK (complexity IS NULL OR complexity IN ('low','medium','high','epic'));
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS file_count INTEGER
    CHECK (file_count IS NULL OR file_count >= 0);

-- 2) artifacts.type enum: add 'architecture' if artifact_type is a pg ENUM.
-- The current schema stores artifacts.type as a VARCHAR with a CHECK
-- constraint that already includes 'architecture', so this is a guarded
-- no-op for schemas using CHECK-based typing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artifact_type') THEN
    ALTER TYPE artifact_type ADD VALUE IF NOT EXISTS 'architecture';
  END IF;
END $$;

-- 3) agent_runs.agent_type enum: add 'architect' if agent_type is a pg ENUM.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_type') THEN
    ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'architect';
  END IF;
END $$;

-- 4) Indexes
CREATE INDEX IF NOT EXISTS idx_artifacts_story_type
  ON artifacts (story_id, type);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_runs') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_runs_story_status
      ON agent_runs (story_id, status)';
  END IF;
END $$;
