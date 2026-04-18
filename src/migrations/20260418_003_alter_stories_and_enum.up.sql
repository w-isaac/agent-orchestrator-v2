-- Migration 20260418_003 up: alter stories (add columns) + extend status enum via rename-swap

-- 1. Add new columns
ALTER TABLE stories
  ADD COLUMN parent_story_id   UUID REFERENCES stories(id) ON DELETE SET NULL,
  ADD COLUMN gatekeeper_status TEXT,
  ADD COLUMN is_split_replaced BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN split_at          TIMESTAMPTZ;

CREATE INDEX ix_stories_parent_story_id
  ON stories (parent_story_id);

CREATE INDEX ix_stories_is_split_replaced
  ON stories (is_split_replaced) WHERE is_split_replaced = TRUE;

-- 2. Enum rename-swap: add pre_engineering, revision_required, split_replaced
CREATE TYPE story_status_new AS ENUM (
  'queued',
  'in_progress',
  'done',
  'pre_engineering',
  'revision_required',
  'split_replaced'
);

ALTER TABLE stories
  ALTER COLUMN status TYPE story_status_new
  USING status::text::story_status_new;

DROP TYPE story_status;

ALTER TYPE story_status_new RENAME TO story_status;
