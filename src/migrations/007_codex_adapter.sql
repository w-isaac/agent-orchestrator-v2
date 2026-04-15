-- Codex adapter: poll tracking table and agent_runs extensions

CREATE TABLE IF NOT EXISTS codex_poll_attempts (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  attempt     INTEGER NOT NULL,
  status      TEXT NOT NULL,
  http_status INTEGER,
  error_type  TEXT,
  error_msg   TEXT,
  backoff_ms  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_codex_poll_run ON codex_poll_attempts(run_id);

-- Extend agent_runs with Codex-specific columns (all nullable for backward compat)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_runs' AND column_name='openai_run_id') THEN
    ALTER TABLE agent_runs ADD COLUMN openai_run_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_runs' AND column_name='prompt_tokens') THEN
    ALTER TABLE agent_runs ADD COLUMN prompt_tokens INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_runs' AND column_name='completion_tokens') THEN
    ALTER TABLE agent_runs ADD COLUMN completion_tokens INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_runs' AND column_name='total_tokens') THEN
    ALTER TABLE agent_runs ADD COLUMN total_tokens INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_runs' AND column_name='finish_reason') THEN
    ALTER TABLE agent_runs ADD COLUMN finish_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_runs' AND column_name='openai_model') THEN
    ALTER TABLE agent_runs ADD COLUMN openai_model TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_runs' AND column_name='retry_count') THEN
    ALTER TABLE agent_runs ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_runs' AND column_name='last_error') THEN
    ALTER TABLE agent_runs ADD COLUMN last_error TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_runs' AND column_name='prompt_text') THEN
    ALTER TABLE agent_runs ADD COLUMN prompt_text TEXT;
  END IF;
END $$;

-- Register codex in adapter_configs
INSERT INTO adapter_configs (id, adapter_type, status, model, max_context_tokens, config, created_at, updated_at)
VALUES (
  gen_random_uuid(), 'codex', 'inactive', 'codex-mini', 128000,
  '{"poll_interval_ms": 3000, "max_retries": 5, "backoff_base_ms": 2000, "backoff_cap_ms": 30000}',
  NOW(), NOW()
) ON CONFLICT (adapter_type) DO NOTHING;
