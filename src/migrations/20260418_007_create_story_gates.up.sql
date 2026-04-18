-- AOV-84: story_gates table for stage gate approvals
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE story_gates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id        UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  stage_id        UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  approved        BOOLEAN NOT NULL DEFAULT FALSE,
  approver_name   TEXT,
  approval_reason TEXT,
  approved_at     TIMESTAMPTZ,
  CONSTRAINT uq_story_gate UNIQUE (story_id, stage_id)
);

CREATE INDEX idx_story_gates_story_id ON story_gates (story_id);
