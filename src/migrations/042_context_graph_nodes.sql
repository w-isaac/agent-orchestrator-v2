-- context_graph_nodes: nodes for force-directed graph visualization
CREATE TABLE IF NOT EXISTS context_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'concept',
  x INTEGER DEFAULT 0,
  y INTEGER DEFAULT 0,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_graph_nodes_project ON context_graph_nodes(project_id);
