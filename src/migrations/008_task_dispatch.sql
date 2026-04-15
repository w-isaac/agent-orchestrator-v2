-- Task dispatch tables for MCP tool invocation tracking

CREATE TABLE IF NOT EXISTS task_dispatch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id TEXT NOT NULL,
  agent_run_id TEXT,
  tool_name TEXT NOT NULL CHECK (tool_name IN ('get_task_context', 'submit_result', 'query_context')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'completed', 'failed')),
  input_payload JSONB,
  output_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_dispatch_story_id ON task_dispatch(story_id);
CREATE INDEX IF NOT EXISTS idx_task_dispatch_status ON task_dispatch(status);
CREATE INDEX IF NOT EXISTS idx_task_dispatch_agent_run_id ON task_dispatch(agent_run_id);

CREATE TABLE IF NOT EXISTS task_dispatch_logs (
  id SERIAL PRIMARY KEY,
  dispatch_id UUID NOT NULL REFERENCES task_dispatch(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_dispatch_logs_dispatch_id ON task_dispatch_logs(dispatch_id);
