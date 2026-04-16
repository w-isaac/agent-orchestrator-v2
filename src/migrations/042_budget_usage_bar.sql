-- AOV-42: Per-story budget limit for context dispatch
CREATE TABLE IF NOT EXISTS story_budgets (
  story_id UUID PRIMARY KEY,
  budget_limit INTEGER DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
