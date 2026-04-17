-- graph_node_edges: edges between context_graph_nodes for context graph CRUD
CREATE TABLE IF NOT EXISTS graph_node_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES context_graph_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES context_graph_nodes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(source_node_id != target_node_id),
  UNIQUE(source_node_id, target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_graph_node_edges_project ON graph_node_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_graph_node_edges_source ON graph_node_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_node_edges_target ON graph_node_edges(target_node_id);
