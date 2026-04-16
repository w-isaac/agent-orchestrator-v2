-- AOV-36: Task data model extensions and supporting tables

-- Add new columns to existing tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS budget REAL;

-- Backfill title from type for existing rows
UPDATE tasks SET title = type WHERE title IS NULL;

-- Expand status CHECK to include new statuses (completed, cancelled)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'running', 'complete', 'completed', 'failed', 'cancelled'));

-- Priority index (project and status indexes already exist from 003_core_schema)
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

-- Junction table: links tasks to context nodes as seed nodes
CREATE TABLE IF NOT EXISTS task_seed_nodes (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  context_node_id UUID NOT NULL,
  PRIMARY KEY (task_id, context_node_id)
);

CREATE INDEX IF NOT EXISTS idx_task_seed_nodes_task ON task_seed_nodes(task_id);

-- Preflight checks table
CREATE TABLE IF NOT EXISTS preflight_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'skipped')),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preflight_checks_task ON preflight_checks(task_id);

-- Task locks table
CREATE TABLE IF NOT EXISTS task_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_locks_task ON task_locks(task_id);
CREATE INDEX IF NOT EXISTS idx_task_locks_active ON task_locks(task_id, resource_key) WHERE released_at IS NULL;

-- Task lifecycle events table
CREATE TABLE IF NOT EXISTS task_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  payload TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_lifecycle_events_task ON task_lifecycle_events(task_id);
