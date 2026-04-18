-- Migration 20260418_005 up: create pipeline_stages table and add stories.current_stage_id FK
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT,
  stage_order INTEGER NOT NULL,
  has_gate    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_stages_project_id ON pipeline_stages (project_id);
CREATE UNIQUE INDEX uniq_pipeline_stages_project_order ON pipeline_stages (project_id, stage_order);
CREATE UNIQUE INDEX uniq_pipeline_stages_project_name ON pipeline_stages (project_id, name);

ALTER TABLE stories
  ADD COLUMN current_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;

CREATE INDEX idx_stories_current_stage_id ON stories (current_stage_id);
