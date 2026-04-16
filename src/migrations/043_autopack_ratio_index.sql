-- AOV-43: Index for auto-pack ratio-based ordering
CREATE INDEX IF NOT EXISTS idx_context_artifacts_story_relevance
  ON context_artifacts(story_id, relevance_score DESC)
  WHERE superseded = 0;
