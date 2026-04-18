-- Migration 20260418_002 up: create story_dependencies table
CREATE TABLE story_dependencies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id            UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  depends_on_story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_story_dep UNIQUE (story_id, depends_on_story_id),
  CONSTRAINT chk_no_self_ref CHECK (story_id <> depends_on_story_id)
);

CREATE INDEX ix_story_dep_depends_on
  ON story_dependencies (depends_on_story_id);
