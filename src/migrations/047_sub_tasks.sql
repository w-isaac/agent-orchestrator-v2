-- AOV-20: Auto task decomposition — sub-tasks, complexity settings, parent rollup

-- Extend tasks table with decomposition metadata
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS decomposed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_task_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS token_budget INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS token_budget_remaining INTEGER;

-- Sub-tasks table
CREATE TABLE IF NOT EXISTS sub_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  parent_sub_task_id UUID REFERENCES sub_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  domain TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'retrying', 'cancelled')),
  token_budget INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  seed TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  output TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sub_tasks_parent ON sub_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_sub_tasks_status ON sub_tasks(status);
CREATE INDEX IF NOT EXISTS idx_sub_tasks_parent_sub ON sub_tasks(parent_sub_task_id);

-- Settings keys for decomposition thresholds (idempotent seed)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('decomposition.token_threshold', '8000'),
  ('decomposition.domain_threshold', '2'),
  ('decomposition.llm_assisted', 'false')
ON CONFLICT (key) DO NOTHING;
