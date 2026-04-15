-- Adapter configuration (initially for Gemini; extensible to future adapters)
CREATE TABLE IF NOT EXISTS adapter_configs (
  id TEXT PRIMARY KEY,
  adapter_type TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'inactive',
  model TEXT NOT NULL,
  api_key TEXT,
  max_context_tokens INTEGER NOT NULL DEFAULT 1048576,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track async Gemini jobs for polling
CREATE TABLE IF NOT EXISTS gemini_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  story_id TEXT,
  operation_name TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_poll_at TIMESTAMPTZ,
  next_poll_at TIMESTAMPTZ,
  backoff_ms INTEGER NOT NULL DEFAULT 1000,
  error_code TEXT,
  error_message TEXT,
  raw_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gemini_jobs_run_id ON gemini_jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_gemini_jobs_status ON gemini_jobs(status);

-- Adapter routing decisions (separate from agent routing_decisions)
CREATE TABLE IF NOT EXISTS adapter_routing_decisions (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  run_id TEXT,
  context_tokens INTEGER NOT NULL,
  evaluated TEXT NOT NULL,
  selected_adapter TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  override INTEGER NOT NULL DEFAULT 0,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adapter_routing_story ON adapter_routing_decisions(story_id);
CREATE INDEX IF NOT EXISTS idx_adapter_routing_adapter ON adapter_routing_decisions(selected_adapter);
