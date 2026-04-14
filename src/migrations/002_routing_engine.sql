-- Routing engine tables: capability_matrix, routing_decisions, agent_performance_stats

CREATE TABLE IF NOT EXISTS capability_matrix (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  agent_role TEXT NOT NULL,
  affinity_rank INTEGER NOT NULL DEFAULT 5,
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_capability_matrix_task_agent ON capability_matrix(task_type, agent_role);
CREATE INDEX IF NOT EXISTS idx_capability_matrix_task_type ON capability_matrix(task_type);

CREATE TABLE IF NOT EXISTS routing_decisions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  selected_agent TEXT NOT NULL,
  affinity_score REAL NOT NULL,
  effective_cost REAL,
  cost_price REAL,
  cost_tokens INTEGER,
  cost_success_rate REAL,
  fallback_reason TEXT,
  candidates_json TEXT,
  outcome TEXT DEFAULT 'pending',
  decided_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_task_type ON routing_decisions(task_type);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_agent ON routing_decisions(selected_agent);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_decided_at ON routing_decisions(decided_at);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_task_id ON routing_decisions(task_id);

CREATE TABLE IF NOT EXISTS agent_performance_stats (
  id TEXT PRIMARY KEY,
  agent_role TEXT NOT NULL,
  task_type TEXT NOT NULL,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  first_try_successes INTEGER NOT NULL DEFAULT 0,
  total_attempts_30d INTEGER NOT NULL DEFAULT 0,
  first_try_successes_30d INTEGER NOT NULL DEFAULT 0,
  avg_cost_usd REAL,
  avg_tokens INTEGER,
  last_updated TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_perf_role_type ON agent_performance_stats(agent_role, task_type);
CREATE INDEX IF NOT EXISTS idx_agent_perf_agent ON agent_performance_stats(agent_role);

-- Seed capability matrix with default affinities
INSERT INTO capability_matrix (id, task_type, agent_role, affinity_rank, enabled, created_at, updated_at) VALUES
  ('seed-req-po', 'requirements', 'po', 1, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z'),
  ('seed-design-design', 'design', 'design', 1, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z'),
  ('seed-arch-architect', 'architecture', 'architect', 1, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z'),
  ('seed-eng-engineering', 'engineering', 'engineering', 1, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z'),
  ('seed-qa-qa', 'qa', 'qa', 1, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z'),
  ('seed-req-claude', 'requirements', 'claude_code', 5, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z'),
  ('seed-design-claude', 'design', 'claude_code', 5, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z'),
  ('seed-arch-claude', 'architecture', 'claude_code', 5, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z'),
  ('seed-eng-claude', 'engineering', 'claude_code', 5, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z'),
  ('seed-qa-claude', 'qa', 'claude_code', 5, 1, '2026-04-14T00:00:00.000Z', '2026-04-14T00:00:00.000Z')
ON CONFLICT DO NOTHING;
