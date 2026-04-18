-- Migration 20260418_001 up: create gatekeeper_reviews table
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE gatekeeper_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id        UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  evaluation_hash TEXT NOT NULL,
  result          TEXT NOT NULL,
  summary         TEXT,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_gk_reviews_story_hash
  ON gatekeeper_reviews (story_id, evaluation_hash);

CREATE INDEX ix_gk_reviews_created_at_desc
  ON gatekeeper_reviews (created_at DESC);
