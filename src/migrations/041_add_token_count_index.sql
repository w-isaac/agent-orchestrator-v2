-- AOV-31: Add descending token_count index for greedy knapsack ordering
CREATE INDEX IF NOT EXISTS idx_context_artifacts_token_count
  ON context_artifacts(story_id, token_count_full DESC)
  WHERE token_count_full IS NOT NULL AND superseded = 0;
