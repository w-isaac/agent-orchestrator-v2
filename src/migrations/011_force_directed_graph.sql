-- context_graph_edges: explicit weighted edges for force-directed graph visualization
CREATE TABLE IF NOT EXISTS context_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('artifact','task','context')),
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('artifact','task','context')),
  target_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, source_type, source_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_cge_project ON context_graph_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_cge_source ON context_graph_edges(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_cge_target ON context_graph_edges(target_type, target_id);
