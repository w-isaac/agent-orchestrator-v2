-- AOV-145: artifacts table — typed artifact content per story with superseding support
CREATE TABLE IF NOT EXISTS artifacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id       UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  type           VARCHAR(32) NOT NULL
                   CHECK (type IN ('architecture', 'design', 'qa_report', 'pull_request', 'other')),
  content        JSONB NOT NULL DEFAULT '{}'::jsonb,
  superseded_by  UUID REFERENCES artifacts(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_story_superseded
  ON artifacts (story_id, superseded_by);
