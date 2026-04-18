-- AOV-84: story_history event log for lifecycle mutations
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE story_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id   UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('advance','retreat','approve','dep_add','dep_remove','prioritize')),
  from_value JSONB,
  to_value   JSONB,
  actor      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_story_history_story_id_created_at
  ON story_history (story_id, created_at DESC);
