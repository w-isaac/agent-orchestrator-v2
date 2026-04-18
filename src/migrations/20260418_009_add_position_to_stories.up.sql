-- AOV-84: add position column for intra-stage ordering
ALTER TABLE stories
  ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE stories s
  SET position = sub.rn - 1
  FROM (
    SELECT id, row_number() OVER (PARTITION BY current_stage_id ORDER BY created_at) AS rn
      FROM stories
  ) sub
  WHERE s.id = sub.id;

CREATE INDEX idx_stories_stage_position ON stories (current_stage_id, position);
