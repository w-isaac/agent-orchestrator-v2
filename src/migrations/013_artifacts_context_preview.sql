-- Add superseded flag to context_artifacts for context preview filtering
ALTER TABLE context_artifacts ADD COLUMN IF NOT EXISTS superseded INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_context_artifacts_story_active
  ON context_artifacts(story_id, superseded)
  WHERE superseded = 0;
