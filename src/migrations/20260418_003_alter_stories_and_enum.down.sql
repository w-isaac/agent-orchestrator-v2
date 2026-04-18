-- Migration 20260418_003 down: abort if any row uses new enum values,
-- then reverse the rename-swap and drop the added columns.

-- 1. Guard: abort with descriptive error if any story row uses a new enum value
DO $$
DECLARE
  blocking_count INT;
BEGIN
  SELECT COUNT(*) INTO blocking_count FROM stories
    WHERE status::text IN ('pre_engineering', 'revision_required', 'split_replaced');
  IF blocking_count > 0 THEN
    RAISE EXCEPTION
      'Cannot rollback migration 20260418_003: % story row(s) use new enum values (pre_engineering/revision_required/split_replaced). Migrate data first.',
      blocking_count;
  END IF;
END $$;

-- 2. Reverse enum rename-swap: recreate original enum without the new values
CREATE TYPE story_status_old AS ENUM (
  'queued',
  'in_progress',
  'done'
);

ALTER TABLE stories
  ALTER COLUMN status TYPE story_status_old
  USING status::text::story_status_old;

DROP TYPE story_status;

ALTER TYPE story_status_old RENAME TO story_status;

-- 3. Drop added indexes and columns
DROP INDEX IF EXISTS ix_stories_is_split_replaced;
DROP INDEX IF EXISTS ix_stories_parent_story_id;

ALTER TABLE stories
  DROP COLUMN IF EXISTS split_at,
  DROP COLUMN IF EXISTS is_split_replaced,
  DROP COLUMN IF EXISTS gatekeeper_status,
  DROP COLUMN IF EXISTS parent_story_id;
