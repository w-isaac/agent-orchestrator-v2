-- AOV-14: Usage analytics indexes and columns

-- Context budget tracking per task result (dispatch)
ALTER TABLE task_results ADD COLUMN IF NOT EXISTS context_budget_tokens INTEGER;

-- Retry/rework tracking on tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS qa_bounce_count INTEGER NOT NULL DEFAULT 0;

-- Composite indexes for sub-500ms aggregation on 100k rows
CREATE INDEX IF NOT EXISTS idx_task_results_project_role_status
  ON task_results(project_id, agent_role, status);

CREATE INDEX IF NOT EXISTS idx_task_results_role_finished
  ON task_results(agent_role, finished_at);

CREATE INDEX IF NOT EXISTS idx_task_results_project_finished
  ON task_results(project_id, finished_at);
