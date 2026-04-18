-- AOV-83: stories table — core unit of work for the agent pipeline
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS stories (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                TEXT NOT NULL CHECK (char_length(title) <= 255),
  description          TEXT,
  acceptance_criteria  TEXT,
  priority             TEXT NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  epic                 TEXT,
  status               TEXT NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued', 'in_progress', 'gate', 'done', 'failed', 'cancelled')),
  github_issue_number  INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stories_project_id ON stories (project_id);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories (status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stories_project_github_issue
  ON stories (project_id, github_issue_number)
  WHERE github_issue_number IS NOT NULL;
