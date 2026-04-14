-- Core schema: projects, context_nodes, context_edges, tasks, task_results, node_locks, task_snapshots
-- pgvector extension already enabled in 001_init_schema.sql

-- 1. projects (no deps)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. context_nodes (depends on projects)
CREATE TABLE IF NOT EXISTS context_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. context_edges (depends on context_nodes)
CREATE TABLE IF NOT EXISTS context_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES context_nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES context_nodes(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. node_locks (depends on context_nodes)
CREATE TABLE IF NOT EXISTS node_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL UNIQUE REFERENCES context_nodes(id) ON DELETE CASCADE,
  locked_by VARCHAR(255) NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- 5. tasks (depends on projects)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. task_results (depends on tasks)
CREATE TABLE IF NOT EXISTS task_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  payload JSONB,
  stdout TEXT,
  stderr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. task_snapshots (depends on tasks)
CREATE TABLE IF NOT EXISTS task_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_context_nodes_project ON context_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_context_nodes_type ON context_nodes(type);
CREATE INDEX IF NOT EXISTS idx_context_nodes_embedding ON context_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_context_edges_source ON context_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_context_edges_target ON context_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_context_edges_type ON context_edges(type);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_results_task ON task_results(task_id);
CREATE INDEX IF NOT EXISTS idx_task_snapshots_task ON task_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_node_locks_expires ON node_locks(expires_at);
