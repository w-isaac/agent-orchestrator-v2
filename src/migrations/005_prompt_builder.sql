-- Prompt builder tables: context_artifacts, prompt_templates, prompt_builds, artifact_tier_overrides

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  task_template TEXT NOT NULL DEFAULT '',
  context_template TEXT NOT NULL DEFAULT '',
  constraints_template TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS context_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  title VARCHAR(500) NOT NULL,
  full_content TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  one_liner VARCHAR(500) NOT NULL DEFAULT '',
  relevance_score REAL NOT NULL DEFAULT 0.0,
  token_count_full INTEGER NOT NULL DEFAULT 0,
  token_count_summary INTEGER NOT NULL DEFAULT 0,
  token_count_oneliner INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  template_id UUID REFERENCES prompt_templates(id),
  total_token_budget INTEGER NOT NULL,
  total_tokens_used INTEGER NOT NULL,
  task_section TEXT NOT NULL DEFAULT '',
  context_section TEXT NOT NULL DEFAULT '',
  constraints_section TEXT NOT NULL DEFAULT '',
  assembled_prompt TEXT NOT NULL DEFAULT '',
  budget_breakdown JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artifact_tier_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES context_artifacts(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('full', 'summary', 'one-liner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_context_artifacts_story ON context_artifacts(story_id);
CREATE INDEX IF NOT EXISTS idx_context_artifacts_relevance ON context_artifacts(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_builds_story ON prompt_builds(story_id);
CREATE INDEX IF NOT EXISTS idx_artifact_tier_overrides_artifact ON artifact_tier_overrides(artifact_id);
